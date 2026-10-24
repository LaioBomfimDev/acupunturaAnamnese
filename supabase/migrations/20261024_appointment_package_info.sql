-- ==========================================================
-- Agenda: "sessão 3 de 10" do pacote no detalhe do atendimento
-- REQUER: 20261023_financeiro_etapa1.sql
--
-- O Financeiro é só da administração, mas quem opera a Agenda
-- (recepção e quem atende) precisa saber se o atendimento é de um
-- pacote e em que sessão está. Esta função devolve só isso: nome do
-- pacote, número da sessão, previstas e feitas. Nenhum valor em
-- dinheiro, nenhum pagamento.
--
-- Atendimento já Atendido: a sessão que ele gastou (a cobrança gravada).
-- Atendimento ainda por vir: o pacote ativo que ele vai gastar, pela
-- mesma regra do gatilho (finance_charge_appointment), com quantas
-- sessões já foram feitas; o número da sessão só existe depois que ele
-- acontece, porque falta não gasta sessão.
--
-- Nomes de saída em português: não colidem com as colunas das tabelas
-- (session_number etc.) dentro do PL/pgSQL.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.appointment_package_info(p_appointment UUID)
RETURNS TABLE (
  pacote TEXT,
  tipo TEXT,
  sessao INTEGER,
  previstas INTEGER,
  feitas INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments%ROWTYPE;
  v_charge public.appointment_charges%ROWTYPE;
  v_package public.patient_packages%ROWTYPE;
  v_day DATE;
BEGIN
  SELECT * INTO v_appt FROM public.appointments a WHERE a.id = p_appointment;
  IF NOT FOUND OR v_appt.kind IS DISTINCT FROM 'appointment' OR v_appt.patient_id IS NULL
     OR NOT public.can_manage_agenda(v_appt.clinic_id) THEN
    RETURN;
  END IF;

  SELECT * INTO v_charge FROM public.appointment_charges c
  WHERE c.appointment_id = p_appointment AND c.voided_at IS NULL;

  IF FOUND THEN
    IF v_charge.package_id IS NULL THEN
      RETURN;
    END IF;
    SELECT * INTO v_package FROM public.patient_packages p WHERE p.id = v_charge.package_id;
    RETURN QUERY SELECT v_package.name, v_package.kind, v_charge.session_number, v_package.sessions_planned,
      (SELECT count(*)::INTEGER FROM public.appointment_charges c
       WHERE c.package_id = v_package.id AND c.voided_at IS NULL AND c.source = 'appointment');
    RETURN;
  END IF;

  -- Falta e cancelamento não gastam sessão: não mostram pacote.
  IF v_appt.status IN ('cancelled', 'no_show', 'excused') THEN
    RETURN;
  END IF;

  v_day := (v_appt.starts_at AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT * INTO v_package
  FROM public.patient_packages p
  WHERE p.clinic_id = v_appt.clinic_id
    AND p.patient_id = v_appt.patient_id
    AND p.discipline = v_appt.discipline
    AND p.status = 'active'
    AND p.sold_on <= v_day
    AND (p.professional_id IS NULL OR p.professional_id = v_appt.professional_id)
    AND (cardinality(p.appointment_types) = 0 OR v_appt.appointment_type = ANY (p.appointment_types))
  ORDER BY p.sold_on, p.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT v_package.name, v_package.kind, NULL::INTEGER, v_package.sessions_planned,
    (SELECT count(*)::INTEGER FROM public.appointment_charges c
     WHERE c.package_id = v_package.id AND c.voided_at IS NULL AND c.source = 'appointment');
END;
$$;

REVOKE ALL ON FUNCTION public.appointment_package_info(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.appointment_package_info(UUID) TO authenticated;

SELECT
  to_regprocedure('public.appointment_package_info(uuid)') IS NOT NULL AS funcao_criada,
  has_function_privilege('authenticated', 'public.appointment_package_info(uuid)', 'EXECUTE') AS equipe_executa,
  NOT has_function_privilege('anon', 'public.appointment_package_info(uuid)', 'EXECUTE') AS anon_bloqueado;
