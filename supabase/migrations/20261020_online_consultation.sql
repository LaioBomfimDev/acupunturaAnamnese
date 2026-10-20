-- ==========================================================
-- Atendimento online pelo sistema (Psicologia, 20/10/2026)
-- REQUER: 20261016_clinical_interviews (versão de
-- admin_decide_patient_deletion da qual esta parte).
--
-- Por quê: a clínica atende online e quer a consulta dentro do sistema
-- (escolha da usuária: Daily). A sala de vídeo não guarda nada no banco:
-- o nome da sala sai do id do agendamento e quem entra recebe um convite
-- de tempo curto, emitido pela Edge Function online-consultation. Aqui
-- mora só o consentimento do paciente.
--
-- Desenho:
--   * patient_consents guarda cada decisão do paciente, uma linha por
--     decisão (aceitou, recusou, retirou), com a versão do termo e quando.
--     Nunca se edita nem se apaga: a decisão que vale é a mais nova de
--     cada tipo. É prova de quando, não só de que (LGPD).
--   * Tipos: 'teleatendimento' (obrigatório para entrar na consulta
--     online) e 'gravacao_sessao' (opcional; a gravação em si chega numa
--     etapa seguinte, mas a escolha já fica guardada).
--   * Pelo link (source = 'link_paciente') quem decide é o próprio
--     paciente, sem conta: recorded_by fica vazio. Registro feito pela
--     profissional (source = 'profissional') exige quem registrou.
--   * Sem leitura nem escrita direta: só a Edge Function (service role).
--   * A exclusão de paciente apaga os consentimentos (snapshot antes).
--
-- Reverter: recriar admin_decide_patient_deletion a partir de
-- 20261016_clinical_interviews.sql e DROP TABLE public.patient_consents.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.patient_interview_responses') IS NULL
     OR to_regclass('public.patient_portal_access') IS NULL
     OR to_regclass('public.patient_portal_sessions') IS NULL
     OR to_regclass('public.patient_form_assignments') IS NULL
     OR to_regclass('public.patient_instrument_applications') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261006, 20261008, 20261009 e 20261016.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 1. Consentimentos do paciente
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  decision TEXT NOT NULL,
  term_version TEXT NOT NULL,
  source TEXT NOT NULL,
  -- Agendamento em que a decisão foi tomada. Excluir o agendamento não
  -- apaga a prova do consentimento.
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT patient_consents_kind_check
    CHECK (kind IN ('teleatendimento', 'gravacao_sessao')),
  CONSTRAINT patient_consents_decision_check
    CHECK (decision IN ('accepted', 'declined', 'revoked')),
  CONSTRAINT patient_consents_term_version_check
    CHECK (term_version IS NOT NULL AND term_version ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  CONSTRAINT patient_consents_source_check
    CHECK (
      (source = 'link_paciente' AND recorded_by IS NULL)
      OR (source = 'profissional' AND recorded_by IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_patient_consents_patient
  ON public.patient_consents (patient_id, kind, decided_at DESC);

ALTER TABLE public.patient_consents ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: ninguém lê nem grava direto, só a Edge Function.
REVOKE ALL ON TABLE public.patient_consents FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 2. Exclusão de paciente também apaga os consentimentos
-- ----------------------------------------------------------
-- Cópia fiel da versão de 20261016 + a linha do snapshot e o DELETE dos
-- consentimentos.
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
    'patient_instrument_applications', (SELECT coalesce(jsonb_agg(to_jsonb(ia)), '[]'::jsonb) FROM public.patient_instrument_applications ia WHERE ia.patient_id = v_req.patient_id),
    'patient_interview_responses', (SELECT coalesce(jsonb_agg(to_jsonb(ir) - 'link_token_hash' - 'link_token_encrypted'), '[]'::jsonb) FROM public.patient_interview_responses ir WHERE ir.patient_id = v_req.patient_id),
    'patient_form_assignments', (SELECT coalesce(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) FROM public.patient_form_assignments fa WHERE fa.patient_id = v_req.patient_id),
    'patient_portal_access', (SELECT coalesce(jsonb_agg(to_jsonb(pa)), '[]'::jsonb) FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id),
    'patient_consents', (SELECT coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) FROM public.patient_consents pc WHERE pc.patient_id = v_req.patient_id),
    'patient_enrollments', (SELECT coalesce(jsonb_agg(to_jsonb(en)), '[]'::jsonb) FROM public.patient_enrollments en WHERE en.patient_id = v_req.patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.appointments a WHERE a.patient_id = v_req.patient_id),
    'record_shares', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.record_shares s WHERE s.patient_id = v_req.patient_id),
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

  DELETE FROM public.patient_portal_sessions WHERE access_id IN (SELECT pa.id FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id);
  DELETE FROM public.patient_portal_access WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_form_assignments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_interview_responses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_consents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_attachments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.record_shares WHERE patient_id = v_req.patient_id;
  DELETE FROM public.appointments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_enrollments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_evolutions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_instrument_applications WHERE patient_id = v_req.patient_id;
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

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  NOT has_table_privilege('authenticated', 'public.patient_consents', 'SELECT') AS sem_leitura_direta,
  NOT has_table_privilege('anon', 'public.patient_consents', 'INSERT') AS anon_nao_grava,
  position('patient_consents' IN pg_get_functiondef('public.admin_decide_patient_deletion(uuid, text, text)'::regprocedure)) > 0 AS exclusao_apaga_consentimentos;
