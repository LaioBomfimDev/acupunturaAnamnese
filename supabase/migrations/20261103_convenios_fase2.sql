-- ==========================================================
-- Convênios, Fase 2 (03/11/2026): guia SP/SADT, lote XML TISS 4.03.00,
-- pagamento da operadora e glosa.
-- REQUER: 20261023_financeiro_etapa1.sql, 20261031_convenios_fase1.sql,
-- 20261102_agenda_convenio.sql e 20261103b_tiss_terms_38.sql (tabela 38
-- de glosas; pode vir depois, a tela só fica sem a descrição do código).
--
-- Escolha da administradora: banco A (guia com itens, lote e acerto em
-- tabelas próprias) + tela A (Guias, Lotes, Pagamentos e glosas).
--
-- Decisões (03/11/2026):
--  * Uma guia SP/SADT por atendimento de convênio Atendido; o número da
--    guia no prestador nasce com a guia e não muda (sequência por
--    operadora). A guia tem itens, para agrupar sessões depois sem mudar
--    tabela (o XSD aceita vários procedimentoExecutado com data própria).
--  * Senha e número da guia da operadora opcionais.
--  * A guia nasce sozinha quando a cobrança de convênio nasce (gatilho em
--    appointment_charges) e é cancelada sozinha quando a cobrança deixa de
--    valer, enquanto não entrou em lote. Cobrança revivida (o mesmo
--    atendimento voltou a Atendido) reabre a mesma guia, com o mesmo
--    número.
--  * Guia em lote não muda: a cópia dos dados (tiss_batch_guides e
--    tiss_batch_items) é congelada no lote, com o XML e o hash. Correção é
--    "reenviar em novo lote", com motivo; o lote antigo fica como foi.
--  * Atendimento, cobrança e valor de uma guia em lote não mudam (gatilho
--    na cobrança). Primeiro se reenvia a guia, com motivo.
--  * Lote: só guias da mesma operadora e do mesmo contratado (a origem do
--    XML é uma só), no máximo 100 (maxOccurs do XSD), atendimento até hoje.
--  * Pagamento da operadora: total ou parcial, de um ou mais lotes; por
--    item, valor pago e glosa com o código da tabela 38. Dinheiro lançado
--    não se apaga nem se edita: anula com motivo (finance_guard_money_rows).
--  * "A receber": cobrança de convênio só sai quando o dinheiro entra
--    (pedido da administradora). Glosa não tira do "A receber": fica
--    marcada como glosada ou em recurso.
--  * Recebimento de convênio entra só pelo pagamento da operadora: novo
--    finance_receipts de cobrança de convênio é barrado (o que já existir
--    continua valendo).
--
-- Corrige também (auditoria de 03/11/2026, teste em
-- supabase/validation/20261103_convenios_fase2_scenarios.sql):
--  * mudar dia, profissional, área, tipo ou paciente de um atendimento já
--    Atendido deixava a cobrança com os dados velhos (repasse ia para a
--    pessoa errada, dia e valor ficavam os antigos). Agora refaz a
--    cobrança; com pagamento, só dia e profissional mudam (o valor fica);
--    área, tipo e paciente com pagamento barram.
--
-- XML: gerado AQUI, a partir da cópia congelada; texto só em ASCII
-- imprimível (sem acento: tiss_ascii ↔ tissText em utils/tissXml.js),
-- então os bytes são os mesmos em ISO-8859-1 e em UTF-8 e o hash do
-- epílogo (MD5 do texto das folhas, em ordem, sem o próprio hash) dá o
-- mesmo nas duas leituras do manual. Espelho: utils/tissXml.js (mudou um,
-- muda o outro; teste tests/regression/convenios-fase2.test.mjs confere
-- contra o XSD oficial em supabase/tiss/4.03.00/).
--
-- Exclusão de paciente: tiss_guides tem patient_id e fica (registro de
-- faturamento, como appointment_charges), em KEPT_ON_PURPOSE. A carteira
-- copiada no lote fica: é o documento enviado à operadora.
--
-- Reverter: DROP das tabelas novas (na ordem inversa), das funções
-- tiss_*/finance_tiss_* e dos gatilhos trg_appointment_charges_tiss_*,
-- trg_finance_receipts_payer, trg_appointments_finance_change; DROP COLUMN
-- clinic_convenios.payment_term_days.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.appointment_charges') IS NULL
     OR to_regclass('public.patient_coverages') IS NULL
     OR to_regclass('public.tiss_terms') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'appointment_charges' AND column_name = 'payer'
     ) THEN
    RAISE EXCEPTION 'Aplique antes 20261023, 20261031 e 20261102.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 0. Prazo de pagamento da operadora (para saber o que está em atraso)
--
-- Sem prazo, cobrança de convênio nunca aparece "em atraso": antes desta
-- migration ela atrasava no dia seguinte ao atendimento, e a operadora só
-- paga semanas depois do lote.
-- ----------------------------------------------------------
ALTER TABLE public.clinic_convenios
  ADD COLUMN IF NOT EXISTS payment_term_days SMALLINT;
ALTER TABLE public.clinic_convenios DROP CONSTRAINT IF EXISTS clinic_convenios_payment_term_check;
ALTER TABLE public.clinic_convenios ADD CONSTRAINT clinic_convenios_payment_term_check
  CHECK (payment_term_days IS NULL OR payment_term_days BETWEEN 1 AND 180);

-- ----------------------------------------------------------
-- 1. Ajudantes de texto TISS
-- Espelho: tissText em utils/tissXml.js.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tiss_ascii(p_text TEXT, p_max INTEGER)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT NULLIF(btrim(left(btrim(regexp_replace(regexp_replace(
    translate(COALESCE(p_text, ''),
      'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
      'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'),
    '[^ -~]|[&<>]', ' ', 'g'), '\s+', ' ', 'g')), p_max)), '');
$$;

-- Folha do XML: vazia quando não há valor (elemento opcional some).
CREATE OR REPLACE FUNCTION public.tiss_el(p_name TEXT, p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN p_value IS NULL OR p_value = '' THEN ''
    ELSE '<ans:' || p_name || '>' || p_value || '</ans:' || p_name || '>' END;
$$;

CREATE OR REPLACE FUNCTION public.tiss_money(p_cents INTEGER)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE WHEN p_cents IS NULL THEN NULL
    ELSE to_char(p_cents / 100.0, 'FM99999990.00') END;
$$;

-- Hash do epílogo: MD5 do texto de cada elemento-folha, em ordem de
-- documento, sem separador, fora do epílogo. Com texto só em ASCII, a
-- leitura ISO-8859-1 e a UTF-8 do manual dão o mesmo resultado.
-- Espelho: tissHash em utils/tissXml.js.
CREATE OR REPLACE FUNCTION public.tiss_hash(p_doc TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT md5(convert_to(COALESCE(string_agg(t.node::text, '' ORDER BY t.n), ''), 'UTF8'))
  FROM unnest(xpath(
    '//*[not(*)][not(ancestor-or-self::ans:epilogo)]/text()',
    p_doc::xml,
    ARRAY[ARRAY['ans', 'http://www.ans.gov.br/padroes/tiss/schemas']]
  )) WITH ORDINALITY AS t(node, n);
$$;

REVOKE ALL ON FUNCTION public.tiss_ascii(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiss_el(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiss_money(INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tiss_hash(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiss_ascii(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tiss_hash(TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 2. Sequências por operadora (número da guia e do lote)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.convenio_sequences (
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('guide', 'batch')),
  last_value BIGINT NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  CONSTRAINT convenio_sequences_pkey PRIMARY KEY (convenio_id, kind)
);

ALTER TABLE public.convenio_sequences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.convenio_sequences FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tiss_next_number(p_convenio UUID, p_kind TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next BIGINT;
BEGIN
  INSERT INTO public.convenio_sequences AS s (convenio_id, kind, last_value)
  VALUES (p_convenio, p_kind, 1)
  ON CONFLICT ON CONSTRAINT convenio_sequences_pkey
  DO UPDATE SET last_value = s.last_value + 1
  RETURNING s.last_value INTO v_next;
  RETURN v_next::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.tiss_next_number(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 3. Guia SP/SADT e itens
--
-- Campos editáveis só enquanto a guia está em aberto. Os dados de
-- cadastro (operadora, contratado, carteira, executante) são lidos ao
-- vivo até o lote e congelados nele.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tiss_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  coverage_id UUID REFERENCES public.patient_coverages(id) ON DELETE SET NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  -- Autorização (opcional): senha e número da guia da operadora.
  operator_guide_number TEXT,
  authorized_on DATE,
  password TEXT,
  password_valid_until DATE,
  -- Solicitação: solicitante externo (médico que pediu) ou quem atende.
  requester_id UUID REFERENCES public.tiss_requesters(id) ON DELETE SET NULL,
  requested_on DATE,
  character_code TEXT NOT NULL DEFAULT '1',
  clinical_indication TEXT,
  attendance_type TEXT NOT NULL DEFAULT '03',
  accident_code TEXT NOT NULL DEFAULT '9',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,

  CONSTRAINT tiss_guides_number_unique UNIQUE (convenio_id, number),
  CONSTRAINT tiss_guides_status_check CHECK (status IN ('open', 'batched', 'paid', 'glosa', 'appeal', 'cancelled')),
  CONSTRAINT tiss_guides_number_check CHECK (number ~ '^[0-9]{1,20}$'),
  CONSTRAINT tiss_guides_operator_number_check CHECK (operator_guide_number IS NULL OR length(operator_guide_number) BETWEEN 1 AND 20),
  CONSTRAINT tiss_guides_password_check CHECK (password IS NULL OR length(password) BETWEEN 1 AND 20),
  CONSTRAINT tiss_guides_character_check CHECK (character_code IN ('1', '2')),
  -- Tabela 50 (tipo de atendimento) e 36 (indicação de acidente) do XSD.
  CONSTRAINT tiss_guides_attendance_check CHECK (attendance_type IN ('01', '02', '03', '04', '08', '09', '10', '13', '23')),
  CONSTRAINT tiss_guides_accident_check CHECK (accident_code IN ('0', '1', '2', '9')),
  CONSTRAINT tiss_guides_indication_check CHECK (clinical_indication IS NULL OR length(clinical_indication) <= 500),
  CONSTRAINT tiss_guides_notes_check CHECK (notes IS NULL OR length(notes) <= 500),
  CONSTRAINT tiss_guides_cancel_shape CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_tiss_guides_clinic_status ON public.tiss_guides (clinic_id, convenio_id, status);
CREATE INDEX IF NOT EXISTS idx_tiss_guides_patient ON public.tiss_guides (patient_id);

CREATE TABLE IF NOT EXISTS public.tiss_guide_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guide_id UUID NOT NULL REFERENCES public.tiss_guides(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  charge_id UUID NOT NULL REFERENCES public.appointment_charges(id) ON DELETE RESTRICT,
  sequence SMALLINT NOT NULL DEFAULT 1 CHECK (sequence BETWEEN 1 AND 9999),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tiss_guide_items_sequence_unique UNIQUE (guide_id, sequence),
  -- Uma cobrança fica numa guia só, para sempre: cobrança revivida
  -- reabre a mesma guia.
  CONSTRAINT tiss_guide_items_charge_unique UNIQUE (charge_id)
);

CREATE INDEX IF NOT EXISTS idx_tiss_guide_items_guide ON public.tiss_guide_items (guide_id);

-- ----------------------------------------------------------
-- 4. Lote, cópia congelada das guias e dos itens
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tiss_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE RESTRICT,
  number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated',
  -- Contratado (origem do XML): uma só por lote.
  origin_kind TEXT NOT NULL,
  origin_value TEXT NOT NULL,
  ans_registry TEXT NOT NULL,
  generated_on DATE NOT NULL,
  generated_time TIME NOT NULL,
  period_from DATE NOT NULL,
  period_until DATE NOT NULL,
  guide_count INTEGER NOT NULL CHECK (guide_count BETWEEN 1 AND 100),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  xml TEXT NOT NULL,
  xml_hash TEXT NOT NULL,
  tiss_version TEXT NOT NULL DEFAULT '4.03.00',
  sent_on DATE,
  protocol_number TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  discarded_at TIMESTAMPTZ,
  discarded_by UUID REFERENCES public.profiles(id),
  discard_reason TEXT,

  CONSTRAINT tiss_batches_number_unique UNIQUE (convenio_id, number),
  CONSTRAINT tiss_batches_number_check CHECK (number ~ '^[0-9]{1,12}$'),
  CONSTRAINT tiss_batches_status_check CHECK (status IN ('generated', 'sent', 'discarded')),
  CONSTRAINT tiss_batches_origin_check CHECK (
    (origin_kind = 'code' AND length(origin_value) BETWEEN 1 AND 14)
    OR (origin_kind = 'cnpj' AND origin_value ~ '^[A-Z0-9]{12}[0-9]{2}$')
    OR (origin_kind = 'cpf' AND origin_value ~ '^[0-9]{11}$')
  ),
  CONSTRAINT tiss_batches_ans_check CHECK (ans_registry ~ '^[0-9]{6}$'),
  CONSTRAINT tiss_batches_hash_check CHECK (xml_hash ~ '^[0-9a-f]{32}$'),
  CONSTRAINT tiss_batches_period_check CHECK (period_until >= period_from),
  CONSTRAINT tiss_batches_sent_shape CHECK ((status = 'sent') = (sent_on IS NOT NULL) OR (status = 'discarded')),
  CONSTRAINT tiss_batches_protocol_check CHECK (protocol_number IS NULL OR length(protocol_number) BETWEEN 1 AND 30),
  CONSTRAINT tiss_batches_discard_shape CHECK ((status = 'discarded') = (discarded_at IS NOT NULL AND discard_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_tiss_batches_clinic ON public.tiss_batches (clinic_id, convenio_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tiss_batch_guides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.tiss_batches(id) ON DELETE RESTRICT,
  guide_id UUID NOT NULL REFERENCES public.tiss_guides(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  -- Cópia congelada (já em ASCII, como foi no XML).
  guide_number TEXT NOT NULL,
  operator_guide_number TEXT,
  authorized_on DATE,
  password TEXT,
  password_valid_until DATE,
  card_number TEXT NOT NULL,
  contractor_kind TEXT NOT NULL,
  contractor_value TEXT NOT NULL,
  contractor_name TEXT NOT NULL,
  cnes TEXT NOT NULL,
  requester_code TEXT NOT NULL,
  requester_contractor_name TEXT NOT NULL,
  requester_name TEXT,
  requester_council TEXT NOT NULL,
  requester_council_number TEXT NOT NULL,
  requester_uf TEXT NOT NULL,
  requester_cbo TEXT NOT NULL,
  requested_on DATE,
  character_code TEXT NOT NULL,
  clinical_indication TEXT,
  attendance_type TEXT NOT NULL,
  accident_code TEXT NOT NULL,
  regime_code TEXT NOT NULL,
  notes TEXT,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  superseded_at TIMESTAMPTZ,
  superseded_by UUID REFERENCES public.profiles(id),
  supersede_reason TEXT,

  CONSTRAINT tiss_batch_guides_contractor_check CHECK (
    (contractor_kind = 'code' AND length(contractor_value) BETWEEN 1 AND 14)
    OR (contractor_kind = 'cnpj' AND contractor_value ~ '^[A-Z0-9]{12}[0-9]{2}$')
    OR (contractor_kind = 'cpf' AND contractor_value ~ '^[0-9]{11}$')
  ),
  CONSTRAINT tiss_batch_guides_cnes_check CHECK (cnes ~ '^[0-9]{7}$'),
  CONSTRAINT tiss_batch_guides_card_check CHECK (length(card_number) BETWEEN 1 AND 20),
  CONSTRAINT tiss_batch_guides_requester_check CHECK (
    requester_council ~ '^(0[1-9]|1[0-5])$'
    AND requester_uf ~ '^([1-5][0-9]|98)$'
    AND requester_cbo ~ '^[0-9]{6}$'
    AND length(requester_council_number) BETWEEN 1 AND 15
    AND length(requester_code) BETWEEN 1 AND 14
  ),
  CONSTRAINT tiss_batch_guides_regime_check CHECK (regime_code IN ('01', '02', '03', '04', '05')),
  CONSTRAINT tiss_batch_guides_supersede_shape CHECK ((superseded_at IS NULL) = (supersede_reason IS NULL))
);

-- Uma guia está, no máximo, em um lote valendo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tiss_batch_guides_active
  ON public.tiss_batch_guides (guide_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tiss_batch_guides_batch ON public.tiss_batch_guides (batch_id);

CREATE TABLE IF NOT EXISTS public.tiss_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_guide_id UUID NOT NULL REFERENCES public.tiss_batch_guides(id) ON DELETE RESTRICT,
  item_id UUID NOT NULL REFERENCES public.tiss_guide_items(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  sequence SMALLINT NOT NULL,
  executed_on DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  tuss_table TEXT NOT NULL,
  tuss_code TEXT NOT NULL,
  tuss_term TEXT NOT NULL,
  quantity SMALLINT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 999),
  unit_cents INTEGER NOT NULL CHECK (unit_cents >= 0),
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  executor_kind TEXT NOT NULL,
  executor_value TEXT NOT NULL,
  executor_name TEXT NOT NULL,
  executor_council TEXT NOT NULL,
  executor_council_number TEXT NOT NULL,
  executor_uf TEXT NOT NULL,
  executor_cbo TEXT NOT NULL,

  CONSTRAINT tiss_batch_items_unique UNIQUE (batch_guide_id, sequence),
  CONSTRAINT tiss_batch_items_tuss_check CHECK (
    (tuss_table = '22' AND tuss_code ~ '^[0-9]{8}$')
    OR (tuss_table = '00' AND length(tuss_code) BETWEEN 1 AND 10)
  ),
  CONSTRAINT tiss_batch_items_executor_check CHECK (
    ((executor_kind = 'code' AND length(executor_value) BETWEEN 1 AND 14)
      OR (executor_kind = 'cpf' AND executor_value ~ '^[0-9]{11}$'))
    AND executor_council ~ '^(0[1-9]|1[0-5])$'
    AND executor_uf ~ '^([1-5][0-9]|98)$'
    AND executor_cbo ~ '^[0-9]{6}$'
    AND length(executor_council_number) BETWEEN 1 AND 15
  ),
  CONSTRAINT tiss_batch_items_total_check CHECK (total_cents = unit_cents * quantity)
);

CREATE INDEX IF NOT EXISTS idx_tiss_batch_items_item ON public.tiss_batch_items (item_id);

-- ----------------------------------------------------------
-- 5. Pagamento da operadora, acerto por item e recurso
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.convenio_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('ted', 'pix', 'boleto', 'deposito', 'outro')),
  received_on DATE NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  recorded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id),
  void_reason TEXT,
  CONSTRAINT convenio_payments_void_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_convenio_payments_clinic_day ON public.convenio_payments (clinic_id, received_on);

-- Um acerto = o que a operadora disse de um item num lote: quanto pagou
-- e quanto glosou, com o motivo. Vários acertos somam (pagamento
-- parcial, recurso pago depois). payment_id NULL = só glosa, sem dinheiro.
CREATE TABLE IF NOT EXISTS public.tiss_guide_settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  batch_item_id UUID NOT NULL REFERENCES public.tiss_batch_items(id) ON DELETE RESTRICT,
  guide_id UUID NOT NULL REFERENCES public.tiss_guides(id) ON DELETE RESTRICT,
  payment_id UUID REFERENCES public.convenio_payments(id) ON DELETE RESTRICT,
  group_id UUID NOT NULL,
  paid_cents INTEGER NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  glosa_cents INTEGER NOT NULL DEFAULT 0 CHECK (glosa_cents >= 0),
  glosa_code TEXT,
  glosa_note TEXT CHECK (glosa_note IS NULL OR length(glosa_note) <= 500),
  settled_on DATE NOT NULL,
  recorded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id),
  void_reason TEXT,

  CONSTRAINT tiss_guide_settlements_something CHECK (paid_cents + glosa_cents > 0),
  -- Glosa sempre com o código da tabela 38 (4 dígitos, dm_tipoGlosa).
  CONSTRAINT tiss_guide_settlements_glosa_shape CHECK (
    (glosa_cents = 0 AND glosa_code IS NULL)
    OR (glosa_cents > 0 AND glosa_code IS NOT NULL AND glosa_code ~ '^[0-9]{4}$')
  ),
  CONSTRAINT tiss_guide_settlements_money_shape CHECK (paid_cents = 0 OR payment_id IS NOT NULL),
  CONSTRAINT tiss_guide_settlements_void_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_tiss_guide_settlements_item ON public.tiss_guide_settlements (batch_item_id);
CREATE INDEX IF NOT EXISTS idx_tiss_guide_settlements_guide ON public.tiss_guide_settlements (guide_id);
CREATE INDEX IF NOT EXISTS idx_tiss_guide_settlements_payment ON public.tiss_guide_settlements (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tiss_guide_settlements_group ON public.tiss_guide_settlements (group_id);

CREATE TABLE IF NOT EXISTS public.tiss_guide_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  guide_id UUID NOT NULL REFERENCES public.tiss_guides(id) ON DELETE RESTRICT,
  opened_on DATE NOT NULL,
  note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 3 AND 500),
  opened_by UUID REFERENCES public.profiles(id),
  closed_on DATE,
  outcome TEXT,
  outcome_note TEXT CHECK (outcome_note IS NULL OR length(outcome_note) <= 500),
  closed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tiss_guide_appeals_outcome_check CHECK (outcome IS NULL OR outcome IN ('won', 'lost')),
  CONSTRAINT tiss_guide_appeals_close_shape CHECK ((closed_on IS NULL) = (outcome IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tiss_guide_appeals_open
  ON public.tiss_guide_appeals (guide_id) WHERE closed_on IS NULL;

-- Dinheiro e acerto: o mesmo guarda do financeiro (não apaga, só anula).
DROP TRIGGER IF EXISTS trg_convenio_payments_guard ON public.convenio_payments;
CREATE TRIGGER trg_convenio_payments_guard
  BEFORE UPDATE OR DELETE ON public.convenio_payments
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_money_rows();

DROP TRIGGER IF EXISTS trg_tiss_guide_settlements_guard ON public.tiss_guide_settlements;
CREATE TRIGGER trg_tiss_guide_settlements_guard
  BEFORE UPDATE OR DELETE ON public.tiss_guide_settlements
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_money_rows();

-- Lote e cópia congelada: não se apagam; a cópia nunca muda, e do lote
-- só mudam envio e descarte.
CREATE OR REPLACE FUNCTION public.tiss_guard_frozen()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_free TEXT[];
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'tiss_batches'
     AND current_setting('tiss.building_batch', TRUE) = OLD.id::TEXT THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'tiss_lote_nao_se_apaga: lote e guia enviados ficam guardados como foram.' USING ERRCODE = '42501';
  END IF;
  v_free := CASE TG_TABLE_NAME
    WHEN 'tiss_batches' THEN ARRAY['status', 'sent_on', 'protocol_number', 'discarded_at', 'discarded_by', 'discard_reason']
    WHEN 'tiss_batch_guides' THEN ARRAY['superseded_at', 'superseded_by', 'supersede_reason']
    ELSE ARRAY[]::TEXT[]
  END;
  IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
    RAISE EXCEPTION 'tiss_lote_congelado: o que entrou no lote não muda. Reenvie a guia em novo lote.' USING ERRCODE = '42501';
  END IF;
  -- IF aninhado de propósito: só tiss_batch_guides tem superseded_at, e o
  -- PL/pgSQL não garante parar no primeiro AND falso.
  IF TG_TABLE_NAME = 'tiss_batch_guides' THEN
    IF OLD.superseded_at IS NOT NULL THEN
      RAISE EXCEPTION 'tiss_lote_congelado: reenvio já registrado.' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tiss_batches_frozen ON public.tiss_batches;
CREATE TRIGGER trg_tiss_batches_frozen BEFORE UPDATE OR DELETE ON public.tiss_batches
  FOR EACH ROW EXECUTE FUNCTION public.tiss_guard_frozen();
DROP TRIGGER IF EXISTS trg_tiss_batch_guides_frozen ON public.tiss_batch_guides;
CREATE TRIGGER trg_tiss_batch_guides_frozen BEFORE UPDATE OR DELETE ON public.tiss_batch_guides
  FOR EACH ROW EXECUTE FUNCTION public.tiss_guard_frozen();
DROP TRIGGER IF EXISTS trg_tiss_batch_items_frozen ON public.tiss_batch_items;
CREATE TRIGGER trg_tiss_batch_items_frozen BEFORE UPDATE OR DELETE ON public.tiss_batch_items
  FOR EACH ROW EXECUTE FUNCTION public.tiss_guard_frozen();

-- ----------------------------------------------------------
-- 6. RLS: só a administração lê; ninguém grava direto (só funções)
-- ----------------------------------------------------------
DO $rls$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['tiss_guides', 'tiss_guide_items', 'tiss_batches', 'tiss_batch_guides',
                                  'tiss_batch_items', 'convenio_payments', 'tiss_guide_settlements', 'tiss_guide_appeals'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_admin_read', v_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id))',
                   v_table || '_admin_read', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
  END LOOP;
END;
$rls$;

-- ----------------------------------------------------------
-- 7. A guia acompanha a cobrança
-- ----------------------------------------------------------

-- A guia está num lote valendo? (NULL = não está)
CREATE OR REPLACE FUNCTION public.tiss_active_batch_of_charge(p_charge UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'guia ' || g.number || ' no lote ' || b.number
  FROM public.tiss_guide_items i
  JOIN public.tiss_guides g ON g.id = i.guide_id
  JOIN public.tiss_batch_guides bg ON bg.guide_id = g.id AND bg.superseded_at IS NULL
  JOIN public.tiss_batches b ON b.id = bg.batch_id
  WHERE i.charge_id = p_charge
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.tiss_active_batch_of_charge(UUID) FROM PUBLIC, anon, authenticated;

-- Cobrança de uma guia em lote não muda (nem anula). A exclusão de
-- paciente aprovada passa: ela só zera a carteira e o agendamento.
CREATE OR REPLACE FUNCTION public.tiss_guard_charge()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_where TEXT;
BEGIN
  IF OLD.payer IS DISTINCT FROM 'convenio' THEN
    RETURN NEW;
  END IF;
  IF (OLD.voided_at, OLD.price_cents, OLD.payer, OLD.convenio_id, OLD.service_on, OLD.professional_id,
      OLD.discipline, OLD.appointment_type, OLD.patient_id, OLD.tuss_table, OLD.tuss_code, OLD.tuss_term)
     IS NOT DISTINCT FROM
     (NEW.voided_at, NEW.price_cents, NEW.payer, NEW.convenio_id, NEW.service_on, NEW.professional_id,
      NEW.discipline, NEW.appointment_type, NEW.patient_id, NEW.tuss_table, NEW.tuss_code, NEW.tuss_term) THEN
    RETURN NEW;
  END IF;
  v_where := public.tiss_active_batch_of_charge(OLD.id);
  IF v_where IS NOT NULL THEN
    RAISE EXCEPTION 'guia_no_lote: este atendimento está na % e não muda. No Financeiro → Guias, reenvie a guia em novo lote (com o motivo) antes de mudar.', v_where
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tiss_guard_charge() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_appointment_charges_tiss_guard ON public.appointment_charges;
CREATE TRIGGER trg_appointment_charges_tiss_guard
  BEFORE UPDATE ON public.appointment_charges
  FOR EACH ROW EXECUTE FUNCTION public.tiss_guard_charge();

-- Nasce, reabre ou cancela a guia conforme a cobrança.
CREATE OR REPLACE FUNCTION public.tiss_sync_guide()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item public.tiss_guide_items%ROWTYPE;
  v_guide public.tiss_guides%ROWTYPE;
  v_live BOOLEAN := NEW.voided_at IS NULL AND NEW.payer = 'convenio' AND NEW.convenio_id IS NOT NULL
                    AND NEW.source = 'appointment';
BEGIN
  SELECT * INTO v_item FROM public.tiss_guide_items WHERE charge_id = NEW.id;
  IF FOUND THEN
    SELECT * INTO v_guide FROM public.tiss_guides WHERE id = v_item.guide_id FOR UPDATE;
  END IF;

  IF v_live THEN
    IF v_guide.id IS NOT NULL AND v_guide.convenio_id = NEW.convenio_id THEN
      IF v_guide.status = 'cancelled' THEN
        -- Mesmo atendimento voltou a valer: mesma guia, mesmo número.
        UPDATE public.tiss_guides
        SET status = 'open', cancelled_at = NULL, cancel_reason = NULL,
            coverage_id = NEW.coverage_id, updated_at = timezone('utc', now())
        WHERE id = v_guide.id;
      ELSIF v_guide.status = 'open' AND v_guide.coverage_id IS DISTINCT FROM NEW.coverage_id THEN
        UPDATE public.tiss_guides SET coverage_id = NEW.coverage_id, updated_at = timezone('utc', now())
        WHERE id = v_guide.id;
      END IF;
      RETURN NULL;
    END IF;

    IF v_guide.id IS NOT NULL THEN
      -- Mudou de operadora: a guia antiga (nunca em lote, o guarda
      -- garante) é cancelada e a cobrança sai dela.
      UPDATE public.tiss_guides
      SET status = 'cancelled', cancelled_at = timezone('utc', now()),
          cancel_reason = 'Mudou a operadora do atendimento.', updated_at = timezone('utc', now())
      WHERE id = v_guide.id AND status = 'open';
      -- O item fica com a guia antiga (histórico); a cobrança ganha guia
      -- nova abaixo, então o vínculo único passa para a nova.
      IF EXISTS (SELECT 1 FROM public.tiss_batch_items bi WHERE bi.item_id = v_item.id) THEN
        RAISE EXCEPTION 'guia_ja_enviada: a guia % já foi enviada a esta operadora. Mudar a operadora do atendimento não é possível; registre um atendimento novo.', v_guide.number
          USING ERRCODE = '42501';
      END IF;
      DELETE FROM public.tiss_guide_items WHERE id = v_item.id;
    END IF;

    INSERT INTO public.tiss_guides (clinic_id, convenio_id, patient_id, coverage_id, number)
    VALUES (NEW.clinic_id, NEW.convenio_id, NEW.patient_id, NEW.coverage_id,
            public.tiss_next_number(NEW.convenio_id, 'guide'))
    RETURNING * INTO v_guide;
    INSERT INTO public.tiss_guide_items (guide_id, clinic_id, charge_id, sequence)
    VALUES (v_guide.id, NEW.clinic_id, NEW.id, 1);
    RETURN NULL;
  END IF;

  -- Cobrança deixou de valer (ou virou particular): guia em aberto é
  -- cancelada. Em lote não chega aqui: o guarda barrou antes.
  IF v_guide.id IS NOT NULL AND v_guide.status = 'open' THEN
    UPDATE public.tiss_guides
    SET status = 'cancelled', cancelled_at = timezone('utc', now()),
        cancel_reason = COALESCE(NEW.void_reason, 'O atendimento deixou de ser de convênio.'),
        updated_at = timezone('utc', now())
    WHERE id = v_guide.id;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.tiss_sync_guide() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_appointment_charges_tiss_sync ON public.appointment_charges;
CREATE TRIGGER trg_appointment_charges_tiss_sync
  AFTER INSERT OR UPDATE OF voided_at, payer, convenio_id, coverage_id ON public.appointment_charges
  FOR EACH ROW EXECUTE FUNCTION public.tiss_sync_guide();

-- Cobrança de convênio que já existia antes desta migration ganha guia.
DO $backfill$
DECLARE
  v_charge UUID;
BEGIN
  FOR v_charge IN
    SELECT c.id FROM public.appointment_charges c
    WHERE c.payer = 'convenio' AND c.voided_at IS NULL AND c.source = 'appointment'
      AND NOT EXISTS (SELECT 1 FROM public.tiss_guide_items i WHERE i.charge_id = c.id)
    ORDER BY c.service_on, c.created_at
  LOOP
    UPDATE public.appointment_charges SET coverage_id = coverage_id WHERE id = v_charge;
  END LOOP;
END;
$backfill$;

-- ----------------------------------------------------------
-- 8. Recebimento de convênio só pelo pagamento da operadora
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_receipts_payer_check()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.charge_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.appointment_charges c WHERE c.id = NEW.charge_id AND c.payer = 'convenio'
  ) THEN
    RAISE EXCEPTION 'recebimento_de_convenio: atendimento de convênio é pago pela operadora. Lance em Financeiro → Pagamentos e glosas.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_receipts_payer_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finance_receipts_payer ON public.finance_receipts;
CREATE TRIGGER trg_finance_receipts_payer
  BEFORE INSERT ON public.finance_receipts
  FOR EACH ROW EXECUTE FUNCTION public.finance_receipts_payer_check();

-- ----------------------------------------------------------
-- 9. Atendimento Atendido que muda de dia, profissional, área, tipo ou
--    paciente: a cobrança acompanha (erro achado na auditoria de
--    03/11/2026: ela ficava com os dados velhos).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_on_appointment_change()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.appointment_charges%ROWTYPE;
  v_paid BOOLEAN;
  v_old_day DATE := (OLD.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  v_new_day DATE := (NEW.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NEW.kind IS DISTINCT FROM 'appointment' OR NEW.patient_id IS NULL
     OR OLD.status IS DISTINCT FROM 'attended' OR NEW.status IS DISTINCT FROM 'attended' THEN
    RETURN NULL;
  END IF;
  IF v_old_day = v_new_day
     AND OLD.professional_id IS NOT DISTINCT FROM NEW.professional_id
     AND OLD.discipline IS NOT DISTINCT FROM NEW.discipline
     AND OLD.appointment_type IS NOT DISTINCT FROM NEW.appointment_type
     AND OLD.patient_id IS NOT DISTINCT FROM NEW.patient_id THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_charge FROM public.appointment_charges
  WHERE appointment_id = NEW.id AND voided_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN
    -- Sem cobrança (antes da data de início, por exemplo): pode passar a
    -- ter, no dia novo.
    PERFORM public.finance_charge_appointment(NEW.id);
    RETURN NULL;
  END IF;

  v_paid := EXISTS (SELECT 1 FROM public.finance_receipts r WHERE r.charge_id = v_charge.id AND r.voided_at IS NULL)
         OR EXISTS (SELECT 1 FROM public.tiss_guide_items i JOIN public.tiss_guide_settlements s
                      ON s.guide_id = i.guide_id AND s.voided_at IS NULL WHERE i.charge_id = v_charge.id)
         OR (v_charge.package_id IS NOT NULL AND EXISTS (
               SELECT 1 FROM public.finance_receipts r WHERE r.package_id = v_charge.package_id AND r.voided_at IS NULL));

  IF NOT v_paid THEN
    PERFORM public.finance_void_appointment_charge(NEW.id, 'O atendimento mudou de dia, profissional, área, tipo ou paciente.');
    PERFORM public.finance_charge_appointment(NEW.id);
    RETURN NULL;
  END IF;

  IF OLD.discipline IS DISTINCT FROM NEW.discipline
     OR OLD.appointment_type IS DISTINCT FROM NEW.appointment_type
     OR OLD.patient_id IS DISTINCT FROM NEW.patient_id THEN
    RAISE EXCEPTION 'appointment_has_payment: este atendimento tem pagamento registrado. Anule o pagamento no Financeiro antes de mudar área, tipo ou paciente.'
      USING ERRCODE = '23503';
  END IF;

  -- Com pagamento: o valor fica; dia e profissional acompanham, e o
  -- repasse é recalculado para quem atendeu.
  UPDATE public.appointment_charges
  SET service_on = v_new_day,
      professional_id = NEW.professional_id,
      payout_cents = public.finance_charge_payout(clinic_id, NEW.professional_id, discipline, appointment_type, price_cents, payer)
  WHERE id = v_charge.id;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_on_appointment_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_appointments_finance_change ON public.appointments;
CREATE TRIGGER trg_appointments_finance_change
  AFTER UPDATE OF starts_at, professional_id, discipline, appointment_type, patient_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.finance_on_appointment_change();

-- ----------------------------------------------------------
-- 10. Dados da guia (ao vivo até o lote) e o que falta
--
-- Uma linha por guia em aberto (ou a guia pedida). "missing" barra o
-- lote; "warnings" só avisa. Chaves de missing/warnings ↔
-- TISS_MISSING_LABELS em utils/tissXml.js (o teste confere).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tiss_guide_snapshot(p_guide UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_g public.tiss_guides%ROWTYPE;
  v_conv public.clinic_convenios%ROWTYPE;
  v_clinic public.clinics%ROWTYPE;
  v_cov public.patient_coverages%ROWTYPE;
  v_req public.tiss_requesters%ROWTYPE;
  v_contract public.convenio_credentials%ROWTYPE;
  v_prof_cred public.convenio_credentials%ROWTYPE;
  v_bill public.professional_billing_info%ROWTYPE;
  v_prof_name TEXT;
  v_patient_name TEXT;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_warnings TEXT[] := ARRAY[]::TEXT[];
  v_items JSONB := '[]'::JSONB;
  v_total INTEGER := 0;
  v_first_prof UUID;
  v_contract_kind TEXT;
  v_contract_value TEXT;
  v_contract_name TEXT;
  v_exec_kind TEXT;
  v_exec_value TEXT;
  v_regime TEXT := '01';
  v_row RECORD;
  v_today DATE := public.finance_today();
BEGIN
  SELECT * INTO v_g FROM public.tiss_guides WHERE id = p_guide;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_conv FROM public.clinic_convenios WHERE id = v_g.convenio_id;
  SELECT * INTO v_clinic FROM public.clinics WHERE id = v_g.clinic_id;
  SELECT name INTO v_patient_name FROM public.patients WHERE id = v_g.patient_id;
  IF v_g.coverage_id IS NOT NULL THEN
    SELECT * INTO v_cov FROM public.patient_coverages WHERE id = v_g.coverage_id;
  END IF;

  FOR v_row IN
    SELECT i.id AS item_id, i.sequence, c.id AS charge_id, c.service_on, c.price_cents, c.tuss_table, c.tuss_code,
           c.tuss_term, c.professional_id, a.starts_at, a.ends_at, a.modality, c.voided_at
    FROM public.tiss_guide_items i
    JOIN public.appointment_charges c ON c.id = i.charge_id
    LEFT JOIN public.appointments a ON a.id = c.appointment_id
    WHERE i.guide_id = v_g.id
    ORDER BY i.sequence
  LOOP
    v_first_prof := COALESCE(v_first_prof, v_row.professional_id);
    IF v_row.modality = 'online' THEN
      v_regime := '05';
    END IF;
    IF v_row.price_cents IS NULL THEN
      v_missing := array_append(v_missing, 'valor');
    END IF;
    IF v_row.tuss_code IS NULL THEN
      v_missing := array_append(v_missing, 'procedimento');
    END IF;
    IF v_row.service_on > v_today THEN
      v_missing := array_append(v_missing, 'atendimento_no_futuro');
    END IF;
    v_total := v_total + COALESCE(v_row.price_cents, 0);
    v_items := v_items || jsonb_build_object(
      'item_id', v_row.item_id,
      'charge_id', v_row.charge_id,
      'sequence', v_row.sequence,
      'executed_on', v_row.service_on,
      'start_time', to_char(v_row.starts_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS'),
      'end_time', to_char(v_row.ends_at AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS'),
      'tuss_table', v_row.tuss_table,
      'tuss_code', v_row.tuss_code,
      'tuss_term', public.tiss_ascii(v_row.tuss_term, 150),
      'quantity', 1,
      'unit_cents', v_row.price_cents,
      'total_cents', v_row.price_cents
    );
  END LOOP;

  -- Contratado: o credenciamento próprio de quem atendeu (pessoa física)
  -- vence o da clínica.
  SELECT * INTO v_prof_cred FROM public.convenio_credentials
  WHERE convenio_id = v_g.convenio_id AND contractor_kind = 'professional'
    AND professional_id = v_first_prof AND active;
  IF FOUND THEN
    v_contract := v_prof_cred;
  ELSE
    SELECT * INTO v_contract FROM public.convenio_credentials
    WHERE convenio_id = v_g.convenio_id AND contractor_kind = 'clinic' AND active;
  END IF;

  SELECT full_name INTO v_prof_name FROM public.profiles WHERE id = v_first_prof;
  SELECT * INTO v_bill FROM public.professional_billing_info WHERE professional_id = v_first_prof;

  IF v_contract.id IS NULL THEN
    v_missing := array_append(v_missing, 'credenciamento');
  ELSE
    v_contract_kind := 'code';
    v_contract_value := public.tiss_ascii(v_contract.provider_code, 14);
    v_contract_name := public.tiss_ascii(CASE WHEN v_contract.contractor_kind = 'professional'
      THEN v_prof_name ELSE COALESCE(v_clinic.legal_name, v_clinic.name) END, 70);
  END IF;

  IF v_conv.ans_registry IS NULL OR v_conv.ans_registry !~ '^[0-9]{6}$' THEN
    v_missing := array_append(v_missing, 'registro_ans');
  END IF;
  IF v_cov.id IS NULL OR v_cov.card_number IS NULL THEN
    v_missing := array_append(v_missing, 'carteira');
  ELSIF v_cov.card_valid_until IS NOT NULL AND v_cov.card_valid_until < (v_items->0->>'executed_on')::date THEN
    v_warnings := array_append(v_warnings, 'carteira_vencida');
  END IF;

  -- Quem atendeu vai na equipe (equipeSadt): código próprio na operadora
  -- ou CPF.
  IF v_prof_cred.id IS NOT NULL THEN
    v_exec_kind := 'code';
    v_exec_value := public.tiss_ascii(v_prof_cred.provider_code, 14);
  ELSIF v_bill.cpf ~ '^[0-9]{11}$' THEN
    v_exec_kind := 'cpf';
    v_exec_value := v_bill.cpf;
  ELSE
    v_missing := array_append(v_missing, 'cpf_executante');
  END IF;
  IF v_bill.council_code IS NULL OR v_bill.council_number IS NULL OR v_bill.council_uf IS NULL THEN
    v_missing := array_append(v_missing, 'conselho_executante');
  END IF;
  IF v_bill.cbo_code IS NULL THEN
    v_missing := array_append(v_missing, 'cbo_executante');
  END IF;

  IF v_g.requester_id IS NOT NULL THEN
    SELECT * INTO v_req FROM public.tiss_requesters WHERE id = v_g.requester_id;
  END IF;

  IF (v_g.password IS NOT NULL OR v_g.operator_guide_number IS NOT NULL OR v_g.password_valid_until IS NOT NULL)
     AND v_g.authorized_on IS NULL THEN
    v_missing := array_append(v_missing, 'data_autorizacao');
  END IF;
  IF v_g.clinical_indication IS NULL THEN
    v_warnings := array_append(v_warnings, 'indicacao_clinica');
  END IF;
  IF v_clinic.cnes IS NULL THEN
    v_warnings := array_append(v_warnings, 'sem_cnes');
  END IF;

  RETURN jsonb_build_object(
    'guide_id', v_g.id,
    'convenio_id', v_g.convenio_id,
    'patient_id', v_g.patient_id,
    'patient_name', v_patient_name,
    'status', v_g.status,
    'ans_registry', v_conv.ans_registry,
    'payment_term_days', v_conv.payment_term_days,
    'guide_number', v_g.number,
    'operator_guide_number', public.tiss_ascii(v_g.operator_guide_number, 20),
    'authorized_on', v_g.authorized_on,
    'password', public.tiss_ascii(v_g.password, 20),
    'password_valid_until', v_g.password_valid_until,
    'card_number', public.tiss_ascii(v_cov.card_number, 20),
    'card_valid_until', v_cov.card_valid_until,
    'contractor_key', COALESCE(v_contract.id::TEXT, ''),
    'contractor_kind', v_contract_kind,
    'contractor_value', v_contract_value,
    'contractor_name', v_contract_name,
    'cnes', COALESCE(v_clinic.cnes, '9999999'),
    -- Solicitante externo: o código dele na operadora não é conhecido;
    -- o executante preenche 14 noves (manual TISS, campo 13).
    'requester_code', CASE WHEN v_req.id IS NOT NULL THEN '99999999999999' ELSE v_contract_value END,
    'requester_contractor_name', CASE WHEN v_req.id IS NOT NULL THEN public.tiss_ascii(v_req.name, 70) ELSE v_contract_name END,
    'requester_name', public.tiss_ascii(CASE WHEN v_req.id IS NOT NULL THEN v_req.name ELSE v_prof_name END, 70),
    'requester_council', CASE WHEN v_req.id IS NOT NULL THEN v_req.council_code ELSE v_bill.council_code END,
    'requester_council_number', public.tiss_ascii(CASE WHEN v_req.id IS NOT NULL THEN v_req.council_number ELSE v_bill.council_number END, 15),
    'requester_uf', CASE WHEN v_req.id IS NOT NULL THEN v_req.council_uf ELSE v_bill.council_uf END,
    'requester_cbo', CASE WHEN v_req.id IS NOT NULL THEN v_req.cbo_code ELSE v_bill.cbo_code END,
    'requester_external', v_req.id IS NOT NULL,
    'requester_id', v_req.id,
    'requested_on', v_g.requested_on,
    'character_code', v_g.character_code,
    'clinical_indication', public.tiss_ascii(v_g.clinical_indication, 500),
    'attendance_type', v_g.attendance_type,
    'accident_code', v_g.accident_code,
    'regime_code', v_regime,
    'notes', public.tiss_ascii(v_g.notes, 500),
    'executor_kind', v_exec_kind,
    'executor_value', v_exec_value,
    'executor_name', public.tiss_ascii(v_prof_name, 70),
    'executor_council', v_bill.council_code,
    'executor_council_number', public.tiss_ascii(v_bill.council_number, 15),
    'executor_uf', v_bill.council_uf,
    'executor_cbo', v_bill.cbo_code,
    'items', v_items,
    'total_cents', v_total,
    'missing', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_missing) ORDER BY 1)),
    'warnings', to_jsonb(ARRAY(SELECT DISTINCT unnest(v_warnings) ORDER BY 1))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tiss_guide_snapshot(UUID) FROM PUBLIC, anon, authenticated;

-- A tela: guias de uma operadora (em aberto: dados ao vivo; em lote: a
-- cópia congelada do lote valendo).
CREATE OR REPLACE FUNCTION public.finance_tiss_guides(p_convenio UUID DEFAULT NULL)
RETURNS SETOF JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_guide RECORD;
BEGIN
  FOR v_guide IN
    SELECT g.id, g.status, g.number, g.created_at
    FROM public.tiss_guides g
    WHERE g.clinic_id = v_clinic AND (p_convenio IS NULL OR g.convenio_id = p_convenio)
      AND g.status <> 'cancelled'
    ORDER BY g.created_at DESC
  LOOP
    RETURN NEXT public.tiss_guide_snapshot(v_guide.id) || jsonb_build_object(
      'batch', (
        SELECT jsonb_build_object('batch_id', b.id, 'number', b.number, 'status', b.status, 'sent_on', b.sent_on,
                                  'batch_guide_id', bg.id)
        FROM public.tiss_batch_guides bg JOIN public.tiss_batches b ON b.id = bg.batch_id
        WHERE bg.guide_id = v_guide.id AND bg.superseded_at IS NULL
      ),
      'settled', (
        SELECT jsonb_build_object('paid_cents', COALESCE(sum(s.paid_cents), 0), 'glosa_cents', COALESCE(sum(s.glosa_cents), 0))
        FROM public.tiss_guide_settlements s WHERE s.guide_id = v_guide.id AND s.voided_at IS NULL
      )
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_guides(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_guides(UUID) TO authenticated;

-- Campos da guia que a administração preenche (só em aberto).
CREATE OR REPLACE FUNCTION public.finance_tiss_save_guide(p_guide UUID, p_fields JSONB)
RETURNS public.tiss_guides
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_g public.tiss_guides%ROWTYPE;
  v_text TEXT;
BEGIN
  SELECT * INTO v_g FROM public.tiss_guides WHERE id = p_guide AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guia não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_g.status <> 'open' THEN
    RAISE EXCEPTION 'guia_no_lote: guia em lote não muda. Reenvie em novo lote para corrigir.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(COALESCE(p_fields, 'null'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'Nada para salvar.' USING ERRCODE = '22023';
  END IF;

  IF p_fields ? 'requester_id' AND NULLIF(p_fields->>'requester_id', '') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.tiss_requesters r
    WHERE r.id = (p_fields->>'requester_id')::UUID AND r.clinic_id = v_clinic AND r.active
  ) THEN
    RAISE EXCEPTION 'Solicitante não encontrado.' USING ERRCODE = '22023';
  END IF;
  IF p_fields ? 'authorized_on' AND NULLIF(p_fields->>'authorized_on', '')::DATE > public.finance_today() THEN
    RAISE EXCEPTION 'A data da autorização é hoje ou antes.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.tiss_guides g SET
    operator_guide_number = CASE WHEN p_fields ? 'operator_guide_number' THEN NULLIF(btrim(p_fields->>'operator_guide_number'), '') ELSE g.operator_guide_number END,
    authorized_on = CASE WHEN p_fields ? 'authorized_on' THEN NULLIF(p_fields->>'authorized_on', '')::DATE ELSE g.authorized_on END,
    password = CASE WHEN p_fields ? 'password' THEN NULLIF(btrim(p_fields->>'password'), '') ELSE g.password END,
    password_valid_until = CASE WHEN p_fields ? 'password_valid_until' THEN NULLIF(p_fields->>'password_valid_until', '')::DATE ELSE g.password_valid_until END,
    requester_id = CASE WHEN p_fields ? 'requester_id' THEN NULLIF(p_fields->>'requester_id', '')::UUID ELSE g.requester_id END,
    requested_on = CASE WHEN p_fields ? 'requested_on' THEN NULLIF(p_fields->>'requested_on', '')::DATE ELSE g.requested_on END,
    character_code = CASE WHEN p_fields ? 'character_code' THEN p_fields->>'character_code' ELSE g.character_code END,
    clinical_indication = CASE WHEN p_fields ? 'clinical_indication' THEN NULLIF(btrim(p_fields->>'clinical_indication'), '') ELSE g.clinical_indication END,
    attendance_type = CASE WHEN p_fields ? 'attendance_type' THEN p_fields->>'attendance_type' ELSE g.attendance_type END,
    accident_code = CASE WHEN p_fields ? 'accident_code' THEN p_fields->>'accident_code' ELSE g.accident_code END,
    notes = CASE WHEN p_fields ? 'notes' THEN NULLIF(btrim(p_fields->>'notes'), '') ELSE g.notes END,
    updated_at = timezone('utc', now())
  WHERE g.id = p_guide
  RETURNING * INTO v_g;
  v_text := v_g.number;
  RETURN v_g;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_save_guide(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_save_guide(UUID, JSONB) TO authenticated;

-- ----------------------------------------------------------
-- 11. XML do lote (a partir da cópia congelada)
-- Espelho: buildBatchXml em utils/tissXml.js (mesma ordem de elementos).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tiss_batch_xml(p_batch UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_b public.tiss_batches%ROWTYPE;
  v_guides TEXT := '';
  v_g RECORD;
  v_i RECORD;
  v_items TEXT;
  v_body TEXT;
  v_origin TEXT;
BEGIN
  SELECT * INTO v_b FROM public.tiss_batches WHERE id = p_batch;
  v_origin := CASE v_b.origin_kind
    WHEN 'code' THEN public.tiss_el('codigoPrestadorNaOperadora', v_b.origin_value)
    WHEN 'cnpj' THEN public.tiss_el('CNPJ', v_b.origin_value)
    ELSE public.tiss_el('CPF', v_b.origin_value) END;

  FOR v_g IN
    SELECT bg.* FROM public.tiss_batch_guides bg
    WHERE bg.batch_id = p_batch
    ORDER BY bg.guide_number::NUMERIC
  LOOP
    v_items := '';
    FOR v_i IN SELECT * FROM public.tiss_batch_items WHERE batch_guide_id = v_g.id ORDER BY sequence LOOP
      v_items := v_items || '<ans:procedimentoExecutado>'
        || public.tiss_el('sequencialItem', v_i.sequence::TEXT)
        || public.tiss_el('dataExecucao', to_char(v_i.executed_on, 'YYYY-MM-DD'))
        || public.tiss_el('horaInicial', to_char(v_i.start_time, 'HH24:MI:SS'))
        || public.tiss_el('horaFinal', to_char(v_i.end_time, 'HH24:MI:SS'))
        || '<ans:procedimento>'
        || public.tiss_el('codigoTabela', v_i.tuss_table)
        || public.tiss_el('codigoProcedimento', v_i.tuss_code)
        || public.tiss_el('descricaoProcedimento', v_i.tuss_term)
        || '</ans:procedimento>'
        || public.tiss_el('quantidadeExecutada', v_i.quantity::TEXT)
        || public.tiss_el('reducaoAcrescimo', '1.00')
        || public.tiss_el('valorUnitario', public.tiss_money(v_i.unit_cents))
        || public.tiss_el('valorTotal', public.tiss_money(v_i.total_cents))
        || '<ans:equipeSadt><ans:codProfissional>'
        || CASE v_i.executor_kind WHEN 'code' THEN public.tiss_el('codigoPrestadorNaOperadora', v_i.executor_value)
             ELSE public.tiss_el('cpfContratado', v_i.executor_value) END
        || '</ans:codProfissional>'
        || public.tiss_el('nomeProf', v_i.executor_name)
        || public.tiss_el('conselho', v_i.executor_council)
        || public.tiss_el('numeroConselhoProfissional', v_i.executor_council_number)
        || public.tiss_el('UF', v_i.executor_uf)
        || public.tiss_el('CBOS', v_i.executor_cbo)
        || '</ans:equipeSadt>'
        || '</ans:procedimentoExecutado>';
    END LOOP;

    v_guides := v_guides || '<ans:guiaSP-SADT>'
      || '<ans:cabecalhoGuia>'
      || public.tiss_el('registroANS', v_b.ans_registry)
      || public.tiss_el('numeroGuiaPrestador', v_g.guide_number)
      || '</ans:cabecalhoGuia>'
      || CASE WHEN v_g.authorized_on IS NOT NULL THEN
           '<ans:dadosAutorizacao>'
           || public.tiss_el('numeroGuiaOperadora', v_g.operator_guide_number)
           || public.tiss_el('dataAutorizacao', to_char(v_g.authorized_on, 'YYYY-MM-DD'))
           || public.tiss_el('senha', v_g.password)
           || public.tiss_el('dataValidadeSenha', to_char(v_g.password_valid_until, 'YYYY-MM-DD'))
           || '</ans:dadosAutorizacao>'
         ELSE '' END
      || '<ans:dadosBeneficiario>'
      || public.tiss_el('numeroCarteira', v_g.card_number)
      || public.tiss_el('atendimentoRN', 'N')
      || '</ans:dadosBeneficiario>'
      || '<ans:dadosSolicitante><ans:contratadoSolicitante>'
      || public.tiss_el('codigoPrestadorNaOperadora', v_g.requester_code)
      || '</ans:contratadoSolicitante>'
      || public.tiss_el('nomeContratadoSolicitante', v_g.requester_contractor_name)
      || '<ans:profissionalSolicitante>'
      || public.tiss_el('nomeProfissional', v_g.requester_name)
      || public.tiss_el('conselhoProfissional', v_g.requester_council)
      || public.tiss_el('numeroConselhoProfissional', v_g.requester_council_number)
      || public.tiss_el('UF', v_g.requester_uf)
      || public.tiss_el('CBOS', v_g.requester_cbo)
      || '</ans:profissionalSolicitante></ans:dadosSolicitante>'
      || '<ans:dadosSolicitacao>'
      || public.tiss_el('dataSolicitacao', to_char(v_g.requested_on, 'YYYY-MM-DD'))
      || public.tiss_el('caraterAtendimento', v_g.character_code)
      || public.tiss_el('indicacaoClinica', v_g.clinical_indication)
      || '</ans:dadosSolicitacao>'
      || '<ans:dadosExecutante><ans:contratadoExecutante>'
      || CASE v_g.contractor_kind WHEN 'code' THEN public.tiss_el('codigoPrestadorNaOperadora', v_g.contractor_value)
           WHEN 'cnpj' THEN public.tiss_el('cnpjContratado', v_g.contractor_value)
           ELSE public.tiss_el('cpfContratado', v_g.contractor_value) END
      || '</ans:contratadoExecutante>'
      || public.tiss_el('CNES', v_g.cnes)
      || '</ans:dadosExecutante>'
      || '<ans:dadosAtendimento>'
      || public.tiss_el('tipoAtendimento', v_g.attendance_type)
      || public.tiss_el('indicacaoAcidente', v_g.accident_code)
      || public.tiss_el('regimeAtendimento', v_g.regime_code)
      || '</ans:dadosAtendimento>'
      || '<ans:procedimentosExecutados>' || v_items || '</ans:procedimentosExecutados>'
      || public.tiss_el('observacao', v_g.notes)
      || '<ans:valorTotal>'
      || public.tiss_el('valorProcedimentos', public.tiss_money(v_g.total_cents))
      || public.tiss_el('valorTotalGeral', public.tiss_money(v_g.total_cents))
      || '</ans:valorTotal>'
      || '</ans:guiaSP-SADT>';
  END LOOP;

  v_body := '<ans:cabecalho><ans:identificacaoTransacao>'
    || public.tiss_el('tipoTransacao', 'ENVIO_LOTE_GUIAS')
    || public.tiss_el('sequencialTransacao', v_b.number)
    || public.tiss_el('dataRegistroTransacao', to_char(v_b.generated_on, 'YYYY-MM-DD'))
    || public.tiss_el('horaRegistroTransacao', to_char(v_b.generated_time, 'HH24:MI:SS'))
    || '</ans:identificacaoTransacao>'
    || '<ans:origem><ans:identificacaoPrestador>' || v_origin || '</ans:identificacaoPrestador></ans:origem>'
    || '<ans:destino>' || public.tiss_el('registroANS', v_b.ans_registry) || '</ans:destino>'
    || public.tiss_el('Padrao', '4.03.00')
    || '</ans:cabecalho>'
    || '<ans:prestadorParaOperadora><ans:loteGuias>'
    || public.tiss_el('numeroLote', v_b.number)
    || '<ans:guiasTISS>' || v_guides || '</ans:guiasTISS>'
    || '</ans:loteGuias></ans:prestadorParaOperadora>';

  RETURN '<?xml version="1.0" encoding="ISO-8859-1"?>'
    || '<ans:mensagemTISS xmlns:ans="http://www.ans.gov.br/padroes/tiss/schemas">'
    || v_body
    || '<ans:epilogo><ans:hash>' || COALESCE(NULLIF(v_b.xml_hash, ''), '') || '</ans:hash></ans:epilogo>'
    || '</ans:mensagemTISS>';
END;
$$;

REVOKE ALL ON FUNCTION public.tiss_batch_xml(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 12. Montar o lote
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_tiss_create_batch(p_convenio UUID, p_guides UUID[])
RETURNS public.tiss_batches
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_conv public.clinic_convenios%ROWTYPE;
  v_batch public.tiss_batches%ROWTYPE;
  v_snap JSONB;
  v_first JSONB;
  v_guide UUID;
  v_bg UUID;
  v_item JSONB;
  v_total INTEGER := 0;
  v_from DATE;
  v_until DATE;
  v_now TIMESTAMP := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_xml TEXT;
  v_hash TEXT;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_conv FROM public.clinic_convenios WHERE id = p_convenio AND clinic_id = v_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Operadora não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  v_count := COALESCE(cardinality(p_guides), 0);
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Escolha as guias do lote.' USING ERRCODE = '22023';
  END IF;
  IF v_count > 100 THEN
    RAISE EXCEPTION 'lote_grande: o padrão TISS aceita até 100 guias por lote.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT x) FROM unnest(p_guides) x) <> v_count THEN
    RAISE EXCEPTION 'Guia repetida no lote.' USING ERRCODE = '22023';
  END IF;

  -- Trava as guias na ordem, para dois cliques não montarem dois lotes.
  PERFORM 1 FROM public.tiss_guides g WHERE g.id = ANY (p_guides) ORDER BY g.id FOR UPDATE;

  FOREACH v_guide IN ARRAY p_guides LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.tiss_guides g
      WHERE g.id = v_guide AND g.clinic_id = v_clinic AND g.convenio_id = p_convenio AND g.status = 'open'
    ) THEN
      RAISE EXCEPTION 'guia_fora: uma das guias não está em aberto nesta operadora.' USING ERRCODE = '22023';
    END IF;
    v_snap := public.tiss_guide_snapshot(v_guide);
    IF jsonb_array_length(v_snap->'missing') > 0 THEN
      RAISE EXCEPTION 'guia_incompleta: a guia % ainda tem pendência (%).', v_snap->>'guide_number',
        (SELECT string_agg(x, ', ') FROM jsonb_array_elements_text(v_snap->'missing') x)
        USING ERRCODE = '22023';
    END IF;
    IF v_first IS NULL THEN
      v_first := v_snap;
    ELSIF v_snap->>'contractor_key' IS DISTINCT FROM v_first->>'contractor_key' THEN
      RAISE EXCEPTION 'contratado_misturado: o lote leva um contratado só. Separe as guias do credenciamento próprio de quem atende das guias da clínica.'
        USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.tiss_batches (
    clinic_id, convenio_id, number, origin_kind, origin_value, ans_registry,
    generated_on, generated_time, period_from, period_until, guide_count, total_cents, xml, xml_hash, created_by
  ) VALUES (
    v_clinic, p_convenio, public.tiss_next_number(p_convenio, 'batch'),
    v_first->>'contractor_kind', v_first->>'contractor_value', v_conv.ans_registry,
    v_now::date, date_trunc('second', v_now)::time, public.finance_today(), public.finance_today(),
    v_count, 0, '-', repeat('0', 32), auth.uid()
  ) RETURNING * INTO v_batch;

  FOREACH v_guide IN ARRAY p_guides LOOP
    v_snap := public.tiss_guide_snapshot(v_guide);
    INSERT INTO public.tiss_batch_guides (
      batch_id, guide_id, clinic_id, guide_number, operator_guide_number, authorized_on, password, password_valid_until,
      card_number, contractor_kind, contractor_value, contractor_name, cnes,
      requester_code, requester_contractor_name, requester_name, requester_council, requester_council_number,
      requester_uf, requester_cbo, requested_on, character_code, clinical_indication, attendance_type,
      accident_code, regime_code, notes, total_cents
    ) VALUES (
      v_batch.id, v_guide, v_clinic, v_snap->>'guide_number', v_snap->>'operator_guide_number',
      (v_snap->>'authorized_on')::DATE, v_snap->>'password', (v_snap->>'password_valid_until')::DATE,
      v_snap->>'card_number', v_snap->>'contractor_kind', v_snap->>'contractor_value', v_snap->>'contractor_name',
      v_snap->>'cnes', v_snap->>'requester_code', v_snap->>'requester_contractor_name', v_snap->>'requester_name',
      v_snap->>'requester_council', v_snap->>'requester_council_number', v_snap->>'requester_uf', v_snap->>'requester_cbo',
      (v_snap->>'requested_on')::DATE, v_snap->>'character_code', v_snap->>'clinical_indication',
      v_snap->>'attendance_type', v_snap->>'accident_code', v_snap->>'regime_code', v_snap->>'notes',
      (v_snap->>'total_cents')::INTEGER
    ) RETURNING id INTO v_bg;

    FOR v_item IN SELECT * FROM jsonb_array_elements(v_snap->'items') LOOP
      INSERT INTO public.tiss_batch_items (
        batch_guide_id, item_id, clinic_id, sequence, executed_on, start_time, end_time,
        tuss_table, tuss_code, tuss_term, quantity, unit_cents, total_cents,
        executor_kind, executor_value, executor_name, executor_council, executor_council_number, executor_uf, executor_cbo
      ) VALUES (
        v_bg, (v_item->>'item_id')::UUID, v_clinic, (v_item->>'sequence')::SMALLINT, (v_item->>'executed_on')::DATE,
        (v_item->>'start_time')::TIME, (v_item->>'end_time')::TIME,
        v_item->>'tuss_table', v_item->>'tuss_code', COALESCE(v_item->>'tuss_term', v_item->>'tuss_code'),
        (v_item->>'quantity')::SMALLINT, (v_item->>'unit_cents')::INTEGER, (v_item->>'total_cents')::INTEGER,
        v_snap->>'executor_kind', v_snap->>'executor_value', v_snap->>'executor_name', v_snap->>'executor_council',
        v_snap->>'executor_council_number', v_snap->>'executor_uf', v_snap->>'executor_cbo'
      );
      v_from := LEAST(COALESCE(v_from, (v_item->>'executed_on')::DATE), (v_item->>'executed_on')::DATE);
      v_until := GREATEST(COALESCE(v_until, (v_item->>'executed_on')::DATE), (v_item->>'executed_on')::DATE);
    END LOOP;
    v_total := v_total + (v_snap->>'total_cents')::INTEGER;

    UPDATE public.tiss_guides SET status = 'batched', updated_at = timezone('utc', now()) WHERE id = v_guide;
  END LOOP;

  -- O lote acabou de nascer: o guarda deixa estas colunas mudarem só
  -- nesta transação, para este lote (a linha ainda não tem XML).
  PERFORM set_config('tiss.building_batch', v_batch.id::TEXT, TRUE);
  UPDATE public.tiss_batches SET total_cents = v_total, period_from = v_from, period_until = v_until WHERE id = v_batch.id;
  v_xml := public.tiss_batch_xml(v_batch.id);
  v_hash := public.tiss_hash(v_xml);
  UPDATE public.tiss_batches SET xml_hash = v_hash WHERE id = v_batch.id;
  v_xml := public.tiss_batch_xml(v_batch.id);
  UPDATE public.tiss_batches SET xml = v_xml WHERE id = v_batch.id RETURNING * INTO v_batch;
  PERFORM set_config('tiss.building_batch', '', TRUE);

  RETURN v_batch;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_create_batch(UUID, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_create_batch(UUID, UUID[]) TO authenticated;

-- ----------------------------------------------------------
-- 13. Situação da guia (só as funções mudam)
--   em aberto → no lote → paga | glosada | recurso
-- Paga = a operadora pagou o total. Glosa em aberto = o menor entre a
-- glosa lançada e o que falta receber. Espelho: guideStatusFrom em
-- utils/tissXml.js.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tiss_refresh_guide_status(p_guide UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_g public.tiss_guides%ROWTYPE;
  v_bg public.tiss_batch_guides%ROWTYPE;
  v_paid INTEGER;
  v_glosa INTEGER;
  v_status TEXT;
BEGIN
  SELECT * INTO v_g FROM public.tiss_guides WHERE id = p_guide FOR UPDATE;
  IF NOT FOUND OR v_g.status = 'cancelled' THEN
    RETURN v_g.status;
  END IF;
  SELECT * INTO v_bg FROM public.tiss_batch_guides WHERE guide_id = p_guide AND superseded_at IS NULL;
  IF NOT FOUND THEN
    v_status := 'open';
  ELSE
    SELECT COALESCE(sum(s.paid_cents), 0) INTO v_paid
    FROM public.tiss_guide_settlements s WHERE s.guide_id = p_guide AND s.voided_at IS NULL;
    SELECT COALESCE(sum(s.glosa_cents), 0) INTO v_glosa
    FROM public.tiss_guide_settlements s
    JOIN public.tiss_batch_items bi ON bi.id = s.batch_item_id
    WHERE s.guide_id = p_guide AND s.voided_at IS NULL AND bi.batch_guide_id = v_bg.id;
    v_status := CASE
      WHEN v_paid >= v_bg.total_cents THEN 'paid'
      WHEN EXISTS (SELECT 1 FROM public.tiss_guide_appeals a WHERE a.guide_id = p_guide AND a.closed_on IS NULL) THEN 'appeal'
      WHEN LEAST(v_glosa, v_bg.total_cents - v_paid) > 0 THEN 'glosa'
      ELSE 'batched'
    END;
  END IF;
  IF v_status IS DISTINCT FROM v_g.status THEN
    UPDATE public.tiss_guides SET status = v_status, updated_at = timezone('utc', now()) WHERE id = p_guide;
  END IF;
  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.tiss_refresh_guide_status(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 14. Lote: enviado, descartado; guia: reenviar em novo lote
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_tiss_mark_sent(p_batch UUID, p_sent_on DATE, p_protocol TEXT DEFAULT NULL)
RETURNS public.tiss_batches
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_b public.tiss_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_b FROM public.tiss_batches WHERE id = p_batch AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status <> 'generated' THEN
    RAISE EXCEPTION 'Este lote já foi marcado como enviado ou descartado.' USING ERRCODE = '22023';
  END IF;
  IF p_sent_on IS NULL OR p_sent_on > public.finance_today() OR p_sent_on < v_b.generated_on THEN
    RAISE EXCEPTION 'A data do envio fica entre o dia em que o lote foi gerado e hoje.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tiss_batches
  SET status = 'sent', sent_on = p_sent_on, protocol_number = NULLIF(btrim(COALESCE(p_protocol, '')), '')
  WHERE id = p_batch
  RETURNING * INTO v_b;
  RETURN v_b;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_mark_sent(UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_mark_sent(UUID, DATE, TEXT) TO authenticated;

-- Lote gerado e ainda não enviado pode ser descartado: as guias voltam a
-- ficar em aberto, e o número do lote não volta (fica com o motivo).
CREATE OR REPLACE FUNCTION public.finance_tiss_discard_batch(p_batch UUID, p_reason TEXT)
RETURNS public.tiss_batches
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_b public.tiss_batches%ROWTYPE;
  v_guide UUID;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_b FROM public.tiss_batches WHERE id = p_batch AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_b.status <> 'generated' THEN
    RAISE EXCEPTION 'lote_enviado: lote já enviado não se descarta. Reenvie as guias que precisam de correção.' USING ERRCODE = '22023';
  END IF;
  FOR v_guide IN
    UPDATE public.tiss_batch_guides
    SET superseded_at = timezone('utc', now()), superseded_by = auth.uid(), supersede_reason = 'Lote descartado: ' || btrim(p_reason)
    WHERE batch_id = p_batch AND superseded_at IS NULL
    RETURNING guide_id
  LOOP
    PERFORM public.tiss_refresh_guide_status(v_guide);
  END LOOP;
  UPDATE public.tiss_batches
  SET status = 'discarded', discarded_at = timezone('utc', now()), discarded_by = auth.uid(), discard_reason = btrim(p_reason)
  WHERE id = p_batch
  RETURNING * INTO v_b;
  RETURN v_b;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_discard_batch(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_discard_batch(UUID, TEXT) TO authenticated;

-- Correção de guia já enviada: sai do lote (que fica como foi) e volta a
-- ficar em aberto, para entrar no próximo lote. Com pagamento, não:
-- diferença de valor pago se resolve por recurso.
CREATE OR REPLACE FUNCTION public.finance_tiss_resend_guide(p_guide UUID, p_reason TEXT)
RETURNS public.tiss_guides
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_g public.tiss_guides%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo da correção.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_g FROM public.tiss_guides WHERE id = p_guide AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guia não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tiss_batch_guides WHERE guide_id = p_guide AND superseded_at IS NULL) THEN
    RAISE EXCEPTION 'Esta guia não está em lote.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tiss_guide_settlements s WHERE s.guide_id = p_guide AND s.voided_at IS NULL AND s.paid_cents > 0) THEN
    RAISE EXCEPTION 'guia_paga: guia com pagamento da operadora não se reenvia. Para diferença de valor, abra recurso.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tiss_guide_appeals a WHERE a.guide_id = p_guide AND a.closed_on IS NULL) THEN
    RAISE EXCEPTION 'Feche o recurso desta guia antes de reenviar.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tiss_batch_guides
  SET superseded_at = timezone('utc', now()), superseded_by = auth.uid(), supersede_reason = btrim(p_reason)
  WHERE guide_id = p_guide AND superseded_at IS NULL;
  PERFORM public.tiss_refresh_guide_status(p_guide);
  SELECT * INTO v_g FROM public.tiss_guides WHERE id = p_guide;
  RETURN v_g;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_resend_guide(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_resend_guide(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 15. Pagamento da operadora e glosa
--
-- p_items: [{guide_id, paid_cents, glosa_cents, glosa_code, glosa_note}]
-- A soma do que foi pago é o valor do depósito. Depósito zero = só glosa
-- (a operadora avisou e não pagou nada). Na guia com mais de um item o
-- valor vai preenchendo os itens na ordem.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_tiss_register_payment(
  p_convenio UUID,
  p_received_on DATE,
  p_amount_cents INTEGER,
  p_method TEXT,
  p_items JSONB,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_group UUID := gen_random_uuid();
  v_payment UUID;
  v_entry JSONB;
  v_guide UUID;
  v_bg public.tiss_batch_guides%ROWTYPE;
  v_batch public.tiss_batches%ROWTYPE;
  v_bi RECORD;
  v_paid_left INTEGER;
  v_glosa_left INTEGER;
  v_paid_part INTEGER;
  v_glosa_part INTEGER;
  v_code TEXT;
  v_sum INTEGER := 0;
  v_paid_before INTEGER;
  v_glosa_before INTEGER;
  v_room_paid INTEGER;
  v_seen UUID[] := ARRAY[]::UUID[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clinic_convenios WHERE id = p_convenio AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Operadora não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF p_received_on IS NULL OR p_received_on > public.finance_today() THEN
    RAISE EXCEPTION 'A data do pagamento é hoje ou antes, nunca depois.' USING ERRCODE = '22023';
  END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN
    RAISE EXCEPTION 'Valor do depósito inválido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, 'null'::JSONB)) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Diga o que aconteceu com cada guia.' USING ERRCODE = '22023';
  END IF;

  IF p_amount_cents > 0 THEN
    INSERT INTO public.convenio_payments (clinic_id, convenio_id, amount_cents, method, received_on, note, recorded_by)
    VALUES (v_clinic, p_convenio, p_amount_cents, p_method, p_received_on, NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid())
    RETURNING id INTO v_payment;
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_guide := NULLIF(v_entry->>'guide_id', '')::UUID;
    v_paid_left := COALESCE((v_entry->>'paid_cents')::INTEGER, 0);
    v_glosa_left := COALESCE((v_entry->>'glosa_cents')::INTEGER, 0);
    v_code := NULLIF(btrim(COALESCE(v_entry->>'glosa_code', '')), '');
    IF v_guide IS NULL OR v_guide = ANY (v_seen) THEN
      RAISE EXCEPTION 'Cada guia entra uma vez no pagamento.' USING ERRCODE = '22023';
    END IF;
    v_seen := array_append(v_seen, v_guide);
    IF v_paid_left < 0 OR v_glosa_left < 0 OR v_paid_left + v_glosa_left = 0 THEN
      RAISE EXCEPTION 'Em cada guia, diga quanto foi pago ou glosado.' USING ERRCODE = '22023';
    END IF;
    IF v_glosa_left > 0 AND (v_code IS NULL OR v_code !~ '^[0-9]{4}$') THEN
      RAISE EXCEPTION 'glosa_sem_motivo: glosa precisa do código do motivo (tabela 38 da ANS, 4 dígitos).' USING ERRCODE = '22023';
    END IF;
    IF v_glosa_left = 0 THEN
      v_code := NULL;
    END IF;

    SELECT bg.* INTO v_bg
    FROM public.tiss_batch_guides bg
    JOIN public.tiss_guides g ON g.id = bg.guide_id
    WHERE bg.guide_id = v_guide AND bg.superseded_at IS NULL
      AND g.clinic_id = v_clinic AND g.convenio_id = p_convenio
    FOR UPDATE OF g;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'guia_fora_do_lote: uma das guias não está em lote desta operadora.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO v_batch FROM public.tiss_batches WHERE id = v_bg.batch_id;
    IF v_batch.status <> 'sent' THEN
      RAISE EXCEPTION 'lote_nao_enviado: marque o lote % como enviado antes de lançar o pagamento.', v_batch.number USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(sum(paid_cents), 0), COALESCE(sum(glosa_cents), 0) INTO v_paid_before, v_glosa_before
    FROM public.tiss_guide_settlements WHERE guide_id = v_guide AND voided_at IS NULL;
    IF v_paid_before + v_paid_left > v_bg.total_cents THEN
      RAISE EXCEPTION 'pago_demais: o pago passa do valor da guia %.', v_bg.guide_number USING ERRCODE = '22023';
    END IF;
    IF v_glosa_before + v_glosa_left > v_bg.total_cents THEN
      RAISE EXCEPTION 'glosa_demais: a glosa passa do valor da guia %.', v_bg.guide_number USING ERRCODE = '22023';
    END IF;

    FOR v_bi IN
      SELECT bi.id, bi.total_cents,
             COALESCE((SELECT sum(s.paid_cents) FROM public.tiss_guide_settlements s
                       WHERE s.batch_item_id = bi.id AND s.voided_at IS NULL), 0) AS paid_item
      FROM public.tiss_batch_items bi WHERE bi.batch_guide_id = v_bg.id ORDER BY bi.sequence
    LOOP
      EXIT WHEN v_paid_left = 0 AND v_glosa_left = 0;
      v_room_paid := GREATEST(v_bi.total_cents - v_bi.paid_item, 0);
      v_paid_part := LEAST(v_paid_left, v_room_paid);
      v_glosa_part := LEAST(v_glosa_left, GREATEST(v_bi.total_cents - v_paid_part, 0));
      -- Último item leva o que sobrou (soma já conferida no total da guia).
      IF NOT EXISTS (SELECT 1 FROM public.tiss_batch_items x WHERE x.batch_guide_id = v_bg.id AND x.sequence > (SELECT sequence FROM public.tiss_batch_items WHERE id = v_bi.id)) THEN
        v_paid_part := v_paid_left;
        v_glosa_part := v_glosa_left;
      END IF;
      IF v_paid_part + v_glosa_part > 0 THEN
        INSERT INTO public.tiss_guide_settlements (
          clinic_id, batch_item_id, guide_id, payment_id, group_id, paid_cents, glosa_cents, glosa_code, glosa_note,
          settled_on, recorded_by
        ) VALUES (
          v_clinic, v_bi.id, v_guide, CASE WHEN v_paid_part > 0 THEN v_payment END, v_group, v_paid_part, v_glosa_part,
          CASE WHEN v_glosa_part > 0 THEN v_code END,
          CASE WHEN v_glosa_part > 0 THEN NULLIF(btrim(COALESCE(v_entry->>'glosa_note', '')), '') END,
          p_received_on, auth.uid()
        );
      END IF;
      v_sum := v_sum + v_paid_part;
      v_paid_left := v_paid_left - v_paid_part;
      v_glosa_left := v_glosa_left - v_glosa_part;
    END LOOP;

    PERFORM public.tiss_refresh_guide_status(v_guide);
  END LOOP;

  IF v_sum <> p_amount_cents THEN
    RAISE EXCEPTION 'deposito_diferente: o depósito (R$ %) é diferente da soma do que foi pago nas guias (R$ %).',
      replace(to_char(p_amount_cents / 100.0, 'FM9999990.00'), '.', ','),
      replace(to_char(v_sum / 100.0, 'FM9999990.00'), '.', ',')
      USING ERRCODE = '22023';
  END IF;

  RETURN v_group;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_register_payment(UUID, DATE, INTEGER, TEXT, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_register_payment(UUID, DATE, INTEGER, TEXT, JSONB, TEXT) TO authenticated;

-- Anula um lançamento inteiro (depósito e acertos, ou só a glosa).
CREATE OR REPLACE FUNCTION public.finance_tiss_void_settlement(p_group UUID, p_reason TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_count INTEGER;
  v_guide UUID;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo da anulação.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.convenio_payments p
  SET voided_at = timezone('utc', now()), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE p.clinic_id = v_clinic AND p.voided_at IS NULL
    AND p.id IN (SELECT s.payment_id FROM public.tiss_guide_settlements s WHERE s.group_id = p_group);
  WITH voided AS (
    UPDATE public.tiss_guide_settlements s
    SET voided_at = timezone('utc', now()), voided_by = auth.uid(), void_reason = btrim(p_reason)
    WHERE s.group_id = p_group AND s.clinic_id = v_clinic AND s.voided_at IS NULL
    RETURNING s.guide_id
  )
  SELECT count(*) INTO v_count FROM voided;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Lançamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  FOR v_guide IN SELECT DISTINCT guide_id FROM public.tiss_guide_settlements WHERE group_id = p_group LOOP
    PERFORM public.tiss_refresh_guide_status(v_guide);
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_void_settlement(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_void_settlement(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 16. Recurso de glosa (registro; o envio do recurso é no portal)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_tiss_open_appeal(p_guide UUID, p_note TEXT, p_opened_on DATE DEFAULT NULL)
RETURNS public.tiss_guide_appeals
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_g public.tiss_guides%ROWTYPE;
  v_a public.tiss_guide_appeals%ROWTYPE;
  v_day DATE := COALESCE(p_opened_on, public.finance_today());
BEGIN
  SELECT * INTO v_g FROM public.tiss_guides WHERE id = p_guide AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Guia não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_g.status <> 'glosa' THEN
    RAISE EXCEPTION 'Recurso é para guia glosada.' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 3 THEN
    RAISE EXCEPTION 'Diga a justificativa do recurso.' USING ERRCODE = '22023';
  END IF;
  IF v_day > public.finance_today() THEN
    RAISE EXCEPTION 'A data do recurso é hoje ou antes.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.tiss_guide_appeals (clinic_id, guide_id, opened_on, note, opened_by)
  VALUES (v_clinic, p_guide, v_day, btrim(p_note), auth.uid())
  RETURNING * INTO v_a;
  PERFORM public.tiss_refresh_guide_status(p_guide);
  RETURN v_a;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_open_appeal(UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_open_appeal(UUID, TEXT, DATE) TO authenticated;

-- Resultado do recurso. Ganhou: o dinheiro entra quando a operadora
-- pagar (lance o pagamento). Perdeu: a guia segue glosada no "A receber"
-- (decisão da administradora: só sai quando o dinheiro entra).
CREATE OR REPLACE FUNCTION public.finance_tiss_close_appeal(p_guide UUID, p_outcome TEXT, p_note TEXT DEFAULT NULL)
RETURNS public.tiss_guide_appeals
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_a public.tiss_guide_appeals%ROWTYPE;
BEGIN
  IF p_outcome NOT IN ('won', 'lost') THEN
    RAISE EXCEPTION 'Diga se o recurso foi aceito ou negado.' USING ERRCODE = '22023';
  END IF;
  UPDATE public.tiss_guide_appeals a
  SET closed_on = public.finance_today(), outcome = p_outcome,
      outcome_note = NULLIF(btrim(COALESCE(p_note, '')), ''), closed_by = auth.uid()
  WHERE a.guide_id = p_guide AND a.clinic_id = v_clinic AND a.closed_on IS NULL
  RETURNING * INTO v_a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Esta guia não tem recurso aberto.' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.tiss_refresh_guide_status(p_guide);
  RETURN v_a;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_close_appeal(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_close_appeal(UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 17. Para o "A receber", o Resumo e o repasse: situação de cada
--     cobrança de convênio. Nomes de saída em português (não colidem
--     com colunas: §9 do AGENTS.md).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_tiss_charge_status()
RETURNS TABLE (
  cobranca UUID,
  guia UUID,
  numero_guia TEXT,
  situacao TEXT,
  lote TEXT,
  enviado_em DATE,
  prazo_dias SMALLINT,
  pago_centavos INTEGER,
  glosa_centavos INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.charge_id, g.id, g.number, g.status, b.number, b.sent_on, cv.payment_term_days,
         COALESCE((SELECT sum(s.paid_cents) FROM public.tiss_guide_settlements s
                   JOIN public.tiss_batch_items bi ON bi.id = s.batch_item_id
                   WHERE s.voided_at IS NULL AND bi.item_id = i.id), 0)::INTEGER,
         COALESCE((SELECT sum(s.glosa_cents) FROM public.tiss_guide_settlements s
                   JOIN public.tiss_batch_items bi ON bi.id = s.batch_item_id
                   WHERE s.voided_at IS NULL AND bi.item_id = i.id AND bi.batch_guide_id = bg.id), 0)::INTEGER
  FROM public.tiss_guide_items i
  JOIN public.tiss_guides g ON g.id = i.guide_id
  JOIN public.clinic_convenios cv ON cv.id = g.convenio_id
  LEFT JOIN public.tiss_batch_guides bg ON bg.guide_id = g.id AND bg.superseded_at IS NULL
  LEFT JOIN public.tiss_batches b ON b.id = bg.batch_id
  WHERE public.can_manage_finance(g.clinic_id)
    AND g.status <> 'cancelled';
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_charge_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_charge_status() TO authenticated;

-- Dinheiro da operadora por cobrança (Recebidos, Resumo e repasse "quando
-- o paciente paga": no convênio, quando a operadora paga).
CREATE OR REPLACE FUNCTION public.finance_tiss_paid_rows()
RETURNS TABLE (
  cobranca UUID,
  lancamento UUID,
  pagamento UUID,
  operadora UUID,
  pago_em DATE,
  forma TEXT,
  valor_centavos INTEGER
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.charge_id, s.group_id, p.id, p.convenio_id, p.received_on, p.method, s.paid_cents
  FROM public.tiss_guide_settlements s
  JOIN public.convenio_payments p ON p.id = s.payment_id AND p.voided_at IS NULL
  JOIN public.tiss_batch_items bi ON bi.id = s.batch_item_id
  JOIN public.tiss_guide_items i ON i.id = bi.item_id
  WHERE s.voided_at IS NULL AND s.paid_cents > 0
    AND public.can_manage_finance(s.clinic_id);
$$;

REVOKE ALL ON FUNCTION public.finance_tiss_paid_rows() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_tiss_paid_rows() TO authenticated;
