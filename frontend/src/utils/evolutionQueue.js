// ============================================================
// Fila da tela Evoluções — regras puras (sem React, sem Supabase), para
// a tela e os testes lerem a mesma coisa.
//
// A fila vem da view appointments_awaiting_evolution: atendimento
// concluído (atendido, faltou ou falta justificada) sem evolução escrita.
// Mais recente primeiro — é o que ainda está fresco na memória de quem
// vai escrever. "Salvar e ir para o próximo" segue essa mesma ordem.
// ============================================================

export const ATTENDANCE_LABELS = {
  attended: 'Atendido',
  no_show: 'Faltou',
  excused: 'Falta justificada',
};

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

/**
 * Disciplinas em que a pessoa pode registrar evolução avulsa: as
 * liberadas no perfil que têm formulário de evolução (Neuropsicologia não
 * tem — é avaliação + relatório).
 */
export function evolutionDisciplinesFor(profileDisciplines, supported) {
  const liberadas = Array.isArray(profileDisciplines) ? profileDisciplines : [];
  return supported.filter(id => liberadas.includes(id));
}
