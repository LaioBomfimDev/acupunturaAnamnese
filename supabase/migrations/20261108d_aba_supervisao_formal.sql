-- ACUP-008: registro formal de supervisão, somente banco (tela na ACUP-013).
-- REQUER: 20261108b_aba_perfil_paciente.sql, 20261108ba_aba_perfil_ajustes.sql
-- e gates/cifra/times de 20261101b_aba_coleta.sql. Aplicar em transação.
-- Reversão funcional: revogar EXECUTE das quatro RPCs de escrita; manter
-- tabela, leitura e exclusão atualizada. Reaplicar reativa, sem apagar horas.
-- Não restaurar exclusão antiga enquanto houver supervisão ligada a paciente.
-- Escritas retornam {id,revision,client_event_id}; último evento é no-op
-- antes do CAS. Não é histórico de todos os eventos. Ciência não recebe
-- revision (decisão 60a2383): lock, uma vez, revision sobe, replay no-op.
-- SUP-1/2: anonimização preserva horas/status/carimbos; limpa pauta/decisões
-- e substitui motivo de anulação por mensagem genérica cifrada.
-- SUP-3: leitura histórica conserva metadados e horas; sem acesso ao paciente,
-- patient_id e todos os textos ficam NULL, com content_restricted=true.

DO $requires$
BEGIN
  IF to_regclass('public.aba_patient_profiles') IS NULL
     OR to_regclass('public.aba_care_team_members') IS NULL
     OR to_regclass('patient_erasure_backup.snapshots') IS NULL
     OR to_regprocedure('public.aba_require_gate()') IS NULL
     OR to_regprocedure('public.aba_require_patient(uuid,boolean)') IS NULL
     OR to_regprocedure('public.aba_encrypt(text)') IS NULL
     OR to_regprocedure('public.aba_decrypt_text(bytea,text)') IS NULL
     OR to_regprocedure('public.admin_decide_patient_deletion(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'ABA: aplique antes coleta, perfil do paciente e exclusão atualizada (20261108b).';
  END IF;
END;
$requires$;

CREATE TABLE IF NOT EXISTS public.aba_supervision_records (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  supervisee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  patient_id UUID REFERENCES public.patients(id) ON DELETE RESTRICT,
  held_on DATE NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 600),
  modality TEXT NOT NULL CHECK (modality IN ('individual', 'grupo')),
  format TEXT NOT NULL CHECK (format IN ('presencial', 'online')),
  agenda_encrypted BYTEA,
  decisions_encrypted BYTEA,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'assinado', 'anulado')),
  signed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  signed_at TIMESTAMPTZ,
  supervisee_ack_at TIMESTAMPTZ,
  void_reason_encrypted BYTEA,
  voided_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  voided_at TIMESTAMPTZ,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  client_event_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT aba_supervision_records_event_key UNIQUE (clinic_id, client_event_id),
  CONSTRAINT aba_supervision_records_lifecycle_check CHECK (
    (status = 'rascunho' AND signed_by IS NULL AND signed_at IS NULL
      AND supervisee_ack_at IS NULL AND void_reason_encrypted IS NULL AND voided_by IS NULL AND voided_at IS NULL)
    OR (status = 'assinado' AND signed_by IS NOT NULL AND signed_at IS NOT NULL
      AND void_reason_encrypted IS NULL AND voided_by IS NULL AND voided_at IS NULL)
    OR (status = 'anulado' AND signed_by IS NOT NULL AND signed_at IS NOT NULL
      AND void_reason_encrypted IS NOT NULL AND voided_by IS NOT NULL AND voided_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS aba_supervision_records_supervisee
  ON public.aba_supervision_records(clinic_id, supervisee_id, held_on DESC);
CREATE INDEX IF NOT EXISTS aba_supervision_records_patient
  ON public.aba_supervision_records(patient_id) WHERE patient_id IS NOT NULL;
DO $protect$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['aba_supervision_records'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END;
$protect$;

-- Auxiliar interna: administração ou supervisão ATUAL de membro ativo.
CREATE OR REPLACE FUNCTION public.aba_supervision_can_manage(p_supervisee UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_supervision_can_manage$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles AS person
    WHERE person.id = p_supervisee AND person.clinic_id = v_clinic
      AND person.is_active IS TRUE AND public.aba_is_aba_professional(person.id))
    AND (public.is_clinic_admin(v_uid) OR EXISTS (
      SELECT 1 FROM public.aba_care_teams AS team
      JOIN public.aba_care_team_members AS member ON member.team_id = team.id
      WHERE team.clinic_id = v_clinic AND member.clinic_id = v_clinic
        AND team.supervisor_id = v_uid AND team.archived_at IS NULL
        AND member.therapist_id = p_supervisee AND member.ended_at IS NULL
    ));
END;
$aba_supervision_can_manage$;

-- Auxiliar interna: mesma ordem de locks de save: clínica, paciente, registro.
-- A clínica serializa também criação/eventos; NO KEY UPDATE não bloqueia filhos.
CREATE OR REPLACE FUNCTION public.aba_supervision_lock(p_id UUID)
RETURNS public.aba_supervision_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_supervision_lock$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_record public.aba_supervision_records%ROWTYPE;
BEGIN
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'Instituição indisponível.' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.clinics WHERE id = v_clinic FOR NO KEY UPDATE;
  SELECT * INTO v_record FROM public.aba_supervision_records WHERE id = p_id AND clinic_id = v_clinic;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registro de supervisão indisponível.' USING ERRCODE = '42501'; END IF;
  IF v_record.patient_id IS NOT NULL THEN
    PERFORM 1 FROM public.patients WHERE id = v_record.patient_id AND erased_at IS NULL FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível. Recarregue o registro.' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.patients WHERE id = v_record.patient_id AND archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Paciente arquivado não recebe escrita de supervisão.' USING ERRCODE = '22023';
    END IF;
  END IF;
  SELECT * INTO v_record FROM public.aba_supervision_records WHERE id = p_id AND clinic_id = v_clinic FOR UPDATE;
  RETURN v_record;
END;
$aba_supervision_lock$;

CREATE OR REPLACE FUNCTION public.aba_save_supervision_draft(p_record JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_supervision_draft$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_existing public.aba_supervision_records%ROWTYPE;
  v_saved public.aba_supervision_records%ROWTYPE;
  v_id UUID;
  v_event UUID;
  v_revision BIGINT;
  v_supervisee UUID;
  v_patient UUID;
  v_held DATE;
  v_minutes INTEGER;
  v_modality TEXT;
  v_format TEXT;
  v_agenda BYTEA;
  v_decisions BYTEA;
  v_key TEXT;
BEGIN
  IF p_record IS NULL OR jsonb_typeof(p_record) <> 'object' THEN
    RAISE EXCEPTION 'Registro de supervisão inválido.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_id := (p_record ->> 'id')::UUID;
    v_event := (p_record ->> 'client_event_id')::UUID;
    v_revision := (p_record ->> 'revision')::BIGINT;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Informe identificador, revisão e evento válidos.' USING ERRCODE = '22023';
  END;
  IF v_id IS NULL OR v_event IS NULL OR v_revision IS NULL OR v_revision < 0 THEN
    RAISE EXCEPTION 'Informe identificador, revisão e evento da supervisão.' USING ERRCODE = '22023';
  END IF;
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'Instituição indisponível.' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.clinics WHERE id = v_clinic FOR NO KEY UPDATE;
  SELECT * INTO v_existing FROM public.aba_supervision_records WHERE id = v_id;
  IF FOUND THEN
    IF v_existing.clinic_id <> v_clinic THEN RAISE EXCEPTION 'Registro indisponível nesta instituição.' USING ERRCODE = '42501'; END IF;
    v_existing := public.aba_supervision_lock(v_id);
  END IF;
  BEGIN
    v_supervisee := CASE WHEN p_record ? 'supervisee_id' THEN (p_record ->> 'supervisee_id')::UUID ELSE v_existing.supervisee_id END;
    v_patient := CASE WHEN p_record ? 'patient_id' THEN (p_record ->> 'patient_id')::UUID ELSE v_existing.patient_id END;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Supervisionado ou paciente inválido.' USING ERRCODE = '22023';
  END;
  IF NOT public.aba_supervision_can_manage(v_supervisee)
     OR (v_existing.id IS NOT NULL AND NOT public.aba_supervision_can_manage(v_existing.supervisee_id)) THEN
    RAISE EXCEPTION 'Só a administração ou a supervisão do time ativo deste profissional pode registrar supervisão.' USING ERRCODE = '42501';
  END IF;
  IF v_existing.patient_id IS NOT NULL THEN PERFORM public.aba_require_patient(v_existing.patient_id, TRUE); END IF;
  IF v_patient IS NOT NULL THEN
    PERFORM public.aba_require_patient(v_patient, TRUE);
    PERFORM 1 FROM public.patients WHERE id = v_patient AND clinic_id = v_clinic AND erased_at IS NULL FOR NO KEY UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível.' USING ERRCODE = '42501'; END IF;
    IF EXISTS (SELECT 1 FROM public.patients WHERE id = v_patient AND archived_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Paciente arquivado não recebe registro de supervisão.' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.client_event_id = v_event THEN
      IF v_existing.status <> 'rascunho' THEN RAISE EXCEPTION 'Evento já usado em outra ação de supervisão.' USING ERRCODE = '23505'; END IF;
      RETURN jsonb_build_object('id', v_existing.id, 'revision', v_existing.revision, 'client_event_id', v_existing.client_event_id);
    END IF;
    IF v_existing.revision <> v_revision THEN RAISE EXCEPTION 'Registro alterado por outra pessoa. Recarregue.' USING ERRCODE = '40001'; END IF;
    IF v_existing.status <> 'rascunho' THEN RAISE EXCEPTION 'Só o rascunho pode ser editado; registro assinado ou anulado não muda.' USING ERRCODE = '22023'; END IF;
  ELSIF v_revision <> 0 THEN
    RAISE EXCEPTION 'Registro inexistente: a revisão inicial é zero.' USING ERRCODE = '40001';
  END IF;
  BEGIN
    v_held := CASE WHEN p_record ? 'held_on' THEN (p_record ->> 'held_on')::DATE ELSE v_existing.held_on END;
    v_minutes := CASE WHEN p_record ? 'duration_minutes' THEN (p_record ->> 'duration_minutes')::INTEGER ELSE v_existing.duration_minutes END;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Data ou duração da supervisão inválida.' USING ERRCODE = '22023';
  END;
  v_modality := CASE WHEN p_record ? 'modality' THEN p_record ->> 'modality' ELSE v_existing.modality END;
  v_format := CASE WHEN p_record ? 'format' THEN p_record ->> 'format' ELSE v_existing.format END;
  IF v_held IS NULL OR v_held > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE
     OR v_minutes IS NULL OR v_minutes NOT BETWEEN 1 AND 600
     OR v_modality IS NULL OR v_modality NOT IN ('individual','grupo')
     OR v_format IS NULL OR v_format NOT IN ('presencial','online') THEN
    RAISE EXCEPTION 'Informe data sem futuro, duração de 1 a 600 minutos, modalidade e formato válidos.' USING ERRCODE = '22023';
  END IF;
  IF p_record ? 'held_on' AND (p_record ->> 'held_on') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR p_record ? 'duration_minutes' AND (p_record ->> 'duration_minutes') !~ '^[0-9]{1,3}$' THEN
    RAISE EXCEPTION 'Use data AAAA-MM-DD e duração inteira de 1 a 600 minutos.' USING ERRCODE = '22023';
  END IF;
  FOREACH v_key IN ARRAY ARRAY['agenda','decisions'] LOOP
    IF p_record ? v_key AND (jsonb_typeof(p_record -> v_key) NOT IN ('string','null') OR char_length(p_record ->> v_key) > 12000) THEN
      RAISE EXCEPTION 'Pauta e decisões precisam ser textos de até 12000 caracteres.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_agenda := CASE WHEN p_record ? 'agenda' THEN public.aba_encrypt(public.aba_clean_text(p_record ->> 'agenda',12000)) ELSE v_existing.agenda_encrypted END;
  v_decisions := CASE WHEN p_record ? 'decisions' THEN public.aba_encrypt(public.aba_clean_text(p_record ->> 'decisions',12000)) ELSE v_existing.decisions_encrypted END;
  IF v_existing.id IS NULL THEN
    INSERT INTO public.aba_supervision_records(id,clinic_id,supervisor_id,supervisee_id,patient_id,held_on,duration_minutes,modality,format,
      agenda_encrypted,decisions_encrypted,client_event_id,created_by,updated_by)
    VALUES(v_id,v_clinic,auth.uid(),v_supervisee,v_patient,v_held,v_minutes,v_modality,v_format,v_agenda,v_decisions,v_event,auth.uid(),auth.uid()) RETURNING * INTO v_saved;
  ELSE
    UPDATE public.aba_supervision_records AS record SET supervisee_id=v_supervisee,patient_id=v_patient,held_on=v_held,
      duration_minutes=v_minutes,modality=v_modality,format=v_format,agenda_encrypted=v_agenda,decisions_encrypted=v_decisions,
      revision=record.revision+1,client_event_id=v_event,updated_by=auth.uid(),updated_at=clock_timestamp()
    WHERE record.id=v_id RETURNING * INTO v_saved;
  END IF;
  RETURN jsonb_build_object('id',v_saved.id,'revision',v_saved.revision,'client_event_id',v_saved.client_event_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Este evento já foi registrado em outra supervisão. Recarregue.' USING ERRCODE = '23505';
WHEN check_violation OR not_null_violation THEN
  RAISE EXCEPTION 'Registro de supervisão inválido. Confira os campos obrigatórios.' USING ERRCODE = '22023';
END;
$aba_save_supervision_draft$;

CREATE OR REPLACE FUNCTION public.aba_sign_supervision(p_id UUID, p_revision BIGINT, p_client_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_sign_supervision$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_record public.aba_supervision_records%ROWTYPE;
BEGIN
  v_record := public.aba_supervision_lock(p_id);
  IF NOT (v_record.supervisor_id = v_uid OR public.is_clinic_admin(v_uid)) THEN
    RAISE EXCEPTION 'Só quem registrou ou a administração pode assinar a supervisão.' USING ERRCODE = '42501';
  END IF;
  IF v_record.patient_id IS NOT NULL THEN PERFORM public.aba_require_patient(v_record.patient_id, TRUE); END IF;
  IF p_revision IS NULL OR p_revision < 1 OR p_client_event_id IS NULL THEN
    RAISE EXCEPTION 'Informe revisão e evento válidos.' USING ERRCODE = '22023';
  END IF;
  IF v_record.client_event_id = p_client_event_id THEN
    IF v_record.status <> 'assinado' OR v_record.supervisee_ack_at IS NOT NULL THEN RAISE EXCEPTION 'Evento já usado em outra ação de supervisão.' USING ERRCODE = '23505'; END IF;
    RETURN jsonb_build_object('id',v_record.id,'revision',v_record.revision,'client_event_id',v_record.client_event_id);
  END IF;
  IF v_record.revision <> p_revision THEN RAISE EXCEPTION 'Registro alterado por outra pessoa. Recarregue.' USING ERRCODE = '40001'; END IF;
  IF v_record.status <> 'rascunho' THEN RAISE EXCEPTION 'Só um rascunho pode ser assinado.' USING ERRCODE = '22023'; END IF;
  UPDATE public.aba_supervision_records AS record SET status='assinado',signed_by=auth.uid(),signed_at=clock_timestamp(),
    revision=record.revision+1,client_event_id=p_client_event_id,updated_by=auth.uid(),updated_at=clock_timestamp()
  WHERE record.id=p_id RETURNING * INTO v_record;
  RETURN jsonb_build_object('id',v_record.id,'revision',v_record.revision,'client_event_id',v_record.client_event_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Este evento já foi registrado em outra supervisão. Recarregue.' USING ERRCODE = '23505';
END;
$aba_sign_supervision$;

CREATE OR REPLACE FUNCTION public.aba_ack_supervision(p_id UUID, p_client_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_ack_supervision$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_record public.aba_supervision_records%ROWTYPE;
BEGIN
  v_record := public.aba_supervision_lock(p_id);
  IF v_record.supervisee_id <> v_uid THEN
    RAISE EXCEPTION 'Só o próprio supervisionado pode marcar ciência.' USING ERRCODE = '42501';
  END IF;
  IF p_client_event_id IS NULL THEN RAISE EXCEPTION 'Informe o evento da ciência.' USING ERRCODE = '22023'; END IF;
  -- Ciência só altera metadados, não concede nem exige acesso ao prontuário (SUP-3).
  IF v_record.status <> 'assinado' THEN RAISE EXCEPTION 'Ciência só pode ser marcada em registro assinado.' USING ERRCODE = '22023'; END IF;
  IF v_record.client_event_id = p_client_event_id THEN
    IF v_record.supervisee_ack_at IS NULL THEN RAISE EXCEPTION 'Este evento já foi usado na assinatura. Use um novo evento para a ciência.' USING ERRCODE = '23505'; END IF;
    RETURN jsonb_build_object('id',v_record.id,'revision',v_record.revision,'client_event_id',v_record.client_event_id);
  END IF;
  IF v_record.supervisee_ack_at IS NOT NULL THEN RAISE EXCEPTION 'A ciência já foi registrada.' USING ERRCODE = '22023'; END IF;
  UPDATE public.aba_supervision_records AS record SET supervisee_ack_at=clock_timestamp(),revision=record.revision+1,
    client_event_id=p_client_event_id,updated_by=auth.uid(),updated_at=clock_timestamp()
  WHERE record.id=p_id RETURNING * INTO v_record;
  RETURN jsonb_build_object('id',v_record.id,'revision',v_record.revision,'client_event_id',v_record.client_event_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Este evento já foi registrado em outra supervisão. Recarregue.' USING ERRCODE = '23505';
END;
$aba_ack_supervision$;

CREATE OR REPLACE FUNCTION public.aba_void_supervision(p_id UUID, p_revision BIGINT, p_reason TEXT, p_client_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_void_supervision$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_record public.aba_supervision_records%ROWTYPE;
BEGIN
  v_record := public.aba_supervision_lock(p_id);
  IF NOT (v_record.signed_by = v_uid OR public.is_clinic_admin(v_uid)) OR v_record.signed_by IS NULL THEN
    RAISE EXCEPTION 'Só quem assinou ou a administração pode anular a supervisão assinada.' USING ERRCODE = '42501';
  END IF;
  IF v_record.patient_id IS NOT NULL THEN PERFORM public.aba_require_patient(v_record.patient_id, TRUE); END IF;
  IF p_revision IS NULL OR p_revision < 1 OR p_client_event_id IS NULL THEN
    RAISE EXCEPTION 'Informe revisão e evento válidos.' USING ERRCODE = '22023';
  END IF;
  IF v_record.client_event_id = p_client_event_id THEN
    IF v_record.status <> 'anulado' THEN RAISE EXCEPTION 'Evento já usado em outra ação de supervisão.' USING ERRCODE = '23505'; END IF;
    RETURN jsonb_build_object('id',v_record.id,'revision',v_record.revision,'client_event_id',v_record.client_event_id);
  END IF;
  IF v_record.revision <> p_revision THEN RAISE EXCEPTION 'Registro alterado por outra pessoa. Recarregue.' USING ERRCODE = '40001'; END IF;
  IF v_record.status <> 'assinado' THEN RAISE EXCEPTION 'Só um registro assinado pode ser anulado.' USING ERRCODE = '22023'; END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 10 OR char_length(p_reason) > 6000 THEN
    RAISE EXCEPTION 'Informe o motivo da anulação com 10 a 6000 caracteres.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.aba_supervision_records AS record SET status='anulado',void_reason_encrypted=public.aba_encrypt(btrim(p_reason)),
    voided_by=auth.uid(),voided_at=clock_timestamp(),revision=record.revision+1,client_event_id=p_client_event_id,
    updated_by=auth.uid(),updated_at=clock_timestamp()
  WHERE record.id=p_id RETURNING * INTO v_record;
  RETURN jsonb_build_object('id',v_record.id,'revision',v_record.revision,'client_event_id',v_record.client_event_id);
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Este evento já foi registrado em outra supervisão. Recarregue.' USING ERRCODE = '23505';
END;
$aba_void_supervision$;

CREATE OR REPLACE FUNCTION public.aba_list_supervisions(p_supervisee_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_list_supervisions$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_record public.aba_supervision_records%ROWTYPE;
  v_rows JSONB := '[]'::JSONB;
  v_totals JSONB := '{}'::JSONB;
  v_content_allowed BOOLEAN;
  v_key TEXT;
BEGIN
  IF v_clinic IS NULL THEN RAISE EXCEPTION 'Instituição indisponível.' USING ERRCODE = '42501'; END IF;
  FOR v_record IN SELECT record.* FROM public.aba_supervision_records AS record
    WHERE record.clinic_id = v_clinic AND (p_supervisee_id IS NULL OR record.supervisee_id=p_supervisee_id)
      AND (public.is_clinic_admin(v_uid) OR record.supervisor_id=v_uid
        OR (record.supervisee_id=v_uid AND record.status IN ('assinado','anulado'))
        OR EXISTS (SELECT 1 FROM public.aba_care_teams AS team
          JOIN public.aba_care_team_members AS member ON member.team_id=team.id
          WHERE team.clinic_id=v_clinic AND member.clinic_id=v_clinic AND team.archived_at IS NULL
            AND team.supervisor_id=v_uid AND member.therapist_id=record.supervisee_id AND member.ended_at IS NULL))
    ORDER BY record.held_on DESC,record.created_at DESC,record.id
  LOOP
    v_content_allowed := v_record.patient_id IS NULL OR public.aba_can_access_patient(v_record.patient_id,v_uid);
    IF v_content_allowed THEN
      IF v_record.patient_id IS NOT NULL THEN PERFORM public.aba_require_patient(v_record.patient_id,FALSE); END IF;
      IF v_key IS NULL THEN v_key := public.get_clinical_encryption_key(); END IF;
    END IF;
    v_rows := v_rows || jsonb_build_array((to_jsonb(v_record) - ARRAY['patient_id','agenda_encrypted','decisions_encrypted','void_reason_encrypted']) || jsonb_build_object(
      'patient_id',CASE WHEN v_content_allowed THEN v_record.patient_id ELSE NULL END,
      'agenda',CASE WHEN v_content_allowed THEN public.aba_decrypt_text(v_record.agenda_encrypted,v_key) ELSE NULL END,
      'decisions',CASE WHEN v_content_allowed THEN public.aba_decrypt_text(v_record.decisions_encrypted,v_key) ELSE NULL END,
      'void_reason',CASE WHEN v_content_allowed THEN public.aba_decrypt_text(v_record.void_reason_encrypted,v_key) ELSE NULL END,
      'content_restricted',NOT v_content_allowed));
    IF v_record.status = 'assinado' THEN
      v_totals := jsonb_set(v_totals,ARRAY[v_record.supervisee_id::TEXT],to_jsonb(COALESCE((v_totals ->> v_record.supervisee_id::TEXT)::BIGINT,0)+v_record.duration_minutes));
    END IF;
  END LOOP;
  RETURN jsonb_build_object('records',v_rows,'totals',COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'supervisee_id',entry.key,'duration_minutes',entry.value) ORDER BY entry.key) FROM jsonb_each(v_totals) AS entry),'[]'::JSONB));
END;
$aba_list_supervisions$;

REVOKE ALL ON FUNCTION public.aba_supervision_can_manage(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_supervision_lock(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_save_supervision_draft(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_sign_supervision(UUID,BIGINT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_ack_supervision(UUID,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_void_supervision(UUID,BIGINT,TEXT,UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_list_supervisions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_save_supervision_draft(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_sign_supervision(UUID,BIGINT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_ack_supervision(UUID,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_void_supervision(UUID,BIGINT,TEXT,UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_list_supervisions(UUID) TO authenticated;

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
