# Fontes visuais protegidas

Este fluxo publica páginas renderizadas de PDFs e manifestos locais sem expor arquivos em rota pública.

## Modelo de segurança

- Bucket privado: `knowledge-source-assets`.
- Manifesto allowlist: tabela `public.knowledge_source_assets`.
- A UI envia apenas `assetKey`, nunca `bucket` nem `object_path`.
- A Edge Function `knowledge-source-asset-url` exige usuário autenticado com perfil `super_admin`, ativo e sem troca de senha pendente.
- A URL assinada dura 5 minutos.
- Não há policy de leitura direta em `storage.objects` para esse bucket; a leitura passa pela Edge Function.
- `SUPABASE_SERVICE_ROLE_KEY` fica somente em Supabase Edge Functions ou no ambiente local/CI seguro usado para upload.

## Atlas público (orientação clínica)

O Atlas da Ednéa é material público e serve para guiar o profissional ao clicar no ponto. Por isso ele **não** usa a Edge Function nem URL assinada — fica num bucket **público** dedicado, com URL fixa e permanente.

- Bucket público dedicado: `knowledge-atlas-public` (migration `20260615_knowledge_atlas_public_bucket.sql`).
- Prefixo público: `atlas-ednea/` (páginas webp + índice). Resolvido no frontend por `publicAtlasAssetUrl` → `…/storage/v1/object/public/knowledge-atlas-public/<assetKey>`.
- Sem expiração, sem Edge Function: é só um arquivo numa URL pública. Não há endpoint dinâmico nem caminho de escrita para o cliente sondar (escrita só por service role / painel).
- Demais fontes (`pdf-sources/*` etc.) **continuam** no fluxo protegido acima (bucket privado + Edge Function + SuperAdm).
- Em desenvolvimento, o Vite continua servindo `frontend/.local-source-assets` localmente; em produção, o frontend monta a URL pública do bucket.

### Subir o Atlas para o bucket público (1x)

1. No painel do Supabase → Storage, crie o bucket `knowledge-atlas-public` e marque como **Public** (ou aplique a migration).
2. Faça upload da pasta `frontend/.local-source-assets/atlas-ednea` para a raiz do bucket (arraste a pasta inteira; os objetos ficam como `atlas-ednea/pages/page-XXX.webp` e `atlas-ednea/source-index.local.json`).
3. Pronto: as URLs públicas passam a responder e o app mostra as imagens ao clicar no ponto. Nada de service role no frontend/Vercel.

## Deploy

1. Aplicar a migration:

```bash
supabase db push
```

2. Fazer deploy da Edge Function:

```bash
supabase functions deploy knowledge-source-asset-url
```

3. Sincronizar os assets locais para o bucket privado:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/knowledge/sync-knowledge-source-assets.mjs --dry-run
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node tools/knowledge/sync-knowledge-source-assets.mjs
```

4. No frontend/Vercel, manter apenas:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Não configurar service role no frontend ou na Vercel.

## Desenvolvimento local

O Vite e `npm run preview:static` continuam servindo `frontend/.local-source-assets` localmente. Isso só vale em desenvolvimento ou quando `VITE_ENABLE_LOCAL_SOURCE_ASSET_FALLBACK=true`.

Em produção, sem esse fallback, os JSONs e imagens são resolvidos pela Edge Function e pelo Storage privado.
