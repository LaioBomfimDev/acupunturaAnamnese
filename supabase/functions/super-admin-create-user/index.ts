import {
  assertEdgeAccess,
  assertSuperAdmin,
  createCorsContext,
  createServiceClient,
  getCallerProfile,
  normalizeEmail,
  normalizeUsername,
  validateStrongPassword,
  validateUsername,
  writeAuditLog,
} from '../_shared/security.ts';
import { enforceEdgeRateLimit } from '../_shared/rateLimit.ts';
import { readClinicalJsonBody } from '../_shared/clinicalPayload.ts';
import {
  createCorrelationId,
  logOperationalEvent,
} from '../_shared/observability.ts';

const ALLOWED_PROFESSIONS = new Set([
  'acupunturista',
  'fisioterapeuta',
  'terapeuta_ocupacional',
  'psicologo',
  'psiquiatra',
  'medico',
  'nutricionista',
  'enfermeiro',
  'fonoaudiologo',
  'dentista',
  'outro',
]);

const ALLOWED_ROLES = new Set(['therapist', 'knowledge_reviewer']);

// Disciplinas válidas para a coluna profiles.disciplines. Quando o SuperAdm
// escolhe explicitamente (ex.: revisora só de psicologia), a coluna vence o
// fallback por profissão de resolveUserDisciplines (que sempre injeta acupuntura).
const DISCIPLINE_IDS = new Set(['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function cleanText(value: unknown) {
  return String(value || '').trim();
}

Deno.serve(async (req) => {
  const correlationId = createCorrelationId(
    req.headers.get('x-correlation-id'),
  );
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
      return jsonResponse({ error: caller.error }, caller.status);
    }

    const access = assertEdgeAccess(caller.profile, caller.claims);
    if (!access.allowed) return jsonResponse({ error: access.error }, access.status);
    if (!assertSuperAdmin(caller.profile)) {
      return jsonResponse({ error: 'Apenas SuperAdm ativo pode criar usuários.' }, 403);
    }

    const rateLimitResponse = await enforceEdgeRateLimit({
      supabaseAdmin,
      subjectId: caller.user.id,
      functionName: 'super-admin-create-user',
      jsonResponse,
    });
    if (rateLimitResponse) return rateLimitResponse;

    const body = await readClinicalJsonBody(req, 4_096).catch(() => ({}));
    const email = normalizeEmail(body.email);
    const username = normalizeUsername(body.username, email);
    const fullName = cleanText(body.fullName);
    const profession = cleanText(body.profession);
    const role = ALLOWED_ROLES.has(cleanText(body.role)) ? cleanText(body.role) : 'therapist';
    const clinicId = cleanText(body.clinicId);
    const disciplines = Array.isArray(body.disciplines)
      ? [...new Set(body.disciplines.map((d: unknown) => cleanText(d)).filter((d: string) => DISCIPLINE_IDS.has(d)))]
      : [];
    const temporaryPassword = String(body.temporaryPassword || '');
    const confirmTemporaryPassword = String(body.confirmTemporaryPassword || '');

    if (!fullName || fullName.length < 3) {
      return jsonResponse({ error: 'Informe o nome completo do profissional.' }, 400);
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: 'Informe um e-mail válido.' }, 400);
    }

    if (!validateUsername(username)) {
      return jsonResponse({ error: 'Login deve ter 3 a 40 caracteres: letras, números, ponto, hífen ou sublinhado.' }, 400);
    }

    if (temporaryPassword !== confirmTemporaryPassword) {
      return jsonResponse({ error: 'A confirmação da senha temporária não confere.' }, 400);
    }

    const passwordProblems = validateStrongPassword(temporaryPassword, [
      email,
      username,
      fullName,
    ]);
    if (passwordProblems.length > 0) {
      return jsonResponse({ error: passwordProblems[0] }, 400);
    }

    if (!ALLOWED_PROFESSIONS.has(profession)) {
      return jsonResponse({ error: 'Selecione uma profissão válida.' }, 400);
    }

    if (clinicId && !UUID_RE.test(clinicId)) {
      return jsonResponse({ error: 'Clínica inválida.' }, 400);
    }

    let clinic: { id: string; name: string } | null = null;
    if (clinicId) {
      const { data: clinicData, error: clinicError } = await supabaseAdmin
        .from('clinics')
        .select('id,name')
        .eq('id', clinicId)
        .maybeSingle();

      if (clinicError) throw clinicError;
      if (!clinicData) {
        return jsonResponse({ error: 'Clínica não encontrada.' }, 400);
      }
      clinic = {
        id: String(clinicData.id),
        name: String(clinicData.name || ''),
      };
    }

    const duplicateEmail = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (duplicateEmail.error) throw duplicateEmail.error;
    if (duplicateEmail.data) {
      return jsonResponse({ error: 'Já existe usuário com este e-mail.' }, 409);
    }

    const duplicateUsername = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (duplicateUsername.error) throw duplicateUsername.error;
    if (duplicateUsername.data) {
      return jsonResponse({ error: 'Já existe usuário com este login.' }, 409);
    }

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        username,
        role,
      },
      app_metadata: {
        role,
      },
    });

    if (createError || !created.user) {
      return jsonResponse({ error: 'Não foi possível criar o usuário.' }, 400);
    }

    const profilePayload = {
      id: created.user.id,
      email,
      username,
      full_name: fullName,
      role,
      phone: cleanText(body.phone) || null,
      document: cleanText(body.document) || null,
      professional_registration: cleanText(body.professionalRegistration) || null,
      specialty: cleanText(body.specialty) || null,
      profession,
      disciplines: disciplines.length ? disciplines : null,
      clinic_name: clinic?.name || cleanText(body.clinicName) || null,
      clinic_id: clinic?.id || null,
      notes: cleanText(body.notes) || null,
      is_active: true,
      must_change_password: true,
      password_changed_at: null,
      temporary_password_set_at: new Date().toISOString(),
      created_by: caller.user.id,
    };

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select('id,email,username,full_name,role,profession,professional_registration,specialty,clinic_name,clinic_id,is_active,must_change_password,created_at')
      .single();

    if (profileError) {
      const { error: cleanupError } =
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if (cleanupError) {
        logOperationalEvent('error', 'auth_orphan_cleanup_failed', {
          correlationId,
          operation: 'super_admin_create_user',
          reason: 'compensation_failed',
          errorCode: cleanupError.code,
        });
        return jsonResponse({
          error: 'O perfil não foi criado e a limpeza automática ficou pendente.',
          referencia: correlationId,
        }, 500);
      }
      return jsonResponse({
        error: 'O perfil não foi criado; a conta de autenticação foi revertida.',
        referencia: correlationId,
      }, 500);
    }

    await writeAuditLog(supabaseAdmin, {
      actorId: caller.user.id,
      targetId: created.user.id,
      action: 'therapist_created',
      details: {
        username,
        email,
        role,
        profession: profilePayload.profession,
        professional_registration: profilePayload.professional_registration,
        specialty: profilePayload.specialty,
        clinic_name: profilePayload.clinic_name,
        clinic_id: profilePayload.clinic_id,
      },
    });

    return jsonResponse({ user: profile }, 201);
  } catch {
    logOperationalEvent('error', 'super_admin_create_user_failed', {
      correlationId,
      operation: 'super_admin_create_user',
      reason: 'unexpected_failure',
    });
    return jsonResponse({
      error: 'Não foi possível concluir a criação do usuário.',
      referencia: correlationId,
    }, 500);
  }
});
