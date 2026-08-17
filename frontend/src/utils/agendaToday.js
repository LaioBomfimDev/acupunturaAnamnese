// ============================================================
// Agenda — a fila do dia (recepção)
//
// Responde a pergunta que a recepção faz o tempo todo: quem já chegou,
// quem está atrasado, quem vem agora. É a tela que fica aberta no balcão.
//
// Regra de leitura: o paciente entra em UM balde só, e a ordem dos
// baldes é a ordem da atenção. Quem está esperando na sala vem antes de
// quem está atrasado, que vem antes de quem ainda nem tinha hora.
//
// Bloqueio não é gente: fica fora da fila e vira só uma contagem.
//
// Sem React, sem Supabase, sem relógio escondido — `now` entra por
// parâmetro para o teste não depender da hora em que roda.
// ============================================================

import { toDayKey } from './agenda.js';

export const QUEUE_BUCKETS = {
  WAITING: 'aguardando',
  LATE: 'atrasados',
  NEXT: 'proximos',
  DONE: 'concluidos',
};

// Espelha os estados que encerram o atendimento na tabela.
const CLOSED_STATUSES = ['attended', 'cancelled', 'no_show', 'excused'];

function minutesBetween(from, to) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 60000);
}

/**
 * Fila do dia.
 *
 * @param appointments agendamentos (qualquer intervalo — o filtro de dia
 *                     acontece aqui)
 * @param now          instante de referência
 * @param dayKey       dia a montar; por padrão, o de `now`
 */
export function buildTodayQueue({ appointments = [], now = new Date(), dayKey = null } = {}) {
  const alvo = dayKey || toDayKey(now);

  const doDia = appointments.filter(item => toDayKey(new Date(item?.starts_at)) === alvo);
  const bloqueios = doDia.filter(item => item?.kind === 'block').length;

  const aguardando = [];
  const atrasados = [];
  const proximos = [];
  const concluidos = [];

  for (const appointment of doDia) {
    if (appointment.kind === 'block') continue;

    const item = {
      appointment,
      waitingMinutes: null,
      lateMinutes: null,
      confirmed: Boolean(appointment.confirmed_at),
      checkedIn: Boolean(appointment.checked_in_at),
    };

    if (CLOSED_STATUSES.includes(appointment.status)) {
      concluidos.push(item);
      continue;
    }

    if (appointment.checked_in_at) {
      item.waitingMinutes = Math.max(minutesBetween(appointment.checked_in_at, now) ?? 0, 0);
      aguardando.push(item);
      continue;
    }

    const atraso = minutesBetween(appointment.starts_at, now);
    // Um minuto de tolerância evita que o cartão pule para "atrasado"
    // no segundo exato do horário, com o paciente entrando pela porta.
    if (atraso !== null && atraso > 1) {
      item.lateMinutes = atraso;
      atrasados.push(item);
      continue;
    }

    proximos.push(item);
  }

  const porHorario = (a, b) => new Date(a.appointment.starts_at) - new Date(b.appointment.starts_at);

  // Aguardando ordena por HORÁRIO MARCADO, não por ordem de chegada:
  // chegar cedo não passa na frente de quem tem hora antes.
  aguardando.sort(porHorario);
  atrasados.sort(porHorario);
  proximos.sort(porHorario);
  concluidos.sort(porHorario);

  const esperas = aguardando.map(item => item.waitingMinutes).filter(Number.isFinite);

  return {
    aguardando,
    atrasados,
    proximos,
    concluidos,
    bloqueios,
    resumo: {
      total: doDia.length - bloqueios,
      aguardando: aguardando.length,
      atrasados: atrasados.length,
      proximos: proximos.length,
      atendidos: concluidos.filter(item => item.appointment.status === 'attended').length,
      faltas: concluidos.filter(item => item.appointment.status === 'no_show').length,
      confirmados: [...aguardando, ...atrasados, ...proximos].filter(item => item.confirmed).length,
      esperaMaxima: esperas.length ? Math.max(...esperas) : 0,
      esperaMedia: esperas.length
        ? Math.round(esperas.reduce((total, value) => total + value, 0) / esperas.length)
        : 0,
    },
  };
}

/** "há 12 min" / "há 1 h 5 min" — a recepção lê de relance. */
export function humanMinutes(minutes) {
  const value = Math.max(Math.round(Number(minutes) || 0), 0);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const rest = value % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
