-- ==========================================================
-- Neuropsicologia vira disciplina própria (não mais um modo escondido
-- dentro de Psicologia). Decisão da usuária, 2026-09-10.
--
-- REQUER (já aplicadas): 20260708_clinic_patients_enrollments.sql,
-- 20260709_record_shares.sql, 20260723_clinical_data_hardening.sql,
-- 20260809_appointments.sql, 20260818_record_share_target_professional.sql,
-- 20260903_patient_evolutions.sql, 20260908_financeiro_backend.sql.
--
-- O que esta migração faz:
--   1. Libera 'neuropsicologia' nos 8 CHECK de coluna `discipline`
--      (7 tabelas — record_shares tem 2 colunas) que hoje só aceitam
--      as 4 disciplinas antigas.
--   2. Recria (CREATE OR REPLACE, mesma assinatura) as 5 RPCs que
--      validam disciplina no corpo em PL/pgSQL, além do CHECK da
--      tabela: insert_clinical_record, get_latest_clinical_record,
--      upsert_versioned_clinical_record, create_record_share_after_
--      reauthentication e insert_patient_evolution. Corpo copiado da
--      versão hoje viva de cada uma (a mais recente entre as
--      migrations que a redefinem), só com o array de disciplinas
--      atualizado — nenhuma outra regra muda.
--   3. ACHADO CRÍTICO (não estava no plano inicial): upsert_versioned_
--      clinical_record trava, à parte do CHECK genérico, que todo
--      registro do tipo 'psi_neuro_avaliacao' só pode ter
--      discipline = 'psicologia'. Sem corrigir essa regra aqui, o
--      workspace novo de Neuropsicologia teria toda tentativa de
--      salvar avaliação rejeitada por este RPC, mesmo com o CHECK da
--      tabela já corrigido. Ajustada para exigir
--      discipline = 'neuropsicologia' para esse record_type (mantendo
--      psi_anamnese travado em 'psicologia', sem mudança).
--   4. Backfill: histórico de avaliação neuropsicológica já salvo com
--      discipline='psicologia' migra para 'neuropsicologia' (decisão
--      da usuária — corte limpo, sem ler dos dois valores depois).
--   5. Libera acesso automático a quem já tem 'psicologia' (decisão
--      temporária de fase de testes, a revisar antes do lançamento —
--      nem todo psicólogo é neuropsicólogo).
-- ==========================================================

-- ----------------------------------------------------------
-- 1) CHECK de discipline nas 7 tabelas (8 colunas) — helper temporário
-- que localiza o CHECK single-column pela coluna real (attnum), não
-- pelo nome (nenhum desses CHECKs foi nomeado explicitamente nas
-- migrations originais, então o Postgres gerou nomes automáticos).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public._replace_discipline_check(
  p_table TEXT,
  p_column TEXT,
  p_constraint_name TEXT,
  p_allowed TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_attnum SMALLINT;
  v_old_name TEXT;
  v_list TEXT;
BEGIN
  SELECT a.attnum INTO v_attnum
  FROM pg_attribute a
  WHERE a.attrelid = ('public.' || p_table)::regclass
    AND a.attname = p_column
    AND NOT a.attisdropped;

  IF v_attnum IS NULL THEN
    RAISE EXCEPTION 'Coluna %.% não encontrada.', p_table, p_column;
  END IF;

  -- Remove o CHECK single-column existente nessa coluna (nome antigo,
  -- gerado automaticamente) e, por idempotência, um eventual
  -- constraint que já tenha o nome novo (caso esta migração seja
  -- reaplicada).
  FOR v_old_name IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = ('public.' || p_table)::regclass
      AND contype = 'c'
      AND (conkey = ARRAY[v_attnum]::smallint[] OR conname = p_constraint_name)
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_old_name);
  END LOOP;

  SELECT string_agg(quote_literal(v), ', ') INTO v_list FROM unnest(p_allowed) v;
  EXECUTE format(
    'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%I IN (%s))',
    p_table, p_constraint_name, p_column, v_list
  );
END;
$$;

DO $$
DECLARE
  v_all TEXT[] := ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia'];
BEGIN
  PERFORM public._replace_discipline_check('clinical_records', 'discipline', 'clinical_records_discipline_check', v_all);
  PERFORM public._replace_discipline_check('patient_enrollments', 'discipline', 'patient_enrollments_discipline_check', v_all);
  PERFORM public._replace_discipline_check('record_shares', 'from_discipline', 'record_shares_from_discipline_check', v_all);
  PERFORM public._replace_discipline_check('record_shares', 'to_discipline', 'record_shares_to_discipline_check', v_all);
  PERFORM public._replace_discipline_check('appointments', 'discipline', 'appointments_discipline_check', v_all);
  PERFORM public._replace_discipline_check('patient_evolutions', 'discipline', 'patient_evolutions_discipline_check', v_all);
  PERFORM public._replace_discipline_check('procedure_prices', 'discipline', 'procedure_prices_discipline_check', v_all);
  PERFORM public._replace_discipline_check('convenio_procedure_prices', 'discipline', 'convenio_procedure_prices_discipline_check', v_all);
END $$;

DROP FUNCTION public._replace_discipline_check(TEXT, TEXT, TEXT, TEXT[]);

-- ----------------------------------------------------------
-- 2) RPCs — corpo copiado da versão viva mais recente de cada uma,
-- só com o array/regra de disciplina atualizados. Assinatura idêntica
-- em todas: CREATE OR REPLACE preserva REVOKE/GRANT existentes.
-- ----------------------------------------------------------

-- insert_clinical_record — versão viva: 20260723_clinical_data_hardening.sql:633
CREATE OR REPLACE FUNCTION public.insert_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT,
  p_discipline TEXT DEFAULT 'acupuntura'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $insert_clinical_record$
DECLARE
  v_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_record_type IS NULL OR BTRIM(p_record_type) = '' OR p_data IS NULL THEN
    RAISE EXCEPTION 'Tipo e conteúdo da ficha são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.clinical_records (
    patient_id,
    therapist_id,
    record_type,
    discipline,
    sensitive_data_encrypted,
    revision
  )
  VALUES (
    p_patient_id,
    v_uid,
    BTRIM(p_record_type),
    p_discipline,
    extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
    1
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$insert_clinical_record$;

-- get_latest_clinical_record — versão viva: 20260723_clinical_data_hardening.sql:807
CREATE OR REPLACE FUNCTION public.get_latest_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_discipline TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
  discipline TEXT,
  revision BIGINT,
  sensitive_data TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $get_latest_clinical_record$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_record_type IS NULL OR BTRIM(p_record_type) = '' THEN
    RAISE EXCEPTION 'Tipo da ficha é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NOT NULL
     AND p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    cr.discipline,
    cr.revision,
    extensions.pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = v_uid
    AND cr.record_type = BTRIM(p_record_type)
    AND (p_discipline IS NULL OR cr.discipline = p_discipline)
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
END;
$get_latest_clinical_record$;

-- upsert_versioned_clinical_record — versão viva: 20260723_clinical_data_hardening.sql:882
-- ÚNICA mudança de regra além do array: o par record_type/discipline
-- travado para 'psi_neuro_avaliacao' passa a exigir
-- discipline = 'neuropsicologia' (era 'psicologia' — a avaliação
-- neuropsicológica migrou de disciplina, ver backfill abaixo).
-- 'psi_anamnese' continua travado em 'psicologia', sem mudança.
CREATE OR REPLACE FUNCTION public.upsert_versioned_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT,
  p_expected_revision BIGINT,
  p_idempotency_key UUID,
  p_discipline TEXT
)
RETURNS TABLE (
  id UUID,
  revision BIGINT,
  updated_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $upsert_versioned_clinical_record$
DECLARE
  v_uid UUID := auth.uid();
  v_request_hash TEXT;
  v_receipt public.clinical_record_write_receipts%ROWTYPE;
  v_record public.clinical_records%ROWTYPE;
  v_record_found BOOLEAN := FALSE;
  v_result_id UUID;
  v_result_revision BIGINT;
  v_result_updated_at TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Conteúdo e revisão esperada não negativa são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotência é obrigatória.'
      USING ERRCODE = '22023';
  END IF;

  IF p_record_type IS NULL
     OR p_record_type <> ALL (
       ARRAY['full_session', 'psi_anamnese', 'psi_neuro_avaliacao']::TEXT[]
     )
     OR (p_record_type = 'psi_anamnese' AND p_discipline <> 'psicologia')
     OR (p_record_type = 'psi_neuro_avaliacao' AND p_discipline <> 'neuropsicologia') THEN
    RAISE EXCEPTION
      'Tipo de ficha não permitido para upsert versionado.'
      USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.concat_ws(
        pg_catalog.chr(31),
        p_patient_id::TEXT,
        p_record_type,
        p_discipline,
        p_expected_revision::TEXT,
        p_data
      ),
      'sha256'
    ),
    'hex'
  );

  -- Serializa replays da mesma operação.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'clinical-idempotency:' || v_uid::TEXT || ':' || p_idempotency_key::TEXT,
      0
    )
  );

  SELECT r.*
  INTO v_receipt
  FROM public.clinical_record_write_receipts r
  WHERE r.actor_id = v_uid
    AND r.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_receipt.request_hash <> v_request_hash THEN
      RAISE EXCEPTION
        'Chave de idempotência já usada com outro conteúdo.'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      v_receipt.record_id,
      v_receipt.revision,
      v_receipt.updated_at,
      TRUE;
    RETURN;
  END IF;

  -- Evita duas criações concorrentes para paciente/tipo/disciplina.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'clinical-record:' || v_uid::TEXT || ':' || p_patient_id::TEXT
        || ':' || p_record_type || ':' || p_discipline,
      0
    )
  );

  SELECT cr.*
  INTO v_record
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = v_uid
    AND cr.record_type = p_record_type
    AND cr.discipline = p_discipline
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1
  FOR UPDATE;

  v_record_found := FOUND;

  PERFORM pg_catalog.set_config(
    'app.clinical_idempotency_key',
    p_idempotency_key::TEXT,
    TRUE
  );

  IF v_record_found THEN
    IF v_record.revision <> p_expected_revision THEN
      RAISE EXCEPTION
        'Conflito de revisão: esperado %, atual %.',
        p_expected_revision,
        v_record.revision
        USING
          ERRCODE = '40001',
          HINT = 'Recarregue a ficha mais recente antes de salvar novamente.';
    END IF;

    UPDATE public.clinical_records cr
    SET sensitive_data_encrypted =
          extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
        revision = cr.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    WHERE cr.id = v_record.id
      AND cr.therapist_id = v_uid
      AND cr.revision = p_expected_revision
    RETURNING cr.id, cr.revision, cr.updated_at
    INTO v_result_id, v_result_revision, v_result_updated_at;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Conflito de revisão durante a gravação.'
        USING
          ERRCODE = '40001',
          HINT = 'Recarregue a ficha mais recente antes de salvar novamente.';
    END IF;
  ELSE
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION
        'Conflito de revisão: a sessão ainda não existe; use revisão esperada 0.'
        USING
          ERRCODE = '40001',
          HINT = 'Recarregue a ficha antes de salvar novamente.';
    END IF;

    INSERT INTO public.clinical_records AS cr (
      patient_id,
      therapist_id,
      record_type,
      discipline,
      sensitive_data_encrypted,
      revision,
      updated_at
    )
    VALUES (
      p_patient_id,
      v_uid,
      p_record_type,
      p_discipline,
      extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
      1,
      pg_catalog.clock_timestamp()
    )
    RETURNING
      cr.id,
      cr.revision,
      cr.updated_at
    INTO v_result_id, v_result_revision, v_result_updated_at;
  END IF;

  INSERT INTO public.clinical_record_write_receipts (
    actor_id,
    idempotency_key,
    request_hash,
    record_id,
    patient_id,
    record_type,
    discipline,
    revision,
    updated_at
  )
  VALUES (
    v_uid,
    p_idempotency_key,
    v_request_hash,
    v_result_id,
    p_patient_id,
    p_record_type,
    p_discipline,
    v_result_revision,
    v_result_updated_at
  );

  PERFORM pg_catalog.set_config('app.clinical_idempotency_key', '', TRUE);

  RETURN QUERY
  SELECT
    v_result_id,
    v_result_revision,
    v_result_updated_at,
    FALSE;
END;
$upsert_versioned_clinical_record$;

-- create_record_share_after_reauthentication — versão viva:
-- 20260818_record_share_target_professional.sql:132
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
  ON CONFLICT (patient_id, discipline)
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

-- insert_patient_evolution — versão viva: 20260903_patient_evolutions.sql:354
CREATE OR REPLACE FUNCTION public.insert_patient_evolution(
  p_patient_id UUID,
  p_discipline TEXT,
  p_data TEXT,
  p_appointment_id UUID DEFAULT NULL,
  p_atendimento_em TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  atendimento_em TIMESTAMPTZ,
  registrado_em TIMESTAMPTZ,
  attendance_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $insert_patient_evolution$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR pg_catalog.btrim(p_data) = '' THEN
    RAISE EXCEPTION 'Conteúdo da evolução é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = p_patient_id AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  -- Checagem antecipada só para dar um erro amigável cedo; o trigger
  -- de INSERT repete a mesma checagem de forma incondicional.
  IF p_appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = p_appointment_id
      AND a.patient_id = p_patient_id
      AND a.professional_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: agendamento não pertence ao profissional autenticado para este paciente.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.patient_evolutions AS pe (
    patient_id,
    therapist_id,
    discipline,
    appointment_id,
    atendimento_em,
    conteudo_encrypted
  )
  VALUES (
    p_patient_id,
    v_uid,
    p_discipline,
    p_appointment_id,
    p_atendimento_em,
    extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key())
  )
  RETURNING pe.id INTO v_id;

  RETURN QUERY
  SELECT pe.id, pe.atendimento_em, pe.registrado_em, pe.attendance_status
  FROM public.patient_evolutions pe
  WHERE pe.id = v_id;
END;
$insert_patient_evolution$;

-- ----------------------------------------------------------
-- 3) Backfill: histórico de avaliação neuropsicológica migra de
-- discipline='psicologia' para 'neuropsicologia'. Só o record_type
-- certo — não toca anamnese/evolução comuns de Psicologia. O UPDATE
-- passa pelos triggers de revisão/auditoria de clinical_records
-- (clinical_records_enforce_revision exige revision = revision + 1 em
-- todo UPDATE — mesmo padrão já usado por
-- 20260723_clinical_data_hardening.sql:444-473 para uma reclassificação
-- de disciplina análoga).
-- ----------------------------------------------------------
UPDATE public.clinical_records
SET discipline = 'neuropsicologia',
    revision = revision + 1,
    updated_at = pg_catalog.clock_timestamp()
WHERE record_type = 'psi_neuro_avaliacao'
  AND discipline = 'psicologia';

-- ----------------------------------------------------------
-- 4) Unlock automático — decisão temporária de fase de testes
-- (usuária: "nem todo psi tem neuro", revisar controle de acesso fino
-- antes do lançamento real). Remover este bloco quando isso acontecer.
-- ----------------------------------------------------------
UPDATE public.profiles
SET disciplines = array_append(disciplines, 'neuropsicologia')
WHERE 'psicologia' = ANY(disciplines)
  AND NOT ('neuropsicologia' = ANY(disciplines));

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  conname,
  pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE conname IN (
  'clinical_records_discipline_check',
  'patient_enrollments_discipline_check',
  'record_shares_from_discipline_check',
  'record_shares_to_discipline_check',
  'appointments_discipline_check',
  'patient_evolutions_discipline_check',
  'procedure_prices_discipline_check',
  'convenio_procedure_prices_discipline_check'
)
ORDER BY conname;
