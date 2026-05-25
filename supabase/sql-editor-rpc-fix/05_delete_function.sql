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
