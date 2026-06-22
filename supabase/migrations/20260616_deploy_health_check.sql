-- ============================================================
-- SuperAdm: painel de saúde de deploy/Supabase
-- Metadados apenas. Não lê linhas de pacientes nem fichas clínicas.
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
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patients'
      AND column_name = 'age'
  ) INTO v_patients_age_exists;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'patients'
      AND column_name = 'archived_at'
  ) INTO v_patients_archived_at_exists;

  SELECT to_regclass('public.clinics') IS NOT NULL
  INTO v_clinics_table_exists;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'clinic_id'
  ) INTO v_profiles_clinic_id_exists;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clinics'
      AND column_name = 'logo_url'
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

  SELECT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'knowledge-atlas-public'
  ) INTO v_atlas_bucket_exists;

  SELECT public
  INTO v_atlas_bucket_public
  FROM storage.buckets
  WHERE id = 'knowledge-atlas-public';

  SELECT COUNT(*)::INTEGER
  INTO v_atlas_write_policy_count
  FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename = 'objects'
    AND cmd IN ('INSERT', 'UPDATE', 'ALL')
    AND (
      COALESCE(qual, '') ILIKE '%knowledge-atlas-public%'
      OR COALESCE(with_check, '') ILIKE '%knowledge-atlas-public%'
    );

  SELECT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'knowledge-source-assets'
  ) INTO v_source_bucket_exists;

  SELECT public
  INTO v_source_bucket_public
  FROM storage.buckets
  WHERE id = 'knowledge-source-assets';

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
        'message', CASE
          WHEN v_patients_age_exists THEN 'Coluna patients.age encontrada.'
          ELSE 'Coluna patients.age ausente.'
        END,
        'correction', CASE
          WHEN v_patients_age_exists THEN NULL
          ELSE 'Execute supabase/migrations/20260522_patient_age_archive.sql.'
        END,
        'details', jsonb_build_object(
          'table', 'public.patients',
          'column', 'age'
        )
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
        'evidence', jsonb_build_object(
          'patients.age', v_patients_age_exists,
          'patients.archived_at', v_patients_archived_at_exists
        )
      ),
      jsonb_build_object(
        'id', '20260612_clinics',
        'recorded', v_recorded_clinics,
        'evidenceOk', v_clinics_table_exists AND v_profiles_clinic_id_exists AND v_admin_set_profile_clinic_exists,
        'evidence', jsonb_build_object(
          'clinics', v_clinics_table_exists,
          'profiles.clinic_id', v_profiles_clinic_id_exists,
          'admin_set_profile_clinic', v_admin_set_profile_clinic_exists
        )
      ),
      jsonb_build_object(
        'id', '20260612_clinics_hardening',
        'recorded', v_recorded_clinics_hardening,
        'evidenceOk', v_clinics_hardening_policy_exists,
        'evidence', jsonb_build_object(
          'clinics_select_assigned_or_super_admin', v_clinics_hardening_policy_exists
        )
      ),
      jsonb_build_object(
        'id', '20260614_clinic_logo',
        'recorded', v_recorded_clinic_logo,
        'evidenceOk', v_clinic_logo_url_exists,
        'evidence', jsonb_build_object(
          'clinics.logo_url', v_clinic_logo_url_exists
        )
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
