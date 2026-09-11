-- ==========================================================
-- Financeiro básico (Fase 6) — schema, sem tela
--
-- Escopo desta migração (decisão da usuária, 2026-09-08):
--  * Preço por procedimento (disciplina + tipo de atendimento),
--    particular E por convênio — dois preços, não um.
--  * Repasse ao profissional calculado por procedimento/disciplina
--    (não um percentual único da clínica inteira).
--  * Fechamento é resumo agregado por período — sem rotina de abrir/
--    fechar caixa diário.
--  * Convênio aqui é só CADASTRO (nome, vigência, preço por
--    procedimento). A integração de verdade com o sistema/portal de
--    cada operadora fica para uma migração própria, quando a operadora
--    específica estiver definida — cada uma tem endpoint e cadastro
--    próprios, não existe uma API única.
--
-- Migração ADITIVA: não altera nem lê prontuário. Dado financeiro é
-- administrativo, mesmo raciocínio de agendamento
-- (20260809_appointments.sql).
-- ==========================================================

-- ----------------------------------------------------------
-- Helper genérico de updated_at para as tabelas novas desta migração
-- (as tabelas de agenda já têm cada uma a sua própria função; aqui
-- várias tabelas novas de uma vez só, então um helper compartilhado
-- evita repetir o mesmo corpo quatro vezes).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- 1. Preço particular por procedimento (disciplina + tipo)
--
-- appointment_type NULL = preço padrão da disciplina (cobre qualquer
-- tipo sem preço específico cadastrado). As duas UNIQUE parciais abaixo
-- garantem no máximo UM padrão por disciplina e um preço por
-- combinação específica — mesmo raciocínio de
-- appointments_no_overlap: o banco recusa em vez de confiar na tela.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.procedure_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  appointment_type TEXT CHECK (appointment_type IS NULL OR appointment_type IN ('first_visit', 'return', 'evaluation')),

  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  repasse_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (repasse_percent >= 0 AND repasse_percent <= 100),
  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

DROP INDEX IF EXISTS idx_procedure_prices_default_unique;
CREATE UNIQUE INDEX idx_procedure_prices_default_unique
  ON public.procedure_prices(clinic_id, discipline) WHERE appointment_type IS NULL;

DROP INDEX IF EXISTS idx_procedure_prices_specific_unique;
CREATE UNIQUE INDEX idx_procedure_prices_specific_unique
  ON public.procedure_prices(clinic_id, discipline, appointment_type) WHERE appointment_type IS NOT NULL;

DROP TRIGGER IF EXISTS trg_procedure_prices_defaults ON public.procedure_prices;
CREATE TRIGGER trg_procedure_prices_defaults
  BEFORE INSERT ON public.procedure_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_agenda_config_defaults();

DROP TRIGGER IF EXISTS trg_procedure_prices_updated_at ON public.procedure_prices;
CREATE TRIGGER trg_procedure_prices_updated_at
  BEFORE UPDATE ON public.procedure_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Dado financeiro (preço, repasse) é visível só a quem administra a
-- instituição — diferente da agenda operacional, que a equipe toda
-- lê. Ajustável depois se a tela precisar de outro recorte.
ALTER TABLE public.procedure_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS procedure_prices_admin ON public.procedure_prices;
CREATE POLICY procedure_prices_admin ON public.procedure_prices
  FOR ALL TO authenticated
  USING (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()))
  WITH CHECK (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()));

REVOKE ALL ON public.procedure_prices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.procedure_prices TO authenticated;

-- ----------------------------------------------------------
-- 2. Convênios (cadastro — nome, vigência)
--
-- Só cadastro por enquanto: nenhuma coluna de integração externa
-- (endpoint, credencial, protocolo) até a operadora específica estar
-- definida — colocar isso agora seria adivinhar um formato que ainda
-- não conhecemos.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_convenios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  valid_from DATE,
  valid_until DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT clinic_convenios_period CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CONSTRAINT clinic_convenios_name_unique UNIQUE (clinic_id, name)
);

DROP TRIGGER IF EXISTS trg_clinic_convenios_defaults ON public.clinic_convenios;
CREATE TRIGGER trg_clinic_convenios_defaults
  BEFORE INSERT ON public.clinic_convenios
  FOR EACH ROW EXECUTE FUNCTION public.set_agenda_config_defaults();

DROP TRIGGER IF EXISTS trg_clinic_convenios_updated_at ON public.clinic_convenios;
CREATE TRIGGER trg_clinic_convenios_updated_at
  BEFORE UPDATE ON public.clinic_convenios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.clinic_convenios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_convenios_admin ON public.clinic_convenios;
CREATE POLICY clinic_convenios_admin ON public.clinic_convenios
  FOR ALL TO authenticated
  USING (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()))
  WITH CHECK (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()));

REVOKE ALL ON public.clinic_convenios FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_convenios TO authenticated;

-- ----------------------------------------------------------
-- 3. Preço por procedimento, por convênio
--
-- clinic_id é redundante com convenio_id → clinic_convenios.clinic_id,
-- mas guardado aqui também (preenchido por trigger a partir do
-- convênio, nunca pelo cliente) para a RLS não precisar de subquery
-- em toda leitura — mesmo padrão de appointment_payments abaixo.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.convenio_procedure_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  appointment_type TEXT CHECK (appointment_type IS NULL OR appointment_type IN ('first_visit', 'return', 'evaluation')),

  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

DROP INDEX IF EXISTS idx_convenio_prices_default_unique;
CREATE UNIQUE INDEX idx_convenio_prices_default_unique
  ON public.convenio_procedure_prices(convenio_id, discipline) WHERE appointment_type IS NULL;

DROP INDEX IF EXISTS idx_convenio_prices_specific_unique;
CREATE UNIQUE INDEX idx_convenio_prices_specific_unique
  ON public.convenio_procedure_prices(convenio_id, discipline, appointment_type) WHERE appointment_type IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_convenio_price_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- clinic_id vem do convênio, não do cliente — impede cadastrar
  -- preço apontando pra convênio de outra instituição.
  SELECT clinic_id INTO NEW.clinic_id FROM public.clinic_convenios WHERE id = NEW.convenio_id;
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'convenio_id inválido';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convenio_prices_defaults ON public.convenio_procedure_prices;
CREATE TRIGGER trg_convenio_prices_defaults
  BEFORE INSERT ON public.convenio_procedure_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_convenio_price_defaults();

DROP TRIGGER IF EXISTS trg_convenio_prices_updated_at ON public.convenio_procedure_prices;
CREATE TRIGGER trg_convenio_prices_updated_at
  BEFORE UPDATE ON public.convenio_procedure_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.convenio_procedure_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS convenio_procedure_prices_admin ON public.convenio_procedure_prices;
CREATE POLICY convenio_procedure_prices_admin ON public.convenio_procedure_prices
  FOR ALL TO authenticated
  USING (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()))
  WITH CHECK (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()));

REVOKE ALL ON public.convenio_procedure_prices FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.convenio_procedure_prices TO authenticated;

-- ----------------------------------------------------------
-- 4. Faturamento do agendamento: particular ou convênio
-- ----------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'particular',
  ADD COLUMN IF NOT EXISTS convenio_id UUID REFERENCES public.clinic_convenios(id) ON DELETE RESTRICT;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_billing_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_billing_type_check
  CHECK (billing_type IN ('particular', 'convenio'));

-- convenio_id só faz sentido quando billing_type = 'convenio'; evita
-- gravar um convênio "pendurado" num atendimento marcado particular.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_billing_convenio_shape;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_billing_convenio_shape
  CHECK (billing_type = 'convenio' OR convenio_id IS NULL);

-- ----------------------------------------------------------
-- 5. Pagamentos recebidos por agendamento
--
-- Uma linha por recebimento (não por agendamento): cobre pagamento
-- parcelado/misto (parte dinheiro, parte pix) sem forçar um único
-- valor/método por atendimento.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointment_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  appointment_id UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,

  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  payment_method TEXT NOT NULL
    CHECK (payment_method IN ('dinheiro', 'cartao_debito', 'cartao_credito', 'pix', 'convenio', 'outro')),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  note TEXT,

  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_appointment_payments_appointment ON public.appointment_payments(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointment_payments_clinic_paid_at ON public.appointment_payments(clinic_id, paid_at);

CREATE OR REPLACE FUNCTION public.set_appointment_payment_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- clinic_id vem do agendamento, não do cliente — mesmo raciocínio
  -- do convênio acima: impede apontar pagamento pra clínica errada.
  SELECT clinic_id INTO NEW.clinic_id FROM public.appointments WHERE id = NEW.appointment_id;
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'appointment_id inválido';
  END IF;
  IF NEW.recorded_by IS NULL THEN
    NEW.recorded_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointment_payments_defaults ON public.appointment_payments;
CREATE TRIGGER trg_appointment_payments_defaults
  BEFORE INSERT ON public.appointment_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_payment_defaults();

ALTER TABLE public.appointment_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointment_payments_admin ON public.appointment_payments;
CREATE POLICY appointment_payments_admin ON public.appointment_payments
  FOR ALL TO authenticated
  USING (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()))
  WITH CHECK (public.can_manage_agenda(clinic_id) AND (public.is_clinic_admin() OR public.is_super_admin()));

REVOKE ALL ON public.appointment_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointment_payments TO authenticated;

-- ----------------------------------------------------------
-- 6. Resumo financeiro por período (RPC — sem tabela própria)
--
-- "Fechamento" aqui é resumo agregado, não rotina de abrir/fechar
-- caixa diário (decisão da usuária, 2026-09-08). LANGUAGE sql sem
-- SECURITY DEFINER: roda como quem chamou, então a RLS de
-- appointment_payments/procedure_prices já filtra sozinha — quem não
-- é admin da clínica recebe zero linhas, não erro.
--
-- repasse_cents usa o preço específico (disciplina+tipo) quando existe
-- e cai pro preço padrão da disciplina (appointment_type IS NULL)
-- quando não — por isso o LATERAL com ORDER BY em vez de um JOIN
-- direto: sem isso, um tipo sem preço específico cadastrado ficaria
-- sempre com repasse 0 mesmo tendo um preço padrão configurado.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.clinic_financial_summary(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_professional UUID DEFAULT NULL
)
RETURNS TABLE (
  professional_id UUID,
  professional_name TEXT,
  discipline TEXT,
  payment_method TEXT,
  received_cents BIGINT,
  repasse_cents BIGINT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT
    a.professional_id,
    pr.full_name AS professional_name,
    a.discipline,
    ap.payment_method,
    SUM(ap.amount_cents)::BIGINT AS received_cents,
    SUM(ROUND(ap.amount_cents * COALESCE(pp.repasse_percent, 0) / 100.0))::BIGINT AS repasse_cents
  FROM public.appointment_payments ap
  JOIN public.appointments a ON a.id = ap.appointment_id
  JOIN public.profiles pr ON pr.id = a.professional_id
  LEFT JOIN LATERAL (
    SELECT pp2.repasse_percent
    FROM public.procedure_prices pp2
    WHERE pp2.clinic_id = a.clinic_id
      AND pp2.discipline = a.discipline
      AND (pp2.appointment_type = a.appointment_type OR pp2.appointment_type IS NULL)
    ORDER BY (pp2.appointment_type IS NULL) ASC
    LIMIT 1
  ) pp ON TRUE
  WHERE ap.paid_at >= p_from
    AND ap.paid_at < p_to
    AND (p_professional IS NULL OR a.professional_id = p_professional)
  GROUP BY a.professional_id, pr.full_name, a.discipline, ap.payment_method;
$$;

REVOKE ALL ON FUNCTION public.clinic_financial_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clinic_financial_summary(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.procedure_prices') IS NOT NULL AS precos_criados,
  to_regclass('public.clinic_convenios') IS NOT NULL AS convenios_criados,
  to_regclass('public.convenio_procedure_prices') IS NOT NULL AS precos_convenio_criados,
  to_regclass('public.appointment_payments') IS NOT NULL AS pagamentos_criados,
  to_regprocedure('public.clinic_financial_summary(timestamptz,timestamptz,uuid)') IS NOT NULL AS resumo_criado,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'billing_type'
  ) AS coluna_billing_type,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'procedure_prices') AS politicas_precos,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'clinic_convenios') AS politicas_convenios,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'convenio_procedure_prices') AS politicas_precos_convenio,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'appointment_payments') AS politicas_pagamentos;
