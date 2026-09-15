-- ============================================================
-- 1. Suspender paciente: pausa reversível, sem revisão nenhuma.
-- Diferente de archived_at (que já dispara pedido de exclusão em
-- revisão): isso só marca "não mostrar como ativo agora", o paciente
-- continua na lista da clínica, só com selo de inativo.
-- ============================================================
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS erased_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_patient_suspended(
  p_patient_id UUID,
  p_suspended BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $set_patient_suspended$
DECLARE
  v_uid UUID := auth.uid();
  v_patient_clinic UUID;
  v_patient_owner UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: usuário sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT clinic_id, therapist_id INTO v_patient_clinic, v_patient_owner
  FROM public.patients
  WHERE id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = 'P0002';
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
    RAISE EXCEPTION 'Acesso negado: somente responsável ou administração da clínica.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
  SET suspended_at = CASE WHEN p_suspended THEN pg_catalog.clock_timestamp() ELSE NULL END
  WHERE id = p_patient_id;
END;
$set_patient_suspended$;

REVOKE ALL ON FUNCTION public.set_patient_suspended(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_patient_suspended(UUID, BOOLEAN) TO authenticated;

-- ============================================================
-- 2. Decisão sobre solicitação de exclusão (a peça que faltava: a
-- solicitação já existia — request_patient_deletion — mas nada
-- decidia/executava). Só clinic_admin/super_admin da clínica da
-- solicitação decide.
--
-- "Executar" aqui NUNCA é DELETE FROM patients: patient_deletion_requests
-- é append-only e tem FK RESTRICT pra patients — apagar a linha do
-- paciente é estruturalmente impossível enquanto essa solicitação
-- existir (e ela não pode ser removida, de propósito). A exclusão real
-- é ANONIMIZAÇÃO: apaga conteúdo clínico (prontuários, evoluções,
-- agenda, matrículas, compartilhamentos, anexos) e limpa todo dado
-- pessoal do cadastro, mantendo só uma linha "carcaça" — é isso que sai
-- das listas pra sempre. Um snapshot completo (o "backup") fica salvo
-- antes de apagar/limpar qualquer coisa.
-- ============================================================
CREATE SCHEMA IF NOT EXISTS patient_erasure_backup;

CREATE TABLE IF NOT EXISTS patient_erasure_backup.snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL,
  request_id UUID NOT NULL,
  erased_by UUID,
  erased_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  snapshot JSONB NOT NULL
);

ALTER TABLE patient_erasure_backup.snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA patient_erasure_backup FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE patient_erasure_backup.snapshots FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_decide_patient_deletion(
  p_request_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_decide_patient_deletion$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.patient_deletion_requests%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req
  FROM public.patient_deletion_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já foi decidida.' USING ERRCODE = '55000';
  END IF;

  IF v_uid IS NULL
     OR NOT (
       public.is_super_admin(v_uid)
       OR (public.is_clinic_admin(v_uid) AND v_req.clinic_id = public.user_clinic_id(v_uid))
     ) THEN
    RAISE EXCEPTION 'Acesso negado: somente administração da clínica decide.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_deletion_requests
  SET status = p_decision,
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;

  IF p_decision = 'rejected' THEN
    -- Volta a ficar visível normalmente: a exclusão foi negada.
    UPDATE public.patients
    SET archived_at = NULL
    WHERE id = v_req.patient_id;
    RETURN;
  END IF;

  -- Aprovado: snapshot completo antes de qualquer exclusão/limpeza.
  SELECT jsonb_build_object(
    'patient', (SELECT to_jsonb(p) FROM public.patients p WHERE p.id = v_req.patient_id),
    'clinical_records', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.clinical_records r WHERE r.patient_id = v_req.patient_id),
    'patient_evolutions', (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM public.patient_evolutions e WHERE e.patient_id = v_req.patient_id),
    'patient_enrollments', (SELECT coalesce(jsonb_agg(to_jsonb(en)), '[]'::jsonb) FROM public.patient_enrollments en WHERE en.patient_id = v_req.patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.appointments a WHERE a.patient_id = v_req.patient_id),
    'record_shares', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.record_shares s WHERE s.patient_id = v_req.patient_id),
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

  DELETE FROM public.patient_attachments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.record_shares WHERE patient_id = v_req.patient_id;
  DELETE FROM public.appointments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_enrollments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_evolutions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.clinical_records WHERE patient_id = v_req.patient_id;

  UPDATE public.patients
  SET name = '[Paciente removido]',
      phone = NULL,
      birth_date = NULL,
      age = NULL,
      cpf = NULL,
      nome_social = NULL,
      nome_mae = NULL,
      nome_pai = NULL,
      nome_conjuge = NULL,
      sexo_biologico = NULL,
      genero = NULL,
      responsavel_nome = NULL,
      responsavel_telefone = NULL,
      responsavel_cpf = NULL,
      convenio_nome = NULL,
      convenio_carteirinha = NULL,
      endereco_cep = NULL,
      endereco_logradouro = NULL,
      endereco_numero = NULL,
      endereco_complemento = NULL,
      endereco_bairro = NULL,
      endereco_cidade = NULL,
      endereco_uf = NULL,
      image_consent = FALSE,
      image_consent_at = NULL,
      has_pending = FALSE,
      suspended_at = NULL,
      archived_at = COALESCE(archived_at, pg_catalog.clock_timestamp()),
      erased_at = pg_catalog.clock_timestamp()
  WHERE id = v_req.patient_id;

  UPDATE public.patient_deletion_requests
  SET status = 'executed',
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;
END;
$admin_decide_patient_deletion$;

REVOKE ALL ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) TO authenticated;

-- Fila de solicitações pendentes, pra alimentar o painel de revisão.
CREATE OR REPLACE FUNCTION public.admin_list_pending_patient_deletions()
RETURNS TABLE (
  request_id UUID,
  patient_id UUID,
  patient_name TEXT,
  reason TEXT,
  requested_at TIMESTAMPTZ,
  requested_by_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_list_pending_patient_deletions$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Acesso negado: somente administração da clínica.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT pdr.id, pdr.patient_id, p.name, pdr.reason, pdr.requested_at, req.full_name
  FROM public.patient_deletion_requests pdr
  JOIN public.patients p ON p.id = pdr.patient_id
  LEFT JOIN public.profiles req ON req.id = pdr.requested_by
  WHERE pdr.status = 'pending'
    AND (public.is_super_admin(v_uid) OR pdr.clinic_id = public.user_clinic_id(v_uid))
  ORDER BY pdr.requested_at ASC;
END;
$admin_list_pending_patient_deletions$;

REVOKE ALL ON FUNCTION public.admin_list_pending_patient_deletions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_patient_deletions() TO authenticated;
