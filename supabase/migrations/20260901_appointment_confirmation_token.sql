-- ==========================================================
-- Token de confirmação por agendamento (link de WhatsApp)
--
-- Fluxo pedido pelo usuário: sem API paga de WhatsApp nenhuma. O
-- profissional/recepção manda a mensagem pelo PRÓPRIO WhatsApp, com um
-- link pessoal do agendamento. O paciente abre sem login, vê os dados
-- certos (nome, profissional, data/hora, sala) e confirma sozinho —
-- grava no mesmo confirmed_at que a confirmação manual já usa hoje.
--
-- Coluna na própria tabela, não uma tabela nova: o "convite" é 1:1 com o
-- agendamento, não faz sentido mais de um token por compromisso (ao
-- contrário de satisfaction_surveys, onde cada envio é um registro
-- novo). Sem RLS nova aqui — leitura/escrita autenticada de appointments
-- já está coberta; o acesso anônimo passa inteiro pela Edge Function
-- confirm-appointment (service-role), nunca toca a tabela direto, mesmo
-- padrão de satisfaction-survey.
-- ==========================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmation_token UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_confirmation_token_unique;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_confirmation_token_unique UNIQUE (confirmation_token);

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'confirmation_token'
  ) AS coluna_criada,
  EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_confirmation_token_unique'
  ) AS constraint_criada;
