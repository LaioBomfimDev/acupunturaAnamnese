import { createCorsContext, createServiceClient } from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';

// ============================================================
// Pesquisa de satisfação — resposta do paciente
//
// Única function pública do projeto: sem assertEdgeAccess, sem JWT.
// Por isso o desenho é deliberadamente contido — ver comentário na
// migration 20260901_satisfaction_surveys.sql.
//
// POST sempre (mesmo padrão de toda outra function do projeto — o CORS
// compartilhado só libera POST/OPTIONS). `rating` ausente = consulta
// (tela carrega o formulário); `rating` presente = envio da resposta.
//
// Mensagem de erro sempre genérica: token inexistente, expirado e já
// respondido devolvem o mesmo texto, para não virar oráculo de quais
// tokens existem.
// ============================================================

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = 'Link inválido, expirado ou já respondido.';

function isValidToken(token) {
  return typeof token === 'string' && UUID_PATTERN.test(token);
}

async function loadOpenSurvey(supabaseAdmin, token) {
  const { data, error } = await supabaseAdmin
    .from('satisfaction_surveys')
    .select('id,clinic_id,expires_at,responded_at')
    .eq('token', token)
    .maybeSingle();

  if (error || !data) return null;
  if (data.responded_at) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data;
}

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
    const body = await readClinicalJsonBody(req, 2_048).catch(() => ({}));
    const token = String(body.token || '');

    if (!isValidToken(token)) {
      return jsonResponse({ error: GENERIC_ERROR }, 404);
    }

    // Rate limit por token (já é um UUID, serve de sujeito direto) —
    // não impede adivinhar token (espaço de busca inviável), mas
    // limita abuso repetido sobre o mesmo link.
    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: token,
      functionName: 'satisfaction-survey',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const hasRating = body.rating !== undefined && body.rating !== null;

    if (!hasRating) {
      const survey = await loadOpenSurvey(supabaseAdmin, token);
      if (!survey) {
        return jsonResponse({ error: GENERIC_ERROR }, 404);
      }

      const { data: clinic } = await supabaseAdmin
        .from('clinics')
        .select('name')
        .eq('id', survey.clinic_id)
        .maybeSingle();

      return jsonResponse({ clinicName: clinic?.name || null });
    }

    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return jsonResponse({ error: 'Escolha uma nota de 1 a 5.' }, 400);
    }
    const comment = typeof body.comment === 'string'
      ? body.comment.trim().slice(0, 1000) || null
      : null;

    const survey = await loadOpenSurvey(supabaseAdmin, token);
    if (!survey) {
      return jsonResponse({ error: GENERIC_ERROR }, 404);
    }

    // .is('responded_at', null) trava o uso único mesmo sob corrida: se
    // duas respostas chegarem quase juntas, só a primeira UPDATE conta
    // (a segunda casa zero linhas).
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('satisfaction_surveys')
      .update({ rating, comment, responded_at: new Date().toISOString() })
      .eq('id', survey.id)
      .is('responded_at', null)
      .select('id')
      .maybeSingle();

    if (updateError || !updated) {
      return jsonResponse({ error: GENERIC_ERROR }, 404);
    }

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse({ error: 'Não foi possível concluir a solicitação.' }, 500);
  }
});
