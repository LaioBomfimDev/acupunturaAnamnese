# Sistema Acup

Aplicação clínica para anamnese, acompanhamento e relatórios de acupuntura/MTC, com gestão de profissionais via SuperAdm.

## Estrutura

- `frontend`: aplicação React/Vite.
- `supabase`: migrations, Edge Functions e instruções de setup do Supabase.

## Desenvolvimento

```bash
cd frontend
npm install
npm run dev
```

Crie `frontend/.env.local` com:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Use `frontend/.env.example` como referência. O fallback local de autenticação
exige `DEV` + opt-in explícito e credenciais definidas somente no `.env.local`.
Nunca coloque service role key no frontend, GitHub ou Vercel.

## Qualidade e build

```bash
cd frontend
npm run quality
```

O gate executa invariantes de segurança, lint, testes de regressão, build e
budget do bundle. A mesma sequência roda em pull requests e na branch `main`.

## Deploy Vercel

Configure o projeto na Vercel com:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

As Edge Functions e secrets administrativos ficam no Supabase, não na Vercel.

## Hardening clínico

A migration de hardening é fail-closed e exige o segredo
`clinical_records_encryption_key` no Supabase Vault antes de qualquer alteração
de schema. Não a aplique sem backup restaurado e janela controlada.

Consulte [o runbook de produção](docs/runbook-hardening-producao.md) para a ordem
de implantação, MFA canário, curadoria, observabilidade e rollback.
