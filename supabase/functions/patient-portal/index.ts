import { createCorsContext, createServiceClient } from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';
import { createCorrelationId, logOperationalEvent } from '../_shared/observability.ts';
import { computeProgress, missingRequired, sanitizeAnswers } from '../_shared/patientFormAnswers.ts';
import { getServerInstrument } from '../_shared/clinicalInstruments.ts';
import { buildPortalPayload, buildPortalQuestions } from '../_shared/instrumentPortal.ts';

// ============================================================
// Área do Paciente — formulários que o paciente responde online
//
// Function pública (sem JWT), como a pesquisa de satisfação: o paciente
// não tem conta no Supabase Auth. Desenho em
// supabase/migrations/20261006_patient_portal.sql:
//   * entrada = código de acesso + data de nascimento (portal_login);
//     8 datas erradas bloqueiam o código até a administração liberar;
//   * a sessão é um token aleatório que só o aparelho do paciente
//     guarda; o banco guarda o SHA-256;
//   * a sessão só enxerga formulários pendentes do próprio paciente e
//     as respostas desses formulários — nunca prontuário, nunca o que
//     já foi enviado;
//   * respostas passam por sanitizeAnswers (mesma regra da tela) antes
//     de gravar cifradas, com revisão (CAS) e chave de idempotência.
//
// Erro de entrada é sempre a mesma frase (código inexistente, desativado
// ou data errada), para a tela não virar oráculo de quais códigos
// existem. Só o bloqueio é dito, porque ele só acontece depois de 8
// tentativas no mesmo código.
// ============================================================

const LOGIN_ERROR = 'Código ou data de nascimento não conferem.';
const LOCKED_ERROR = 'Acesso bloqueado depois de muitas tentativas. Fale com a clínica para liberar.';
const SESSION_ERROR = 'Sua sessão terminou. Entre de novo para continuar.';
const NOT_AVAILABLE_ERROR = 'Este formulário não está mais disponível.';
const SESSION_TTL_SECONDS = 4 * 60 * 60;
const MAX_BODY_BYTES = 160_000;

const CODE_PATTERN = /^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const OPEN_STATUSES = ['pending', 'in_progress'];
const ASSIGNMENT_LIST_COLUMNS = 'id,form_title,form_description,due_date,status,progress,created_at,kind';
// Escala da clínica (kind 'instrument', etapa 2 das escalas): perguntas e
// nota saem da definição oficial (_shared/clinicalInstruments.ts), nunca
// da cópia guardada no envio nem do que o aparelho mandar.
const INSTRUMENT_UNAVAILABLE_ERROR = 'Esta escala não está disponível. Fale com a clínica.';

async function sha256Hex(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

// O rate limit persistente pede UUID como sujeito: deriva um estável e
// opaco (não dá para voltar ao código/IP/token a partir dele).
async function opaqueSubject(namespace: string, value: string) {
  const hex = await sha256Hex(`sistema-acup:patient-portal:${namespace}:${value}`);
  const bytes = hex.slice(0, 32).match(/../g)!.map(pair => parseInt(pair, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const out = bytes.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

function newSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || '';
}

function isRealDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type Admin = ReturnType<typeof createServiceClient>;
type Json = (body: unknown, status?: number, headers?: Record<string, string>) => Response;
type Session = { accessId: string; patientId: string; clinicId: string; tokenHash: string };

// "Já enviados" mostra só nome e data dos últimos 30 dias: confirma ao
// paciente que chegou, sem reabrir as respostas.
const SENT_WINDOW_DAYS = 30;

async function loadHome(supabaseAdmin: Admin, session: Session) {
  const sentSince = new Date(Date.now() - SENT_WINDOW_DAYS * 86_400_000).toISOString();
  const [{ data: clinic }, { data: patient }, { data: forms, error }, { data: sent }] = await Promise.all([
    supabaseAdmin.from('clinics').select('name,brand_color').eq('id', session.clinicId).maybeSingle(),
    supabaseAdmin.from('patients').select('name,nome_social').eq('id', session.patientId).maybeSingle(),
    supabaseAdmin
      .from('patient_form_assignments')
      .select(ASSIGNMENT_LIST_COLUMNS)
      .eq('patient_id', session.patientId)
      .eq('clinic_id', session.clinicId)
      .in('status', OPEN_STATUSES)
      .order('created_at', { ascending: true })
      .limit(50),
    supabaseAdmin
      .from('patient_form_assignments')
      .select('id,form_title,submitted_at')
      .eq('patient_id', session.patientId)
      .eq('clinic_id', session.clinicId)
      .eq('status', 'submitted')
      .gte('submitted_at', sentSince)
      .order('submitted_at', { ascending: false })
      .limit(20),
  ]);
  if (error) throw new Error('assignments_unavailable');

  const name = String(patient?.nome_social || patient?.name || '').trim();
  return {
    clinicName: clinic?.name || null,
    clinicColor: clinic?.brand_color || null,
    patientFirstName: name.split(/\s+/)[0] || null,
    forms: (forms || []).map(item => ({
      id: item.id,
      title: item.form_title,
      description: item.form_description,
      dueDate: item.due_date,
      status: item.status,
      progress: item.progress,
      kind: item.kind === 'instrument' ? 'instrument' : 'form',
    })),
    sent: (sent || []).map(item => ({ id: item.id, title: item.form_title, submittedAt: item.submitted_at })),
  };
}

async function loadOpenAssignment(supabaseAdmin: Admin, session: Session, assignmentId: string) {
  const { data } = await supabaseAdmin
    .from('patient_form_assignments')
    .select('id,form_title,form_description,form_questions,due_date,status,kind,instrument_id,instrument_version')
    .eq('id', assignmentId)
    .eq('patient_id', session.patientId)
    .eq('clinic_id', session.clinicId)
    .in('status', OPEN_STATUSES)
    .maybeSingle();
  return data || null;
}

type OpenAssignment = NonNullable<Awaited<ReturnType<typeof loadOpenAssignment>>>;

/** Perguntas do envio: escala pela definição oficial; formulário pela cópia do envio. */
function assignmentContent(assignment: OpenAssignment) {
  if (assignment.kind !== 'instrument') {
    return { instrument: null, questions: assignment.form_questions };
  }
  const instrument = getServerInstrument(String(assignment.instrument_id || ''), Number(assignment.instrument_version));
  return { instrument, questions: instrument ? buildPortalQuestions(instrument) : null };
}

async function resolveSession(supabaseAdmin: Admin, token: string): Promise<Session | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabaseAdmin.rpc('portal_resolve_session', { p_token_hash: tokenHash });
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row?.result_access_id) return null;
  return {
    accessId: row.result_access_id,
    patientId: row.result_patient_id,
    clinicId: row.result_clinic_id,
    tokenHash,
  };
}

async function handleLogin(req: Request, supabaseAdmin: Admin, body: Record<string, unknown>, jsonResponse: Json) {
  const code = String(body.code || '').trim().toUpperCase();
  const birthDate = String(body.birthDate || '').trim();
  if (!CODE_PATTERN.test(code) || !isRealDate(birthDate)) {
    return jsonResponse({ error: LOGIN_ERROR }, 401);
  }

  // Dois limites: por aparelho/rede (tentar muitos códigos) e por código
  // (tentar muitas datas — o bloqueio em 8 erros vem depois disso).
  const ip = clientIp(req);
  if (ip) {
    const ipLimited = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: await opaqueSubject('ip', ip),
      functionName: 'patient-portal-ip',
      jsonResponse,
    });
    if (ipLimited) return ipLimited;
  }
  const codeLimited = await enforceEdgeRateLimit({
    supabaseAdmin,
    subjectId: await opaqueSubject('code', code),
    functionName: 'patient-portal-login',
    jsonResponse,
  });
  if (codeLimited) return codeLimited;

  const token = newSessionToken();
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabaseAdmin.rpc('portal_login', {
    p_code: code,
    p_birth_date: birthDate,
    p_token_hash: tokenHash,
    p_ttl_seconds: SESSION_TTL_SECONDS,
  });
  if (error) throw new Error('login_unavailable');

  const row = Array.isArray(data) ? data[0] : null;
  if (row?.result_status === 'locked') return jsonResponse({ error: LOCKED_ERROR, locked: true }, 423);
  if (row?.result_status !== 'ok') return jsonResponse({ error: LOGIN_ERROR }, 401);

  const session = await resolveSession(supabaseAdmin, token);
  if (!session) return jsonResponse({ error: LOGIN_ERROR }, 401);

  return jsonResponse({
    session: token,
    expiresInSeconds: SESSION_TTL_SECONDS,
    ...(await loadHome(supabaseAdmin, session)),
  });
}

async function handleSave(
  supabaseAdmin: Admin,
  session: Session,
  body: Record<string, unknown>,
  jsonResponse: Json,
  submit: boolean,
) {
  const assignmentId = String(body.assignmentId || '');
  const saveId = String(body.saveId || '');
  const revision = Number(body.revision);
  if (!UUID_PATTERN.test(assignmentId) || !UUID_PATTERN.test(saveId) || !Number.isInteger(revision) || revision < 0) {
    return jsonResponse({ error: 'Pedido inválido.' }, 400);
  }

  const assignment = await loadOpenAssignment(supabaseAdmin, session, assignmentId);
  if (!assignment) return jsonResponse({ error: NOT_AVAILABLE_ERROR, closed: true }, 409);

  const { instrument, questions } = assignmentContent(assignment);
  if (!questions) return jsonResponse({ error: INSTRUMENT_UNAVAILABLE_ERROR, closed: true }, 409);
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

  // Escala: a nota é calculada aqui, com a definição oficial, e vai junto
  // com o envio para o banco gravar as duas coisas na mesma transação.
  let instrumentPayload: ReturnType<typeof buildPortalPayload> | null = null;
  if (submit && instrument) {
    try {
      instrumentPayload = buildPortalPayload(instrument, answers);
    } catch {
      return jsonResponse({ error: 'Responda todas as perguntas da escala para enviar.' }, 422);
    }
  }

  const { data, error } = await supabaseAdmin.rpc('portal_save_answers', {
    p_access_id: session.accessId,
    p_assignment_id: assignmentId,
    p_answers: answers,
    p_progress: progress,
    p_expected_revision: revision,
    p_save_id: saveId,
    p_submit: submit,
    p_instrument_payload: instrumentPayload,
  });
  if (error) throw new Error('save_unavailable');

  const row = Array.isArray(data) ? data[0] : null;
  switch (row?.result_status) {
    case 'ok':
      return jsonResponse({ revision: row.result_revision, status: row.result_assignment_status, progress });
    case 'conflict':
      return jsonResponse({
        error: 'Estas respostas foram alteradas em outro aparelho. Abra o formulário de novo para continuar de onde parou.',
        conflict: true,
        revision: row.result_revision,
      }, 409);
    case 'closed':
    case 'not_found':
      return jsonResponse({ error: NOT_AVAILABLE_ERROR, closed: true }, 409);
    case 'invalid_instrument':
      return jsonResponse({ error: INSTRUMENT_UNAVAILABLE_ERROR }, 422);
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

    if (action === 'login') {
      return await handleLogin(req, supabaseAdmin, body, jsonResponse);
    }

    const session = await resolveSession(supabaseAdmin, String(body.session || ''));
    if (!session) return jsonResponse({ error: SESSION_ERROR, expired: true }, 401);

    if (action === 'logout') {
      await supabaseAdmin.from('patient_portal_sessions').delete().eq('token_hash', session.tokenHash);
      return jsonResponse({ ok: true });
    }

    const writing = action === 'save' || action === 'submit';
    const limited = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: await opaqueSubject('session', session.tokenHash),
      functionName: writing ? 'patient-portal-save' : 'patient-portal-read',
      jsonResponse,
    });
    if (limited) return limited;

    if (action === 'home') {
      return jsonResponse(await loadHome(supabaseAdmin, session));
    }

    if (action === 'open') {
      const assignmentId = String(body.assignmentId || '');
      if (!UUID_PATTERN.test(assignmentId)) return jsonResponse({ error: 'Pedido inválido.' }, 400);
      const assignment = await loadOpenAssignment(supabaseAdmin, session, assignmentId);
      if (!assignment) return jsonResponse({ error: NOT_AVAILABLE_ERROR, closed: true }, 409);
      const { questions } = assignmentContent(assignment);
      if (!questions) return jsonResponse({ error: INSTRUMENT_UNAVAILABLE_ERROR, closed: true }, 409);

      const { data, error } = await supabaseAdmin.rpc('portal_read_answers', {
        p_access_id: session.accessId,
        p_assignment_id: assignmentId,
      });
      if (error) throw new Error('read_unavailable');
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return jsonResponse({ error: NOT_AVAILABLE_ERROR, closed: true }, 409);

      return jsonResponse({
        id: assignment.id,
        title: assignment.form_title,
        description: assignment.form_description,
        dueDate: assignment.due_date,
        kind: assignment.kind === 'instrument' ? 'instrument' : 'form',
        questions,
        answers: row.result_answers || {},
        revision: row.result_revision,
      });
    }

    if (writing) {
      return await handleSave(supabaseAdmin, session, body, jsonResponse, action === 'submit');
    }

    return jsonResponse({ error: 'Pedido inválido.' }, 400);
  } catch {
    logOperationalEvent('error', 'patient_portal_failed', {
      correlationId,
      operation: 'patient_portal',
      action: /^[a-z]{1,16}$/.test(action) ? action : undefined,
    });
    return jsonResponse({ error: 'Não foi possível concluir agora. Tente de novo em instantes.' }, 500);
  }
});
