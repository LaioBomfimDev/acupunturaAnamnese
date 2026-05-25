import {
  assertSuperAdmin,
  corsHeaders,
  createServiceClient,
  getCallerProfile,
  jsonResponse,
  normalizeEmail,
  normalizeUsername,
  validateUsername,
  writeAuditLog,
} from '../_shared/security.ts';

Deno.serve(async (req) => {
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

    if (!assertSuperAdmin(caller.profile)) {
      return jsonResponse({ error: 'Apenas SuperAdm ativo pode criar usuários.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body.email);
    const username = normalizeUsername(body.username, email);
    const fullName = String(body.fullName || '').trim();
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

    if (temporaryPassword.length < 6) {
      return jsonResponse({ error: 'A senha temporária precisa ter pelo menos 6 caracteres.' }, 400);
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
        role: 'therapist',
      },
      app_metadata: {
        role: 'therapist',
      },
    });

    if (createError || !created.user) {
      return jsonResponse({ error: createError?.message || 'Não foi possível criar o usuário.' }, 400);
    }

    const profilePayload = {
      id: created.user.id,
      email,
      username,
      full_name: fullName,
      role: 'therapist',
      phone: String(body.phone || '').trim() || null,
      document: String(body.document || '').trim() || null,
      professional_registration: String(body.professionalRegistration || '').trim() || null,
      specialty: String(body.specialty || '').trim() || null,
      clinic_name: String(body.clinicName || '').trim() || null,
      notes: String(body.notes || '').trim() || null,
      is_active: true,
      must_change_password: true,
      password_changed_at: null,
      created_by: caller.user.id,
    };

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select('id,email,username,full_name,role,is_active,must_change_password,created_at')
      .single();

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      return jsonResponse({ error: profileError.message }, 500);
    }

    await writeAuditLog(supabaseAdmin, {
      actorId: caller.user.id,
      targetId: created.user.id,
      action: 'therapist_created',
      details: {
        username,
        email,
        professional_registration: profilePayload.professional_registration,
        specialty: profilePayload.specialty,
        clinic_name: profilePayload.clinic_name,
      },
    });

    return jsonResponse({ user: profile }, 201);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Erro inesperado.' }, 500);
  }
});
