-- ============================================================
-- APLICAR NO SUPABASE — Perfil "Acupunturista Revisora" (knowledge_reviewer)
-- Gerado de: 20260713_knowledge_reviewer_role.sql
--            20260713_curation_proposals.sql
--
-- É IDEMPOTENTE: pode rodar inteiro no SQL Editor mesmo que parte já
-- tenha sido aplicada. Rode de uma vez, na ordem abaixo.
-- ============================================================


-- ========== 1) PAPEL knowledge_reviewer ==========
-- Constraint de papel: inclui knowledge_reviewer
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

-- Acesso clínico: revisora entra junto com terapeuta e super admin
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

-- Helper para RLS da fila de curadoria
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

UPDATE public.profiles
SET disciplines = ARRAY['acupuntura']
WHERE role = 'knowledge_reviewer'
  AND (disciplines IS NULL OR cardinality(disciplines) = 0);


-- ========== 2) FILA curation_proposals ==========
CREATE TABLE IF NOT EXISTS public.curation_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  proposer_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  proposer_name TEXT,
  type          TEXT NOT NULL CHECK (type IN (
                  'point_review',
                  'point_promote_common',
                  'anamnese_finding',
                  'anamnese_question',
                  'anamnese_pattern',
                  'herb',
                  'food',
                  'ai_instruction',
                  'ai_correction',
                  'map_coordinate'
                )),
  target_ref    TEXT,
  payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
  note          TEXT,
  status        TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  decided_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT
);

CREATE INDEX IF NOT EXISTS curation_proposals_status_idx
  ON public.curation_proposals (status, created_at DESC);
CREATE INDEX IF NOT EXISTS curation_proposals_proposer_idx
  ON public.curation_proposals (proposer_id, created_at DESC);

ALTER TABLE public.curation_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS curation_proposals_select ON public.curation_proposals;
CREATE POLICY curation_proposals_select
ON public.curation_proposals
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (proposer_id = auth.uid() AND public.is_knowledge_reviewer(auth.uid()))
);

DROP POLICY IF EXISTS curation_proposals_insert ON public.curation_proposals;
CREATE POLICY curation_proposals_insert
ON public.curation_proposals
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_knowledge_reviewer(auth.uid())
  AND proposer_id = auth.uid()
  AND status = 'proposed'
);

DROP POLICY IF EXISTS curation_proposals_update ON public.curation_proposals;
CREATE POLICY curation_proposals_update
ON public.curation_proposals
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

REVOKE ALL ON public.curation_proposals FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.curation_proposals TO authenticated;
