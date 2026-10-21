// ============================================================
// Daily (vídeo): sala por atendimento e convite com hora para acabar.
//
// O Daily só passa o vídeo: não gravamos nada lá (sem gravação em nuvem,
// sem transcrição deles, sem chat). A sala é privada: só entra quem tem
// um convite (meeting token) emitido por esta function, com hora para
// acabar. O nome da sala sai do id do agendamento por HMAC com a chave do
// Daily, então não carrega nome de ninguém e não precisa de tabela.
// ============================================================

const DAILY_API = 'https://api.daily.co/v1';
const REQUEST_TIMEOUT_MS = 10_000;

export type DailyConfig = { apiKey: string };

export function readDailyConfig(): DailyConfig | null {
  const apiKey = String(Deno.env.get('DAILY_API_KEY') || '').trim();
  return apiKey ? { apiKey } : null;
}

async function hmacHex(key: string, message: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function roomNameFor(config: DailyConfig, appointmentId: string) {
  return `v${(await hmacHex(config.apiKey, `sala-online:${appointmentId}`)).slice(0, 32)}`;
}

async function dailyFetch(config: DailyConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(`${DAILY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

/**
 * Garante a sala do atendimento e devolve a URL. Sala que já existe só
 * ganha prazo maior (atendimento remarcado para depois).
 */
export async function ensureRoom(config: DailyConfig, name: string, expiresAtMs: number) {
  const exp = Math.ceil(expiresAtMs / 1000);
  const existing = await dailyFetch(config, `/rooms/${encodeURIComponent(name)}`);

  if (existing.status === 200 && existing.body?.url) {
    const currentExp = Number(existing.body?.config?.exp) || 0;
    if (currentExp < exp) {
      const updated = await dailyFetch(config, `/rooms/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: JSON.stringify({ properties: { exp } }),
      });
      if (updated.status !== 200) throw new Error('daily_room_update_failed');
    }
    return String(existing.body.url);
  }

  if (existing.status !== 404) throw new Error('daily_room_lookup_failed');

  const created = await dailyFetch(config, '/rooms', {
    method: 'POST',
    body: JSON.stringify({
      name,
      privacy: 'private',
      properties: {
        exp,
        eject_at_room_exp: true,
        enable_prejoin_ui: false,
        enable_knocking: false,
        enable_chat: false,
        enable_screenshare: true,
        max_participants: 4,
        lang: 'pt-BR',
      },
    }),
  });
  if (created.status !== 200 || !created.body?.url) throw new Error('daily_room_create_failed');
  return String(created.body.url);
}

/**
 * Uso do mês na conta do Daily, em participante-minuto (é assim que ele
 * cobra): soma o tempo de cada pessoa em cada chamada desde o dia 1º (UTC).
 * Conta feita aqui, a partir da lista de chamadas; a fatura do Daily é a
 * referência final.
 */
export async function monthUsage(config: DailyConfig, now = Date.now()) {
  const today = new Date(now);
  const periodStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const MAX_PAGES = 10;
  const PAGE_SIZE = 100;
  let participantMinutes = 0;
  let meetings = 0;
  let ongoing = false;
  let cursor = '';

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      timeframe_start: String(Math.floor(periodStart / 1000)),
      timeframe_end: String(Math.ceil(now / 1000)),
      limit: String(PAGE_SIZE),
    });
    if (cursor) query.set('starting_after', cursor);
    const result = await dailyFetch(config, `/meetings?${query}`);
    if (result.status !== 200 || !Array.isArray(result.body?.data)) throw new Error('daily_usage_failed');
    const list = result.body.data;
    for (const meeting of list) {
      meetings += 1;
      if (meeting?.ongoing) ongoing = true;
      for (const participant of meeting?.participants || []) {
        // Quem ainda está na chamada não tem duração fechada: conta da
        // entrada até agora.
        const joinedAt = Number(participant?.join_time) || 0;
        const seconds = Number(participant?.duration)
          || (meeting?.ongoing && joinedAt > 0 ? Math.max(0, now / 1000 - joinedAt) : 0);
        if (seconds > 0) participantMinutes += Math.ceil(seconds / 60);
      }
    }
    if (list.length < PAGE_SIZE) break;
    cursor = String(list[list.length - 1]?.id || '');
    if (!cursor) break;
  }

  return { participantMinutes, meetings, ongoing, periodStart };
}

/** Convite para entrar na sala, que vale só dentro da janela do atendimento. */
export async function createMeetingToken(config: DailyConfig, options: {
  roomName: string;
  userName: string;
  isOwner: boolean;
  notBeforeMs: number;
  expiresAtMs: number;
}) {
  const created = await dailyFetch(config, '/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({
      properties: {
        room_name: options.roomName,
        user_name: options.userName.slice(0, 60),
        is_owner: options.isOwner,
        nbf: Math.floor(options.notBeforeMs / 1000),
        exp: Math.ceil(options.expiresAtMs / 1000),
        eject_at_token_exp: true,
        lang: 'pt-BR',
      },
    }),
  });
  if (created.status !== 200 || !created.body?.token) throw new Error('daily_token_failed');
  return String(created.body.token);
}
