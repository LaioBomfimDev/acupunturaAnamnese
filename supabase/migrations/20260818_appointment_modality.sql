-- ==========================================================
-- Modalidade do atendimento: presencial ou online
--
-- Pedido do usuário ao comparar com outro app de agenda que já usa:
-- distinguir consulta por vídeo de consulta na clínica direto no card.
-- Nula para bloqueio (kind='block' não é atendimento, mesmo padrão de
-- discipline). NOT NULL só seria possível se todo agendamento tivesse
-- dono de decisão — quem decide aqui é o form, não o banco.
-- ==========================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS modality TEXT;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_modality_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_modality_check
  CHECK (modality IS NULL OR modality IN ('presencial', 'online'));

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'modality'
  ) AS coluna_criada,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_modality_check'
  ) AS guarda_ativa;
