-- ==========================================================
-- appointments_insert barrava agendar pra QUALQUER colega
--
-- Achado (reproduzido com INSERT real em transação com ROLLBACK,
-- simulando Karen via request.jwt.claims): a política original
-- (20260809_appointments.sql) confere se professional_id é da mesma
-- clínica com um EXISTS direto contra public.profiles. Esse EXISTS
-- roda com o privilégio de quem está inserindo — não é SECURITY
-- DEFINER — então herda a RLS de profiles, que só deixa cada perfil
-- ver A SI MESMO ("Profiles select self or super admin": auth.uid() =
-- id OR is_super_admin()). Resultado: o INSERT só passava quando
-- professional_id == quem está logado. Pra qualquer outro colega da
-- mesma clínica (ex.: recepção marcando pra outro profissional), a
-- policy falhava com "new row violates row-level security policy",
-- sem relação nenhuma com paciente, data ou horário.
--
-- O EXISTS equivalente contra patients nunca teve esse problema
-- porque patients_select_clinic_member já concede leitura pra clínica
-- inteira via can_manage_agenda (20260708_clinic_patients_enrollments
-- + 20260809_appointments). profiles nunca teve o equivalente — é
-- exatamente o motivo de list_clinic_members existir (comentário de
-- 20260810_clinic_members.sql), só que aquela RPC resolve a LEITURA
-- pra tela, não a POLICY de escrita de appointments.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.profile_in_clinic(p_profile_id UUID, p_clinic UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_profile_id AND p.clinic_id = p_clinic
  );
$$;

REVOKE ALL ON FUNCTION public.profile_in_clinic(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_in_clinic(UUID, UUID) TO authenticated;

-- Reaplica exatamente a forma vigente (20260810_agenda_operacao.sql,
-- com o ramo `patient_id IS NULL` do bloqueio de horário) trocando só
-- o EXISTS contra profiles pelo helper SECURITY DEFINER.
DROP POLICY IF EXISTS appointments_insert ON public.appointments;
CREATE POLICY appointments_insert ON public.appointments
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND (
      patient_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.patients pa
        WHERE pa.id = patient_id AND pa.clinic_id = clinic_id
      )
    )
    AND public.profile_in_clinic(professional_id, clinic_id)
  );

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regprocedure('public.profile_in_clinic(uuid,uuid)') IS NOT NULL AS funcao_criada,
  has_function_privilege('authenticated', 'public.profile_in_clinic(uuid,uuid)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.profile_in_clinic(uuid,uuid)', 'EXECUTE') AS anon_bloqueado,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'appointments' AND policyname = 'appointments_insert') AS policy_recriada;
