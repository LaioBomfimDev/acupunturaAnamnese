-- ==========================================================
-- Evolução vinculada ao atendimento real (data/hora do agendamento,
-- não a data em que o profissional digitou o texto)
--
-- Por que uma tabela nova em vez de continuar no JSON de
-- clinical_records: o profissional muitas vezes escreve a evolução
-- horas ou dias depois do atendimento (à noite, no dia seguinte). O
-- campo livre de data que existe hoje aceita qualquer coisa digitada,
-- sem vínculo com o agendamento — numa fiscalização, uma data errada
-- (ou simplesmente esquecida no "hoje" padrão) parece adulteração.
--
-- O que esta migração garante, no servidor, não só no app:
--   * atendimento_em vem do agendamento (appointments.starts_at) e é
--     sobrescrita incondicionalmente pelo trigger — o cliente não
--     consegue mandar outra data quando appointment_id é informado.
--   * registrado_em é o instante real de gravação (clock_timestamp()
--     do servidor), também forçado por trigger — nunca o relógio do
--     navegador. É auditoria interna; nenhuma tela de impressão lê
--     esta coluna.
--   * Depois de inserida, nem atendimento_em nem registrado_em podem
--     ser alterados — só o conteúdo (correção de texto).
--   * Falta (no_show) e falta justificada (excused) também liberam o
--     registro — a evolução fica marcada como falta, não como sessão
--     normal, a pedido da administradora da clínica: até faltas
--     contam na evolução do paciente.
--
-- Reaproveita infraestrutura já existente, não duplica:
--   * get_clinical_encryption_key() e o padrão pgp_sym_encrypt de
--     clinical_records (20260723_clinical_data_hardening.sql).
--   * clinical_record_audit_log — mesma tabela imutável já usada para
--     auditoria de clinical_records — em vez de um log paralelo.
--   * can_access_clinical_data / is_clinic_admin / is_super_admin /
--     user_clinic_id — helpers de RLS já existentes.
--
-- Lição dos dois incidentes de segurança já documentados neste
-- projeto (20260812_fix_shared_session_isolation.sql e
-- 20260818_record_share_target_professional.sql): checagem de
-- clinic_id sempre explícita nesta migração, nunca herdada de outra
-- tabela; nenhuma concessão de acesso por "disciplina inteira" — só
-- ao próprio autor ou a admin da mesma clínica.
-- ==========================================================

-- ----------------------------------------------------------
-- Tabela
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_evolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nunca vem do payload do cliente: o trigger deriva de patients.clinic_id.
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  -- Sempre auth.uid(), forçado pelo trigger — nunca aceito do cliente.
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),

  -- NULL = atendimento avulso (sem agendamento prévio na Agenda).
  -- ON DELETE RESTRICT: um agendamento com evolução registrada não pode
  -- ser apagado (o fluxo normal já é cancelar, nunca apagar agendamento).
  appointment_id UUID NULL REFERENCES public.appointments(id) ON DELETE RESTRICT,

  -- 'attended' | 'no_show' | 'excused'. Espelha appointments.status no
  -- momento do registro; para avulso é sempre 'attended' (não há o que
  -- "faltar" sem agendamento). Forçado pelo trigger, imutável depois.
  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('attended', 'no_show', 'excused')),

  -- Data/hora CLÍNICA do atendimento. Sobrescrita incondicionalmente a
  -- partir de appointments.starts_at quando appointment_id != NULL.
  atendimento_em TIMESTAMPTZ NOT NULL,

  -- Conteúdo da evolução (JSON serializado, mesmo espírito do p_data de
  -- clinical_records), cifrado com a mesma chave do Vault.
  conteudo_encrypted BYTEA NOT NULL,

  -- Auditoria interna: instante real de gravação no servidor. Nunca
  -- exibido em relatório/impressão — só em log de auditoria para
  -- admin/superadmin (reaproveita clinical_record_audit_log).
  registrado_em TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),

  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON COLUMN public.patient_evolutions.atendimento_em IS
  'Data/hora clínica do atendimento (do agendamento, quando vinculado). É o que aparece em relatório/impressão.';
COMMENT ON COLUMN public.patient_evolutions.registrado_em IS
  'Instante real de gravação no servidor. Auditoria interna apenas — nunca exibir em documento impresso.';

-- Um agendamento tem no máximo uma evolução; correção é UPDATE de
-- conteúdo, não um segundo INSERT para o mesmo atendimento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_patient_evolutions_appointment_unique
  ON public.patient_evolutions(appointment_id) WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_patient_evolutions_patient
  ON public.patient_evolutions(patient_id, atendimento_em DESC);
CREATE INDEX IF NOT EXISTS idx_patient_evolutions_therapist
  ON public.patient_evolutions(therapist_id);
CREATE INDEX IF NOT EXISTS idx_patient_evolutions_clinic
  ON public.patient_evolutions(clinic_id);

-- ----------------------------------------------------------
-- Trigger BEFORE INSERT: deriva e trava clinic_id, therapist_id,
-- created_by, registrado_em, atendimento_em e attendance_status a
-- partir do servidor/agendamento — nunca do payload do cliente.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_patient_evolution_insert_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $set_patient_evolution_insert_defaults$
DECLARE
  v_appointment RECORD;
  v_patient_clinic UUID;
BEGIN
  NEW.registrado_em := pg_catalog.clock_timestamp();
  NEW.created_at := pg_catalog.clock_timestamp();
  NEW.updated_at := pg_catalog.clock_timestamp();
  NEW.created_by := auth.uid();
  -- Nunca confiar em therapist_id vindo do cliente: sempre quem está logado.
  NEW.therapist_id := auth.uid();

  SELECT p.clinic_id INTO v_patient_clinic
  FROM public.patients p
  WHERE p.id = NEW.patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_patient_clinic IS NULL THEN
    RAISE EXCEPTION 'Paciente sem instituição vinculada; não é possível registrar evolução.'
      USING ERRCODE = '22023';
  END IF;

  NEW.clinic_id := v_patient_clinic;

  IF NEW.appointment_id IS NOT NULL THEN
    SELECT a.patient_id, a.clinic_id, a.professional_id, a.starts_at, a.status
    INTO v_appointment
    FROM public.appointments a
    WHERE a.id = NEW.appointment_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = 'P0002';
    END IF;

    IF v_appointment.patient_id IS DISTINCT FROM NEW.patient_id
       OR v_appointment.clinic_id IS DISTINCT FROM NEW.clinic_id THEN
      RAISE EXCEPTION
        'Agendamento não corresponde ao paciente ou à instituição informados.'
        USING ERRCODE = '42501';
    END IF;

    IF v_appointment.professional_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION
        'Acesso negado: agendamento pertence a outro profissional.'
        USING ERRCODE = '42501';
    END IF;

    IF v_appointment.status NOT IN ('attended', 'no_show', 'excused') THEN
      RAISE EXCEPTION
        'Só é possível registrar evolução para um agendamento concluído (atendido, falta ou falta justificada).'
        USING ERRCODE = '22023';
    END IF;

    -- Sobrescrita incondicional: a data clínica vem do agendamento,
    -- nunca do que o cliente mandou no payload.
    NEW.atendimento_em := v_appointment.starts_at;
    NEW.attendance_status := v_appointment.status;
  ELSE
    -- Avulso: sem agendamento para conferir, a data é a informada pelo
    -- profissional — mas não pode ser no futuro nem vir vazia.
    IF NEW.atendimento_em IS NULL THEN
      RAISE EXCEPTION 'Data do atendimento é obrigatória para registro avulso.'
        USING ERRCODE = '22023';
    END IF;
    IF NEW.atendimento_em > pg_catalog.clock_timestamp() THEN
      RAISE EXCEPTION 'Data do atendimento não pode ser no futuro.'
        USING ERRCODE = '22023';
    END IF;
    NEW.attendance_status := 'attended';
  END IF;

  RETURN NEW;
END;
$set_patient_evolution_insert_defaults$;

DROP TRIGGER IF EXISTS trg_patient_evolutions_insert_defaults ON public.patient_evolutions;
CREATE TRIGGER trg_patient_evolutions_insert_defaults
  BEFORE INSERT ON public.patient_evolutions
  FOR EACH ROW EXECUTE FUNCTION public.set_patient_evolution_insert_defaults();

-- ----------------------------------------------------------
-- Trigger BEFORE UPDATE: trava as colunas que provam "quando" — só o
-- conteúdo (correção de texto) pode mudar depois de gravado.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reject_evolution_date_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $reject_evolution_date_mutation$
BEGIN
  IF NEW.atendimento_em IS DISTINCT FROM OLD.atendimento_em
     OR NEW.registrado_em IS DISTINCT FROM OLD.registrado_em
     OR NEW.attendance_status IS DISTINCT FROM OLD.attendance_status
     OR NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.therapist_id IS DISTINCT FROM OLD.therapist_id
     OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.discipline IS DISTINCT FROM OLD.discipline
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION
      'Evolução imutável: data do atendimento, registro e vínculo não podem ser alterados. Só o conteúdo pode ser corrigido.'
      USING ERRCODE = '55000';
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$reject_evolution_date_mutation$;

DROP TRIGGER IF EXISTS trg_patient_evolutions_reject_date_mutation ON public.patient_evolutions;
CREATE TRIGGER trg_patient_evolutions_reject_date_mutation
  BEFORE UPDATE ON public.patient_evolutions
  FOR EACH ROW EXECUTE FUNCTION public.reject_evolution_date_mutation();

-- ----------------------------------------------------------
-- Trigger AFTER INSERT/UPDATE: reaproveita clinical_record_audit_log
-- (já imutável — 20260723_clinical_data_hardening.sql) em vez de criar
-- uma segunda infraestrutura de auditoria.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_patient_evolution_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $audit_patient_evolution_change$
BEGIN
  INSERT INTO public.clinical_record_audit_log (
    record_id,
    patient_id,
    therapist_id,
    actor_id,
    operation,
    record_type,
    discipline,
    ciphertext_sha256
  )
  VALUES (
    NEW.id,
    NEW.patient_id,
    NEW.therapist_id,
    auth.uid(),
    pg_catalog.lower(TG_OP),
    'patient_evolution',
    NEW.discipline,
    pg_catalog.encode(extensions.digest(NEW.conteudo_encrypted, 'sha256'), 'hex')
  );

  RETURN NEW;
END;
$audit_patient_evolution_change$;

DROP TRIGGER IF EXISTS trg_patient_evolutions_audit_change ON public.patient_evolutions;
CREATE TRIGGER trg_patient_evolutions_audit_change
  AFTER INSERT OR UPDATE ON public.patient_evolutions
  FOR EACH ROW EXECUTE FUNCTION public.audit_patient_evolution_change();

REVOKE ALL ON FUNCTION public.set_patient_evolution_insert_defaults() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_evolution_date_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_patient_evolution_change() FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- RLS — igual em espírito a clinical_records (escrita só via RPC
-- SECURITY DEFINER), mas com policy de SELECT real: a view de
-- pendências abaixo depende do RLS do usuário chamador para não gerar
-- falso positivo (ver comentário na view).
-- ----------------------------------------------------------
ALTER TABLE public.patient_evolutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_evolutions_select ON public.patient_evolutions;
CREATE POLICY patient_evolutions_select ON public.patient_evolutions
  FOR SELECT TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND (
      therapist_id = auth.uid()
      OR (
        (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
        AND clinic_id = public.user_clinic_id(auth.uid())
      )
    )
  );

-- Sem policies de INSERT/UPDATE/DELETE: escrita só pelas RPCs abaixo
-- (SECURITY DEFINER, bypassam RLS) — mesmo padrão de clinical_records.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.patient_evolutions FROM authenticated;
REVOKE ALL ON TABLE public.patient_evolutions FROM anon;
GRANT SELECT ON TABLE public.patient_evolutions TO authenticated;

-- ----------------------------------------------------------
-- View: atendimentos concluídos (atendido/faltou/falta justificada)
-- que ainda não têm evolução registrada.
--
-- security_invoker = true, mesmo padrão de patients_awaiting_return
-- (20260901_patients_awaiting_return.sql) — MAS com uma diferença
-- deliberada: aqui o filtro é por profissional, não por clínica
-- inteira. appointments_select libera a agenda inteira da clínica
-- pra qualquer profissional ativo (é assim de propósito — recepção
-- marca pra todo mundo), mas a policy de SELECT de patient_evolutions
-- é restrita ao autor/admin. Se esta view fosse clínica-inteira como
-- patients_awaiting_return, o profissional B enxergaria como
-- "pendente" um atendimento do profissional A mesmo depois de A já
-- ter escrito a evolução, porque o NOT EXISTS não veria a linha de A
-- (RLS esconde). Por isso o filtro por auth.uid() aqui é necessário,
-- não só um refinamento de UX.
-- ----------------------------------------------------------
CREATE OR REPLACE VIEW public.appointments_awaiting_evolution
WITH (security_invoker = true) AS
SELECT
  a.id AS appointment_id,
  a.clinic_id,
  a.patient_id,
  p.name AS patient_name,
  a.professional_id,
  a.discipline,
  a.starts_at,
  a.status AS attendance_status
FROM public.appointments a
JOIN public.patients p ON p.id = a.patient_id
WHERE a.kind = 'appointment'
  AND a.status IN ('attended', 'no_show', 'excused')
  AND (
    a.professional_id = auth.uid()
    OR public.is_clinic_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.patient_evolutions pe
    WHERE pe.appointment_id = a.id
  );

REVOKE ALL ON public.appointments_awaiting_evolution FROM anon;
GRANT SELECT ON public.appointments_awaiting_evolution TO authenticated;

-- ----------------------------------------------------------
-- RPCs — mesmo estilo de insert_clinical_record/get_clinical_records/
-- update_clinical_record (20260723_clinical_data_hardening.sql).
-- ----------------------------------------------------------

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
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']::TEXT[]
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

CREATE OR REPLACE FUNCTION public.update_patient_evolution(
  p_evolution_id UUID,
  p_data TEXT
)
RETURNS TABLE (id UUID, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $update_patient_evolution$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR pg_catalog.btrim(p_data) = '' THEN
    RAISE EXCEPTION 'Conteúdo da evolução é obrigatório.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_evolutions pe
  SET conteudo_encrypted = extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key())
  WHERE pe.id = p_evolution_id
    AND pe.therapist_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Acesso negado: evolução não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT pe.id, pe.updated_at FROM public.patient_evolutions pe WHERE pe.id = p_evolution_id;
END;
$update_patient_evolution$;

CREATE OR REPLACE FUNCTION public.list_patient_evolutions(
  p_patient_id UUID,
  p_discipline TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  discipline TEXT,
  appointment_id UUID,
  attendance_status TEXT,
  atendimento_em TIMESTAMPTZ,
  conteudo TEXT,
  registrado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_evolutions$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients p
    WHERE p.id = p_patient_id AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    pe.id,
    pe.discipline,
    pe.appointment_id,
    pe.attendance_status,
    pe.atendimento_em,
    extensions.pgp_sym_decrypt(pe.conteudo_encrypted, v_key)::TEXT,
    pe.registrado_em,
    pe.created_at,
    pe.updated_at
  FROM public.patient_evolutions pe
  WHERE pe.patient_id = p_patient_id
    AND pe.therapist_id = v_uid
    AND (p_discipline IS NULL OR pe.discipline = p_discipline)
  ORDER BY pe.atendimento_em ASC, pe.created_at ASC;
END;
$list_patient_evolutions$;

REVOKE ALL ON FUNCTION public.insert_patient_evolution(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_patient_evolution(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_patient_evolutions(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.insert_patient_evolution(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patient_evolution(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_patient_evolutions(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.patient_evolutions') IS NOT NULL AS tabela_criada,
  EXISTS (
    SELECT 1 FROM information_schema.views
    WHERE table_schema = 'public' AND table_name = 'appointments_awaiting_evolution'
  ) AS view_criada,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'patient_evolutions') AS politicas_rls,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_patient_evolutions_reject_date_mutation'
      AND tgrelid = 'public.patient_evolutions'::regclass
      AND NOT tgisinternal
  ) AS trigger_imutabilidade_criado,
  to_regprocedure('public.insert_patient_evolution(uuid,text,text,uuid,timestamptz)') IS NOT NULL AS rpc_insert_criada,
  to_regprocedure('public.list_patient_evolutions(uuid,text)') IS NOT NULL AS rpc_list_criada;
