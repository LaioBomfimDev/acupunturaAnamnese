-- ==========================================================
-- Escalas clínicas aplicadas ao paciente (etapa 1: consultório)
-- REQUER: 20260723_clinical_data_hardening (can_access_clinical_data,
-- user_clinic_id, user_disciplines, get_clinical_encryption_key),
-- 20260915b_patient_suspend_and_erasure (patients.erased_at e a versão
-- viva de admin_decide_patient_deletion).
--
-- Por quê: a escala (PHQ-9, GAD-7…) é aplicada, o sistema soma os pontos
-- e mostra a faixa do instrumento e a evolução no tempo. Cada aplicação
-- é um registro próprio, numa tabela própria, para que a mesma história
-- receba depois as respostas enviadas pela Área do Paciente (etapa 2,
-- source = 'area_do_paciente') sem juntar fontes no gráfico.
--
-- Desenho (caminho C, escolhido em 08/10/2026):
--   * Quem vê e quem aplica: quem ATENDE o paciente na disciplina da
--     escala. Profissional ativo (senha trocada, MFA quando exigido) da
--     MESMA clínica, com a disciplina, e que tem atendimento desse
--     paciente nessa disciplina na Agenda (mesmo critério das evoluções)
--     ou é responsável pela matrícula dele nela (assigned_to/referred_by).
--     Matrícula sozinha não basta: ela diz que o paciente está na área,
--     não quem o atende — a outra psicóloga da clínica não lê. E a
--     nutricionista do mesmo paciente não lê a escala da Psicologia.
--     Medido em 08/10/2026: 3 de 24 pacientes com agenda na Psicologia
--     não tinham matrícula na área; pela Agenda, os 24 ficam cobertos.
--   * Respostas, nota, faixa e observação vão cifradas (chave do Vault dos
--     prontuários). Fora da cifra ficam só os metadados da linha.
--   * Sem UPDATE de conteúdo e sem DELETE: aplicação errada é ANULADA por
--     quem aplicou, com motivo (cifrado). A linha anulada continua no
--     histórico, marcada.
--   * Idempotência por (applied_by, idempotency_key): retry de rede não
--     duplica a aplicação.
--   * Sem acesso direto à tabela: tudo passa pelas RPCs abaixo.
--   * A exclusão de paciente (anonimização) passa a apagar estas linhas,
--     com cópia no snapshot, como já faz com evoluções e prontuários.
--
-- Reverter: recriar admin_decide_patient_deletion a partir de
-- 20260915b_patient_suspend_and_erasure.sql e depois DROP FUNCTION
-- record_/list_/void_patient_instrument_application(s),
-- can_use_patient_instruments e DROP TABLE patient_instrument_applications.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Quem pode aplicar e ler escalas deste paciente nesta disciplina
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_use_patient_instruments(
  p_patient UUID,
  p_discipline TEXT,
  p_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_use_patient_instruments$
  SELECT p_patient IS NOT NULL
    AND p_discipline IS NOT NULL
    AND p_user IS NOT NULL
    AND public.can_access_clinical_data(p_user)
    AND p_discipline = ANY(public.user_disciplines(p_user))
    AND (
      EXISTS (
        SELECT 1
        FROM public.appointments appointment
        WHERE appointment.patient_id = p_patient
          AND appointment.professional_id = p_user
          AND appointment.discipline = p_discipline
          AND appointment.kind = 'appointment'
          AND appointment.clinic_id = public.user_clinic_id(p_user)
      )
      OR EXISTS (
        SELECT 1
        FROM public.patient_enrollments enrollment
        WHERE enrollment.patient_id = p_patient
          AND enrollment.discipline = p_discipline
          AND enrollment.status = 'active'
          AND enrollment.clinic_id = public.user_clinic_id(p_user)
          AND (enrollment.assigned_to = p_user OR enrollment.referred_by = p_user)
      )
    );
$can_use_patient_instruments$;

REVOKE ALL ON FUNCTION public.can_use_patient_instruments(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_patient_instruments(UUID, TEXT, UUID) TO authenticated;

-- ----------------------------------------------------------
-- 2. Aplicações
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_instrument_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  discipline TEXT NOT NULL,
  instrument_id TEXT NOT NULL,
  instrument_version INTEGER NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL,
  applied_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source TEXT NOT NULL DEFAULT 'consultorio',
  payload_encrypted BYTEA NOT NULL,
  idempotency_key UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  void_reason_encrypted BYTEA,
  CONSTRAINT patient_instrument_applications_discipline_check
    CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')),
  CONSTRAINT patient_instrument_applications_instrument_check
    CHECK (instrument_id ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  CONSTRAINT patient_instrument_applications_version_check
    CHECK (instrument_version >= 1),
  CONSTRAINT patient_instrument_applications_source_check
    CHECK (source IN ('consultorio', 'area_do_paciente')),
  CONSTRAINT patient_instrument_applications_void_check
    CHECK (
      (voided_at IS NULL AND voided_by IS NULL AND void_reason_encrypted IS NULL)
      OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason_encrypted IS NOT NULL)
    )
);

COMMENT ON TABLE public.patient_instrument_applications IS
  'Escalas aplicadas ao paciente. Conteúdo cifrado; acesso só pelas RPCs *_patient_instrument_application(s).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_instrument_applications_idempotency
  ON public.patient_instrument_applications(applied_by, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_patient_instrument_applications_patient
  ON public.patient_instrument_applications(patient_id, discipline, applied_at DESC);

ALTER TABLE public.patient_instrument_applications ENABLE ROW LEVEL SECURITY;
-- Sem policy de propósito: ninguém lê nem escreve a tabela direto.
REVOKE ALL ON TABLE public.patient_instrument_applications FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 3. Registrar uma aplicação
-- ----------------------------------------------------------
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

  -- Serializa retries concorrentes da mesma chave antes de checar se já
  -- existe: sem o lock, duas requisições idênticas em paralelo passariam
  -- as duas pelo SELECT antes de qualquer uma inserir.
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
    idempotency_key
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
    p_idempotency_key
  )
  RETURNING pia.id INTO v_id;

  RETURN QUERY
  SELECT pia.id, pia.applied_at, pia.created_at, FALSE
  FROM public.patient_instrument_applications pia
  WHERE pia.id = v_id;
END;
$record_patient_instrument_application$;

-- ----------------------------------------------------------
-- 4. Histórico de um paciente numa disciplina (decifrado)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_patient_instrument_applications(
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
  void_reason TEXT
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
    END
  FROM public.patient_instrument_applications pia
  LEFT JOIN public.profiles author ON author.id = pia.applied_by
  LEFT JOIN public.profiles voider ON voider.id = pia.voided_by
  WHERE pia.patient_id = p_patient_id
    AND pia.discipline = p_discipline
    AND pia.clinic_id = public.user_clinic_id(v_uid)
  ORDER BY pia.applied_at DESC, pia.created_at DESC
  LIMIT 500;
END;
$list_patient_instrument_applications$;

-- ----------------------------------------------------------
-- 5. Anular uma aplicação (só quem aplicou, com motivo)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_patient_instrument_application(
  p_application_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  id UUID,
  voided_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $void_patient_instrument_application$
DECLARE
  v_uid UUID := auth.uid();
  v_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_row public.patient_instrument_applications%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.char_length(v_reason) < 3 OR pg_catalog.char_length(v_reason) > 500 THEN
    RAISE EXCEPTION 'Escreva o motivo da anulação (de 3 a 500 letras).' USING ERRCODE = '22023';
  END IF;

  -- Trava a linha: duas anulações ao mesmo tempo não passam juntas.
  SELECT pia.* INTO v_row
  FROM public.patient_instrument_applications pia
  WHERE pia.id = p_application_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_row.applied_by IS DISTINCT FROM v_uid
     OR NOT public.can_use_patient_instruments(v_row.patient_id, v_row.discipline, v_uid) THEN
    RAISE EXCEPTION 'Só quem aplicou a escala pode anular.' USING ERRCODE = '42501';
  END IF;

  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta aplicação já foi anulada.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_instrument_applications pia
  SET voided_at = pg_catalog.clock_timestamp(),
      voided_by = v_uid,
      void_reason_encrypted = extensions.pgp_sym_encrypt(v_reason, public.get_clinical_encryption_key())
  WHERE pia.id = p_application_id;

  RETURN QUERY
  SELECT pia.id, pia.voided_at
  FROM public.patient_instrument_applications pia
  WHERE pia.id = p_application_id;
END;
$void_patient_instrument_application$;

REVOKE ALL ON FUNCTION public.record_patient_instrument_application(UUID, TEXT, TEXT, INTEGER, TIMESTAMPTZ, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_patient_instrument_applications(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_patient_instrument_application(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_patient_instrument_application(UUID, TEXT, TEXT, INTEGER, TIMESTAMPTZ, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_patient_instrument_applications(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_patient_instrument_application(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 6. Exclusão de paciente: as escalas entram no snapshot e saem junto.
--    Corpo copiado da versão viva (20260915b_patient_suspend_and_erasure);
--    mudam só a chave 'patient_instrument_applications' do snapshot e o
--    DELETE correspondente.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_patient_deletion(
  p_request_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_decide_patient_deletion$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.patient_deletion_requests%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req
  FROM public.patient_deletion_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já foi decidida.' USING ERRCODE = '55000';
  END IF;

  IF v_uid IS NULL
     OR NOT (
       public.is_super_admin(v_uid)
       OR (public.is_clinic_admin(v_uid) AND v_req.clinic_id = public.user_clinic_id(v_uid))
     ) THEN
    RAISE EXCEPTION 'Acesso negado: somente administração da clínica decide.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_deletion_requests
  SET status = p_decision,
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;

  IF p_decision = 'rejected' THEN
    -- Volta a ficar visível normalmente: a exclusão foi negada.
    UPDATE public.patients
    SET archived_at = NULL
    WHERE id = v_req.patient_id;
    RETURN;
  END IF;

  -- Aprovado: snapshot completo antes de qualquer exclusão/limpeza.
  SELECT jsonb_build_object(
    'patient', (SELECT to_jsonb(p) FROM public.patients p WHERE p.id = v_req.patient_id),
    'clinical_records', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.clinical_records r WHERE r.patient_id = v_req.patient_id),
    'patient_evolutions', (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM public.patient_evolutions e WHERE e.patient_id = v_req.patient_id),
    'patient_instrument_applications', (SELECT coalesce(jsonb_agg(to_jsonb(ia)), '[]'::jsonb) FROM public.patient_instrument_applications ia WHERE ia.patient_id = v_req.patient_id),
    'patient_enrollments', (SELECT coalesce(jsonb_agg(to_jsonb(en)), '[]'::jsonb) FROM public.patient_enrollments en WHERE en.patient_id = v_req.patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.appointments a WHERE a.patient_id = v_req.patient_id),
    'record_shares', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.record_shares s WHERE s.patient_id = v_req.patient_id),
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

  DELETE FROM public.patient_attachments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.record_shares WHERE patient_id = v_req.patient_id;
  DELETE FROM public.appointments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_enrollments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_evolutions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_instrument_applications WHERE patient_id = v_req.patient_id;
  DELETE FROM public.clinical_records WHERE patient_id = v_req.patient_id;

  UPDATE public.patients
  SET name = '[Paciente removido]',
      phone = NULL,
      birth_date = NULL,
      age = NULL,
      cpf = NULL,
      nome_social = NULL,
      nome_mae = NULL,
      nome_pai = NULL,
      nome_conjuge = NULL,
      sexo_biologico = NULL,
      genero = NULL,
      responsavel_nome = NULL,
      responsavel_telefone = NULL,
      responsavel_cpf = NULL,
      convenio_nome = NULL,
      convenio_carteirinha = NULL,
      endereco_cep = NULL,
      endereco_logradouro = NULL,
      endereco_numero = NULL,
      endereco_complemento = NULL,
      endereco_bairro = NULL,
      endereco_cidade = NULL,
      endereco_uf = NULL,
      image_consent = FALSE,
      image_consent_at = NULL,
      has_pending = FALSE,
      suspended_at = NULL,
      archived_at = COALESCE(archived_at, pg_catalog.clock_timestamp()),
      erased_at = pg_catalog.clock_timestamp()
  WHERE id = v_req.patient_id;

  UPDATE public.patient_deletion_requests
  SET status = 'executed',
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;
END;
$admin_decide_patient_deletion$;

REVOKE ALL ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) TO authenticated;
