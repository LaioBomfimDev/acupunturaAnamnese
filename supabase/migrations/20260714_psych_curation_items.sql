-- ==========================================================
-- Base curável da anamnese de PSICOLOGIA (fonte do painel de curadoria)
--
-- Os candidatos extraídos dos 5 PDFs (risco / eixos / checklist / perguntas)
-- vivem hoje como worksheet local ignorada pelo git, porque carregam trechos
-- verbatim de manuais protegidos (DSM-5-TR, CID-11, ABA/TEA). Para a psicóloga
-- revisora — que é REMOTA e propõe via fila Supabase — a base precisa chegar
-- ao navegador dela sem ser publicada no bundle. Solução: esta tabela privada,
-- semeada pelo script seed-psych-curation-items.mjs (service role), lida só por
-- revisora de psicologia + super admin (RLS). Nada aqui entra no app/RAG: é
-- material de curadoria; só a síntese pt-BR aprovada vira conteúdo.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.psych_curation_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  discipline        TEXT NOT NULL DEFAULT 'psicologia',
  kind              TEXT NOT NULL CHECK (kind IN ('risk', 'axis', 'checklist', 'question')),
  label             TEXT NOT NULL,
  meta              JSONB NOT NULL DEFAULT '{}'::jsonb,       -- priority / framework / category
  total_candidates  INTEGER NOT NULL DEFAULT 0,
  unique_evidence   INTEGER NOT NULL DEFAULT 0,
  sources           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,       -- [{source,sourceLabel,page,snippet,imageUrl}]
  status            TEXT NOT NULL DEFAULT 'review',           -- sempre review; gate humano
  copyright         TEXT NOT NULL DEFAULT 'source-only',
  batch             TEXT                                       -- carimbo do seed (rastreio/idempotência)
);

CREATE INDEX IF NOT EXISTS psych_curation_items_kind_idx
  ON public.psych_curation_items (discipline, kind, created_at DESC);

ALTER TABLE public.psych_curation_items ENABLE ROW LEVEL SECURITY;

-- Helper: revisora de conhecimento COM a disciplina de psicologia liberada.
CREATE OR REPLACE FUNCTION public.is_psych_reviewer(p_user_id UUID DEFAULT auth.uid())
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
      AND 'psicologia' = ANY(COALESCE(p.disciplines, ARRAY[]::TEXT[]))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_psych_reviewer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_psych_reviewer(UUID) TO authenticated;

-- Leitura: super admin e revisora de psicologia. Escrita só via service role
-- (seed), que ignora RLS — nenhuma policy de INSERT/UPDATE para authenticated.
DROP POLICY IF EXISTS psych_curation_items_select ON public.psych_curation_items;
CREATE POLICY psych_curation_items_select
ON public.psych_curation_items
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR public.is_psych_reviewer(auth.uid())
);

REVOKE ALL ON public.psych_curation_items FROM anon;
GRANT SELECT ON public.psych_curation_items TO authenticated;
