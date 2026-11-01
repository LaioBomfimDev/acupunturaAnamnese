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

// 01/11/2026 (caminho A): além dos horários vagos, contagens da clínica
// sem paciente: atendimentos do dia, evoluções faltando, escalas
// aplicadas no mês e pacientes sem retorno. Só números e nomes da equipe.
export const ASSISTANT_CONSULTAS = [
  'horarios_vagos', 'atendimentos_dia', 'evolucoes_pendentes', 'escalas_aplicadas', 'retornos_pendentes',
];

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
  const profissional = text(item.profissional, 80) || 'equipe';
  const dia = text(item.dia, 10);
  const dias = Number(item.dias);
  if (!ASSISTANT_CONSULTAS.includes(tipo)) return null;
  // Horários vagos são sempre de uma pessoa num dia certo.
  if (tipo === 'horarios_vagos' && (profissional === 'equipe' || !DAY.test(dia))) return null;
  return {
    tipo,
    profissional,
    dia: DAY.test(dia) ? dia : '',
    dias: Number.isInteger(dias) && dias >= 1 && dias <= 365 ? dias : null,
  };
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
    // Contagens: só rótulo e número (nomes da equipe, siglas de escala).
    periodo: text(item.periodo, 40),
    total: Number.isInteger(item.total) ? item.total as number : null,
    linhas: (Array.isArray(item.linhas) ? item.linhas : [])
      .map(line => ({ rotulo: text((line as Record<string, unknown>)?.rotulo, 80), valor: Number((line as Record<string, unknown>)?.valor) }))
      .filter(line => line.rotulo && Number.isInteger(line.valor) && line.valor >= 0)
      .slice(0, 40),
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
