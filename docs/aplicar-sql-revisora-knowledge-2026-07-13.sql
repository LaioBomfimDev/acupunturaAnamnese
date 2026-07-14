-- ==========================================================
-- APLICAR NO SUPABASE (SQL Editor) — Revisora de acupuntura, abas
-- estruturadas Biblioteca Viva + Fontes PDF (2026-07-13).
--
-- Espelha supabase/migrations/20260715_curation_proposals_knowledge_type.sql
-- Adiciona o tipo 'knowledge_review' ao CHECK de curation_proposals.
-- Idempotente: pode rodar mais de uma vez sem erro.
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
    'knowledge_review',
    'anamnese_psic_risk',
    'anamnese_psic_axis',
    'anamnese_psic_checklist',
    'anamnese_psic_question'
  ));
END;
$$;
