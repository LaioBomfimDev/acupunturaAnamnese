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
