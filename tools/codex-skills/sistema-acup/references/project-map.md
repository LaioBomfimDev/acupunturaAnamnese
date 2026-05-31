# Sistema Acup Project Map

## Snapshot

Sistema Acup is a clinical acupuncture/TCM app for anamnesis, patient follow-up, clinical reasoning, protocols, reports, SuperAdm user management, and the Biblioteca Viva knowledge layer.

Root: `C:\Users\m\Downloads\Sistema Acup`

Main stack:

- Frontend: React 19, Vite 8, plain CSS.
- Backend/data: Supabase Auth, Postgres, RLS, security-definer RPCs, Edge Functions.
- Clinical storage: encrypted `clinical_records` via RPCs.
- Knowledge storage: local JS knowledge modules plus planned/partial Supabase Biblioteca Viva tables.

## Commands

Run from `frontend` unless noted:

```bash
npm run dev
npm run lint
npm run build
npm run preview
npm run preview:static
npm run bootstrap:superadmin
```

Use the bundled Python runtime when `python` is not on PATH:

```bash
C:\Users\m\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe
```

## Environment

Frontend public variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_ENABLE_LOCAL_AUTH_FALLBACK=true` only for development fallback login.

Never expose:

- `SUPABASE_SERVICE_ROLE_KEY`
- encryption keys
- admin secrets used by Edge Functions or bootstrap scripts

## Frontend Structure

- `frontend/src/App.jsx`: auth gate, SuperAdm gate, patient gate, tab/panel routing, autosave coordination, clinical analysis call.
- `frontend/src/App.css` and `frontend/src/index.css`: primary visual system.
- `frontend/src/components/Sidebar.jsx`: app navigation.
- `frontend/src/components/PatientStart.jsx`, `PatientBar.jsx`: patient selection/start workflow.
- `frontend/src/components/panels/*`: main screens:
  - `Login.jsx`
  - `PainelInicial.jsx`
  - `Anamnese.jsx`
  - `Lingua.jsx`
  - `Pulso.jsx`
  - `RaciocinioClinical.jsx`
  - `Diagnostico.jsx`
  - `Protocolo.jsx`
  - `Evolucao.jsx`
  - `Biblioteca.jsx`
  - `Relatorio.jsx`
  - `SuperAdminPanel.jsx`
  - `KnowledgeAdminPanel.jsx`
  - `MapCoordinateEditor.jsx`
- `frontend/src/components/ui/*`: reusable UI primitives.

## State And Persistence

- `frontend/src/hooks/AuthContext.jsx`: Supabase auth, profile loading, local fallback, password-change flow, SuperAdm flags.
- `frontend/src/hooks/PatientContext.jsx`: patient list, selected patient, CRUD/archive.
- `frontend/src/hooks/useClinicState.js`: clinical form state, selected checklist map, reset helpers.
- `frontend/src/hooks/useSessionPersistence.js`: debounced autosave/load of `full_session` records.
- `frontend/src/services/patientService.js`: patient CRUD via Supabase or local fallback.
- `frontend/src/services/clinicalRecordService.js`: encrypted clinical record RPC facade plus local fallback.
- `frontend/src/services/adminService.js`: SuperAdm RPC/Edge Function facade.
- `frontend/src/services/knowledgeAdminService.js`: local Biblioteca Viva review export/storage.

When changing patient/session behavior, check interactions among `App.jsx`, `useClinicState`, `PatientContext`, and `useSessionPersistence`; race conditions here can overwrite or autosave the wrong patient if patient identity is not guarded.

## Clinical Reasoning

- `frontend/src/utils/analyzer.js`: scoring and diagnostic profile engine.
- `frontend/src/data/*`: checklist/source data for symptoms, tongue, pulse, protocols, movements, library content.
- `frontend/src/knowledge/schema.js`: knowledge entity types, approval/source statuses, technique constants.
- `frontend/src/knowledge/knowledgeBase.js`: curated and imported clinical knowledge objects.
- `frontend/src/knowledge/protocolEngine.js`: pattern-to-protocol expansion, point details, justifications, source labels.
- `frontend/src/knowledge/safetyEngine.js`: safety alerts for pregnancy, moxa/heat, anticoagulants, electroacupuncture, GB20, etc.
- `frontend/src/knowledge/reportFragments.js`: report text sourced from knowledge.
- `frontend/src/knowledge/searchIndex.js`: Biblioteca search data.
- `frontend/src/knowledge/mapLocations.js`: point-to-map coordinates.
- `frontend/src/knowledge/kmAgentDrafts.js` and `generated/km-agent/*`: imported KM-Agent draft data.

Clinical change rule: if a concept changes in one clinical layer, search the whole repo for the same pattern/point/term and update dependent protocol, report, safety, map, and Biblioteca behavior when needed.

## Map Calibration Workflow

Current map assets:

- `frontend/public/maps/body-front.webp`
- `frontend/public/maps/body-back.webp`
- `frontend/public/maps/feet-dorsal.webp`
- `frontend/public/maps/hands-palmar.webp`
- `frontend/public/maps/ear-lateral.webp`

Coordinate source:

- `frontend/src/knowledge/mapLocations.js`
- `mapAssets`: map metadata and image path.
- `pointLocations`: canonical/default marker positions.
- `CALIBRATED_MAP_LOCATIONS_KEY = acup_living_library_map_locations_v1`: local browser drafts.
- `calibrationPointOptions`: points exposed in the calibration UI.

Editor:

- `frontend/src/components/panels/MapCoordinateEditor.jsx`
- Click calculates `xPct` and `yPct` from the rendered image bounds.
- `upsertStoredMapLocation` writes local drafts to browser localStorage.
- `getAllMapLocations` overlays local drafts over canonical defaults.

Recommended process when the user asks to fix points on a map:

1. Identify the point code/label and target `mapId`.
2. Open the relevant map image and current marker positions.
3. Use the calibration UI or visual inspection to determine `xPct` and `yPct`.
4. Update the matching object in `pointLocations`; add a new object only when the point/map pair does not exist.
5. Keep `approved: false` and `calibrationStatus: 'draft'` unless the user explicitly confirms professional approval.
6. Run `npm run build` and visually verify the relevant map/panel in the local app.
7. If the adjustment came from localStorage, migrate only the reviewed values into `pointLocations`; do not copy the whole local draft blindly.

Coordinate rules:

- Use percentages relative to the rendered image: `xPct = left-to-right`, `yPct = top-to-bottom`.
- Keep values to 1-2 decimals unless precision is clinically meaningful.
- Do not reuse coordinates between `body_front`, `body_back`, `feet_dorsal`, `hands_palmar`, and `ear_lateral`; each map has its own anatomy and crop.
- For auricular labels, preserve `auricular:*` codes plus human `label` where present.
- For systemic points, normalize codes through `normalizePointCode` conventions and display through `displayPointCode`.

## Supabase Structure

- `supabase/migrations/20260519_initial_schema.sql`: base profiles, patients, clinical records, pgcrypto concept.
- `supabase/migrations/20260521_fix_clinical_record_rpc.sql`: hosted Supabase-compatible encrypted record RPCs.
- `supabase/migrations/20260522_super_admin_security.sql`: SuperAdm role, profile fields, RLS hardening, password-change gate, admin RPCs.
- `supabase/migrations/20260522_patient_age_archive.sql`: patient age/archive evolution.
- `supabase/migrations/20260523_super_admin_audit_reset.sql`: audit/password-reset support.
- `supabase/migrations/20260524_super_admin_profile_panel.sql`: profile panel evolution.
- `supabase/migrations/20260527_living_library_knowledge_base.sql`: Biblioteca Viva knowledge tables, RLS, drafts, versions, audit.
- `supabase/functions/login-with-identifier/index.ts`
- `supabase/functions/complete-first-login/index.ts`
- `supabase/functions/super-admin-create-user/index.ts`
- `supabase/functions/super-admin-reset-password/index.ts`
- `supabase/functions/_shared/security.ts`

Important: `profiles`, `patients`, and `clinical_records` are RLS-protected. SuperAdm capabilities should use audited RPCs or Edge Functions, not broad frontend privileges.

## Biblioteca Viva

Read `docs/biblioteca-viva.md` before changing this area.

Principles:

- Keep patient data and clinical knowledge separate.
- Imported external data starts as draft/review and must not feed protocols, reports, or alerts until professionally reviewed and approved.
- Preserve source/version metadata so reports and future RAG/AI flows can cite provenance.
- Keep frontend bundle weight in mind; the KM-Agent index is also served from `frontend/public/knowledge/km-agent/acupoints.index.json`.

Importer:

```bash
C:\Users\m\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\knowledge\import-km-agent-acupoints.py --csv caminho\para\km-agent\data\acupoints.csv
```

## Validation Recipes

Default local validation:

```bash
cd frontend
npm run lint
npm run build
```

UI validation:

1. Start Vite with `npm run dev -- --host 127.0.0.1 --port <free-port>`.
2. Open the local app with the Browser plugin.
3. Check login/session states relevant to the change.
4. Inspect console errors and visual overlap, especially on dashboard, panels, SuperAdm, Biblioteca, maps, and report screens.

Supabase validation:

- For migration-only changes, inspect SQL for idempotency, RLS, grants/revokes, and `NOTIFY pgrst, 'reload schema'` when RPC/schema cache needs refresh.
- For Edge Function changes, deploy only the touched function and test the frontend service that calls it.
- For clinical record RPC changes, test insert, read, update, delete with an authenticated therapist and verify cross-therapist isolation.

## Filtered Lessons From Downloaded Skills

Keep:

- From `webapp-testing`: use a running local server, wait for dynamic rendering, inspect DOM/screenshots/console, then act.
- From `codebase-migrate`: scope broad changes, batch them, use `rg` to estimate blast radius, run tests after each meaningful batch.
- From `deploy-pipeline`: serialize Supabase before frontend deploy when schema and UI change together; verify after deploy; rollback in reverse order.
- From `changelog-generator`: translate technical changes into user-facing clinical/admin value when summarizing releases.
- From `create-plan`: when the user explicitly asks for a plan, produce a concise ordered plan before editing.

Ignore by default:

- Generic Composio automation skills unless the user explicitly asks for that external service.
- Marketing/design/content skills unless the task is about public-facing material, docs, or assets.

## Common Risks

- Autosave can persist stale state if selected patient changes while a save/load is in flight; guard by patient id.
- Fallback local auth must not become a production backdoor.
- Missing DB columns may have compatibility fallbacks in services; remove them only after confirming migrations are deployed everywhere.
- Clinical text and reports may sound authoritative; preserve professional review language and safety warnings.
- Imported point data may be incomplete, multilingual, or unreviewed; keep it out of live recommendations until approved.
- CSS is centralized and broad; inspect unrelated panels after changing shared classes.
