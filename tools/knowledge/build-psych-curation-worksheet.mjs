#!/usr/bin/env node
/**
 * build-psych-curation-worksheet.mjs
 *
 * Gera UMA planilha de curadoria (arquivo unico) para a base de anamnese de
 * psicologia extraida dos 5 PDFs por extract-psych-candidates.mjs.
 *
 * NAO altera nada no app, Supabase ou bundle. NAO extrai novo conteudo.
 * Apenas AGRUPA os candidatos ja normalizados por rotulo, deduplica as
 * evidencias, escolhe os melhores trechos por grupo e monta um documento
 * curavel para a psicologa aprovar/editar/rejeitar (gate humano inegociavel).
 *
 * Regras de conteudo:
 *  - Tudo permanece status "review" / requiresProfessionalAudit: true.
 *  - As 5 fontes sao manuais protegidos (DSM-5-TR, CID-11, CFP, livro ABA/TEA).
 *    Nenhum trecho verbatim pode entrar no app/RAG: os snippets aqui sao
 *    EVIDENCIA de origem, para apoiar a redacao de uma sintese pt-BR revisada.
 *  - Perguntas nao sao curadas linha-a-linha: viram bloco "inspiracao/descarte"
 *    (OCR cru/academico); o roteiro real deve ser REDIGIDO a partir da estrutura.
 *
 * Saida (area local ignorada pelo git, pois carrega trechos protegidos):
 *   frontend/.local-source-assets/pdf-sources/knowledge/psicologia/
 *     curadoria-anamnese-psicologia.local.md
 *     curadoria-anamnese-psicologia.local.json
 *
 * Uso: node tools/knowledge/build-psych-curation-worksheet.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const DIR = path.join(root, 'frontend', '.local-source-assets', 'pdf-sources', 'knowledge', 'psicologia');
const OUT_MD = path.join(DIR, 'curadoria-anamnese-psicologia.local.md');
const OUT_JSON = path.join(DIR, 'curadoria-anamnese-psicologia.local.json');

const MAX_EVIDENCE_MD = 6;   // trechos mostrados por grupo no markdown
const MAX_EVIDENCE_JSON = 20; // trechos guardados por grupo no json
const MAX_QUESTIONS_MD = 15;  // amostra de perguntas "inspiracao"

// Rotulo humano das fontes (todas protegidas -> source-only para o app).
const SOURCE_LABEL = {
  'psicologia-neuropsicologia-manual-cfp': 'Manual Neuropsicologia (CFP)',
  'psicologia-cid-11-transtornos-mentais': 'CID-11',
  'psicologia-transtornos-neurodesenvolvimento-cid-11': 'CID-11 (neurodesenvolvimento)',
  'psicologia-analise-comportamento-aplicada-tea': 'ABA/TEA (livro, escaneado)',
  'psicologia-dsm-5-tr-revisao-texto': 'DSM-5-TR',
};

const read = (f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const items = (d) => d.items || d.candidates || (Array.isArray(d) ? d : []);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Heuristica de qualidade do trecho (menor = mais limpo). Penaliza ruido de OCR:
// tokens de 1-2 letras soltos, letra isolada maiuscula no meio, digitos colados.
function noiseScore(text) {
  const t = clean(text);
  if (!t) return 999;
  const words = t.split(' ');
  if (words.length < 4) return 900; // fragmento curto demais
  let bad = 0;
  for (const w of words) {
    if (/^[^\wÀ-ú]$/.test(w)) bad += 1;                     // pontuacao solta
    if (/^[a-zA-ZÀ-ú]{1,2}$/.test(w) && !/^(e|ou|de|do|da|em|no|na|as|os|um|se|ao|à|é)$/i.test(w)) bad += 1; // letra/sigla solta
    if (/\d/.test(w) && /[a-zA-ZÀ-ú]/.test(w)) bad += 1;     // digito colado em palavra
    if (/[A-Z]{2,}[a-z]/.test(w) || /[a-z][A-Z]/.test(w)) bad += 0.5; // caixa quebrada
  }
  const ratio = bad / words.length;
  const lenPenalty = t.length > 320 ? 0.3 : 0; // muito longo tende a ser pagina inteira
  return ratio + lenPenalty;
}

function evidenceOf(x) {
  const src = x.source || {};
  return {
    source: src.key || '',
    sourceLabel: SOURCE_LABEL[src.key] || src.key || '',
    page: src.pdfPage ?? null,
    snippet: clean(src.snippet || x.describes || x.prompt || ''),
    imageUrl: src.imageUrl || '',
  };
}

// Agrupa candidatos por rotulo normalizado; escolhe as melhores evidencias.
function group(list, labelOf, extra = () => ({})) {
  const map = new Map();
  for (const x of list) {
    const label = labelOf(x) || '(sem rotulo)';
    if (!map.has(label)) map.set(label, { label, count: 0, evidence: [], meta: extra(x) });
    const g = map.get(label);
    g.count += 1;
    const ev = evidenceOf(x);
    if (ev.snippet) g.evidence.push({ ...ev, _noise: noiseScore(ev.snippet) });
  }
  const groups = [...map.values()].map((g) => {
    // dedup por snippet, ordena por qualidade, corta.
    const seen = new Set();
    const uniq = g.evidence
      .sort((a, b) => a._noise - b._noise)
      .filter((e) => { const k = e.snippet.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    return {
      label: g.label,
      meta: g.meta,
      totalCandidates: g.count,
      uniqueEvidence: uniq.length,
      sources: [...new Set(uniq.map((e) => e.sourceLabel))],
      evidence: uniq.slice(0, MAX_EVIDENCE_JSON).map(({ _noise, ...e }) => e),
      // campos de decisao da psicologa (vazios):
      decision: '',            // aprovar | editar | rejeitar
      finalWordingPtBr: '',    // redacao final revisada (sintese, nao verbatim)
      notes: '',
    };
  });
  return groups.sort((a, b) => b.totalCandidates - a.totalCandidates);
}

export function build() {
  const risk = group(items(read('risk-sign-candidates.local.json')), (x) => x.label, (x) => ({ priority: x.priority || 'alta' }));
  const axes = group(items(read('reasoning-axis-candidates.local.json')), (x) => x.label, (x) => ({ framework: x.framework || '', kind: x.kind || 'eixo' }));
  const checklist = group(items(read('checklist-item-candidates.local.json')), (x) => x.label, (x) => ({ category: x.category || '' }));

  const questionsRaw = items(read('question-candidates.local.json'));
  const questionSample = questionsRaw
    .map((q) => ({ ...evidenceOf(q), _noise: noiseScore(q.prompt || q.source?.snippet) }))
    .sort((a, b) => a._noise - b._noise)
    .slice(0, MAX_EVIDENCE_JSON * 3)
    .map(({ _noise, ...e }) => e);

  return {
    schemaVersion: 'sistema-acup-psych-anamnese-curation.local.v1',
    generatedAt: new Date().toISOString(),
    policy: {
      status: 'review',
      requiresProfessionalAudit: true,
      clinicalActivation: 'none',
      copyright: 'source-only',
      note: 'Trechos sao evidencia de origem (manuais protegidos). Nada verbatim entra no app/RAG; so sintese pt-BR revisada pela psicologa. Nada aplicado ao app/Supabase.',
    },
    sections: {
      riskSigns: { title: 'Sinais de risco', groups: risk },
      reasoningAxes: { title: 'Eixos de raciocinio clinico', groups: axes },
      checklist: { title: 'Checklist / vocabulario', groups: checklist },
      questions: {
        title: 'Perguntas (inspiracao / descarte)',
        totalCandidates: questionsRaw.length,
        note: 'OCR cru/academico. Nao curar linha-a-linha. Redigir o roteiro de anamnese a partir dos eixos + checklist; usar estes apenas como inspiracao.',
        sample: questionSample,
      },
    },
  };
}

function renderMd(ws) {
  const L = [];
  const s = ws.sections;
  L.push('# Curadoria — base de anamnese de Psicologia');
  L.push('');
  L.push(`Gerado em: ${ws.generatedAt}`);
  L.push('');
  L.push('> **Gate humano inegociável.** Nada aqui foi aplicado ao app, Supabase ou bundle.');
  L.push('> Todo item está `review` / `requiresProfessionalAudit`.');
  L.push('> **Copyright:** as 5 fontes são manuais protegidos (DSM-5-TR, CID-11, CFP, livro ABA/TEA).');
  L.push('> Os trechos abaixo são **evidência de origem**, não conteúdo final. Nada verbatim entra no app/RAG —');
  L.push('> só a **redação pt-BR revisada pela psicóloga** (síntese, com página/fonte rastreável).');
  L.push('>');
  L.push('> Para cada grupo: escolha `aprovar / editar / rejeitar`, escreva a redação final e observações.');
  L.push('');

  const renderGroups = (title, intro, groups, showMeta) => {
    L.push(`## ${title}`);
    L.push('');
    if (intro) { L.push(intro); L.push(''); }
    L.push(`Grupos: **${groups.length}** · candidatos brutos: **${groups.reduce((a, g) => a + g.totalCandidates, 0)}**`);
    L.push('');
    for (const g of groups) {
      const meta = showMeta ? showMeta(g.meta) : '';
      L.push(`### ${g.label}${meta ? ` — ${meta}` : ''}`);
      L.push('');
      L.push(`Candidatos: ${g.totalCandidates} · evidências únicas: ${g.uniqueEvidence} · fontes: ${g.sources.join(', ')}`);
      L.push('');
      L.push('**Evidência (origem — não usar verbatim):**');
      for (const e of g.evidence.slice(0, MAX_EVIDENCE_MD)) {
        L.push(`- _(${e.sourceLabel}, p.${e.page})_ ${e.snippet}`);
      }
      L.push('');
      L.push('| decisão | redação final (pt-BR, síntese revisada) | observações |');
      L.push('| --- | --- | --- |');
      L.push('| ☐ aprovar ☐ editar ☐ rejeitar |  |  |');
      L.push('');
    }
  };

  renderGroups(
    `${s.riskSigns.title} — PRIORIDADE`,
    '> Segurança primeiro. Cada sinal precisa da redação e do **limiar/encaminhamento** definidos pela psicóloga. Não gera conduta nem alerta automático nesta fase.',
    s.riskSigns.groups,
    (m) => `prioridade ${m.priority}`,
  );
  renderGroups(s.reasoningAxes.title, null, s.reasoningAxes.groups, (m) => m.framework || m.kind);
  renderGroups(s.checklist.title, null, s.checklist.groups, (m) => m.category);

  // Perguntas: bloco separado, sem tabela por linha.
  const q = s.questions;
  L.push(`## ${q.title}`);
  L.push('');
  L.push(`Total de candidatos: **${q.totalCandidates}**. ${q.note}`);
  L.push('');
  L.push('Amostra mais limpa (só para dar ideia — reescrever):');
  for (const e of q.sample.slice(0, MAX_QUESTIONS_MD)) {
    L.push(`- _(${e.sourceLabel}, p.${e.page})_ ${e.snippet}`);
  }
  L.push('');
  L.push('**Roteiro proposto (a psicóloga redige):** queixa · histórico · desenvolvimento · família · escola/trabalho · sono · humor · ansiedade · risco · tratamentos prévios.');
  L.push('');
  return L.join('\n');
}

export function run() {
  const ws = build();
  fs.writeFileSync(OUT_JSON, JSON.stringify(ws, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_MD, renderMd(ws), 'utf8');
  return ws;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1] === fileURLToPath(import.meta.url)) {
  const ws = run();
  const s = ws.sections;
  const n = (x) => x.groups.length;
  console.log(`[psych-curation] risco=${n(s.riskSigns)} grupos · eixos=${n(s.reasoningAxes)} · checklist=${n(s.checklist)} · perguntas=${s.questions.totalCandidates} (bloco)`);
  console.log(`[psych-curation] ${path.relative(root, OUT_MD)}`);
  console.log(`[psych-curation] ${path.relative(root, OUT_JSON)}`);
}
