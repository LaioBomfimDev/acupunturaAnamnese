#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function splitCode(value) {
  const match = normalizeCode(value).match(/^([A-Z-]+)(\d+)$/);
  if (!match) return null;
  return { meridian: match[1], number: Number(match[2]) };
}

function findPoint(points, code) {
  const wanted = normalizeCode(code);
  return points.find(point => normalizeCode(point.entity_id || point.code || point.displayCode) === wanted);
}

function getNeighbors(points, code, radius) {
  const parsed = splitCode(code);
  if (!parsed) return [];
  const min = Math.max(1, parsed.number - radius);
  const max = parsed.number + radius;
  return points
    .filter(point => {
      const current = splitCode(point.entity_id || point.code);
      return current && current.meridian === parsed.meridian && current.number >= min && current.number <= max;
    })
    .sort((a, b) => splitCode(a.entity_id).number - splitCode(b.entity_id).number);
}

function parsePointLocations(projectRoot) {
  const mapFile = path.join(projectRoot, 'frontend', 'src', 'knowledge', 'mapLocations.js');
  const text = fs.readFileSync(mapFile, 'utf8');
  const match = text.match(/export const pointLocations\s*=\s*\[([\s\S]*?)\];/);
  if (!match) return [];
  try {
    return Function(`"use strict"; return [${match[1]}];`)();
  } catch {
    return [];
  }
}

function findCurrentLocations(locations, code) {
  const wanted = normalizeCode(code);
  return locations.filter(location => normalizeCode(location.code) === wanted || normalizeCode(location.label) === wanted);
}

function mapCandidates(point) {
  const text = [
    point?.location_en,
    point?.location_ko,
    point?.method,
    point?.meridian,
  ].filter(Boolean).join(' ').toLowerCase();
  const candidates = [];
  const hasFoot = /toe|foot|metatarsal|ankle|malleolus|heel|sole|dorsum of the foot/.test(text);
  const hasHand = /finger|hand|palm|wrist/.test(text);

  if (/ear|auricular|auricula/.test(text)) candidates.push('ear_lateral');
  if (hasFoot) candidates.push('feet_dorsal');
  if (hasHand || (/web/.test(text) && !hasFoot)) candidates.push('hands_palmar');
  if (/anterior|chest|thoracic|abdomen|umbilicus|sternum|clavicle|costal|epigastric/.test(text)) candidates.push('body_front');
  if (/back|posterior|spine|lumbar|sacral|scapula|dorsal region/.test(text)) candidates.push('body_back');
  if (/leg|knee|thigh|tibia|fibula|patella/.test(text)) {
    candidates.push('body_front');
    candidates.push('body_back');
  }

  return [...new Set(candidates)];
}

function compactPoint(point) {
  if (!point) return null;
  return {
    code: point.entity_id || point.code,
    meridian: point.meridian_code,
    nameKo: point.name_ko,
    nameZh: point.name_zh,
    locationEn: point.location_en,
    locationKo: point.location_ko,
    method: point.method,
    needling: point.needling,
    mapCandidates: mapCandidates(point),
  };
}

const args = parseArgs(process.argv.slice(2));
const projectRoot = path.resolve(args['project-root'] || process.cwd());
const code = args.code || args.point;
const radius = Number.parseInt(args.neighbors || '2', 10);

if (!code) {
  console.error('Usage: node acupoint-map-assistant.mjs --project-root <path> --code LR3 --neighbors 2');
  process.exit(2);
}

const rawPath = path.join(projectRoot, 'frontend', 'src', 'knowledge', 'generated', 'km-agent', 'acupoints.raw.json');
const points = readJson(rawPath);
const point = findPoint(points, code);
const locations = parsePointLocations(projectRoot);

const result = {
  code: normalizeCode(code),
  point: compactPoint(point),
  neighbors: getNeighbors(points, code, Number.isFinite(radius) ? radius : 2).map(compactPoint),
  currentLocations: findCurrentLocations(locations, code),
  note: 'Use source anatomy and user-confirmed anchors to propose draft xPct/yPct values. Do not mark inferred points approved.',
};

console.log(JSON.stringify(result, null, 2));
