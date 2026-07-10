-- ============================================================
-- MIGRATION: ai_corrections — nova superfície 'food_research'
--
-- A aba de Dietoterapia ganhou a pesquisa de alimento/planta por IA
-- (Edge Function food-research). O botão "Corrigir" dessa superfície grava
-- em ai_corrections com surface='food_research', que a CHECK original não
-- previa. Aqui só ampliamos a constraint — sem tocar nos dados existentes.
-- ============================================================

ALTER TABLE public.ai_corrections
  DROP CONSTRAINT IF EXISTS ai_corrections_surface_check;

ALTER TABLE public.ai_corrections
  ADD CONSTRAINT ai_corrections_surface_check
    CHECK (surface IN ('tongue', 'anamnese_marks', 'clinical_reasoning', 'narrative', 'library_qa', 'food_research'));
