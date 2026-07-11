-- ==========================================================
-- Libera acesso a todas as especialidades para profissionais existentes atualmente.
-- Cadastros de novos profissionais seguem a regra original baseada em profissão.
-- ==========================================================

UPDATE public.profiles
SET disciplines = ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao']
WHERE role IN ('therapist', 'super_admin');
