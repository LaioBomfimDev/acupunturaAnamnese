-- ==========================================================
-- Agenda: operação da clínica (jornada, bloqueios, exceções)
-- REQUER: 20260809_appointments aplicada antes.
--
-- DECISÃO QUE GOVERNA ESTA MIGRAÇÃO (docs/plano-agenda-gestao-clinica.md §6.1):
-- a clínica é FLEXÍVEL com horário. Pode atender em feriado, no sábado,
-- dentro do almoço, fora da jornada cadastrada. O sistema não impede —
-- avisa que é fora do padrão, exige confirmação dupla na tela e GRAVA a
-- exceção (is_exception / exception_reason) para o BI não mentir depois.
--
-- Por isso a jornada aqui define o que é "dentro do normal", e não o que
-- é permitido. Quem barra continua sendo uma coisa só: dois pacientes no
-- mesmo horário do mesmo profissional — isso é bug, não escolha, e segue
-- recusado pelo banco.
--
-- Migração ADITIVA: não altera nem lê prontuário.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. Colunas de operação em appointments
-- ----------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'appointment',
  ADD COLUMN IF NOT EXISTS appointment_type TEXT,
  ADD COLUMN IF NOT EXISTS room TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recurrence_group_id UUID,
  ADD COLUMN IF NOT EXISTS is_exception BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS exception_reason TEXT;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_kind_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_kind_check
  CHECK (kind IN ('appointment', 'block'));

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_type_check
  CHECK (appointment_type IS NULL OR appointment_type IN ('first_visit', 'return', 'evaluation'));

-- Bloqueio (almoço, reunião, férias) não tem paciente nem disciplina.
-- Atendimento tem os dois, obrigatoriamente.
ALTER TABLE public.appointments ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE public.appointments ALTER COLUMN discipline DROP NOT NULL;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_kind_shape;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_kind_shape CHECK (
  (kind = 'appointment' AND patient_id IS NOT NULL AND discipline IS NOT NULL)
  OR
  (kind = 'block' AND patient_id IS NULL)
);

-- Exceção declarada precisa dizer o motivo: "fora do normal" sem texto
-- não ajuda ninguém a auditar a agenda depois.
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_exception_reason;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_exception_reason
  CHECK (is_exception IS FALSE OR NULLIF(TRIM(COALESCE(exception_reason, '')), '') IS NOT NULL);

-- ----------------------------------------------------------
-- 2. A guarda de sobreposição passa a valer só para atendimento
--
-- Bloqueio deixa de ser parede e vira informação: a tela avisa e pede
-- confirmação dupla, mas quem decide é a clínica. Se o bloqueio entrasse
-- na constraint, marcar um encaixe no almoço seria impossível — que é
-- exatamente o oposto do combinado.
-- ----------------------------------------------------------
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_no_overlap;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_overlap
  EXCLUDE USING gist (
    professional_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (kind = 'appointment' AND status NOT IN ('cancelled', 'no_show', 'excused'));

CREATE INDEX IF NOT EXISTS idx_appointments_recurrence
  ON public.appointments(recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

-- ----------------------------------------------------------
-- 3. RLS de INSERT: aceitar bloqueio (sem paciente)
--
-- A política anterior exigia um paciente da mesma instituição via
-- EXISTS. Com patient_id nulo o EXISTS é falso e o bloqueio seria
-- recusado, então a checagem passa a ser condicional.
-- ----------------------------------------------------------
DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND (
      patient_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.patients pa
        WHERE pa.id = patient_id AND pa.clinic_id = clinic_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = professional_id AND pr.clinic_id = clinic_id
    )
  );

-- ----------------------------------------------------------
-- 4. Jornada de trabalho
--
-- Sem isto, "horário livre" significa apenas "sem agendamento", o que
-- inclui 3h da manhã de domingo. A jornada é hora de parede local
-- (TIME sem fuso) porque expediente é 08:00 na parede da clínica,
-- independente de horário de verão.
--
-- weekday usa a mesma convenção do Date.getDay() do JavaScript
-- (0 = domingo), para a tela não precisar traduzir.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  break_starts_at TIME,
  break_ends_at TIME,

  -- Duração padrão do atendimento: define a granularidade dos slots que
  -- a tela desenha. Sobrescrita por tipo de atendimento fica para depois.
  slot_minutes SMALLINT NOT NULL DEFAULT 60 CHECK (slot_minutes BETWEEN 5 AND 480),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT professional_schedules_period CHECK (ends_at > starts_at),
  CONSTRAINT professional_schedules_break_pair
    CHECK ((break_starts_at IS NULL) = (break_ends_at IS NULL)),
  CONSTRAINT professional_schedules_break_period
    CHECK (break_ends_at IS NULL OR break_ends_at > break_starts_at),
  CONSTRAINT professional_schedules_break_inside
    CHECK (
      break_starts_at IS NULL
      OR (break_starts_at >= starts_at AND break_ends_at <= ends_at)
    ),
  CONSTRAINT professional_schedules_unique
    UNIQUE (professional_id, weekday, starts_at)
);

CREATE INDEX IF NOT EXISTS idx_professional_schedules_lookup
  ON public.professional_schedules(clinic_id, professional_id, weekday);

-- ----------------------------------------------------------
-- 5. Feriados da instituição
--
-- Serve ao aviso: dizer "Feriado: Independência" em vez de "dia
-- atípico". `is_working_day` cobre a clínica que atende no feriado por
-- padrão — aí não há aviso nenhum.
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.clinic_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  name TEXT NOT NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT clinic_holidays_unique UNIQUE (clinic_id, day)
);

CREATE INDEX IF NOT EXISTS idx_clinic_holidays_day
  ON public.clinic_holidays(clinic_id, day);

-- ----------------------------------------------------------
-- 6. Defaults: a tela não escolhe (nem pode) a instituição
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_agenda_config_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    NEW.clinic_id := public.user_clinic_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_schedules_defaults ON public.professional_schedules;
CREATE TRIGGER trg_professional_schedules_defaults
  BEFORE INSERT ON public.professional_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_agenda_config_defaults();

DROP TRIGGER IF EXISTS trg_clinic_holidays_defaults ON public.clinic_holidays;
CREATE TRIGGER trg_clinic_holidays_defaults
  BEFORE INSERT ON public.clinic_holidays
  FOR EACH ROW EXECUTE FUNCTION public.set_agenda_config_defaults();

CREATE OR REPLACE FUNCTION public.set_professional_schedule_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_professional_schedules_updated_at ON public.professional_schedules;
CREATE TRIGGER trg_professional_schedules_updated_at
  BEFORE UPDATE ON public.professional_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_professional_schedule_updated_at();

-- ----------------------------------------------------------
-- 7. RLS — leitura para a casa toda, escrita para o dono ou o Adm
--
-- Toda a equipe precisa LER a jornada dos colegas (é o que desenha a
-- agenda da recepção). ESCREVER a própria jornada é do profissional;
-- mexer na dos outros e nos feriados é do Adm da instituição.
-- ----------------------------------------------------------
ALTER TABLE public.professional_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professional_schedules_select ON public.professional_schedules;
CREATE POLICY professional_schedules_select ON public.professional_schedules
  FOR SELECT TO authenticated
  USING (public.can_manage_agenda(clinic_id) OR public.is_super_admin());

DROP POLICY IF EXISTS professional_schedules_insert ON public.professional_schedules;
CREATE POLICY professional_schedules_insert ON public.professional_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND (professional_id = auth.uid() OR public.is_clinic_admin() OR public.is_super_admin())
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = professional_id AND pr.clinic_id = clinic_id
    )
  );

DROP POLICY IF EXISTS professional_schedules_update ON public.professional_schedules;
CREATE POLICY professional_schedules_update ON public.professional_schedules
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_agenda(clinic_id)
    AND (professional_id = auth.uid() OR public.is_clinic_admin() OR public.is_super_admin())
  )
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND (professional_id = auth.uid() OR public.is_clinic_admin() OR public.is_super_admin())
  );

DROP POLICY IF EXISTS professional_schedules_delete ON public.professional_schedules;
CREATE POLICY professional_schedules_delete ON public.professional_schedules
  FOR DELETE TO authenticated
  USING (
    public.can_manage_agenda(clinic_id)
    AND (professional_id = auth.uid() OR public.is_clinic_admin() OR public.is_super_admin())
  );

ALTER TABLE public.clinic_holidays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinic_holidays_select ON public.clinic_holidays;
CREATE POLICY clinic_holidays_select ON public.clinic_holidays
  FOR SELECT TO authenticated
  USING (public.can_manage_agenda(clinic_id) OR public.is_super_admin());

DROP POLICY IF EXISTS clinic_holidays_write ON public.clinic_holidays;
CREATE POLICY clinic_holidays_write ON public.clinic_holidays
  FOR ALL TO authenticated
  USING (
    public.can_manage_agenda(clinic_id)
    AND (public.is_clinic_admin() OR public.is_super_admin())
  )
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND (public.is_clinic_admin() OR public.is_super_admin())
  );

REVOKE ALL ON public.professional_schedules FROM anon;
REVOKE ALL ON public.clinic_holidays FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clinic_holidays TO authenticated;

-- ----------------------------------------------------------
-- 8. Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.professional_schedules') IS NOT NULL AS jornada_criada,
  to_regclass('public.clinic_holidays') IS NOT NULL AS feriados_criados,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'kind'
  ) AS coluna_kind,
  (
    SELECT is_nullable = 'YES' FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'patient_id'
  ) AS paciente_opcional_para_bloqueio,
  (
    SELECT pg_get_constraintdef(oid) LIKE '%kind = ''appointment''%'
    FROM pg_constraint WHERE conname = 'appointments_no_overlap'
  ) AS guarda_so_para_atendimento,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'professional_schedules') AS politicas_jornada,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'clinic_holidays') AS politicas_feriados;
