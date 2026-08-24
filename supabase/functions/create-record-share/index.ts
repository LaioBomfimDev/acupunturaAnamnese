import {
  assertEdgeAccess,
  createAnonClient,
  createCorsContext,
  createServiceClient,
  getCallerProfile,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';
import {
  createCorrelationId,
  logOperationalEvent,
} from '../_shared/observability.ts';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DISCIPLINES = new Set([
  'acupuntura',
  'fisioterapia',
  'psicologia',
  'nutricao',
]);
const SHARE_SCOPES = new Set([
  'cadastro',
  'resumo',
  'anamnese',
  'dores',
  'evolucao',
  'relatorio',
]);

function cleanText(value: unknown) {
  return String(value || '').trim();
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

  const correlationId = createCorrelationId(
    req.headers.get('x-correlation-id'),
  );

  try {
    const supabaseAdmin = createServiceClient();
    const caller = await getCallerProfile(req, supabaseAdmin);
    if ('error' in caller) {
      return jsonResponse({ error: caller.error }, caller.status);
    }

    const access = assertEdgeAccess(caller.profile, caller.claims);
    if (!access.allowed) {
      return jsonResponse({ error: access.error }, access.status);
    }

    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: caller.user.id,
      functionName: 'create-record-share',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 4_096).catch(() => ({}));
    const patientId = cleanText(body.patientId);
    const fromDiscipline = cleanText(body.fromDiscipline);
    const toDiscipline = cleanText(body.toDiscipline);
    const toUserId = cleanText(body.toUserId);
    const password = String(body.password || '');
    const note = cleanText(body.note);
    const idempotencyKey = cleanText(body.idempotencyKey);
    const scopes = Array.isArray(body.scopes)
      ? [...new Set(
        body.scopes
          .map((scope: unknown) => cleanText(scope))
          .filter((scope: string) => SHARE_SCOPES.has(scope)),
      )]
      : [];

    if (
      !UUID_PATTERN.test(patientId)
      || !UUID_PATTERN.test(idempotencyKey)
      || !UUID_PATTERN.test(toUserId)
    ) {
      return jsonResponse({ error: 'Paciente, destinatário ou idempotência inválidos.' }, 400);
    }
    if (
      !DISCIPLINES.has(fromDiscipline)
      || !DISCIPLINES.has(toDiscipline)
      || fromDiscipline === toDiscipline
    ) {
      return jsonResponse({ error: 'Disciplinas de origem/destino inválidas.' }, 400);
    }
    if (!password || password.length > 256) {
      return jsonResponse({ error: 'Confirme sua senha para enviar.' }, 400);
    }
    if (note.length > 1000) {
      return jsonResponse({ error: 'A nota pode ter no máximo 1000 caracteres.' }, 400);
    }

    // Cliente efêmero: a sessão criada pela verificação nunca é devolvida,
    // persistida ou aplicada ao navegador. Assim uma sessão aal2 existente
    // não é substituída por uma nova sessão aal1.
    const verifier = createAnonClient();
    const { data: verified, error: passwordError } =
      await verifier.auth.signInWithPassword({
        email: caller.user.email || caller.profile.email,
        password,
      });

    if (
      passwordError
      || !verified.user
      || verified.user.id !== caller.user.id
    ) {
      return jsonResponse({
        error: 'Não foi possível confirmar a credencial para este envio.',
      }, 403);
    }

    const { data, error } = await supabaseAdmin.rpc(
      'create_record_share_after_reauthentication',
      {
        p_actor_id: caller.user.id,
        p_actor_aal: caller.claims.aal,
        p_patient_id: patientId,
        p_from_discipline: fromDiscipline,
        p_to_discipline: toDiscipline,
        p_to_user_id: toUserId,
        p_shared_scopes: scopes,
        p_note: note || null,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (error) {
      logOperationalEvent('warn', 'record_share_create_rejected', {
        correlationId,
        operation: 'record_share_create',
        reason: 'database_rejected',
        errorCode: error.code,
      });
      return jsonResponse({
        error: 'O compartilhamento não foi criado. Revise os vínculos e tente novamente.',
        referencia: correlationId,
      }, 400);
    }

    const share = Array.isArray(data) ? data[0] : data;
    if (!share?.id) {
      throw new Error('missing_share_result');
    }

    return jsonResponse({ share });
  } catch {
    logOperationalEvent('error', 'record_share_create_failed', {
      correlationId,
      operation: 'record_share_create',
      reason: 'unexpected_failure',
    });
    return jsonResponse({
      error: 'Não foi possível concluir o compartilhamento.',
      referencia: correlationId,
    }, 500);
  }
});
