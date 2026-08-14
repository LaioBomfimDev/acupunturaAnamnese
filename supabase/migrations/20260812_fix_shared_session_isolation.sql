-- ==========================================================
-- Corrige regressão de isolamento em get_shared_session
-- (12/08/2026 — achado crítico da auditoria de segurança
-- docs/auditoria-seguranca-2026-08-11.md, item C1)
--
-- PROBLEMA
-- A migration 20260807_shared_session_multidisciplina.sql, ao consertar
-- o bug funcional de "abre vazio" fora da Acupuntura, removeu três
-- proteções que 20260723_clinical_data_hardening.sql havia introduzido
-- no mesmo `CREATE OR REPLACE`:
--   1. a checagem de que o paciente pertence à MESMA clínica do
--      chamador (sem isso, o compartilhamento vira acessível entre
--      clínicas diferentes — BOLA cross-tenant real, trocando só o
--      patient_id);
--   2. o filtro de record_shares também por clinic_id;
--   3. a leitura da chave de criptografia via Supabase Vault — voltou a
--      ler texto puro de app_config, tabela que a própria 20260723 já
--      havia esvaziado (`DELETE FROM app_config WHERE key =
--      'encryption_key'`) como parte do hardening.
--
-- CORREÇÃO
-- Restaura as três proteções acima, preservando a correção legítima de
-- 20260807 (devolver qualquer disciplina compartilhada, com a coluna
-- `discipline`, sem exigir record_type = 'full_session' — Psicologia
-- também usa psi_anamnese/psi_neuro_avaliacao).
--
-- LIMITE HONESTO (registrado, não escondido)
-- filter_shared_session_payload (20260723) sabe redigir por escopo só o
-- vocabulário de campos da Acupuntura (queixa/historia/dorLocal/...).
-- Para as demais disciplinas, cujo esquema de campos ainda muda por
-- disciplina/percurso (ver anamneseRegistry no frontend, em evolução),
-- não existe hoje uma tradução campo→escopo no banco. Esta migration
-- aplica a redação fina de 20260723 só para discipline='acupuntura' e
-- uma redação GROSSA (por seção — fields/selectedMap/riskNotes juntos,
-- evolucoes, relatorio) para as demais. É estritamente melhor que o
-- estado pós-20260807 (nenhuma redação: qualquer share ativo devolvia o
-- registro inteiro, ignorando os escopos escolhidos), mas ainda não
-- separa resumo/anamnese/dores entre si fora da Acupuntura.
-- Próximo passo: mover a configuração de campo→escopo de cada
-- disciplina para o banco (ou expor via RPC própria) para fechar esse
-- resíduo.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.filter_shared_session_payload_generic(
  p_payload JSONB,
  p_scopes TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $filter_shared_session_payload_generic$
DECLARE
  v_scopes TEXT[] := ARRAY(
    SELECT DISTINCT scope_id
    FROM unnest(COALESCE(p_scopes, ARRAY[]::TEXT[])) AS scope_id
    WHERE scope_id = ANY (
      ARRAY['cadastro', 'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio']::TEXT[]
    )
  );
  v_session JSONB := CASE
    WHEN jsonb_typeof(p_payload -> 'session') = 'object'
      THEN p_payload -> 'session'
    ELSE '{}'::JSONB
  END;
  v_out_session JSONB := '{}'::JSONB;
  v_has_clinical_scope BOOLEAN;
BEGIN
  v_has_clinical_scope := (
    'resumo' = ANY(v_scopes) OR 'anamnese' = ANY(v_scopes) OR 'dores' = ANY(v_scopes)
  );

  -- Percurso/status de validação não é dado clínico sensível; mantém
  -- para rotular a leitura mesmo sem escopo clínico concedido.
  IF v_session ? 'intakeProfile' THEN
    v_out_session := v_out_session || jsonb_build_object('intakeProfile', v_session -> 'intakeProfile');
  END IF;
  IF v_session ? 'contentStatus' THEN
    v_out_session := v_out_session || jsonb_build_object('contentStatus', v_session -> 'contentStatus');
  END IF;

  IF v_has_clinical_scope THEN
    v_out_session := v_out_session || jsonb_build_object(
      'fields', COALESCE(v_session -> 'fields', '{}'::JSONB),
      'selectedMap', COALESCE(v_session -> 'selectedMap', '{}'::JSONB),
      'contextModules', COALESCE(v_session -> 'contextModules', '[]'::JSONB),
      'riskNotes', v_session -> 'riskNotes'
    );
  END IF;

  IF 'evolucao' = ANY(v_scopes) THEN
    v_out_session := v_out_session || jsonb_build_object(
      'evolucoes', COALESCE(v_session -> 'evolucoes', '[]'::JSONB)
    );
  END IF;

  IF 'relatorio' = ANY(v_scopes) THEN
    v_out_session := v_out_session || jsonb_build_object(
      'relatorio', COALESCE(v_session -> 'relatorio', '{}'::JSONB)
    );
  END IF;

  RETURN jsonb_build_object('session', jsonb_strip_nulls(v_out_session));
END;
$filter_shared_session_payload_generic$;

REVOKE ALL ON FUNCTION public.filter_shared_session_payload_generic(JSONB, TEXT[])
  FROM PUBLIC, anon, authenticated;

-- A assinatura de retorno é a mesma de 20260807 (ganhou `discipline`),
-- então precisa derrubar antes de recriar.
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
SET search_path = pg_catalog
AS $get_shared_session$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_patient_clinic UUID;
  v_patient_owner UUID;
  v_full_access BOOLEAN := FALSE;
  v_allowed_disciplines TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id, p.therapist_id
  INTO v_patient_clinic, v_patient_owner
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_patient_owner = v_uid THEN
    v_full_access := TRUE;
  ELSIF (
    public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid)
  )
  AND v_patient_clinic IS NOT NULL
  AND v_patient_clinic = public.user_clinic_id(v_uid) THEN
    v_full_access := TRUE;
  ELSE
    -- Isolamento entre clínicas: restaurado de 20260723, perdido em
    -- 20260807.
    IF v_patient_clinic IS NULL
       OR v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid) THEN
      RAISE EXCEPTION
        'Acesso negado: compartilhamento restrito à clínica do paciente.'
        USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(
      array_agg(DISTINCT s.from_discipline),
      ARRAY[]::TEXT[]
    )
    INTO v_allowed_disciplines
    FROM public.record_shares s
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_discipline = ANY(public.user_disciplines(v_uid))
      AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic;

    IF cardinality(v_allowed_disciplines) = 0 THEN
      RAISE EXCEPTION
        'Acesso negado: sem compartilhamento ativo para este paciente.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Chave via Vault: restaurado de 20260723. 20260807 tinha voltado a
  -- ler public.app_config em texto puro (tabela já esvaziada).
  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    cr.discipline,
    CASE
      WHEN v_full_access THEN
        extensions.pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT
      WHEN cr.discipline = 'acupuntura' THEN
        public.filter_shared_session_payload(
          extensions.pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::JSONB,
          authorized_share.allowed_scopes
        )::TEXT
      ELSE
        public.filter_shared_session_payload_generic(
          extensions.pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::JSONB,
          authorized_share.allowed_scopes
        )::TEXT
    END,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      array_agg(DISTINCT shared_scope.scope_id)
        FILTER (
          WHERE shared_scope.scope_id = ANY (
            ARRAY['cadastro', 'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio']::TEXT[]
          )
        ),
      ARRAY[]::TEXT[]
    ) AS allowed_scopes
    FROM public.record_shares s
    LEFT JOIN LATERAL unnest(COALESCE(s.shared_scopes, ARRAY[]::TEXT[]))
      AS shared_scope(scope_id) ON TRUE
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_discipline = ANY(public.user_disciplines(v_uid))
      AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic
      AND s.from_discipline = cr.discipline
  ) AS authorized_share
    ON NOT v_full_access
  WHERE cr.patient_id = p_patient_id
    AND (
      v_full_access
      OR cr.discipline = ANY(v_allowed_disciplines)
    )
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC;
END;
$get_shared_session$;

-- CREATE FUNCTION concede EXECUTE a PUBLIC por padrão no Postgres — revogar
-- só de `anon` não bastava, porque `anon` continuava herdando via PUBLIC.
-- Esse foi exatamente o bug que a verificação abaixo pegou em produção
-- (anon_bloqueado = false na primeira aplicação desta migration).
REVOKE ALL ON FUNCTION public.get_shared_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_session(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.get_shared_session(uuid)') IS NOT NULL AS funcao_criada,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    LIKE '%v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid)%' AS isola_por_clinica,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    LIKE '%s.clinic_id IS NOT DISTINCT FROM v_patient_clinic%' AS share_restrito_a_clinica,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    LIKE '%get_clinical_encryption_key()%' AS usa_vault,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    NOT LIKE '%FROM public.app_config%' AS sem_leitura_app_config,
  has_function_privilege('authenticated', 'public.get_shared_session(uuid)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.get_shared_session(uuid)', 'EXECUTE') AS anon_bloqueado;
