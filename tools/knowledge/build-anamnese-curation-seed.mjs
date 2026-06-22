// ============================================================
// Gerador de SEMENTE de curadoria (língua) — Fase pré-3
// Lê finding-candidates e produz approved-knowledge.local.json com as
// DECISÕES recomendadas pelo Claude, no formato que o AnamneseKnowledgePanel
// carrega como seed. Regra: o LIVRO é a verdade (diagnóstico extraído); o
// ruleset de features VALIDA; concordância -> approved_local; conflito -> review;
// ruído -> rejected. Determinístico, auditável, sem IA. Nada é definitivo:
// requer confirmação humana e refino da equipe técnica (gate inegociável).
// ============================================================
import fs from 'node:fs';
import path from 'node:path';

const KNOWLEDGE_DIR = path.resolve('frontend/.local-source-assets/pdf-sources/knowledge');
const FINDINGS = path.join(KNOWLEDGE_DIR, 'finding-candidates.local.json');
const OUT_SEED = path.join(KNOWLEDGE_DIR, 'approved-knowledge.local.json');
const OUT_NEWPATTERNS = path.join(KNOWLEDGE_DIR, 'proposed-canonical-patterns.local.json');

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// Padrões já existentes em patternDefinitions (não recriar)
const EXISTING = [
  'Ascensão do Yang do Fígado', 'Qi do Fígado invadindo Baço/Estômago', 'Umidade-Calor',
  'Deficiência de Qi do Baço', 'Agitação do Shen por Calor', 'Deficiência de Yin do Rim',
  'Deficiência de Yang do Rim', 'Deficiência de Xue do Fígado', 'Estagnação de Xue',
  'Deficiência de Qi do Pulmão',
];
// Novos padrões canônicos legítimos do repertório (a promover na Fase 3)
const NEW_CANONICAL = {
  'Deficiência de Sangue': 'Palidez, tontura, insônia leve; língua pálida e fina.',
  'Calor no Sangue': 'Sangramentos, erupções, agitação; língua vermelho-escura, pontos vermelhos.',
  'Fleuma-Umidade': 'Peso, expectoração, plenitude; língua inchada, saburra branca gordurosa.',
  'Fleuma-Calor': 'Escarro amarelo, agitação; língua vermelha, saburra amarela gordurosa.',
  'Fleuma-Frio': 'Escarro claro, frio; saburra branca espessa úmida.',
  'Deficiência de Yin': 'Calor vazio, suores noturnos; língua vermelha pouca saburra.',
  'Deficiência de Yin do Estômago': 'Fissura central, saburra central ausente, língua seca.',
  'Fogo/Calor do Estômago': 'Fome, mau hálito, gengivite; língua vermelha, saburra amarela.',
  'Frio no Estômago': 'Dor epigástrica que melhora com calor; saburra branca úmida.',
  'Retenção de Alimentos': 'Plenitude epigástrica, eructação com odor; saburra espessa central.',
  'Estagnação de Qi do Fígado': 'Distensão móvel, irritabilidade, suspiros; língua de cor normal.',
  'Fogo do Fígado': 'Cefaleia, olhos vermelhos, irritabilidade; laterais vermelhas, saburra amarela seca.',
  'Vento Interno do Fígado': 'Tremor, desvio, rigidez; desvio/tremor da língua.',
  'Deficiência de Yin do Fígado': 'Olhos secos, tontura; língua vermelha pouca saburra.',
  'Deficiência de Yang do Baço': 'Frio, edema, fezes moles; língua pálida inchada úmida com marcas.',
  'Deficiência de Sangue do Coração': 'Insônia, palpitação; língua pálida, possível ponta pálida.',
  'Fogo do Coração': 'Úlceras orais, insônia, agitação; ponta vermelha, saburra amarela.',
  'Frio-Umidade': 'Peso, frio, fezes pastosas; saburra branca espessa úmida.',
  'Secura/Calor no Intestino': 'Constipação seca; língua vermelha seca, saburra amarela seca.',
};
const CANONICAL = new Set([...EXISTING, ...Object.keys(NEW_CANONICAL)]);

// Mapa de sinônimos do livro -> canônico (apenas os frequentes e claros)
const BOOK_SYNONYMS = {
  'inatividade de yang do baco': ['Deficiência de Yang do Baço'],
  'inatividade de yang do aquecedor medio': ['Deficiência de Yang do Baço'],
  'retencao de mucosidade - calor no pulmao': ['Fleuma-Calor'],
  'perturbacao do segmento superior do corpo resultante da ascensao (subida) do yang perverso': ['Ascensão do Yang do Fígado'],
  'bloqueio dos canais energeticos pelo vento - mucosidade': ['Vento Interno do Fígado'],
  'deficiencia de qi e de yin': ['Deficiência de Qi do Baço', 'Deficiência de Yin'],
  'deficiencias de qi e de yin': ['Deficiência de Qi do Baço', 'Deficiência de Yin'],
  'acometimento de qi e de yin': ['Deficiência de Qi do Baço', 'Deficiência de Yin'],
  'deplecao do qi e do sangue': ['Deficiência de Qi do Baço', 'Deficiência de Sangue'],
  'deplecao de qi e de sangue': ['Deficiência de Qi do Baço', 'Deficiência de Sangue'],
};
const NOISE = new Set(['a seguir', 'lingua em paciente normal', 'paciente normal', 'normal', '']);

// Ruleset de features (alias normalizado -> padrões canônicos esperados). Validador.
const FEATURE_RULES = [
  [/marcas de dente/, ['Deficiência de Qi do Baço', 'Deficiência de Yang do Baço']],
  [/arroxeada|roxa|manchas roxas|purpur/, ['Estagnação de Xue']],
  [/pontos vermelhos/, ['Calor no Sangue']],
  [/sem saburra|descascada|destacada/, ['Deficiência de Yin', 'Deficiência de Yin do Estômago']],
  [/rachadura|fissura/, ['Deficiência de Yin do Estômago', 'Deficiência de Yin']],
  [/saburra amarela.*(pegajosa|gordurosa|espessa)|(pegajosa|gordurosa|espessa).*amarela/, ['Umidade-Calor', 'Fleuma-Calor']],
  [/saburra amarela/, ['Fogo/Calor do Estômago', 'Umidade-Calor']],
  [/saburra branca.*(espessa|pegajosa|gordurosa)/, ['Fleuma-Umidade', 'Frio-Umidade']],
  [/inchada/, ['Fleuma-Umidade', 'Deficiência de Yang do Baço']],
  [/vermelho intenso|vermelha/, ['Calor no Sangue', 'Fogo do Fígado']],
  [/palida/, ['Deficiência de Sangue', 'Deficiência de Yang do Baço']],
  [/saburra seca|ressecada/, ['Deficiência de Yin', 'Fogo/Calor do Estômago']],
  [/desvio|tremor|rigid/, ['Vento Interno do Fígado']],
];

function bookPatternsFor(finding) {
  const out = [];
  for (const link of finding.patternLinks || []) {
    const p = link.pattern || '';
    const n = norm(p);
    if (NOISE.has(n)) continue;
    if (CANONICAL.has(p)) { out.push(p); continue; }
    if (BOOK_SYNONYMS[n]) { out.push(...BOOK_SYNONYMS[n]); continue; }
    // exato com case canônico? procura por norm
    const hit = [...CANONICAL].find(c => norm(c) === n);
    if (hit) { out.push(hit); continue; }
    out.push({ raw: p }); // não mapeado
  }
  return out;
}

function featurePatternsFor(finding) {
  const text = norm([finding.label, ...(finding.aliases || [])].join(' '));
  const set = new Set();
  for (const [re, pats] of FEATURE_RULES) if (re.test(text)) pats.forEach(p => set.add(p));
  return set;
}

// Eixo térmico do achado, pela língua (para detectar contradição DURA com o livro)
const HEAT_PATTERNS = new Set(['Umidade-Calor', 'Calor no Sangue', 'Fleuma-Calor', 'Fogo do Fígado', 'Fogo/Calor do Estômago', 'Agitação do Shen por Calor', 'Fogo do Coração', 'Secura/Calor no Intestino', 'Ascensão do Yang do Fígado']);
const COLD_PATTERNS = new Set(['Frio-Umidade', 'Frio no Estômago', 'Deficiência de Yang do Baço', 'Deficiência de Yang do Rim', 'Fleuma-Frio']);
function tongueThermal(finding) {
  const t = norm([finding.label, ...(finding.aliases || [])].join(' '));
  const heat = /amarela|vermelh|seca|ressecada|pontos vermelhos/.test(t);
  const cold = /palida|saburra branca|umida|escorregadia/.test(t);
  if (heat && !cold) return 'heat';
  if (cold && !heat) return 'cold';
  return 'mixed';
}
function hardConflict(bookCanon, finding) {
  const therm = tongueThermal(finding);
  if (therm === 'mixed') return false;
  const bookHeat = bookCanon.some(p => HEAT_PATTERNS.has(p));
  const bookCold = bookCanon.some(p => COLD_PATTERNS.has(p));
  if (therm === 'cold' && bookHeat && !bookCold) return true;
  if (therm === 'heat' && bookCold && !bookHeat) return true;
  return false;
}

const findings = JSON.parse(fs.readFileSync(FINDINGS, 'utf8')).items || [];
const seedItems = [];
const proposedNew = new Set();
const stats = { approved: 0, review: 0, rejected: 0, agree: 0, bookOnly: 0, featureOnly: 0, conflict: 0, noise: 0 };

for (const f of findings) {
  const book = bookPatternsFor(f);
  const bookCanon = book.filter(b => typeof b === 'string');
  const bookUnmapped = book.filter(b => typeof b !== 'string');
  const feat = featurePatternsFor(f);

  let status = 'review';
  let chosen = [];
  let reason = '';

  const allBookNoise = (f.patternLinks || []).length > 0 && book.length === 0;

  if (allBookNoise) {
    status = 'rejected'; reason = 'diagnóstico do livro = normal/ruído'; stats.noise++;
  } else if (bookCanon.length) {
    const agree = bookCanon.filter(b => feat.has(b));
    if (hardConflict(bookCanon, f)) {
      // Contradição térmica dura: livro x língua opostos -> esperar (não forçar)
      status = 'review'; chosen = [...new Set([...bookCanon, ...feat])];
      reason = `contradição dura: livro(${bookCanon.join(', ')}) x língua ${tongueThermal(f)} — aguardando revisão`;
      stats.conflict++;
    } else if (agree.length) {
      status = 'approved_local'; chosen = [...new Set(bookCanon)];
      reason = `livro (verdade) + ruleset concordam (${agree.join(', ')})`; stats.agree++;
    } else {
      // Livro é a fonte da verdade; sem contradição dura, aprova pelo livro
      status = 'approved_local'; chosen = [...new Set(bookCanon)];
      reason = 'aprovado pelo livro (fonte da verdade); sem contradição térmica'; stats.bookOnly++;
    }
  } else if (feat.size) {
    status = 'review'; chosen = [...feat];
    reason = `livro não mapeado (${bookUnmapped.map(b => b.raw).join(' | ').slice(0, 60)}); sugestão do ruleset`;
    stats.featureOnly++;
  } else {
    status = 'review'; reason = 'sem mapeamento confiável';
  }

  chosen.forEach(c => { if (NEW_CANONICAL[c]) proposedNew.add(c); });
  if (status === 'approved_local') stats.approved++;
  else if (status === 'review') stats.review++;
  else stats.rejected++;

  seedItems.push({
    candidateId: f.candidateId || f.id,
    type: 'finding',
    status,
    label: f.label,
    aliases: f.aliases || [],
    checklistGroup: f.checklistGroup || 'lingua',
    patternLinks: chosen.map(p => ({ pattern: p, weight: 4, polarity: '+', evidence: reason })),
    approvedByRole: 'ai_clinical_reviewer',
    approvedByLabel: 'Claude (1ª passada — revisar)',
    approvedAt: status === 'approved_local' ? new Date().toISOString() : '',
    rejectedAt: status === 'rejected' ? new Date().toISOString() : '',
  });
}

const envelope = {
  schemaVersion: 'sistema-acup-approved-anamnese-knowledge.v1',
  generatedAt: new Date().toISOString(),
  policy: {
    source: 'claude_first_pass_book_truth_ruleset_validator',
    phase3ReadsOnly: 'approved_local',
    requiresProfessionalAudit: true,
    patientData: 'never',
    note: '1ª passada determinística do Claude; confirmar no painel e refinar com equipe técnica.',
  },
  counts: {
    items: seedItems.length,
    approvedLocal: seedItems.filter(i => i.status === 'approved_local').length,
    review: seedItems.filter(i => i.status === 'review').length,
    rejected: seedItems.filter(i => i.status === 'rejected').length,
  },
  items: seedItems,
};
fs.writeFileSync(OUT_SEED, JSON.stringify(envelope, null, 2));
fs.writeFileSync(OUT_NEWPATTERNS, JSON.stringify({
  schemaVersion: 'sistema-acup-proposed-canonical-patterns.v1',
  generatedAt: new Date().toISOString(),
  note: 'Padrões novos legítimos do repertório referenciados na seed; promover a patternDefinitions na Fase 3 (com revisão).',
  items: [...proposedNew].sort().map(name => ({ name, definition: NEW_CANONICAL[name] })),
}, null, 2));

console.log('Total achados:', findings.length);
console.log('Decisões -> approved_local:', stats.approved, '| review:', stats.review, '| rejected:', stats.rejected);
console.log('Detalhe:', JSON.stringify(stats));
console.log('Padrões novos propostos (referenciados):', proposedNew.size);
console.log('Seed:', OUT_SEED);
