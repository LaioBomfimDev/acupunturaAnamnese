-- ==========================================================
-- Pendência manual do paciente
--
-- Toggle manual (cobrança em aberto, documento faltante etc.) — não é
-- calculado a partir de nenhuma outra tabela, é o profissional/recepção
-- quem marca e desmarca. Aparece como destaque (barra/selo) nos cards
-- de agendamento e na lista de pacientes da instituição, pra não
-- depender de abrir a ficha pra lembrar que há algo pendente.
-- ==========================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS has_pending BOOLEAN NOT NULL DEFAULT false;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'has_pending'
  ) AS coluna_criada;
