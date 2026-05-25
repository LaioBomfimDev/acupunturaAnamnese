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
