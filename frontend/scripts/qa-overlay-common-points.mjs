// QA visual: extrai as coordenadas curadas (commonlyUsedMapLocations) e grava
// um JSON por mapa, consumido pelo script Python que sobrepõe marcadores nas
// imagens reais para conferência. Não faz parte do build.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const server = await createServer({
  root,
  logLevel: 'silent',
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const mod = await server.ssrLoadModule('/src/knowledge/commonlyUsedMapLocations.js');
  const byMap = {};
  for (const loc of mod.commonlyUsedMapLocations) {
    (byMap[loc.mapId] ||= []).push({ code: loc.code, xPct: loc.xPct, yPct: loc.yPct });
  }
  writeFileSync(path.join(here, 'qa-overlay-points.json'), JSON.stringify(byMap, null, 2));
  console.log('wrote qa-overlay-points.json', Object.fromEntries(Object.entries(byMap).map(([k, v]) => [k, v.length])));
} finally {
  await server.close();
}
