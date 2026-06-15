# Fontes visuais protegidas

Este fluxo publica páginas renderizadas de PDFs e manifestos locais sem expor arquivos em rota pública.

## Modelo de segurança

- Bucket privado: `knowledge-source-assets`.
- Manifesto allowlist: tabela `public.knowledge_source_assets`.
- A UI envia apenas `assetKey`, nunca `bucket` nem `object_path`.
- A Edge Function `knowledge-source-asset-url` exige usuário **autenticado, ativo e sem troca de senha pendente**.
  - Fontes de orientação do **Atlas** (`atlas-ednea/*`) ficam acessíveis a **qualquer membro ativo** — guiam o profissional ao clicar no ponto.
  - **Demais fontes** (`pdf-sources/*` e quaisquer outros prefixos) continuam **restritas ao SuperAdm**.
- A URL assinada dura 5 minutos. Não vira link público: continua exigindo sessão válida e expira rápido.
- A RLS da tabela-manifesto segue restrita ao SuperAdm; o cliente nunca lê a tabela direto — quem media é a Edge Function (service role).
- Não há policy de leitura direta em `storage.objects` para esse bucket; a leitura passa pela Edge Function.
- Cada liberação é auditada em `admin_audit_logs` (com `actorRole` e `memberScoped`) para rastreabilidade de acesso ao material licenciado.
- `SUPABASE_SERVICE_ROLE_KEY` fica somente em Supabase Edge Functions ou no ambiente local/CI seguro usado para upload.

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
