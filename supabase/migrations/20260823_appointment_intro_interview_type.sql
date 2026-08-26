-- ==========================================================
-- Tipo de atendimento: entrevista inicial gratuita
--
-- A clínica dá uma primeira conversa gratuita antes da pessoa virar
-- paciente de verdade — diferente de "Primeira vez" (que já é
-- atendimento pago). Continua sendo `kind='appointment'` normal, com
-- paciente e disciplina: a pessoa já entra como cadastro leve (nome +
-- telefone), pelo mesmo cadastro rápido que já existe no formulário.
-- Se ela virar paciente de verdade depois, o histórico da entrevista
-- já está junto — não precisa recadastrar nem religar nada.
-- ==========================================================

ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_type_check;
ALTER TABLE public.appointments ADD CONSTRAINT appointments_type_check
  CHECK (appointment_type IS NULL OR appointment_type IN ('intro_interview', 'first_visit', 'return', 'evaluation'));

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'appointments_type_check'
    AND pg_get_constraintdef(oid) LIKE '%intro_interview%'
) AS guarda_atualizada;
