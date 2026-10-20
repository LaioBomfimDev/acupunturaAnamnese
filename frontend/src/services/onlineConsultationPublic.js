// ============================================================
// Consulta online — chamadas do lado do paciente (sem login)
//
// Só conversa com a Edge Function online-consultation. O paciente chega
// pelo link do agendamento (o mesmo da confirmação no WhatsApp); quem
// decide se a sala abre, e quando, é a function.
// ============================================================

import { supabase } from '../lib/supabase';

export class OnlineConsultationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'OnlineConsultationError';
    Object.assign(this, details);
  }
}

async function readErrorBody(error) {
  if (typeof error?.context?.json !== 'function') return null;
  try {
    return await error.context.json();
  } catch {
    return null;
  }
}

export async function callOnlineConsultation(body) {
  const { data, error } = await supabase.functions.invoke('online-consultation', { body });
  if (error) {
    const payload = await readErrorBody(error);
    throw new OnlineConsultationError(
      payload?.error || 'Sem conexão com a clínica agora. Confira a internet e tente de novo.',
      {
        status: error.context?.status || 0,
        offline: !payload,
        state: payload?.state || null,
        needsConsent: Boolean(payload?.needsConsent),
      },
    );
  }
  if (data?.error) throw new OnlineConsultationError(data.error);
  return data;
}

export function openConsultation(token) {
  return callOnlineConsultation({ action: 'open', token });
}

/** `recording`: 'accepted' ou 'declined'. O atendimento online é obrigatório. */
export function saveConsultationConsent(token, recording) {
  return callOnlineConsultation({ action: 'consent', token, teleatendimento: true, gravacao: recording });
}

export function joinConsultation(token) {
  return callOnlineConsultation({ action: 'join', token });
}
