-- ==========================================================
-- Categoria do bloqueio: reunião, entrevista ou outro
--
-- Pedido do usuário comparando com outro app de agenda: distinguir
-- "reunião de equipe" de "entrevista" de um bloqueio genérico, com
-- ícone próprio no card. Só faz sentido para kind='block' — bloqueio
-- não tem paciente nem disciplina, é hora reservada do profissional,
-- e "block_type" é só uma categoria dentro disso.
--
-- Não incluímos "anamnese" como categoria de bloqueio (era uma opção
-- do app de referência): aqui anamnese sempre está ligada a um
-- paciente real dentro de um atendimento, nunca é hora reservada sem
-- paciente — não existe equivalente coerente no nosso modelo.
-- ==========================================================

ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS block_type TEXT;

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_block_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_block_type_check
  CHECK (block_type IS NULL OR block_type IN ('reuniao', 'entrevista', 'outro'));

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'block_type'
  ) AS coluna_criada,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_block_type_check'
  ) AS guarda_ativa;
