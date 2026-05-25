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
