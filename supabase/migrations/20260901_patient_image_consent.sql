-- ==========================================================
-- Consentimento de uso de imagem do paciente
--
-- Consentimento de imagem é opt-in (desmarcado por padrão) e não
-- bloqueia o cadastro — ao contrário do
-- termo de uso profissional em Login.jsx, que é uma barreira de acesso,
-- isto é um dado sobre o paciente. image_consent_at existe para dar
-- trilha de quando o consentimento foi dado ou revogado — LGPD pede
-- prova de quando, não só de que.
--
-- Sem RLS por coluna: as políticas de patients já cobrem a linha
-- inteira (ver 20260723_clinical_data_hardening.sql), então uma coluna
-- a mais aqui não muda quem pode ler ou escrever.
-- ==========================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS image_consent BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS image_consent_at TIMESTAMPTZ NULL;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'image_consent'
  ) AS coluna_consent_criada,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'image_consent_at'
  ) AS coluna_consent_at_criada;
