-- ACUP-010: ajustes mínimos do plano terapêutico ABA.
-- REQUER: 20261108_aba_plano_versionado.sql (tabela, CHECKs, quatro RPCs).
-- Aplicar em transação. Não recria exclusão de paciente nem escritores de programa.
-- Reverter funcionalmente: revogar EXECUTE das quatro RPCs de escrita de plano,
-- mantendo coluna, CHECK, remetentes e histórico. Reaplicar para reativar.
-- Não restaurar aba_submit_plan antiga: ela não preenche submitted_by.
--
-- Replay do último client_event_id é no-op, com o mesmo retorno da primeira
-- chamada e sem incrementar revision: aba_save_plan_draft retorna o mesmo UUID;
-- aba_submit_plan / aba_approve_plan / aba_void_plan retornam VOID (sucesso vazio).
-- Assinaturas e tipos de retorno permanecem iguais; não há novo contrato JSON.
-- Eventos antigos não sobrescrevem; evento usado em outra versão falha com 23505
-- e texto pt-BR. O lock do paciente usa NO KEY UPDATE, compatível com a checagem
-- de FK de novos filhos; os locks das versões continuam FOR UPDATE.
-- submitted_by é auth.uid() no envio. Nos envios anteriores ao ajuste, só se
-- conhece a autoria: ela preenche o remetente histórico, sem inventar outro ator.
-- aba_list_plan_versions já usa to_jsonb(plan), incluindo a coluna nova sem
-- recriar a função ou mudar seu filtro/gate de leitura.

DO $requires$
BEGIN
  IF to_regclass('public.aba_plan_versions') IS NULL
     OR to_regprocedure('public.aba_save_plan_draft(uuid,jsonb)') IS NULL
     OR to_regprocedure('public.aba_submit_plan(uuid,uuid,bigint,uuid)') IS NULL
     OR to_regprocedure('public.aba_approve_plan(uuid,uuid,bigint,uuid)') IS NULL
     OR to_regprocedure('public.aba_void_plan(uuid,uuid,bigint,uuid,text)') IS NULL
     OR to_regprocedure('public.aba_list_plan_versions(uuid)') IS NULL THEN
    RAISE EXCEPTION 'ABA: aplique antes 20261108_aba_plano_versionado.sql.';
  END IF;
END;
$requires$;

ALTER TABLE public.aba_plan_versions ADD COLUMN IF NOT EXISTS submitted_by UUID
  REFERENCES public.profiles(id) ON DELETE RESTRICT;

UPDATE public.aba_plan_versions SET submitted_by = authored_by
WHERE submitted_at IS NOT NULL AND submitted_by IS NULL;

DO $sender_check$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.aba_plan_versions'::regclass
      AND conname = 'aba_plan_versions_sender_check') THEN
    ALTER TABLE public.aba_plan_versions ADD CONSTRAINT aba_plan_versions_sender_check CHECK (
      (status IN ('em_revisao', 'aprovado', 'substituido')
        AND submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
      OR (status = 'rascunho' AND submitted_at IS NULL AND submitted_by IS NULL)
      OR (status = 'anulado' AND (
        (submitted_at IS NULL AND submitted_by IS NULL)
        OR (submitted_at IS NOT NULL AND submitted_by IS NOT NULL)
      ))
    );
  END IF;
END;
$sender_check$;

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
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR NO KEY UPDATE;
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
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.'
      USING ERRCODE = '23505';
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
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR NO KEY UPDATE;
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
  UPDATE public.aba_plan_versions SET status = 'em_revisao', submitted_at = clock_timestamp(), submitted_by = auth.uid(),
    client_event_id = p_client_event_id, revision = revision + 1, updated_at = clock_timestamp()
    WHERE id = p_plan_id;
  RETURN;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.'
      USING ERRCODE = '23505';
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
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR NO KEY UPDATE;
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
  RETURN;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.'
      USING ERRCODE = '23505';
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
  PERFORM 1 FROM public.patients WHERE id = p_patient_id AND erased_at IS NULL FOR NO KEY UPDATE;
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
  RETURN;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Esta ação ou versão já foi registrada. Recarregue os planos e use um novo evento.'
      USING ERRCODE = '23505';
END;
$aba_void_plan$;

REVOKE ALL ON FUNCTION public.aba_save_plan_draft(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_save_plan_draft(UUID, JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.aba_submit_plan(UUID, UUID, BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_submit_plan(UUID, UUID, BIGINT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.aba_approve_plan(UUID, UUID, BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_approve_plan(UUID, UUID, BIGINT, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.aba_void_plan(UUID, UUID, BIGINT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aba_void_plan(UUID, UUID, BIGINT, UUID, TEXT) TO authenticated;
