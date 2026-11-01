// ============================================================
// SHARED: consultas que a assistente pede ao aparelho (31/10/2026).
//
// A assistente não lê o banco. Quando a pergunta pede um dado (por
// enquanto, só os horários vagos de quem atende num dia), o Gemini
// devolve o pedido em `consulta`; o aparelho de quem perguntou faz a
// conta com o próprio login (a mesma permissão da tela e a mesma conta
// de "Copiar horários vagos", utils/agendaFreeSlots.js) e manda de volta
// só o resultado em `dados`. Nunca vai nome de paciente: só horários e o
// nome de quem atende. Espelho de frontend/src/utils/clinicAssistant.js
// (tipos e motivos; tests/regression/clinic-assistant.test.mjs confere).
// ============================================================

export const ASSISTANT_CONSULTAS = ['horarios_vagos'];

export const CONSULTA_MOTIVOS = [
  'sem_jornada', 'feriado', 'passado', 'nao_encontrado', 'ambiguo', 'sem_agenda', 'erro',
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

function text(value: unknown, max: number) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '';
}

/** Pedido de consulta vindo do Gemini; null quando não serve. */
export function readConsulta(raw: unknown) {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== 'object') return null;
  const tipo = text(item.tipo, 30);
  const profissional = text(item.profissional, 80);
  const dia = text(item.dia, 10);
  if (!ASSISTANT_CONSULTAS.includes(tipo) || !profissional || !DAY.test(dia)) return null;
  return { tipo, profissional, dia };
}

/** Resultado da consulta vindo do aparelho, limpo antes de ir ao Gemini. */
export function readConsultaResult(raw: unknown) {
  const item = raw as Record<string, unknown> | null;
  if (!item || typeof item !== 'object') return null;
  const tipo = text(item.tipo, 30);
  if (!ASSISTANT_CONSULTAS.includes(tipo)) return null;
  const motivo = text(item.motivo, 30);
  return {
    tipo,
    profissional: text(item.profissional, 80),
    dia: DAY.test(text(item.dia, 10)) ? text(item.dia, 10) : '',
    horarios: (Array.isArray(item.horarios) ? item.horarios : [])
      .map(value => text(value, 5))
      .filter(value => TIME.test(value))
      .slice(0, 96),
    motivo: CONSULTA_MOTIVOS.includes(motivo) ? motivo : null,
    grade: text(item.grade, 10) === 'padrao' ? 'padrao' : 'jornada',
    opcoes: (Array.isArray(item.opcoes) ? item.opcoes : []).map(value => text(value, 60)).filter(Boolean).slice(0, 12),
  };
}

/** Nomes de quem atende, vindos do aparelho (só para a IA saber quem existe). */
export function readTeam(raw: unknown) {
  return (Array.isArray(raw) ? raw : []).map(value => text(value, 60)).filter(Boolean).slice(0, 40);
}

const WEEKDAY = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
const ISO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Os próximos 14 dias com o dia da semana, para "terça" ou "amanhã" virar data certa. */
export function upcomingDays(now = new Date(), count = 14) {
  return Array.from({ length: count }, (_, index) => {
    const day = new Date(now.getTime() + index * 86_400_000);
    return `${ISO_DAY.format(day)} (${WEEKDAY.format(day)}${index === 0 ? ', hoje' : index === 1 ? ', amanhã' : ''})`;
  });
}
