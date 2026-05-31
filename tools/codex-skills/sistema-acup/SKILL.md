---
name: sistema-acup
description: Project-understanding guide for Sistema Acup, a React/Vite + Supabase clinical acupuncture/TCM application. Use when working in C:\Users\m\Downloads\Sistema Acup to understand architecture, domain boundaries, data flows, clinical reasoning, Supabase security, patient records, SuperAdm, reports, protocols, and Biblioteca Viva before making changes. For command execution use $sistema-acup-cli; for UI/visual work use $sistema-acup-design; for map/acupoint calibration use $sistema-acup-map.
---

# Sistema Acup

## Purpose

Use this skill to understand the project before acting. It is the architectural and domain memory for Sistema Acup; it should keep changes aligned with the existing clinical app, data model, and safety boundaries.

## First Pass

1. Start in `C:\Users\m\Downloads\Sistema Acup`.
2. Check `git status --short` and preserve user changes.
3. Read `references/project-map.md` for nontrivial work.
4. Use `rg` / `rg --files` to locate affected modules.
5. Decide whether a companion skill is more specific:
   - `$sistema-acup-cli` for shell commands, dev server, build, Supabase deploy, and validation.
   - `$sistema-acup-design` for layout, CSS, visual polish, usability, responsive behavior, and clinical UI decisions.
   - `$sistema-acup-map` for map assets, marker coordinates, acupoint inference, and calibration workflows.

## Non-Negotiables

- Never expose `SUPABASE_SERVICE_ROLE_KEY`, encryption secrets, admin secrets, or clinical patient data in frontend code, public env vars, commits, screenshots, or user-facing logs.
- Keep patient clinical data flowing through `clinicalRecordService.js` and encrypted Supabase RPCs.
- Keep SuperAdm privileged actions in Supabase Edge Functions or security-definer RPCs, with audit/security behavior intact.
- Keep imported clinical knowledge as draft/review until professional approval. Do not auto-approve KM-Agent or inferred map data.
- Keep clinical outputs framed as professional decision support, not autonomous diagnosis or treatment authority.

## Architecture Anchors

- `frontend/src/App.jsx`: app gates, panel routing, autosave orchestration, clinical analysis entrypoint.
- `frontend/src/hooks/AuthContext.jsx`: Supabase auth, profile, SuperAdm, password-change, local fallback.
- `frontend/src/hooks/PatientContext.jsx`: patient lifecycle and selection.
- `frontend/src/hooks/useClinicState.js`: current clinical session state.
- `frontend/src/hooks/useSessionPersistence.js`: autosave/load of encrypted full sessions.
- `frontend/src/services/*`: data access boundary.
- `frontend/src/utils/analyzer.js`: core TCM scoring/diagnostic profile.
- `frontend/src/knowledge/*`: Biblioteca Viva, protocols, safety, report fragments, maps, search, KM-Agent drafts.
- `supabase/migrations/*`: database, RLS, RPC, Biblioteca Viva, SuperAdm.
- `supabase/functions/*`: privileged auth/admin flows.

## Working Style

- Prefer existing hooks, services, panels, CSS classes, and data modules.
- Keep edits scoped and reversible.
- When a clinical concept changes, search for the same pattern, point, source, safety rule, protocol entry, and report fragment.
- When a data/security concept changes, inspect frontend service, migration/RPC, Edge Function, and RLS together.

## Reference

- `references/project-map.md` has the detailed architecture map, data flow notes, and cross-module risks.
