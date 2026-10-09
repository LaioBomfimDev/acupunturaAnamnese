-- ==========================================================
-- Escalas pela Área do Paciente (etapa 2) + alerta de risco
-- REQUER: 20261006_patient_portal, 20261008_patient_instruments e
-- 20261009_portal_patient_erasure (já aplicadas). Não recria
-- admin_decide_patient_deletion: nenhuma tabela nova aqui (só colunas).
--
-- Decisões da usuária (08/10/2026):
--   * Quem envia a escala para casa: quem atende o paciente na área
--     (can_use_patient_instruments) E a administração.
--   * Código de acesso do paciente: a administração decide, em
--     Configurações > Acesso do paciente, se quem atende também pode gerar
--     e ver o código (clinics.portal_professionals_manage_access, padrão
--     desligado = como era: só a administração). Trocar o código e
--     liberar/desativar o acesso seguem só com a administração.
--   * Alerta de risco: resposta de risco vinda de casa fica pendente até
--     quem atende marcar "Vi o alerta" (tela inicial + aba Escalas). No
--     consultório o aviso já aparece na hora para quem aplicou, então a
--     aplicação nasce com o alerta visto.
--
-- Desenho:
--   * O envio é uma linha de patient_form_assignments com kind
--     'instrument' (+ instrument_id, versão, disciplina) e uma cópia das
--     perguntas para a administração ver. A Edge Function monta as
--     perguntas e calcula a nota pela definição oficial (nunca pelo que
--     vem do aparelho) e entrega o resultado a portal_save_answers, que
--     grava a resposta E a aplicação da escala na mesma transação
--     (source 'area_do_paciente', idempotência = id do envio).
--   * has_risk fica fora da cifra (só verdadeiro/falso) para listar os
--     alertas pendentes sem decifrar todas as aplicações.
--
-- Reverter: recriar portal_ensure_access/portal_save_answers/
-- portal_admin_read_answers e a policy
-- patient_portal_access_select a partir de 20261006; recriar
-- record_/list_patient_instrument_application(s) a partir de 20261008;
-- DROP das funções novas; DROP das colunas novas.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.patient_form_assignments') IS NULL
     OR to_regclass('public.patient_instrument_applications') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261006_patient_portal.sql e 20261008_patient_instruments.sql.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 1. Configuração: quem atende pode gerar e ver o código?
-- ----------------------------------------------------------
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS portal_professionals_manage_access BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.clinics.portal_professionals_manage_access IS
  'Área do Paciente: true = quem atende o paciente também gera e vê o código de acesso dele. Só a administração muda.';

CREATE OR REPLACE FUNCTION public.clinic_admin_set_portal_access_policy(p_allowed BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $clinic_admin_set_portal_access_policy$
DECLARE
  v_actor UUID := auth.uid();
  v_clinic UUID := public.user_clinic_id(auth.uid());
BEGIN
  IF NOT public.is_clinic_admin(v_actor) OR NOT public.can_access_clinical_data(v_actor) THEN
    RAISE EXCEPTION 'Acesso negado: só a administração decide quem gera o código do paciente.'
      USING ERRCODE = '42501';
  END IF;
  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a uma instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_allowed IS NULL THEN
    RAISE EXCEPTION 'Informe se quem atende pode gerar o código.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics c
     SET portal_professionals_manage_access = p_allowed
   WHERE c.id = v_clinic;
END;
$clinic_admin_set_portal_access_policy$;

REVOKE ALL ON FUNCTION public.clinic_admin_set_portal_access_policy(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_set_portal_access_policy(BOOLEAN) TO authenticated;

-- Quem atende o paciente em alguma das próprias áreas (mesma regra das escalas).
CREATE OR REPLACE FUNCTION public.user_attends_patient(p_patient UUID, p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $user_attends_patient$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(public.user_disciplines(p_user)) AS discipline(id)
    WHERE public.can_use_patient_instruments(p_patient, discipline.id, p_user)
  );
$user_attends_patient$;

REVOKE ALL ON FUNCTION public.user_attends_patient(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_attends_patient(UUID, UUID) TO authenticated;

-- Administração sempre; quem atende só quando a instituição liberou.
CREATE OR REPLACE FUNCTION public.can_manage_patient_access(p_patient UUID, p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_manage_patient_access$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    JOIN public.clinics c ON c.id = p.clinic_id
    WHERE p.id = p_patient
      AND (
        public.can_manage_patient_portal(p.clinic_id, p_user)
        OR (c.portal_professionals_manage_access IS TRUE AND public.user_attends_patient(p_patient, p_user))
      )
  );
$can_manage_patient_access$;

REVOKE ALL ON FUNCTION public.can_manage_patient_access(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_patient_access(UUID, UUID) TO authenticated;

-- Leitura do código pela mesma regra.
DROP POLICY IF EXISTS patient_portal_access_select ON public.patient_portal_access;
CREATE POLICY patient_portal_access_select ON public.patient_portal_access
  FOR SELECT TO authenticated
  USING (public.can_manage_patient_access(patient_id));

-- Cria o acesso sem checar quem pede: só para uso interno das RPCs que
-- já checaram a permissão (envio de escala por quem atende).
CREATE OR REPLACE FUNCTION public.portal_ensure_access_row(p_patient_id UUID)
RETURNS public.patient_portal_access
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_ensure_access_row$
DECLARE
  v_clinic UUID;
  v_birth DATE;
  v_archived TIMESTAMPTZ;
  v_row public.patient_portal_access;
BEGIN
  SELECT p.clinic_id, p.birth_date, p.archived_at
    INTO v_clinic, v_birth, v_archived
    FROM public.patients p
   WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = '42501';
  END IF;
  IF v_archived IS NOT NULL THEN
    RAISE EXCEPTION 'Paciente arquivado não recebe acesso.' USING ERRCODE = '22023';
  END IF;
  IF v_birth IS NULL THEN
    RAISE EXCEPTION 'Cadastre a data de nascimento do paciente antes de criar o acesso.' USING ERRCODE = '22023';
  END IF;

  SELECT a.* INTO v_row FROM public.patient_portal_access a WHERE a.patient_id = p_patient_id;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  INSERT INTO public.patient_portal_access (clinic_id, patient_id, access_code, created_by)
  VALUES (v_clinic, p_patient_id, public.portal_new_access_code(), auth.uid())
  ON CONFLICT ON CONSTRAINT patient_portal_access_patient_key DO NOTHING;

  SELECT a.* INTO v_row FROM public.patient_portal_access a WHERE a.patient_id = p_patient_id;
  RETURN v_row;
END;
$portal_ensure_access_row$;

REVOKE ALL ON FUNCTION public.portal_ensure_access_row(UUID) FROM PUBLIC, anon, authenticated;

-- Gerar o código (quando o paciente ainda não tem) e vê-lo seguem a
-- configuração. Trocar o código e liberar/desativar o acesso continuam só
-- com a administração (portal_regenerate_code e portal_set_access_active
-- ficam como em 20261006).
CREATE OR REPLACE FUNCTION public.portal_ensure_access(p_patient_id UUID)
RETURNS public.patient_portal_access
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_ensure_access$
BEGIN
  IF NOT public.can_manage_patient_access(p_patient_id) THEN
    RAISE EXCEPTION 'Paciente não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  RETURN public.portal_ensure_access_row(p_patient_id);
END;
$portal_ensure_access$;

-- ----------------------------------------------------------
-- 2. Envio de escala: colunas no envio
-- ----------------------------------------------------------
ALTER TABLE public.patient_form_assignments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'form',
  ADD COLUMN IF NOT EXISTS instrument_id TEXT,
  ADD COLUMN IF NOT EXISTS instrument_version INTEGER,
  ADD COLUMN IF NOT EXISTS discipline TEXT;

ALTER TABLE public.patient_form_assignments
  DROP CONSTRAINT IF EXISTS patient_form_assignments_kind_check;
ALTER TABLE public.patient_form_assignments
  ADD CONSTRAINT patient_form_assignments_kind_check CHECK (
    (kind = 'form' AND instrument_id IS NULL AND instrument_version IS NULL AND discipline IS NULL)
    OR (
      kind = 'instrument'
      AND instrument_id ~ '^[a-z0-9][a-z0-9_-]{1,39}$'
      AND instrument_version >= 1
      AND discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')
    )
  );

CREATE INDEX IF NOT EXISTS idx_patient_form_assignments_instrument
  ON public.patient_form_assignments(patient_id, instrument_id, status)
  WHERE kind = 'instrument';

-- ----------------------------------------------------------
-- 3. Alerta de risco nas aplicações
-- ----------------------------------------------------------
ALTER TABLE public.patient_instrument_applications
  ADD COLUMN IF NOT EXISTS has_risk BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS risk_acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS risk_acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT;

ALTER TABLE public.patient_instrument_applications
  DROP CONSTRAINT IF EXISTS patient_instrument_applications_risk_ack_check;
ALTER TABLE public.patient_instrument_applications
  ADD CONSTRAINT patient_instrument_applications_risk_ack_check
  CHECK ((risk_acknowledged_at IS NULL) = (risk_acknowledged_by IS NULL));

CREATE INDEX IF NOT EXISTS idx_patient_instrument_applications_risk_pending
  ON public.patient_instrument_applications(clinic_id, discipline)
  WHERE has_risk AND risk_acknowledged_at IS NULL AND voided_at IS NULL;

-- Aplicações de antes desta migration (consultório): risco lido da cifra
-- e já visto por quem aplicou.
UPDATE public.patient_instrument_applications pia
   SET has_risk = TRUE,
       risk_acknowledged_at = pia.created_at,
       risk_acknowledged_by = pia.applied_by
 WHERE pia.has_risk IS NOT TRUE
   AND COALESCE(
     pg_catalog.jsonb_array_length(
       extensions.pgp_sym_decrypt(pia.payload_encrypted, public.get_clinical_encryption_key())::JSONB
         -> 'result' -> 'riskItems'
     ),
     0
   ) > 0;

-- Gravar no consultório: corpo de 20261008 + has_risk e alerta já visto.
CREATE OR REPLACE FUNCTION public.record_patient_instrument_application(
  p_patient_id UUID,
  p_discipline TEXT,
  p_instrument_id TEXT,
  p_instrument_version INTEGER,
  p_applied_at TIMESTAMPTZ,
  p_payload JSONB,
  p_idempotency_key UUID
)
RETURNS TABLE (
  id UUID,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $record_patient_instrument_application$
DECLARE
  v_uid UUID := auth.uid();
  v_patient RECORD;
  v_existing RECORD;
  v_id UUID;
  v_has_risk BOOLEAN;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_instrument_id IS NULL OR p_instrument_id !~ '^[a-z0-9][a-z0-9_-]{1,39}$' THEN
    RAISE EXCEPTION 'Escala inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_instrument_version IS NULL OR p_instrument_version < 1 THEN
    RAISE EXCEPTION 'Versão da escala inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_applied_at IS NULL
     OR p_applied_at < TIMESTAMPTZ '2000-01-01 00:00:00+00'
     OR p_applied_at > pg_catalog.clock_timestamp() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'A data da aplicação precisa ser hoje ou uma data passada.' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotência é obrigatória.' USING ERRCODE = '22023';
  END IF;

  IF p_payload IS NULL
     OR pg_catalog.jsonb_typeof(p_payload) <> 'object'
     OR pg_catalog.jsonb_typeof(p_payload -> 'answers') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_payload -> 'result') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Respostas da escala incompletas.' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.octet_length(p_payload::TEXT) > 65536 THEN
    RAISE EXCEPTION 'Respostas da escala grandes demais.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.can_use_patient_instruments(p_patient_id, p_discipline, v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: o paciente não está em atendimento nesta área com você.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.archived_at, p.erased_at
  INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND OR v_patient.archived_at IS NOT NULL OR v_patient.erased_at IS NOT NULL THEN
    RAISE EXCEPTION 'Paciente arquivado não recebe escala nova.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'patient-instrument-idempotency:' || v_uid::TEXT || ':' || p_idempotency_key::TEXT,
      0
    )
  );

  SELECT pia.id, pia.applied_at, pia.created_at
  INTO v_existing
  FROM public.patient_instrument_applications pia
  WHERE pia.applied_by = v_uid
    AND pia.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.applied_at, v_existing.created_at, TRUE;
    RETURN;
  END IF;

  v_has_risk := pg_catalog.jsonb_typeof(p_payload -> 'result' -> 'riskItems') = 'array'
    AND pg_catalog.jsonb_array_length(p_payload -> 'result' -> 'riskItems') > 0;

  INSERT INTO public.patient_instrument_applications AS pia (
    clinic_id,
    patient_id,
    discipline,
    instrument_id,
    instrument_version,
    applied_at,
    applied_by,
    source,
    payload_encrypted,
    idempotency_key,
    has_risk,
    risk_acknowledged_at,
    risk_acknowledged_by
  )
  VALUES (
    public.user_clinic_id(v_uid),
    p_patient_id,
    p_discipline,
    p_instrument_id,
    p_instrument_version,
    p_applied_at,
    v_uid,
    'consultorio',
    extensions.pgp_sym_encrypt(p_payload::TEXT, public.get_clinical_encryption_key()),
    p_idempotency_key,
    v_has_risk,
    CASE WHEN v_has_risk THEN pg_catalog.clock_timestamp() END,
    CASE WHEN v_has_risk THEN v_uid END
  )
  RETURNING pia.id INTO v_id;

  RETURN QUERY
  SELECT pia.id, pia.applied_at, pia.created_at, FALSE
  FROM public.patient_instrument_applications pia
  WHERE pia.id = v_id;
END;
$record_patient_instrument_application$;

-- Histórico: corpo de 20261008 + risco e alerta visto.
DROP FUNCTION IF EXISTS public.list_patient_instrument_applications(UUID, TEXT);
CREATE FUNCTION public.list_patient_instrument_applications(
  p_patient_id UUID,
  p_discipline TEXT
)
RETURNS TABLE (
  id UUID,
  instrument_id TEXT,
  instrument_version INTEGER,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  applied_by_name TEXT,
  source TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by_name TEXT,
  void_reason TEXT,
  has_risk BOOLEAN,
  risk_acknowledged_at TIMESTAMPTZ,
  risk_acknowledged_by_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_instrument_applications$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_use_patient_instruments(p_patient_id, p_discipline, v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: o paciente não está em atendimento nesta área com você.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    pia.id,
    pia.instrument_id,
    pia.instrument_version,
    pia.applied_at,
    pia.applied_by,
    author.full_name::TEXT,
    pia.source,
    extensions.pgp_sym_decrypt(pia.payload_encrypted, v_key)::JSONB,
    pia.created_at,
    pia.voided_at,
    voider.full_name::TEXT,
    CASE
      WHEN pia.void_reason_encrypted IS NULL THEN NULL::TEXT
      ELSE extensions.pgp_sym_decrypt(pia.void_reason_encrypted, v_key)::TEXT
    END,
    pia.has_risk,
    pia.risk_acknowledged_at,
    acknowledger.full_name::TEXT
  FROM public.patient_instrument_applications pia
  LEFT JOIN public.profiles author ON author.id = pia.applied_by
  LEFT JOIN public.profiles voider ON voider.id = pia.voided_by
  LEFT JOIN public.profiles acknowledger ON acknowledger.id = pia.risk_acknowledged_by
  WHERE pia.patient_id = p_patient_id
    AND pia.discipline = p_discipline
    AND pia.clinic_id = public.user_clinic_id(v_uid)
  ORDER BY pia.applied_at DESC, pia.created_at DESC
  LIMIT 500;
END;
$list_patient_instrument_applications$;

REVOKE ALL ON FUNCTION public.list_patient_instrument_applications(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_instrument_applications(UUID, TEXT) TO authenticated;

-- Alertas pendentes de quem está logado (tela inicial).
CREATE OR REPLACE FUNCTION public.list_my_instrument_risk_alerts()
RETURNS TABLE (
  application_id UUID,
  patient_id UUID,
  patient_name TEXT,
  instrument_id TEXT,
  discipline TEXT,
  applied_at TIMESTAMPTZ,
  source TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_my_instrument_risk_alerts$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    pia.id,
    pia.patient_id,
    COALESCE(NULLIF(pg_catalog.btrim(p.nome_social), ''), p.name)::TEXT,
    pia.instrument_id,
    pia.discipline,
    pia.applied_at,
    pia.source
  FROM public.patient_instrument_applications pia
  JOIN public.patients p ON p.id = pia.patient_id
  WHERE pia.has_risk
    AND pia.risk_acknowledged_at IS NULL
    AND pia.voided_at IS NULL
    AND pia.clinic_id = public.user_clinic_id(v_uid)
    AND pia.discipline = ANY(public.user_disciplines(v_uid))
    AND public.can_use_patient_instruments(pia.patient_id, pia.discipline, v_uid)
  ORDER BY pia.applied_at DESC
  LIMIT 50;
END;
$list_my_instrument_risk_alerts$;

REVOKE ALL ON FUNCTION public.list_my_instrument_risk_alerts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_my_instrument_risk_alerts() TO authenticated;

-- "Vi o alerta": quem atende o paciente na área.
CREATE OR REPLACE FUNCTION public.acknowledge_instrument_risk(p_application_id UUID)
RETURNS TABLE (application_id UUID, risk_acknowledged_at TIMESTAMPTZ)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $acknowledge_instrument_risk$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.patient_instrument_applications%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT pia.* INTO v_row
  FROM public.patient_instrument_applications pia
  WHERE pia.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public.can_use_patient_instruments(v_row.patient_id, v_row.discipline, v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: o paciente não está em atendimento nesta área com você.' USING ERRCODE = '42501';
  END IF;

  IF v_row.has_risk IS NOT TRUE THEN
    RAISE EXCEPTION 'Esta aplicação não tem alerta de risco.' USING ERRCODE = '22023';
  END IF;

  IF v_row.risk_acknowledged_at IS NULL THEN
    UPDATE public.patient_instrument_applications pia
       SET risk_acknowledged_at = pg_catalog.clock_timestamp(),
           risk_acknowledged_by = v_uid
     WHERE pia.id = p_application_id;
  END IF;

  RETURN QUERY
  SELECT pia.id, pia.risk_acknowledged_at
  FROM public.patient_instrument_applications pia
  WHERE pia.id = p_application_id;
END;
$acknowledge_instrument_risk$;

REVOKE ALL ON FUNCTION public.acknowledge_instrument_risk(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_instrument_risk(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 4. Enviar, listar e cancelar escala para casa
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_send_instrument(
  p_patient_id UUID,
  p_discipline TEXT,
  p_instrument_id TEXT,
  p_instrument_version INTEGER,
  p_title TEXT,
  p_questions JSONB,
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_send_instrument$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_title TEXT := pg_catalog.btrim(COALESCE(p_title, ''));
  v_assignment UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND
     OR NOT (
       public.can_manage_patient_portal(v_clinic, v_uid)
       OR public.can_use_patient_instruments(p_patient_id, p_discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Paciente não encontrado ou sem permissão para enviar a escala.' USING ERRCODE = '42501';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_instrument_id IS NULL OR p_instrument_id !~ '^[a-z0-9][a-z0-9_-]{1,39}$'
     OR p_instrument_version IS NULL OR p_instrument_version < 1 THEN
    RAISE EXCEPTION 'Escala inválida.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_title) < 2 OR pg_catalog.char_length(v_title) > 200 THEN
    RAISE EXCEPTION 'Nome da escala inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_questions IS NULL
     OR pg_catalog.jsonb_typeof(p_questions) <> 'array'
     OR pg_catalog.jsonb_array_length(p_questions) = 0
     OR pg_catalog.jsonb_array_length(p_questions) > 100
     OR pg_catalog.octet_length(p_questions::TEXT) > 65536 THEN
    RAISE EXCEPTION 'Perguntas da escala inválidas.' USING ERRCODE = '22023';
  END IF;
  IF p_due_date IS NOT NULL AND p_due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'O prazo não pode ser uma data passada.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patient_form_assignments f
    WHERE f.patient_id = p_patient_id
      AND f.kind = 'instrument'
      AND f.instrument_id = p_instrument_id
      AND f.status IN ('pending', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Já existe um envio desta escala esperando a resposta do paciente.' USING ERRCODE = '22023';
  END IF;

  -- A nota e o alerta de risco vão para quem atende o paciente na área
  -- da escala. Sem ninguém atendendo (envio da administração), não
  -- chegariam a ninguém: não envia.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.clinic_id = v_clinic
      AND public.can_use_patient_instruments(p_patient_id, p_discipline, pr.id)
  ) THEN
    RAISE EXCEPTION 'Ninguém da área desta escala atende o paciente ainda: a nota e o alerta de risco não chegariam a ninguém. Agende um atendimento ou indique o responsável na matrícula antes de enviar.'
      USING ERRCODE = '22023';
  END IF;

  -- Mesma checagem de nascimento/arquivado do acesso; o código nasce aqui
  -- se faltar, mas só quem pode vê-lo (can_manage_patient_access) o lê.
  PERFORM public.portal_ensure_access_row(p_patient_id);

  INSERT INTO public.patient_form_assignments (
    clinic_id, patient_id, form_id, form_title, form_description, form_questions, due_date, created_by,
    kind, instrument_id, instrument_version, discipline
  )
  VALUES (
    v_clinic, p_patient_id, NULL, v_title, NULL, p_questions, p_due_date, v_uid,
    'instrument', p_instrument_id, p_instrument_version, p_discipline
  )
  RETURNING id INTO v_assignment;

  RETURN v_assignment;
END;
$portal_send_instrument$;

REVOKE ALL ON FUNCTION public.portal_send_instrument(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_send_instrument(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_patient_instrument_requests(p_patient_id UUID, p_discipline TEXT)
RETURNS TABLE (
  request_id UUID,
  instrument_id TEXT,
  instrument_version INTEGER,
  request_status TEXT,
  progress SMALLINT,
  due_date DATE,
  sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  sent_by_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_instrument_requests$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND
     OR NOT (
       public.can_manage_patient_portal(v_clinic, v_uid)
       OR public.can_use_patient_instruments(p_patient_id, p_discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Acesso negado: o paciente não está em atendimento nesta área com você.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.id, f.instrument_id, f.instrument_version, f.status, f.progress, f.due_date,
         f.created_at, f.submitted_at, f.cancelled_at, sender.full_name::TEXT
  FROM public.patient_form_assignments f
  LEFT JOIN public.profiles sender ON sender.id = f.created_by
  WHERE f.patient_id = p_patient_id
    AND f.clinic_id = v_clinic
    AND f.kind = 'instrument'
    AND f.discipline = p_discipline
  ORDER BY f.created_at DESC
  LIMIT 100;
END;
$list_patient_instrument_requests$;

REVOKE ALL ON FUNCTION public.list_patient_instrument_requests(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_instrument_requests(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_patient_instrument_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $cancel_patient_instrument_request$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.patient_form_assignments;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_row FROM public.patient_form_assignments f WHERE f.id = p_request_id FOR UPDATE;
  IF NOT FOUND
     OR v_row.kind <> 'instrument'
     OR NOT (
       public.can_manage_patient_portal(v_row.clinic_id, v_uid)
       OR public.can_use_patient_instruments(v_row.patient_id, v_row.discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Envio não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Não foi possível cancelar: a escala já foi respondida ou cancelada.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_form_assignments f
     SET status = 'cancelled',
         cancelled_at = timezone('utc', now())
   WHERE f.id = v_row.id;
END;
$cancel_patient_instrument_request$;

REVOKE ALL ON FUNCTION public.cancel_patient_instrument_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_patient_instrument_request(UUID) TO authenticated;

-- Respostas para a administração (Importáveis, ficha): corpo de 20261006,
-- agora só de formulário. Resposta de escala é de quem atende o paciente
-- na área (aba Escalas, can_use_patient_instruments); a administração vê
-- só a situação do envio.
CREATE OR REPLACE FUNCTION public.portal_admin_read_answers(p_assignment_ids UUID[])
RETURNS TABLE (assignment_id UUID, answers JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_admin_read_answers$
DECLARE
  v_key TEXT;
BEGIN
  IF p_assignment_ids IS NULL OR cardinality(p_assignment_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_assignment_ids) > 500 THEN
    RAISE EXCEPTION 'No máximo 500 respostas por vez.' USING ERRCODE = '22023';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    f.id,
    CASE
      WHEN f.answers_encrypted IS NULL THEN '{}'::JSONB
      ELSE extensions.pgp_sym_decrypt(f.answers_encrypted, v_key)::JSONB
    END
  FROM public.patient_form_assignments f
  WHERE f.id = ANY (p_assignment_ids)
    AND f.kind = 'form'
    AND public.can_manage_patient_portal(f.clinic_id);
END;
$portal_admin_read_answers$;

REVOKE ALL ON FUNCTION public.portal_admin_read_answers(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_admin_read_answers(UUID[]) TO authenticated;

-- ----------------------------------------------------------
-- 5. Resposta do paciente: corpo de 20261006 + a escala gravada junto
-- ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.portal_save_answers(UUID, UUID, JSONB, INTEGER, INTEGER, UUID, BOOLEAN);
CREATE FUNCTION public.portal_save_answers(
  p_access_id UUID,
  p_assignment_id UUID,
  p_answers JSONB,
  p_progress INTEGER,
  p_expected_revision INTEGER,
  p_save_id UUID,
  p_submit BOOLEAN DEFAULT false,
  p_instrument_payload JSONB DEFAULT NULL
)
RETURNS TABLE (result_status TEXT, result_revision INTEGER, result_assignment_status TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_save_answers$
DECLARE
  v_row public.patient_form_assignments;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_revision INTEGER;
  v_status TEXT;
  v_has_risk BOOLEAN;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' OR octet_length(p_answers::TEXT) > 150000 THEN
    RETURN QUERY SELECT 'invalid'::TEXT, NULL::INTEGER, NULL::TEXT;
    RETURN;
  END IF;

  SELECT f.* INTO v_row
    FROM public.patient_form_assignments f
    JOIN public.patient_portal_access a
      ON a.patient_id = f.patient_id
     AND a.clinic_id = f.clinic_id
   WHERE a.id = p_access_id
     AND f.id = p_assignment_id
   FOR UPDATE OF f;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER, NULL::TEXT;
    RETURN;
  END IF;

  IF p_save_id IS NOT NULL AND v_row.last_save_id = p_save_id THEN
    RETURN QUERY SELECT 'ok'::TEXT, v_row.revision, v_row.status;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('pending', 'in_progress') THEN
    RETURN QUERY SELECT 'closed'::TEXT, v_row.revision, v_row.status;
    RETURN;
  END IF;

  IF p_expected_revision IS NULL OR v_row.revision <> p_expected_revision THEN
    RETURN QUERY SELECT 'conflict'::TEXT, v_row.revision, v_row.status;
    RETURN;
  END IF;

  -- Escala enviada: ao enviar, o resultado calculado pela Edge Function
  -- (definição oficial) precisa vir junto, ou nada é gravado.
  IF p_submit IS TRUE AND v_row.kind = 'instrument' THEN
    IF p_instrument_payload IS NULL
       OR jsonb_typeof(p_instrument_payload) <> 'object'
       OR jsonb_typeof(p_instrument_payload -> 'answers') IS DISTINCT FROM 'object'
       OR jsonb_typeof(p_instrument_payload -> 'result') IS DISTINCT FROM 'object'
       OR octet_length(p_instrument_payload::TEXT) > 65536
       OR v_row.created_by IS NULL THEN
      RETURN QUERY SELECT 'invalid_instrument'::TEXT, v_row.revision, v_row.status;
      RETURN;
    END IF;
  END IF;

  UPDATE public.patient_form_assignments f
     SET answers_encrypted = extensions.pgp_sym_encrypt(p_answers::TEXT, public.get_clinical_encryption_key()),
         progress = LEAST(GREATEST(COALESCE(p_progress, 0), 0), 100),
         revision = f.revision + 1,
         last_save_id = p_save_id,
         status = CASE WHEN p_submit IS TRUE THEN 'submitted' ELSE 'in_progress' END,
         started_at = COALESCE(f.started_at, v_now),
         last_saved_at = v_now,
         submitted_at = CASE WHEN p_submit IS TRUE THEN v_now ELSE NULL END
   WHERE f.id = v_row.id
  RETURNING f.revision, f.status INTO v_revision, v_status;

  IF p_submit IS TRUE AND v_row.kind = 'instrument' THEN
    v_has_risk := jsonb_typeof(p_instrument_payload -> 'result' -> 'riskItems') = 'array'
      AND jsonb_array_length(p_instrument_payload -> 'result' -> 'riskItems') > 0;

    INSERT INTO public.patient_instrument_applications AS pia (
      clinic_id, patient_id, discipline, instrument_id, instrument_version,
      applied_at, applied_by, source, payload_encrypted, idempotency_key, has_risk
    )
    VALUES (
      v_row.clinic_id, v_row.patient_id, v_row.discipline, v_row.instrument_id, v_row.instrument_version,
      v_now, v_row.created_by, 'area_do_paciente',
      extensions.pgp_sym_encrypt(p_instrument_payload::TEXT, public.get_clinical_encryption_key()),
      v_row.id, v_has_risk
    );
    -- Sem risco de duplicar: o envio acabou de virar 'submitted' (nova
    -- tentativa cai em 'closed') e o mesmo saveId volta lá em cima.
  END IF;

  RETURN QUERY SELECT 'ok'::TEXT, v_revision, v_status;
END;
$portal_save_answers$;

REVOKE ALL ON FUNCTION public.portal_save_answers(UUID, UUID, JSONB, INTEGER, INTEGER, UUID, BOOLEAN, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_save_answers(UUID, UUID, JSONB, INTEGER, INTEGER, UUID, BOOLEAN, JSONB) TO service_role;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  NOT has_function_privilege('authenticated', 'public.portal_save_answers(uuid, uuid, jsonb, integer, integer, uuid, boolean, jsonb)', 'EXECUTE') AS resposta_so_pela_function,
  NOT has_function_privilege('authenticated', 'public.portal_ensure_access_row(uuid)', 'EXECUTE') AS acesso_interno_fechado,
  has_function_privilege('authenticated', 'public.portal_send_instrument(uuid, text, text, integer, text, jsonb, date)', 'EXECUTE') AS envio_de_escala,
  (SELECT count(*) FROM pg_proc WHERE proname = 'portal_save_answers') = 1 AS sem_sobrecarga_antiga;
