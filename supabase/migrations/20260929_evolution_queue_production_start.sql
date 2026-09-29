-- ==========================================================
-- Fila "Falta evoluir" só cobra atendimentos a partir de 22/09/2026
--
-- Por quê: em 14/09/2026 o histórico da agenda anterior da clínica
-- (junho a meados de setembro) foi importado direto no banco, já com
-- status Atendido/Não compareceu. Esses atendimentos têm evolução no
-- sistema anterior, não aqui — e passaram a aparecer como pendentes na
-- tela Evoluções, no sinal do atalho, na ficha e na linha do tempo do
-- paciente (todos leem esta view): 132 de 143 pendências em 29/09.
--
-- 22/09/2026 é o início de uso real da evolução neste sistema (primeira
-- evolução escrita). Decisão da administradora: cobrar só dali em
-- diante. Corte único, não é configuração — não se repete.
--
-- O que muda: só a view. Nenhum agendamento é alterado ou apagado e
-- nenhuma evolução é criada; Agenda, faltosos, retorno pendente e
-- financeiro continuam lendo appointments como antes. A escrita
-- (insert_patient_evolution) não depende desta view.
--
-- Reverter: recriar a view sem a linha do corte (definição original em
-- 20260903_patient_evolutions.sql).
-- ==========================================================

CREATE OR REPLACE VIEW public.appointments_awaiting_evolution
WITH (security_invoker = true) AS
SELECT
  a.id AS appointment_id,
  a.clinic_id,
  a.patient_id,
  p.name AS patient_name,
  a.professional_id,
  a.discipline,
  a.starts_at,
  a.status AS attendance_status
FROM public.appointments a
JOIN public.patients p ON p.id = a.patient_id
WHERE a.kind = 'appointment'
  AND a.status IN ('attended', 'no_show', 'excused')
  -- Início de produção da evolução (00:00 de 22/09/2026, horário de Brasília).
  AND a.starts_at >= TIMESTAMPTZ '2026-09-22 00:00:00-03'
  AND (
    a.professional_id = auth.uid()
    OR public.is_clinic_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.patient_evolutions pe
    WHERE pe.appointment_id = a.id
  );

REVOKE ALL ON public.appointments_awaiting_evolution FROM anon;
GRANT SELECT ON public.appointments_awaiting_evolution TO authenticated;
