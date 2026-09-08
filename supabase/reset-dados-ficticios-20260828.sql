-- ============================================================
-- RESET de dados fictícios: pacientes, profissionais, clínicas
-- Gerado em 2026-08-28. Rode manualmente no SQL Editor do Supabase.
--
-- O QUE SAI: profiles (exceto quem estiver em v_keep_emails), patients,
-- clinical_records, clinics, appointments, professional_schedules,
-- clinic_holidays, record_shares, patient_enrollments,
-- patient_deletion_requests(+audit), e (via cascade automático do
-- Postgres ao apagar o profile) ai_corrections e curation_proposals
-- de autoria dessas contas, além dos logins em auth.users.
--
-- O QUE FICA INTOCADO (Biblioteca de Conhecimento, não é dado fictício
-- de paciente/profissional):
--   knowledge_sources, knowledge_entities, knowledge_entity_versions,
--   point_locations, knowledge_relationships, safety_rules,
--   ingestion_batches, knowledge_drafts, knowledge_audit_log,
--   knowledge_source_assets, ai_instructions, ai_instruction_versions,
--   psych_curation_items, app_config, admin_audit_logs (os campos
--   actor_id/target_id apontando pra contas apagadas viram NULL, mas a
--   linha do log continua existindo — é auditoria, não dado do paciente),
--   clinical_record_write_receipts, clinical_record_audit_log (idem:
--   log imutável, não tem FK pra patients/profiles de propósito),
--   edge_rate_limits, knowledge_outbox.
--
-- O QUE ISSO NÃO COBRE (precisa de ação manual à parte):
--   Arquivos no Storage (bucket "clinical-tongue-photos"). Apagar linhas
--   do banco não apaga o blob no object storage — é preciso ir em
--   Dashboard → Storage → clinical-tongue-photos e remover as pastas
--   que não são a sua (o 1º segmento do caminho é o auth.uid() do dono).
-- ============================================================


-- ============================================================
-- PARTE 1 — PREVIEW (só leitura, roda quantas vezes quiser)
-- Cole e rode ISSO SOZINHO primeiro. Confira os números antes de
-- seguir pra Parte 2. Se algum profissional aqui contado for uma
-- pessoa real (ex.: a psicóloga ou acupunturista revisora, se já
-- tiverem sido criadas de verdade), NÃO rode a Parte 2 ainda — me
-- avise pra eu ajustar a lista de contas a manter.
-- ============================================================

WITH keep AS (
  SELECT id FROM auth.users
  WHERE email = ANY(ARRAY['neuroreabilitys@gmail.com'])
  -- adicione outros e-mails reais aqui, separados por vírgula, se
  -- precisar manter mais alguém além do SuperAdm
)
SELECT
  (SELECT string_agg(email, ', ') FROM auth.users WHERE id IN (SELECT id FROM keep)) AS mantidos,
  (SELECT count(*) FROM auth.users WHERE id NOT IN (SELECT id FROM keep))            AS contas_login_a_apagar,
  (SELECT count(*) FROM public.profiles WHERE id NOT IN (SELECT id FROM keep))       AS perfis_a_apagar,
  (SELECT string_agg(DISTINCT COALESCE(role, '?'), ', ') FROM public.profiles WHERE id NOT IN (SELECT id FROM keep)) AS papeis_dos_perfis_a_apagar,
  (SELECT count(*) FROM public.patients)                                             AS pacientes_a_apagar,
  (SELECT count(*) FROM public.clinical_records)                                     AS prontuarios_a_apagar,
  (SELECT count(*) FROM public.clinics)                                              AS clinicas_a_apagar,
  (SELECT count(*) FROM public.appointments)                                         AS agendamentos_a_apagar,
  (SELECT count(*) FROM public.professional_schedules)                               AS horarios_a_apagar,
  (SELECT count(*) FROM public.clinic_holidays)                                      AS feriados_a_apagar,
  (SELECT count(*) FROM public.record_shares)                                        AS compartilhamentos_a_apagar,
  (SELECT count(*) FROM public.patient_enrollments)                                  AS matriculas_a_apagar,
  (SELECT count(*) FROM public.patient_deletion_requests)                            AS solicitacoes_exclusao_a_apagar,
  (SELECT count(*) FROM public.ai_corrections WHERE author_id NOT IN (SELECT id FROM keep))     AS correcoes_ia_perdidas_no_cascade,
  (SELECT count(*) FROM public.curation_proposals WHERE proposer_id NOT IN (SELECT id FROM keep)) AS propostas_curadoria_perdidas_no_cascade;


-- ============================================================
-- PARTE 2 — BACKUP + EXCLUSÃO (destrutivo, roda como transação única)
-- Cole e rode ISSO SOZINHO, em outra execução, depois de conferir a
-- Parte 1. É tudo uma transação: se qualquer checagem falhar, dá
-- ROLLBACK automático e nada é apagado.
-- ============================================================

BEGIN;

CREATE TEMP TABLE _reset_keep AS
SELECT id FROM auth.users
WHERE email = ANY(ARRAY['neuroreabilitys@gmail.com']);
-- mesmo array da Parte 1 — mantenha os dois sincronizados

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _reset_keep) THEN
    RAISE EXCEPTION 'Nenhuma conta encontrada com os e-mails de v_keep_emails. Abortando para não apagar tudo.';
  END IF;
END $$;

-- --- Backup: snapshot de tudo que será apagado, numa schema à parte ---
CREATE SCHEMA IF NOT EXISTS backup_pre_reset_20260828;

CREATE TABLE backup_pre_reset_20260828.auth_users AS
  SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data
  FROM auth.users WHERE id NOT IN (SELECT id FROM _reset_keep);
CREATE TABLE backup_pre_reset_20260828.profiles AS
  SELECT * FROM public.profiles WHERE id NOT IN (SELECT id FROM _reset_keep);
CREATE TABLE backup_pre_reset_20260828.patients AS
  SELECT * FROM public.patients;
CREATE TABLE backup_pre_reset_20260828.clinical_records AS
  SELECT * FROM public.clinical_records;
CREATE TABLE backup_pre_reset_20260828.clinics AS
  SELECT * FROM public.clinics;
CREATE TABLE backup_pre_reset_20260828.appointments AS
  SELECT * FROM public.appointments;
CREATE TABLE backup_pre_reset_20260828.professional_schedules AS
  SELECT * FROM public.professional_schedules;
CREATE TABLE backup_pre_reset_20260828.clinic_holidays AS
  SELECT * FROM public.clinic_holidays;
CREATE TABLE backup_pre_reset_20260828.record_shares AS
  SELECT * FROM public.record_shares;
CREATE TABLE backup_pre_reset_20260828.patient_enrollments AS
  SELECT * FROM public.patient_enrollments;
CREATE TABLE backup_pre_reset_20260828.patient_deletion_requests AS
  SELECT * FROM public.patient_deletion_requests;
CREATE TABLE backup_pre_reset_20260828.patient_deletion_request_audit AS
  SELECT * FROM public.patient_deletion_request_audit;
CREATE TABLE backup_pre_reset_20260828.ai_corrections AS
  SELECT * FROM public.ai_corrections WHERE author_id NOT IN (SELECT id FROM _reset_keep);
CREATE TABLE backup_pre_reset_20260828.curation_proposals AS
  SELECT * FROM public.curation_proposals WHERE proposer_id NOT IN (SELECT id FROM _reset_keep);

-- --- Exclusão, filhos antes dos pais (respeita os FKs RESTRICT) ---
DELETE FROM public.patient_deletion_request_audit;
DELETE FROM public.patient_deletion_requests;
DELETE FROM public.appointments;
DELETE FROM public.professional_schedules;
DELETE FROM public.clinic_holidays;
DELETE FROM public.record_shares;
DELETE FROM public.patient_enrollments;
DELETE FROM public.clinical_records;
DELETE FROM public.patients;
DELETE FROM public.clinics;

-- auth.users cascateia profiles (ON DELETE CASCADE), que por sua vez
-- cascateia ai_corrections.author_id e curation_proposals.proposer_id
-- (ambos também ON DELETE CASCADE) — por isso o backup dessas duas
-- tabelas foi feito acima, antes deste DELETE.
DELETE FROM auth.users WHERE id NOT IN (SELECT id FROM _reset_keep);

-- --- Checagem final: só confirma se sobrou exatamente quem devia ---
DO $$
DECLARE
  v_expected INT;
  v_remaining_users INT;
  v_remaining_profiles INT;
BEGIN
  SELECT count(*) INTO v_expected FROM _reset_keep;
  SELECT count(*) INTO v_remaining_users FROM auth.users;
  SELECT count(*) INTO v_remaining_profiles FROM public.profiles;
  IF v_remaining_users <> v_expected OR v_remaining_profiles <> v_expected THEN
    RAISE EXCEPTION 'Checagem final falhou: esperado % conta(s), restaram % usuário(s) e % perfil(is) em profiles. Abortando (ROLLBACK automático).',
      v_expected, v_remaining_users, v_remaining_profiles;
  END IF;
  RAISE NOTICE 'OK: % conta(s) mantida(s), resto apagado. Backup em backup_pre_reset_20260828.*', v_expected;
END $$;

COMMIT;

-- Depois de confirmar que está tudo certo (logue no app, confira que só
-- o SuperAdm aparece), pode apagar a schema de backup quando quiser:
--   DROP SCHEMA backup_pre_reset_20260828 CASCADE;
-- Sem pressa nenhuma pra isso — ela não atrapalha o app rodando.
