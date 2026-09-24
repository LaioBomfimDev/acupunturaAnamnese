-- ==========================================================
-- Tipos de atendimento novos: anamnese, sessão, devolutiva, entrevista
-- REQUER: 20260810_agenda_operacao.sql (appointments_type_check) e
-- 20260908_financeiro_backend.sql (procedure_prices e
-- convenio_procedure_prices).
--
-- Pedido da administradora (2026-09-24): o campo "Tipo" do agendamento
-- ganha Anamnese, Sessão, Devolutiva e Entrevista, além de Primeira vez,
-- Retorno e Avaliação. A tela lista em ordem alfabética.
--
-- Os mesmos valores valem nas tabelas de preço do financeiro — senão a
-- clínica não conseguiria cadastrar preço específico para os tipos
-- novos. Tipo sem preço específico continua caindo no preço padrão da
-- disciplina (appointment_type NULL), então nada quebra no financeiro.
--
-- Só AMPLIA a lista: nenhuma linha existente fica inválida.
-- Reversão: recriar as três constraints com os 3 valores antigos (só
-- funciona se nenhuma linha usar os tipos novos).
-- ==========================================================

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_type_check
  CHECK (appointment_type IS NULL OR appointment_type IN (
    'first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview'
  ));

ALTER TABLE public.procedure_prices DROP CONSTRAINT IF EXISTS procedure_prices_appointment_type_check;
ALTER TABLE public.procedure_prices ADD CONSTRAINT procedure_prices_appointment_type_check
  CHECK (appointment_type IS NULL OR appointment_type IN (
    'first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview'
  ));

ALTER TABLE public.convenio_procedure_prices DROP CONSTRAINT IF EXISTS convenio_procedure_prices_appointment_type_check;
ALTER TABLE public.convenio_procedure_prices ADD CONSTRAINT convenio_procedure_prices_appointment_type_check
  CHECK (appointment_type IS NULL OR appointment_type IN (
    'first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview'
  ));
