-- ==========================================================
-- Compartilhamento vira "para uma pessoa", não "para uma área"
-- (18/08/2026 — pedido do usuário: compartilhar por disciplina
-- inteira é ruim para privacidade — qualquer colega ativo na
-- disciplina de destino lia o prontuário, mesmo sem ser quem
-- deveria atender o caso).
--
-- O QUE MUDA
-- record_shares ganha `to_user_id`: o profissional específico que
-- recebe. get_shared_session, get_patient_audit_log e a policy de
-- leitura de record_shares passam a autorizar por
-- `to_user_id = auth.uid()`, não mais por
-- `to_discipline = ANY(user_disciplines(auth.uid()))`.
--
-- POR QUE NÃO PRECISA DE BACKFILL
-- `to_user_id` fica NULLABLE na tabela (nenhum ALTER destrutivo).
-- Compartilhamentos antigos, sem um alvo específico, simplesmente
-- deixam de autorizar QUALQUER leitura — `to_user_id IS NULL` nunca
-- é igual a nenhum auth.uid() real. É o comportamento fail-closed
-- correto: ninguém pode inventar quem "deveria" ter sido o
-- destinatário de um compartilhamento antigo, então a leitura
-- expira em vez de continuar liberada para o time inteiro. Os
-- registros continuam existindo para auditoria (nada é apagado); só
-- a autorização de leitura pára de valer. `create_record_share_after
-- _reauthentication` passa a EXIGIR `p_to_user_id` em todo envio
-- novo — não existe mais o caminho "sem destinatário".
--
-- O QUE NÃO MUDA
-- A matrícula (`patient_enrollments`) continua sendo metadado
-- (nome/contato/"está em atendimento na X"), visível para quem
-- divide a disciplina na clínica — isso nunca foi o problema
-- relatado. Só o CONTEÚDO clínico (get_shared_session) e a NOTA de
-- encaminhamento (que pode conter contexto sensível e mora na linha
-- de record_shares, hoje visível pela policy de SELECT) apertam para
-- a pessoa específica.
--
-- REQUER: 20260812_fix_shared_session_isolation.sql aplicada antes
-- (reafirma o corpo inteiro das funções que ela define, porque
-- CREATE OR REPLACE substitui a função completa, não só o trecho
-- que muda).
-- ==========================================================

ALTER TABLE public.record_shares
  ADD COLUMN IF NOT EXISTS to_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_record_shares_to_user
  ON public.record_shares(to_user_id)
  WHERE revoked_at IS NULL;

-- ----------------------------------------------------------
-- 1. to_user_id entra na lista de colunas imutáveis do
-- compartilhamento (mesmo tratamento de from_discipline/to_discipline).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_record_share_revocation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce_record_share_revocation$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.from_discipline IS DISTINCT FROM OLD.from_discipline
     OR NEW.to_discipline IS DISTINCT FROM OLD.to_discipline
     OR NEW.to_user_id IS DISTINCT FROM OLD.to_user_id
     OR NEW.shared_scopes IS DISTINCT FROM OLD.shared_scopes
     OR NEW.shared_by IS DISTINCT FROM OLD.shared_by
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'Identidade e escopo do compartilhamento são imutáveis; revogue e crie outro.'
      USING ERRCODE = '55000';
  END IF;

  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL THEN
    RAISE EXCEPTION
      'Compartilhamento só permite revogação única e não pode ser reativado.'
      USING ERRCODE = '55000';
  END IF;

  NEW.revoked_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$enforce_record_share_revocation$;

-- ----------------------------------------------------------
-- 2. Quem pode VER a linha de compartilhamento (metadado + nota de
-- encaminhamento, que pode trazer contexto clínico sensível em
-- texto puro): dono do paciente, quem enviou, o DESTINATÁRIO
-- específico, ou adm/superadm da clínica. Time inteiro da disciplina
-- deixa de entrar aqui — antes bastava compartilhar disciplina em
-- comum para ler a nota.
-- ----------------------------------------------------------
DROP POLICY IF EXISTS record_shares_select_clinic ON public.record_shares;
CREATE POLICY record_shares_select_clinic
  ON public.record_shares
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = record_shares.patient_id
        AND p.clinic_id IS NOT NULL
        AND p.clinic_id = record_shares.clinic_id
        AND p.clinic_id = public.user_clinic_id(auth.uid())
        AND (
          p.therapist_id = auth.uid()
          OR record_shares.shared_by = auth.uid()
          OR record_shares.to_user_id = auth.uid()
          OR public.is_clinic_admin(auth.uid())
          OR public.is_super_admin(auth.uid())
        )
    )
  );

-- ----------------------------------------------------------
-- 3. Criação do compartilhamento passa a EXIGIR o destinatário e
-- valida que ele é membro ATIVO da MESMA clínica e de fato atua na
-- disciplina de destino (senão o encaminhamento vira um jeito de
-- mandar dado clínico para alguém sem relação com o caso).
-- Assinatura mudou (novo parâmetro): precisa derrubar a versão
-- anterior antes de recriar.
-- ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT[], TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.create_record_share_after_reauthentication(
  p_actor_id UUID,
  p_actor_aal TEXT,
  p_patient_id UUID,
  p_from_discipline TEXT,
  p_to_discipline TEXT,
  p_to_user_id UUID,
  p_shared_scopes TEXT[],
  p_note TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  from_discipline TEXT,
  to_discipline TEXT,
  to_user_id UUID,
  shared_scopes TEXT[],
  note TEXT,
  created_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $create_record_share_after_reauthentication$
DECLARE
  v_actor_clinic UUID;
  v_actor_role TEXT;
  v_actor_active BOOLEAN;
  v_actor_password_pending BOOLEAN;
  v_actor_mfa_required BOOLEAN;
  v_patient_owner UUID;
  v_patient_clinic UUID;
  v_target_clinic UUID;
  v_target_active BOOLEAN;
  v_target_disciplines TEXT[];
  v_scopes TEXT[];
  v_note TEXT := NULLIF(BTRIM(p_note), '');
  v_existing public.record_shares%ROWTYPE;
  v_created public.record_shares%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION
      'Somente a Edge Function de reautenticação pode criar compartilhamentos.'
      USING ERRCODE = '42501';
  END IF;

  IF p_actor_id IS NULL OR p_patient_id IS NULL OR p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Ator, paciente e idempotência são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'Escolha o profissional que vai receber o compartilhamento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    profile.clinic_id,
    profile.role,
    profile.is_active,
    profile.must_change_password,
    profile.mfa_required
  INTO
    v_actor_clinic,
    v_actor_role,
    v_actor_active,
    v_actor_password_pending,
    v_actor_mfa_required
  FROM public.profiles profile
  WHERE profile.id = p_actor_id;

  IF NOT FOUND
     OR v_actor_active IS NOT TRUE
     OR v_actor_password_pending IS TRUE
     OR (v_actor_mfa_required IS TRUE AND p_actor_aal <> 'aal2') THEN
    RAISE EXCEPTION 'Ator sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  SELECT patient.therapist_id, patient.clinic_id
  INTO v_patient_owner, v_patient_clinic
  FROM public.patients patient
  WHERE patient.id = p_patient_id
    AND patient.archived_at IS NULL;

  IF NOT FOUND
     OR v_patient_clinic IS NULL
     OR v_patient_clinic IS DISTINCT FROM v_actor_clinic
     OR (
       v_patient_owner IS DISTINCT FROM p_actor_id
       AND v_actor_role NOT IN ('clinic_admin', 'super_admin')
     ) THEN
    RAISE EXCEPTION
      'Ator não pode compartilhar este paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF p_from_discipline IS NULL
     OR p_to_discipline IS NULL
     OR p_from_discipline = p_to_discipline
     OR p_from_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']::TEXT[]
     )
     OR p_to_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplinas de origem/destino inválidas.'
      USING ERRCODE = '22023';
  END IF;

  -- O destinatário precisa ser colega ATIVO da MESMA clínica e de
  -- fato atuar na disciplina de destino — senão o encaminhamento
  -- vira um jeito de mandar prontuário para alguém sem relação com
  -- a disciplina escolhida.
  SELECT profile.clinic_id, profile.is_active, profile.disciplines
  INTO v_target_clinic, v_target_active, v_target_disciplines
  FROM public.profiles profile
  WHERE profile.id = p_to_user_id;

  IF NOT FOUND
     OR v_target_active IS NOT TRUE
     OR v_target_clinic IS DISTINCT FROM v_patient_clinic
     OR NOT (p_to_discipline = ANY(COALESCE(v_target_disciplines, ARRAY[]::TEXT[]))) THEN
    RAISE EXCEPTION
      'Destinatário inválido: precisa ser um profissional ativo da instituição, atuando na disciplina de destino.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patient_enrollments enrollment
    WHERE enrollment.patient_id = p_patient_id
      AND enrollment.clinic_id = v_patient_clinic
      AND enrollment.discipline = p_from_discipline
      AND enrollment.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Paciente não possui matrícula ativa na disciplina de origem.'
      USING ERRCODE = '22023';
  END IF;

  IF v_note IS NOT NULL AND pg_catalog.char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Nota de encaminhamento excede 1000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    array_agg(scope_id ORDER BY scope_id),
    ARRAY[]::TEXT[]
  )
  INTO v_scopes
  FROM (
    SELECT DISTINCT BTRIM(candidate.scope_id) AS scope_id
    FROM unnest(COALESCE(p_shared_scopes, ARRAY[]::TEXT[]))
      AS candidate(scope_id)
    WHERE BTRIM(candidate.scope_id) = ANY (
      ARRAY['cadastro', 'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio']::TEXT[]
    )
  ) normalized_scopes;
  v_scopes := ARRAY['cadastro']::TEXT[] || array_remove(v_scopes, 'cadastro');

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'record-share:' || p_actor_id::TEXT || ':' || p_idempotency_key::TEXT,
      0
    )
  );

  SELECT share.*
  INTO v_existing
  FROM public.record_shares share
  WHERE share.shared_by = p_actor_id
    AND share.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.patient_id IS DISTINCT FROM p_patient_id
       OR v_existing.from_discipline IS DISTINCT FROM p_from_discipline
       OR v_existing.to_discipline IS DISTINCT FROM p_to_discipline
       OR v_existing.to_user_id IS DISTINCT FROM p_to_user_id
       OR v_existing.shared_scopes IS DISTINCT FROM v_scopes
       OR v_existing.note IS DISTINCT FROM v_note THEN
      RAISE EXCEPTION 'Idempotência já usada com outro compartilhamento.'
        USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT
      v_existing.id,
      v_existing.patient_id,
      v_existing.from_discipline,
      v_existing.to_discipline,
      v_existing.to_user_id,
      v_existing.shared_scopes,
      v_existing.note,
      v_existing.created_at,
      v_existing.revoked_at;
    RETURN;
  END IF;

  PERFORM pg_catalog.set_config(
    'app.record_share_actor_id',
    p_actor_id::TEXT,
    TRUE
  );

  INSERT INTO public.patient_enrollments (
    patient_id,
    clinic_id,
    discipline,
    status,
    referred_by
  )
  VALUES (
    p_patient_id,
    v_patient_clinic,
    p_to_discipline,
    'active',
    p_actor_id
  )
  ON CONFLICT (patient_id, discipline)
  DO UPDATE
  SET status = 'active',
      updated_at = pg_catalog.clock_timestamp();

  INSERT INTO public.record_shares (
    patient_id,
    clinic_id,
    from_discipline,
    to_discipline,
    to_user_id,
    shared_scopes,
    shared_by,
    note,
    idempotency_key
  )
  VALUES (
    p_patient_id,
    v_patient_clinic,
    p_from_discipline,
    p_to_discipline,
    p_to_user_id,
    v_scopes,
    p_actor_id,
    v_note,
    p_idempotency_key
  )
  RETURNING * INTO v_created;

  RETURN QUERY
  SELECT
    v_created.id,
    v_created.patient_id,
    v_created.from_discipline,
    v_created.to_discipline,
    v_created.to_user_id,
    v_created.shared_scopes,
    v_created.note,
    v_created.created_at,
    v_created.revoked_at;
END;
$create_record_share_after_reauthentication$;

REVOKE ALL ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT[], TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, UUID, TEXT[], TEXT, UUID
) TO service_role;

-- ----------------------------------------------------------
-- 4. Leitura do conteúdo compartilhado: autoriza pelo destinatário
-- específico, não mais por qualquer colega da disciplina de destino.
-- Assinatura de retorno não muda — CREATE OR REPLACE direto.
-- Isolamento de clínica, filtro de record_shares por clínica, leitura
-- da chave via Vault e redação por escopo (as 3 proteções da auditoria
-- de 2026-08-11 + a redação) são REAFIRMADOS aqui, intactos.
-- ----------------------------------------------------------
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
    -- Isolamento entre clínicas: reafirmado (achado C1 da auditoria).
    IF v_patient_clinic IS NULL
       OR v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid) THEN
      RAISE EXCEPTION
        'Acesso negado: compartilhamento restrito à clínica do paciente.'
        USING ERRCODE = '42501';
    END IF;

    -- Destinatário específico, não mais "qualquer um da disciplina".
    SELECT COALESCE(
      array_agg(DISTINCT s.from_discipline),
      ARRAY[]::TEXT[]
    )
    INTO v_allowed_disciplines
    FROM public.record_shares s
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_user_id = v_uid
      AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic;

    IF cardinality(v_allowed_disciplines) = 0 THEN
      RAISE EXCEPTION
        'Acesso negado: sem compartilhamento ativo para este paciente.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Chave via Vault: reafirmado (achado C1 da auditoria).
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
      AND s.to_user_id = v_uid
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

REVOKE ALL ON FUNCTION public.get_shared_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_session(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 5. Trilha de auditoria do paciente segue a mesma regra: só o
-- destinatário específico do encaminhamento (ou dono/adm) enxerga o
-- histórico de alterações daquela disciplina.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_patient_audit_log(
  p_patient_id UUID,
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  audit_id UUID,
  record_id UUID,
  action TEXT,
  record_type TEXT,
  discipline TEXT,
  old_revision BIGINT,
  new_revision BIGINT,
  actor_id UUID,
  occurred_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $get_patient_audit_log$
DECLARE
  v_uid UUID := auth.uid();
  v_patient_owner UUID;
  v_patient_clinic UUID;
  v_full_access BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: usuário sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION 'Limite deve estar entre 1 e 200.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.therapist_id, p.clinic_id
  INTO v_patient_owner, v_patient_clinic
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  v_full_access := (
    v_patient_owner = v_uid
    OR (
      (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
      AND v_patient_clinic IS NOT NULL
      AND v_patient_clinic = public.user_clinic_id(v_uid)
    )
  );

  IF NOT v_full_access
     AND (
       v_patient_clinic IS NULL
       OR v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid)
     ) THEN
    RAISE EXCEPTION
      'Acesso negado: compartilhamento restrito à clínica do paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT v_full_access AND NOT EXISTS (
    SELECT 1
    FROM public.record_shares s
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_user_id = v_uid
      AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic
      AND s.shared_scopes && ARRAY[
        'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio'
      ]::TEXT[]
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: sem vínculo ativo com este paciente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    audit.id,
    audit.record_id,
    audit.operation,
    audit.record_type,
    audit.discipline,
    audit.old_revision,
    audit.new_revision,
    audit.actor_id,
    audit.occurred_at
  FROM public.clinical_record_audit_log audit
  WHERE audit.patient_id = p_patient_id
    AND (
      v_full_access
      OR EXISTS (
        SELECT 1
        FROM public.record_shares s
        WHERE s.patient_id = p_patient_id
          AND s.revoked_at IS NULL
          AND s.to_user_id = v_uid
          AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic
          AND s.from_discipline = audit.discipline
          AND s.shared_scopes && ARRAY[
            'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio'
          ]::TEXT[]
      )
    )
  ORDER BY audit.occurred_at DESC, audit.id DESC
  LIMIT p_limit;
END;
$get_patient_audit_log$;

REVOKE ALL ON FUNCTION public.get_patient_audit_log(UUID, INTEGER)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_patient_audit_log(UUID, INTEGER)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'record_shares'
      AND column_name = 'to_user_id'
  ) AS coluna_to_user_id_criada,
  to_regprocedure(
    'public.create_record_share_after_reauthentication(uuid,text,uuid,text,text,uuid,text[],text,uuid)'
  ) IS NOT NULL AS rpc_criacao_com_destinatario,
  to_regprocedure(
    'public.create_record_share_after_reauthentication(uuid,text,uuid,text,text,text[],text,uuid)'
  ) IS NULL AS assinatura_antiga_removida,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    LIKE '%s.to_user_id = v_uid%' AS leitura_restrita_ao_destinatario,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    NOT LIKE '%to_discipline = ANY%' AS sem_liberacao_por_disciplina_inteira,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    LIKE '%v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid)%' AS isola_por_clinica,
  pg_get_functiondef('public.get_shared_session(uuid)'::regprocedure)
    LIKE '%get_clinical_encryption_key()%' AS usa_vault,
  pg_get_functiondef('public.get_patient_audit_log(uuid,integer)'::regprocedure)
    NOT LIKE '%to_discipline = ANY%' AS auditoria_restrita_ao_destinatario,
  (
    SELECT pg_catalog.pg_get_expr(pol.polqual, pol.polrelid)
    FROM pg_catalog.pg_policy pol
    WHERE pol.polname = 'record_shares_select_clinic'
  ) LIKE '%to_user_id = auth.uid()%' AS policy_restrita_ao_destinatario;
