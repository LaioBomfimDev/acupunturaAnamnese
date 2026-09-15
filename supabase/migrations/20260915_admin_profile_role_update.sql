-- ----------------------------------------------------------------------
-- admin_set_profile_role: única forma segura de mudar o tipo de acesso
-- (Profissional/Admin de clínica) de um profissional já cadastrado.
-- Até aqui o tipo de acesso só era definido uma vez, no cadastro inicial
-- (edge function super-admin-create-user) — não havia como promover
-- depois. Mesma trava de admin_update_profile: só SuperAdm ativo chama,
-- e cadastro de SuperAdm não é alterável por aqui.
-- ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_profile_role(
  p_profile_id UUID,
  p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_set_profile_role$
DECLARE
  v_actor_id UUID;
  v_previous public.profiles%ROWTYPE;
BEGIN
  v_actor_id := auth.uid();

  IF NOT public.is_super_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: apenas SuperAdm ativo pode alterar tipo de acesso.'
      USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('therapist', 'clinic_admin') THEN
    RAISE EXCEPTION 'Tipo de acesso inválido.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
    INTO v_previous
  FROM public.profiles
  WHERE id = p_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.'
      USING ERRCODE = '02000';
  END IF;

  IF v_previous.role = 'super_admin' THEN
    RAISE EXCEPTION 'Cadastro de SuperAdm não pode ser alterado por esta função.'
      USING ERRCODE = '42501';
  END IF;

  IF v_previous.role = p_role THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET role = p_role,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_profile_id;

  INSERT INTO public.admin_audit_logs (actor_id, target_id, action, details)
  VALUES (
    v_actor_id,
    p_profile_id,
    'profile_role_updated',
    jsonb_build_object('previous_role', v_previous.role, 'new_role', p_role)
  );
END;
$admin_set_profile_role$;

REVOKE ALL ON FUNCTION public.admin_set_profile_role(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_profile_role(UUID, TEXT) TO authenticated;

-- Correção pontual: esta conta já era tratada como administração da
-- Clínica Reability no dia a dia, mas ficou gravada como 'therapist'
-- porque não existia como editar o tipo de acesso depois do cadastro
-- inicial (é o mesmo caso que motivou a função acima).
UPDATE public.profiles
SET role = 'clinic_admin',
    updated_at = timezone('utc'::text, now())
WHERE username = 'deniseneves'
  AND role = 'therapist';
