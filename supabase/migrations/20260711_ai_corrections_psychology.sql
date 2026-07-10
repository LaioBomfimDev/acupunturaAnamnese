-- ============================================================
-- MIGRATION: ai_corrections — superfícies de Psicologia
--
-- O workspace de Psicologia (Fase 5) ganhou IA assistiva com o
-- mesmo loop de ensino do MTC: sugestões de marcação
-- (psych-suggest-marks) e leitura diagnóstica em rascunho
-- (psych-reading). O botão "Corrigir" dessas superfícies grava em
-- ai_corrections com surface='psych_marks'/'psych_reading', que a
-- CHECK atual não prevê. Aqui só ampliamos a constraint — sem
-- tocar nos dados existentes.
-- ============================================================

ALTER TABLE public.ai_corrections
  DROP CONSTRAINT IF EXISTS ai_corrections_surface_check;

ALTER TABLE public.ai_corrections
  ADD CONSTRAINT ai_corrections_surface_check
    CHECK (surface IN (
      'tongue', 'anamnese_marks', 'clinical_reasoning', 'narrative',
      'library_qa', 'food_research', 'psych_marks', 'psych_reading'
    ));
