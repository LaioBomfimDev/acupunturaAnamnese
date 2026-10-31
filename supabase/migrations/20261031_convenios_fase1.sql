-- ==========================================================
-- Convênios, Fase 1: cadastros para faturar no padrão TISS (31/10/2026)
-- REQUER: 20260908_financeiro_backend (esboço clinic_convenios e
-- convenio_procedure_prices), 20261020_online_consultation (versão de
-- admin_decide_patient_deletion da qual esta parte) e
-- 20261023_financeiro_etapa1 (can_manage_finance).
--
-- Escolha da administradora (31/10/2026): banco A (tabelas próprias a
-- partir do esboço) + tela B (cartões com o que falta para faturar e
-- passo a passo). Esta fase só cadastra; guia e lote são a Fase 2.
--
-- Desenho:
--   * clinic_convenios vira a operadora: registro ANS (6 dígitos), CNPJ
--     (alfanumérico desde 07/2026: 12 letras/números + 2 dígitos), versão
--     TISS, como envia (portal ou webservice) e dia do envio do lote.
--   * convenio_plans: planos da operadora (o paciente escolhe um).
--   * convenio_credentials: quem é o contratado na operadora, a clínica
--     (CNPJ) ou um profissional em nome próprio (CPF), com o código do
--     prestador que a operadora deu.
--   * convenio_procedure_prices ganha o código do procedimento: tabela 22
--     (TUSS) ou 00 (tabela própria da operadora), código e termo.
--   * tiss_requesters: quem pede o tratamento de fora da clínica.
--   * professional_billing_info: CPF, conselho, UF e CBO de quem atende,
--     só da administração. Fica fora de profiles de propósito: profiles é
--     lido pela equipe e CPF não é dado da equipe.
--   * clinics.cnes (sem CNES a guia leva 9999999, regra da ANS).
--   * patient_coverages: convênio do paciente (operadora, plano, carteira,
--     validade, CNS). A recepção cadastra; entra na exclusão de paciente.
--     patients.convenio_nome / convenio_carteirinha ficam como estavam
--     (0 linhas preenchidas em 31/10/2026) e a tela deixa de usá-los.
--   * tiss_terms: catálogo oficial da ANS (tabela, código, termo,
--     vigência), igual para todas as clínicas, só leitura. Carga pelo
--     script scripts/import-tuss.mjs, nunca pela tela.
--
-- Códigos de domínio conferidos no XSD oficial tissSimpleTypesV4_03_00:
-- dm_conselhoProfissional 01..15, dm_UF (código IBGE de 2 dígitos ou 98),
-- dm_CBOS (6 dígitos), dm_tabela (22 TUSS procedimentos, 00 própria).
--
-- Reverter: DROP das tabelas novas, das colunas novas e recriar
-- admin_decide_patient_deletion a partir de 20261020_online_consultation.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.clinic_convenios') IS NULL
     OR to_regclass('public.convenio_procedure_prices') IS NULL
     OR to_regclass('public.patient_consents') IS NULL
     OR to_regprocedure('public.can_manage_finance(uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20260908, 20261020 e 20261023.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 0. Ajudantes
-- ----------------------------------------------------------
-- Cadastro da clínica (administração, recepção e quem atende): a mesma
-- regra que abre patients para leitura e edição.
CREATE OR REPLACE FUNCTION public.can_edit_patient_registry(p_clinic UUID, p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_clinic IS NOT NULL
     AND public.can_access_clinic_registry(p_user)
     AND public.can_manage_agenda(p_clinic, p_user);
$$;

REVOKE ALL ON FUNCTION public.can_edit_patient_registry(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_patient_registry(UUID, UUID) TO authenticated;

-- Filho de operadora: clinic_id sempre vem da operadora, nunca do cliente.
CREATE OR REPLACE FUNCTION public.set_clinic_from_convenio()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT c.clinic_id INTO NEW.clinic_id FROM public.clinic_convenios c WHERE c.id = NEW.convenio_id;
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'convenio_id inválido' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------
-- 1. Clínica: CNES
-- ----------------------------------------------------------
ALTER TABLE public.clinics ADD COLUMN IF NOT EXISTS cnes TEXT;
ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_cnes_format;
ALTER TABLE public.clinics ADD CONSTRAINT clinics_cnes_format
  CHECK (cnes IS NULL OR cnes ~ '^[0-9]{7}$');

CREATE OR REPLACE FUNCTION public.finance_save_clinic_cnes(p_clinic UUID, p_cnes TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnes TEXT := nullif(regexp_replace(coalesce(p_cnes, ''), '\D', '', 'g'), '');
BEGIN
  IF NOT public.can_manage_finance(p_clinic) THEN
    RAISE EXCEPTION 'Só a administração da clínica altera.' USING ERRCODE = '42501';
  END IF;
  IF v_cnes IS NOT NULL AND v_cnes !~ '^[0-9]{7}$' THEN
    RAISE EXCEPTION 'cnes_invalido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.clinics SET cnes = v_cnes WHERE id = p_clinic;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_save_clinic_cnes(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_save_clinic_cnes(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 2. Operadora (o esboço clinic_convenios)
-- ----------------------------------------------------------
ALTER TABLE public.clinic_convenios
  ADD COLUMN IF NOT EXISTS ans_registry TEXT,
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS tiss_version TEXT NOT NULL DEFAULT '4.03.00',
  ADD COLUMN IF NOT EXISTS submission_channel TEXT NOT NULL DEFAULT 'portal',
  ADD COLUMN IF NOT EXISTS lot_due_day SMALLINT;

ALTER TABLE public.clinic_convenios DROP CONSTRAINT IF EXISTS clinic_convenios_name_check;
ALTER TABLE public.clinic_convenios ADD CONSTRAINT clinic_convenios_name_check
  CHECK (length(btrim(name)) BETWEEN 1 AND 70);
ALTER TABLE public.clinic_convenios DROP CONSTRAINT IF EXISTS clinic_convenios_ans_format;
ALTER TABLE public.clinic_convenios ADD CONSTRAINT clinic_convenios_ans_format
  CHECK (ans_registry IS NULL OR ans_registry ~ '^[0-9]{6}$');
ALTER TABLE public.clinic_convenios DROP CONSTRAINT IF EXISTS clinic_convenios_cnpj_format;
ALTER TABLE public.clinic_convenios ADD CONSTRAINT clinic_convenios_cnpj_format
  CHECK (cnpj IS NULL OR cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$');
ALTER TABLE public.clinic_convenios DROP CONSTRAINT IF EXISTS clinic_convenios_tiss_version_format;
ALTER TABLE public.clinic_convenios ADD CONSTRAINT clinic_convenios_tiss_version_format
  CHECK (tiss_version ~ '^[0-9]\.[0-9]{2}\.[0-9]{2}$');
ALTER TABLE public.clinic_convenios DROP CONSTRAINT IF EXISTS clinic_convenios_channel_check;
ALTER TABLE public.clinic_convenios ADD CONSTRAINT clinic_convenios_channel_check
  CHECK (submission_channel IN ('portal', 'webservice'));
ALTER TABLE public.clinic_convenios DROP CONSTRAINT IF EXISTS clinic_convenios_lot_day_check;
ALTER TABLE public.clinic_convenios ADD CONSTRAINT clinic_convenios_lot_day_check
  CHECK (lot_due_day IS NULL OR lot_due_day BETWEEN 1 AND 31);

-- A mesma operadora não entra duas vezes pelo registro ANS.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinic_convenios_ans_unique
  ON public.clinic_convenios (clinic_id, ans_registry) WHERE ans_registry IS NOT NULL;

-- A recepção escolhe a operadora no cadastro do paciente: lê nome e
-- planos, nada de preço. A política de 20260908 (administração, tudo)
-- continua.
DROP POLICY IF EXISTS clinic_convenios_registry_read ON public.clinic_convenios;
CREATE POLICY clinic_convenios_registry_read ON public.clinic_convenios
  FOR SELECT TO authenticated
  USING (public.can_edit_patient_registry(clinic_id));

-- ----------------------------------------------------------
-- 3. Planos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.convenio_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT convenio_plans_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 60)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_convenio_plans_name_unique
  ON public.convenio_plans (convenio_id, lower(btrim(name)));

DROP TRIGGER IF EXISTS trg_convenio_plans_clinic ON public.convenio_plans;
CREATE TRIGGER trg_convenio_plans_clinic
  BEFORE INSERT OR UPDATE OF convenio_id ON public.convenio_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_clinic_from_convenio();

DROP TRIGGER IF EXISTS trg_convenio_plans_updated_at ON public.convenio_plans;
CREATE TRIGGER trg_convenio_plans_updated_at
  BEFORE UPDATE ON public.convenio_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.convenio_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS convenio_plans_admin ON public.convenio_plans;
CREATE POLICY convenio_plans_admin ON public.convenio_plans
  FOR ALL TO authenticated
  USING (public.can_manage_finance(clinic_id))
  WITH CHECK (public.can_manage_finance(clinic_id));
DROP POLICY IF EXISTS convenio_plans_registry_read ON public.convenio_plans;
CREATE POLICY convenio_plans_registry_read ON public.convenio_plans
  FOR SELECT TO authenticated
  USING (public.can_edit_patient_registry(clinic_id));

REVOKE ALL ON public.convenio_plans FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.convenio_plans TO authenticated;

-- ----------------------------------------------------------
-- 4. Credenciamento
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.convenio_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  contractor_kind TEXT NOT NULL,
  professional_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  provider_code TEXT NOT NULL,
  valid_from DATE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT convenio_credentials_kind_check CHECK (
    (contractor_kind = 'clinic' AND professional_id IS NULL)
    OR (contractor_kind = 'professional' AND professional_id IS NOT NULL)
  ),
  -- codigoPrestadorNaOperadora: até 14 caracteres no XSD.
  CONSTRAINT convenio_credentials_code_check CHECK (provider_code ~ '^[A-Za-z0-9./-]{1,14}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_convenio_credentials_clinic_unique
  ON public.convenio_credentials (convenio_id) WHERE contractor_kind = 'clinic';
CREATE UNIQUE INDEX IF NOT EXISTS idx_convenio_credentials_professional_unique
  ON public.convenio_credentials (convenio_id, professional_id) WHERE contractor_kind = 'professional';

CREATE OR REPLACE FUNCTION public.convenio_credentials_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT c.clinic_id INTO NEW.clinic_id FROM public.clinic_convenios c WHERE c.id = NEW.convenio_id;
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'convenio_id inválido' USING ERRCODE = '23503';
  END IF;
  IF NEW.professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = NEW.professional_id AND p.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'profissional_de_outra_clinica' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_convenio_credentials_defaults ON public.convenio_credentials;
CREATE TRIGGER trg_convenio_credentials_defaults
  BEFORE INSERT OR UPDATE OF convenio_id, professional_id ON public.convenio_credentials
  FOR EACH ROW EXECUTE FUNCTION public.convenio_credentials_defaults();

DROP TRIGGER IF EXISTS trg_convenio_credentials_updated_at ON public.convenio_credentials;
CREATE TRIGGER trg_convenio_credentials_updated_at
  BEFORE UPDATE ON public.convenio_credentials
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.convenio_credentials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS convenio_credentials_admin ON public.convenio_credentials;
CREATE POLICY convenio_credentials_admin ON public.convenio_credentials
  FOR ALL TO authenticated
  USING (public.can_manage_finance(clinic_id))
  WITH CHECK (public.can_manage_finance(clinic_id));

REVOKE ALL ON public.convenio_credentials FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.convenio_credentials TO authenticated;

-- ----------------------------------------------------------
-- 5. Preço por operadora com o código do procedimento
-- ----------------------------------------------------------
ALTER TABLE public.convenio_procedure_prices
  ADD COLUMN IF NOT EXISTS tuss_table TEXT NOT NULL DEFAULT '22',
  ADD COLUMN IF NOT EXISTS tuss_code TEXT,
  ADD COLUMN IF NOT EXISTS tuss_term TEXT;

ALTER TABLE public.convenio_procedure_prices DROP CONSTRAINT IF EXISTS convenio_procedure_prices_tuss_check;
ALTER TABLE public.convenio_procedure_prices ADD CONSTRAINT convenio_procedure_prices_tuss_check CHECK (
  (tuss_table = '22' AND (tuss_code IS NULL OR tuss_code ~ '^[0-9]{8}$'))
  OR (tuss_table = '00' AND (tuss_code IS NULL OR tuss_code ~ '^[A-Za-z0-9.-]{1,10}$'))
);
-- descricaoProcedimento: até 150 caracteres no XSD.
ALTER TABLE public.convenio_procedure_prices DROP CONSTRAINT IF EXISTS convenio_procedure_prices_term_check;
ALTER TABLE public.convenio_procedure_prices ADD CONSTRAINT convenio_procedure_prices_term_check
  CHECK (tuss_term IS NULL OR length(tuss_term) BETWEEN 1 AND 150);

-- A política de 20260908 já é "administração, tudo"; a regra é a mesma
-- de can_manage_finance.

-- ----------------------------------------------------------
-- 6. Solicitantes externos
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tiss_requesters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  council_code TEXT NOT NULL,
  council_number TEXT NOT NULL,
  council_uf TEXT NOT NULL,
  cbo_code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT tiss_requesters_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 70),
  CONSTRAINT tiss_requesters_council_check CHECK (council_code ~ '^(0[1-9]|1[0-5])$'),
  CONSTRAINT tiss_requesters_number_check CHECK (council_number ~ '^[A-Za-z0-9./-]{1,15}$'),
  CONSTRAINT tiss_requesters_uf_check CHECK (council_uf ~ '^([1-5][0-9]|98)$'),
  CONSTRAINT tiss_requesters_cbo_check CHECK (cbo_code ~ '^[0-9]{6}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tiss_requesters_council_unique
  ON public.tiss_requesters (clinic_id, council_code, council_uf, upper(council_number));

DROP TRIGGER IF EXISTS trg_tiss_requesters_defaults ON public.tiss_requesters;
CREATE TRIGGER trg_tiss_requesters_defaults
  BEFORE INSERT ON public.tiss_requesters
  FOR EACH ROW EXECUTE FUNCTION public.set_agenda_config_defaults();

DROP TRIGGER IF EXISTS trg_tiss_requesters_updated_at ON public.tiss_requesters;
CREATE TRIGGER trg_tiss_requesters_updated_at
  BEFORE UPDATE ON public.tiss_requesters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.tiss_requesters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tiss_requesters_admin ON public.tiss_requesters;
CREATE POLICY tiss_requesters_admin ON public.tiss_requesters
  FOR ALL TO authenticated
  USING (public.can_manage_finance(clinic_id))
  WITH CHECK (public.can_manage_finance(clinic_id));

REVOKE ALL ON public.tiss_requesters FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tiss_requesters TO authenticated;

-- ----------------------------------------------------------
-- 7. Dados de faturamento de quem atende
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_billing_info (
  professional_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  cpf TEXT,
  council_code TEXT,
  council_number TEXT,
  council_uf TEXT,
  cbo_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT professional_billing_cpf_check CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  CONSTRAINT professional_billing_council_check CHECK (council_code IS NULL OR council_code ~ '^(0[1-9]|1[0-5])$'),
  CONSTRAINT professional_billing_number_check CHECK (council_number IS NULL OR council_number ~ '^[A-Za-z0-9./-]{1,15}$'),
  CONSTRAINT professional_billing_uf_check CHECK (council_uf IS NULL OR council_uf ~ '^([1-5][0-9]|98)$'),
  CONSTRAINT professional_billing_cbo_check CHECK (cbo_code IS NULL OR cbo_code ~ '^[0-9]{6}$')
);

CREATE OR REPLACE FUNCTION public.professional_billing_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.clinic_id INTO NEW.clinic_id FROM public.profiles p WHERE p.id = NEW.professional_id;
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'profissional_sem_clinica' USING ERRCODE = '22023';
  END IF;
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_billing_defaults ON public.professional_billing_info;
CREATE TRIGGER trg_professional_billing_defaults
  BEFORE INSERT OR UPDATE ON public.professional_billing_info
  FOR EACH ROW EXECUTE FUNCTION public.professional_billing_defaults();

ALTER TABLE public.professional_billing_info ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS professional_billing_admin ON public.professional_billing_info;
CREATE POLICY professional_billing_admin ON public.professional_billing_info
  FOR ALL TO authenticated
  USING (public.can_manage_finance(clinic_id))
  WITH CHECK (public.can_manage_finance(clinic_id));

REVOKE ALL ON public.professional_billing_info FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_billing_info TO authenticated;

-- ----------------------------------------------------------
-- 8. Convênio do paciente
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_coverages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  convenio_id UUID NOT NULL REFERENCES public.clinic_convenios(id) ON DELETE RESTRICT,
  plan_id UUID REFERENCES public.convenio_plans(id) ON DELETE SET NULL,
  card_number TEXT NOT NULL,
  card_valid_until DATE,
  cns TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  -- numeroCarteira: até 20 caracteres no XSD; CNS: 15 dígitos.
  CONSTRAINT patient_coverages_card_check CHECK (card_number ~ '^[A-Za-z0-9./ -]{1,20}$'),
  CONSTRAINT patient_coverages_cns_check CHECK (cns IS NULL OR cns ~ '^[0-9]{15}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_coverages_active_unique
  ON public.patient_coverages (patient_id, convenio_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_patient_coverages_patient
  ON public.patient_coverages (patient_id);

CREATE OR REPLACE FUNCTION public.patient_coverages_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT p.clinic_id INTO NEW.clinic_id FROM public.patients p WHERE p.id = NEW.patient_id;
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'paciente_sem_clinica' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_convenios c WHERE c.id = NEW.convenio_id AND c.clinic_id = NEW.clinic_id
  ) THEN
    RAISE EXCEPTION 'convenio_de_outra_clinica' USING ERRCODE = '22023';
  END IF;
  IF NEW.plan_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.convenio_plans pl WHERE pl.id = NEW.plan_id AND pl.convenio_id = NEW.convenio_id
  ) THEN
    RAISE EXCEPTION 'plano_de_outra_operadora' USING ERRCODE = '22023';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := auth.uid();
  ELSE
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;
  NEW.card_number := btrim(NEW.card_number);
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_coverages_defaults ON public.patient_coverages;
CREATE TRIGGER trg_patient_coverages_defaults
  BEFORE INSERT OR UPDATE ON public.patient_coverages
  FOR EACH ROW EXECUTE FUNCTION public.patient_coverages_defaults();

ALTER TABLE public.patient_coverages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_coverages_select ON public.patient_coverages;
CREATE POLICY patient_coverages_select ON public.patient_coverages
  FOR SELECT TO authenticated
  USING (public.can_edit_patient_registry(clinic_id));
DROP POLICY IF EXISTS patient_coverages_insert ON public.patient_coverages;
CREATE POLICY patient_coverages_insert ON public.patient_coverages
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_patient_registry(clinic_id));
DROP POLICY IF EXISTS patient_coverages_update ON public.patient_coverages;
CREATE POLICY patient_coverages_update ON public.patient_coverages
  FOR UPDATE TO authenticated
  USING (public.can_edit_patient_registry(clinic_id))
  WITH CHECK (public.can_edit_patient_registry(clinic_id));
-- Sem DELETE: convênio que acabou fica desativado (active = false).

REVOKE ALL ON public.patient_coverages FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.patient_coverages TO authenticated;

-- ----------------------------------------------------------
-- 9. Catálogo oficial (TUSS e domínios)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tiss_terms (
  table_code TEXT NOT NULL,
  code TEXT NOT NULL,
  term TEXT NOT NULL,
  valid_from DATE,
  valid_until DATE,
  source_version TEXT NOT NULL,
  PRIMARY KEY (table_code, code),
  CONSTRAINT tiss_terms_table_check CHECK (table_code ~ '^[0-9]{2}$')
);

CREATE INDEX IF NOT EXISTS idx_tiss_terms_search
  ON public.tiss_terms USING gin (to_tsvector('portuguese', term));

ALTER TABLE public.tiss_terms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tiss_terms_read ON public.tiss_terms;
CREATE POLICY tiss_terms_read ON public.tiss_terms
  FOR SELECT TO authenticated USING (TRUE);

REVOKE ALL ON public.tiss_terms FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tiss_terms TO authenticated;

-- ----------------------------------------------------------
-- 10. Exclusão de paciente também apaga o convênio do paciente
-- ----------------------------------------------------------
-- Cópia fiel da versão de 20261020 + a linha do snapshot e o DELETE de
-- patient_coverages, e uma correção de ordem achada ao validar esta
-- migration (31/10/2026): evolução sai antes do agendamento.
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
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

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

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.convenio_plans') IS NOT NULL AS planos,
  to_regclass('public.convenio_credentials') IS NOT NULL AS credenciamento,
  to_regclass('public.tiss_requesters') IS NOT NULL AS solicitantes,
  to_regclass('public.professional_billing_info') IS NOT NULL AS faturamento_profissional,
  to_regclass('public.patient_coverages') IS NOT NULL AS convenio_paciente,
  to_regclass('public.tiss_terms') IS NOT NULL AS catalogo,
  NOT has_table_privilege('anon', 'public.patient_coverages', 'SELECT') AS anon_sem_convenio_paciente,
  NOT has_table_privilege('authenticated', 'public.patient_coverages', 'DELETE') AS convenio_paciente_sem_delete,
  NOT has_table_privilege('authenticated', 'public.tiss_terms', 'INSERT') AS catalogo_so_leitura,
  position('patient_coverages' IN pg_get_functiondef('public.admin_decide_patient_deletion(uuid, text, text)'::regprocedure)) > 0 AS exclusao_apaga_convenio;
