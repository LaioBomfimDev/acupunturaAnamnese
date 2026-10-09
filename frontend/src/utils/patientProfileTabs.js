import { getDiscipline } from '../data/disciplines';
import { FREEING_STATUSES, WEEKDAY_LABELS } from './agenda';

// ============================================================
// Ficha do paciente — o que cada aba diz antes de ser aberta
// (ClinicPatientProfile). Pedido de 09/10/2026: a aba só com o nome
// obrigava a abrir uma por uma para saber se tinha algo. Agora cada uma
// leva o número e uma linha com o que importa ("Próximo: qui 15/10,
// 09:00", "1 aguardando evolução"). Tudo sai do que a ficha já carrega;
// só o acesso da Área do Paciente vem à parte (e só para a
// administração, a única que vê essa aba).
// ============================================================

function dayMonth(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function latest(items, field) {
  return items.reduce((found, item) => {
    const at = item?.[field] ? new Date(item[field]) : null;
    return at && !Number.isNaN(at.getTime()) && (!found || at > found) ? at : found;
  }, null);
}

/** "qui 15/10, 09:00" — o próximo atendimento que ainda vai acontecer. */
export function formatNextAppointment(date) {
  const weekday = WEEKDAY_LABELS[date.getDay()].toLowerCase();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${weekday} ${dayMonth(date)}, ${time}`;
}

/**
 * Próximo atendimento do paciente: de agora em diante, com área (bloqueio
 * não é atendimento) e sem cancelado / não compareceu / cancelado pelo
 * paciente — os mesmos que liberam o horário na Agenda.
 */
export function findNextAppointment(appointments, now = new Date()) {
  return appointments
    .filter(appt => appt?.discipline && !FREEING_STATUSES.includes(appt.status))
    .map(appt => ({ appt, at: new Date(appt.starts_at) }))
    .filter(({ at }) => !Number.isNaN(at.getTime()) && at >= now)
    .sort((a, b) => a.at - b.at)[0]?.appt || null;
}

function plural(count, one, many) {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

/**
 * Número e resumo de cada aba. `tone` muda a cor da linha: 'alert' é
 * evolução atrasada (vermelho, a mesma bolinha pulsante de antes);
 * 'success' / 'warning' / 'neutral' é o estado do acesso do paciente.
 * `portalStatus` é o accessStatus() do acesso, ou null enquanto não se sabe.
 */
export function buildProfileTabSummaries({
  enrollments = [],
  shares = [],
  appointments = [],
  evolutions = [],
  pendingEvolutionsCount = 0,
  attachments = [],
  portalStatus = null,
  now = new Date(),
} = {}) {
  const enrolledLabels = enrollments.map(e => getDiscipline(e.discipline)?.label || e.discipline);
  const shareText = shares.length === 0 ? 'sem compartilhamento' : plural(shares.length, 'compartilhamento', 'compartilhamentos');

  const next = findNextAppointment(appointments, now);
  const lastEvolutionAt = latest(evolutions, 'atendimento_em');
  const lastAttachmentAt = latest(attachments, 'created_at');

  return {
    cadastro: {
      count: null,
      summary: 'Dados, filiação e endereço',
      tone: null,
      dots: [],
    },
    matriculas: {
      count: enrollments.length,
      summary: enrolledLabels.length ? `${enrolledLabels.join(', ')} · ${shareText}` : 'Sem matrícula',
      tone: null,
      dots: enrollments.map(e => getDiscipline(e.discipline)?.color).filter(Boolean),
    },
    agenda: {
      count: appointments.length,
      summary: next
        ? `Próximo: ${formatNextAppointment(new Date(next.starts_at))}`
        : (appointments.length ? 'Nenhum marcado daqui pra frente' : 'Nenhum agendamento'),
      tone: null,
      dots: [],
    },
    evolucao: {
      count: evolutions.length,
      summary: pendingEvolutionsCount > 0
        ? `${pendingEvolutionsCount} aguardando evolução`
        : (lastEvolutionAt ? `Última: ${dayMonth(lastEvolutionAt)}` : 'Nenhuma sessão registrada'),
      tone: pendingEvolutionsCount > 0 ? 'alert' : null,
      dots: [],
    },
    anexos: {
      count: attachments.length,
      summary: lastAttachmentAt ? `Último: ${dayMonth(lastAttachmentAt)}` : 'Nenhum arquivo',
      tone: null,
      dots: [],
    },
    portal: {
      count: null,
      summary: portalStatus ? `Acesso: ${portalStatus.label}` : 'Código e formulários',
      tone: portalStatus?.tone || null,
      dots: [],
    },
  };
}
