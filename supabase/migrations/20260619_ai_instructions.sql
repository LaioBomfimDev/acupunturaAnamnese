-- ============================================================
-- Instruções editáveis da IA clínica (camada ADITIVA sobre o prompt fixo)
-- ============================================================
-- As Edge Functions de IA (library-qa, clinical-reasoning, ...) têm um
-- SYSTEM_PROMPT fixo no código com as REGRAS DE SEGURANÇA — piso imutável.
-- Esta tabela guarda DIRETRIZES ADICIONAIS curadas pelo SuperAdm, que as
-- funções EMPILHAM SOBRE o prompt fixo. Elas refinam tom/foco/limites, mas
-- NUNCA removem os guardrails de segurança nem o gate humano.
--
-- Versionamento/auditoria: cada save é atômico via RPC admin_save_ai_instructions,
-- que incrementa a versão e grava um snapshot append-only em
-- ai_instruction_versions.
--
-- Segurança: RLS permite SELECT apenas a SuperAdm ativo. O cliente NÃO escreve
-- direto (sem INSERT/UPDATE/DELETE) — só pela RPC SECURITY DEFINER, que revalida
-- SuperAdm. As Edge Functions leem via service role (ignora RLS).
--
-- Reversão manual no fim do arquivo.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----- Tabela: versão ativa por chave ------------------------------------
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

-- ----- Tabela: histórico append-only (auditoria) -------------------------
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

-- Sem seed: as chaves conhecidas vêm do cliente (AI_INSTRUCTION_KEYS) e a
-- Edge Function faz fail-open quando a linha não existe. Assim o 1º save de
-- cada chave nasce na versão 1 (sem linha vazia "fantasma" na v2).

-- ----- RPC de save: atômico, revalida SuperAdm, versiona e audita --------
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

-- ----- RLS: SuperAdm lê; ninguém escreve direto (só pela RPC) -------------
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

-- Sem policies de INSERT/UPDATE/DELETE: escrita só pela RPC SECURITY DEFINER.
REVOKE ALL ON public.ai_instructions FROM anon;
REVOKE ALL ON public.ai_instruction_versions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.ai_instructions FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_instruction_versions FROM authenticated;
GRANT SELECT ON public.ai_instructions TO authenticated;
GRANT SELECT ON public.ai_instruction_versions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_save_ai_instructions(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_save_ai_instructions(TEXT, TEXT) TO authenticated;

COMMENT ON TABLE public.ai_instructions IS
  'Diretrizes adicionais da IA clínica, empilhadas sobre o SYSTEM_PROMPT fixo das Edge Functions. Nunca substituem as regras de segurança. Escrita só via admin_save_ai_instructions.';
COMMENT ON TABLE public.ai_instruction_versions IS
  'Histórico append-only de cada versão salva das instruções da IA (auditoria).';

-- ============================================================
-- REVERSÃO (executar manualmente se necessário):
-- DROP FUNCTION IF EXISTS public.admin_save_ai_instructions(TEXT, TEXT);
-- DROP TABLE IF EXISTS public.ai_instruction_versions;
-- DROP TABLE IF EXISTS public.ai_instructions;
-- ============================================================
