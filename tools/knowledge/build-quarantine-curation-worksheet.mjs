#!/usr/bin/env node
/**
 * build-quarantine-curation-worksheet.mjs
 *
 * Gera uma PLANILHA DE SUGESTOES para os pontos em quarentena no
 * `high-confidence-reviews.json` (marcados por audit-high-confidence-reviews.mjs).
 *
 * NAO altera nenhum dado clinico. E' um artefato de CURADORIA: mostra, lado a lado,
 *   - o valor atual (quebrado) de cada campo, e
 *   - uma sugestao com FONTE e CONFIANCA explicitas,
 * para um acupunturista aprovar/editar (gate humano inegociavel).
 *
 * Fontes de sugestao (rotuladas em cada campo):
 *   - km-agent          : texto ja' em pt-BR no proprio projeto
 *                         (frontend/src/knowledge/generated/km-agent/acupoints.enriched.json)
 *   - km-agent-traduzido: traducao do original zh/ko do km-agent (revisar)
 *   - leitura-ocr       : leitura do OCR quebrado do Atlas (revisar)
 *   - mtc-generica      : conhecimento MTC padrao (conferir contra o livro)
 *
 * Uso: node tools/knowledge/build-quarantine-curation-worksheet.mjs
 * Saida: docs/quarantine-curation-worksheet.md  +  .json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

const REVIEWS_PATH = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea', 'high-confidence-reviews.json');
const ENRICHED_PATH = path.join(root, 'frontend', 'src', 'knowledge', 'generated', 'km-agent', 'acupoints.enriched.json');
const OUT_MD = path.join(root, 'docs', 'quarantine-curation-worksheet.md');
const OUT_JSON = path.join(root, 'docs', 'quarantine-curation-worksheet.json');

const asText = v => (Array.isArray(v) ? v.filter(Boolean).join(' | ') : (v == null ? '' : String(v)));

/**
 * Overlay curado por campo. Cada sugestao: { value, source, confidence }.
 * needling dos EX-* e' puxado do km-agent em runtime (verbatim) e nao fica aqui.
 * As localizacoes dos EX-* sao traducoes do original zh/ko do km-agent.
 * As leituras de OCR sao decifracoes do texto quebrado do proprio Atlas.
 */
const CURATED = {
  // ---- Tier A: EX-* com correspondencia no km-agent --------------------------
  'EX-HN4': {
    tier: 'A', identity: 'Yuyao (魚腰) — "cintura do peixe", ponto ocular',
    location: { value: 'Na regiao frontal, no centro da sobrancelha, diretamente acima da pupila (olhar para frente).', source: 'km-agent-traduzido', confidence: 'alta' },
    actions: { value: 'Remove obstrucoes, alivia espasmos e interrompe a dor; elimina Calor no Figado; clareia e ilumina os olhos.', source: 'leitura-ocr', confidence: 'media' },
    indications: { value: 'Dor supraorbital, hiperemia da conjuntiva, oftalmoplegia, neuralgia supraorbital, espasmo/contracao das palpebras, paralisia facial.', source: 'leitura-ocr', confidence: 'media' },
  },
  'EX-HN6': {
    tier: 'A', identity: 'Erjian (耳尖) — "apice da orelha"',
    location: { value: 'No apice (ponto mais alto) da orelha, dobrando o pavilhao auricular para a frente.', source: 'km-agent-traduzido', confidence: 'alta' },
    actions: { value: 'Clareia Calor, reduz edema e inflamacao, beneficia olhos e garganta. (ATENCAO: o conteudo atual pertence a um ponto nasal — descartar.)', source: 'mtc-generica', confidence: 'media' },
    crossNote: 'O bloco de actions atual coincide com o de EX-HN8 (ponto nasal): foi mal-atribuido. Descartar e usar conteudo de Erjian.',
  },
  'EX-HN8': {
    tier: 'A', identity: 'Shangyingxiang (上迎香) — "acima do Yingxiang", ponto nasal (Bitong)',
    location: { value: 'Na extremidade superior do sulco nasolabial, onde a cartilagem alar encontra a borda da concha nasal.', source: 'km-agent-traduzido', confidence: 'alta' },
    actions: { value: 'Beneficia o nariz e desobstrui as narinas.', source: 'leitura-ocr', confidence: 'media' },
    indications: { value: 'Rinite alergica, rinite atrofica, rinite hipertrofica, sinusite, polipos nasais, furunculos na regiao do nariz, obstrucao nasal.', source: 'leitura-ocr', confidence: 'media' },
  },
  'EX-HN12': {
    tier: 'A', identity: 'Jinjin (金津) — veia sublingual esquerda (par de Yuye EX-HN13)',
    location: { value: 'Na face inferior da lingua, sobre a veia do lado ESQUERDO do frenulo lingual (o lado direito corresponde a Yuye).', source: 'km-agent-traduzido', confidence: 'alta' },
  },
  'EX-LE2': {
    tier: 'A', identity: 'Heding (鶴頂) — "topo da garca"',
    location: { value: 'Acima do joelho, na depressao sobre o ponto medio da borda superior da patela.', source: 'km-agent-traduzido', confidence: 'alta' },
  },
  'EX-UE1': {
    tier: 'A', identity: 'Zhoujian (肘尖) — "ponta do cotovelo"',
    location: { value: 'Na face posterior do braco, no apice do olecrano (ponta do cotovelo), com o cotovelo flexionado.', source: 'km-agent-traduzido', confidence: 'alta' },
    needlingNote: 'km-agent registra apenas moxa (3 a 7 cones); agulhamento direto nao consta.',
  },

  // ---- Tier B: ATLAS-EXTRA com OCR parcialmente legivel -----------------------
  'ATLAS-EXTRA-GENPING': {
    tier: 'B', identity: 'Genping — regiao do tornozelo/calcaneo',
    location: { value: 'Regiao posterior do tornozelo, ~2 cun acima do osso calcaneo, no meio do tendao do calcaneo (Aquiles).', source: 'leitura-ocr', confidence: 'media' },
  },
  'ATLAS-EXTRA-JIANMING': {
    tier: 'B', identity: 'Jianming ("fortalece o brilho") — ponto ocular',
    location: { value: 'Na margem inferior da cavidade orbital, ~0,2 cun da borda (ponto periocular). OCR muito fragmentado — confirmar no livro.', source: 'leitura-ocr', confidence: 'baixa' },
  },
  'ATLAS-EXTRA-SHANGJINGMING': {
    tier: 'B', identity: 'Shangjingming (上睛明) — "acima do Jingming (B-1)"',
    location: { value: 'Logo acima de B-1 (Jingming): com os olhos fechados, deslizar o dedo pela margem anterior da orbita ate a depressao acima do canto interno do olho.', source: 'leitura-ocr', confidence: 'media' },
    crossNote: 'O bloco de localizacao de ATLAS-EXTRA-JIANMING-N-1 coincide com este: aquele registro foi mal-atribuido (o conteudo pertence a este Shangjingming).',
  },
  'ATLAS-EXTRA-SHANGLIANQUAN': {
    tier: 'B', identity: 'Shanglianquan — ponto da garganta (acima de CV-23 Lianquan)',
    location: { value: '~1 cun acima da proeminencia da cartilagem tireoidea, na depressao muscular entre a borda inferior da mandibula e o osso hioide.', source: 'leitura-ocr', confidence: 'media' },
  },

  // ---- Tier C: sem fonte utilizavel (re-OCR ou curadoria manual) --------------
  'ATLAS-EXTRA-BICHONG': {
    tier: 'C', identity: 'Bichong (臂中) — "meio do antebraco"',
    location: { value: 'Ponto medio do antebraco (face anterior), entre PC-3 (Quze) e PC-7 (Daling), entre os ossos. CONFERIR contra o livro.', source: 'mtc-generica', confidence: 'baixa' },
    crossNote: 'O conteudo atual (loc/actions/needling) pertence a Shixuan (10 pontos das pontas dos dedos): mal-atribuido. Descartar tudo.',
  },
  'ATLAS-EXTRA-JIANMING-N-1': {
    tier: 'C', identity: 'Jianming n. 1 — ponto ocular',
    crossNote: 'O conteudo atual pertence a Shangjingming (mal-atribuido). Sem dado proprio: precisa re-OCR da pagina do Atlas ou curadoria manual.',
  },
  'ATLAS-EXTRA-JIANMING-N-3': {
    tier: 'C', identity: 'Jianming n. 3 — ponto ocular',
    crossNote: 'Registro completamente vazio. Precisa re-OCR da pagina do Atlas ou curadoria manual.',
  },
  'ATLAS-EXTRA-JIANXI': {
    tier: 'C', identity: 'Jianxi ("abaixo do joelho")',
    crossNote: 'Registro completamente vazio. Precisa re-OCR da pagina do Atlas ou curadoria manual.',
  },
};

const TIER_LABEL = {
  A: 'A — km-agent (alta): localizacao traduzida do zh/ko + agulhamento pt-BR do projeto',
  B: 'B — leitura do OCR (media): texto do Atlas decifrado, revisar',
  C: 'C — sem fonte utilizavel: re-OCR da pagina ou curadoria manual',
};

function loadEnriched() {
  const map = new Map();
  if (!fs.existsSync(ENRICHED_PATH)) return map;
  const json = JSON.parse(fs.readFileSync(ENRICHED_PATH, 'utf8'));
  const arr = Array.isArray(json) ? json : (json.points || json.acupoints || json.items || []);
  for (const item of arr) if (item.code) map.set(item.code, item);
  return map;
}

export function buildWorksheet({ pkg, enriched } = {}) {
  // dados injetaveis para teste; por padrao le' os arquivos do projeto.
  pkg = pkg || JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8'));
  enriched = enriched || loadEnriched();
  const quarantined = (pkg.reviews || []).filter(r => r.dataQuality?.blockedFromClinical);

  const entries = quarantined.map(review => {
    const curated = CURATED[review.code] || { tier: 'C', identity: review.title };
    const km = enriched.get(review.code);

    const suggestions = {};
    for (const field of ['location', 'actions', 'indications']) {
      if (curated[field]) suggestions[field] = curated[field];
    }
    // needling: verbatim do km-agent quando existir (fonte de maior confianca)
    const kmNeedling = km?.needling?.ptBr && String(km.needling.ptBr).trim();
    if (kmNeedling) {
      suggestions.needling = { value: kmNeedling, source: 'km-agent', confidence: 'alta' };
    }

    return {
      code: review.code,
      title: review.title,
      tier: curated.tier,
      identity: curated.identity,
      crossNote: curated.crossNote || null,
      needlingNote: curated.needlingNote || null,
      current: {
        location: asText(review.locationText),
        actions: asText(review.actions),
        indications: asText(review.indications),
        needling: asText(review.needling),
      },
      kmAgent: km ? { zh: km.names?.zh || '', ko: km.names?.ko || '', locationOriginal: km.location?.originalKo || km.location?.original || '' } : null,
      suggestions,
    };
  });

  entries.sort((a, b) => (a.tier + a.code).localeCompare(b.tier + b.code));
  return { generatedAt: new Date().toISOString(), total: entries.length, entries };
}

function renderMd(ws) {
  const L = [];
  L.push('# Planilha de curadoria — pontos em quarentena');
  L.push('');
  L.push(`> Gerada por \`tools/knowledge/build-quarantine-curation-worksheet.mjs\` em ${ws.generatedAt.slice(0, 10)}.`);
  L.push('> **Nada aqui foi aplicado aos dados.** Sao SUGESTOES para o acupunturista aprovar/editar.');
  L.push('> Fontes: `km-agent` (pt-BR do projeto) · `km-agent-traduzido` (do zh/ko, revisar) · `leitura-ocr` (Atlas decifrado, revisar) · `mtc-generica` (padrao, conferir no livro).');
  L.push('');
  const byTier = { A: [], B: [], C: [] };
  for (const e of ws.entries) byTier[e.tier].push(e);
  for (const tier of ['A', 'B', 'C']) {
    L.push(`## Tier ${TIER_LABEL[tier]}`);
    L.push('');
    for (const e of byTier[tier]) {
      L.push(`### ${e.code} — ${e.identity || e.title}`);
      if (e.crossNote) L.push(`> ⚠️ ${e.crossNote}`);
      if (e.kmAgent && e.kmAgent.locationOriginal) L.push(`> km-agent original (${e.kmAgent.zh} / ${e.kmAgent.ko}): \`${e.kmAgent.locationOriginal}\``);
      L.push('');
      const cell = v => String(v || '').replace(/\s*\n+\s*/g, ' / ').replace(/\|/g, '/').trim();
      L.push('| campo | valor atual (quebrado) | sugestao | fonte · confianca |');
      L.push('|---|---|---|---|');
      for (const field of ['location', 'actions', 'indications', 'needling']) {
        const cur = cell(e.current[field]).slice(0, 90) || '—';
        const s = e.suggestions[field];
        const sug = s ? cell(s.value) : '—';
        const meta = s ? `${s.source} · ${s.confidence}` : '—';
        L.push(`| ${field} | ${cur} | ${sug} | ${meta} |`);
      }
      if (e.needlingNote) L.push(`\n_needling: ${e.needlingNote}_`);
      L.push('');
    }
  }
  return L.join('\n');
}

export function run() {
  const ws = buildWorksheet();
  fs.writeFileSync(OUT_JSON, JSON.stringify(ws, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_MD, renderMd(ws), 'utf8');
  return ws;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const ws = run();
  const byTier = ws.entries.reduce((a, e) => ((a[e.tier] = (a[e.tier] || 0) + 1), a), {});
  console.log(`[worksheet] ${ws.total} pontos | tier A=${byTier.A || 0} B=${byTier.B || 0} C=${byTier.C || 0}`);
  console.log(`[worksheet] ${path.relative(root, OUT_MD)}`);
}
