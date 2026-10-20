import {
  assertEdgeAccess,
  createCorsContext,
  createServiceClient,
  getCallerProfile,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';
import { createCorrelationId, logOperationalEvent } from '../_shared/observability.ts';
import { createMeetingToken, ensureRoom, readDailyConfig, roomNameFor } from '../_shared/dailyRooms.ts';
import {
  firstName,
  isOnlineRoomAppointment,
  latestConsents,
  needsTeleconsent,
  ONLINE_CONSENT_TERM_VERSIONS,
  ONLINE_ROOM_STATUSES,
  ONLINE_ROOM_WINDOWS,
  roomWindow,
  roomWindowState,
  shortName,
} from '../_shared/onlineConsultation.ts';

// ============================================================
// Consulta online (Psicologia) — sala de vídeo do Daily
//
// Dois lados na mesma function:
//   * paciente, sem conta: entra pelo link de confirmação do agendamento
//     (confirmation_token, o mesmo que já vai no WhatsApp). Antes da
//     primeira consulta responde o termo de atendimento online (e diz se
//     autoriza gravar); depois recebe um convite para a sala, só na janela
//     do horário (15 min antes até 1 h depois do fim).
//   * quem atende, logado: JWT validado aqui (verify_jwt = false no
//     config.toml por causa do lado do paciente), com os mesmos bloqueios
//     de conta suspensa, senha temporária e dois fatores das outras
//     functions. Só a profissional do agendamento entra.
// Nada de vídeo, áudio ou texto passa pelo banco. Ver
// supabase/migrations/20261020_online_consultation.sql.
// ============================================================

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = 'Link inválido ou consulta não encontrada.';
const ROOM_EXTRA_MINUTES = 180;

const APPOINTMENT_SELECT =
  'id,clinic_id,patient_id,professional_id,kind,modality,discipline,status,starts_at,ends_at,' +
  'patients(name),profiles!professional_id(full_name),' +
  'clinics(name,brand_color,confirmation_link_color,agenda_settings)';

type Admin = ReturnType<typeof createServiceClient>;
type Json = (body: unknown, status?: number, headers?: Record<string, string>) => Response;
type Appointment = Record<string, any>;

async function sha256Hex(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}

// O rate limit persistente pede UUID como sujeito: deriva um estável e
// opaco (não dá para voltar ao token/IP a partir dele).
async function opaqueSubject(namespace: string, value: string) {
  const hex = await sha256Hex(`sistema-acup:online-consultation:${namespace}:${value}`);
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

async function loadConsents(supabaseAdmin: Admin, patientId: string) {
  const { data, error } = await supabaseAdmin
    .from('patient_consents')
    .select('kind,decision,term_version,decided_at')
    .eq('patient_id', patientId)
    .order('decided_at', { ascending: false })
    .limit(50);
  if (error) throw new Error('consents_unavailable');
  return latestConsents(data || []);
}

function iso(ms: number) {
  return new Date(ms).toISOString();
}

/**
 * Estado da sala para quem pergunta. 'unavailable' cobre tudo que não é
 * consulta online pelo sistema (presencial, outra área, sala desligada):
 * a tela diz o mesmo nos três casos.
 */
function appointmentState(appointment: Appointment, who: 'patient' | 'professional', now = Date.now()) {
  if (!isOnlineRoomAppointment(appointment, appointment.clinics?.agenda_settings)) return 'unavailable';
  if (!ONLINE_ROOM_STATUSES.includes(String(appointment.status))) return 'closed';
  return roomWindowState(roomWindow(appointment.starts_at, appointment.ends_at, who), now);
}

function windowFields(appointment: Appointment, who: 'patient' | 'professional') {
  const window = roomWindow(appointment.starts_at, appointment.ends_at, who);
  return {
    startsAt: appointment.starts_at,
    endsAt: appointment.ends_at,
    opensAt: window ? iso(window.opensAt) : null,
    closesAt: window ? iso(window.closesAt) : null,
  };
}

async function issueInvite(
  appointment: Appointment,
  who: 'patient' | 'professional',
  userName: string,
) {
  const config = readDailyConfig();
  if (!config) return { error: 'not_configured' as const };
  const window = roomWindow(appointment.starts_at, appointment.ends_at, who)!;
  const roomName = await roomNameFor(config, appointment.id);
  const end = Date.parse(appointment.ends_at) || Date.parse(appointment.starts_at);
  const roomUrl = await ensureRoom(config, roomName, end + ROOM_EXTRA_MINUTES * 60_000);
  const token = await createMeetingToken(config, {
    roomName,
    userName,
    isOwner: who === 'professional',
    notBeforeMs: window.opensAt,
    expiresAtMs: window.closesAt,
  });
  return { roomUrl, token };
}

// ---------------------------------------------------------------
// Paciente (link do agendamento)
// ---------------------------------------------------------------

async function loadByToken(supabaseAdmin: Admin, token: string) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('confirmation_token', token)
    .maybeSingle();
  if (error) throw new Error('appointment_unavailable');
  return data as Appointment | null;
}

function patientView(appointment: Appointment, consents: ReturnType<typeof latestConsents>, state: string) {
  return {
    state,
    clinicName: appointment.clinics?.name || null,
    // Cor que a instituição escolheu para o link de confirmação (é por ele
    // que o paciente chega); sem escolha, a cor da instituição.
    clinicColor: appointment.clinics?.confirmation_link_color || appointment.clinics?.brand_color || null,
    professionalName: shortName(appointment.profiles?.full_name),
    ...windowFields(appointment, 'patient'),
    needsConsent: needsTeleconsent(consents),
    recordingDecision: consents.gravacao_sessao?.decision || null,
    termVersions: ONLINE_CONSENT_TERM_VERSIONS,
  };
}

async function handlePatient(req: Request, supabaseAdmin: Admin, body: Record<string, unknown>, jsonResponse: Json) {
  const action = String(body.action || '');
  const token = String(body.token || '');
  if (!UUID_PATTERN.test(token)) return jsonResponse({ state: 'invalid', message: GENERIC_ERROR });

  // Dois limites: por aparelho/rede (tentar muitos links) e por link.
  const ip = clientIp(req);
  if (ip) {
    const ipLimited = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: await opaqueSubject('ip', ip),
      functionName: 'online-consultation-ip',
      jsonResponse,
    });
    if (ipLimited) return ipLimited;
  }
  const limited = await enforceEdgeRateLimit({
    supabaseAdmin,
    subjectId: await opaqueSubject('token', token),
    functionName: 'online-consultation',
    jsonResponse,
  });
  if (limited) return limited;

  const appointment = await loadByToken(supabaseAdmin, token);
  if (!appointment || !appointment.patient_id) return jsonResponse({ state: 'invalid', message: GENERIC_ERROR });

  const state = appointmentState(appointment, 'patient');
  if (state === 'unavailable' || state === 'closed') {
    return jsonResponse({
      state,
      clinicName: appointment.clinics?.name || null,
      clinicColor: appointment.clinics?.confirmation_link_color || appointment.clinics?.brand_color || null,
    });
  }

  if (action === 'open') {
    const consents = await loadConsents(supabaseAdmin, appointment.patient_id);
    return jsonResponse(patientView(appointment, consents, state));
  }

  if (action === 'consent') {
    if (body.teleatendimento !== true) {
      return jsonResponse({ error: 'Para a consulta online, é preciso concordar com o atendimento online.' }, 422);
    }
    const recording = String(body.gravacao || '');
    if (recording !== 'accepted' && recording !== 'declined') {
      return jsonResponse({ error: 'Escolha se autoriza ou não gravar a sessão.' }, 422);
    }
    const base = {
      clinic_id: appointment.clinic_id,
      patient_id: appointment.patient_id,
      appointment_id: appointment.id,
      source: 'link_paciente',
      recorded_by: null,
    };
    const { error } = await supabaseAdmin.from('patient_consents').insert([
      { ...base, kind: 'teleatendimento', decision: 'accepted', term_version: ONLINE_CONSENT_TERM_VERSIONS.teleatendimento },
      { ...base, kind: 'gravacao_sessao', decision: recording, term_version: ONLINE_CONSENT_TERM_VERSIONS.gravacao_sessao },
    ]);
    if (error) throw new Error('consent_save_failed');
    const consents = await loadConsents(supabaseAdmin, appointment.patient_id);
    return jsonResponse(patientView(appointment, consents, state));
  }

  if (action === 'join') {
    const consents = await loadConsents(supabaseAdmin, appointment.patient_id);
    if (needsTeleconsent(consents)) {
      return jsonResponse({ error: 'Antes de entrar, responda o termo do atendimento online.', needsConsent: true }, 409);
    }
    if (state !== 'open') {
      return jsonResponse({ error: state === 'early' ? 'A sala ainda não abriu.' : 'O horário desta consulta já passou.', state }, 409);
    }
    const invite = await issueInvite(appointment, 'patient', firstName(appointment.patients?.name));
    if ('error' in invite) return jsonResponse({ error: 'A sala online ainda não foi configurada pela clínica.' }, 503);
    return jsonResponse(invite);
  }

  return jsonResponse({ error: 'Pedido inválido.' }, 400);
}

// ---------------------------------------------------------------
// Quem atende (logado)
// ---------------------------------------------------------------

async function handleProfessional(req: Request, supabaseAdmin: Admin, body: Record<string, unknown>, jsonResponse: Json) {
  const caller = await getCallerProfile(req, supabaseAdmin);
  if ('error' in caller) return jsonResponse({ error: caller.error }, caller.status);
  const access = assertEdgeAccess(caller.profile, caller.claims);
  if (!access.allowed) return jsonResponse({ error: access.error }, access.status);

  const limited = await enforceEdgeRateLimit({
    supabaseAdmin,
    subjectId: caller.user.id,
    functionName: 'online-consultation-staff',
    jsonResponse,
  });
  if (limited) return limited;

  const appointmentId = String(body.appointmentId || '');
  if (!UUID_PATTERN.test(appointmentId)) return jsonResponse({ error: 'Atendimento inválido.' }, 400);

  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) throw new Error('appointment_unavailable');
  const appointment = data as Appointment | null;

  // Só a profissional do atendimento, na própria clínica. Mesma resposta
  // para "não existe" e "não é seu": não confirma que o atendimento existe.
  if (
    !appointment
    || appointment.professional_id !== caller.user.id
    || appointment.clinic_id !== caller.profile.clinic_id
    || !appointment.patient_id
  ) {
    return jsonResponse({ error: 'Esta sala é de quem atende o paciente.' }, 403);
  }

  const state = appointmentState(appointment, 'professional');
  const action = String(body.action || '');

  if (action === 'staff_open') {
    const consents = state === 'unavailable' ? latestConsents([]) : await loadConsents(supabaseAdmin, appointment.patient_id);
    return jsonResponse({
      state,
      status: appointment.status,
      patient: { id: appointment.patient_id, name: appointment.patients?.name || 'Paciente' },
      clinicName: appointment.clinics?.name || null,
      ...windowFields(appointment, 'professional'),
      consents,
      needsConsent: needsTeleconsent(consents),
      termVersions: ONLINE_CONSENT_TERM_VERSIONS,
      windows: ONLINE_ROOM_WINDOWS,
    });
  }

  if (action === 'staff_join') {
    if (state !== 'open') {
      return jsonResponse({
        error: state === 'early'
          ? 'A sala ainda não abriu.'
          : state === 'ended'
            ? 'O horário desta consulta já passou.'
            : 'Este atendimento não tem sala online.',
        state,
      }, 409);
    }
    const invite = await issueInvite(appointment, 'professional', shortName(caller.profile.full_name));
    if ('error' in invite) {
      return jsonResponse({ error: 'A sala online ainda não foi configurada: falta a chave do Daily no servidor.' }, 503);
    }
    return jsonResponse(invite);
  }

  return jsonResponse({ error: 'Pedido inválido.' }, 400);
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
    const body = await readClinicalJsonBody(req, 4_096).catch(() => null);
    if (!body) return jsonResponse({ error: 'Pedido inválido.' }, 400);
    action = String(body.action || '');

    if (action === 'staff_open' || action === 'staff_join') {
      return await handleProfessional(req, supabaseAdmin, body, jsonResponse);
    }
    if (action === 'open' || action === 'consent' || action === 'join') {
      return await handlePatient(req, supabaseAdmin, body, jsonResponse);
    }
    return jsonResponse({ error: 'Pedido inválido.' }, 400);
  } catch {
    logOperationalEvent('error', 'online_consultation_failed', {
      correlationId,
      operation: 'online_consultation',
      action: /^[a-z_]{1,16}$/.test(action) ? action : undefined,
    });
    return jsonResponse({ error: 'Não foi possível concluir agora. Tente de novo em instantes.' }, 500);
  }
});
