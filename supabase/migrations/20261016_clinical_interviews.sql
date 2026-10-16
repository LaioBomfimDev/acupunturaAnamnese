-- ==========================================================
-- Entrevistas clínicas (aba Entrevistas da Psicologia, 16/10/2026)
-- REQUER: 20261006_patient_portal, 20261008_patient_instruments,
-- 20261009_portal_patient_erasure (versão de admin_decide_patient_deletion
-- da qual esta parte) e 20261012_instrument_result_responsible
-- (can_read_patient_instruments).
--
-- Por quê: a clínica tem roteiros de entrevista com quem convive com o
-- paciente (heterorrelato: familiar, pessoa próxima, professora). Como
-- as escalas, a entrevista é respondida no consultório ou enviada para
-- responder; diferente delas, não tem nota.
--
-- Decisões da usuária (16/10/2026): motor de formulários (o mesmo da
-- Área do Paciente: tipos de pergunta, tela de resposta, salvamento com
-- revisão) e link só de quem responde.
--
-- Desenho:
--   * Tabela própria, não patient_form_assignments: quem responde não é
--     o paciente. Envio naquela tabela apareceria na Área do Paciente do
--     próprio paciente, que poderia ler e mexer no que a mãe respondeu.
--   * Sem leitura direta: tudo por RPC. Quem aplica, envia e lê = quem
--     atende o paciente na área + administração da clínica
--     (can_read_patient_instruments, a mesma regra das escalas). Recepção
--     nunca.
--   * Link: token aleatório (192 bits) gerado aqui. O banco acha a
--     resposta pelo SHA-256 dele (link_token_hash); a cópia cifrada com a
--     chave dos prontuários serve só para quem atende copiar o link de
--     novo. Vale até link_expires_at; respondido ou cancelado, fecha.
--   * O link vê só o primeiro nome do paciente, o nome da clínica e as
--     respostas que ele mesmo já salvou naquele link.
--   * Respostas cifradas (get_clinical_encryption_key), com revisão (CAS)
--     e chave de idempotência por salvamento, como a Área do Paciente.
--   * Cada resposta guarda a cópia das perguntas que a pessoa viu.
--   * Resposta enviada não se edita nem se exclui: quem registrou (ou a
--     administração) anula com motivo, e a linha fica no histórico.
--   * A exclusão de paciente apaga as entrevistas (snapshot antes, sem o
--     token do link).
--
-- Reverter: recriar admin_decide_patient_deletion a partir de
-- 20261009_portal_patient_erasure.sql; DROP das funções criadas aqui e
-- DROP TABLE public.patient_interview_responses.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.patient_portal_access') IS NULL
     OR to_regclass('public.patient_portal_sessions') IS NULL
     OR to_regclass('public.patient_form_assignments') IS NULL
     OR to_regclass('public.patient_instrument_applications') IS NULL
     OR to_regprocedure('public.can_read_patient_instruments(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261006, 20261008, 20261009 e 20261012.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 1. Quem usa as entrevistas de um paciente numa área
-- ----------------------------------------------------------
-- Mesma regra das escalas: quem atende o paciente na área (Agenda ou
-- responsável da matrícula) e a administração da clínica.
CREATE OR REPLACE FUNCTION public.can_use_patient_interviews(
  p_patient UUID,
  p_discipline TEXT,
  p_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_use_patient_interviews$
  SELECT public.can_read_patient_instruments(p_patient, p_discipline, p_user);
$can_use_patient_interviews$;

REVOKE ALL ON FUNCTION public.can_use_patient_interviews(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_patient_interviews(UUID, TEXT, UUID) TO authenticated;

-- ----------------------------------------------------------
-- 2. Respostas
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_interview_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  discipline TEXT NOT NULL,
  interview_id TEXT NOT NULL,
  interview_version INTEGER NOT NULL,
  title TEXT NOT NULL,
  -- Cópia das perguntas que a pessoa viu (formato de utils/patientForms).
  questions JSONB NOT NULL,
  channel TEXT NOT NULL,
  -- Link: para quem foi ("Mãe", "Professora Ana"). Consultório: vazio.
  recipient_label TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  progress SMALLINT NOT NULL DEFAULT 0,
  answers_encrypted BYTEA,
  revision INTEGER NOT NULL DEFAULT 0,
  last_save_id UUID,
  link_token_hash TEXT,
  link_token_encrypted BYTEA,
  link_expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  started_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  void_reason_encrypted BYTEA,

  CONSTRAINT patient_interview_responses_discipline_check
    CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')),
  CONSTRAINT patient_interview_responses_interview_check
    CHECK (interview_id ~ '^[a-z0-9][a-z0-9_-]{1,39}$' AND interview_version >= 1),
  CONSTRAINT patient_interview_responses_title_check
    CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT patient_interview_responses_questions_check
    CHECK (
      jsonb_typeof(questions) = 'array'
      AND jsonb_array_length(questions) BETWEEN 1 AND 250
      AND octet_length(questions::text) <= 200000
    ),
  CONSTRAINT patient_interview_responses_channel_check
    CHECK (channel IN ('consultorio', 'link')),
  CONSTRAINT patient_interview_responses_status_check
    CHECK (status IN ('pending', 'in_progress', 'submitted', 'cancelled')),
  CONSTRAINT patient_interview_responses_recipient_check
    CHECK (recipient_label IS NULL OR char_length(btrim(recipient_label)) BETWEEN 1 AND 80),
  CONSTRAINT patient_interview_responses_progress_check
    CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT patient_interview_responses_submitted_check
    CHECK ((status = 'submitted') = (submitted_at IS NOT NULL)),
  CONSTRAINT patient_interview_responses_cancelled_check
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  -- Consultório nasce respondida e sem link; link sempre com token e prazo.
  CONSTRAINT patient_interview_responses_channel_shape_check
    CHECK (
      (channel = 'consultorio' AND status = 'submitted'
        AND link_token_hash IS NULL AND link_token_encrypted IS NULL AND link_expires_at IS NULL)
      OR (channel = 'link' AND recipient_label IS NOT NULL
        AND link_token_hash ~ '^[0-9a-f]{64}$'
        AND link_token_encrypted IS NOT NULL AND link_expires_at IS NOT NULL)
    ),
  CONSTRAINT patient_interview_responses_void_check
    CHECK (
      (voided_at IS NULL AND voided_by IS NULL AND void_reason_encrypted IS NULL)
      OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason_encrypted IS NOT NULL
        AND status = 'submitted')
    ),
  CONSTRAINT patient_interview_responses_token_key UNIQUE (link_token_hash)
);

CREATE INDEX IF NOT EXISTS idx_patient_interview_responses_patient
  ON public.patient_interview_responses (patient_id, discipline, created_at DESC);

-- Salvamento do consultório repetido (internet caiu) não duplica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_interview_responses_office_save
  ON public.patient_interview_responses (last_save_id)
  WHERE channel = 'consultorio';

ALTER TABLE public.patient_interview_responses ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: ninguém lê nem grava direto, só pelas RPCs abaixo.
REVOKE ALL ON TABLE public.patient_interview_responses FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 3. Conferências comuns
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.interview_check_content(
  p_interview_id TEXT,
  p_interview_version INTEGER,
  p_title TEXT,
  p_questions JSONB
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $interview_check_content$
BEGIN
  IF p_interview_id IS NULL OR p_interview_id !~ '^[a-z0-9][a-z0-9_-]{1,39}$'
     OR p_interview_version IS NULL OR p_interview_version < 1 THEN
    RAISE EXCEPTION 'Entrevista inválida.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(pg_catalog.btrim(COALESCE(p_title, ''))) NOT BETWEEN 2 AND 200 THEN
    RAISE EXCEPTION 'Nome da entrevista inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_questions IS NULL
     OR pg_catalog.jsonb_typeof(p_questions) <> 'array'
     OR pg_catalog.jsonb_array_length(p_questions) NOT BETWEEN 1 AND 250
     OR pg_catalog.octet_length(p_questions::TEXT) > 200000 THEN
    RAISE EXCEPTION 'Perguntas da entrevista inválidas.' USING ERRCODE = '22023';
  END IF;
END;
$interview_check_content$;

REVOKE ALL ON FUNCTION public.interview_check_content(TEXT, INTEGER, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Paciente da clínica, ativo, e quem pede pode usar entrevistas nele.
CREATE OR REPLACE FUNCTION public.interview_patient_clinic(p_patient_id UUID, p_discipline TEXT, p_user UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $interview_patient_clinic$
DECLARE
  v_patient RECORD;
BEGIN
  IF p_user IS NULL OR NOT public.can_access_clinical_data(p_user) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;
  IF p_discipline IS NULL
     OR p_discipline <> ALL (ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinic_id, p.archived_at, p.erased_at INTO v_patient
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND OR NOT public.can_use_patient_interviews(p_patient_id, p_discipline, p_user) THEN
    RAISE EXCEPTION 'Acesso negado: o paciente não está em atendimento nesta área com você.' USING ERRCODE = '42501';
  END IF;
  IF v_patient.archived_at IS NOT NULL OR v_patient.erased_at IS NOT NULL THEN
    RAISE EXCEPTION 'Paciente arquivado: reative o cadastro antes de registrar entrevistas.' USING ERRCODE = '22023';
  END IF;
  RETURN v_patient.clinic_id;
END;
$interview_patient_clinic$;

REVOKE ALL ON FUNCTION public.interview_patient_clinic(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 4. Consultório: grava a entrevista respondida
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_interview_answers(
  p_patient_id UUID,
  p_discipline TEXT,
  p_interview_id TEXT,
  p_interview_version INTEGER,
  p_title TEXT,
  p_questions JSONB,
  p_answers JSONB,
  p_progress INTEGER,
  p_save_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $record_interview_answers$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_id UUID;
BEGIN
  v_clinic := public.interview_patient_clinic(p_patient_id, p_discipline, v_uid);
  PERFORM public.interview_check_content(p_interview_id, p_interview_version, p_title, p_questions);
  IF p_answers IS NULL OR pg_catalog.jsonb_typeof(p_answers) <> 'object'
     OR pg_catalog.octet_length(p_answers::TEXT) > 150000 THEN
    RAISE EXCEPTION 'Respostas inválidas.' USING ERRCODE = '22023';
  END IF;
  IF p_save_id IS NULL THEN
    RAISE EXCEPTION 'Salvamento sem identificação.' USING ERRCODE = '22023';
  END IF;

  -- Mesmo salvamento repetido: devolve o que já foi gravado.
  SELECT r.id INTO v_id
  FROM public.patient_interview_responses r
  WHERE r.channel = 'consultorio' AND r.last_save_id = p_save_id;
  IF FOUND THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.patient_interview_responses (
    clinic_id, patient_id, discipline, interview_id, interview_version, title, questions,
    channel, status, progress, answers_encrypted, revision, last_save_id,
    created_by, created_at, started_at, last_saved_at, submitted_at
  )
  VALUES (
    v_clinic, p_patient_id, p_discipline, p_interview_id, p_interview_version,
    pg_catalog.btrim(p_title), p_questions,
    'consultorio', 'submitted', LEAST(GREATEST(COALESCE(p_progress, 0), 0), 100),
    extensions.pgp_sym_encrypt(p_answers::TEXT, public.get_clinical_encryption_key()), 1, p_save_id,
    v_uid, v_now, v_now, v_now, v_now
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$record_interview_answers$;

REVOKE ALL ON FUNCTION public.record_interview_answers(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, JSONB, INTEGER, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_interview_answers(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, JSONB, INTEGER, UUID) TO authenticated;

-- ----------------------------------------------------------
-- 5. Link de quem responde
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_interview_link(
  p_patient_id UUID,
  p_discipline TEXT,
  p_interview_id TEXT,
  p_interview_version INTEGER,
  p_title TEXT,
  p_questions JSONB,
  p_recipient_label TEXT,
  p_valid_days INTEGER DEFAULT 30
)
RETURNS TABLE (result_id UUID, result_token TEXT, result_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $send_interview_link$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_label TEXT := pg_catalog.btrim(COALESCE(p_recipient_label, ''));
  v_token TEXT;
  v_expires TIMESTAMPTZ;
  v_id UUID;
BEGIN
  v_clinic := public.interview_patient_clinic(p_patient_id, p_discipline, v_uid);
  PERFORM public.interview_check_content(p_interview_id, p_interview_version, p_title, p_questions);
  IF pg_catalog.char_length(v_label) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Diga para quem é o link (até 80 letras).' USING ERRCODE = '22023';
  END IF;
  IF p_valid_days IS NULL OR p_valid_days NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'O link vale de 1 a 60 dias.' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT pg_catalog.count(*)
    FROM public.patient_interview_responses r
    WHERE r.patient_id = p_patient_id
      AND r.channel = 'link'
      AND r.status IN ('pending', 'in_progress')
      AND r.link_expires_at > pg_catalog.now()
  ) >= 20 THEN
    RAISE EXCEPTION 'Este paciente já tem 20 links abertos. Cancele os que não vão ser usados antes de mandar outro.'
      USING ERRCODE = '22023';
  END IF;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
  v_expires := pg_catalog.now() + pg_catalog.make_interval(days => p_valid_days);

  INSERT INTO public.patient_interview_responses (
    clinic_id, patient_id, discipline, interview_id, interview_version, title, questions,
    channel, recipient_label, status, link_token_hash, link_token_encrypted, link_expires_at, created_by
  )
  VALUES (
    v_clinic, p_patient_id, p_discipline, p_interview_id, p_interview_version,
    pg_catalog.btrim(p_title), p_questions,
    'link', v_label, 'pending',
    pg_catalog.encode(extensions.digest(v_token, 'sha256'), 'hex'),
    extensions.pgp_sym_encrypt(v_token, public.get_clinical_encryption_key()),
    v_expires, v_uid
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$send_interview_link$;

REVOKE ALL ON FUNCTION public.send_interview_link(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_interview_link(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, TEXT, INTEGER) TO authenticated;

-- Copiar o link de novo (só enquanto está aberto e no prazo).
CREATE OR REPLACE FUNCTION public.get_interview_link(p_response_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $get_interview_link$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.patient_interview_responses;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_row FROM public.patient_interview_responses r WHERE r.id = p_response_id;
  IF NOT FOUND
     OR v_row.channel <> 'link'
     OR NOT public.can_use_patient_interviews(v_row.patient_id, v_row.discipline, v_uid) THEN
    RAISE EXCEPTION 'Envio não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status NOT IN ('pending', 'in_progress') OR v_row.link_expires_at <= pg_catalog.now() THEN
    RAISE EXCEPTION 'Este link já fechou: foi respondido, cancelado ou passou do prazo.' USING ERRCODE = '22023';
  END IF;

  RETURN extensions.pgp_sym_decrypt(v_row.link_token_encrypted, public.get_clinical_encryption_key());
END;
$get_interview_link$;

REVOKE ALL ON FUNCTION public.get_interview_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_interview_link(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_interview_link(p_response_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $cancel_interview_link$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.patient_interview_responses;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_row FROM public.patient_interview_responses r WHERE r.id = p_response_id FOR UPDATE;
  IF NOT FOUND
     OR v_row.channel <> 'link'
     OR NOT public.can_use_patient_interviews(v_row.patient_id, v_row.discipline, v_uid) THEN
    RAISE EXCEPTION 'Envio não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Não foi possível cancelar: a entrevista já foi respondida ou cancelada.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_interview_responses r
     SET status = 'cancelled',
         cancelled_at = timezone('utc', now())
   WHERE r.id = v_row.id;
END;
$cancel_interview_link$;

REVOKE ALL ON FUNCTION public.cancel_interview_link(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_interview_link(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 6. Anular resposta enviada (fica no histórico, marcada)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.void_interview_response(p_response_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $void_interview_response$
DECLARE
  v_uid UUID := auth.uid();
  v_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
  v_row public.patient_interview_responses;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT r.* INTO v_row FROM public.patient_interview_responses r WHERE r.id = p_response_id FOR UPDATE;
  IF NOT FOUND
     OR NOT public.can_use_patient_interviews(v_row.patient_id, v_row.discipline, v_uid)
     OR NOT (v_row.created_by = v_uid OR public.is_clinic_admin(v_uid)) THEN
    RAISE EXCEPTION 'Só quem registrou a entrevista ou a administração pode anular.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status <> 'submitted' OR v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Só dá para anular entrevista respondida e ainda não anulada.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_reason) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'Escreva o motivo da anulação (de 3 a 500 letras).' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_interview_responses r
     SET voided_at = timezone('utc', now()),
         voided_by = v_uid,
         void_reason_encrypted = extensions.pgp_sym_encrypt(v_reason, public.get_clinical_encryption_key())
   WHERE r.id = v_row.id;
END;
$void_interview_response$;

REVOKE ALL ON FUNCTION public.void_interview_response(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_interview_response(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 7. Lista das entrevistas do paciente na área
-- ----------------------------------------------------------
-- Respostas decifradas só das enviadas: link ainda em andamento mostra
-- só o quanto já foi respondido.
CREATE OR REPLACE FUNCTION public.list_patient_interviews(p_patient_id UUID, p_discipline TEXT)
RETURNS TABLE (
  result_id UUID,
  result_interview_id TEXT,
  result_interview_version INTEGER,
  result_title TEXT,
  result_questions JSONB,
  result_channel TEXT,
  result_recipient_label TEXT,
  result_status TEXT,
  result_progress SMALLINT,
  result_answers JSONB,
  result_link_expires_at TIMESTAMPTZ,
  result_created_at TIMESTAMPTZ,
  result_started_at TIMESTAMPTZ,
  result_submitted_at TIMESTAMPTZ,
  result_cancelled_at TIMESTAMPTZ,
  result_created_by UUID,
  result_created_by_name TEXT,
  result_voided_at TIMESTAMPTZ,
  result_voided_by_name TEXT,
  result_void_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_interviews$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND OR NOT public.can_use_patient_interviews(p_patient_id, p_discipline, v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: o paciente não está em atendimento nesta área com você.' USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT r.id, r.interview_id, r.interview_version, r.title, r.questions,
         r.channel, r.recipient_label, r.status, r.progress,
         CASE WHEN r.status = 'submitted' AND r.answers_encrypted IS NOT NULL
           THEN extensions.pgp_sym_decrypt(r.answers_encrypted, v_key)::JSONB
         END,
         r.link_expires_at, r.created_at, r.started_at, r.submitted_at, r.cancelled_at,
         r.created_by, author.full_name::TEXT,
         r.voided_at, voider.full_name::TEXT,
         CASE WHEN r.void_reason_encrypted IS NOT NULL
           THEN extensions.pgp_sym_decrypt(r.void_reason_encrypted, v_key)
         END
  FROM public.patient_interview_responses r
  LEFT JOIN public.profiles author ON author.id = r.created_by
  LEFT JOIN public.profiles voider ON voider.id = r.voided_by
  WHERE r.patient_id = p_patient_id
    AND r.clinic_id = v_clinic
    AND r.discipline = p_discipline
  ORDER BY COALESCE(r.submitted_at, r.created_at) DESC
  LIMIT 200;
END;
$list_patient_interviews$;

REVOKE ALL ON FUNCTION public.list_patient_interviews(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_interviews(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 8. Página do link (só a Edge Function interview-link, service role)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.interview_link_open(p_token_hash TEXT, p_with_answers BOOLEAN DEFAULT TRUE)
RETURNS TABLE (
  result_status TEXT,
  result_id UUID,
  result_title TEXT,
  result_questions JSONB,
  result_answers JSONB,
  result_revision INTEGER,
  result_expires_at TIMESTAMPTZ,
  result_patient_first_name TEXT,
  result_clinic_name TEXT,
  result_clinic_color TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $interview_link_open$
DECLARE
  v_row public.patient_interview_responses;
  v_patient RECORD;
  v_clinic RECORD;
  v_state TEXT;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::JSONB,
      NULL::INTEGER, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT r.* INTO v_row FROM public.patient_interview_responses r WHERE r.link_token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::JSONB,
      NULL::INTEGER, NULL::TIMESTAMPTZ, NULL::TEXT, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;

  SELECT c.name, COALESCE(c.portal_link_color, c.brand_color) AS color INTO v_clinic
  FROM public.clinics c WHERE c.id = v_row.clinic_id;
  SELECT p.name, p.nome_social, p.archived_at, p.erased_at INTO v_patient
  FROM public.patients p WHERE p.id = v_row.patient_id;

  v_state := CASE
    WHEN v_row.status = 'submitted' THEN 'submitted'
    WHEN v_row.status = 'cancelled' THEN 'cancelled'
    WHEN v_patient.archived_at IS NOT NULL OR v_patient.erased_at IS NOT NULL THEN 'cancelled'
    WHEN v_row.link_expires_at <= pg_catalog.now() THEN 'expired'
    ELSE 'ok'
  END;

  IF v_state <> 'ok' THEN
    RETURN QUERY SELECT v_state, NULL::UUID, NULL::TEXT, NULL::JSONB, NULL::JSONB,
      NULL::INTEGER, NULL::TIMESTAMPTZ, NULL::TEXT, v_clinic.name::TEXT, v_clinic.color::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    'ok'::TEXT,
    v_row.id,
    v_row.title,
    v_row.questions,
    CASE WHEN p_with_answers IS TRUE AND v_row.answers_encrypted IS NOT NULL
      THEN extensions.pgp_sym_decrypt(v_row.answers_encrypted, public.get_clinical_encryption_key())::JSONB
      ELSE '{}'::JSONB
    END,
    v_row.revision,
    v_row.link_expires_at,
    pg_catalog.split_part(pg_catalog.btrim(COALESCE(NULLIF(pg_catalog.btrim(v_patient.nome_social), ''), v_patient.name, '')), ' ', 1),
    v_clinic.name::TEXT,
    v_clinic.color::TEXT;
END;
$interview_link_open$;

REVOKE ALL ON FUNCTION public.interview_link_open(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.interview_link_open(TEXT, BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.interview_link_save(
  p_token_hash TEXT,
  p_answers JSONB,
  p_progress INTEGER,
  p_expected_revision INTEGER,
  p_save_id UUID,
  p_submit BOOLEAN
)
RETURNS TABLE (result_status TEXT, result_revision INTEGER, result_response_status TEXT)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $interview_link_save$
DECLARE
  v_row public.patient_interview_responses;
  v_now TIMESTAMPTZ := timezone('utc', now());
  v_revision INTEGER;
  v_status TEXT;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER, NULL::TEXT;
    RETURN;
  END IF;
  IF p_answers IS NULL OR pg_catalog.jsonb_typeof(p_answers) <> 'object'
     OR pg_catalog.octet_length(p_answers::TEXT) > 150000 THEN
    RETURN QUERY SELECT 'invalid'::TEXT, NULL::INTEGER, NULL::TEXT;
    RETURN;
  END IF;

  SELECT r.* INTO v_row
  FROM public.patient_interview_responses r
  WHERE r.link_token_hash = p_token_hash
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::TEXT, NULL::INTEGER, NULL::TEXT;
    RETURN;
  END IF;

  IF p_save_id IS NOT NULL AND v_row.last_save_id = p_save_id THEN
    RETURN QUERY SELECT 'ok'::TEXT, v_row.revision, v_row.status;
    RETURN;
  END IF;

  IF v_row.status NOT IN ('pending', 'in_progress')
     OR EXISTS (
       SELECT 1 FROM public.patients p
       WHERE p.id = v_row.patient_id AND (p.archived_at IS NOT NULL OR p.erased_at IS NOT NULL)
     ) THEN
    RETURN QUERY SELECT 'closed'::TEXT, v_row.revision, v_row.status;
    RETURN;
  END IF;
  IF v_row.link_expires_at <= pg_catalog.now() THEN
    RETURN QUERY SELECT 'expired'::TEXT, v_row.revision, v_row.status;
    RETURN;
  END IF;
  IF p_expected_revision IS NULL OR v_row.revision <> p_expected_revision THEN
    RETURN QUERY SELECT 'conflict'::TEXT, v_row.revision, v_row.status;
    RETURN;
  END IF;

  UPDATE public.patient_interview_responses r
     SET answers_encrypted = extensions.pgp_sym_encrypt(p_answers::TEXT, public.get_clinical_encryption_key()),
         progress = LEAST(GREATEST(COALESCE(p_progress, 0), 0), 100),
         revision = r.revision + 1,
         last_save_id = p_save_id,
         status = CASE WHEN p_submit IS TRUE THEN 'submitted' ELSE 'in_progress' END,
         started_at = COALESCE(r.started_at, v_now),
         last_saved_at = v_now,
         submitted_at = CASE WHEN p_submit IS TRUE THEN v_now ELSE NULL END
   WHERE r.id = v_row.id
  RETURNING r.revision, r.status INTO v_revision, v_status;

  RETURN QUERY SELECT 'ok'::TEXT, v_revision, v_status;
END;
$interview_link_save$;

REVOKE ALL ON FUNCTION public.interview_link_save(TEXT, JSONB, INTEGER, INTEGER, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.interview_link_save(TEXT, JSONB, INTEGER, INTEGER, UUID, BOOLEAN) TO service_role;

-- ----------------------------------------------------------
-- 9. Exclusão de paciente também apaga as entrevistas
-- ----------------------------------------------------------
-- Cópia fiel da versão de 20261009 + a linha do snapshot (sem o token do
-- link, que é credencial) e o DELETE das entrevistas.
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
    'patient_interview_responses', (SELECT coalesce(jsonb_agg(to_jsonb(ir) - 'link_token_hash' - 'link_token_encrypted'), '[]'::jsonb) FROM public.patient_interview_responses ir WHERE ir.patient_id = v_req.patient_id),
    'patient_form_assignments', (SELECT coalesce(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) FROM public.patient_form_assignments fa WHERE fa.patient_id = v_req.patient_id),
    'patient_portal_access', (SELECT coalesce(jsonb_agg(to_jsonb(pa)), '[]'::jsonb) FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id),
    'patient_enrollments', (SELECT coalesce(jsonb_agg(to_jsonb(en)), '[]'::jsonb) FROM public.patient_enrollments en WHERE en.patient_id = v_req.patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.appointments a WHERE a.patient_id = v_req.patient_id),
    'record_shares', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.record_shares s WHERE s.patient_id = v_req.patient_id),
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

  DELETE FROM public.patient_portal_sessions WHERE access_id IN (SELECT pa.id FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id);
  DELETE FROM public.patient_portal_access WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_form_assignments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_interview_responses WHERE patient_id = v_req.patient_id;
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

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  NOT has_table_privilege('authenticated', 'public.patient_interview_responses', 'SELECT') AS sem_leitura_direta,
  NOT has_function_privilege('authenticated', 'public.interview_link_open(text, boolean)', 'EXECUTE') AS link_so_pela_function,
  NOT has_function_privilege('anon', 'public.send_interview_link(uuid, text, text, integer, text, jsonb, text, integer)', 'EXECUTE') AS envio_fechado_para_anon,
  has_function_privilege('authenticated', 'public.list_patient_interviews(uuid, text)', 'EXECUTE') AS lista_para_equipe,
  position('patient_interview_responses' IN pg_get_functiondef('public.admin_decide_patient_deletion(uuid, text, text)'::regprocedure)) > 0 AS exclusao_apaga_entrevistas;
