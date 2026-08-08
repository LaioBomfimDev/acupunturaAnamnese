-- ==========================================================
-- get_shared_session passa a enxergar TODAS as disciplinas
-- (07/08/2026)
--
-- PROBLEMA CORRIGIDO
-- A versão de 20260709 filtrava `record_type = 'full_session'`, que é
-- a sessão de Acupuntura. Compartilhar um paciente a partir de
-- Psicologia (psi_anamnese), Fisioterapia (fisio_anamnese) ou Nutrição
-- (nutri_anamnese) autorizava o colega, mas devolvia ZERO linhas: o
-- botão "Ver compartilhado" abria vazio. A autorização e a auditoria
-- funcionavam; o conteúdo nunca chegava.
--
-- CORREÇÃO E ENDURECIMENTO
-- Agora a função devolve os registros da(s) disciplina(s) de ORIGEM dos
-- compartilhamentos ativos para o chamador — e só delas. Isso conserta
-- o buraco e ao mesmo tempo FECHA um vazamento que a versão antiga
-- teria se apenas removêssemos o filtro: um encaminhamento
-- psicologia → fisioterapia não pode expor a sessão de acupuntura do
-- mesmo paciente. Quem compartilha escolhe a disciplina de origem;
-- é isso que o colega vê.
--
-- Dono do paciente e adm/SuperAdm da clínica seguem vendo tudo — já
-- veem por outras vias e o objetivo aqui é não regredir.
--
-- A coluna `discipline` volta no resultado: o cliente precisa saber de
-- qual disciplina é cada registro para escolher como exibir.
--
-- LIMITE HONESTO (inalterado): os escopos (resumo/anamnese/dores/...)
-- filtram a VISUALIZAÇÃO e servem a consentimento e auditoria. O banco
-- autoriza no nível do registro da disciplina, não faceta a faceta.
--
-- Migração aditiva e idempotente. Escrita clínica continua dona-somente.
-- ==========================================================

-- A assinatura de retorno mudou (ganhou `discipline`), então o CREATE OR
-- REPLACE não basta: é preciso derrubar a versão anterior.
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

  -- Dono do paciente: acesso pleno (já tem pela via dona-somente).
  IF EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id AND p.therapist_id = v_uid) THEN
    v_full_access := TRUE;
  -- Adm/SuperAdm da mesma clínica: acesso pleno.
  ELSIF (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
        AND v_patient_clinic IS NOT NULL
        AND v_patient_clinic = public.user_clinic_id(v_uid) THEN
    v_full_access := TRUE;
  END IF;

  IF NOT v_full_access THEN
    -- Disciplinas de ORIGEM dos compartilhamentos ativos endereçados a
    -- alguma disciplina do chamador. Vazio = sem acesso.
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
