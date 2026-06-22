-- ============================================================
-- Correções da IA — loop de ensino (feedback → recuperação)
-- ============================================================
-- Problema:
--   As 5 superfícies de IA (língua, anamnese, raciocínio, narrativa,
--   biblioteca) só sugerem. Quando a IA erra, não há como ensiná-la sem
--   editar o prompt no código. Os modelos Gemini (Vertex) NÃO treinam com
--   os dados, então "aprender" aqui = guardar a correção da profissional e
--   injetá-la nos prompts futuros como lição autoritativa.
--
-- Princípios (iguais às tabelas de conhecimento existentes):
--   1. Conhecimento clínico, NUNCA prontuário: texto anonimizado no cliente.
--   2. A autora vê e usa as próprias correções na hora (campo author_id);
--      para as demais, só após aprovação da SuperAdm (approval_status).
--   3. SuperAdm gerencia aprovação/reprovação e auditoria.
--   4. Edge Functions leem via service role (bypassa RLS) e aplicam a regra
--      "aprovada global ∪ as da própria autora" na injeção.
--
-- Reversão manual no fim do arquivo.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ai_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  surface TEXT NOT NULL,
  model_version TEXT,
  context_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  correction_text TEXT NOT NULL,
  correction_structured JSONB,
  reason TEXT,
  approval_status TEXT NOT NULL DEFAULT 'pending',
  author_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_label TEXT,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ai_corrections_surface_check
    CHECK (surface IN ('tongue', 'anamnese_marks', 'clinical_reasoning', 'narrative', 'library_qa')),
  CONSTRAINT ai_corrections_status_check
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT ai_corrections_correction_text_len_check
    CHECK (length(correction_text) BETWEEN 1 AND 4000),
  CONSTRAINT ai_corrections_reason_len_check
    CHECK (reason IS NULL OR length(reason) <= 4000)
);

-- Busca de injeção (por superfície + status) e lista da autora (por autora + superfície).
CREATE INDEX IF NOT EXISTS ai_corrections_surface_status_idx
ON public.ai_corrections (surface, approval_status);

CREATE INDEX IF NOT EXISTS ai_corrections_author_surface_idx
ON public.ai_corrections (author_id, surface);

CREATE INDEX IF NOT EXISTS ai_corrections_created_idx
ON public.ai_corrections (created_at DESC);

DROP TRIGGER IF EXISTS ai_corrections_touch_updated_at ON public.ai_corrections;
CREATE TRIGGER ai_corrections_touch_updated_at
BEFORE UPDATE ON public.ai_corrections
FOR EACH ROW
EXECUTE PROCEDURE public.touch_updated_at();

ALTER TABLE public.ai_corrections ENABLE ROW LEVEL SECURITY;

-- A autora insere apenas correções suas (com perfil clínico ativo).
DROP POLICY IF EXISTS "ai_corrections insert own" ON public.ai_corrections;
CREATE POLICY "ai_corrections insert own"
ON public.ai_corrections FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.can_access_clinical_data(auth.uid())
);

-- A autora vê as suas; todas veem as aprovadas; SuperAdm vê tudo.
DROP POLICY IF EXISTS "ai_corrections select own or approved" ON public.ai_corrections;
CREATE POLICY "ai_corrections select own or approved"
ON public.ai_corrections FOR SELECT TO authenticated
USING (
  author_id = auth.uid()
  OR approval_status = 'approved'
  OR public.is_super_admin(auth.uid())
);

-- Aprovar/reprovar/editar: só SuperAdm.
DROP POLICY IF EXISTS "ai_corrections update super admin" ON public.ai_corrections;
CREATE POLICY "ai_corrections update super admin"
ON public.ai_corrections FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

-- Apagar: SuperAdm, ou a autora apagando as próprias ainda pendentes.
DROP POLICY IF EXISTS "ai_corrections delete super admin or own pending" ON public.ai_corrections;
CREATE POLICY "ai_corrections delete super admin or own pending"
ON public.ai_corrections FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (author_id = auth.uid() AND approval_status = 'pending')
);

REVOKE ALL ON public.ai_corrections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_corrections TO authenticated;

COMMENT ON TABLE public.ai_corrections IS
  'Correções das profissionais sobre saídas de IA. Conhecimento clínico anonimizado (sem PII). A autora usa as suas na hora; viram globais após aprovação SuperAdm. Edge Functions injetam no prompt.';

COMMENT ON COLUMN public.ai_corrections.context_snapshot IS
  'Rótulos/texto JÁ anonimizado que geraram a saída da IA. Nunca PII.';

COMMENT ON COLUMN public.ai_corrections.correction_structured IS
  'Correção estruturada opcional (ex.: tags/padrão corretos) quando a superfície suportar.';

-- ============================================================
-- REVERSÃO (executar manualmente se necessário):
-- DROP POLICY IF EXISTS "ai_corrections insert own" ON public.ai_corrections;
-- DROP POLICY IF EXISTS "ai_corrections select own or approved" ON public.ai_corrections;
-- DROP POLICY IF EXISTS "ai_corrections update super admin" ON public.ai_corrections;
-- DROP POLICY IF EXISTS "ai_corrections delete super admin or own pending" ON public.ai_corrections;
-- DROP TRIGGER IF EXISTS ai_corrections_touch_updated_at ON public.ai_corrections;
-- DROP TABLE IF EXISTS public.ai_corrections;
-- ============================================================
