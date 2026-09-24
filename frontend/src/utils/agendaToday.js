// ============================================================
// Agenda — lista do dia (painel "Hoje")
//
// Uma lista simples do dia, em três grupos: quem ainda vai ser
// atendido, quem foi atendido e quem não compareceu ou cancelou. A
// agenda não sinaliza chegada nem atraso — só o resultado do
// atendimento (decisão da administradora em 2026-09-24; antes havia
// sala de espera e "Chegou").
//
// O status legado 'ready' (chegou) conta como "a atender": para a tela
// ele é só um agendamento em aberto.
//
// Bloqueio não é gente: fica fora da lista e vira só uma contagem.
//
// Sem React, sem Supabase, sem relógio escondido — `now` entra por
// parâmetro para o teste não depender da hora em que roda.
// ============================================================

import { toDayKey } from './agenda.js';

const ATTENDED = 'attended';
// Não aconteceu: não compareceu, cancelado pelo paciente, cancelado.
const ABSENT_STATUSES = ['no_show', 'excused', 'cancelled'];

/**
 * Lista do dia.
 *
 * @param appointments agendamentos (qualquer intervalo — o filtro de dia
 *                     acontece aqui)
 * @param now          instante de referência (só define o dia padrão)
 * @param dayKey       dia a montar; por padrão, o de `now`
 */
export function buildTodayQueue({ appointments = [], now = new Date(), dayKey = null } = {}) {
  const alvo = dayKey || toDayKey(now);

  const doDia = appointments.filter(item => toDayKey(new Date(item?.starts_at)) === alvo);
  const bloqueios = doDia.filter(item => item?.kind === 'block').length;

  const aAtender = [];
  const atendidos = [];
  const ausentes = [];

  for (const appointment of doDia) {
    if (appointment.kind === 'block') continue;

    const item = { appointment, confirmed: Boolean(appointment.confirmed_at) };

    if (appointment.status === ATTENDED) atendidos.push(item);
    else if (ABSENT_STATUSES.includes(appointment.status)) ausentes.push(item);
    else aAtender.push(item);
  }

  const porHorario = (a, b) => new Date(a.appointment.starts_at) - new Date(b.appointment.starts_at);
  aAtender.sort(porHorario);
  atendidos.sort(porHorario);
  ausentes.sort(porHorario);

  return {
    aAtender,
    atendidos,
    ausentes,
    bloqueios,
    resumo: {
      total: doDia.length - bloqueios,
      aAtender: aAtender.length,
      atendidos: atendidos.length,
      ausentes: ausentes.length,
      confirmados: aAtender.filter(item => item.confirmed).length,
    },
  };
}
