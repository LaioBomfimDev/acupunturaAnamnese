-- ==========================================================
-- Lembrete de retorno: pacientes sem próxima marcação
--
-- Sem cron nem notificação nenhuma no projeto ainda — a versão viável
-- agora é uma lista computada sob demanda, do mesmo jeito que a fila de
-- confirmação pendente já funciona (nenhuma infra de disparo nova).
--
-- View, não função: diferente de list_clinic_members (ver comentário em
-- 20260810_clinic_members.sql), aqui `security_invoker = true` NÃO cai
-- na armadilha de devolver só a própria linha — appointments_select e as
-- políticas de patients já liberam leitura de clínica inteira para quem
-- tem can_manage_agenda(clinic_id), o mesmo alcance que listAppointments
-- e listClinicPatients já usam hoje. A view só herda esse alcance.
--
-- Um paciente entra na lista quando o último atendimento (status
-- 'attended') não tem nenhuma marcação futura depois dele — cancelado
-- ou faltado não conta como "já resolvido".
-- ==========================================================

CREATE OR REPLACE VIEW public.patients_awaiting_return
WITH (security_invoker = true) AS
SELECT
  p.id AS patient_id,
  p.clinic_id,
  p.name AS patient_name,
  last_visit.professional_id,
  last_visit.starts_at AS last_attended_at,
  EXTRACT(DAY FROM (timezone('utc', now()) - last_visit.starts_at))::INT AS days_since
FROM public.patients p
JOIN LATERAL (
  SELECT a.professional_id, a.starts_at
  FROM public.appointments a
  WHERE a.patient_id = p.id
    AND a.kind = 'appointment'
    AND a.status = 'attended'
  ORDER BY a.starts_at DESC
  LIMIT 1
) last_visit ON true
WHERE p.archived_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.appointments future
    WHERE future.patient_id = p.id
      AND future.kind = 'appointment'
      AND future.status IN ('scheduled', 'ready')
      AND future.starts_at > last_visit.starts_at
  );

REVOKE ALL ON public.patients_awaiting_return FROM anon;
GRANT SELECT ON public.patients_awaiting_return TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT EXISTS (
  SELECT 1 FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'patients_awaiting_return'
) AS view_criada;
