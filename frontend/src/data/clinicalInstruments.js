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
// Só entram com as perguntas completas instrumentos de uso livre, com
// texto brasileiro liberado também para uso comercial: tradução oficial
// publicada pelo detentor ou artigo com licença CC BY. Artigo CC BY-NC não
// basta. Escala com direito autoral entra só com nome, faixa e escore
// (AGENTS.md §7).
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

// PHQ-4: as duas primeiras perguntas do GAD-7 e do PHQ-9, na ordem do
// formulário de Kroenke (2009), com o mesmo texto brasileiro oficial da
// Pfizer. Duas notas de 0 a 6, cada uma com o corte 3 que diz qual escala
// completa aplicar depois.
export const PHQ4 = {
  id: 'phq4',
  version: 1,
  shortName: 'PHQ-4',
  article: 'o',
  name: 'Questionário de Saúde do Paciente para ansiedade e depressão (PHQ-4)',
  measures: 'rastreio rápido de ansiedade e depressão nas últimas 2 semanas',
  disciplines: ['psicologia'],
  population: 'Adultos',
  minutes: 1,
  reapplyAfterDays: 14,
  instructions: 'Durante as últimas 2 semanas, com que frequência você foi incomodado(a) pelos problemas abaixo?',
  items: [
    { id: 'q1', text: GAD7.items[0].text },
    { id: 'q2', text: GAD7.items[1].text },
    { id: 'q3', text: PHQ9.items[1].text },
    { id: 'q4', text: PHQ9.items[0].text },
  ].map(item => ({ ...item, options: FREQUENCY_OPTIONS })),
  extraItems: [],
  scoring: {
    method: 'subscales',
    multiplier: 1,
    subscales: [
      {
        id: 'ansiedade',
        label: 'Ansiedade (GAD-2)',
        short: 'A',
        items: ['q1', 'q2'],
        min: 0,
        max: 6,
        bands: [
          { id: 'abaixo_corte', label: 'Abaixo do ponto de corte', min: 0, max: 2 },
          { id: 'corte_ou_acima', label: 'No ponto de corte ou acima', min: 3, max: 6 },
        ],
      },
      {
        id: 'depressao',
        label: 'Depressão (PHQ-2)',
        short: 'D',
        items: ['q3', 'q4'],
        min: 0,
        max: 6,
        bands: [
          { id: 'abaixo_corte', label: 'Abaixo do ponto de corte', min: 0, max: 2 },
          { id: 'corte_ou_acima', label: 'No ponto de corte ou acima', min: 3, max: 6 },
        ],
      },
    ],
  },
  bands: [],
  reading: 'São duas notas de 0 a 6: ansiedade (duas perguntas do GAD-7) e depressão (duas do PHQ-9). Nota 3 ou mais pede a escala completa (GAD-7 ou PHQ-9). É um rastreio rápido e não substitui a avaliação clínica.',
  sources: [
    'Kroenke K, Spitzer RL, Williams JBW, Löwe B. An ultra-brief screening scale for anxiety and depression: the PHQ-4. Psychosomatics. 2009;50(6):613-21.',
    'Löwe B et al. A 4-item measure of depression and anxiety: validation and standardization of the PHQ-4 in the general population. J Affect Disord. 2010;122(1-2):86-95.',
  ],
  license: 'PHQ © Pfizer Inc. Uso livre: segundo o site oficial, não é preciso permissão para reproduzir, traduzir, exibir ou distribuir. Texto da tradução brasileira oficial do PHQ-9 e do GAD-7.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Montado com as perguntas do PHQ-9 e do GAD-7 já cadastrados, na ordem do formulário original. O PHQ-4 também tem nota total (0 a 12; faixas 0-2, 3-5, 6-8 e 9-12), que não aparece aqui: a tela mostra as duas notas com o corte 3 de cada uma. A psicóloga responsável confere se quer a nota total também.',
  },
};

// K10: tradução brasileira oficial publicada pelo autor (Harvard), feita
// para o comitê da CIDI por Wang, Gorenstein, Andrade (USP) e Viana (UFES).
// As opções seguem a ordem da folha (de "O tempo todo" a "Nunca").
const K10_OPTIONS = [
  { value: 5, label: 'O tempo todo' },
  { value: 4, label: 'A maior parte do tempo' },
  { value: 3, label: 'Parte do tempo' },
  { value: 2, label: 'Um pouco' },
  { value: 1, label: 'Nunca' },
];

export const K10 = {
  id: 'k10',
  version: 1,
  shortName: 'K10',
  // "a K10": escala de sofrimento psíquico.
  article: 'a',
  name: 'Escala de Sofrimento Psíquico de Kessler (K10)',
  measures: 'sofrimento psíquico nos últimos 30 dias',
  disciplines: ['psicologia'],
  population: 'Adultos',
  minutes: 3,
  reapplyAfterDays: 30,
  // Na folha: "circule o número". Na tela, marca-se a opção.
  instructions: 'As questões seguintes perguntam sobre como você tem se sentido durante os últimos 30 dias. Para cada questão, por favor, marque a opção que melhor descreve com que frequência você se sentiu assim. Durante os últimos 30 dias, com que frequência você se sentiu...',
  items: [
    { id: 'q1', text: '...exausto (a) sem um bom motivo?' },
    { id: 'q2', text: '...nervoso (a)?' },
    { id: 'q3', text: '...tão nervoso (a) que nada podia acalmá-lo (a)?' },
    { id: 'q4', text: '...sem esperança?' },
    { id: 'q5', text: '...inquieto (a) ou agitado (a)?' },
    { id: 'q6', text: '...tão inquieto (a) que você não conseguia ficar parado (a)?' },
    { id: 'q7', text: '...deprimido (a)?' },
    { id: 'q8', text: '...tão deprimido (a) que nada conseguia animá-lo (a)?' },
    { id: 'q9', text: 'Durante os últimos 30 dias, com que frequência você sentiu que tudo era um esforço?' },
    { id: 'q10', text: '...sem valor?' },
  ].map(item => ({ ...item, options: K10_OPTIONS })),
  extraItems: [],
  scoring: { method: 'sum', min: 10, max: 50 },
  bands: [
    { id: 'baixo', label: 'Baixo', min: 10, max: 15 },
    { id: 'moderado', label: 'Moderado', min: 16, max: 21 },
    { id: 'alto', label: 'Alto', min: 22, max: 29 },
    { id: 'muito_alto', label: 'Muito alto', min: 30, max: 50 },
  ],
  reading: 'A nota soma as 10 perguntas (10 a 50): "Nunca" vale 1 e "O tempo todo" vale 5. Quanto maior, mais sofrimento psíquico no último mês. A faixa é a do instrumento e não substitui a avaliação clínica.',
  sources: [
    'Kessler RC et al. Short screening scales to monitor population prevalences and trends in non-specific psychological distress. Psychol Med. 2002;32(6):959-76.',
    'Kessler RC et al. Screening for serious mental illness in the general population. Arch Gen Psychiatry. 2003;60(2):184-9.',
    'Andrews G, Slade T. Interpreting scores on the Kessler Psychological Distress Scale (K10). Aust N Z J Public Health. 2001;25(6):494-7.',
  ],
  license: 'K10 © Ronald C. Kessler, PhD. All rights reserved. Uso livre, sem necessidade de permissão, citando o artigo de 2003 e o copyright (site oficial, Harvard). Tradução brasileira publicada no mesmo site para uso sem restrição.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Faixas de Andrews e Slade (2001), de uma pesquisa australiana; não há corte brasileiro na fonte usada. Kessler pontua de 0 a 4 por pergunta (0 a 40); aqui vale 1 a 5 (10 a 50) para usar essas faixas, com a mesma ordem entre pacientes. Na instrução, "circule o número" virou "marque a opção"; a grafia de "freqüência" foi atualizada. As perguntas extras da folha (K10+, sobre dias sem conseguir trabalhar e consultas) ficaram de fora: não entram na nota. A psicóloga responsável confere o texto e as faixas.',
  },
};

// PHQ-15: as 13 queixas físicas da pergunta 1 do PHQ brasileiro oficial
// (Pfizer) mais cansaço e sono, como no PHQ-15 de Kroenke (2002), todas
// com as três respostas da pergunta 1.
const PHQ15_OPTIONS = [
  { value: 0, label: 'Não fui incomodado/a' },
  { value: 1, label: 'Pouco incomodado/a' },
  { value: 2, label: 'Muito incomodado/a' },
];

export const PHQ15 = {
  id: 'phq15',
  version: 1,
  shortName: 'PHQ-15',
  article: 'o',
  name: 'Questionário de Saúde do Paciente: sintomas físicos (PHQ-15)',
  measures: 'incômodo com sintomas físicos nas últimas 4 semanas',
  disciplines: ['psicologia'],
  population: 'Adolescentes e adultos',
  minutes: 4,
  reapplyAfterDays: 28,
  instructions: 'Durante as últimas 4 semanas, o quanto você foi incomodado/a por qualquer um dos problemas abaixo?',
  items: [
    { id: 'q1', text: 'Dor de estômago' },
    { id: 'q2', text: 'Dor nas costas' },
    { id: 'q3', text: 'Dor nos braços, nas pernas ou nas juntas (joelhos, quadril, etc.)' },
    // Na folha: "(somente para mulheres)". Aqui ninguém é tratado pelo sexo
    // do cadastro (AGENTS.md §8): quem não menstrua marca a primeira opção,
    // que vale zero, como o item omitido do original.
    { id: 'q4', text: 'Cólicas menstruais ou outros problemas com sua menstruação (se não se aplica a você, marque “Não fui incomodado/a”)' },
    { id: 'q5', text: 'Dor ou problemas durante a relação sexual' },
    { id: 'q6', text: 'Dores de cabeça' },
    { id: 'q7', text: 'Dor no peito' },
    { id: 'q8', text: 'Tontura' },
    { id: 'q9', text: 'Desmaios' },
    { id: 'q10', text: 'Sentir seu coração bater mais forte ou disparar' },
    { id: 'q11', text: 'Falta de ar' },
    { id: 'q12', text: 'Prisão de ventre, intestino solto ou diarreia' },
    { id: 'q13', text: 'Enjoo, gases ou indigestão' },
    { id: 'q14', text: 'Se sentir cansado/a ou com pouca energia' },
    { id: 'q15', text: 'Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que de costume' },
  ].map(item => ({ ...item, options: PHQ15_OPTIONS })),
  extraItems: [],
  scoring: { method: 'sum', min: 0, max: 30 },
  bands: [
    { id: 'minima', label: 'Mínima', min: 0, max: 4 },
    { id: 'baixa', label: 'Baixa', min: 5, max: 9 },
    { id: 'media', label: 'Média', min: 10, max: 14 },
    { id: 'alta', label: 'Alta', min: 15, max: 30 },
  ],
  reading: 'A nota soma as 15 perguntas (0 a 30) e mostra o quanto os sintomas físicos incomodaram no último mês. Não diz a causa dos sintomas: queixa física pede avaliação médica. A faixa é a do instrumento e não substitui a avaliação clínica.',
  sources: [
    'Kroenke K, Spitzer RL, Williams JBW. The PHQ-15: validity of a new measure for evaluating the severity of somatic symptoms. Psychosom Med. 2002;64(2):258-66.',
  ],
  license: 'PHQ © Pfizer Inc. Uso livre: segundo o site oficial, não é preciso permissão para reproduzir, traduzir, exibir ou distribuir. Texto da tradução brasileira oficial do PHQ completo.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'O site oficial não tem o PHQ-15 avulso em português: as 13 queixas vêm da pergunta 1 do PHQ brasileiro oficial, e cansaço e sono vêm das perguntas do PHQ-9 do mesmo PHQ, com as três respostas da pergunta 1, como no PHQ-15 original. No item das cólicas, "(somente para mulheres)" virou a orientação de marcar "Não fui incomodado/a" quando não se aplica (vale zero, como o item omitido). Grafia de "diarréia" e "enjôo" atualizada. Faixas de Kroenke (2002). A psicóloga responsável confere o texto e as faixas.',
  },
};

// ASRS-6: tradução brasileira oficial publicada pelos autores (Harvard),
// feita por Maria Carmen Viana. Uso livre, inclusive comercial, desde que
// a escala não seja alterada: todas as respostas, a regra de pontos e os
// dois tons de sombreado. `shadeFrom` = a partir de qual resposta a
// pergunta fica na área escura da folha (as outras ficam na área clara).
const ASRS_OPTIONS = [
  { value: 0, label: 'Nunca' },
  { value: 1, label: 'Raramente' },
  { value: 2, label: 'Algumas vezes' },
  { value: 3, label: 'Frequentemente' },
  { value: 4, label: 'Muito frequentemente' },
];

export const ASRS6 = {
  id: 'asrs6',
  version: 1,
  shortName: 'ASRS-6',
  article: 'a',
  name: 'Escala de Autoavaliação de TDAH em Adultos, 6 perguntas (ASRS-V1.1)',
  measures: 'rastreio de sintomas de TDAH nos últimos 6 meses',
  disciplines: ['psicologia'],
  population: 'Adultos (18 anos ou mais)',
  minutes: 3,
  reapplyAfterDays: 180,
  // A folha pede para entregar o papel na próxima consulta; na tela não há papel.
  instructions: 'Assinale a alternativa que melhor descreve a forma como você tem se sentido e comportado nos últimos 6 meses.',
  items: [
    { id: 'q1', shadeFrom: 2, text: 'Com que frequência você sente dificuldade para finalizar os últimos detalhes de uma tarefa, depois de já ter feito as partes mais complicadas?' },
    { id: 'q2', shadeFrom: 2, text: 'Com que frequência você sente dificuldade para manter as coisas em ordem quando precisa realizar uma tarefa que exige organização?' },
    { id: 'q3', shadeFrom: 2, text: 'Com que frequência você tem problemas para se lembrar de compromissos ou obrigações?' },
    { id: 'q4', shadeFrom: 3, text: 'Quando precisa realizar uma tarefa que exige muita concentração, com que frequência você evita ou atrasa o seu início?' },
    { id: 'q5', shadeFrom: 3, text: 'Com que frequência você fica se mexendo na cadeira ou balançando as mãos ou os pés quando precisa ficar sentado(a) durante um longo período de tempo?' },
    { id: 'q6', shadeFrom: 3, text: 'Com que frequência você se sente excessivamente ativo(a) e compelido(a) a fazer coisas, como se fosse conduzido(a) por um motor?' },
  ].map(item => ({ ...item, options: ASRS_OPTIONS })),
  extraItems: [],
  scoring: { method: 'sum', min: 0, max: 24 },
  bands: [
    { id: 'negativo_baixo', label: 'Negativo baixo', min: 0, max: 9 },
    { id: 'negativo_alto', label: 'Negativo alto', min: 10, max: 13 },
    { id: 'positivo_baixo', label: 'Positivo baixo', min: 14, max: 17 },
    { id: 'positivo_alto', label: 'Positivo alto', min: 18, max: 24 },
  ],
  reading: 'A nota soma as 6 perguntas (0 a 24): "Nunca" vale 0 e "Muito frequentemente" vale 4. Nota 14 ou mais é rastreio positivo e pede avaliação clínica de TDAH. É um rastreio, não um diagnóstico. Pergunta sobre os últimos 6 meses.',
  sources: [
    'Kessler RC et al. The World Health Organization Adult ADHD Self-Report Scale (ASRS): a short screening scale for use in the general population. Psychol Med. 2005;35(2):245-56.',
    'Kessler RC et al. Validity of the World Health Organization Adult ADHD Self-Report Scale (ASRS) Screener in a representative sample of health plan members. Int J Methods Psychiatr Res. 2007;16(2):52-65.',
    'ASRS v1.1 Scoring update. National Comorbidity Survey, Harvard Medical School; 2024.',
  ],
  license: 'ASRS-V1.1 © New York University and Ronald C. Kessler, PhD. All rights reserved. Uso livre da tela de 6 perguntas, inclusive comercial, sem necessidade de permissão, citando Kessler (2005) e o copyright, sem alterar respostas, regra de pontos nem os dois tons de sombreado (site oficial, Harvard). Tradução brasileira oficial publicada no mesmo site.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Pontuação de 0 a 24 com corte 14 e quatro faixas, da atualização oficial de 2024. A folha brasileira ainda traz a regra antiga: contar as respostas na área escura, com 4 ou mais como positivo; o sombreado continua na tela, como os autores exigem. Na instrução saiu o pedido de entregar a folha na próxima consulta, e a grafia de "freqüência" foi atualizada. A psicóloga responsável confere o texto e qual regra quer ver.',
  },
};

// Rosenberg: versão brasileira EPM/Rosenberg de Dini, Quaresma e Ferreira
// (2004), na Revista Brasileira de Cirurgia Plástica (CC BY 4.0). A escala
// original é de domínio público. Metade das frases é invertida: o ponto de
// cada opção vem na própria pergunta. Não tem faixas clínicas.
const agreement = values => [
  { value: values[0], label: 'Concordo plenamente' },
  { value: values[1], label: 'Concordo' },
  { value: values[2], label: 'Discordo' },
  { value: values[3], label: 'Discordo plenamente' },
];
const ROSENBERG_POSITIVE = agreement([3, 2, 1, 0]);
const ROSENBERG_REVERSED = agreement([0, 1, 2, 3]);

export const ROSENBERG = {
  id: 'rosenberg',
  version: 1,
  shortName: 'Rosenberg',
  // "a Rosenberg": a escala de autoestima.
  article: 'a',
  name: 'Escala de Autoestima de Rosenberg (EPM/Rosenberg)',
  measures: 'autoestima global',
  disciplines: ['psicologia'],
  population: 'Adolescentes e adultos',
  minutes: 3,
  reapplyAfterDays: 30,
  // A fonte traz só as frases e as opções: a instrução é nossa.
  instructions: 'Leia cada frase e marque o quanto você concorda ou discorda dela.',
  items: [
    { id: 'q1', options: ROSENBERG_POSITIVE, text: 'De uma forma geral (apesar de tudo), estou satisfeito(a) comigo mesmo(a).' },
    { id: 'q2', options: ROSENBERG_REVERSED, text: 'Às vezes, eu acho que eu não sirvo para nada (desqualificado(a) ou inferior em relação aos outros).' },
    { id: 'q3', options: ROSENBERG_POSITIVE, text: 'Eu sinto que eu tenho um tanto (um número) de boas qualidades.' },
    { id: 'q4', options: ROSENBERG_POSITIVE, text: 'Eu sou capaz de fazer coisas tão bem quanto a maioria das outras pessoas (desde que me ensinadas).' },
    { id: 'q5', options: ROSENBERG_REVERSED, text: 'Não sinto satisfação nas coisas que realizei. Eu sinto que não tenho muito do que me orgulhar.' },
    { id: 'q6', options: ROSENBERG_REVERSED, text: 'Às vezes, eu realmente me sinto inútil (incapaz de fazer as coisas).' },
    { id: 'q7', options: ROSENBERG_POSITIVE, text: 'Eu sinto que sou uma pessoa de valor, pelo menos num plano igual (num mesmo nível) às outras pessoas.' },
    { id: 'q8', options: ROSENBERG_REVERSED, text: 'Não me dou o devido valor. Gostaria de ter mais respeito por mim mesmo(a).' },
    { id: 'q9', options: ROSENBERG_REVERSED, text: 'Quase sempre eu estou inclinado(a) a achar que sou um(a) fracassado(a).' },
    { id: 'q10', options: ROSENBERG_POSITIVE, text: 'Eu tenho uma atitude positiva (pensamentos, atos e sentimentos positivos) em relação a mim mesmo(a).' },
  ],
  extraItems: [],
  scoring: { method: 'sum', min: 0, max: 30 },
  // Sem faixa: a escala não tem ponto de corte clínico. A tela mostra só a
  // nota e a comparação com as aplicações anteriores.
  noBands: true,
  bands: [],
  reading: 'A nota soma as 10 frases (0 a 30): quanto maior, maior a autoestima. As frases 2, 5, 6, 8 e 9 contam ao contrário. A escala não tem faixas nem ponto de corte clínico: compare com as aplicações anteriores do mesmo paciente.',
  sources: [
    'Rosenberg M. Society and the adolescent self-image. Princeton: Princeton University Press; 1965.',
    'Dini GM, Quaresma MR, Ferreira LM. Adaptação cultural e validação da versão brasileira da escala de auto-estima de Rosenberg. Rev Soc Bras Cir Plást. 2004;19(1):41-52.',
  ],
  license: 'Escala de Rosenberg: domínio público. Uso livre, inclusive de traduções, com a citação acadêmica de costume (Departamento de Sociologia da Universidade de Maryland). Versão brasileira de Dini, Quaresma e Ferreira (2004), em revista de acesso aberto com licença CC BY 4.0.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Pontuação no sentido original (mais pontos, mais autoestima). A versão EPM/Rosenberg pontua ao contrário (mais pontos, menos autoestima); a informação é a mesma. A fonte não traz instrução para o paciente: a frase da tela foi escrita por nós. Sem faixas: as normas brasileiras por idade (Hutz e Zanon, 2011) usam outra tradução e outra pontuação. A psicóloga responsável confere o texto e se quer alguma referência de comparação.',
  },
};

// PHQ-8: o PHQ-9 sem a pergunta 9 (pensamentos de morte ou de se ferir),
// com o mesmo texto brasileiro oficial da Pfizer. Não rastreia risco.
export const PHQ8 = {
  id: 'phq8',
  version: 1,
  shortName: 'PHQ-8',
  article: 'o',
  name: 'Questionário sobre a Saúde do Paciente, 8 perguntas (PHQ-8)',
  measures: 'sintomas depressivos nas últimas 2 semanas, sem a pergunta sobre pensamentos de morte',
  disciplines: ['psicologia'],
  population: 'Adolescentes e adultos',
  minutes: 4,
  reapplyAfterDays: 14,
  instructions: PHQ9.instructions,
  // As perguntas 1 a 8 não têm item de risco: copia só texto e opções.
  items: PHQ9.items.slice(0, 8).map(item => ({ id: item.id, text: item.text, options: item.options })),
  extraItems: [DIFFICULTY_ITEM],
  scoring: { method: 'sum', min: 0, max: 24 },
  bands: [
    { id: 'minima', label: 'Mínima', min: 0, max: 4 },
    { id: 'leve', label: 'Leve', min: 5, max: 9 },
    { id: 'moderada', label: 'Moderada', min: 10, max: 14 },
    { id: 'moderadamente_grave', label: 'Moderadamente grave', min: 15, max: 19 },
    { id: 'grave', label: 'Grave', min: 20, max: 24 },
  ],
  reading: 'É o PHQ-9 sem a pergunta 9, sobre pensamentos de morte ou de se ferir: não rastreia risco. Para avaliar risco, use o PHQ-9. A nota soma as 8 perguntas (0 a 24); a faixa é a do instrumento e não substitui a avaliação clínica.',
  sources: [
    'Kroenke K, Strine TW, Spitzer RL, Williams JBW, Berry JT, Mokdad AH. The PHQ-8 as a measure of current depression in the general population. J Affect Disord. 2009;114(1-3):163-73.',
  ],
  license: 'PHQ © Pfizer Inc. Uso livre: segundo o site oficial, não é preciso permissão para reproduzir, traduzir, exibir ou distribuir. Texto da tradução brasileira oficial do PHQ-9.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'O site oficial só tem o PHQ-8 em inglês: aqui são as 8 primeiras perguntas do PHQ-9 brasileiro oficial, como no original. Faixas de Kroenke (2009), as mesmas do PHQ-9 até 24. A psicóloga responsável decide quando usar o PHQ-8 em vez do PHQ-9.',
  },
};

// K6: as 6 perguntas do K10 que formam o K6, com o texto da tradução
// brasileira oficial do K10 (Harvard). Pontuação de Kessler: 0 a 4 por
// pergunta, 0 a 24 no total.
const K6_OPTIONS = [
  { value: 4, label: 'O tempo todo' },
  { value: 3, label: 'A maior parte do tempo' },
  { value: 2, label: 'Parte do tempo' },
  { value: 1, label: 'Um pouco' },
  { value: 0, label: 'Nunca' },
];
const k10Text = id => K10.items.find(item => item.id === id).text;

export const K6 = {
  id: 'k6',
  version: 1,
  shortName: 'K6',
  article: 'a',
  name: 'Escala de Sofrimento Psíquico de Kessler, 6 perguntas (K6)',
  measures: 'sofrimento psíquico nos últimos 30 dias',
  disciplines: ['psicologia'],
  population: 'Adultos',
  minutes: 2,
  reapplyAfterDays: 30,
  instructions: K10.instructions,
  items: [
    { id: 'q1', text: k10Text('q2') },
    { id: 'q2', text: k10Text('q4') },
    { id: 'q3', text: k10Text('q5') },
    { id: 'q4', text: k10Text('q8') },
    { id: 'q5', text: k10Text('q9') },
    { id: 'q6', text: k10Text('q10') },
  ].map(item => ({ ...item, options: K6_OPTIONS })),
  extraItems: [],
  scoring: { method: 'sum', min: 0, max: 24 },
  bands: [
    { id: 'baixo', label: 'Baixo', min: 0, max: 4 },
    { id: 'moderado', label: 'Moderado', min: 5, max: 12 },
    { id: 'grave', label: 'Grave', min: 13, max: 24 },
  ],
  reading: 'A nota soma as 6 perguntas (0 a 24): "Nunca" vale 0 e "O tempo todo" vale 4. 13 ou mais aponta sofrimento psíquico grave e pede avaliação; de 5 a 12, moderado. A faixa é a do instrumento e não substitui a avaliação clínica.',
  sources: [
    'Kessler RC et al. Screening for serious mental illness in the general population. Arch Gen Psychiatry. 2003;60(2):184-9.',
    'Prochaska JJ, Sung HY, Max W, Shi Y, Ong M. Validity study of the K6 scale as a measure of moderate mental distress based on mental health treatment need and utilization. Int J Methods Psychiatr Res. 2012;21(2):88-97.',
  ],
  license: 'K6 © Ronald C. Kessler, PhD. All rights reserved. Uso livre, sem necessidade de permissão, citando o artigo de 2003 e o copyright (site oficial, Harvard). O K6 é o K10 sem quatro perguntas; texto da tradução brasileira oficial do K10, publicada no mesmo site para uso sem restrição.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: 'Pontuação de 0 a 4 de Kessler (2003), com corte 13 para sofrimento grave; a faixa moderada (5 a 12) vem de Prochaska (2012). As perguntas são as do K10 brasileiro oficial que formam o K6 (nervoso, sem esperança, inquieto, tão deprimido que nada animava, tudo um esforço, sem valor). A psicóloga responsável confere o texto e as faixas.',
  },
};

// Escala de Autocompaixão: tradução brasileira de Souza e Hutz publicada no
// site oficial da autora, que libera o uso "para qualquer finalidade".
// Respostas de 1 a 5; cada subescala é a média das suas perguntas, e o
// total é a média das seis, com as três negativas invertidas.
const SCS_OPTIONS = [
  { value: 1, label: '1 – Quase nunca' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5 – Quase sempre' },
];
// A faixa da autora é uma régua informal, não uma norma clínica.
const SCS_BANDS = [
  { id: 'baixa', label: 'Baixa', min: 1, max: 2.49 },
  { id: 'moderada', label: 'Moderada', min: 2.5, max: 3.5 },
  { id: 'alta', label: 'Alta', min: 3.51, max: 5 },
];
const SCS_TEXTS = {
  q1: 'Sou realmente crítico e severo com meus próprios erros e defeitos.',
  q2: 'Quando fico “pra baixo”, não consigo parar de pensar em tudo que está errado comigo.',
  q3: 'Quando as coisas vão mal para mim, vejo as dificuldades como parte da vida e que acontecem com todo mundo.',
  q4: 'Quando penso nos meus defeitos, eu me sinto realmente isolado do resto do mundo.',
  q5: 'Tento ser amável comigo quando me sinto emocionalmente mal.',
  q6: 'Quando eu falho em algo importante para mim, fico totalmente consumido por sentimentos de incompetência.',
  q7: 'Quando me sinto realmente mal, lembro que há outras pessoas no mundo se sentindo como eu.',
  q8: 'Quando as coisas estão realmente difíceis, costumo ser duro comigo mesmo.',
  q9: 'Quando algo me deixa aborrecido, tento buscar equilíbrio emocional.',
  q10: 'Quando percebo que fui inadequado, tento lembrar que a maioria das pessoas também passa por isso.',
  q11: 'Sou intolerante e impaciente com os aspectos de que não gosto na minha personalidade.',
  q12: 'Quando estou passando por um momento realmente difícil, eu me dou o apoio e o cuidado de que preciso.',
  q13: 'Quando fico “pra baixo”, sinto que a maioria das pessoas é mais feliz do que eu.',
  q14: 'Quando algo doloroso acontece, tento ver a situação de forma equilibrada.',
  q15: 'Tento entender meus defeitos como parte da condição humana.',
  q16: 'Quando vejo características que eu não gosto em mim, sou duro comigo mesmo.',
  q17: 'Quando eu falho em algo importante para mim, tento ver as coisas por outro ângulo.',
  q18: 'Quando passo por dificuldades emocionais, costumo pensar que as coisas são mais fáceis para as outras pessoas.',
  q19: 'Sou bondoso comigo quando estou passando por algum sofrimento.',
  q20: 'Quando algo me deixa incomodado, sou completamente tomado por sentimentos negativos.',
  q21: 'Costumo ser um pouco insensível comigo quando estou sofrendo.',
  q22: 'Quando fico “pra baixo”, tento aceitar e entender meus sentimentos.',
  q23: 'Sou compreensivo com meus próprios erros e defeitos.',
  q24: 'Quando algo doloroso acontece comigo, costumo reagir de forma exagerada.',
  q25: 'Quando eu falho em algo importante para mim, costumo me sentir muito sozinho nessa situação.',
  q26: 'Tento ser compreensivo e paciente com os aspectos da minha personalidade dos quais não gosto.',
};
const SCS_SOURCE_NOTE = 'Texto da versão brasileira (Souza e Hutz, 2016) como está no site oficial, todo no masculino, com três erros de digitação corrigidos (“costume ser”, “não gusto”, “tent over”).';

export const SCS = {
  id: 'scs',
  version: 1,
  shortName: 'Autocompaixão',
  article: 'a',
  name: 'Escala de Autocompaixão (SCS)',
  measures: 'como a pessoa costuma lidar consigo mesma em momentos difíceis',
  disciplines: ['psicologia'],
  population: 'A partir de 14 anos',
  minutes: 7,
  reapplyAfterDays: 30,
  // Na folha: "À esquerda de cada item, indique". Na tela, marca-se a opção.
  instructions: 'Como eu geralmente lido comigo em momentos difíceis. Por favor, leia com cuidado antes de responder. Para cada item, indique com que frequência você se comporta da forma descrita, de 1 (quase nunca) a 5 (quase sempre).',
  items: Object.entries(SCS_TEXTS).map(([id, text]) => ({ id, text, options: SCS_OPTIONS })),
  extraItems: [],
  scoring: {
    method: 'subscale_means',
    decimals: 2,
    step: 0.01,
    min: 1,
    max: 5,
    subscales: [
      { id: 'bondade', label: 'Bondade consigo', short: 'BC', items: ['q5', 'q12', 'q19', 'q23', 'q26'], min: 1, max: 5, bands: [] },
      { id: 'autocritica', label: 'Autocrítica severa', short: 'AS', items: ['q1', 'q8', 'q11', 'q16', 'q21'], min: 1, max: 5, bands: [], reverseInTotal: true },
      { id: 'humanidade', label: 'Senso de humanidade', short: 'SH', items: ['q3', 'q7', 'q10', 'q15'], min: 1, max: 5, bands: [] },
      { id: 'isolamento', label: 'Isolamento', short: 'IS', items: ['q4', 'q13', 'q18', 'q25'], min: 1, max: 5, bands: [], reverseInTotal: true },
      { id: 'mindfulness', label: 'Mindfulness', short: 'MF', items: ['q9', 'q14', 'q17', 'q22'], min: 1, max: 5, bands: [] },
      { id: 'sobreidentificacao', label: 'Sobre-identificação', short: 'SI', items: ['q2', 'q6', 'q20', 'q24'], min: 1, max: 5, bands: [], reverseInTotal: true },
    ],
  },
  bands: SCS_BANDS,
  reading: 'Notas de 1 a 5, por média. Cada subescala é a média das suas perguntas: nas três negativas (autocrítica severa, isolamento e sobre-identificação), nota alta é menos autocompaixão. O total é a média das seis, com as negativas invertidas: quanto maior, mais autocompaixão. A faixa do total é uma régua informal da autora, sem norma clínica: compare com as aplicações anteriores.',
  sources: [
    'Neff KD. Development and validation of a scale to measure self-compassion. Self and Identity. 2003;2:223-50.',
    'Souza LK, Hutz CS. Escala de Autocompaixão. In: Hutz CS, organizador. Avaliação em Psicologia Positiva. São Paulo: CETEPP; 2016. p. 171-3.',
  ],
  license: 'Uso livre: Kristin Neff permite usar a Escala de Autocompaixão "para qualquer finalidade", inclusive clínica, citando Neff (2003). Versão brasileira de Souza e Hutz publicada no site oficial da autora.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: `${SCS_SOURCE_NOTE} Na instrução, "à esquerda de cada item" virou "para cada item". Faixas do total pela régua informal da autora (1 a 2,49 baixa; 2,5 a 3,5 moderada; 3,51 a 5 alta), que ela mesma diz não ser norma clínica. A psicóloga responsável confere o texto e se quer a forma neutra de gênero.`,
  },
};

// Forma reduzida (Raes e colaboradores, 2011): 12 das 26 perguntas, duas por
// subescala. A autora recomenda só o total (subescalas de 2 perguntas são
// pouco confiáveis); como as seis têm o mesmo tamanho, o total é a média
// das 12 com as negativas invertidas, que vêm invertidas na própria opção.
const SCS_REVERSED = SCS_OPTIONS.map(option => ({ ...option, value: 6 - option.value }));
const SCS_SF_ITEMS = [
  ['q1', 'q6', true], ['q2', 'q26', false], ['q3', 'q14', false], ['q4', 'q13', true],
  ['q5', 'q15', false], ['q6', 'q12', false], ['q7', 'q9', false], ['q8', 'q25', true],
  ['q9', 'q2', true], ['q10', 'q10', false], ['q11', 'q1', true], ['q12', 'q11', true],
];

export const SCSSF = {
  id: 'scssf',
  version: 1,
  shortName: 'Autocompaixão (12)',
  article: 'a',
  name: 'Escala de Autocompaixão, forma reduzida (SCS-SF)',
  measures: 'como a pessoa costuma lidar consigo mesma em momentos difíceis',
  disciplines: ['psicologia'],
  population: 'A partir de 14 anos',
  minutes: 3,
  reapplyAfterDays: 14,
  instructions: SCS.instructions,
  items: SCS_SF_ITEMS.map(([id, from, reversed]) => ({
    id,
    text: SCS_TEXTS[from],
    options: reversed ? SCS_REVERSED : SCS_OPTIONS,
  })),
  extraItems: [],
  scoring: { method: 'mean', decimals: 2, step: 0.01, min: 1, max: 5 },
  bands: SCS_BANDS,
  reading: 'Uma nota de 1 a 5: a média das 12 perguntas, com as frases negativas contando ao contrário. Quanto maior, mais autocompaixão. A faixa é uma régua informal da autora, sem norma clínica: compare com as aplicações anteriores. Para ver as seis subescalas, use a escala completa.',
  sources: [
    'Raes F, Pommier E, Neff KD, Van Gucht D. Construction and factorial validation of a short form of the Self-Compassion Scale. Clin Psychol Psychother. 2011;18(3):250-5.',
    'Souza LK, Hutz CS. Escala de Autocompaixão. In: Hutz CS, organizador. Avaliação em Psicologia Positiva. São Paulo: CETEPP; 2016. p. 171-3.',
  ],
  license: 'Uso livre: Kristin Neff permite usar a forma reduzida "para qualquer finalidade", inclusive clínica, citando Raes e colaboradores (2011). Perguntas da versão brasileira da escala completa, publicada no site oficial da autora.',
  review: {
    status: INSTRUMENT_REVIEW_STATUS.PENDING,
    note: `Montada com as 12 perguntas da forma reduzida original tiradas da versão brasileira completa; não há validação brasileira própria da forma reduzida na fonte usada. ${SCS_SOURCE_NOTE} Faixas pela régua informal da autora. A psicóloga responsável confere se usa a forma reduzida.`,
  },
};

/** Instrumentos em uso, na ordem em que aparecem na tela. */
export const CLINICAL_INSTRUMENTS = [PHQ9, PHQ8, GAD7, PHQ4, DASS21, K10, K6, PCL5, PHQ15, ASRS6, ROSENBERG, SCS, SCSSF];

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
