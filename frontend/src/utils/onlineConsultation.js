// ============================================================
// Regras do atendimento online pela sala do sistema (Daily, 20/10/2026).
//
// Espelho de supabase/functions/_shared/onlineConsultation.ts: a Edge
// Function decide quem entra e quando; aqui a tela só mostra o mesmo.
// Mudou um lado, muda o outro (tests/regression/online-consultation.test.mjs).
// ============================================================

// Só a Psicologia atende online pelo sistema (decisão de 20/10/2026).
export const ONLINE_ROOM_DISCIPLINES = ['psicologia'];

// Quanto antes do horário a sala abre e quanto depois ela fecha.
export const ONLINE_ROOM_WINDOWS = Object.freeze({
  patient: Object.freeze({ beforeMinutes: 15, afterMinutes: 60 }),
  professional: Object.freeze({ beforeMinutes: 30, afterMinutes: 120 }),
});

// Status em que ainda se entra na sala (Atendido continua: pode ter sido
// marcado antes de terminar).
export const ONLINE_ROOM_STATUSES = ['scheduled', 'ready', 'attended'];

// Minutos grátis por mês no Daily (participante-minuto) e quanto gasta uma
// consulta: 60 minutos com 2 pessoas = 120 (21/10/2026: a sessão ocupa a
// hora inteira, não 50 minutos).
export const DAILY_FREE_PARTICIPANT_MINUTES = 10_000;
export const CONSULT_MINUTES = 60;
export const CONSULT_PARTICIPANT_MINUTES = CONSULT_MINUTES * 2;

// Painel da conta no Daily, onde fica o uso e a fatura de verdade.
export const DAILY_DASHBOARD_URL = 'https://dashboard.daily.co/';
// A partir daqui o contador avisa que está perto do fim dos minutos grátis.
export const USAGE_WARNING_SHARE = 0.8;

// Página do paciente (pública, link do agendamento) e sala de quem atende
// (com login). As duas abrem em página própria: só nelas o navegador
// libera câmera e microfone (vercel.json).
export const ONLINE_CONSULTATION_PATH = '/consulta-online';
export const ONLINE_ROOM_PATH = '/sala-online';

/**
 * Atendimento que tem sala no sistema: online, de área que atende online
 * e com a sala ligada pela administração em Configurar agenda.
 */
export function isOnlineRoomAppointment(appointment, settings) {
  return Boolean(
    settings?.onlineRoom === true
    && appointment
    && appointment.kind !== 'block'
    && appointment.modality === 'online'
    && ONLINE_ROOM_DISCIPLINES.includes(appointment.discipline),
  );
}

/** Botão "Entrar na sala online": só para quem atende aquele horário. */
export function canEnterOnlineRoom(appointment, profile, settings) {
  return isOnlineRoomAppointment(appointment, settings)
    && Boolean(profile?.id)
    && appointment.professional_id === profile.id
    && ONLINE_ROOM_STATUSES.includes(appointment.status);
}

export function onlineRoomHref(appointmentId) {
  return `${ONLINE_ROOM_PATH}?agendamento=${encodeURIComponent(appointmentId)}`;
}

export function onlineConsultationHref(token, origin = globalThis.location?.origin || '') {
  return `${origin}${ONLINE_CONSULTATION_PATH}?token=${encodeURIComponent(token)}`;
}

/** Janela da sala em milissegundos, ou null com horário inválido. */
export function roomWindow(startsAt, endsAt, who) {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  const rule = ONLINE_ROOM_WINDOWS[who];
  if (!Number.isFinite(start) || !rule) return null;
  const finish = Number.isFinite(end) && end > start ? end : start;
  return {
    opensAt: start - rule.beforeMinutes * 60_000,
    closesAt: finish + rule.afterMinutes * 60_000,
  };
}

/** 'early' (ainda não abriu), 'open' ou 'ended' (já fechou). */
export function roomWindowState(window, now = Date.now()) {
  if (!window) return 'ended';
  const time = now instanceof Date ? now.getTime() : now;
  if (time < window.opensAt) return 'early';
  if (time > window.closesAt) return 'ended';
  return 'open';
}

export function formatClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "A sala abre às 13:45, 15 minutos antes do horário." */
export function opensAtLabel(window, who) {
  if (!window) return '';
  const minutes = ONLINE_ROOM_WINDOWS[who]?.beforeMinutes;
  return `A sala abre às ${formatClock(window.opensAt)}, ${minutes} minutos antes do horário.`;
}

/**
 * Erro que o Daily devolve ao entrar (errorMsg do evento 'error') em
 * linguagem de gente. Achado de 20/10/2026: conta do Daily sem forma de
 * pagamento recusa toda chamada, e a tela só dizia "Tente de novo".
 */
export function dailyErrorMessage(errorMsg, who) {
  const code = String(errorMsg || '').trim();
  if (code === 'account-missing-payment-method') {
    return who === 'professional'
      ? 'O Daily recusou a chamada: a conta do Daily está sem forma de pagamento. Cadastre um cartão em Billing, no painel do Daily (os minutos grátis continuam valendo).'
      : 'A sala online da clínica ainda não foi liberada. Avise a clínica.';
  }
  if (/exp|eject/i.test(code)) {
    return 'O horário desta sala acabou.';
  }
  if (who === 'professional') return code ? `A chamada não abriu (${code}).` : 'A chamada não abriu.';
  return 'Não foi possível entrar agora. Tente de novo.';
}

/**
 * Contador de uso do Daily no mês (pedido de 21/10/2026): quanto já foi,
 * quanto falta dos minutos grátis e quantas consultas de 60 min isso dá.
 */
export function usageSummary(usage) {
  if (!usage || !Number.isFinite(Number(usage.participantMinutes))) return null;
  const used = Math.max(0, Math.round(Number(usage.participantMinutes)));
  const free = Number(usage.freeMinutes) || DAILY_FREE_PARTICIPANT_MINUTES;
  const perConsult = Number(usage.consultMinutes) || CONSULT_PARTICIPANT_MINUTES;
  const left = Math.max(0, free - used);
  const share = free > 0 ? used / free : 1;
  return {
    used,
    free,
    left,
    percent: Math.min(100, Math.round(share * 100)),
    over: used > free,
    near: share >= USAGE_WARNING_SHARE && used <= free,
    consultsUsed: Math.floor(used / perConsult),
    consultsLeft: Math.floor(left / perConsult),
    since: usage.periodStart ? new Date(usage.periodStart).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '',
  };
}

export function formatMinutes(value) {
  return `${Number(value || 0).toLocaleString('pt-BR')} min`;
}

/** Linhas do cartão de consentimento: o que foi aceito, recusado ou falta responder. */
export function consentRows(consents, needsConsent) {
  const tele = consents?.teleatendimento;
  const recording = consents?.gravacao_sessao;
  const teleOk = !needsConsent && tele?.decision === 'accepted';
  return [
    {
      key: 'teleatendimento',
      ok: teleOk,
      title: 'Atendimento online',
      detail: teleOk ? `termo aceito em ${dayLabel(tele.decidedAt)}` : 'termo ainda não aceito',
    },
    {
      key: 'gravacao_sessao',
      ok: recording?.decision === 'accepted',
      title: 'Gravação',
      detail: !recording
        ? 'ainda sem resposta'
        : recording.decision === 'accepted'
          ? `autorizada em ${dayLabel(recording.decidedAt)}`
          : recording.decision === 'revoked'
            ? `autorização retirada em ${dayLabel(recording.decidedAt)}`
            : `não autorizada (${dayLabel(recording.decidedAt)})`,
    },
  ];
}

function dayLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

/** Texto curto da decisão sobre gravar, para quem atende. */
export function recordingConsentLabel(consent) {
  if (!consent) return 'Gravação: ainda sem resposta.';
  const when = dayLabel(consent.decidedAt);
  if (consent.decision === 'accepted') return `Gravação autorizada em ${when}.`;
  if (consent.decision === 'revoked') return `Autorização de gravar retirada em ${when}.`;
  return `Gravação não autorizada (${when}).`;
}

/** Linha do termo do atendimento online, para quem atende. */
export function teleconsentLabel(consent, needsConsent) {
  if (needsConsent || !consent) {
    return 'Termo do atendimento online ainda não aceito: a resposta vem quando o link da consulta for aberto.';
  }
  return `Termo do atendimento online aceito em ${dayLabel(consent.decidedAt)}.`;
}
