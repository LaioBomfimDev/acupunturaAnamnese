// ============================================================
// Entrevistas clínicas (aba Entrevistas da Psicologia, 16/10/2026)
//
// Roteiros da clínica para conversar com quem convive com o paciente
// (heterorrelato) ou com o próprio paciente. Diferente das escalas
// (data/clinicalInstruments.js): não têm nota, faixa nem ponto de corte.
// A resposta é lida pela profissional, pergunta por pergunta.
//
// Conteúdo: transcrito igual ao modelo que a clínica mandou, sem
// acrescentar nem tirar pergunta. Mudou pergunta ou alternativa: sobe
// `version`. Cada resposta guarda a cópia das perguntas que a pessoa
// viu, então versão nova não muda o que já foi respondido.
//
// Quem responde (`respondent`):
//   * 'informante' — familiar, professora, colega: responde no
//     consultório ou por um link só dela (nunca pela Área do Paciente,
//     que é do paciente).
// ============================================================

export const INTERVIEW_FREQUENCY_OPTIONS = [
  'Nunca',
  'Raramente',
  'Às vezes',
  'Frequentemente',
  'Quase sempre',
  'Não sei observar',
];

// Respostas que pedem atenção na leitura (destaque visual, nunca nota).
export const INTERVIEW_FREQUENT_ANSWERS = ['Frequentemente', 'Quase sempre', 'Sempre'];
export const INTERVIEW_UNKNOWN_ANSWER = 'Não sei observar';
// A infantil usa "NO" no lugar de "Não sei observar", como no modelo.
export const INTERVIEW_NOT_OBSERVED_ANSWER = 'Não observado / não se aplica';
export const INTERVIEW_UNKNOWN_ANSWERS = [INTERVIEW_UNKNOWN_ANSWER, INTERVIEW_NOT_OBSERVED_ANSWER];

const ECOLOGICA_ADULTO_HETERORRELATO = {
  id: 'ecologica_adulto_heterorrelato',
  version: 1,
  discipline: 'psicologia',
  title: 'Entrevista Ecológica de Funcionamento Neurocomportamental em Adultos — Heterorrelato',
  shortName: 'Entrevista ecológica — adultos (heterorrelato)',
  group: 'Familiar / laboral — adulto',
  slot: 'familiar_laboral',
  audience: 'adulto',
  respondent: 'informante',
  respondentLabel: 'Familiar ou pessoa próxima',
  period: 'os últimos 12 meses',
  source: 'Modelo da clínica, recebido em 16/10/2026',
  purpose:
    'Instrumento de entrevista ecológica complementar e qualitativa para coleta de observações de familiares '
    + 'ou pessoas próximas, incluindo características relacionadas a TEA, TDAH e possíveis condições coexistentes. '
    + 'Não é instrumento psicométrico validado e não gera escore diagnóstico.',
  instructions:
    'Considere o comportamento habitual da pessoa nos últimos 12 meses. Marque uma alternativa por pergunta, '
    + 'conforme o que você realmente observou. Se não tem informação suficiente, selecione Não sei observar. '
    + 'Ao final, poderá registrar exemplos e informar quando as características começaram.',
  technicalNote:
    'Roteiro original de heterorrelato para investigação clínica ecológica, complementar e qualitativa. '
    + 'Não possui escore, ponto de corte ou validação psicométrica. Deve ser interpretado em conjunto com '
    + 'entrevista da pessoa avaliada, observação clínica, história do desenvolvimento e instrumentos padronizados.',
  // "Pessoa avaliada", "Idade" e "Data" vêm do cadastro e do dia da
  // resposta: quem responde não digita.
  identification: [
    { id: 'informante', type: 'short_text', label: 'Informante', help: 'Nome de quem está respondendo.', required: true },
    { id: 'vinculo', type: 'short_text', label: 'Parentesco/vínculo', required: true },
    {
      id: 'convivencia',
      type: 'single',
      label: 'Frequência de convivência',
      options: ['Diária', 'Algumas vezes por semana', 'Ocasional'],
      required: true,
    },
  ],
  sections: [
    {
      id: 'comunicacao',
      title: '1. Comunicação e interação social',
      subtitle: 'Reciprocidade, comunicação pragmática e adaptação social.',
      items: [
        'Tem dificuldade para manter conversas com troca equilibrada de falas?',
        'Interpreta literalmente ironias, indiretas ou expressões figuradas?',
        'Tem dificuldade para perceber sinais de desinteresse, desconforto ou intenção de encerrar uma conversa?',
        'Tem dificuldade para identificar emoções ou intenções de outras pessoas sem explicações diretas?',
        'Apresenta dificuldades para iniciar ou manter amizades e outros vínculos sociais?',
        'Parece ensaiar falas, copiar comportamentos sociais ou demonstrar esforço para se adaptar às interações?',
      ],
    },
    {
      id: 'flexibilidade',
      title: '2. Flexibilidade, sensorialidade e padrões repetitivos',
      subtitle: 'Rigidez, interesses, movimentos e processamento sensorial.',
      items: [
        'Reage com sofrimento intenso diante de alterações inesperadas na rotina?',
        'Insiste em regras ou formas específicas de realizar atividades, mesmo quando existem alternativas?',
        'Dedica atenção muito intensa ou prolongada a assuntos ou atividades específicos?',
        'Apresenta movimentos, gestos, falas ou manipulação de objetos de maneira repetitiva?',
        'Demonstra sensibilidade acentuada a sons, luzes, cheiros, texturas, alimentos ou contato físico?',
        'Busca repetidamente determinadas sensações físicas, movimentos, sons ou estímulos visuais?',
      ],
    },
    {
      id: 'atencao',
      title: '3. Atenção e funções executivas',
      subtitle: 'Desatenção, memória operacional, planejamento e organização.',
      items: [
        'Comete erros por desatenção ou deixa passar detalhes importantes em tarefas cotidianas?',
        'Tem dificuldade para manter a atenção em tarefas prolongadas ou pouco interessantes?',
        'Parece não acompanhar o que lhe dizem, mesmo sem uma distração evidente?',
        'Inicia atividades, mas tem dificuldade para concluí-las ou seguir todas as etapas?',
        'Demonstra dificuldade para planejar, organizar prioridades ou estimar o tempo necessário para tarefas?',
        'Evita ou adia atividades que exigem esforço mental prolongado?',
        'Esquece compromissos, perde objetos ou se distrai facilmente com estímulos e pensamentos?',
      ],
    },
    {
      id: 'hiperatividade',
      title: '4. Hiperatividade e impulsividade',
      subtitle: 'Inquietação, inibição comportamental e decisões.',
      items: [
        'Apresenta inquietação física, mexe constantemente mãos ou pés ou demonstra necessidade de movimentar-se?',
        'Parece estar frequentemente acelerada, inquieta internamente ou com dificuldade para relaxar?',
        'Interrompe conversas, completa falas alheias ou responde antes de ouvir toda a pergunta?',
        'Tem dificuldade para esperar sua vez em conversas, atividades ou situações do cotidiano?',
        'Age ou toma decisões precipitadamente, sem considerar adequadamente as consequências?',
      ],
    },
    {
      id: 'regulacao',
      title: '5. Regulação emocional e expressão comportamental',
      subtitle: 'Intensidade emocional, recuperação e mudanças de expressão.',
      items: [
        'Apresenta reações emocionais intensas diante de pequenas frustrações ou mudanças?',
        'Demora a se recuperar emocionalmente após conflitos ou situações estressantes?',
        'Quando está muito feliz, triste ou insegura, modifica significativamente sua voz, gestos ou maneira de agir?',
        'Em determinadas situações emocionais, apresenta modos de brincar, falar ou buscar acolhimento que contrastam com seu comportamento habitual?',
        'Em momentos de dificuldade, busca apoio ou proteção de outras pessoas de modo que interfere na resolução autônoma da situação?',
      ],
    },
    {
      id: 'humor',
      title: '6. Ansiedade, humor e relações interpessoais',
      subtitle: 'Sintomas internalizantes e alterações afetivas que merecem investigação.',
      items: [
        'Demonstra preocupações excessivas ou dificuldade para controlar preocupações cotidianas?',
        'Evita situações sociais principalmente por medo de julgamento, rejeição ou constrangimento?',
        'Apresenta períodos prolongados de tristeza, desânimo ou perda de interesse em atividades habituais?',
        'Apresenta irritabilidade persistente ou alterações importantes de humor em relação ao seu padrão habitual?',
        'Já apresentou períodos distintos de vários dias com energia ou atividade muito aumentada e necessidade de sono reduzida, fora do seu padrão habitual?',
        'Reage com medo intenso de abandono, rejeição ou afastamento de pessoas próximas, com repercussões em suas relações?',
      ],
    },
    {
      id: 'associados',
      title: '7. Comportamentos associados e saúde',
      subtitle: 'Obsessões, compulsões, sono, experiências estressantes e outras condições.',
      items: [
        'Apresenta pensamentos intrusivos e indesejados que provocam sofrimento ou tentativas repetidas de neutralizá-los?',
        'Realiza verificações, contagens ou rituais repetitivos para reduzir medo ou ansiedade?',
        'Apresenta dificuldades persistentes de sono, como insônia, sono irregular ou sonolência diurna?',
        'Apresenta reações intensas a lembranças de acontecimentos ameaçadores, com evitação ou estado de alerta aumentado?',
        'Apresenta alterações importantes de alimentação, restrição alimentar, consumo de substâncias ou outros hábitos que prejudiquem sua saúde?',
      ],
    },
    {
      id: 'autonomia',
      title: '8. Autonomia e impacto funcional',
      subtitle: 'Independência, responsabilidades e prejuízos reais.',
      items: [
        'Precisa de ajuda para organizar compromissos, administrar dinheiro ou cumprir responsabilidades habituais?',
        'Tem dificuldade para iniciar ou executar tarefas cotidianas mesmo quando demonstra compreender como realizá-las?',
        'Apresenta dificuldades importantes para resolver imprevistos ou tomar decisões de forma independente?',
        'As características observadas interferem em relações familiares, sociais, trabalho ou estudos?',
        'Necessita de adaptações, lembretes ou apoio frequente para manter seu funcionamento cotidiano?',
      ],
    },
    {
      id: 'persistencia',
      title: '9. Persistência, evolução e contextos',
      subtitle: 'Informações essenciais para interpretação diferencial.',
      items: [
        'As características de interação social, flexibilidade ou sensorialidade já eram percebidas antes da vida adulta?',
        'As dificuldades de atenção, organização ou impulsividade já estavam presentes na infância ou adolescência?',
        'Houve surgimento recente ou piora importante dos comportamentos após estresse, adoecimento, perdas ou mudanças significativas?',
      ],
    },
  ],
  complementary: {
    title: 'Contextualização complementar (opcional)',
    questions: [
      {
        id: 'ambientes',
        type: 'multiple',
        label: 'Em quais ambientes as dificuldades são percebidas?',
        help: 'Pode marcar mais de uma.',
        options: ['Casa', 'Trabalho ou estudos', 'Relações sociais', 'Locais públicos', 'Em praticamente todos os ambientes', 'Não sei informar'],
      },
      {
        id: 'impacto',
        type: 'single',
        label: 'Qual o impacto funcional geral observado?',
        help: 'Uma alternativa.',
        options: [
          'Não há prejuízo perceptível',
          'Leve — dificuldades pontuais',
          'Moderado — precisa de apoio em algumas situações',
          'Importante — necessita de apoio frequente',
          'Não sei avaliar',
        ],
      },
      {
        id: 'evolucao',
        type: 'single',
        label: 'Como as características evoluíram?',
        help: 'Uma alternativa.',
        options: [
          'Persistentes desde etapas anteriores da vida',
          'Antigas, mas intensificadas recentemente',
          'Surgiram na vida adulta',
          'Surgiram ou se modificaram após um acontecimento específico',
          'Não sei informar',
        ],
      },
      {
        id: 'mudancas',
        type: 'multiple',
        label: 'Se existem mudanças marcantes na maneira de falar, agir ou buscar acolhimento, quando acontecem?',
        help: 'Pode marcar mais de uma.',
        options: [
          'Quando está feliz ou empolgada',
          'Quando está triste ou insegura',
          'Quando é contrariada',
          'Quando está com pessoas próximas',
          'Quando precisa de atenção ou auxílio',
          'Em situações de cansaço ou estresse',
          'Não observo essas mudanças',
          'Não sei informar',
        ],
      },
      { id: 'exemplos', type: 'long_text', label: 'Exemplos recentes (situação, contexto, reação e consequências)' },
      { id: 'observacoes', type: 'long_text', label: 'Outras observações' },
    ],
  },
};

const ECOLOGICA_INFANTIL_HETERORRELATO = {
  id: 'ecologica_infantil_heterorrelato',
  version: 1,
  discipline: 'psicologia',
  title: 'Entrevista Ecológica Infantil de Heterorrelato',
  shortName: 'Entrevista ecológica — crianças (heterorrelato)',
  group: 'Pais e professores — criança',
  slot: 'pais_professores',
  audience: 'infantil',
  respondent: 'informante',
  respondentLabel: 'Pais, responsáveis, professores ou pessoa próxima',
  period: 'preferencialmente os últimos seis meses',
  source: 'Modelo da clínica, recebido em 26/10/2026',
  frequencyOptions: ['Nunca', 'Raramente', 'Às vezes', 'Frequentemente', 'Quase sempre', INTERVIEW_NOT_OBSERVED_ANSWER],
  purpose:
    'Instrumento clínico complementar à avaliação neuropsicológica. Roteiro clínico estruturado de heterorrelato, '
    + 'desenvolvido para investigação ecológica e levantamento de informações complementares à avaliação '
    + 'neuropsicológica infantil.',
  instructions:
    'Este questionário tem como objetivo compreender como a criança se comporta, aprende, comunica-se, relaciona-se '
    + 'e realiza suas atividades no cotidiano. Não existem respostas certas ou erradas. As informações devem refletir '
    + 'aquilo que o informante realmente observa, evitando interpretações baseadas apenas em expectativas sobre o '
    + 'comportamento infantil. Considere preferencialmente os últimos seis meses, indicando quando determinado '
    + 'comportamento está presente desde a primeira infância ou surgiu recentemente. Nunca: o comportamento não é '
    + 'observado. Raramente: acontece em situações isoladas. Às vezes: acontece ocasionalmente. Frequentemente: '
    + 'acontece em diversas situações. Quase sempre: é uma característica muito presente no cotidiano. Não observado / '
    + 'não se aplica: não há oportunidade de observar ou a situação não corresponde à realidade da criança. Sempre que '
    + 'possível, descreva situações reais que exemplifiquem as respostas.',
  technicalNote:
    'Não constitui instrumento psicológico padronizado, escala validada, teste diagnóstico ou medida psicométrica. '
    + 'As alternativas de frequência organizam o relato, mas não possuem pontos de corte ou interpretação normativa. '
    + 'Os comportamentos descritos devem ser analisados considerando a idade, o nível de desenvolvimento, a '
    + 'escolarização, as oportunidades de aprendizagem, o contexto sociocultural, a duração dos sintomas e a presença '
    + 'de prejuízo funcional. As informações devem ser integradas às entrevistas clínicas, observação comportamental, '
    + 'história do desenvolvimento, instrumentos validados pertinentes e demais dados obtidos na avaliação '
    + 'neuropsicológica. O heterorrelato, isoladamente, não confirma nem exclui hipóteses diagnósticas.',
  // Nome, nascimento e idade da criança, data e profissional vêm do
  // cadastro e do dia da resposta: quem responde não digita.
  identification: [
    { id: 'escolaridade', type: 'short_text', label: 'Escolaridade/Ano escolar' },
    { id: 'informante', type: 'short_text', label: 'Nome do informante', required: true },
    { id: 'vinculo', type: 'short_text', label: 'Vínculo com a criança', required: true },
    { id: 'tempo_convivencia', type: 'short_text', label: 'Tempo de convivência' },
    { id: 'convivencia', type: 'short_text', label: 'Frequência de contato' },
  ],
  sections: [
    {
      id: 'atencao',
      title: '3. Atenção e funções executivas',
      example: true,
      items: [
        'A criança apresenta dificuldade para permanecer concentrada em atividades que exigem esforço mental contínuo?',
        'Quando recebe instruções com duas ou mais etapas, costuma esquecer parte do que precisa fazer?',
        'Distrai-se facilmente com conversas, sons, movimentos ou acontecimentos ao redor?',
        'Precisa que um adulto repita orientações ou acompanhe constantemente a execução de atividades?',
        'Inicia tarefas, mas frequentemente as abandona antes de concluí-las?',
        'Apresenta dificuldade para organizar materiais, planejar atividades ou seguir uma sequência de ações?',
        'Age precipitadamente, responde antes de ouvir toda a pergunta ou tem dificuldade para esperar?',
        'Demonstra inquietação motora, movimentando mãos, pés ou corpo em situações que exigem permanecer sentada?',
      ],
    },
    {
      id: 'memoria',
      title: '4. Memória e aprendizagem',
      example: true,
      items: [
        'Apresenta dificuldade para recordar informações que foram ensinadas ou explicadas recentemente?',
        'Precisa de muitas repetições para aprender conteúdos ou procedimentos novos?',
        'Esquece recados, combinados ou acontecimentos relevantes do cotidiano?',
        'Apresenta dificuldade para utilizar, em outra situação, algo que já aprendeu?',
        'Necessita de mais tempo ou auxílio que outras crianças da mesma faixa etária para compreender atividades escolares?',
        'Demonstra dificuldades persistentes em leitura, escrita ou matemática, considerando sua idade e escolaridade?',
      ],
    },
    {
      id: 'linguagem',
      title: '5. Linguagem e comunicação',
      example: true,
      items: [
        'Apresenta dificuldade para compreender instruções verbais, principalmente quando são longas ou complexas?',
        'Precisa que as informações sejam reformuladas com palavras mais simples para compreendê-las?',
        'Tem dificuldade para organizar verbalmente uma história, explicar acontecimentos ou relatar experiências?',
        'Apresenta dificuldade para encontrar palavras, nomear objetos ou expressar o que deseja?',
        'Demonstra dificuldade para compreender ironias, brincadeiras, expressões figuradas ou sentidos implícitos adequados à sua idade?',
        'Apresenta dificuldades para manter conversas, respeitar turnos de fala ou adaptar sua comunicação à situação?',
      ],
    },
    {
      id: 'social',
      title: '6. Interação social e reciprocidade',
      example: true,
      items: [
        'Apresenta dificuldade para iniciar aproximações ou participar de brincadeiras com outras crianças?',
        'Tem dificuldade para compreender regras sociais, intenções ou sentimentos de outras pessoas?',
        'Apresenta dificuldade para compartilhar interesses, experiências ou emoções espontaneamente?',
        'Costuma preferir atividades solitárias mesmo quando existem oportunidades adequadas de interação?',
        'Apresenta dificuldade para manter amizades ou participar de atividades em grupo?',
        'Tem dificuldade para adaptar o próprio comportamento quando a brincadeira ou interação exige negociação e flexibilidade?',
      ],
    },
    {
      id: 'flexibilidade',
      title: '7. Flexibilidade cognitiva, comportamentos repetitivos e sensorialidade',
      example: true,
      items: [
        'Demonstra sofrimento ou resistência acentuada diante de mudanças inesperadas na rotina?',
        'Apresenta dificuldade para aceitar maneiras diferentes de realizar uma atividade ou resolver um problema?',
        'Manifesta interesses muito intensos ou restritos que interferem na participação em outras atividades?',
        'Apresenta movimentos repetitivos, vocalizações repetidas ou manipulação repetitiva de objetos?',
        'Demonstra reações incomuns ou intensas diante de sons, luzes, cheiros, texturas, roupas ou alimentos?',
        'Busca repetidamente determinadas experiências sensoriais, como girar, balançar, tocar objetos ou observar movimentos?',
      ],
    },
    {
      id: 'regulacao',
      title: '8. Regulação emocional e comportamental',
      example: true,
      items: [
        'Demonstra preocupação excessiva, medo de errar ou necessidade frequente de confirmação?',
        'Apresenta irritabilidade, choro ou reações emocionais intensas diante de pequenas frustrações?',
        'Tem dificuldade para se acalmar ou recuperar o equilíbrio emocional após ficar contrariada?',
        'Evita atividades ou situações por insegurança, medo de julgamento ou possibilidade de fracasso?',
        'Demonstra tristeza, desânimo, isolamento ou perda de interesse por atividades anteriormente prazerosas?',
        'Apresenta comportamentos de oposição, agressividade verbal ou física, ou dificuldade para aceitar limites?',
      ],
    },
    {
      id: 'autonomia',
      title: '9. Autonomia e funcionamento adaptativo',
      example: true,
      items: [
        'Necessita de auxílio acima do esperado para sua idade em atividades de higiene, alimentação ou vestuário?',
        'Apresenta dificuldade para cuidar dos próprios pertences ou cumprir pequenas responsabilidades compatíveis com a idade?',
        'Necessita de supervisão constante para realizar atividades que já deveria conseguir executar com independência?',
        'Demonstra dificuldade para reconhecer riscos cotidianos ou adotar comportamentos básicos de segurança adequados à idade?',
        'Tem dificuldade para lidar com mudanças de ambiente, novas pessoas ou situações cotidianas pouco familiares?',
        'Apresenta dificuldade para colocar em prática habilidades que demonstra conhecer quando precisa utilizá-las de maneira independente?',
      ],
    },
    {
      id: 'motora',
      title: '10. Coordenação motora e habilidades práxicas',
      example: true,
      items: [
        'Apresenta dificuldade para realizar atividades motoras finas, como desenhar, escrever, recortar ou manipular pequenos objetos?',
        'Demonstra dificuldade em atividades que exigem equilíbrio, coordenação corporal ou planejamento de movimentos?',
        'Precisa de demonstrações repetidas ou auxílio para aprender sequências motoras, como movimentos de brincadeiras ou atividades de autocuidado?',
        'Apresenta lentidão, desorganização ou esforço excessivo em tarefas motoras compatíveis com sua faixa etária?',
      ],
    },
    {
      id: 'sono',
      title: '11. Sono, rotina e funcionamento geral',
      example: true,
      items: [
        'Apresenta dificuldades persistentes relacionadas ao sono, como demora para adormecer, despertares frequentes ou sonolência diurna?',
        'Demonstra cansaço, indisposição ou oscilação de rendimento que interfere em suas atividades cotidianas?',
        'Apresenta dificuldades significativas relacionadas à alimentação, como seletividade intensa ou resistência a determinadas consistências?',
        'Seu comportamento ou desempenho muda significativamente conforme o ambiente, a pessoa que oferece orientação ou o tipo de atividade?',
      ],
    },
    {
      id: 'qualitativa',
      title: '12. Investigação qualitativa complementar',
      // Perguntas abertas: seguem a numeração do roteiro (53 a 60).
      openItems: [
        'Quais são as principais habilidades, facilidades e características positivas da criança?',
        'Quais comportamentos ou dificuldades mais preocupam o informante atualmente?',
        'Desde quando essas dificuldades são percebidas? Surgiram gradualmente ou após algum acontecimento específico?',
        'Em quais ambientes as dificuldades são mais evidentes (casa, escola, ambientes sociais ou outros)? Existem situações em que desaparecem ou diminuem?',
        'Como a criança reage quando não consegue realizar uma atividade ou precisa enfrentar uma situação desafiadora?',
        'Quais estratégias costumam ajudar a criança a compreender instruções, organizar atividades ou regular suas emoções?',
        'De que maneira as dificuldades interferem na aprendizagem, na autonomia, nas relações sociais ou na convivência familiar?',
        'Existe alguma informação importante sobre o desenvolvimento, a saúde, a história escolar, as relações familiares ou acontecimentos recentes que possa ajudar a compreender o funcionamento da criança?',
      ],
    },
  ],
};

// ------------------------------------------------------------
// Roteiro dirigido com professores (19/11/2026, modelo da clínica).
// Diferente das ecológicas: a mesma entrevista mistura perguntas de
// frequência, de Sim/Parcialmente/Não, de marcar várias e abertas, e quase
// toda pergunta tem um "Exemplo"/"Explique" ao lado. Por isso as perguntas
// moram prontas em `questions` (buildInterviewQuestions só devolve a
// cópia) e não há `sections` de frequência única.
// Texto transcrito do PDF; a única mudança é o gênero neutro ("aluno (a)",
// "Ele (a)"): o modelo alterna "aluno (a)" com "ela"/"aluna".
// ------------------------------------------------------------
const TEACHER_FREQ = ['Nunca', 'Às vezes', 'Frequentemente', 'Sempre'];
const TEACHER_SCORE = ['0 — Não observado', '1 — Pouco observado', '2 — Moderado', '3 — Frequente'];
const TEACHER_SNP = ['Sim', 'Parcialmente', 'Não'];
const TEACHER_SNPARC = ['Sim', 'Não', 'Parcialmente'];
const TEACHER_SNI = ['Sim', 'Não', 'Não sei informar'];
const TEACHER_IMPACT = ['Não', 'Levemente', 'Moderadamente', 'Muito'];

// Item: [pergunta, alternativas | null (aberta), acompanhamento?, extra?]
// acompanhamento: texto ("Exemplo") ou { label, type, options, other, showIf }.
const TEACHER_SECTIONS = [
  {
    id: 'funcionamento',
    title: '1. Funcionamento geral em sala de aula',
    items: [
      ['Como você descreveria o desempenho geral do aluno (a) em sua disciplina?', ['Abaixo do esperado', 'Dentro do esperado', 'Acima do esperado'], 'Explique brevemente'],
      ['Ele (a) acompanha o ritmo da turma?', TEACHER_SNP, 'Em quais situações apresenta maior dificuldade?'],
      ['As dificuldades são constantes ou aparecem apenas em momentos específicos, como provas, apresentações, atividades longas ou conteúdos novos?', null],
      ['O aluno (a) costuma precisar de mais tempo que os colegas para concluir atividades?', TEACHER_FREQ, 'Exemplo'],
      ['Ele (a) necessita de repetição frequente das orientações?', TEACHER_FREQ, 'Exemplo'],
    ],
  },
  {
    id: 'desatencao',
    title: '2. Indicadores de desatenção — TDAH',
    subtitle: 'Assinale a frequência observada em sala: 0 = não observado | 1 = pouco observado | 2 = moderado | 3 = frequente',
    items: [
      ['Comete erros por descuido em atividades, provas ou cópias.', TEACHER_SCORE, 'Exemplo'],
      ['Tem dificuldade para manter atenção em explicações ou atividades longas.', TEACHER_SCORE, 'Exemplo'],
      ['Parece não escutar quando chamado (a) ou orientado (a) diretamente.', TEACHER_SCORE, 'Exemplo'],
      ['Inicia atividades, mas não consegue finalizar sem ajuda ou redirecionamento.', TEACHER_SCORE, 'Exemplo'],
      ['Apresenta dificuldade para organizar materiais, cadernos, tarefas ou prazos.', TEACHER_SCORE, 'Exemplo'],
      ['Evita, adia ou demonstra resistência em tarefas que exigem esforço mental prolongado.', TEACHER_SCORE, 'Exemplo'],
      ['Perde materiais escolares, esquece tarefas ou deixa de entregar atividades.', TEACHER_SCORE, 'Exemplo'],
      ['Distrai-se facilmente com estímulos externos ou pensamentos próprios.', TEACHER_SCORE, 'Exemplo'],
      ['Apresenta esquecimento em atividades diárias escolares.', TEACHER_SCORE, 'Exemplo'],
      ['Essas dificuldades ocorrem há quanto tempo?', ['Menos de 3 meses', 'Entre 3 e 6 meses', 'Mais de 6 meses', 'Desde anos/séries anteriores, conforme relato escolar']],
    ],
  },
  {
    id: 'hiperatividade',
    title: '3. Indicadores de hiperatividade e impulsividade — TDAH',
    items: [
      ['O aluno (a) se mexe excessivamente, balança pernas, mãos ou demonstra inquietação corporal?', TEACHER_FREQ, 'Exemplo'],
      ['Levanta-se ou sai do lugar em momentos inadequados?', TEACHER_FREQ, 'Exemplo'],
      ['Fala em excesso ou interrompe colegas/professores?', TEACHER_FREQ, 'Exemplo'],
      ['Responde antes da pergunta ser concluída ou age sem pensar nas consequências?', TEACHER_FREQ, 'Exemplo'],
      ['Tem dificuldade para esperar sua vez em atividades, filas, jogos ou discussões?', TEACHER_FREQ, 'Exemplo'],
      ['Demonstra impulsividade emocional, como irritar-se facilmente, chorar, reagir de forma intensa ou ter baixa tolerância à frustração?', TEACHER_FREQ, 'Exemplo'],
      ['Comparada (o) aos colegas da mesma idade, a inquietação ou impulsividade dele (a) é:', ['Menor que a média', 'Semelhante à média', 'Maior que a média', 'Muito maior que a média']],
    ],
  },
  {
    id: 'emocional',
    title: '4. Indicadores emocionais e ansiedade no contexto escolar',
    items: [
      ['O aluno (a) demonstra preocupação excessiva com notas, desempenho, erros ou aprovação dos professores?', TEACHER_FREQ, 'Exemplo'],
      ['Apresenta medo de errar, vergonha de responder ou evita participar oralmente?', TEACHER_FREQ, 'Exemplo'],
      ['Fica muito nervoso (a) antes ou durante provas, apresentações ou atividades avaliativas?', TEACHER_FREQ, 'Exemplo'],
      ['Apresenta sintomas físicos em situações escolares, como dor de barriga, dor de cabeça, náusea, tremor, falta de ar, choro ou tensão?', TEACHER_FREQ, 'Quais sintomas?'],
      ['Evita atividades escolares por medo, insegurança ou ansiedade?', TEACHER_FREQ, 'Quais atividades?'],
      ['A ansiedade interfere no desempenho dele (a)?', ['Não interfere', 'Interfere pouco', 'Interfere moderadamente', 'Interfere muito'], 'Como interfere?'],
      ['Ele (a) demonstra perfeccionismo, necessidade excessiva de confirmação ou medo intenso de decepcionar?', TEACHER_FREQ, 'Exemplo'],
      ['Em situações sociais, ele (a) tende a se isolar, evitar colegas ou demonstrar desconforto?', TEACHER_FREQ, 'Exemplo'],
      ['A professora percebe diferença entre o que o aluno (a) sabe oralmente e o que consegue demonstrar em provas ou atividades escritas?', ['Sim', 'Não', 'Parcialmente'], 'Explique'],
    ],
  },
  {
    id: 'leitura',
    title: '5.1 Transtorno Específico de Aprendizagem — Leitura',
    items: [
      ['A leitura do aluno (a) é adequada para a série escolar?', TEACHER_SNP],
      ['Ele (a) apresenta leitura lenta, silabada, hesitante ou com esforço maior que os colegas?', TEACHER_FREQ, 'Exemplo'],
      ['Comete trocas, omissões, inversões ou substituições de letras/palavras ao ler?', TEACHER_FREQ, 'Exemplo'],
      ['Demonstra dificuldade para compreender o que lê, mesmo quando consegue decodificar as palavras?', TEACHER_FREQ, 'Exemplo'],
      ['Evita leitura em voz alta ou atividades que envolvam leitura?', TEACHER_FREQ, 'Exemplo'],
    ],
  },
  {
    id: 'escrita',
    title: '5.2 Transtorno Específico de Aprendizagem — Escrita',
    items: [
      ['A produção escrita está adequada para a idade/série?', TEACHER_SNP],
      ['Apresenta muitos erros ortográficos, mesmo em palavras já trabalhadas?', TEACHER_FREQ, 'Exemplo'],
      ['Tem dificuldade para organizar ideias em frases, parágrafos ou textos?', TEACHER_FREQ, 'Exemplo'],
      ['A escrita é pobre em estrutura, coerência, pontuação ou sequência lógica?', TEACHER_FREQ, 'Exemplo'],
      ['A letra, organização no caderno ou apresentação das atividades prejudica a compreensão do conteúdo?', TEACHER_FREQ, 'Exemplo'],
      ['Ele (a) evita atividades escritas ou demora muito para iniciá-las/concluí-las?', TEACHER_FREQ, 'Exemplo'],
    ],
  },
  {
    id: 'matematica',
    title: '5.3 Transtorno Específico de Aprendizagem — Matemática',
    items: [
      ['O desempenho em matemática/raciocínio lógico está adequado para a série?', [...TEACHER_SNP, 'Não se aplica à minha disciplina']],
      ['Apresenta dificuldade para compreender conceitos numéricos, operações ou resolução de problemas?', TEACHER_FREQ, 'Exemplo'],
      ['Tem dificuldade para memorizar fatos matemáticos, fórmulas, tabuada ou procedimentos?', TEACHER_FREQ, 'Exemplo'],
      ['Consegue resolver exercícios mecânicos, mas tem dificuldade em problemas com interpretação?', TEACHER_SNPARC, 'Exemplo'],
      ['Comete erros por não compreender o raciocínio ou por desatenção ao copiar/calcular?', ['Erros mais ligados à compreensão', 'Erros mais ligados à atenção', 'Ambos', 'Não observado']],
    ],
  },
  {
    id: 'diferenciacao',
    title: '6. Diferenciação entre dificuldade de aprendizagem, desatenção e ansiedade',
    items: [
      ['Quando a atividade é curta, objetiva e supervisionada, o desempenho melhora?', TEACHER_SNPARC, 'Explique'],
      ['Quando recebe mais tempo, o desempenho melhora?', TEACHER_SNPARC, 'Explique'],
      ['Quando a atividade é oral, ele (a) apresenta melhor desempenho do que na escrita?', TEACHER_SNPARC, 'Explique'],
      ['Quando está tranquilo (a) e seguro (a), consegue demonstrar melhor o conteúdo?', TEACHER_SNPARC, 'Explique'],
      [
        'As dificuldades aparecem em todas as disciplinas ou são mais evidentes em áreas específicas?',
        ['Todas as disciplinas', 'Principalmente leitura/interpretação', 'Principalmente escrita', 'Principalmente matemática', 'Principalmente atividades avaliativas', 'Principalmente atividades longas'],
        'Detalhar',
      ],
      [
        'A professora percebe que a dificuldade principal parece estar mais relacionada a:',
        ['Falta de atenção/concentração', 'Ansiedade/insegurança', 'Dificuldade específica de leitura', 'Dificuldade específica de escrita', 'Dificuldade específica de matemática', 'Organização/planejamento', 'Baixa motivação'],
        null,
        { other: true },
      ],
    ],
  },
  {
    id: 'impacto',
    title: '7. Impacto funcional no ambiente escolar',
    items: [
      ['As dificuldades prejudicam notas ou rendimento acadêmico?', TEACHER_IMPACT],
      ['Prejudicam a participação em sala?', TEACHER_IMPACT],
      ['Prejudicam a autonomia escolar?', TEACHER_IMPACT],
      ['Prejudicam relações com colegas ou professores?', TEACHER_IMPACT],
      ['Há prejuízo na entrega de tarefas, trabalhos ou cumprimento de prazos?', TEACHER_IMPACT],
      [
        'O aluno (a) precisa de adaptações ou suporte frequente?',
        ['Não', 'Sim'],
        {
          label: 'Quais?',
          type: 'multiple',
          options: ['Mais tempo em provas', 'Leitura de enunciado', 'Explicação individual', 'Redução de estímulos', 'Divisão de tarefas em etapas', 'Mediação emocional', 'Organização de rotina/prazos'],
          other: true,
          showIf: ['Sim'],
        },
      ],
    ],
  },
  {
    id: 'historico',
    title: '8. Histórico escolar observado pela instituição',
    items: [
      ['Essas dificuldades já foram observadas em anos anteriores?', TEACHER_SNI, 'Relatos disponíveis'],
      ['Houve queda recente no desempenho?', TEACHER_SNI, 'Desde quando?'],
      ['A dificuldade parece acompanhar o aluno (a) desde o início da escolarização ou surgiu mais recentemente?', ['Desde o início da escolarização', 'Surgiu recentemente', 'Não sei informar']],
      ['Houve mudanças emocionais, familiares, escolares ou sociais associadas à piora do desempenho?', TEACHER_SNI, 'Quais?'],
    ],
  },
  {
    id: 'estrategias',
    title: '9. Estratégias já utilizadas pela escola',
    items: [
      [
        'Quais estratégias já foram utilizadas com o aluno (a)?',
        ['Repetição de instruções', 'Lugar mais próximo da professora', 'Mais tempo em atividades/provas', 'Avaliação oral', 'Divisão de tarefas em etapas', 'Apoio individual', 'Comunicação com família', 'Encaminhamento para coordenação/orientação'],
        null,
        { type: 'multiple', other: true },
      ],
      ['Quais estratégias funcionaram melhor?', null],
      ['Quais estratégias não apresentaram melhora significativa?', null],
      ['O aluno (a) aceita ajuda ou resiste ao suporte?', ['Aceita bem', 'Aceita parcialmente', 'Resiste', 'Depende da situação'], 'Explique'],
    ],
  },
  {
    id: 'finais',
    title: '10. Observações finais da professora',
    items: [
      ['Quais são as principais potencialidades do aluno (a)?', null],
      ['Quais são as maiores dificuldades observadas atualmente?', null],
      ['Há alguma situação específica que a professora considera importante para a avaliação neuropsicológica?', null],
      ['Em comparação com colegas da mesma idade e série, a professora considera que as dificuldades são:', ['Dentro do esperado', 'Um pouco acima do esperado', 'Moderadamente acima do esperado', 'Muito acima do esperado']],
      ['A professora considera necessário algum tipo de adaptação pedagógica ou acompanhamento específico?', ['Sim', 'Não'], 'Qual?'],
    ],
  },
  {
    id: 'sintese',
    title: 'Síntese para uso clínico',
    subtitle: 'Parte do modelo da clínica, para quem conduz a entrevista. Pode ficar em branco.',
    optional: true,
    items: [
      ['Principais indicadores de desatenção observados:', null],
      ['Principais indicadores de hiperatividade/impulsividade observados:', null],
      ['Principais indicadores de ansiedade observados:', null],
      ['Principais indicadores de dificuldade de aprendizagem observados:', null],
      [
        'Áreas acadêmicas mais prejudicadas:',
        ['Leitura', 'Escrita', 'Matemática', 'Interpretação', 'Organização', 'Provas/avaliações', 'Participação oral', 'Relações sociais', 'Autonomia escolar'],
        null,
        { type: 'multiple' },
      ],
      ['Nível de prejuízo funcional escolar:', ['Ausente', 'Leve', 'Moderado', 'Grave']],
      ['Conclusão da entrevista escolar:', null],
    ],
  },
];

function buildTeacherQuestions() {
  const questions = [
    { id: 'identificacao', type: 'section', label: 'Identificação', help: 'Investigação escolar — Avaliação Neuropsicológica.' },
    { id: 'escola', type: 'short_text', label: 'Escola', help: '', required: false, showIf: null, unnumbered: true },
    { id: 'informante', type: 'short_text', label: 'Professora entrevistada', help: '', required: true, showIf: null, unnumbered: true },
    { id: 'vinculo', type: 'short_text', label: 'Disciplina', help: '', required: true, showIf: null, unnumbered: true },
    { id: 'convivencia', type: 'short_text', label: 'Tempo que conhece o aluno', help: '', required: false, showIf: null, unnumbered: true },
  ];
  let number = 0;
  for (const section of TEACHER_SECTIONS) {
    questions.push({ id: `parte_${section.id}`, type: 'section', label: section.title, help: section.subtitle || '' });
    for (const [label, options, follow, extra = {}] of section.items) {
      number += 1;
      const id = interviewItemId(number);
      const type = options ? (extra.type || 'single') : 'long_text';
      const question = {
        id,
        type,
        label,
        help: '',
        required: !section.optional && type !== 'long_text',
        showIf: null,
        number,
      };
      if (options) Object.assign(question, { options: [...options], allowOther: Boolean(extra.other), lettered: type === 'single' });
      questions.push(question);
      if (!follow) continue;
      const spec = typeof follow === 'string' ? { label: follow } : follow;
      const followQuestion = {
        id: `${id}_texto`,
        type: spec.type || 'long_text',
        label: spec.label,
        help: '',
        required: false,
        showIf: spec.showIf ? { questionId: id, values: [...spec.showIf] } : null,
        unnumbered: true,
      };
      if (spec.options) Object.assign(followQuestion, { options: [...spec.options], allowOther: Boolean(spec.other) });
      questions.push(followQuestion);
    }
  }
  return questions;
}

const ENTREVISTA_PROFESSORES = {
  id: 'entrevista_professores',
  version: 1,
  discipline: 'psicologia',
  title: 'Roteiro de Entrevista Dirigida com Professoras — Investigação escolar (Avaliação Neuropsicológica)',
  shortName: 'Entrevista dirigida — professores',
  group: 'Pais e professores — escola',
  slot: 'pais_professores',
  audience: 'infantil',
  respondent: 'informante',
  respondentLabel: 'Professor ou professora do aluno',
  source: 'Modelo da clínica, recebido em 19/11/2026',
  purpose: 'Investigação escolar para a avaliação neuropsicológica: funcionamento em sala, indicadores de desatenção, hiperatividade e impulsividade, ansiedade, aprendizagem (leitura, escrita e matemática), impacto funcional, histórico e estratégias da escola.',
  technicalNote:
    'Roteiro qualitativo de entrevista escolar, complementar à avaliação neuropsicológica. Não possui escore, ponto de corte '
    + 'ou validação psicométrica neste sistema: a escala de 0 a 3 e as alternativas de frequência organizam o relato e não são '
    + 'somadas. Deve ser interpretado em conjunto com as entrevistas, a observação clínica, a história do desenvolvimento e '
    + 'os instrumentos padronizados. O relato escolar, isoladamente, não confirma nem exclui hipóteses diagnósticas.',
  questions: buildTeacherQuestions(),
};

export const CLINICAL_INTERVIEWS = [
  ECOLOGICA_ADULTO_HETERORRELATO,
  ECOLOGICA_INFANTIL_HETERORRELATO,
  ENTREVISTA_PROFESSORES,
];

// Lugar de cada entrevista no menu da Psicologia (16/10/2026). Lugar sem
// entrevista ainda aparece vazio, esperando o modelo da clínica.
export const INTERVIEW_SLOTS = {
  pais_professores: { label: 'Entrevista pais e professores', audience: 'infantil', respondent: 'Pais, responsáveis e professores' },
  familiar_laboral: { label: 'Entrevista familiar / laboral', audience: 'adulto', respondent: 'Familiares, pessoas próximas e colegas de trabalho' },
  rastreio: { label: 'Entrevista de rastreio', audience: null, respondent: 'O próprio paciente' },
};

export function interviewsForSlot(discipline, slot) {
  return interviewsForDiscipline(discipline).filter(interview => !slot || interview.slot === slot);
}

export function getInterview(id) {
  return CLINICAL_INTERVIEWS.find(interview => interview.id === id) || null;
}

export function interviewsForDiscipline(discipline) {
  return CLINICAL_INTERVIEWS.filter(interview => interview.discipline === discipline);
}

/** Número da pergunta no roteiro (1, 2, ... na ordem das partes). */
export function interviewItemId(number) {
  return `q${String(number).padStart(2, '0')}`;
}

/**
 * Perguntas no formato dos formulários (utils/patientForms.js): é o que
 * a pessoa vê no consultório e no link, e a cópia guardada com a
 * resposta. Cada parte do roteiro vira uma página; as perguntas do
 * roteiro levam o número dele (1 a 48), identificação e complementares
 * ficam sem número.
 */
export function buildInterviewQuestions(interview) {
  if (!interview) return [];
  // Roteiro com perguntas de vários tipos (professores): já vem pronto.
  if (Array.isArray(interview.questions)) return structuredClone(interview.questions);
  const questions = [
    { id: 'identificacao', type: 'section', label: 'Identificação', help: interview.instructions },
    ...interview.identification.map(field => ({
      ...field,
      help: field.help || '',
      required: Boolean(field.required),
      showIf: null,
      unnumbered: true,
      ...(field.type === 'single' ? { allowOther: false } : {}),
    })),
  ];

  let number = 0;
  for (const section of interview.sections) {
    questions.push({ id: `parte_${section.id}`, type: 'section', label: section.title, help: section.subtitle || '' });
    for (const text of section.items || []) {
      number += 1;
      questions.push({
        id: interviewItemId(number),
        type: 'single',
        label: text,
        help: '',
        required: true,
        showIf: null,
        options: [...(interview.frequencyOptions || INTERVIEW_FREQUENCY_OPTIONS)],
        allowOther: false,
        lettered: true,
        number,
      });
    }
    for (const text of section.openItems || []) {
      number += 1;
      questions.push({ id: interviewItemId(number), type: 'long_text', label: text, help: '', required: false, showIf: null, number });
    }
    if (section.example) {
      questions.push({
        id: `exemplo_${section.id}`,
        type: 'long_text',
        label: 'Exemplo observado e contexto',
        help: '',
        required: false,
        showIf: null,
        unnumbered: true,
      });
    }
  }

  if (interview.complementary) {
    questions.push({ id: 'complementar', type: 'section', label: interview.complementary.title, help: '' });
    for (const field of interview.complementary.questions) {
      questions.push({
        ...field,
        help: field.help || '',
        required: false,
        showIf: null,
        unnumbered: true,
        ...(field.options ? { options: [...field.options], allowOther: false } : {}),
      });
    }
  }
  return questions;
}

/** Quantas perguntas do roteiro (as numeradas). */
export function interviewItemCount(interview) {
  if (Array.isArray(interview?.questions)) return interview.questions.filter(question => question.number).length;
  return (interview?.sections || [])
    .reduce((total, section) => total + (section.items || []).length + (section.openItems || []).length, 0);
}
