---
name: sistema-acup-map
description: Intelligent map and acupoint calibration guide for Sistema Acup. Use when placing, correcting, inferring, batching, reviewing, or validating acupuncture/auricular point coordinates on body, foot, hand, and ear maps; when using KM-Agent point location text; or when the user explains one point (for example LR3) and expects nearby points in the same meridian sequence (LR2, LR1) to be inferred as draft coordinates.
---

# Sistema Acup Map

## Goal

Make map calibration much easier than manually reviewing 400 points one by one. Use atlas text, meridian sequence, existing anchors, map anatomy, and user-confirmed placements to propose draft coordinates with confidence labels.

## Core Workflow

1. Read `references/acupoint-map-calibration.md`.
2. Use `scripts/acupoint-map-assistant.mjs` to inspect a point, its neighbors, source text, current coordinates, and likely map candidates.
3. Use `tools/knowledge/enrich-km-agent-with-acukg.mjs` when the task needs KM-Agent + AcuKG source relations, pt-BR location text, pt-BR needling drafts, indications, anatomy, nearby points, or evidence counts.
4. Treat user-confirmed positions as anchors.
5. Infer neighboring points only when source anatomy and map view support the inference.
6. Write canonical changes to `frontend/src/knowledge/mapLocations.js` only after review; otherwise keep them as local drafts.
7. Verify visually in the app.

## Intelligence Rules

- If the user calibrates `LR3`, inspect `LR1`, `LR2`, `LR3`, `LR4`, and nearby LR points from the KM-Agent data before proposing changes.
- Use directionality from source text: toe/nail/web margin/metatarsal/ankle/knee/abdomen/chest/back/wrist/finger/ear.
- Use same-meridian sequence as a spatial clue, not proof. Neighboring point numbers usually follow a channel path, but local anatomy still wins.
- Assign confidence:
  - `confirmed`: user placed or approved visually.
  - `high`: source text, map anatomy, and nearby anchors all agree.
  - `medium`: source text and sequence agree, but no close anchor exists.
  - `low`: only rough region is known; do not make canonical unless the user approves.
- Preserve `approved: false` and `calibrationStatus: 'draft'` for inferred or imported positions.

## Useful Command

```powershell
& 'C:\Users\m\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'tools\codex-skills\sistema-acup-map\scripts\acupoint-map-assistant.mjs' --project-root 'C:\Users\m\Downloads\Sistema Acup' --code LR3 --neighbors 2
```

## Files

- Map UI: `frontend/src/components/panels/MapCoordinateEditor.jsx`
- Canonical coordinates: `frontend/src/knowledge/mapLocations.js`
- Map images: `frontend/public/maps/*`
- KM-Agent source data: `frontend/src/knowledge/generated/km-agent/acupoints.raw.json`
- Enriched KM-Agent + AcuKG data: `frontend/src/knowledge/generated/km-agent/acupoints.enriched.json`
- Public enriched index: `frontend/public/knowledge/km-agent/acupoints.enriched.json`
- Enrichment report: `frontend/src/knowledge/generated/km-agent/acupoints.enrichment-report.json`
- Public lightweight index: `frontend/public/knowledge/km-agent/acupoints.index.json`
