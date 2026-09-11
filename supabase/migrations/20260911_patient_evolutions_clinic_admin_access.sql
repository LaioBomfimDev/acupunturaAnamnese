-- ==========================================================
-- Ficha do paciente (ClinicPatientProfile) mostra "Evolução" para
-- QUALQUER paciente da clínica, aberta por clinic_admin/super_admin.
-- Porém list_patient_evolutions (20260903_patient_evolutions.sql)
-- checava só posse (patients.therapist_id = v_uid) — sem a exceção de
-- admin que a policy RLS de SELECT da própria tabela já previa
-- (patient_evolutions_select). Como a leitura é sempre via RPC
-- SECURITY DEFINER (bypassa RLS), essa exceção nunca chegava a valer:
-- a ficha ficava mostrando "sem evoluções" para qualquer paciente que
-- o admin não fosse o dono, sem indicar que era um bloqueio de acesso.
--
-- Migração aditiva (não reescreve 20260903_patient_evolutions.sql —
-- migrations aplicadas não se editam, ver padrão em
-- 20260910_neuropsicologia_discipline.sql). Mesmo padrão de
-- full_access já usado em get_patient_audit_log e get_shared_session
-- (20260723_clinical_data_hardening.sql): dono OU (admin da clínica
-- do paciente). Sem alteração de escrita — insert_patient_evolution
-- continua exigindo posse; quem registra evolução continua sendo só
-- quem atende o paciente.
--
-- Compartilhamento entre disciplinas (record_shares) para esta tabela
-- fica de fora deste ajuste — get_shared_session/filter_shared_session
-- só leem o JSON legado (clinical_records tipo full_session), nunca
-- patient_evolutions; estender o escopo "evolucao" do compartilhamento
-- pra esta tabela é um trabalho maior, à parte.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.list_patient_evolutions(
  p_patient_id UUID,
  p_discipline TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  discipline TEXT,
  appointment_id UUID,
  attendance_status TEXT,
  atendimento_em TIMESTAMPTZ,
  conteudo TEXT,
  registrado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_evolutions$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_patient_owner UUID;
  v_patient_clinic UUID;
  v_full_access BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.therapist_id, p.clinic_id
  INTO v_patient_owner, v_patient_clinic
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  v_full_access := (
    v_patient_owner = v_uid
    OR (
      (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
      AND v_patient_clinic IS NOT NULL
      AND v_patient_clinic = public.user_clinic_id(v_uid)
    )
  );

  IF NOT v_full_access THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  -- Sem filtro adicional por pe.therapist_id: quem chegou até aqui já
  -- provou posse do paciente ou papel de admin da mesma clínica — o
  -- limite correto é o paciente, não quem escreveu cada linha.
  RETURN QUERY
  SELECT
    pe.id,
    pe.discipline,
    pe.appointment_id,
    pe.attendance_status,
    pe.atendimento_em,
    extensions.pgp_sym_decrypt(pe.conteudo_encrypted, v_key)::TEXT,
    pe.registrado_em,
    pe.created_at,
    pe.updated_at
  FROM public.patient_evolutions pe
  WHERE pe.patient_id = p_patient_id
    AND (p_discipline IS NULL OR pe.discipline = p_discipline)
  ORDER BY pe.atendimento_em ASC, pe.created_at ASC;
END;
$list_patient_evolutions$;

REVOKE ALL ON FUNCTION public.list_patient_evolutions(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_evolutions(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.list_patient_evolutions(uuid,text)') IS NOT NULL AS rpc_atualizada,
  pg_catalog.pg_get_functiondef('public.list_patient_evolutions(uuid,text)'::regprocedure) ILIKE '%is_clinic_admin%'
    AS admin_bypass_presente;
