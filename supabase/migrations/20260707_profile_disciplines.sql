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
