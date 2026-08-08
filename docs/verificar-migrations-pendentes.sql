-- Verificação de migrations aplicadas no Supabase — Reability One
-- Gerado em 2026-08-08. SOMENTE LEITURA: não cria, não altera e não apaga nada.
-- Não lê nenhum dado clínico, apenas a existência de objetos no schema.
--
-- Como usar: cole no SQL Editor do projeto Supabase e execute.
-- Cada linha responde "aplicada = true/false". Aplique, em ordem, apenas as
-- migrations que voltarem FALSE.

select
  '20260707_profile_disciplines' as migration,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'disciplines'
  ) as aplicada

union all select
  '20260708_clinic_patients_enrollments',
  to_regclass('public.patient_enrollments') is not null

union all select
  '20260709_record_shares',
  to_regclass('public.record_shares') is not null

union all select
  '20260710_insert_record_discipline',
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'insert_clinical_record'
      and pg_get_function_identity_arguments(p.oid) ilike '%discipline%'
  )

union all select
  '20260713_curation_proposals',
  to_regclass('public.curation_proposals') is not null

union all select
  '20260713_knowledge_reviewer_role',
  to_regprocedure('public.is_knowledge_reviewer()') is not null

union all select
  '20260714_psych_curation_items',
  to_regclass('public.psych_curation_items') is not null

union all select
  '20260723_clinical_data_hardening (CRÍTICA)',
  to_regprocedure(
    'public.upsert_versioned_clinical_record(uuid,text,text,bigint,uuid,text)'
  ) is not null

union all select
  '20260807_shared_session_multidisciplina',
  to_regprocedure('public.get_shared_session(text,text)') is not null

order by 1;


-- ---------------------------------------------------------------------------
-- Checagem extra: a chave de criptografia está no Vault?
-- A migration 20260723 é fail-closed e aborta antes de qualquer DDL se este
-- segredo não existir ou não descriptografar uma amostra existente.
-- ---------------------------------------------------------------------------

select
  'clinical_records_encryption_key no Vault' as item,
  exists (
    select 1 from vault.secrets where name = 'clinical_records_encryption_key'
  ) as presente;
