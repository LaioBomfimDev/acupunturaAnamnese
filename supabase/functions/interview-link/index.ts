import { createCorsContext, createServiceClient } from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';
import { createCorrelationId, logOperationalEvent } from '../_shared/observability.ts';
import { computeProgress, missingRequired, sanitizeAnswers } from '../_shared/patientFormAnswers.ts';

// ============================================================
// Link de entrevista — quem convive com o paciente responde online
//
// Function pública (sem JWT), como a Área do Paciente: quem responde
// (mãe, cônjuge, professora) não tem conta. Desenho em
// supabase/migrations/20261016_clinical_interviews.sql:
//   * o link leva um token aleatório de 192 bits; o banco acha a
//     entrevista pelo SHA-256 dele, nunca pelo token;
//   * o link enxerga só aquela entrevista: o primeiro nome do paciente,
//     o nome da clínica e as respostas que ele mesmo já salvou. Depois de
//     enviada, cancelada ou vencida, não mostra mais nada;
//   * respostas passam por sanitizeAnswers (mesma regra da tela) antes
//     de gravar cifradas, com revisão (CAS) e chave de idempotência.
// ============================================================

const MAX_BODY_BYTES = 160_000;
const TOKEN_PATTERN = /^[0-9a-f]{48}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STATE_MESSAGES: Record<string, string> = {
  not_found: 'Este link não existe ou foi copiado pela metade. Confira com a clínica.',
  cancelled: 'Este link foi cancelado pela clínica.',
  expired: 'O prazo deste link terminou. Peça um link novo à clínica.',
  submitted: 'Esta entrevista já foi respondida. Obrigado!',
};

async function sha256Hex(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

// O rate limit persistente pede UUID como sujeito: deriva um estável e
// opaco (não dá para voltar ao token/IP a partir dele).
async function opaqueSubject(namespace: string, value: string) {
  const hex = await sha256Hex(`sistema-acup:interview-link:${namespace}:${value}`);
  const bytes = hex.slice(0, 32).match(/../g)!.map(pair => parseInt(pair, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const out = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || '';
}

type Admin = ReturnType<typeof createServiceClient>;
type Json = (body: unknown, status?: number, headers?: Record<string, string>) => Response;

async function openLink(supabaseAdmin: Admin, tokenHash: string, withAnswers: boolean) {
  const { data, error } = await supabaseAdmin.rpc('interview_link_open', {
    p_token_hash: tokenHash,
    p_with_answers: withAnswers,
  });
  if (error) throw new Error('open_unavailable');
  const row = Array.isArray(data) ? data[0] : null;
  return row || { result_status: 'not_found' };
}

function closedResponse(jsonResponse: Json, row: Record<string, unknown>) {
  const state = String(row.result_status || 'not_found');
  return jsonResponse({
    state: state in STATE_MESSAGES ? state : 'not_found',
    message: STATE_MESSAGES[state] || STATE_MESSAGES.not_found,
    clinicName: row.result_clinic_name || null,
    clinicColor: row.result_clinic_color || null,
  });
}

async function handleSave(
  supabaseAdmin: Admin,
  tokenHash: string,
  body: Record<string, unknown>,
  jsonResponse: Json,
  submit: boolean,
) {
  const saveId = String(body.saveId || '');
  const revision = Number(body.revision);
  if (!UUID_PATTERN.test(saveId) || !Number.isInteger(revision) || revision < 0) {
    return jsonResponse({ error: 'Pedido inválido.' }, 400);
  }

  const link = await openLink(supabaseAdmin, tokenHash, false);
  if (link.result_status !== 'ok') {
    return jsonResponse({
      error: STATE_MESSAGES[String(link.result_status)] || STATE_MESSAGES.not_found,
      closed: true,
    }, 409);
  }

  const questions = link.result_questions;
  const answers = sanitizeAnswers(questions, body.answers);
  const progress = computeProgress(questions, answers);

  if (submit) {
    const missing = missingRequired(questions, answers);
    if (missing.length) {
      return jsonResponse({
        error: missing.length === 1
          ? 'Falta responder 1 pergunta obrigatória.'
          : `Faltam responder ${missing.length} perguntas obrigatórias.`,
        missing,
      }, 422);
    }
  }

  const { data, error } = await supabaseAdmin.rpc('interview_link_save', {
    p_token_hash: tokenHash,
    p_answers: answers,
    p_progress: progress,
    p_expected_revision: revision,
    p_save_id: saveId,
    p_submit: submit,
  });
  if (error) throw new Error('save_unavailable');

  const row = Array.isArray(data) ? data[0] : null;
  switch (row?.result_status) {
    case 'ok':
      return jsonResponse({ revision: row.result_revision, status: row.result_response_status, progress });
    case 'conflict':
      return jsonResponse({
        error: 'Estas respostas foram alteradas em outro aparelho. Abra o link de novo para continuar de onde parou.',
        conflict: true,
        revision: row.result_revision,
      }, 409);
    case 'expired':
      return jsonResponse({ error: STATE_MESSAGES.expired, closed: true }, 409);
    case 'closed':
    case 'not_found':
      return jsonResponse({ error: 'Esta entrevista não está mais disponível.', closed: true }, 409);
    default:
      return jsonResponse({ error: 'Não foi possível salvar. Tente de novo.' }, 400);
  }
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

  const correlationId = createCorrelationId();
  let action = '';

  try {
    const supabaseAdmin = createServiceClient();
    const body = await readClinicalJsonBody(req, MAX_BODY_BYTES).catch(() => null);
    if (!body) return jsonResponse({ error: 'Pedido inválido.' }, 400);
    action = String(body.action || '');

    const token = String(body.token || '').trim().toLowerCase();
    if (!TOKEN_PATTERN.test(token)) {
      return jsonResponse({ state: 'not_found', message: STATE_MESSAGES.not_found });
    }
    const tokenHash = await sha256Hex(token);

    if (action === 'open') {
      // Dois limites: por aparelho/rede (tentar muitos links) e por link.
      const ip = clientIp(req);
      if (ip) {
        const ipLimited = await enforceEdgeRateLimit({
          supabaseAdmin,
          subjectId: await opaqueSubject('ip', ip),
          functionName: 'interview-link-ip',
          jsonResponse,
        });
        if (ipLimited) return ipLimited;
      }
      const limited = await enforceEdgeRateLimit({
        supabaseAdmin,
        subjectId: await opaqueSubject('token', tokenHash),
        functionName: 'interview-link-read',
        jsonResponse,
      });
      if (limited) return limited;

      const row = await openLink(supabaseAdmin, tokenHash, true);
      if (row.result_status !== 'ok') return closedResponse(jsonResponse, row);
      return jsonResponse({
        state: 'ok',
        title: row.result_title,
        questions: row.result_questions,
        answers: row.result_answers || {},
        revision: row.result_revision,
        expiresAt: row.result_expires_at,
        patientFirstName: row.result_patient_first_name || null,
        clinicName: row.result_clinic_name || null,
        clinicColor: row.result_clinic_color || null,
      });
    }

    if (action === 'save' || action === 'submit') {
      const limited = await enforceEdgeRateLimit({
        supabaseAdmin,
        subjectId: await opaqueSubject('token', tokenHash),
        functionName: 'interview-link-save',
        jsonResponse,
      });
      if (limited) return limited;
      return await handleSave(supabaseAdmin, tokenHash, body, jsonResponse, action === 'submit');
    }

    return jsonResponse({ error: 'Pedido inválido.' }, 400);
  } catch {
    logOperationalEvent('error', 'interview_link_failed', {
      correlationId,
      operation: 'interview_link',
      action: /^[a-z]{1,16}$/.test(action) ? action : undefined,
    });
    return jsonResponse({ error: 'Não foi possível concluir agora. Tente de novo em instantes.' }, 500);
  }
});
