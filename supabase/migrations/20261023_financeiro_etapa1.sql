-- ==========================================================
-- Financeiro, etapa 1 (23/10/2026, opção C escolhida pela administradora)
-- REQUER: 20260908_financeiro_backend.sql, 20260922c (resumo antigo),
-- 20260924c (tipos de atendimento) e 20261020 (última exclusão de paciente).
--
-- O que muda:
--  * Valor por área e tipo, com valor próprio por profissional
--    (procedure_prices ganha professional_id; o % de repasse sai dali e
--    vai para finance_payout_rules, por profissional).
--  * O valor fica GRAVADO quando o atendimento vira Atendido
--    (appointment_charges, preenchida por gatilho em appointments).
--    Mudar a tabela depois vale só para os próximos. Falta (Não
--    compareceu, Cancelado pelo paciente, Cancelado) não cobra.
--  * Pacotes: sessões contadas (4, 6, 8, 10...) ou valor fechado com
--    sessões previstas (avaliação neuropsicológica). A parte de cada
--    sessão é o saldo que falta ÷ as sessões que faltam na previsão.
--  * Recebimentos, saídas, saídas fixas, pessoas sem login (diarista,
--    técnico de TI) e categorias.
--  * Nada de dinheiro se apaga: lançamento errado se anula com motivo.
--    Escrita só pelas funções abaixo; a tela só lê.
--
-- Tudo só para a administração da instituição (can_manage_finance).
-- As 4 tabelas de 20260908 estavam vazias em produção (conferido em
-- 23/10/2026); appointment_payments é trocada por finance_receipts e
-- só cai se continuar vazia.
--
-- Exclusão de paciente: os registros de dinheiro ficam (a contabilidade
-- precisa do histórico) e o cadastro é anonimizado pela exclusão de
-- sempre. appointments é apagada nela, então appointment_charges guarda
-- a própria cópia de paciente, profissional, área e dia.
-- ==========================================================

-- ----------------------------------------------------------
-- 0. Ajudantes
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_finance(p_clinic UUID, p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_agenda(p_clinic, p_user)
     AND (public.is_clinic_admin(p_user) OR public.is_super_admin(p_user));
$$;

REVOKE ALL ON FUNCTION public.can_manage_finance(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_finance(UUID, UUID) TO authenticated;

-- Dia de hoje no fuso da clínica: é ele que diz o que já venceu e que a
-- data de um recebimento não pode ser depois de hoje.
CREATE OR REPLACE FUNCTION public.finance_today()
RETURNS DATE
LANGUAGE sql STABLE
SET search_path = pg_catalog
AS $$
  SELECT (pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date;
$$;

GRANT EXECUTE ON FUNCTION public.finance_today() TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_require_admin()
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.user_clinic_id(auth.uid());
BEGIN
  IF v_clinic IS NULL OR NOT public.can_manage_finance(v_clinic) THEN
    RAISE EXCEPTION 'Só a administração da instituição mexe no financeiro.' USING ERRCODE = '42501';
  END IF;
  RETURN v_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_require_admin() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 1. Sai o esboço de 20260908 que não serve mais
-- ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.clinic_financial_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID);

DO $$
BEGIN
  IF to_regclass('public.appointment_payments') IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.appointment_payments) THEN
    RAISE EXCEPTION 'appointment_payments tem linhas: migrar antes de trocar por finance_receipts.';
  END IF;
END;
$$;

DROP TABLE IF EXISTS public.appointment_payments;
DROP FUNCTION IF EXISTS public.set_appointment_payment_defaults();

-- ----------------------------------------------------------
-- 2. Configuração geral: data de início e quando o repasse conta
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_finance_settings (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  starts_on DATE NOT NULL,
  payout_basis TEXT NOT NULL DEFAULT 'on_payment'
    CHECK (payout_basis IN ('on_payment', 'on_attendance')),
  packages_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  expenses_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.clinic_finance_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clinic_finance_settings_admin_read ON public.clinic_finance_settings;
CREATE POLICY clinic_finance_settings_admin_read ON public.clinic_finance_settings
  FOR SELECT TO authenticated
  USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.clinic_finance_settings FROM anon, authenticated;
GRANT SELECT ON public.clinic_finance_settings TO authenticated;

-- ----------------------------------------------------------
-- 3. Valor de cada atendimento
--
-- Linha sem appointment_type = valor padrão da área. Linha com
-- professional_id = valor só daquele profissional. Ordem de quem vale
-- (finance_resolve_price): tipo do profissional > tipo da instituição >
-- padrão do profissional > padrão da instituição. Assim um tipo que a
-- instituição decidiu não cobrar (Devolutiva R$ 0) não volta a cobrar
-- porque o profissional tem um padrão próprio.
-- ----------------------------------------------------------
ALTER TABLE public.procedure_prices
  ADD COLUMN IF NOT EXISTS professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS idx_procedure_prices_default_unique;
DROP INDEX IF EXISTS idx_procedure_prices_specific_unique;
DROP INDEX IF EXISTS idx_procedure_prices_scope_unique;
CREATE UNIQUE INDEX idx_procedure_prices_scope_unique
  ON public.procedure_prices (
    clinic_id,
    discipline,
    COALESCE(appointment_type, ''),
    COALESCE(professional_id, '00000000-0000-0000-0000-000000000000'::UUID)
  );

ALTER TABLE public.procedure_prices DROP COLUMN IF EXISTS repasse_percent;

DROP POLICY IF EXISTS procedure_prices_admin ON public.procedure_prices;
DROP POLICY IF EXISTS procedure_prices_admin_read ON public.procedure_prices;
CREATE POLICY procedure_prices_admin_read ON public.procedure_prices
  FOR SELECT TO authenticated
  USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.procedure_prices FROM anon, authenticated;
GRANT SELECT ON public.procedure_prices TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_resolve_price(
  p_clinic UUID,
  p_discipline TEXT,
  p_type TEXT,
  p_professional UUID
)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pp.price_cents
  FROM public.procedure_prices pp
  WHERE pp.clinic_id = p_clinic
    AND pp.discipline = p_discipline
    AND pp.active
    AND (pp.appointment_type IS NULL OR pp.appointment_type = p_type)
    AND (pp.professional_id IS NULL OR pp.professional_id = p_professional)
  ORDER BY (pp.appointment_type IS NULL), (pp.professional_id IS NULL)
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.finance_resolve_price(UUID, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 4. Como cada um recebe
--
-- Linha sem área e sem tipo = jeito de receber da pessoa: % do valor do
-- atendimento, valor fixo por atendimento, salário (vira saída fixa) ou
-- não recebe pelo sistema. Linhas com área (e tipo) mudam o % ou o valor
-- só ali.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_payout_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  discipline TEXT CHECK (discipline IS NULL OR discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')),
  appointment_type TEXT CHECK (appointment_type IS NULL OR appointment_type IN (
    'first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview'
  )),
  mode TEXT NOT NULL CHECK (mode IN ('percent', 'per_appointment', 'salary', 'none')),
  percent NUMERIC(5,2) CHECK (percent IS NULL OR (percent >= 0 AND percent <= 100)),
  amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT finance_payout_rules_shape CHECK (
    (mode = 'percent' AND percent IS NOT NULL AND amount_cents IS NULL)
    OR (mode = 'per_appointment' AND amount_cents IS NOT NULL AND percent IS NULL)
    OR (mode IN ('salary', 'none') AND percent IS NULL AND amount_cents IS NULL
        AND discipline IS NULL AND appointment_type IS NULL)
  ),
  CONSTRAINT finance_payout_rules_type_needs_area CHECK (appointment_type IS NULL OR discipline IS NOT NULL)
);

DROP INDEX IF EXISTS idx_finance_payout_rules_scope_unique;
CREATE UNIQUE INDEX idx_finance_payout_rules_scope_unique
  ON public.finance_payout_rules (professional_id, COALESCE(discipline, ''), COALESCE(appointment_type, ''));

ALTER TABLE public.finance_payout_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_payout_rules_admin_read ON public.finance_payout_rules;
CREATE POLICY finance_payout_rules_admin_read ON public.finance_payout_rules
  FOR SELECT TO authenticated
  USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.finance_payout_rules FROM anon, authenticated;
GRANT SELECT ON public.finance_payout_rules TO authenticated;

CREATE OR REPLACE FUNCTION public.finance_payout_for(
  p_clinic UUID,
  p_professional UUID,
  p_discipline TEXT,
  p_type TEXT,
  p_price INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base public.finance_payout_rules%ROWTYPE;
  v_rule public.finance_payout_rules%ROWTYPE;
BEGIN
  IF p_professional IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_base
  FROM public.finance_payout_rules r
  WHERE r.clinic_id = p_clinic AND r.professional_id = p_professional
    AND r.discipline IS NULL AND r.appointment_type IS NULL;

  IF NOT FOUND OR v_base.mode IN ('salary', 'none') THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_rule
  FROM public.finance_payout_rules r
  WHERE r.clinic_id = p_clinic AND r.professional_id = p_professional
    AND (r.discipline IS NULL OR r.discipline = p_discipline)
    AND (r.appointment_type IS NULL OR r.appointment_type = p_type)
  ORDER BY (r.appointment_type IS NULL), (r.discipline IS NULL)
  LIMIT 1;

  IF v_rule.mode = 'per_appointment' THEN
    RETURN v_rule.amount_cents;
  END IF;
  IF v_rule.mode = 'percent' THEN
    RETURN round(COALESCE(p_price, 0) * v_rule.percent / 100.0)::INTEGER;
  END IF;
  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_payout_for(UUID, UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 5. Modelos de pacote (Configuração)
--
-- counted = sessões contadas (uma linha por tamanho: 4, 6, 8, 10...).
-- closed  = valor fechado, sessões previstas de `sessions` a `sessions_max`.
-- appointment_types vazio = qualquer tipo da área gasta o pacote.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_package_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')),
  kind TEXT NOT NULL CHECK (kind IN ('counted', 'closed')),
  sessions INTEGER NOT NULL CHECK (sessions BETWEEN 1 AND 100),
  sessions_max INTEGER CHECK (sessions_max IS NULL OR sessions_max BETWEEN 1 AND 100),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  appointment_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  max_installments INTEGER NOT NULL DEFAULT 1 CHECK (max_installments BETWEEN 1 AND 24),
  allow_per_session BOOLEAN NOT NULL DEFAULT TRUE,
  over_plan TEXT NOT NULL DEFAULT 'free' CHECK (over_plan IN ('free', 'single')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT finance_package_models_range CHECK (
    (kind = 'counted' AND sessions_max IS NULL)
    OR (kind = 'closed' AND (sessions_max IS NULL OR sessions_max >= sessions))
  ),
  CONSTRAINT finance_package_models_types CHECK (appointment_types <@ ARRAY[
    'first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview'
  ]::TEXT[])
);

DROP TRIGGER IF EXISTS trg_finance_package_models_defaults ON public.finance_package_models;
CREATE TRIGGER trg_finance_package_models_defaults
  BEFORE INSERT ON public.finance_package_models
  FOR EACH ROW EXECUTE FUNCTION public.set_agenda_config_defaults();
DROP TRIGGER IF EXISTS trg_finance_package_models_updated_at ON public.finance_package_models;
CREATE TRIGGER trg_finance_package_models_updated_at
  BEFORE UPDATE ON public.finance_package_models
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.finance_package_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_package_models_admin ON public.finance_package_models;
CREATE POLICY finance_package_models_admin ON public.finance_package_models
  FOR ALL TO authenticated
  USING (public.can_manage_finance(clinic_id))
  WITH CHECK (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.finance_package_models FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_package_models TO authenticated;

-- ----------------------------------------------------------
-- 6. Pacote vendido para um paciente e as parcelas dele
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  model_id UUID REFERENCES public.finance_package_models(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')),
  professional_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('counted', 'closed')),
  sessions_planned INTEGER NOT NULL CHECK (sessions_planned BETWEEN 1 AND 100),
  total_cents INTEGER NOT NULL CHECK (total_cents > 0),
  appointment_types TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  payment_plan TEXT NOT NULL CHECK (payment_plan IN ('upfront', 'installments', 'per_session')),
  installments INTEGER NOT NULL DEFAULT 1 CHECK (installments BETWEEN 1 AND 24),
  over_plan TEXT NOT NULL DEFAULT 'free' CHECK (over_plan IN ('free', 'single')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'voided')),
  sold_on DATE NOT NULL,
  discount_cents INTEGER NOT NULL DEFAULT 0,
  close_action TEXT CHECK (close_action IS NULL OR close_action IN ('auto', 'charge_rest', 'discount_rest')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  void_reason TEXT,

  CONSTRAINT patient_packages_discount CHECK (discount_cents >= 0 AND discount_cents <= total_cents),
  CONSTRAINT patient_packages_types CHECK (appointment_types <@ ARRAY[
    'first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview'
  ]::TEXT[]),
  CONSTRAINT patient_packages_void_reason CHECK ((status = 'voided') = (voided_at IS NOT NULL AND void_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_patient_packages_match
  ON public.patient_packages (clinic_id, patient_id, discipline) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.patient_package_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.patient_packages(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number BETWEEN 1 AND 24),
  due_on DATE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  CONSTRAINT patient_package_installments_unique UNIQUE (package_id, number)
);

ALTER TABLE public.patient_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_package_installments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_packages_admin_read ON public.patient_packages;
CREATE POLICY patient_packages_admin_read ON public.patient_packages
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
DROP POLICY IF EXISTS patient_package_installments_admin_read ON public.patient_package_installments;
CREATE POLICY patient_package_installments_admin_read ON public.patient_package_installments
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.patient_packages FROM anon, authenticated;
REVOKE ALL ON public.patient_package_installments FROM anon, authenticated;
GRANT SELECT ON public.patient_packages TO authenticated;
GRANT SELECT ON public.patient_package_installments TO authenticated;

-- ----------------------------------------------------------
-- 7. Valor gravado de cada atendimento (e o restante de um pacote)
--
-- price_cents NULL = a tabela não tinha valor para aquele atendimento: a
-- tela pede para definir. appointment_id vira NULL se o agendamento for
-- apagado na exclusão de paciente; o valor continua valendo.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  discipline TEXT NOT NULL,
  appointment_type TEXT,
  service_on DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'appointment' CHECK (source IN ('appointment', 'package_rest')),
  package_id UUID REFERENCES public.patient_packages(id) ON DELETE RESTRICT,
  session_number INTEGER,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  payout_cents INTEGER NOT NULL DEFAULT 0 CHECK (payout_cents >= 0),
  adjusted_at TIMESTAMPTZ,
  adjusted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  adjust_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  void_reason TEXT,

  CONSTRAINT appointment_charges_rest_shape CHECK (
    source = 'appointment' OR (package_id IS NOT NULL AND appointment_id IS NULL AND price_cents IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_appointment_charges_appointment
  ON public.appointment_charges (appointment_id) WHERE appointment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_charges_package
  ON public.appointment_charges (package_id) WHERE package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_appointment_charges_clinic_day
  ON public.appointment_charges (clinic_id, service_on);

ALTER TABLE public.appointment_charges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS appointment_charges_admin_read ON public.appointment_charges;
CREATE POLICY appointment_charges_admin_read ON public.appointment_charges
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.appointment_charges FROM anon, authenticated;
GRANT SELECT ON public.appointment_charges TO authenticated;

-- ----------------------------------------------------------
-- 8. Recebimentos
--
-- Um "Registrar recebimento" vira uma linha por item e por forma de
-- pagamento, todas com o mesmo group_id; anular anula o grupo inteiro.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  charge_id UUID REFERENCES public.appointment_charges(id) ON DELETE RESTRICT,
  package_id UUID REFERENCES public.patient_packages(id) ON DELETE RESTRICT,
  group_id UUID NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  method TEXT NOT NULL CHECK (method IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outro')),
  received_on DATE NOT NULL,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  -- Sem ON DELETE SET NULL: o guarda abaixo não deixa linha de dinheiro mudar.
  recorded_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id),
  void_reason TEXT,

  CONSTRAINT finance_receipts_one_target CHECK (num_nonnulls(charge_id, package_id) = 1),
  CONSTRAINT finance_receipts_void_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_finance_receipts_clinic_day ON public.finance_receipts (clinic_id, received_on);
CREATE INDEX IF NOT EXISTS idx_finance_receipts_charge ON public.finance_receipts (charge_id) WHERE charge_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_receipts_package ON public.finance_receipts (package_id) WHERE package_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_finance_receipts_group ON public.finance_receipts (group_id);

ALTER TABLE public.finance_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_receipts_admin_read ON public.finance_receipts;
CREATE POLICY finance_receipts_admin_read ON public.finance_receipts
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.finance_receipts FROM anon, authenticated;
GRANT SELECT ON public.finance_receipts TO authenticated;

-- ----------------------------------------------------------
-- 9. Pessoas que recebem e não usam o sistema, categorias de saída,
--    saídas fixas e saídas
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  role_label TEXT CHECK (role_label IS NULL OR length(role_label) <= 60),
  note TEXT CHECK (note IS NULL OR length(note) <= 300),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.finance_expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  system_key TEXT CHECK (system_key IS NULL OR system_key IN ('repasse', 'salarios')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT finance_expense_categories_name_unique UNIQUE (clinic_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_expense_categories_system
  ON public.finance_expense_categories (clinic_id, system_key) WHERE system_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.finance_recurring_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 120),
  category_id UUID NOT NULL REFERENCES public.finance_expense_categories(id) ON DELETE RESTRICT,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  person_id UUID REFERENCES public.finance_people(id) ON DELETE RESTRICT,
  amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly', 'weekly', 'biweekly')),
  day_of_month SMALLINT CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 31),
  weekday SMALLINT CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  starts_on DATE NOT NULL,
  ends_on DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT finance_recurring_expenses_payee CHECK (num_nonnulls(professional_id, person_id) <= 1),
  CONSTRAINT finance_recurring_expenses_when CHECK (
    (frequency = 'monthly' AND day_of_month IS NOT NULL AND weekday IS NULL)
    OR (frequency IN ('weekly', 'biweekly') AND weekday IS NOT NULL AND day_of_month IS NULL)
  ),
  CONSTRAINT finance_recurring_expenses_period CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS public.finance_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.finance_expense_categories(id) ON DELETE RESTRICT,
  description TEXT NOT NULL CHECK (length(btrim(description)) BETWEEN 1 AND 120),
  professional_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  person_id UUID REFERENCES public.finance_people(id) ON DELETE RESTRICT,
  recurring_id UUID REFERENCES public.finance_recurring_expenses(id) ON DELETE RESTRICT,
  occurrence_on DATE,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  due_on DATE,
  paid_on DATE,
  method TEXT CHECK (method IS NULL OR method IN ('pix', 'dinheiro', 'cartao_debito', 'cartao_credito', 'outro')),
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT CHECK (note IS NULL OR length(note) <= 500),
  recorded_by UUID REFERENCES public.profiles(id),
  paid_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  voided_at TIMESTAMPTZ,
  voided_by UUID REFERENCES public.profiles(id),
  void_reason TEXT,

  CONSTRAINT finance_expenses_amount CHECK (skipped OR amount_cents > 0),
  CONSTRAINT finance_expenses_state CHECK (
    (skipped AND paid_on IS NULL AND method IS NULL AND recurring_id IS NOT NULL)
    OR (NOT skipped AND paid_on IS NOT NULL AND method IS NOT NULL)
    OR (NOT skipped AND paid_on IS NULL AND method IS NULL AND due_on IS NOT NULL)
  ),
  CONSTRAINT finance_expenses_payee CHECK (num_nonnulls(professional_id, person_id) <= 1),
  CONSTRAINT finance_expenses_occurrence CHECK (recurring_id IS NULL OR occurrence_on IS NOT NULL),
  CONSTRAINT finance_expenses_void_reason CHECK ((voided_at IS NULL) = (void_reason IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_expenses_occurrence
  ON public.finance_expenses (recurring_id, occurrence_on) WHERE recurring_id IS NOT NULL AND voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_finance_expenses_clinic_paid ON public.finance_expenses (clinic_id, paid_on);

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['finance_people', 'finance_expense_categories', 'finance_recurring_expenses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_defaults ON public.%1$I', v_table);
    EXECUTE format('CREATE TRIGGER trg_%1$s_defaults BEFORE INSERT ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.set_agenda_config_defaults()', v_table);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_updated_at ON public.%1$I', v_table);
    EXECUTE format('CREATE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at()', v_table);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_admin ON public.%1$I', v_table);
    EXECUTE format('CREATE POLICY %1$s_admin ON public.%1$I FOR ALL TO authenticated USING (public.can_manage_finance(clinic_id)) WITH CHECK (public.can_manage_finance(clinic_id))', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', v_table);
  END LOOP;
END;
$$;

ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS finance_expenses_admin_read ON public.finance_expenses;
CREATE POLICY finance_expenses_admin_read ON public.finance_expenses
  FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id));
REVOKE ALL ON public.finance_expenses FROM anon, authenticated;
GRANT SELECT ON public.finance_expenses TO authenticated;

-- ----------------------------------------------------------
-- 10. Dinheiro lançado não se apaga nem se edita
--
-- Só muda para ser anulado (com motivo) ou, na saída "a pagar", para ser
-- paga uma vez. Vale até para quem passa por cima da RLS.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_guard_money_rows()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_void_cols TEXT[] := ARRAY['voided_at', 'voided_by', 'void_reason'];
  v_pay_cols TEXT[] := ARRAY['paid_on', 'method', 'paid_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Lançamento de dinheiro não se apaga: anule com motivo.' USING ERRCODE = '42501';
  END IF;

  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Lançamento anulado não muda mais.' USING ERRCODE = '42501';
  END IF;

  IF NEW.voided_at IS NOT NULL THEN
    IF NEW.void_reason IS NULL OR length(btrim(NEW.void_reason)) < 3 THEN
      RAISE EXCEPTION 'Diga o motivo da anulação.' USING ERRCODE = '23514';
    END IF;
    IF (to_jsonb(NEW) - v_void_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_void_cols) THEN
      RAISE EXCEPTION 'Ao anular, nada além da anulação muda.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- IF aninhado de propósito: recebimento não tem skipped/paid_on, e o
  -- PL/pgSQL não garante parar no primeiro AND falso.
  IF TG_TABLE_NAME = 'finance_expenses' THEN
    IF NOT OLD.skipped AND OLD.paid_on IS NULL AND NEW.paid_on IS NOT NULL THEN
      IF (to_jsonb(NEW) - v_pay_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_pay_cols) THEN
        RAISE EXCEPTION 'Ao pagar, só a data e a forma de pagamento mudam.' USING ERRCODE = '42501';
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'Valor e data de lançamento não se editam: anule e lance de novo.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_finance_receipts_guard ON public.finance_receipts;
CREATE TRIGGER trg_finance_receipts_guard
  BEFORE UPDATE OR DELETE ON public.finance_receipts
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_money_rows();

DROP TRIGGER IF EXISTS trg_finance_expenses_guard ON public.finance_expenses;
CREATE TRIGGER trg_finance_expenses_guard
  BEFORE UPDATE OR DELETE ON public.finance_expenses
  FOR EACH ROW EXECUTE FUNCTION public.finance_guard_money_rows();

-- ----------------------------------------------------------
-- 11. Cobrança do atendimento (gatilho em appointments)
-- ----------------------------------------------------------

-- Reabre um pacote de sessões contadas que tinha fechado sozinho quando
-- a sessão que fechou deixa de valer.
CREATE OR REPLACE FUNCTION public.finance_reopen_auto_closed(p_package UUID)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.patient_packages
  SET status = 'active', close_action = NULL, closed_at = NULL, closed_by = NULL
  WHERE id = p_package AND status = 'completed' AND close_action = 'auto';
$$;

REVOKE ALL ON FUNCTION public.finance_reopen_auto_closed(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finance_charge_appointment(p_appointment UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_settings public.clinic_finance_settings%ROWTYPE;
  v_charge public.appointment_charges%ROWTYPE;
  v_package public.patient_packages%ROWTYPE;
  v_day DATE;
  v_done INTEGER := 0;
  v_used INTEGER := 0;
  v_remaining INTEGER;
  v_left INTEGER;
  v_price INTEGER;
  v_payout INTEGER;
  v_package_id UUID := NULL;
  v_session INTEGER := NULL;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment;
  IF NOT FOUND OR v_appt.kind IS DISTINCT FROM 'appointment' OR v_appt.patient_id IS NULL
     OR v_appt.status IS DISTINCT FROM 'attended' THEN
    RETURN;
  END IF;

  SELECT * INTO v_settings FROM public.clinic_finance_settings WHERE clinic_id = v_appt.clinic_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_day := (v_appt.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF v_day < v_settings.starts_on THEN
    RETURN;
  END IF;

  SELECT * INTO v_charge FROM public.appointment_charges WHERE appointment_id = p_appointment FOR UPDATE;
  IF FOUND AND v_charge.voided_at IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_package
  FROM public.patient_packages p
  WHERE p.clinic_id = v_appt.clinic_id
    AND p.patient_id = v_appt.patient_id
    AND p.discipline = v_appt.discipline
    AND p.status = 'active'
    AND p.sold_on <= v_day
    AND (p.professional_id IS NULL OR p.professional_id = v_appt.professional_id)
    AND (cardinality(p.appointment_types) = 0 OR v_appt.appointment_type = ANY (p.appointment_types))
  ORDER BY p.sold_on, p.created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    SELECT count(*), COALESCE(sum(c.price_cents), 0)
      INTO v_done, v_used
    FROM public.appointment_charges c
    WHERE c.package_id = v_package.id AND c.voided_at IS NULL;

    IF v_done < v_package.sessions_planned THEN
      -- Parte da sessão = o que falta do valor ÷ as sessões que faltam na
      -- previsão. A última prevista leva o resto: a soma fecha no total.
      v_remaining := v_package.total_cents - v_package.discount_cents - v_used;
      v_left := v_package.sessions_planned - v_done;
      v_price := CASE
        WHEN v_remaining <= 0 THEN 0
        WHEN v_left <= 1 THEN v_remaining
        ELSE v_remaining / v_left
      END;
      v_package_id := v_package.id;
      v_session := v_done + 1;
    ELSIF v_package.over_plan = 'free' THEN
      -- Passou do previsto num valor fechado: a sessão não cobra.
      v_price := 0;
      v_package_id := v_package.id;
      v_session := v_done + 1;
    END IF;
  END IF;

  IF v_package_id IS NULL THEN
    v_price := public.finance_resolve_price(v_appt.clinic_id, v_appt.discipline, v_appt.appointment_type, v_appt.professional_id);
  END IF;

  v_payout := public.finance_payout_for(v_appt.clinic_id, v_appt.professional_id, v_appt.discipline, v_appt.appointment_type, v_price);

  IF v_charge.id IS NOT NULL THEN
    UPDATE public.appointment_charges
    SET patient_id = v_appt.patient_id,
        professional_id = v_appt.professional_id,
        discipline = v_appt.discipline,
        appointment_type = v_appt.appointment_type,
        service_on = v_day,
        package_id = v_package_id,
        session_number = v_session,
        price_cents = v_price,
        payout_cents = v_payout,
        adjusted_at = NULL,
        adjusted_by = NULL,
        adjust_reason = NULL,
        voided_at = NULL,
        void_reason = NULL
    WHERE id = v_charge.id;
  ELSE
    INSERT INTO public.appointment_charges (
      clinic_id, appointment_id, patient_id, professional_id, discipline, appointment_type,
      service_on, source, package_id, session_number, price_cents, payout_cents
    ) VALUES (
      v_appt.clinic_id, v_appt.id, v_appt.patient_id, v_appt.professional_id, v_appt.discipline, v_appt.appointment_type,
      v_day, 'appointment', v_package_id, v_session, v_price, v_payout
    );
  END IF;

  -- Pacote de sessões contadas fecha sozinho na última sessão.
  IF v_package_id IS NOT NULL AND v_package.kind = 'counted' AND v_session >= v_package.sessions_planned THEN
    UPDATE public.patient_packages
    SET status = 'completed', close_action = 'auto', closed_at = timezone('utc', now())
    WHERE id = v_package_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_charge_appointment(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.finance_void_appointment_charge(p_appointment UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package UUID;
BEGIN
  UPDATE public.appointment_charges
  SET voided_at = timezone('utc', now()), void_reason = p_reason
  WHERE appointment_id = p_appointment AND voided_at IS NULL
  RETURNING package_id INTO v_package;

  IF v_package IS NOT NULL THEN
    PERFORM public.finance_reopen_auto_closed(v_package);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_void_appointment_charge(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Sem configuração do financeiro (clinic_finance_settings) as duas
-- funções acima saem logo na entrada: a Agenda segue igual até a
-- administração salvar a data de início.
CREATE OR REPLACE FUNCTION public.finance_on_appointment_status()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM 'appointment' OR NEW.patient_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NEW.status = 'attended' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'attended') THEN
    PERFORM public.finance_charge_appointment(NEW.id);
  ELSIF TG_OP = 'UPDATE' AND OLD.status = 'attended' AND NEW.status IS DISTINCT FROM 'attended' THEN
    PERFORM public.finance_void_appointment_charge(NEW.id, 'O atendimento deixou de ser Atendido.');
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_finance_status ON public.appointments;
CREATE TRIGGER trg_appointments_finance_status
  AFTER INSERT OR UPDATE OF status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.finance_on_appointment_status();

-- Atendimento com pagamento não se exclui na Agenda: primeiro se anula o
-- pagamento. A exclusão de paciente aprovada passa (o valor continua
-- valendo, sem o agendamento).
CREATE OR REPLACE FUNCTION public.finance_before_appointment_delete()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_erasure BOOLEAN;
BEGIN
  v_erasure := OLD.patient_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.patient_deletion_requests d
    WHERE d.patient_id = OLD.patient_id AND d.status = 'approved'
  );

  IF v_erasure THEN
    RETURN OLD;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.appointment_charges c
    JOIN public.finance_receipts r ON r.charge_id = c.id AND r.voided_at IS NULL
    WHERE c.appointment_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'appointment_has_payment: este atendimento tem pagamento registrado. Anule o pagamento no Financeiro antes de excluir.'
      USING ERRCODE = '23503';
  END IF;

  PERFORM public.finance_void_appointment_charge(OLD.id, 'Agendamento excluído.');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_finance_delete ON public.appointments;
CREATE TRIGGER trg_appointments_finance_delete
  BEFORE DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.finance_before_appointment_delete();

-- ----------------------------------------------------------
-- 12. Funções que a tela chama (todas conferem a administração)
-- ----------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finance_ensure_defaults()
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
BEGIN
  IF EXISTS (SELECT 1 FROM public.finance_expense_categories WHERE clinic_id = v_clinic) THEN
    RETURN;
  END IF;

  INSERT INTO public.finance_expense_categories (clinic_id, name, system_key, sort_order) VALUES
    (v_clinic, 'Repasse de profissionais', 'repasse', 10),
    (v_clinic, 'Salários e diárias', 'salarios', 20),
    (v_clinic, 'Aluguel', NULL, 30),
    (v_clinic, 'Contas de consumo', NULL, 40),
    (v_clinic, 'Material', NULL, 50),
    (v_clinic, 'Impostos e taxas', NULL, 60),
    (v_clinic, 'Manutenção', NULL, 70),
    (v_clinic, 'Outros', NULL, 80);
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_save_settings(
  p_starts_on DATE,
  p_payout_basis TEXT,
  p_packages_reviewed BOOLEAN DEFAULT NULL,
  p_expenses_reviewed BOOLEAN DEFAULT NULL
)
RETURNS public.clinic_finance_settings
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.clinic_finance_settings%ROWTYPE;
  v_appt UUID;
BEGIN
  IF p_starts_on IS NULL THEN
    RAISE EXCEPTION 'Escolha a data de início.' USING ERRCODE = '22023';
  END IF;
  IF p_payout_basis NOT IN ('on_payment', 'on_attendance') THEN
    RAISE EXCEPTION 'Escolha quando o repasse passa a contar.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.clinic_finance_settings AS s (
    clinic_id, starts_on, payout_basis, packages_reviewed, expenses_reviewed, updated_by
  ) VALUES (
    v_clinic, p_starts_on, p_payout_basis,
    COALESCE(p_packages_reviewed, FALSE), COALESCE(p_expenses_reviewed, FALSE), auth.uid()
  )
  ON CONFLICT ON CONSTRAINT clinic_finance_settings_pkey DO UPDATE
  SET starts_on = EXCLUDED.starts_on,
      payout_basis = EXCLUDED.payout_basis,
      packages_reviewed = COALESCE(p_packages_reviewed, s.packages_reviewed),
      expenses_reviewed = COALESCE(p_expenses_reviewed, s.expenses_reviewed),
      updated_by = auth.uid(),
      updated_at = timezone('utc', now())
  RETURNING * INTO v_row;

  -- Data de início mais tarde: sai a cobrança sem pagamento de antes dela.
  UPDATE public.appointment_charges c
  SET voided_at = timezone('utc', now()), void_reason = 'Antes da data de início do financeiro.'
  WHERE c.clinic_id = v_clinic
    AND c.voided_at IS NULL
    AND c.source = 'appointment'
    AND c.package_id IS NULL
    AND c.service_on < p_starts_on
    AND NOT EXISTS (SELECT 1 FROM public.finance_receipts r WHERE r.charge_id = c.id AND r.voided_at IS NULL);

  -- Data de início mais cedo (ou primeira vez): cobra o que já foi
  -- atendido desde ela, na ordem, para os pacotes contarem certo.
  FOR v_appt IN
    SELECT a.id
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic
      AND a.kind = 'appointment'
      AND a.status = 'attended'
      AND a.patient_id IS NOT NULL
      AND (a.starts_at AT TIME ZONE 'America/Sao_Paulo')::date >= p_starts_on
      AND NOT EXISTS (
        SELECT 1 FROM public.appointment_charges c
        WHERE c.appointment_id = a.id AND c.voided_at IS NULL
      )
    ORDER BY a.starts_at
  LOOP
    PERFORM public.finance_charge_appointment(v_appt);
  END LOOP;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_save_prices(p_professional UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_rows, 'null'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de valores inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_professional IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_professional AND clinic_id = v_clinic
  ) THEN
    RAISE EXCEPTION 'Profissional de outra instituição.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.procedure_prices
  WHERE clinic_id = v_clinic AND professional_id IS NOT DISTINCT FROM p_professional;

  INSERT INTO public.procedure_prices (clinic_id, discipline, appointment_type, professional_id, price_cents, active)
  SELECT v_clinic,
         r->>'discipline',
         NULLIF(r->>'appointment_type', ''),
         p_professional,
         (r->>'price_cents')::INTEGER,
         TRUE
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_save_payout_rules(p_professional UUID, p_rows JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_base_mode TEXT;
  v_count INTEGER;
BEGIN
  IF jsonb_typeof(COALESCE(p_rows, 'null'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Lista de regras inválida.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_professional AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Profissional de outra instituição.' USING ERRCODE = '42501';
  END IF;

  SELECT r->>'mode' INTO v_base_mode
  FROM jsonb_array_elements(p_rows) AS r
  WHERE NULLIF(r->>'discipline', '') IS NULL AND NULLIF(r->>'appointment_type', '') IS NULL;

  IF jsonb_array_length(p_rows) > 0 AND v_base_mode IS NULL THEN
    RAISE EXCEPTION 'Falta dizer como a pessoa recebe.' USING ERRCODE = '22023';
  END IF;
  IF v_base_mode IN ('salary', 'none') AND jsonb_array_length(p_rows) > 1 THEN
    RAISE EXCEPTION 'Salário ou "não recebe pelo sistema" não tem valor por área.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.finance_payout_rules WHERE clinic_id = v_clinic AND professional_id = p_professional;

  INSERT INTO public.finance_payout_rules (clinic_id, professional_id, discipline, appointment_type, mode, percent, amount_cents)
  SELECT v_clinic,
         p_professional,
         NULLIF(r->>'discipline', ''),
         NULLIF(r->>'appointment_type', ''),
         r->>'mode',
         NULLIF(r->>'percent', '')::NUMERIC,
         NULLIF(r->>'amount_cents', '')::INTEGER
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_sell_package(
  p_patient UUID,
  p_model UUID,
  p_name TEXT,
  p_discipline TEXT,
  p_professional UUID,
  p_kind TEXT,
  p_sessions INTEGER,
  p_total_cents INTEGER,
  p_appointment_types TEXT[],
  p_payment_plan TEXT,
  p_installments INTEGER,
  p_first_due DATE,
  p_over_plan TEXT,
  p_note TEXT
)
RETURNS public.patient_packages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_today DATE := public.finance_today();
  v_pkg public.patient_packages%ROWTYPE;
  v_n INTEGER;
  v_base INTEGER;
  v_rest INTEGER;
  v_first DATE;
  v_appt UUID;
  i INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Paciente de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_professional IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = p_professional AND clinic_id = v_clinic
  ) THEN
    RAISE EXCEPTION 'Profissional de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_model IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_package_models WHERE id = p_model AND clinic_id = v_clinic
  ) THEN
    RAISE EXCEPTION 'Modelo de pacote de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_payment_plan NOT IN ('upfront', 'installments', 'per_session') THEN
    RAISE EXCEPTION 'Escolha como o paciente vai pagar.' USING ERRCODE = '22023';
  END IF;

  v_n := CASE WHEN p_payment_plan = 'installments' THEN COALESCE(p_installments, 1) ELSE 1 END;
  v_first := COALESCE(p_first_due, v_today);

  INSERT INTO public.patient_packages (
    clinic_id, patient_id, model_id, name, discipline, professional_id, kind,
    sessions_planned, total_cents, appointment_types, payment_plan, installments,
    over_plan, sold_on, note, created_by
  ) VALUES (
    v_clinic, p_patient, p_model, btrim(p_name), p_discipline, p_professional, p_kind,
    p_sessions, p_total_cents, COALESCE(p_appointment_types, '{}'::TEXT[]), p_payment_plan, v_n,
    COALESCE(p_over_plan, 'free'), v_today, NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid()
  )
  RETURNING * INTO v_pkg;

  IF p_payment_plan IN ('upfront', 'installments') THEN
    v_base := p_total_cents / v_n;
    v_rest := p_total_cents - v_base * v_n;
    FOR i IN 1..v_n LOOP
      INSERT INTO public.patient_package_installments (clinic_id, package_id, number, due_on, amount_cents)
      VALUES (
        v_clinic, v_pkg.id, i,
        (v_first + make_interval(months => i - 1))::date,
        v_base + CASE WHEN i = v_n THEN v_rest ELSE 0 END
      );
    END LOOP;
  END IF;

  -- Sessão do mesmo dia da venda, já atendida e sem pagamento, entra no
  -- pacote: o paciente fez a sessão e fechou o pacote na saída.
  FOR v_appt IN
    SELECT c.appointment_id
    FROM public.appointment_charges c
    WHERE c.clinic_id = v_clinic
      AND c.patient_id = p_patient
      AND c.discipline = p_discipline
      AND c.package_id IS NULL
      AND c.source = 'appointment'
      AND c.voided_at IS NULL
      AND c.appointment_id IS NOT NULL
      AND c.service_on = v_today
      AND (p_professional IS NULL OR c.professional_id = p_professional)
      AND (cardinality(v_pkg.appointment_types) = 0 OR c.appointment_type = ANY (v_pkg.appointment_types))
      AND NOT EXISTS (SELECT 1 FROM public.finance_receipts r WHERE r.charge_id = c.id AND r.voided_at IS NULL)
    ORDER BY c.created_at
  LOOP
    PERFORM public.finance_void_appointment_charge(v_appt, 'Entrou no pacote vendido no mesmo dia.');
    PERFORM public.finance_charge_appointment(v_appt);
  END LOOP;

  SELECT * INTO v_pkg FROM public.patient_packages WHERE id = v_pkg.id;
  RETURN v_pkg;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_update_package_plan(p_package UUID, p_sessions_planned INTEGER)
RETURNS public.patient_packages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_pkg public.patient_packages%ROWTYPE;
  v_done INTEGER;
BEGIN
  SELECT * INTO v_pkg FROM public.patient_packages WHERE id = p_package AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pacote não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pkg.status <> 'active' OR v_pkg.kind <> 'closed' THEN
    RAISE EXCEPTION 'Só pacote de valor fechado em andamento muda a previsão de sessões.' USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_done FROM public.appointment_charges
  WHERE package_id = p_package AND voided_at IS NULL AND source = 'appointment';

  IF p_sessions_planned IS NULL OR p_sessions_planned < GREATEST(v_done, 1) OR p_sessions_planned > 100 THEN
    RAISE EXCEPTION 'A previsão não pode ser menor que as % sessões já feitas.', v_done USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_packages SET sessions_planned = p_sessions_planned WHERE id = p_package
  RETURNING * INTO v_pkg;
  RETURN v_pkg;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_close_package(p_package UUID, p_action TEXT)
RETURNS public.patient_packages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_pkg public.patient_packages%ROWTYPE;
  v_used INTEGER;
  v_rest INTEGER;
  v_last public.appointment_charges%ROWTYPE;
  v_professional UUID;
BEGIN
  IF p_action NOT IN ('charge_rest', 'discount_rest') THEN
    RAISE EXCEPTION 'Escolha o que fazer com o restante.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_pkg FROM public.patient_packages WHERE id = p_package AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pacote não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_pkg.status <> 'active' THEN
    RAISE EXCEPTION 'O pacote já está encerrado.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(price_cents), 0) INTO v_used
  FROM public.appointment_charges WHERE package_id = p_package AND voided_at IS NULL;
  v_rest := v_pkg.total_cents - v_pkg.discount_cents - v_used;

  IF v_rest > 0 AND p_action = 'charge_rest' THEN
    SELECT * INTO v_last FROM public.appointment_charges
    WHERE package_id = p_package AND voided_at IS NULL
    ORDER BY session_number DESC NULLS LAST, created_at DESC
    LIMIT 1;
    v_professional := COALESCE(v_last.professional_id, v_pkg.professional_id);

    INSERT INTO public.appointment_charges (
      clinic_id, appointment_id, patient_id, professional_id, discipline, appointment_type,
      service_on, source, package_id, session_number, price_cents, payout_cents
    ) VALUES (
      v_clinic, NULL, v_pkg.patient_id, v_professional, v_pkg.discipline, v_last.appointment_type,
      public.finance_today(), 'package_rest', p_package, NULL, v_rest,
      public.finance_payout_for(v_clinic, v_professional, v_pkg.discipline, v_last.appointment_type, v_rest)
    );
  ELSIF v_rest > 0 THEN
    UPDATE public.patient_packages SET discount_cents = discount_cents + v_rest WHERE id = p_package;
  END IF;

  UPDATE public.patient_packages
  SET status = 'completed', close_action = p_action, closed_at = timezone('utc', now()), closed_by = auth.uid()
  WHERE id = p_package
  RETURNING * INTO v_pkg;
  RETURN v_pkg;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_void_package(p_package UUID, p_reason TEXT)
RETURNS public.patient_packages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_pkg public.patient_packages%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo da anulação.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_pkg FROM public.patient_packages WHERE id = p_package AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND OR v_pkg.status = 'voided' THEN
    RAISE EXCEPTION 'Pacote não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.appointment_charges WHERE package_id = p_package AND voided_at IS NULL)
     OR EXISTS (SELECT 1 FROM public.finance_receipts WHERE package_id = p_package AND voided_at IS NULL) THEN
    RAISE EXCEPTION 'O pacote já tem sessão feita ou pagamento: use "Encerrar pacote".' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_packages
  SET status = 'voided', voided_at = timezone('utc', now()), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_package
  RETURNING * INTO v_pkg;
  RETURN v_pkg;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_adjust_charge(p_charge UUID, p_price_cents INTEGER, p_reason TEXT)
RETURNS public.appointment_charges
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_charge public.appointment_charges%ROWTYPE;
  v_paid INTEGER;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo do ajuste.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_charge FROM public.appointment_charges WHERE id = p_charge AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND OR v_charge.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'Atendimento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_charge.package_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sessão de pacote não muda de valor: mude a previsão ou encerre o pacote.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(amount_cents), 0) INTO v_paid
  FROM public.finance_receipts WHERE charge_id = p_charge AND voided_at IS NULL;

  IF p_price_cents IS NULL OR p_price_cents < v_paid THEN
    RAISE EXCEPTION 'O valor não pode ficar abaixo do que já foi pago.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointment_charges
  SET price_cents = p_price_cents,
      payout_cents = public.finance_payout_for(v_clinic, professional_id, discipline, appointment_type, p_price_cents),
      adjusted_at = timezone('utc', now()),
      adjusted_by = auth.uid(),
      adjust_reason = btrim(p_reason)
  WHERE id = p_charge
  RETURNING * INTO v_charge;
  RETURN v_charge;
END;
$$;

-- p_items: [{ "charge_id" | "package_id", "amount_cents", "method" }]
CREATE OR REPLACE FUNCTION public.finance_register_receipt(
  p_patient UUID,
  p_received_on DATE,
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
  v_item JSONB;
  v_charge_id UUID;
  v_package_id UUID;
  v_amount INTEGER;
  v_method TEXT;
  v_open INTEGER;
  v_charge public.appointment_charges%ROWTYPE;
  v_pkg public.patient_packages%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.patients WHERE id = p_patient AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Paciente de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_received_on IS NULL OR p_received_on > public.finance_today() THEN
    RAISE EXCEPTION 'A data do recebimento é hoje ou antes, nunca depois.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_items, 'null'::JSONB)) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Escolha o que está sendo pago.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_charge_id := NULLIF(v_item->>'charge_id', '')::UUID;
    v_package_id := NULLIF(v_item->>'package_id', '')::UUID;
    v_amount := (v_item->>'amount_cents')::INTEGER;
    v_method := v_item->>'method';

    IF num_nonnulls(v_charge_id, v_package_id) <> 1 THEN
      RAISE EXCEPTION 'Cada parte do pagamento vai para um atendimento ou um pacote.' USING ERRCODE = '22023';
    END IF;
    IF v_amount IS NULL OR v_amount <= 0 THEN
      RAISE EXCEPTION 'Valor do pagamento precisa ser maior que zero.' USING ERRCODE = '22023';
    END IF;

    IF v_charge_id IS NOT NULL THEN
      SELECT * INTO v_charge FROM public.appointment_charges
      WHERE id = v_charge_id AND clinic_id = v_clinic AND patient_id = p_patient AND voided_at IS NULL
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Atendimento não encontrado para este paciente.' USING ERRCODE = 'P0002';
      END IF;
      IF v_charge.package_id IS NOT NULL THEN
        RAISE EXCEPTION 'Sessão de pacote se paga pelo pacote.' USING ERRCODE = '22023';
      END IF;
      IF v_charge.price_cents IS NULL THEN
        RAISE EXCEPTION 'Este atendimento ainda não tem valor: defina o valor antes de receber.' USING ERRCODE = '22023';
      END IF;
      SELECT v_charge.price_cents - COALESCE(sum(amount_cents), 0) INTO v_open
      FROM public.finance_receipts WHERE charge_id = v_charge_id AND voided_at IS NULL;
    ELSE
      SELECT * INTO v_pkg FROM public.patient_packages
      WHERE id = v_package_id AND clinic_id = v_clinic AND patient_id = p_patient AND status <> 'voided'
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Pacote não encontrado para este paciente.' USING ERRCODE = 'P0002';
      END IF;
      SELECT v_pkg.total_cents - v_pkg.discount_cents - COALESCE(sum(amount_cents), 0) INTO v_open
      FROM public.finance_receipts WHERE package_id = v_package_id AND voided_at IS NULL;
    END IF;

    IF v_amount > v_open THEN
      RAISE EXCEPTION 'O valor passa do que falta pagar (faltam R$ %).',
        replace(to_char(GREATEST(v_open, 0) / 100.0, 'FM9999990.00'), '.', ',')
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.finance_receipts (
      clinic_id, patient_id, charge_id, package_id, group_id, amount_cents, method, received_on, note, recorded_by
    ) VALUES (
      v_clinic, p_patient, v_charge_id, v_package_id, v_group, v_amount, v_method, p_received_on,
      NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid()
    );
  END LOOP;

  RETURN v_group;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_void_receipt(p_group UUID, p_reason TEXT)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_count INTEGER;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo da anulação.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_receipts
  SET voided_at = timezone('utc', now()), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE group_id = p_group AND clinic_id = v_clinic AND voided_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Recebimento não encontrado ou já anulado.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_count;
END;
$$;

-- Saída paga (p_paid_on + p_method) ou a pagar (p_due_on).
CREATE OR REPLACE FUNCTION public.finance_register_expense(
  p_category UUID,
  p_description TEXT,
  p_amount_cents INTEGER,
  p_paid_on DATE,
  p_method TEXT,
  p_due_on DATE,
  p_professional UUID,
  p_person UUID,
  p_note TEXT
)
RETURNS public.finance_expenses
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.finance_expense_categories WHERE id = p_category AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Categoria de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_professional IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_professional AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Profissional de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_person IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.finance_people WHERE id = p_person AND clinic_id = v_clinic) THEN
    RAISE EXCEPTION 'Pessoa de outra instituição.' USING ERRCODE = '42501';
  END IF;
  IF p_paid_on IS NOT NULL AND p_paid_on > public.finance_today() THEN
    RAISE EXCEPTION 'A data do pagamento é hoje ou antes. Para o futuro, lance como "a pagar".' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_expenses (
    clinic_id, category_id, description, professional_id, person_id, amount_cents,
    due_on, paid_on, method, note, recorded_by, paid_by
  ) VALUES (
    v_clinic, p_category, btrim(p_description), p_professional, p_person, p_amount_cents,
    p_due_on, p_paid_on, CASE WHEN p_paid_on IS NULL THEN NULL ELSE p_method END,
    NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid(),
    CASE WHEN p_paid_on IS NULL THEN NULL ELSE auth.uid() END
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_pay_expense(p_expense UUID, p_paid_on DATE, p_method TEXT)
RETURNS public.finance_expenses
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  IF p_paid_on IS NULL OR p_paid_on > public.finance_today() THEN
    RAISE EXCEPTION 'A data do pagamento é hoje ou antes.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_expenses
  SET paid_on = p_paid_on, method = p_method, paid_by = auth.uid()
  WHERE id = p_expense AND clinic_id = v_clinic AND paid_on IS NULL AND NOT skipped AND voided_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saída não encontrada ou já paga.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

-- Paga (ou marca "não houve") um vencimento de uma saída fixa.
CREATE OR REPLACE FUNCTION public.finance_settle_recurring(
  p_recurring UUID,
  p_occurrence_on DATE,
  p_skip BOOLEAN,
  p_amount_cents INTEGER,
  p_paid_on DATE,
  p_method TEXT,
  p_note TEXT
)
RETURNS public.finance_expenses
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_rec public.finance_recurring_expenses%ROWTYPE;
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  SELECT * INTO v_rec FROM public.finance_recurring_expenses WHERE id = p_recurring AND clinic_id = v_clinic;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saída fixa não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF p_occurrence_on IS NULL OR p_occurrence_on < v_rec.starts_on THEN
    RAISE EXCEPTION 'Vencimento fora do período desta saída fixa.' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE(p_skip, FALSE) AND (p_paid_on IS NULL OR p_paid_on > public.finance_today()) THEN
    RAISE EXCEPTION 'A data do pagamento é hoje ou antes.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.finance_expenses (
    clinic_id, category_id, description, professional_id, person_id, recurring_id, occurrence_on,
    amount_cents, due_on, paid_on, method, skipped, note, recorded_by, paid_by
  ) VALUES (
    v_clinic, v_rec.category_id, v_rec.description, v_rec.professional_id, v_rec.person_id, v_rec.id, p_occurrence_on,
    CASE WHEN COALESCE(p_skip, FALSE) THEN 0 ELSE p_amount_cents END,
    p_occurrence_on,
    CASE WHEN COALESCE(p_skip, FALSE) THEN NULL ELSE p_paid_on END,
    CASE WHEN COALESCE(p_skip, FALSE) THEN NULL ELSE p_method END,
    COALESCE(p_skip, FALSE),
    NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid(),
    CASE WHEN COALESCE(p_skip, FALSE) THEN NULL ELSE auth.uid() END
  )
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.finance_void_expense(p_expense UUID, p_reason TEXT)
RETURNS public.finance_expenses
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row public.finance_expenses%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo da anulação.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.finance_expenses
  SET voided_at = timezone('utc', now()), voided_by = auth.uid(), void_reason = btrim(p_reason)
  WHERE id = p_expense AND clinic_id = v_clinic AND voided_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Saída não encontrada ou já anulada.' USING ERRCODE = 'P0002';
  END IF;
  RETURN v_row;
END;
$$;

DO $$
DECLARE
  v_signature TEXT;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.finance_ensure_defaults()',
    'public.finance_save_settings(DATE, TEXT, BOOLEAN, BOOLEAN)',
    'public.finance_save_prices(UUID, JSONB)',
    'public.finance_save_payout_rules(UUID, JSONB)',
    'public.finance_sell_package(UUID, UUID, TEXT, TEXT, UUID, TEXT, INTEGER, INTEGER, TEXT[], TEXT, INTEGER, DATE, TEXT, TEXT)',
    'public.finance_update_package_plan(UUID, INTEGER)',
    'public.finance_close_package(UUID, TEXT)',
    'public.finance_void_package(UUID, TEXT)',
    'public.finance_adjust_charge(UUID, INTEGER, TEXT)',
    'public.finance_register_receipt(UUID, DATE, JSONB, TEXT)',
    'public.finance_void_receipt(UUID, TEXT)',
    'public.finance_register_expense(UUID, TEXT, INTEGER, DATE, TEXT, DATE, UUID, UUID, TEXT)',
    'public.finance_pay_expense(UUID, DATE, TEXT)',
    'public.finance_settle_recurring(UUID, DATE, BOOLEAN, INTEGER, DATE, TEXT, TEXT)',
    'public.finance_void_expense(UUID, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_signature);
  END LOOP;
END;
$$;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.appointment_payments') IS NULL AS pagamentos_antigos_trocados,
  to_regclass('public.appointment_charges') IS NOT NULL AS cobrancas_criadas,
  to_regclass('public.finance_receipts') IS NOT NULL AS recebimentos_criados,
  to_regclass('public.finance_expenses') IS NOT NULL AS saidas_criadas,
  to_regclass('public.patient_packages') IS NOT NULL AS pacotes_criados,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_appointments_finance_status') AS gatilho_atendido,
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_appointments_finance_delete') AS gatilho_exclusao,
  NOT has_table_privilege('authenticated', 'public.finance_receipts', 'DELETE') AS recebimento_nao_se_apaga,
  NOT has_table_privilege('authenticated', 'public.finance_expenses', 'UPDATE') AS saida_so_por_funcao;
