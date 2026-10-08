-- ==========================================================
-- Área do Paciente + Importáveis (formulários online)
--
-- Por quê: a clínica imprime entrevistas, o paciente devolve foto do
-- papel com letra difícil de ler e alguém redigita no Word. Agora a
-- administração monta o formulário (Gestão → Importáveis), envia ao
-- paciente e ele responde pelo celular, na "Área do Paciente".
--
-- Desenho (opção C, escolhida em 06/10/2026):
--   * O paciente NÃO vira usuário do Supabase Auth nem ganha linha em
--     profiles. Toda regra de RLS do sistema parte de "logado = equipe";
--     uma conta de paciente ali dentro cairia em regra feita para a
--     equipe (user_clinic_id() devolveria a clínica inteira).
--   * Entrada = código de acesso (gerado aqui, 32^6 combinações) + data
--     de nascimento do cadastro. Tudo passa pela Edge Function
--     patient-portal (service role), que nunca expõe prontuário: só
--     formulário pendente e as respostas do próprio formulário em aberto.
--   * 8 datas erradas seguidas bloqueiam o código; só a administração
--     libera (portal_set_access_active) ou troca o código.
--   * Respostas são dado clínico: gravadas cifradas com a mesma chave do
--     Vault dos prontuários (get_clinical_encryption_key), com revisão
--     (CAS) e chave de idempotência por salvamento.
--   * Só a administração da clínica (clinic_admin ativo, senha trocada,
--     MFA quando exigido) vê formulários, acessos e respostas.
--   * O envio guarda uma cópia das perguntas: editar o formulário depois
--     não muda o que o paciente já recebeu nem o que ele respondeu.
--
-- Reverter: DROP TABLE patient_portal_sessions, patient_form_assignments,
-- patient_portal_access, patient_forms (nesta ordem) e DROP FUNCTION das
-- funções portal_* e can_manage_patient_portal criadas aqui.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Quem administra a Área do Paciente
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_patient_portal(
  p_clinic UUID,
  p_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_manage_patient_portal$
  SELECT p_clinic IS NOT NULL
    AND public.can_manage_agenda(p_clinic, p_user)
    AND public.is_clinic_admin(p_user)
    AND public.can_access_clinical_data(p_user);
$can_manage_patient_portal$;

REVOKE ALL ON FUNCTION public.can_manage_patient_portal(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_patient_portal(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------
-- 2. Formulários (Importáveis)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT patient_forms_title_check CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  CONSTRAINT patient_forms_description_check CHECK (description IS NULL OR char_length(description) <= 2000),
  CONSTRAINT patient_forms_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT patient_forms_questions_check CHECK (
    jsonb_typeof(questions) = 'array'
    AND jsonb_array_length(questions) <= 200
    AND octet_length(questions::text) <= 200000
  )
);

CREATE INDEX IF NOT EXISTS idx_patient_forms_clinic_updated
  ON public.patient_forms (clinic_id, updated_at DESC);

-- Autoria vem da sessão, nunca do corpo enviado pela tela.
CREATE OR REPLACE FUNCTION public.set_patient_form_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $set_patient_form_audit$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
    NEW.created_at := timezone('utc', now());
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    NEW.clinic_id := OLD.clinic_id;
  END IF;
  NEW.updated_by := auth.uid();
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$set_patient_form_audit$;

REVOKE ALL ON FUNCTION public.set_patient_form_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_patient_forms_audit ON public.patient_forms;
CREATE TRIGGER trg_patient_forms_audit
  BEFORE INSERT OR UPDATE ON public.patient_forms
  FOR EACH ROW EXECUTE FUNCTION public.set_patient_form_audit();

ALTER TABLE public.patient_forms ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_forms FROM anon;

DROP POLICY IF EXISTS patient_forms_select ON public.patient_forms;
CREATE POLICY patient_forms_select ON public.patient_forms
  FOR SELECT TO authenticated
  USING (public.can_manage_patient_portal(clinic_id));

DROP POLICY IF EXISTS patient_forms_insert ON public.patient_forms;
CREATE POLICY patient_forms_insert ON public.patient_forms
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_patient_portal(clinic_id));

DROP POLICY IF EXISTS patient_forms_update ON public.patient_forms;
CREATE POLICY patient_forms_update ON public.patient_forms
  FOR UPDATE TO authenticated
  USING (public.can_manage_patient_portal(clinic_id))
  WITH CHECK (public.can_manage_patient_portal(clinic_id));

DROP POLICY IF EXISTS patient_forms_delete ON public.patient_forms;
CREATE POLICY patient_forms_delete ON public.patient_forms
  FOR DELETE TO authenticated
  USING (public.can_manage_patient_portal(clinic_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_forms TO authenticated;
GRANT SELECT ON public.patient_forms TO service_role;

-- ----------------------------------------------------------
-- 3. Acesso do paciente (um por paciente)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  access_code TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  failed_attempts SMALLINT NOT NULL DEFAULT 0,
  locked_at TIMESTAMPTZ,
  last_access_at TIMESTAMPTZ,
  code_created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT patient_portal_access_patient_key UNIQUE (patient_id),
  CONSTRAINT patient_portal_access_code_key UNIQUE (access_code),
  -- Sem 0/O, 1/I: nada que o paciente confunda ao digitar.
  CONSTRAINT patient_portal_access_code_format CHECK (access_code ~ '^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$'),
  CONSTRAINT patient_portal_access_attempts_check CHECK (failed_attempts BETWEEN 0 AND 100)
);

ALTER TABLE public.patient_portal_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_portal_access FROM anon;
-- Escrita só pelas RPCs abaixo: o código nasce no servidor.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.patient_portal_access FROM authenticated;

DROP POLICY IF EXISTS patient_portal_access_select ON public.patient_portal_access;
CREATE POLICY patient_portal_access_select ON public.patient_portal_access
  FOR SELECT TO authenticated
  USING (public.can_manage_patient_portal(clinic_id));

GRANT SELECT ON public.patient_portal_access TO authenticated;
GRANT SELECT ON public.patient_portal_access TO service_role;

-- ----------------------------------------------------------
-- 4. Sessões da Área do Paciente (só a Edge Function toca)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_portal_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id UUID NOT NULL REFERENCES public.patient_portal_access(id) ON DELETE CASCADE,
  -- SHA-256 do token; o token em si só existe no aparelho do paciente.
  token_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,

  CONSTRAINT patient_portal_sessions_token_key UNIQUE (token_hash),
  CONSTRAINT patient_portal_sessions_token_format CHECK (token_hash ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS idx_patient_portal_sessions_access
  ON public.patient_portal_sessions (access_id);

ALTER TABLE public.patient_portal_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_portal_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.patient_portal_sessions TO service_role;

-- ----------------------------------------------------------
-- 5. Envios (um formulário mandado a um paciente)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  form_id UUID REFERENCES public.patient_forms(id) ON DELETE SET NULL,
  -- Cópia do formulário no momento do envio.
  form_title TEXT NOT NULL,
  form_description TEXT,
  form_questions JSONB NOT NULL,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  progress SMALLINT NOT NULL DEFAULT 0,
  answers_encrypted BYTEA,
  revision INTEGER NOT NULL DEFAULT 0,
  last_save_id UUID,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  started_at TIMESTAMPTZ,
  last_saved_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  CONSTRAINT patient_form_assignments_status_check CHECK (status IN ('pending', 'in_progress', 'submitted', 'cancelled')),
  CONSTRAINT patient_form_assignments_progress_check CHECK (progress BETWEEN 0 AND 100),
  CONSTRAINT patient_form_assignments_submitted_check CHECK ((status = 'submitted') = (submitted_at IS NOT NULL)),
  CONSTRAINT patient_form_assignments_cancelled_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)),
  CONSTRAINT patient_form_assignments_questions_check CHECK (jsonb_typeof(form_questions) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_patient_form_assignments_clinic_created
  ON public.patient_form_assignments (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_form_assignments_patient_status
  ON public.patient_form_assignments (patient_id, status);

ALTER TABLE public.patient_form_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.patient_form_assignments FROM anon;
-- Enviar, cancelar e responder só pelas RPCs; a administração lê e exclui.
REVOKE INSERT, UPDATE ON TABLE public.patient_form_assignments FROM authenticated;

DROP POLICY IF EXISTS patient_form_assignments_select ON public.patient_form_assignments;
CREATE POLICY patient_form_assignments_select ON public.patient_form_assignments
  FOR SELECT TO authenticated
  USING (public.can_manage_patient_portal(clinic_id));

DROP POLICY IF EXISTS patient_form_assignments_delete ON public.patient_form_assignments;
CREATE POLICY patient_form_assignments_delete ON public.patient_form_assignments
  FOR DELETE TO authenticated
  USING (public.can_manage_patient_portal(clinic_id));

GRANT SELECT, DELETE ON public.patient_form_assignments TO authenticated;
GRANT SELECT ON public.patient_form_assignments TO service_role;

-- ----------------------------------------------------------
-- 6. Código de acesso: XXX-XXX, gerado no banco
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_new_access_code()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_new_access_code$
DECLARE
  -- 32 símbolos: byte % 32 não tem viés.
  v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes BYTEA;
  v_code TEXT;
  v_try INTEGER := 0;
BEGIN
  LOOP
    v_try := v_try + 1;
    v_bytes := extensions.gen_random_bytes(6);
    v_code := '';
    FOR v_index IN 0..5 LOOP
      IF v_index = 3 THEN
        v_code := v_code || '-';
      END IF;
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, v_index) % 32) + 1, 1);
    END LOOP;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.patient_portal_access a WHERE a.access_code = v_code
    );

    IF v_try >= 20 THEN
      RAISE EXCEPTION 'Não foi possível gerar um código de acesso único.' USING ERRCODE = '55000';
    END IF;
  END LOOP;

  RETURN v_code;
END;
$portal_new_access_code$;

REVOKE ALL ON FUNCTION public.portal_new_access_code() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 7. RPCs da administração
-- ----------------------------------------------------------

-- Cria o acesso se ainda não existe e devolve a linha.
CREATE OR REPLACE FUNCTION public.portal_ensure_access(p_patient_id UUID)
RETURNS public.patient_portal_access
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_ensure_access$
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

  IF NOT FOUND OR NOT public.can_manage_patient_portal(v_clinic) THEN
    RAISE EXCEPTION 'Paciente não encontrado ou sem permissão.' USING ERRCODE = '42501';
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
$portal_ensure_access$;

-- Novo código: o antigo para na hora e as sessões abertas caem.
CREATE OR REPLACE FUNCTION public.portal_regenerate_code(p_patient_id UUID)
RETURNS public.patient_portal_access
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_regenerate_code$
DECLARE
  v_row public.patient_portal_access;
BEGIN
  SELECT a.* INTO v_row FROM public.patient_portal_access a WHERE a.patient_id = p_patient_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_patient_portal(v_row.clinic_id) THEN
    RAISE EXCEPTION 'Acesso não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_portal_access a
     SET access_code = public.portal_new_access_code(),
         failed_attempts = 0,
         locked_at = NULL,
         code_created_at = timezone('utc', now()),
         updated_at = timezone('utc', now())
   WHERE a.id = v_row.id
  RETURNING a.* INTO v_row;

  DELETE FROM public.patient_portal_sessions s WHERE s.access_id = v_row.id;
  RETURN v_row;
END;
$portal_regenerate_code$;

-- Desativar derruba as sessões; reativar também desbloqueia (zera as
-- tentativas erradas).
CREATE OR REPLACE FUNCTION public.portal_set_access_active(p_patient_id UUID, p_active BOOLEAN)
RETURNS public.patient_portal_access
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_set_access_active$
DECLARE
  v_row public.patient_portal_access;
BEGIN
  SELECT a.* INTO v_row FROM public.patient_portal_access a WHERE a.patient_id = p_patient_id FOR UPDATE;
  IF NOT FOUND OR NOT public.can_manage_patient_portal(v_row.clinic_id) THEN
    RAISE EXCEPTION 'Acesso não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_portal_access a
     SET is_active = COALESCE(p_active, false),
         failed_attempts = CASE WHEN p_active IS TRUE THEN 0 ELSE a.failed_attempts END,
         locked_at = CASE WHEN p_active IS TRUE THEN NULL ELSE a.locked_at END,
         updated_at = timezone('utc', now())
   WHERE a.id = v_row.id
  RETURNING a.* INTO v_row;

  IF p_active IS NOT TRUE THEN
    DELETE FROM public.patient_portal_sessions s WHERE s.access_id = v_row.id;
  END IF;
  RETURN v_row;
END;
$portal_set_access_active$;

-- Envia um formulário publicado; cria o acesso se faltar.
CREATE OR REPLACE FUNCTION public.portal_send_form(
  p_patient_id UUID,
  p_form_id UUID,
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_send_form$
DECLARE
  v_clinic UUID;
  v_form public.patient_forms;
  v_assignment UUID;
BEGIN
  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND OR NOT public.can_manage_patient_portal(v_clinic) THEN
    RAISE EXCEPTION 'Paciente não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_form
    FROM public.patient_forms f
   WHERE f.id = p_form_id
     AND f.clinic_id = v_clinic
     AND f.status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Formulário não encontrado ou ainda não publicado.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_form.questions) = 0 THEN
    RAISE EXCEPTION 'O formulário não tem perguntas.' USING ERRCODE = '22023';
  END IF;
  IF p_due_date IS NOT NULL AND p_due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'O prazo não pode ser uma data passada.' USING ERRCODE = '22023';
  END IF;

  -- Mesma checagem de data de nascimento/arquivado do acesso.
  PERFORM public.portal_ensure_access(p_patient_id);

  INSERT INTO public.patient_form_assignments (
    clinic_id, patient_id, form_id, form_title, form_description, form_questions, due_date, created_by
  )
  VALUES (
    v_clinic, p_patient_id, v_form.id, v_form.title, v_form.description, v_form.questions, p_due_date, auth.uid()
  )
  RETURNING id INTO v_assignment;

  RETURN v_assignment;
END;
$portal_send_form$;

CREATE OR REPLACE FUNCTION public.portal_cancel_assignment(p_assignment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_cancel_assignment$
BEGIN
  UPDATE public.patient_form_assignments f
     SET status = 'cancelled',
         cancelled_at = timezone('utc', now())
   WHERE f.id = p_assignment_id
     AND f.status IN ('pending', 'in_progress')
     AND public.can_manage_patient_portal(f.clinic_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível cancelar: o formulário já foi respondido, cancelado ou não existe.' USING ERRCODE = '22023';
  END IF;
END;
$portal_cancel_assignment$;

-- Respostas abertas (decifradas) para a administração da clínica.
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
    AND public.can_manage_patient_portal(f.clinic_id);
END;
$portal_admin_read_answers$;

REVOKE ALL ON FUNCTION public.portal_ensure_access(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_regenerate_code(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_set_access_active(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_send_form(UUID, UUID, DATE) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_cancel_assignment(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.portal_admin_read_answers(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_ensure_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_regenerate_code(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_set_access_active(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_send_form(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_cancel_assignment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.portal_admin_read_answers(UUID[]) TO authenticated;

-- ----------------------------------------------------------
-- 8. RPCs da Edge Function patient-portal (só service role)
-- ----------------------------------------------------------

-- Entrada: código + data de nascimento. 'ok' cria a sessão com o hash
-- do token gerado pela function. 8 datas erradas seguidas = 'locked'.
CREATE OR REPLACE FUNCTION public.portal_login(
  p_code TEXT,
  p_birth_date DATE,
  p_token_hash TEXT,
  p_ttl_seconds INTEGER
)
RETURNS TABLE (result_status TEXT, result_access_id UUID)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_login$
DECLARE
  c_max_attempts CONSTANT INTEGER := 8;
  v_access public.patient_portal_access;
  v_birth DATE;
  v_archived TIMESTAMPTZ;
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  IF p_code IS NULL OR p_birth_date IS NULL OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN QUERY SELECT 'invalid'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT a.* INTO v_access
    FROM public.patient_portal_access a
   WHERE a.access_code = p_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'invalid'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  IF v_access.locked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'locked'::TEXT, NULL::UUID;
    RETURN;
  END IF;
  IF v_access.is_active IS NOT TRUE THEN
    RETURN QUERY SELECT 'invalid'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  SELECT p.birth_date, p.archived_at INTO v_birth, v_archived
    FROM public.patients p
   WHERE p.id = v_access.patient_id;

  IF v_birth IS NULL OR v_archived IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  IF v_birth <> p_birth_date THEN
    UPDATE public.patient_portal_access a
       SET failed_attempts = LEAST(a.failed_attempts + 1, 100),
           locked_at = CASE WHEN a.failed_attempts + 1 >= c_max_attempts THEN v_now ELSE NULL END,
           updated_at = v_now
     WHERE a.id = v_access.id;

    RETURN QUERY SELECT
      CASE WHEN v_access.failed_attempts + 1 >= c_max_attempts THEN 'locked' ELSE 'invalid' END::TEXT,
      NULL::UUID;
    RETURN;
  END IF;

  UPDATE public.patient_portal_access a
     SET failed_attempts = 0,
         last_access_at = v_now,
         updated_at = v_now
   WHERE a.id = v_access.id;

  DELETE FROM public.patient_portal_sessions s
   WHERE s.access_id = v_access.id
     AND s.expires_at < v_now;

  INSERT INTO public.patient_portal_sessions (access_id, token_hash, expires_at)
  VALUES (
    v_access.id,
    p_token_hash,
    v_now + make_interval(secs => LEAST(GREATEST(COALESCE(p_ttl_seconds, 0), 300), 43200))
  );

  RETURN QUERY SELECT 'ok'::TEXT, v_access.id;
END;
$portal_login$;

-- Sessão válida = não expirou, acesso ativo e sem bloqueio, paciente
-- não arquivado. Devolve nada quando não vale.
CREATE OR REPLACE FUNCTION public.portal_resolve_session(p_token_hash TEXT)
RETURNS TABLE (result_access_id UUID, result_patient_id UUID, result_clinic_id UUID)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_resolve_session$
DECLARE
  v_now TIMESTAMPTZ := timezone('utc', now());
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN;
  END IF;

  UPDATE public.patient_portal_sessions s
     SET last_seen_at = v_now
   WHERE s.token_hash = p_token_hash
     AND s.expires_at > v_now;

  RETURN QUERY
  SELECT a.id, a.patient_id, a.clinic_id
    FROM public.patient_portal_sessions s
    JOIN public.patient_portal_access a ON a.id = s.access_id
    JOIN public.patients p ON p.id = a.patient_id
   WHERE s.token_hash = p_token_hash
     AND s.expires_at > v_now
     AND a.is_active IS TRUE
     AND a.locked_at IS NULL
     AND p.archived_at IS NULL;
END;
$portal_resolve_session$;

-- Respostas salvas de um formulário ainda em aberto, do próprio paciente.
CREATE OR REPLACE FUNCTION public.portal_read_answers(p_access_id UUID, p_assignment_id UUID)
RETURNS TABLE (result_answers JSONB, result_revision INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_read_answers$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN f.answers_encrypted IS NULL THEN '{}'::JSONB
      ELSE extensions.pgp_sym_decrypt(f.answers_encrypted, public.get_clinical_encryption_key())::JSONB
    END,
    f.revision
  FROM public.patient_form_assignments f
  JOIN public.patient_portal_access a
    ON a.patient_id = f.patient_id
   AND a.clinic_id = f.clinic_id
  WHERE a.id = p_access_id
    AND f.id = p_assignment_id
    AND f.status IN ('pending', 'in_progress');
END;
$portal_read_answers$;

-- Salvar/enviar com revisão (CAS) e chave de idempotência: o mesmo
-- p_save_id repetido (resposta perdida no caminho) devolve 'ok' sem
-- gravar de novo; revisão diferente da esperada = 'conflict'.
CREATE OR REPLACE FUNCTION public.portal_save_answers(
  p_access_id UUID,
  p_assignment_id UUID,
  p_answers JSONB,
  p_progress INTEGER,
  p_expected_revision INTEGER,
  p_save_id UUID,
  p_submit BOOLEAN DEFAULT false
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

  RETURN QUERY SELECT 'ok'::TEXT, v_revision, v_status;
END;
$portal_save_answers$;

REVOKE ALL ON FUNCTION public.portal_login(TEXT, DATE, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_resolve_session(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_read_answers(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.portal_save_answers(UUID, UUID, JSONB, INTEGER, INTEGER, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.portal_login(TEXT, DATE, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_resolve_session(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_read_answers(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_save_answers(UUID, UUID, JSONB, INTEGER, INTEGER, UUID, BOOLEAN) TO service_role;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  (SELECT count(*) FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('patient_forms', 'patient_portal_access', 'patient_portal_sessions', 'patient_form_assignments')
      AND rowsecurity) = 4 AS quatro_tabelas_com_rls,
  NOT has_table_privilege('anon', 'public.patient_form_assignments', 'SELECT') AS anon_sem_respostas,
  NOT has_table_privilege('authenticated', 'public.patient_portal_sessions', 'SELECT') AS sessoes_fora_do_app,
  NOT has_table_privilege('authenticated', 'public.patient_form_assignments', 'UPDATE') AS respostas_so_pela_function,
  NOT has_function_privilege('authenticated', 'public.portal_login(text, date, text, integer)', 'EXECUTE') AS login_so_service_role,
  has_function_privilege('authenticated', 'public.portal_send_form(uuid, uuid, date)', 'EXECUTE') AS envio_pela_administracao;
