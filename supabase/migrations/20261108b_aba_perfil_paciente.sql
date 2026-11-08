-- ACUP-004: perfil ABA do paciente, somente SQL/RPC.
-- REQUER: 20261108_aba_plano_versionado.sql (última exclusão de paciente),
-- 20261108a_aba_plano_ajustes.sql e os gates/cifra de 20261101b_aba_coleta.sql.
-- Aplicar em transação. RLS ligada, sem policy, acesso apenas pelas duas RPCs.
-- Reverter funcionalmente: revogar EXECUTE de aba_save_profile, manter tabela,
-- leitura e exclusão atualizadas para preservar os registros; reaplicar reativa.
-- Não apagar dados nem restaurar exclusão antiga enquanto houver perfil salvo.
--
-- Contrato: get retorna NULL quando ainda não há perfil, ou metadados + campos
-- decifrados. save exige revision (0 cria) e client_event_id UUID por ação;
-- retorna {patient_id, revision, client_event_id}, sem conteúdo clínico.
-- Replay do último evento retorna os mesmos metadados, antes do CAS, sem gravar
-- nem trocar updated_by/updated_at. Evento anterior com revisão velha = 40001.
-- Campos omitidos preservam o gravado; null limpa diagnosis/details. clinic_id,
-- patient_id e updated_by do payload nunca escolhem a clínica, o paciente ou ator.
-- diagnosis é NULL ou {text, source, issued_on: AAAA-MM-DD}, com texto e fonte
-- obrigatórios; CID, se constar do laudo, fica dentro de text. O objeto inteiro
-- vai para diagnosis_encrypted. details é texto, só em details_encrypted.
-- Não sugere/inventa diagnóstico; não grava texto clínico em coluna clara/log.

DO $requires$
BEGIN
  IF to_regclass('public.aba_plan_versions') IS NULL
     OR to_regclass('public.aba_program_revisions') IS NULL
     OR to_regclass('patient_erasure_backup.snapshots') IS NULL
     OR to_regprocedure('public.aba_require_patient(uuid,boolean)') IS NULL
     OR to_regprocedure('public.aba_encrypt(text)') IS NULL
     OR to_regprocedure('public.aba_decrypt_json(bytea,text)') IS NULL
     OR to_regprocedure('public.aba_decrypt_text(bytea,text)') IS NULL
     OR to_regprocedure('public.admin_decide_patient_deletion(uuid,text,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name='aba_plan_versions' AND column_name='submitted_by') THEN
    RAISE EXCEPTION 'ABA: aplique antes coleta, plano versionado e ajustes do plano (20261108a).';
  END IF;
END;
$requires$;

CREATE TABLE IF NOT EXISTS public.aba_patient_profiles (
  patient_id UUID PRIMARY KEY REFERENCES public.patients(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  communication_mode TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  support_level TEXT NOT NULL DEFAULT 'nao_informado'
    CHECK (support_level IN ('1', '2', '3', 'nao_informado')),
  diagnosis_encrypted BYTEA,
  details_encrypted BYTEA,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  client_event_id UUID NOT NULL,
  updated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT aba_patient_profiles_communication_check CHECK (
    CASE WHEN COALESCE(array_ndims(communication_mode), 1) = 1 THEN
      communication_mode <@ ARRAY['vocal','pecs','caa_alta','caa_baixa','sinais','gestos','misto']::TEXT[]
      AND array_position(communication_mode, NULL) IS NULL
      AND cardinality(communication_mode) = (
        CASE WHEN 'vocal' = ANY(communication_mode) THEN 1 ELSE 0 END +
        CASE WHEN 'pecs' = ANY(communication_mode) THEN 1 ELSE 0 END +
        CASE WHEN 'caa_alta' = ANY(communication_mode) THEN 1 ELSE 0 END +
        CASE WHEN 'caa_baixa' = ANY(communication_mode) THEN 1 ELSE 0 END +
        CASE WHEN 'sinais' = ANY(communication_mode) THEN 1 ELSE 0 END +
        CASE WHEN 'gestos' = ANY(communication_mode) THEN 1 ELSE 0 END +
        CASE WHEN 'misto' = ANY(communication_mode) THEN 1 ELSE 0 END
      )
    ELSE FALSE END
  )
);

DO $protect$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['aba_patient_profiles']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END;
$protect$;

CREATE OR REPLACE FUNCTION public.aba_get_profile(p_patient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_get_profile$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_profile public.aba_patient_profiles%ROWTYPE;
  v_key TEXT;
BEGIN
  SELECT * INTO v_profile FROM public.aba_patient_profiles
  WHERE patient_id = p_patient_id AND clinic_id = public.user_clinic_id(v_uid);
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_key := public.get_clinical_encryption_key();
  RETURN (to_jsonb(v_profile) - 'diagnosis_encrypted' - 'details_encrypted') || jsonb_build_object(
    'diagnosis', CASE WHEN v_profile.diagnosis_encrypted IS NULL THEN NULL::JSONB
      ELSE public.aba_decrypt_json(v_profile.diagnosis_encrypted, v_key) END,
    'details', public.aba_decrypt_text(v_profile.details_encrypted, v_key)
  );
END;
$aba_get_profile$;

CREATE OR REPLACE FUNCTION public.aba_save_profile(p_patient_id UUID, p_profile JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_profile$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, TRUE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_existing public.aba_patient_profiles%ROWTYPE;
  v_saved public.aba_patient_profiles%ROWTYPE;
  v_revision BIGINT;
  v_event UUID;
  v_modes TEXT[];
  v_support TEXT;
  v_diagnosis BYTEA;
  v_details BYTEA;
  v_report JSONB;
  v_report_date DATE;
BEGIN
  IF p_profile IS NULL OR jsonb_typeof(p_profile) <> 'object' THEN
    RAISE EXCEPTION 'Perfil inválido.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_revision := (p_profile ->> 'revision')::BIGINT;
    v_event := (p_profile ->> 'client_event_id')::UUID;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Informe revisão e evento válidos para o perfil.' USING ERRCODE = '22023';
  END;
  IF v_revision IS NULL OR v_revision < 0 OR v_event IS NULL THEN
    RAISE EXCEPTION 'Informe revisão e evento do perfil.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_existing FROM public.aba_patient_profiles WHERE patient_id = p_patient_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.clinic_id <> v_clinic THEN
      RAISE EXCEPTION 'Perfil de outra instituição.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.client_event_id = v_event THEN
      RETURN jsonb_build_object('patient_id', v_existing.patient_id, 'revision', v_existing.revision, 'client_event_id', v_existing.client_event_id);
    END IF;
    IF v_existing.revision <> v_revision THEN
      RAISE EXCEPTION 'Perfil alterado por outra pessoa. Recarregue antes de salvar.' USING ERRCODE = '40001';
    END IF;
  ELSIF v_revision <> 0 THEN
    RAISE EXCEPTION 'Perfil inexistente: a revisão inicial é zero.' USING ERRCODE = '40001';
  END IF;

  v_modes := COALESCE(v_existing.communication_mode, '{}'::TEXT[]);
  IF p_profile ? 'communication_mode' THEN
    IF jsonb_typeof(p_profile -> 'communication_mode') <> 'array' THEN
      RAISE EXCEPTION 'Comunicação precisa ser uma lista de códigos.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_profile -> 'communication_mode') > 7 OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_profile -> 'communication_mode') AS item
      WHERE jsonb_typeof(item) <> 'string'
    ) THEN
      RAISE EXCEPTION 'Comunicação aceita somente os códigos previstos, sem repetição.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(array_agg(item), '{}'::TEXT[]) INTO v_modes
    FROM jsonb_array_elements_text(p_profile -> 'communication_mode') AS item;
  END IF;
  v_support := CASE WHEN p_profile ? 'support_level' THEN p_profile ->> 'support_level'
    ELSE COALESCE(v_existing.support_level, 'nao_informado') END;

  v_diagnosis := v_existing.diagnosis_encrypted;
  IF p_profile ? 'diagnosis' THEN
    v_report := p_profile -> 'diagnosis';
    IF v_report = 'null'::JSONB THEN
      v_diagnosis := NULL;
    ELSE
      IF jsonb_typeof(v_report) <> 'object' THEN
        RAISE EXCEPTION 'Diagnóstico deve vir de laudo, com texto, fonte e data.' USING ERRCODE = '22023';
      END IF;
      IF (v_report - ARRAY['text','source','issued_on']) <> '{}'::JSONB
         OR jsonb_typeof(v_report -> 'text') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_report -> 'source') IS DISTINCT FROM 'string'
         OR jsonb_typeof(v_report -> 'issued_on') IS DISTINCT FROM 'string'
         OR NULLIF(btrim(v_report ->> 'text'), '') IS NULL
         OR NULLIF(btrim(v_report ->> 'source'), '') IS NULL
         OR char_length(v_report ->> 'text') > 6000
         OR char_length(v_report ->> 'source') > 1000 THEN
        RAISE EXCEPTION 'Laudo exige texto (até 6000 caracteres), fonte (até 1000) e data.' USING ERRCODE = '22023';
      END IF;
      IF (v_report ->> 'issued_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Informe a data do laudo no formato AAAA-MM-DD.' USING ERRCODE = '22023';
      END IF;
      BEGIN
        v_report_date := (v_report ->> 'issued_on')::DATE;
      EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
        RAISE EXCEPTION 'Data do laudo inválida.' USING ERRCODE = '22023';
      END;
      v_diagnosis := public.aba_encrypt(jsonb_build_object(
        'text', btrim(v_report ->> 'text'), 'source', btrim(v_report ->> 'source'), 'issued_on', v_report_date
      )::TEXT);
    END IF;
  END IF;
  v_details := v_existing.details_encrypted;
  IF p_profile ? 'details' THEN
    IF jsonb_typeof(p_profile -> 'details') NOT IN ('string', 'null')
       OR char_length(p_profile ->> 'details') > 12000 THEN
      RAISE EXCEPTION 'Detalhes precisam ser texto de até 12000 caracteres.' USING ERRCODE = '22023';
    END IF;
    v_details := public.aba_encrypt(public.aba_clean_text(p_profile ->> 'details', 12000));
  END IF;

  IF v_existing.patient_id IS NULL THEN
    INSERT INTO public.aba_patient_profiles (
      patient_id, clinic_id, communication_mode, support_level, diagnosis_encrypted,
      details_encrypted, client_event_id, updated_by
    ) VALUES (p_patient_id, v_clinic, v_modes, v_support, v_diagnosis, v_details, v_event, auth.uid())
    RETURNING * INTO v_saved;
  ELSE
    UPDATE public.aba_patient_profiles AS profile
    SET communication_mode = v_modes, support_level = v_support, diagnosis_encrypted = v_diagnosis,
      details_encrypted = v_details, revision = profile.revision + 1, client_event_id = v_event,
      updated_by = auth.uid(), updated_at = clock_timestamp()
    WHERE profile.patient_id = p_patient_id AND profile.clinic_id = v_clinic
    RETURNING * INTO v_saved;
  END IF;
  RETURN jsonb_build_object('patient_id', v_saved.patient_id, 'revision', v_saved.revision, 'client_event_id', v_saved.client_event_id);
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Perfil inválido: confira comunicação e nível de suporte.' USING ERRCODE = '22023';
END;
$aba_save_profile$;

REVOKE ALL ON FUNCTION public.aba_get_profile(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_profile(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_get_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_profile(UUID, JSONB) TO authenticated;

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
    'patient_coverages', (SELECT coalesce(jsonb_agg(to_jsonb(cv)), '[]'::jsonb) FROM public.patient_coverages cv WHERE cv.patient_id = v_req.patient_id),
    'patient_enrollments', (SELECT coalesce(jsonb_agg(to_jsonb(en)), '[]'::jsonb) FROM public.patient_enrollments en WHERE en.patient_id = v_req.patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.appointments a WHERE a.patient_id = v_req.patient_id),
    'record_shares', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.record_shares s WHERE s.patient_id = v_req.patient_id),
    'aba_alerts', (SELECT coalesce(jsonb_agg(to_jsonb(aal)), '[]'::jsonb) FROM public.aba_alerts aal WHERE aal.patient_id = v_req.patient_id),
    'aba_ioa_records', (SELECT coalesce(jsonb_agg(to_jsonb(aio)), '[]'::jsonb) FROM public.aba_ioa_records aio WHERE aio.patient_id = v_req.patient_id),
    'aba_session_fidelity', (SELECT coalesce(jsonb_agg(to_jsonb(asf)), '[]'::jsonb) FROM public.aba_session_fidelity asf WHERE asf.patient_id = v_req.patient_id),
    'aba_session_reviews', (SELECT coalesce(jsonb_agg(to_jsonb(asr)), '[]'::jsonb) FROM public.aba_session_reviews asr WHERE asr.patient_id = v_req.patient_id),
    'aba_risk_incidents', (SELECT coalesce(jsonb_agg(to_jsonb(ari)), '[]'::jsonb) FROM public.aba_risk_incidents ari WHERE ari.patient_id = v_req.patient_id),
    'aba_behavior_events', (SELECT coalesce(jsonb_agg(to_jsonb(abe)), '[]'::jsonb) FROM public.aba_behavior_events abe WHERE abe.patient_id = v_req.patient_id),
    'aba_reinforcer_uses', (SELECT coalesce(jsonb_agg(to_jsonb(aru)), '[]'::jsonb) FROM public.aba_reinforcer_uses aru WHERE aru.patient_id = v_req.patient_id),
    'aba_session_pauses', (SELECT coalesce(jsonb_agg(to_jsonb(asp)), '[]'::jsonb) FROM public.aba_session_pauses asp WHERE asp.patient_id = v_req.patient_id),
    'aba_trial_records', (SELECT coalesce(jsonb_agg(to_jsonb(atr)), '[]'::jsonb) FROM public.aba_trial_records atr WHERE atr.patient_id = v_req.patient_id),
    'aba_reduction_measurements', (SELECT coalesce(jsonb_agg(to_jsonb(arm)), '[]'::jsonb) FROM public.aba_reduction_measurements arm WHERE arm.patient_id = v_req.patient_id),
    'aba_session_programs', (SELECT coalesce(jsonb_agg(to_jsonb(aspg)), '[]'::jsonb) FROM public.aba_session_programs aspg WHERE aspg.patient_id = v_req.patient_id),
    'aba_sessions', (SELECT coalesce(jsonb_agg(to_jsonb(ases)), '[]'::jsonb) FROM public.aba_sessions ases WHERE ases.patient_id = v_req.patient_id),
    'aba_patient_profiles', (SELECT coalesce(jsonb_agg(to_jsonb(app)), '[]'::jsonb) FROM public.aba_patient_profiles app WHERE app.patient_id = v_req.patient_id),
    'aba_plan_versions', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.aba_plan_versions x WHERE x.patient_id = v_req.patient_id),
    'aba_program_revisions', (SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) FROM public.aba_program_revisions x WHERE x.patient_id = v_req.patient_id),
    'aba_programs', (SELECT coalesce(jsonb_agg(to_jsonb(aprg)), '[]'::jsonb) FROM public.aba_programs aprg WHERE aprg.patient_id = v_req.patient_id),
    'aba_interfering_behaviors', (SELECT coalesce(jsonb_agg(to_jsonb(aib)), '[]'::jsonb) FROM public.aba_interfering_behaviors aib WHERE aib.patient_id = v_req.patient_id),
    'aba_reinforcers', (SELECT coalesce(jsonb_agg(to_jsonb(arf)), '[]'::jsonb) FROM public.aba_reinforcers arf WHERE arf.patient_id = v_req.patient_id),
    'aba_callouts', (SELECT coalesce(jsonb_agg(to_jsonb(aco)), '[]'::jsonb) FROM public.aba_callouts aco WHERE aco.patient_id = v_req.patient_id),
    'aba_patient_teams', (SELECT coalesce(jsonb_agg(to_jsonb(apt)), '[]'::jsonb) FROM public.aba_patient_teams apt WHERE apt.patient_id = v_req.patient_id),
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

  -- ABA (20261101b): filhas antes das mães; o programa sai antes do
  -- comportamento (procedimento restrito aponta para ele).
  -- 20261101c: alertas, IOA e fidelidade saem antes das sessões e programas.
  DELETE FROM public.aba_alerts WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_ioa_records WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_fidelity WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_reviews WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_risk_incidents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_behavior_events WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reinforcer_uses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_pauses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_trial_records WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reduction_measurements WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_programs WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_sessions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_patient_profiles WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_plan_versions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_program_revisions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_programs WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_interfering_behaviors WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reinforcers WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_callouts WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_patient_teams WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_portal_sessions WHERE access_id IN (SELECT pa.id FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id);
  DELETE FROM public.patient_portal_access WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_form_assignments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_interview_responses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_consents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_coverages WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_attachments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.record_shares WHERE patient_id = v_req.patient_id;
  -- Evolução antes do agendamento: patient_evolutions.appointment_id é
  -- RESTRICT, e na ordem antiga a exclusão de quem tinha evolução parava aí.
  DELETE FROM public.patient_evolutions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.appointments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_enrollments WHERE patient_id = v_req.patient_id;
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
      observacoes = NULL,
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
