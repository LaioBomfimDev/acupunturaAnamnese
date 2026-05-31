---
name: sistema-acup-cli
description: Command and operations guide for Sistema Acup. Use when the user asks to run, debug, validate, build, preview, lint, start the dev server, deploy Supabase Edge Functions, apply/check migrations, inspect git state, or execute safe PowerShell/Node/Python commands for the Sistema Acup project.
---

# Sistema Acup CLI

## Core Rules

1. Run commands from `C:\Users\m\Downloads\Sistema Acup` unless a command explicitly belongs in `frontend`.
2. Use PowerShell syntax.
3. Prefer `rg` / `rg --files` for discovery.
4. Use the bundled Python runtime if `python` is unavailable.
5. Do not expose secrets. Never print service role keys, encryption keys, or full `.env.local` values.
6. After touching frontend code, run `npm run lint` and `npm run build` from `frontend` unless the user asks for a lighter loop.

## Frequent Commands

Read `references/commands.md` before running multi-step validation, Supabase work, dev server setup, or deployment.

Typical frontend validation:

```powershell
Set-Location 'C:\Users\m\Downloads\Sistema Acup\frontend'
npm run lint
npm run build
```

Typical local server:

```powershell
Set-Location 'C:\Users\m\Downloads\Sistema Acup\frontend'
npm run dev -- --host 127.0.0.1 --port 3099
```

## Escalation

Ask for approval when commands need network, write outside the workspace, deploy, open GUI/browser windows outside the Browser plugin, or use secrets. Keep prefix approvals narrow, such as `npm run build`, `npm run dev`, or `npx -y supabase functions deploy`.
