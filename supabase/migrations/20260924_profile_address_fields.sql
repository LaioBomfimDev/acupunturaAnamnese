-- Endereço do profissional no cadastro, no mesmo modelo já usado em
-- patients.endereco_* (20260910_patient_registration_open_clinic.sql).
-- Aditivo e reversível (basta DROP COLUMN IF EXISTS de cada uma); não
-- mexe em RLS porque não é dado clínico de paciente, é cadastro do
-- próprio profissional.
alter table public.profiles
  add column if not exists endereco_cep text,
  add column if not exists endereco_logradouro text,
  add column if not exists endereco_numero text,
  add column if not exists endereco_complemento text,
  add column if not exists endereco_bairro text,
  add column if not exists endereco_cidade text,
  add column if not exists endereco_uf text;

comment on column public.profiles.endereco_cep is 'Endereço do profissional (cadastro interno) — não é dado clínico de paciente.';
