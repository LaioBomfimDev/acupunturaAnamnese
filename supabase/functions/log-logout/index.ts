import {
  createCorsContext,
  createServiceClient,
  getCallerProfile,
} from '../_shared/security.ts';
import { writeClinicAccessLog } from '../_shared/audit.ts';

// ============================================================
// Log de acesso — logout
//
// signOut() hoje é 100% client-side (AuthContext.jsx), sem round-trip
// ao servidor. Login já grava em clinic_access_logs dentro de
// login-with-identifier; esta function existe só para o par de
// logout, chamada ANTES de supabase.auth.signOut() invalidar a sessão
// local — depois disso não haveria mais token para identificar quem
// saiu.
//
// Best-effort igual ao resto do módulo: nunca deve impedir o logout no
// cliente, mesmo se a sessão já tiver expirado ou o log falhar.
// ============================================================

Deno.serve(async (req) => {
  const cors = createCorsContext(req);
  if (!cors.allowed) return cors.rejectResponse();
  const { headers: corsHeaders, jsonResponse } = cors;

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);

    if ('error' in caller) {
      return jsonResponse({ ok: true, logged: false });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('clinic_id')
      .eq('id', caller.user.id)
      .maybeSingle();

    if (!profile?.clinic_id) {
      return jsonResponse({ ok: true, logged: false });
    }

    const logged = await writeClinicAccessLog(supabaseAdmin, {
      clinicId: profile.clinic_id,
      actorId: caller.user.id,
      action: 'logout',
    });

    return jsonResponse({ ok: true, logged });
  } catch {
    return jsonResponse({ ok: true, logged: false });
  }
});
