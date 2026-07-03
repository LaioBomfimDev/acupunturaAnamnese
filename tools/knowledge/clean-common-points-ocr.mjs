#!/usr/bin/env node
// Limpeza de ruido de OCR nos campos clinicos dos PONTOS COMUMENTE USADOS.
//
// Por que existe: os reviews do Atlas Ednea (high-confidence / deep-curated) foram
// extraidos por OCR e chegam com palavras quebradas, cabecalhos/rodapes de pagina
// injetados no meio do texto e numeros trocados. O modal de detalhe do ponto
// (PointReviewDialog) exibe esses campos crus. Esta ferramenta corrige o que e
// INEQUIVOCO (ruido sistematico + dicionario de OCR revisado a mao) e REGISTRA
// duvidas para auditoria do acupunturista, sem inventar conteudo clinico.
//
// Escopo: somente os codigos da categoria "Pontos comumente usados" e somente os
// campos de texto clinico. Mantem auditoria em review.ocrCleanup e gera worksheet
// de duvidas em docs/common-points-ocr-doubts.md.
//
// Uso:
//   node tools/knowledge/clean-common-points-ocr.mjs --dry   (so relatorio, nao grava)
//   node tools/knowledge/clean-common-points-ocr.mjs         (grava JSONs + worksheet)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const HIGH = path.join(ROOT, 'frontend/.local-source-assets/atlas-ednea/high-confidence-reviews.json');
const DEEP = path.join(ROOT, 'frontend/.local-source-assets/atlas-ednea/deep-curated-reviews.json');
const COMMON = path.join(ROOT, 'frontend/src/knowledge/commonlyUsedPoints.js');
const WORKSHEET = path.join(ROOT, 'docs/common-points-ocr-doubts.md');

const DRY = process.argv.includes('--dry');

const TEXT_FIELDS = ['locationText', 'actions', 'indications', 'cautions', 'relatedPatterns', 'needling', 'clinicalNote'];
const CLEAN_CLINICAL_SOURCES = new Set(['reocr_atlas', 'deep_curated_clean']);
const CLEAN_SOURCE_LABELS = {
  reocr_atlas: 'reocr_atlas — leitura direta/re-OCR manual do Atlas',
  deep_curated_clean: 'deep_curated_clean — curadoria profunda limpa equivalente',
};

function normCode(c) {
  return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function loadCommonCodes() {
  const src = fs.readFileSync(COMMON, 'utf8');
  const codes = [...src.matchAll(/code:\s*'([^']+)'/g)].map(m => m[1]);
  return new Set([...new Set(codes)].map(normCode));
}

// ── Regras sistematicas (ruido inequivoco, nao e conteudo clinico) ───────────
function stripRunningHeads(text) {
  let t = text;
  // Cabecalho/rodape de pagina injetado: "( TA/YANG DO PE ) - 361", "( ) - 285",
  // "CANAL DE ENERGIA DO CORACAO (SHAOYIN DA MAO) - 285", "( TA/ E ) - 383".
  // Opcionalmente precedido por um trecho em CAIXA ALTA (nome do canal).
  t = t.replace(/\s*(?:[A-ZÀ-Ú][A-ZÀ-Ú/]*(?:\s+[A-ZÀ-Ú/]+)*\s*)?\(\s*[^)]*\)\s*-\s*\d{2,4}\b/g, ' ');
  // Numero de pagina solto colado: " - 285" / " . 285" remanescente
  t = t.replace(/\s[-.]\s*\d{2,4}\b(?=\s|,|\.|$)/g, ' ');
  return t;
}

// Dicionario de correcoes de OCR revisadas a mao. Cada par e [regex, troca].
// Ordem importa. Mantido conservador: so trocas onde a leitura correta e clara
// pelo contexto. Trechos ambiguos NAO sao trocados aqui; viram duvida.
const WORD_FIXES = [
  // medidas (cun) e fracoes
  [/\bcufl\b/g, 'cun'],
  [/\bc\s*1\s*1?\s*1\b/g, 'cun'],
  [/\bc\s*1\s*1?\s*n\b/g, 'cun'],
  [/\bc\s*1m\b/g, 'cun'],
  [/\bc\s*11n\b/g, 'cun'],
  [/\bc\s+un\b/g, 'cun'],
  [/\bc\s+1m\b/g, 'cun'],
  [/([0-9])\s*[:.]\s*S\b/g, '$1,5'],        // 1:S -> 1,5 ; O:S tratado abaixo
  [/\bO\s*[:.]\s*S\b/g, '0,5'],
  [/\bl\s*[:.]\s*S\b/g, '1,5'],

  // "cm" usado como OCR de "em" (este atlas usa cun, nunca cm)
  [/\bcm\b/g, 'em'],

  // termos clinicos frequentes
  [/\bCa\s*l?\s*or\b/g, 'Calor'],
  [/\bca\s*l\s*or\b/g, 'calor'],
  [/\bPu\s*lm[íi]lo\b/gi, 'Pulmão'],
  [/\bPu\s*lm[ãa]o\b/gi, 'Pulmão'],
  [/\bm[li]lsculo\b/gi, 'músculo'],
  [/\bli1npcza\b/gi, 'limpeza'],
  [/\bMu\s*cosidade\b/g, 'Mucosidade'],
  [/\bmu\s*cosidade\b/g, 'mucosidade'],
  [/\blfngua\b/gi, 'língua'],
  [/\besclcr[óo]tica\b/gi, 'esclerótica'],
  [/\bAtencao\b/g, 'Atenção'],
  [/\bTraosfonna\b/g, 'Transforma'],
  [/\bcransfonna(ç|c)[ãa]o\b/gi, 'transformação'],
  [/\btransfonna(ç|c)[ãa]o\b/gi, 'transformação'],
  [/\bf\s*un\s*[çc][ãa]o\b/gi, 'função'],

  // Yin/Ying/Yuan
  [/\bYi11g\b/g, 'Ying'],
  [/\bYi11\b/g, 'Yin'],
  [/\bYt1an\b/g, 'Yuan'],

  // juncao de hifen de quebra de linha em palavras obvias
  [/patog[êe]-\s*nico/gi, 'patogênico'],
  [/pi-\s*siforme/gi, 'pisiforme'],
  [/para-\s*lisia/gi, 'paralisia'],

  // espacos espurios dentro de palavras comuns do atlas
  [/\bart\s*i\s*cu\s*la(ç|c)/gi, 'articula$1'],
  [/\bcirc\s*ul\s*a(ç|c)[ãa]o\b/gi, 'circulação'],
  [/\bSa\s+n\s*gue\b/g, 'Sangue'],
  [/\bsa\s+n\s*gue\b/g, 'sangue'],
  [/\bE\s*ne\s*r?\s*gia\b/g, 'Energia'],
  [/\ben\s*ergia\b/g, 'energia'],
  [/\bve\s*rt\s*ebral\b/gi, 'vertebral'],
  [/\bco\s+luna\b/gi, 'coluna'],
  [/\bs\s+uperficial\b/gi, 'superficial'],
  [/\bExt\s*er\s*ioriza\b/g, 'Exterioriza'],
  [/\bFo\s*rtalece\b/g, 'Fortalece'],
  [/\bpat\s*ogê\s*ni\s*co\b/gi, 'patogênico'],
  [/\bpatogê\s*ni\s*co\b/gi, 'patogênico'],
  [/\be?\s*x\s*ce\s*ssiva\b/gi, 'excessiva'],
  [/\bJ\s+iao\b/g, 'Jiao'],
  [/\bafecçõcs\b/gi, 'afecções'],
  [/\bhipocond[áa]aca\b/gi, 'hipocondríaca'],
  [/\bidoso\s+s\b/g, 'idosos'],

  // termos MTC/anatomicos recorrentes quebrados (leitura inequivoca pelo contexto)
  [/\bYa\s*n\s*g\b/g, 'Yang'],
  [/\bYa11g\b/g, 'Yang'],
  [/\bShe11\b/g, 'Shen'],
  [/\bm[lõ][li]sculos\b/gi, 'músculos'],
  [/\bm[lõ][li]sculo\b/gi, 'músculo'],
  [/\bm[õo]sculos\b/gi, 'músculos'],
  [/\bm[õo]sculo\b/gi, 'músculo'],
  [/\bo\s+u\b/g, 'ou'],
  [/\bCl\/?\s*1?1\b/g, 'cun'],
  [/\bM[úu]scu\s*lo\b/g, 'Músculo'],
  [/\bm[úu]scu\s*lo\b/g, 'músculo'],
  [/\borif?fcios\b/gi, 'orifícios'],
  [/\borif?fcio\b/gi, 'orifício'],
  [/\bfu\s*n[çc][ãa]o\b/gi, 'função'],
  [/\bInt\s+erno\b/g, 'Interno'],
  [/\bint\s+erno\b/g, 'interno'],
  [/\bVe\s+nto\b/g, 'Vento'],
  [/\bCo\s+ntrola\b/g, 'Controla'],
  [/\bco\s+ntralateral\b/g, 'contralateral'],
  [/\bSanJiao(e)?\b/g, (m, e) => (e ? 'San Jiao e' : 'San Jiao')],
  [/\bsitua\s*se\b/g, 'situa-se'],
  [/\bafec[çc]õ[ec]s\b/gi, 'afecções'],
  [/\bepistax[ce]\b/gi, 'epistaxe'],
  [/\brinorr[ce]ia\b/gi, 'rinorreia'],
  [/\bamenorr[ce]ia\b/gi, 'amenorreia'],
  [/\bdismenorr[ce]ia\b/gi, 'dismenorreia'],
  [/\bDis\s+persa\b/g, 'Dispersa'],
  [/\bdis\s+persa\b/g, 'dispersa'],
  [/\bAcal\s+ma\b/g, 'Acalma'],
  [/\bacal\s+ma\b/g, 'acalma'],
  [/\bmen\s+te\b/g, 'mente'],
  [/\bmen\s+tal\b/g, 'mental'],
  [/\bmen\s+tais\b/g, 'mentais'],
  [/\bpa?\s*t\s*ogê\s*ni\s*co\b/gi, 'patogênico'],
  [/\blibe\s+rt?\s*a\b/g, 'liberta'],
  [/\bsurd\s+ez\b/gi, 'surdez'],
  [/\bcr\s+ian(ça|cas|ças)\b/gi, 'crian$1'],
  [/\bdepress\s+ão\b/gi, 'depressão'],
  [/\bri\s+nite\b/gi, 'rinite'],
  [/\brin\s+ite\b/gi, 'rinite'],
  [/\blí\s*n?\s*gu\s*a\b/gi, 'língua'],
  [/\bUmidade["'’]Calor\b/g, 'Umidade-Calor'],
  [/\bHannoni\d*\.*a\b/g, 'Harmoniza'],
  [/\bRegu\s+l\s*a(riza|riia)?\b/g, (m, s) => (s ? 'Regulariza' : 'Regula')],
  [/\bR\s*eg\s*u\s*l\s*ari[il]a\b/g, 'Regulariza'],

  // juncao de hifen de quebra de linha: "pro- blemas" -> "problemas"
  // (apenas quando o trecho apos o hifen comeca com minuscula = continuacao)
  [/([A-Za-zÀ-ú])-\s+([a-zà-ú])/g, '$1$2'],

  // simbolos de margem/figura injetados pelo OCR (nunca sao conteudo)
  [/[§•*°]/g, ' '],
  [/\s'\d'?(?=\s)/g, ' '],          // "'9", "'l'" soltos
  [/\s::?h\b/g, ' '],
  [/\s0{2,}\s/g, ' '],              // "00" solto entre espacos

  // normaliza espacos multiplos e pontuacao
  [/[ \t]{2,}/g, ' '],
  [/\s+([,.;:])/g, '$1'],
];

function applyWordFixes(text) {
  let t = text;
  for (const [re, rep] of WORD_FIXES) t = t.replace(re, rep);
  return t;
}

function cleanField(text) {
  if (typeof text !== 'string') return text;
  let t = text;
  t = stripRunningHeads(t);
  t = applyWordFixes(t);
  // limpa virgula/ponto inicial orfao (ex.: indications comecando com ", ...")
  t = t.replace(/^[\s,.;]+/, '');
  t = t.replace(/\s{2,}/g, ' ').trim();
  return t;
}

// Heuristica de DUVIDA: trechos que continuam suspeitos apos a limpeza.
// Nao alteramos esses; apenas registramos para o acupunturista revisar.
function collectDoubts(code, field, before, after) {
  const doubts = [];
  // palavras de 1-2 letras validas em PT (nao sinalizar como fragmento)
  const STOP = new Set(['a','o','e','à','á','é','ó','ou','de','do','da','em','no','na','ao','um','se','os','as','ex','é','já','só','né','lá','cá','pé','fé','má','vê','dá','há','eu','te','me','tu','ti','vi','li','lu','du','he','wu','qi','vu','ii','iii','iv','xi','tv']);
  const checks = [
    [/\b[a-zà-úA-ZÀ-Ú]*\d[a-zà-úA-ZÀ-Ú]+\b|\b[a-zà-úA-ZÀ-Ú]+\d[a-zà-úA-ZÀ-Ú]*\b/g, 'token com digito no meio de palavra'],
    [/\b[b-df-hj-np-tv-z]{4,}\b/gi, 'sequencia consonantal improvavel'],
    [/[$§•*°]|::?h/g, 'simbolo/ruido residual'],
    [/[a-zà-ú][A-ZÀ-Ú][a-zà-ú]/g, 'maiuscula no meio da palavra (OCR)'],
  ];
  // fragmentos intra-palavra: tokens de 1-2 letras (fora do dicionario) colados
  // a outra palavra geralmente sao palavras quebradas por espaco do OCR.
  const tokens = String(after).split(/[\s,.;:()]+/).filter(Boolean);
  const splitHits = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^[a-zà-ú]{1,2}$/i.test(t) && !STOP.has(t.toLowerCase())) {
      const next = tokens[i + 1] || '';
      const prev = tokens[i - 1] || '';
      splitHits.push(`…${prev ? prev + ' ' : ''}${t}${next ? ' ' + next : ''}…`);
    }
  }
  if (splitHits.length) doubts.push({ field, label: 'possivel palavra quebrada por espaco', samples: [...new Set(splitHits)].slice(0, 8) });
  for (const [re, label] of checks) {
    const hits = String(after).match(re);
    if (hits) doubts.push({ field, label, samples: [...new Set(hits)].slice(0, 6) });
  }
  return doubts;
}

function cleanReview(review) {
  const doubts = [];
  let changed = false;
  for (const field of TEXT_FIELDS) {
    const v = review[field];
    if (Array.isArray(v)) {
      const next = v.map(item => (typeof item === 'string' ? cleanField(item) : item));
      if (JSON.stringify(next) !== JSON.stringify(v)) changed = true;
      next.forEach((item, i) => {
        if (typeof item === 'string') doubts.push(...collectDoubts(review.code, `${field}[${i}]`, v[i], item));
      });
      review[field] = next;
    } else if (typeof v === 'string') {
      const next = cleanField(v);
      if (next !== v) changed = true;
      // clinicalNote e majoritariamente boilerplate de curadoria (sem acento por
      // design); nao sinalizar duvidas nele para nao afogar o sinal dos campos clinicos.
      if (field !== 'clinicalNote') doubts.push(...collectDoubts(review.code, field, v, next));
      review[field] = next;
    }
  }
  if (changed || doubts.length) {
    review.ocrCleanup = {
      tool: 'tools/knowledge/clean-common-points-ocr.mjs',
      at: new Date().toISOString().slice(0, 10),
      doubtCount: doubts.length,
    };
  }
  return { changed, doubts };
}

// Pontos cujo registro approved_local (high-confidence) tem OCR irrecuperavel,
// MAS existe uma curadoria LIMPA equivalente em deep-curated. Para esses, usamos
// o conteudo clinico limpo (acoes/indicacoes/localizacao/cautelas/agulhamento)
// em vez do OCR degradado. So pontos EXTRA do Atlas, onde o OCR e' o pior.
const PREFER_DEEP_CURATED = new Set(['EXHN3', 'EXHN5']);
const CLINICAL_FIELDS_TO_PREFER = ['locationText', 'actions', 'indications', 'cautions', 'relatedPatterns', 'needling'];

function buildDeepCleanMap() {
  const raw = JSON.parse(fs.readFileSync(DEEP, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.reviews;
  const map = new Map();
  for (const r of arr) map.set(normCode(r.code), r);
  return map;
}

function processFile(file, commonCodes, label, deepCleanMap = null) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const arr = Array.isArray(raw) ? raw : raw.reviews;
  const allDoubts = [];
  const cleanSourceResolutions = [];
  let touched = 0;
  for (const review of arr) {
    const code = normCode(review.code);
    if (!commonCodes.has(code)) continue;
    // Substitui conteudo OCR irrecuperavel pela curadoria limpa do deep-curated.
    if (deepCleanMap && PREFER_DEEP_CURATED.has(code) && deepCleanMap.has(code)) {
      const clean = deepCleanMap.get(code);
      for (const f of CLINICAL_FIELDS_TO_PREFER) {
        if (clean[f] != null) review[f] = JSON.parse(JSON.stringify(clean[f]));
      }
      review.clinicalSource = 'deep_curated_clean';
    }
    const { changed, doubts } = cleanReview(review);
    if (changed) touched++;
    // Pontos ja resolvidos por fonte limpa (re-OCR do Atlas ou curadoria deep limpa)
    // nao entram no worksheet de duvidas — o texto deles e' confiavel.
    const fromCleanSource = CLEAN_CLINICAL_SOURCES.has(review.clinicalSource);
    if (fromCleanSource) {
      cleanSourceResolutions.push({
        code: review.code,
        displayCode: review.displayCode,
        title: review.title,
        clinicalSource: review.clinicalSource,
        residualDoubtCount: doubts.length,
      });
    }
    if (doubts.length && !fromCleanSource) {
      allDoubts.push({ code: review.code, displayCode: review.displayCode, title: review.title, doubts });
    }
  }
  if (!DRY) fs.writeFileSync(file, JSON.stringify(raw, null, 2) + '\n');
  console.log(`${label}: ${touched} pontos limpos, ${allDoubts.length} com duvidas${DRY ? ' (dry-run)' : ''}`);
  return { doubts: allDoubts, cleanSourceResolutions };
}

function renderCleanSourceSection(cleanSourceResolutions) {
  const lines = [];
  lines.push('## Pontos retirados da planilha de dúvidas por fonte limpa');
  lines.push('');
  lines.push('Os pontos abaixo não aparecem na lista de dúvidas porque seus campos clínicos');
  lines.push('foram substituídos por uma fonte limpa rastreável. Isto não libera uso clínico');
  lines.push('automático: todos continuam exigindo auditoria profissional final.');
  lines.push('');

  if (!cleanSourceResolutions.length) {
    lines.push('- Nenhum ponto comum foi retirado por fonte limpa nesta geração.');
    lines.push('');
    return lines;
  }

  const sorted = [...cleanSourceResolutions].sort((a, b) => {
    const sourceOrder = String(a.clinicalSource).localeCompare(String(b.clinicalSource));
    if (sourceOrder !== 0) return sourceOrder;
    return normCode(a.code).localeCompare(normCode(b.code), 'pt-BR', { numeric: true });
  });
  const bySource = new Map();
  for (const entry of sorted) {
    const bucket = bySource.get(entry.clinicalSource) || [];
    bucket.push(entry);
    bySource.set(entry.clinicalSource, bucket);
  }

  for (const [source, entries] of bySource) {
    lines.push(`### ${CLEAN_SOURCE_LABELS[source] || source}`);
    lines.push('');
    for (const entry of entries) {
      const label = entry.displayCode || entry.code;
      const title = entry.title ? ` — ${entry.title}` : '';
      const residual = entry.residualDoubtCount
        ? ` (${entry.residualDoubtCount} ${entry.residualDoubtCount === 1 ? 'sinal residual ignorado' : 'sinais residuais ignorados'} por fonte limpa)`
        : '';
      lines.push(`- \`${label}\`${title}${residual}`);
    }
    lines.push('');
  }
  return lines;
}

function writeWorksheet(highDoubts, cleanSourceResolutions = []) {
  const lines = [];
  lines.push('# Pontos comuns — dúvidas de OCR para revisão profissional');
  lines.push('');
  lines.push('Gerado por `tools/knowledge/clean-common-points-ocr.mjs`. A limpeza automática');
  lines.push('corrigiu ruído inequívoco; os trechos abaixo permaneceram suspeitos e **não foram');
  lines.push('alterados** — exigem leitura do acupunturista contra o Atlas (nada foi inventado).');
  lines.push('');
  lines.push(...renderCleanSourceSection(cleanSourceResolutions));
  for (const entry of highDoubts) {
    lines.push(`## ${entry.displayCode || entry.code} — ${entry.title || ''}`);
    for (const d of entry.doubts) {
      lines.push(`- **${d.field}** (${d.label}): ${d.samples.map(s => `\`${s}\``).join(', ')}`);
    }
    lines.push('');
  }
  if (!DRY) fs.writeFileSync(WORKSHEET, lines.join('\n'));
  console.log(`worksheet: ${highDoubts.length} pontos com dúvidas -> docs/common-points-ocr-doubts.md`);
}

export { cleanField, stripRunningHeads, applyWordFixes, collectDoubts, renderCleanSourceSection };

function main() {
  const commonCodes = loadCommonCodes();
  const deepCleanMap = buildDeepCleanMap();
  const highResult = processFile(HIGH, commonCodes, 'high-confidence', deepCleanMap);
  processFile(DEEP, commonCodes, 'deep-curated');
  writeWorksheet(highResult.doubts, highResult.cleanSourceResolutions);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
