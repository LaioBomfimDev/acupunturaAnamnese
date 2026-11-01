-- ==========================================================
-- Assistente da clínica: contagem de escalas aplicadas e "Corrigir"
-- (01/11/2026, caminhos A e C escolhidos pela administradora)
-- REQUER: 20261008_patient_instruments.sql, 20260711_ai_corrections_psychology.sql
--
-- A) A assistente responde "quais escalas mais aplicamos este mês?".
--    Esta função devolve SÓ a contagem por escala e por origem
--    (consultório × Área do Paciente): nenhum paciente, nota ou resposta.
--    A administração conta a instituição inteira; quem atende conta só
--    as aplicações que fez. Anuladas não contam.
--
-- C) A assistente vira mais uma superfície de correção da IA
--    (ai_corrections.surface = 'clinic_assistant'): a correção vale na
--    hora para quem corrigiu e para todos depois que o SuperAdm aprova,
--    como nas outras superfícies (_shared/corrections.ts).
-- ==========================================================

CREATE OR REPLACE FUNCTION public.instrument_applications_summary(p_from DATE, p_to DATE)
RETURNS TABLE (
  instrumento TEXT,
  origem TEXT,
  total INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID := public.user_clinic_id(v_uid);
  v_admin BOOLEAN := public.is_clinic_admin(v_uid);
BEGIN
  IF v_clinic IS NULL OR p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 400 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT a.instrument_id, a.source, count(*)::INTEGER
    FROM public.patient_instrument_applications a
    WHERE a.clinic_id = v_clinic
      AND a.voided_at IS NULL
      AND (a.applied_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p_from AND p_to
      AND (v_admin OR a.applied_by = v_uid)
    GROUP BY a.instrument_id, a.source
    ORDER BY count(*) DESC, a.instrument_id;
END;
$$;

REVOKE ALL ON FUNCTION public.instrument_applications_summary(DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instrument_applications_summary(DATE, DATE) TO authenticated;

ALTER TABLE public.ai_corrections
  DROP CONSTRAINT IF EXISTS ai_corrections_surface_check;

ALTER TABLE public.ai_corrections
  ADD CONSTRAINT ai_corrections_surface_check
    CHECK (surface IN (
      'tongue', 'anamnese_marks', 'clinical_reasoning', 'narrative',
      'library_qa', 'food_research', 'psych_marks', 'psych_reading',
      'clinic_assistant'
    ));
