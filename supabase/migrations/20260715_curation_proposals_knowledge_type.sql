-- ==========================================================
-- Amplia os tipos de proposta para cobrir a curadoria de
-- BIBLIOTECA VIVA (Alimentação/pontos) e FONTES PDF.
--
-- A revisora de acupuntura passa a propor de forma estruturada nessas
-- abas: cada rascunho/revisão de ponto vira um curation_proposals do tipo
-- 'knowledge_review'. Ao aprovar, o SuperAdm reproduz o payload no caminho
-- de aprovação local já existente (saveLocalKnowledgeReview).
-- ==========================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'curation_proposals_type_check'
      AND conrelid = 'public.curation_proposals'::regclass
  ) THEN
    ALTER TABLE public.curation_proposals DROP CONSTRAINT curation_proposals_type_check;
  END IF;

  ALTER TABLE public.curation_proposals
  ADD CONSTRAINT curation_proposals_type_check
  CHECK (type IN (
    'point_review',
    'point_promote_common',
    'anamnese_finding',
    'anamnese_question',
    'anamnese_pattern',
    'herb',
    'food',
    'ai_instruction',
    'ai_correction',
    'map_coordinate',
    -- Biblioteca Viva + Fontes PDF (curadoria estruturada de ponto):
    'knowledge_review',
    -- Psicologia:
    'anamnese_psic_risk',
    'anamnese_psic_axis',
    'anamnese_psic_checklist',
    'anamnese_psic_question'
  ));
END;
$$;
