-- ============================================================
-- APLICAR NO SUPABASE — Revisora de curadoria de PSICOLOGIA
-- (consolidado de 20260714_psych_curation_items.sql
--  + 20260714_curation_proposals_psych_types.sql)
--
-- Pré-requisitos já aplicados: papel knowledge_reviewer + fila
-- curation_proposals (aplicar-sql-revisora-2026-07-11.sql) e a coluna
-- profiles.disciplines (aplicar-sql-disciplinas-2026-07-08.sql).
--
-- Este script é SÓ SCHEMA. Os dados (candidatos com trechos de manuais
-- protegidos) NÃO vão aqui — são carregados pelo seed em node:
--   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
--     node tools/knowledge/seed-psych-curation-items.mjs
-- ============================================================

-- 1) Tabela da base curável de psicologia -------------------------------
CREATE TABLE IF NOT EXISTS public.psych_curation_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  discipline        TEXT NOT NULL DEFAULT 'psicologia',
  kind              TEXT NOT NULL CHECK (kind IN ('risk', 'axis', 'checklist', 'question')),
  label             TEXT NOT NULL,
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_candidates  INTEGER NOT NULL DEFAULT 0,
  unique_evidence   INTEGER NOT NULL DEFAULT 0,
  sources           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL DEFAULT 'review',
  copyright         TEXT NOT NULL DEFAULT 'source-only',
  batch             TEXT
);

CREATE INDEX IF NOT EXISTS psych_curation_items_kind_idx
  ON public.psych_curation_items (discipline, kind, created_at DESC);

ALTER TABLE public.psych_curation_items ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_psych_reviewer(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'knowledge_reviewer'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
      AND 'psicologia' = ANY(COALESCE(p.disciplines, ARRAY[]::TEXT[]))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_psych_reviewer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_psych_reviewer(UUID) TO authenticated;

DROP POLICY IF EXISTS psych_curation_items_select ON public.psych_curation_items;
CREATE POLICY psych_curation_items_select
ON public.psych_curation_items FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.is_psych_reviewer(auth.uid()));

REVOKE ALL ON public.psych_curation_items FROM anon;
GRANT SELECT ON public.psych_curation_items TO authenticated;

-- 2) Novos tipos de proposta na fila ------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'curation_proposals_type_check'
      AND conrelid = 'public.curation_proposals'::regclass
  ) THEN
    ALTER TABLE public.curation_proposals DROP CONSTRAINT curation_proposals_type_check;
  END IF;

  ALTER TABLE public.curation_proposals
  ADD CONSTRAINT curation_proposals_type_check
  CHECK (type IN (
    'point_review', 'point_promote_common', 'anamnese_finding',
    'anamnese_question', 'anamnese_pattern', 'herb', 'food',
    'ai_instruction', 'ai_correction', 'map_coordinate',
    'anamnese_psic_risk', 'anamnese_psic_axis', 'anamnese_psic_checklist'
  ));
END;
$$;
