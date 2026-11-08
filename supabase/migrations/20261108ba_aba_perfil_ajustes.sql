-- ACUP-011: dois ajustes de validação do perfil ABA.
-- REQUER: 20261108b_aba_perfil_paciente.sql.
-- Aplicar em transação. Recria somente aba_save_profile, sem tocar leitura,
-- tabela, exclusão de paciente ou qualquer outra RPC.
-- A regra de arquivado é cópia da versão vigente de aba_save_plan_draft
-- em 20261108a_aba_plano_ajustes.sql, com a mensagem ajustada para perfil.
-- A regra bloqueia a escrita antes do replay, como no plano; ler continua
-- seguindo a 004. Para paciente ativo, replay/CAS/retorno permanecem iguais.
-- Data de laudo nova não pode superar o hoje de America/Sao_Paulo,
-- independentemente do TimeZone da conexão. Não reescreve laudo antigo.
-- Reversão: restaurar apenas aba_save_profile da 20261108b; não há mudança
-- de schema nem expurgo. Isso volta a permitir as duas situações recusadas.

DO $requires$
BEGIN
  IF to_regclass('public.aba_patient_profiles') IS NULL
     OR to_regprocedure('public.aba_save_profile(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'ABA: aplique antes 20261108b_aba_perfil_paciente.sql.';
  END IF;
END;
$requires$;

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
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Paciente arquivado não recebe perfil.' USING ERRCODE = '22023';
  END IF;
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
      IF v_report_date > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
        RAISE EXCEPTION 'Data do laudo não pode ser futura.' USING ERRCODE = '22023';
      END IF;
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

REVOKE ALL ON FUNCTION public.aba_save_profile(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_save_profile(UUID, JSONB) TO authenticated;
