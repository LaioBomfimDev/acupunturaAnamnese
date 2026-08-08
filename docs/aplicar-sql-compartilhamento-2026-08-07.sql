-- ==========================================================
-- APLICAR NO SUPABASE — Compartilhamento multi-disciplina
-- Data: 07/08/2026
--
-- COMO APLICAR
--   1. Supabase → SQL Editor → New query
--   2. Cole este arquivo INTEIRO e execute
--   3. Confira o resultado da verificação no fim
--
-- O QUE ISTO CONSERTA
--   Compartilhar um paciente a partir de Psicologia, Fisioterapia ou
--   Nutrição autorizava o colega mas devolvia conteúdo VAZIO, porque a
--   função só lia o registro de Acupuntura ('full_session').
--
--   Junto vem um endurecimento: o colega passa a ver apenas os
--   registros da disciplina de ORIGEM do compartilhamento. Um
--   encaminhamento psicologia → fisioterapia não expõe a sessão de
--   acupuntura do mesmo paciente.
--
-- SEGURO DE REPETIR: é idempotente. Não apaga dado nenhum, não altera
-- tabela, só substitui uma função de leitura.
-- ==========================================================

DROP FUNCTION IF EXISTS public.get_shared_session(UUID);

CREATE OR REPLACE FUNCTION public.get_shared_session(p_patient_id UUID)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
  discipline TEXT,
  sensitive_data TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $get_shared_session$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_patient_clinic UUID;
  v_full_access BOOLEAN := FALSE;
  v_allowed_disciplines TEXT[];
BEGIN
  SELECT ac.value INTO v_key FROM public.app_config ac WHERE ac.key = 'encryption_key';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  SELECT p.clinic_id INTO v_patient_clinic FROM public.patients p WHERE p.id = p_patient_id;

  IF EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id AND p.therapist_id = v_uid) THEN
    v_full_access := TRUE;
  ELSIF (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
        AND v_patient_clinic IS NOT NULL
        AND v_patient_clinic = public.user_clinic_id(v_uid) THEN
    v_full_access := TRUE;
  END IF;

  IF NOT v_full_access THEN
    SELECT array_agg(DISTINCT s.from_discipline)
      INTO v_allowed_disciplines
      FROM public.record_shares s
     WHERE s.patient_id = p_patient_id
       AND s.revoked_at IS NULL
       AND s.to_discipline = ANY (public.user_disciplines(v_uid));

    IF v_allowed_disciplines IS NULL OR array_length(v_allowed_disciplines, 1) IS NULL THEN
      RAISE EXCEPTION 'Acesso negado: sem compartilhamento ativo para este paciente.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    cr.discipline,
    pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT AS sensitive_data,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND (v_full_access OR cr.discipline = ANY (v_allowed_disciplines))
  ORDER BY cr.updated_at DESC;
END;
$get_shared_session$;

REVOKE EXECUTE ON FUNCTION public.get_shared_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_shared_session(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ==========================================================
-- VERIFICAÇÃO — deve retornar UMA linha com ok = true
-- ==========================================================
SELECT
  p.proname AS funcao,
  -- A coluna `discipline` no retorno é a marca da versão nova.
  (pg_get_function_result(p.oid) LIKE '%discipline text%') AS retorna_disciplina,
  (prosecdef) AS security_definer,
  (pg_get_functiondef(p.oid) NOT LIKE '%full_session%') AS sem_filtro_antigo,
  (
    pg_get_function_result(p.oid) LIKE '%discipline text%'
    AND prosecdef
    AND pg_get_functiondef(p.oid) NOT LIKE '%full_session%'
  ) AS ok
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_shared_session';
