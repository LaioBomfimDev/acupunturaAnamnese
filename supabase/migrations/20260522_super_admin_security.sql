-- ==========================================================
-- SuperAdm, primeiro acesso obrigatório e endurecimento de RLS
-- ==========================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS username TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS document TEXT,
ADD COLUMN IF NOT EXISTS professional_registration TEXT,
ADD COLUMN IF NOT EXISTS specialty TEXT,
ADD COLUMN IF NOT EXISTS clinic_name TEXT,
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL;

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
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::text, now());
  RETURN NEW;
END;
$$;

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
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'super_admin'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_clinical_data(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role IN ('therapist', 'super_admin')
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.is_password_change_required(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.must_change_password
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.is_active IS TRUE
  ), TRUE);
$$;

-- profiles: leitura própria ou do SuperAdm; sem UPDATE direto pelo navegador.
DROP POLICY IF EXISTS "Profissionais veem apenas o próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Profissionais editam o próprio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Profiles select self or super admin" ON public.profiles;

CREATE POLICY "Profiles select self or super admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() = id OR public.is_super_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- patients: bloqueia qualquer acesso clínico antes da troca da senha temporária.
DROP POLICY IF EXISTS "Profissional gerencia apenas seus próprios pacientes" ON public.patients;
DROP POLICY IF EXISTS "Patients select own after password change" ON public.patients;
DROP POLICY IF EXISTS "Patients insert own after password change" ON public.patients;
DROP POLICY IF EXISTS "Patients update own after password change" ON public.patients;
DROP POLICY IF EXISTS "Patients delete own after password change" ON public.patients;

CREATE POLICY "Patients select own after password change"
ON public.patients
FOR SELECT
TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Patients insert own after password change"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Patients update own after password change"
ON public.patients
FOR UPDATE
TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()))
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Patients delete own after password change"
ON public.patients
FOR DELETE
TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

-- clinical_records: idem, e ainda isolado por terapeuta.
DROP POLICY IF EXISTS "Profissional gerencia apenas as fichas de seus pacientes" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records select own after password change" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records insert own after password change" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records update own after password change" ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records delete own after password change" ON public.clinical_records;

CREATE POLICY "Clinical records select own after password change"
ON public.clinical_records
FOR SELECT
TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Clinical records insert own after password change"
ON public.clinical_records
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Clinical records update own after password change"
ON public.clinical_records
FOR UPDATE
TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()))
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

CREATE POLICY "Clinical records delete own after password change"
ON public.clinical_records
FOR DELETE
TO authenticated
USING (auth.uid() = therapist_id AND public.can_access_clinical_data(auth.uid()));

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
  clinic_name TEXT,
  notes TEXT,
  is_active BOOLEAN,
  must_change_password BOOLEAN,
  password_changed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode listar usuários.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
    p.clinic_name,
    p.notes,
    p.is_active,
    p.must_change_password,
    p.password_changed_at,
    p.created_by,
    p.created_at,
    p.updated_at
  FROM public.profiles p
  ORDER BY
    CASE WHEN p.role = 'super_admin' THEN 0 ELSE 1 END,
    p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_profile_active(
  p_profile_id UUID,
  p_is_active BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID;
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

  UPDATE public.profiles
  SET is_active = p_is_active
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.'
      USING ERRCODE = '02000';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_profiles() FROM anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_profile_active(UUID, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_active(UUID, BOOLEAN) TO authenticated;

-- Recria as RPCs clínicas para bloquear acesso enquanto a senha temporária não for trocada.
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

CREATE OR REPLACE FUNCTION public.delete_clinical_record(
  p_record_id UUID
)
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
