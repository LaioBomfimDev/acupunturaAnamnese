# Acupoint Map Calibration

## Principle

The system should become smarter as the user teaches it. A confirmed point is an anchor. Nearby points in the same channel can be proposed from source text and meridian order, but they remain drafts until reviewed.

Example:

- User confirms `LR3` on the dorsum of the foot.
- Source text says:
  - `LR1`: great toe, lateral corner of toenail.
  - `LR2`: dorsum of foot, between 1st and 2nd toes, proximal to web margin.
  - `LR3`: dorsum of foot, between 1st and 2nd metatarsals.
- Therefore the system can propose `LR2` distal from `LR3` toward the web between first/second toes, and `LR1` farther distal/lateral at the great toenail. These are draft proposals, not approved clinical truth.

## Source Files

- `frontend/src/knowledge/generated/km-agent/acupoints.raw.json`: best source for location text and meridian sequence.
- `frontend/src/knowledge/generated/km-agent/acupoints.enriched.json`: KM-Agent points enriched with AcuKG relations and controlled pt-BR drafts.
- `frontend/src/knowledge/generated/km-agent/acupoints.enrichment-report.json`: match counts and safety/reporting summary.
- `frontend/src/knowledge/generated/km-agent/acupoints.index.json`: lighter UI index.
- `frontend/src/knowledge/mapLocations.js`: canonical app coordinates.
- `frontend/src/components/panels/MapCoordinateEditor.jsx`: manual calibration UI.

## AcuKG Enrichment Rules

Use `tools/knowledge/enrich-km-agent-with-acukg.mjs` to regenerate the enriched data after AcuKG or KM-Agent source changes.

```powershell
& 'C:\Users\m\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' 'tools\knowledge\enrich-km-agent-with-acukg.mjs' --project-root 'C:\Users\m\Downloads\Sistema Acup'
```

The enriched data is deliberately conservative:

- `location.ptBr` is a controlled draft translation from KM-Agent `location_en`.
- `needling.ptBr` is a controlled draft translation from KM-Agent `needling`.
- `acukg.indications`, `actionTargets`, `anatomy`, and `evidence` are suggestions, not approved content.
- `cautions` and `relatedPatterns` are not auto-filled by this pipeline.
- Partial translations include unresolved terms and must be reviewed before approval.

## Coordinate Model

Coordinates are percentages over the rendered image:

- `xPct`: left to right, 0-100.
- `yPct`: top to bottom, 0-100.

Canonical location object:

```js
{ code: 'LR3', mapId: 'feet_dorsal', view: 'dorsal', xPct: 39, yPct: 30, approved: false, calibrationStatus: 'draft' }
```

Auricular points preserve label:

```js
{ code: 'auricular:shen-men', label: 'Shen Men', mapId: 'ear_lateral', view: 'lateral', xPct: 56, yPct: 30, approved: false, calibrationStatus: 'draft' }
```

## Map IDs

- `body_front`: anterior body.
- `body_back`: posterior body.
- `feet_dorsal`: foot dorsum map; best for toes, metatarsals, ankle/foot points visible from above.
- `hands_palmar`: hand/palm/wrist map.
- `ear_lateral`: auricular map.
- `ear_protocol`: protocol rendering that reuses the lateral ear asset.

## Batch Strategy For 400 Points

Do not review 400 points independently. Work in layers:

1. Establish anchors per map and region:
   - foot: toe tips, web spaces, metatarsal bases, ankle landmarks;
   - hand: fingertips, web spaces, wrist crease, elbow references if visible;
   - body front: midline, abdomen, chest, knee, lower leg;
   - body back: spine, scapula, lumbar/sacral, posterior leg;
   - ear: major auricular zones.
2. Group by meridian and visible map region.
3. Use source text to classify each point into a region.
4. Interpolate between anchors only along the same anatomical route.
5. Review low-confidence groups last.
6. Keep all generated positions as draft unless the user confirms.

## Inference Rules

Use these rules in order:

1. Direct user click/confirmation beats every inference.
2. Source `location_en` / `location_ko` beats numeric meridian order.
3. Nearby same-meridian points help orientation.
4. Existing canonical coordinates are anchors only if they are visually plausible.
5. Do not infer across different maps unless the source clearly names that map region.

## Confidence Labels

Use these labels in notes or generated batches:

- `confirmed`: user explicitly placed or approved.
- `high`: landmark is clear and adjacent anchors agree.
- `medium`: source location is clear but anchor coverage is partial.
- `low`: only rough anatomical region is known.
- `blocked`: map asset does not show the anatomical landmark needed.

Canonical `pointLocations` currently has only `approved` and `calibrationStatus`; if adding richer metadata, keep backward compatibility.

## Region Classifier Hints

Use source text keywords:

- Foot/toe/metatarsal/ankle/malleolus/heel/sole: `feet_dorsal` or body lower limb; choose `feet_dorsal` for detailed foot placement.
- Finger/hand/palm/wrist/web: `hands_palmar`.
- Ear/auricular: `ear_lateral`.
- Anterior/chest/abdomen/umbilicus/sternum: `body_front`.
- Back/posterior/spine/lumbar/scapula/sacral: `body_back`.
- Knee/leg/thigh: body map; choose anterior/posterior based on source wording and visible landmark.

## Review Output Format

When proposing a batch, report:

```text
Point: LR2
Map: feet_dorsal
Proposed: x 39.5 / y 36.5
Reason: between 1st and 2nd toes, distal to LR3 and proximal to web margin.
Confidence: medium
Status: draft, needs visual review
```

## Safety Boundary

Map calibration is a visual information task, not a clinical approval task. A marker can be visually useful while still requiring professional confirmation before being marked approved.
