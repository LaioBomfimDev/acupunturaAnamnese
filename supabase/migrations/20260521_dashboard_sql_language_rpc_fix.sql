-- ==========================================================
-- Versao mais simples para o Supabase SQL Editor.
-- Usa LANGUAGE sql em vez de plpgsql: sem DECLARE, sem BEGIN,
-- sem IF e sem dollar-quoted strings.
-- ==========================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.app_config (key, value)
SELECT 'encryption_key', 'acup-reability-mtc-2026-seguro'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'encryption_key'
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_config FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.insert_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS '
  INSERT INTO public.clinical_records (
    patient_id,
    therapist_id,
    record_type,
    sensitive_data_encrypted
  )
  SELECT
    p_patient_id,
    auth.uid(),
    p_record_type,
    pgp_sym_encrypt(p_data, ac.value)
  FROM public.app_config ac
  WHERE ac.key = ''encryption_key''
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = p_patient_id
        AND p.therapist_id = auth.uid()
    )
  RETURNING id;
';

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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS '
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    pgp_sym_decrypt(cr.sensitive_data_encrypted, ac.value)::TEXT AS sensitive_data,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  JOIN public.app_config ac ON ac.key = ''encryption_key''
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = p_patient_id
        AND p.therapist_id = auth.uid()
    )
    AND (p_record_type IS NULL OR cr.record_type = p_record_type)
  ORDER BY cr.created_at DESC;
';

CREATE OR REPLACE FUNCTION public.update_clinical_record(
  p_record_id UUID,
  p_data TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS '
  UPDATE public.clinical_records cr
  SET sensitive_data_encrypted = pgp_sym_encrypt(p_data, ac.value),
      updated_at = timezone(''utc''::text, now())
  FROM public.app_config ac
  WHERE ac.key = ''encryption_key''
    AND cr.id = p_record_id
    AND cr.therapist_id = auth.uid();
';

CREATE OR REPLACE FUNCTION public.delete_clinical_record(
  p_record_id UUID
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS '
  DELETE FROM public.clinical_records cr
  WHERE cr.id = p_record_id
    AND cr.therapist_id = auth.uid();
';

REVOKE EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_clinical_record(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_clinical_record(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
