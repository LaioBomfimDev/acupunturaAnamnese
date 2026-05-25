// ============================================================
// UTILITÁRIO: Motor de análise clínica MTC
// Toda a lógica de diagnóstico fica aqui, separada da UI
// ============================================================

import { protocols, syndromeDetails } from '../data/protocols';
import { movementData } from '../data/movementsData';
import { tongueOrganAlterations } from '../data/tongueData';

// Retorna os itens selecionados de um grupo específico
export function getSelectedItems(selectedMap, group) {
  return Object.keys(selectedMap)
    .filter(k => k.startsWith(group + ':') && selectedMap[k])
    .map(k => k.split(':').slice(1).join(':'));
}

// Retorna os achados de pulso formatados para análise
export function getPulseSelectedItems(selectedMap) {
  return Object.keys(selectedMap)
    .filter(k => k.startsWith('pulso:') && selectedMap[k])
    .map(k => k.replace('pulso:', '').replaceAll(':', ' '));
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

  let scores = {
    "Ascensão do Yang do Fígado": 0,
    "Qi do Fígado invadindo Baço/Estômago": 0,
    "Umidade-Calor": 0,
    "Deficiência de Qi do Baço": 0,
    "Agitação do Shen por Calor": 0
  };

  if (/cefaleia|enxaqueca|tontura|zumbido|irritabilidade|raiva|laterais|fígado|vesícula|em corda|tenso|vermelha/i.test(all))
    scores["Ascensão do Yang do Fígado"] += 6;
  if (/refluxo|azia|náusea|distensão|constipação|diarreia|frustração|ácido|fígado|estômago|baço|piora ao estresse/i.test(all))
    scores["Qi do Fígado invadindo Baço/Estômago"] += 6;
  if (/saburra amarela|saburra gordurosa|saburra espessa|edema|calor|umidade|tipo 6|tipo 7|escorregadio|álcool|odor forte/i.test(all))
    scores["Umidade-Calor"] += 6;
  if (/fadiga|marcas de dentes|inchada|fraco|vazio|baço|estômago|digestão|edema|pálida|desejo por doce|ruminação/i.test(all))
    scores["Deficiência de Qi do Baço"] += 6;
  if (/ansiedade|insônia|palpitação|agitação|ponta|coração|rápido|vermelha|sonhos intensos|energéticos|termogênicos|cafeína/i.test(all))
    scores["Agitação do Shen por Calor"] += 6;

  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const main = ranked[0][1] ? ranked[0][0] : "Aguardando dados";
  const protocol = protocols[main] || {
    body: [], ear: [], moxa: [], laser: [], eletro: [],
    goal: "Preencha os dados para gerar raciocínio terapêutico."
  };
  const detail = syndromeDetails[main] || {
    root: "Aguardando dados.",
    manifestation: "Aguardando dados.",
    eight: "Aguardando classificação.",
    elements: "Aguardando leitura.",
    question: "Completar anamnese, língua e pulso."
  };

  const safety = getSelectedItems(selectedMap, 'seguranca');
  const confidence = ranked[0][1] >= 12 ? "Alta" : ranked[0][1] >= 6 ? "Moderada" : "Baixa";

  return { main, protocol, detail, safety, ranked, confidence };
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
    result[k] = arr.filter(x => new RegExp(x, 'i').test(text)).length;
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

  const tongue = getSelectedItems(selectedMap, 'lingua').length + getSelectedItems(selectedMap, 'regioesLingua').length;
  const pulse = getPulseSelectedItems(selectedMap).length;
  const symptoms = ['sintomas', 'digestao', 'sono', 'dor', 'gineco'].reduce(
    (acc, g) => acc + getSelectedItems(selectedMap, g).length, 0
  );
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
  if (/em corda|tenso|frustração|raiva|estresse/i.test(text)) pathogenic.push("Estagnação de Qi");
  if (!pathogenic.length) pathogenic.push("Aguardando confirmação");

  const conflicts = [];
  if (/pálida/i.test(text) && /vermelha|vermelho intenso|pontos vermelhos/i.test(text))
    conflicts.push("Língua com sinais simultâneos de deficiência e calor.");
  if (/fraco|vazio/i.test(text) && /cheio|tenso|em corda/i.test(text))
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
