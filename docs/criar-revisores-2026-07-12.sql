-- ============================================================
-- Ajusta os 2 acessos de curadoria (rodar DEPOIS de adicionar os
-- usuários em Authentication → Add user, com estes e-mails exatos):
--
--   curadoriaacup@sistema.com
--   revisorapsi@sistema.com
--
-- A senha é definida na própria tela "Add user" (marque "Auto Confirm User").
-- Não coloque senha aqui — este arquivo é versionado em repo público.
-- O gatilho on_auth_user_created cria o perfil básico; este script define
-- papel, disciplina e TIRA a troca de senha obrigatória. Idempotente.
-- ============================================================

-- CuradoriaAcup → revisora de ACUPUNTURA
INSERT INTO public.profiles
  (id, email, username, full_name, role, disciplines, is_active, must_change_password, password_changed_at)
SELECT id, email, 'curadoriaacup', 'Curadoria Acupuntura', 'knowledge_reviewer',
       ARRAY['acupuntura']::text[], true, false, now()
FROM auth.users WHERE email = 'curadoriaacup@sistema.com'
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  disciplines = EXCLUDED.disciplines,
  is_active = EXCLUDED.is_active,
  must_change_password = EXCLUDED.must_change_password,
  password_changed_at = EXCLUDED.password_changed_at;

-- RevisoraPsi → revisora de PSICOLOGIA
INSERT INTO public.profiles
  (id, email, username, full_name, role, disciplines, is_active, must_change_password, password_changed_at)
SELECT id, email, 'revisorapsi', 'Revisora Psicologia', 'knowledge_reviewer',
       ARRAY['psicologia']::text[], true, false, now()
FROM auth.users WHERE email = 'revisorapsi@sistema.com'
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  full_name = EXCLUDED.full_name,
  role = EXCLUDED.role,
  disciplines = EXCLUDED.disciplines,
  is_active = EXCLUDED.is_active,
  must_change_password = EXCLUDED.must_change_password,
  password_changed_at = EXCLUDED.password_changed_at;

-- Conferência:
SELECT username, role, disciplines, must_change_password
FROM public.profiles
WHERE email IN ('curadoriaacup@sistema.com', 'revisorapsi@sistema.com');
