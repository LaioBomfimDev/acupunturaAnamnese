-- ============================================================
-- APLICAR NO SUPABASE — Clínica multidisciplinar (Fases 1, 2, 3 e 5 + IA Psi)
-- Gerado de: 20260707_profile_disciplines.sql
--            20260708_clinic_patients_enrollments.sql
--            20260709_record_shares.sql
--            20260710_insert_record_discipline.sql
--            20260711_ai_corrections_psychology.sql
--
-- É IDEMPOTENTE: pode rodar inteiro no SQL Editor mesmo que parte
-- já tenha sido aplicada. Rode de uma vez, na ordem abaixo.
-- ============================================================


-- ========== FASE 1 ==========
-- ==========================================================
-- Disciplinas liberadas por profissional (clínica multidisciplinar)
-- Fase 1 do plano docs/plano-clinica-multidisciplinar.md.
--
-- `disciplines` diz quais workspaces o hub libera para o perfil
-- (acupuntura, fisioterapia, psicologia, nutricao). É separado de
-- `profession` (registro formal/conselho): a CEO pode ser psicóloga
-- de registro e atender em três disciplinas.
--
-- Migração ADITIVA e reversível: coluna nova com default; nenhuma
-- política de RLS muda aqui (isso é a Fase 2).
-- ==========================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disciplines TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.disciplines IS
  'Workspaces liberados no hub (acupuntura, fisioterapia, psicologia, nutricao). Fonte: docs/plano-clinica-multidisciplinar.md';

-- ----------------------------------------------------------
-- Backfill 1: todo perfil sem disciplinas → acupuntura.
-- O sistema inteiro era MTC até aqui; ninguém perde acesso na virada.
-- ----------------------------------------------------------
UPDATE public.profiles
SET disciplines = ARRAY['acupuntura']
WHERE COALESCE(array_length(disciplines, 1), 0) = 0;

-- ----------------------------------------------------------
-- Backfill 2: profissão conhecida ganha a própria disciplina
-- (mantendo acupuntura — remoção é decisão manual do SuperAdm).
-- ----------------------------------------------------------
UPDATE public.profiles
SET disciplines = disciplines || ARRAY['fisioterapia']
WHERE profession IN ('fisioterapeuta', 'terapeuta_ocupacional')
  AND NOT disciplines @> ARRAY['fisioterapia'];

UPDATE public.profiles
SET disciplines = disciplines || ARRAY['psicologia']
WHERE profession = 'psicologo'
  AND NOT disciplines @> ARRAY['psicologia'];

UPDATE public.profiles
SET disciplines = disciplines || ARRAY['nutricao']
WHERE profession = 'nutricionista'
  AND NOT disciplines @> ARRAY['nutricao'];

-- ----------------------------------------------------------
-- Backfill 3: contas de teste do Laio → todas as disciplinas
-- (decisão 2026-07-07: admLaio, admDeni e admKaren multi-disciplina).
-- ----------------------------------------------------------
UPDATE public.profiles
SET disciplines = ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']
WHERE LOWER(COALESCE(username, '')) IN ('admlaio', 'admdeni', 'admkaren');

-- ========== FASE 2 ==========
-- ==========================================================
-- Paciente da clínica + matrículas por disciplina (Fase 2)
-- Plano: docs/plano-clinica-multidisciplinar.md
-- REQUER: 20260707_profile_disciplines.sql aplicada antes
-- (o bloco abaixo reafirma a coluna por segurança/idempotência).
--
-- O que muda:
--  * patients.clinic_id — o paciente passa a pertencer à CLÍNICA;
--  * patient_enrollments — "enviar para outra disciplina" vira
--    matrícula (NUNCA cópia do paciente);
--  * clinical_records.discipline — todo registro carrega a
--    disciplina que o gerou (histórico existente = acupuntura).
--
-- O que NÃO muda (de propósito, ética/Fase 3):
--  * o CONTEÚDO clínico (clinical_records) continua visível só
--    para quem o criou (auth.uid() = therapist_id). A abertura por
--    disciplina + compartilhamento explícito (record_shares) é a
--    Fase 3, junto com a UI de cadeados.
--  * Colegas da mesma clínica que compartilham disciplina com o
--    paciente passam a ver apenas o CADASTRO (nome/contato) e as
--    matrículas — nunca anamnese/relatório.
--
-- Migração aditiva: políticas antigas permanecem intactas.
-- ==========================================================

-- Idempotência com a Fase 1 (não falha se já aplicada).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS disciplines TEXT[] NOT NULL DEFAULT '{}';

-- ----------------------------------------------------------
-- Helpers de RLS (SECURITY DEFINER evita recursão de políticas;
-- search_path fixo — ver incidente 20260702 de hardening).
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_clinic_id(p_user UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT clinic_id FROM public.profiles WHERE id = p_user;
$$;

CREATE OR REPLACE FUNCTION public.user_disciplines(p_user UUID)
RETURNS TEXT[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(disciplines, '{}') FROM public.profiles WHERE id = p_user;
$$;

REVOKE EXECUTE ON FUNCTION public.user_clinic_id(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_disciplines(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.user_clinic_id(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_disciplines(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 1) Paciente pertence à clínica
-- ----------------------------------------------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_patients_clinic_id ON public.patients(clinic_id);

-- Backfill: clínica do terapeuta atual do paciente.
UPDATE public.patients p
SET clinic_id = pr.clinic_id
FROM public.profiles pr
WHERE pr.id = p.therapist_id
  AND p.clinic_id IS NULL
  AND pr.clinic_id IS NOT NULL;

-- Novos pacientes herdam a clínica de quem cadastra.
CREATE OR REPLACE FUNCTION public.set_patient_clinic()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    NEW.clinic_id := public.user_clinic_id(NEW.therapist_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_patient_clinic ON public.patients;
CREATE TRIGGER trg_set_patient_clinic
  BEFORE INSERT ON public.patients
  FOR EACH ROW EXECUTE FUNCTION public.set_patient_clinic();

-- ----------------------------------------------------------
-- 2) Registro clínico carrega a disciplina que o gerou
-- (acesso NÃO muda aqui — segue owner-only até a Fase 3)
-- ----------------------------------------------------------
ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'acupuntura'
  CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao'));

CREATE INDEX IF NOT EXISTS idx_clinical_records_discipline
  ON public.clinical_records(patient_id, discipline);

-- ----------------------------------------------------------
-- 3) Matrículas por disciplina (o "enviar para outra área")
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.patient_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  discipline TEXT NOT NULL CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'discharged')),
  referred_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (patient_id, discipline)
);

CREATE INDEX IF NOT EXISTS idx_patient_enrollments_clinic
  ON public.patient_enrollments(clinic_id, discipline);

CREATE OR REPLACE FUNCTION public.set_enrollment_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT p.clinic_id INTO NEW.clinic_id FROM public.patients p WHERE p.id = NEW.patient_id;
  END IF;
  IF NEW.referred_by IS NULL THEN
    NEW.referred_by := auth.uid();
  END IF;
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enrollment_defaults ON public.patient_enrollments;
CREATE TRIGGER trg_enrollment_defaults
  BEFORE INSERT OR UPDATE ON public.patient_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.set_enrollment_defaults();

ALTER TABLE public.patient_enrollments ENABLE ROW LEVEL SECURITY;

-- Ver matrículas: mesma clínica OU paciente próprio (terapeuta sem clínica).
-- Matrícula é metadado ("está em atendimento na nutri"), nunca conteúdo clínico.
DROP POLICY IF EXISTS enrollments_select_clinic ON public.patient_enrollments;
CREATE POLICY enrollments_select_clinic ON public.patient_enrollments
  FOR SELECT TO authenticated
  USING (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  );

-- Matricular ("enviar para outra área"): mesma clínica ou paciente próprio.
DROP POLICY IF EXISTS enrollments_insert_clinic ON public.patient_enrollments;
CREATE POLICY enrollments_insert_clinic ON public.patient_enrollments
  FOR INSERT TO authenticated
  WITH CHECK (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  );

-- Atualizar status (ativa/pausada/alta): mesmos limites.
DROP POLICY IF EXISTS enrollments_update_clinic ON public.patient_enrollments;
CREATE POLICY enrollments_update_clinic ON public.patient_enrollments
  FOR UPDATE TO authenticated
  USING (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  )
  WITH CHECK (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_id AND p.therapist_id = auth.uid()
    )
  );

-- SEM política de DELETE: matrícula não se apaga, muda de status
-- (integridade do registro clínico; a exclusão do paciente cascateia).
GRANT SELECT, INSERT, UPDATE ON public.patient_enrollments TO authenticated;

-- Helper depende da tabela — criado após ela.
CREATE OR REPLACE FUNCTION public.patient_shares_user_discipline(p_patient UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.patient_enrollments e
    WHERE e.patient_id = p_patient
      AND e.discipline = ANY (public.user_disciplines(p_user))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.patient_shares_user_discipline(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.patient_shares_user_discipline(UUID, UUID) TO authenticated;

-- Backfill: todo paciente existente já era um caso de acupuntura.
INSERT INTO public.patient_enrollments (patient_id, clinic_id, discipline, referred_by, assigned_to, created_at)
SELECT p.id, p.clinic_id, 'acupuntura', p.therapist_id, p.therapist_id, COALESCE(p.created_at, timezone('utc', now()))
FROM public.patients p
ON CONFLICT (patient_id, discipline) DO NOTHING;

-- ----------------------------------------------------------
-- 4) Cadastro do paciente visível para colegas da clínica que
-- compartilham disciplina com ele (política ADICIONAL de SELECT;
-- a política antiga do dono segue valendo para INSERT/UPDATE/DELETE)
-- ----------------------------------------------------------
DROP POLICY IF EXISTS patients_select_clinic_discipline ON public.patients;
CREATE POLICY patients_select_clinic_discipline ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND public.patient_shares_user_discipline(id, auth.uid())
  );

-- ========== FASE 3 ==========
-- ==========================================================
-- Compartilhamento de prontuário entre disciplinas (Fase 3)
-- Plano: docs/plano-clinica-multidisciplinar.md
-- REQUER: 20260707 e 20260708 aplicadas antes (reafirmadas por
-- segurança/idempotência abaixo).
--
-- O que muda:
--  * record_shares — encaminhamento explícito: profissional A
--    escolhe O QUE compartilha (escopos) com a disciplina B;
--  * is_clinic_admin() — o Adm da clínica (CEO) enxerga e age
--    sobre tudo DA SUA clínica (inclusive enviar);
--  * get_shared_session() — RPC de leitura que autoriza por
--    compartilhamento/admin (a get_clinical_records original, que
--    é dona-somente, permanece INTACTA — nada de risco nela).
--
-- LIMITE HONESTO: a sessão clínica é um único registro criptografado
-- ('full_session'). Portanto o BANCO garante o acesso no nível da
-- SESSÃO (o colega autorizado lê a sessão compartilhada); a escolha
-- de facetas (resumo/dores/progressão) é registrada em shared_scopes
-- para consentimento/auditoria e HONRADA na visualização. Separar
-- cada faceta em fronteira criptográfica é trabalho futuro.
--
-- Escrita clínica continua dona-somente. Compartilhamento é revogável
-- e auditável. Migração aditiva.
-- ==========================================================

-- Idempotência com Fases 1 e 2.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disciplines TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.patients ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL;

-- ----------------------------------------------------------
-- Adm da clínica (CEO): mais que profissional, menos que SuperAdm.
-- Espelha is_super_admin (20260522): ativo e sem troca de senha pendente.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_clinic_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_user_id
      AND p.role = 'clinic_admin'
      AND p.is_active IS TRUE
      AND p.must_change_password IS NOT TRUE
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_clinic_admin(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_clinic_admin(UUID) TO authenticated;

-- ----------------------------------------------------------
-- record_shares — o "enviar para outro profissional/disciplina"
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.record_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  from_discipline TEXT NOT NULL CHECK (from_discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  to_discipline TEXT NOT NULL CHECK (to_discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao')),
  -- Facetas escolhidas pelo profissional (cadastro sempre incluso na origem).
  shared_scopes TEXT[] NOT NULL DEFAULT '{}',
  shared_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  revoked_at TIMESTAMPTZ,
  CHECK (from_discipline <> to_discipline)
);

CREATE INDEX IF NOT EXISTS idx_record_shares_patient ON public.record_shares(patient_id);
CREATE INDEX IF NOT EXISTS idx_record_shares_active
  ON public.record_shares(patient_id, to_discipline) WHERE revoked_at IS NULL;

-- Preenche clinic_id e shared_by a partir do contexto.
CREATE OR REPLACE FUNCTION public.set_record_share_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS NULL THEN
    SELECT p.clinic_id INTO NEW.clinic_id FROM public.patients p WHERE p.id = NEW.patient_id;
  END IF;
  IF NEW.shared_by IS NULL THEN
    NEW.shared_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_record_share_defaults ON public.record_shares;
CREATE TRIGGER trg_record_share_defaults
  BEFORE INSERT ON public.record_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_record_share_defaults();

ALTER TABLE public.record_shares ENABLE ROW LEVEL SECURITY;

-- Ver os compartilhamentos: quem é da clínica (metadado do encaminhamento).
DROP POLICY IF EXISTS record_shares_select_clinic ON public.record_shares;
CREATE POLICY record_shares_select_clinic ON public.record_shares
  FOR SELECT TO authenticated
  USING (
    (clinic_id IS NOT NULL AND clinic_id = public.user_clinic_id(auth.uid()))
    OR shared_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.therapist_id = auth.uid())
  );

-- Criar compartilhamento (enviar): dono do paciente OU adm/superadm da clínica.
DROP POLICY IF EXISTS record_shares_insert ON public.record_shares;
CREATE POLICY record_shares_insert ON public.record_shares
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.patients p WHERE p.id = patient_id AND p.therapist_id = auth.uid())
    OR (
      (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
      AND EXISTS (
        SELECT 1 FROM public.patients p
        WHERE p.id = patient_id AND p.clinic_id = public.user_clinic_id(auth.uid())
      )
    )
  );

-- Revogar (UPDATE de revoked_at): quem compartilhou OU adm/superadm da clínica.
DROP POLICY IF EXISTS record_shares_update ON public.record_shares;
CREATE POLICY record_shares_update ON public.record_shares
  FOR UPDATE TO authenticated
  USING (
    shared_by = auth.uid()
    OR (
      (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
      AND clinic_id = public.user_clinic_id(auth.uid())
    )
  )
  WITH CHECK (
    shared_by = auth.uid()
    OR (
      (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
      AND clinic_id = public.user_clinic_id(auth.uid())
    )
  );

-- Sem DELETE: compartilhamento se revoga (revoked_at), não se apaga (auditoria).
GRANT SELECT, INSERT, UPDATE ON public.record_shares TO authenticated;

-- ----------------------------------------------------------
-- Adm da clínica enxerga TODOS os pacientes da SUA clínica
-- (política ADICIONAL de SELECT; a do dono da Fase 2 segue valendo).
-- ----------------------------------------------------------
DROP POLICY IF EXISTS patients_select_clinic_admin ON public.patients;
CREATE POLICY patients_select_clinic_admin ON public.patients
  FOR SELECT TO authenticated
  USING (
    clinic_id IS NOT NULL
    AND clinic_id = public.user_clinic_id(auth.uid())
    AND (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  );

-- ----------------------------------------------------------
-- Leitura autorizada da sessão compartilhada.
-- Autoriza por: dono | adm/superadm da clínica | compartilhamento
-- ativo para uma disciplina do chamador. A get_clinical_records
-- original (dona-somente) NÃO é tocada.
-- ----------------------------------------------------------
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
SET search_path = public, extensions
AS $get_shared_session$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_patient_clinic UUID;
  v_authorized BOOLEAN := FALSE;
BEGIN
  SELECT ac.value INTO v_key FROM public.app_config ac WHERE ac.key = 'encryption_key';
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  SELECT p.clinic_id INTO v_patient_clinic FROM public.patients p WHERE p.id = p_patient_id;

  -- Dono do paciente.
  IF EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id AND p.therapist_id = v_uid) THEN
    v_authorized := TRUE;
  -- Adm/SuperAdm da mesma clínica.
  ELSIF (public.is_clinic_admin(v_uid) OR public.is_super_admin(v_uid))
        AND v_patient_clinic IS NOT NULL
        AND v_patient_clinic = public.user_clinic_id(v_uid) THEN
    v_authorized := TRUE;
  -- Compartilhamento ativo para uma disciplina do chamador.
  ELSIF EXISTS (
    SELECT 1 FROM public.record_shares s
    WHERE s.patient_id = p_patient_id
      AND s.revoked_at IS NULL
      AND s.to_discipline = ANY (public.user_disciplines(v_uid))
  ) THEN
    v_authorized := TRUE;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Acesso negado: sem compartilhamento ativo para este paciente.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT AS sensitive_data,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.record_type = 'full_session'
  ORDER BY cr.updated_at DESC;
END;
$get_shared_session$;

REVOKE EXECUTE ON FUNCTION public.get_shared_session(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_shared_session(UUID) TO authenticated;


-- ========== FASE 5 (workspace Psicologia) ==========
-- ==========================================================
-- insert_clinical_record ganha o parâmetro p_discipline (Fase 5)
-- Plano: docs/plano-clinica-multidisciplinar.md
-- REQUER: 20260708_clinic_patients_enrollments.sql aplicada antes
-- (é ela que cria a coluna clinical_records.discipline).
--
-- Motivo: o workspace de Psicologia grava sessões com
-- discipline = 'psicologia'. Até aqui a RPC não recebia a
-- disciplina e toda linha caía no DEFAULT 'acupuntura'.
--
-- Compatibilidade: o parâmetro tem DEFAULT 'acupuntura', então
-- todas as chamadas existentes (3 argumentos) seguem funcionando
-- sem mudança. A função antiga de 3 argumentos é REMOVIDA para o
-- PostgREST não ficar ambíguo entre as duas assinaturas.
-- ==========================================================

-- Idempotência com a Fase 2 (não falha se já aplicada).
ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'acupuntura'
  CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao'));

DROP FUNCTION IF EXISTS public.insert_clinical_record(UUID, TEXT, TEXT);

CREATE FUNCTION public.insert_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT,
  p_discipline TEXT DEFAULT 'acupuntura'
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS '
  INSERT INTO public.clinical_records (
    patient_id,
    therapist_id,
    record_type,
    discipline,
    sensitive_data_encrypted
  )
  SELECT
    p_patient_id,
    auth.uid(),
    p_record_type,
    p_discipline,
    pgp_sym_encrypt(p_data, ac.value)
  FROM public.app_config ac
  WHERE ac.key = ''encryption_key''
    AND p_discipline IN (''acupuntura'', ''fisioterapia'', ''psicologia'', ''nutricao'')
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = p_patient_id
        AND p.therapist_id = auth.uid()
    )
  RETURNING id;
';

REVOKE EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- ========== IA DE PSICOLOGIA (superfícies de correção) ==========
-- Gerado de: 20260711_ai_corrections_psychology.sql
-- O botão "Corrigir" das superfícies novas (psych_marks/psych_reading)
-- grava em ai_corrections; a CHECK anterior não as previa. Idempotente.

ALTER TABLE public.ai_corrections
  DROP CONSTRAINT IF EXISTS ai_corrections_surface_check;

ALTER TABLE public.ai_corrections
  ADD CONSTRAINT ai_corrections_surface_check
    CHECK (surface IN (
      'tongue', 'anamnese_marks', 'clinical_reasoning', 'narrative',
      'library_qa', 'food_research', 'psych_marks', 'psych_reading'
    ));
