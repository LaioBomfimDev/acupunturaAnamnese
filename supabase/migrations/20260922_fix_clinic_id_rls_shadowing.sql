-- ==========================================================
-- Corrige shadowing de `clinic_id` em 3 políticas de RLS (BOLA)
--
-- ACHADO (2026-09-22, durante debug de agenda): rodando
-- `SELECT policyname, cmd, qual, with_check FROM pg_policies
-- WHERE tablename = 'appointments'`, o with_check de appointments_insert
-- vinha como `pa.clinic_id = pa.clinic_id` — comparação de uma coluna
-- com ela mesma, sempre verdadeira (a menos que NULL).
--
-- CAUSA RAIZ: as migrations de origem escreviam a checagem como
-- `pa.clinic_id = clinic_id` (bare), pretendendo que `clinic_id` bare
-- significasse a linha de fora (appointments/professional_schedules/
-- satisfaction_surveys sendo inserida). Mas a subquery correlacionada
-- (EXISTS ... FROM patients pa / profiles pr) também tem uma coluna
-- `clinic_id` — e a resolução de nomes do Postgres favorece o escopo
-- mais interno. O `clinic_id` bare amarrou em `pa.clinic_id`/`pr.clinic_id`,
-- não na tabela de fora, e a política nunca comparou com a clínica do
-- registro sendo inserido. Em tese, qualquer usuário autenticado podia
-- inserir um appointments/professional_schedules/satisfaction_surveys
-- apontando patient_id/professional_id para OUTRA clínica — BOLA
-- cross-tenant, real desde a aplicação de cada migration de origem
-- (20260809/20260810 para appointments, 20260810 para
-- professional_schedules, 20260901 para satisfaction_surveys).
--
-- VARREDURA MAIS AMPLA (mesmo dia) achou 6 políticas com o padrão
-- sintático `X.clinic_id = Y.clinic_id)`. Das 6, só estas 3 são o bug
-- real (mesmo alias nos dois lados = tautologia). As outras 3
-- (enrollments_insert_initial_own, record_shares_select_clinic,
-- record_shares_update) já qualificam o lado de fora pelo NOME DA
-- TABELA (ex.: `p.clinic_id = record_shares.clinic_id`) — isso não
-- sofre shadowing porque não existe outro range-table chamado
-- "record_shares"/"patient_enrollments" dentro da subquery, então o
-- Postgres resolve sem ambiguidade para a linha de fora. Ficam como
-- estão; esta migration NÃO as toca.
--
-- CORREÇÃO: mesma técnica já usada (e correta) nas 3 políticas acima —
-- qualificar o lado de fora com o NOME DA TABELA da política
-- (appointments.clinic_id / professional_schedules.clinic_id /
-- satisfaction_surveys.clinic_id) em vez de `clinic_id` bare. Resto do
-- corpo de cada política é reafirmado idêntico ao que está em produção
-- (20260810_agenda_operacao.sql e 20260901_satisfaction_surveys.sql);
-- só a comparação ambígua muda.
--
-- Migração idempotente: DROP POLICY IF EXISTS + CREATE POLICY, mesmo
-- padrão do resto da pasta.
-- ==========================================================

-- ----------------------------------------------------------
-- 1. appointments_insert
-- ----------------------------------------------------------
DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND (
      patient_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.patients pa
        WHERE pa.id = patient_id AND pa.clinic_id = appointments.clinic_id
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = professional_id AND pr.clinic_id = appointments.clinic_id
    )
  );

-- ----------------------------------------------------------
-- 2. professional_schedules_insert
-- ----------------------------------------------------------
DROP POLICY IF EXISTS professional_schedules_insert ON public.professional_schedules;
CREATE POLICY professional_schedules_insert ON public.professional_schedules
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND (professional_id = auth.uid() OR public.is_clinic_admin() OR public.is_super_admin())
    AND EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = professional_id AND pr.clinic_id = professional_schedules.clinic_id
    )
  );

-- ----------------------------------------------------------
-- 3. satisfaction_surveys_insert
-- ----------------------------------------------------------
DROP POLICY IF EXISTS satisfaction_surveys_insert ON public.satisfaction_surveys;
CREATE POLICY satisfaction_surveys_insert ON public.satisfaction_surveys
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND created_by = auth.uid()
    -- Mesmo corte de appointments_insert: paciente tem que ser da MESMA
    -- instituição de quem está gerando o link.
    AND EXISTS (
      SELECT 1 FROM public.patients pa
      WHERE pa.id = patient_id AND pa.clinic_id = satisfaction_surveys.clinic_id
    )
  );

-- ----------------------------------------------------------
-- Verificação: nenhuma das 3 políticas corrigidas pode voltar a
-- comparar uma coluna com ela mesma (tautologia = shadowing).
-- ----------------------------------------------------------
SELECT
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointments' AND policyname = 'appointments_insert'
      AND (with_check LIKE '%pa.clinic_id = pa.clinic_id%' OR with_check LIKE '%pr.clinic_id = pr.clinic_id%')
  ) AS appointments_insert_sem_tautologia,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'appointments' AND policyname = 'appointments_insert'
      AND with_check LIKE '%pa.clinic_id = appointments.clinic_id%'
      AND with_check LIKE '%pr.clinic_id = appointments.clinic_id%'
  ) AS appointments_insert_qualificado,
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'professional_schedules' AND policyname = 'professional_schedules_insert'
      AND with_check LIKE '%pr.clinic_id = pr.clinic_id%'
  ) AS professional_schedules_insert_sem_tautologia,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'professional_schedules' AND policyname = 'professional_schedules_insert'
      AND with_check LIKE '%pr.clinic_id = professional_schedules.clinic_id%'
  ) AS professional_schedules_insert_qualificado,
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'satisfaction_surveys' AND policyname = 'satisfaction_surveys_insert'
      AND with_check LIKE '%pa.clinic_id = pa.clinic_id%'
  ) AS satisfaction_surveys_insert_sem_tautologia,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'satisfaction_surveys' AND policyname = 'satisfaction_surveys_insert'
      AND with_check LIKE '%pa.clinic_id = satisfaction_surveys.clinic_id%'
  ) AS satisfaction_surveys_insert_qualificado;
