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
export const INTERVIEW_FREQUENT_ANSWERS = ['Frequentemente', 'Quase sempre'];
export const INTERVIEW_UNKNOWN_ANSWER = 'Não sei observar';

const ECOLOGICA_ADULTO_HETERORRELATO = {
  id: 'ecologica_adulto_heterorrelato',
  version: 1,
  discipline: 'psicologia',
  title: 'Entrevista Ecológica de Funcionamento Neurocomportamental em Adultos — Heterorrelato',
  shortName: 'Entrevista ecológica — adultos (heterorrelato)',
  group: 'Familiar / laboral — adulto',
  audience: 'adulto',
  respondent: 'informante',
  respondentLabel: 'Familiar ou pessoa próxima',
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

export const CLINICAL_INTERVIEWS = [ECOLOGICA_ADULTO_HETERORRELATO];

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
    for (const text of section.items) {
      number += 1;
      questions.push({
        id: interviewItemId(number),
        type: 'single',
        label: text,
        help: '',
        required: true,
        showIf: null,
        options: [...INTERVIEW_FREQUENCY_OPTIONS],
        allowOther: false,
        lettered: true,
        number,
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
  return (interview?.sections || []).reduce((total, section) => total + section.items.length, 0);
}
