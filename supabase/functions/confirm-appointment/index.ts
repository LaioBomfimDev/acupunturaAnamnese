import { createCorsContext, createServiceClient } from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';

// ============================================================
// Confirmação de agendamento — link pessoal, sem WhatsApp pago
//
// Segunda function pública do projeto (a primeira foi
// satisfaction-survey — mesmo desenho, mesma justificativa: ver
// comentário na migration 20260901_appointment_confirmation_token.sql).
// Quem manda a mensagem é o WhatsApp de verdade do profissional; esta
// function só valida o token e grava confirmed_at, exatamente o mesmo
// campo que a confirmação manual (appointmentService.confirmAppointment)
// já usa hoje.
//
// POST sempre. `confirm` ausente = consulta (a tela monta o resumo);
// `confirm: true` = grava a confirmação. Diferente da pesquisa de
// satisfação, reabrir o link depois de confirmado NÃO é erro — mostra o
// mesmo resumo, já confirmado, porque revisitar o próprio agendamento é
// uso legítimo (a pesquisa é resposta única; aqui é consulta de estado).
// ============================================================

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = 'Link inválido ou agendamento não encontrado.';
const CONFIRMABLE_STATUSES = ['scheduled', 'ready'];

function isValidToken(token) {
  return typeof token === 'string' && UUID_PATTERN.test(token);
}

// appointments tem DUAS foreign keys pra profiles (professional_id E
// created_by) — profiles(full_name) sem hint fica ambíguo pro PostgREST
// e a query falha inteira. profiles!professional_id desambigua.
const APPOINTMENT_PUBLIC_SELECT =
  'id,starts_at,room,discipline,status,confirmed_at,clinic_id,' +
  'patients(name),profiles!professional_id(full_name),clinics(name)';

async function loadAppointment(supabaseAdmin, token) {
  const { data, error } = await supabaseAdmin
    .from('appointments')
    .select(APPOINTMENT_PUBLIC_SELECT)
    .eq('confirmation_token', token)
    .maybeSingle();

  if (error || !data) return null;
  return data;
}

function toPublicView(appointment) {
  return {
    patientName: appointment.patients?.name || null,
    professionalName: appointment.profiles?.full_name || null,
    clinicName: appointment.clinics?.name || null,
    discipline: appointment.discipline,
    startsAt: appointment.starts_at,
    room: appointment.room,
    confirmed: Boolean(appointment.confirmed_at),
    confirmable: CONFIRMABLE_STATUSES.includes(appointment.status),
  };
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

    // Rate limit por token — mesmo raciocínio de satisfaction-survey:
    // o espaço de busca do UUID já é inviável de adivinhar, isto é só
    // limite de abuso repetido sobre o mesmo link.
    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: token,
      functionName: 'confirm-appointment',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const wantsConfirm = body.confirm === true;

    if (!wantsConfirm) {
      const appointment = await loadAppointment(supabaseAdmin, token);
      if (!appointment) return jsonResponse({ error: GENERIC_ERROR }, 404);
      return jsonResponse(toPublicView(appointment));
    }

    const appointment = await loadAppointment(supabaseAdmin, token);
    if (!appointment) return jsonResponse({ error: GENERIC_ERROR }, 404);

    // Já confirmado: idempotente, devolve o estado atual sem regravar.
    if (appointment.confirmed_at) {
      return jsonResponse(toPublicView(appointment));
    }

    if (!CONFIRMABLE_STATUSES.includes(appointment.status)) {
      return jsonResponse({
        error: 'Este agendamento não está mais disponível para confirmação.',
      }, 409);
    }

    // WHERE por status de novo: escrita condicional, não "ler depois
    // escrever" — se o status mudou entre a leitura e aqui, a atualização
    // não casa nenhuma linha em vez de confirmar algo já cancelado.
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('appointments')
      .update({ confirmed_at: new Date().toISOString() })
      .eq('id', appointment.id)
      .in('status', CONFIRMABLE_STATUSES)
      .select(APPOINTMENT_PUBLIC_SELECT)
      .maybeSingle();

    if (updateError || !updated) {
      return jsonResponse({
        error: 'Este agendamento não está mais disponível para confirmação.',
      }, 409);
    }

    return jsonResponse(toPublicView(updated));
  } catch {
    return jsonResponse({ error: 'Não foi possível concluir a solicitação.' }, 500);
  }
});
