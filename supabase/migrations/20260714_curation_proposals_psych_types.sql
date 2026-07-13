-- ==========================================================
-- Amplia os tipos de proposta para cobrir a curadoria de PSICOLOGIA.
--
-- A revisora de psicologia propõe decisões sobre grupos da base curável
-- (risco / eixos / checklist). Cada decisão vira um curation_proposals com
-- um destes tipos novos; o SuperAdm aprova na mesma fila já existente.
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
    -- Psicologia:
    'anamnese_psic_risk',
    'anamnese_psic_axis',
    'anamnese_psic_checklist',
    'anamnese_psic_question'
  ));
END;
$$;
