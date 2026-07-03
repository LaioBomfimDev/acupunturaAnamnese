#!/usr/bin/env node
/**
 * build-quarantine-curation-worksheet.mjs
 *
 * Gera uma PLANILHA DE CURADORIA para os pontos em quarentena no
 * `high-confidence-reviews.json` (marcados por audit-high-confidence-reviews.mjs).
 *
 * NAO altera nenhum dado clinico. E' um artefato de CURADORIA: mostra, lado a lado,
 *   - no JSON: o valor atual (quebrado) de cada campo, para auditoria;
 *   - no Markdown: apenas valor revisado com FONTE e CONFIANCA explicitas,
 * para um acupunturista aprovar/editar (gate humano inegociavel).
 *
 * Fontes de sugestao (rotuladas em cada campo):
 *   - km-agent          : texto ja' em pt-BR no proprio projeto
 *                         (frontend/src/knowledge/generated/km-agent/acupoints.enriched.json)
 *   - km-agent-traduzido: traducao do original zh/ko do km-agent (revisar)
 *   - leitura-ocr       : leitura do OCR quebrado do Atlas (revisar)
 *   - mtc-generica      : conhecimento MTC padrao (conferir contra o livro)
 *
 * Regra conservadora: campos sem fonte clara ficam vazios na sugestao principal.
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
 * As localizacoes dos EX-* sao traducoes do original zh/ko do km-agent.
 * As leituras de OCR sao decifracoes do texto quebrado do proprio Atlas.
 */
const CURATED = {
  // ---- Tier A: EX-* com correspondencia no km-agent --------------------------
  'EX-HN4': {
    tier: 'A', identity: 'Yuyao 魚腰 — ponto ocular',
    sourceTranslation: 'Na região frontal, no centro da sobrancelha, diretamente acima da pupila.',
    location: { value: 'Na região frontal, no centro da sobrancelha, diretamente acima da pupila, com o paciente olhando para frente.', source: 'km-agent-traduzido', confidence: 'alta' },
    actions: { value: 'Remove obstruções, alivia espasmos e interrompe a dor; elimina Calor no Fígado; clareia os olhos.', source: 'leitura-ocr', confidence: 'media' },
    indications: { value: 'Dor supraorbital, hiperemia conjuntival, oftalmoplegia, neuralgia supraorbital, espasmos ou contrações palpebrais.', source: 'leitura-ocr', confidence: 'media' },
    needling: { value: 'Inserção horizontal: 0,3 a 0,5 cun.', source: 'km-agent', confidence: 'alta' },
    reviewNote: '“Paralisia facial” não aparece claramente no fragmento OCR apresentado. Só deve ser incluída se for confirmada no Atlas ou em outra fonte do projeto.',
  },
  'EX-HN6': {
    tier: 'A', identity: 'Erjian 耳尖 — ápice da orelha',
    sourceTranslation: 'No ponto mais alto da orelha.',
    location: { value: 'No ápice da orelha, no ponto mais alto do pavilhão auricular, localizado ao dobrar a orelha para frente.', source: 'km-agent-traduzido', confidence: 'alta' },
    actions: { value: 'Clareia Calor, reduz edema e inflamação, beneficia os olhos e a garganta.', source: 'mtc-generica', confidence: 'media' },
    needling: { value: 'Inserção perpendicular: 0,1 a 0,2 cun. Pode-se usar agulha triangular para sangria.', source: 'km-agent', confidence: 'alta' },
    crossNote: 'O bloco de ações atual coincide com o de EX-HN8 (ponto nasal): foi mal-atribuído. Descartar e usar conteúdo de Erjian.',
  },
  'EX-HN8': {
    tier: 'A', identity: 'Shangyingxiang 上迎香 — ponto nasal / Bitong',
    sourceTranslation: 'No ponto onde a cartilagem nasal encontra a região da concha nasal, na extremidade superior do sulco nasolabial.',
    location: { value: 'Na extremidade superior do sulco nasolabial, onde a cartilagem alar encontra a região da concha nasal.', source: 'km-agent-traduzido', confidence: 'alta' },
    actions: { value: 'Beneficia o nariz e desobstrui as narinas.', source: 'leitura-ocr', confidence: 'media' },
    indications: { value: 'Rinite alérgica, rinite atrófica, rinite hipertrófica, sinusite, pólipos nasais, furúnculos na região do nariz e obstrução nasal.', source: 'leitura-ocr', confidence: 'media' },
    needling: { value: 'Inserção oblíqua: 0,3 a 0,5 cun, em direção para dentro e para cima.', source: 'km-agent', confidence: 'alta' },
  },
  'EX-HN12': {
    tier: 'A', identity: 'Jinjin 金津 — veia sublingual esquerda',
    sourceTranslation: 'Sob a língua, nas veias dos dois lados do frênulo lingual; o lado esquerdo é Jinjin e o lado direito é Yuye.',
    location: { value: 'Na face inferior da língua, sobre a veia do lado esquerdo do frênulo lingual. A veia do lado direito corresponde a Yuye EX-HN13.', source: 'km-agent-traduzido', confidence: 'alta' },
    needling: { value: 'Puntura para sangria.', source: 'km-agent', confidence: 'alta' },
    reviewNote: 'Par de Yuye EX-HN13.',
  },
  'EX-LE2': {
    tier: 'A', identity: 'Heding 鶴頂 — topo da garça',
    sourceTranslation: 'Acima do joelho, na depressão situada sobre o ponto médio da base da patela.',
    location: { value: 'Acima do joelho, na depressão sobre o ponto médio da borda superior da patela.', source: 'km-agent-traduzido', confidence: 'alta' },
    needling: { value: 'Inserção perpendicular: 0,5 a 0,8 cun.', source: 'km-agent', confidence: 'alta' },
  },
  'EX-UE1': {
    tier: 'A', identity: 'Zhoujian 肘尖 — ponta do cotovelo',
    sourceTranslation: 'Na parte posterior do braço, no ponto saliente do olécrano da ulna.',
    location: { value: 'Na face posterior do cotovelo, no ápice do olécrano, com o cotovelo flexionado.', source: 'km-agent-traduzido', confidence: 'alta' },
    needling: { value: 'Moxabustão com 3 a 7 cones.', source: 'km-agent', confidence: 'alta' },
    needlingNote: 'km-agent registra apenas moxa (3 a 7 cones); agulhamento direto não consta.',
  },

  // ---- Tier B: ATLAS-EXTRA com OCR parcialmente legivel -----------------------
  'ATLAS-EXTRA-GENPING': {
    tier: 'B', identity: 'Genping — região do tornozelo/calcâneo',
    location: { value: 'Região posterior do tornozelo, aproximadamente 2 cun acima do osso calcâneo, no meio do tendão do calcâneo, isto é, tendão de Aquiles.', source: 'leitura-ocr', confidence: 'media' },
  },
  'ATLAS-EXTRA-JIANMING': {
    tier: 'B', identity: 'Jianming — ponto ocular',
    location: { value: 'Possivelmente na margem inferior da cavidade orbital, cerca de 0,2 cun da borda orbital. OCR muito fragmentado; confirmar no livro antes de aplicar.', source: 'leitura-ocr', confidence: 'baixa' },
    reviewNote: 'Não aplicar automaticamente. A localização está incompleta e depende de confirmação no Atlas.',
  },
  'ATLAS-EXTRA-SHANGJINGMING': {
    tier: 'B', identity: 'Shangjingming 上睛明 — acima de Jingming B-1',
    location: { value: 'Logo acima de B-1 Jingming. Para localizar, pedir ao paciente que feche os olhos e deslizar o dedo pela margem anterior da órbita até a depressão acima do canto interno do olho.', source: 'leitura-ocr', confidence: 'media' },
    crossNote: 'O bloco de localização de ATLAS-EXTRA-JIANMING-N-1 coincide com este: aquele registro foi mal-atribuído (o conteúdo pertence a este Shangjingming).',
  },
  'ATLAS-EXTRA-SHANGLIANQUAN': {
    tier: 'B', identity: 'Shanglianquan — acima de CV-23 Lianquan',
    location: { value: 'Aproximadamente 1 cun acima da proeminência da cartilagem tireóidea, na depressão muscular entre a borda inferior da mandíbula e o osso hioide.', source: 'leitura-ocr', confidence: 'media' },
  },

  // ---- Tier C: sem fonte utilizavel (re-OCR ou curadoria manual) --------------
  'ATLAS-EXTRA-BICHONG': {
    tier: 'C', identity: 'Bichong 臂中',
    crossNote: 'O conteúdo atual (loc/actions/needling) pertence a Shixuan (10 pontos das pontas dos dedos): mal-atribuído. Descartar tudo.',
    reviewNote: 'A sugestão "ponto médio do antebraço, face anterior, entre PC-3 e PC-7" pode ser usada apenas como hipótese de pesquisa, não como dado curado.',
  },
  'ATLAS-EXTRA-JIANMING-N-1': {
    tier: 'C', identity: 'Jianming n. 1 — ponto ocular',
    crossNote: 'O conteúdo atual pertence a Shangjingming e deve ser removido deste registro.',
  },
  'ATLAS-EXTRA-JIANMING-N-3': {
    tier: 'C', identity: 'Jianming n. 3 — ponto ocular',
    reviewNote: 'Registro vazio. Requer re-OCR da página do Atlas ou curadoria manual.',
  },
  'ATLAS-EXTRA-JIANXI': {
    tier: 'C', identity: 'Jianxi ("abaixo do joelho")',
    reviewNote: 'Registro vazio. Requer re-OCR da página do Atlas ou curadoria manual.',
  },
};

const TIER_SECTIONS = {
  A: {
    title: 'Tier A — km-agent alta confiança',
    subtitle: 'Localização traduzida do zh/ko + agulhamento do projeto',
  },
  B: {
    title: 'Tier B — OCR do Atlas',
    subtitle: 'Usar com revisão manual',
  },
  C: {
    title: 'Tier C — sem fonte utilizável',
    subtitle: 'Não aplicar automaticamente',
  },
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
    for (const field of ['location', 'actions', 'indications', 'needling']) {
      if (curated[field]) suggestions[field] = curated[field];
    }
    // Fallback: needling do km-agent quando existir e nao houver revisao curada.
    const kmNeedling = km?.needling?.ptBr && String(km.needling.ptBr).trim();
    if (!suggestions.needling && kmNeedling) {
      suggestions.needling = { value: kmNeedling, source: 'km-agent', confidence: 'alta' };
    }

    return {
      code: review.code,
      title: review.title,
      tier: curated.tier,
      identity: curated.identity,
      sourceTranslation: curated.sourceTranslation || null,
      crossNote: curated.crossNote || null,
      needlingNote: curated.needlingNote || null,
      reviewNote: curated.reviewNote || null,
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
  const confidenceLabel = confidence => ({ media: 'média', alta: 'alta', baixa: 'baixa' }[confidence] || confidence);
  L.push('# Planilha de curadoria — pontos em quarentena');
  L.push('');
  L.push('## Versão revisada — sem preenchimento inventado');
  L.push('');
  L.push('> Critério usado: manter apenas o que está sustentado pela fonte indicada.');
  L.push('> Campos sem fonte clara permanecem como `—`.');
  L.push('> Pontos com OCR baixo, conteúdo mal-atribuído ou fonte genérica devem ser revisados no livro antes de aplicação.');
  L.push('> Nada aqui foi aplicado aos dados clínicos; é material de revisão.');
  L.push('');
  const byTier = { A: [], B: [], C: [] };
  for (const e of ws.entries) byTier[e.tier].push(e);
  for (const tier of ['A', 'B', 'C']) {
    const section = TIER_SECTIONS[tier];
    L.push(`## ${section.title}`);
    L.push('');
    L.push(`### ${section.subtitle}`);
    L.push('');
    for (const e of byTier[tier]) {
      L.push(`### ${e.code} — ${e.identity || e.title}`);
      if (e.sourceTranslation) {
        L.push('');
        L.push('**Tradução do original:**');
        L.push(e.sourceTranslation);
      }
      L.push('');
      const cell = v => String(v || '').replace(/\s*\n+\s*/g, ' ').replace(/\|/g, '/').trim();
      L.push('| campo | valor revisado | fonte · confiança |');
      L.push('| --- | --- | --- |');
      for (const field of ['location', 'actions', 'indications', 'needling']) {
        const s = e.suggestions[field];
        const sug = s ? cell(s.value) : '—';
        const meta = s ? `${s.source} · ${confidenceLabel(s.confidence)}` : '—';
        L.push(`| ${field} | ${sug} | ${meta} |`);
      }
      if (e.crossNote) {
        L.push('');
        L.push('**Correção importante:**');
        L.push(e.crossNote);
      }
      if (e.needlingNote || e.reviewNote) {
        L.push('');
        L.push('**Nota:**');
        L.push([e.needlingNote, e.reviewNote].filter(Boolean).join(' '));
      }
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
