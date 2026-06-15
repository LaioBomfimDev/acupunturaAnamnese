-- ============================================================
-- Fontes visuais bibliográficas — Storage privado + manifesto
-- ============================================================
-- Problema corrigido:
--   imagens/JSONs gerados em frontend/.local-source-assets não entram no
--   bundle público. Em produção, a UI não deve buscar páginas renderizadas
--   por URL pública crua.
--
-- Decisão de segurança:
--   * bucket PRIVADO: knowledge-source-assets;
--   * sem policies em storage.objects para esse bucket: acesso direto pelo
--     cliente fica negado; apenas Edge Function com service role gera URL
--     assinada curta após validar SuperAdm + manifesto;
--   * o cliente nunca informa bucket/object_path, só asset_key;
--   * metadados do manifesto também são RLS SuperAdm.
--
-- Reversão manual no fim do arquivo.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-source-assets',
  'knowledge-source-assets',
  false,
  52428800, -- 50 MB por objeto: JSONs grandes, páginas webp e PDFs de origem quando necessário.
  ARRAY['application/json', 'text/plain', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.knowledge_source_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key TEXT NOT NULL UNIQUE,
  bucket_id TEXT NOT NULL DEFAULT 'knowledge-source-assets',
  object_path TEXT NOT NULL,
  asset_kind TEXT NOT NULL DEFAULT 'other',
  source_key TEXT,
  mime_type TEXT NOT NULL,
  byte_size BIGINT,
  checksum_sha256 TEXT,
  pdf_page INTEGER,
  title TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT knowledge_source_assets_bucket_check
    CHECK (bucket_id = 'knowledge-source-assets'),
  CONSTRAINT knowledge_source_assets_kind_check
    CHECK (asset_kind IN ('manifest', 'source_page', 'source_text', 'source_pdf', 'other')),
  CONSTRAINT knowledge_source_assets_asset_key_safe_check
    CHECK (
      length(asset_key) BETWEEN 1 AND 260
      AND asset_key ~ '^[a-z0-9][a-z0-9._/-]*$'
      AND asset_key !~ '(^/|\\.\\.|//|\\\\)'
    ),
  CONSTRAINT knowledge_source_assets_object_path_safe_check
    CHECK (
      length(object_path) BETWEEN 1 AND 512
      AND object_path ~ '^[a-z0-9][a-z0-9._/-]*$'
      AND object_path !~ '(^/|\\.\\.|//|\\\\)'
    ),
  CONSTRAINT knowledge_source_assets_pdf_page_check
    CHECK (pdf_page IS NULL OR pdf_page > 0),
  CONSTRAINT knowledge_source_assets_byte_size_check
    CHECK (byte_size IS NULL OR byte_size >= 0)
);

CREATE INDEX IF NOT EXISTS knowledge_source_assets_kind_active_idx
ON public.knowledge_source_assets (asset_kind, is_active);

CREATE INDEX IF NOT EXISTS knowledge_source_assets_source_page_idx
ON public.knowledge_source_assets (source_key, pdf_page)
WHERE source_key IS NOT NULL;

DROP TRIGGER IF EXISTS knowledge_source_assets_touch_updated_at ON public.knowledge_source_assets;
CREATE TRIGGER knowledge_source_assets_touch_updated_at
BEFORE UPDATE ON public.knowledge_source_assets
FOR EACH ROW
EXECUTE PROCEDURE public.touch_updated_at();

ALTER TABLE public.knowledge_source_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "SuperAdm le manifesto de fontes visuais" ON public.knowledge_source_assets;
CREATE POLICY "SuperAdm le manifesto de fontes visuais"
ON public.knowledge_source_assets FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "SuperAdm gerencia manifesto de fontes visuais" ON public.knowledge_source_assets;
CREATE POLICY "SuperAdm gerencia manifesto de fontes visuais"
ON public.knowledge_source_assets FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

REVOKE ALL ON public.knowledge_source_assets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_source_assets TO authenticated;

COMMENT ON TABLE public.knowledge_source_assets IS
  'Manifesto allowlist para assets bibliográficos privados. O cliente pede asset_key; a Edge Function valida SuperAdm e gera URL assinada curta.';

COMMENT ON COLUMN public.knowledge_source_assets.object_path IS
  'Caminho interno no bucket privado. Nunca aceitar diretamente do cliente.';

-- Intencionalmente NÃO criamos policies em storage.objects para
-- bucket_id = 'knowledge-source-assets'. Sem policy, usuários comuns não
-- conseguem listar/baixar/enviar objetos diretamente; a service role da
-- Edge Function faz a mediação e audita o acesso.

-- ============================================================
-- REVERSÃO (executar manualmente se necessário):
-- DROP POLICY IF EXISTS "SuperAdm le manifesto de fontes visuais" ON public.knowledge_source_assets;
-- DROP POLICY IF EXISTS "SuperAdm gerencia manifesto de fontes visuais" ON public.knowledge_source_assets;
-- DROP TRIGGER IF EXISTS knowledge_source_assets_touch_updated_at ON public.knowledge_source_assets;
-- DROP TABLE IF EXISTS public.knowledge_source_assets;
-- DELETE FROM storage.buckets WHERE id = 'knowledge-source-assets';
--   (o DELETE do bucket exige remover os objetos antes)
-- ============================================================
