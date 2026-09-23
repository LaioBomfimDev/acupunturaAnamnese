-- ==========================================================
-- Novo tipo de acesso: recepcionista
--
-- Pedido do Laio (2026-09-22): recepção cuida de agenda (marcar,
-- remarcar, cancelar, compartilhar) e do CADASTRO do paciente (nome,
-- contato, endereço...), igual a qualquer outro membro ativo da
-- clínica — nada de novo aí, `can_manage_agenda` e a política de
-- patients aberta à clínica (20260809_appointments,
-- 20260910_patient_registration_open_clinic) já tratam "qualquer membro
-- ativo" como o corte certo, não um papel específico.
--
-- O que FALTAVA pra isso funcionar sem também abrir dado clínico:
--
-- 1. `can_access_clinical_data` é usada em dois papéis bem diferentes
--    hoje: (a) gate de dado clínico de verdade (clinical_records,
--    evoluções, RPCs de prontuário) e (b) gate de "é gente da casa,
--    pode ver o cadastro/a clínica" (patients_select_clinic_member,
--    patients_update_clinic_member, insert de patients, leitura da
--    própria linha em `clinics` — nome, logo, cor, usado até no papel
--    timbrado). Recepção precisa do (b) sem o (a).
--
--    Em vez de colocar 'receptionist' dentro de can_access_clinical_data
--    (o que abriria de tabela clínica pra RPC de prontuário sem querer,
--    contrariando a decisão de não tocar em dado clínico), criamos
--    can_access_clinic_registry = can_access_clinical_data OR
--    is_receptionist, e trocamos SÓ as policies do grupo (b) pra usar o
--    gate novo. Tudo que continua em can_access_clinical_data sozinho
--    (clinical_records, patient_evolutions, tongue photos, relatório,
--    IA, curadoria) segue fechado pra recepção.
--
-- 2. profiles_role_check precisa aceitar o valor novo.
--
-- 3. Recepção não atende: disciplines sempre vazio (nunca herda a
--    disciplina padrão 'acupuntura' que o trigger de normalização
--    aplicaria a um NULL) e has_agenda sempre false (não aparece como
--    opção de profissional no formulário de agendamento).
-- ==========================================================

-- ----------------------------------------------------------
-- 1. profiles_role_check aceita 'receptionist'
-- ----------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;
END $$;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('therapist', 'clinic_admin', 'super_admin', 'knowledge_reviewer', 'receptionist'));

-- ----------------------------------------------------------
-- 2. is_receptionist + can_access_clinic_registry
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_receptionist(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $is_receptionist$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'receptionist'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$is_receptionist$;

REVOKE ALL ON FUNCTION public.is_receptionist(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_receptionist(UUID) TO authenticated;

-- "Registro da clínica": cadastro/contato do paciente e dados da
-- própria instituição (nome, logo, cor) — NUNCA prontuário. Superconjunto
-- de can_access_clinical_data, só pra este grupo de policies.
CREATE OR REPLACE FUNCTION public.can_access_clinic_registry(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_access_clinic_registry$
  SELECT public.can_access_clinical_data(p_user_id) OR public.is_receptionist(p_user_id);
$can_access_clinic_registry$;

REVOKE ALL ON FUNCTION public.can_access_clinic_registry(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_clinic_registry(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 3. clinics: leitura da própria instituição (nome/logo/cor)
-- ----------------------------------------------------------
DROP POLICY IF EXISTS clinics_select_assigned_or_super_admin ON public.clinics;
CREATE POLICY clinics_select_assigned_or_super_admin ON public.clinics
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.clinic_id = clinics.id
        AND public.can_access_clinic_registry(auth.uid())
    )
  );

-- ----------------------------------------------------------
-- 4. patients: cadastro/contato aberto à recepção também
--    (clinical_records e demais tabelas clínicas NÃO mudam aqui)
-- ----------------------------------------------------------
DROP POLICY IF EXISTS patients_select_clinic_member ON public.patients;
CREATE POLICY patients_select_clinic_member
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinic_registry(auth.uid())
    AND clinic_id IS NOT NULL
    AND public.can_manage_agenda(clinic_id, auth.uid())
  );

DROP POLICY IF EXISTS patients_update_clinic_member ON public.patients;
CREATE POLICY patients_update_clinic_member
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_clinic_registry(auth.uid())
    AND clinic_id IS NOT NULL
    AND public.can_manage_agenda(clinic_id, auth.uid())
  )
  WITH CHECK (
    public.can_access_clinic_registry(auth.uid())
    AND clinic_id IS NOT NULL
    AND public.can_manage_agenda(clinic_id, auth.uid())
  );

DROP POLICY IF EXISTS "Patients insert own after password change" ON public.patients;
CREATE POLICY "Patients insert own after password change"
ON public.patients
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = therapist_id AND public.can_access_clinic_registry(auth.uid()));

-- ----------------------------------------------------------
-- 5. Recepção nunca herda disciplina nem entra na agenda como
--    "profissional que atende" — mesmo se profession vier preenchida
--    por engano no cadastro.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_profile_disciplines_not_null()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $normalize_profile_disciplines_not_null$
DECLARE
  v_profession_discipline TEXT;
BEGIN
  IF NEW.role = 'receptionist' THEN
    NEW.disciplines := ARRAY[]::TEXT[];
    NEW.has_agenda := FALSE;
    RETURN NEW;
  END IF;

  IF NEW.disciplines IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_profession_discipline := CASE NEW.profession
    WHEN 'acupunturista' THEN 'acupuntura'
    WHEN 'fisioterapeuta' THEN 'fisioterapia'
    WHEN 'terapeuta_ocupacional' THEN 'fisioterapia'
    WHEN 'psicologo' THEN 'psicologia'
    WHEN 'nutricionista' THEN 'nutricao'
    ELSE NULL
  END;

  IF NEW.role = 'knowledge_reviewer' AND v_profession_discipline IS NOT NULL THEN
    NEW.disciplines := ARRAY[v_profession_discipline]::TEXT[];
  ELSE
    NEW.disciplines := ARRAY['acupuntura']::TEXT[];
    IF v_profession_discipline IS NOT NULL
       AND v_profession_discipline <> 'acupuntura' THEN
      NEW.disciplines := NEW.disciplines || v_profession_discipline;
    END IF;
  END IF;

  RETURN NEW;
END;
$normalize_profile_disciplines_not_null$;

-- Recria o trigger incluindo has_agenda entre as colunas observadas,
-- pra cobrir também o caso de alguém trocar o role de um perfil
-- existente para 'receptionist' depois de criado.
DROP TRIGGER IF EXISTS profiles_normalize_disciplines_not_null ON public.profiles;
CREATE TRIGGER profiles_normalize_disciplines_not_null
  BEFORE INSERT OR UPDATE OF disciplines, profession, role
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_disciplines_not_null();

-- set_member_has_agenda (20260922_professional_agenda_flag.sql): trava
-- de segurança pro caminho que muda has_agenda SEM tocar em role/
-- disciplines/profession (e portanto não dispara o trigger acima) —
-- ninguém liga a recepção como "atende" por essa RPC.
CREATE OR REPLACE FUNCTION public.set_member_has_agenda(p_profile_id UUID, p_has_agenda BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_clinic UUID := public.user_clinic_id(auth.uid());
  v_target public.profiles%ROWTYPE;
BEGIN
  IF NOT (public.is_clinic_admin(v_actor_id) OR public.is_super_admin(v_actor_id)) THEN
    RAISE EXCEPTION 'Acesso negado: só administrador da clínica pode definir quem atende.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuário não encontrado.' USING ERRCODE = '02000';
  END IF;

  IF NOT public.is_super_admin(v_actor_id) AND v_target.clinic_id IS DISTINCT FROM v_actor_clinic THEN
    RAISE EXCEPTION 'Só é possível alterar profissionais da própria instituição.'
      USING ERRCODE = '42501';
  END IF;

  IF p_has_agenda AND v_target.role = 'receptionist' THEN
    RAISE EXCEPTION 'Recepção não atende paciente: não pode ficar disponível na agenda como profissional.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET has_agenda = p_has_agenda,
      updated_at = timezone('utc'::text, now())
  WHERE id = p_profile_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_has_agenda(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_member_has_agenda(UUID, BOOLEAN) TO authenticated;

-- Corrige quem já exista com role='receptionist' sem passar pelo trigger
-- (idempotente; hoje não deve afetar nenhuma linha).
UPDATE public.profiles
SET disciplines = ARRAY[]::TEXT[], has_agenda = FALSE
WHERE role = 'receptionist'
  AND (disciplines IS DISTINCT FROM ARRAY[]::TEXT[] OR has_agenda IS DISTINCT FROM FALSE);

-- ----------------------------------------------------------
-- 6. admin_set_profile_role (20260915_admin_profile_role_update.sql):
--    só aceitava promover/rebaixar entre 'therapist' e 'clinic_admin'.
--    Sem este ajuste, o SuperAdm conseguiria CRIAR uma recepção (edge
--    function) mas não conseguiria mudar o tipo de acesso de alguém já
--    cadastrado para 'receptionist' pela tela de edição.
-- ----------------------------------------------------------
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

  IF p_role NOT IN ('therapist', 'clinic_admin', 'receptionist') THEN
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

  -- role está entre as colunas observadas por
  -- profiles_normalize_disciplines_not_null: virar 'receptionist' por
  -- aqui já dispara o mesmo corte de disciplines/has_agenda da criação.
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

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.is_receptionist(uuid)') IS NOT NULL AS is_receptionist_criada,
  to_regprocedure('public.can_access_clinic_registry(uuid)') IS NOT NULL AS registry_criada,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND pg_get_constraintdef(oid) LIKE '%receptionist%'
  ) AS role_check_atualizado,
  pg_get_functiondef('public.admin_set_profile_role(uuid,text)'::regprocedure)
    LIKE '%receptionist%' AS admin_set_profile_role_atualizado,
  NOT has_function_privilege('anon', 'public.is_receptionist(uuid)', 'EXECUTE') AS anon_bloqueado;
