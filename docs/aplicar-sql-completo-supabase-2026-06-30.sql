-- ============================================================
-- SISTEMA ACUP — SQL COMPLETO DE ATUALIZACAO SUPABASE
-- Data: 2026-06-30
--
-- Uso: colar no SQL Editor do Supabase e executar.
--
-- Escopo deste pacote:
--   - SuperAdm / primeiro acesso / auditoria
--   - pacientes: idade e arquivamento
--   - clinicas, logo e vinculo com profissional
--   - Storage privado de fotos da lingua
--   - Storage/manifesto de fontes protegidas e Atlas publico
--   - RPC "Saude do deploy"
--   - profissao do profissional
--   - tabelas de correcoes e instrucoes da IA
--
-- Pre-requisito: schema base do app ja existe:
--   public.profiles, public.patients, public.clinical_records,
--   public.app_config e extensao pgcrypto/app_config de criptografia.
--
-- Importante:
--   - SQL NAO configura secrets da Vertex. Configure nas Edge Functions:
--       GCP_SERVICE_ACCOUNT_JSON
--       GCP_LOCATION
--       SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEYS
--       SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEYS
--   - Depois deste SQL, reimplante as Edge Functions:
--       suggest-marks, clinical-reasoning, draft-narrative, library-qa,
--       analyze-tongue, knowledge-source-asset-url e funcoes SuperAdm.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1) PERFIS, SUPERADM, PRIMEIRO ACESSO E RLS CLINICO
-- ============================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'therapist',
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS document TEXT,
ADD COLUMN IF NOT EXISTS professional_registration TEXT,
ADD COLUMN IF NOT EXISTS specialty TEXT,
ADD COLUMN IF NOT EXISTS profession TEXT,
ADD COLUMN IF NOT EXISTS clinic_name TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

UPDATE public.profiles
SET role = COALESCE(NULLIF(role, ''), 'therapist')
WHERE role IS NULL OR role = '';

WITH username_candidates AS (
  SELECT
    id,
    lower(split_part(email, '@', 1)) AS username,
    count(*) OVER (PARTITION BY lower(split_part(email, '@', 1))) AS username_count
  FROM public.profiles
  WHERE username IS NULL
    AND email IS NOT NULL
)
UPDATE public.profiles p
SET username = c.username
FROM username_candidates c
WHERE p.id = c.id
  AND c.username <> ''
  AND c.username_count = 1;

WITH ranked_usernames AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY lower(username) ORDER BY created_at, id) AS rn
  FROM public.profiles
  WHERE username IS NOT NULL
)
UPDATE public.profiles p
SET username = NULL
FROM ranked_usernames r
WHERE p.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
ON public.profiles (lower(username))
WHERE username IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('therapist', 'super_admin'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $touch_updated_at$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$touch_updated_at$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE PROCEDURE public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $handle_new_user$
DECLARE
  v_username TEXT;
BEGIN
  v_username := lower(nullif(trim(new.raw_user_meta_data->>'username'), ''));

  IF v_username IS NULL THEN
    v_username := lower(split_part(new.email, '@', 1));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.username) = v_username
  ) THEN
    v_username := NULL;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, username, role)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    v_username,
    'therapist'
  )
  ON CONFLICT (id) DO UPDATE
  SET email = EXCLUDED.email,
      full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
      username = COALESCE(public.profiles.username, EXCLUDED.username);

  RETURN new;
END;
$handle_new_user$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $is_super_admin$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'super_admin'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$is_super_admin$;

CREATE OR REPLACE FUNCTION public.can_access_clinical_data(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $can_access_clinical_data$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role IN ('therapist', 'super_admin')
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$can_access_clinical_data$;

CREATE OR REPLACE FUNCTION public.is_password_change_required(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $is_password_change_required$
  SELECT COALESCE((
    SELECT p.must_change_password
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.is_active IS TRUE
  ), TRUE);
$is_password_change_required$;

ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS age INTEGER,
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

DROP POLICY IF EXISTS "Profissionais veem apenas o próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Profissionais editam o próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select self or super admin" ON public.profiles;
CREATE POLICY "Profiles select self or super admin"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR public.is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "Profissional gerencia apenas seus próprios pacientes" ON public.patients;
DROP POLICY IF EXISTS "Patients select own after password change" ON public.patients;
DROP POLICY IF EXISTS "Patients insert own after password change" ON public.patients;
DROP POLICY IF EXISTS "Patients update own after password change" ON public.patients;
DROP POLICY IF EXISTS "Patients delete own after password change" ON public.patients;

CREATE POLICY "Patients select own after password change"
ON public.patients FOR SELECT TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Patients insert own after password change"
ON public.patients FOR INSERT TO authenticated
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Patients update own after password change"
ON public.patients FOR UPDATE TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()))
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Patients delete own after password change"
ON public.patients FOR DELETE TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

DROP POLICY IF EXISTS "Profissional gerencia apenas as fichas de seus pacientes" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records select own after password change" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records insert own after password change" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records update own after password change" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records delete own after password change" ON public.clinical_records;

CREATE POLICY "Clinical records select own after password change"
ON public.clinical_records FOR SELECT TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Clinical records insert own after password change"
ON public.clinical_records FOR INSERT TO authenticated
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Clinical records update own after password change"
ON public.clinical_records FOR UPDATE TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()))
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Clinical records delete own after password change"
ON public.clinical_records FOR DELETE TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

-- ============================================================
-- 2) RPCS CLINICAS COM GATE DE SENHA/USUARIO ATIVO
-- ============================================================

CREATE OR REPLACE FUNCTION public.insert_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $insert_clinical_record$
DECLARE
  v_id UUID;
  v_therapist_id UUID;
  v_key TEXT;
BEGIN
  v_therapist_id := auth.uid();

  IF v_therapist_id IS NULL OR NOT public.can_access_clinical_data(v_therapist_id) THEN
    RAISE EXCEPTION 'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT ac.value INTO v_key
  FROM public.app_config ac
  WHERE ac.key = 'encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: paciente não pertence ao profissional autenticado.';
  END IF;

  INSERT INTO public.clinical_records (
    patient_id,
    therapist_id,
    record_type,
    sensitive_data_encrypted
  ) VALUES (
    p_patient_id,
    v_therapist_id,
    p_record_type,
    pgp_sym_encrypt(p_data, v_key)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$insert_clinical_record$;

CREATE OR REPLACE FUNCTION public.get_clinical_records(
  p_patient_id UUID,
  p_record_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
  sensitive_data TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $get_clinical_records$
DECLARE
  v_therapist_id UUID;
  v_key TEXT;
BEGIN
  v_therapist_id := auth.uid();

  IF v_therapist_id IS NULL OR NOT public.can_access_clinical_data(v_therapist_id) THEN
    RAISE EXCEPTION 'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT ac.value INTO v_key
  FROM public.app_config ac
  WHERE ac.key = 'encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: paciente não pertence ao profissional autenticado.';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT AS sensitive_data,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = v_therapist_id
    AND (p_record_type IS NULL OR cr.record_type = p_record_type)
  ORDER BY cr.created_at DESC;
END;
$get_clinical_records$;

CREATE OR REPLACE FUNCTION public.update_clinical_record(
  p_record_id UUID,
  p_data TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $update_clinical_record$
DECLARE
  v_therapist_id UUID;
  v_key TEXT;
BEGIN
  v_therapist_id := auth.uid();

  IF v_therapist_id IS NULL OR NOT public.can_access_clinical_data(v_therapist_id) THEN
    RAISE EXCEPTION 'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT ac.value INTO v_key
  FROM public.app_config ac
  WHERE ac.key = 'encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinical_records cr
    WHERE cr.id = p_record_id
      AND cr.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: ficha não pertence ao profissional autenticado.';
  END IF;

  UPDATE public.clinical_records
  SET sensitive_data_encrypted = pgp_sym_encrypt(p_data, v_key),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_record_id
    AND therapist_id = v_therapist_id;
END;
$update_clinical_record$;

CREATE OR REPLACE FUNCTION public.delete_clinical_record(p_record_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $delete_clinical_record$
DECLARE
  v_therapist_id UUID;
BEGIN
  v_therapist_id := auth.uid();

  IF v_therapist_id IS NULL OR NOT public.can_access_clinical_data(v_therapist_id) THEN
    RAISE EXCEPTION 'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinical_records cr
    WHERE cr.id = p_record_id
      AND cr.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: ficha não pertence ao profissional autenticado.';
  END IF;

  DELETE FROM public.clinical_records
  WHERE id = p_record_id
    AND therapist_id = v_therapist_id;
END;
$delete_clinical_record$;

REVOKE EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_clinical_record(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_clinical_record(UUID) TO authenticated;

-- ============================================================
-- 3) AUDITORIA SUPERADM E PAINEL DE PROFISSIONAIS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx
ON public.admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_actor_id_idx
ON public.admin_audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_id_idx
ON public.admin_audit_logs (target_id);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_audit_logs FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_audit_logs(p_limit INTEGER DEFAULT 60)
RETURNS TABLE (
  id UUID,
  actor_id UUID,
  actor_name TEXT,
  actor_email TEXT,
  target_id UUID,
  target_name TEXT,
  target_email TEXT,
  action TEXT,
  details JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_list_audit_logs$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode ver auditoria.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.actor_id,
    actor.full_name AS actor_name,
    actor.email AS actor_email,
    l.target_id,
    target_profile.full_name AS target_name,
    target_profile.email AS target_email,
    l.action,
    l.details,
    l.created_at
  FROM public.admin_audit_logs l
  LEFT JOIN public.profiles actor ON actor.id = l.actor_id
  LEFT JOIN public.profiles target_profile ON target_profile.id = l.target_id
  ORDER BY l.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);
END;
$admin_list_audit_logs$;

DROP FUNCTION IF EXISTS public.admin_list_profiles();
CREATE OR REPLACE FUNCTION public.admin_list_profiles()
RETURNS TABLE (
  id UUID,
  email TEXT,
  username TEXT,
  full_name TEXT,
  role TEXT,
  phone TEXT,
  document TEXT,
  professional_registration TEXT,
  specialty TEXT,
  profession TEXT,
  clinic_name TEXT,
  clinic_id UUID,
  notes TEXT,
  is_active BOOLEAN,
  must_change_password BOOLEAN,
  password_changed_at TIMESTAMPTZ,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  patient_count BIGINT,
  active_patient_count BIGINT,
  archived_patient_count BIGINT,
  clinical_record_count BIGINT,
  last_patient_created_at TIMESTAMPTZ,
  last_record_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_list_profiles$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode listar usuários.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH patient_stats AS (
    SELECT
      p.therapist_id,
      COUNT(*)::BIGINT AS patient_count,
      COUNT(*) FILTER (WHERE p.archived_at IS NULL)::BIGINT AS active_patient_count,
      COUNT(*) FILTER (WHERE p.archived_at IS NOT NULL)::BIGINT AS archived_patient_count,
      MAX(p.created_at) AS last_patient_created_at
    FROM public.patients p
    GROUP BY p.therapist_id
  ),
  record_stats AS (
    SELECT
      cr.therapist_id,
      COUNT(*)::BIGINT AS clinical_record_count,
      MAX(cr.updated_at) AS last_record_at
    FROM public.clinical_records cr
    GROUP BY cr.therapist_id
  )
  SELECT
    p.id,
    p.email,
    p.username,
    p.full_name,
    p.role,
    p.phone,
    p.document,
    p.professional_registration,
    p.specialty,
    p.profession,
    p.clinic_name,
    p.clinic_id,
    p.notes,
    p.is_active,
    p.must_change_password,
    p.password_changed_at,
    p.created_by,
    creator.full_name AS created_by_name,
    p.created_at,
    p.updated_at,
    COALESCE(ps.patient_count, 0)::BIGINT AS patient_count,
    COALESCE(ps.active_patient_count, 0)::BIGINT AS active_patient_count,
    COALESCE(ps.archived_patient_count, 0)::BIGINT AS archived_patient_count,
    COALESCE(rs.clinical_record_count, 0)::BIGINT AS clinical_record_count,
    ps.last_patient_created_at,
    rs.last_record_at
  FROM public.profiles p
  LEFT JOIN public.profiles creator ON creator.id = p.created_by
  LEFT JOIN patient_stats ps ON ps.therapist_id = p.id
  LEFT JOIN record_stats rs ON rs.therapist_id = p.id
  ORDER BY
    CASE WHEN p.role = 'super_admin' THEN 0 ELSE 1 END,
    p.created_at DESC;
END;
$admin_list_profiles$;

DROP FUNCTION IF EXISTS public.admin_update_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_profile_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_document TEXT,
  p_professional_registration TEXT,
  p_specialty TEXT,
  p_clinic_name TEXT,
  p_notes TEXT,
  p_profession TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_update_profile$
DECLARE
  v_actor_id UUID;
  v_previous public.profiles%ROWTYPE;
  v_next public.profiles%ROWTYPE;
  v_updated_fields TEXT[];
BEGIN
  v_actor_id := auth.uid();

  IF NOT public.is_super_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode editar cadastro.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_full_name), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o nome completo do profissional.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_previous
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.'
      USING ERRCODE = '02000';
  END IF;

  IF v_previous.role = 'super_admin' AND p_profile_id <> v_actor_id THEN
    RAISE EXCEPTION 'Cadastro de SuperAdm não pode ser alterado por outro perfil.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    full_name = NULLIF(BTRIM(p_full_name), ''),
    phone = NULLIF(BTRIM(p_phone), ''),
    document = NULLIF(BTRIM(p_document), ''),
    professional_registration = NULLIF(BTRIM(p_professional_registration), ''),
    specialty = NULLIF(BTRIM(p_specialty), ''),
    profession = NULLIF(BTRIM(p_profession), ''),
    clinic_name = NULLIF(BTRIM(p_clinic_name), ''),
    notes = NULLIF(BTRIM(p_notes), ''),
    updated_at = timezone('utc'::text, now())
  WHERE id = p_profile_id
  RETURNING * INTO v_next;

  v_updated_fields := ARRAY_REMOVE(ARRAY[
    CASE WHEN v_previous.full_name IS DISTINCT FROM v_next.full_name THEN 'full_name' END,
    CASE WHEN v_previous.phone IS DISTINCT FROM v_next.phone THEN 'phone' END,
    CASE WHEN v_previous.document IS DISTINCT FROM v_next.document THEN 'document' END,
    CASE WHEN v_previous.professional_registration IS DISTINCT FROM v_next.professional_registration THEN 'professional_registration' END,
    CASE WHEN v_previous.specialty IS DISTINCT FROM v_next.specialty THEN 'specialty' END,
    CASE WHEN v_previous.profession IS DISTINCT FROM v_next.profession THEN 'profession' END,
    CASE WHEN v_previous.clinic_name IS DISTINCT FROM v_next.clinic_name THEN 'clinic_name' END,
    CASE WHEN v_previous.notes IS DISTINCT FROM v_next.notes THEN 'notes' END
  ], NULL);

  IF COALESCE(ARRAY_LENGTH(v_updated_fields, 1), 0) > 0 THEN
    INSERT INTO public.admin_audit_logs (actor_id, target_id, action, details)
    VALUES (
      v_actor_id,
      p_profile_id,
      'profile_updated',
      jsonb_build_object('updated_fields', to_jsonb(v_updated_fields))
    );
  END IF;
END;
$admin_update_profile$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_active(
  p_profile_id UUID,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_set_profile_active$
DECLARE
  v_actor_id UUID;
  v_previous_active BOOLEAN;
BEGIN
  v_actor_id := auth.uid();

  IF NOT public.is_super_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode alterar status.'
      USING ERRCODE = '42501';
  END IF;

  IF p_profile_id = v_actor_id AND p_is_active IS FALSE THEN
    RAISE EXCEPTION 'O SuperAdm não pode suspender o próprio acesso.'
      USING ERRCODE = '22023';
  END IF;

  SELECT is_active INTO v_previous_active
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.'
      USING ERRCODE = '02000';
  END IF;

  UPDATE public.profiles
  SET is_active = p_is_active
  WHERE id = p_profile_id;

  INSERT INTO public.admin_audit_logs (actor_id, target_id, action, details)
  VALUES (
    v_actor_id,
    p_profile_id,
    CASE WHEN p_is_active THEN 'profile_reactivated' ELSE 'profile_suspended' END,
    jsonb_build_object('previous_active', v_previous_active, 'next_active', p_is_active)
  );
END;
$admin_set_profile_active$;

REVOKE EXECUTE ON FUNCTION public.admin_list_audit_logs(INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_list_profiles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_active(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_audit_logs(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_active(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- 4) CLINICAS, LOGO E VINCULO COM PERFIS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clinics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  cnpj TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  brand_color TEXT NOT NULL DEFAULT '#0E2A4A',
  logo_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.clinics
ADD COLUMN IF NOT EXISTS logo_url TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_clinic_id ON public.profiles(clinic_id);

CREATE OR REPLACE FUNCTION public.set_clinics_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $set_clinics_updated_at$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$set_clinics_updated_at$;

DROP TRIGGER IF EXISTS trg_clinics_updated_at ON public.clinics;
CREATE TRIGGER trg_clinics_updated_at
BEFORE UPDATE ON public.clinics
FOR EACH ROW EXECUTE FUNCTION public.set_clinics_updated_at();

ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinics_select_authenticated ON public.clinics;
DROP POLICY IF EXISTS clinics_select_assigned_or_super_admin ON public.clinics;
CREATE POLICY clinics_select_assigned_or_super_admin ON public.clinics
FOR SELECT TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.clinic_id = clinics.id
      AND public.can_access_clinical_data(auth.uid())
  )
);

DROP POLICY IF EXISTS clinics_admin_insert ON public.clinics;
CREATE POLICY clinics_admin_insert ON public.clinics
FOR INSERT TO authenticated
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS clinics_admin_update ON public.clinics;
CREATE POLICY clinics_admin_update ON public.clinics
FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS clinics_admin_delete ON public.clinics;
CREATE POLICY clinics_admin_delete ON public.clinics
FOR DELETE TO authenticated
USING (public.is_super_admin(auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinics TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_profile_clinic(
  p_profile_id UUID,
  p_clinic_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_set_profile_clinic$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas super administradores.'
      USING ERRCODE = '42501';
  END IF;

  IF p_clinic_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.clinics c WHERE c.id = p_clinic_id) THEN
    RAISE EXCEPTION 'Clínica não encontrada.'
      USING ERRCODE = '23503';
  END IF;

  UPDATE public.profiles
  SET clinic_id = p_clinic_id,
      updated_at = NOW()
  WHERE id = p_profile_id;
END;
$admin_set_profile_clinic$;

REVOKE EXECUTE ON FUNCTION public.admin_set_profile_clinic(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_clinic(UUID, UUID) TO authenticated;

-- ============================================================
-- 5) STORAGE: FOTOS DE LINGUA, FONTES PROTEGIDAS E ATLAS PUBLICO
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-tongue-photos',
  'clinical-tongue-photos',
  false,
  5242880,
  ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Terapeuta envia fotos de língua na própria pasta" ON storage.objects;
CREATE POLICY "Terapeuta envia fotos de língua na própria pasta"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'clinical-tongue-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Terapeuta lê fotos de língua da própria pasta" ON storage.objects;
CREATE POLICY "Terapeuta lê fotos de língua da própria pasta"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'clinical-tongue-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Terapeuta remove fotos de língua da própria pasta" ON storage.objects;
CREATE POLICY "Terapeuta remove fotos de língua da própria pasta"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'clinical-tongue-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-source-assets',
  'knowledge-source-assets',
  false,
  52428800,
  ARRAY['application/json', 'text/plain', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.knowledge_source_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key TEXT NOT NULL UNIQUE,
  bucket_id TEXT NOT NULL DEFAULT 'knowledge-source-assets',
  object_path TEXT NOT NULL,
  asset_kind TEXT NOT NULL DEFAULT 'other',
  source_key TEXT,
  mime_type TEXT NOT NULL,
  byte_size BIGINT,
  checksum_sha256 TEXT,
  pdf_page INTEGER,
  title TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT knowledge_source_assets_bucket_check
    CHECK (bucket_id = 'knowledge-source-assets'),
  CONSTRAINT knowledge_source_assets_kind_check
    CHECK (asset_kind IN ('manifest', 'source_page', 'source_text', 'source_pdf', 'other')),
  CONSTRAINT knowledge_source_assets_asset_key_safe_check
    CHECK (
      length(asset_key) BETWEEN 1 AND 260
      AND asset_key ~ '^[a-z0-9][a-z0-9._/-]*$'
      AND asset_key !~ '(^/|\\.\\.|//|\\\\)'
    ),
  CONSTRAINT knowledge_source_assets_object_path_safe_check
    CHECK (
      length(object_path) BETWEEN 1 AND 512
      AND object_path ~ '^[a-z0-9][a-z0-9._/-]*$'
      AND object_path !~ '(^/|\\.\\.|//|\\\\)'
    ),
  CONSTRAINT knowledge_source_assets_pdf_page_check
    CHECK (pdf_page IS NULL OR pdf_page > 0),
  CONSTRAINT knowledge_source_assets_byte_size_check
    CHECK (byte_size IS NULL OR byte_size >= 0)
);

CREATE INDEX IF NOT EXISTS knowledge_source_assets_kind_active_idx
ON public.knowledge_source_assets (asset_kind, is_active);

CREATE INDEX IF NOT EXISTS knowledge_source_assets_source_page_idx
ON public.knowledge_source_assets (source_key, pdf_page)
WHERE source_key IS NOT NULL;

DROP TRIGGER IF EXISTS knowledge_source_assets_touch_updated_at ON public.knowledge_source_assets;
CREATE TRIGGER knowledge_source_assets_touch_updated_at
BEFORE UPDATE ON public.knowledge_source_assets
FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

ALTER TABLE public.knowledge_source_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdm le manifesto de fontes visuais" ON public.knowledge_source_assets;
CREATE POLICY "SuperAdm le manifesto de fontes visuais"
ON public.knowledge_source_assets FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "SuperAdm gerencia manifesto de fontes visuais" ON public.knowledge_source_assets;
CREATE POLICY "SuperAdm gerencia manifesto de fontes visuais"
ON public.knowledge_source_assets FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

REVOKE ALL ON public.knowledge_source_assets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_source_assets TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-atlas-public',
  'knowledge-atlas-public',
  true,
  52428800,
  ARRAY['image/webp', 'application/json', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Intencionalmente sem policy de escrita para knowledge-source-assets e
-- knowledge-atlas-public em storage.objects. Upload/assinatura devem ocorrer
-- por service role ou Edge Function protegida.

-- ============================================================
-- 6) CORRECOES E INSTRUCOES DA IA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surface TEXT NOT NULL,
  model_version TEXT,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  correction_text TEXT NOT NULL,
  correction_structured JSONB,
  reason TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_label TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ai_corrections_surface_check
    CHECK (surface IN ('tongue', 'anamnese_marks', 'clinical_reasoning', 'narrative', 'library_qa')),
  CONSTRAINT ai_corrections_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT ai_corrections_correction_text_len_check
    CHECK (length(correction_text) BETWEEN 1 AND 4000),
  CONSTRAINT ai_corrections_reason_len_check
    CHECK (reason IS NULL OR length(reason) <= 4000)
);

CREATE INDEX IF NOT EXISTS ai_corrections_surface_status_idx
ON public.ai_corrections (surface, approval_status);
CREATE INDEX IF NOT EXISTS ai_corrections_author_surface_idx
ON public.ai_corrections (author_id, surface);
CREATE INDEX IF NOT EXISTS ai_corrections_created_idx
ON public.ai_corrections (created_at DESC);

DROP TRIGGER IF EXISTS ai_corrections_touch_updated_at ON public.ai_corrections;
CREATE TRIGGER ai_corrections_touch_updated_at
BEFORE UPDATE ON public.ai_corrections
FOR EACH ROW EXECUTE PROCEDURE public.touch_updated_at();

ALTER TABLE public.ai_corrections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_corrections insert own" ON public.ai_corrections;
CREATE POLICY "ai_corrections insert own"
ON public.ai_corrections FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.can_access_clinical_data(auth.uid())
);

DROP POLICY IF EXISTS "ai_corrections select own or approved" ON public.ai_corrections;
CREATE POLICY "ai_corrections select own or approved"
ON public.ai_corrections FOR SELECT TO authenticated
USING (
  author_id = auth.uid()
  OR approval_status = 'approved'
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "ai_corrections update super admin" ON public.ai_corrections;
CREATE POLICY "ai_corrections update super admin"
ON public.ai_corrections FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "ai_corrections delete super admin or own pending" ON public.ai_corrections;
CREATE POLICY "ai_corrections delete super admin or own pending"
ON public.ai_corrections FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (author_id = auth.uid() AND approval_status = 'pending')
);

REVOKE ALL ON public.ai_corrections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_corrections TO authenticated;

CREATE TABLE IF NOT EXISTS public.ai_instructions (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ai_instructions_key_check
    CHECK (key ~ '^[a-z0-9][a-z0-9._-]{1,60}$'),
  CONSTRAINT ai_instructions_content_len_check
    CHECK (char_length(content) <= 8000)
);

CREATE TABLE IF NOT EXISTS public.ai_instruction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_by_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS ai_instruction_versions_key_idx
ON public.ai_instruction_versions (key, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_save_ai_instructions(
  p_key TEXT,
  p_content TEXT
)
RETURNS public.ai_instructions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_save_ai_instructions$
DECLARE
  v_actor UUID := auth.uid();
  v_label TEXT;
  v_row public.ai_instructions;
BEGIN
  IF NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode editar instruções da IA.'
      USING ERRCODE = '42501';
  END IF;

  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9._-]{1,60}$' THEN
    RAISE EXCEPTION 'Chave de instrução inválida.' USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(p_content, '')) > 8000 THEN
    RAISE EXCEPTION 'Instrução excede o limite de 8000 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_label FROM public.profiles WHERE id = v_actor;

  INSERT INTO public.ai_instructions AS ai (key, content, version, updated_by, updated_at)
  VALUES (p_key, COALESCE(p_content, ''), 1, v_actor, timezone('utc'::text, now()))
  ON CONFLICT (key) DO UPDATE
    SET content = EXCLUDED.content,
        version = ai.version + 1,
        updated_by = v_actor,
        updated_at = timezone('utc'::text, now())
  RETURNING * INTO v_row;

  INSERT INTO public.ai_instruction_versions
    (key, content, version, is_active, edited_by, edited_by_label)
  VALUES
    (v_row.key, v_row.content, v_row.version, v_row.is_active, v_actor, v_label);

  RETURN v_row;
END;
$admin_save_ai_instructions$;

ALTER TABLE public.ai_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_instruction_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdm lê instruções da IA" ON public.ai_instructions;
CREATE POLICY "SuperAdm lê instruções da IA"
ON public.ai_instructions FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "SuperAdm lê histórico de instruções" ON public.ai_instruction_versions;
CREATE POLICY "SuperAdm lê histórico de instruções"
ON public.ai_instruction_versions FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

REVOKE ALL ON public.ai_instructions FROM anon;
REVOKE ALL ON public.ai_instruction_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_instructions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_instruction_versions FROM authenticated;
GRANT SELECT ON public.ai_instructions TO authenticated;
GRANT SELECT ON public.ai_instruction_versions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_save_ai_instructions(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_save_ai_instructions(TEXT, TEXT) TO authenticated;

-- ============================================================
-- 7) SAUDE DO DEPLOY — RPC DE METADADOS
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_deploy_health_check()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_deploy_health_check$
DECLARE
  v_patients_age_exists BOOLEAN;
  v_patients_archived_at_exists BOOLEAN;
  v_clinics_table_exists BOOLEAN;
  v_profiles_clinic_id_exists BOOLEAN;
  v_clinic_logo_url_exists BOOLEAN;
  v_admin_set_profile_clinic_exists BOOLEAN;
  v_clinics_hardening_policy_exists BOOLEAN;
  v_atlas_bucket_exists BOOLEAN;
  v_atlas_bucket_public BOOLEAN;
  v_atlas_write_policy_count INTEGER;
  v_source_bucket_exists BOOLEAN;
  v_source_bucket_public BOOLEAN;
  v_source_assets_table_exists BOOLEAN;
  v_source_assets_rls_enabled BOOLEAN;
  v_migrations_table_available BOOLEAN;
  v_recorded_patient_age BOOLEAN;
  v_recorded_clinics BOOLEAN;
  v_recorded_clinics_hardening BOOLEAN;
  v_recorded_clinic_logo BOOLEAN;
  v_recorded_source_assets BOOLEAN;
  v_recorded_atlas_public BOOLEAN;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode verificar saúde do deploy.'
      USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'age'
  ) INTO v_patients_age_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'archived_at'
  ) INTO v_patients_archived_at_exists;

  SELECT to_regclass('public.clinics') IS NOT NULL INTO v_clinics_table_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'clinic_id'
  ) INTO v_profiles_clinic_id_exists;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinics' AND column_name = 'logo_url'
  ) INTO v_clinic_logo_url_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_set_profile_clinic'
  ) INTO v_admin_set_profile_clinic_exists;

  SELECT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'clinics'
      AND policyname = 'clinics_select_assigned_or_super_admin'
  ) INTO v_clinics_hardening_policy_exists;

  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'knowledge-atlas-public')
  INTO v_atlas_bucket_exists;

  SELECT public INTO v_atlas_bucket_public
  FROM storage.buckets WHERE id = 'knowledge-atlas-public';

  SELECT COUNT(*)::INTEGER INTO v_atlas_write_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND cmd IN ('INSERT', 'UPDATE', 'ALL')
    AND (
      COALESCE(qual, '') ILIKE '%knowledge-atlas-public%'
      OR COALESCE(with_check, '') ILIKE '%knowledge-atlas-public%'
    );

  SELECT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'knowledge-source-assets')
  INTO v_source_bucket_exists;

  SELECT public INTO v_source_bucket_public
  FROM storage.buckets WHERE id = 'knowledge-source-assets';

  SELECT to_regclass('public.knowledge_source_assets') IS NOT NULL
  INTO v_source_assets_table_exists;

  SELECT COALESCE(c.relrowsecurity, FALSE)
  INTO v_source_assets_rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'knowledge_source_assets';

  v_migrations_table_available := to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;

  IF v_migrations_table_available THEN
    EXECUTE $migration_status$
      SELECT
        EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text ILIKE '20260522%'),
        EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text ILIKE '%20260612%clinics%' OR version::text ILIKE '20260612%'),
        EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text ILIKE '%clinics_hardening%' OR version::text ILIKE '%hardening%'),
        EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text ILIKE '%20260614%clinic_logo%' OR version::text ILIKE '20260614%'),
        EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text ILIKE '%20260615%knowledge_source_assets%' OR version::text ILIKE '%source_assets%'),
        EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version::text ILIKE '%20260615%knowledge_atlas_public_bucket%' OR version::text ILIKE '%atlas_public%')
    $migration_status$
    INTO
      v_recorded_patient_age,
      v_recorded_clinics,
      v_recorded_clinics_hardening,
      v_recorded_clinic_logo,
      v_recorded_source_assets,
      v_recorded_atlas_public;
  END IF;

  RETURN jsonb_build_object(
    'checkedAt', timezone('utc'::text, now()),
    'migrationsTableAvailable', v_migrations_table_available,
    'checks', jsonb_build_object(
      'patientsAgeColumn', jsonb_build_object(
        'ok', v_patients_age_exists,
        'message', CASE WHEN v_patients_age_exists THEN 'Coluna patients.age encontrada.' ELSE 'Coluna patients.age ausente.' END,
        'correction', CASE WHEN v_patients_age_exists THEN NULL ELSE 'Execute supabase/migrations/20260522_patient_age_archive.sql.' END,
        'details', jsonb_build_object('table', 'public.patients', 'column', 'age')
      ),
      'publicAtlasBucket', jsonb_build_object(
        'ok', v_atlas_bucket_exists AND v_atlas_bucket_public IS TRUE AND v_atlas_write_policy_count = 0,
        'message', CASE
          WHEN NOT v_atlas_bucket_exists THEN 'Bucket knowledge-atlas-public não encontrado.'
          WHEN v_atlas_bucket_public IS NOT TRUE THEN 'Bucket knowledge-atlas-public não está público.'
          WHEN v_atlas_write_policy_count > 0 THEN 'Bucket público do Atlas tem policy de escrita customizada.'
          ELSE 'Bucket público do Atlas está configurado como leitura pública sem policy de escrita customizada.'
        END,
        'correction', CASE
          WHEN NOT v_atlas_bucket_exists OR v_atlas_bucket_public IS NOT TRUE THEN 'Execute 20260615_knowledge_atlas_public_bucket.sql.'
          WHEN v_atlas_write_policy_count > 0 THEN 'Remova policies de INSERT/UPDATE/ALL para knowledge-atlas-public em storage.objects.'
          ELSE NULL
        END,
        'details', jsonb_build_object(
          'bucket', 'knowledge-atlas-public',
          'exists', v_atlas_bucket_exists,
          'public', COALESCE(v_atlas_bucket_public, FALSE),
          'customWritePolicies', v_atlas_write_policy_count
        )
      ),
      'knowledgeSourceAssets', jsonb_build_object(
        'ok', v_source_bucket_exists
          AND COALESCE(v_source_bucket_public, TRUE) IS FALSE
          AND v_source_assets_table_exists
          AND COALESCE(v_source_assets_rls_enabled, FALSE),
        'message', CASE
          WHEN NOT v_source_bucket_exists THEN 'Bucket privado knowledge-source-assets não encontrado.'
          WHEN COALESCE(v_source_bucket_public, TRUE) IS TRUE THEN 'Bucket knowledge-source-assets deve ser privado.'
          WHEN NOT v_source_assets_table_exists THEN 'Tabela knowledge_source_assets não encontrada.'
          WHEN NOT COALESCE(v_source_assets_rls_enabled, FALSE) THEN 'RLS de knowledge_source_assets não está habilitado.'
          ELSE 'Fontes privadas com bucket privado, manifesto e RLS disponíveis.'
        END,
        'correction', CASE
          WHEN v_source_bucket_exists
            AND COALESCE(v_source_bucket_public, TRUE) IS FALSE
            AND v_source_assets_table_exists
            AND COALESCE(v_source_assets_rls_enabled, FALSE) THEN NULL
          ELSE 'Execute 20260615_knowledge_source_assets.sql e sincronize o manifesto privado.'
        END,
        'details', jsonb_build_object(
          'bucket', 'knowledge-source-assets',
          'bucketExists', v_source_bucket_exists,
          'bucketPublic', COALESCE(v_source_bucket_public, TRUE),
          'tableExists', v_source_assets_table_exists,
          'rlsEnabled', COALESCE(v_source_assets_rls_enabled, FALSE)
        )
      ),
      'clinicsSchema', jsonb_build_object(
        'ok', v_clinics_table_exists
          AND v_profiles_clinic_id_exists
          AND v_admin_set_profile_clinic_exists
          AND v_clinics_hardening_policy_exists
          AND v_clinic_logo_url_exists,
        'message', CASE
          WHEN NOT v_clinics_table_exists THEN 'Tabela clinics não encontrada.'
          WHEN NOT v_profiles_clinic_id_exists THEN 'Coluna profiles.clinic_id ausente.'
          WHEN NOT v_admin_set_profile_clinic_exists THEN 'RPC admin_set_profile_clinic ausente.'
          WHEN NOT v_clinics_hardening_policy_exists THEN 'Policy clinics_select_assigned_or_super_admin ausente.'
          WHEN NOT v_clinic_logo_url_exists THEN 'Coluna clinics.logo_url ausente.'
          ELSE 'Schema de clínicas e hardening encontrados.'
        END,
        'correction', CASE
          WHEN v_clinics_table_exists
            AND v_profiles_clinic_id_exists
            AND v_admin_set_profile_clinic_exists
            AND v_clinics_hardening_policy_exists
            AND v_clinic_logo_url_exists THEN NULL
          ELSE 'Execute as migrations 20260612_clinics.sql, 20260612_clinics_hardening.sql e 20260614_clinic_logo.sql.'
        END,
        'details', jsonb_build_object(
          'clinicsTable', v_clinics_table_exists,
          'profilesClinicId', v_profiles_clinic_id_exists,
          'adminSetProfileClinic', v_admin_set_profile_clinic_exists,
          'hardeningPolicy', v_clinics_hardening_policy_exists,
          'clinicLogoUrl', v_clinic_logo_url_exists
        )
      )
    ),
    'criticalMigrations', jsonb_build_array(
      jsonb_build_object(
        'id', '20260522_patient_age_archive',
        'recorded', v_recorded_patient_age,
        'evidenceOk', v_patients_age_exists AND v_patients_archived_at_exists,
        'evidence', jsonb_build_object('patients.age', v_patients_age_exists, 'patients.archived_at', v_patients_archived_at_exists)
      ),
      jsonb_build_object(
        'id', '20260612_clinics',
        'recorded', v_recorded_clinics,
        'evidenceOk', v_clinics_table_exists AND v_profiles_clinic_id_exists AND v_admin_set_profile_clinic_exists,
        'evidence', jsonb_build_object('clinics', v_clinics_table_exists, 'profiles.clinic_id', v_profiles_clinic_id_exists, 'admin_set_profile_clinic', v_admin_set_profile_clinic_exists)
      ),
      jsonb_build_object(
        'id', '20260612_clinics_hardening',
        'recorded', v_recorded_clinics_hardening,
        'evidenceOk', v_clinics_hardening_policy_exists,
        'evidence', jsonb_build_object('clinics_select_assigned_or_super_admin', v_clinics_hardening_policy_exists)
      ),
      jsonb_build_object(
        'id', '20260614_clinic_logo',
        'recorded', v_recorded_clinic_logo,
        'evidenceOk', v_clinic_logo_url_exists,
        'evidence', jsonb_build_object('clinics.logo_url', v_clinic_logo_url_exists)
      ),
      jsonb_build_object(
        'id', '20260615_knowledge_source_assets',
        'recorded', v_recorded_source_assets,
        'evidenceOk', v_source_bucket_exists
          AND COALESCE(v_source_bucket_public, TRUE) IS FALSE
          AND v_source_assets_table_exists
          AND COALESCE(v_source_assets_rls_enabled, FALSE),
        'evidence', jsonb_build_object(
          'knowledge-source-assets private bucket', v_source_bucket_exists AND COALESCE(v_source_bucket_public, TRUE) IS FALSE,
          'knowledge_source_assets table', v_source_assets_table_exists,
          'knowledge_source_assets RLS', COALESCE(v_source_assets_rls_enabled, FALSE)
        )
      ),
      jsonb_build_object(
        'id', '20260615_knowledge_atlas_public_bucket',
        'recorded', v_recorded_atlas_public,
        'evidenceOk', v_atlas_bucket_exists AND v_atlas_bucket_public IS TRUE AND v_atlas_write_policy_count = 0,
        'evidence', jsonb_build_object(
          'knowledge-atlas-public bucket', v_atlas_bucket_exists,
          'public', COALESCE(v_atlas_bucket_public, FALSE),
          'customWritePolicies', v_atlas_write_policy_count
        )
      )
    )
  );
END;
$admin_deploy_health_check$;

REVOKE EXECUTE ON FUNCTION public.admin_deploy_health_check() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_deploy_health_check() TO authenticated;

-- ============================================================
-- 8) CONFERENCIA RAPIDA SEM LER DADOS CLINICOS
-- ============================================================

SELECT
  'ok: sql aplicado; confira agora o painel SuperAdm > Saude do deploy' AS resultado,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'age'
  ) AS patients_age,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'clinics'
  ) AS clinics,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'knowledge_source_assets'
  ) AS knowledge_source_assets,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_corrections'
  ) AS ai_corrections,
  EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE specific_schema = 'public' AND routine_name = 'admin_deploy_health_check'
  ) AS admin_deploy_health_check;
