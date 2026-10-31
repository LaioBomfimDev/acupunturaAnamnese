-- ==========================================================
-- ABA vira disciplina do Vitalis (Análise do Comportamento Aplicada)
-- Decisão do usuário, 31/10/2026: só a parte ABA do antigo Atlas
-- (programas, coleta, gráficos e times), como área própria "da
-- Psicologia" — por enquanto só psicólogo atende.
--
-- REQUER (já aplicadas): 20260910_neuropsicologia_discipline.sql,
-- 20260925_record_share_enrollment_conflict_fix.sql,
-- 20260929b_neuropsicologia_evolution.sql e as migrations de 10/2026
-- que criaram tabelas com coluna `discipline`.
--
-- O que esta migração faz:
--   1. Acrescenta 'aba' em todo CHECK de disciplina que hoje lista as
--      cinco áreas (acupuntura … neuropsicologia). A lista de tabelas
--      cresce a cada mês (agenda, evoluções, matrículas, financeiro,
--      palavras rápidas, escalas, entrevistas…); em vez de nomear cada
--      constraint e esquecer a próxima, o bloco procura no catálogo só
--      as que trazem a lista COMPLETA das cinco — regra de outro tipo
--      (ex.: "esta ficha só em psicologia/neuropsicologia") fica intacta.
--   2. Recria as duas RPCs que validam a área no corpo e que o ABA usa:
--      insert_patient_evolution (a coleta é separada da evolução: o
--      atendimento ABA continua sendo evoluído na tela Evoluções, com o
--      formulário da Psicologia) e create_record_share_after_
--      reauthentication ("Enviar para outra área" → ABA). Corpo copiado
--      da versão viva de cada uma (20260929b e 20260925), só com 'aba'
--      no array — nenhuma outra regra muda.
--   3. Libera a área para quem já tem Psicologia (mesma decisão de fase
--      de testes da Neuropsicologia, 20260910 §4) e para a administração
--      que não atende (que enxerga todas as áreas, 20260917).
--
-- NÃO muda: prontuário genérico (clinical_records e suas RPCs), escalas,
-- entrevistas e Área do Paciente continuam sem 'aba' no corpo das RPCs
-- (o CHECK passa a aceitar, mas ninguém grava ABA ali). A coleta ABA
-- mora em tabelas próprias (20261101b_aba_coleta.sql).
--
-- Edge Functions com a mesma lista (redeploy junto com esta migração):
-- create-record-share e super-admin-create-user.
--
-- Reversão: reaplicar 20260929b e 20260925; tirar 'aba' dos CHECKs com o
-- bloco 1 invertido (só depois de apagar as linhas com discipline='aba').
-- ==========================================================

-- ----------------------------------------------------------
-- 1) 'aba' nos CHECKs de disciplina
-- ----------------------------------------------------------
DO $aba_discipline_checks$
DECLARE
  v_full_list CONSTANT TEXT :=
    '''acupuntura''::text, ''fisioterapia''::text, ''psicologia''::text, ''nutricao''::text, ''neuropsicologia''::text]';
  v_with_aba CONSTANT TEXT :=
    '''acupuntura''::text, ''fisioterapia''::text, ''psicologia''::text, ''nutricao''::text, ''neuropsicologia''::text, ''aba''::text]';
  v_row RECORD;
  v_changed INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT
      c.conname,
      c.conrelid::regclass AS table_name,
      pg_get_constraintdef(c.oid) AS definition
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'c'
      AND n.nspname = 'public'
      AND pg_get_constraintdef(c.oid) LIKE '%' || v_full_list || '%'
    ORDER BY c.conrelid::regclass::text, c.conname
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_row.table_name, v_row.conname);
    EXECUTE format(
      'ALTER TABLE %s ADD CONSTRAINT %I %s',
      v_row.table_name,
      v_row.conname,
      replace(v_row.definition, v_full_list, v_with_aba)
    );
    v_changed := v_changed + 1;
    RAISE NOTICE 'aba liberada em %.%', v_row.table_name, v_row.conname;
  END LOOP;

  -- As que o ABA precisa de fato: sem elas o paciente não entra na área,
  -- a Agenda recusa o atendimento e a evolução não grava.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_enrollments_discipline_check'
      AND pg_get_constraintdef(oid) LIKE '%' || v_with_aba || '%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_discipline_check'
      AND pg_get_constraintdef(oid) LIKE '%' || v_with_aba || '%'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_evolutions_discipline_check'
      AND pg_get_constraintdef(oid) LIKE '%' || v_with_aba || '%'
  ) THEN
    RAISE EXCEPTION
      'ABA: matrícula, agenda ou evolução continuam sem a área (% CHECKs alterados).',
      v_changed;
  END IF;
END
$aba_discipline_checks$;

-- ----------------------------------------------------------
-- 2a) Evolução: corpo de 20260929b_neuropsicologia_evolution.sql,
--     só com 'aba' no array de áreas aceitas.
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_patient_evolution(
  p_patient_id UUID,
  p_discipline TEXT,
  p_data TEXT,
  p_appointment_id UUID DEFAULT NULL,
  p_atendimento_em TIMESTAMPTZ DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  atendimento_em TIMESTAMPTZ,
  registrado_em TIMESTAMPTZ,
  attendance_status TEXT,
  revision BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $insert_patient_evolution$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_existing RECORD;
  v_appointment RECORD;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR pg_catalog.btrim(p_data) = '' THEN
    RAISE EXCEPTION 'Conteúdo da evolução é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia', 'aba']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION
      'Evolução só pode ser registrada a partir de um atendimento marcado na Agenda.'
      USING ERRCODE = '22023';
  END IF;

  SELECT a.patient_id, a.professional_id, a.discipline, a.status, a.kind
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  IF NOT FOUND OR v_appointment.kind IS DISTINCT FROM 'appointment' THEN
    RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_appointment.patient_id IS DISTINCT FROM p_patient_id
     OR v_appointment.professional_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION
      'Acesso negado: agendamento não pertence ao profissional autenticado para este paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF v_appointment.discipline IS DISTINCT FROM p_discipline THEN
    RAISE EXCEPTION
      'A evolução precisa ser da mesma área do agendamento.'
      USING ERRCODE = '22023';
  END IF;

  IF v_appointment.status NOT IN ('attended', 'no_show', 'excused') THEN
    RAISE EXCEPTION
      'Só é possível registrar evolução para um agendamento concluído (atendido, não compareceu ou cancelado pelo paciente).'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    -- Serializa retries concorrentes da mesma chave antes de checar se
    -- já existe — sem o lock, duas requisições idênticas em paralelo
    -- passariam as duas pelo SELECT antes de qualquer uma inserir.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'patient-evolution-idempotency:' || v_uid::TEXT || ':' || p_idempotency_key::TEXT,
        0
      )
    );

    SELECT pe.id, pe.atendimento_em, pe.registrado_em, pe.attendance_status, pe.revision
    INTO v_existing
    FROM public.patient_evolutions pe
    WHERE pe.therapist_id = v_uid
      AND pe.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY SELECT v_existing.id, v_existing.atendimento_em, v_existing.registrado_em,
        v_existing.attendance_status, v_existing.revision;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.patient_evolutions AS pe (
    patient_id,
    therapist_id,
    discipline,
    appointment_id,
    atendimento_em,
    conteudo_encrypted,
    idempotency_key
  )
  VALUES (
    p_patient_id,
    v_uid,
    p_discipline,
    p_appointment_id,
    p_atendimento_em,
    extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
    p_idempotency_key
  )
  RETURNING pe.id INTO v_id;

  RETURN QUERY
  SELECT pe.id, pe.atendimento_em, pe.registrado_em, pe.attendance_status, pe.revision
  FROM public.patient_evolutions pe
  WHERE pe.id = v_id;
END;
$insert_patient_evolution$;

GRANT EXECUTE ON FUNCTION public.insert_patient_evolution(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID) TO authenticated;

-- ----------------------------------------------------------
-- 2b) Encaminhamento ("Enviar para outra área"): corpo de
--     20260925_record_share_enrollment_conflict_fix.sql, só com 'aba'
--     nos dois arrays (origem e destino).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_record_share_after_reauthentication(
  p_actor_id UUID,
  p_actor_aal TEXT,
  p_patient_id UUID,
  p_from_discipline TEXT,
  p_to_discipline TEXT,
  p_to_user_id UUID,
  p_shared_scopes TEXT[],
  p_note TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  from_discipline TEXT,
  to_discipline TEXT,
  to_user_id UUID,
  shared_scopes TEXT[],
  note TEXT,
  created_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $create_record_share_after_reauthentication$
DECLARE
  v_actor_clinic UUID;
  v_actor_role TEXT;
  v_actor_active BOOLEAN;
  v_actor_password_pending BOOLEAN;
  v_actor_mfa_required BOOLEAN;
  v_patient_owner UUID;
  v_patient_clinic UUID;
  v_target_clinic UUID;
  v_target_active BOOLEAN;
  v_target_disciplines TEXT[];
  v_scopes TEXT[];
  v_note TEXT := NULLIF(BTRIM(p_note), '');
  v_existing public.record_shares%ROWTYPE;
  v_created public.record_shares%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION
      'Somente a Edge Function de reautenticação pode criar compartilhamentos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_patient_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Ator, paciente e idempotência são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o profissional que vai receber o compartilhamento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    profile.clinic_id,
    profile.role,
    profile.is_active,
    profile.must_change_password,
    profile.mfa_required
  INTO
    v_actor_clinic,
    v_actor_role,
    v_actor_active,
    v_actor_password_pending,
    v_actor_mfa_required
  FROM public.profiles profile
  WHERE profile.id = p_actor_id;

  IF NOT FOUND
     OR v_actor_active IS NOT TRUE
     OR v_actor_password_pending IS TRUE
     OR (v_actor_mfa_required IS TRUE AND p_actor_aal <> 'aal2') THEN
    RAISE EXCEPTION 'Ator sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT patient.therapist_id, patient.clinic_id
  INTO v_patient_owner, v_patient_clinic
  FROM public.patients patient
  WHERE patient.id = p_patient_id
    AND patient.archived_at IS NULL;

  IF NOT FOUND
     OR v_patient_clinic IS NULL
     OR v_patient_clinic IS DISTINCT FROM v_actor_clinic
     OR (
       v_patient_owner IS DISTINCT FROM p_actor_id
       AND v_actor_role NOT IN ('clinic_admin', 'super_admin')
     ) THEN
    RAISE EXCEPTION
      'Ator não pode compartilhar este paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF p_from_discipline IS NULL
     OR p_to_discipline IS NULL
     OR p_from_discipline = p_to_discipline
     OR p_from_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia', 'aba']::TEXT[]
     )
     OR p_to_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia', 'aba']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplinas de origem/destino inválidas.'
      USING ERRCODE = '22023';
  END IF;

  -- O destinatário precisa ser colega ATIVO da MESMA clínica e de
  -- fato atuar na disciplina de destino — senão o encaminhamento
  -- vira um jeito de mandar prontuário para alguém sem relação com
  -- a disciplina escolhida.
  SELECT profile.clinic_id, profile.is_active, profile.disciplines
  INTO v_target_clinic, v_target_active, v_target_disciplines
  FROM public.profiles profile
  WHERE profile.id = p_to_user_id;

  IF NOT FOUND
     OR v_target_active IS NOT TRUE
     OR v_target_clinic IS DISTINCT FROM v_patient_clinic
     OR NOT (p_to_discipline = ANY(COALESCE(v_target_disciplines, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION
      'Destinatário inválido: precisa ser um profissional ativo da instituição, atuando na disciplina de destino.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patient_enrollments enrollment
    WHERE enrollment.patient_id = p_patient_id
      AND enrollment.clinic_id = v_patient_clinic
      AND enrollment.discipline = p_from_discipline
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Paciente não possui matrícula ativa na disciplina de origem.'
      USING ERRCODE = '22023';
  END IF;

  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Nota de encaminhamento excede 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    array_agg(scope_id ORDER BY scope_id),
    ARRAY[]::TEXT[]
  )
  INTO v_scopes
  FROM (
    SELECT DISTINCT BTRIM(candidate.scope_id) AS scope_id
    FROM unnest(COALESCE(p_shared_scopes, ARRAY[]::TEXT[]))
      AS candidate(scope_id)
    WHERE BTRIM(candidate.scope_id) = ANY (
      ARRAY['cadastro', 'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio']::TEXT[]
    )
  ) normalized_scopes;
  v_scopes := ARRAY['cadastro']::TEXT[] || array_remove(v_scopes, 'cadastro');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'record-share:' || p_actor_id::TEXT || ':' || p_idempotency_key::TEXT,
      0
    )
  );

  SELECT share.*
  INTO v_existing
  FROM public.record_shares share
  WHERE share.shared_by = p_actor_id
    AND share.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.patient_id IS DISTINCT FROM p_patient_id
       OR v_existing.from_discipline IS DISTINCT FROM p_from_discipline
       OR v_existing.to_discipline IS DISTINCT FROM p_to_discipline
       OR v_existing.to_user_id IS DISTINCT FROM p_to_user_id
       OR v_existing.shared_scopes IS DISTINCT FROM v_scopes
       OR v_existing.note IS DISTINCT FROM v_note THEN
      RAISE EXCEPTION 'Idempotência já usada com outro compartilhamento.'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.patient_id,
      v_existing.from_discipline,
      v_existing.to_discipline,
      v_existing.to_user_id,
      v_existing.shared_scopes,
      v_existing.note,
      v_existing.created_at,
      v_existing.revoked_at;
    RETURN;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.record_share_actor_id',
    p_actor_id::TEXT,
    TRUE
  );

  INSERT INTO public.patient_enrollments (
    patient_id,
    clinic_id,
    discipline,
    status,
    referred_by
  )
  VALUES (
    p_patient_id,
    v_patient_clinic,
    p_to_discipline,
    'active',
    p_actor_id
  )
  ON CONFLICT ON CONSTRAINT patient_enrollments_patient_id_discipline_key
  DO UPDATE
  SET status = 'active',
      updated_at = pg_catalog.clock_timestamp();

  INSERT INTO public.record_shares (
    patient_id,
    clinic_id,
    from_discipline,
    to_discipline,
    to_user_id,
    shared_scopes,
    shared_by,
    note,
    idempotency_key
  )
  VALUES (
    p_patient_id,
    v_patient_clinic,
    p_from_discipline,
    p_to_discipline,
    p_to_user_id,
    v_scopes,
    p_actor_id,
    v_note,
    p_idempotency_key
  )
  RETURNING * INTO v_created;

  RETURN QUERY
  SELECT
    v_created.id,
    v_created.patient_id,
    v_created.from_discipline,
    v_created.to_discipline,
    v_created.to_user_id,
    v_created.shared_scopes,
    v_created.note,
    v_created.created_at,
    v_created.revoked_at;
END;
$create_record_share_after_reauthentication$;

REVOKE ALL ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT[], TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT[], TEXT, UUID
) TO service_role;

-- ----------------------------------------------------------
-- 3) Quem enxerga a área
-- Decisão de fase de testes (igual à Neuropsicologia): quem já atende
-- Psicologia ganha ABA. A administração que não atende enxerga todas as
-- áreas só para consulta (20260917) e ganha ABA junto.
-- ----------------------------------------------------------
UPDATE public.profiles
SET disciplines = array_append(disciplines, 'aba')
WHERE 'psicologia' = ANY(disciplines)
  AND NOT ('aba' = ANY(disciplines));

UPDATE public.profiles
SET disciplines = array_append(disciplines, 'aba')
WHERE role = 'clinic_admin'
  AND attends_patients IS FALSE
  AND NOT ('aba' = ANY(disciplines));

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  c.conrelid::regclass AS tabela,
  c.conname AS restricao
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
WHERE c.contype = 'c'
  AND n.nspname = 'public'
  AND pg_get_constraintdef(c.oid) LIKE '%''aba''::text%'
ORDER BY 1, 2;
