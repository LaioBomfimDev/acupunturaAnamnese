-- ============================================================
-- APLICAR DE UMA VEZ no Supabase (SQL editor) — IA pendente · 2026-06-19
--
-- Bundle IDEMPOTENTE das duas migrações de IA ainda não aplicadas:
--   1) ai_corrections                       — loop de ensino ("Corrigir" em toda IA)
--   2) ai_instructions (+ versions + RPC)   — diretrizes editáveis da IA
--
-- Seguro reexecutar (IF NOT EXISTS / OR REPLACE / DROP+CREATE POLICY).
-- Pré-requisitos JÁ presentes no banco (migrações anteriores):
--   public.is_super_admin(), public.can_access_clinical_data(),
--   public.touch_updated_at(), public.profiles.
--
-- ATENÇÃO: o SQL cria as tabelas — a partir daí o botão "Corrigir" já GRAVA
-- e o painel SuperAdm já cura. Mas para a IA realmente *seguir* as correções/
-- diretrizes, as Edge Functions precisam ser REIMPLANTADAS (passo fora do SQL):
--   supabase functions deploy analyze-tongue suggest-marks clinical-reasoning draft-narrative library-qa
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ========================================================================
-- 1) ai_corrections — correções das profissionais sobre saídas de IA
--    Autora usa as próprias na hora; viram globais após aprovação SuperAdm.
-- ========================================================================
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

DROP POLICY IF EXISTS "ai_corrections insert own" ON public.ai_corrections;
CREATE POLICY "ai_corrections insert own"
ON public.ai_corrections FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND public.can_access_clinical_data(auth.uid())
);

DROP POLICY IF EXISTS "ai_corrections select own or approved" ON public.ai_corrections;
CREATE POLICY "ai_corrections select own or approved"
ON public.ai_corrections FOR SELECT TO authenticated
USING (
  author_id = auth.uid()
  OR approval_status = 'approved'
  OR public.is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "ai_corrections update super admin" ON public.ai_corrections;
CREATE POLICY "ai_corrections update super admin"
ON public.ai_corrections FOR UPDATE TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "ai_corrections delete super admin or own pending" ON public.ai_corrections;
CREATE POLICY "ai_corrections delete super admin or own pending"
ON public.ai_corrections FOR DELETE TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (author_id = auth.uid() AND approval_status = 'pending')
);

REVOKE ALL ON public.ai_corrections FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_corrections TO authenticated;

-- ========================================================================
-- 2) ai_instructions — diretrizes editáveis (camada aditiva sobre o prompt)
--    Escrita só pela RPC admin_save_ai_instructions (SECURITY DEFINER).
-- ========================================================================
CREATE TABLE IF NOT EXISTS public.ai_instructions (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT ai_instructions_key_check
    CHECK (key ~ '^[a-z0-9][a-z0-9._-]{1,60}$'),
  CONSTRAINT ai_instructions_content_len_check
    CHECK (char_length(content) <= 8000)
);

CREATE TABLE IF NOT EXISTS public.ai_instruction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  edited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_by_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS ai_instruction_versions_key_idx
  ON public.ai_instruction_versions (key, created_at DESC);

CREATE OR REPLACE FUNCTION public.admin_save_ai_instructions(
  p_key TEXT,
  p_content TEXT
)
RETURNS public.ai_instructions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_save_ai_instructions$
DECLARE
  v_actor UUID := auth.uid();
  v_label TEXT;
  v_row public.ai_instructions;
BEGIN
  IF NOT public.is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode editar instruções da IA.'
      USING ERRCODE = '42501';
  END IF;

  IF p_key IS NULL OR p_key !~ '^[a-z0-9][a-z0-9._-]{1,60}$' THEN
    RAISE EXCEPTION 'Chave de instrução inválida.' USING ERRCODE = '22023';
  END IF;

  IF char_length(COALESCE(p_content, '')) > 8000 THEN
    RAISE EXCEPTION 'Instrução excede o limite de 8000 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT full_name INTO v_label FROM public.profiles WHERE id = v_actor;

  INSERT INTO public.ai_instructions AS ai (key, content, version, updated_by, updated_at)
  VALUES (p_key, COALESCE(p_content, ''), 1, v_actor, timezone('utc'::text, now()))
  ON CONFLICT (key) DO UPDATE
    SET content = EXCLUDED.content,
        version = ai.version + 1,
        updated_by = v_actor,
        updated_at = timezone('utc'::text, now())
  RETURNING * INTO v_row;

  INSERT INTO public.ai_instruction_versions
    (key, content, version, is_active, edited_by, edited_by_label)
  VALUES
    (v_row.key, v_row.content, v_row.version, v_row.is_active, v_actor, v_label);

  RETURN v_row;
END;
$admin_save_ai_instructions$;

ALTER TABLE public.ai_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_instruction_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdm lê instruções da IA" ON public.ai_instructions;
CREATE POLICY "SuperAdm lê instruções da IA"
ON public.ai_instructions FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "SuperAdm lê histórico de instruções" ON public.ai_instruction_versions;
CREATE POLICY "SuperAdm lê histórico de instruções"
ON public.ai_instruction_versions FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

REVOKE ALL ON public.ai_instructions FROM anon;
REVOKE ALL ON public.ai_instruction_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_instructions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_instruction_versions FROM authenticated;
GRANT SELECT ON public.ai_instructions TO authenticated;
GRANT SELECT ON public.ai_instruction_versions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_save_ai_instructions(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_save_ai_instructions(TEXT, TEXT) TO authenticated;

-- ============================================================
-- Conferência rápida (opcional): deve listar as 3 tabelas.
-- SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public'
--     AND table_name IN ('ai_corrections','ai_instructions','ai_instruction_versions');
-- ============================================================
