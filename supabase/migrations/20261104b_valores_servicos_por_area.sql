-- ==========================================================
-- Valores e serviços por área (04/11/2026)
-- REQUER: 20261023_financeiro_etapa1.sql (finance_payout_rules,
-- finance_package_models, patient_packages), 20260924c (lista anterior de
-- tipos em appointments, procedure_prices e convenio_procedure_prices) e
-- 20261104_notas_fiscais.sql (fiscal_type_label, versão anterior).
--
-- Pedido da administradora: o Financeiro passa a ter os serviços de cada
-- área (catálogo em frontend/src/utils/appointmentTypes.js). Oito tipos
-- novos, cada um só nas áreas dele:
--   acupuntura .............. auriculotherapy, laserpuncture, cupping
--   fisioterapia, psicologia  neuromodulation, vascular_biomodulation, e_ilib
--   aba ..................... home_visit, school_visit
--
-- Os sete tipos anteriores (first_visit, return, evaluation, anamnesis,
-- session, feedback, interview) seguem válidos em QUALQUER área, como até
-- hoje: nenhuma linha gravada fica inválida, a Agenda segue oferecendo
-- esses tipos e o histórico não muda. O que é novo é só a trava área ×
-- tipo dos oito tipos novos, numa função única usada por todos os CHECKs:
--   appointments, procedure_prices, convenio_procedure_prices,
--   finance_payout_rules (tipo), finance_package_models e patient_packages
--   (lista de tipos que gastam o pacote).
--
-- Fica como está, de propósito:
--   * finance_save_prices, finance_save_payout_rules, finance_sell_package
--     e finance_package_models: mesmos contratos. A RPC de preços apaga e
--     regrava o escopo inteiro numa transação: se uma linha for recusada,
--     nada muda (os valores anteriores ficam).
--   * O desconto de 5% da Acupuntura é só preenchimento na tela; o banco
--     não impõe percentual de pacote (decisão da administradora pendente
--     para Fisioterapia e pacote misto).
--   * appointment_charges guarda a cópia do tipo e o valor do dia em que
--     o atendimento virou Atendido: nada é recalculado.
--   * Guia SP/SADT e lote TISS não leem o tipo, só o TUSS do preço da
--     operadora (convenio_procedure_prices), que agora aceita os tipos novos.
--
-- Reversão: recriar os seis CHECKs com a lista anterior (só funciona se
-- nenhuma linha usar os tipos novos) e a fiscal_type_label de 20261104.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Regra única área × tipo (espelho: isTypeAllowedInArea)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.appointment_type_fits_area(p_discipline TEXT, p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_type IS NULL THEN TRUE
    WHEN p_type IN ('first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview') THEN TRUE
    WHEN p_type IN ('auriculotherapy', 'laserpuncture', 'cupping') THEN p_discipline IS NOT DISTINCT FROM 'acupuntura'
    WHEN p_type IN ('neuromodulation', 'vascular_biomodulation', 'e_ilib') THEN COALESCE(p_discipline IN ('fisioterapia', 'psicologia'), FALSE)
    WHEN p_type IN ('home_visit', 'school_visit') THEN p_discipline IS NOT DISTINCT FROM 'aba'
    ELSE FALSE
  END;
$$;

CREATE OR REPLACE FUNCTION public.appointment_types_fit_area(p_discipline TEXT, p_types TEXT[])
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT p_types IS NOT NULL
    AND array_position(p_types, NULL) IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM unnest(p_types) AS t(type)
      WHERE NOT public.appointment_type_fits_area(p_discipline, t.type)
    );
$$;

REVOKE ALL ON FUNCTION public.appointment_type_fits_area(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.appointment_types_fit_area(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appointment_type_fits_area(TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.appointment_types_fit_area(TEXT, TEXT[]) TO authenticated, service_role;

-- ----------------------------------------------------------
-- 2. Troca dos CHECKs com a lista anterior
-- ----------------------------------------------------------
-- Os CHECKs de 20261023 nasceram na coluna (nome dado pelo Postgres); os
-- de 20260924c têm nome. Remove pelo conteúdo (lista com 'interview'),
-- nunca por um nome adivinhado, para não sobrar trava antiga.
DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN
    SELECT c.conrelid::regclass AS tbl, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND c.conrelid IN (
        'public.appointments'::regclass,
        'public.procedure_prices'::regclass,
        'public.convenio_procedure_prices'::regclass,
        'public.finance_payout_rules'::regclass,
        'public.finance_package_models'::regclass,
        'public.patient_packages'::regclass
      )
      AND pg_get_constraintdef(c.oid) LIKE '%appointment_type%'
      AND pg_get_constraintdef(c.oid) LIKE '%interview%'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', v_row.tbl, v_row.conname);
  END LOOP;
END $$;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_type_check
  CHECK (public.appointment_type_fits_area(discipline, appointment_type));

ALTER TABLE public.procedure_prices DROP CONSTRAINT IF EXISTS procedure_prices_appointment_type_check;
ALTER TABLE public.procedure_prices ADD CONSTRAINT procedure_prices_appointment_type_check
  CHECK (public.appointment_type_fits_area(discipline, appointment_type));

ALTER TABLE public.convenio_procedure_prices DROP CONSTRAINT IF EXISTS convenio_procedure_prices_appointment_type_check;
ALTER TABLE public.convenio_procedure_prices ADD CONSTRAINT convenio_procedure_prices_appointment_type_check
  CHECK (public.appointment_type_fits_area(discipline, appointment_type));

-- Tipo sem área já é barrado por finance_payout_rules_type_needs_area.
ALTER TABLE public.finance_payout_rules DROP CONSTRAINT IF EXISTS finance_payout_rules_appointment_type_check;
ALTER TABLE public.finance_payout_rules ADD CONSTRAINT finance_payout_rules_appointment_type_check
  CHECK (public.appointment_type_fits_area(discipline, appointment_type));

ALTER TABLE public.finance_package_models DROP CONSTRAINT IF EXISTS finance_package_models_types;
ALTER TABLE public.finance_package_models ADD CONSTRAINT finance_package_models_types
  CHECK (public.appointment_types_fit_area(discipline, appointment_types));

ALTER TABLE public.patient_packages DROP CONSTRAINT IF EXISTS patient_packages_types;
ALTER TABLE public.patient_packages ADD CONSTRAINT patient_packages_types
  CHECK (public.appointment_types_fit_area(discipline, appointment_types));

-- ----------------------------------------------------------
-- 3. Descrição da nota fiscal com os tipos novos
-- ----------------------------------------------------------
-- Parte de 20261104_notas_fiscais.sql (última versão). Mesmos nomes
-- gerais de APPOINTMENT_TYPES (utils/appointmentTypes.js); "Primeira
-- consulta" segue como estava na nota.
CREATE OR REPLACE FUNCTION public.fiscal_type_label(p_type TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_type
    WHEN 'anamnesis' THEN 'Anamnese'
    WHEN 'evaluation' THEN 'Avaliação'
    WHEN 'feedback' THEN 'Devolutiva'
    WHEN 'interview' THEN 'Entrevista'
    WHEN 'first_visit' THEN 'Primeira consulta'
    WHEN 'return' THEN 'Retorno'
    WHEN 'auriculotherapy' THEN 'Auriculoterapia'
    WHEN 'laserpuncture' THEN 'Laserpuntura'
    WHEN 'cupping' THEN 'Ventosa'
    WHEN 'neuromodulation' THEN 'Neuromodulação'
    WHEN 'vascular_biomodulation' THEN 'Biomodulação vascular'
    WHEN 'e_ilib' THEN 'e-ILIB'
    WHEN 'home_visit' THEN 'Visita domiciliar'
    WHEN 'school_visit' THEN 'Visita escolar'
    ELSE 'Sessão'
  END;
$$;

-- ----------------------------------------------------------
-- 4. Conferência
-- ----------------------------------------------------------
SELECT
  public.appointment_type_fits_area('acupuntura', 'auriculotherapy') AS acupuntura_auriculo,
  NOT public.appointment_type_fits_area('nutricao', 'auriculotherapy') AS nutricao_sem_auriculo,
  public.appointment_type_fits_area('psicologia', 'e_ilib') AS psicologia_eilib,
  public.appointment_type_fits_area('neuropsicologia', 'feedback') AS tipo_geral_em_qualquer_area,
  (SELECT count(*) FROM pg_constraint
   WHERE contype = 'c' AND pg_get_constraintdef(oid) LIKE '%appointment_type%fit%') AS checks_novos;
