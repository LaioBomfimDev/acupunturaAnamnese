// ============================================================
// CONTRATO GENÉRICO DE ANAMNESE (todas as disciplinas)
//
// A anamnese de qualquer disciplina é a mesma máquina com vocabulários
// diferentes (decisão registrada em docs/plano-anamnese-multidisciplinar.md):
//
//   escuta livre  → campos de texto com perguntas de escuta e chips;
//   percurso      → seções específicas que mudam de fato as perguntas;
//   contexto      → módulos abertos por PERTINÊNCIA, nunca por sexo;
//   sinais        → checklists de vocabulário fechado;
//   risco         → bloco que DESTACA e LEMBRA, nunca decide;
//   eixos         → andaime de raciocínio, descritivo e revisável.
//
// Este módulo só monta e valida a configuração. Quem desenha é o
// componente genérico (components/anamnese/DisciplineAnamnese.jsx).
//
// INVARIANTE DE TODAS AS DISCIPLINAS: o sistema organiza e lembra; quem
// decide é a profissional. Nenhum conteúdo aqui fecha diagnóstico.
// ============================================================

/**
 * Campo de texto livre.
 * @param {[string, string, string[], string[]?]} tuple
 *   [id, rótulo, chips de digitação rápida, perguntas de escuta]
 */
export function toField([id, label, quickWords, questionGuide = []]) {
  return { id, label, textarea: true, quickWords, questionGuide };
}

export function toSection({ id, title, fields }) {
  return { id, title, fields: fields.map(toField) };
}

export function toContextModule({ id, label, summary, suggestedFor, suggestedMinAge, fields }) {
  return {
    id,
    label,
    summary,
    suggestedFor: suggestedFor || [],
    ...(Number.isFinite(suggestedMinAge) ? { suggestedMinAge } : {}),
    fields: fields.map(toField),
  };
}

/**
 * Item do bloco de risco. `screening` são perguntas de triagem e
 * `observe` o que olhar; `reminder` é a conduta lembrada — nunca imposta.
 */
export function toRiskItem({ id, label, priority = 'alta', summary, screening = [], observe = [], reminder = '' }) {
  return { id, label, priority, summary, screening, observe, reminder };
}

export function toAxis({ id, label, framework = '', summary = '', explore = [] }) {
  return { id, label, framework, summary, explore };
}

// ---- Consultas sobre uma configuração ----------------------------

export function getProfile(config, profileId) {
  return config.profiles.find(profile => profile.id === profileId) || null;
}

export function getProfileSections(config, profileId) {
  const profile = getProfile(config, profileId);
  if (!profile) return [];
  return config.sectionSets[profile.sectionSet] || [];
}

export function getContextModule(config, moduleId) {
  return config.contextModules.find(module => module.id === moduleId) || null;
}

export function isContextModuleOpen(contextModules, moduleId) {
  return Boolean(contextModules?.[moduleId]);
}

/**
 * Módulos que o percurso pré-abre. Percurso desconhecido não pré-abre nada.
 * Módulo com `suggestedMinAge` exige idade CONHECIDA e dentro da faixa —
 * idade ausente não sugere, para não abrir bloco que talvez não caiba.
 */
export function getSuggestedContextModules(config, profileId, age) {
  const suggested = {};
  for (const module of config.contextModules) {
    if (!profileId || !module.suggestedFor.includes(profileId)) continue;
    if (Number.isFinite(module.suggestedMinAge)
      && !(Number.isFinite(age) && age >= module.suggestedMinAge)) continue;
    suggested[module.id] = true;
  }
  return suggested;
}

export function getOpenContextModules(config, contextModules) {
  return config.contextModules.filter(module => isContextModuleOpen(contextModules, module.id));
}

export function getAllContextFields(config) {
  return config.contextModules.flatMap(module => module.fields);
}

export function getOpenContextFields(config, contextModules) {
  return getOpenContextModules(config, contextModules).flatMap(module => module.fields);
}

export function getAllProfileFields(config) {
  const byId = new Map();
  for (const sections of Object.values(config.sectionSets)) {
    for (const section of sections) {
      for (const field of section.fields) byId.set(field.id, field);
    }
  }
  return [...byId.values()];
}

/**
 * Campos ATIVOS da ficha: escuta livre + percurso + módulos abertos.
 * Módulo fechado não entra — é o que impede pergunta fora do caso de
 * contar como lacuna, entrar no relatório ou ir para a IA.
 */
export function getActiveTextFields(config, profileId, contextModules) {
  return [
    ...config.textFields,
    ...getProfileSections(config, profileId).flatMap(section => section.fields),
    ...getOpenContextFields(config, contextModules),
  ];
}

// Itens marcados de um grupo (mesma convenção do useClinicState).
export function getSelected(selectedMap, group) {
  const prefix = `${group}:`;
  return Object.keys(selectedMap || {})
    .filter(key => key.startsWith(prefix) && selectedMap[key])
    .map(key => key.slice(prefix.length));
}

export function hasRiskSelected(config, selectedMap) {
  return getSelected(selectedMap, config.riskGroup).length > 0;
}

// ---- Sessão ------------------------------------------------------

export function createEmptySession(config) {
  return {
    discipline: config.discipline,
    intakeProfile: null,
    intakeSelectedAt: null,
    fields: Object.fromEntries(
      [
        ...config.textFields,
        ...getAllProfileFields(config),
        ...getAllContextFields(config),
      ].map(field => [field.id, '']),
    ),
    contextModules: {},
    selectedMap: {},
    axisNotes: {},
    riskNotes: '',
    evolucoes: [],
    relatorio: {},
  };
}

export function normalizeSession(config, raw) {
  const empty = createEmptySession(config);
  if (!raw || typeof raw !== 'object') return empty;
  return {
    ...empty,
    ...raw,
    fields: { ...empty.fields, ...(raw.fields || {}) },
    contextModules: raw.contextModules && typeof raw.contextModules === 'object'
      ? { ...raw.contextModules }
      : getSuggestedContextModules(config, raw.intakeProfile),
    selectedMap: { ...empty.selectedMap, ...(raw.selectedMap || {}) },
    axisNotes: { ...empty.axisNotes, ...(raw.axisNotes || {}) },
    evolucoes: Array.isArray(raw.evolucoes) ? raw.evolucoes : [],
    relatorio: { ...empty.relatorio, ...(raw.relatorio || {}) },
  };
}

/**
 * Resumo de andamento. O percentual mede APENAS preenchimento da ficha,
 * nunca confiança diagnóstica (invariante de todas as disciplinas).
 */
export function buildWorkspaceSummary(config, session) {
  const activeFields = getActiveTextFields(config, session?.intakeProfile, session?.contextModules);
  const filledFields = activeFields
    .filter(field => String(session?.fields?.[field.id] || '').trim()).length;
  const filledAxes = config.axes
    .filter(axis => String(session?.axisNotes?.[axis.id] || '').trim()).length;
  const markedItems = Object.values(session?.selectedMap || {}).filter(Boolean).length;
  const riskItems = getSelected(session?.selectedMap, config.riskGroup).length;
  const totalSections = activeFields.length + config.axes.length + 1;
  const completedSections = filledFields + filledAxes + Number(markedItems > 0);

  return {
    filledFields,
    filledAxes,
    markedItems,
    riskItems,
    completion: Math.round((completedSections / totalSections) * 100),
    nextAction: riskItems > 0
      ? config.riskFirstAction
      : filledFields === 0
        ? config.emptyAction
        : filledAxes === 0
          ? config.axesAction
          : config.readyAction,
  };
}
