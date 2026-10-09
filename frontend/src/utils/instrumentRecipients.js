// ============================================================
// Para quem vai o resultado de uma escala enviada para casa
// (ficha → Área do Paciente e aba Escalas). Regra pura, sem tela.
//
// Quem recebe a nota e o alerta de risco = quem atende o paciente na
// área: o responsável da matrícula e quem tem atendimento na Agenda.
// A administração lê sempre, mas não "recebe" (alerta e "Vi o alerta"
// ficam com quem atende). Envio da administração com matrícula na área
// sempre leva um responsável escolhido ou confirmado (20261012): foi
// assim que o PHQ-9 de 09/10/2026 parou só com quem criou a matrícula.
// ============================================================

export const AREA_LABELS = {
  psicologia: 'Psicologia',
  neuropsicologia: 'Neuropsicologia',
  fisioterapia: 'Fisioterapia',
  nutricao: 'Nutrição',
  acupuntura: 'Acupuntura',
};

export function areaLabel(discipline) {
  return AREA_LABELS[discipline] || discipline || 'área';
}

/**
 * Quem da equipe pode ser responsável numa área: ativo, de papel clínico e
 * da área. Espelha is_enrollment_responsible_candidate (20261012); o banco
 * confere de novo ao salvar. `member` vem de listClinicMembers.
 */
export function canBeResponsible(member, discipline) {
  return Boolean(member)
    && member.is_active !== false
    && ['therapist', 'clinic_admin'].includes(member.role)
    && Array.isArray(member.disciplines)
    && member.disciplines.includes(discipline);
}

/** Responsável que de fato recebe (ativo, da área); senão null. */
export function activeResponsible(info) {
  return info?.responsible?.receives ? info.responsible : null;
}

/** Quem atende hoje: o responsável primeiro, depois quem está na Agenda. */
export function currentReceivers(info) {
  const responsible = activeResponsible(info);
  const agenda = Array.isArray(info?.agenda) ? info.agenda : [];
  return [
    ...(responsible ? [{ ...responsible, reason: 'responsavel' }] : []),
    ...agenda.filter(person => person.id !== responsible?.id).map(person => ({ ...person, reason: 'agenda' })),
  ];
}

/**
 * O que a tela de envio mostra e deixa fazer.
 *
 * `info` vem de getInstrumentResultRecipients (null enquanto carrega).
 * `choiceId` é o responsável escolhido na tela (só conta quando dá para
 * escolher). Devolve:
 *   canChoose     — a tela mostra a escolha do responsável (administração
 *                   com matrícula ativa na área);
 *   options       — quem pode ser responsável;
 *   initialChoice — o que já vem marcado (responsável atual, ou a única
 *                   pessoa com atendimento na Agenda);
 *   receivers     — quem vai receber depois de enviar, com o motivo;
 *   changesFrom   — nome do responsável atual quando a escolha troca;
 *   canSend       — se o botão de enviar fica liberado;
 *   blockedReason — por que não dá para enviar, para mostrar na tela.
 */
export function recipientPlan(info, choiceId = '', { discipline = '' } = {}) {
  const empty = {
    canChoose: false, options: [], initialChoice: '', receivers: [], changesFrom: '', canSend: false, blockedReason: '',
  };
  if (!info) return empty;

  const responsible = activeResponsible(info);
  const agenda = Array.isArray(info.agenda) ? info.agenda : [];
  const options = Array.isArray(info.candidates) ? info.candidates : [];
  const enrolled = Boolean(info.enrollmentId) && info.enrollmentStatus === 'active';
  const canChoose = Boolean(info.viewerIsAdmin) && enrolled;

  if (canChoose) {
    const optionIds = new Set(options.map(option => option.id));
    const onlyAgenda = agenda.length === 1 && optionIds.has(agenda[0].id) ? agenda[0].id : '';
    const initialChoice = responsible && optionIds.has(responsible.id) ? responsible.id : onlyAgenda;
    const chosen = options.find(option => option.id === choiceId) || null;
    const receivers = [
      ...(chosen ? [{ ...chosen, reason: 'responsavel' }] : []),
      ...agenda.filter(person => person.id !== chosen?.id).map(person => ({ ...person, reason: 'agenda' })),
    ];
    return {
      ...empty,
      canChoose,
      options,
      initialChoice,
      receivers,
      changesFrom: chosen && responsible && responsible.id !== chosen.id ? responsible.name : '',
      canSend: Boolean(chosen),
      blockedReason: chosen ? '' : `Escolha o responsável na ${areaLabel(discipline)}: é quem recebe a nota e o alerta de risco.`,
    };
  }

  const receivers = currentReceivers(info);
  if (receivers.length) return { ...empty, receivers, canSend: true };

  return {
    ...empty,
    blockedReason: enrolled
      ? `Ninguém atende este paciente na ${areaLabel(discipline)} ainda. A administração escolhe o responsável na ficha, aba Matrículas, ou agende um atendimento.`
      : `O paciente ainda não está na ${areaLabel(discipline)}. Na ficha, aba Matrículas, envie o paciente para a área escolhendo quem vai atender: essa pessoa fica como responsável e recebe o resultado.`,
  };
}

function personLabel(person, viewerId) {
  const name = person.id === viewerId ? 'você' : person.name;
  return person.reason === 'responsavel' ? `${name} (responsável)` : `${name} (atendimento na Agenda)`;
}

function joinNames(names) {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

/** "Denise Neves (responsável) e Fulano (atendimento na Agenda)". */
export function receiversLabel(receivers, viewerId = null) {
  return joinNames((receivers || []).map(person => personLabel(person, viewerId)));
}

/** "A nota e o alerta de risco vão para Denise Neves (responsável) e você (atendimento na Agenda)." */
export function recipientSentence(receivers, viewerId = null) {
  if (!Array.isArray(receivers) || receivers.length === 0) return '';
  return `A nota e o alerta de risco vão para ${receiversLabel(receivers, viewerId)}.`;
}
