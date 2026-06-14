// ============================================================
// UTILITÁRIO: Motor de análise clínica MTC
// Toda a lógica de diagnóstico fica aqui, separada da UI
// ============================================================

import { movementData } from '../data/movementsData';
import { isPulseAssociatedSign } from '../data/pulseData';
import { tongueOrganAlterations } from '../data/tongueData';
import { getPatternDetail, getProtocolForPattern } from '../knowledge/protocolEngine';
import { evaluateSafety } from '../knowledge/safetyEngine';

const TENSE_PULSE_RE = /(?:^|[^A-Za-zÀ-ÖØ-öø-ÿ0-9_])tenso(?=$|[^A-Za-zÀ-ÖØ-öø-ÿ0-9_])/i;

// Palavras-chave por padrão MTC. Fonte única usada tanto pela pontuação binária
// clássica de `analyze()` (peso +6 se QUALQUER chave casar) quanto pela síntese
// graduada/ponderada do assistente ao vivo (`assistantSynthesis`).
// `tense: true` significa que o padrão também é reforçado por pulso tenso.
const PATTERN_KEYWORDS = [
  { name: 'Ascensão do Yang do Fígado', tense: true, keywords: ['cefaleia', 'enxaqueca', 'tontura', 'zumbido', 'irritabilidade', 'raiva', 'laterais', 'fígado', 'vesícula', 'em corda', 'vermelha'] },
  { name: 'Qi do Fígado invadindo Baço/Estômago', keywords: ['refluxo', 'azia', 'náusea', 'distensão', 'constipação', 'diarreia', 'frustração', 'ácido', 'fígado', 'estômago', 'baço', 'piora ao estresse'] },
  { name: 'Umidade-Calor', keywords: ['saburra amarela', 'saburra gordurosa', 'saburra espessa', 'edema', 'calor', 'umidade', 'tipo 6', 'tipo 7', 'escorregadio', 'álcool', 'odor forte'] },
  { name: 'Deficiência de Qi do Baço', keywords: ['fadiga', 'marcas de dentes', 'inchada', 'fraco', 'vazio', 'baço', 'estômago', 'digestão', 'edema', 'pálida', 'desejo por doce', 'ruminação'] },
  { name: 'Agitação do Shen por Calor', keywords: ['ansiedade', 'insônia', 'palpitação', 'agitação', 'ponta', 'coração', 'rápido', 'vermelha', 'sonhos intensos', 'energéticos', 'termogênicos', 'cafeína'] },
  { name: 'Deficiência de Yin do Rim', keywords: ['suores noturnos', 'calor vazio', 'menopausa', 'ondas de calor', 'boca seca à noite', 'zumbido', 'yin deficiente', 'Deficiência Yin'] },
  { name: 'Deficiência de Yang do Rim', keywords: ['frio', 'membros frios', 'lombar fria', 'poliúria noturna', 'yang deficiente', 'fadiga profunda', 'Deficiência Yang', 'aversão ao frio', 'diarreia matinal'] },
  { name: 'Deficiência de Xue do Fígado', keywords: ['visão borrada', 'olhos secos', 'câimbras', 'unhas quebradiças', 'menstruação escassa', 'tontura ao levantar', 'xue do fígado', 'sangue do fígado'] },
  { name: 'Estagnação de Xue', keywords: ['dor fixa', 'arroxeada', 'petéquias', 'coágulos', 'estase', 'sangue estagnado', 'língua roxa', 'lábios roxos', 'amenorreia', 'dor piora à noite'] },
  { name: 'Deficiência de Qi do Pulmão', keywords: ['tosse fraca', 'voz baixa', 'resfriados frequentes', 'dispneia leve', 'sudorese espontânea', 'pulmão fraco', 'qi do pulmão', 'pele sem brilho'] },
];

function matchesClinicalKeyword(text, keyword) {
  if (keyword === 'tenso') return TENSE_PULSE_RE.test(text);
  return new RegExp(keyword, 'i').test(text);
}

// Retorna os itens selecionados de um grupo específico
export function getSelectedItems(selectedMap, group) {
  return Object.keys(selectedMap)
    .filter(k => k.startsWith(group + ':') && selectedMap[k])
    .map(k => k.split(':').slice(1).join(':'));
}

// Retorna os achados de pulso formatados para análise (qualidades + sinais)
export function getPulseSelectedItems(selectedMap) {
  return Object.keys(selectedMap)
    .filter(k => (k.startsWith('pulso:') || k.startsWith('pulsoSinal:')) && selectedMap[k])
    .map(k => k.replace(/^pulso(Sinal)?:/, '').replaceAll(':', ' '));
}

function pulseItemLabel(key) {
  return key.split(':').slice(3).join(':');
}

// Qualidades palpadas no dedo — evidência objetiva de palpação (peso de pulso).
// Chaves legadas "pulso:" com texto de sinal associado são reclassificadas como sinais.
export function getPulseQualityItems(selectedMap) {
  return Object.keys(selectedMap)
    .filter(k => k.startsWith('pulso:') && selectedMap[k])
    .map(pulseItemLabel)
    .filter(item => !isPulseAssociatedSign(item));
}

// Sinais clínicos associados marcados no módulo de pulso — pesam como sintoma.
export function getPulseAssociatedSignItems(selectedMap) {
  const fromSignGroup = Object.keys(selectedMap)
    .filter(k => k.startsWith('pulsoSinal:') && selectedMap[k])
    .map(pulseItemLabel);

  const fromLegacyGroup = Object.keys(selectedMap)
    .filter(k => k.startsWith('pulso:') && selectedMap[k])
    .map(pulseItemLabel)
    .filter(isPulseAssociatedSign);

  return [...new Set([...fromSignGroup, ...fromLegacyGroup])];
}

// Junta todo o texto clínico para análise de padrão textual
export function getAllClinicalText(state, selectedMap) {
  const groups = [
    'sintomas', 'queixaEstruturada', 'historico', 'substanciasUso',
    'sono', 'digestao', 'gineco', 'dor', 'lingua', 'regioesLingua',
    'clima', 'emocoes', 'fezes', 'oito', 'substancias'
  ];

  const fromGroups = groups.flatMap(g => getSelectedItems(selectedMap, g));

  const fromTongueOrgans = Object.keys(tongueOrganAlterations)
    .flatMap(org => getSelectedItems(selectedMap, `linguaOrgao:${org}`));

  const fromPulse = getPulseSelectedItems(selectedMap);

  const fromText = [
    state.queixa || '',
    state.historia || '',
    state.medicacoes || ''
  ];

  return [...fromGroups, ...fromTongueOrgans, ...fromPulse, ...fromText].join(' ');
}

// Motor principal de análise — gera hipótese diagnóstica
export function analyze(state, selectedMap) {
  const all = getAllClinicalText(state, selectedMap);

  const scores = {};
  PATTERN_KEYWORDS.forEach(({ name, keywords, tense }) => {
    const matched = keywords.some(kw => new RegExp(kw, 'i').test(all))
      || (tense && TENSE_PULSE_RE.test(all));
    scores[name] = matched ? 6 : 0;
  });

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const main = ranked[0][1] ? ranked[0][0] : "Aguardando dados";
  const protocol = getProtocolForPattern(main);
  const detail = getPatternDetail(main);

  const safety = getSelectedItems(selectedMap, 'seguranca');
  const safetyAlerts = evaluateSafety({ safetyFlags: safety, clinicalText: all, protocol });
  const confidence = ranked[0][1] >= 12 ? "Alta" : ranked[0][1] >= 6 ? "Moderada" : "Baixa";

  return { main, protocol, detail, safety, safetyAlerts, ranked, confidence };
}

// Análise pelos Cinco Movimentos
export function movementAnalysis(state, selectedMap) {
  const text = getAllClinicalText(state, selectedMap);
  const result = {};

  Object.entries(movementData).forEach(([movement, data]) => {
    const evidence = [];
    data.keys.forEach(key => {
      const regex = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (regex.test(text)) evidence.push(key);
    });
    result[movement] = {
      score: evidence.length,
      evidence: [...new Set(evidence)],
      data
    };
  });

  return result;
}

// Análise dos Oito Princípios
export function principleAnalysis(state, selectedMap) {
  const text = getAllClinicalText(state, selectedMap);

  const pairs = {
    "Interno": ["crônico", "recorrente", "fadiga", "insônia", "digestão", "edema", "ansiedade", "lombar", "interno"],
    "Externo": ["início súbito", "vento", "frio", "calor", "obstrução nasal", "garganta", "febre", "externo"],
    "Calor": ["calor", "vermelha", "vermelho", "amarela", "ressecada", "sede", "irritabilidade", "rápido", "insônia"],
    "Frio": ["frio", "pálida", "lento", "membros frios", "busca calor", "sem sede", "úmida"],
    "Deficiência": ["fadiga", "fraco", "vazio", "pálida", "falta de energia", "edema", "marcas de dentes", "deficiência"],
    "Excesso": ["cheio", "tenso", "em corda", "dor fixa", "saburra espessa", "estagnação", "excesso"],
    "Yin": ["frio", "repouso", "umidade", "pálida", "profundo", "lento"],
    "Yang": ["calor", "movimento", "agitação", "vermelha", "rápido", "superficial"]
  };

  const result = {};
  Object.entries(pairs).forEach(([k, arr]) => {
    result[k] = arr.filter(x => matchesClinicalKeyword(text, x)).length;
  });

  return result;
}

// Interpretação do ciclo entre os Movimentos
export function cycleInterpretation(mv) {
  const s = (m) => mv[m]?.score || 0;
  const alerts = [];

  if (s("Madeira") >= 3 && s("Terra") >= 3)
    alerts.push("⚠ Madeira invadindo Terra: sinais emocionais de Fígado associados a digestão, Baço/Estômago ou umidade.");
  if (s("Água") >= 3 && s("Madeira") >= 3)
    alerts.push("⚠ Água falhando em nutrir Madeira: sinais de Rim/essência associados a tensão, irritabilidade, tontura ou ascensão.");
  if (s("Terra") >= 3 && s("Metal") >= 2)
    alerts.push("⚠ Terra repercutindo em Metal: umidade/fleuma ou deficiência digestiva impactando respiração, pele ou intestino.");
  if (s("Fogo") >= 3 && s("Água") >= 2)
    alerts.push("⚠ Água não controla Fogo: ansiedade, insônia ou agitação com sinais de Rim/Yin.");

  const sorted = Object.entries(mv).sort((a, b) => b[1].score - a[1].score);
  if (!alerts.length && sorted[0][1].score > 0) {
    alerts.push(`Predominância inicial em ${sorted[0][0]}, com investigação complementar de ${sorted[1]?.[0] || ''}.`);
  }

  return alerts;
}

// Perfil diagnóstico completo
export function diagnosticProfile(state, selectedMap) {
  const analysis = analyze(state, selectedMap);
  const mv = movementAnalysis(state, selectedMap);
  const sorted = Object.entries(mv).sort((x, y) => y[1].score - x[1].score);
  const top = sorted[0] || ["", { score: 0, data: { org: "Aguardando dados" } }];
  const second = sorted[1] || ["", { score: 0, data: { org: "Aguardando dados" } }];
  const text = getAllClinicalText(state, selectedMap);

  // Evidência de língua: grupos legados da anamnese + checklist por órgão do
  // painel Língua (todas as chaves `linguaOrgao:Órgão:Item` casam com o prefixo).
  const tongue = getSelectedItems(selectedMap, 'lingua').length
    + getSelectedItems(selectedMap, 'regioesLingua').length
    + getSelectedItems(selectedMap, 'linguaOrgao').length;

  // Apenas qualidades palpadas contam como evidência de pulso (peso 7);
  // sinais associados pesam como sintoma (peso 4) e não contam em dobro
  // quando o mesmo achado já foi marcado na anamnese.
  const pulse = getPulseQualityItems(selectedMap).length;
  const symptomItems = ['sintomas', 'digestao', 'sono', 'dor', 'gineco'].flatMap(
    g => getSelectedItems(selectedMap, g)
  );
  const normalizeFinding = (item) => String(item)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  const anamneseFindings = new Set(
    [...symptomItems, ...getSelectedItems(selectedMap, 'fezes')].map(normalizeFinding)
  );
  const pulseSigns = getPulseAssociatedSignItems(selectedMap)
    .filter(item => !anamneseFindings.has(normalizeFinding(item))).length;
  const symptoms = symptomItems.length + pulseSigns;
  const emotions = getSelectedItems(selectedMap, 'emocoes').length;

  const raw = tongue * 7 + pulse * 7 + symptoms * 4 + emotions * 5;
  const confidence = Math.min(96, Math.max(18, raw));

  let main = analysis.main !== "Aguardando dados"
    ? analysis.main
    : top[1].score ? `Predominância de ${top[0]} — ${top[1].data.org}` : "Aguardando dados";

  let assoc = second[1].score
    ? `Repercussão secundária em ${second[0]} — ${second[1].data.org}`
    : "Aguardando dados complementares";

  let compensatory = "Não evidenciado no momento";
  if (/Yang do Fígado|tontura|zumbido|cefaleia|enxaqueca|irritabilidade/i.test(text))
    compensatory = "Ascensão/hiperatividade da Madeira a investigar";
  if (/insônia|ansiedade|ponta|palpitação|shen/i.test(text))
    compensatory = "Agitação do Shen como manifestação funcional";

  const pathogenic = [];
  if (/saburra espessa|saburra gordurosa|edema|peso|tipo 6|tipo 7|umidade/i.test(text)) pathogenic.push("Umidade/Fleuma");
  if (/dor fixa|arroxeada|petéquias|estase/i.test(text)) pathogenic.push("Estase de Xue");
  if (/vermelha|amarela|calor|rápido|ressecada/i.test(text)) pathogenic.push("Calor");
  if (/em corda|frustração|raiva|estresse/i.test(text) || TENSE_PULSE_RE.test(text)) pathogenic.push("Estagnação de Qi");
  if (!pathogenic.length) pathogenic.push("Aguardando confirmação");

  const conflicts = [];
  if (/pálida/i.test(text) && /vermelha|vermelho intenso|pontos vermelhos/i.test(text))
    conflicts.push("Língua com sinais simultâneos de deficiência e calor.");
  if (/fraco|vazio/i.test(text) && (/cheio|em corda/i.test(text) || TENSE_PULSE_RE.test(text)))
    conflicts.push("Pulso com sinais de deficiência associados a tensão/excesso.");
  if (/frio|busca calor/i.test(text) && /calor|sede|ressecada/i.test(text))
    conflicts.push("Sinais mistos de frio e calor; investigar raiz e manifestação.");

  const missing = [];
  if (getSelectedItems(selectedMap, 'fezes').length === 0) missing.push("hábitos intestinais/fezes");
  if (!/sede|água|boca seca/i.test(text) && !state.agua) missing.push("sede e ingestão hídrica");
  if (getSelectedItems(selectedMap, 'sono').length === 0) missing.push("sono e horário dos despertares");
  if (getSelectedItems(selectedMap, 'gineco').length === 0) missing.push("ciclo menstrual/hormonal, quando aplicável");
  if (getSelectedItems(selectedMap, 'clima').length === 0) missing.push("relação com frio, calor, umidade, vento ou secura");

  return {
    main, assoc, compensatory,
    root: analysis.detail.root,
    manifestation: analysis.detail.manifestation,
    pathogenic: [...new Set(pathogenic)],
    confidence,
    parts: { tongue: tongue * 7, pulse: pulse * 7, symptoms: symptoms * 4, emotions: emotions * 5 },
    conflicts, missing, top, second,
    analysis
  };
}

// ============================================================
// SÍNTESE AO VIVO DO ASSISTENTE
// Leitura ponderada da anamnese como um todo: pontuação graduada
// por fonte (língua/pulso valem mais que sintoma relatado), diferencial
// top-2, confiança real (corrige o limiar "Alta" inalcançável do analyze)
// e próxima ação derivada do que falta no caso concreto.
// ============================================================

// Coleta a evidência clínica agrupada por origem, com o peso de cada origem.
// Pesos coerentes com diagnosticProfile (língua/pulso 7, emoção 5, sintoma 4);
// texto livre da anamnese entra com peso menor (3) por ser menos estruturado.
function buildWeightedEvidence(state, selectedMap) {
  const tongueItems = [
    ...getSelectedItems(selectedMap, 'lingua'),
    ...getSelectedItems(selectedMap, 'regioesLingua'),
    ...Object.keys(tongueOrganAlterations).flatMap(org => getSelectedItems(selectedMap, `linguaOrgao:${org}`)),
  ];
  const symptomItems = [
    ...['sintomas', 'digestao', 'sono', 'dor', 'gineco', 'fezes'].flatMap(g => getSelectedItems(selectedMap, g)),
    ...getPulseAssociatedSignItems(selectedMap),
  ];
  const anamneseItems = [
    ...['queixaEstruturada', 'historico', 'substanciasUso', 'clima', 'oito', 'substancias'].flatMap(g => getSelectedItems(selectedMap, g)),
    state.queixa || '',
    state.historia || '',
    state.medicacoes || '',
  ];

  return [
    { group: 'língua', weight: 7, text: tongueItems.join(' ') },
    { group: 'pulso', weight: 7, text: getPulseQualityItems(selectedMap).join(' ') },
    { group: 'emoções', weight: 5, text: getSelectedItems(selectedMap, 'emocoes').join(' ') },
    { group: 'sintomas', weight: 4, text: symptomItems.join(' ') },
    { group: 'anamnese', weight: 3, text: anamneseItems.join(' ') },
  ].filter(src => src.text.trim().length > 0);
}

// Pontua cada padrão somando o peso da origem de cada achado que casa —
// assim 3 sinais de Fígado pesam mais que 1, e uma hipótese sustentada por
// língua + pulso vence uma sustentada só por sintoma relatado.
function gradePatterns(evidence) {
  return PATTERN_KEYWORDS.map(({ name, keywords, tense }) => {
    let score = 0;
    const hits = [];
    keywords.forEach(kw => {
      const re = new RegExp(kw, 'i');
      evidence.forEach(src => {
        if (re.test(src.text)) {
          score += src.weight;
          hits.push({ term: kw, group: src.group });
        }
      });
    });
    if (tense) {
      evidence.forEach(src => {
        if (TENSE_PULSE_RE.test(src.text)) {
          score += src.weight;
          hits.push({ term: 'pulso tenso', group: src.group });
        }
      });
    }
    return { name, score, hits };
  }).sort((a, b) => b.score - a.score);
}

// Quantas origens distintas sustentam a hipótese e em que proporção.
function summarizeHits(hits) {
  const counts = {};
  hits.forEach(h => { counts[h.group] = (counts[h.group] || 0) + 1; });
  return counts;
}

export function assistantSynthesis(state, selectedMap) {
  const profile = diagnosticProfile(state, selectedMap);
  const { analysis, conflicts = [], missing = [] } = profile;

  const evidence = buildWeightedEvidence(state, selectedMap);
  const graded = gradePatterns(evidence);
  const total = graded.reduce((sum, p) => sum + p.score, 0);

  const knownNames = new Set(PATTERN_KEYWORDS.map(p => p.name));
  const gradedTop = graded[0];
  const hasEvidence = Boolean(gradedTop && gradedTop.score > 0);

  // Hipótese principal ancorada ao padrão canônico (o mesmo salvo como dx),
  // quando ele é um dos padrões conhecidos; caso contrário, o líder graduado.
  const primaryName = knownNames.has(analysis.main)
    ? analysis.main
    : (hasEvidence ? gradedTop.name : null);
  const primary = primaryName ? (graded.find(p => p.name === primaryName) || gradedTop) : null;
  const differential = graded.find(p => p.score > 0 && p.name !== primaryName) || null;

  const primaryPercent = total && primary ? Math.round((primary.score / total) * 100) : 0;
  const differentialPercent = total && differential ? Math.round((differential.score / total) * 100) : 0;

  const margin = primary && differential && primary.score > 0
    ? (primary.score - differential.score) / primary.score
    : 1;
  const isOpenDifferential = Boolean(primary && differential && differential.score > 0 && margin < 0.3);

  // Confiança real, considerando volume, diversidade de origens e margem.
  // "Alta" exige ≥2 origens distintas, ao menos uma objetiva (língua/pulso) e
  // margem clara sobre o 2º lugar — corrige o limiar morto do analyze().
  const groupCounts = summarizeHits(primary?.hits || []);
  const groups = Object.keys(groupCounts);
  const hasObjective = groups.includes('língua') || groups.includes('pulso');
  let level = 'Baixa';
  if (primary && primary.score > 0) {
    if (groups.length >= 2 && hasObjective && primary.score >= 18 && margin >= 0.3) level = 'Alta';
    else if (primary.score >= 8 && (groups.length >= 2 || margin >= 0.3)) level = 'Moderada';
  }
  const confidenceReason = groups.length
    ? groups.map(g => `${g} (${groupCounts[g]})`).join(' + ')
    : '';

  // Próxima ação derivada do caso: desempate quando o diferencial está aberto,
  // senão o dado faltante mais relevante, senão a pergunta padrão.
  let nextAction;
  if (isOpenDifferential && differential) {
    nextAction = `Para separar ${primaryName} de ${differential.name}, confira língua e pulso`
      + `${missing.length ? ` e investigue ${missing[0]}` : ' e os sinais que distinguem os dois padrões'}.`;
  } else if (missing.length) {
    nextAction = `Falta investigar ${missing[0]} para firmar a hipótese.`;
  } else {
    nextAction = analysis.detail?.question || 'Completar anamnese, língua e pulso.';
  }

  // Leitura ao vivo: os sinais reais que sustentam a hipótese + conflito relevante.
  let reading;
  if (!primary || primary.score === 0) {
    reading = analysis.protocol?.goal || 'Preencha os dados para gerar a leitura.';
  } else {
    const terms = [...new Set(primary.hits.map(h => h.term))].slice(0, 5);
    const n = terms.length;
    reading = n > 1
      ? `${n} sinais convergem para ${primaryName}: ${terms.join(', ')}.`
      : `1 sinal converge para ${primaryName}: ${terms.join(', ')}.`;
    if (conflicts.length) reading += ` ⚠ ${conflicts[0]}`;
  }

  return {
    primaryName: primaryName || 'Aguardando dados',
    primaryPercent,
    differential: differential ? { name: differential.name, percent: differentialPercent } : null,
    isOpenDifferential,
    confidence: { level, reason: confidenceReason },
    nextAction,
    reading,
    conflicts,
    evidenceCount: primary ? primary.hits.length : 0,
    graded,
  };
}
