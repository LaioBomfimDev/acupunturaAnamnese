// ============================================================
// Link de entrevista — chamadas do lado de quem responde (sem login)
//
// Só conversa com a Edge Function interview-link. O token do link fica
// na memória da página (veio depois do "#" do endereço); respostas nunca
// são guardadas no aparelho, só no servidor, a cada salvamento.
// ============================================================

import { supabase } from '../lib/supabase';

export class InterviewLinkError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'InterviewLinkError';
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

export async function callInterviewLink(body) {
  const { data, error } = await supabase.functions.invoke('interview-link', { body });
  if (error) {
    const payload = await readErrorBody(error);
    throw new InterviewLinkError(
      payload?.error || 'Sem conexão com a clínica agora. Confira a internet e tente de novo.',
      {
        status: error.context?.status || 0,
        offline: !payload,
        conflict: Boolean(payload?.conflict),
        closed: Boolean(payload?.closed),
        missing: Array.isArray(payload?.missing) ? payload.missing : [],
        retryAfterSeconds: payload?.retryAfterSeconds || 0,
      },
    );
  }
  if (data?.error) throw new InterviewLinkError(data.error);
  return data;
}
