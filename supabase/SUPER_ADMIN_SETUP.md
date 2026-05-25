# SuperAdm

## 1. Aplicar banco

Rode as migrations do Supabase para criar as colunas de perfil, policies e RPCs de administração.

## 2. Publicar funções Edge

Publique:

```bash
supabase functions deploy super-admin-create-user
supabase functions deploy complete-first-login
supabase functions deploy super-admin-reset-password
supabase functions deploy login-with-identifier
```

As funções precisam dos secrets `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` configurados no ambiente das Edge Functions.

## 3. Criar o usuário inicial

No diretório `frontend`, defina `SUPABASE_SERVICE_ROLE_KEY` apenas como variável temporária do terminal e rode:

```bash
npm run bootstrap:superadmin
```

Login inicial: `SuperAdm`

Senha inicial: `654321`

O primeiro acesso obriga a troca de senha antes de liberar qualquer dado clínico.

Nunca salve `SUPABASE_SERVICE_ROLE_KEY` em arquivo versionado ou envie essa chave para GitHub/Vercel. Depois do bootstrap, remova a variável temporária do terminal e troque a senha inicial do SuperAdm no primeiro acesso.
