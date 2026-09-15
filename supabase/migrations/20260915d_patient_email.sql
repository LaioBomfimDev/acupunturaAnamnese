-- ==========================================================
-- E-mail do paciente
--
-- Pedido do usuário: o cadastro central de "Pacientes da instituição"
-- precisa capturar o e-mail, pra viabilizar o envio de relatórios/PDFs
-- diretamente ao paciente no futuro. Coluna opcional — nem todo
-- paciente informa e-mail no cadastro.
-- ==========================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS email TEXT NULL;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'email'
) AS coluna_email_criada;
