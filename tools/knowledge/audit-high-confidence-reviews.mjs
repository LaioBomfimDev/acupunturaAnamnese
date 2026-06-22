#!/usr/bin/env node
/**
 * audit-high-confidence-reviews.mjs
 *
 * Varredura de qualidade clinica do pacote local `high-confidence-reviews.json`.
 *
 * O pacote foi extraido por OCR do "Atlas dos Pontos de Acupuntura" e contem
 * erros graves que NAO podem alimentar o raciocinio clinico sem revisao humana:
 *   1. Registros com conteudo atribuido ao ponto ERRADO (mis-attribution).
 *   2. Campos clinicos essenciais vazios (localizacao/acoes/indicacoes/agulhamento).
 *   3. Texto de OCR corrompido.
 *   4. Campos misturados (uma secao dentro de outra).
 *   5. Cabecalhos/rodapes do PDF dentro dos dados clinicos.
 *   6. Campo `techniques` em formatos inconsistentes.
 *   7. Titulos genericos ou com lixo de OCR.
 *
 * Principios (ver memorias do projeto):
 *   - "gate humano inegociavel": registros perigosos sao BLOQUEADOS do uso clinico,
 *     nunca "consertados" por adivinhacao.
 *   - "nao over-claim": apenas correcoes mecanicas/derivaveis de dados do PROPRIO
 *     projeto sao aplicadas (techniques, titulos via km-agent, remocao de banners).
 *   - Conteudo clinico corrompido e' apenas SINALIZADO para curadoria humana.
 *
 * Uso:
 *   node tools/knowledge/audit-high-confidence-reviews.mjs           # dry-run: so' relatorio
 *   node tools/knowledge/audit-high-confidence-reviews.mjs --apply   # aplica correcoes seguras + quarentena
 *
 * Saidas:
 *   docs/high-confidence-reviews-audit.md     (relatorio humano)
 *   docs/high-confidence-reviews-audit.json   (relatorio maquina)
 *   frontend/.local-source-assets/atlas-ednea/high-confidence-reviews.json (com --apply)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');

export const REVIEWS_PATH = path.join(
  root, 'frontend', '.local-source-assets', 'atlas-ednea', 'high-confidence-reviews.json',
);
export const ENRICHED_PATH = path.join(
  root, 'frontend', 'src', 'knowledge', 'generated', 'km-agent', 'acupoints.enriched.json',
);
export const AUDIT_MD_PATH = path.join(root, 'docs', 'high-confidence-reviews-audit.md');
export const AUDIT_JSON_PATH = path.join(root, 'docs', 'high-confidence-reviews-audit.json');

/**
 * Registros confirmados manualmente como tendo conteudo atribuido ao ponto ERRADO.
 * O trecho de OCR pertence a outro ponto. Bloqueio rigido.
 */
export const HARD_MISATTRIBUTED = new Map([
  ['ATLAS-EXTRA-BICHONG', 'Trecho descreve Shixuan (insercao distal nas unhas / 10 pontos das pontas dos dedos), nao Bichong.'],
  ['ATLAS-EXTRA-JIANMING-N-1', 'Trecho comeca em Shangjingming / B-1 (Jingming), nao Jianming n. 1.'],
  ['EX-HN6', 'Trecho descreve nariz (rinite/sinusite/Shangyingxiang/Bitong); km-agent confirma EX-HN6 = Erjian (apice da orelha).'],
]);

const ESSENTIAL_FIELDS = [
  ['locationText', 'localizacao'],
  ['actions', 'acoes/funcoes'],
  ['indications', 'indicacoes'],
  ['needling', 'metodo/agulhamento'],
];

// ----------------------------------------------------------------------------
// helpers de texto
// ----------------------------------------------------------------------------

export function asText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(' ');
  return value == null ? '' : String(value);
}

export function isBlankField(value) {
  // remove pontuacao/ruido leve antes de decidir se ha conteudo util
  return asText(value).replace(/[\s.,;:''"`~!|()\-]/g, '').trim().length === 0;
}

// Banners de cabecalho/rodape do PDF (canal de energia, vasos, secoes).
// Tolerante a ruido de OCR: casa runs em CAIXA ALTA contendo vocabulario de banner.
const BANNER_KEYWORDS = /CANAL\s*DE\s*EN|ENERG\s*I?A|MERIDIAN|YANGMIN|YANCMIN|YAN\s*G|SHAOYIN|TAIYAN|TAJYAN|JUEYIN|UUEYIN|VASO\s+(GOVERNADOR|CONC)|PONTOS?\s+EXTRA|DA\s+M[AÃ]O|DO\s+P[EÉ]/;
const CAPS_RUN = /\b[A-ZÀ-Ú][A-ZÀ-Ú\s.]{8,}[A-ZÀ-Ú]\b/g;

export function stripPdfBanners(value) {
  if (Array.isArray(value)) {
    return value.map(stripPdfBanners).map(s => (typeof s === 'string' ? s.trim() : s)).filter(s => !isBlankField(s));
  }
  if (typeof value !== 'string') return value;
  let out = value;
  let stripped = 0;
  out = out.replace(CAPS_RUN, run => {
    if (BANNER_KEYWORDS.test(run)) { stripped += 1; return ' '; }
    return run;
  });
  // colapsa espacos e pontuacao orfa deixada pela remocao
  out = out.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  return out;
}

// Heuristica de corrupcao de OCR: glifos raros, caixa misturada no meio da palavra,
// digito no meio da palavra. Quanto maior o score, mais quebrado o texto.
const OCR_GLYPH = /[!~|º¡]|\\|[a-zà-ú][A-ZÀ-Ú][a-zà-ú]|\d[a-zà-ú]{2}|[a-zà-ú]{2}\d/g;

export function ocrCorruptionScore(value) {
  const matches = asText(value).match(OCR_GLYPH);
  return matches ? matches.length : 0;
}

// Rotulos de secao que NAO deveriam aparecer dentro de outro campo.
const FOREIGN_SECTION = /(M[eé]todo|Fun[cç][oõ]es?\s+energ[eé]tic|Indica[cç][oõ]es|Exemplos?\s+de\s+combina|Fun[cç][aã]o\s+energ)/i;

export function hasMixedSection(review) {
  return (
    FOREIGN_SECTION.test(asText(review.locationText)) ||
    FOREIGN_SECTION.test(asText(review.needling)) ||
    /Exemplos?\s+de\s+combina/i.test(asText(review.indications)) ||
    /(canal\s+de\s+energia|n[uú]mero?\s+da?\s+p[aá]gina|^\s*\d{2,4}\s*$)/i.test(asText(review.actions))
  );
}

// ----------------------------------------------------------------------------
// techniques: normaliza para lista limpa
// ----------------------------------------------------------------------------

const TECHNIQUE_ALIASES = new Map([
  ['agulha', 'agulha'], ['agulhamento', 'agulha'],
  ['moxa', 'moxa'], ['moxabustao', 'moxa'], ['moxabustão', 'moxa'],
  ['ventosa', 'ventosa'], ['ventosaterapia', 'ventosa'],
  ['laser', 'laser'], ['stiper', 'stiper'], ['sangria', 'sangria'],
  ['eletroacupuntura', 'eletroacupuntura'], ['acupressao', 'acupressao'],
]);

export function normalizeTechniques(techniques) {
  if (!Array.isArray(techniques)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of techniques) {
    for (const part of String(raw).split(/[,;/]+/)) {
      const token = part.trim().toLowerCase().replace(/[.]+$/, '');
      if (!token) continue;
      const canonical = TECHNIQUE_ALIASES.get(token) || token;
      if (seen.has(canonical)) continue;
      seen.add(canonical);
      out.push(canonical);
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// titulos: reconstroi a partir dos nomes canonicos do proprio projeto (km-agent)
// ----------------------------------------------------------------------------

const GENERIC_TITLE = /Ponto do meridiano/i;

export function loadCanonicalNames(enrichedPath = ENRICHED_PATH) {
  const map = new Map();
  if (!fs.existsSync(enrichedPath)) return map;
  try {
    const json = JSON.parse(fs.readFileSync(enrichedPath, 'utf8'));
    const arr = Array.isArray(json) ? json : (json.points || json.acupoints || json.items || []);
    for (const item of arr) {
      const code = item.code || item.id;
      if (!code || !item.names) continue;
      map.set(code, item.names);
    }
  } catch { /* sem mapa de nomes */ }
  return map;
}

export function rebuildTitle(review, namesMap) {
  const names = namesMap.get(review.code) || namesMap.get(review.displayCode);
  const pinyin = names && String(names.pinyin || '').trim();
  const meaning = names && String(names.en || '').trim();
  if (!pinyin) return null; // sem fonte confiavel -> nao inventa
  const code = review.displayCode || review.code;
  return meaning ? `${code} (${pinyin}) - ${meaning}` : `${code} (${pinyin})`;
}

export function titleNeedsFix(review) {
  if (GENERIC_TITLE.test(review.title || '')) return 'generic';
  if (ocrCorruptionScore(review.title) >= 2) return 'ocr';
  return null;
}

// ----------------------------------------------------------------------------
// avaliacao por registro
// ----------------------------------------------------------------------------

export function assessRecord(review, namesMap) {
  const issues = [];
  const missingEssential = [];

  for (const [field, label] of ESSENTIAL_FIELDS) {
    if (isBlankField(review[field])) missingEssential.push(label);
  }
  if (missingEssential.length) {
    issues.push({ type: 'empty_essential', detail: missingEssential.join(', ') });
  }

  const misReason = HARD_MISATTRIBUTED.get(review.code);
  if (misReason) issues.push({ type: 'misattributed', detail: misReason });

  if (ocrCorruptionScore([review.locationText, review.actions, review.indications, review.needling]) >= 3) {
    issues.push({ type: 'ocr_corruption', detail: 'texto clinico com forte ruido de OCR' });
  }
  if (hasMixedSection(review)) {
    issues.push({ type: 'mixed_fields', detail: 'secao de outro campo encontrada dentro de um campo clinico' });
  }
  const bannerHit = CAPS_RUN.test(asText(review.locationText) + ' ' + asText(review.actions) + ' ' + asText(review.indications) + ' ' + asText(review.needling));
  CAPS_RUN.lastIndex = 0;
  if (bannerHit && BANNER_KEYWORDS.test(asText(review.locationText) + asText(review.actions) + asText(review.indications) + asText(review.needling))) {
    issues.push({ type: 'pdf_banner', detail: 'cabecalho/rodape do PDF dentro dos dados' });
  }
  const titleFix = titleNeedsFix(review);
  if (titleFix) issues.push({ type: 'bad_title', detail: titleFix });

  // Decisao de bloqueio clinico (quarentena) — calibrada pelo sinal real do operador:
  //   - mis-attribution confirmada (conteudo de outro ponto), OU
  //   - sem localizacao (impossivel aplicar um acuponto sem localiza-lo), OU
  //   - so' 1 dos 4 campos essenciais presente (registro praticamente vazio).
  // Registros COM localizacao + alguma funcao continuam ativos, porem sinalizados
  // como needs_cleanup (principio "meta 80% funcional"); nao se bloqueia conteudo
  // util so' por estar baguncado.
  const blockedFromClinical = Boolean(
    misReason ||
    missingEssential.includes('localizacao') ||
    missingEssential.length >= 3,
  );

  let status = 'clean';
  if (blockedFromClinical) status = 'quarantine';
  else if (issues.length) status = 'needs_cleanup';

  return { status, blockedFromClinical, issues, missingEssential };
}

// ----------------------------------------------------------------------------
// pipeline principal
// ----------------------------------------------------------------------------

export function auditReviews(pkg, namesMap) {
  const records = Array.isArray(pkg.reviews) ? pkg.reviews : [];
  const titleFixes = [];
  let techniquesNormalized = 0;
  let bannersStripped = 0;

  const assessed = records.map(original => {
    const review = { ...original };

    // --- correcao mecanica 1: techniques ---
    const normTech = normalizeTechniques(review.techniques);
    if (JSON.stringify(normTech) !== JSON.stringify(review.techniques)) {
      review.techniques = normTech;
      techniquesNormalized += 1;
    }

    // --- correcao mecanica 2: remover banners do PDF dos campos clinicos ---
    for (const field of ['locationText', 'actions', 'indications', 'needling']) {
      const before = JSON.stringify(review[field]);
      const after = stripPdfBanners(review[field]);
      if (JSON.stringify(after) !== before) {
        review[field] = after;
        bannersStripped += 1;
      }
    }

    // --- correcao mecanica 3: titulo a partir de nomes canonicos do projeto ---
    const titleKind = titleNeedsFix(review);
    if (titleKind) {
      const rebuilt = rebuildTitle(review, namesMap);
      if (rebuilt && rebuilt !== review.title) {
        titleFixes.push({ code: review.code, kind: titleKind, from: review.title, to: rebuilt });
        review.title = rebuilt;
      }
    }

    // --- avaliacao (apos correcoes mecanicas, para nao bloquear por banner ja removido) ---
    const assessment = assessRecord(review, namesMap);
    review.dataQuality = {
      status: assessment.status,
      blockedFromClinical: assessment.blockedFromClinical,
      issues: assessment.issues,
      missingEssential: assessment.missingEssential,
      auditedAt: new Date().toISOString().slice(0, 10),
      auditTool: 'tools/knowledge/audit-high-confidence-reviews.mjs',
    };
    if (assessment.blockedFromClinical) {
      review.requiresProfessionalAudit = true;
    }
    return { review, assessment };
  });

  return { assessed, stats: { titleFixes, techniquesNormalized, bannersStripped } };
}

function buildReport(assessed, stats) {
  const byStatus = { clean: [], needs_cleanup: [], quarantine: [] };
  const byIssue = {};
  for (const { review, assessment } of assessed) {
    byStatus[assessment.status].push(review.code);
    for (const issue of assessment.issues) {
      (byIssue[issue.type] = byIssue[issue.type] || []).push(review.code);
    }
  }
  const quarantine = assessed
    .filter(a => a.assessment.blockedFromClinical)
    .map(a => ({
      code: a.review.code,
      title: a.review.title,
      reasons: a.assessment.issues.map(i => `${i.type}: ${i.detail}`),
    }));

  return { byStatus, byIssue, quarantine, stats };
}

function renderMarkdown(report, total) {
  const { byStatus, byIssue, quarantine, stats } = report;
  const lines = [];
  lines.push('# Auditoria de qualidade — high-confidence-reviews.json');
  lines.push('');
  lines.push(`> Gerado por \`tools/knowledge/audit-high-confidence-reviews.mjs\` em ${new Date().toISOString().slice(0, 10)}.`);
  lines.push('> Pacote local extraido por OCR do Atlas; exige curadoria profissional final.');
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`- Total de registros: **${total}**`);
  lines.push(`- ✅ Limpos: **${byStatus.clean.length}**`);
  lines.push(`- ⚠️ Precisam limpeza (ainda utilizaveis): **${byStatus.needs_cleanup.length}**`);
  lines.push(`- ⛔ Em quarentena (bloqueados do raciocinio clinico): **${byStatus.quarantine.length}**`);
  lines.push('');
  lines.push('### Correcoes mecanicas aplicadas');
  lines.push(`- \`techniques\` normalizado para lista limpa: **${stats.techniquesNormalized}** registros`);
  lines.push(`- Banners de PDF removidos de campos clinicos: **${stats.bannersStripped}** registros`);
  lines.push(`- Titulos reconstruidos a partir de nomes canonicos (km-agent): **${stats.titleFixes.length}** registros`);
  lines.push('');
  lines.push('## ⛔ Quarentena (revisar antes de qualquer uso clinico)');
  lines.push('');
  for (const q of quarantine) {
    lines.push(`- **${q.code}** — ${q.title || '(sem titulo)'}`);
    for (const r of q.reasons) lines.push(`  - ${r}`);
  }
  lines.push('');
  lines.push('## Registros por tipo de problema');
  lines.push('');
  const labels = {
    empty_essential: 'Campos essenciais vazios',
    misattributed: 'Conteudo atribuido ao ponto errado',
    ocr_corruption: 'OCR corrompido',
    mixed_fields: 'Campos misturados',
    pdf_banner: 'Cabecalho/rodape do PDF nos dados',
    bad_title: 'Titulo generico ou com lixo de OCR',
  };
  for (const [type, label] of Object.entries(labels)) {
    const codes = byIssue[type] || [];
    lines.push(`### ${label} — ${codes.length}`);
    if (codes.length) lines.push('', codes.join(', '), '');
  }
  lines.push('## Titulos reconstruidos (antes → depois)');
  lines.push('');
  for (const t of stats.titleFixes) {
    lines.push(`- \`${t.code}\`: ${JSON.stringify(t.from)} → **${t.to}**`);
  }
  lines.push('');
  return lines.join('\n');
}

export function run({ apply = false } = {}) {
  const pkg = JSON.parse(fs.readFileSync(REVIEWS_PATH, 'utf8'));
  const namesMap = loadCanonicalNames();
  const { assessed, stats } = auditReviews(pkg, namesMap);
  const report = buildReport(assessed, stats);

  fs.writeFileSync(AUDIT_JSON_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
  fs.writeFileSync(AUDIT_MD_PATH, renderMarkdown(report, assessed.length), 'utf8');

  if (apply) {
    const backup = REVIEWS_PATH.replace(/\.json$/, `.backup-${Date.now()}.json`);
    fs.copyFileSync(REVIEWS_PATH, backup);
    const next = {
      ...pkg,
      dataQualityAudit: {
        auditedAt: new Date().toISOString(),
        tool: 'tools/knowledge/audit-high-confidence-reviews.mjs',
        clean: report.byStatus.clean.length,
        needsCleanup: report.byStatus.needs_cleanup.length,
        quarantine: report.byStatus.quarantine.length,
      },
      reviews: assessed.map(a => a.review),
    };
    fs.writeFileSync(REVIEWS_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
    return { report, applied: true, backup };
  }
  return { report, applied: false };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const apply = process.argv.includes('--apply');
  const { report, applied, backup } = run({ apply });
  const { byStatus, stats } = report;
  console.log(`[audit] clean=${byStatus.clean.length} needs_cleanup=${byStatus.needs_cleanup.length} quarantine=${byStatus.quarantine.length}`);
  console.log(`[audit] techniques normalizado=${stats.techniquesNormalized} banners removidos=${stats.bannersStripped} titulos=${stats.titleFixes.length}`);
  console.log(`[audit] relatorio: ${path.relative(root, AUDIT_MD_PATH)}`);
  if (applied) console.log(`[audit] APLICADO. backup: ${path.relative(root, backup)}`);
  else console.log('[audit] dry-run (use --apply para gravar correcoes + quarentena)');
}
