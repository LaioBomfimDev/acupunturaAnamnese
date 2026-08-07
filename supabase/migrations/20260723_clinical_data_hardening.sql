-- ============================================================================
-- Hardening de dados clínicos, compartilhamento e gravação concorrente
--
-- Esta migration é intencionalmente fail-closed e NÃO deve ser aplicada antes
-- de o segredo abaixo existir no Supabase Vault.
--
-- RUNBOOK (ordem obrigatória, sem colocar o valor em SQL versionado):
--   1. No projeto correto, habilitar/confirmar o Supabase Vault.
--   2. Criar no Vault o segredo nomeado `clinical_records_encryption_key`.
--      Se já existem fichas, o valor deve ser EXATAMENTE a chave que as
--      criptografou. Esta migration não gira chave nem recriptografa linhas.
--   3. Fazer backup e aplicar esta migration em janela controlada.
--   4. Validar leitura e escrita com um paciente de teste autorizado.
--   5. Planejar rotação/recriptografia em operação separada e auditada.
--
-- O preflight vem antes de qualquer DDL. Se Vault/segredo estiver ausente, ou
-- se uma amostra existente não puder ser descriptografada, toda a migration
-- aborta antes de alterar o schema.
--
-- Reversão segura: restaure o backup ou publique uma migration corretiva que
-- continue lendo do Vault. Nunca restaure a chave em texto puro no app_config.
-- ============================================================================

DO $vault_preflight$
DECLARE
  v_key TEXT;
  v_sample BYTEA;
BEGIN
  IF to_regclass('vault.decrypted_secrets') IS NULL THEN
    RAISE EXCEPTION
      'Hardening clínico bloqueado: Supabase Vault não está disponível.'
      USING
        ERRCODE = '55000',
        HINT = 'Habilite o Vault e provisione o segredo clinical_records_encryption_key antes de reaplicar.';
  END IF;

  EXECUTE $sql$
    SELECT NULLIF(BTRIM(decrypted_secret), '')
    FROM vault.decrypted_secrets
    WHERE name = 'clinical_records_encryption_key'
    ORDER BY updated_at DESC
    LIMIT 1
  $sql$
  INTO v_key;

  IF v_key IS NULL THEN
    RAISE EXCEPTION
      'Hardening clínico bloqueado: segredo clinical_records_encryption_key ausente ou vazio no Vault.'
      USING
        ERRCODE = '55000',
        HINT = 'Provisione o segredo no Vault sem registrar o valor em migration, log ou frontend.';
  END IF;

  SELECT cr.sensitive_data_encrypted
  INTO v_sample
  FROM public.clinical_records cr
  ORDER BY cr.updated_at DESC, cr.created_at DESC
  LIMIT 1;

  IF v_sample IS NOT NULL THEN
    BEGIN
      PERFORM extensions.pgp_sym_decrypt(v_sample, v_key);
    EXCEPTION
      WHEN OTHERS THEN
        RAISE EXCEPTION
          'Hardening clínico bloqueado: o segredo do Vault não descriptografa a amostra existente.'
          USING
            ERRCODE = '55000',
            HINT = 'Confirme que o segredo contém a chave atual. Não prossiga com rotação sem um plano de recriptografia.';
    END;
  END IF;
END;
$vault_preflight$;

-- --------------------------------------------------------------------------
-- 1. Papéis e gate clínico coerentes
-- --------------------------------------------------------------------------

DO $profiles_role_constraint$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_role_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  END IF;

  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('therapist', 'clinic_admin', 'super_admin', 'knowledge_reviewer'));
END;
$profiles_role_constraint$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mfa_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.profiles.mfa_required IS
  'Quando true, o gate clínico exige claim JWT aal2. Ativação é canário e posterior à UI/fator.';

-- ROLLOUT MFA — deliberadamente não executado nesta migration:
--   1. publicar UI de enrollment/challenge/verify e recuperação;
--   2. cadastrar e verificar um fator na conta canário;
--   3. confirmar sessão aal2;
--   4. só então, em operação separada:
--        UPDATE public.profiles
--        SET mfa_required = TRUE
--        WHERE id = '<uuid-canario>';
--   5. observar e expandir gradualmente para clinic_admin/super_admin.
-- Não faça backfill por papel antes dessas etapas: isso criaria lockout.

CREATE OR REPLACE FUNCTION public.can_access_clinical_data(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_access_clinical_data$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role IN ('therapist', 'clinic_admin', 'super_admin', 'knowledge_reviewer')
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
      AND (
        p.mfa_required IS NOT TRUE
        OR COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      )
  );
$can_access_clinical_data$;

CREATE OR REPLACE FUNCTION public.is_clinic_admin(
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $is_clinic_admin$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'clinic_admin'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$is_clinic_admin$;

REVOKE ALL ON FUNCTION public.can_access_clinical_data(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_clinic_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_clinical_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_clinic_admin(UUID) TO authenticated;

-- Helpers existentes também deixam de herdar EXECUTE de PUBLIC.
REVOKE ALL ON FUNCTION public.user_clinic_id(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_disciplines(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.patient_shares_user_discipline(UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_super_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_clinic_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_disciplines(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.patient_shares_user_discipline(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(UUID) TO authenticated;

-- O fluxo administrativo existente envia disciplines = NULL quando o array
-- vem vazio. O trigger normaliza somente NULL; um array vazio explícito segue
-- sendo uma escolha possível e não é reescrito silenciosamente.
CREATE OR REPLACE FUNCTION public.normalize_profile_disciplines_not_null()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $normalize_profile_disciplines_not_null$
DECLARE
  v_profession_discipline TEXT;
BEGIN
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

DROP TRIGGER IF EXISTS profiles_normalize_disciplines_not_null ON public.profiles;
CREATE TRIGGER profiles_normalize_disciplines_not_null
  BEFORE INSERT OR UPDATE OF disciplines, profession, role
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_disciplines_not_null();

REVOKE ALL ON FUNCTION public.normalize_profile_disciplines_not_null() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 2. Revisões, idempotência e auditoria clínica imutável
-- --------------------------------------------------------------------------

ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS revision BIGINT NOT NULL DEFAULT 1;

DO $clinical_record_revision_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'clinical_records_revision_positive'
      AND conrelid = 'public.clinical_records'::regclass
  ) THEN
    ALTER TABLE public.clinical_records
      ADD CONSTRAINT clinical_records_revision_positive
      CHECK (revision > 0);
  END IF;
END;
$clinical_record_revision_constraint$;

CREATE TABLE IF NOT EXISTS public.clinical_record_write_receipts (
  actor_id UUID NOT NULL,
  idempotency_key UUID NOT NULL,
  request_hash TEXT NOT NULL,
  record_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  record_type TEXT NOT NULL,
  discipline TEXT NOT NULL,
  revision BIGINT NOT NULL CHECK (revision > 0),
  updated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (actor_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_clinical_write_receipts_record
  ON public.clinical_record_write_receipts(record_id, revision);

ALTER TABLE public.clinical_record_write_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clinical_record_write_receipts FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.clinical_record_audit_log (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  record_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  therapist_id UUID NOT NULL,
  actor_id UUID,
  operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'delete')),
  record_type TEXT NOT NULL,
  discipline TEXT NOT NULL,
  old_revision BIGINT,
  new_revision BIGINT,
  idempotency_key UUID,
  ciphertext_sha256 TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_clinical_audit_record
  ON public.clinical_record_audit_log(record_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_audit_patient
  ON public.clinical_record_audit_log(patient_id, occurred_at DESC);

ALTER TABLE public.clinical_record_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_record_audit_select_authorized
  ON public.clinical_record_audit_log;
CREATE POLICY clinical_record_audit_select_authorized
  ON public.clinical_record_audit_log
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND (
      therapist_id = auth.uid()
      OR (
        (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
        AND EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = clinical_record_audit_log.patient_id
            AND p.clinic_id = public.user_clinic_id(auth.uid())
        )
      )
    )
  );

REVOKE ALL ON TABLE public.clinical_record_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.clinical_record_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_immutable_clinical_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $reject_immutable_clinical_log_mutation$
BEGIN
  RAISE EXCEPTION 'Trilha clínica imutável: atualização ou exclusão não permitida.'
    USING ERRCODE = '55000';
END;
$reject_immutable_clinical_log_mutation$;

DROP TRIGGER IF EXISTS clinical_audit_reject_mutation
  ON public.clinical_record_audit_log;
CREATE TRIGGER clinical_audit_reject_mutation
  BEFORE UPDATE OR DELETE
  ON public.clinical_record_audit_log
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_immutable_clinical_log_mutation();

DROP TRIGGER IF EXISTS clinical_receipts_reject_mutation
  ON public.clinical_record_write_receipts;
CREATE TRIGGER clinical_receipts_reject_mutation
  BEFORE UPDATE OR DELETE
  ON public.clinical_record_write_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_immutable_clinical_log_mutation();

CREATE OR REPLACE FUNCTION public.enforce_clinical_record_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce_clinical_record_revision$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
    RETURN NEW;
  END IF;

  IF NEW.revision <> OLD.revision + 1 THEN
    RAISE EXCEPTION
      'Revisão clínica inválida: a próxima revisão deve ser %.',
      OLD.revision + 1
      USING ERRCODE = '40001';
  END IF;

  RETURN NEW;
END;
$enforce_clinical_record_revision$;

DROP TRIGGER IF EXISTS clinical_records_enforce_revision
  ON public.clinical_records;
CREATE TRIGGER clinical_records_enforce_revision
  BEFORE INSERT OR UPDATE
  ON public.clinical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_clinical_record_revision();

CREATE OR REPLACE FUNCTION public.audit_clinical_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $audit_clinical_record_change$
DECLARE
  v_idempotency_key UUID;
  v_ciphertext BYTEA;
BEGIN
  BEGIN
    v_idempotency_key :=
      NULLIF(pg_catalog.current_setting('app.clinical_idempotency_key', TRUE), '')::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_idempotency_key := NULL;
  END;

  v_ciphertext := CASE WHEN TG_OP = 'DELETE'
    THEN OLD.sensitive_data_encrypted
    ELSE NEW.sensitive_data_encrypted
  END;

  INSERT INTO public.clinical_record_audit_log (
    record_id,
    patient_id,
    therapist_id,
    actor_id,
    operation,
    record_type,
    discipline,
    old_revision,
    new_revision,
    idempotency_key,
    ciphertext_sha256
  )
  VALUES (
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.patient_id ELSE NEW.patient_id END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.therapist_id ELSE NEW.therapist_id END,
    auth.uid(),
    pg_catalog.lower(TG_OP),
    CASE WHEN TG_OP = 'DELETE' THEN OLD.record_type ELSE NEW.record_type END,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.discipline ELSE NEW.discipline END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.revision END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.revision END,
    v_idempotency_key,
    pg_catalog.encode(extensions.digest(v_ciphertext, 'sha256'), 'hex')
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$audit_clinical_record_change$;

DROP TRIGGER IF EXISTS clinical_records_audit_change
  ON public.clinical_records;
CREATE TRIGGER clinical_records_audit_change
  AFTER INSERT OR UPDATE OR DELETE
  ON public.clinical_records
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_clinical_record_change();

REVOKE ALL ON FUNCTION public.reject_immutable_clinical_log_mutation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_clinical_record_revision() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_clinical_record_change() FROM PUBLIC, anon, authenticated;

-- Compatibilidade controlada para o fallback histórico de Psicologia:
-- promove somente a ficha legada mais recente quando ainda não existe uma
-- ficha canônica da mesma lane em `psicologia`. Se as duas disciplinas já
-- coexistirem, nenhuma delas é sobrescrita: o caso fica preservado para
-- reconciliação humana. O UPDATE abaixo passa pelos triggers de revisão e
-- auditoria recém-criados.
WITH ranked_legacy_psychology AS (
  SELECT
    legacy.id,
    pg_catalog.row_number() OVER (
      PARTITION BY
        legacy.patient_id,
        legacy.therapist_id,
        legacy.record_type
      ORDER BY legacy.updated_at DESC, legacy.created_at DESC, legacy.id DESC
    ) AS candidate_rank
  FROM public.clinical_records legacy
  WHERE legacy.record_type IN ('psi_anamnese', 'psi_neuro_avaliacao')
    AND legacy.discipline <> 'psicologia'
    AND NOT EXISTS (
      SELECT 1
      FROM public.clinical_records canonical
      WHERE canonical.patient_id = legacy.patient_id
        AND canonical.therapist_id = legacy.therapist_id
        AND canonical.record_type = legacy.record_type
        AND canonical.discipline = 'psicologia'
    )
)
UPDATE public.clinical_records record
SET discipline = 'psicologia',
    revision = record.revision + 1,
    updated_at = pg_catalog.clock_timestamp()
FROM ranked_legacy_psychology candidate
WHERE candidate.id = record.id
  AND candidate.candidate_rank = 1;

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
      AND s.to_discipline = ANY(public.user_disciplines(v_uid))
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
          AND s.to_discipline = ANY(public.user_disciplines(v_uid))
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

-- --------------------------------------------------------------------------
-- 3. Chave central no Vault, sem fallback em app_config
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_clinical_encryption_key()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $get_clinical_encryption_key$
DECLARE
  v_key TEXT;
BEGIN
  SELECT NULLIF(BTRIM(ds.decrypted_secret), '')
  INTO v_key
  FROM vault.decrypted_secrets ds
  WHERE ds.name = 'clinical_records_encryption_key'
  ORDER BY ds.updated_at DESC
  LIMIT 1;

  IF v_key IS NULL THEN
    RAISE EXCEPTION
      'Chave clínica indisponível no Vault.'
      USING
        ERRCODE = '55000',
        HINT = 'Provisione clinical_records_encryption_key no Supabase Vault.';
  END IF;

  RETURN v_key;
END;
$get_clinical_encryption_key$;

REVOKE ALL ON FUNCTION public.get_clinical_encryption_key() FROM PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- 4. RPCs clínicas existentes: gate uniforme + Vault + revisão
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT,
  p_discipline TEXT DEFAULT 'acupuntura'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $insert_clinical_record$
DECLARE
  v_id UUID;
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_record_type IS NULL OR BTRIM(p_record_type) = '' OR p_data IS NULL THEN
    RAISE EXCEPTION 'Tipo e conteúdo da ficha são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.clinical_records (
    patient_id,
    therapist_id,
    record_type,
    discipline,
    sensitive_data_encrypted,
    revision
  )
  VALUES (
    p_patient_id,
    v_uid,
    BTRIM(p_record_type),
    p_discipline,
    extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
    1
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$insert_clinical_record$;

CREATE OR REPLACE FUNCTION public.get_clinical_records(
  p_patient_id UUID,
  p_record_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
  sensitive_data TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $get_clinical_records$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    extensions.pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = v_uid
    AND (p_record_type IS NULL OR cr.record_type = p_record_type)
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC;
END;
$get_clinical_records$;

CREATE OR REPLACE FUNCTION public.update_clinical_record(
  p_record_id UUID,
  p_data TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $update_clinical_record$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL THEN
    RAISE EXCEPTION 'Conteúdo da ficha é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinical_records cr
  SET sensitive_data_encrypted =
        extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
      revision = cr.revision + 1,
      updated_at = pg_catalog.clock_timestamp()
  WHERE cr.id = p_record_id
    AND cr.therapist_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'Acesso negado: ficha não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;
END;
$update_clinical_record$;

REVOKE ALL ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_clinical_records(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_clinical_record(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_clinical_record(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 5. Contratos estáveis para autosave otimista e idempotente
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_latest_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_discipline TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
  discipline TEXT,
  revision BIGINT,
  sensitive_data TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $get_latest_clinical_record$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_record_type IS NULL OR BTRIM(p_record_type) = '' THEN
    RAISE EXCEPTION 'Tipo da ficha é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NOT NULL
     AND p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    cr.discipline,
    cr.revision,
    extensions.pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = v_uid
    AND cr.record_type = BTRIM(p_record_type)
    AND (p_discipline IS NULL OR cr.discipline = p_discipline)
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
END;
$get_latest_clinical_record$;

CREATE OR REPLACE FUNCTION public.upsert_versioned_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT,
  p_expected_revision BIGINT,
  p_idempotency_key UUID,
  p_discipline TEXT
)
RETURNS TABLE (
  id UUID,
  revision BIGINT,
  updated_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $upsert_versioned_clinical_record$
DECLARE
  v_uid UUID := auth.uid();
  v_request_hash TEXT;
  v_receipt public.clinical_record_write_receipts%ROWTYPE;
  v_record public.clinical_records%ROWTYPE;
  v_record_found BOOLEAN := FALSE;
  v_result_id UUID;
  v_result_revision BIGINT;
  v_result_updated_at TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'Conteúdo e revisão esperada não negativa são obrigatórios.'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'Chave de idempotência é obrigatória.'
      USING ERRCODE = '22023';
  END IF;

  IF p_record_type IS NULL
     OR p_record_type <> ALL (
       ARRAY['full_session', 'psi_anamnese', 'psi_neuro_avaliacao']::TEXT[]
     )
     OR (
       p_record_type IN ('psi_anamnese', 'psi_neuro_avaliacao')
       AND p_discipline <> 'psicologia'
     ) THEN
    RAISE EXCEPTION
      'Tipo de ficha não permitido para upsert versionado.'
      USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_uid
  ) THEN
    RAISE EXCEPTION
      'Acesso negado: paciente não pertence ao profissional autenticado.'
      USING ERRCODE = '42501';
  END IF;

  v_request_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.concat_ws(
        pg_catalog.chr(31),
        p_patient_id::TEXT,
        p_record_type,
        p_discipline,
        p_expected_revision::TEXT,
        p_data
      ),
      'sha256'
    ),
    'hex'
  );

  -- Serializa replays da mesma operação.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'clinical-idempotency:' || v_uid::TEXT || ':' || p_idempotency_key::TEXT,
      0
    )
  );

  SELECT r.*
  INTO v_receipt
  FROM public.clinical_record_write_receipts r
  WHERE r.actor_id = v_uid
    AND r.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_receipt.request_hash <> v_request_hash THEN
      RAISE EXCEPTION
        'Chave de idempotência já usada com outro conteúdo.'
        USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
      v_receipt.record_id,
      v_receipt.revision,
      v_receipt.updated_at,
      TRUE;
    RETURN;
  END IF;

  -- Evita duas criações concorrentes para paciente/tipo/disciplina.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'clinical-record:' || v_uid::TEXT || ':' || p_patient_id::TEXT
        || ':' || p_record_type || ':' || p_discipline,
      0
    )
  );

  SELECT cr.*
  INTO v_record
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = v_uid
    AND cr.record_type = p_record_type
    AND cr.discipline = p_discipline
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1
  FOR UPDATE;

  v_record_found := FOUND;

  PERFORM pg_catalog.set_config(
    'app.clinical_idempotency_key',
    p_idempotency_key::TEXT,
    TRUE
  );

  IF v_record_found THEN
    IF v_record.revision <> p_expected_revision THEN
      RAISE EXCEPTION
        'Conflito de revisão: esperado %, atual %.',
        p_expected_revision,
        v_record.revision
        USING
          ERRCODE = '40001',
          HINT = 'Recarregue a ficha mais recente antes de salvar novamente.';
    END IF;

    UPDATE public.clinical_records cr
    SET sensitive_data_encrypted =
          extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
        revision = cr.revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    WHERE cr.id = v_record.id
      AND cr.therapist_id = v_uid
      AND cr.revision = p_expected_revision
    RETURNING cr.id, cr.revision, cr.updated_at
    INTO v_result_id, v_result_revision, v_result_updated_at;

    IF NOT FOUND THEN
      RAISE EXCEPTION
        'Conflito de revisão durante a gravação.'
        USING
          ERRCODE = '40001',
          HINT = 'Recarregue a ficha mais recente antes de salvar novamente.';
    END IF;
  ELSE
    IF p_expected_revision <> 0 THEN
      RAISE EXCEPTION
        'Conflito de revisão: a sessão ainda não existe; use revisão esperada 0.'
        USING
          ERRCODE = '40001',
          HINT = 'Recarregue a ficha antes de salvar novamente.';
    END IF;

    INSERT INTO public.clinical_records AS cr (
      patient_id,
      therapist_id,
      record_type,
      discipline,
      sensitive_data_encrypted,
      revision,
      updated_at
    )
    VALUES (
      p_patient_id,
      v_uid,
      p_record_type,
      p_discipline,
      extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
      1,
      pg_catalog.clock_timestamp()
    )
    RETURNING
      cr.id,
      cr.revision,
      cr.updated_at
    INTO v_result_id, v_result_revision, v_result_updated_at;
  END IF;

  INSERT INTO public.clinical_record_write_receipts (
    actor_id,
    idempotency_key,
    request_hash,
    record_id,
    patient_id,
    record_type,
    discipline,
    revision,
    updated_at
  )
  VALUES (
    v_uid,
    p_idempotency_key,
    v_request_hash,
    v_result_id,
    p_patient_id,
    p_record_type,
    p_discipline,
    v_result_revision,
    v_result_updated_at
  );

  PERFORM pg_catalog.set_config('app.clinical_idempotency_key', '', TRUE);

  RETURN QUERY
  SELECT
    v_result_id,
    v_result_revision,
    v_result_updated_at,
    FALSE;
END;
$upsert_versioned_clinical_record$;

CREATE OR REPLACE FUNCTION public.upsert_clinical_session(
  p_patient_id UUID,
  p_data TEXT,
  p_expected_revision BIGINT,
  p_idempotency_key UUID,
  p_discipline TEXT DEFAULT 'acupuntura'
)
RETURNS TABLE (
  id UUID,
  revision BIGINT,
  updated_at TIMESTAMPTZ,
  replayed BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $upsert_clinical_session$
  SELECT result.id, result.revision, result.updated_at, result.replayed
  FROM public.upsert_versioned_clinical_record(
    p_patient_id,
    'full_session',
    p_data,
    p_expected_revision,
    p_idempotency_key,
    p_discipline
  ) AS result;
$upsert_clinical_session$;

REVOKE ALL ON FUNCTION public.get_latest_clinical_record(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_versioned_clinical_record(UUID, TEXT, TEXT, BIGINT, UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_clinical_session(UUID, TEXT, BIGINT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_clinical_record(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_versioned_clinical_record(UUID, TEXT, TEXT, BIGINT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_clinical_session(UUID, TEXT, BIGINT, UUID, TEXT) TO authenticated;

-- --------------------------------------------------------------------------
-- 6. Compartilhamento: escopo aplicado no servidor
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.filter_shared_session_payload(
  p_payload JSONB,
  p_scopes TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $filter_shared_session_payload$
DECLARE
  v_scopes TEXT[] := ARRAY(
    SELECT DISTINCT scope_id
    FROM unnest(COALESCE(p_scopes, ARRAY[]::TEXT[])) AS scope_id
    WHERE scope_id = ANY (
      ARRAY['cadastro', 'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio']::TEXT[]
    )
  );
  v_source_state JSONB := CASE
    WHEN jsonb_typeof(p_payload -> 'state') = 'object'
      THEN p_payload -> 'state'
    ELSE '{}'::JSONB
  END;
  v_source_selected JSONB := CASE
    WHEN jsonb_typeof(p_payload -> 'selectedMap') = 'object'
      THEN p_payload -> 'selectedMap'
    ELSE '{}'::JSONB
  END;
  v_state JSONB := '{}'::JSONB;
  v_selected JSONB := '{}'::JSONB;
BEGIN
  -- cadastro vem da tabela patients; nenhum dado do full_session é necessário.
  -- resumo expõe somente a queixa. A síntese detalhada não recebe marcadores
  -- de outros escopos, evitando que "resumo" vire atalho para a anamnese toda.
  IF 'resumo' = ANY(v_scopes) THEN
    v_state := v_state || jsonb_build_object(
      'queixa', v_source_state -> 'queixa'
    );
  END IF;

  IF 'anamnese' = ANY(v_scopes) THEN
    v_state := v_state || jsonb_build_object(
      'queixa', v_source_state -> 'queixa',
      'historia', v_source_state -> 'historia',
      'medicacoes', v_source_state -> 'medicacoes',
      'atividadeFisica', v_source_state -> 'atividadeFisica',
      'obsSonoEmocoes', v_source_state -> 'obsSonoEmocoes'
    );
  END IF;

  IF 'dores' = ANY(v_scopes) THEN
    v_state := v_state || jsonb_build_object(
      'dorLocal', v_source_state -> 'dorLocal',
      'escalaDor', v_source_state -> 'escalaDor',
      'dorRepouso', v_source_state -> 'dorRepouso',
      'dorMovimento', v_source_state -> 'dorMovimento',
      'obsDor', v_source_state -> 'obsDor'
    );
  END IF;

  IF 'evolucao' = ANY(v_scopes) THEN
    v_state := v_state || jsonb_build_object(
      'evolucoes', v_source_state -> 'evolucoes'
    );
  END IF;

  IF 'relatorio' = ANY(v_scopes) THEN
    v_state := v_state || jsonb_build_object(
      'relatorioEdits', v_source_state -> 'relatorioEdits'
    );
  END IF;

  SELECT COALESCE(jsonb_object_agg(item.key, item.value), '{}'::JSONB)
  INTO v_selected
  FROM jsonb_each(v_source_selected) AS item
  WHERE item.value = 'true'::JSONB
    AND (
      (
        'anamnese' = ANY(v_scopes)
        AND split_part(item.key, ':', 1) = ANY (
          ARRAY['queixaEstruturada', 'sono', 'emocoes', 'digestao', 'historico']::TEXT[]
        )
      )
      OR (
        'dores' = ANY(v_scopes)
        AND split_part(item.key, ':', 1) = ANY (
          ARRAY['dor', 'dorRegioes', 'clima']::TEXT[]
        )
      )
    );

  RETURN jsonb_build_object(
    'state', jsonb_strip_nulls(v_state),
    'selectedMap', v_selected
  );
END;
$filter_shared_session_payload$;

REVOKE ALL ON FUNCTION public.filter_shared_session_payload(JSONB, TEXT[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_shared_session(p_patient_id UUID)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
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
  v_source_disciplines TEXT[] := ARRAY[]::TEXT[];
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
    INTO v_source_disciplines
    FROM public.record_shares s
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_discipline = ANY(public.user_disciplines(v_uid))
      AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic;

    IF cardinality(v_source_disciplines) = 0 THEN
      RAISE EXCEPTION
        'Acesso negado: sem compartilhamento ativo para este paciente.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    CASE
      WHEN v_full_access THEN
        extensions.pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT
      ELSE
        public.filter_shared_session_payload(
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
      AS shared_scope(scope_id)
      ON TRUE
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_discipline = ANY(public.user_disciplines(v_uid))
      AND s.clinic_id IS NOT DISTINCT FROM v_patient_clinic
      AND s.from_discipline = cr.discipline
  ) AS authorized_share
    ON NOT v_full_access
  WHERE cr.patient_id = p_patient_id
    AND cr.record_type = 'full_session'
    AND (
      v_full_access
      OR cr.discipline = ANY(v_source_disciplines)
    )
  ORDER BY cr.updated_at DESC, cr.created_at DESC, cr.id DESC
  LIMIT 1;
END;
$get_shared_session$;

REVOKE ALL ON FUNCTION public.get_shared_session(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shared_session(UUID) TO authenticated;

-- --------------------------------------------------------------------------
-- 7. RLS com gate ativo/senha: pacientes, compartilhamentos e fotos de língua
-- --------------------------------------------------------------------------

-- Retenção clínica: a política legada permitia DELETE direto e cascade.
-- Até existir política jurídica + executor auditado, paciente e prontuário
-- somente podem ser arquivados/solicitados, nunca apagados pelo navegador.
DROP POLICY IF EXISTS "Patients delete own after password change"
  ON public.patients;
DROP POLICY IF EXISTS "Profissional gerencia apenas as fichas de seus pacientes"
  ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records insert own after password change"
  ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records update own after password change"
  ON public.clinical_records;
DROP POLICY IF EXISTS "Clinical records delete own after password change"
  ON public.clinical_records;
REVOKE DELETE ON TABLE public.patients FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.clinical_records FROM authenticated;
REVOKE ALL ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_clinical_record(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_clinical_record(UUID)
  FROM PUBLIC, anon, authenticated;

-- A marca no próprio paciente torna a criação da primeira matrícula atômica:
-- duas requisições concorrentes não conseguem abrir disciplinas diferentes.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS initial_enrollment_created_at TIMESTAMPTZ;

UPDATE public.patients patient
SET initial_enrollment_created_at = COALESCE(
  patient.initial_enrollment_created_at,
  patient.created_at,
  pg_catalog.clock_timestamp()
)
WHERE patient.initial_enrollment_created_at IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.patient_enrollments enrollment
    WHERE enrollment.patient_id = patient.id
  );

-- Matrículas alimentam a autorização de cadastro do paciente. A identidade
-- vem sempre do paciente/contexto autenticado e não pode ser reescrita.
CREATE OR REPLACE FUNCTION public.set_enrollment_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $set_enrollment_defaults$
DECLARE
  v_uid UUID := auth.uid();
  v_patient_clinic UUID;
BEGIN
  IF v_uid IS NULL AND auth.role() = 'service_role' THEN
    BEGIN
      v_uid := NULLIF(
        pg_catalog.current_setting('app.record_share_actor_id', TRUE),
        ''
      )::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_uid := NULL;
    END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'Sessão ausente para criar matrícula.'
        USING ERRCODE = '42501';
    END IF;

    IF auth.role() = 'service_role' THEN
      SELECT p.clinic_id
      INTO v_patient_clinic
      FROM public.patients p
      WHERE p.id = NEW.patient_id;
    ELSE
      UPDATE public.patients p
      SET initial_enrollment_created_at = pg_catalog.clock_timestamp()
      WHERE p.id = NEW.patient_id
        AND p.therapist_id = v_uid
        AND p.initial_enrollment_created_at IS NULL
      RETURNING p.clinic_id INTO v_patient_clinic;
    END IF;

    IF NOT FOUND OR v_patient_clinic IS NULL THEN
      RAISE EXCEPTION
        'Paciente inválido ou matrícula inicial já criada.'
        USING ERRCODE = '42501';
    END IF;

    NEW.clinic_id := v_patient_clinic;
    NEW.referred_by := v_uid;
  END IF;

  NEW.updated_at := pg_catalog.clock_timestamp();
  RETURN NEW;
END;
$set_enrollment_defaults$;

CREATE OR REPLACE FUNCTION public.enforce_enrollment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce_enrollment_identity$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.discipline IS DISTINCT FROM OLD.discipline
     OR NEW.referred_by IS DISTINCT FROM OLD.referred_by
     OR NEW.note IS DISTINCT FROM OLD.note
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION
      'Identidade da matrícula é imutável; altere somente status ou responsável.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.assigned_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.profiles assignee
       WHERE assignee.id = NEW.assigned_to
         AND assignee.clinic_id = OLD.clinic_id
         AND assignee.is_active IS TRUE
         AND assignee.must_change_password IS NOT TRUE
         AND OLD.discipline = ANY(COALESCE(assignee.disciplines, ARRAY[]::TEXT[]))
     ) THEN
    RAISE EXCEPTION
      'Responsável precisa estar ativo, na mesma clínica e disciplina.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$enforce_enrollment_identity$;

DROP TRIGGER IF EXISTS trg_enrollment_defaults
  ON public.patient_enrollments;
CREATE TRIGGER trg_enrollment_defaults
  BEFORE INSERT OR UPDATE
  ON public.patient_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_enrollment_defaults();

DROP TRIGGER IF EXISTS patient_enrollments_enforce_identity
  ON public.patient_enrollments;
CREATE TRIGGER patient_enrollments_enforce_identity
  BEFORE UPDATE
  ON public.patient_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_enrollment_identity();

REVOKE ALL ON FUNCTION public.set_enrollment_defaults()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_enrollment_identity()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.patient_has_any_enrollment(
  p_patient_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $patient_has_any_enrollment$
  SELECT EXISTS (
    SELECT 1
    FROM public.patient_enrollments enrollment
    WHERE enrollment.patient_id = p_patient_id
  );
$patient_has_any_enrollment$;

REVOKE ALL ON FUNCTION public.patient_has_any_enrollment(UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_has_any_enrollment(UUID)
  TO authenticated;

DROP POLICY IF EXISTS enrollments_select_clinic
  ON public.patient_enrollments;
CREATE POLICY enrollments_select_clinic
  ON public.patient_enrollments
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND (
      discipline = ANY(public.user_disciplines(auth.uid()))
      OR referred_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE p.id = patient_enrollments.patient_id
          AND p.therapist_id = auth.uid()
      )
      OR public.is_clinic_admin(auth.uid())
      OR public.is_super_admin(auth.uid())
    )
  );

-- O navegador só pode criar a primeira matrícula do próprio paciente. Novos
-- encaminhamentos são feitos pela Edge Function com reautenticação.
DROP POLICY IF EXISTS enrollments_insert_clinic
  ON public.patient_enrollments;
DROP POLICY IF EXISTS enrollments_insert_initial_own
  ON public.patient_enrollments;
CREATE POLICY enrollments_insert_initial_own
  ON public.patient_enrollments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND referred_by = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_enrollments.patient_id
        AND p.therapist_id = auth.uid()
        AND p.clinic_id = patient_enrollments.clinic_id
    )
    AND NOT public.patient_has_any_enrollment(patient_id)
  );

DROP POLICY IF EXISTS enrollments_update_clinic
  ON public.patient_enrollments;
DROP POLICY IF EXISTS enrollments_update_lifecycle
  ON public.patient_enrollments;
CREATE POLICY enrollments_update_lifecycle
  ON public.patient_enrollments
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND (
      discipline = ANY(public.user_disciplines(auth.uid()))
      OR EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE p.id = patient_enrollments.patient_id
          AND p.therapist_id = auth.uid()
      )
      OR public.is_clinic_admin(auth.uid())
      OR public.is_super_admin(auth.uid())
    )
  )
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id = public.user_clinic_id(auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.patient_enrollments
  FROM authenticated;
GRANT INSERT ON TABLE public.patient_enrollments TO authenticated;
GRANT UPDATE (status, assigned_to) ON TABLE public.patient_enrollments
  TO authenticated;

CREATE OR REPLACE FUNCTION public.patient_shares_user_discipline(
  p_patient UUID,
  p_user UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $patient_shares_user_discipline$
  SELECT public.can_access_clinical_data(p_user)
    AND EXISTS (
      SELECT 1
      FROM public.patient_enrollments enrollment
      WHERE enrollment.patient_id = p_patient
        AND enrollment.status = 'active'
        AND enrollment.clinic_id = public.user_clinic_id(p_user)
        AND enrollment.discipline = ANY(public.user_disciplines(p_user))
    );
$patient_shares_user_discipline$;

REVOKE ALL ON FUNCTION public.patient_shares_user_discipline(UUID, UUID)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_shares_user_discipline(UUID, UUID)
  TO authenticated;

ALTER TABLE public.record_shares
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS record_shares_actor_idempotency_uidx
  ON public.record_shares(shared_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- INSERT sempre deriva clínica e autoria do contexto autenticado, ignorando
-- valores controlados pelo cliente. Escopos desconhecidos são descartados e
-- cadastro permanece explícito.
CREATE OR REPLACE FUNCTION public.set_record_share_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $set_record_share_defaults$
DECLARE
  v_uid UUID := auth.uid();
  v_patient_clinic UUID;
  v_scopes TEXT[];
BEGIN
  IF v_uid IS NULL AND auth.role() = 'service_role' THEN
    BEGIN
      v_uid := NULLIF(
        pg_catalog.current_setting('app.record_share_actor_id', TRUE),
        ''
      )::UUID;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_uid := NULL;
    END;
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sessão ausente para criar compartilhamento.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id
  INTO v_patient_clinic
  FROM public.patients p
  WHERE p.id = NEW.patient_id;

  IF NOT FOUND OR v_patient_clinic IS NULL THEN
    RAISE EXCEPTION
      'Paciente sem clínica válida para compartilhamento.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    array_agg(scope_id ORDER BY scope_id),
    ARRAY[]::TEXT[]
  )
  INTO v_scopes
  FROM (
    SELECT DISTINCT BTRIM(candidate.scope_id) AS scope_id
    FROM unnest(COALESCE(NEW.shared_scopes, ARRAY[]::TEXT[]))
      AS candidate(scope_id)
    WHERE BTRIM(candidate.scope_id) = ANY (
      ARRAY['cadastro', 'resumo', 'anamnese', 'dores', 'evolucao', 'relatorio']::TEXT[]
    )
  ) normalized_scopes;

  NEW.clinic_id := v_patient_clinic;
  NEW.shared_by := v_uid;
  NEW.shared_scopes :=
    ARRAY['cadastro']::TEXT[] || array_remove(v_scopes, 'cadastro');
  RETURN NEW;
END;
$set_record_share_defaults$;

DROP TRIGGER IF EXISTS trg_record_share_defaults ON public.record_shares;
CREATE TRIGGER trg_record_share_defaults
  BEFORE INSERT ON public.record_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.set_record_share_defaults();

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

DROP TRIGGER IF EXISTS record_shares_enforce_revocation
  ON public.record_shares;
CREATE TRIGGER record_shares_enforce_revocation
  BEFORE UPDATE ON public.record_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_record_share_revocation();

REVOKE ALL ON FUNCTION public.set_record_share_defaults()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_record_share_revocation()
  FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS patients_select_clinic_discipline ON public.patients;
CREATE POLICY patients_select_clinic_discipline
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND public.patient_shares_user_discipline(id, auth.uid())
  );

DROP POLICY IF EXISTS patients_select_clinic_admin ON public.patients;
CREATE POLICY patients_select_clinic_admin
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  );

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
          OR record_shares.to_discipline = ANY (
            public.user_disciplines(auth.uid())
          )
          OR public.is_clinic_admin(auth.uid())
          OR public.is_super_admin(auth.uid())
        )
    )
  );

DROP POLICY IF EXISTS record_shares_insert ON public.record_shares;
-- Sem policy de INSERT para `authenticated`: a confirmação de senha precisa
-- ocorrer na mesma operação de servidor que cria matrícula + compartilhamento.

DROP POLICY IF EXISTS record_shares_update ON public.record_shares;
CREATE POLICY record_shares_update
  ON public.record_shares
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND (
      (
        shared_by = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = record_shares.patient_id
            AND p.therapist_id = auth.uid()
            AND p.clinic_id = record_shares.clinic_id
        )
      )
      OR (
        (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
        AND EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = record_shares.patient_id
            AND p.clinic_id = record_shares.clinic_id
            AND p.clinic_id = public.user_clinic_id(auth.uid())
        )
      )
    )
  )
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND (
      (
        shared_by = auth.uid()
        AND EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = record_shares.patient_id
            AND p.therapist_id = auth.uid()
            AND p.clinic_id = record_shares.clinic_id
        )
      )
      OR (
        (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
        AND EXISTS (
          SELECT 1
          FROM public.patients p
          WHERE p.id = record_shares.patient_id
            AND p.clinic_id = record_shares.clinic_id
            AND p.clinic_id = public.user_clinic_id(auth.uid())
        )
      )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.record_shares FROM authenticated;
GRANT UPDATE (revoked_at) ON TABLE public.record_shares TO authenticated;

CREATE OR REPLACE FUNCTION public.create_record_share_after_reauthentication(
  p_actor_id UUID,
  p_actor_aal TEXT,
  p_patient_id UUID,
  p_from_discipline TEXT,
  p_to_discipline TEXT,
  p_shared_scopes TEXT[],
  p_note TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  from_discipline TEXT,
  to_discipline TEXT,
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
    v_created.shared_scopes,
    v_created.note,
    v_created.created_at,
    v_created.revoked_at;
END;
$create_record_share_after_reauthentication$;

REVOKE ALL ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT[], TEXT, UUID
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_record_share_after_reauthentication(
  UUID, TEXT, UUID, TEXT, TEXT, TEXT[], TEXT, UUID
) TO service_role;

DROP POLICY IF EXISTS "Terapeuta envia fotos de língua na própria pasta"
  ON storage.objects;
CREATE POLICY "Terapeuta envia fotos de língua na própria pasta"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND bucket_id = 'clinical-tongue-photos'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Terapeuta lê fotos de língua da própria pasta"
  ON storage.objects;
CREATE POLICY "Terapeuta lê fotos de língua da própria pasta"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND bucket_id = 'clinical-tongue-photos'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "Terapeuta remove fotos de língua da própria pasta"
  ON storage.objects;
CREATE POLICY "Terapeuta remove fotos de língua da própria pasta"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND bucket_id = 'clinical-tongue-photos'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

-- --------------------------------------------------------------------------
-- 8. Curadoria central: gate profissional, versão, auditoria e outbox
--
-- Payload mínimo aceito para conhecimento:
-- {
--   "code": "LI4",
--   "type": "acupoint",
--   "title": "Hegu",
--   "source": "...",
--   "sourceDraftId": "...",
--   "sourceReferences": [
--     { "sourceKey": "...", "pdfPage": 123 }
--   ],
--   "requiresProfessionalAudit": false,
--   "approvalMode": "server_professional",
--   "professionalReview": {
--     "reviewerId": "<uuid de perfil ativo com registro profissional>",
--     "reviewedAt": "<ISO-8601>",
--     "attestationId": "<referência rastreável do atestado>",
--     "decision": "approved"
--   }
-- }
--
-- Uma proposta administrativa sem o bloco profissional ainda é preservada e
-- versionada, mas fica em `review`; nunca entra em get_active_knowledge_reviews.
-- A importação service_role é mais estrita: rejeita qualquer payload que não
-- tenha aprovação profissional rastreável.
-- --------------------------------------------------------------------------

ALTER TABLE public.knowledge_entity_versions
  ADD COLUMN IF NOT EXISTS payload_checksum TEXT;

DO $knowledge_payload_checksum_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'knowledge_entity_versions_checksum_format'
      AND conrelid = 'public.knowledge_entity_versions'::regclass
  ) THEN
    ALTER TABLE public.knowledge_entity_versions
      ADD CONSTRAINT knowledge_entity_versions_checksum_format
      CHECK (
        payload_checksum IS NULL
        OR payload_checksum ~ '^[0-9a-f]{64}$'
      );
  END IF;
END;
$knowledge_payload_checksum_constraint$;

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_entity_versions_checksum_unique
  ON public.knowledge_entity_versions(entity_id, payload_checksum)
  WHERE payload_checksum IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.knowledge_outbox (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS knowledge_outbox_pending_idx
  ON public.knowledge_outbox(available_at, created_at)
  WHERE processed_at IS NULL;

ALTER TABLE public.knowledge_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_outbox_super_admin_select
  ON public.knowledge_outbox;
CREATE POLICY knowledge_outbox_super_admin_select
  ON public.knowledge_outbox
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS knowledge_outbox_super_admin_update
  ON public.knowledge_outbox;
CREATE POLICY knowledge_outbox_super_admin_update
  ON public.knowledge_outbox
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND public.is_super_admin(auth.uid())
  );

REVOKE ALL ON TABLE public.knowledge_outbox
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.knowledge_outbox TO authenticated;
GRANT UPDATE (attempts, available_at, processed_at, last_error)
  ON TABLE public.knowledge_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.knowledge_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.knowledge_payload_has_traceable_provenance(
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $knowledge_payload_has_traceable_provenance$
DECLARE
  v_reference JSONB;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RETURN FALSE;
  END IF;

  IF jsonb_typeof(p_payload -> 'sourceReferences') = 'array' THEN
    FOR v_reference IN
      SELECT value
      FROM jsonb_array_elements(p_payload -> 'sourceReferences')
    LOOP
      IF jsonb_typeof(v_reference) = 'object'
         AND NULLIF(BTRIM(v_reference ->> 'sourceKey'), '') IS NOT NULL
         AND (
           v_reference ? 'pdfPage'
           OR NULLIF(BTRIM(v_reference ->> 'assetKey'), '') IS NOT NULL
           OR NULLIF(BTRIM(v_reference ->> 'imageUrl'), '') IS NOT NULL
           OR NULLIF(BTRIM(v_reference ->> 'referenceLabel'), '') IS NOT NULL
         ) THEN
        RETURN TRUE;
      END IF;
    END LOOP;
  END IF;

  IF NULLIF(BTRIM(p_payload ->> 'source'), '') IS NULL
     OR NULLIF(BTRIM(p_payload ->> 'sourceDraftId'), '') IS NULL
     OR jsonb_typeof(p_payload #> '{enrichment,provenance}') <> 'array' THEN
    RETURN FALSE;
  END IF;

  RETURN jsonb_array_length(
    p_payload #> '{enrichment,provenance}'
  ) > 0;
END;
$knowledge_payload_has_traceable_provenance$;

CREATE OR REPLACE FUNCTION public.knowledge_payload_professionally_approved(
  p_payload JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $knowledge_payload_professionally_approved$
DECLARE
  v_reviewer_id UUID;
  v_reviewed_at TIMESTAMPTZ;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object'
     OR p_payload -> 'requiresProfessionalAudit' IS DISTINCT FROM 'false'::JSONB
     OR p_payload ->> 'approvalMode' <> 'server_professional'
     OR jsonb_typeof(p_payload -> 'professionalReview') <> 'object'
     OR p_payload #>> '{professionalReview,decision}' <> 'approved'
     OR NULLIF(
       BTRIM(p_payload #>> '{professionalReview,attestationId}'),
       ''
     ) IS NULL THEN
    RETURN FALSE;
  END IF;

  BEGIN
    v_reviewer_id :=
      (p_payload #>> '{professionalReview,reviewerId}')::UUID;
    v_reviewed_at :=
      (p_payload #>> '{professionalReview,reviewedAt}')::TIMESTAMPTZ;
  EXCEPTION
    WHEN invalid_text_representation OR datetime_field_overflow THEN
      RETURN FALSE;
  END;

  IF v_reviewed_at > pg_catalog.clock_timestamp() + INTERVAL '5 minutes' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = v_reviewer_id
      AND p.role IN (
        'therapist',
        'clinic_admin',
        'super_admin',
        'knowledge_reviewer'
      )
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
      AND NULLIF(BTRIM(p.professional_registration), '') IS NOT NULL
  );
END;
$knowledge_payload_professionally_approved$;

REVOKE ALL ON FUNCTION public.knowledge_payload_has_traceable_provenance(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.knowledge_payload_professionally_approved(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_active_knowledge_reviews()
RETURNS TABLE (
  entity_id UUID,
  entity_key TEXT,
  entity_type TEXT,
  entity_title TEXT,
  entity_code TEXT,
  entity_tags TEXT[],
  version INTEGER,
  payload JSONB,
  source_ids UUID[],
  approved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $get_active_knowledge_reviews$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND (v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid)) THEN
    RAISE EXCEPTION
      'Acesso negado: usuário sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ke.id,
    ke.entity_key,
    ke.entity_type,
    ke.title,
    ke.code,
    ke.tags,
    kev.version,
    kev.payload,
    kev.source_ids,
    ke.approved_at
  FROM public.knowledge_entities ke
  JOIN public.knowledge_entity_versions kev
    ON kev.entity_id = ke.id
   AND kev.version = ke.current_version
  WHERE ke.approval_status = 'approved'
    AND ke.entity_type IN ('acupoint', 'auricular_point', 'auricular_candidate')
    AND public.knowledge_payload_professionally_approved(kev.payload)
    AND (
      cardinality(kev.source_ids) > 0
      OR public.knowledge_payload_has_traceable_provenance(kev.payload)
    )
  ORDER BY ke.entity_key;
END;
$get_active_knowledge_reviews$;

REVOKE ALL ON FUNCTION public.get_active_knowledge_reviews()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_active_knowledge_reviews()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_knowledge_curation_proposal(
  p_proposal_id UUID,
  p_decision_note TEXT
)
RETURNS TABLE (
  proposal_id UUID,
  entity_id UUID,
  version INTEGER,
  entity_approval_status TEXT,
  outbox_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $approve_knowledge_curation_proposal$
DECLARE
  v_uid UUID := auth.uid();
  v_proposal public.curation_proposals%ROWTYPE;
  v_review JSONB;
  v_version_payload JSONB;
  v_entity public.knowledge_entities%ROWTYPE;
  v_entity_key TEXT;
  v_entity_type TEXT;
  v_title TEXT;
  v_code TEXT;
  v_display_code TEXT;
  v_tags TEXT[] := ARRAY[]::TEXT[];
  v_source_ids UUID[] := ARRAY[]::UUID[];
  v_next_version INTEGER;
  v_professionally_approved BOOLEAN;
  v_target_status TEXT;
  v_professional_reviewer UUID;
  v_professional_reviewed_at TIMESTAMPTZ;
  v_outbox_id UUID;
BEGIN
  IF v_uid IS NULL
     OR NOT public.can_access_clinical_data(v_uid)
     OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: decisão restrita ao SuperAdm ativo.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_decision_note), '') IS NULL THEN
    RAISE EXCEPTION 'Nota de decisão é obrigatória para auditoria.'
      USING ERRCODE = '22023';
  END IF;

  SELECT cp.*
  INTO v_proposal
  FROM public.curation_proposals cp
  WHERE cp.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta de curadoria não encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_proposal.status <> 'proposed'
     OR v_proposal.type <> 'knowledge_review' THEN
    RAISE EXCEPTION
      'A proposta deve estar em proposed e ser do tipo knowledge_review.'
      USING ERRCODE = '22023';
  END IF;

  IF v_proposal.payload ->> 'kind' <> 'decision'
     OR jsonb_typeof(v_proposal.payload -> 'review') <> 'object' THEN
    RAISE EXCEPTION
      'Payload legado não mapeável: esperado payload.kind=decision e payload.review objeto.'
      USING
        ERRCODE = '22023',
        HINT = 'Envie code/type/title e proveniência rastreável no objeto review.';
  END IF;

  v_review := v_proposal.payload -> 'review';
  v_entity_key := pg_catalog.lower(NULLIF(BTRIM(COALESCE(
    v_review ->> 'entityKey',
    v_review ->> 'code',
    v_proposal.target_ref
  )), ''));
  v_entity_type := NULLIF(BTRIM(v_review ->> 'type'), '');
  v_title := NULLIF(BTRIM(v_review ->> 'title'), '');
  v_code := NULLIF(BTRIM(COALESCE(
    v_review ->> 'code',
    v_proposal.target_ref
  )), '');
  v_display_code := NULLIF(BTRIM(COALESCE(
    v_review ->> 'displayCode',
    v_code
  )), '');

  IF v_entity_key IS NULL
     OR v_entity_key !~ '^[A-Za-z0-9][A-Za-z0-9:_./-]{0,127}$'
     OR v_code IS NULL
     OR v_title IS NULL
     OR v_entity_type NOT IN (
       'acupoint',
       'auricular_point',
       'auricular_candidate'
     ) THEN
    RAISE EXCEPTION
      'Identidade de conhecimento insuficiente ou tipo não permitido.'
      USING
        ERRCODE = '22023',
        HINT = 'Informe entityKey/code, title e type acupoint|auricular_point|auricular_candidate.';
  END IF;

  IF NOT public.knowledge_payload_has_traceable_provenance(v_review) THEN
    RAISE EXCEPTION
      'Proveniência insuficiente para versionar o conhecimento.'
      USING
        ERRCODE = '22023',
        HINT = 'Inclua sourceReferences com sourceKey+página/asset, ou source+sourceDraftId+enrichment.provenance.';
  END IF;

  IF jsonb_typeof(v_review -> 'tags') = 'array' THEN
    SELECT COALESCE(
      array_agg(DISTINCT BTRIM(tag.value #>> '{}'))
        FILTER (WHERE NULLIF(BTRIM(tag.value #>> '{}'), '') IS NOT NULL),
      ARRAY[]::TEXT[]
    )
    INTO v_tags
    FROM jsonb_array_elements(v_review -> 'tags') AS tag(value)
    WHERE jsonb_typeof(tag.value) = 'string';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT ks.id), ARRAY[]::UUID[])
  INTO v_source_ids
  FROM public.knowledge_sources ks
  WHERE ks.source_key IN (
    SELECT ref.value ->> 'sourceKey'
    FROM jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(v_review -> 'sourceReferences') = 'array'
          THEN v_review -> 'sourceReferences'
        ELSE '[]'::JSONB
      END
    ) AS ref(value)
    WHERE jsonb_typeof(ref.value) = 'object'
      AND NULLIF(BTRIM(ref.value ->> 'sourceKey'), '') IS NOT NULL
  );

  v_professionally_approved :=
    public.knowledge_payload_professionally_approved(v_review);
  IF v_professionally_approved THEN
    v_professional_reviewer :=
      (v_review #>> '{professionalReview,reviewerId}')::UUID;
    v_professional_reviewed_at :=
      (v_review #>> '{professionalReview,reviewedAt}')::TIMESTAMPTZ;
    -- O atestado precisa pertencer à conta autenticada que criou a proposta;
    -- o SuperAdm decide a promoção, mas não pode atribuir a revisão a terceiro.
    IF v_professional_reviewer <> v_proposal.proposer_id THEN
      v_professionally_approved := FALSE;
      v_professional_reviewer := NULL;
      v_professional_reviewed_at := NULL;
    END IF;
  END IF;

  v_target_status := CASE
    WHEN v_professionally_approved THEN 'approved'
    ELSE 'review'
  END;

  IF v_professionally_approved THEN
    v_version_payload := v_review || jsonb_build_object(
      'status', 'approved',
      'approvalMode', 'server_professional',
      'requiresProfessionalAudit', FALSE
    );
  ELSE
    v_professional_reviewer := NULL;
    v_professional_reviewed_at := NULL;
    v_version_payload := v_review || jsonb_build_object(
      'status', 'review',
      'approvalMode', 'server_review',
      'requiresProfessionalAudit', TRUE
    );
  END IF;

  v_version_payload := v_version_payload || jsonb_build_object(
    'serverCuration',
    jsonb_build_object(
      'proposalId', v_proposal.id,
      'decidedBy', v_uid,
      'decidedAt', pg_catalog.clock_timestamp(),
      'professionalGatePassed', v_professionally_approved
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'knowledge-entity:' || pg_catalog.lower(v_entity_key),
      0
    )
  );

  SELECT ke.*
  INTO v_entity
  FROM public.knowledge_entities ke
  WHERE pg_catalog.lower(ke.entity_key) = v_entity_key
  FOR UPDATE;

  IF FOUND THEN
    v_next_version := v_entity.current_version + 1;

    UPDATE public.knowledge_entities ke
    SET entity_type = v_entity_type,
        title = v_title,
        code = v_code,
        display_code = v_display_code,
        tags = v_tags,
        approval_status = v_target_status,
        approved_by = v_professional_reviewer,
        approved_at = v_professional_reviewed_at,
        current_version = v_next_version,
        updated_at = pg_catalog.clock_timestamp()
    WHERE ke.id = v_entity.id
    RETURNING ke.* INTO v_entity;
  ELSE
    v_next_version := 1;

    INSERT INTO public.knowledge_entities (
      entity_key,
      entity_type,
      title,
      code,
      display_code,
      tags,
      approval_status,
      approved_by,
      approved_at,
      current_version,
      created_by
    )
    VALUES (
      v_entity_key,
      v_entity_type,
      v_title,
      v_code,
      v_display_code,
      v_tags,
      v_target_status,
      v_professional_reviewer,
      v_professional_reviewed_at,
      v_next_version,
      v_uid
    )
    RETURNING * INTO v_entity;
  END IF;

  INSERT INTO public.knowledge_entity_versions (
    entity_id,
    version,
    payload,
    source_ids,
    change_note,
    created_by
  )
  VALUES (
    v_entity.id,
    v_next_version,
    v_version_payload,
    v_source_ids,
    BTRIM(p_decision_note),
    v_uid
  );

  UPDATE public.curation_proposals cp
  SET status = 'approved',
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp(),
      decision_note = BTRIM(p_decision_note)
  WHERE cp.id = v_proposal.id;

  INSERT INTO public.knowledge_audit_log (
    actor_id,
    action,
    entity_id,
    metadata
  )
  VALUES (
    v_uid,
    'approve_knowledge_curation_proposal',
    v_entity.id,
    jsonb_build_object(
      'proposalId', v_proposal.id,
      'version', v_next_version,
      'entityApprovalStatus', v_target_status,
      'professionalGatePassed', v_professionally_approved,
      'professionalReviewerId', v_professional_reviewer,
      'professionalAttestationId',
        v_review #>> '{professionalReview,attestationId}',
      'decisionNote', BTRIM(p_decision_note)
    )
  );

  INSERT INTO public.knowledge_outbox (
    event_type,
    aggregate_type,
    aggregate_id,
    dedupe_key,
    payload
  )
  VALUES (
    'knowledge.curation_decided',
    'knowledge_entity',
    v_entity.id,
    'curation-proposal:' || v_proposal.id::TEXT,
    jsonb_build_object(
      'proposalId', v_proposal.id,
      'entityId', v_entity.id,
      'version', v_next_version,
      'entityApprovalStatus', v_target_status,
      'professionalGatePassed', v_professionally_approved,
      'professionalAttestationId',
        v_review #>> '{professionalReview,attestationId}'
    )
  )
  RETURNING id INTO v_outbox_id;

  RETURN QUERY
  SELECT
    v_proposal.id,
    v_entity.id,
    v_next_version,
    v_target_status,
    v_outbox_id;
END;
$approve_knowledge_curation_proposal$;

REVOKE ALL ON FUNCTION public.approve_knowledge_curation_proposal(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_knowledge_curation_proposal(UUID, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_knowledge_curation_proposal(
  p_proposal_id UUID,
  p_decision_note TEXT
)
RETURNS TABLE (
  proposal_id UUID,
  status TEXT,
  decided_at TIMESTAMPTZ,
  outbox_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $reject_knowledge_curation_proposal$
DECLARE
  v_uid UUID := auth.uid();
  v_proposal public.curation_proposals%ROWTYPE;
  v_decided_at TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_outbox_id UUID;
BEGIN
  IF v_uid IS NULL
     OR NOT public.can_access_clinical_data(v_uid)
     OR NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: decisão restrita ao SuperAdm ativo.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_decision_note), '') IS NULL THEN
    RAISE EXCEPTION 'Nota de decisão é obrigatória para auditoria.'
      USING ERRCODE = '22023';
  END IF;

  SELECT cp.*
  INTO v_proposal
  FROM public.curation_proposals cp
  WHERE cp.id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposta de curadoria não encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_proposal.status <> 'proposed'
     OR v_proposal.type <> 'knowledge_review' THEN
    RAISE EXCEPTION
      'A proposta deve estar em proposed e ser do tipo knowledge_review.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.curation_proposals cp
  SET status = 'rejected',
      decided_by = v_uid,
      decided_at = v_decided_at,
      decision_note = BTRIM(p_decision_note)
  WHERE cp.id = v_proposal.id;

  INSERT INTO public.knowledge_audit_log (
    actor_id,
    action,
    metadata
  )
  VALUES (
    v_uid,
    'reject_knowledge_curation_proposal',
    jsonb_build_object(
      'proposalId', v_proposal.id,
      'proposerId', v_proposal.proposer_id,
      'targetRef', v_proposal.target_ref,
      'decisionNote', BTRIM(p_decision_note)
    )
  );

  INSERT INTO public.knowledge_outbox (
    event_type,
    aggregate_type,
    aggregate_id,
    dedupe_key,
    payload
  )
  VALUES (
    'knowledge.curation_rejected',
    'curation_proposal',
    v_proposal.id,
    'curation-rejection:' || v_proposal.id::TEXT,
    jsonb_build_object(
      'proposalId', v_proposal.id,
      'status', 'rejected'
    )
  )
  RETURNING id INTO v_outbox_id;

  RETURN QUERY
  SELECT
    v_proposal.id,
    'rejected'::TEXT,
    v_decided_at,
    v_outbox_id;
END;
$reject_knowledge_curation_proposal$;

REVOKE ALL ON FUNCTION public.reject_knowledge_curation_proposal(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_knowledge_curation_proposal(UUID, TEXT)
  TO authenticated;

-- knowledge_review só pode mudar de status pelas RPCs transacionais acima.
-- Os demais tipos preservam o fluxo administrativo existente.
DROP POLICY IF EXISTS curation_proposals_update
  ON public.curation_proposals;
CREATE POLICY curation_proposals_update
  ON public.curation_proposals
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND public.is_super_admin(auth.uid())
    AND type <> 'knowledge_review'
  )
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND public.is_super_admin(auth.uid())
    AND type <> 'knowledge_review'
  );

CREATE OR REPLACE FUNCTION public.import_approved_knowledge_review(
  p_entity_key TEXT,
  p_entity_type TEXT,
  p_title TEXT,
  p_code TEXT,
  p_tags TEXT[],
  p_payload JSONB,
  p_source_id UUID,
  p_payload_checksum TEXT
)
RETURNS TABLE (
  entity_id UUID,
  version INTEGER,
  approval_status TEXT,
  payload_checksum TEXT,
  replayed BOOLEAN,
  outbox_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $import_approved_knowledge_review$
DECLARE
  v_entity public.knowledge_entities%ROWTYPE;
  v_existing_version INTEGER;
  v_next_version INTEGER;
  v_checksum TEXT;
  v_reviewer_id UUID;
  v_reviewed_at TIMESTAMPTZ;
  v_outbox_id UUID;
  v_tags TEXT[] := ARRAY[]::TEXT[];
  v_normalized_payload JSONB;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION
      'Acesso negado: importação restrita ao service_role.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_entity_key), '') IS NULL
     OR BTRIM(p_entity_key) !~ '^[A-Za-z0-9][A-Za-z0-9:_./-]{0,127}$'
     OR NULLIF(BTRIM(p_title), '') IS NULL
     OR NULLIF(BTRIM(p_code), '') IS NULL
     OR p_entity_type NOT IN (
       'acupoint',
       'auricular_point',
       'auricular_candidate'
     ) THEN
    RAISE EXCEPTION 'Identidade inválida para importação de conhecimento.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.knowledge_sources ks
    WHERE ks.id = p_source_id
  ) THEN
    RAISE EXCEPTION
      'Fonte rastreável é obrigatória para importação.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.knowledge_payload_professionally_approved(p_payload) THEN
    RAISE EXCEPTION
      'Importação bloqueada: payload sem aprovação profissional rastreável.'
      USING
        ERRCODE = '42501',
        HINT = 'Informe requiresProfessionalAudit=false, approvalMode=server_professional e professionalReview válido.';
  END IF;

  -- JSONB::text não usa a mesma canonicalização de JSON.stringify/RFC 8785.
  -- Por isso a fonte da verdade do checksum é o próprio PostgreSQL. O caller
  -- pode passar NULL; um valor informado é apenas fingerprint informativo e
  -- nunca participa da decisão/idempotência.
  IF NULLIF(BTRIM(p_payload_checksum), '') IS NOT NULL
     AND pg_catalog.lower(BTRIM(p_payload_checksum))
       !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Fingerprint SHA-256 informado tem formato inválido.'
      USING ERRCODE = '22023';
  END IF;

  v_checksum := pg_catalog.encode(
    extensions.digest(p_payload::TEXT, 'sha256'),
    'hex'
  );

  SELECT COALESCE(
    array_agg(DISTINCT BTRIM(tag))
      FILTER (WHERE NULLIF(BTRIM(tag), '') IS NOT NULL),
    ARRAY[]::TEXT[]
  )
  INTO v_tags
  FROM unnest(COALESCE(p_tags, ARRAY[]::TEXT[])) AS tag;

  v_reviewer_id :=
    (p_payload #>> '{professionalReview,reviewerId}')::UUID;
  v_reviewed_at :=
    (p_payload #>> '{professionalReview,reviewedAt}')::TIMESTAMPTZ;
  v_normalized_payload := p_payload || jsonb_build_object(
    'status', 'approved',
    'approvalMode', 'server_professional',
    'requiresProfessionalAudit', FALSE,
    'serverImport',
    jsonb_build_object(
      'sourceId', p_source_id,
      'payloadChecksum', v_checksum
    )
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'knowledge-entity:' || pg_catalog.lower(BTRIM(p_entity_key)),
      0
    )
  );

  SELECT ke.*
  INTO v_entity
  FROM public.knowledge_entities ke
  WHERE pg_catalog.lower(ke.entity_key) =
    pg_catalog.lower(BTRIM(p_entity_key))
  FOR UPDATE;

  IF FOUND THEN
    SELECT kev.version
    INTO v_existing_version
    FROM public.knowledge_entity_versions kev
    WHERE kev.entity_id = v_entity.id
      AND kev.payload_checksum = v_checksum;

    IF FOUND THEN
      SELECT ko.id
      INTO v_outbox_id
      FROM public.knowledge_outbox ko
      WHERE ko.dedupe_key =
        'knowledge-import:' || v_entity.id::TEXT || ':' || v_checksum;

      RETURN QUERY
      SELECT
        v_entity.id,
        v_existing_version,
        v_entity.approval_status,
        v_checksum,
        TRUE,
        v_outbox_id;
      RETURN;
    END IF;

    v_next_version := v_entity.current_version + 1;
    UPDATE public.knowledge_entities ke
    SET entity_type = p_entity_type,
        title = BTRIM(p_title),
        code = BTRIM(p_code),
        display_code = BTRIM(p_code),
        tags = v_tags,
        approval_status = 'approved',
        approved_by = v_reviewer_id,
        approved_at = v_reviewed_at,
        current_version = v_next_version,
        updated_at = pg_catalog.clock_timestamp()
    WHERE ke.id = v_entity.id
    RETURNING ke.* INTO v_entity;
  ELSE
    v_next_version := 1;
    INSERT INTO public.knowledge_entities (
      entity_key,
      entity_type,
      title,
      code,
      display_code,
      tags,
      approval_status,
      approved_by,
      approved_at,
      current_version,
      created_by
    )
    VALUES (
      pg_catalog.lower(BTRIM(p_entity_key)),
      p_entity_type,
      BTRIM(p_title),
      BTRIM(p_code),
      BTRIM(p_code),
      v_tags,
      'approved',
      v_reviewer_id,
      v_reviewed_at,
      v_next_version,
      v_reviewer_id
    )
    RETURNING * INTO v_entity;
  END IF;

  INSERT INTO public.knowledge_entity_versions (
    entity_id,
    version,
    payload,
    source_ids,
    change_note,
    created_by,
    payload_checksum
  )
  VALUES (
    v_entity.id,
    v_next_version,
    v_normalized_payload,
    ARRAY[p_source_id]::UUID[],
    'Importação idempotente de conhecimento profissionalmente aprovado.',
    v_reviewer_id,
    v_checksum
  );

  INSERT INTO public.knowledge_audit_log (
    actor_id,
    action,
    entity_id,
    metadata
  )
  VALUES (
    v_reviewer_id,
    'import_approved_knowledge_review',
    v_entity.id,
    jsonb_build_object(
      'version', v_next_version,
      'sourceId', p_source_id,
      'payloadChecksum', v_checksum,
      'clientPayloadChecksum',
        NULLIF(pg_catalog.lower(BTRIM(p_payload_checksum)), ''),
      'professionalReviewerId', v_reviewer_id,
      'professionalAttestationId',
        p_payload #>> '{professionalReview,attestationId}'
    )
  );

  INSERT INTO public.knowledge_outbox (
    event_type,
    aggregate_type,
    aggregate_id,
    dedupe_key,
    payload
  )
  VALUES (
    'knowledge.review_imported',
    'knowledge_entity',
    v_entity.id,
    'knowledge-import:' || v_entity.id::TEXT || ':' || v_checksum,
    jsonb_build_object(
      'entityId', v_entity.id,
      'version', v_next_version,
      'payloadChecksum', v_checksum,
      'approvalStatus', 'approved'
    )
  )
  RETURNING id INTO v_outbox_id;

  RETURN QUERY
  SELECT
    v_entity.id,
    v_next_version,
    'approved'::TEXT,
    v_checksum,
    FALSE,
    v_outbox_id;
END;
$import_approved_knowledge_review$;

REVOKE ALL ON FUNCTION public.import_approved_knowledge_review(
  TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_approved_knowledge_review(
  TEXT, TEXT, TEXT, TEXT, TEXT[], JSONB, UUID, TEXT
) TO service_role;

-- --------------------------------------------------------------------------
-- 9. Rate limit persistente para Edge Functions
--
-- Não há worker automático nesta migration. Limpeza operacional sugerida
-- (por job autenticado como service_role, após definir a retenção desejada):
--   DELETE FROM public.edge_rate_limits
--   WHERE updated_at < clock_timestamp() - interval '7 days';
-- O índice de updated_at torna essa limpeza incremental previsível.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.edge_rate_limits (
  bucket TEXT NOT NULL,
  subject UUID NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  limit_value INTEGER NOT NULL CHECK (limit_value > 0),
  window_seconds INTEGER NOT NULL CHECK (window_seconds > 0),
  window_started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (bucket, subject)
);

CREATE INDEX IF NOT EXISTS edge_rate_limits_updated_at_idx
  ON public.edge_rate_limits(updated_at);

ALTER TABLE public.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.edge_rate_limits
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.edge_rate_limits
  TO service_role;

CREATE OR REPLACE FUNCTION public.consume_edge_rate_limit(
  p_subject_id UUID,
  p_function_name TEXT,
  p_window_seconds INTEGER,
  p_limit INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  remaining INTEGER,
  retry_after_seconds INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $consume_edge_rate_limit$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
  v_count INTEGER;
  v_window_started_at TIMESTAMPTZ;
  v_reset_at TIMESTAMPTZ;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION
      'Acesso negado: rate limit restrito ao service_role.'
      USING ERRCODE = '42501';
  END IF;

  IF p_subject_id IS NULL
     OR NULLIF(BTRIM(p_function_name), '') IS NULL
     OR BTRIM(p_function_name) !~ '^[a-z0-9][a-z0-9:._-]{0,127}$'
     OR p_limit IS NULL
     OR p_limit < 1
     OR p_limit > 100000
     OR p_window_seconds IS NULL
     OR p_window_seconds < 1
     OR p_window_seconds > 86400 THEN
    RAISE EXCEPTION 'Parâmetros inválidos para consumo de rate limit.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.edge_rate_limits AS erl (
    bucket,
    subject,
    request_count,
    limit_value,
    window_seconds,
    window_started_at,
    updated_at
  )
  VALUES (
    BTRIM(p_function_name),
    p_subject_id,
    1,
    p_limit,
    p_window_seconds,
    v_now,
    v_now
  )
  ON CONFLICT (bucket, subject)
  DO UPDATE
  SET request_count = CASE
        WHEN erl.window_seconds <> EXCLUDED.window_seconds
          OR erl.window_started_at
             + pg_catalog.make_interval(secs => erl.window_seconds)
             <= v_now
          THEN 1
        ELSE LEAST(
          erl.request_count::BIGINT + 1,
          2147483647::BIGINT
        )::INTEGER
      END,
      limit_value = EXCLUDED.limit_value,
      window_seconds = EXCLUDED.window_seconds,
      window_started_at = CASE
        WHEN erl.window_seconds <> EXCLUDED.window_seconds
          OR erl.window_started_at
             + pg_catalog.make_interval(secs => erl.window_seconds)
             <= v_now
          THEN v_now
        ELSE erl.window_started_at
      END,
      updated_at = v_now
  RETURNING request_count, window_started_at
  INTO v_count, v_window_started_at;

  v_reset_at := v_window_started_at
    + pg_catalog.make_interval(secs => p_window_seconds);

  RETURN QUERY
  SELECT
    v_count <= p_limit,
    GREATEST(p_limit - v_count, 0),
    CASE
      WHEN v_count <= p_limit THEN 0
      ELSE GREATEST(
        CEIL(EXTRACT(EPOCH FROM (v_reset_at - v_now)))::INTEGER,
        1
      )
    END,
    v_reset_at;
END;
$consume_edge_rate_limit$;

REVOKE ALL ON FUNCTION public.consume_edge_rate_limit(UUID, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_edge_rate_limit(UUID, TEXT, INTEGER, INTEGER)
  TO service_role;

-- --------------------------------------------------------------------------
-- 10. Solicitação de exclusão de paciente (sem executor automático)
--
-- Esta estrutura registra intenção e trilha; não exclui, anonimiza ou cascateia
-- nenhum dado. A transição para `executed` e a política de retenção só podem
-- nascer em migration futura, depois de definição jurídica, RPO, backup e
-- procedimento de recuperação. O FK RESTRICT impede cascade acidental.
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.patient_deletion_requests (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  patient_id UUID NOT NULL
    REFERENCES public.patients(id) ON DELETE RESTRICT,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed')),
  decided_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decided_at TIMESTAMPTZ,
  decision_note TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS patient_deletion_one_pending_idx
  ON public.patient_deletion_requests(patient_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS patient_deletion_requests_clinic_idx
  ON public.patient_deletion_requests(clinic_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.patient_deletion_request_audit (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  request_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  actor_id UUID,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS patient_deletion_audit_request_idx
  ON public.patient_deletion_request_audit(request_id, occurred_at);

ALTER TABLE public.patient_deletion_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_deletion_request_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_deletion_requests_select_authorized
  ON public.patient_deletion_requests;
CREATE POLICY patient_deletion_requests_select_authorized
  ON public.patient_deletion_requests
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND (
      requested_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.patients p
        WHERE p.id = patient_deletion_requests.patient_id
          AND p.therapist_id = auth.uid()
      )
      OR (
        (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
        AND clinic_id IS NOT NULL
        AND clinic_id = public.user_clinic_id(auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS patient_deletion_audit_select_authorized
  ON public.patient_deletion_request_audit;
CREATE POLICY patient_deletion_audit_select_authorized
  ON public.patient_deletion_request_audit
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.patient_deletion_requests pdr
      WHERE pdr.id = patient_deletion_request_audit.request_id
        AND (
          pdr.requested_by = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.patients p
            WHERE p.id = pdr.patient_id
              AND p.therapist_id = auth.uid()
          )
          OR (
            (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
            AND pdr.clinic_id IS NOT NULL
            AND pdr.clinic_id = public.user_clinic_id(auth.uid())
          )
        )
    )
  );

REVOKE ALL ON TABLE public.patient_deletion_requests
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.patient_deletion_request_audit
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.patient_deletion_requests TO authenticated;
GRANT SELECT ON TABLE public.patient_deletion_request_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_patient_deletion_request_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $enforce_patient_deletion_request_history$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION
      'Solicitações de exclusão são append-only e não podem ser removidas.'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.clinic_id IS DISTINCT FROM OLD.clinic_id
     OR NEW.requested_by IS DISTINCT FROM OLD.requested_by
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.reason IS DISTINCT FROM OLD.reason THEN
    RAISE EXCEPTION
      'Identidade e motivo da solicitação de exclusão são imutáveis.'
      USING ERRCODE = '55000';
  END IF;

  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('approved', 'rejected'))
    OR (OLD.status = 'approved' AND NEW.status = 'executed')
  ) THEN
    RAISE EXCEPTION 'Transição inválida da solicitação de exclusão.'
      USING ERRCODE = '22023';
  END IF;

  IF NEW.decided_by IS NULL OR NEW.decided_at IS NULL THEN
    RAISE EXCEPTION 'Decisão exige responsável e data.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$enforce_patient_deletion_request_history$;

DROP TRIGGER IF EXISTS patient_deletion_request_enforce_history
  ON public.patient_deletion_requests;
CREATE TRIGGER patient_deletion_request_enforce_history
  BEFORE UPDATE OR DELETE
  ON public.patient_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_patient_deletion_request_history();

CREATE OR REPLACE FUNCTION public.audit_patient_deletion_request_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $audit_patient_deletion_request_change$
BEGIN
  INSERT INTO public.patient_deletion_request_audit (
    request_id,
    patient_id,
    actor_id,
    action,
    from_status,
    to_status
  )
  VALUES (
    NEW.id,
    NEW.patient_id,
    COALESCE(auth.uid(), NEW.decided_by, NEW.requested_by),
    CASE WHEN TG_OP = 'INSERT' THEN 'requested' ELSE 'status_changed' END,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END,
    NEW.status
  );

  RETURN NEW;
END;
$audit_patient_deletion_request_change$;

DROP TRIGGER IF EXISTS patient_deletion_request_audit_change
  ON public.patient_deletion_requests;
CREATE TRIGGER patient_deletion_request_audit_change
  AFTER INSERT OR UPDATE
  ON public.patient_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_patient_deletion_request_change();

CREATE OR REPLACE FUNCTION public.reject_patient_deletion_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $reject_patient_deletion_audit_mutation$
BEGIN
  RAISE EXCEPTION
    'Auditoria de exclusão é imutável.'
    USING ERRCODE = '55000';
END;
$reject_patient_deletion_audit_mutation$;

DROP TRIGGER IF EXISTS patient_deletion_audit_reject_mutation
  ON public.patient_deletion_request_audit;
CREATE TRIGGER patient_deletion_audit_reject_mutation
  BEFORE UPDATE OR DELETE
  ON public.patient_deletion_request_audit
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_patient_deletion_audit_mutation();

REVOKE ALL ON FUNCTION public.enforce_patient_deletion_request_history()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_patient_deletion_request_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reject_patient_deletion_audit_mutation()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.request_patient_deletion(
  p_patient_id UUID,
  p_reason TEXT
)
RETURNS TABLE (
  request_id UUID,
  status TEXT,
  requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $request_patient_deletion$
DECLARE
  v_uid UUID := auth.uid();
  v_patient_clinic UUID;
  v_patient_owner UUID;
  v_request public.patient_deletion_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: usuário sem gate clínico ativo.'
      USING ERRCODE = '42501';
  END IF;

  IF NULLIF(BTRIM(p_reason), '') IS NULL
     OR char_length(BTRIM(p_reason)) < 10
     OR char_length(BTRIM(p_reason)) > 4000 THEN
    RAISE EXCEPTION
      'Motivo deve ter entre 10 e 4.000 caracteres.'
      USING ERRCODE = '22023';
  END IF;

  SELECT p.clinic_id, p.therapist_id
  INTO v_patient_clinic, v_patient_owner
  FROM public.patients p
  WHERE p.id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paciente não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_patient_owner <> v_uid
     AND NOT (
       (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
       AND v_patient_clinic IS NOT NULL
       AND v_patient_clinic = public.user_clinic_id(v_uid)
     ) THEN
    RAISE EXCEPTION
      'Acesso negado: somente responsável ou administração da clínica.'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'patient-deletion-request:' || p_patient_id::TEXT,
      0
    )
  );

  -- Arquivamento recuperável e idempotente: retira o paciente das listas
  -- ativas sem apagar prontuário, fotos, auditoria ou vínculos.
  UPDATE public.patients p
  SET archived_at = pg_catalog.clock_timestamp()
  WHERE p.id = p_patient_id
    AND p.archived_at IS NULL;

  SELECT pdr.*
  INTO v_request
  FROM public.patient_deletion_requests pdr
  WHERE pdr.patient_id = p_patient_id
    AND pdr.status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.patient_deletion_requests (
      patient_id,
      clinic_id,
      requested_by,
      reason
    )
    VALUES (
      p_patient_id,
      v_patient_clinic,
      v_uid,
      BTRIM(p_reason)
    )
    RETURNING * INTO v_request;
  END IF;

  RETURN QUERY
  SELECT v_request.id, v_request.status, v_request.requested_at;
END;
$request_patient_deletion$;

REVOKE ALL ON FUNCTION public.request_patient_deletion(UUID, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_patient_deletion(UUID, TEXT)
  TO authenticated;

-- A partir daqui nenhuma RPC clínica atual lê app_config. A exclusão remove a
-- cópia em texto puro após o preflight provar que o segredo do Vault existe.
DELETE FROM public.app_config
WHERE key = 'encryption_key';

NOTIFY pgrst, 'reload schema';
