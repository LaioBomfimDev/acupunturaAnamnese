-- ==========================================================
-- CPF do paciente
--
-- Pedido do usuário: o cadastro central de "Pacientes da instituição"
-- precisa capturar o CPF. Coluna opcional no banco — nem todo paciente
-- tem o documento em mãos na hora do cadastro (criança, testemunha) —
-- mas a tela de ClinicPatientsPanel passa a exigir no formulário.
-- Guardado só com os 11 dígitos, sem pontuação; a máscara
-- (000.000.000-00) é só de exibição, calculada no frontend.
-- ==========================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS cpf TEXT NULL;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'patients' AND column_name = 'cpf'
) AS coluna_cpf_criada;
