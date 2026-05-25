REVOKE EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_clinical_record(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_clinical_record(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
