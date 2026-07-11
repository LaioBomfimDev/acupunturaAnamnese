-- ==========================================================
-- Fila de propostas de curadoria (canal Acupunturista Revisora → SuperAdm)
--
-- A revisora propõe correções/aprovações; o SuperAdm vê a fila em qualquer
-- máquina e aprova/rejeita. Ao aprovar, o frontend reproduz o payload no
-- caminho de aprovação local já existente (localStorage + export JSON).
-- ==========================================================

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

-- Revisora e super admin enxergam a fila; revisora vê só as próprias.
DROP POLICY IF EXISTS curation_proposals_select ON public.curation_proposals;
CREATE POLICY curation_proposals_select
ON public.curation_proposals
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (proposer_id = auth.uid() AND public.is_knowledge_reviewer(auth.uid()))
);

-- Só a revisora insere, e sempre em nome próprio e com status inicial.
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

-- Só o super admin decide (aprova/rejeita).
DROP POLICY IF EXISTS curation_proposals_update ON public.curation_proposals;
CREATE POLICY curation_proposals_update
ON public.curation_proposals
FOR UPDATE
TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

REVOKE ALL ON public.curation_proposals FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.curation_proposals TO authenticated;
