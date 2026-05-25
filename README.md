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

Nunca coloque service role key no frontend, GitHub ou Vercel.

## Build

```bash
cd frontend
npm run build
```

## Deploy Vercel

Configure o projeto na Vercel com:

- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variables:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

As Edge Functions e secrets administrativos ficam no Supabase, não na Vercel.
