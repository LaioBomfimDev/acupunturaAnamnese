-- ==========================================================
-- Paciente da clínica + matrículas por disciplina (Fase 2)
-- Plano: docs/plano-clinica-multidisciplinar.md
-- REQUER: 20260707_profile_disciplines.sql aplicada antes
-- (o bloco abaixo reafirma a coluna por segurança/idempotência).
--
-- O que muda:
--  * patients.clinic_id — o paciente passa a pertencer à CLÍNICA;
--  * patient_enrollments — "enviar para outra disciplina" vira
--    matrícula (NUNCA cópia do paciente);
--  * clinical_records.discipline — todo registro carrega a
--    disciplina que o gerou (histórico existente = acupuntura).
--
-- O que NÃO muda (de propósito, ética/Fase 3):
--  * o CONTEÚDO clínico (clinical_records) continua visível só
--    para quem o criou (auth.uid() = therapist_id). A abertura por
--    disciplina + compartilhamento explícito (record_shares) é a
--    Fase 3, junto com a UI de cadeados.
--  * Colegas da mesma clínica que compartilham disciplina com o
--    paciente passam a ver apenas o CADASTRO (nome/contato) e as
--    matrículas — nunca anamnese/relatório.
--
-- Migração aditiva: políticas antigas permanecem intactas.
-- ==========================================================

-- Idempotência com a Fase 1 (não falha se já aplicada).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disciplines TEXT[] NOT NULL DEFAULT '{}';

-- ----------------------------------------------------------
-- Helpers de RLS (SECURITY DEFINER evita recursão de políticas;
-- search_path fixo — ver incidente 20260702 de hardening).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_clinic_id(p_user UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.user_disciplines(p_user UUID)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(disciplines, '{}') FROM public.profiles WHERE id = p_user;
$$;

REVOKE EXECUTE ON FUNCTION public.user_clinic_id(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_disciplines(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_clinic_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_disciplines(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 1) Paciente pertence à clínica
-- ----------------------------------------------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON public.patients(clinic_id);

-- Backfill: clínica do terapeuta atual do paciente.
UPDATE public.patients p
SET clinic_id = pr.clinic_id
FROM public.profiles pr
WHERE pr.id = p.therapist_id
  AND p.clinic_id IS NULL
  AND pr.clinic_id IS NOT NULL;

-- Novos pacientes herdam a clínica de quem cadastra.
CREATE OR REPLACE FUNCTION public.set_patient_clinic()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    NEW.clinic_id := public.user_clinic_id(NEW.therapist_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_patient_clinic ON public.patients;
CREATE TRIGGER trg_set_patient_clinic
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_patient_clinic();

-- ----------------------------------------------------------
-- 2) Registro clínico carrega a disciplina que o gerou
-- (acesso NÃO muda aqui — segue owner-only até a Fase 3)
-- ----------------------------------------------------------
ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'acupuntura'
  CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao'));

CREATE INDEX IF NOT EXISTS idx_clinical_records_discipline
  ON public.clinical_records(patient_id, discipline);

-- ----------------------------------------------------------
-- 3) Matrículas por disciplina (o "enviar para outra área")
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'discharged')),
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (patient_id, discipline)
);

CREATE INDEX IF NOT EXISTS idx_patient_enrollments_clinic
  ON public.patient_enrollments(clinic_id, discipline);

CREATE OR REPLACE FUNCTION public.set_enrollment_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT p.clinic_id INTO NEW.clinic_id FROM public.patients p WHERE p.id = NEW.patient_id;
  END IF;
  IF NEW.referred_by IS NULL THEN
    NEW.referred_by := auth.uid();
  END IF;
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_defaults ON public.patient_enrollments;
CREATE TRIGGER trg_enrollment_defaults
  BEFORE INSERT OR UPDATE ON public.patient_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_enrollment_defaults();

ALTER TABLE public.patient_enrollments ENABLE ROW LEVEL SECURITY;

-- Ver matrículas: mesma clínica OU paciente próprio (terapeuta sem clínica).
-- Matrícula é metadado ("está em atendimento na nutri"), nunca conteúdo clínico.
DROP POLICY IF EXISTS enrollments_select_clinic ON public.patient_enrollments;
CREATE POLICY enrollments_select_clinic ON public.patient_enrollments
  FOR SELECT TO authenticated
  USING (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  );

-- Matricular ("enviar para outra área"): mesma clínica ou paciente próprio.
DROP POLICY IF EXISTS enrollments_insert_clinic ON public.patient_enrollments;
CREATE POLICY enrollments_insert_clinic ON public.patient_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  );

-- Atualizar status (ativa/pausada/alta): mesmos limites.
DROP POLICY IF EXISTS enrollments_update_clinic ON public.patient_enrollments;
CREATE POLICY enrollments_update_clinic ON public.patient_enrollments
  FOR UPDATE TO authenticated
  USING (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  )
  WITH CHECK (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  );

-- SEM política de DELETE: matrícula não se apaga, muda de status
-- (integridade do registro clínico; a exclusão do paciente cascateia).
GRANT SELECT, INSERT, UPDATE ON public.patient_enrollments TO authenticated;

-- Helper depende da tabela — criado após ela.
CREATE OR REPLACE FUNCTION public.patient_shares_user_discipline(p_patient UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_enrollments e
    WHERE e.patient_id = p_patient
      AND e.discipline = ANY (public.user_disciplines(p_user))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.patient_shares_user_discipline(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.patient_shares_user_discipline(UUID, UUID) TO authenticated;

-- Backfill: todo paciente existente já era um caso de acupuntura.
INSERT INTO public.patient_enrollments (patient_id, clinic_id, discipline, referred_by, assigned_to, created_at)
SELECT p.id, p.clinic_id, 'acupuntura', p.therapist_id, p.therapist_id, COALESCE(p.created_at, timezone('utc', now()))
FROM public.patients p
ON CONFLICT (patient_id, discipline) DO NOTHING;

-- ----------------------------------------------------------
-- 4) Cadastro do paciente visível para colegas da clínica que
-- compartilham disciplina com ele (política ADICIONAL de SELECT;
-- a política antiga do dono segue valendo para INSERT/UPDATE/DELETE)
-- ----------------------------------------------------------
DROP POLICY IF EXISTS patients_select_clinic_discipline ON public.patients;
CREATE POLICY patients_select_clinic_discipline ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND public.patient_shares_user_discipline(id, auth.uid())
  );
