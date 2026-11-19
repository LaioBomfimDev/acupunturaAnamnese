-- Recepção também corrige erro de digitação na Agenda (20/11/2026).
-- Antes, só Admin da clínica ou SuperAdm apagava agendamento, então a
-- recepção (quem digita errado) usava o cancelamento no lugar. Continua
-- barrado pelo banco: sessão com evolução (RESTRICT) e com pagamento
-- (appointment_has_payment). Profissional comum segue sem excluir.
DROP POLICY IF EXISTS appointments_delete ON public.appointments;
CREATE POLICY appointments_delete ON public.appointments
  FOR DELETE TO authenticated
  USING (
    public.can_manage_agenda(clinic_id)
    AND (
      public.is_clinic_admin()
      OR public.is_super_admin()
      OR public.is_receptionist()
    )
  );
