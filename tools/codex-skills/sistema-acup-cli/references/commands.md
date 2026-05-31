# Sistema Acup Commands

## Paths

- Root: `C:\Users\m\Downloads\Sistema Acup`
- Frontend: `C:\Users\m\Downloads\Sistema Acup\frontend`
- Supabase: `C:\Users\m\Downloads\Sistema Acup\supabase`
- Bundled Python: `C:\Users\m\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`
- Bundled Node: `C:\Users\m\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

## Discovery

```powershell
git status --short
rg --files
rg "term"
Get-ChildItem -Recurse -File
```

## Frontend

```powershell
Set-Location 'C:\Users\m\Downloads\Sistema Acup\frontend'
npm install
npm run dev -- --host 127.0.0.1 --port 3099
npm run lint
npm run build
npm run preview
npm run preview:static
```

Run `npm install` only when dependencies are missing or changed.

## Environment

Required public frontend variables:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Development-only:

```text
VITE_ENABLE_LOCAL_AUTH_FALLBACK=true
```

Never print or persist:

```text
SUPABASE_SERVICE_ROLE_KEY
encryption_key
```

## SuperAdm And Edge Functions

Deploy touched functions only:

```powershell
npx -y supabase functions deploy login-with-identifier
npx -y supabase functions deploy complete-first-login
npx -y supabase functions deploy super-admin-create-user
npx -y supabase functions deploy super-admin-reset-password
```

Bootstrap SuperAdm from `frontend` only when the service role key is supplied as a temporary terminal environment variable:

```powershell
Set-Location 'C:\Users\m\Downloads\Sistema Acup\frontend'
npm run bootstrap:superadmin
```

## Database Checks

For SQL changes:

- Prefer timestamped files in `supabase/migrations`.
- Keep migrations idempotent where possible with `IF EXISTS` / `IF NOT EXISTS`.
- Include grants/revokes for RPCs.
- Include `NOTIFY pgrst, 'reload schema';` when PostgREST schema cache must reload.

## Validation Matrix

- UI/CSS only: `npm run build`, browser visual check.
- React logic: `npm run lint`, `npm run build`, browser interaction check.
- Clinical logic: inspect `analyzer.js`, `knowledge/*`, `data/*`; run build; verify report/protocol affected screens.
- Supabase RPC/migration: SQL review, grants/RLS review, frontend service contract review.
- Edge Function: deploy touched function, test caller service, verify user-facing error messages.

## Safe Output

When summarizing command output to the user:

- Mention pass/fail and relevant errors.
- Do not paste secrets or full env output.
- Keep logs short and actionable.
