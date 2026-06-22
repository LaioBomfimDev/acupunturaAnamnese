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

const LASER_SAFETY_TERMS = [
  /fotossens/i,
  /tumor|neoplas|cancer|câncer|carcinoma|melanoma/i,
  /olho|ocular|orbital|retina/i,
  /gesta|gravidez|grávid/i,
  /trombose|tromboflebite/i,
  /epilep/i,
  /febre|infec|inflamação aguda|inflamacao aguda/i,
  /marcapasso|cardiopatia|insuficiência cardíaca|insuficiencia cardiaca/i,
];

const MOXA_AVOID_TERMS = [
  /contraindicad|evitar/i,
  /umidade-calor|calor exuberante|calor pleno|calor vazio|febre/i,
  /infec|inflamação aguda|inflamacao aguda/i,
  /pele sem integridade|ferida|queimadura|úlcera|ulcera/i,
  /gesta|gravidez|grávid/i,
];

const MOXA_SUPPORT_TERMS = [
  /deficiência de yang|deficiencia de yang|yang do rim/i,
  /deficiência de qi|deficiencia de qi/i,
  /frio|membros frios|lombar fria/i,
  /baço|baco|pulmão|pulmao/i,
];

export const fallbackDetail = {
  root: 'Aguardando dados.',
  manifestation: 'Aguardando dados.',
  eight: 'Aguardando classificação.',
  elements: 'Aguardando leitura.',
  question: 'Completar anamnese, língua e pulso.',
};

function asText(value) {
  return Array.isArray(value) ? value.join(' ') : String(value || '');
}

function joinClinicalText(parts) {
  return parts.map(asText).join(' ');
}

function hasAny(text, terms) {
  return terms.some(term => term.test(text));
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function displayTechniqueItem(item) {
  const raw = item?.displayCode || item?.label || String(item || '').trim();
  if (!raw) return '';

  const firstToken = raw.split(/\s|\+/)[0];
  const normalized = normalizePointCode(firstToken);
  const point = getPointByCode(normalized);
  if (!point) return raw;

  return raw.replace(firstToken, displayPointCode(normalized));
}

function protocolItems(protocol, key) {
  return unique((protocol?.[key] || []).map(displayTechniqueItem));
}

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

export function buildLaserTechniquePlan({ protocol, patternName, clinicalText = '' } = {}) {
  const points = protocolItems(protocol, 'laser');
  const context = joinClinicalText([patternName, protocol?.goal, clinicalText]);
  const hasCaution = hasAny(context, LASER_SAFETY_TERMS);
  const status = hasCaution ? 'cautela' : points.length ? 'indicado' : 'avaliar';

  return {
    title: 'Laser / Fotobiomodulação',
    status,
    statusLabel: status === 'indicado' ? 'Indicado com parâmetros' : status === 'cautela' ? 'Cautela' : 'Avaliar',
    summary: points.length
      ? 'Recurso não invasivo para estimular os pontos selecionados, com dose sempre definida pelo equipamento e pelo objetivo clínico.'
      : 'Sem pontos de laser definidos para esta hipótese; usar apenas se a profissional selecionar alvo e parâmetros.',
    points,
    mode: 'Aplicação pontual nos pontos do protocolo; varredura apenas em área delimitada e documentada.',
    parameters: [
      { label: 'Comprimento de onda', value: 'registrar nm do aparelho' },
      { label: 'Potência', value: 'registrar mW/W reais' },
      { label: 'Energia por ponto', value: 'definir J conforme objetivo' },
      { label: 'Tempo', value: 'calcular por ponto/área' },
      { label: 'Área irradiada', value: 'ponto ou cm² documentado' },
      { label: 'Resposta', value: 'dor, pele e tolerância' },
    ],
    checklist: [
      'Confirmar dose, potência, comprimento de onda e tempo antes da aplicação.',
      'Usar proteção ocular compatível e nunca direcionar para olhos ou região orbital.',
      'Checar fotossensibilidade, medicamentos, neoplasia, gestação, trombose e infecção ativa.',
      'Registrar pontos, energia, tempo, área, aparelho e resposta do paciente.',
    ],
    cautions: [
      'Dose insuficiente pode não estimular; dose excessiva pode irritar tecido ou piorar resposta local.',
      'Evitar uso automático em tumor, infecção ativa, febre, trombose, região ocular ou pele alterada sem revisão profissional.',
    ],
    sourceNote: 'Síntese local em pt-BR: Manual de acupuntura laser e regras de segurança da Biblioteca Viva.',
  };
}

export function buildMoxaTechniquePlan({ protocol, patternName, clinicalText = '' } = {}) {
  const points = protocolItems(protocol, 'moxa');
  const context = joinClinicalText([patternName, protocol?.goal, points, clinicalText]);
  const avoid = hasAny(context, MOXA_AVOID_TERMS);
  const support = hasAny(context, MOXA_SUPPORT_TERMS);
  const status = avoid ? 'evitar' : support || points.length ? 'indicado' : 'avaliar';

  return {
    title: 'Moxaterapia',
    status,
    statusLabel: status === 'evitar' ? 'Evitar nesta hipótese' : status === 'indicado' ? 'Indicada com cautela' : 'Avaliar',
    summary: status === 'evitar'
      ? 'Há sinal de calor, inflamação, gestação, pele vulnerável ou contraindicação descrita no protocolo; revisar antes de aplicar calor.'
      : 'Técnica de aquecimento para padrões compatíveis com frio, deficiência de Qi/Yang ou estagnação por frio.',
    points,
    mode: status === 'evitar'
      ? 'Não aplicar como padrão automático; considerar técnica sem calor ou revisão da hipótese.'
      : 'Preferir moxa indireta ou bastão, com calor confortável, progressivo e monitorado.',
    parameters: [
      { label: 'Forma', value: status === 'evitar' ? 'não aplicar sem revisão' : 'bastão ou moxa indireta' },
      { label: 'Intensidade', value: 'calor confortável, sem dor' },
      { label: 'Pele', value: 'íntegra e monitorada' },
      { label: 'Sequência', value: 'começar suave e reavaliar' },
      { label: 'Resposta', value: 'rubor leve, conforto e pulso' },
      { label: 'Registro', value: 'pontos, tempo e reação' },
    ],
    checklist: [
      'Confirmar se o padrão é frio/deficiência ou estagnação por frio.',
      'Checar febre, calor exuberante, inflamação aguda, lesão de pele e sensibilidade reduzida.',
      'Manter distância segura da pele e interromper diante de ardor, tontura, mal-estar ou rubor excessivo.',
      'Garantir ventilação, controle de fumaça e orientação pós-sessão sobre calor residual.',
    ],
    cautions: [
      'Evitar em calor pleno/vazio com sinais ativos, febre, inflamação aguda ou pele sem integridade.',
      'Na gestação, não aplicar em abdome, lombossacra ou pontos proibidos sem avaliação profissional explícita.',
    ],
    sourceNote: 'Síntese local em pt-BR: acupuntura chinesa e moxibustão, com curadoria Biblioteca Viva.',
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
