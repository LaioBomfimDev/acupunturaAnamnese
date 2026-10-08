// ============================================================
// Escalas clínicas aplicadas ao paciente (etapa 1: consultório).
//
// Cada instrumento é UM objeto com tudo o que a tela e o cálculo usam:
// perguntas, pontos de cada opção, regra de cálculo, faixas, itens de
// risco, fonte e versão. O texto da faixa e o cálculo saem daqui — nunca
// de duas fontes que possam discordar.
//
// Versão: mudou pergunta, ponto ou faixa, sobe `version` e a versão
// antiga fica em INSTRUMENT_HISTORY, para o histórico continuar lendo a
// aplicação do jeito que ela foi feita.
//
// Só entram com as perguntas completas instrumentos de uso livre. Escala
// com direito autoral entra só com nome, faixa e escore (AGENTS.md §7).
// Gate humano: até a psicóloga responsável conferir texto e faixas, o
// instrumento fica `review.status: 'em_conferencia'` e a tela mostra isso.
// ============================================================

export const INSTRUMENT_REVIEW_STATUS = {
  PENDING: 'em_conferencia',
  APPROVED: 'aprovado',
};

const FREQUENCY_OPTIONS = [
  { value: 0, label: 'Nenhuma vez' },
  { value: 1, label: 'Vários dias' },
  { value: 2, label: 'Mais da metade dos dias' },
  { value: 3, label: 'Quase todos os dias' },
];

const DIFFICULTY_OPTIONS = [
  { value: 0, label: 'Nenhuma dificuldade' },
  { value: 1, label: 'Alguma dificuldade' },
  { value: 2, label: 'Muita dificuldade' },
  { value: 3, label: 'Extrema dificuldade' },
];

const DIFFICULTY_QUESTION =
  'Se você assinalou qualquer um dos problemas, indique o grau de dificuldade que os mesmos lhe causaram '
  + 'para realizar seu trabalho, tomar conta das coisas em casa ou para se relacionar com as pessoas.';

// Pergunta extra que só vale quando algum problema foi assinalado
// (`showWhen: 'anyPositive'`): some da tela e não é gravada se tudo
// ficou em "Nenhuma vez".
const DIFFICULTY_ITEM = { id: 'dificuldade', text: DIFFICULTY_QUESTION, options: DIFFICULTY_OPTIONS, showWhen: 'anyPositive' };

export const PHQ9 = {
  id: 'phq9',
  version: 1,
  shortName: 'PHQ-9',
  name: 'Questionário sobre a Saúde do Paciente (PHQ-9)',
  measures: 'sintomas depressivos nas últimas 2 semanas',
  disciplines: ['psicologia'],
  population: 'Adolescentes e adultos',
  minutes: 5,
  reapplyAfterDays: 14,
  instructions: 'Durante as últimas 2 semanas, com que frequência você foi incomodado(a) por qualquer um dos problemas abaixo?',
  items: [
    { id: 'q1', text: 'Pouco interesse ou pouco prazer em fazer as coisas.' },
    { id: 'q2', text: 'Se sentir “para baixo”, deprimido(a) ou sem perspectiva.' },
    { id: 'q3', text: 'Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que de costume.' },
    { id: 'q4', text: 'Se sentir cansado(a) ou com pouca energia.' },
    { id: 'q5', text: 'Falta de apetite ou comendo demais.' },
    { id: 'q6', text: 'Se sentir mal consigo mesmo(a), ou achar que você é um fracasso ou que decepcionou sua família ou você mesmo(a).' },
    { id: 'q7', text: 'Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão.' },
    {
      id: 'q8',
      text: 'Lentidão para se movimentar ou falar, a ponto das outras pessoas perceberem. Ou o oposto: estar tão agitado(a) ou inquieto(a) que você fica andando de um lado para o outro muito mais do que de costume.',
    },
    {
      id: 'q9',
      text: 'Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a).',
      risk: {
        fromValue: 1,
        message: 'Resposta positiva no item 9 (pensamentos de morte ou de se ferir). Avalie o risco ainda neste atendimento.',
      },
    },
  ].map(item => ({ ...item, options: FREQUENCY_OPTIONS })),
  extraItems: [DIFFICULTY_ITEM],
  scoring: { method: 'sum', min: 0, max: 27 },
  bands: [
    { id: 'minima', label: 'Mínima', min: 0, max: 4 },
    { id: 'leve', label: 'Leve', min: 5, max: 9 },
    { id: 'moderada', label: 'Moderada', min: 10, max: 14 },
    { id: 'moderadamente_grave', label: 'Moderadamente grave', min: 15, max: 19 },
    { id: 'grave', label: 'Grave', min: 20, max: 27 },
  ],
  reading: 'A faixa é a do instrumento e não substitui a avaliação clínica. Repetir a escala com pelo menos 2 semanas de intervalo mostra a evolução.',
  sources: [
    'Kroenke K, Spitzer RL, Williams JBW. The PHQ-9: validity of a brief depression severity measure. J Gen Intern Med. 2001;16(9):606-13.',
    'Santos IS et al. Sensibilidade e especificidade do PHQ-9 entre adultos da população geral. Cad Saúde Pública. 2013;29(8):1533-43.',
  ],
  license: 'PHQ-9 © Pfizer Inc. Uso livre, sem necessidade de permissão.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Faixas da publicação original (Kroenke, 2001). A validação brasileira (Santos, 2013) usa 9 pontos como corte de rastreio: a psicóloga responsável confere o texto das perguntas e decide qual faixa mostrar.',
  },
};

export const GAD7 = {
  id: 'gad7',
  version: 1,
  shortName: 'GAD-7',
  name: 'Escala de Transtorno de Ansiedade Generalizada (GAD-7)',
  measures: 'sintomas de ansiedade nas últimas 2 semanas',
  disciplines: ['psicologia'],
  population: 'Adolescentes e adultos',
  minutes: 3,
  reapplyAfterDays: 14,
  instructions: 'Durante as últimas 2 semanas, com que frequência você foi incomodado(a) pelos problemas abaixo?',
  items: [
    { id: 'q1', text: 'Sentir-se nervoso(a), ansioso(a) ou muito tenso(a).' },
    { id: 'q2', text: 'Não ser capaz de impedir ou de controlar as preocupações.' },
    { id: 'q3', text: 'Preocupar-se muito com diversas coisas.' },
    { id: 'q4', text: 'Dificuldade para relaxar.' },
    { id: 'q5', text: 'Ficar tão agitado(a) que se torna difícil permanecer sentado(a).' },
    { id: 'q6', text: 'Ficar facilmente aborrecido(a) ou irritado(a).' },
    { id: 'q7', text: 'Sentir medo como se algo horrível fosse acontecer.' },
  ].map(item => ({ ...item, options: FREQUENCY_OPTIONS })),
  extraItems: [DIFFICULTY_ITEM],
  scoring: { method: 'sum', min: 0, max: 21 },
  bands: [
    { id: 'minima', label: 'Mínima', min: 0, max: 4 },
    { id: 'leve', label: 'Leve', min: 5, max: 9 },
    { id: 'moderada', label: 'Moderada', min: 10, max: 14 },
    { id: 'grave', label: 'Grave', min: 15, max: 21 },
  ],
  reading: 'A faixa é a do instrumento e não substitui a avaliação clínica. Repetir a escala com pelo menos 2 semanas de intervalo mostra a evolução.',
  sources: [
    'Spitzer RL, Kroenke K, Williams JBW, Löwe B. A brief measure for assessing generalized anxiety disorder: the GAD-7. Arch Intern Med. 2006;166(10):1092-7.',
  ],
  license: 'GAD-7 © Pfizer Inc. Uso livre, sem necessidade de permissão.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Faixas da publicação original (Spitzer, 2006). A psicóloga responsável confere o texto das perguntas e a validação brasileira a citar.',
  },
};

/** Instrumentos em uso, na ordem em que aparecem na tela. */
export const CLINICAL_INSTRUMENTS = [PHQ9, GAD7];

/**
 * Versões antigas, para ler aplicações feitas antes de uma mudança.
 * Chave: `${id}@${version}`. Vazio enquanto todos estão na versão 1.
 */
export const INSTRUMENT_HISTORY = {};

export function instrumentsForDiscipline(discipline) {
  return CLINICAL_INSTRUMENTS.filter(instrument => instrument.disciplines.includes(discipline));
}

/** A versão exata usada na aplicação; cai na atual quando a versão não existe mais. */
export function getInstrument(id, version = null) {
  const current = CLINICAL_INSTRUMENTS.find(instrument => instrument.id === id) || null;
  if (version == null || current?.version === Number(version)) return current;
  return INSTRUMENT_HISTORY[`${id}@${version}`] || current;
}
