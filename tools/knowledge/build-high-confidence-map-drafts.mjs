import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const highConfidenceReviewsPath = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea', 'high-confidence-reviews.json');
const mapLocationsPath = path.join(root, 'frontend', 'src', 'knowledge', 'mapLocations.js');
const outputPath = path.join(root, 'frontend', 'src', 'knowledge', 'generated', 'high-confidence-map-locations.js');
const reportJsonPath = path.join(root, 'docs', 'high-confidence-map-drafts.json');
const reportMdPath = path.join(root, 'docs', 'high-confidence-map-drafts.md');

const GENERATED_AT = new Date().toISOString();
const CALIBRATION_STATUS = 'draft_auto_high_confidence';
const SOURCE = 'KM-Agent + Atlas Ednea Martins';
const THRESHOLD = 'confidence high (>80%)';

const ROUTES = {
  LU: [
    { from: 1, to: 11, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [1, 42, 30], [2, 41, 27], [3, 31, 36], [5, 25, 45], [7, 24, 54], [9, 24, 59], [11, 22, 62],
    ] },
  ],
  LI: [
    { from: 1, to: 5, mapId: 'hands_palmar', view: 'palmar', confidence: 'medium', nodes: [
      [1, 73, 13], [2, 72, 25], [3, 70, 37], [4, 68, 80], [5, 66, 92],
    ] },
    { from: 6, to: 20, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [6, 24, 57], [8, 24, 52], [10, 25, 47], [11, 27, 45], [14, 30, 36], [15, 32, 28], [18, 42, 20], [20, 47, 18],
    ] },
  ],
  ST: [
    { from: 1, to: 42, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [1, 48, 17], [4, 48, 21], [8, 45, 11], [12, 45, 25], [18, 45, 35], [25, 48, 51], [30, 53, 62],
      [32, 57, 70], [35, 58, 76], [36, 58, 79], [40, 59, 84], [42, 58, 93],
    ] },
    { from: 43, to: 45, mapId: 'feet_dorsal', view: 'dorsal', confidence: 'medium', nodes: [
      [43, 60, 38], [44, 59, 24], [45, 58, 12],
    ] },
  ],
  SP: [
    { from: 1, to: 5, mapId: 'feet_dorsal', view: 'dorsal', confidence: 'medium', nodes: [
      [1, 45, 11], [2, 44, 25], [3, 44, 43], [4, 45, 55], [5, 46, 67],
    ] },
    { from: 6, to: 21, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [6, 43, 88], [8, 43, 82], [9, 43, 78], [10, 43, 69], [12, 45, 58], [15, 45, 49], [17, 43, 35], [21, 38, 34],
    ] },
  ],
  HT: [
    { from: 1, to: 9, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [1, 35, 33], [2, 31, 38], [3, 28, 45], [5, 28, 53], [7, 28, 56], [9, 26, 62],
    ] },
  ],
  SI: [
    { from: 1, to: 5, mapId: 'hands_palmar', view: 'palmar', confidence: 'medium', nodes: [
      [1, 20, 18], [2, 20, 32], [3, 21, 49], [4, 25, 72], [5, 28, 91],
    ] },
    { from: 6, to: 19, mapId: 'body_back', view: 'posterior', confidence: 'medium', nodes: [
      [6, 27, 57], [8, 27, 48], [10, 31, 36], [12, 36, 30], [15, 43, 24], [17, 42, 18], [19, 45, 15],
    ] },
  ],
  BL: [
    { from: 1, to: 67, mapId: 'body_back', view: 'posterior', confidence: 'medium', nodes: [
      [1, 48, 13], [2, 48, 11], [10, 45, 18], [13, 45, 30], [20, 45, 42], [23, 45, 50], [28, 45, 58],
      [31, 46, 62], [36, 47, 68], [40, 48, 76], [54, 52, 78], [57, 54, 84], [60, 55, 93], [67, 57, 98],
    ] },
  ],
  KI: [
    { from: 1, to: 6, mapId: 'feet_dorsal', view: 'dorsal', confidence: 'medium', nodes: [
      [1, 39, 88], [2, 39, 62], [3, 39, 73], [4, 40, 78], [5, 42, 73], [6, 43, 68],
    ] },
    { from: 7, to: 27, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [7, 54, 91], [10, 53, 78], [12, 53, 61], [16, 53, 51], [20, 53, 42], [24, 52, 32], [27, 51, 25],
    ] },
  ],
  PC: [
    { from: 1, to: 9, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [1, 45, 33], [2, 34, 36], [3, 29, 45], [5, 28, 52], [6, 28, 55], [7, 28, 58], [9, 27, 62],
    ] },
  ],
  TE: [
    { from: 1, to: 5, mapId: 'hands_palmar', view: 'palmar', confidence: 'medium', nodes: [
      [1, 32, 15], [2, 32, 28], [3, 32, 41], [4, 32, 49], [5, 32, 49],
    ] },
    { from: 6, to: 23, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [6, 72, 52], [8, 72, 47], [10, 72, 43], [12, 70, 37], [14, 69, 31], [16, 60, 21], [17, 55, 17], [21, 53, 15], [23, 50, 16],
    ] },
  ],
  GB: [
    { from: 1, to: 44, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [1, 55, 16], [4, 56, 12], [8, 58, 11], [12, 58, 17], [20, 40, 20], [21, 62, 30], [24, 62, 43],
      [26, 62, 54], [30, 64, 63], [31, 64, 70], [34, 62, 74], [37, 61, 84], [40, 60, 93], [44, 62, 97],
    ] },
  ],
  LR: [
    { from: 1, to: 3, mapId: 'feet_dorsal', view: 'dorsal', confidence: 'medium', nodes: [
      [1, 39, 12], [2, 39, 22], [3, 39, 30],
    ] },
    { from: 4, to: 14, mapId: 'body_front', view: 'anterior', confidence: 'medium', nodes: [
      [4, 43, 93], [5, 43, 86], [8, 43, 76], [10, 45, 67], [12, 47, 61], [13, 47, 44], [14, 47, 35],
    ] },
  ],
  CV: [
    { from: 1, to: 24, mapId: 'body_front', view: 'anterior', confidence: 'high', nodes: [
      [1, 50, 64], [3, 50, 58], [6, 50, 56], [8, 50, 51], [12, 50, 43], [14, 50, 38],
      [17, 50, 31], [22, 50, 23], [24, 50, 20],
    ] },
  ],
  GV: [
    { from: 1, to: 28, mapId: 'body_back', view: 'posterior', confidence: 'high', nodes: [
      [1, 50, 64], [3, 50, 56], [4, 50, 51], [8, 50, 42], [14, 50, 25], [16, 50, 18], [20, 50, 7], [24, 50, 12], [28, 50, 20],
    ] },
  ],
};

const MERIDIAN_FROM_CODE = /^([A-Z]+)(\d+)$/;

function normalizePointCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function codeParts(code) {
  const match = normalizePointCode(code).match(MERIDIAN_FROM_CODE);
  if (!match) return null;
  return {
    meridian: match[1],
    number: Number(match[2]),
  };
}

function roundPct(value) {
  return Number(value.toFixed(2));
}

function interpolate(nodes, number) {
  const sorted = [...nodes].sort((a, b) => a[0] - b[0]);
  if (number <= sorted[0][0]) return { xPct: sorted[0][1], yPct: sorted[0][2] };
  if (number >= sorted.at(-1)[0]) return { xPct: sorted.at(-1)[1], yPct: sorted.at(-1)[2] };

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const start = sorted[index];
    const end = sorted[index + 1];
    if (number < start[0] || number > end[0]) continue;
    const ratio = (number - start[0]) / (end[0] - start[0]);
    return {
      xPct: roundPct(start[1] + ((end[1] - start[1]) * ratio)),
      yPct: roundPct(start[2] + ((end[2] - start[2]) * ratio)),
    };
  }

  return null;
}

function routeFor(code) {
  const parts = codeParts(code);
  if (!parts) return null;
  const segments = ROUTES[parts.meridian] || [];
  const segment = segments.find(item => parts.number >= item.from && parts.number <= item.to);
  if (!segment) return null;
  const point = interpolate(segment.nodes, parts.number);
  if (!point) return null;
  return {
    ...point,
    mapId: segment.mapId,
    view: segment.view,
    coordinateConfidence: segment.confidence,
    meridian: parts.meridian,
    number: parts.number,
  };
}

function existingCodesFromMapLocations(source) {
  const match = source.match(/export const pointLocations = (\[[\s\S]*?\n\];)/);
  if (!match) throw new Error('pointLocations nao encontrado.');
  const pointLocations = Function(`return ${match[1].replace(/;$/, '')}`)();
  return {
    pointLocations,
    codes: new Set(pointLocations.map(location => normalizePointCode(location.code)).filter(Boolean)),
  };
}

function isAbove80(review) {
  return review?.status === 'approved_local'
    && (
      review.confidence === 'high'
      || review.approvalThreshold === THRESHOLD
      || review.approvalMethod === 'bulk_high_confidence_operator_request'
    );
}

function generatedModule(locations) {
  const mapIds = [...new Set(locations.map(location => location.mapId))].sort();
  const views = [...new Set(locations.map(location => location.view))].sort();
  const coordinateConfidences = [...new Set(locations.map(location => location.coordinateConfidence))].sort();
  const compactRows = locations.map(location => [
    location.code,
    mapIds.indexOf(location.mapId),
    views.indexOf(location.view),
    location.xPct,
    location.yPct,
    coordinateConfidences.indexOf(location.coordinateConfidence),
  ]);

  return `// Generated by tools/knowledge/build-high-confidence-map-drafts.mjs
// Draft visual coordinates only. Do not mark as clinically approved without visual/professional review.

const MAP_IDS = ${JSON.stringify(mapIds)};
const VIEWS = ${JSON.stringify(views)};
const COORDINATE_CONFIDENCES = ${JSON.stringify(coordinateConfidences)};
const GENERATED_AT = ${JSON.stringify(GENERATED_AT)};
const CALIBRATION_STATUS = ${JSON.stringify(CALIBRATION_STATUS)};
const SOURCE = ${JSON.stringify(SOURCE)};
const SOURCE_CONFIDENCE = ${JSON.stringify(THRESHOLD)};
const ROWS = ${JSON.stringify(compactRows)};

export const highConfidenceMapLocations = ROWS.map(([code, mapIdIndex, viewIndex, xPct, yPct, confidenceIndex]) => ({
  code,
  mapId: MAP_IDS[mapIdIndex],
  view: VIEWS[viewIndex],
  xPct,
  yPct,
  approved: false,
  calibrationStatus: CALIBRATION_STATUS,
  coordinateConfidence: COORDINATE_CONFIDENCES[confidenceIndex],
  sourceConfidence: SOURCE_CONFIDENCE,
  source: SOURCE,
  generatedAt: GENERATED_AT,
}));
`;
}

function reportMarkdown(report) {
  const byMap = Object.entries(report.byMap)
    .map(([, value]) => `- ${value.label}: ${value.count} novos rascunhos`)
    .join('\n');
  const blocked = report.blocked.length
    ? report.blocked.map(item => `- ${item.code}: ${item.reason}`).join('\n')
    : '- Nenhum.';

  return `# Coordenadas visuais automáticas (>80%)

Gerado em: ${report.generatedAt}

## Resultado

- Pontos approved_local com confiança >80%: ${report.counts.highConfidenceReviews}
- Já tinham alguma coordenada visual: ${report.counts.alreadyMapped}
- Novas coordenadas draft geradas: ${report.counts.generated}
- Sem rota visual disponível: ${report.counts.blocked}

## Por mapa

${byMap || '- Nenhum.'}

## Status

Todas as coordenadas geradas ficam como \`${CALIBRATION_STATUS}\`, \`approved: false\` e \`sourceConfidence: ${THRESHOLD}\`.
A confiança >80% pertence à ficha/fonte do ponto, não à precisão final da coordenada visual.

## Bloqueados

${blocked}
`;
}

async function main() {
  const [reviewsPayload, mapLocationsSource] = await Promise.all([
    fs.readFile(highConfidenceReviewsPath, 'utf8').then(JSON.parse),
    fs.readFile(mapLocationsPath, 'utf8'),
  ]);

  const { codes: alreadyMappedCodes } = existingCodesFromMapLocations(mapLocationsSource);
  const reviews = Array.isArray(reviewsPayload.reviews) ? reviewsPayload.reviews : [];
  const highConfidence = reviews
    .filter(isAbove80)
    .filter(review => codeParts(review.code))
    .sort((a, b) => normalizePointCode(a.code).localeCompare(normalizePointCode(b.code), 'en', { numeric: true }));

  const generated = [];
  const blocked = [];
  let alreadyMapped = 0;

  for (const review of highConfidence) {
    const code = normalizePointCode(review.code);
    if (alreadyMappedCodes.has(code)) {
      alreadyMapped += 1;
      continue;
    }
    const route = routeFor(code);
    if (!route) {
      blocked.push({ code, reason: 'Sem rota anatômica configurada para o mapa atual.' });
      continue;
    }
    generated.push({
      code,
      ...route,
    });
  }

  const byMap = generated.reduce((acc, location) => {
    if (!acc[location.mapId]) {
      acc[location.mapId] = {
        label: location.mapId,
        count: 0,
      };
    }
    acc[location.mapId].count += 1;
    return acc;
  }, {});

  const report = {
    schemaVersion: 1,
    generatedAt: GENERATED_AT,
    threshold: THRESHOLD,
    calibrationStatus: CALIBRATION_STATUS,
    counts: {
      highConfidenceReviews: highConfidence.length,
      alreadyMapped,
      generated: generated.length,
      blocked: blocked.length,
    },
    byMap,
    blocked,
    generated,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, generatedModule(generated), 'utf8');
  await fs.writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(reportMdPath, reportMarkdown(report), 'utf8');

  console.log(JSON.stringify({
    output: path.relative(root, outputPath),
    reportJson: path.relative(root, reportJsonPath),
    reportMarkdown: path.relative(root, reportMdPath),
    counts: report.counts,
    byMap,
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
