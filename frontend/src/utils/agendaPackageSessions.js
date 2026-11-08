// ============================================================
// "Sessões do pacote" (Agenda, 03/11/2026, prévia A escolhida pela
// administradora): a lista de TODAS as sessões marcadas juntas na Agenda
// (mesmo `recurrence_group_id`), com quantas foram atendidas, quantas
// faltam e o total.
//
// As linhas vêm do banco (`listSeriesSessions`), nunca do estado
// `appointments` da tela, que só tem o período visível. Aqui só se conta.
//
// Regra da conta (decisão de 03/11/2026):
// - Atendido = feita.
// - Agendado = falta (inclui a que já passou sem resultado marcado, que
//   ganha aviso na linha para alguém marcar).
// - Não compareceu e Cancelado pelo paciente aparecem, mas não contam
//   como feita nem como faltando.
// - Cancelado (a clínica encerrou o pacote dali em diante) aparece e sai
//   do total; não ganha número de sessão.
//
// Pacote da Agenda ≠ pacote do Financeiro: o pagamento (no início, no fim
// ou a cada sessão) fica no Financeiro e pode não bater com esta lista.
// Nenhum valor ou pagamento sai daqui.
// ============================================================

export const PACKAGE_SESSIONS_TITLE = 'Sessões do pacote';
export const OPEN_PACKAGE_SESSIONS_LABEL = 'Ver sessões do pacote';
export const PACKAGE_SESSIONS_FINANCE_NOTE =
  'Esta lista mostra as sessões marcadas juntas na Agenda. O pagamento do pacote '
  + '(tudo no início, tudo no fim ou a cada sessão atendida) fica no Financeiro e '
  + 'pode não bater com esta lista.';

const STATUS_LABELS = {
  scheduled: 'Agendado',
  attended: 'Atendido',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
  excused: 'Cancelado pelo paciente',
};

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function pad(value) {
  return String(value).padStart(2, '0');
}

/** 'ready' (chegou) é legado e aparece como Agendado, como no resto da Agenda. */
function normalizedStatus(status) {
  return status === 'ready' ? 'scheduled' : status;
}

/** "ter 06/10" (com o ano quando não é o de `now`) e "14:00", no horário local. */
export function sessionWhen(startsAt, now = new Date()) {
  const date = new Date(startsAt);
  if (Number.isNaN(date.getTime())) return { day: '', time: '' };
  const year = date.getFullYear() === now.getFullYear() ? '' : `/${date.getFullYear()}`;
  return {
    day: `${WEEKDAYS[date.getDay()]} ${pad(date.getDate())}/${pad(date.getMonth() + 1)}${year}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

export function sessionStatusLabel(status) {
  return STATUS_LABELS[normalizedStatus(status)] || 'Agendado';
}

/**
 * Conta as sessões do pacote. `rows` = linhas de `appointments` do mesmo
 * `recurrence_group_id`, em qualquer ordem.
 */
export function summarizePackageSessions(rows, { currentId = null, now = new Date() } = {}) {
  const sessions = (Array.isArray(rows) ? rows : [])
    .filter(row => row && row.kind !== 'block')
    .slice()
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  let position = 0;
  const items = sessions.map(row => {
    const status = normalizedStatus(row.status);
    const counts = status !== 'cancelled';
    if (counts) position += 1;
    const end = new Date(row.ends_at || row.starts_at);
    return {
      id: row.id,
      row,
      status,
      number: counts ? position : null,
      isCurrent: row.id === currentId,
      pastWithoutOutcome: status === 'scheduled' && end.getTime() < now.getTime(),
    };
  });

  const countOf = status => items.filter(item => item.status === status).length;
  const current = items.find(item => item.isCurrent) || null;

  return {
    items,
    total: position,
    attended: countOf('attended'),
    remaining: countOf('scheduled'),
    noShow: countOf('no_show'),
    excused: countOf('excused'),
    cancelled: countOf('cancelled'),
    pastWithoutOutcome: items.filter(item => item.pastWithoutOutcome).length,
    currentNumber: current?.number ?? null,
  };
}

/** Rótulos dos três números do topo, no plural certo. */
export function packageSessionsTiles(summary) {
  return [
    { id: 'attended', value: summary.attended, label: summary.attended === 1 ? 'atendida' : 'atendidas' },
    { id: 'remaining', value: summary.remaining, label: summary.remaining === 1 ? 'falta' : 'faltam' },
    { id: 'total', value: summary.total, label: 'no pacote' },
  ];
}

/** Frase embaixo dos números: em que sessão está e o que não entrou na conta. */
export function packageSessionsNote(summary, { currentStatus = null } = {}) {
  const parts = [];
  if (summary.currentNumber != null) {
    parts.push(`Esta é a sessão ${summary.currentNumber} de ${summary.total}.`);
  } else if (currentStatus === 'cancelled') {
    parts.push('Esta sessão foi cancelada e não entra na conta.');
  }
  if (summary.noShow) {
    parts.push(`${summary.noShow} ${summary.noShow === 1 ? 'não compareceu' : 'não compareceram'}.`);
  }
  if (summary.excused) {
    parts.push(`${summary.excused} ${summary.excused === 1 ? 'cancelada' : 'canceladas'} pelo paciente.`);
  }
  if (summary.cancelled) {
    parts.push(`${summary.cancelled} ${summary.cancelled === 1 ? 'cancelada' : 'canceladas'} pela clínica, fora do total.`);
  }
  if (summary.pastWithoutOutcome) {
    parts.push(summary.pastWithoutOutcome === 1
      ? '1 já passou sem resultado marcado.'
      : `${summary.pastWithoutOutcome} já passaram sem resultado marcado.`);
  }
  return parts.join(' ');
}
