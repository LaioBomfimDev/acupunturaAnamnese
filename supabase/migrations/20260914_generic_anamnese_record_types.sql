-- ==========================================================
-- Libera fisio_anamnese e nutri_anamnese no upsert versionado
--
-- Bug real: quando Fisioterapia e Nutrição migraram para o workspace
-- genérico (DisciplineWorkspace.jsx, ver docs/plano-anamnese-
-- multidisciplinar.md), a lista de record_type aceitos por
-- upsert_versioned_clinical_record nunca foi atualizada — ficou travada
-- em ['full_session', 'psi_anamnese', 'psi_neuro_avaliacao']
-- (20260723_clinical_data_hardening.sql, repetido tal e qual em
-- 20260910_neuropsicologia_discipline.sql ao trocar só o array de
-- disciplinas). Resultado: toda tentativa de salvar (autosave ou botão)
-- uma anamnese de fisioterapia ('fisio_anamnese') ou nutrição
-- ('nutri_anamnese') sempre foi rejeitada pelo RPC com "Tipo de ficha
-- não permitido para upsert versionado" — mesma classe de bug já
-- corrigida uma vez para psi_neuro_avaliacao/neuropsicologia.
--
-- Corpo idêntico à versão viva (20260910_neuropsicologia_discipline.sql,
-- linha ~262): só o array de record_type e o par record_type/discipline
-- ganham as duas entradas novas. Nenhuma outra regra muda.
-- ==========================================================

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
       ARRAY['full_session', 'psi_anamnese', 'psi_neuro_avaliacao', 'fisio_anamnese', 'nutri_anamnese']::TEXT[]
     )
     OR (p_record_type = 'psi_anamnese' AND p_discipline <> 'psicologia')
     OR (p_record_type = 'psi_neuro_avaliacao' AND p_discipline <> 'neuropsicologia')
     OR (p_record_type = 'fisio_anamnese' AND p_discipline <> 'fisioterapia')
     OR (p_record_type = 'nutri_anamnese' AND p_discipline <> 'nutricao') THEN
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

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  pg_catalog.pg_get_functiondef('public.upsert_versioned_clinical_record'::regproc)
    LIKE '%fisio_anamnese%'
  AND pg_catalog.pg_get_functiondef('public.upsert_versioned_clinical_record'::regproc)
    LIKE '%nutri_anamnese%' AS record_types_liberados;
