-- ABA: histórico dos programas e plano terapêutico versionado (ACUP-002).
-- REQUER: 20261101b_aba_coleta.sql, 20261101c_aba_qualidade.sql e
-- 20261103c_patient_notes.sql (última admin_decide_patient_deletion).
-- Expansão compatível: assinaturas/retornos das duas RPCs de programa preservados.
-- Histórico anterior não é inventado: a migração captura só a revisão atual.
-- Reverter funcionalmente: revogar EXECUTE das cinco RPCs de plano, mantendo
-- tabelas, histórico, escritores de revisões e exclusão atualizados (sem perda).
-- Não restaurar os escritores antigos depois de haver histórico: isso deixaria
-- lacunas. Retomar reaplicando esta migration; não há expurgo nem DROP de dados.
-- Aplicar em transação; validação somente no Postgres local, nunca em produção.

DO $requires$
BEGIN
  IF to_regclass('public.aba_programs') IS NULL
     OR to_regclass('public.aba_alerts') IS NULL
     OR to_regclass('patient_erasure_backup.snapshots') IS NULL
     OR to_regprocedure('public.aba_require_patient(uuid,boolean)') IS NULL
     OR to_regprocedure('public.aba_can_supervise_patient(uuid,uuid)') IS NULL
     OR to_regprocedure('public.aba_encrypt(text)') IS NULL
     OR to_regprocedure('public.aba_save_program(uuid,jsonb)') IS NULL
     OR to_regprocedure('public.aba_update_program_status(uuid,text,text,boolean)') IS NULL
     OR to_regprocedure('public.admin_decide_patient_deletion(uuid,text,text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'observacoes') THEN
    RAISE EXCEPTION 'ABA: aplique antes coleta, qualidade e observações do paciente (20261103c).';
  END IF;
END;
$requires$;

CREATE TABLE IF NOT EXISTS public.aba_program_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  program_id UUID NOT NULL REFERENCES public.aba_programs(id) ON DELETE RESTRICT,
  revision BIGINT NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  notes_encrypted BYTEA,
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  changed_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT aba_program_revisions_program_revision_key UNIQUE (program_id, revision)
);
CREATE INDEX IF NOT EXISTS aba_program_revisions_patient
  ON public.aba_program_revisions(patient_id);

CREATE TABLE IF NOT EXISTS public.aba_plan_versions (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'em_revisao', 'aprovado', 'substituido', 'anulado')),
  programs JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(programs) = 'array' AND octet_length(programs::TEXT) <= 65536),
  summary_encrypted BYTEA,
  review_due_on DATE,
  authored_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  approval_statement TEXT,
  voided_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  voided_at TIMESTAMPTZ,
  void_reason_encrypted BYTEA,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  client_event_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT aba_plan_versions_patient_version_key UNIQUE (patient_id, version_no),
  CONSTRAINT aba_plan_versions_patient_event_key UNIQUE (patient_id, client_event_id),
  CONSTRAINT aba_plan_versions_submission_check CHECK (
    (status IN ('em_revisao', 'aprovado', 'substituido') AND submitted_at IS NOT NULL)
    OR (status = 'rascunho' AND submitted_at IS NULL)
    OR status = 'anulado'
  ),
  CONSTRAINT aba_plan_versions_approval_check CHECK (
    (status IN ('aprovado', 'substituido', 'anulado')
      AND approved_by IS NOT NULL AND approved_at IS NOT NULL
      AND approval_statement IS NOT NULL AND char_length(btrim(approval_statement)) >= 10
      AND submitted_at IS NOT NULL)
    OR (status IN ('rascunho', 'em_revisao', 'anulado')
      AND approved_by IS NULL AND approved_at IS NULL AND approval_statement IS NULL)
  ),
  CONSTRAINT aba_plan_versions_void_check CHECK (
    (status = 'anulado' AND voided_by IS NOT NULL AND voided_at IS NOT NULL
      AND void_reason_encrypted IS NOT NULL)
    OR (status <> 'anulado' AND voided_by IS NULL AND voided_at IS NULL
      AND void_reason_encrypted IS NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS aba_plan_versions_one_approved
  ON public.aba_plan_versions(patient_id) WHERE status = 'aprovado';

DO $protect$
DECLARE v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['aba_program_revisions', 'aba_plan_versions']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END;
$protect$;

-- Uma única captura da revisão vigente, sem alterar programas nem o histórico existente.
INSERT INTO public.aba_program_revisions (
  clinic_id, patient_id, program_id, revision, snapshot, notes_encrypted, changed_by, changed_at
)
SELECT p.clinic_id, p.patient_id, p.id, p.revision,
  jsonb_build_object(
      'id', p.id,
      'type', p.type,
      'name', p.name,
      'status', p.status,
      'collection_type', p.collection_type,
      'trial_count', p.trial_count,
      'measure', p.measure,
      'unit', p.unit,
      'procedure', p.procedure,
      'definition', p.definition
    ),
  p.notes_encrypted, COALESCE(p.updated_by, p.created_by), p.updated_at
FROM public.aba_programs p
ON CONFLICT ON CONSTRAINT aba_program_revisions_program_revision_key DO NOTHING;

CREATE OR REPLACE FUNCTION public.aba_save_program(p_patient_id UUID, p_program JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_program$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, TRUE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_id UUID;
  v_existing public.aba_programs%ROWTYPE;
  v_saved public.aba_programs%ROWTYPE;
  v_type TEXT := p_program ->> 'type';
  v_status TEXT := COALESCE(NULLIF(p_program ->> 'status', ''), 'em_ensino');
  v_procedure TEXT := public.aba_clean_text(p_program ->> 'procedure', 80);
  v_authorization TEXT := public.aba_clean_text(p_program ->> 'restricted_authorization', 2000);
  v_behavior UUID;
  v_therapist UUID;
  v_trial_count INTEGER;
  v_definition JSONB := COALESCE(p_program -> 'definition', '{}'::JSONB);
  v_restricted BOOLEAN;
BEGIN
  IF p_program IS NULL OR jsonb_typeof(p_program) <> 'object' THEN
    RAISE EXCEPTION 'Programa inválido.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_id := NULLIF(p_program ->> 'id', '')::UUID;
    v_behavior := NULLIF(p_program ->> 'restricted_behavior_id', '')::UUID;
    v_therapist := NULLIF(p_program ->> 'therapist_id', '')::UUID;
    v_trial_count := NULLIF(p_program ->> 'trial_count', '')::INTEGER;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Programa com campo inválido.' USING ERRCODE = '22023';
  END;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'O programa precisa de identificador.' USING ERRCODE = '22023';
  END IF;

  IF v_type NOT IN ('aquisicao', 'reducao') THEN
    RAISE EXCEPTION 'Tipo de programa inválido.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_definition) <> 'object' THEN
    RAISE EXCEPTION 'Configuração do programa inválida.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.patients patient
    WHERE patient.id = p_patient_id AND patient.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Paciente arquivado não recebe programa novo.' USING ERRCODE = '22023';
  END IF;

  IF v_therapist IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = v_therapist
      AND profile.clinic_id = v_clinic
      AND public.aba_is_aba_professional(profile.id)
  ) THEN
    RAISE EXCEPTION 'Terapeuta responsável inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.aba_programs program
  WHERE program.id = v_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.patient_id <> p_patient_id OR v_existing.clinic_id <> v_clinic THEN
      RAISE EXCEPTION 'Programa de outro paciente.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Programa arquivado não é editado.' USING ERRCODE = '22023';
    END IF;
    IF v_existing.type <> v_type THEN
      RAISE EXCEPTION 'O tipo do programa não muda depois de criado.' USING ERRCODE = '22023';
    END IF;
    IF (p_program ->> 'revision') IS DISTINCT FROM v_existing.revision::TEXT THEN
      RAISE EXCEPTION 'Este programa foi alterado por outra pessoa. Recarregue antes de salvar.'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  v_restricted := public.aba_is_restricted_procedure(v_procedure);
  IF v_restricted THEN
    IF v_behavior IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.aba_interfering_behaviors behavior
      WHERE behavior.id = v_behavior
        AND behavior.patient_id = p_patient_id
        AND behavior.has_safety_plan
        AND behavior.status <> 'inactive'
    ) THEN
      RAISE EXCEPTION
        'Procedimento restrito exige um comportamento-alvo com hipótese funcional e plano de segurança registrados.'
        USING ERRCODE = '22023';
    END IF;
    IF v_authorization IS NULL OR char_length(v_authorization) < 10 THEN
      RAISE EXCEPTION 'Procedimento restrito exige o parecer da supervisão autorizando.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    v_behavior := NULL;
    v_authorization := NULL;
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.aba_programs AS program (
      id, clinic_id, patient_id, type, name, status, collection_type, trial_count,
      measure, unit, procedure, definition, notes_encrypted,
      restricted_behavior_id, restricted_authorization_encrypted,
      restricted_authorized_by, restricted_authorized_at,
      therapist_id, protocol_start_date, created_by, updated_by
    )
    VALUES (
      v_id,
      v_clinic,
      p_patient_id,
      v_type,
      public.aba_clean_text(p_program ->> 'name', 160),
      v_status,
      COALESCE(public.aba_clean_text(p_program ->> 'collection_type', 40), CASE WHEN v_type = 'aquisicao' THEN 'tentativas' ELSE 'frequencia' END),
      CASE WHEN v_type = 'aquisicao' THEN v_trial_count ELSE NULL END,
      CASE WHEN v_type = 'reducao' THEN NULLIF(p_program ->> 'measure', '') ELSE NULL END,
      public.aba_clean_text(p_program ->> 'unit', 40),
      v_procedure,
      v_definition,
      public.aba_encrypt(public.aba_clean_text(p_program ->> 'notes', 4000)),
      v_behavior,
      public.aba_encrypt(v_authorization),
      CASE WHEN v_restricted THEN v_uid ELSE NULL END,
      CASE WHEN v_restricted THEN clock_timestamp() ELSE NULL END,
      v_therapist,
      COALESCE(NULLIF(p_program ->> 'protocol_start_date', '')::DATE, current_date),
      v_uid,
      v_uid
    )
    RETURNING * INTO v_saved;
  ELSE
    UPDATE public.aba_programs AS program
    SET name = public.aba_clean_text(p_program ->> 'name', 160),
        status = v_status,
        collection_type = COALESCE(public.aba_clean_text(p_program ->> 'collection_type', 40), program.collection_type),
        trial_count = CASE WHEN v_type = 'aquisicao' THEN v_trial_count ELSE NULL END,
        measure = CASE WHEN v_type = 'reducao' THEN NULLIF(p_program ->> 'measure', '') ELSE NULL END,
        unit = public.aba_clean_text(p_program ->> 'unit', 40),
        procedure = v_procedure,
        definition = v_definition,
        notes_encrypted = public.aba_encrypt(public.aba_clean_text(p_program ->> 'notes', 4000)),
        restricted_behavior_id = v_behavior,
        restricted_authorization_encrypted = public.aba_encrypt(v_authorization),
        -- A autorização é de quem a deu: só troca o carimbo quando o
        -- procedimento passa a ser restrito ou o parecer muda.
        restricted_authorized_by = CASE
          WHEN NOT v_restricted THEN NULL
          WHEN program.restricted_authorized_by IS NULL
            OR program.procedure IS DISTINCT FROM v_procedure
            OR public.aba_decrypt_text(program.restricted_authorization_encrypted, public.get_clinical_encryption_key())
              IS DISTINCT FROM v_authorization THEN v_uid
          ELSE program.restricted_authorized_by
        END,
        restricted_authorized_at = CASE
          WHEN NOT v_restricted THEN NULL
          WHEN program.restricted_authorized_by IS NULL
            OR program.procedure IS DISTINCT FROM v_procedure
            OR public.aba_decrypt_text(program.restricted_authorization_encrypted, public.get_clinical_encryption_key())
              IS DISTINCT FROM v_authorization THEN clock_timestamp()
          ELSE program.restricted_authorized_at
        END,
        therapist_id = v_therapist,
        protocol_start_date = COALESCE(NULLIF(p_program ->> 'protocol_start_date', '')::DATE, program.protocol_start_date),
        revision = program.revision + 1,
        updated_by = v_uid,
        updated_at = clock_timestamp()
    WHERE program.id = v_id
    RETURNING * INTO v_saved;
  END IF;

  INSERT INTO public.aba_program_revisions (
    clinic_id, patient_id, program_id, revision, snapshot, notes_encrypted, changed_by, changed_at
  ) VALUES (
    v_saved.clinic_id, v_saved.patient_id, v_saved.id, v_saved.revision,
    jsonb_build_object(
      'id', v_saved.id,
      'type', v_saved.type,
      'name', v_saved.name,
      'status', v_saved.status,
      'collection_type', v_saved.collection_type,
      'trial_count', v_saved.trial_count,
      'measure', v_saved.measure,
      'unit', v_saved.unit,
      'procedure', v_saved.procedure,
      'definition', v_saved.definition
    ),
    v_saved.notes_encrypted, v_uid, v_saved.updated_at
  );

  RETURN public.aba_program_json(v_saved, public.get_clinical_encryption_key());
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Programa incompleto ou com valor fora do permitido.' USING ERRCODE = '22023';
END;
$aba_save_program$;

CREATE OR REPLACE FUNCTION public.aba_update_program_status(
  p_program_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL,
  p_archive BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_update_program_status$
DECLARE
  v_patient UUID := public.aba_program_patient(p_program_id);
  v_uid UUID;
  v_key TEXT;
  v_saved public.aba_programs%ROWTYPE;
  v_note TEXT := public.aba_clean_text(p_note, 2000);
  v_previous TEXT;
BEGIN
  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Programa não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_patient, TRUE);
  v_key := public.get_clinical_encryption_key();

  IF NOT p_archive AND p_status NOT IN (
    'planejado', 'em_ensino', 'criterio_atingido_na_sessao', 'aquisicao',
    'generalizacao', 'manutencao', 'concluido', 'pausado', 'extinto'
  ) THEN
    RAISE EXCEPTION 'Fase inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT public.aba_decrypt_text(program.notes_encrypted, v_key)
  INTO v_previous
  FROM public.aba_programs program
  WHERE program.id = p_program_id
  FOR UPDATE;

  UPDATE public.aba_programs AS program
  SET status = CASE WHEN p_archive THEN program.status ELSE p_status END,
      archived_at = CASE WHEN p_archive THEN clock_timestamp() ELSE program.archived_at END,
      notes_encrypted = CASE
        WHEN v_note IS NULL THEN program.notes_encrypted
        ELSE public.aba_encrypt(concat_ws(E'\n', v_previous,
          to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || ' — ' || v_note))
      END,
      revision = program.revision + 1,
      updated_by = v_uid,
      updated_at = clock_timestamp()
  WHERE program.id = p_program_id
    AND program.archived_at IS NULL
  RETURNING * INTO v_saved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programa já arquivado.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.aba_program_revisions (
    clinic_id, patient_id, program_id, revision, snapshot, notes_encrypted, changed_by, changed_at
  ) VALUES (
    v_saved.clinic_id, v_saved.patient_id, v_saved.id, v_saved.revision,
    jsonb_build_object(
      'id', v_saved.id,
      'type', v_saved.type,
      'name', v_saved.name,
      'status', v_saved.status,
      'collection_type', v_saved.collection_type,
      'trial_count', v_saved.trial_count,
      'measure', v_saved.measure,
      'unit', v_saved.unit,
      'procedure', v_saved.procedure,
      'definition', v_saved.definition
    ),
    v_saved.notes_encrypted, v_uid, v_saved.updated_at
  );

  RETURN public.aba_program_json(v_saved, v_key);
END;
$aba_update_program_status$;

-- Contrato: IDs/eventos UUID vêm do cliente. Revisão 0 cria; revisões positivas
-- comparam CAS. Repetir o último evento é no-op; eventos antigos não sobrescrevem.
CREATE OR REPLACE FUNCTION public.aba_save_plan_draft(p_patient_id UUID, p_plan JSONB)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_plan_draft$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_id UUID;
  v_event UUID;
  v_revision BIGINT;
  v_existing public.aba_plan_versions%ROWTYPE;
  v_approved public.aba_plan_versions%ROWTYPE;
  v_programs JSONB;
  v_item JSONB;
  v_program UUID;
  v_program_revision BIGINT;
  v_summary BYTEA;
  v_due DATE;
  v_version INTEGER;
BEGIN
  IF p_plan IS NULL OR jsonb_typeof(p_plan) <> 'object' THEN
    RAISE EXCEPTION 'Plano inválido.' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_id := (p_plan ->> 'id')::UUID;
    v_event := (p_plan ->> 'client_event_id')::UUID;
    v_revision := (p_plan ->> 'revision')::BIGINT;
    v_due := (p_plan ->> 'review_due_on')::DATE;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Plano com campo inválido.' USING ERRCODE = '22023';
  END;
  IF v_id IS NULL OR v_event IS NULL OR v_revision IS NULL OR v_revision < 0 THEN
    RAISE EXCEPTION 'Informe identificador, evento e revisão do plano.' USING ERRCODE = '22023';
  END IF;

  -- Serializa numeração e todas as transições do paciente.
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível.' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient_id AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Paciente arquivado não recebe plano.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_existing FROM public.aba_plan_versions WHERE id = v_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.patient_id <> p_patient_id OR v_existing.clinic_id <> v_clinic THEN
      RAISE EXCEPTION 'Plano de outro paciente.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.client_event_id = v_event THEN RETURN v_id; END IF;
    IF v_existing.status <> 'rascunho' THEN
      RAISE EXCEPTION 'Só o rascunho pode ser editado. Crie outra versão.' USING ERRCODE = '22023';
    END IF;
    IF v_existing.revision <> v_revision THEN
      RAISE EXCEPTION 'Plano alterado por outra pessoa. Recarregue.' USING ERRCODE = '40001';
    END IF;
  ELSE
    IF v_revision <> 0 THEN
      RAISE EXCEPTION 'Plano inexistente: a revisão inicial é zero.' USING ERRCODE = '40001';
    END IF;
    SELECT * INTO v_approved FROM public.aba_plan_versions
      WHERE patient_id = p_patient_id AND status = 'aprovado';
  END IF;

  v_programs := CASE WHEN p_plan ? 'programs' THEN p_plan -> 'programs'
    ELSE COALESCE(v_existing.programs, v_approved.programs, '[]'::JSONB) END;
  IF v_programs IS NULL OR jsonb_typeof(v_programs) <> 'array' THEN
    RAISE EXCEPTION 'Os programas precisam ser uma lista.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(v_programs) > 200 OR octet_length(v_programs::TEXT) > 65536 THEN
    RAISE EXCEPTION 'O plano aceita até 200 programas.' USING ERRCODE = '22023';
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_programs)
  LOOP
    IF jsonb_typeof(v_item) <> 'object' OR NOT (v_item ? 'program_id' AND v_item ? 'revision')
       OR (v_item - 'program_id' - 'revision') <> '{}'::JSONB THEN
      RAISE EXCEPTION 'Referência de programa inválida.' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_program := (v_item ->> 'program_id')::UUID;
      v_program_revision := (v_item ->> 'revision')::BIGINT;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Revisão do programa inválida.' USING ERRCODE = '22023';
    END;
    IF v_program IS NULL OR v_program_revision IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.aba_program_revisions r
      WHERE r.program_id = v_program AND r.revision = v_program_revision
        AND r.patient_id = p_patient_id AND r.clinic_id = v_clinic
    ) THEN
      RAISE EXCEPTION 'Programa ou revisão não pertence ao paciente.' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(v_programs)) <>
     (SELECT count(DISTINCT (value ->> 'program_id')::UUID) FROM jsonb_array_elements(v_programs)) THEN
    RAISE EXCEPTION 'Cada programa entra uma única vez no plano.' USING ERRCODE = '22023';
  END IF;
  v_summary := CASE WHEN p_plan ? 'summary'
    THEN public.aba_encrypt(public.aba_clean_text(p_plan ->> 'summary', 12000))
    ELSE COALESCE(v_existing.summary_encrypted, v_approved.summary_encrypted) END;
  v_due := CASE WHEN p_plan ? 'review_due_on' THEN v_due
    ELSE COALESCE(v_existing.review_due_on, v_approved.review_due_on) END;

  IF v_existing.id IS NULL THEN
    SELECT COALESCE(max(version_no), 0) + 1 INTO v_version
      FROM public.aba_plan_versions WHERE patient_id = p_patient_id;
    INSERT INTO public.aba_plan_versions (
      id, clinic_id, patient_id, version_no, programs, summary_encrypted,
      review_due_on, authored_by, client_event_id
    ) VALUES (v_id, v_clinic, p_patient_id, v_version, v_programs, v_summary, v_due, v_uid, v_event);
  ELSE
    UPDATE public.aba_plan_versions SET programs = v_programs, summary_encrypted = v_summary,
      review_due_on = v_due, client_event_id = v_event, revision = revision + 1,
      updated_at = clock_timestamp() WHERE id = v_id;
  END IF;
  RETURN v_id;
END;
$aba_save_plan_draft$;

CREATE OR REPLACE FUNCTION public.aba_submit_plan(
  p_patient_id UUID, p_plan_id UUID, p_revision BIGINT, p_client_event_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_submit_plan$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_plan public.aba_plan_versions%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_plan FROM public.aba_plan_versions
    WHERE id = p_plan_id AND patient_id = p_patient_id
      AND clinic_id = public.user_clinic_id(v_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF p_client_event_id IS NULL OR p_revision IS NULL THEN
    RAISE EXCEPTION 'Informe evento e revisão.' USING ERRCODE = '22023';
  END IF;
  IF v_plan.client_event_id = p_client_event_id THEN RETURN; END IF;
  IF v_plan.revision <> p_revision THEN
    RAISE EXCEPTION 'Plano alterado por outra pessoa. Recarregue.' USING ERRCODE = '40001';
  END IF;
  IF v_plan.status <> 'rascunho' OR jsonb_array_length(v_plan.programs) = 0
     OR v_plan.summary_encrypted IS NULL THEN
    RAISE EXCEPTION 'Envie um rascunho com programas e resumo preenchidos.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.aba_plan_versions SET status = 'em_revisao', submitted_at = clock_timestamp(),
    client_event_id = p_client_event_id, revision = revision + 1, updated_at = clock_timestamp()
    WHERE id = p_plan_id;
END;
$aba_submit_plan$;

CREATE OR REPLACE FUNCTION public.aba_approve_plan(
  p_patient_id UUID, p_plan_id UUID, p_revision BIGINT, p_client_event_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_approve_plan$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, TRUE);
  v_plan public.aba_plan_versions%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_plan FROM public.aba_plan_versions
    WHERE id = p_plan_id AND patient_id = p_patient_id
      AND clinic_id = public.user_clinic_id(v_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF p_client_event_id IS NULL OR p_revision IS NULL THEN
    RAISE EXCEPTION 'Informe evento e revisão.' USING ERRCODE = '22023';
  END IF;
  IF v_plan.client_event_id = p_client_event_id THEN RETURN; END IF;
  IF v_plan.revision <> p_revision THEN
    RAISE EXCEPTION 'Plano alterado por outra pessoa. Recarregue.' USING ERRCODE = '40001';
  END IF;
  IF v_plan.status <> 'em_revisao' THEN
    RAISE EXCEPTION 'Só um plano enviado para revisão pode ser aprovado.' USING ERRCODE = '22023';
  END IF;
  -- Sem trocar o conteúdo: as referências já apontam para revisões imutáveis.
  UPDATE public.aba_plan_versions SET status = 'substituido', revision = revision + 1,
    updated_at = clock_timestamp() WHERE patient_id = p_patient_id AND status = 'aprovado';
  UPDATE public.aba_plan_versions SET status = 'aprovado', approved_by = auth.uid(),
    approved_at = clock_timestamp(),
    approval_statement = 'Plano terapêutico conferido e aprovado pela supervisão responsável.',
    client_event_id = p_client_event_id, revision = revision + 1, updated_at = clock_timestamp()
    WHERE id = p_plan_id;
END;
$aba_approve_plan$;

CREATE OR REPLACE FUNCTION public.aba_void_plan(
  p_patient_id UUID, p_plan_id UUID, p_revision BIGINT, p_client_event_id UUID, p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_void_plan$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, TRUE);
  v_plan public.aba_plan_versions%ROWTYPE;
  v_reason TEXT := public.aba_clean_text(p_reason, 4000);
BEGIN
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Paciente indisponível.' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_plan FROM public.aba_plan_versions
    WHERE id = p_plan_id AND patient_id = p_patient_id
      AND clinic_id = public.user_clinic_id(v_uid) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plano não encontrado.' USING ERRCODE = 'P0002'; END IF;
  IF p_client_event_id IS NULL OR p_revision IS NULL THEN
    RAISE EXCEPTION 'Informe evento e revisão.' USING ERRCODE = '22023';
  END IF;
  IF v_plan.client_event_id = p_client_event_id THEN RETURN; END IF;
  IF v_plan.revision <> p_revision THEN
    RAISE EXCEPTION 'Plano alterado por outra pessoa. Recarregue.' USING ERRCODE = '40001';
  END IF;
  IF v_plan.status = 'anulado' OR v_reason IS NULL OR char_length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Anular exige plano não anulado e motivo de ao menos 10 caracteres.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.aba_plan_versions SET status = 'anulado', voided_by = auth.uid(),
    voided_at = clock_timestamp(), void_reason_encrypted = public.aba_encrypt(v_reason),
    client_event_id = p_client_event_id, revision = revision + 1, updated_at = clock_timestamp()
    WHERE id = p_plan_id;
END;
$aba_void_plan$;

CREATE OR REPLACE FUNCTION public.aba_list_plan_versions(p_patient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_list_plan_versions$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_key TEXT := public.get_clinical_encryption_key();
  v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    (to_jsonb(plan) - 'summary_encrypted' - 'void_reason_encrypted') || jsonb_build_object(
      'summary', public.aba_decrypt_text(plan.summary_encrypted, v_key),
      'void_reason', public.aba_decrypt_text(plan.void_reason_encrypted, v_key),
      'program_snapshots', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'program_id', r.program_id, 'revision', r.revision, 'snapshot', r.snapshot,
        'notes', public.aba_decrypt_text(r.notes_encrypted, v_key)
      ) ORDER BY item.ordinality), '[]'::JSONB)
      FROM jsonb_array_elements(plan.programs) WITH ORDINALITY item(value, ordinality)
      JOIN public.aba_program_revisions r ON r.program_id = (item.value ->> 'program_id')::UUID
        AND r.revision = (item.value ->> 'revision')::BIGINT
        AND r.patient_id = p_patient_id AND r.clinic_id = public.user_clinic_id(v_uid))
    ) ORDER BY plan.version_no DESC), '[]'::JSONB)
  INTO v_result FROM public.aba_plan_versions plan
  WHERE plan.patient_id = p_patient_id AND plan.clinic_id = public.user_clinic_id(v_uid);
  RETURN v_result;
END;
$aba_list_plan_versions$;

REVOKE ALL ON FUNCTION public.aba_save_program(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_update_program_status(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_save_program(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_update_program_status(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
REVOKE ALL ON FUNCTION public.aba_save_plan_draft(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_submit_plan(UUID, UUID, BIGINT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_approve_plan(UUID, UUID, BIGINT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_void_plan(UUID, UUID, BIGINT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_list_plan_versions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_save_plan_draft(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_submit_plan(UUID, UUID, BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_approve_plan(UUID, UUID, BIGINT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_void_plan(UUID, UUID, BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_list_plan_versions(UUID) TO authenticated;


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
