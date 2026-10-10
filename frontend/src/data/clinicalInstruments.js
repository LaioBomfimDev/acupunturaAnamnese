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
  article: 'o',
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
        // Respondida em casa (Área do Paciente): não há atendimento acontecendo.
        homeMessage: 'Resposta positiva no item 9 (pensamentos de morte ou de se ferir), marcada pelo paciente em casa. Entre em contato com o paciente o quanto antes para avaliar o risco.',
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
  article: 'o',
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

// DASS-21: texto da tradução brasileira de Vignola e Tucci publicada no
// site oficial da escala (domínio público). Três subescalas de 7
// perguntas; cada soma é multiplicada por 2 para usar as faixas do manual.
const DASS_OPTIONS = [
  { value: 0, label: 'Não se aplicou de maneira alguma' },
  { value: 1, label: 'Aplicou-se em algum grau, ou por pouco de tempo' },
  { value: 2, label: 'Aplicou-se em um grau considerável, ou por uma boa parte do tempo' },
  { value: 3, label: 'Aplicou-se muito, ou na maioria do tempo' },
];

export const DASS21 = {
  id: 'dass21',
  version: 1,
  shortName: 'DASS-21',
  // "a DASS-21": é uma escala (o PHQ-9 e o GAD-7 são questionários).
  article: 'a',
  name: 'Escala de Depressão, Ansiedade e Estresse (DASS-21)',
  measures: 'sintomas de depressão, ansiedade e estresse na última semana',
  disciplines: ['psicologia'],
  population: 'Adultos',
  minutes: 5,
  reapplyAfterDays: 7,
  // Na folha: "circule o número apropriado 0, 1, 2 ou 3". Na tela, marca-se a opção.
  instructions: 'Por favor, leia cuidadosamente cada uma das afirmações abaixo e marque a opção que indique o quanto ela se aplicou a você durante a última semana.',
  items: [
    { id: 'q1', text: 'Achei difícil me acalmar' },
    { id: 'q2', text: 'Senti minha boca seca' },
    { id: 'q3', text: 'Não consegui vivenciar nenhum sentimento positivo' },
    { id: 'q4', text: 'Tive dificuldade em respirar em alguns momentos (ex. respiração ofegante, falta de ar, sem ter feito nenhum esforço físico)' },
    { id: 'q5', text: 'Achei difícil ter iniciativa para fazer as coisas' },
    { id: 'q6', text: 'Tive a tendência de reagir de forma exagerada às situações' },
    { id: 'q7', text: 'Senti tremores (ex. nas mãos)' },
    { id: 'q8', text: 'Senti que estava sempre nervoso' },
    { id: 'q9', text: 'Preocupei-me com situações em que eu pudesse entrar em pânico e parecesse ridículo (a)' },
    { id: 'q10', text: 'Senti que não tinha nada a desejar' },
    { id: 'q11', text: 'Senti-me agitado' },
    { id: 'q12', text: 'Achei difícil relaxar' },
    { id: 'q13', text: 'Senti-me depressivo (a) e sem ânimo' },
    { id: 'q14', text: 'Fui intolerante com as coisas que me impediam de continuar o que eu estava fazendo' },
    { id: 'q15', text: 'Senti que ia entrar em pânico' },
    { id: 'q16', text: 'Não consegui me entusiasmar com nada' },
    { id: 'q17', text: 'Senti que não tinha valor como pessoa' },
    { id: 'q18', text: 'Senti que estava um pouco emotivo/sensível demais' },
    { id: 'q19', text: 'Sabia que meu coração estava alterado mesmo não tendo feito nenhum esforço físico (ex. aumento da frequência cardíaca, disritmia cardíaca)' },
    { id: 'q20', text: 'Senti medo sem motivo' },
    { id: 'q21', text: 'Senti que a vida não tinha sentido' },
  ].map(item => ({ ...item, options: DASS_OPTIONS })),
  extraItems: [],
  scoring: {
    method: 'subscales',
    multiplier: 2,
    subscales: [
      {
        id: 'depressao',
        label: 'Depressão',
        short: 'D',
        items: ['q3', 'q5', 'q10', 'q13', 'q16', 'q17', 'q21'],
        min: 0,
        max: 42,
        bands: [
          { id: 'normal', label: 'Normal', min: 0, max: 9 },
          { id: 'leve', label: 'Leve', min: 10, max: 13 },
          { id: 'moderada', label: 'Moderada', min: 14, max: 20 },
          { id: 'grave', label: 'Grave', min: 21, max: 27 },
          { id: 'extremamente_grave', label: 'Extremamente grave', min: 28, max: 42 },
        ],
      },
      {
        id: 'ansiedade',
        label: 'Ansiedade',
        short: 'A',
        items: ['q2', 'q4', 'q7', 'q9', 'q15', 'q19', 'q20'],
        min: 0,
        max: 42,
        bands: [
          { id: 'normal', label: 'Normal', min: 0, max: 7 },
          { id: 'leve', label: 'Leve', min: 8, max: 9 },
          { id: 'moderada', label: 'Moderada', min: 10, max: 14 },
          { id: 'grave', label: 'Grave', min: 15, max: 19 },
          { id: 'extremamente_grave', label: 'Extremamente grave', min: 20, max: 42 },
        ],
      },
      {
        id: 'estresse',
        label: 'Estresse',
        short: 'E',
        items: ['q1', 'q6', 'q8', 'q11', 'q12', 'q14', 'q18'],
        min: 0,
        max: 42,
        bands: [
          { id: 'normal', label: 'Normal', min: 0, max: 14 },
          { id: 'leve', label: 'Leve', min: 15, max: 18 },
          { id: 'moderada', label: 'Moderada', min: 19, max: 25 },
          { id: 'grave', label: 'Grave', min: 26, max: 33 },
          { id: 'extremamente_grave', label: 'Extremamente grave', min: 34, max: 42 },
        ],
      },
    ],
  },
  bands: [],
  reading: 'São três notas independentes: cada uma soma 7 perguntas e multiplica por 2, como no manual da escala. A faixa é a do instrumento e não substitui a avaliação clínica. A escala pergunta sobre a última semana.',
  sources: [
    'Lovibond SH, Lovibond PF. Manual for the Depression Anxiety Stress Scales. 2ª ed. Sydney: Psychology Foundation; 1995.',
    'Vignola RCB, Tucci AM. Adaptation and validation of the depression, anxiety and stress scale (DASS) to Brazilian Portuguese. J Affect Disord. 2014;155:104-9.',
  ],
  license: 'DASS: domínio público. Uso livre, sem necessidade de permissão (site oficial da escala, UNSW); tradução brasileira de Vignola e Tucci publicada no mesmo site.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Faixas do manual original (Lovibond, 1995), aplicadas à soma de cada subescala multiplicada por 2. Na instrução, "circule o número 0, 1, 2 ou 3" virou "marque a opção" para a tela. A psicóloga responsável confere o texto, as faixas e se usa as normas da validação brasileira (Vignola, 2014).',
  },
};

// PCL-5: forma "sem Critério A" (Anexo 1) da versão brasileira de Osório
// e colaboradores (2017), publicada em acesso aberto (CC BY 4.0). O
// instrumento original é de domínio público (National Center for PTSD).
// Não tem faixas de gravidade: só um ponto de corte para rastreio.
const PCL5_OPTIONS = [
  { value: 0, label: 'De modo nenhum' },
  { value: 1, label: 'Um pouco' },
  { value: 2, label: 'Moderadamente' },
  { value: 3, label: 'Muito' },
  { value: 4, label: 'Extremamente' },
];

export const PCL5 = {
  id: 'pcl5',
  version: 1,
  shortName: 'PCL-5',
  // "a PCL-5": Lista de Verificação do TEPT.
  article: 'a',
  name: 'Lista de Verificação do TEPT para o DSM-5 (PCL-5)',
  measures: 'sintomas de estresse pós-traumático no último mês',
  disciplines: ['psicologia'],
  population: 'Adultos que passaram por uma experiência muito estressante',
  minutes: 7,
  reapplyAfterDays: 30,
  // Na folha: "circule um dos números à direita". Na tela, marca-se a opção.
  instructions: 'Abaixo há uma lista de problemas que as pessoas às vezes apresentam em resposta a uma experiência muito estressante. Por favor, leia cuidadosamente cada problema e marque a opção que indica o quanto você tem sido incomodado por este problema no último mês. No último mês, quanto você foi incomodado por:',
  items: [
    { id: 'q1', text: 'Lembranças indesejáveis, perturbadoras e repetitivas da experiência estressante?' },
    { id: 'q2', text: 'Sonhos perturbadores e repetitivos com a experiência estressante?' },
    { id: 'q3', text: 'De repente, sentindo ou agindo como se a experiência estressante estivesse, de fato, acontecendo de novo (como se você estivesse revivendo-a, de verdade, lá no passado)?' },
    { id: 'q4', text: 'Sentir-se muito chateado quando algo lembra você da experiência estressante?' },
    { id: 'q5', text: 'Ter reações físicas intensas quando algo lembra você da experiência estressante (por exemplo, coração apertado, dificuldades para respirar, suor excessivo)?' },
    { id: 'q6', text: 'Evitar lembranças, pensamentos, ou sentimentos relacionados à experiência estressante?' },
    { id: 'q7', text: 'Evitar lembranças externas da experiência estressante (por exemplo, pessoas, lugares, conversas, atividades, objetos ou situações)?' },
    { id: 'q8', text: 'Não conseguir se lembrar de partes importantes da experiência estressante?' },
    { id: 'q9', text: 'Ter crenças negativas intensas sobre você, outras pessoas ou o mundo (por exemplo, ter pensamentos tais como: “Eu sou ruim”, “existe algo seriamente errado comigo”, “ninguém é confiável”, “o mundo todo é perigoso”)?' },
    { id: 'q10', text: 'Culpar a si mesmo ou aos outros pela experiência estressante ou pelo que aconteceu depois dela?' },
    { id: 'q11', text: 'Ter sentimentos negativos intensos como medo, pavor, raiva, culpa ou vergonha?' },
    { id: 'q12', text: 'Perder o interesse em atividades que você costumava apreciar?' },
    { id: 'q13', text: 'Sentir-se distante ou isolado das outras pessoas?' },
    { id: 'q14', text: 'Dificuldades para vivenciar sentimentos positivos (por exemplo, ser incapaz de sentir felicidade ou sentimentos amorosos por pessoas próximas a você)?' },
    { id: 'q15', text: 'Comportamento irritado, explosões de raiva ou agir agressivamente?' },
    { id: 'q16', text: 'Correr muitos riscos ou fazer coisas que podem lhe causar algum mal?' },
    { id: 'q17', text: 'Ficar “super” alerta, vigilante ou de sobreaviso?' },
    { id: 'q18', text: 'Sentir-se apreensivo ou assustado facilmente?' },
    { id: 'q19', text: 'Ter dificuldades para se concentrar?' },
    { id: 'q20', text: 'Problemas para adormecer ou continuar dormindo?' },
  ].map(item => ({ ...item, options: PCL5_OPTIONS })),
  extraItems: [],
  scoring: { method: 'sum', min: 0, max: 80 },
  bands: [
    { id: 'abaixo_corte', label: 'Abaixo do ponto de corte', min: 0, max: 35 },
    { id: 'corte_ou_acima', label: 'No ponto de corte ou acima', min: 36, max: 80 },
  ],
  reading: 'A nota soma as 20 perguntas (0 a 80). O PCL-5 não tem faixas de gravidade: o ponto de corte separa quem pede investigação mais cuidadosa de estresse pós-traumático, e não substitui a avaliação clínica. Pergunta sobre o último mês.',
  sources: [
    'Weathers FW, Litz BT, Keane TM, Palmieri PA, Marx BP, Schnurr PP. The PTSD Checklist for DSM-5 (PCL-5). National Center for PTSD; 2013.',
    'Osório FL et al. Posttraumatic Stress Disorder Checklist for DSM-5 (PCL-5): transcultural adaptation of the Brazilian version. Arch Clin Psychiatry. 2017;44(1):10-9.',
    'Pereira-Lima K et al. Psychometric properties and diagnostic utility of a Brazilian version of the PCL-5. Eur J Psychotraumatol. 2019;10(1):1581020.',
  ],
  license: 'PCL-5: domínio público (National Center for PTSD). Uso livre. Tradução brasileira de Osório e colaboradores (2017), em acesso aberto (CC BY 4.0), de uso livre segundo os autores.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Ponto de corte 36 da validação brasileira (Pereira-Lima, 2019, amostra pequena); o material original sugere 31 a 33. Forma "sem Critério A": o evento traumático é avaliado pela profissional. Na instrução, "circule um dos números" virou "marque a opção". O item 16 (correr riscos ou fazer coisas que podem causar mal) não gera alerta de risco: a psicóloga decide se deve gerar.',
  },
};

/** Instrumentos em uso, na ordem em que aparecem na tela. */
export const CLINICAL_INSTRUMENTS = [PHQ9, GAD7, DASS21, PCL5];

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
