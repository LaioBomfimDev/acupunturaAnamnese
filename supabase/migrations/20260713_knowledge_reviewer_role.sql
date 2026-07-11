-- ==========================================================
-- Papel "knowledge_reviewer" (Acupunturista Revisora)
--
-- Superset de terapeuta: mantém acesso clínico a pacientes reais
-- (para validar a anamnese de ponta a ponta) e ganha, no frontend,
-- a superfície de curadoria em modo "propor". NÃO é super admin.
--
-- O gate de acesso clínico é a função can_access_clinical_data — basta
-- incluir o novo papel nela para que pacientes/fichas/RPCs continuem
-- funcionando como para um terapeuta. is_super_admin permanece intacta.
-- ==========================================================

-- 1) Constraint de papel: inclui knowledge_reviewer
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('therapist', 'super_admin', 'knowledge_reviewer'));
END;
$$;

-- 2) Acesso clínico: revisora entra junto com terapeuta e super admin
CREATE OR REPLACE FUNCTION public.can_access_clinical_data(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role IN ('therapist', 'super_admin', 'knowledge_reviewer')
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$$;

-- 3) Helper para RLS da fila de curadoria
CREATE OR REPLACE FUNCTION public.is_knowledge_reviewer(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'knowledge_reviewer'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_knowledge_reviewer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_knowledge_reviewer(UUID) TO authenticated;

-- 4) Disciplinas: revisoras já existentes (se houver) recebem acupuntura.
--    Novos cadastros caem no fallback de resolveUserDisciplines (acupuntura).
UPDATE public.profiles
SET disciplines = ARRAY['acupuntura']
WHERE role = 'knowledge_reviewer'
  AND (disciplines IS NULL OR cardinality(disciplines) = 0);
