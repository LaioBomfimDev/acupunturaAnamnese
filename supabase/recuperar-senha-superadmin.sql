-- ============================================================
-- Recuperação de senha do SuperAdm (lockout, e-mail fictício não
-- recebe recuperação, e o painel do app recusa resetar a própria
-- senha do SuperAdm de propósito — ver super-admin-reset-password).
--
-- Não mexe em profiles, patients nem em nenhuma outra tabela — só o
-- hash de senha em auth.users de UMA linha.
-- ============================================================


-- ============================================================
-- PARTE 1 — CONFIRMAÇÃO (só leitura, roda sozinho, sem risco)
-- Confira que aparece EXATAMENTE 1 linha e que é você mesmo antes
-- de seguir pra Parte 2.
-- ============================================================

SELECT id, email, username, full_name, is_active, must_change_password
FROM public.profiles
WHERE role = 'super_admin';


-- ============================================================
-- PARTE 2 — TROCA DE SENHA
-- Troque 'SUA_SENHA_NOVA_AQUI' pela senha que você quer usar
-- ANTES de rodar. Rode como uma execução separada da Parte 1.
-- ============================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count FROM public.profiles WHERE role = 'super_admin';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Esperado exatamente 1 super_admin, encontrado %. Abortando por segurança.', v_count;
  END IF;
END $$;

UPDATE auth.users
SET encrypted_password = crypt('SUA_SENHA_NOVA_AQUI', gen_salt('bf')),
    updated_at = now()
WHERE id = (SELECT id FROM public.profiles WHERE role = 'super_admin' LIMIT 1);

-- Garante que não sobrou nenhum estado de "senha temporária" pendente
-- de troca por causa de alguma tentativa anterior.
UPDATE public.profiles
SET must_change_password = false,
    password_changed_at = now(),
    temporary_password_set_at = NULL
WHERE role = 'super_admin';

-- Depois de rodar: tente logar com o identificador que apareceu na
-- Parte 1 (email OU username, o que o seu login usar) + a senha nova.
