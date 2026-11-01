-- ==========================================================
-- ABA, segunda etapa: fidelidade, concordância (IOA) e alertas
-- REQUER: 20261101b_aba_coleta.sql (tabelas aba_*, aba_require_patient,
-- aba_encrypt/aba_decrypt_text e a versão de admin_decide_patient_deletion
-- que já apaga as tabelas ABA).
--
-- Origem: Atlas (202607280029_fidelity_and_ioa e as regras de
-- refresh_clinical_alerts de 202607310037), trazido sem dado nenhum.
-- Pedido do usuário em 31/10/2026: "vá pra segunda etapa".
--
--   * Fidelidade de aplicação por sessão, em duas fontes: autoavaliação de
--     quem atendeu e revisão da supervisão do time. Os itens são códigos
--     fixos (o rótulo vem do cliente), então não há texto sobre a criança
--     em claro; a observação vai cifrada.
--   * Concordância entre observadores (IOA): só a supervisão registra. Os
--     dois valores brutos ficam guardados e o % é calculado aqui, pelo
--     método escolhido — o cliente só mostra a prévia.
--   * Alertas: regras ABA recalculadas por aba_refresh_alerts (clínica
--     inteira, com trava por clínica e intervalo mínimo). Alerta some
--     sozinho quando a condição deixa de existir; a supervisão pode
--     dispensar e reabrir. Quem vê é quem enxerga o paciente
--     (aba_can_access_patient).
--
-- Sem acesso direto às tabelas: RLS ligada, nenhuma policy, REVOKE ALL.
--
-- Reverter: recriar admin_decide_patient_deletion a partir de
-- 20261101b_aba_coleta.sql, DROP FUNCTION das funções novas e DROP TABLE
-- aba_alerts, aba_alert_refreshes, aba_ioa_records, aba_session_fidelity.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.aba_sessions') IS NULL
     OR to_regprocedure('public.aba_require_patient(uuid,boolean)') IS NULL
     OR to_regprocedure('public.aba_encrypt(text)') IS NULL THEN
    RAISE EXCEPTION 'ABA: aplique antes 20261101b_aba_coleta.sql.';
  END IF;
END
$requires$;

-- ----------------------------------------------------------
-- 1. Tabelas
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aba_session_fidelity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('autoavaliacao', 'supervisao')),
  assessor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- [{ "key": "preparo", "met": true, "applicable": true }, ...]
  items JSONB NOT NULL
    CHECK (jsonb_typeof(items) = 'array' AND octet_length(items::TEXT) <= 4096),
  applicable_count INTEGER NOT NULL CHECK (applicable_count > 0),
  met_count INTEGER NOT NULL CHECK (met_count >= 0 AND met_count <= applicable_count),
  score_percentage NUMERIC(5,2) NOT NULL CHECK (score_percentage BETWEEN 0 AND 100),
  notes_encrypted BYTEA,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT aba_session_fidelity_unique_source UNIQUE (session_id, source)
);

CREATE INDEX IF NOT EXISTS aba_session_fidelity_patient
  ON public.aba_session_fidelity(patient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.aba_ioa_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES public.aba_sessions(id) ON DELETE SET NULL,
  program_id UUID REFERENCES public.aba_programs(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK (method IN (
    'tentativa_por_tentativa', 'intervalo_por_intervalo', 'contagem_total', 'duracao_latencia'
  )),
  -- Valores brutos dos dois observadores (acordos/oportunidades ou os dois
  -- totais, conforme o método). O Manual proíbe descartar o dado bruto.
  primary_value NUMERIC NOT NULL CHECK (primary_value BETWEEN 0 AND 1000000),
  secondary_value NUMERIC NOT NULL CHECK (secondary_value BETWEEN 0 AND 1000000),
  agreement_percentage NUMERIC(5,2) NOT NULL CHECK (agreement_percentage BETWEEN 0 AND 100),
  secondary_observer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  observed_on DATE NOT NULL,
  notes_encrypted BYTEA,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS aba_ioa_records_patient
  ON public.aba_ioa_records(patient_id, observed_on DESC);

CREATE TABLE IF NOT EXISTS public.aba_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  program_id UUID REFERENCES public.aba_programs(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  -- Regra + sujeito (programa, comportamento, sessão…): um alerta por
  -- condição, que volta a abrir se a condição sumir e reaparecer.
  rule_key TEXT NOT NULL CHECK (char_length(rule_key) <= 120),
  type TEXT NOT NULL CHECK (type IN (
    'programa_sem_coleta', 'baixa_evolucao', 'criterio_atingido', 'aumento_comportamento',
    'novo_comportamento', 'perda_eficiencia', 'situacao_risco', 'revisao_pendente',
    'correcao_atrasada', 'fidelidade_baixa', 'concordancia_baixa'
  )),
  category TEXT NOT NULL CHECK (category IN ('clinico', 'supervisao')),
  priority TEXT NOT NULL CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  -- Só nomes que já ficam em claro (programa, comportamento, reforçador),
  -- números e datas.
  message TEXT NOT NULL CHECK (char_length(message) <= 600),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'resolved')),
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  last_detected_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  condition_cleared_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_note_encrypted BYTEA,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  CONSTRAINT aba_alerts_unique_rule UNIQUE (clinic_id, rule_key)
);

CREATE INDEX IF NOT EXISTS aba_alerts_open
  ON public.aba_alerts(clinic_id, status, last_detected_at DESC);
CREATE INDEX IF NOT EXISTS aba_alerts_patient ON public.aba_alerts(patient_id);

-- Última atualização dos alertas por clínica (intervalo mínimo entre duas).
CREATE TABLE IF NOT EXISTS public.aba_alert_refreshes (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  refreshed_at TIMESTAMPTZ NOT NULL,
  refreshed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

DO $aba_lock_quality_tables$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'aba_session_fidelity', 'aba_ioa_records', 'aba_alerts', 'aba_alert_refreshes'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END
$aba_lock_quality_tables$;

-- ----------------------------------------------------------
-- 2. Auxiliares
-- ----------------------------------------------------------
-- Número vindo do jsonb da definição do programa; lixo vira nulo.
CREATE OR REPLACE FUNCTION public.aba_num(p_value TEXT)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $aba_num$
  SELECT CASE
    WHEN btrim(COALESCE(p_value, '')) ~ '^-?[0-9]+(\.[0-9]+)?$' THEN btrim(p_value)::NUMERIC
    ELSE NULL::NUMERIC
  END;
$aba_num$;

-- Grau de intrusão da ajuda (catalog.js PROMPT_LEVELS). Fora da escala de
-- ajuda (aproximada, erro, sem resposta…) devolve nulo.
CREATE OR REPLACE FUNCTION public.aba_prompt_rank(p_response TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $aba_prompt_rank$
  SELECT CASE p_response
    WHEN 'independente' THEN 0
    WHEN 'ajuda_visual' THEN 1
    WHEN 'ajuda_gestual' THEN 2
    WHEN 'ajuda_verbal' THEN 3
    WHEN 'modelacao' THEN 4
    WHEN 'fisica_parcial' THEN 5
    WHEN 'fisica_total' THEN 6
    ELSE NULL
  END;
$aba_prompt_rank$;

-- Concordância pelo método (Manual pág. 144), espelhada em
-- utils/aba/quality.js (ioaAgreement):
--   contagem total e duração/latência: menor ÷ maior × 100 (0 e 0 = 100);
--   tentativa e intervalo: acordos ÷ oportunidades × 100.
CREATE OR REPLACE FUNCTION public.aba_ioa_agreement(
  p_method TEXT,
  p_primary NUMERIC,
  p_secondary NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $aba_ioa_agreement$
BEGIN
  IF p_primary IS NULL OR p_secondary IS NULL OR p_primary < 0 OR p_secondary < 0 THEN
    RAISE EXCEPTION 'Informe os dois valores (zero ou mais).' USING ERRCODE = '22023';
  END IF;
  IF p_method IN ('contagem_total', 'duracao_latencia') THEN
    IF greatest(p_primary, p_secondary) = 0 THEN
      RETURN 100;
    END IF;
    RETURN round(least(p_primary, p_secondary) / greatest(p_primary, p_secondary) * 100, 2);
  END IF;
  IF p_method IN ('tentativa_por_tentativa', 'intervalo_por_intervalo') THEN
    IF p_secondary = 0 THEN
      RAISE EXCEPTION 'Informe quantas oportunidades houve (mais que zero).' USING ERRCODE = '22023';
    END IF;
    IF p_primary > p_secondary THEN
      RAISE EXCEPTION 'Os acordos não podem passar das oportunidades.' USING ERRCODE = '22023';
    END IF;
    RETURN round(p_primary / p_secondary * 100, 2);
  END IF;
  RAISE EXCEPTION 'Método de concordância inválido.' USING ERRCODE = '22023';
END;
$aba_ioa_agreement$;

CREATE OR REPLACE FUNCTION public.aba_fidelity_json(p_row public.aba_session_fidelity, p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_fidelity_json$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'session_id', p_row.session_id,
    'source', p_row.source,
    'assessor_id', p_row.assessor_id,
    'items', p_row.items,
    'applicable_count', p_row.applicable_count,
    'met_count', p_row.met_count,
    'score_percentage', p_row.score_percentage,
    'notes', public.aba_decrypt_text(p_row.notes_encrypted, p_key),
    'revision', p_row.revision,
    'updated_at', p_row.updated_at
  );
$aba_fidelity_json$;

CREATE OR REPLACE FUNCTION public.aba_ioa_json(p_row public.aba_ioa_records, p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_ioa_json$
  SELECT jsonb_build_object(
    'id', p_row.id,
    'session_id', p_row.session_id,
    'program_id', p_row.program_id,
    'method', p_row.method,
    'primary_value', p_row.primary_value,
    'secondary_value', p_row.secondary_value,
    'agreement_percentage', p_row.agreement_percentage,
    'secondary_observer_id', p_row.secondary_observer_id,
    'observed_on', p_row.observed_on,
    'notes', public.aba_decrypt_text(p_row.notes_encrypted, p_key),
    'created_by', p_row.created_by,
    'created_at', p_row.created_at
  );
$aba_ioa_json$;

-- ----------------------------------------------------------
-- 3. Fidelidade de aplicação
-- ----------------------------------------------------------
-- Itens válidos por origem (rótulos em utils/aba/quality.js).
CREATE OR REPLACE FUNCTION public.aba_fidelity_keys(p_source TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $aba_fidelity_keys$
  SELECT CASE p_source
    WHEN 'autoavaliacao' THEN ARRAY['preparo', 'ajuda', 'reforco', 'registro', 'assentimento']
    WHEN 'supervisao' THEN ARRAY['procedimento', 'ajuda_reforco', 'coleta', 'seguranca', 'registro_clinico']
    ELSE ARRAY[]::TEXT[]
  END;
$aba_fidelity_keys$;

CREATE OR REPLACE FUNCTION public.aba_save_fidelity(
  p_session_id UUID,
  p_source TEXT,
  p_items JSONB,
  p_notes TEXT,
  p_expected_revision BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_fidelity$
DECLARE
  v_session public.aba_sessions%ROWTYPE;
  v_existing public.aba_session_fidelity%ROWTYPE;
  v_saved public.aba_session_fidelity%ROWTYPE;
  v_uid UUID;
  v_keys TEXT[] := public.aba_fidelity_keys(p_source);
  v_items JSONB;
  v_applicable INTEGER;
  v_met INTEGER;
BEGIN
  IF cardinality(v_keys) = 0 THEN
    RAISE EXCEPTION 'Origem de fidelidade inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_session FROM public.aba_sessions WHERE id = p_session_id;
  IF v_session.id IS NULL THEN
    RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_session.patient_id, p_source = 'supervisao');

  IF p_source = 'autoavaliacao'
     AND v_session.therapist_id <> v_uid
     AND NOT public.is_clinic_admin(v_uid) THEN
    RAISE EXCEPTION 'A autoavaliação é de quem atendeu a sessão.' USING ERRCODE = '42501';
  END IF;
  IF v_session.status = 'em_andamento' THEN
    RAISE EXCEPTION 'Finalize a coleta antes de avaliar a fidelidade.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_items, 'null'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Itens de fidelidade inválidos.' USING ERRCODE = '22023';
  END IF;

  -- Normaliza: um item por código conhecido, na ordem da lista.
  SELECT
    jsonb_agg(jsonb_build_object(
      'key', key_list.item_key,
      'met', COALESCE(item.met, FALSE) AND COALESCE(item.applicable, TRUE),
      'applicable', COALESCE(item.applicable, TRUE)
    ) ORDER BY key_list.ord),
    count(*) FILTER (WHERE COALESCE(item.applicable, TRUE)),
    count(*) FILTER (WHERE COALESCE(item.applicable, TRUE) AND COALESCE(item.met, FALSE))
  INTO v_items, v_applicable, v_met
  FROM unnest(v_keys) WITH ORDINALITY AS key_list(item_key, ord)
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN jsonb_typeof(entry -> 'met') = 'boolean' THEN (entry ->> 'met')::BOOLEAN END AS met,
      CASE WHEN jsonb_typeof(entry -> 'applicable') = 'boolean' THEN (entry ->> 'applicable')::BOOLEAN END AS applicable
    FROM jsonb_array_elements(p_items) AS entry
    WHERE entry ->> 'key' = key_list.item_key
    LIMIT 1
  ) item ON TRUE;

  IF v_applicable = 0 THEN
    RAISE EXCEPTION 'Deixe ao menos um item como aplicável.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.aba_session_fidelity
  WHERE session_id = p_session_id AND source = p_source
  FOR UPDATE;

  IF v_existing.id IS NOT NULL
     AND v_existing.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Esta fidelidade foi salva por outra pessoa. Reabra para ver a versão atual.'
      USING ERRCODE = '40001';
  END IF;
  IF v_existing.id IS NULL AND p_expected_revision IS NOT NULL THEN
    RAISE EXCEPTION 'Esta fidelidade mudou desde que foi aberta. Reabra para ver a versão atual.'
      USING ERRCODE = '40001';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.aba_session_fidelity (
      clinic_id, patient_id, session_id, source, assessor_id, items,
      applicable_count, met_count, score_percentage, notes_encrypted
    ) VALUES (
      v_session.clinic_id, v_session.patient_id, v_session.id, p_source, v_uid, v_items,
      v_applicable, v_met, round(v_met::NUMERIC / v_applicable * 100, 2),
      public.aba_encrypt(public.aba_clean_text(p_notes, 2000))
    )
    RETURNING * INTO v_saved;
  ELSE
    UPDATE public.aba_session_fidelity
    SET assessor_id = v_uid,
        items = v_items,
        applicable_count = v_applicable,
        met_count = v_met,
        score_percentage = round(v_met::NUMERIC / v_applicable * 100, 2),
        notes_encrypted = public.aba_encrypt(public.aba_clean_text(p_notes, 2000)),
        revision = v_existing.revision + 1,
        updated_at = clock_timestamp()
    WHERE id = v_existing.id
    RETURNING * INTO v_saved;
  END IF;

  RETURN public.aba_fidelity_json(v_saved, public.get_clinical_encryption_key());
END;
$aba_save_fidelity$;

-- ----------------------------------------------------------
-- 4. Concordância entre observadores (IOA)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_save_ioa(p_patient_id UUID, p_record JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_ioa$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, TRUE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_today DATE := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_method TEXT := p_record ->> 'method';
  v_primary NUMERIC := public.aba_num(p_record ->> 'primary_value');
  v_secondary NUMERIC := public.aba_num(p_record ->> 'secondary_value');
  v_session UUID;
  v_program UUID;
  v_observer UUID;
  v_observed DATE;
  v_saved public.aba_ioa_records%ROWTYPE;
BEGIN
  -- Conversões aqui (e não no DECLARE) para o erro cair no EXCEPTION abaixo.
  v_session := NULLIF(p_record ->> 'session_id', '')::UUID;
  v_program := NULLIF(p_record ->> 'program_id', '')::UUID;
  v_observer := NULLIF(p_record ->> 'secondary_observer_id', '')::UUID;
  v_observed := NULLIF(p_record ->> 'observed_on', '')::DATE;

  IF v_session IS NOT NULL THEN
    SELECT session_date INTO v_observed
    FROM public.aba_sessions
    WHERE id = v_session AND patient_id = p_patient_id AND status <> 'em_andamento';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sessão inválida para este paciente.' USING ERRCODE = '22023';
    END IF;
  END IF;
  v_observed := COALESCE(v_observed, v_today);
  IF v_observed > v_today THEN
    RAISE EXCEPTION 'A data da observação não pode estar no futuro.' USING ERRCODE = '22023';
  END IF;

  IF v_program IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.aba_programs
    WHERE id = v_program AND patient_id = p_patient_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Programa inválido para este paciente.' USING ERRCODE = '22023';
  END IF;

  IF v_observer IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_observer AND clinic_id = v_clinic AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'O segundo observador precisa ser da equipe ativa da clínica.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.aba_ioa_records (
    clinic_id, patient_id, session_id, program_id, method, primary_value, secondary_value,
    agreement_percentage, secondary_observer_id, observed_on, notes_encrypted, created_by
  ) VALUES (
    v_clinic, p_patient_id, v_session, v_program, v_method, v_primary, v_secondary,
    public.aba_ioa_agreement(v_method, v_primary, v_secondary), v_observer, v_observed,
    public.aba_encrypt(public.aba_clean_text(p_record ->> 'notes', 1000)), v_uid
  )
  RETURNING * INTO v_saved;

  RETURN public.aba_ioa_json(v_saved, public.get_clinical_encryption_key());
EXCEPTION
  WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Dados de concordância inválidos.' USING ERRCODE = '22023';
END;
$aba_save_ioa$;

-- Fidelidade e IOA do paciente (a tela Qualidade e os relatórios).
CREATE OR REPLACE FUNCTION public.aba_get_patient_quality(p_patient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_get_patient_quality$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_key TEXT := public.get_clinical_encryption_key();
BEGIN
  RETURN jsonb_build_object(
    'fidelity', COALESCE((
      SELECT jsonb_agg(public.aba_fidelity_json(fidelity, v_key) ORDER BY fidelity.created_at DESC)
      FROM public.aba_session_fidelity fidelity
      WHERE fidelity.patient_id = p_patient_id
    ), '[]'::JSONB),
    'ioa', COALESCE((
      SELECT jsonb_agg(public.aba_ioa_json(record, v_key) ORDER BY record.observed_on DESC, record.created_at DESC)
      FROM public.aba_ioa_records record
      WHERE record.patient_id = p_patient_id
    ), '[]'::JSONB),
    'can_supervise', public.aba_can_supervise_patient(p_patient_id, v_uid)
  );
END;
$aba_get_patient_quality$;

-- ----------------------------------------------------------
-- 5. Alertas
-- ----------------------------------------------------------
-- Recalcula as regras da clínica de quem chama. Roda no máximo a cada
-- 2 minutos (p_force ignora o intervalo) e com trava por clínica, para
-- duas telas abertas ao mesmo tempo não disputarem as mesmas linhas.
CREATE OR REPLACE FUNCTION public.aba_refresh_alerts(p_force BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_refresh_alerts$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_today DATE := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::DATE;
  v_now TIMESTAMPTZ := clock_timestamp();
  v_last TIMESTAMPTZ;
  v_detected INTEGER;
  v_resolved INTEGER;
BEGIN
  IF v_clinic IS NULL
     OR NOT (public.is_clinic_admin(v_uid) OR public.aba_is_aba_professional(v_uid)) THEN
    RAISE EXCEPTION 'Os alertas ABA são da equipe ABA da clínica.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('aba_refresh_alerts'), hashtext(v_clinic::TEXT));

  SELECT refreshed_at INTO v_last FROM public.aba_alert_refreshes WHERE clinic_id = v_clinic;
  IF NOT p_force AND v_last IS NOT NULL AND v_last > v_now - INTERVAL '2 minutes' THEN
    RETURN jsonb_build_object('skipped', TRUE, 'refreshed_at', v_last);
  END IF;

  CREATE TEMPORARY TABLE IF NOT EXISTS aba_detected_alerts (
    rule_key TEXT PRIMARY KEY,
    patient_id UUID NOT NULL,
    program_id UUID,
    session_id UUID,
    type TEXT NOT NULL,
    category TEXT NOT NULL,
    priority TEXT NOT NULL,
    message TEXT NOT NULL,
    assigned_to UUID
  ) ON COMMIT DROP;
  TRUNCATE pg_temp.aba_detected_alerts;

  -- Programa ativo sem coleta nos últimos 14 dias (com pelo menos 7 dias
  -- de protocolo, para não acusar programa recém-criado).
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, program_id, type, category, priority, message)
  SELECT
    'programa_sem_coleta:' || program.id,
    program.patient_id,
    program.id,
    'programa_sem_coleta',
    'clinico',
    'media',
    'O programa "' || program.name || '" não tem coleta nos últimos 14 dias.'
  FROM public.aba_programs program
  JOIN public.patients patient ON patient.id = program.patient_id AND patient.erased_at IS NULL
  WHERE program.clinic_id = v_clinic
    AND program.archived_at IS NULL
    AND program.status IN ('em_ensino', 'criterio_atingido_na_sessao', 'aquisicao', 'generalizacao', 'manutencao')
    AND COALESCE(program.protocol_start_date, (program.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE) <= v_today - 7
    AND NOT EXISTS (
      SELECT 1
      FROM public.aba_session_programs session_program
      JOIN public.aba_sessions session ON session.id = session_program.session_id
      WHERE session_program.program_id = program.id
        AND session.status <> 'em_andamento'
        AND session.session_date >= v_today - 14
    );

  -- Independência abaixo do critério em 3 ou mais sessões dos últimos 30
  -- dias (linha de base não conta; recusa e não aplicável fora da conta).
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, program_id, type, category, priority, message)
  SELECT
    'baixa_evolucao:' || metric.program_id,
    metric.patient_id,
    metric.program_id,
    'baixa_evolucao',
    'clinico',
    CASE WHEN metric.independence < metric.minimum - 20 THEN 'alta' ELSE 'media' END,
    'O programa "' || metric.program_name || '" ficou em ' || round(metric.independence)
      || '% de independência em ' || metric.sessions || ' sessões dos últimos 30 dias; o critério é '
      || round(metric.minimum) || '%.'
  FROM (
    SELECT
      program.id AS program_id,
      program.patient_id,
      program.name AS program_name,
      COALESCE(public.aba_num(program.definition #>> '{criteria,minimumPercentage}'), 80) AS minimum,
      count(DISTINCT session.id) AS sessions,
      100.0 * count(*) FILTER (WHERE trial.response = 'independente')
        / NULLIF(count(*) FILTER (WHERE trial.response NOT IN ('recusa', 'nao_aplicavel')), 0) AS independence
    FROM public.aba_programs program
    JOIN public.patients patient ON patient.id = program.patient_id AND patient.erased_at IS NULL
    JOIN public.aba_session_programs session_program
      ON session_program.program_id = program.id AND session_program.phase <> 'linha_de_base'
    JOIN public.aba_sessions session
      ON session.id = session_program.session_id
      AND session.status <> 'em_andamento'
      AND session.session_date >= v_today - 30
    JOIN public.aba_trial_records trial
      ON trial.session_program_id = session_program.id
      AND trial.response NOT IN ('recusa', 'nao_aplicavel')
    WHERE program.clinic_id = v_clinic
      AND program.type = 'aquisicao'
      AND program.archived_at IS NULL
      AND program.status IN ('em_ensino', 'aquisicao', 'generalizacao')
    GROUP BY program.id, program.patient_id, program.name, program.definition
    HAVING count(DISTINCT session.id) >= 3
  ) metric
  WHERE metric.independence < metric.minimum;

  -- Critério de progressão atingido, ainda na fase de ensino. Espelha
  -- evaluateProgression (utils/aba/calculations.js): linha de base fora,
  -- % por sessão arredondado, teto de ajuda, sessões (consecutivas ou
  -- não), respostas independentes seguidas, ambientes, terapeutas e
  -- tempo mínimo. A mudança de fase continua sendo da supervisão.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, program_id, type, category, priority, message)
  WITH program_rule AS (
    SELECT
      program.id,
      program.patient_id,
      program.name,
      COALESCE(public.aba_num(program.definition #>> '{criteria,minimumPercentage}'), 80) AS minimum,
      greatest(COALESCE(NULLIF(public.aba_num(program.definition #>> '{criteria,requiredSessions}'), 0), 1), 1) AS required_sessions,
      COALESCE(program.definition #>> '{criteria,sessionsMustBeConsecutive}', 'true') <> 'false' AS consecutive,
      COALESCE(public.aba_num(program.definition #>> '{criteria,consecutiveIndependent}'), 5) AS streak_needed,
      COALESCE(public.aba_num(program.definition #>> '{criteria,requiredEnvironments}'), 2) AS environments_needed,
      COALESCE(public.aba_num(program.definition #>> '{criteria,requiredTherapists}'), 2) AS therapists_needed,
      COALESCE(public.aba_num(program.definition #>> '{criteria,minimumSeconds}'), 0) AS seconds_needed,
      public.aba_prompt_rank(program.definition ->> 'promptCeiling') AS ceiling
    FROM public.aba_programs program
    JOIN public.patients patient ON patient.id = program.patient_id AND patient.erased_at IS NULL
    WHERE program.clinic_id = v_clinic
      AND program.type = 'aquisicao'
      AND program.archived_at IS NULL
      AND program.status IN ('em_ensino', 'criterio_atingido_na_sessao', 'aquisicao')
  ),
  per_session AS (
    SELECT
      rule.id AS program_id,
      session.id AS session_id,
      session.location,
      session.therapist_id,
      row_number() OVER (PARTITION BY rule.id ORDER BY session.session_date, session.started_at, session.id) AS position,
      count(trial.id) FILTER (WHERE trial.response NOT IN ('recusa', 'nao_aplicavel')) AS scored,
      count(trial.id) FILTER (WHERE trial.response = 'independente') AS independent,
      max(trial.recorded_seconds) AS max_seconds,
      COALESCE(bool_and(
        rule.ceiling IS NULL
        OR trial.id IS NULL
        OR trial.response IN ('recusa', 'nao_aplicavel')
        OR public.aba_prompt_rank(trial.response) IS NULL
        OR public.aba_prompt_rank(trial.response) <= rule.ceiling
      ), TRUE) AS within_ceiling
    FROM program_rule rule
    JOIN public.aba_session_programs session_program
      ON session_program.program_id = rule.id AND session_program.phase <> 'linha_de_base'
    JOIN public.aba_sessions session
      ON session.id = session_program.session_id AND session.status <> 'em_andamento'
    LEFT JOIN public.aba_trial_records trial ON trial.session_program_id = session_program.id
    GROUP BY rule.id, session.id, session.location, session.therapist_id, session.session_date, session.started_at
  ),
  qualified AS (
    SELECT
      per_session.*,
      per_session.scored > 0
        AND round(100.0 * per_session.independent / per_session.scored) >= rule.minimum
        AND per_session.within_ceiling
        AND (rule.seconds_needed = 0 OR COALESCE(per_session.max_seconds, 0) >= rule.seconds_needed) AS qualifies
    FROM per_session
    JOIN program_rule rule ON rule.id = per_session.program_id
  ),
  runs AS (
    SELECT program_id, max(run_length) AS best_run
    FROM (
      SELECT program_id, count(*) AS run_length
      FROM (
        SELECT
          program_id,
          position - row_number() OVER (PARTITION BY program_id ORDER BY position) AS island
        FROM qualified
        WHERE qualifies
      ) islands
      GROUP BY program_id, island
    ) lengths
    GROUP BY program_id
  ),
  streaks AS (
    SELECT program_id, max(streak) AS best_streak
    FROM (
      SELECT program_id, count(*) AS streak
      FROM (
        SELECT
          rule.id AS program_id,
          trial.response,
          row_number() OVER (
            PARTITION BY rule.id
            ORDER BY session.session_date, session.started_at, session.id, trial.trial_index
          ) - row_number() OVER (
            PARTITION BY rule.id, trial.response = 'independente'
            ORDER BY session.session_date, session.started_at, session.id, trial.trial_index
          ) AS island
        FROM program_rule rule
        JOIN public.aba_session_programs session_program
          ON session_program.program_id = rule.id AND session_program.phase <> 'linha_de_base'
        JOIN public.aba_sessions session
          ON session.id = session_program.session_id AND session.status <> 'em_andamento'
        JOIN public.aba_trial_records trial
          ON trial.session_program_id = session_program.id
          AND trial.response NOT IN ('recusa', 'nao_aplicavel')
      ) ordered
      WHERE response = 'independente'
      GROUP BY program_id, island
    ) islands
    GROUP BY program_id
  ),
  summary AS (
    SELECT
      rule.id AS program_id,
      rule.patient_id,
      rule.name,
      rule.minimum,
      rule.required_sessions,
      rule.consecutive,
      rule.streak_needed,
      rule.environments_needed,
      rule.therapists_needed,
      rule.seconds_needed,
      rule.ceiling,
      count(qualified.session_id) AS sessions,
      count(*) FILTER (WHERE qualified.qualifies) AS qualifying,
      COALESCE(max(runs.best_run), 0) AS best_run,
      COALESCE(max(streaks.best_streak), 0) AS best_streak,
      count(DISTINCT qualified.location) FILTER (WHERE qualified.qualifies) AS environments,
      count(DISTINCT qualified.therapist_id) FILTER (WHERE qualified.qualifies) AS therapists,
      COALESCE(max(qualified.max_seconds), 0) AS max_seconds,
      count(*) FILTER (WHERE NOT qualified.within_ceiling) AS above_ceiling
    FROM program_rule rule
    JOIN qualified ON qualified.program_id = rule.id
    LEFT JOIN runs ON runs.program_id = rule.id
    LEFT JOIN streaks ON streaks.program_id = rule.id
    GROUP BY rule.id, rule.patient_id, rule.name, rule.minimum, rule.required_sessions, rule.consecutive,
      rule.streak_needed, rule.environments_needed, rule.therapists_needed, rule.seconds_needed, rule.ceiling
  )
  SELECT
    'criterio_atingido:' || summary.program_id,
    summary.patient_id,
    summary.program_id,
    'criterio_atingido',
    'clinico',
    'alta',
    'O programa "' || summary.name || '" atingiu o critério: '
      || CASE WHEN summary.consecutive THEN summary.best_run ELSE summary.qualifying END
      || CASE WHEN (CASE WHEN summary.consecutive THEN summary.best_run ELSE summary.qualifying END) = 1
           THEN ' sessão' ELSE ' sessões' END
      || CASE WHEN summary.consecutive THEN ' seguidas' ELSE '' END
      || ' com ' || round(summary.minimum) || '% ou mais. Avalie a mudança de fase em Resultados.'
  FROM summary
  WHERE summary.sessions > 0
    AND (CASE WHEN summary.consecutive THEN summary.best_run ELSE summary.qualifying END) >= summary.required_sessions
    AND (summary.streak_needed <= 0 OR summary.best_streak >= summary.streak_needed)
    AND (summary.environments_needed <= 0 OR summary.environments >= summary.environments_needed)
    AND (summary.therapists_needed <= 0 OR summary.therapists >= summary.therapists_needed)
    AND (summary.seconds_needed <= 0 OR summary.max_seconds >= summary.seconds_needed)
    AND (summary.ceiling IS NULL OR summary.above_ceiling = 0);

  -- Comportamento interferente aumentando: últimos 14 dias contra os 14
  -- anteriores.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, type, category, priority, message)
  SELECT
    'aumento_comportamento:' || metric.behavior_id,
    metric.patient_id,
    'aumento_comportamento',
    'clinico',
    'alta',
    'O comportamento "' || metric.behavior_name || '" passou de ' || metric.previous_total
      || ' para ' || metric.current_total || ' ocorrências (últimos 14 dias contra os 14 anteriores).'
  FROM (
    SELECT
      behavior.id AS behavior_id,
      behavior.patient_id,
      behavior.name AS behavior_name,
      COALESCE(sum(event.quantity) FILTER (WHERE session.session_date > v_today - 14), 0) AS current_total,
      COALESCE(sum(event.quantity) FILTER (
        WHERE session.session_date <= v_today - 14 AND session.session_date > v_today - 28
      ), 0) AS previous_total
    FROM public.aba_interfering_behaviors behavior
    JOIN public.patients patient ON patient.id = behavior.patient_id AND patient.erased_at IS NULL
    JOIN public.aba_behavior_events event ON event.behavior_id = behavior.id
    JOIN public.aba_sessions session
      ON session.id = event.session_id
      AND session.status <> 'em_andamento'
      AND session.session_date > v_today - 28
    WHERE behavior.clinic_id = v_clinic
      AND behavior.status <> 'inactive'
    GROUP BY behavior.id, behavior.patient_id, behavior.name
  ) metric
  WHERE metric.current_total >= 3
    AND metric.current_total >= metric.previous_total + 2
    AND metric.current_total > metric.previous_total * 1.5;

  -- Comportamento novo marcado na coleta, ainda sem definição aprovada.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, session_id, type, category, priority, message)
  SELECT DISTINCT ON (behavior.id)
    'novo_comportamento:' || behavior.id,
    behavior.patient_id,
    session.id,
    'novo_comportamento',
    'clinico',
    'alta',
    'O comportamento "' || behavior.name || '" foi registrado como novo na sessão de '
      || to_char(session.session_date, 'DD/MM/YYYY') || ' e aguarda a definição operacional da supervisão.'
  FROM public.aba_interfering_behaviors behavior
  JOIN public.patients patient ON patient.id = behavior.patient_id AND patient.erased_at IS NULL
  JOIN public.aba_behavior_events event ON event.behavior_id = behavior.id AND event.new_behavior
  JOIN public.aba_sessions session
    ON session.id = event.session_id
    AND session.status <> 'em_andamento'
    AND session.session_date >= v_today - 60
  WHERE behavior.clinic_id = v_clinic
    AND behavior.status = 'pending_review'
  ORDER BY behavior.id, session.session_date DESC, session.started_at DESC;

  -- Reforçador perdendo efeito: metade ou mais dos registros dos últimos
  -- 30 dias vieram ineficazes ou recusados (pede nova avaliação de
  -- preferência, não mudança no programa).
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, type, category, priority, message)
  SELECT
    'perda_eficiencia:' || metric.reinforcer_id,
    metric.patient_id,
    'perda_eficiencia',
    'clinico',
    'media',
    'O reforçador "' || metric.reinforcer_name || '" veio ineficaz ou recusado em ' || metric.weak
      || ' dos ' || metric.total || ' registros dos últimos 30 dias. Reavalie as preferências.'
  FROM (
    SELECT
      reinforcer.id AS reinforcer_id,
      reinforcer.patient_id,
      reinforcer.name AS reinforcer_name,
      count(*) AS total,
      count(*) FILTER (WHERE use.efficiency IN ('ineficaz', 'recusado')) AS weak
    FROM public.aba_reinforcers reinforcer
    JOIN public.patients patient ON patient.id = reinforcer.patient_id AND patient.erased_at IS NULL
    JOIN public.aba_reinforcer_uses use ON use.reinforcer_id = reinforcer.id
    JOIN public.aba_sessions session
      ON session.id = use.session_id
      AND session.status <> 'em_andamento'
      AND session.session_date >= v_today - 30
    WHERE reinforcer.clinic_id = v_clinic
      AND reinforcer.active
    GROUP BY reinforcer.id, reinforcer.patient_id, reinforcer.name
  ) metric
  WHERE metric.total >= 3
    AND metric.weak * 2 >= metric.total;

  -- Situação de risco ainda sem revisão da supervisão.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, session_id, type, category, priority, message)
  SELECT
    'situacao_risco:' || incident.id,
    incident.patient_id,
    incident.session_id,
    'situacao_risco',
    'supervisao',
    CASE WHEN incident.severity = 'alta' THEN 'critica' ELSE 'alta' END,
    'Situação de risco' || CASE WHEN incident.severity IS NULL THEN '' ELSE ' (' || incident.severity || ')' END
      || ' registrada na sessão de ' || to_char(session.session_date, 'DD/MM/YYYY')
      || ' aguarda revisão da supervisão.'
  FROM public.aba_risk_incidents incident
  JOIN public.patients patient ON patient.id = incident.patient_id AND patient.erased_at IS NULL
  JOIN public.aba_sessions session ON session.id = incident.session_id
  WHERE incident.clinic_id = v_clinic
    AND incident.status = 'pending_review';

  -- Sessão esperando a supervisão há mais de 48 horas.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, session_id, type, category, priority, message)
  SELECT
    'revisao_pendente:' || session.id,
    session.patient_id,
    session.id,
    'revisao_pendente',
    'supervisao',
    'media',
    'A sessão de ' || to_char(session.session_date, 'DD/MM/YYYY')
      || ' aguarda revisão da supervisão há mais de 48 horas.'
  FROM public.aba_sessions session
  JOIN public.patients patient ON patient.id = session.patient_id AND patient.erased_at IS NULL
  WHERE session.clinic_id = v_clinic
    AND session.status <> 'em_andamento'
    AND session.review_status IN ('pending_review', 'corrected_pending_review')
    AND COALESCE(session.corrected_at, session.finalized_at) < v_now - INTERVAL '48 hours';

  -- Correção pedida e com prazo vencido: quem responde é o terapeuta.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, session_id, type, category, priority, message, assigned_to)
  SELECT
    'correcao_atrasada:' || session.id,
    session.patient_id,
    session.id,
    'correcao_atrasada',
    'supervisao',
    'alta',
    'A correção pedida para a sessão de ' || to_char(session.session_date, 'DD/MM/YYYY')
      || ' passou do prazo.',
    session.therapist_id
  FROM public.aba_sessions session
  JOIN public.patients patient ON patient.id = session.patient_id AND patient.erased_at IS NULL
  WHERE session.clinic_id = v_clinic
    AND session.review_status = 'correction_requested'
    AND session.correction_deadline < v_now;

  -- Fidelidade da supervisão abaixo de 80% nos últimos 30 dias.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, session_id, type, category, priority, message, assigned_to)
  SELECT
    'fidelidade_baixa:' || fidelity.session_id,
    fidelity.patient_id,
    fidelity.session_id,
    'fidelidade_baixa',
    'supervisao',
    'media',
    'A fidelidade de aplicação da sessão de ' || to_char(session.session_date, 'DD/MM/YYYY')
      || ' ficou em ' || round(fidelity.score_percentage) || '% na revisão da supervisão (mínimo 80%).',
    session.therapist_id
  FROM public.aba_session_fidelity fidelity
  JOIN public.patients patient ON patient.id = fidelity.patient_id AND patient.erased_at IS NULL
  JOIN public.aba_sessions session ON session.id = fidelity.session_id
  WHERE fidelity.clinic_id = v_clinic
    AND fidelity.source = 'supervisao'
    AND fidelity.score_percentage < 80
    AND session.session_date >= v_today - 30;

  -- Concordância entre observadores abaixo de 80% nos últimos 60 dias.
  INSERT INTO pg_temp.aba_detected_alerts (rule_key, patient_id, program_id, session_id, type, category, priority, message)
  SELECT
    'concordancia_baixa:' || record.id,
    record.patient_id,
    record.program_id,
    record.session_id,
    'concordancia_baixa',
    'supervisao',
    'media',
    'A concordância entre observadores de ' || to_char(record.observed_on, 'DD/MM/YYYY')
      || ' ficou em ' || round(record.agreement_percentage) || '% (mínimo 80%). Revise a definição e o treino de coleta.'
  FROM public.aba_ioa_records record
  JOIN public.patients patient ON patient.id = record.patient_id AND patient.erased_at IS NULL
  WHERE record.clinic_id = v_clinic
    AND record.agreement_percentage < 80
    AND record.observed_on >= v_today - 60;

  -- Responsável padrão: quem lidera o time da criança.
  UPDATE pg_temp.aba_detected_alerts detected
  SET assigned_to = team.supervisor_id
  FROM public.aba_patient_teams link
  JOIN public.aba_care_teams team ON team.id = link.team_id AND team.archived_at IS NULL
  WHERE detected.assigned_to IS NULL
    AND link.patient_id = detected.patient_id
    AND link.ended_at IS NULL;

  -- Condição que sumiu: aberto vira resolvido; dispensado fica dispensado,
  -- mas marca que a condição passou (se voltar, reabre).
  WITH cleared AS (
    UPDATE public.aba_alerts alert
    SET status = CASE WHEN alert.status = 'open' THEN 'resolved' ELSE alert.status END,
        resolved_at = CASE WHEN alert.status = 'open' THEN v_now ELSE alert.resolved_at END,
        condition_cleared_at = v_now,
        revision = alert.revision + 1
    WHERE alert.clinic_id = v_clinic
      AND alert.condition_cleared_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM pg_temp.aba_detected_alerts detected WHERE detected.rule_key = alert.rule_key
      )
    RETURNING alert.id
  )
  SELECT count(*) INTO v_resolved FROM cleared;

  INSERT INTO public.aba_alerts (
    clinic_id, patient_id, program_id, session_id, rule_key, type, category, priority,
    message, status, assigned_to, first_detected_at, last_detected_at
  )
  SELECT
    v_clinic, detected.patient_id, detected.program_id, detected.session_id, detected.rule_key,
    detected.type, detected.category, detected.priority, detected.message, 'open',
    detected.assigned_to, v_now, v_now
  FROM pg_temp.aba_detected_alerts detected
  ON CONFLICT ON CONSTRAINT aba_alerts_unique_rule DO UPDATE
  SET patient_id = EXCLUDED.patient_id,
      program_id = EXCLUDED.program_id,
      session_id = EXCLUDED.session_id,
      priority = EXCLUDED.priority,
      message = EXCLUDED.message,
      assigned_to = COALESCE(EXCLUDED.assigned_to, public.aba_alerts.assigned_to),
      last_detected_at = v_now,
      status = CASE WHEN public.aba_alerts.condition_cleared_at IS NOT NULL THEN 'open' ELSE public.aba_alerts.status END,
      resolved_at = CASE WHEN public.aba_alerts.condition_cleared_at IS NOT NULL THEN NULL ELSE public.aba_alerts.resolved_at END,
      decided_by = CASE WHEN public.aba_alerts.condition_cleared_at IS NOT NULL THEN NULL ELSE public.aba_alerts.decided_by END,
      decided_at = CASE WHEN public.aba_alerts.condition_cleared_at IS NOT NULL THEN NULL ELSE public.aba_alerts.decided_at END,
      decision_note_encrypted = CASE WHEN public.aba_alerts.condition_cleared_at IS NOT NULL THEN NULL ELSE public.aba_alerts.decision_note_encrypted END,
      occurrence_count = public.aba_alerts.occurrence_count
        + CASE WHEN public.aba_alerts.condition_cleared_at IS NOT NULL THEN 1 ELSE 0 END,
      revision = public.aba_alerts.revision
        + CASE WHEN public.aba_alerts.condition_cleared_at IS NOT NULL THEN 1 ELSE 0 END,
      condition_cleared_at = NULL;

  SELECT count(*) INTO v_detected FROM pg_temp.aba_detected_alerts;

  INSERT INTO public.aba_alert_refreshes (clinic_id, refreshed_at, refreshed_by)
  VALUES (v_clinic, v_now, v_uid)
  ON CONFLICT (clinic_id) DO UPDATE
  SET refreshed_at = EXCLUDED.refreshed_at,
      refreshed_by = EXCLUDED.refreshed_by;

  RETURN jsonb_build_object('skipped', FALSE, 'detected', v_detected, 'resolved', v_resolved, 'refreshed_at', v_now);
END;
$aba_refresh_alerts$;

-- Alertas que a pessoa enxerga (de um paciente, ou de todos).
CREATE OR REPLACE FUNCTION public.aba_list_alerts(
  p_patient_id UUID DEFAULT NULL,
  p_include_closed BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_list_alerts$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_key TEXT := public.get_clinical_encryption_key();
BEGIN
  IF p_patient_id IS NOT NULL THEN
    PERFORM public.aba_require_patient(p_patient_id, FALSE);
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(item.payload ORDER BY item.open_first, item.priority_rank, item.last_detected_at DESC)
    FROM (
      SELECT
        jsonb_build_object(
          'id', alert.id,
          'patient_id', alert.patient_id,
          'patient_name', patient.name,
          'program_id', alert.program_id,
          'session_id', alert.session_id,
          'type', alert.type,
          'category', alert.category,
          'priority', alert.priority,
          'message', alert.message,
          'status', alert.status,
          'assigned_to', alert.assigned_to,
          'assigned_name', assignee.full_name,
          'first_detected_at', alert.first_detected_at,
          'last_detected_at', alert.last_detected_at,
          'occurrence_count', alert.occurrence_count,
          'resolved_at', alert.resolved_at,
          'decided_by', alert.decided_by,
          'decided_name', decider.full_name,
          'decided_at', alert.decided_at,
          'decision_note', public.aba_decrypt_text(alert.decision_note_encrypted, v_key),
          'revision', alert.revision,
          'can_manage', public.aba_can_supervise_patient(alert.patient_id, v_uid)
        ) AS payload,
        CASE alert.status WHEN 'open' THEN 0 WHEN 'dismissed' THEN 1 ELSE 2 END AS open_first,
        CASE alert.priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END AS priority_rank,
        alert.last_detected_at
      FROM public.aba_alerts alert
      JOIN public.patients patient ON patient.id = alert.patient_id AND patient.erased_at IS NULL
      LEFT JOIN public.profiles assignee ON assignee.id = alert.assigned_to
      LEFT JOIN public.profiles decider ON decider.id = alert.decided_by
      WHERE alert.clinic_id = v_clinic
        AND (p_patient_id IS NULL OR alert.patient_id = p_patient_id)
        AND (
          alert.status = 'open'
          OR (p_include_closed AND (
            alert.status = 'dismissed'
            OR alert.resolved_at > clock_timestamp() - INTERVAL '30 days'
          ))
        )
        AND public.aba_can_access_patient(alert.patient_id, v_uid)
      ORDER BY 2, 3, alert.last_detected_at DESC
      LIMIT 500
    ) item
  ), '[]'::JSONB);
END;
$aba_list_alerts$;

-- Dispensar (com motivo opcional) ou reabrir: supervisão do time.
CREATE OR REPLACE FUNCTION public.aba_manage_alert(
  p_alert_id UUID,
  p_action TEXT,
  p_note TEXT,
  p_expected_revision BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_manage_alert$
DECLARE
  v_alert public.aba_alerts%ROWTYPE;
  v_uid UUID;
BEGIN
  SELECT * INTO v_alert FROM public.aba_alerts WHERE id = p_alert_id FOR UPDATE;
  IF v_alert.id IS NULL THEN
    RAISE EXCEPTION 'Alerta não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_alert.patient_id, TRUE);

  IF v_alert.revision IS DISTINCT FROM p_expected_revision THEN
    RAISE EXCEPTION 'Este alerta mudou desde que a lista foi aberta. Atualize e tente de novo.'
      USING ERRCODE = '40001';
  END IF;

  IF p_action = 'dismiss' THEN
    IF v_alert.status <> 'open' THEN
      RAISE EXCEPTION 'Só alerta aberto pode ser dispensado.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.aba_alerts
    SET status = 'dismissed',
        decided_by = v_uid,
        decided_at = clock_timestamp(),
        decision_note_encrypted = public.aba_encrypt(public.aba_clean_text(p_note, 1000)),
        revision = revision + 1
    WHERE id = p_alert_id;
  ELSIF p_action = 'reopen' THEN
    IF v_alert.status <> 'dismissed' THEN
      RAISE EXCEPTION 'Só alerta dispensado pode ser reaberto.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.aba_alerts
    SET status = CASE WHEN condition_cleared_at IS NULL THEN 'open' ELSE 'resolved' END,
        resolved_at = CASE WHEN condition_cleared_at IS NULL THEN NULL ELSE clock_timestamp() END,
        decided_by = v_uid,
        decided_at = clock_timestamp(),
        decision_note_encrypted = NULL,
        revision = revision + 1
    WHERE id = p_alert_id;
  ELSE
    RAISE EXCEPTION 'Ação inválida.' USING ERRCODE = '22023';
  END IF;
END;
$aba_manage_alert$;

-- ----------------------------------------------------------
-- 6. Permissões
-- ----------------------------------------------------------
REVOKE ALL ON FUNCTION public.aba_num(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_prompt_rank(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_ioa_agreement(TEXT, NUMERIC, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_fidelity_json(public.aba_session_fidelity, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_ioa_json(public.aba_ioa_records, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_fidelity_keys(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_save_fidelity(UUID, TEXT, JSONB, TEXT, BIGINT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_ioa(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_get_patient_quality(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_refresh_alerts(BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_list_alerts(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_manage_alert(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.aba_save_fidelity(UUID, TEXT, JSONB, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_ioa(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_get_patient_quality(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_refresh_alerts(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_list_alerts(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_manage_alert(UUID, TEXT, TEXT, BIGINT) TO authenticated;

-- ----------------------------------------------------------
-- 7. Exclusão de paciente: alertas, IOA e fidelidade entram no snapshot e
--    saem junto. Corpo copiado da versão viva (20261101b_aba_coleta.sql);
--    mudam só as linhas aba_alerts, aba_ioa_records e aba_session_fidelity.
-- ----------------------------------------------------------
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
