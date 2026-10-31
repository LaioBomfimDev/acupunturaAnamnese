-- ==========================================================
-- ABA: programas, coleta, gráficos e times
-- REQUER: 20261101_aba_discipline.sql (área 'aba' nos CHECKs),
-- 20260723_clinical_data_hardening.sql (can_access_clinical_data,
-- user_clinic_id, user_disciplines, is_clinic_admin,
-- get_clinical_encryption_key), 20260915b_patient_suspend_and_erasure.sql
-- (patients.erased_at) e a versão viva de admin_decide_patient_deletion
-- (20261031_convenios_fase1.sql).
--
-- Origem: motor clínico do Atlas (sistema ABA da Integrare), trazido sem
-- dado nenhum — só o desenho. Decisões do usuário em 31/10/2026:
--   * área própria no hub, liberada para quem tem Psicologia;
--   * supervisor = quem lidera o time ABA (aba_care_teams.supervisor_id),
--     não um cargo novo em profiles.role. Ele revisa e assina sessão,
--     aprova programa e convoca colega de outro time; a administração da
--     clínica vê e faz tudo;
--   * coleta separada da evolução: o atendimento continua evoluído na
--     tela Evoluções (20261101_aba_discipline.sql);
--   * cifra híbrida: códigos, números e datas em claro (gráfico, % de
--     independência e critério saem de SQL e do cliente sem decifrar);
--     todo texto livre sobre a criança vai cifrado com a chave do Vault
--     dos prontuários (*_encrypted).
--
-- Quem vê o quê (aba_can_access_patient):
--   * administração da clínica: todos os pacientes da clínica;
--   * profissional com a área 'aba': pacientes do time que supervisiona
--     ou de que é membro; paciente de outro time só com convocação ativa
--     ("atendimento" vale 24h a partir do início; "período" até o fim);
--   * paciente ainda sem time: quem fez a matrícula ABA (referred_by ou
--     assigned_to) atende e supervisiona até a administração escolher o
--     time — sem isso o primeiro psicólogo não conseguia nem criar o
--     primeiro programa.
-- O cadastro do paciente segue a regra geral do Vitalis (matrícula na
-- área libera o cadastro para a área inteira).
--
-- Sem acesso direto às tabelas: RLS ligada, nenhuma policy, REVOKE ALL.
-- Tudo passa pelas RPCs aba_* (SECURITY DEFINER, search_path fixo), que
-- repetem o gate de conta (can_access_clinical_data) em toda chamada.
--
-- A exclusão de paciente (anonimização) passa a copiar e apagar as
-- tabelas ABA. Corpo copiado da versão viva (20261031_convenios_fase1),
-- só com as linhas ABA acrescentadas.
--
-- Reverter: recriar admin_decide_patient_deletion a partir de
-- 20261031_convenios_fase1.sql, DROP FUNCTION das aba_* e DROP TABLE das
-- aba_* (filhas primeiro).
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.patients') IS NULL
     OR to_regclass('public.appointments') IS NULL
     OR to_regclass('public.patient_enrollments') IS NULL
     OR to_regclass('public.patient_coverages') IS NULL
     OR to_regclass('patient_erasure_backup.snapshots') IS NULL
     OR to_regprocedure('public.can_access_clinical_data(uuid)') IS NULL
     OR to_regprocedure('public.get_clinical_encryption_key()') IS NULL
     OR to_regprocedure('public.admin_decide_patient_deletion(uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'ABA: aplique antes as migrations de hardening, exclusão de paciente e convênios.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'patient_enrollments_discipline_check'
      AND pg_get_constraintdef(oid) LIKE '%''aba''::text%'
  ) THEN
    RAISE EXCEPTION 'ABA: aplique antes 20261101_aba_discipline.sql.';
  END IF;
END
$requires$;

-- ----------------------------------------------------------
-- 1. Times
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aba_care_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  supervisor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  archived_at TIMESTAMPTZ
);

-- Um supervisor coordena um time ativo por vez; nomes não se repetem na clínica.
CREATE UNIQUE INDEX IF NOT EXISTS aba_care_teams_one_per_supervisor
  ON public.aba_care_teams(supervisor_id) WHERE archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS aba_care_teams_unique_name
  ON public.aba_care_teams(clinic_id, lower(btrim(name))) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.aba_care_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.aba_care_teams(id) ON DELETE RESTRICT,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT
);

-- Cada terapeuta pertence a um único time ativo.
CREATE UNIQUE INDEX IF NOT EXISTS aba_care_team_members_one_active
  ON public.aba_care_team_members(therapist_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS aba_care_team_members_team
  ON public.aba_care_team_members(team_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.aba_patient_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.aba_care_teams(id) ON DELETE RESTRICT,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  -- Responsáveis diretos dentro do time (o time inteiro continua vendo).
  therapist_ids UUID[] NOT NULL DEFAULT '{}'::UUID[],
  assigned_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT
);

-- A criança fica num único time ativo.
CREATE UNIQUE INDEX IF NOT EXISTS aba_patient_teams_one_active
  ON public.aba_patient_teams(patient_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS aba_patient_teams_team
  ON public.aba_patient_teams(team_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.aba_callouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  team_id UUID REFERENCES public.aba_care_teams(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('atendimento', 'periodo')),
  reason_encrypted BYTEA NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'convocado'
    CHECK (status IN ('convocado', 'aceito', 'concluido', 'recusado', 'cancelado')),
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  acceptance_moment TEXT CHECK (acceptance_moment IN ('antes', 'durante', 'depois')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  response_encrypted BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT aba_callouts_period_check CHECK (
    (kind = 'atendimento' AND ends_at IS NULL)
    OR (kind = 'periodo' AND ends_at IS NOT NULL AND ends_at > starts_at)
  )
);

CREATE INDEX IF NOT EXISTS aba_callouts_patient
  ON public.aba_callouts(patient_id, therapist_id) WHERE status IN ('convocado', 'aceito');

-- ----------------------------------------------------------
-- 2. Configuração da clínica para a coleta
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aba_clinic_settings (
  clinic_id UUID PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  default_trial_count INTEGER NOT NULL DEFAULT 10 CHECK (default_trial_count BETWEEN 1 AND 50),
  program_block_minutes INTEGER NOT NULL DEFAULT 20 CHECK (program_block_minutes BETWEEN 1 AND 240),
  pause_minutes INTEGER NOT NULL DEFAULT 5 CHECK (pause_minutes BETWEEN 1 AND 120),
  correction_window_hours INTEGER NOT NULL DEFAULT 24 CHECK (correction_window_hours BETWEEN 1 AND 168),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- ----------------------------------------------------------
-- 3. Repertório do paciente: reforçadores e comportamentos interferentes
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aba_reinforcers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  category TEXT NOT NULL CHECK (category IN (
    'social', 'tangivel', 'alimentar', 'sensorial', 'atividade', 'eletronico', 'outro'
  )),
  initial_preference TEXT NOT NULL CHECK (initial_preference IN ('alta', 'media', 'baixa')),
  notes_encrypted BYTEA,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS aba_reinforcers_patient ON public.aba_reinforcers(patient_id);

CREATE TABLE IF NOT EXISTS public.aba_interfering_behaviors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  measure TEXT NOT NULL CHECK (char_length(btrim(measure)) BETWEEN 1 AND 40),
  habitual_intensity TEXT CHECK (habitual_intensity IS NULL OR char_length(habitual_intensity) <= 20),
  -- Definição operacional, hipótese funcional, orientação de segurança e
  -- observações: texto livre sobre a criança.
  details_encrypted BYTEA NOT NULL,
  -- A hipótese funcional e o plano de segurança existem (sem revelar o
  -- texto): é o que libera um procedimento restrito no programa.
  has_safety_plan BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review', 'approved', 'inactive')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS aba_interfering_behaviors_patient
  ON public.aba_interfering_behaviors(patient_id);

-- ----------------------------------------------------------
-- 4. Programas (aquisição e redução)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aba_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('aquisicao', 'reducao')),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'em_ensino' CHECK (status IN (
    'planejado', 'em_ensino', 'criterio_atingido_na_sessao', 'aquisicao',
    'generalizacao', 'manutencao', 'concluido', 'pausado', 'extinto'
  )),
  collection_type TEXT NOT NULL CHECK (char_length(collection_type) BETWEEN 1 AND 40),
  trial_count INTEGER CHECK (trial_count IS NULL OR trial_count BETWEEN 1 AND 50),
  measure TEXT CHECK (measure IS NULL OR measure IN (
    'frequencia', 'taxa', 'duracao', 'latencia', 'intensidade',
    'intervalo_parcial', 'intervalo_total', 'amostragem_momentanea'
  )),
  unit TEXT CHECK (unit IS NULL OR char_length(unit) <= 40),
  procedure TEXT CHECK (procedure IS NULL OR char_length(procedure) <= 80),
  -- Configuração do plano (objetivo, alvo, critério, hierarquia de ajuda,
  -- etapas…): estrutura do plano, vinda em boa parte do catálogo.
  definition JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(definition) = 'object' AND octet_length(definition::TEXT) <= 32768),
  notes_encrypted BYTEA,
  -- Procedimento restrito: autorização nominal da supervisão, carimbada
  -- pelo banco com quem está logado.
  restricted_behavior_id UUID REFERENCES public.aba_interfering_behaviors(id) ON DELETE RESTRICT,
  restricted_authorization_encrypted BYTEA,
  restricted_authorized_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  restricted_authorized_at TIMESTAMPTZ,
  therapist_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  protocol_start_date DATE,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  archived_at TIMESTAMPTZ,
  CONSTRAINT aba_programs_type_fields CHECK (
    (type = 'aquisicao' AND trial_count IS NOT NULL AND measure IS NULL)
    OR (type = 'reducao' AND measure IS NOT NULL AND unit IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS aba_programs_patient ON public.aba_programs(patient_id);

-- ----------------------------------------------------------
-- 5. Sessões de coleta
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aba_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  therapist_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  supervisor_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- Coleta e evolução são separadas: o vínculo com a Agenda é opcional.
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  client_event_id UUID NOT NULL,
  session_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  location TEXT NOT NULL DEFAULT 'clinica'
    CHECK (location IN ('clinica', 'casa', 'escola', 'comunidade', 'online', 'outro')),
  material TEXT CHECK (material IS NULL OR char_length(material) <= 80),
  people_present TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_generalization_probe BOOLEAN NOT NULL DEFAULT FALSE,
  generalization_condition TEXT CHECK (generalization_condition IS NULL OR generalization_condition IN (
    'pessoa', 'material', 'ambiente', 'instrucao', 'rotina', 'reforcador'
  )),
  -- Estado de chegada, condição de saúde, mudança de rotina, motivação
  -- aparente e notas da sessão.
  private_encrypted BYTEA,
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento', 'incompleta', 'finalizada', 'corrigida')),
  review_status TEXT NOT NULL DEFAULT 'pending_review' CHECK (review_status IN (
    'pending_review', 'correction_requested', 'corrected_pending_review', 'approved'
  )),
  finalized_at TIMESTAMPTZ,
  correction_deadline TIMESTAMPTZ,
  correction_requested_at TIMESTAMPTZ,
  correction_requested_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  corrected_at TIMESTAMPTZ,
  corrected_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  signed_at TIMESTAMPTZ,
  signed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  signature_statement TEXT,
  -- Motivo da correção, resposta do terapeuta e parecer da supervisão.
  review_private_encrypted BYTEA,
  revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT aba_sessions_client_event UNIQUE (clinic_id, client_event_id),
  CONSTRAINT aba_sessions_times CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT aba_sessions_finalized CHECK (
    status = 'em_andamento' OR (ended_at IS NOT NULL AND finalized_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS aba_sessions_patient ON public.aba_sessions(patient_id, started_at DESC);
CREATE INDEX IF NOT EXISTS aba_sessions_review
  ON public.aba_sessions(clinic_id, review_status) WHERE status <> 'em_andamento';

CREATE TABLE IF NOT EXISTS public.aba_session_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES public.aba_programs(id) ON DELETE RESTRICT,
  -- Como o programa estava no dia: o gráfico e o critério leem a ficha
  -- que foi aplicada, não a versão editada depois.
  program_snapshot JSONB NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  phase TEXT NOT NULL DEFAULT 'intervencao'
    CHECK (phase IN ('linha_de_base', 'intervencao', 'generalizacao', 'manutencao')),
  CONSTRAINT aba_session_programs_unique_program UNIQUE (session_id, program_id),
  CONSTRAINT aba_session_programs_unique_sequence UNIQUE (session_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.aba_trial_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  session_program_id UUID NOT NULL REFERENCES public.aba_session_programs(id) ON DELETE CASCADE,
  trial_index INTEGER NOT NULL CHECK (trial_index BETWEEN 1 AND 50),
  response TEXT NOT NULL CHECK (response IN (
    'independente', 'ajuda_verbal', 'ajuda_gestual', 'ajuda_visual', 'modelacao',
    'fisica_parcial', 'fisica_total', 'aproximada', 'erro', 'sem_resposta',
    'recusa', 'nao_aplicavel'
  )),
  recorded_seconds NUMERIC CHECK (recorded_seconds IS NULL OR recorded_seconds BETWEEN 0 AND 86400),
  CONSTRAINT aba_trial_records_unique_index UNIQUE (session_program_id, trial_index)
);

CREATE TABLE IF NOT EXISTS public.aba_reduction_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  session_program_id UUID NOT NULL REFERENCES public.aba_session_programs(id) ON DELETE CASCADE,
  value NUMERIC NOT NULL DEFAULT 0 CHECK (value >= 0 AND value <= 1000000),
  unit TEXT NOT NULL CHECK (char_length(unit) <= 40),
  intensity TEXT CHECK (intensity IS NULL OR char_length(intensity) <= 40),
  interval_marks BOOLEAN[],
  observed_seconds NUMERIC CHECK (observed_seconds IS NULL OR observed_seconds BETWEEN 0 AND 86400),
  CONSTRAINT aba_reduction_measurements_unique_program UNIQUE (session_program_id)
);

CREATE TABLE IF NOT EXISTS public.aba_session_pauses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  CONSTRAINT aba_session_pauses_times CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE IF NOT EXISTS public.aba_reinforcer_uses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  reinforcer_id UUID NOT NULL REFERENCES public.aba_reinforcers(id) ON DELETE RESTRICT,
  program_id UUID REFERENCES public.aba_programs(id) ON DELETE SET NULL,
  uses INTEGER NOT NULL CHECK (uses BETWEEN 1 AND 10000),
  access_minutes NUMERIC NOT NULL DEFAULT 0 CHECK (access_minutes BETWEEN 0 AND 1440),
  efficiency TEXT NOT NULL CHECK (efficiency IN (
    'muito_eficiente', 'eficiente', 'parcialmente_eficiente', 'ineficaz', 'recusado'
  ))
);

CREATE TABLE IF NOT EXISTS public.aba_behavior_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  behavior_id UUID NOT NULL REFERENCES public.aba_interfering_behaviors(id) ON DELETE RESTRICT,
  program_id UUID REFERENCES public.aba_programs(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 10000),
  intensity TEXT CHECK (intensity IS NULL OR char_length(intensity) <= 40),
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  moment TEXT CHECK (moment IS NULL OR char_length(moment) <= 8),
  new_behavior BOOLEAN NOT NULL DEFAULT FALSE,
  -- Antecedente, consequência e conduta.
  abc_encrypted BYTEA NOT NULL
);

CREATE TABLE IF NOT EXISTS public.aba_risk_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  severity TEXT CHECK (severity IS NULL OR severity IN ('leve', 'moderada', 'alta')),
  duration_minutes NUMERIC NOT NULL DEFAULT 0 CHECK (duration_minutes BETWEEN 0 AND 1440),
  -- Situação, risco identificado, intervenção, pessoas presentes, lesão,
  -- acompanhamento e comunicação ao responsável.
  details_encrypted BYTEA NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'reviewed')),
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  review_encrypted BYTEA,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.aba_session_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES public.aba_sessions(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN (
    'correction_requested', 'correction_submitted', 'approved_and_signed'
  )),
  actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  notes_encrypted BYTEA,
  -- Na correção: os registros como estavam antes, para a auditoria.
  previous_encrypted BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS aba_session_children_session ON public.aba_session_programs(session_id);
CREATE INDEX IF NOT EXISTS aba_trial_records_session ON public.aba_trial_records(session_id);
CREATE INDEX IF NOT EXISTS aba_reduction_measurements_session ON public.aba_reduction_measurements(session_id);
CREATE INDEX IF NOT EXISTS aba_session_pauses_session ON public.aba_session_pauses(session_id);
CREATE INDEX IF NOT EXISTS aba_reinforcer_uses_session ON public.aba_reinforcer_uses(session_id);
CREATE INDEX IF NOT EXISTS aba_behavior_events_session ON public.aba_behavior_events(session_id);
CREATE INDEX IF NOT EXISTS aba_risk_incidents_session ON public.aba_risk_incidents(session_id);
CREATE INDEX IF NOT EXISTS aba_session_reviews_session ON public.aba_session_reviews(session_id);

-- Nenhuma leitura ou escrita direta: só as RPCs abaixo.
DO $aba_lock_tables$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'aba_care_teams', 'aba_care_team_members', 'aba_patient_teams', 'aba_callouts',
    'aba_clinic_settings', 'aba_reinforcers', 'aba_interfering_behaviors', 'aba_programs',
    'aba_sessions', 'aba_session_programs', 'aba_trial_records', 'aba_reduction_measurements',
    'aba_session_pauses', 'aba_reinforcer_uses', 'aba_behavior_events', 'aba_risk_incidents',
    'aba_session_reviews'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
  END LOOP;
END
$aba_lock_tables$;

-- ----------------------------------------------------------
-- 6. Cifra (internas, ninguém de fora chama)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_encrypt(p_value TEXT)
RETURNS BYTEA
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_encrypt$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL::BYTEA
    ELSE extensions.pgp_sym_encrypt(p_value, public.get_clinical_encryption_key())
  END;
$aba_encrypt$;

CREATE OR REPLACE FUNCTION public.aba_decrypt_json(p_value BYTEA, p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_decrypt_json$
  SELECT CASE
    WHEN p_value IS NULL THEN '{}'::JSONB
    ELSE extensions.pgp_sym_decrypt(p_value, p_key)::JSONB
  END;
$aba_decrypt_json$;

CREATE OR REPLACE FUNCTION public.aba_decrypt_text(p_value BYTEA, p_key TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_decrypt_text$
  SELECT CASE
    WHEN p_value IS NULL THEN NULL::TEXT
    ELSE extensions.pgp_sym_decrypt(p_value, p_key)
  END;
$aba_decrypt_text$;

-- Texto livre: corta espaço, limita tamanho, vazio vira nulo.
CREATE OR REPLACE FUNCTION public.aba_clean_text(p_value TEXT, p_max INTEGER)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $aba_clean_text$
  SELECT NULLIF(left(btrim(COALESCE(p_value, '')), p_max), '');
$aba_clean_text$;

-- Procedimentos que exigem análise funcional, plano de segurança e
-- autorização nominal (mesma lista do Atlas, clinical-catalog.ts).
CREATE OR REPLACE FUNCTION public.aba_is_restricted_procedure(p_procedure TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $aba_is_restricted_procedure$
  SELECT lower(btrim(COALESCE(p_procedure, ''))) = ANY (ARRAY[
    'extinção', 'extincao',
    'extinção de fuga', 'extincao de fuga',
    'interrupção e redirecionamento', 'interrupcao e redirecionamento',
    'bloqueio de resposta',
    'exposição gradual', 'exposicao gradual'
  ]::TEXT[]);
$aba_is_restricted_procedure$;

-- ----------------------------------------------------------
-- 7. Quem vê e quem supervisiona
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_patient_team_id(p_patient UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_patient_team_id$
  SELECT link.team_id
  FROM public.aba_patient_teams link
  JOIN public.aba_care_teams team ON team.id = link.team_id AND team.archived_at IS NULL
  WHERE link.patient_id = p_patient
    AND link.ended_at IS NULL
  LIMIT 1;
$aba_patient_team_id$;

CREATE OR REPLACE FUNCTION public.aba_is_aba_professional(p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_is_aba_professional$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = p_user
      AND profile.is_active IS TRUE
      AND profile.role IN ('therapist', 'clinic_admin')
      AND 'aba' = ANY(COALESCE(profile.disciplines, '{}'::TEXT[]))
  );
$aba_is_aba_professional$;

CREATE OR REPLACE FUNCTION public.aba_has_active_callout(p_patient UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_has_active_callout$
  SELECT EXISTS (
    SELECT 1
    FROM public.aba_callouts callout
    WHERE callout.patient_id = p_patient
      AND callout.therapist_id = p_user
      AND callout.status IN ('convocado', 'aceito')
      AND callout.starts_at <= clock_timestamp()
      AND (
        (callout.kind = 'atendimento' AND clock_timestamp() < callout.starts_at + INTERVAL '24 hours')
        OR (callout.kind = 'periodo' AND clock_timestamp() < callout.ends_at)
      )
  );
$aba_has_active_callout$;

-- Matrícula ABA feita por esta pessoa num paciente que ainda não tem time.
CREATE OR REPLACE FUNCTION public.aba_owns_unassigned_patient(p_patient UUID, p_user UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_owns_unassigned_patient$
  SELECT public.aba_patient_team_id(p_patient) IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.patient_enrollments enrollment
      WHERE enrollment.patient_id = p_patient
        AND enrollment.discipline = 'aba'
        AND enrollment.status = 'active'
        AND (enrollment.assigned_to = p_user OR enrollment.referred_by = p_user)
    );
$aba_owns_unassigned_patient$;

CREATE OR REPLACE FUNCTION public.aba_can_access_patient(
  p_patient UUID,
  p_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_can_access_patient$
  SELECT p_patient IS NOT NULL
    AND p_user IS NOT NULL
    AND public.can_access_clinical_data(p_user)
    AND EXISTS (
      SELECT 1
      FROM public.patients patient
      WHERE patient.id = p_patient
        AND patient.clinic_id IS NOT NULL
        AND patient.clinic_id = public.user_clinic_id(p_user)
        AND patient.erased_at IS NULL
        AND (
          public.is_clinic_admin(p_user)
          OR (
            public.aba_is_aba_professional(p_user)
            AND (
              EXISTS (
                SELECT 1
                FROM public.aba_care_teams team
                WHERE team.id = public.aba_patient_team_id(patient.id)
                  AND team.supervisor_id = p_user
              )
              OR EXISTS (
                SELECT 1
                FROM public.aba_care_team_members member
                WHERE member.team_id = public.aba_patient_team_id(patient.id)
                  AND member.therapist_id = p_user
                  AND member.ended_at IS NULL
              )
              OR public.aba_has_active_callout(patient.id, p_user)
              OR public.aba_owns_unassigned_patient(patient.id, p_user)
            )
          )
        )
    );
$aba_can_access_patient$;

CREATE OR REPLACE FUNCTION public.aba_can_supervise_patient(
  p_patient UUID,
  p_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_can_supervise_patient$
  SELECT p_patient IS NOT NULL
    AND p_user IS NOT NULL
    AND public.can_access_clinical_data(p_user)
    AND EXISTS (
      SELECT 1
      FROM public.patients patient
      WHERE patient.id = p_patient
        AND patient.clinic_id IS NOT NULL
        AND patient.clinic_id = public.user_clinic_id(p_user)
        AND patient.erased_at IS NULL
        AND (
          public.is_clinic_admin(p_user)
          OR (
            public.aba_is_aba_professional(p_user)
            AND (
              EXISTS (
                SELECT 1
                FROM public.aba_care_teams team
                WHERE team.id = public.aba_patient_team_id(patient.id)
                  AND team.supervisor_id = p_user
              )
              OR public.aba_owns_unassigned_patient(patient.id, p_user)
            )
          )
        )
    );
$aba_can_supervise_patient$;

-- Gate comum de toda RPC ABA: conta ativa, senha trocada, MFA.
CREATE OR REPLACE FUNCTION public.aba_require_gate()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_require_gate$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$aba_require_gate$;

CREATE OR REPLACE FUNCTION public.aba_require_patient(p_patient UUID, p_supervise BOOLEAN)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_require_patient$
DECLARE
  v_uid UUID := public.aba_require_gate();
BEGIN
  IF p_supervise THEN
    IF NOT public.aba_can_supervise_patient(p_patient, v_uid) THEN
      RAISE EXCEPTION
        'Só a supervisão do time (ou a administração) pode fazer isto com este paciente.'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.aba_can_access_patient(p_patient, v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: este paciente é atendido por outro time ABA.'
      USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$aba_require_patient$;

-- ----------------------------------------------------------
-- 8. Leitura do paciente (um pacote só, decifrado)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_program_json(p_program public.aba_programs, p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_program_json$
  SELECT jsonb_build_object(
    'id', p_program.id,
    'patient_id', p_program.patient_id,
    'type', p_program.type,
    'name', p_program.name,
    'status', p_program.status,
    'collection_type', p_program.collection_type,
    'trial_count', p_program.trial_count,
    'measure', p_program.measure,
    'unit', p_program.unit,
    'procedure', p_program.procedure,
    'definition', p_program.definition,
    'notes', public.aba_decrypt_text(p_program.notes_encrypted, p_key),
    'restricted_behavior_id', p_program.restricted_behavior_id,
    'restricted_authorization', public.aba_decrypt_text(p_program.restricted_authorization_encrypted, p_key),
    'restricted_authorized_by', p_program.restricted_authorized_by,
    'restricted_authorized_at', p_program.restricted_authorized_at,
    'therapist_id', p_program.therapist_id,
    'protocol_start_date', p_program.protocol_start_date,
    'revision', p_program.revision,
    'created_at', p_program.created_at,
    'updated_at', p_program.updated_at,
    'archived_at', p_program.archived_at
  );
$aba_program_json$;

CREATE OR REPLACE FUNCTION public.aba_session_json(p_session public.aba_sessions, p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_session_json$
  SELECT jsonb_build_object(
    'id', p_session.id,
    'client_event_id', p_session.client_event_id,
    'patient_id', p_session.patient_id,
    'therapist_id', p_session.therapist_id,
    'supervisor_id', p_session.supervisor_id,
    'appointment_id', p_session.appointment_id,
    'session_date', p_session.session_date,
    'started_at', p_session.started_at,
    'ended_at', p_session.ended_at,
    'location', p_session.location,
    'material', p_session.material,
    'people_present', to_jsonb(p_session.people_present),
    'is_generalization_probe', p_session.is_generalization_probe,
    'generalization_condition', p_session.generalization_condition,
    'private', public.aba_decrypt_json(p_session.private_encrypted, p_key),
    'status', p_session.status,
    'review_status', p_session.review_status,
    'finalized_at', p_session.finalized_at,
    'correction_deadline', p_session.correction_deadline,
    'correction_requested_at', p_session.correction_requested_at,
    'correction_requested_by', p_session.correction_requested_by,
    'corrected_at', p_session.corrected_at,
    'corrected_by', p_session.corrected_by,
    'reviewed_at', p_session.reviewed_at,
    'reviewed_by', p_session.reviewed_by,
    'signed_at', p_session.signed_at,
    'signed_by', p_session.signed_by,
    'signature_statement', p_session.signature_statement,
    'review_private', public.aba_decrypt_json(p_session.review_private_encrypted, p_key),
    'revision', p_session.revision,
    'updated_at', p_session.updated_at,
    'records', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'session_program_id', sp.id,
        'program_id', sp.program_id,
        'sequence', sp.sequence,
        'phase', sp.phase,
        'type', sp.program_snapshot ->> 'type',
        'trial_count', (sp.program_snapshot ->> 'trial_count')::INTEGER,
        'trials', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'index', trial.trial_index,
            'response', trial.response,
            'seconds', trial.recorded_seconds
          ) ORDER BY trial.trial_index)
          FROM public.aba_trial_records trial
          WHERE trial.session_program_id = sp.id
        ), '[]'::JSONB),
        'reduction', (
          SELECT jsonb_build_object(
            'value', reduction.value,
            'unit', reduction.unit,
            'intensity', reduction.intensity,
            'interval_marks', to_jsonb(reduction.interval_marks),
            'observed_seconds', reduction.observed_seconds
          )
          FROM public.aba_reduction_measurements reduction
          WHERE reduction.session_program_id = sp.id
        )
      ) ORDER BY sp.sequence)
      FROM public.aba_session_programs sp
      WHERE sp.session_id = p_session.id
    ), '[]'::JSONB),
    'pauses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('started_at', pause.started_at, 'ended_at', pause.ended_at)
        ORDER BY pause.started_at)
      FROM public.aba_session_pauses pause
      WHERE pause.session_id = p_session.id
    ), '[]'::JSONB),
    'reinforcers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'reinforcer_id', reinforcer_use.reinforcer_id,
        'program_id', reinforcer_use.program_id,
        'uses', reinforcer_use.uses,
        'access_minutes', reinforcer_use.access_minutes,
        'efficiency', reinforcer_use.efficiency
      ))
      FROM public.aba_reinforcer_uses reinforcer_use
      WHERE reinforcer_use.session_id = p_session.id
    ), '[]'::JSONB),
    'behaviors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', event.id,
        'behavior_id', event.behavior_id,
        'program_id', event.program_id,
        'quantity', event.quantity,
        'intensity', event.intensity,
        'duration_seconds', event.duration_seconds,
        'moment', event.moment,
        'new_behavior', event.new_behavior,
        'abc', public.aba_decrypt_json(event.abc_encrypted, p_key)
      ))
      FROM public.aba_behavior_events event
      WHERE event.session_id = p_session.id
    ), '[]'::JSONB),
    'incidents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', incident.id,
        'severity', incident.severity,
        'duration_minutes', incident.duration_minutes,
        'details', public.aba_decrypt_json(incident.details_encrypted, p_key),
        'status', incident.status,
        'reviewed_by', incident.reviewed_by,
        'reviewed_at', incident.reviewed_at,
        'review_note', public.aba_decrypt_text(incident.review_encrypted, p_key),
        'created_at', incident.created_at
      ) ORDER BY incident.created_at)
      FROM public.aba_risk_incidents incident
      WHERE incident.session_id = p_session.id
    ), '[]'::JSONB),
    'reviews', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', review.id,
        'action', review.action,
        'actor_id', review.actor_id,
        'notes', public.aba_decrypt_text(review.notes_encrypted, p_key),
        'created_at', review.created_at
      ) ORDER BY review.created_at)
      FROM public.aba_session_reviews review
      WHERE review.session_id = p_session.id
    ), '[]'::JSONB)
  );
$aba_session_json$;

CREATE OR REPLACE FUNCTION public.aba_get_patient_data(p_patient_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_get_patient_data$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_key TEXT := public.get_clinical_encryption_key();
  v_team_id UUID := public.aba_patient_team_id(p_patient_id);
  v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'patient_id', p_patient_id,
    'permissions', jsonb_build_object(
      'can_supervise', public.aba_can_supervise_patient(p_patient_id, v_uid),
      'is_admin', public.is_clinic_admin(v_uid),
      'user_id', v_uid
    ),
    'team', (
      SELECT jsonb_build_object(
        'id', team.id,
        'name', team.name,
        'supervisor_id', team.supervisor_id,
        'therapist_ids', to_jsonb(link.therapist_ids),
        'member_ids', COALESCE((
          SELECT jsonb_agg(member.therapist_id)
          FROM public.aba_care_team_members member
          WHERE member.team_id = team.id AND member.ended_at IS NULL
        ), '[]'::JSONB)
      )
      FROM public.aba_care_teams team
      JOIN public.aba_patient_teams link ON link.team_id = team.id AND link.ended_at IS NULL
      WHERE team.id = v_team_id AND link.patient_id = p_patient_id
    ),
    'settings', COALESCE((
      SELECT jsonb_build_object(
        'default_trial_count', settings.default_trial_count,
        'program_block_minutes', settings.program_block_minutes,
        'pause_minutes', settings.pause_minutes,
        'correction_window_hours', settings.correction_window_hours
      )
      FROM public.aba_clinic_settings settings
      WHERE settings.clinic_id = v_clinic
    ), jsonb_build_object(
      'default_trial_count', 10,
      'program_block_minutes', 20,
      'pause_minutes', 5,
      'correction_window_hours', 24
    )),
    'programs', COALESCE((
      SELECT jsonb_agg(public.aba_program_json(program, v_key) ORDER BY program.created_at)
      FROM public.aba_programs program
      WHERE program.patient_id = p_patient_id AND program.clinic_id = v_clinic
    ), '[]'::JSONB),
    'reinforcers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', reinforcer.id,
        'name', reinforcer.name,
        'category', reinforcer.category,
        'initial_preference', reinforcer.initial_preference,
        'notes', public.aba_decrypt_text(reinforcer.notes_encrypted, v_key),
        'active', reinforcer.active,
        'created_by', reinforcer.created_by
      ) ORDER BY reinforcer.created_at)
      FROM public.aba_reinforcers reinforcer
      WHERE reinforcer.patient_id = p_patient_id AND reinforcer.clinic_id = v_clinic
    ), '[]'::JSONB),
    'behaviors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', behavior.id,
        'name', behavior.name,
        'measure', behavior.measure,
        'habitual_intensity', behavior.habitual_intensity,
        'details', public.aba_decrypt_json(behavior.details_encrypted, v_key),
        'has_safety_plan', behavior.has_safety_plan,
        'status', behavior.status,
        'reviewed_by', behavior.reviewed_by,
        'reviewed_at', behavior.reviewed_at,
        'created_by', behavior.created_by
      ) ORDER BY behavior.created_at)
      FROM public.aba_interfering_behaviors behavior
      WHERE behavior.patient_id = p_patient_id AND behavior.clinic_id = v_clinic
    ), '[]'::JSONB),
    'sessions', COALESCE((
      SELECT jsonb_agg(public.aba_session_json(recent, v_key) ORDER BY recent.started_at)
      FROM (
        SELECT session.*
        FROM public.aba_sessions session
        WHERE session.patient_id = p_patient_id AND session.clinic_id = v_clinic
        ORDER BY session.started_at DESC
        LIMIT 500
      ) recent
    ), '[]'::JSONB),
    'professionals', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', profile.id, 'full_name', profile.full_name)
        ORDER BY profile.full_name)
      FROM public.profiles profile
      WHERE profile.clinic_id = v_clinic
        AND (
          'aba' = ANY(COALESCE(profile.disciplines, '{}'::TEXT[]))
          OR profile.role = 'clinic_admin'
          OR profile.id IN (
            SELECT session.therapist_id FROM public.aba_sessions session WHERE session.patient_id = p_patient_id
          )
        )
    ), '[]'::JSONB)
  )
  INTO v_result;

  RETURN v_result;
END;
$aba_get_patient_data$;

-- ----------------------------------------------------------
-- 9. Programas
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_save_program(p_patient_id UUID, p_program JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_program$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, TRUE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_id UUID;
  v_existing public.aba_programs%ROWTYPE;
  v_saved public.aba_programs%ROWTYPE;
  v_type TEXT := p_program ->> 'type';
  v_status TEXT := COALESCE(NULLIF(p_program ->> 'status', ''), 'em_ensino');
  v_procedure TEXT := public.aba_clean_text(p_program ->> 'procedure', 80);
  v_authorization TEXT := public.aba_clean_text(p_program ->> 'restricted_authorization', 2000);
  v_behavior UUID;
  v_therapist UUID;
  v_trial_count INTEGER;
  v_definition JSONB := COALESCE(p_program -> 'definition', '{}'::JSONB);
  v_restricted BOOLEAN;
BEGIN
  IF p_program IS NULL OR jsonb_typeof(p_program) <> 'object' THEN
    RAISE EXCEPTION 'Programa inválido.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_id := NULLIF(p_program ->> 'id', '')::UUID;
    v_behavior := NULLIF(p_program ->> 'restricted_behavior_id', '')::UUID;
    v_therapist := NULLIF(p_program ->> 'therapist_id', '')::UUID;
    v_trial_count := NULLIF(p_program ->> 'trial_count', '')::INTEGER;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'Programa com campo inválido.' USING ERRCODE = '22023';
  END;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'O programa precisa de identificador.' USING ERRCODE = '22023';
  END IF;

  IF v_type NOT IN ('aquisicao', 'reducao') THEN
    RAISE EXCEPTION 'Tipo de programa inválido.' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_definition) <> 'object' THEN
    RAISE EXCEPTION 'Configuração do programa inválida.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.patients patient
    WHERE patient.id = p_patient_id AND patient.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Paciente arquivado não recebe programa novo.' USING ERRCODE = '22023';
  END IF;

  IF v_therapist IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = v_therapist
      AND profile.clinic_id = v_clinic
      AND public.aba_is_aba_professional(profile.id)
  ) THEN
    RAISE EXCEPTION 'Terapeuta responsável inválido.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_existing
  FROM public.aba_programs program
  WHERE program.id = v_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.patient_id <> p_patient_id OR v_existing.clinic_id <> v_clinic THEN
      RAISE EXCEPTION 'Programa de outro paciente.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'Programa arquivado não é editado.' USING ERRCODE = '22023';
    END IF;
    IF v_existing.type <> v_type THEN
      RAISE EXCEPTION 'O tipo do programa não muda depois de criado.' USING ERRCODE = '22023';
    END IF;
    IF (p_program ->> 'revision') IS DISTINCT FROM v_existing.revision::TEXT THEN
      RAISE EXCEPTION 'Este programa foi alterado por outra pessoa. Recarregue antes de salvar.'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  v_restricted := public.aba_is_restricted_procedure(v_procedure);
  IF v_restricted THEN
    IF v_behavior IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.aba_interfering_behaviors behavior
      WHERE behavior.id = v_behavior
        AND behavior.patient_id = p_patient_id
        AND behavior.has_safety_plan
        AND behavior.status <> 'inactive'
    ) THEN
      RAISE EXCEPTION
        'Procedimento restrito exige um comportamento-alvo com hipótese funcional e plano de segurança registrados.'
        USING ERRCODE = '22023';
    END IF;
    IF v_authorization IS NULL OR char_length(v_authorization) < 10 THEN
      RAISE EXCEPTION 'Procedimento restrito exige o parecer da supervisão autorizando.'
        USING ERRCODE = '22023';
    END IF;
  ELSE
    v_behavior := NULL;
    v_authorization := NULL;
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.aba_programs AS program (
      id, clinic_id, patient_id, type, name, status, collection_type, trial_count,
      measure, unit, procedure, definition, notes_encrypted,
      restricted_behavior_id, restricted_authorization_encrypted,
      restricted_authorized_by, restricted_authorized_at,
      therapist_id, protocol_start_date, created_by, updated_by
    )
    VALUES (
      v_id,
      v_clinic,
      p_patient_id,
      v_type,
      public.aba_clean_text(p_program ->> 'name', 160),
      v_status,
      COALESCE(public.aba_clean_text(p_program ->> 'collection_type', 40), CASE WHEN v_type = 'aquisicao' THEN 'tentativas' ELSE 'frequencia' END),
      CASE WHEN v_type = 'aquisicao' THEN v_trial_count ELSE NULL END,
      CASE WHEN v_type = 'reducao' THEN NULLIF(p_program ->> 'measure', '') ELSE NULL END,
      public.aba_clean_text(p_program ->> 'unit', 40),
      v_procedure,
      v_definition,
      public.aba_encrypt(public.aba_clean_text(p_program ->> 'notes', 4000)),
      v_behavior,
      public.aba_encrypt(v_authorization),
      CASE WHEN v_restricted THEN v_uid ELSE NULL END,
      CASE WHEN v_restricted THEN clock_timestamp() ELSE NULL END,
      v_therapist,
      COALESCE(NULLIF(p_program ->> 'protocol_start_date', '')::DATE, current_date),
      v_uid,
      v_uid
    )
    RETURNING * INTO v_saved;
  ELSE
    UPDATE public.aba_programs AS program
    SET name = public.aba_clean_text(p_program ->> 'name', 160),
        status = v_status,
        collection_type = COALESCE(public.aba_clean_text(p_program ->> 'collection_type', 40), program.collection_type),
        trial_count = CASE WHEN v_type = 'aquisicao' THEN v_trial_count ELSE NULL END,
        measure = CASE WHEN v_type = 'reducao' THEN NULLIF(p_program ->> 'measure', '') ELSE NULL END,
        unit = public.aba_clean_text(p_program ->> 'unit', 40),
        procedure = v_procedure,
        definition = v_definition,
        notes_encrypted = public.aba_encrypt(public.aba_clean_text(p_program ->> 'notes', 4000)),
        restricted_behavior_id = v_behavior,
        restricted_authorization_encrypted = public.aba_encrypt(v_authorization),
        -- A autorização é de quem a deu: só troca o carimbo quando o
        -- procedimento passa a ser restrito ou o parecer muda.
        restricted_authorized_by = CASE
          WHEN NOT v_restricted THEN NULL
          WHEN program.restricted_authorized_by IS NULL
            OR program.procedure IS DISTINCT FROM v_procedure
            OR public.aba_decrypt_text(program.restricted_authorization_encrypted, public.get_clinical_encryption_key())
              IS DISTINCT FROM v_authorization THEN v_uid
          ELSE program.restricted_authorized_by
        END,
        restricted_authorized_at = CASE
          WHEN NOT v_restricted THEN NULL
          WHEN program.restricted_authorized_by IS NULL
            OR program.procedure IS DISTINCT FROM v_procedure
            OR public.aba_decrypt_text(program.restricted_authorization_encrypted, public.get_clinical_encryption_key())
              IS DISTINCT FROM v_authorization THEN clock_timestamp()
          ELSE program.restricted_authorized_at
        END,
        therapist_id = v_therapist,
        protocol_start_date = COALESCE(NULLIF(p_program ->> 'protocol_start_date', '')::DATE, program.protocol_start_date),
        revision = program.revision + 1,
        updated_by = v_uid,
        updated_at = clock_timestamp()
    WHERE program.id = v_id
    RETURNING * INTO v_saved;
  END IF;

  RETURN public.aba_program_json(v_saved, public.get_clinical_encryption_key());
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Programa incompleto ou com valor fora do permitido.' USING ERRCODE = '22023';
END;
$aba_save_program$;

CREATE OR REPLACE FUNCTION public.aba_program_patient(p_program_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_program_patient$
  SELECT program.patient_id FROM public.aba_programs program WHERE program.id = p_program_id;
$aba_program_patient$;

-- Arquivar (o histórico de coleta continua), ou registrar a progressão de
-- fase aprovada pela supervisão com o parecer.
CREATE OR REPLACE FUNCTION public.aba_update_program_status(
  p_program_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL,
  p_archive BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_update_program_status$
DECLARE
  v_patient UUID := public.aba_program_patient(p_program_id);
  v_uid UUID;
  v_key TEXT;
  v_saved public.aba_programs%ROWTYPE;
  v_note TEXT := public.aba_clean_text(p_note, 2000);
  v_previous TEXT;
BEGIN
  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Programa não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_patient, TRUE);
  v_key := public.get_clinical_encryption_key();

  IF NOT p_archive AND p_status NOT IN (
    'planejado', 'em_ensino', 'criterio_atingido_na_sessao', 'aquisicao',
    'generalizacao', 'manutencao', 'concluido', 'pausado', 'extinto'
  ) THEN
    RAISE EXCEPTION 'Fase inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT public.aba_decrypt_text(program.notes_encrypted, v_key)
  INTO v_previous
  FROM public.aba_programs program
  WHERE program.id = p_program_id
  FOR UPDATE;

  UPDATE public.aba_programs AS program
  SET status = CASE WHEN p_archive THEN program.status ELSE p_status END,
      archived_at = CASE WHEN p_archive THEN clock_timestamp() ELSE program.archived_at END,
      notes_encrypted = CASE
        WHEN v_note IS NULL THEN program.notes_encrypted
        ELSE public.aba_encrypt(concat_ws(E'\n', v_previous,
          to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') || ' — ' || v_note))
      END,
      revision = program.revision + 1,
      updated_by = v_uid,
      updated_at = clock_timestamp()
  WHERE program.id = p_program_id
    AND program.archived_at IS NULL
  RETURNING * INTO v_saved;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programa já arquivado.' USING ERRCODE = '22023';
  END IF;

  RETURN public.aba_program_json(v_saved, v_key);
END;
$aba_update_program_status$;

-- ----------------------------------------------------------
-- 10. Reforçadores e comportamentos interferentes
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_save_reinforcer(p_patient_id UUID, p_reinforcer JSONB)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_reinforcer$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_id UUID;
  v_existing public.aba_reinforcers%ROWTYPE;
BEGIN
  BEGIN
    v_id := COALESCE(NULLIF(p_reinforcer ->> 'id', '')::UUID, gen_random_uuid());
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Reforçador inválido.' USING ERRCODE = '22023';
  END;

  SELECT * INTO v_existing FROM public.aba_reinforcers WHERE id = v_id FOR UPDATE;

  IF FOUND THEN
    IF v_existing.patient_id <> p_patient_id THEN
      RAISE EXCEPTION 'Reforçador de outro paciente.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.created_by <> v_uid AND NOT public.aba_can_supervise_patient(p_patient_id, v_uid) THEN
      RAISE EXCEPTION 'Só quem cadastrou ou a supervisão altera este reforçador.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.aba_reinforcers
    SET name = public.aba_clean_text(p_reinforcer ->> 'name', 80),
        category = p_reinforcer ->> 'category',
        initial_preference = p_reinforcer ->> 'initial_preference',
        notes_encrypted = public.aba_encrypt(public.aba_clean_text(p_reinforcer ->> 'notes', 2000)),
        active = COALESCE((p_reinforcer ->> 'active')::BOOLEAN, TRUE),
        updated_at = clock_timestamp()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.aba_reinforcers (
      id, clinic_id, patient_id, name, category, initial_preference, notes_encrypted, created_by
    )
    VALUES (
      v_id,
      v_clinic,
      p_patient_id,
      public.aba_clean_text(p_reinforcer ->> 'name', 80),
      p_reinforcer ->> 'category',
      p_reinforcer ->> 'initial_preference',
      public.aba_encrypt(public.aba_clean_text(p_reinforcer ->> 'notes', 2000)),
      v_uid
    );
  END IF;

  RETURN v_id;
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Reforçador incompleto: nome, categoria e preferência.' USING ERRCODE = '22023';
END;
$aba_save_reinforcer$;

CREATE OR REPLACE FUNCTION public.aba_save_behavior(p_patient_id UUID, p_behavior JSONB)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_behavior$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_supervise BOOLEAN := public.aba_can_supervise_patient(p_patient_id, v_uid);
  v_id UUID;
  v_existing public.aba_interfering_behaviors%ROWTYPE;
  v_details JSONB;
  v_definition TEXT := public.aba_clean_text(p_behavior ->> 'operational_definition', 2000);
  v_hypothesis TEXT := public.aba_clean_text(p_behavior ->> 'functional_hypothesis', 1000);
  v_safety TEXT := public.aba_clean_text(p_behavior ->> 'safety_guidance', 2000);
BEGIN
  BEGIN
    v_id := COALESCE(NULLIF(p_behavior ->> 'id', '')::UUID, gen_random_uuid());
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'Comportamento inválido.' USING ERRCODE = '22023';
  END;

  IF v_definition IS NULL THEN
    RAISE EXCEPTION 'Escreva a definição operacional do comportamento.' USING ERRCODE = '22023';
  END IF;

  v_details := jsonb_build_object(
    'operational_definition', v_definition,
    'functional_hypothesis', v_hypothesis,
    'safety_guidance', v_safety,
    'notes', public.aba_clean_text(p_behavior ->> 'notes', 2000)
  );

  SELECT * INTO v_existing FROM public.aba_interfering_behaviors WHERE id = v_id FOR UPDATE;

  IF FOUND THEN
    IF v_existing.patient_id <> p_patient_id THEN
      RAISE EXCEPTION 'Comportamento de outro paciente.' USING ERRCODE = '42501';
    END IF;
    IF NOT v_supervise AND (v_existing.created_by <> v_uid OR v_existing.status <> 'pending_review') THEN
      RAISE EXCEPTION 'Depois de revisado, só a supervisão altera a definição.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.aba_interfering_behaviors
    SET name = public.aba_clean_text(p_behavior ->> 'name', 120),
        measure = public.aba_clean_text(p_behavior ->> 'measure', 40),
        habitual_intensity = public.aba_clean_text(p_behavior ->> 'habitual_intensity', 20),
        details_encrypted = public.aba_encrypt(v_details::TEXT),
        has_safety_plan = (v_hypothesis IS NOT NULL AND v_safety IS NOT NULL),
        updated_at = clock_timestamp()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.aba_interfering_behaviors (
      id, clinic_id, patient_id, name, measure, habitual_intensity,
      details_encrypted, has_safety_plan, status, reviewed_by, reviewed_at, created_by
    )
    VALUES (
      v_id,
      v_clinic,
      p_patient_id,
      public.aba_clean_text(p_behavior ->> 'name', 120),
      COALESCE(public.aba_clean_text(p_behavior ->> 'measure', 40), 'Frequência'),
      public.aba_clean_text(p_behavior ->> 'habitual_intensity', 20),
      public.aba_encrypt(v_details::TEXT),
      (v_hypothesis IS NOT NULL AND v_safety IS NOT NULL),
      -- Quem supervisiona já cadastra revisado; o terapeuta manda para a fila.
      CASE WHEN v_supervise THEN 'approved' ELSE 'pending_review' END,
      CASE WHEN v_supervise THEN v_uid ELSE NULL END,
      CASE WHEN v_supervise THEN clock_timestamp() ELSE NULL END,
      v_uid
    );
  END IF;

  RETURN v_id;
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Comportamento incompleto: nome, medida e definição.' USING ERRCODE = '22023';
END;
$aba_save_behavior$;

CREATE OR REPLACE FUNCTION public.aba_review_behavior(p_behavior_id UUID, p_decision TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_review_behavior$
DECLARE
  v_patient UUID;
  v_uid UUID;
BEGIN
  SELECT patient_id INTO v_patient FROM public.aba_interfering_behaviors WHERE id = p_behavior_id;
  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Comportamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_patient, TRUE);

  IF p_decision NOT IN ('approved', 'inactive') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.aba_interfering_behaviors
  SET status = p_decision,
      reviewed_by = v_uid,
      reviewed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = p_behavior_id;
END;
$aba_review_behavior$;

-- ----------------------------------------------------------
-- 11. Coleta: salvar (rascunho a cada toque, depois finalizar)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_replace_session_children(
  p_session public.aba_sessions,
  p_payload JSONB,
  p_uid UUID
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_replace_session_children$
DECLARE
  v_record JSONB;
  v_program public.aba_programs%ROWTYPE;
  v_session_program UUID;
  v_sequence INTEGER := 0;
  v_trial JSONB;
  v_trial_index BIGINT;
  v_seconds JSONB;
  v_item JSONB;
  v_incident_id UUID;
BEGIN
  DELETE FROM public.aba_session_programs WHERE session_id = p_session.id;
  DELETE FROM public.aba_session_pauses WHERE session_id = p_session.id;
  DELETE FROM public.aba_reinforcer_uses WHERE session_id = p_session.id;
  DELETE FROM public.aba_behavior_events WHERE session_id = p_session.id;

  FOR v_record IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'records', '[]'::JSONB))
  LOOP
    v_sequence := v_sequence + 1;

    SELECT * INTO v_program
    FROM public.aba_programs program
    WHERE program.id = NULLIF(v_record ->> 'program_id', '')::UUID
      AND program.patient_id = p_session.patient_id
      AND program.clinic_id = p_session.clinic_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Um dos programas da sessão não pertence ao paciente.' USING ERRCODE = '23503';
    END IF;

    IF v_program.archived_at IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.aba_session_programs earlier
         WHERE earlier.program_id = v_program.id
       ) THEN
      RAISE EXCEPTION 'O programa "%" foi arquivado.', v_program.name USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.aba_session_programs (
      clinic_id, patient_id, session_id, program_id, program_snapshot, sequence, phase
    )
    VALUES (
      p_session.clinic_id,
      p_session.patient_id,
      p_session.id,
      v_program.id,
      jsonb_build_object(
        'id', v_program.id,
        'type', v_program.type,
        'name', v_program.name,
        'status', v_program.status,
        'collection_type', v_program.collection_type,
        'trial_count', CASE
          WHEN v_program.type = 'aquisicao'
            THEN GREATEST(COALESCE(v_program.trial_count, 1), jsonb_array_length(COALESCE(v_record -> 'trials', '[]'::JSONB)))
          ELSE NULL
        END,
        'measure', v_program.measure,
        'unit', v_program.unit,
        'procedure', v_program.procedure,
        'definition', v_program.definition
      ),
      v_sequence,
      COALESCE(NULLIF(v_record ->> 'phase', ''), 'intervencao')
    )
    RETURNING id INTO v_session_program;

    IF v_program.type = 'aquisicao' THEN
      IF jsonb_typeof(COALESCE(v_record -> 'trials', '[]'::JSONB)) <> 'array'
         OR jsonb_array_length(COALESCE(v_record -> 'trials', '[]'::JSONB)) > 50 THEN
        RAISE EXCEPTION 'As tentativas do programa precisam ser uma lista de até 50.' USING ERRCODE = '22023';
      END IF;
      v_seconds := COALESCE(v_record -> 'trial_seconds', '[]'::JSONB);
      FOR v_trial, v_trial_index IN
        SELECT value, ordinality
        FROM jsonb_array_elements(COALESCE(v_record -> 'trials', '[]'::JSONB)) WITH ORDINALITY
      LOOP
        IF v_trial IS NOT NULL AND v_trial <> 'null'::JSONB THEN
          INSERT INTO public.aba_trial_records (
            clinic_id, patient_id, session_id, session_program_id, trial_index, response, recorded_seconds
          )
          VALUES (
            p_session.clinic_id,
            p_session.patient_id,
            p_session.id,
            v_session_program,
            v_trial_index::INTEGER,
            v_trial #>> '{}',
            CASE
              WHEN jsonb_typeof(v_seconds -> (v_trial_index - 1)::INTEGER) = 'number'
                THEN (v_seconds ->> (v_trial_index - 1)::INTEGER)::NUMERIC
              ELSE NULL
            END
          );
        END IF;
      END LOOP;
    ELSE
      INSERT INTO public.aba_reduction_measurements (
        clinic_id, patient_id, session_id, session_program_id, value, unit,
        intensity, interval_marks, observed_seconds
      )
      VALUES (
        p_session.clinic_id,
        p_session.patient_id,
        p_session.id,
        v_session_program,
        COALESCE(NULLIF(v_record ->> 'value', '')::NUMERIC, 0),
        COALESCE(NULLIF(v_program.unit, ''), 'registro'),
        public.aba_clean_text(v_record ->> 'intensity', 40),
        CASE
          WHEN jsonb_typeof(v_record -> 'interval_marks') = 'array'
            THEN ARRAY(SELECT (mark #>> '{}')::BOOLEAN FROM jsonb_array_elements(v_record -> 'interval_marks') mark)
          ELSE NULL
        END,
        NULLIF(v_record ->> 'observed_seconds', '')::NUMERIC
      );
    END IF;
  END LOOP;

  IF v_sequence = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um programa para registrar a sessão.' USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'pauses', '[]'::JSONB))
  LOOP
    INSERT INTO public.aba_session_pauses (clinic_id, patient_id, session_id, started_at, ended_at)
    VALUES (
      p_session.clinic_id,
      p_session.patient_id,
      p_session.id,
      (v_item ->> 'started_at')::TIMESTAMPTZ,
      COALESCE(
        NULLIF(v_item ->> 'ended_at', '')::TIMESTAMPTZ,
        CASE WHEN p_session.status <> 'em_andamento' THEN p_session.ended_at ELSE NULL END
      )
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'reinforcers', '[]'::JSONB))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.aba_reinforcers reinforcer
      WHERE reinforcer.id = NULLIF(v_item ->> 'reinforcer_id', '')::UUID
        AND reinforcer.patient_id = p_session.patient_id
    ) THEN
      RAISE EXCEPTION 'Reforçador de outro paciente.' USING ERRCODE = '23503';
    END IF;
    INSERT INTO public.aba_reinforcer_uses (
      clinic_id, patient_id, session_id, reinforcer_id, program_id, uses, access_minutes, efficiency
    )
    VALUES (
      p_session.clinic_id,
      p_session.patient_id,
      p_session.id,
      (v_item ->> 'reinforcer_id')::UUID,
      (SELECT program.id FROM public.aba_programs program
        WHERE program.id = NULLIF(v_item ->> 'program_id', '')::UUID
          AND program.patient_id = p_session.patient_id),
      COALESCE(NULLIF(v_item ->> 'uses', '')::INTEGER, 1),
      COALESCE(NULLIF(v_item ->> 'access_minutes', '')::NUMERIC, 0),
      COALESCE(NULLIF(v_item ->> 'efficiency', ''), 'eficiente')
    );
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'behaviors', '[]'::JSONB))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.aba_interfering_behaviors behavior
      WHERE behavior.id = NULLIF(v_item ->> 'behavior_id', '')::UUID
        AND behavior.patient_id = p_session.patient_id
    ) THEN
      RAISE EXCEPTION 'Comportamento de outro paciente.' USING ERRCODE = '23503';
    END IF;
    INSERT INTO public.aba_behavior_events (
      id, clinic_id, patient_id, session_id, behavior_id, program_id, quantity, intensity,
      duration_seconds, moment, new_behavior, abc_encrypted
    )
    VALUES (
      COALESCE(NULLIF(v_item ->> 'id', '')::UUID, gen_random_uuid()),
      p_session.clinic_id,
      p_session.patient_id,
      p_session.id,
      (v_item ->> 'behavior_id')::UUID,
      (SELECT program.id FROM public.aba_programs program
        WHERE program.id = NULLIF(v_item ->> 'program_id', '')::UUID
          AND program.patient_id = p_session.patient_id),
      COALESCE(NULLIF(v_item ->> 'quantity', '')::INTEGER, 1),
      public.aba_clean_text(v_item ->> 'intensity', 40),
      NULLIF(v_item ->> 'duration_seconds', '')::NUMERIC,
      public.aba_clean_text(v_item ->> 'moment', 8),
      COALESCE((v_item ->> 'new_behavior')::BOOLEAN, FALSE),
      public.aba_encrypt(jsonb_build_object(
        'antecedent', public.aba_clean_text(v_item -> 'abc' ->> 'antecedent', 500),
        'consequence', public.aba_clean_text(v_item -> 'abc' ->> 'consequence', 500),
        'conduct', public.aba_clean_text(v_item -> 'abc' ->> 'conduct', 500)
      )::TEXT)
    );
  END LOOP;

  -- Situação de risco: só entra, nunca sai. O terapeuta não apaga o
  -- registro que a supervisão vai revisar, nem num rascunho.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_payload -> 'incidents', '[]'::JSONB))
  LOOP
    BEGIN
      v_incident_id := NULLIF(v_item ->> 'id', '')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
      v_incident_id := NULL;
    END;
    IF v_incident_id IS NULL THEN
      RAISE EXCEPTION 'Situação de risco sem identificador.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.aba_risk_incidents WHERE id = v_incident_id) THEN
      CONTINUE;
    END IF;
    INSERT INTO public.aba_risk_incidents (
      id, clinic_id, patient_id, session_id, severity, duration_minutes, details_encrypted, created_by
    )
    VALUES (
      v_incident_id,
      p_session.clinic_id,
      p_session.patient_id,
      p_session.id,
      NULLIF(v_item ->> 'severity', ''),
      COALESCE(NULLIF(v_item ->> 'duration_minutes', '')::NUMERIC, 0),
      public.aba_encrypt(jsonb_build_object(
        'reason', public.aba_clean_text(v_item -> 'details' ->> 'reason', 500),
        'behavior', public.aba_clean_text(v_item -> 'details' ->> 'behavior', 500),
        'identified_risk', public.aba_clean_text(v_item -> 'details' ->> 'identified_risk', 2000),
        'intervention_type', public.aba_clean_text(v_item -> 'details' ->> 'intervention_type', 500),
        'people_present', COALESCE(v_item -> 'details' -> 'people_present', '[]'::JSONB),
        'injury', public.aba_clean_text(v_item -> 'details' ->> 'injury', 500),
        'follow_up', public.aba_clean_text(v_item -> 'details' ->> 'follow_up', 2000),
        'guardian_communication', public.aba_clean_text(v_item -> 'details' ->> 'guardian_communication', 200)
      )::TEXT),
      p_uid
    );
  END LOOP;
END;
$aba_replace_session_children$;

CREATE OR REPLACE FUNCTION public.aba_save_session(p_patient_id UUID, p_session JSONB)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_session$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, FALSE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_client_event UUID;
  v_appointment UUID;
  v_existing public.aba_sessions%ROWTYPE;
  v_saved public.aba_sessions%ROWTYPE;
  v_status TEXT := COALESCE(NULLIF(p_session ->> 'status', ''), 'em_andamento');
  v_started_at TIMESTAMPTZ;
  v_ended_at TIMESTAMPTZ;
  v_supervisor UUID;
  v_window INTEGER;
  v_private JSONB;
BEGIN
  IF p_session IS NULL OR jsonb_typeof(p_session) <> 'object' THEN
    RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '22023';
  END IF;

  IF octet_length(p_session::TEXT) > 524288 THEN
    RAISE EXCEPTION 'Sessão grande demais.' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN ('em_andamento', 'incompleta', 'finalizada') THEN
    RAISE EXCEPTION 'A sessão é salva em andamento, incompleta ou finalizada.' USING ERRCODE = '22023';
  END IF;

  BEGIN
    v_client_event := (p_session ->> 'client_event_id')::UUID;
    v_appointment := NULLIF(p_session ->> 'appointment_id', '')::UUID;
    v_started_at := COALESCE(NULLIF(p_session ->> 'started_at', '')::TIMESTAMPTZ, clock_timestamp());
    v_ended_at := NULLIF(p_session ->> 'ended_at', '')::TIMESTAMPTZ;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION 'Sessão com data ou identificador inválido.' USING ERRCODE = '22023';
  END;

  IF v_client_event IS NULL THEN
    RAISE EXCEPTION 'O identificador da sessão é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF v_started_at > clock_timestamp() + INTERVAL '5 minutes'
     OR v_started_at < clock_timestamp() - INTERVAL '7 days' THEN
    RAISE EXCEPTION 'O início da sessão precisa ser de agora ou dos últimos 7 dias.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.patients patient
    WHERE patient.id = p_patient_id AND patient.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Paciente arquivado não recebe coleta nova.' USING ERRCODE = '22023';
  END IF;

  IF v_appointment IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.id = v_appointment
      AND appointment.patient_id = p_patient_id
      AND appointment.professional_id = v_uid
      AND appointment.discipline = 'aba'
      AND appointment.kind = 'appointment'
  ) THEN
    RAISE EXCEPTION 'O atendimento da Agenda não é seu, deste paciente, em ABA.' USING ERRCODE = '42501';
  END IF;

  -- Retries da mesma sessão em paralelo passam um de cada vez.
  PERFORM pg_advisory_xact_lock(hashtextextended('aba-session:' || v_client_event::TEXT, 0));

  SELECT * INTO v_existing
  FROM public.aba_sessions session
  WHERE session.clinic_id = v_clinic
    AND session.client_event_id = v_client_event
  FOR UPDATE;

  v_private := jsonb_build_object(
    'arrival_state', public.aba_clean_text(p_session -> 'private' ->> 'arrival_state', 120),
    'health_condition', public.aba_clean_text(p_session -> 'private' ->> 'health_condition', 120),
    'routine_change', public.aba_clean_text(p_session -> 'private' ->> 'routine_change', 120),
    'apparent_motivation', public.aba_clean_text(p_session -> 'private' ->> 'apparent_motivation', 120),
    'notes', public.aba_clean_text(p_session -> 'private' ->> 'notes', 4000)
  );

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.patient_id <> p_patient_id THEN
      RAISE EXCEPTION 'Sessão de outro paciente.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.therapist_id <> v_uid THEN
      RAISE EXCEPTION 'Só o terapeuta da sessão continua esta coleta.' USING ERRCODE = '42501';
    END IF;
    IF v_existing.status <> 'em_andamento' THEN
      -- Reenvio do mesmo final (rede caiu depois de gravar): devolve o que já está lá.
      IF v_existing.status = v_status
         AND (
           (p_session ->> 'revision') = (v_existing.revision - 1)::TEXT
           OR ((p_session ->> 'revision') IS NULL AND v_existing.revision = 1)
         ) THEN
        RETURN jsonb_build_object(
          'id', v_existing.id, 'client_event_id', v_existing.client_event_id,
          'revision', v_existing.revision, 'status', v_existing.status,
          'review_status', v_existing.review_status, 'replayed', TRUE
        );
      END IF;
      RAISE EXCEPTION 'Esta sessão já foi finalizada; mudanças agora só pela correção.'
        USING ERRCODE = '22023';
    END IF;
    -- Sem revisão só é aceito o reenvio do primeiro salvamento desta aba
    -- (a resposta se perdeu na rede): o identificador da coleta nasce nela.
    IF (p_session ->> 'revision') IS DISTINCT FROM v_existing.revision::TEXT
       AND NOT ((p_session ->> 'revision') IS NULL AND v_existing.revision = 1) THEN
      RAISE EXCEPTION 'A coleta foi alterada em outra aba ou aparelho. Recarregue a sessão.'
        USING ERRCODE = '40001';
    END IF;
  END IF;

  IF v_status <> 'em_andamento' THEN
    v_ended_at := COALESCE(v_ended_at, clock_timestamp());
    IF v_ended_at < v_started_at THEN
      RAISE EXCEPTION 'O término da sessão não pode ser anterior ao início.' USING ERRCODE = '22007';
    END IF;
    SELECT COALESCE(settings.correction_window_hours, 24) INTO v_window
    FROM public.aba_clinic_settings settings
    WHERE settings.clinic_id = v_clinic;
    v_window := COALESCE(v_window, 24);
  ELSE
    v_ended_at := NULL;
  END IF;

  SELECT team.supervisor_id INTO v_supervisor
  FROM public.aba_care_teams team
  WHERE team.id = public.aba_patient_team_id(p_patient_id);

  IF v_existing.id IS NULL THEN
    INSERT INTO public.aba_sessions AS session (
      clinic_id, patient_id, therapist_id, supervisor_id, appointment_id, client_event_id,
      session_date, started_at, ended_at, location, material, people_present,
      is_generalization_probe, generalization_condition, private_encrypted, status,
      finalized_at, correction_deadline
    )
    VALUES (
      v_clinic,
      p_patient_id,
      v_uid,
      v_supervisor,
      v_appointment,
      v_client_event,
      (v_started_at AT TIME ZONE 'America/Sao_Paulo')::DATE,
      v_started_at,
      v_ended_at,
      COALESCE(NULLIF(p_session ->> 'location', ''), 'clinica'),
      public.aba_clean_text(p_session ->> 'material', 80),
      COALESCE(ARRAY(
        SELECT left(btrim(person), 60)
        FROM jsonb_array_elements_text(COALESCE(p_session -> 'people_present', '[]'::JSONB)) person
        WHERE btrim(person) <> ''
        LIMIT 12
      ), '{}'::TEXT[]),
      COALESCE((p_session ->> 'is_generalization_probe')::BOOLEAN, FALSE),
      CASE
        WHEN COALESCE((p_session ->> 'is_generalization_probe')::BOOLEAN, FALSE)
          THEN NULLIF(p_session ->> 'generalization_condition', '')
        ELSE NULL
      END,
      public.aba_encrypt(v_private::TEXT),
      v_status,
      CASE WHEN v_status <> 'em_andamento' THEN clock_timestamp() ELSE NULL END,
      CASE WHEN v_status = 'incompleta' THEN clock_timestamp() + make_interval(hours => v_window) ELSE NULL END
    )
    RETURNING * INTO v_saved;
  ELSE
    UPDATE public.aba_sessions AS session
    SET appointment_id = v_appointment,
        ended_at = v_ended_at,
        location = COALESCE(NULLIF(p_session ->> 'location', ''), 'clinica'),
        material = public.aba_clean_text(p_session ->> 'material', 80),
        people_present = COALESCE(ARRAY(
          SELECT left(btrim(person), 60)
          FROM jsonb_array_elements_text(COALESCE(p_session -> 'people_present', '[]'::JSONB)) person
          WHERE btrim(person) <> ''
          LIMIT 12
        ), '{}'::TEXT[]),
        is_generalization_probe = COALESCE((p_session ->> 'is_generalization_probe')::BOOLEAN, FALSE),
        generalization_condition = CASE
          WHEN COALESCE((p_session ->> 'is_generalization_probe')::BOOLEAN, FALSE)
            THEN NULLIF(p_session ->> 'generalization_condition', '')
          ELSE NULL
        END,
        private_encrypted = public.aba_encrypt(v_private::TEXT),
        status = v_status,
        finalized_at = CASE WHEN v_status <> 'em_andamento' THEN clock_timestamp() ELSE NULL END,
        correction_deadline = CASE
          WHEN v_status = 'incompleta' THEN clock_timestamp() + make_interval(hours => v_window)
          ELSE NULL
        END,
        revision = session.revision + 1,
        updated_at = clock_timestamp()
    WHERE session.id = v_existing.id
    RETURNING * INTO v_saved;
  END IF;

  PERFORM public.aba_replace_session_children(v_saved, p_session, v_uid);

  RETURN jsonb_build_object(
    'id', v_saved.id,
    'client_event_id', v_saved.client_event_id,
    'revision', v_saved.revision,
    'status', v_saved.status,
    'review_status', v_saved.review_status,
    'replayed', FALSE
  );
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Coleta com valor fora do permitido (código de resposta, fase ou medida).'
      USING ERRCODE = '22023';
END;
$aba_save_session$;

-- Descartar uma coleta que ainda não foi finalizada.
CREATE OR REPLACE FUNCTION public.aba_discard_session(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_discard_session$
DECLARE
  v_session public.aba_sessions%ROWTYPE;
  v_uid UUID;
BEGIN
  SELECT * INTO v_session FROM public.aba_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_session.patient_id, FALSE);

  IF v_session.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Sessão finalizada não se descarta.' USING ERRCODE = '22023';
  END IF;
  IF v_session.therapist_id <> v_uid AND NOT public.aba_can_supervise_patient(v_session.patient_id, v_uid) THEN
    RAISE EXCEPTION 'Só o terapeuta da sessão ou a supervisão descarta esta coleta.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.aba_risk_incidents WHERE session_id = p_session_id) THEN
    RAISE EXCEPTION 'Há situação de risco registrada nesta coleta: finalize como incompleta em vez de descartar.'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.aba_sessions WHERE id = p_session_id;
END;
$aba_discard_session$;

-- ----------------------------------------------------------
-- 12. Revisão da supervisão, correção e assinatura
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_review_session(
  p_session_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL,
  p_window_hours INTEGER DEFAULT NULL,
  p_attested BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_review_session$
DECLARE
  v_session public.aba_sessions%ROWTYPE;
  v_uid UUID;
  v_key TEXT;
  v_notes TEXT := public.aba_clean_text(p_notes, 4000);
  v_review JSONB;
  v_window INTEGER;
  v_name TEXT;
BEGIN
  SELECT * INTO v_session FROM public.aba_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_session.patient_id, TRUE);
  v_key := public.get_clinical_encryption_key();

  IF v_session.status = 'em_andamento'
     OR v_session.review_status NOT IN ('pending_review', 'corrected_pending_review') THEN
    RAISE EXCEPTION 'Esta sessão não está aguardando a supervisão.' USING ERRCODE = '22023';
  END IF;

  v_review := public.aba_decrypt_json(v_session.review_private_encrypted, v_key);

  IF p_action = 'request_correction' THEN
    IF v_notes IS NULL OR char_length(v_notes) < 3 THEN
      RAISE EXCEPTION 'Escreva o que precisa ser corrigido.' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(settings.correction_window_hours, 24) INTO v_window
    FROM public.aba_clinic_settings settings
    WHERE settings.clinic_id = v_session.clinic_id;
    v_window := COALESCE(p_window_hours, v_window, 24);
    IF v_window < 1 OR v_window > 168 THEN
      RAISE EXCEPTION 'O prazo da correção vai de 1 a 168 horas.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.aba_sessions
    SET review_status = 'correction_requested',
        correction_requested_at = clock_timestamp(),
        correction_requested_by = v_uid,
        correction_deadline = clock_timestamp() + make_interval(hours => v_window),
        review_private_encrypted = public.aba_encrypt(
          (v_review || jsonb_build_object('correction_reason', v_notes, 'correction_response', NULL))::TEXT
        ),
        revision = revision + 1,
        updated_at = clock_timestamp()
    WHERE id = p_session_id
    RETURNING * INTO v_session;

    INSERT INTO public.aba_session_reviews (clinic_id, patient_id, session_id, action, actor_id, notes_encrypted)
    VALUES (v_session.clinic_id, v_session.patient_id, v_session.id, 'correction_requested', v_uid,
      public.aba_encrypt(v_notes));
  ELSIF p_action = 'approve_and_sign' THEN
    IF p_attested IS NOT TRUE THEN
      RAISE EXCEPTION 'Confirme o atesto da revisão para assinar.' USING ERRCODE = '22023';
    END IF;
    SELECT profile.full_name INTO v_name FROM public.profiles profile WHERE profile.id = v_uid;

    UPDATE public.aba_sessions
    SET review_status = 'approved',
        reviewed_at = clock_timestamp(),
        reviewed_by = v_uid,
        signed_at = clock_timestamp(),
        signed_by = v_uid,
        signature_statement = format(
          'Revisado e aprovado por %s em %s. Atesto que revisei os registros clínicos e aprovo o conteúdo desta sessão.',
          COALESCE(v_name, 'supervisão'),
          to_char(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')
        ),
        review_private_encrypted = public.aba_encrypt(
          (v_review || jsonb_build_object('review_notes', v_notes))::TEXT
        ),
        revision = revision + 1,
        updated_at = clock_timestamp()
    WHERE id = p_session_id
    RETURNING * INTO v_session;

    INSERT INTO public.aba_session_reviews (clinic_id, patient_id, session_id, action, actor_id, notes_encrypted)
    VALUES (v_session.clinic_id, v_session.patient_id, v_session.id, 'approved_and_signed', v_uid,
      public.aba_encrypt(v_notes));
  ELSE
    RAISE EXCEPTION 'Ação de revisão inválida.' USING ERRCODE = '22023';
  END IF;

  RETURN public.aba_session_json(v_session, v_key);
END;
$aba_review_session$;

CREATE OR REPLACE FUNCTION public.aba_correct_session(
  p_session_id UUID,
  p_revision BIGINT,
  p_records JSONB,
  p_notes TEXT,
  p_response TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_correct_session$
DECLARE
  v_session public.aba_sessions%ROWTYPE;
  v_uid UUID;
  v_key TEXT;
  v_response TEXT := public.aba_clean_text(p_response, 4000);
  v_previous JSONB;
  v_private JSONB;
  v_review JSONB;
  v_record JSONB;
  v_session_program public.aba_session_programs%ROWTYPE;
  v_trial JSONB;
  v_trial_index BIGINT;
  v_seconds JSONB;
BEGIN
  SELECT * INTO v_session FROM public.aba_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessão não encontrada.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_session.patient_id, FALSE);
  v_key := public.get_clinical_encryption_key();

  IF v_session.review_status <> 'correction_requested' THEN
    RAISE EXCEPTION 'A supervisão não pediu correção desta sessão.' USING ERRCODE = '22023';
  END IF;
  IF v_session.therapist_id <> v_uid AND NOT public.aba_can_supervise_patient(v_session.patient_id, v_uid) THEN
    RAISE EXCEPTION 'Só o terapeuta da sessão ou a supervisão corrige.' USING ERRCODE = '42501';
  END IF;
  IF v_session.therapist_id = v_uid
     AND NOT public.aba_can_supervise_patient(v_session.patient_id, v_uid)
     AND v_session.correction_deadline IS NOT NULL
     AND clock_timestamp() > v_session.correction_deadline THEN
    RAISE EXCEPTION 'O prazo da correção terminou. Peça à supervisão um novo prazo.' USING ERRCODE = '22023';
  END IF;
  IF p_revision IS DISTINCT FROM v_session.revision THEN
    RAISE EXCEPTION 'A sessão mudou desde que você abriu a correção. Recarregue.' USING ERRCODE = '40001';
  END IF;
  IF v_response IS NULL OR char_length(v_response) < 3 THEN
    RAISE EXCEPTION 'Descreva o que foi corrigido.' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_records, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Registros da correção inválidos.' USING ERRCODE = '22023';
  END IF;

  -- Fotografia do que existia antes (só vai para a auditoria, cifrada).
  v_previous := public.aba_session_json(v_session, v_key);

  FOR v_record IN SELECT value FROM jsonb_array_elements(COALESCE(p_records, '[]'::JSONB))
  LOOP
    SELECT * INTO v_session_program
    FROM public.aba_session_programs sp
    WHERE sp.session_id = v_session.id
      AND sp.program_id = NULLIF(v_record ->> 'program_id', '')::UUID;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'A correção só ajusta programas que já estavam na sessão.' USING ERRCODE = '22023';
    END IF;

    IF v_session_program.program_snapshot ->> 'type' = 'aquisicao' THEN
      DELETE FROM public.aba_trial_records WHERE session_program_id = v_session_program.id;
      v_seconds := COALESCE(v_record -> 'trial_seconds', '[]'::JSONB);
      FOR v_trial, v_trial_index IN
        SELECT value, ordinality
        FROM jsonb_array_elements(COALESCE(v_record -> 'trials', '[]'::JSONB)) WITH ORDINALITY
      LOOP
        IF v_trial_index > 50 THEN
          RAISE EXCEPTION 'Até 50 tentativas por programa.' USING ERRCODE = '22023';
        END IF;
        IF v_trial IS NOT NULL AND v_trial <> 'null'::JSONB THEN
          INSERT INTO public.aba_trial_records (
            clinic_id, patient_id, session_id, session_program_id, trial_index, response, recorded_seconds
          )
          VALUES (
            v_session.clinic_id, v_session.patient_id, v_session.id, v_session_program.id,
            v_trial_index::INTEGER, v_trial #>> '{}',
            CASE
              WHEN jsonb_typeof(v_seconds -> (v_trial_index - 1)::INTEGER) = 'number'
                THEN (v_seconds ->> (v_trial_index - 1)::INTEGER)::NUMERIC
              ELSE NULL
            END
          );
        END IF;
      END LOOP;
    ELSE
      UPDATE public.aba_reduction_measurements
      SET value = COALESCE(NULLIF(v_record ->> 'value', '')::NUMERIC, value),
          observed_seconds = COALESCE(NULLIF(v_record ->> 'observed_seconds', '')::NUMERIC, observed_seconds),
          intensity = COALESCE(public.aba_clean_text(v_record ->> 'intensity', 40), intensity)
      WHERE session_program_id = v_session_program.id;
    END IF;
  END LOOP;

  v_private := public.aba_decrypt_json(v_session.private_encrypted, v_key)
    || jsonb_build_object('notes', public.aba_clean_text(p_notes, 4000));
  v_review := public.aba_decrypt_json(v_session.review_private_encrypted, v_key)
    || jsonb_build_object('correction_response', v_response);

  UPDATE public.aba_sessions
  SET status = 'corrigida',
      review_status = 'corrected_pending_review',
      corrected_at = clock_timestamp(),
      corrected_by = v_uid,
      private_encrypted = public.aba_encrypt(v_private::TEXT),
      review_private_encrypted = public.aba_encrypt(v_review::TEXT),
      revision = revision + 1,
      updated_at = clock_timestamp()
  WHERE id = v_session.id
  RETURNING * INTO v_session;

  INSERT INTO public.aba_session_reviews (
    clinic_id, patient_id, session_id, action, actor_id, notes_encrypted, previous_encrypted
  )
  VALUES (
    v_session.clinic_id, v_session.patient_id, v_session.id, 'correction_submitted', v_uid,
    public.aba_encrypt(v_response), public.aba_encrypt(v_previous::TEXT)
  );

  RETURN public.aba_session_json(v_session, v_key);
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Correção com código de resposta ou valor fora do permitido.' USING ERRCODE = '22023';
END;
$aba_correct_session$;

CREATE OR REPLACE FUNCTION public.aba_review_risk(p_incident_id UUID, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_review_risk$
DECLARE
  v_patient UUID;
  v_uid UUID;
BEGIN
  SELECT patient_id INTO v_patient FROM public.aba_risk_incidents WHERE id = p_incident_id;
  IF v_patient IS NULL THEN
    RAISE EXCEPTION 'Registro de risco não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  v_uid := public.aba_require_patient(v_patient, TRUE);

  UPDATE public.aba_risk_incidents
  SET status = 'reviewed',
      reviewed_by = v_uid,
      reviewed_at = clock_timestamp(),
      review_encrypted = public.aba_encrypt(public.aba_clean_text(p_note, 2000))
  WHERE id = p_incident_id;
END;
$aba_review_risk$;

-- Fila da supervisão (sessões aguardando decisão) e pendências do terapeuta
-- (correções pedidas a ele), de todos os pacientes que a pessoa enxerga.
CREATE OR REPLACE FUNCTION public.aba_list_review_queue()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_list_review_queue$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_key TEXT := public.get_clinical_encryption_key();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', session.id,
      'patient_id', session.patient_id,
      'patient_name', patient.name,
      'therapist_id', session.therapist_id,
      'therapist_name', therapist.full_name,
      'session_date', session.session_date,
      'status', session.status,
      'review_status', session.review_status,
      'correction_deadline', session.correction_deadline,
      'correction_reason', CASE
        WHEN session.review_status = 'correction_requested'
          THEN public.aba_decrypt_json(session.review_private_encrypted, v_key) ->> 'correction_reason'
        ELSE NULL
      END,
      'for_supervision', session.review_status IN ('pending_review', 'corrected_pending_review')
    ) ORDER BY session.started_at DESC)
    FROM public.aba_sessions session
    JOIN public.patients patient ON patient.id = session.patient_id
    LEFT JOIN public.profiles therapist ON therapist.id = session.therapist_id
    WHERE session.clinic_id = v_clinic
      AND session.status <> 'em_andamento'
      AND (
        (session.review_status IN ('pending_review', 'corrected_pending_review')
          AND public.aba_can_supervise_patient(session.patient_id, v_uid))
        OR (session.review_status = 'correction_requested'
          AND (session.therapist_id = v_uid OR public.aba_can_supervise_patient(session.patient_id, v_uid)))
      )
    LIMIT 300
  ), '[]'::JSONB);
END;
$aba_list_review_queue$;

-- ----------------------------------------------------------
-- 13. Times e convocações
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.aba_require_team_manager(p_team_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_require_team_manager$
DECLARE
  v_uid UUID := public.aba_require_gate();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.aba_care_teams team
    WHERE team.id = p_team_id
      AND team.archived_at IS NULL
      AND team.clinic_id = public.user_clinic_id(v_uid)
      AND (public.is_clinic_admin(v_uid) OR team.supervisor_id = v_uid)
  ) THEN
    RAISE EXCEPTION 'Só a administração ou a supervisão deste time mexe nele.' USING ERRCODE = '42501';
  END IF;
  RETURN v_uid;
END;
$aba_require_team_manager$;

CREATE OR REPLACE FUNCTION public.aba_get_teams()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_get_teams$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_admin BOOLEAN := public.is_clinic_admin(v_uid);
  v_key TEXT := public.get_clinical_encryption_key();
  v_supervised UUID;
  v_member_of UUID;
BEGIN
  IF NOT v_admin AND NOT public.aba_is_aba_professional(v_uid) THEN
    RAISE EXCEPTION 'A área ABA não está liberada para o seu perfil.' USING ERRCODE = '42501';
  END IF;

  SELECT team.id INTO v_supervised
  FROM public.aba_care_teams team
  WHERE team.supervisor_id = v_uid AND team.archived_at IS NULL AND team.clinic_id = v_clinic;

  SELECT member.team_id INTO v_member_of
  FROM public.aba_care_team_members member
  JOIN public.aba_care_teams team ON team.id = member.team_id AND team.archived_at IS NULL
  WHERE member.therapist_id = v_uid AND member.ended_at IS NULL AND team.clinic_id = v_clinic;

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'is_admin', v_admin,
    'supervised_team_id', v_supervised,
    'member_team_id', v_member_of,
    'teams', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', team.id,
        'name', team.name,
        'supervisor_id', team.supervisor_id,
        'created_at', team.created_at,
        'member_ids', COALESCE((
          SELECT jsonb_agg(member.therapist_id ORDER BY member.starts_at)
          FROM public.aba_care_team_members member
          WHERE member.team_id = team.id AND member.ended_at IS NULL
        ), '[]'::JSONB),
        'patients', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'id', patient.id,
            'name', patient.name,
            'therapist_ids', to_jsonb(link.therapist_ids)
          ) ORDER BY patient.name)
          FROM public.aba_patient_teams link
          JOIN public.patients patient ON patient.id = link.patient_id AND patient.erased_at IS NULL
          WHERE link.team_id = team.id AND link.ended_at IS NULL
        ), '[]'::JSONB)
      ) ORDER BY team.name)
      FROM public.aba_care_teams team
      WHERE team.clinic_id = v_clinic
        AND team.archived_at IS NULL
        AND (v_admin OR team.id = v_supervised OR team.id = v_member_of)
    ), '[]'::JSONB),
    -- Nomes da equipe ABA (para montar time e convocar): o mesmo dado
    -- administrativo que list_clinic_members já mostra para a Agenda.
    'professionals', CASE WHEN v_admin OR v_supervised IS NOT NULL THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', profile.id,
        'full_name', profile.full_name,
        'profession', profile.profession,
        'role', profile.role,
        'member_team_id', (
          SELECT member.team_id FROM public.aba_care_team_members member
          JOIN public.aba_care_teams team ON team.id = member.team_id AND team.archived_at IS NULL
          WHERE member.therapist_id = profile.id AND member.ended_at IS NULL
          LIMIT 1
        ),
        'supervised_team_id', (
          SELECT team.id FROM public.aba_care_teams team
          WHERE team.supervisor_id = profile.id AND team.archived_at IS NULL
          LIMIT 1
        )
      ) ORDER BY profile.full_name)
      FROM public.profiles profile
      WHERE profile.clinic_id = v_clinic
        AND public.aba_is_aba_professional(profile.id)
    ), '[]'::JSONB) ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', profile.id, 'full_name', profile.full_name) ORDER BY profile.full_name)
      FROM public.profiles profile
      WHERE profile.clinic_id = v_clinic
        AND (
          profile.id IN (SELECT team.supervisor_id FROM public.aba_care_teams team WHERE team.id = v_member_of)
          OR profile.id IN (
            SELECT member.therapist_id FROM public.aba_care_team_members member
            WHERE member.team_id = v_member_of AND member.ended_at IS NULL
          )
          OR profile.id = v_uid
        )
    ), '[]'::JSONB) END,
    -- Pacientes ABA ainda sem time (e, para a administração, todos os de
    -- outros times, para transferir).
    'available_patients', CASE WHEN v_admin OR v_supervised IS NOT NULL THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', patient.id,
        'name', patient.name,
        'team_id', public.aba_patient_team_id(patient.id)
      ) ORDER BY patient.name)
      FROM public.patients patient
      WHERE patient.clinic_id = v_clinic
        AND patient.archived_at IS NULL
        AND patient.erased_at IS NULL
        AND EXISTS (
          SELECT 1 FROM public.patient_enrollments enrollment
          WHERE enrollment.patient_id = patient.id
            AND enrollment.discipline = 'aba'
            AND enrollment.status = 'active'
        )
        AND (v_admin OR public.aba_patient_team_id(patient.id) IS NULL)
    ), '[]'::JSONB) ELSE '[]'::JSONB END,
    'callouts', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', callout.id,
        'patient_id', callout.patient_id,
        'patient_name', patient.name,
        'therapist_id', callout.therapist_id,
        'therapist_name', therapist.full_name,
        'requested_by', callout.requested_by,
        'requested_by_name', requester.full_name,
        'team_id', callout.team_id,
        'kind', callout.kind,
        'reason', public.aba_decrypt_text(callout.reason_encrypted, v_key),
        'starts_at', callout.starts_at,
        'ends_at', callout.ends_at,
        'status', callout.status,
        'active_now', public.aba_has_active_callout(callout.patient_id, callout.therapist_id),
        'viewed_at', callout.viewed_at,
        'accepted_at', callout.accepted_at,
        'acceptance_moment', callout.acceptance_moment,
        'closed_at', callout.closed_at,
        'response', public.aba_decrypt_text(callout.response_encrypted, v_key),
        'created_at', callout.created_at
      ) ORDER BY callout.created_at DESC)
      FROM public.aba_callouts callout
      JOIN public.patients patient ON patient.id = callout.patient_id
      LEFT JOIN public.profiles therapist ON therapist.id = callout.therapist_id
      LEFT JOIN public.profiles requester ON requester.id = callout.requested_by
      WHERE callout.clinic_id = v_clinic
        AND (
          v_admin
          OR callout.therapist_id = v_uid
          OR callout.requested_by = v_uid
          OR (v_supervised IS NOT NULL AND callout.team_id = v_supervised)
        )
        AND callout.created_at > clock_timestamp() - INTERVAL '180 days'
    ), '[]'::JSONB)
  );
END;
$aba_get_teams$;

CREATE OR REPLACE FUNCTION public.aba_create_team(p_name TEXT, p_supervisor_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_create_team$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_id UUID;
BEGIN
  IF NOT public.is_clinic_admin(v_uid) THEN
    RAISE EXCEPTION 'Só a administração da clínica cria times.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = p_supervisor_id
      AND profile.clinic_id = v_clinic
      AND public.aba_is_aba_professional(profile.id)
  ) THEN
    RAISE EXCEPTION 'O supervisor precisa ser da clínica e ter a área ABA.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.aba_care_teams team
    WHERE team.supervisor_id = p_supervisor_id AND team.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Esta pessoa já coordena um time.' USING ERRCODE = '22023';
  END IF;

  -- Quem passa a coordenar deixa de ser membro de outro time.
  UPDATE public.aba_care_team_members
  SET ended_at = clock_timestamp(), ended_by = v_uid
  WHERE therapist_id = p_supervisor_id AND ended_at IS NULL;

  INSERT INTO public.aba_care_teams (clinic_id, name, supervisor_id, created_by)
  VALUES (v_clinic, btrim(p_name), p_supervisor_id, v_uid)
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um time com este nome.' USING ERRCODE = '23505';
  WHEN check_violation THEN
    RAISE EXCEPTION 'O nome do time precisa ter de 2 a 80 letras.' USING ERRCODE = '22023';
END;
$aba_create_team$;

CREATE OR REPLACE FUNCTION public.aba_update_team(
  p_team_id UUID,
  p_name TEXT DEFAULT NULL,
  p_supervisor_id UUID DEFAULT NULL,
  p_archive BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_update_team$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_team public.aba_care_teams%ROWTYPE;
BEGIN
  IF NOT public.is_clinic_admin(v_uid) THEN
    RAISE EXCEPTION 'Só a administração da clínica renomeia, troca a supervisão ou encerra times.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_team FROM public.aba_care_teams
  WHERE id = p_team_id AND clinic_id = v_clinic AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Time não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF p_archive THEN
    UPDATE public.aba_care_team_members
    SET ended_at = clock_timestamp(), ended_by = v_uid
    WHERE team_id = p_team_id AND ended_at IS NULL;
    UPDATE public.aba_patient_teams
    SET ended_at = clock_timestamp(), ended_by = v_uid
    WHERE team_id = p_team_id AND ended_at IS NULL;
    UPDATE public.aba_care_teams
    SET archived_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = p_team_id;
    RETURN;
  END IF;

  IF p_supervisor_id IS NOT NULL AND p_supervisor_id <> v_team.supervisor_id THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = p_supervisor_id
        AND profile.clinic_id = v_clinic
        AND public.aba_is_aba_professional(profile.id)
    ) THEN
      RAISE EXCEPTION 'O supervisor precisa ser da clínica e ter a área ABA.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.aba_care_teams team
      WHERE team.supervisor_id = p_supervisor_id AND team.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Esta pessoa já coordena outro time.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.aba_care_team_members
    SET ended_at = clock_timestamp(), ended_by = v_uid
    WHERE therapist_id = p_supervisor_id AND ended_at IS NULL;
  END IF;

  UPDATE public.aba_care_teams
  SET name = COALESCE(NULLIF(btrim(p_name), ''), name),
      supervisor_id = COALESCE(p_supervisor_id, supervisor_id),
      updated_at = clock_timestamp()
  WHERE id = p_team_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Já existe um time com este nome.' USING ERRCODE = '23505';
  WHEN check_violation THEN
    RAISE EXCEPTION 'O nome do time precisa ter de 2 a 80 letras.' USING ERRCODE = '22023';
END;
$aba_update_team$;

CREATE OR REPLACE FUNCTION public.aba_set_team_member(
  p_team_id UUID,
  p_therapist_id UUID,
  p_member BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_set_team_member$
DECLARE
  v_uid UUID := public.aba_require_team_manager(p_team_id);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_admin BOOLEAN := public.is_clinic_admin(v_uid);
  v_current_team UUID;
BEGIN
  IF NOT p_member THEN
    UPDATE public.aba_care_team_members
    SET ended_at = clock_timestamp(), ended_by = v_uid
    WHERE team_id = p_team_id AND therapist_id = p_therapist_id AND ended_at IS NULL;
    -- Sai também da lista de responsáveis diretos das crianças do time.
    UPDATE public.aba_patient_teams
    SET therapist_ids = array_remove(therapist_ids, p_therapist_id)
    WHERE team_id = p_team_id AND ended_at IS NULL;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = p_therapist_id
      AND profile.clinic_id = v_clinic
      AND public.aba_is_aba_professional(profile.id)
  ) THEN
    RAISE EXCEPTION 'O terapeuta precisa ser da clínica e ter a área ABA.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.aba_care_teams team
    WHERE team.supervisor_id = p_therapist_id AND team.archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Quem coordena um time não entra como membro de outro.' USING ERRCODE = '22023';
  END IF;

  SELECT member.team_id INTO v_current_team
  FROM public.aba_care_team_members member
  WHERE member.therapist_id = p_therapist_id AND member.ended_at IS NULL;

  IF v_current_team = p_team_id THEN
    RETURN;
  END IF;
  IF v_current_team IS NOT NULL THEN
    IF NOT v_admin THEN
      RAISE EXCEPTION 'Este terapeuta já está em outro time. A transferência é feita pela administração.'
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.aba_care_team_members
    SET ended_at = clock_timestamp(), ended_by = v_uid
    WHERE therapist_id = p_therapist_id AND ended_at IS NULL;
    UPDATE public.aba_patient_teams
    SET therapist_ids = array_remove(therapist_ids, p_therapist_id)
    WHERE team_id = v_current_team AND ended_at IS NULL;
  END IF;

  INSERT INTO public.aba_care_team_members (clinic_id, team_id, therapist_id, assigned_by)
  VALUES (v_clinic, p_team_id, p_therapist_id, v_uid);
END;
$aba_set_team_member$;

CREATE OR REPLACE FUNCTION public.aba_set_team_patient(
  p_team_id UUID,
  p_patient_id UUID,
  p_member BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_set_team_patient$
DECLARE
  v_uid UUID := public.aba_require_team_manager(p_team_id);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_admin BOOLEAN := public.is_clinic_admin(v_uid);
  v_current_team UUID := public.aba_patient_team_id(p_patient_id);
  v_supervisor UUID;
BEGIN
  IF NOT p_member THEN
    UPDATE public.aba_patient_teams
    SET ended_at = clock_timestamp(), ended_by = v_uid
    WHERE team_id = p_team_id AND patient_id = p_patient_id AND ended_at IS NULL;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.patients patient
    WHERE patient.id = p_patient_id
      AND patient.clinic_id = v_clinic
      AND patient.archived_at IS NULL
      AND patient.erased_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Paciente não encontrado nesta clínica.' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_team = p_team_id THEN
    RETURN;
  END IF;
  IF v_current_team IS NOT NULL THEN
    IF NOT v_admin THEN
      RAISE EXCEPTION 'Esta criança já está em outro time. A transferência é feita pela administração.'
        USING ERRCODE = '42501';
    END IF;
    UPDATE public.aba_patient_teams
    SET ended_at = clock_timestamp(), ended_by = v_uid
    WHERE patient_id = p_patient_id AND ended_at IS NULL;
  END IF;

  SELECT supervisor_id INTO v_supervisor FROM public.aba_care_teams WHERE id = p_team_id;

  -- Entrar num time é estar na área: matrícula ABA ativa, com a
  -- supervisão do time como responsável quando ainda não havia uma.
  INSERT INTO public.patient_enrollments AS enrollment (patient_id, clinic_id, discipline, status, referred_by, assigned_to)
  VALUES (p_patient_id, v_clinic, 'aba', 'active', v_uid, v_supervisor)
  ON CONFLICT (patient_id, discipline) DO UPDATE
  SET status = 'active',
      assigned_to = COALESCE(enrollment.assigned_to, EXCLUDED.assigned_to);

  INSERT INTO public.aba_patient_teams (clinic_id, team_id, patient_id, assigned_by)
  VALUES (v_clinic, p_team_id, p_patient_id, v_uid);
END;
$aba_set_team_patient$;

CREATE OR REPLACE FUNCTION public.aba_set_patient_therapists(p_patient_id UUID, p_therapist_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_set_patient_therapists$
DECLARE
  v_team UUID := public.aba_patient_team_id(p_patient_id);
  v_uid UUID;
  v_ids UUID[] := ARRAY(SELECT DISTINCT unnest(COALESCE(p_therapist_ids, '{}'::UUID[])));
BEGIN
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'A criança ainda não está num time.' USING ERRCODE = '22023';
  END IF;
  v_uid := public.aba_require_team_manager(v_team);

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) chosen(id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.aba_care_team_members member
      WHERE member.team_id = v_team AND member.therapist_id = chosen.id AND member.ended_at IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'Só terapeutas do próprio time podem ser responsáveis diretos.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.aba_patient_teams
  SET therapist_ids = v_ids
  WHERE team_id = v_team AND patient_id = p_patient_id AND ended_at IS NULL;
END;
$aba_set_patient_therapists$;

CREATE OR REPLACE FUNCTION public.aba_create_callout(
  p_patient_id UUID,
  p_therapist_id UUID,
  p_kind TEXT,
  p_reason TEXT,
  p_starts_at TIMESTAMPTZ DEFAULT NULL,
  p_ends_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_create_callout$
DECLARE
  v_uid UUID := public.aba_require_patient(p_patient_id, TRUE);
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_team UUID := public.aba_patient_team_id(p_patient_id);
  v_reason TEXT := public.aba_clean_text(p_reason, 500);
  v_starts TIMESTAMPTZ := COALESCE(p_starts_at, clock_timestamp());
  v_id UUID;
BEGIN
  IF v_team IS NULL THEN
    RAISE EXCEPTION 'Convocação é para criança que já tem time.' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('atendimento', 'periodo') THEN
    RAISE EXCEPTION 'Tipo de convocação inválido.' USING ERRCODE = '22023';
  END IF;
  IF v_reason IS NULL OR char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Descreva por que o apoio é necessário.' USING ERRCODE = '22023';
  END IF;
  IF p_kind = 'periodo' AND (p_ends_at IS NULL OR p_ends_at <= v_starts OR p_ends_at > v_starts + INTERVAL '90 days') THEN
    RAISE EXCEPTION 'O apoio por período precisa de um fim depois do início (até 90 dias).' USING ERRCODE = '22023';
  END IF;
  IF v_starts < clock_timestamp() - INTERVAL '1 day' OR v_starts > clock_timestamp() + INTERVAL '60 days' THEN
    RAISE EXCEPTION 'O início da convocação precisa ser de hoje em diante.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = p_therapist_id
      AND profile.clinic_id = v_clinic
      AND public.aba_is_aba_professional(profile.id)
  ) THEN
    RAISE EXCEPTION 'O terapeuta convocado precisa ser da clínica e ter a área ABA.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.aba_care_team_members member
    WHERE member.team_id = v_team AND member.therapist_id = p_therapist_id AND member.ended_at IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.aba_care_teams team WHERE team.id = v_team AND team.supervisor_id = p_therapist_id
  ) THEN
    RAISE EXCEPTION 'Este terapeuta já é do time da criança.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.aba_callouts (
    clinic_id, patient_id, therapist_id, team_id, requested_by, kind, reason_encrypted, starts_at, ends_at
  )
  VALUES (
    v_clinic, p_patient_id, p_therapist_id, v_team, v_uid, p_kind, public.aba_encrypt(v_reason),
    v_starts, CASE WHEN p_kind = 'periodo' THEN p_ends_at ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$aba_create_callout$;

CREATE OR REPLACE FUNCTION public.aba_manage_callout(
  p_callout_id UUID,
  p_action TEXT,
  p_moment TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_manage_callout$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_callout public.aba_callouts%ROWTYPE;
  v_manager BOOLEAN;
  v_notes TEXT := public.aba_clean_text(p_notes, 1000);
BEGIN
  SELECT * INTO v_callout FROM public.aba_callouts
  WHERE id = p_callout_id AND clinic_id = public.user_clinic_id(v_uid)
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convocação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  v_manager := public.is_clinic_admin(v_uid)
    OR v_callout.requested_by = v_uid
    OR EXISTS (
      SELECT 1 FROM public.aba_care_teams team
      WHERE team.id = v_callout.team_id AND team.supervisor_id = v_uid AND team.archived_at IS NULL
    );

  IF p_action = 'visualizar' THEN
    IF v_callout.therapist_id <> v_uid THEN
      RAISE EXCEPTION 'Esta convocação não é para você.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.aba_callouts
    SET viewed_at = COALESCE(viewed_at, clock_timestamp()), updated_at = clock_timestamp()
    WHERE id = p_callout_id;
    RETURN;
  END IF;

  IF p_action IN ('aceitar', 'concluir', 'recusar') THEN
    IF v_callout.therapist_id <> v_uid THEN
      RAISE EXCEPTION 'Só o terapeuta convocado responde.' USING ERRCODE = '42501';
    END IF;
    IF p_action <> 'recusar' AND (p_moment IS NULL OR p_moment NOT IN ('antes', 'durante', 'depois')) THEN
      RAISE EXCEPTION 'Diga quando confirmou: antes, durante ou depois do atendimento.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'aceitar' AND v_callout.status <> 'convocado' THEN
      RAISE EXCEPTION 'Esta convocação já foi respondida.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'concluir' AND v_callout.status NOT IN ('convocado', 'aceito') THEN
      RAISE EXCEPTION 'Esta convocação já foi encerrada.' USING ERRCODE = '22023';
    END IF;
    IF p_action = 'recusar' AND v_callout.status <> 'convocado' THEN
      RAISE EXCEPTION 'Só dá para recusar antes de aceitar.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.aba_callouts
    SET status = CASE p_action WHEN 'aceitar' THEN 'aceito' WHEN 'concluir' THEN 'concluido' ELSE 'recusado' END,
        viewed_at = COALESCE(viewed_at, clock_timestamp()),
        accepted_at = CASE WHEN p_action IN ('aceitar', 'concluir') THEN COALESCE(accepted_at, clock_timestamp()) ELSE accepted_at END,
        acceptance_moment = CASE WHEN p_action IN ('aceitar', 'concluir') THEN COALESCE(acceptance_moment, p_moment) ELSE acceptance_moment END,
        closed_at = CASE WHEN p_action IN ('concluir', 'recusar') THEN clock_timestamp() ELSE closed_at END,
        closed_by = CASE WHEN p_action IN ('concluir', 'recusar') THEN v_uid ELSE closed_by END,
        response_encrypted = CASE WHEN v_notes IS NULL THEN response_encrypted ELSE public.aba_encrypt(v_notes) END,
        updated_at = clock_timestamp()
    WHERE id = p_callout_id;
    RETURN;
  END IF;

  IF p_action = 'cancelar' THEN
    IF NOT v_manager THEN
      RAISE EXCEPTION 'Só quem convocou, a supervisão do time ou a administração cancela.' USING ERRCODE = '42501';
    END IF;
    IF v_callout.status NOT IN ('convocado', 'aceito') THEN
      RAISE EXCEPTION 'Esta convocação já foi encerrada.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.aba_callouts
    SET status = 'cancelado',
        closed_at = clock_timestamp(),
        closed_by = v_uid,
        response_encrypted = CASE WHEN v_notes IS NULL THEN response_encrypted ELSE public.aba_encrypt(v_notes) END,
        updated_at = clock_timestamp()
    WHERE id = p_callout_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Ação inválida.' USING ERRCODE = '22023';
END;
$aba_manage_callout$;

CREATE OR REPLACE FUNCTION public.aba_save_settings(
  p_default_trial_count INTEGER,
  p_program_block_minutes INTEGER,
  p_pause_minutes INTEGER,
  p_correction_window_hours INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $aba_save_settings$
DECLARE
  v_uid UUID := public.aba_require_gate();
  v_clinic UUID := public.user_clinic_id(v_uid);
BEGIN
  IF NOT public.is_clinic_admin(v_uid) THEN
    RAISE EXCEPTION 'Só a administração da clínica muda a configuração da coleta.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.aba_clinic_settings AS settings (
    clinic_id, default_trial_count, program_block_minutes, pause_minutes, correction_window_hours, updated_by
  )
  VALUES (v_clinic, p_default_trial_count, p_program_block_minutes, p_pause_minutes, p_correction_window_hours, v_uid)
  ON CONFLICT (clinic_id) DO UPDATE
  SET default_trial_count = EXCLUDED.default_trial_count,
      program_block_minutes = EXCLUDED.program_block_minutes,
      pause_minutes = EXCLUDED.pause_minutes,
      correction_window_hours = EXCLUDED.correction_window_hours,
      updated_by = v_uid,
      updated_at = clock_timestamp();
EXCEPTION
  WHEN check_violation OR not_null_violation THEN
    RAISE EXCEPTION 'Valores fora do permitido na configuração da coleta.' USING ERRCODE = '22023';
END;
$aba_save_settings$;

-- ----------------------------------------------------------
-- 14. Permissões das funções
-- Internas (cifra, montagem de JSON, troca dos filhos da sessão): só o dono.
-- Públicas para quem está logado: as RPCs da tela.
-- ----------------------------------------------------------
REVOKE ALL ON FUNCTION public.aba_encrypt(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_decrypt_json(BYTEA, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_decrypt_text(BYTEA, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_clean_text(TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_is_restricted_procedure(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_patient_team_id(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_is_aba_professional(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_has_active_callout(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_owns_unassigned_patient(UUID, UUID) FROM PUBLIC, anon, authenticated;
-- As duas abaixo recebem p_user: liberar para a tela deixaria qualquer um
-- perguntar se OUTRA pessoa enxerga um paciente. A tela recebe as
-- permissões prontas em aba_get_patient_data.
REVOKE ALL ON FUNCTION public.aba_can_access_patient(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_can_supervise_patient(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_require_gate() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_require_patient(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_require_team_manager(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_program_json(public.aba_programs, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_session_json(public.aba_sessions, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_program_patient(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.aba_replace_session_children(public.aba_sessions, JSONB, UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.aba_get_patient_data(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_program(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_update_program_status(UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_reinforcer(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_behavior(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_review_behavior(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_session(UUID, JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_discard_session(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_review_session(UUID, TEXT, TEXT, INTEGER, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_correct_session(UUID, BIGINT, JSONB, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_review_risk(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_list_review_queue() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_get_teams() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_create_team(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_update_team(UUID, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_set_team_member(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_set_team_patient(UUID, UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_set_patient_therapists(UUID, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_create_callout(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_manage_callout(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.aba_save_settings(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.aba_get_patient_data(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_program(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_update_program_status(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_reinforcer(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_behavior(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_review_behavior(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_session(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_discard_session(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_review_session(UUID, TEXT, TEXT, INTEGER, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_correct_session(UUID, BIGINT, JSONB, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_review_risk(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_list_review_queue() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_get_teams() TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_create_team(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_update_team(UUID, TEXT, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_set_team_member(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_set_team_patient(UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_set_patient_therapists(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_create_callout(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_manage_callout(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.aba_save_settings(INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ----------------------------------------------------------
-- 15. Exclusão de paciente: as tabelas ABA entram no snapshot e saem
--     junto. Corpo copiado da versão viva (20261031_convenios_fase1.sql);
--     mudam só as linhas aba_* do snapshot e dos DELETE.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_patient_deletion(
  p_request_id UUID,
  p_decision TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $admin_decide_patient_deletion$
DECLARE
  v_uid UUID := auth.uid();
  v_req public.patient_deletion_requests%ROWTYPE;
  v_snapshot JSONB;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_req
  FROM public.patient_deletion_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Solicitação já foi decidida.' USING ERRCODE = '55000';
  END IF;

  IF v_uid IS NULL
     OR NOT (
       public.is_super_admin(v_uid)
       OR (public.is_clinic_admin(v_uid) AND v_req.clinic_id = public.user_clinic_id(v_uid))
     ) THEN
    RAISE EXCEPTION 'Acesso negado: somente administração da clínica decide.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_deletion_requests
  SET status = p_decision,
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;

  IF p_decision = 'rejected' THEN
    -- Volta a ficar visível normalmente: a exclusão foi negada.
    UPDATE public.patients
    SET archived_at = NULL
    WHERE id = v_req.patient_id;
    RETURN;
  END IF;

  -- Aprovado: snapshot completo antes de qualquer exclusão/limpeza.
  SELECT jsonb_build_object(
    'patient', (SELECT to_jsonb(p) FROM public.patients p WHERE p.id = v_req.patient_id),
    'clinical_records', (SELECT coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) FROM public.clinical_records r WHERE r.patient_id = v_req.patient_id),
    'patient_evolutions', (SELECT coalesce(jsonb_agg(to_jsonb(e)), '[]'::jsonb) FROM public.patient_evolutions e WHERE e.patient_id = v_req.patient_id),
    'patient_instrument_applications', (SELECT coalesce(jsonb_agg(to_jsonb(ia)), '[]'::jsonb) FROM public.patient_instrument_applications ia WHERE ia.patient_id = v_req.patient_id),
    'patient_interview_responses', (SELECT coalesce(jsonb_agg(to_jsonb(ir) - 'link_token_hash' - 'link_token_encrypted'), '[]'::jsonb) FROM public.patient_interview_responses ir WHERE ir.patient_id = v_req.patient_id),
    'patient_form_assignments', (SELECT coalesce(jsonb_agg(to_jsonb(fa)), '[]'::jsonb) FROM public.patient_form_assignments fa WHERE fa.patient_id = v_req.patient_id),
    'patient_portal_access', (SELECT coalesce(jsonb_agg(to_jsonb(pa)), '[]'::jsonb) FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id),
    'patient_consents', (SELECT coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) FROM public.patient_consents pc WHERE pc.patient_id = v_req.patient_id),
    'patient_coverages', (SELECT coalesce(jsonb_agg(to_jsonb(cv)), '[]'::jsonb) FROM public.patient_coverages cv WHERE cv.patient_id = v_req.patient_id),
    'patient_enrollments', (SELECT coalesce(jsonb_agg(to_jsonb(en)), '[]'::jsonb) FROM public.patient_enrollments en WHERE en.patient_id = v_req.patient_id),
    'appointments', (SELECT coalesce(jsonb_agg(to_jsonb(a)), '[]'::jsonb) FROM public.appointments a WHERE a.patient_id = v_req.patient_id),
    'record_shares', (SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) FROM public.record_shares s WHERE s.patient_id = v_req.patient_id),
    'aba_session_reviews', (SELECT coalesce(jsonb_agg(to_jsonb(asr)), '[]'::jsonb) FROM public.aba_session_reviews asr WHERE asr.patient_id = v_req.patient_id),
    'aba_risk_incidents', (SELECT coalesce(jsonb_agg(to_jsonb(ari)), '[]'::jsonb) FROM public.aba_risk_incidents ari WHERE ari.patient_id = v_req.patient_id),
    'aba_behavior_events', (SELECT coalesce(jsonb_agg(to_jsonb(abe)), '[]'::jsonb) FROM public.aba_behavior_events abe WHERE abe.patient_id = v_req.patient_id),
    'aba_reinforcer_uses', (SELECT coalesce(jsonb_agg(to_jsonb(aru)), '[]'::jsonb) FROM public.aba_reinforcer_uses aru WHERE aru.patient_id = v_req.patient_id),
    'aba_session_pauses', (SELECT coalesce(jsonb_agg(to_jsonb(asp)), '[]'::jsonb) FROM public.aba_session_pauses asp WHERE asp.patient_id = v_req.patient_id),
    'aba_trial_records', (SELECT coalesce(jsonb_agg(to_jsonb(atr)), '[]'::jsonb) FROM public.aba_trial_records atr WHERE atr.patient_id = v_req.patient_id),
    'aba_reduction_measurements', (SELECT coalesce(jsonb_agg(to_jsonb(arm)), '[]'::jsonb) FROM public.aba_reduction_measurements arm WHERE arm.patient_id = v_req.patient_id),
    'aba_session_programs', (SELECT coalesce(jsonb_agg(to_jsonb(aspg)), '[]'::jsonb) FROM public.aba_session_programs aspg WHERE aspg.patient_id = v_req.patient_id),
    'aba_sessions', (SELECT coalesce(jsonb_agg(to_jsonb(ases)), '[]'::jsonb) FROM public.aba_sessions ases WHERE ases.patient_id = v_req.patient_id),
    'aba_programs', (SELECT coalesce(jsonb_agg(to_jsonb(aprg)), '[]'::jsonb) FROM public.aba_programs aprg WHERE aprg.patient_id = v_req.patient_id),
    'aba_interfering_behaviors', (SELECT coalesce(jsonb_agg(to_jsonb(aib)), '[]'::jsonb) FROM public.aba_interfering_behaviors aib WHERE aib.patient_id = v_req.patient_id),
    'aba_reinforcers', (SELECT coalesce(jsonb_agg(to_jsonb(arf)), '[]'::jsonb) FROM public.aba_reinforcers arf WHERE arf.patient_id = v_req.patient_id),
    'aba_callouts', (SELECT coalesce(jsonb_agg(to_jsonb(aco)), '[]'::jsonb) FROM public.aba_callouts aco WHERE aco.patient_id = v_req.patient_id),
    'aba_patient_teams', (SELECT coalesce(jsonb_agg(to_jsonb(apt)), '[]'::jsonb) FROM public.aba_patient_teams apt WHERE apt.patient_id = v_req.patient_id),
    'patient_attachments', (SELECT coalesce(jsonb_agg(to_jsonb(at)), '[]'::jsonb) FROM public.patient_attachments at WHERE at.patient_id = v_req.patient_id)
  ) INTO v_snapshot;

  INSERT INTO patient_erasure_backup.snapshots (patient_id, request_id, erased_by, snapshot)
  VALUES (v_req.patient_id, p_request_id, v_uid, v_snapshot);

  -- ABA (20261101b): filhas antes das mães; o programa sai antes do
  -- comportamento (procedimento restrito aponta para ele).
  DELETE FROM public.aba_session_reviews WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_risk_incidents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_behavior_events WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reinforcer_uses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_pauses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_trial_records WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reduction_measurements WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_session_programs WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_sessions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_programs WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_interfering_behaviors WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_reinforcers WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_callouts WHERE patient_id = v_req.patient_id;
  DELETE FROM public.aba_patient_teams WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_portal_sessions WHERE access_id IN (SELECT pa.id FROM public.patient_portal_access pa WHERE pa.patient_id = v_req.patient_id);
  DELETE FROM public.patient_portal_access WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_form_assignments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_interview_responses WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_consents WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_coverages WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_attachments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.record_shares WHERE patient_id = v_req.patient_id;
  -- Evolução antes do agendamento: patient_evolutions.appointment_id é
  -- RESTRICT, e na ordem antiga a exclusão de quem tinha evolução parava aí.
  DELETE FROM public.patient_evolutions WHERE patient_id = v_req.patient_id;
  DELETE FROM public.appointments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_enrollments WHERE patient_id = v_req.patient_id;
  DELETE FROM public.patient_instrument_applications WHERE patient_id = v_req.patient_id;
  DELETE FROM public.clinical_records WHERE patient_id = v_req.patient_id;

  UPDATE public.patients
  SET name = '[Paciente removido]',
      phone = NULL,
      birth_date = NULL,
      age = NULL,
      cpf = NULL,
      nome_social = NULL,
      nome_mae = NULL,
      nome_pai = NULL,
      nome_conjuge = NULL,
      sexo_biologico = NULL,
      genero = NULL,
      responsavel_nome = NULL,
      responsavel_telefone = NULL,
      responsavel_cpf = NULL,
      convenio_nome = NULL,
      convenio_carteirinha = NULL,
      endereco_cep = NULL,
      endereco_logradouro = NULL,
      endereco_numero = NULL,
      endereco_complemento = NULL,
      endereco_bairro = NULL,
      endereco_cidade = NULL,
      endereco_uf = NULL,
      image_consent = FALSE,
      image_consent_at = NULL,
      has_pending = FALSE,
      suspended_at = NULL,
      archived_at = COALESCE(archived_at, pg_catalog.clock_timestamp()),
      erased_at = pg_catalog.clock_timestamp()
  WHERE id = v_req.patient_id;

  UPDATE public.patient_deletion_requests
  SET status = 'executed',
      decided_by = v_uid,
      decided_at = pg_catalog.clock_timestamp()
  WHERE id = p_request_id;
END;
$admin_decide_patient_deletion$;

REVOKE ALL ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_decide_patient_deletion(UUID, TEXT, TEXT) TO authenticated;
