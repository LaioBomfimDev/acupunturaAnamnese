// ============================================================
// Mensagens prontas da Agenda para o WhatsApp (wa.me).
//
// ACUP-027 (AG-10): o texto da confirmação saiu de dentro da
// PendingConfirmationView para cá, IGUAL, para a tela e a assistente
// usarem a mesma função (nunca texto paralelo). Quem envia é sempre uma
// pessoa: isto só monta o texto e o link (ver utils/whatsapp.js).
// ============================================================

import { relativeDayLabel } from './agenda.js';
import { isOnlineRoomAppointment } from './onlineConsultation.js';

function hora(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diaHoraRelativo(iso, now) {
  return `${relativeDayLabel(iso, now)} às ${hora(iso)}`;
}

/** Link pessoal da confirmação (o mesmo da fila da Agenda). */
export function confirmationLink(origin, token) {
  return `${origin}/confirmar-agendamento?token=${token}`;
}

/**
 * Texto da confirmação de um atendimento, em parágrafos (no WhatsApp um
 * bloco só vira parede ilegível). `professionalName` é o nome de verdade,
 * nunca "você" (o paciente é quem lê).
 */
export function buildConfirmationMessage({
  appointment, patientName, professionalName, clinicName = '', clinicAddress = '', agendaSettings = null, origin, now = new Date(),
}) {
  const link = confirmationLink(origin, appointment.confirmation_token);
  const saudacao = `Olá, ${patientName}!`
    + (clinicName ? ` Aqui é da ${clinicName}.` : '')
    + ` Você tem uma consulta com ${professionalName} `
    + `agendada para ${diaHoraRelativo(appointment.starts_at, now)}.`;
  const confirmacao = `Por favor, confirme sua presença aqui: ${link}`;

  const paragrafos = [saudacao, confirmacao];
  // Sala online do sistema: o mesmo link leva para a consulta no horário.
  if (isOnlineRoomAppointment(appointment, agendaSettings)) {
    paragrafos.push('Sua consulta é online, por vídeo. No horário, abra este mesmo link e toque em “Entrar na consulta”.');
  }
  // Online não vai até a clínica: mandar o endereço só confunde.
  if (clinicAddress && appointment.modality !== 'online') paragrafos.push(`Nosso endereço: ${clinicAddress}.`);
  paragrafos.push('Obrigado(a)!');
  return paragrafos.join('\n\n');
}
