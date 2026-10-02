import { relativeDayWord } from './agenda';
import { buildReportAccentPalette } from './reportUtils';

// ============================================================
// Regras da página pública de confirmação (ConfirmAppointmentPage).
//
// A tela só desenha; o que aparece e quando mora aqui, pra ser testável
// sem montar React. A Edge Function confirm-appointment já corta o
// endereço de atendimento online — o corte se repete aqui de propósito:
// se um dia o servidor mandar o endereço por engano, o paciente online
// continua sem ver "vá até a clínica".
// ============================================================

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function formatTime(date) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Peças do "quando" para o bloco de data: bloquinho de calendário (dia +
 * mês curto), linha por extenso, faixa de horário e o selo "Amanhã".
 * Hora no fuso do aparelho do paciente — mesmo comportamento de antes.
 */
export function describeAppointmentWhen(startsAt, endsAt, today) {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return null;

  const end = endsAt ? new Date(endsAt) : null;
  const hasEnd = end && !Number.isNaN(end.getTime()) && end > start;

  return {
    day: start.toLocaleDateString('pt-BR', { day: '2-digit' }),
    month: start.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
    dateLong: capitalize(start.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })),
    timeRange: hasEnd ? `${formatTime(start)} às ${formatTime(end)}` : formatTime(start),
    relative: capitalize(relativeDayWord(start, today)),
  };
}

/** Link de busca do Google Maps pro endereço da clínica (vazio sem endereço). */
export function buildMapsLink(address) {
  const text = String(address || '').trim();
  if (!text) return '';
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(text)}`;
}

/**
 * Linhas do resumo, na ordem da tela. `modality` só existe quando a Edge
 * Function já está na versão nova — sem ela, a página fica como antes
 * (sem linha de atendimento nem endereço) em vez de chutar "Presencial".
 * Endereço e sala só fazem sentido pra quem vai até a clínica.
 */
export function buildConfirmationDetails(view) {
  if (!view) return [];

  const modality = view.modality === 'online' || view.modality === 'presencial' ? view.modality : null;
  const goesToClinic = modality !== 'online';
  const rows = [
    { id: 'patient', label: 'Paciente', value: view.patientName || 'Não informado' },
    { id: 'professional', label: 'Profissional', value: view.professionalName || 'Não informado' },
  ];

  if (modality) {
    rows.push({
      id: modality,
      label: 'Atendimento',
      value: modality === 'online' ? 'Online' : 'Presencial',
    });
  }

  const address = String(view.clinicAddress || '').trim();
  if (modality === 'presencial' && address) {
    rows.push({ id: 'address', label: 'Endereço', value: address, href: buildMapsLink(address) });
  }

  if (goesToClinic && view.room) {
    rows.push({ id: 'room', label: 'Sala', value: view.room });
  }

  return rows;
}

/**
 * A página veste a cor da clínica (botão principal, ícones, faixa do
 * topo) — mesma troca de --r1-accent que o AuthContext faz no sistema,
 * só que presa ao .cf-page porque aqui não há sessão. Cor inválida ou
 * ausente devolve null e a página fica no padrão do Vitalis.
 */
export function clinicAccentStyle(color) {
  const text = String(color || '').trim();
  if (!HEX_COLOR.test(text)) return null;
  const { accent, shade } = buildReportAccentPalette(text);
  return { '--r1-accent': accent, '--r1-accent-strong': shade };
}

// Coluna de clinics com a cor de cada link enviado ao paciente
// (Gestão → Personalizar). As Edge Functions leem a mesma coluna.
export const PUBLIC_LINK_COLOR_COLUMNS = {
  confirmation: 'confirmation_link_color',
  survey: 'survey_link_color',
};

/**
 * Cor que o paciente vê no link (`confirmation` ou `survey`). Sem
 * escolha da instituição, segue a cor do sistema. Nunca a cor pessoal
 * de quem mandou o link: a página não tem sessão, é da instituição.
 */
export function getClinicLinkColor(clinic, link) {
  const column = PUBLIC_LINK_COLOR_COLUMNS[link];
  return (column && clinic?.[column]) || clinic?.brand_color || '';
}
