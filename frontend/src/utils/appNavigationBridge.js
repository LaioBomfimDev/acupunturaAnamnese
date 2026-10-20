// ============================================================
// Ponte entre abas: a sala online abre em aba própria (só ali o
// navegador libera câmera e microfone) e os atalhos dela ("Ver escalas",
// "Evoluções anteriores") abrem a tela na aba do sistema.
//
// A sala pede pelo BroadcastChannel; a aba do sistema que estiver aberta
// responde e troca de tela. Sem aba do sistema aberta, o pedido fica
// guardado por um minuto e uma aba nova do sistema o lê ao abrir. Só vai
// tela e id do paciente: o nome nunca fica guardado no aparelho.
// ============================================================

const CHANNEL_NAME = 'vitalis-app-navigation';
const PENDING_KEY = 'vitalis:pending-screen';
const PENDING_MAX_AGE_MS = 60_000;
const ACK_TIMEOUT_MS = 700;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Telas que a sala pode pedir. Tela nova entra aqui e no App.
export const BRIDGE_SCREENS = ['escalas', 'evolucao'];

export function sanitizeScreenRequest(raw) {
  if (!raw || typeof raw !== 'object' || !BRIDGE_SCREENS.includes(raw.screen)) return null;
  const request = { screen: raw.screen };
  if (typeof raw.patientId === 'string' && UUID.test(raw.patientId)) request.patientId = raw.patientId;
  if (typeof raw.patientName === 'string' && raw.patientName.trim()) {
    request.patientName = raw.patientName.trim().slice(0, 120);
  }
  return request;
}

function openChannel() {
  return typeof BroadcastChannel === 'function' ? new BroadcastChannel(CHANNEL_NAME) : null;
}

function newId() {
  return globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function rememberPending(request) {
  try {
    const pending = { screen: request.screen, at: Date.now() };
    if (request.patientId) pending.patientId = request.patientId;
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Sem armazenamento (aba anônima): a aba nova abre na tela inicial.
  }
}

/**
 * Pede para a aba do sistema abrir uma tela. Devolve 'existing' quando
 * uma aba respondeu e 'new-tab' quando foi preciso abrir outra.
 */
export async function requestAppScreen(raw, { openWindow = url => globalThis.open?.(url, '_blank') } = {}) {
  const request = sanitizeScreenRequest(raw);
  if (!request) return null;

  const channel = openChannel();
  if (channel) {
    const id = newId();
    const answered = await new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), ACK_TIMEOUT_MS);
      channel.onmessage = event => {
        if (event.data?.type === 'ack' && event.data.id === id) {
          clearTimeout(timer);
          resolve(true);
        }
      };
      channel.postMessage({ type: 'open', id, request });
    });
    channel.close();
    if (answered) return 'existing';
  }

  rememberPending(request);
  openWindow('/');
  return 'new-tab';
}

/** Lê (e apaga) o pedido guardado para uma aba nova do sistema. */
export function consumePendingScreenRequest(now = Date.now()) {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_KEY);
    const parsed = JSON.parse(raw);
    if (!(now - Number(parsed?.at) <= PENDING_MAX_AGE_MS)) return null;
    return sanitizeScreenRequest(parsed);
  } catch {
    return null;
  }
}

/** A aba do sistema escuta os pedidos; devolve a função que para de escutar. */
export function listenScreenRequests(handler) {
  const channel = openChannel();
  if (!channel) return () => {};
  channel.onmessage = event => {
    if (event.data?.type !== 'open') return;
    const request = sanitizeScreenRequest(event.data.request);
    if (!request) return;
    channel.postMessage({ type: 'ack', id: event.data.id });
    handler(request);
  };
  return () => channel.close();
}
