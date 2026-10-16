-- ==========================================================
-- Ficha da área abre para quem atende o paciente (16/10/2026)
-- REQUER: 20260910_neuropsicologia_discipline (versão de
-- get_latest_clinical_record da qual esta parte),
-- 20260914_generic_anamnese_record_types (versão de
-- upsert_versioned_clinical_record) e 20261012_instrument_result_responsible
-- (can_use_patient_instruments).
--
-- Por quê: as duas funções só abriam a ficha clínica de uma área (anamnese
-- da Psicologia, Neuropsicologia, Fisioterapia, Nutrição, sessão da
-- Acupuntura) para quem CADASTROU o paciente (patients.therapist_id). Na
-- clínica multidisciplinar o cadastro é da instituição: quem atende um
-- paciente cadastrado por outra pessoa recebia "Erro ao carregar a ficha"
-- e não conseguia salvar.
--
-- O que muda (o resto das duas funções é cópia fiel das versões acima):
--   * a conferência de acesso aceita também quem atende o paciente na área
--     (can_use_patient_instruments: atendimento na Agenda ou responsável da
--     matrícula, na mesma clínica, com a área liberada no perfil);
--   * a ficha continua sendo de cada profissional: leitura e gravação seguem
--     filtradas por clinical_records.therapist_id = auth.uid(). Quem passa a
--     atender começa a própria ficha; não lê a de quem atendeu antes;
--   * a administração que não atende continua de fora (a tela mostra um
--     aviso no lugar do erro). Evoluções não mudam: já seguem a Agenda.
--
-- Reverter: recriar get_latest_clinical_record a partir de
-- 20260910_neuropsicologia_discipline.sql e upsert_versioned_clinical_record
-- a partir de 20260914_generic_anamnese_record_types.sql.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regprocedure('public.can_use_patient_instruments(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261012_instrument_result_responsible.sql.';
  END IF;
END;
$requires$;

-- get_latest_clinical_record — versão anterior: 20260910_neuropsicologia_discipline.sql
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

  -- 20261016b: quem cadastrou o paciente OU quem o atende nesta área
  -- (atendimento na Agenda ou responsável da matrícula, a mesma regra das
  -- escalas). A ficha continua sendo de cada profissional: logo abaixo,
  -- só os registros de v_uid. Administração que não atende segue de fora.
  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND (
        p.therapist_id = v_uid
        OR (
          p_discipline IS NOT NULL
          AND public.can_use_patient_instruments(p.id, p_discipline, v_uid)
        )
      )
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

-- upsert_versioned_clinical_record — versão anterior: 20260914_generic_anamnese_record_types.sql
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

  -- 20261016b: quem cadastrou o paciente OU quem o atende nesta área
  -- (atendimento na Agenda ou responsável da matrícula, a mesma regra das
  -- escalas). A ficha continua sendo de cada profissional: logo abaixo,
  -- só os registros de v_uid. Administração que não atende segue de fora.
  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND (
        p.therapist_id = v_uid
        OR (
          p_discipline IS NOT NULL
          AND public.can_use_patient_instruments(p.id, p_discipline, v_uid)
        )
      )
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
  position('can_use_patient_instruments' IN pg_get_functiondef('public.get_latest_clinical_record(uuid, text, text)'::regprocedure)) > 0 AS leitura_aceita_quem_atende,
  position('can_use_patient_instruments' IN pg_get_functiondef('public.upsert_versioned_clinical_record(uuid, text, text, bigint, uuid, text)'::regprocedure)) > 0 AS gravacao_aceita_quem_atende;
