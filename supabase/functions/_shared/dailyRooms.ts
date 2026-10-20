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
