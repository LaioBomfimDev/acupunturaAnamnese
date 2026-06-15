-- ============================================================
-- Atlas Ednéa — bucket PÚBLICO para páginas de orientação clínica
-- ============================================================
-- Decisão de produto/segurança:
--   * O Atlas é material público; suas páginas renderizadas (webp) e o índice
--     servem para guiar o profissional ao clicar no ponto.
--   * Por serem públicas e permanentes, ficam em bucket PÚBLICO dedicado e são
--     servidas por URL pública fixa — sem URL assinada e sem expiração.
--   * É um bucket SÓ-LEITURA-pública: NÃO criamos policy de escrita em
--     storage.objects, então apenas service role / upload pelo painel Supabase
--     consegue gravar. Não há endpoint dinâmico nem caminho de escrita que um
--     usuário anônimo ou autenticado comum possa explorar para entrar no sistema.
--   * Material NÃO público (pdf-sources e demais) permanece no bucket privado
--     `knowledge-source-assets`, mediado pela Edge Function `knowledge-source-asset-url`.
--
-- Reversão manual no fim do arquivo.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'knowledge-atlas-public',
  'knowledge-atlas-public',
  true,
  52428800, -- 50 MB por objeto: páginas webp (~300 KB) e índice JSON.
  ARRAY['image/webp', 'application/json', 'text/plain']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Intencionalmente SEM policies de escrita em storage.objects para este bucket:
-- a leitura pública é liberada pelo flag public=true; a escrita fica restrita a
-- service role / upload pelo painel. Sem caminho de escrita para anon/authenticated.

-- ============================================================
-- REVERSÃO (executar manualmente se necessário):
-- DELETE FROM storage.buckets WHERE id = 'knowledge-atlas-public';
--   (remova os objetos do bucket antes do DELETE)
-- ============================================================
