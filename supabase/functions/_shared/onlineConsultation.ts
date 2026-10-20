// ============================================================
// Regras do atendimento online (espelho de
// frontend/src/utils/onlineConsultation.js e das versões de
// frontend/src/data/onlineConsentTerms.js). Mudou um lado, muda o outro:
// tests/regression/online-consultation.test.mjs confere os dois.
// ============================================================

// Só a Psicologia atende online pelo sistema (decisão de 20/10/2026).
export const ONLINE_ROOM_DISCIPLINES = ['psicologia'];

// Quanto antes do horário a sala abre e quanto depois ela fecha, para o
// paciente e para quem atende (que entra antes para se preparar).
export const ONLINE_ROOM_WINDOWS = {
  patient: { beforeMinutes: 15, afterMinutes: 60 },
  professional: { beforeMinutes: 30, afterMinutes: 120 },
} as const;

// Status em que ainda se entra na sala. Atendido continua: a profissional
// pode ter marcado antes de terminar.
export const ONLINE_ROOM_STATUSES = ['scheduled', 'ready', 'attended'];

// Versão de cada termo que o paciente aceita. Mudou o texto do termo:
// sobe a versão aqui e na tela, e o paciente responde de novo.
export const ONLINE_CONSENT_TERM_VERSIONS = {
  teleatendimento: 'teleatendimento-v1',
  gravacao_sessao: 'gravacao-v1',
} as const;

export const ONLINE_CONSENT_KINDS = ['teleatendimento', 'gravacao_sessao'] as const;

type Who = keyof typeof ONLINE_ROOM_WINDOWS;

export function roomWindow(startsAt: string, endsAt: string, who: Who) {
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

export function roomWindowState(window: { opensAt: number; closesAt: number } | null, now = Date.now()) {
  if (!window) return 'ended';
  if (now < window.opensAt) return 'early';
  if (now > window.closesAt) return 'ended';
  return 'open';
}

type AppointmentLike = {
  kind?: string | null;
  modality?: string | null;
  discipline?: string | null;
  status?: string | null;
};

/**
 * Atendimento que tem sala no sistema: online, de uma área que atende
 * online e com a sala ligada pela administração (Configurar agenda).
 */
export function isOnlineRoomAppointment(appointment: AppointmentLike, agendaSettings: unknown) {
  const settings = agendaSettings && typeof agendaSettings === 'object'
    ? agendaSettings as Record<string, unknown>
    : {};
  return settings.onlineRoom === true
    && appointment?.kind !== 'block'
    && appointment?.modality === 'online'
    && ONLINE_ROOM_DISCIPLINES.includes(String(appointment?.discipline || ''));
}

/** Nome curto, como a Agenda mostra: "Laize de Souza Lima" → "Laize de L.". */
export function shortName(fullName: unknown) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Profissional';
  if (parts.length <= 2) return parts.join(' ');
  return `${parts[0]} ${parts[1]} ${parts[parts.length - 1][0]}.`;
}

export function firstName(fullName: unknown) {
  return String(fullName || '').trim().split(/\s+/)[0] || 'Paciente';
}

type ConsentRow = {
  kind: string;
  decision: string;
  term_version: string;
  decided_at: string;
};

/** Decisão mais nova de cada tipo (as linhas chegam da mais nova para a mais antiga). */
export function latestConsents(rows: ConsentRow[]) {
  const latest: Record<string, { decision: string; termVersion: string; decidedAt: string } | null> = {
    teleatendimento: null,
    gravacao_sessao: null,
  };
  for (const row of rows || []) {
    if (!(row.kind in latest) || latest[row.kind]) continue;
    latest[row.kind] = { decision: row.decision, termVersion: row.term_version, decidedAt: row.decided_at };
  }
  return latest;
}

/** Precisa responder o termo antes de entrar: nunca aceitou a versão atual. */
export function needsTeleconsent(latest: ReturnType<typeof latestConsents>) {
  const tele = latest.teleatendimento;
  return !tele
    || tele.decision !== 'accepted'
    || tele.termVersion !== ONLINE_CONSENT_TERM_VERSIONS.teleatendimento;
}
