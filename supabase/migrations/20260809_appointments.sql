-- ==========================================================
-- Agenda / agendamentos (fundação do ERP clínico)
-- REQUER: 20260612_clinics e 20260708_clinic_patients_enrollments
-- aplicadas antes (reafirmadas por idempotência abaixo).
--
-- Por que esta tabela vem antes do dashboard: cinco dos sete gráficos
-- planejados (status de agendamento, gráfico semanal, períodos do dia,
-- filtros temporais e pacientes por mês) são derivados de agendamento.
-- Sem esta tabela não existe BI, só tela bonita sem número.
--
-- O que NÃO entra aqui, de propósito:
--  * convênios — o painel de ranking por convênio precisa de tabela
--    própria (nome, vigência, valor por procedimento). Um TEXT solto
--    agora viraria FK remendada depois; entra na migration do módulo.
--  * financeiro e estoque — módulos próprios, cada um com o seu escopo.
--
-- Migração ADITIVA: não altera nem lê prontuário. Agendamento é dado
-- administrativo (quem, quando, com quem), não registro clínico.
-- ==========================================================

-- Idempotência com as fases anteriores.
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- btree_gist habilita comparar UUID (=) junto com intervalo (&&) na
-- mesma constraint de exclusão. Sem ela o guarda de sobreposição
-- abaixo não pode existir.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ----------------------------------------------------------
-- Quem pode mexer na agenda: membro ATIVO da própria instituição.
-- Agenda é operação de recepção, então não se restringe ao dono do
-- prontuário — a recepcionista marca para qualquer profissional da
-- casa. O corte continua sendo a instituição.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_agenda(p_clinic UUID, p_user UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_clinic IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user
      AND p.clinic_id = p_clinic
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$$;

REVOKE EXECUTE ON FUNCTION public.can_manage_agenda(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_manage_agenda(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------
-- appointments
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,

  -- Os seis estados espelham o sistema de referência da clínica, para
  -- que o indicador de agendamento do dashboard saia direto de um
  -- GROUP BY, sem tradução no meio.
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'ready', 'attended', 'cancelled', 'no_show', 'excused')),

  -- Observação de recepção (sala, encaixe, retorno). NÃO é campo
  -- clínico: prontuário continua criptografado na sua própria tabela.
  note TEXT,
  cancellation_reason TEXT,

  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT appointments_period_valid CHECK (ends_at > starts_at)
);

-- Dupla marcação é o bug número um de agenda. O banco recusa em vez de
-- confiar na validação da tela. Cancelado e falta liberam o horário —
-- se não liberassem, remarcar no mesmo slot seria impossível.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status NOT IN ('cancelled', 'no_show', 'excused'));

-- A consulta que a tela mais faz: agenda da instituição num intervalo.
CREATE INDEX IF NOT EXISTS idx_appointments_clinic_start ON public.appointments(clinic_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_professional_start ON public.appointments(professional_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(clinic_id, status);

-- ----------------------------------------------------------
-- updated_at automático
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_appointment_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_updated_at();

-- ----------------------------------------------------------
-- Preenche clinic_id e created_by a partir de quem está inserindo,
-- para a tela não precisar (nem poder) escolher a instituição.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_appointment_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    NEW.clinic_id := public.user_clinic_id(auth.uid());
  END IF;
  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_defaults ON public.appointments;
CREATE TRIGGER trg_appointments_defaults
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_appointment_defaults();

-- ----------------------------------------------------------
-- RLS — o corte é a instituição
-- ----------------------------------------------------------
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON public.appointments;
CREATE POLICY appointments_select ON public.appointments
  FOR SELECT TO authenticated
  USING (
    public.can_manage_agenda(clinic_id)
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    -- O paciente e o profissional têm que ser da MESMA instituição:
    -- sem isso dava para agendar paciente de outra casa.
    AND EXISTS (
      SELECT 1 FROM public.patients pa
      WHERE pa.id = patient_id AND pa.clinic_id = clinic_id
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = professional_id AND pr.clinic_id = clinic_id
    )
  );

DROP POLICY IF EXISTS appointments_update ON public.appointments;
CREATE POLICY appointments_update ON public.appointments
  FOR UPDATE TO authenticated
  USING (public.can_manage_agenda(clinic_id))
  WITH CHECK (public.can_manage_agenda(clinic_id));

-- Apagar agendamento apaga histórico que o BI precisa. Só o Adm da
-- instituição pode; o fluxo normal é mudar o status para 'cancelled'.
DROP POLICY IF EXISTS appointments_delete ON public.appointments;
CREATE POLICY appointments_delete ON public.appointments
  FOR DELETE TO authenticated
  USING (
    public.can_manage_agenda(clinic_id)
    AND (public.is_clinic_admin() OR public.is_super_admin())
  );

REVOKE ALL ON public.appointments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.appointments TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.appointments') IS NOT NULL AS tabela_criada,
  to_regprocedure('public.can_manage_agenda(uuid,uuid)') IS NOT NULL AS helper_criado,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_overlap'
  ) AS guarda_sobreposicao_ativa,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'appointments') AS politicas_rls;
