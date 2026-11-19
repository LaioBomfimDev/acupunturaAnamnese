-- ==========================================================
-- Exclusão de paciente: pesquisa de satisfação anonimizada e código de
-- acesso da Área do Paciente fora do snapshot
-- REQUER: 20261111b_valor_combinado_paciente (última versão de
-- admin_decide_patient_deletion, com patient_prices), da qual esta parte.
--
-- Refeita em 19/11/2026 sobre a versão viva. É a 20261019 (commit c0c5176,
-- de 19/10), que nunca foi aplicada: ela partia de 20261016 e, aplicada
-- hoje, tiraria da exclusão tudo o que entrou depois (ABA, financeiro,
-- convênios, valor combinado). 20261019 e 20261010 não devem ser aplicadas.
--
-- Por quê:
--   1. satisfaction_surveys (20260901) nunca entrou na exclusão. A
--      exclusão é anonimização e nunca faz DELETE em patients, então o
--      ON DELETE CASCADE não dispara: depois de excluir, o comentário
--      livre do paciente (texto aberto, pode identificar a pessoa)
--      continuava no banco e na Gestão, e o link ainda não respondido
--      seguia aceitando resposta até expirar.
--   2. O snapshot guardava o código de acesso da Área do Paciente. É
--      credencial, não dado a restaurar: numa restauração, o certo é
--      gerar um código novo.
--
-- Decisões da administradora: pesquisa (08/10/2026): manter só a nota
-- e as datas, para os números da Gestão (total, taxa de resposta, nota
-- média) não mudarem; o que identifica sai. Código de acesso
-- (19/10/2026): não guardar. Aplicar de verdade: pedido de 19/11/2026.
--
-- O que muda (o resto da função é cópia fiel da versão de 20261111b):
--   * Snapshot: 'patient_portal_access' sem access_code; entra
--     'satisfaction_surveys' sem o token (a chave do link).
--   * UPDATE logo depois de fechar a Área do Paciente e as entrevistas:
--     apaga o comentário, troca o token por um novo aleatório (o link já
--     enviado para de funcionar) e encerra a pesquisa não respondida (a
--     Gestão mostra "Expirada"). Nota, datas e patient_id ficam: a linha
--     segue ligada a "[Paciente removido]". appointment_id vira NULL
--     sozinho quando o DELETE de appointments roda (FK ON DELETE SET NULL).
--
-- Limite conhecido: com o snapshot, a nota ainda pode ser religada à
-- pessoa (pseudonimização, não anonimização plena). Entra na revisão
-- jurídica que já está pendente.
--
-- Reverter: recriar admin_decide_patient_deletion a partir de
-- 20261111b_valor_combinado_paciente.sql.
-- ==========================================================

-- Fora de ordem, a função seria criada e só quebraria na hora de excluir;
-- e uma versão antiga aplicada por cima tiraria tabelas da exclusão.
DO $requires$
BEGIN
  IF to_regclass('public.satisfaction_surveys') IS NULL
     OR to_regclass('public.patient_portal_access') IS NULL
     OR to_regclass('public.patient_prices') IS NULL
     OR COALESCE(position('patient_prices' IN pg_get_functiondef(to_regprocedure('public.admin_decide_patient_deletion(uuid,text,text)'))), 0) = 0 THEN
    RAISE EXCEPTION 'Aplique antes 20261111b_valor_combinado_paciente.sql (e as que ela exige).';
  END IF;
END;
$requires$;

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

  PERFORM 1 FROM public.patients WHERE id=v_req.patient_id FOR UPDATE;
  -- Aprovado: snapshot completo antes de qualquer exclusão/limpeza.
  SELECT jsonb_build_object(
    'patient', (SELECT to_jsonb(p) FROM public.patients p WHERE p.id = v_req.patient_id),
    'clinical_records', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.clinical_records r WHERE r.patient_id = v_req.patient_id),
    'patient_evolutions', (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM public.patient_evolutions e WHERE e.patient_id = v_req.patient_id),
    'patient_instrument_applications', (SELECT coalesce(jsonb_agg(to_jsonb(ia)), '[]'::jsonb) FROM public.patient_instrument_applications ia WHERE ia.patient_id = v_req.patient_id),
    'patient_interview_responses', (SELECT coalesce(jsonb_agg(to_jsonb(ir) - 'link_token_hash' - 'link_token_encrypted'), '[]'::jsonb) FROM public.patient_interview_responses ir WHERE ir.patient_id = v_req.patient_id),
    'patient_form_assignments', (SELECT coalesce(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) FROM public.patient_form_assignments fa WHERE fa.patient_id = v_req.patient_id),
    'patient_portal_access', (SELECT coalesce(jsonb_agg(to_jsonb(pa) - 'access_code'), '[]'::jsonb) FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id),
    'satisfaction_surveys', (SELECT coalesce(jsonb_agg(to_jsonb(ss) - 'token'), '[]'::jsonb) FROM public.satisfaction_surveys ss WHERE ss.patient_id = v_req.patient_id),
    'patient_consents', (SELECT coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) FROM public.patient_consents pc WHERE pc.patient_id = v_req.patient_id),
    'patient_coverages', (SELECT coalesce(jsonb_agg(to_jsonb(cv)), '[]'::jsonb) FROM public.patient_coverages cv WHERE cv.patient_id = v_req.patient_id),
    'patient_prices', (SELECT coalesce(jsonb_agg(to_jsonb(pr)), '[]'::jsonb) FROM public.patient_prices pr WHERE pr.patient_id = v_req.patient_id),
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
    'aba_supervision_records', (SELECT coalesce(jsonb_agg(to_jsonb(asup)), '[]'::jsonb) FROM public.aba_supervision_records asup WHERE asup.patient_id = v_req.patient_id),
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

  UPDATE public.aba_supervision_records SET patient_id = NULL, agenda_encrypted = NULL, decisions_encrypted = NULL,
    void_reason_encrypted = CASE WHEN status = 'anulado' THEN public.aba_encrypt('Motivo removido na exclusão do paciente.') ELSE NULL END,
    revision = revision + 1 WHERE patient_id = v_req.patient_id;
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
  UPDATE public.satisfaction_surveys
  SET comment = NULL,
      token = pg_catalog.gen_random_uuid(),
      expires_at = LEAST(expires_at, pg_catalog.clock_timestamp())
  WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_consents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_coverages WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_prices WHERE patient_id = v_req.patient_id;
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

-- ----------------------------------------------------------
-- Verificação. Exclusões feitas ANTES desta migration não são tocadas
-- aqui: contador "por_limpar" maior que zero pede decisão caso a caso.
-- ----------------------------------------------------------
SELECT
  position('satisfaction_surveys' IN pg_get_functiondef('public.admin_decide_patient_deletion(uuid,text,text)'::regprocedure)) > 0 AS exclusao_cobre_pesquisas,
  position('to_jsonb(pa) - ''access_code''' IN pg_get_functiondef('public.admin_decide_patient_deletion(uuid,text,text)'::regprocedure)) > 0 AS snapshot_sem_codigo,
  position('patient_prices' IN pg_get_functiondef('public.admin_decide_patient_deletion(uuid,text,text)'::regprocedure)) > 0 AS valor_combinado_continua,
  (
    SELECT count(*)
    FROM public.satisfaction_surveys s
    JOIN public.patients p ON p.id = s.patient_id
    WHERE p.erased_at IS NOT NULL
      AND (s.comment IS NOT NULL OR (s.responded_at IS NULL AND s.expires_at > pg_catalog.clock_timestamp()))
  ) AS pesquisas_de_excluidos_por_limpar,
  (
    SELECT count(*)
    FROM patient_erasure_backup.snapshots s
    WHERE jsonb_typeof(s.snapshot -> 'patient_portal_access') = 'array'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(s.snapshot -> 'patient_portal_access') access_row
        WHERE access_row ? 'access_code'
      )
  ) AS snapshots_com_codigo_por_limpar;
