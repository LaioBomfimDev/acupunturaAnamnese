-- ==========================================================
-- Compartilhar paciente falhava SEMPRE (42702 "patient_id is ambiguous")
--
-- Achado (25/09/2026, reproduzido chamando a RPC como service_role
-- em transação com ROLLBACK): create_record_share_after_reauthentication
-- declara `RETURNS TABLE (id, patient_id, ...)`. Em PL/pgSQL cada coluna
-- de RETURNS TABLE vira uma VARIÁVEL da função, e o alvo de
-- `ON CONFLICT (patient_id, discipline)` é resolvido como expressão —
-- o nome `patient_id` passa a colidir com a variável de saída e o
-- Postgres aborta com 42702 ao chegar no INSERT de patient_enrollments.
--
-- Efeito: todo envio que passava pelas validações (senha, clínica,
-- dono/adm, matrícula de origem, destinatário) morria no último passo.
-- A Edge Function create-record-share mascara o motivo e devolve
-- "O compartilhamento não foi criado. Revise os vínculos e tente
-- novamente." — por isso parecia problema de vínculo. Nenhum
-- compartilhamento chegou a ser criado em produção (record_shares vazia).
-- O defeito existe desde 20260723_clinical_data_hardening.sql e foi
-- copiado adiante em 20260818 e 20260910.
--
-- CORREÇÃO: o alvo do ON CONFLICT passa a ser a constraint nomeada
-- (`ON CONFLICT ON CONSTRAINT patient_enrollments_patient_id_discipline_key`),
-- que não é expressão e não colide com variável. Nada mais muda: o
-- corpo abaixo é a versão viva de 20260910_neuropsicologia_discipline.sql
-- (conferida contra pg_get_functiondef em produção) com só essa linha
-- trocada. CREATE OR REPLACE mantém a assinatura; REVOKE/GRANT
-- reafirmados para não depender do estado anterior.
--
-- Regra destilada (AGENTS.md §9): função PL/pgSQL com RETURNS TABLE ou
-- parâmetro de mesmo nome de coluna usa ON CONFLICT ON CONSTRAINT, nunca
-- ON CONFLICT (coluna). Teste: tests/regression/plpgsql-on-conflict-ambiguity.test.mjs
-- ==========================================================

CREATE OR REPLACE FUNCTION public.create_record_share_after_reauthentication(
  p_actor_id UUID,
  p_actor_aal TEXT,
  p_patient_id UUID,
  p_from_discipline TEXT,
  p_to_discipline TEXT,
  p_to_user_id UUID,
  p_shared_scopes TEXT[],
  p_note TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  from_discipline TEXT,
  to_discipline TEXT,
  to_user_id UUID,
  shared_scopes TEXT[],
  note TEXT,
  created_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $create_record_share_after_reauthentication$
DECLARE
  v_actor_clinic UUID;
  v_actor_role TEXT;
  v_actor_active BOOLEAN;
  v_actor_password_pending BOOLEAN;
  v_actor_mfa_required BOOLEAN;
  v_patient_owner UUID;
  v_patient_clinic UUID;
  v_target_clinic UUID;
  v_target_active BOOLEAN;
  v_target_disciplines TEXT[];
  v_scopes TEXT[];
  v_note TEXT := NULLIF(BTRIM(p_note), '');
  v_existing public.record_shares%ROWTYPE;
  v_created public.record_shares%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION
      'Somente a Edge Function de reautenticação pode criar compartilhamentos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_patient_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Ator, paciente e idempotência são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o profissional que vai receber o compartilhamento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    profile.clinic_id,
    profile.role,
    profile.is_active,
    profile.must_change_password,
    profile.mfa_required
  INTO
    v_actor_clinic,
    v_actor_role,
    v_actor_active,
    v_actor_password_pending,
    v_actor_mfa_required
  FROM public.profiles profile
  WHERE profile.id = p_actor_id;

  IF NOT FOUND
     OR v_actor_active IS NOT TRUE
     OR v_actor_password_pending IS TRUE
     OR (v_actor_mfa_required IS TRUE AND p_actor_aal <> 'aal2') THEN
    RAISE EXCEPTION 'Ator sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT patient.therapist_id, patient.clinic_id
  INTO v_patient_owner, v_patient_clinic
  FROM public.patients patient
  WHERE patient.id = p_patient_id
    AND patient.archived_at IS NULL;

  IF NOT FOUND
     OR v_patient_clinic IS NULL
     OR v_patient_clinic IS DISTINCT FROM v_actor_clinic
     OR (
       v_patient_owner IS DISTINCT FROM p_actor_id
       AND v_actor_role NOT IN ('clinic_admin', 'super_admin')
     ) THEN
    RAISE EXCEPTION
      'Ator não pode compartilhar este paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF p_from_discipline IS NULL
     OR p_to_discipline IS NULL
     OR p_from_discipline = p_to_discipline
     OR p_from_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     )
     OR p_to_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplinas de origem/destino inválidas.'
      USING ERRCODE = '22023';
  END IF;

  -- O destinatário precisa ser colega ATIVO da MESMA clínica e de
  -- fato atuar na disciplina de destino — senão o encaminhamento
  -- vira um jeito de mandar prontuário para alguém sem relação com
  -- a disciplina escolhida.
  SELECT profile.clinic_id, profile.is_active, profile.disciplines
  INTO v_target_clinic, v_target_active, v_target_disciplines
  FROM public.profiles profile
  WHERE profile.id = p_to_user_id;

  IF NOT FOUND
     OR v_target_active IS NOT TRUE
     OR v_target_clinic IS DISTINCT FROM v_patient_clinic
     OR NOT (p_to_discipline = ANY(COALESCE(v_target_disciplines, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION
      'Destinatário inválido: precisa ser um profissional ativo da instituição, atuando na disciplina de destino.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patient_enrollments enrollment
    WHERE enrollment.patient_id = p_patient_id
      AND enrollment.clinic_id = v_patient_clinic
      AND enrollment.discipline = p_from_discipline
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Paciente não possui matrícula ativa na disciplina de origem.'
      USING ERRCODE = '22023';
  END IF;

  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Nota de encaminhamento excede 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    array_agg(scope_id ORDER BY scope_id),
    ARRAY[]::TEXT[]
  )
  INTO v_scopes
  FROM (
    SELECT DISTINCT BTRIM(candidate.scope_id) AS scope_id
    FROM unnest(COALESCE(p_shared_scopes, ARRAY[]::TEXT[]))
      AS candidate(scope_id)
    WHERE BTRIM(candidate.scope_id) = ANY (
      ARRAY['cadastro', 'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio']::TEXT[]
    )
  ) normalized_scopes;
  v_scopes := ARRAY['cadastro']::TEXT[] || array_remove(v_scopes, 'cadastro');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'record-share:' || p_actor_id::TEXT || ':' || p_idempotency_key::TEXT,
      0
    )
  );

  SELECT share.*
  INTO v_existing
  FROM public.record_shares share
  WHERE share.shared_by = p_actor_id
    AND share.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.patient_id IS DISTINCT FROM p_patient_id
       OR v_existing.from_discipline IS DISTINCT FROM p_from_discipline
       OR v_existing.to_discipline IS DISTINCT FROM p_to_discipline
       OR v_existing.to_user_id IS DISTINCT FROM p_to_user_id
       OR v_existing.shared_scopes IS DISTINCT FROM v_scopes
       OR v_existing.note IS DISTINCT FROM v_note THEN
      RAISE EXCEPTION 'Idempotência já usada com outro compartilhamento.'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.patient_id,
      v_existing.from_discipline,
      v_existing.to_discipline,
      v_existing.to_user_id,
      v_existing.shared_scopes,
      v_existing.note,
      v_existing.created_at,
      v_existing.revoked_at;
    RETURN;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.record_share_actor_id',
    p_actor_id::TEXT,
    TRUE
  );

  INSERT INTO public.patient_enrollments (
    patient_id,
    clinic_id,
    discipline,
    status,
    referred_by
  )
  VALUES (
    p_patient_id,
    v_patient_clinic,
    p_to_discipline,
    'active',
    p_actor_id
  )
  ON CONFLICT ON CONSTRAINT patient_enrollments_patient_id_discipline_key
  DO UPDATE
  SET status = 'active',
      updated_at = pg_catalog.clock_timestamp();

  INSERT INTO public.record_shares (
    patient_id,
    clinic_id,
    from_discipline,
    to_discipline,
    to_user_id,
    shared_scopes,
    shared_by,
    note,
    idempotency_key
  )
  VALUES (
    p_patient_id,
    v_patient_clinic,
    p_from_discipline,
    p_to_discipline,
    p_to_user_id,
    v_scopes,
    p_actor_id,
    v_note,
    p_idempotency_key
  )
  RETURNING * INTO v_created;

  RETURN QUERY
  SELECT
    v_created.id,
    v_created.patient_id,
    v_created.from_discipline,
    v_created.to_discipline,
    v_created.to_user_id,
    v_created.shared_scopes,
    v_created.note,
    v_created.created_at,
    v_created.revoked_at;
END;
$create_record_share_after_reauthentication$;

REVOKE ALL ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT[], TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT[], TEXT, UUID
) TO service_role;
