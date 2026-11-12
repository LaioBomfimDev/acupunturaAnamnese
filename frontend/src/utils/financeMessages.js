// ============================================================
// Mensagens prontas do Financeiro para o WhatsApp (11/11/2026).
//
// Mesma regra da Agenda (utils/agendaMessages.js): aqui só se MONTA o
// texto e o link (utils/whatsapp.js). Quem envia é sempre uma pessoa,
// que lê e pode editar no WhatsApp antes de tocar em Enviar. Nunca há
// envio automático, nem em lote, nem por gatilho.
//
// Fonte única: a tela de "A receber" e qualquer outro lugar que venha a
// cobrar usam esta função, nunca um texto paralelo.
//
// O que a mensagem diz: dia e valor de cada item em aberto, e o total.
// O item de atendimento vai como "Atendimento de 07/10", sem o nome do
// serviço nem a área: a cobrança chega sem o paciente esperar, e quem
// lê o celular dele não precisa saber a especialidade. O pacote vai com
// o nome que a clínica deu, que é o que o paciente comprou.
// ============================================================

import { formatBRLWithCents, formatShortDay } from './finance.js';
import { firstNameOf } from './clinicAssistant.js';

/** Uma linha por item em aberto, na ordem em que a tela mostra. */
export function chargeReminderLines(items) {
  return (items || []).map(item => {
    const label = item.kind === 'charge'
      ? `Atendimento de ${formatShortDay(item.dueOn)}`
      : item.kind === 'installment'
        ? `${item.packageName} · parcela ${item.installmentNumber} de ${item.installments}`
        : item.kind === 'rest'
          ? `${item.packageName} · restante`
          : `${item.packageName} · sessão ${item.sessionNumber} de ${item.sessionsPlanned}`;
    return `• ${label} — ${formatBRLWithCents(item.openCents)}`;
  });
}

/**
 * Lembrete de valor em aberto, em parágrafos (no WhatsApp um bloco só
 * vira parede ilegível). `items` são os itens do paciente que a tela
 * está mostrando: o que ela vê é o que vai na mensagem.
 */
export function buildChargeReminderMessage({ patientName, items = [], clinicName = '' }) {
  if (!items.length) return '';
  const lines = chargeReminderLines(items);
  const total = items.reduce((sum, item) => sum + item.openCents, 0);
  const one = items.length === 1;

  const saudacao = `Olá, ${firstNameOf(patientName) || patientName}!`
    + (clinicName ? ` Aqui é da ${clinicName}.` : '');
  const abertura = one
    ? 'Passando para lembrar de um valor em aberto:'
    : 'Passando para lembrar dos valores em aberto:';
  const paragrafos = [saudacao, abertura, lines.join('\n')];
  if (!one) paragrafos.push(`Total: ${formatBRLWithCents(total)}.`);
  paragrafos.push('Se já tiver pago, por favor desconsidere. Qualquer dúvida, é só responder por aqui. Obrigado(a)!');
  return paragrafos.join('\n\n');
}
