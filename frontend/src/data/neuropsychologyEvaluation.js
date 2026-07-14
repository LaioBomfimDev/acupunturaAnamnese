export const NEUROPSYCHOLOGY_CONTENT_STATUS = 'rascunho_a_validar';

export const NEUROPSYCHOLOGY_DRAFT_NOTICE =
  'Estrutura inicial para revisão da neuropsicóloga. Instrumentos, sequência, interpretação e conclusão permanecem sob decisão profissional.';

export const NEUROPSYCHOLOGY_INSTRUMENT_TEMPLATES = [
  { name: 'Entrevista clínica e anamnese', domain: 'Histórico e demanda' },
  { name: 'Escala ETDAH (se indicada)', domain: 'Atenção e comportamento' },
  { name: 'Observação clínica direcionada', domain: 'Comportamento durante a avaliação' },
  { name: 'Tarefa ecológica de alerta e controle inibitório (se indicada)', domain: 'Funções executivas' },
  { name: 'Instrumento de atenção', domain: 'Atenção' },
  { name: 'Instrumento de memória', domain: 'Memória e aprendizagem' },
  { name: 'Instrumento de funções executivas', domain: 'Funções executivas' },
  { name: 'Instrumento de linguagem', domain: 'Linguagem' },
  { name: 'Instrumento visuoespacial', domain: 'Habilidades visuoespaciais' },
  { name: 'Escala emocional/comportamental', domain: 'Aspectos emocionais e comportamentais' },
];

const SESSION_PURPOSES = [
  'Entrevista, demanda e planejamento da avaliação',
  'Aplicação de instrumentos',
  'Aplicação de instrumentos',
  'Aplicação de instrumentos',
  'Aplicação de instrumentos',
  'Aplicação de instrumentos',
  'Aplicação de instrumentos',
  'Aplicação complementar / conferência de hipóteses',
  'Integração e conferência dos resultados',
  'Devolutiva e fechamento profissional',
];

export function createNeuropsychologySession(number) {
  return {
    id: `neuro-session-${number}`,
    number,
    date: '',
    purpose: SESSION_PURPOSES[number - 1] || 'Sessão adicional',
    participants: '',
    informant: '',
    instruments: '',
    observations: '',
    behavior: '',
    partialResults: '',
    intercurrences: '',
    nextSteps: '',
    status: 'planejada',
  };
}

export function createEmptyNeuropsychologyEvaluation() {
  return {
    modality: 'avaliacao_neuropsicologica',
    contentStatus: NEUROPSYCHOLOGY_CONTENT_STATUS,
    referral: {
      requester: '',
      reason: '',
      questions: '',
      priorHypotheses: '',
      relevantHistory: '',
    },
    instruments: NEUROPSYCHOLOGY_INSTRUMENT_TEMPLATES.slice(0, 4).map((item, index) => ({
      id: `instrument-${index + 1}`,
      ...item,
      purpose: '',
      sessionNumber: index + 1,
      status: 'a_revisar',
      rawResult: '',
      professionalInterpretation: '',
    })),
    sessions: Array.from({ length: 10 }, (_, index) => createNeuropsychologySession(index + 1)),
    integration: {
      procedures: '',
      clinicalObservations: '',
      resultsSummary: '',
      convergences: '',
      divergences: '',
      workingHypotheses: '',
      differentialQuestions: '',
      limitations: '',
      professionalConclusion: '',
      recommendations: '',
    },
    report: {},
  };
}

export function normalizeNeuropsychologyEvaluation(raw) {
  const empty = createEmptyNeuropsychologyEvaluation();
  if (!raw || typeof raw !== 'object') return empty;
  const sessions = Array.isArray(raw.sessions) && raw.sessions.length
    ? raw.sessions.map((session, index) => ({ ...createNeuropsychologySession(index + 1), ...session, number: index + 1 }))
    : empty.sessions;
  return {
    ...empty,
    ...raw,
    referral: { ...empty.referral, ...(raw.referral || {}) },
    integration: { ...empty.integration, ...(raw.integration || {}) },
    instruments: Array.isArray(raw.instruments) ? raw.instruments : empty.instruments,
    sessions,
    report: { ...empty.report, ...(raw.report || {}) },
  };
}

export function buildNeuropsychologySummary(evaluation) {
  const sessions = Array.isArray(evaluation?.sessions) ? evaluation.sessions : [];
  const completedSessions = sessions.filter(session =>
    session.status === 'concluida' || String(session.observations || '').trim() || String(session.partialResults || '').trim()).length;
  const instruments = Array.isArray(evaluation?.instruments) ? evaluation.instruments : [];
  const reviewedInstruments = instruments.filter(item => item.status === 'revisado').length;
  const integrationFields = Object.values(evaluation?.integration || {}).filter(value => String(value || '').trim()).length;
  return {
    plannedSessions: sessions.length,
    completedSessions,
    instrumentCount: instruments.length,
    reviewedInstruments,
    integrationFields,
  };
}
