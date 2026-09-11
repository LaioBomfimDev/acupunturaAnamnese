-- ==========================================================
-- Cadastro do paciente aberto à clínica inteira + campos novos
-- REQUER: 20260708_clinic_patients_enrollments (clinic_id, user_clinic_id),
-- 20260723_clinical_data_hardening (can_access_clinical_data, is_clinic_admin,
-- is_super_admin), 20260809_appointments (can_manage_agenda).
--
-- Decisão do Laio (2026-09-10): o CADASTRO do paciente (nome, contato,
-- endereço, convênio etc.) passa a ser visível/editável por qualquer
-- profissional ATIVO da mesma clínica, sem precisar de matrícula por
-- disciplina nem de compartilhamento por senha (record_shares). Os
-- DADOS CLÍNICOS (anamnese, evolução, relatório) continuam vivendo em
-- outras tabelas com a RLS de hoje, gated por matrícula/compartilhamento
-- — esta migração não toca em patient_enrollments, record_shares nem
-- patient_evolutions.
--
-- Reaproveita o mesmo padrão de "membro ativo da clínica" já usado pra
-- agenda (can_manage_agenda), em vez do padrão de matrícula por
-- disciplina — é mais amplo de propósito.
-- ==========================================================

-- ----------------------------------------------------------
-- Campos novos do cadastro (todos opcionais no banco; a obrigatoriedade
-- condicional do responsável para paciente menor de idade é validada em
-- frontend/src/services/patientService.js, mesmo padrão já usado para
-- CPF/consentimento de imagem).
-- ----------------------------------------------------------
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS nome_social TEXT,
  ADD COLUMN IF NOT EXISTS nome_mae TEXT,
  ADD COLUMN IF NOT EXISTS nome_pai TEXT,
  ADD COLUMN IF NOT EXISTS nome_conjuge TEXT,
  ADD COLUMN IF NOT EXISTS sexo_biologico TEXT,
  ADD COLUMN IF NOT EXISTS genero TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_nome TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_telefone TEXT,
  ADD COLUMN IF NOT EXISTS responsavel_cpf TEXT,
  ADD COLUMN IF NOT EXISTS convenio_nome TEXT,
  ADD COLUMN IF NOT EXISTS convenio_carteirinha TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cep TEXT,
  ADD COLUMN IF NOT EXISTS endereco_logradouro TEXT,
  ADD COLUMN IF NOT EXISTS endereco_numero TEXT,
  ADD COLUMN IF NOT EXISTS endereco_complemento TEXT,
  ADD COLUMN IF NOT EXISTS endereco_bairro TEXT,
  ADD COLUMN IF NOT EXISTS endereco_cidade TEXT,
  ADD COLUMN IF NOT EXISTS endereco_uf TEXT;

ALTER TABLE public.patients
  DROP CONSTRAINT IF EXISTS patients_sexo_biologico_check;
ALTER TABLE public.patients
  ADD CONSTRAINT patients_sexo_biologico_check
  CHECK (sexo_biologico IS NULL OR sexo_biologico IN ('masculino', 'feminino'));

-- ----------------------------------------------------------
-- RLS: qualquer profissional ATIVO da mesma clínica lê e edita o
-- cadastro. Substitui as duas policies mais estreitas de SELECT
-- (matrícula por disciplina / só admin) — ficam redundantes, a nova é
-- um superconjunto de ambas. A policy de dono (therapist_id) continua
-- valendo como está: é a rede de segurança para paciente ainda sem
-- clinic_id (registro legado ou criado fora do fluxo de clínica).
-- ----------------------------------------------------------
DROP POLICY IF EXISTS patients_select_clinic_discipline ON public.patients;
DROP POLICY IF EXISTS patients_select_clinic_admin ON public.patients;

CREATE POLICY patients_select_clinic_member
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND public.can_manage_agenda(clinic_id, auth.uid())
  );

DROP POLICY IF EXISTS patients_update_clinic_member ON public.patients;
CREATE POLICY patients_update_clinic_member
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND public.can_manage_agenda(clinic_id, auth.uid())
  )
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND clinic_id IS NOT NULL
    AND public.can_manage_agenda(clinic_id, auth.uid())
  );

-- ----------------------------------------------------------
-- Trava de segurança: abrir o UPDATE de cadastro para a clínica inteira
-- não pode virar uma forma de "levar" o paciente para outra clínica
-- (o mesmo tipo de falha BOLA já sinalizado na auditoria de segurança
-- de 2026-08-11). Só super_admin pode mudar clinic_id.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_patient_clinic_reassignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.clinic_id IS DISTINCT FROM OLD.clinic_id AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Não é permitido reatribuir o paciente para outra clínica.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS patients_prevent_clinic_reassignment ON public.patients;
CREATE TRIGGER patients_prevent_clinic_reassignment
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_patient_clinic_reassignment();
