-- ==========================================================
-- Painel do profissional no SuperAdm
-- Metricas nao invasivas + edicao segura de cadastro
-- ==========================================================

ALTER TABLE public.patients
ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

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
  clinic_name TEXT,
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
    p.clinic_name,
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

REVOKE EXECUTE ON FUNCTION public.admin_list_profiles() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_profiles() TO authenticated;

DROP FUNCTION IF EXISTS public.admin_update_profile(
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT
);

CREATE OR REPLACE FUNCTION public.admin_update_profile(
  p_profile_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_document TEXT,
  p_professional_registration TEXT,
  p_specialty TEXT,
  p_clinic_name TEXT,
  p_notes TEXT
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

  SELECT *
    INTO v_previous
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

REVOKE EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_profile(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
