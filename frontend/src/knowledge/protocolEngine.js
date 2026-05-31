import {
  getAuricularPoint,
  getPatternDefinition,
  getPointByCode,
  getPointLabel,
  getKnowledgeSourceLabels,
} from './knowledgeBase';
import { displayPointCode, normalizePointCode } from './aliases';

const emptyProtocol = {
  body: [],
  bodyCodes: [],
  bodyPoints: [],
  ear: [],
  earPoints: [],
  moxa: [],
  laser: [],
  laserCodes: [],
  eletro: [],
  stiper: [],
  goal: 'Preencha os dados para gerar raciocínio terapêutico.',
  pointJustifications: [],
  sources: [],
};

export const fallbackDetail = {
  root: 'Aguardando dados.',
  manifestation: 'Aguardando dados.',
  eight: 'Aguardando classificação.',
  elements: 'Aguardando leitura.',
  question: 'Completar anamnese, língua e pulso.',
};

function resolveBodyPoint(code, patternName) {
  const point = getPointByCode(code);
  const normalized = normalizePointCode(code);
  const displayCode = displayPointCode(normalized);
  const actions = point?.actions || [];
  const indications = point?.indications || [];

  return {
    code: normalized,
    displayCode,
    label: point ? `${displayCode} — ${point.names?.pt || point.names?.en || displayCode}` : displayCode,
    meridian: point?.meridian?.pt || '',
    actions,
    indications,
    cautions: point?.cautions || [],
    relatedPatterns: point?.relatedPatterns || [],
    techniques: point?.techniques || [],
    sources: getKnowledgeSourceLabels(point),
    why: point?.relatedPatterns?.includes(patternName)
      ? `${displayCode} se relaciona com ${patternName} por suas funções: ${actions.slice(0, 3).join(', ')}.`
      : `Selecionado como apoio ao princípio terapêutico do protocolo.`,
  };
}

function resolveEarPoint(name, patternName) {
  const point = getAuricularPoint(name);
  return {
    code: point?.code || `auricular:${String(name).toLowerCase()}`,
    displayCode: name,
    label: point ? `Aurículo — ${point.name}` : `Aurículo — ${name}`,
    actions: point?.actions || [],
    indications: point?.indications || [],
    relatedPatterns: point?.relatedPatterns || [],
    sources: getKnowledgeSourceLabels(point),
    why: point?.relatedPatterns?.includes(patternName)
      ? `${point.name} apoia ${patternName} por ${point.actions?.slice(0, 2).join(', ')}.`
      : 'Ponto auricular complementar ao raciocínio energético.',
  };
}

export function getPatternDetail(patternName) {
  return getPatternDefinition(patternName)?.detail || fallbackDetail;
}

export function getProtocolForPattern(patternName) {
  const pattern = getPatternDefinition(patternName);
  if (!pattern) return emptyProtocol;

  const base = pattern.protocol || {};
  const bodyCodes = (base.body || []).map(normalizePointCode);
  const bodyPoints = bodyCodes.map(code => resolveBodyPoint(code, patternName));
  const earPoints = (base.ear || []).map(name => resolveEarPoint(name, patternName));
  const laserCodes = (base.laser || [])
    .map(item => normalizePointCode(String(item).split(/\s|\+/)[0]))
    .filter(Boolean);

  return {
    ...emptyProtocol,
    ...base,
    bodyCodes,
    body: bodyCodes.map(displayPointCode),
    bodyPoints,
    ear: earPoints.map(point => point.displayCode),
    earPoints,
    laserCodes,
    laser: laserCodes.length ? laserCodes.map(displayPointCode) : base.laser || [],
    stiper: bodyPoints.slice(0, 4).map(point => `${point.displayCode} — considerar Stiper conforme tolerância e objetivo`),
    pointJustifications: [...bodyPoints, ...earPoints],
    sources: [...new Set(bodyPoints.flatMap(point => point.sources))],
    goal: base.goal || emptyProtocol.goal,
  };
}

export function getPointFicha(pointKey, patternName) {
  const bodyPoint = getPointByCode(pointKey);
  if (bodyPoint) {
    const resolved = resolveBodyPoint(bodyPoint.code, patternName);
    return {
      name: resolved.label,
      role: resolved.actions.join(', ') || 'Ponto sistêmico selecionado.',
      why: resolved.why,
      cautions: resolved.cautions,
      sources: resolved.sources,
    };
  }

  const earPoint = getAuricularPoint(pointKey);
  if (earPoint) {
    const resolved = resolveEarPoint(earPoint.name, patternName);
    return {
      name: resolved.label,
      role: resolved.actions.join(', ') || 'Ponto auricular selecionado.',
      why: resolved.why,
      cautions: [],
      sources: resolved.sources,
    };
  }

  return {
    name: getPointLabel(pointKey),
    role: 'Ponto selecionado.',
    why: 'Justificativa dependente da hipótese energética e da revisão profissional.',
    cautions: [],
    sources: [],
  };
}

export function suggestVentosa(patternName) {
  if (/Fígado|Yang/.test(patternName)) return 'Região cervical, trapézio e paravertebral alta, preferindo técnica deslizante ou fixa suave se houver tensão/estagnação.';
  if (/Umidade/.test(patternName)) return 'Dorsal médio e áreas de retenção, com técnica deslizante para mobilizar circulação e metabolismo de líquidos.';
  if (/Baço/.test(patternName)) return 'Dorsal médio, região paravertebral de Baço/Estômago e abdome com cautela, priorizando estímulo moderado.';
  if (/Shen|Calor/.test(patternName)) return 'Usar com parcimônia; priorizar relaxamento dorsal suave e evitar excesso de estímulo.';
  return 'Selecionar região conforme dor, tensão miofascial e diagnóstico energético.';
}
