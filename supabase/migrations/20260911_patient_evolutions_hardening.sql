-- ==========================================================
-- Endurecimento de patient_evolutions — 4 lacunas já mapeadas no
-- dossiê de due diligence de 03/09/2026 (docs/dossie-tecnico-due-
-- diligence-2026-09-03.md, achado P1) e na conversa desta sessão:
--
--   1) update_patient_evolution sem revisão esperada — duas correções
--      concorrentes podem se sobrescrever silenciosamente.
--   2) insert_patient_evolution sem chave de idempotência no registro
--      avulso — um retry de rede pode duplicar a sessão.
--   3) FK de patient_id em ON DELETE CASCADE, sem exigir arquivamento
--      antes de apagar.
--   4) Compartilhamento entre disciplinas (record_shares) não alcança
--      esta tabela — um colega com escopo "evolucao" liberado só via
--      get_shared_session/JSON legado, nunca as sessões novas.
--
-- Migração aditiva (não reescreve 20260903_patient_evolutions.sql nem
-- 20260911_patient_evolutions_clinic_admin_access.sql — aplicadas não
-- se editam). insert_patient_evolution ganha parâmetro novo com
-- DEFAULT (mesma assinatura, sem precisar DROP). update_patient_evolution
-- muda de forma incompatível (novo parâmetro obrigatório) — a versão
-- de 2 argumentos é derrubada explicitamente. list_patient_evolutions
-- mantém a assinatura de 20260911_..._clinic_admin_access.sql, só
-- ganha "revision" no retorno e a leitura por compartilhamento.
-- ==========================================================

-- ----------------------------------------------------------
-- 1) Colunas novas: revisão (CAS) e chave de idempotência (retry-safe)
-- ----------------------------------------------------------
ALTER TABLE public.patient_evolutions
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

COMMENT ON COLUMN public.patient_evolutions.revision IS
  'Compare-and-swap: update_patient_evolution exige a revisão atual e incrementa a cada correção.';
COMMENT ON COLUMN public.patient_evolutions.idempotency_key IS
  'Chave opcional do cliente para o registro avulso (sem appointment_id) não duplicar num retry de rede.';

-- Só protege contra duplicidade quando o cliente manda a chave — não
-- retroage sobre linhas antigas, que ficam com idempotency_key NULL.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_evolutions_idempotency
  ON public.patient_evolutions(therapist_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ----------------------------------------------------------
-- 2) patient_id deixa de cascatear — mesma disciplina de
--    request_patient_deletion (patients.archived_at): arquivar é
--    reversível e auditável, apagar não pode ser um efeito colateral
--    silencioso de apagar o paciente. Hoje NENHUM caminho de código
--    apaga public.patients de verdade (request_patient_deletion só
--    arquiva — ver comentário na própria função); esta troca é rede de
--    segurança para quando a ferramenta de retenção/eliminação for
--    construída, não correção de um caminho hoje explorável.
--
--    Nota à parte, fora do escopo desta migração: appointments,
--    clinical_records, patient_attachments, patient_enrollments,
--    record_shares e satisfaction_surveys ainda cascateiam a partir de
--    patients — ficam inconsistentes com esta tabela até uma political
--    de retenção formal decidir o padrão para todas de uma vez.
-- ----------------------------------------------------------
ALTER TABLE public.patient_evolutions
  DROP CONSTRAINT patient_evolutions_patient_id_fkey;
ALTER TABLE public.patient_evolutions
  ADD CONSTRAINT patient_evolutions_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES public.patients(id) ON DELETE RESTRICT;

-- ----------------------------------------------------------
-- 3) insert_patient_evolution: idempotência opcional no avulso +
--    revision no retorno. Assinatura compatível (parâmetro novo com
--    DEFAULT no final) — não precisa DROP.
-- ----------------------------------------------------------
-- RETURNS TABLE ganhou "revision" — Postgres exige DROP mesmo quando só
-- o formato da linha de retorno muda (o parâmetro novo, sozinho,
-- poderia entrar por CREATE OR REPLACE; o retorno não).
DROP FUNCTION IF EXISTS public.insert_patient_evolution(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ);

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
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = p_patient_id AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  -- Checagem antecipada só para dar um erro amigável cedo; o trigger
  -- de INSERT repete a mesma checagem de forma incondicional.
  IF p_appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = p_appointment_id
      AND a.patient_id = p_patient_id
      AND a.professional_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: agendamento não pertence ao profissional autenticado para este paciente.'
      USING ERRCODE = '42501';
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
-- 4) update_patient_evolution: compare-and-swap por revision. Muda de
--    forma incompatível (novo parâmetro obrigatório) — derruba a
--    assinatura de 2 argumentos pra não sobrar overload ambíguo pro
--    PostgREST.
-- ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.update_patient_evolution(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.update_patient_evolution(
  p_evolution_id UUID,
  p_data TEXT,
  p_expected_revision BIGINT
)
RETURNS TABLE (id UUID, revision BIGINT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $update_patient_evolution$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.patient_evolutions%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR pg_catalog.btrim(p_data) = '' THEN
    RAISE EXCEPTION 'Conteúdo da evolução é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_expected_revision IS NULL OR p_expected_revision < 1 THEN
    RAISE EXCEPTION 'Revisão esperada é obrigatória.' USING ERRCODE = '22023';
  END IF;

  -- Trava a linha antes de comparar revisão: sem o FOR UPDATE, duas
  -- correções concorrentes na mesma revisão passariam as duas pela
  -- comparação antes de qualquer uma escrever.
  SELECT pe.* INTO v_row
  FROM public.patient_evolutions pe
  WHERE pe.id = p_evolution_id AND pe.therapist_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Acesso negado: evolução não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.revision <> p_expected_revision THEN
    RAISE EXCEPTION
      'Conflito de revisão: esperado %, atual %.', p_expected_revision, v_row.revision
      USING
        ERRCODE = '40001',
        HINT = 'Alguém corrigiu esta evolução antes de você. Recarregue e aplique sua correção de novo.';
  END IF;

  UPDATE public.patient_evolutions pe
  SET conteudo_encrypted = extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
      revision = pe.revision + 1
  WHERE pe.id = p_evolution_id
    AND pe.therapist_id = v_uid
    AND pe.revision = p_expected_revision
  RETURNING pe.id, pe.revision, pe.updated_at
  INTO v_row.id, v_row.revision, v_row.updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Conflito de revisão durante a gravação.'
      USING
        ERRCODE = '40001',
        HINT = 'Alguém corrigiu esta evolução antes de você. Recarregue e aplique sua correção de novo.';
  END IF;

  RETURN QUERY SELECT v_row.id, v_row.revision, v_row.updated_at;
END;
$update_patient_evolution$;

REVOKE ALL ON FUNCTION public.update_patient_evolution(UUID, TEXT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_patient_evolution(UUID, TEXT, BIGINT) TO authenticated;

-- ----------------------------------------------------------
-- 5) list_patient_evolutions: mantém dono/admin (20260911_..._clinic_
--    admin_access.sql) e ACRESCENTA leitura por compartilhamento —
--    mesmo padrão de get_patient_audit_log: escopo "evolucao" ativo em
--    record_shares, filtrado por disciplina de origem linha a linha,
--    pra um compartilhamento de acupuntura não abrir psicologia junto.
--    "revision" entra no retorno pra corrigir texto exigir CAS.
-- ----------------------------------------------------------
-- RETURNS TABLE ganhou "revision" — muda o tipo de retorno, exige DROP
-- (mesma exigência de update_patient_evolution acima, motivo diferente:
-- aqui é o formato da linha, lá era a lista de parâmetros).
DROP FUNCTION IF EXISTS public.list_patient_evolutions(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.list_patient_evolutions(
  p_patient_id UUID,
  p_discipline TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  discipline TEXT,
  appointment_id UUID,
  attendance_status TEXT,
  atendimento_em TIMESTAMPTZ,
  conteudo TEXT,
  registrado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  revision BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_evolutions$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_patient_owner UUID;
  v_patient_clinic UUID;
  v_full_access BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.therapist_id, p.clinic_id
  INTO v_patient_owner, v_patient_clinic
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  v_full_access := (
    v_patient_owner = v_uid
    OR (
      (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
      AND v_patient_clinic IS NOT NULL
      AND v_patient_clinic = public.user_clinic_id(v_uid)
    )
  );

  IF NOT v_full_access
     AND (
       v_patient_clinic IS NULL
       OR v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid)
     ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_full_access AND NOT EXISTS (
    SELECT 1
    FROM public.record_shares s
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_discipline = ANY(public.user_disciplines(v_uid))
      AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic
      AND 'evolucao' = ANY(s.shared_scopes)
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  -- Dono/admin: tudo do paciente. Compartilhamento: só a disciplina de
  -- origem do compartilhamento ativo com escopo "evolucao" — um
  -- encaminhamento de acupuntura não deve abrir a evolução de
  -- psicologia do mesmo paciente junto.
  RETURN QUERY
  SELECT
    pe.id,
    pe.discipline,
    pe.appointment_id,
    pe.attendance_status,
    pe.atendimento_em,
    extensions.pgp_sym_decrypt(pe.conteudo_encrypted, v_key)::TEXT,
    pe.registrado_em,
    pe.created_at,
    pe.updated_at,
    pe.revision
  FROM public.patient_evolutions pe
  WHERE pe.patient_id = p_patient_id
    AND (p_discipline IS NULL OR pe.discipline = p_discipline)
    AND (
      v_full_access
      OR EXISTS (
        SELECT 1
        FROM public.record_shares s
        WHERE s.patient_id = p_patient_id
          AND s.revoked_at IS NULL
          AND s.to_discipline = ANY(public.user_disciplines(v_uid))
          AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic
          AND s.from_discipline = pe.discipline
          AND 'evolucao' = ANY(s.shared_scopes)
      )
    )
  ORDER BY pe.atendimento_em ASC, pe.created_at ASC;
END;
$list_patient_evolutions$;

REVOKE ALL ON FUNCTION public.list_patient_evolutions(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_evolutions(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_evolutions' AND column_name = 'revision') AS coluna_revision,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'patient_evolutions' AND column_name = 'idempotency_key') AS coluna_idempotencia,
  (SELECT confdeltype FROM pg_constraint WHERE conname = 'patient_evolutions_patient_id_fkey') = 'r' AS fk_paciente_restrict,
  to_regprocedure('public.insert_patient_evolution(uuid,text,text,uuid,timestamptz,uuid)') IS NOT NULL AS insert_atualizada,
  to_regprocedure('public.update_patient_evolution(uuid,text,bigint)') IS NOT NULL AS update_com_revisao,
  to_regprocedure('public.update_patient_evolution(uuid,text)') IS NULL AS overload_antiga_removida,
  pg_get_functiondef('public.list_patient_evolutions(uuid,text)'::regprocedure) ILIKE '%from_discipline = pe.discipline%' AS compartilhamento_por_disciplina;
