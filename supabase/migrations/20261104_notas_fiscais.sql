-- ==========================================================
-- Notas fiscais e comprovante (04/11/2026)
-- REQUER: 20261023_financeiro_etapa1.sql e 20261103_convenios_fase2.sql.
--
-- Escolha da administradora: banco A (nota como documento próprio,
-- ligada ao dinheiro que ela cobre) + tela A (aba "Notas fiscais" com a
-- fila do que falta e os dados prontos para copiar). Caminho A: a nota é
-- emitida fora (Emissor Nacional ou o emissor da prefeitura) e o sistema
-- prepara, guarda o número e mostra o que falta. O banco já fica pronto
-- para o caminho B (o sistema emitir com o certificado A1): issued_via
-- 'emissor_nacional' e a situação são do começo; o B acrescenta colunas.
--
-- Decisões (04/11/2026):
--  * Clínica com CNPJ no Simples, em Catu (BA).
--  * Particular: uma nota por recebimento (o grupo de "Registrar
--    recebimento"), tomador = o paciente (ou o responsável, quando o
--    paciente não tem CPF no cadastro).
--  * Convênio: uma nota por depósito da operadora (convenio_payments),
--    tomador = a operadora (CNPJ).
--  * Competência = data em que o serviço foi prestado (dCompet da NFS-e
--    Nacional; nunca depois da emissão). Recebimento de atendimento: o
--    dia do atendimento mais recente que ele paga; de pacote (pago antes
--    das sessões): o dia do recebimento. Depósito da operadora: o dia do
--    atendimento mais recente que ele paga.
--  * Código do serviço por área (clinic_fiscal_service_codes), que o
--    contador define. Sem código, a nota fica "falta" até preencher.
--  * A nota nasce sozinha (situação "falta emitir") quando o dinheiro
--    entra, e acompanha: recebimento anulado antes da nota cancela a
--    pendência; anulado depois da nota emitida marca "cancelar a nota no
--    emissor" (needs_cancellation), nunca some calado.
--  * Nota registrada não se apaga: cancela com motivo. Cancelada com o
--    dinheiro ainda valendo, volta a pendência para emitir de novo.
--  * Comprovante do recebimento com número em sequência da clínica
--    (finance_receipt_vouchers), dado na primeira impressão.
--
-- Exclusão de paciente: fiscal_documents tem patient_id e fica (documento
-- fiscal, guarda legal), em KEPT_ON_PURPOSE, como a cobrança.
--
-- Reverter: DROP das tabelas novas e das funções fiscal_*/finance_fiscal_*
-- e finance_receipt_voucher, e dos gatilhos trg_finance_receipts_fiscal,
-- trg_convenio_payments_fiscal e trg_tiss_guide_settlements_fiscal.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.finance_receipts') IS NULL OR to_regclass('public.convenio_payments') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261023 e 20261103.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 1. Configuração: onde emite e o código do serviço de cada área
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_fiscal_settings (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  emitter_url TEXT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT clinic_fiscal_settings_url_check CHECK (emitter_url IS NULL OR (emitter_url ~ '^https://\S{4,}$' AND length(emitter_url) <= 300))
);

CREATE TABLE IF NOT EXISTS public.clinic_fiscal_service_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL,
  service_code TEXT NOT NULL,
  service_label TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT clinic_fiscal_service_codes_unique UNIQUE (clinic_id, discipline),
  -- Item da lista (ex.: 04.16) ou código de tributação nacional (6 números).
  CONSTRAINT clinic_fiscal_service_codes_code_check CHECK (service_code ~ '^[0-9][0-9./-]{0,19}$'),
  CONSTRAINT clinic_fiscal_service_codes_label_check CHECK (service_label IS NULL OR length(service_label) <= 150)
);

-- ----------------------------------------------------------
-- 2. Nota fiscal e o que ela cobre
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fiscal_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  taker_kind TEXT NOT NULL,
  patient_id UUID REFERENCES public.patients(id) ON DELETE RESTRICT,
  convenio_id UUID REFERENCES public.clinic_convenios(id) ON DELETE RESTRICT,
  taker_document TEXT,
  taker_name TEXT NOT NULL,
  discipline TEXT,
  service_code TEXT,
  competence_on DATE NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  needs_cancellation BOOLEAN NOT NULL DEFAULT FALSE,
  issued_via TEXT,
  nfse_number TEXT,
  access_key TEXT,
  issued_on DATE,
  issued_by UUID REFERENCES public.profiles(id),
  issued_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id),
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT fiscal_documents_taker_shape CHECK (
    (taker_kind = 'patient' AND patient_id IS NOT NULL AND convenio_id IS NULL)
    OR (taker_kind = 'convenio' AND convenio_id IS NOT NULL AND patient_id IS NULL)
  ),
  CONSTRAINT fiscal_documents_taker_document_check CHECK (
    taker_document IS NULL
    OR taker_document ~ '^[0-9]{11}$'
    OR taker_document ~ '^[A-Z0-9]{12}[0-9]{2}$'
  ),
  CONSTRAINT fiscal_documents_name_check CHECK (length(btrim(taker_name)) BETWEEN 1 AND 150),
  CONSTRAINT fiscal_documents_code_check CHECK (service_code IS NULL OR service_code ~ '^[0-9][0-9./-]{0,19}$'),
  CONSTRAINT fiscal_documents_description_check CHECK (length(btrim(description)) BETWEEN 1 AND 2000),
  CONSTRAINT fiscal_documents_status_check CHECK (status IN ('pending', 'issued', 'cancelled')),
  CONSTRAINT fiscal_documents_via_check CHECK (issued_via IS NULL OR issued_via IN ('manual', 'emissor_nacional')),
  -- Emitida: número, data, jeito de emitir, tomador com documento e código.
  -- Cancelada guarda o número (quando chegou a ser emitida).
  CONSTRAINT fiscal_documents_issued_shape CHECK (
    (status = 'pending' AND nfse_number IS NULL)
    OR status = 'cancelled'
    OR (status = 'issued' AND nfse_number IS NOT NULL AND issued_on IS NOT NULL AND issued_via IS NOT NULL
        AND taker_document IS NOT NULL AND service_code IS NOT NULL)
  ),
  CONSTRAINT fiscal_documents_number_check CHECK (nfse_number IS NULL OR nfse_number ~ '^[0-9]{1,15}$'),
  CONSTRAINT fiscal_documents_key_check CHECK (access_key IS NULL OR access_key ~ '^[0-9]{50}$'),
  -- Competência nunca depois da emissão (regra E0015 da NFS-e Nacional).
  CONSTRAINT fiscal_documents_competence_check CHECK (issued_on IS NULL OR issued_on >= competence_on),
  CONSTRAINT fiscal_documents_cancel_shape CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_fiscal_documents_clinic_status ON public.fiscal_documents (clinic_id, status, competence_on DESC);
CREATE INDEX IF NOT EXISTS idx_fiscal_documents_patient ON public.fiscal_documents (patient_id) WHERE patient_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_documents_number
  ON public.fiscal_documents (clinic_id, nfse_number) WHERE nfse_number IS NOT NULL AND status = 'issued';

CREATE TABLE IF NOT EXISTS public.fiscal_document_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.fiscal_documents(id) ON DELETE RESTRICT,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  receipt_group_id UUID,
  convenio_payment_id UUID REFERENCES public.convenio_payments(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  released_at TIMESTAMPTZ,
  CONSTRAINT fiscal_document_sources_one CHECK (num_nonnulls(receipt_group_id, convenio_payment_id) = 1)
);

-- Cada dinheiro em uma nota valendo por vez.
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_sources_receipt
  ON public.fiscal_document_sources (receipt_group_id) WHERE receipt_group_id IS NOT NULL AND released_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_fiscal_sources_payment
  ON public.fiscal_document_sources (convenio_payment_id) WHERE convenio_payment_id IS NOT NULL AND released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fiscal_sources_document ON public.fiscal_document_sources (document_id);

-- ----------------------------------------------------------
-- 3. Comprovante numerado
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.finance_sequences (
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('voucher')),
  last_value INTEGER NOT NULL DEFAULT 0 CHECK (last_value >= 0),
  CONSTRAINT finance_sequences_pkey PRIMARY KEY (clinic_id, kind)
);

CREATE TABLE IF NOT EXISTS public.finance_receipt_vouchers (
  group_id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number > 0),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT finance_receipt_vouchers_number_unique UNIQUE (clinic_id, number)
);

-- ----------------------------------------------------------
-- 4. RLS: só a administração lê; grava só pelas funções
-- ----------------------------------------------------------
DO $rls$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['clinic_fiscal_settings', 'clinic_fiscal_service_codes', 'fiscal_documents',
                                  'fiscal_document_sources', 'finance_sequences', 'finance_receipt_vouchers'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_admin_read', v_table);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_manage_finance(clinic_id))',
                   v_table || '_admin_read', v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);
  END LOOP;
END;
$rls$;

-- Nota registrada não se apaga.
CREATE OR REPLACE FUNCTION public.fiscal_guard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'nota_nao_se_apaga: nota fiscal não se apaga. Cancele com o motivo.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_documents_no_delete ON public.fiscal_documents;
CREATE TRIGGER trg_fiscal_documents_no_delete BEFORE DELETE ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_guard_delete();
DROP TRIGGER IF EXISTS trg_fiscal_document_sources_no_delete ON public.fiscal_document_sources;
CREATE TRIGGER trg_fiscal_document_sources_no_delete BEFORE DELETE ON public.fiscal_document_sources
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_guard_delete();

-- Nota emitida só muda para ser cancelada (ou marcada para cancelar).
CREATE OR REPLACE FUNCTION public.fiscal_guard_issued()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_free TEXT[] := ARRAY['status', 'needs_cancellation', 'cancelled_at', 'cancelled_by', 'cancel_reason', 'updated_at',
                         'nfse_number', 'access_key', 'issued_on', 'issued_by', 'issued_at', 'issued_via'];
BEGIN
  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'nota_cancelada: nota cancelada não muda mais.' USING ERRCODE = '42501';
  END IF;
  IF OLD.status = 'issued' THEN
    IF NEW.status = 'issued' AND (NEW.nfse_number, NEW.access_key, NEW.issued_on, NEW.issued_via)
       IS DISTINCT FROM (OLD.nfse_number, OLD.access_key, OLD.issued_on, OLD.issued_via) THEN
      RAISE EXCEPTION 'nota_emitida: número e data da nota emitida não mudam. Cancele e registre de novo.' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
      RAISE EXCEPTION 'nota_emitida: nota emitida não muda. Cancele no emissor e registre o cancelamento.' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fiscal_documents_guard ON public.fiscal_documents;
CREATE TRIGGER trg_fiscal_documents_guard BEFORE UPDATE ON public.fiscal_documents
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_guard_issued();

-- ----------------------------------------------------------
-- 5. Ajudantes de texto
-- ----------------------------------------------------------
-- dd/mm/aaaa
CREATE OR REPLACE FUNCTION public.fiscal_day(p_day DATE)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT to_char(p_day, 'DD/MM/YYYY');
$$;

-- Espelho: FINANCE_APPOINTMENT_TYPES e as áreas em utils (labels).
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
    ELSE 'Sessão'
  END;
$$;

CREATE OR REPLACE FUNCTION public.fiscal_area_label(p_discipline TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE p_discipline
    WHEN 'psicologia' THEN 'Psicologia'
    WHEN 'neuropsicologia' THEN 'Neuropsicologia'
    WHEN 'fisioterapia' THEN 'Fisioterapia'
    WHEN 'nutricao' THEN 'Nutrição'
    WHEN 'acupuntura' THEN 'Acupuntura'
    WHEN 'aba' THEN 'ABA'
    ELSE 'Atendimento'
  END;
$$;

-- Profissional com conselho: "Joana Conceição (CRP 06/12345)".
CREATE OR REPLACE FUNCTION public.fiscal_professional_label(p_professional UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.full_name
    || COALESCE(' (' || COALESCE(substring(t.term FROM '\(([^)]+)\)'), 'Conselho') || ' ' || b.council_number || ')', '')
  FROM public.profiles p
  LEFT JOIN public.professional_billing_info b ON b.professional_id = p.id
  LEFT JOIN public.tiss_terms t ON t.table_code = '26' AND t.code = b.council_code
  WHERE p.id = p_professional;
$$;

REVOKE ALL ON FUNCTION public.fiscal_professional_label(UUID) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 6. A nota acompanha o dinheiro
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_sync_receipt_group(p_group UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
  v_first public.finance_receipts%ROWTYPE;
  v_source public.fiscal_document_sources%ROWTYPE;
  v_doc public.fiscal_documents%ROWTYPE;
  v_patient public.patients%ROWTYPE;
  v_competence DATE;
  v_discipline TEXT;
  v_description TEXT;
  v_taker_doc TEXT;
  v_taker_name TEXT;
BEGIN
  SELECT * INTO v_first FROM public.finance_receipts WHERE group_id = p_group ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT COALESCE(sum(amount_cents), 0) INTO v_total
  FROM public.finance_receipts WHERE group_id = p_group AND voided_at IS NULL;

  SELECT * INTO v_source FROM public.fiscal_document_sources
  WHERE receipt_group_id = p_group AND released_at IS NULL FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_doc FROM public.fiscal_documents WHERE id = v_source.document_id FOR UPDATE;
    IF v_doc.status = 'pending' THEN
      IF v_total = 0 THEN
        UPDATE public.fiscal_documents
        SET status = 'cancelled', cancelled_at = timezone('utc', now()), cancel_reason = 'Recebimento anulado antes da nota.'
        WHERE id = v_doc.id;
        UPDATE public.fiscal_document_sources SET released_at = timezone('utc', now()) WHERE id = v_source.id;
      ELSIF v_total <> v_doc.amount_cents THEN
        UPDATE public.fiscal_documents SET amount_cents = v_total WHERE id = v_doc.id;
        UPDATE public.fiscal_document_sources SET amount_cents = v_total WHERE id = v_source.id;
      END IF;
    ELSIF v_doc.status = 'issued' AND v_total <> v_doc.amount_cents AND NOT v_doc.needs_cancellation THEN
      UPDATE public.fiscal_documents SET needs_cancellation = TRUE WHERE id = v_doc.id;
    END IF;
    RETURN;
  END IF;

  IF v_total = 0 THEN
    RETURN;
  END IF;

  -- Nota nova: competência = atendimento mais recente pago; pacote, o dia
  -- do recebimento.
  SELECT max(c.service_on), (array_agg(c.discipline ORDER BY c.service_on))[1]
    INTO v_competence, v_discipline
  FROM public.finance_receipts r
  JOIN public.appointment_charges c ON c.id = r.charge_id
  WHERE r.group_id = p_group AND r.voided_at IS NULL;

  SELECT string_agg(public.fiscal_type_label(c.appointment_type) || ' de ' || public.fiscal_area_label(c.discipline)
           || ' em ' || public.fiscal_day(c.service_on)
           || COALESCE(', ' || public.fiscal_professional_label(c.professional_id), ''), '; ' ORDER BY c.service_on)
    INTO v_description
  FROM (SELECT DISTINCT c.* FROM public.finance_receipts r
        JOIN public.appointment_charges c ON c.id = r.charge_id
        WHERE r.group_id = p_group AND r.voided_at IS NULL) c;

  IF v_discipline IS NULL THEN
    SELECT p.discipline, 'Pacote "' || p.name || '" de ' || public.fiscal_area_label(p.discipline)
      INTO v_discipline, v_description
    FROM public.finance_receipts r JOIN public.patient_packages p ON p.id = r.package_id
    WHERE r.group_id = p_group AND r.voided_at IS NULL
    LIMIT 1;
  END IF;
  v_competence := LEAST(COALESCE(v_competence, v_first.received_on), v_first.received_on);

  SELECT * INTO v_patient FROM public.patients WHERE id = v_first.patient_id;
  -- Tomador: o paciente; sem CPF dele no cadastro, o responsável.
  IF NULLIF(regexp_replace(COALESCE(v_patient.cpf, ''), '\D', '', 'g'), '') IS NULL
     AND NULLIF(regexp_replace(COALESCE(v_patient.responsavel_cpf, ''), '\D', '', 'g'), '') IS NOT NULL THEN
    v_taker_doc := regexp_replace(v_patient.responsavel_cpf, '\D', '', 'g');
    v_taker_name := COALESCE(NULLIF(btrim(v_patient.responsavel_nome), ''), v_patient.name);
    v_description := COALESCE(v_description, 'Atendimento') || '. Paciente: ' || v_patient.name;
  ELSE
    v_taker_doc := NULLIF(regexp_replace(COALESCE(v_patient.cpf, ''), '\D', '', 'g'), '');
    v_taker_name := v_patient.name;
  END IF;
  IF v_taker_doc IS NOT NULL AND v_taker_doc !~ '^[0-9]{11}$' THEN
    v_taker_doc := NULL;
  END IF;

  INSERT INTO public.fiscal_documents (
    clinic_id, taker_kind, patient_id, taker_document, taker_name, discipline, service_code,
    competence_on, amount_cents, description
  ) VALUES (
    v_first.clinic_id, 'patient', v_first.patient_id, v_taker_doc, left(COALESCE(v_taker_name, 'Paciente'), 150), v_discipline,
    (SELECT sc.service_code FROM public.clinic_fiscal_service_codes sc WHERE sc.clinic_id = v_first.clinic_id AND sc.discipline = v_discipline),
    v_competence, v_total, left(COALESCE(v_description, 'Atendimento'), 2000)
  ) RETURNING * INTO v_doc;

  INSERT INTO public.fiscal_document_sources (document_id, clinic_id, receipt_group_id, amount_cents)
  VALUES (v_doc.id, v_first.clinic_id, p_group, v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_sync_receipt_group(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fiscal_sync_convenio_payment(p_payment UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.convenio_payments%ROWTYPE;
  v_conv public.clinic_convenios%ROWTYPE;
  v_source public.fiscal_document_sources%ROWTYPE;
  v_doc public.fiscal_documents%ROWTYPE;
  v_live INTEGER;
  v_competence DATE;
  v_discipline TEXT;
  v_batches TEXT;
  v_count INTEGER;
  v_description TEXT;
BEGIN
  SELECT * INTO v_pay FROM public.convenio_payments WHERE id = p_payment;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_live := CASE WHEN v_pay.voided_at IS NULL THEN v_pay.amount_cents ELSE 0 END;
  SELECT * INTO v_conv FROM public.clinic_convenios WHERE id = v_pay.convenio_id;

  SELECT max(bi.executed_on), (array_agg(c.discipline ORDER BY bi.executed_on))[1],
         string_agg(DISTINCT b.number, ', '), count(DISTINCT s.guide_id)
    INTO v_competence, v_discipline, v_batches, v_count
  FROM public.tiss_guide_settlements s
  JOIN public.tiss_batch_items bi ON bi.id = s.batch_item_id
  JOIN public.tiss_batch_guides bg ON bg.id = bi.batch_guide_id
  JOIN public.tiss_batches b ON b.id = bg.batch_id
  JOIN public.tiss_guide_items gi ON gi.id = bi.item_id
  JOIN public.appointment_charges c ON c.id = gi.charge_id
  WHERE s.payment_id = p_payment AND s.voided_at IS NULL AND s.paid_cents > 0;

  v_description := 'Serviços de saúde prestados a beneficiários de ' || v_conv.name
    || CASE WHEN v_count > 0 THEN ', ' || v_count || CASE WHEN v_count = 1 THEN ' guia' ELSE ' guias' END
         || ' do lote ' || v_batches ELSE '' END
    || ', pagos em ' || public.fiscal_day(v_pay.received_on) || '.';
  v_competence := LEAST(COALESCE(v_competence, v_pay.received_on), v_pay.received_on);

  SELECT * INTO v_source FROM public.fiscal_document_sources
  WHERE convenio_payment_id = p_payment AND released_at IS NULL FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO v_doc FROM public.fiscal_documents WHERE id = v_source.document_id FOR UPDATE;
    IF v_doc.status = 'pending' THEN
      IF v_live = 0 THEN
        UPDATE public.fiscal_documents
        SET status = 'cancelled', cancelled_at = timezone('utc', now()), cancel_reason = 'Depósito da operadora anulado antes da nota.'
        WHERE id = v_doc.id;
        UPDATE public.fiscal_document_sources SET released_at = timezone('utc', now()) WHERE id = v_source.id;
      ELSE
        UPDATE public.fiscal_documents
        SET amount_cents = v_live, competence_on = v_competence, description = v_description,
            discipline = COALESCE(discipline, v_discipline),
            service_code = COALESCE(service_code, (SELECT sc.service_code FROM public.clinic_fiscal_service_codes sc
                                                   WHERE sc.clinic_id = v_pay.clinic_id AND sc.discipline = v_discipline))
        WHERE id = v_doc.id;
        UPDATE public.fiscal_document_sources SET amount_cents = v_live WHERE id = v_source.id;
      END IF;
    ELSIF v_doc.status = 'issued' AND v_live <> v_doc.amount_cents AND NOT v_doc.needs_cancellation THEN
      UPDATE public.fiscal_documents SET needs_cancellation = TRUE WHERE id = v_doc.id;
    END IF;
    RETURN;
  END IF;

  IF v_live = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.fiscal_documents (
    clinic_id, taker_kind, convenio_id, taker_document, taker_name, discipline, service_code,
    competence_on, amount_cents, description
  ) VALUES (
    v_pay.clinic_id, 'convenio', v_pay.convenio_id,
    CASE WHEN v_conv.cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$' THEN v_conv.cnpj END,
    left(v_conv.name, 150), v_discipline,
    (SELECT sc.service_code FROM public.clinic_fiscal_service_codes sc WHERE sc.clinic_id = v_pay.clinic_id AND sc.discipline = v_discipline),
    v_competence, v_live, v_description
  ) RETURNING * INTO v_doc;

  INSERT INTO public.fiscal_document_sources (document_id, clinic_id, convenio_payment_id, amount_cents)
  VALUES (v_doc.id, v_pay.clinic_id, p_payment, v_live);
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_sync_convenio_payment(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fiscal_on_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fiscal_sync_receipt_group(NEW.group_id);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fiscal_on_convenio_payment()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fiscal_sync_convenio_payment(NEW.id);
  RETURN NULL;
END;
$$;

-- Os acertos entram depois do depósito (finance_tiss_register_payment):
-- a nota pendente ganha a competência, a área e a descrição certas.
CREATE OR REPLACE FUNCTION public.fiscal_on_settlement()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_id IS NOT NULL THEN
    PERFORM public.fiscal_sync_convenio_payment(NEW.payment_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_on_receipt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiscal_on_convenio_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fiscal_on_settlement() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_finance_receipts_fiscal ON public.finance_receipts;
CREATE TRIGGER trg_finance_receipts_fiscal
  AFTER INSERT OR UPDATE OF voided_at ON public.finance_receipts
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_on_receipt();

DROP TRIGGER IF EXISTS trg_convenio_payments_fiscal ON public.convenio_payments;
CREATE TRIGGER trg_convenio_payments_fiscal
  AFTER INSERT OR UPDATE OF voided_at ON public.convenio_payments
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_on_convenio_payment();

DROP TRIGGER IF EXISTS trg_tiss_guide_settlements_fiscal ON public.tiss_guide_settlements;
CREATE TRIGGER trg_tiss_guide_settlements_fiscal
  AFTER INSERT ON public.tiss_guide_settlements
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_on_settlement();

-- O dinheiro que já existia ganha a pendência.
DO $backfill$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT DISTINCT group_id FROM public.finance_receipts WHERE voided_at IS NULL LOOP
    PERFORM public.fiscal_sync_receipt_group(v_id);
  END LOOP;
  FOR v_id IN SELECT id FROM public.convenio_payments WHERE voided_at IS NULL LOOP
    PERFORM public.fiscal_sync_convenio_payment(v_id);
  END LOOP;
END;
$backfill$;

-- ----------------------------------------------------------
-- 7. O que falta numa nota para emitir
-- Espelho: fiscalMissing em utils/fiscal.js (mesmas chaves).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_missing(p_doc public.fiscal_documents)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN p_doc.taker_document IS NULL THEN 'documento_tomador' END,
    CASE WHEN p_doc.service_code IS NULL THEN 'codigo_servico' END
  ], NULL);
$$;

GRANT EXECUTE ON FUNCTION public.fiscal_missing(public.fiscal_documents) TO authenticated;

-- ----------------------------------------------------------
-- 8. Funções da tela (todas conferem a administração)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finance_fiscal_save_settings(p_emitter_url TEXT, p_codes JSONB)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_row JSONB;
  v_count INTEGER := 0;
BEGIN
  INSERT INTO public.clinic_fiscal_settings AS s (clinic_id, emitter_url, updated_by)
  VALUES (v_clinic, NULLIF(btrim(COALESCE(p_emitter_url, '')), ''), auth.uid())
  ON CONFLICT ON CONSTRAINT clinic_fiscal_settings_pkey DO UPDATE
  SET emitter_url = EXCLUDED.emitter_url, updated_by = auth.uid(), updated_at = timezone('utc', now());

  IF jsonb_typeof(COALESCE(p_codes, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Códigos em formato errado.' USING ERRCODE = '22023';
  END IF;
  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_codes, '[]'::JSONB)) LOOP
    IF NULLIF(btrim(v_row->>'service_code'), '') IS NULL THEN
      DELETE FROM public.clinic_fiscal_service_codes WHERE clinic_id = v_clinic AND discipline = v_row->>'discipline';
      CONTINUE;
    END IF;
    INSERT INTO public.clinic_fiscal_service_codes AS sc (clinic_id, discipline, service_code, service_label)
    VALUES (v_clinic, v_row->>'discipline', btrim(v_row->>'service_code'), NULLIF(btrim(COALESCE(v_row->>'service_label', '')), ''))
    ON CONFLICT ON CONSTRAINT clinic_fiscal_service_codes_unique DO UPDATE
    SET service_code = EXCLUDED.service_code, service_label = EXCLUDED.service_label, updated_at = timezone('utc', now());
    -- Nota ainda sem código daquela área ganha o código agora.
    UPDATE public.fiscal_documents
    SET service_code = btrim(v_row->>'service_code')
    WHERE clinic_id = v_clinic AND status = 'pending' AND service_code IS NULL AND discipline = v_row->>'discipline';
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_fiscal_save_settings(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_fiscal_save_settings(TEXT, JSONB) TO authenticated;

-- Campos da nota pendente que a administração ajusta antes de emitir.
CREATE OR REPLACE FUNCTION public.finance_fiscal_save_document(p_doc UUID, p_fields JSONB)
RETURNS public.fiscal_documents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_doc public.fiscal_documents%ROWTYPE;
  v_taker TEXT;
BEGIN
  SELECT * INTO v_doc FROM public.fiscal_documents WHERE id = p_doc AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.status <> 'pending' THEN
    RAISE EXCEPTION 'nota_emitida: só a nota que falta emitir muda.' USING ERRCODE = '42501';
  END IF;
  IF p_fields ? 'taker_document' THEN
    v_taker := upper(regexp_replace(COALESCE(p_fields->>'taker_document', ''), '[^0-9A-Za-z]', '', 'g'));
  END IF;
  IF p_fields ? 'competence_on' AND (p_fields->>'competence_on')::DATE > public.finance_today() THEN
    RAISE EXCEPTION 'A competência é o dia do atendimento, hoje ou antes.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fiscal_documents d SET
    taker_document = CASE WHEN p_fields ? 'taker_document' THEN NULLIF(v_taker, '') ELSE d.taker_document END,
    taker_name = CASE WHEN p_fields ? 'taker_name' THEN btrim(p_fields->>'taker_name') ELSE d.taker_name END,
    service_code = CASE WHEN p_fields ? 'service_code' THEN NULLIF(btrim(p_fields->>'service_code'), '') ELSE d.service_code END,
    description = CASE WHEN p_fields ? 'description' THEN btrim(p_fields->>'description') ELSE d.description END,
    competence_on = CASE WHEN p_fields ? 'competence_on' THEN (p_fields->>'competence_on')::DATE ELSE d.competence_on END
  WHERE d.id = p_doc
  RETURNING * INTO v_doc;
  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_fiscal_save_document(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_fiscal_save_document(UUID, JSONB) TO authenticated;

-- Emitiu no emissor: guarda o número.
CREATE OR REPLACE FUNCTION public.finance_fiscal_register_issued(
  p_doc UUID,
  p_number TEXT,
  p_issued_on DATE,
  p_access_key TEXT DEFAULT NULL
)
RETURNS public.fiscal_documents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_doc public.fiscal_documents%ROWTYPE;
  v_number TEXT := regexp_replace(COALESCE(p_number, ''), '\D', '', 'g');
  v_key TEXT := NULLIF(regexp_replace(COALESCE(p_access_key, ''), '\D', '', 'g'), '');
BEGIN
  SELECT * INTO v_doc FROM public.fiscal_documents WHERE id = p_doc AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.status <> 'pending' THEN
    RAISE EXCEPTION 'nota_emitida: esta nota já foi registrada ou cancelada.' USING ERRCODE = '22023';
  END IF;
  IF cardinality(public.fiscal_missing(v_doc)) > 0 THEN
    RAISE EXCEPTION 'nota_incompleta: falta % antes de registrar.',
      array_to_string(public.fiscal_missing(v_doc), ', ') USING ERRCODE = '22023';
  END IF;
  IF v_number !~ '^[0-9]{1,15}$' THEN
    RAISE EXCEPTION 'Número da nota: só números, até 15.' USING ERRCODE = '22023';
  END IF;
  IF v_key IS NOT NULL AND v_key !~ '^[0-9]{50}$' THEN
    RAISE EXCEPTION 'A chave de acesso tem 50 números.' USING ERRCODE = '22023';
  END IF;
  IF p_issued_on IS NULL OR p_issued_on > public.finance_today() OR p_issued_on < v_doc.competence_on THEN
    RAISE EXCEPTION 'nota_data: a data da emissão fica entre a competência (%) e hoje.', public.fiscal_day(v_doc.competence_on)
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_documents d
             WHERE d.clinic_id = v_clinic AND d.status = 'issued' AND d.nfse_number = v_number) THEN
    RAISE EXCEPTION 'nota_repetida: já existe nota registrada com o número %.', v_number USING ERRCODE = '23505';
  END IF;

  UPDATE public.fiscal_documents
  SET status = 'issued', nfse_number = v_number, access_key = v_key, issued_on = p_issued_on,
      issued_via = 'manual', issued_by = auth.uid(), issued_at = timezone('utc', now())
  WHERE id = p_doc
  RETURNING * INTO v_doc;
  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_fiscal_register_issued(UUID, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_fiscal_register_issued(UUID, TEXT, DATE, TEXT) TO authenticated;

-- Cancelou no emissor: registra aqui. Com o dinheiro ainda valendo, volta
-- a pendência para emitir de novo.
CREATE OR REPLACE FUNCTION public.finance_fiscal_cancel(p_doc UUID, p_reason TEXT)
RETURNS public.fiscal_documents
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_doc public.fiscal_documents%ROWTYPE;
  v_source public.fiscal_document_sources%ROWTYPE;
BEGIN
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Diga o motivo do cancelamento.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_doc FROM public.fiscal_documents WHERE id = p_doc AND clinic_id = v_clinic FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nota não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  IF v_doc.status <> 'issued' THEN
    RAISE EXCEPTION 'Só nota emitida se cancela aqui (a que falta emitir acompanha o recebimento sozinha).' USING ERRCODE = '22023';
  END IF;

  UPDATE public.fiscal_documents
  SET status = 'cancelled', needs_cancellation = FALSE, cancelled_at = timezone('utc', now()),
      cancelled_by = auth.uid(), cancel_reason = btrim(p_reason)
  WHERE id = p_doc;

  FOR v_source IN
    UPDATE public.fiscal_document_sources SET released_at = timezone('utc', now())
    WHERE document_id = p_doc AND released_at IS NULL
    RETURNING *
  LOOP
    IF v_source.receipt_group_id IS NOT NULL THEN
      PERFORM public.fiscal_sync_receipt_group(v_source.receipt_group_id);
    ELSE
      PERFORM public.fiscal_sync_convenio_payment(v_source.convenio_payment_id);
    END IF;
  END LOOP;

  SELECT * INTO v_doc FROM public.fiscal_documents WHERE id = p_doc;
  RETURN v_doc;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_fiscal_cancel(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_fiscal_cancel(UUID, TEXT) TO authenticated;

-- Número do comprovante: dado na primeira impressão, nunca muda.
CREATE OR REPLACE FUNCTION public.finance_receipt_voucher(p_group UUID)
RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic UUID := public.finance_require_admin();
  v_number INTEGER;
BEGIN
  SELECT number INTO v_number FROM public.finance_receipt_vouchers WHERE group_id = p_group AND clinic_id = v_clinic;
  IF FOUND THEN
    RETURN v_number;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.finance_receipts r
                 WHERE r.group_id = p_group AND r.clinic_id = v_clinic AND r.voided_at IS NULL) THEN
    RAISE EXCEPTION 'Recebimento não encontrado (ou anulado).' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO public.finance_sequences AS s (clinic_id, kind, last_value)
  VALUES (v_clinic, 'voucher', 1)
  ON CONFLICT ON CONSTRAINT finance_sequences_pkey DO UPDATE SET last_value = s.last_value + 1
  RETURNING s.last_value INTO v_number;
  INSERT INTO public.finance_receipt_vouchers (group_id, clinic_id, number, created_by)
  VALUES (p_group, v_clinic, v_number, auth.uid());
  RETURN v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_receipt_voucher(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_receipt_voucher(UUID) TO authenticated;
