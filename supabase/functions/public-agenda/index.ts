import { createCorsContext, createServiceClient } from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';

// ============================================================
// Agenda pública — link somente leitura, sem WhatsApp pago
//
// Terceira function pública do projeto (mesmo desenho de
// satisfaction-survey/confirm-appointment): quem gera o link é staff
// autenticado, pelo ShareAgendaPanel; quem ABRE o link não tem conta
// nenhuma. Esta function valida o token e devolve só o que a agenda
// pública tem permissão de mostrar — nome, horário e status. NUNCA
// disciplina/modalidade/observação (docs/plano-agenda-gestao-clinica.md,
// "agenda pública não mostra detalhes sensíveis").
//
// Fronteira de dia fixa em America/Sao_Paulo (UTC-3, sem horário de
// verão desde 2019): mesma suposição de fuso único que o resto do
// projeto já faz no cliente (toDayKey local) — aqui só precisa existir
// no servidor porque este é o primeiro código de agenda que roda fora
// do navegador do profissional.
// ============================================================

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GENERIC_ERROR = 'Link inválido, expirado ou revogado.';

const STATUS_LABEL: Record<string, string> = {
  scheduled: 'Agendado',
  ready: 'Confirmado na recepção',
  attended: 'Atendido',
  cancelled: 'Cancelado',
  no_show: 'Não compareceu',
  excused: 'Faltou com aviso',
};

function isValidToken(token: unknown) {
  return typeof token === 'string' && UUID_PATTERN.test(token);
}

function dayRangeSaoPaulo(day: string) {
  // 'YYYY-MM-DD' local (America/Sao_Paulo) -> limites em UTC.
  const start = new Date(`${day}T03:00:00.000Z`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

async function loadLink(supabaseAdmin: ReturnType<typeof createServiceClient>, token: string) {
  const { data, error } = await supabaseAdmin
    .from('agenda_share_links')
    .select('id,clinic_id,day,disciplines,professional_id,expires_at,clinics(name)')
    .eq('token', token)
    .maybeSingle();

  if (error || !data) return null;
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
    const token = String((body as Record<string, unknown>).token || '');

    if (!isValidToken(token)) {
      return jsonResponse({ error: GENERIC_ERROR }, 404);
    }

    // Rate limit por token — mesmo raciocínio das outras duas functions
    // públicas: o espaço de busca do UUID já é inviável de adivinhar,
    // isto é só limite de abuso repetido sobre o mesmo link.
    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: token,
      functionName: 'public-agenda',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const link = await loadLink(supabaseAdmin, token);
    if (!link) return jsonResponse({ error: GENERIC_ERROR }, 404);

    const { start, end } = dayRangeSaoPaulo(link.day);

    let query = supabaseAdmin
      .from('appointments')
      .select('starts_at,status,discipline,professional_id,patients(name)')
      .eq('clinic_id', link.clinic_id)
      .eq('kind', 'appointment')
      .gte('starts_at', start.toISOString())
      .lt('starts_at', end.toISOString())
      .order('starts_at', { ascending: true });

    if (link.professional_id) query = query.eq('professional_id', link.professional_id);
    if (Array.isArray(link.disciplines) && link.disciplines.length > 0) {
      query = query.in('discipline', link.disciplines);
    }

    const { data: appointments, error: listError } = await query;
    if (listError) return jsonResponse({ error: GENERIC_ERROR }, 500);

    const items = (appointments || []).map((item) => ({
      time: item.starts_at,
      name: (item as { patients?: { name?: string } }).patients?.name || 'Paciente',
      status: item.status,
      statusLabel: STATUS_LABEL[item.status as string] || item.status,
    }));

    return jsonResponse({
      clinicName: (link as { clinics?: { name?: string } }).clinics?.name || null,
      day: link.day,
      items,
    });
  } catch {
    return jsonResponse({ error: 'Não foi possível concluir a solicitação.' }, 500);
  }
});
