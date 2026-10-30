// ============================================================
// SHARED: a assistente lê só o que importa (30/10/2026).
//
// Em vez de mandar os ~37 tópicos do "Como funciona" a cada pergunta
// (~12 mil tokens), escolhe os poucos ligados à pergunta e à tela onde a
// pessoa está, e manda também o índice com o título de TODOS os tópicos:
// ela continua sabendo tudo o que existe no sistema e onde fica, só não
// relê o texto inteiro do que não foi perguntado.
//
// Sem IA e sem banco: conta palavras (sem acento, com radical curto para
// plural e gênero). Teste: tests/regression/clinic-assistant.test.mjs.
// ============================================================

import { ASSISTANT_HELP_TOPICS, type AssistantHelpTopic } from './assistantHelpCorpus.ts';

export const MAX_SELECTED_TOPICS = 6;
const MAX_SCREEN_TOPICS = 2;

// Onde cada tela mora nos títulos da ajuda ("Financeiro → A receber").
const SCREEN_PLACES: Record<string, string[]> = {
  inicio: ['Tela inicial'],
  agenda: ['Agenda'],
  evolucao: ['Evoluções'],
  escalas: ['Escalas'],
  financeiro: ['Financeiro'],
  gestao: ['Gestão'],
  pacientes: ['Pacientes da instituição'],
  documentos: ['Gestão → Documentos timbrados'],
  area: ['Psicologia', 'Sala online'],
};

const STOPWORDS = new Set([
  'que', 'qual', 'quais', 'como', 'para', 'pra', 'com', 'sem', 'dos', 'das', 'uma', 'uns', 'umas',
  'por', 'sao', 'ser', 'tem', 'meu', 'minha', 'seu', 'sua', 'esta', 'este', 'essa', 'esse',
  'onde', 'quando', 'porque', 'sobre', 'mais', 'menos', 'pode', 'posso', 'faco', 'fazer',
  'nao', 'sim', 'aqui', 'isso', 'isto', 'tela', 'ela', 'ele', 'voce', 'mim', 'nos', 'tudo',
]);

function normalize(text: string) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Radicais das palavras da pergunta: "pacotes" e "pacote" viram "pacot". */
export function queryStems(text: string) {
  return [...new Set(
    normalize(text)
      .split(/[^a-z0-9]+/)
      .filter(word => word.length >= 3 && !STOPWORDS.has(word))
      .map(word => word.slice(0, 5)),
  )];
}

function scoreTopic(topic: AssistantHelpTopic, stems: string[]) {
  const title = normalize(topic.title);
  const text = normalize(topic.text);
  let score = 0;
  for (const stem of stems) {
    if (title.includes(stem)) score += 4;
    else if (text.includes(stem)) score += 1;
  }
  return score;
}

// A tela inicial tem uma leitura por perfil: só a de quem pergunta entra.
const HOME_VARIANTS: Record<string, string[]> = {
  admin: ['HOME_HELP.admin', 'HOME_HELP.admin-professional'],
  professional: ['HOME_HELP.professional'],
  reception: ['HOME_HELP.reception'],
};

function fitsRole(topic: AssistantHelpTopic, role: string | null) {
  if (!role || !topic.id.startsWith('HOME_HELP.')) return true;
  return (HOME_VARIANTS[role] || []).includes(topic.id);
}

function onScreen(topic: AssistantHelpTopic, screen: string) {
  return (SCREEN_PLACES[screen] || []).some(place => topic.title.startsWith(place));
}

/**
 * Tópicos para esta pergunta: até dois da tela atual (os que mais batem
 * com a pergunta) e o resto pelos que mais batem, no máximo seis.
 * A pergunta mais recente pesa mais que as anteriores da conversa.
 */
export function selectHelpTopics(
  questions: string[],
  screen: string,
  role: string | null = null,
  topics: AssistantHelpTopic[] = ASSISTANT_HELP_TOPICS,
) {
  const latest = questions[questions.length - 1] || '';
  const latestStems = queryStems(latest);
  const earlierStems = queryStems(questions.slice(-4, -1).join(' '));
  const scored = topics.filter(topic => fitsRole(topic, role)).map((topic, index) => ({
    topic,
    index,
    score: scoreTopic(topic, latestStems) * 2 + scoreTopic(topic, earlierStems),
    screen: onScreen(topic, screen),
  }));
  const byScore = (a: typeof scored[number], b: typeof scored[number]) => b.score - a.score || a.index - b.index;

  const picked = scored.filter(item => item.screen).sort(byScore).slice(0, MAX_SCREEN_TOPICS);
  for (const item of scored.filter(entry => entry.score > 0).sort(byScore)) {
    if (picked.length >= MAX_SELECTED_TOPICS) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked.sort((a, b) => a.index - b.index).map(item => item.topic);
}

/** Índice de toda a ajuda: só os títulos, para ela saber o que existe. */
export function helpIndex(topics: AssistantHelpTopic[] = ASSISTANT_HELP_TOPICS) {
  return topics.map(topic => topic.title);
}
