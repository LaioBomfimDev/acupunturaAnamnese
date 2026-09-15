-- ============================================================
-- Correção: request_patient_deletion (20260723) exigia
-- v_patient_clinic = user_clinic_id(v_uid) mesmo pra super_admin — e
-- super_admin não tem clinic_id (é NULL por definição), então a
-- comparação nunca era verdadeira e a função negava acesso pra
-- QUALQUER super_admin, em qualquer clínica. Mesmo bug que corrigi
-- agora em set_patient_suspended/admin_decide_patient_deletion antes
-- de aplicar — aqui só replica o fix pra função já em produção.
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_patient_deletion(
  p_patient_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  request_id UUID,
  status TEXT,
  requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $request_patient_deletion$
DECLARE
  v_uid UUID := auth.uid();
  v_patient_clinic UUID;
  v_patient_owner UUID;
  v_request public.patient_deletion_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: usuário sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_reason), '') IS NULL
     OR char_length(BTRIM(p_reason)) < 10
     OR char_length(BTRIM(p_reason)) > 4000 THEN
    RAISE EXCEPTION
      'Motivo deve ter entre 10 e 4.000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.clinic_id, p.therapist_id
  INTO v_patient_clinic, v_patient_owner
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_patient_owner <> v_uid
     AND NOT (
       public.is_super_admin(v_uid)
       OR (
         public.is_clinic_admin(v_uid)
         AND v_patient_clinic IS NOT NULL
         AND v_patient_clinic = public.user_clinic_id(v_uid)
       )
     ) THEN
    RAISE EXCEPTION
      'Acesso negado: somente responsável ou administração da clínica.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'patient-deletion-request:' || p_patient_id::TEXT,
      0
    )
  );

  -- Arquivamento recuperável e idempotente: retira o paciente das listas
  -- ativas sem apagar prontuário, fotos, auditoria ou vínculos.
  UPDATE public.patients p
  SET archived_at = pg_catalog.clock_timestamp()
  WHERE p.id = p_patient_id
    AND p.archived_at IS NULL;

  SELECT pdr.*
  INTO v_request
  FROM public.patient_deletion_requests pdr
  WHERE pdr.patient_id = p_patient_id
    AND pdr.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.patient_deletion_requests (
      patient_id,
      clinic_id,
      requested_by,
      reason
    )
    VALUES (
      p_patient_id,
      v_patient_clinic,
      v_uid,
      BTRIM(p_reason)
    )
    RETURNING * INTO v_request;
  END IF;

  RETURN QUERY
  SELECT v_request.id, v_request.status, v_request.requested_at;
END;
$request_patient_deletion$;
