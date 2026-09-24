// ============================================================
// Fila da tela Evoluções — regras puras (sem React, sem Supabase), para
// a tela e os testes lerem a mesma coisa.
//
// A fila vem da view appointments_awaiting_evolution: atendimento
// concluído (atendido, não compareceu ou cancelado pelo paciente) sem
// evolução escrita. Só existe evolução a partir de agendamento — não há
// mais registro avulso (decisão de 2026-09-24, travada também no banco
// em 20260924b_evolution_requires_appointment.sql).
// Mais recente primeiro — é o que ainda está fresco na memória de quem
// vai escrever. "Salvar e ir para o próximo" segue essa mesma ordem.
// ============================================================

export const ATTENDANCE_LABELS = {
  attended: 'Atendido',
  no_show: 'Não compareceu',
  excused: 'Cancelado pelo paciente',
};

// Áreas com formulário de evolução — as mesmas que o banco aceita em
// insert_patient_evolution. Neuropsicologia fica de fora de propósito
// (é avaliação + relatório): o agendamento dela aparece na view de
// pendências, mas não tem evolução para escrever.
export const EVOLUTION_DISCIPLINES = ['acupuntura', 'fisioterapia', 'psicologia', 'nutricao'];

export function onlyEvolutionDisciplines(items) {
  return (Array.isArray(items) ? items : []).filter(item => EVOLUTION_DISCIPLINES.includes(item?.discipline));
}

export const FALTA_OBSERVATION_REQUIRED =
  'Escreva uma observação sobre a falta antes de registrar.';

/**
 * Falta não se registra "só no botão": a observação é obrigatória.
 * Devolve a mensagem de erro, ou null quando está ok.
 */
export function validateFaltaObservation(text) {
  return String(text || '').trim() ? null : FALTA_OBSERVATION_REQUIRED;
}

// A view devolve appointment_id (não id) — adapta pro formato que os
// formulários de evolução já esperam (o mesmo de PatientContext).
export function toActiveAppointment(item) {
  return {
    id: item.appointment_id,
    startsAt: item.starts_at,
    discipline: item.discipline,
    attendanceStatus: item.attendance_status,
    patientId: item.patient_id,
  };
}

function localDayKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Ordena do mais recente para o mais antigo, sem mutar a entrada. */
export function sortQueue(items) {
  return (Array.isArray(items) ? items : [])
    .slice()
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
}

/** [[dayKey, itens do dia], ...] na ordem da fila. */
export function groupQueueByDay(items) {
  const groups = [];
  for (const item of sortQueue(items)) {
    const key = localDayKey(item.starts_at);
    const last = groups[groups.length - 1];
    if (last && last[0] === key) last[1].push(item);
    else groups.push([key, [item]]);
  }
  return groups;
}

/**
 * Pode escrever esta evolução? Mesmo corte que a Agenda usa para
 * "Iniciar atendimento": o atendimento é da própria pessoa, a disciplina
 * está liberada no perfil dela e o paciente está visível para ela. Admin
 * enxerga a fila da equipe inteira, mas só escreve a própria — e a RLS
 * recusaria de qualquer forma.
 */
export function canWriteEvolution(item, profile, visiblePatientIds) {
  if (!item || !profile?.id) return false;
  if (item.professional_id !== profile.id) return false;
  const liberadas = Array.isArray(profile.disciplines) ? profile.disciplines : [];
  if (!liberadas.includes(item.discipline)) return false;
  return visiblePatientIds ? visiblePatientIds.has(item.patient_id) : true;
}

/**
 * Próximo atendimento a abrir depois de salvar `currentId`: o seguinte na
 * ordem da fila que ainda não foi feito e que a pessoa pode escrever; se
 * não houver depois, volta ao primeiro que sobrou. null = fila vazia.
 */
export function nextQueueItem(items, currentId, doneIds, isWritable = () => true) {
  const done = doneIds instanceof Set ? doneIds : new Set(doneIds || []);
  const ordered = sortQueue(items);
  const open = item => item.appointment_id !== currentId && !done.has(item.appointment_id) && isWritable(item);
  const currentIndex = ordered.findIndex(item => item.appointment_id === currentId);
  const after = ordered.slice(currentIndex + 1).find(open);
  return after || ordered.find(open) || null;
}

export const QUEUE_PERIODS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'semana', label: 'Últimos 7 dias' },
  { id: 'tudo', label: 'Tudo que está na fila' },
];

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Filtros do painel da fila. Todos opcionais; o que vier vazio não
 * filtra. `done` é o conjunto de atendimentos evoluídos NESTA tela (ficam
 * verdes na lista até sair da tela — a view do banco já não os devolve
 * num recarregamento).
 *
 * - situacao: 'todos' | 'pendentes' | 'evoluidos'
 * - area: id da disciplina
 * - atendimento: 'todos' | 'atendido' | 'ausencia' (não compareceu ou
 *   cancelado pelo paciente)
 * - periodo: 'hoje' | 'semana' | 'tudo', contado a partir de `now`
 */
export function filterQueue(items, {
  done = new Set(),
  situacao = 'todos',
  area = '',
  atendimento = 'todos',
  periodo = 'tudo',
  now = new Date(),
} = {}) {
  const hoje = startOfLocalDay(now);
  const seteDias = new Date(hoje);
  seteDias.setDate(seteDias.getDate() - 6);
  const limite = periodo === 'hoje' ? hoje : periodo === 'semana' ? seteDias : null;

  return sortQueue(items).filter(item => {
    const isDone = done.has(item.appointment_id);
    if (situacao === 'pendentes' && isDone) return false;
    if (situacao === 'evoluidos' && !isDone) return false;
    if (area && item.discipline !== area) return false;
    if (atendimento === 'atendido' && item.attendance_status !== 'attended') return false;
    if (atendimento === 'ausencia' && item.attendance_status === 'attended') return false;
    if (limite && new Date(item.starts_at) < limite) return false;
    return true;
  });
}
