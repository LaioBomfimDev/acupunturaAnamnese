-- ==========================================================
-- Neuropsicologia volta a aceitar evolução
-- REQUER: 20260924b_evolution_requires_appointment.sql (versão viva de
-- insert_patient_evolution).
--
-- Decisão da administradora (2026-09-29): a sessão de Neuropsicologia se
-- evolui na tela Evoluções, com o mesmo formulário da Psicologia, mas a
-- evolução é gravada como 'neuropsicologia' — a mesma área do
-- agendamento, que esta função já exige. As Sessões de dentro da
-- Avaliação neuropsicológica foram desligadas no app.
--
-- Por que precisa: 20260910_neuropsicologia_discipline.sql liberou
-- 'neuropsicologia' aqui e no CHECK de patient_evolutions.discipline,
-- mas 20260924b reescreveu esta função a partir da versão de
-- 20260911_patient_evolutions_hardening.sql, só com as 4 áreas antigas.
-- O CHECK da tabela continua aceitando 'neuropsicologia' (20260910).
--
-- O que muda: só o array de disciplinas aceitas. Corpo copiado de
-- 20260924b; nenhuma outra regra muda (agendamento obrigatório, dono do
-- agendamento, mesma área, status concluído, idempotência, criptografia).
--
-- Reversão: reaplicar 20260924b_evolution_requires_appointment.sql.
-- ==========================================================

CREATE OR REPLACE FUNCTION public.insert_patient_evolution(
  p_patient_id UUID,
  p_discipline TEXT,
  p_data TEXT,
  p_appointment_id UUID DEFAULT NULL,
  p_atendimento_em TIMESTAMPTZ DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  atendimento_em TIMESTAMPTZ,
  registrado_em TIMESTAMPTZ,
  attendance_status TEXT,
  revision BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $insert_patient_evolution$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_existing RECORD;
  v_appointment RECORD;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_data IS NULL OR pg_catalog.btrim(p_data) = '' THEN
    RAISE EXCEPTION 'Conteúdo da evolução é obrigatório.' USING ERRCODE = '22023';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;

  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION
      'Evolução só pode ser registrada a partir de um atendimento marcado na Agenda.'
      USING ERRCODE = '22023';
  END IF;

  SELECT a.patient_id, a.professional_id, a.discipline, a.status, a.kind
  INTO v_appointment
  FROM public.appointments a
  WHERE a.id = p_appointment_id;

  IF NOT FOUND OR v_appointment.kind IS DISTINCT FROM 'appointment' THEN
    RAISE EXCEPTION 'Agendamento não encontrado.' USING ERRCODE = 'P0002';
  END IF;

  IF v_appointment.patient_id IS DISTINCT FROM p_patient_id
     OR v_appointment.professional_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION
      'Acesso negado: agendamento não pertence ao profissional autenticado para este paciente.'
      USING ERRCODE = '42501';
  END IF;

  IF v_appointment.discipline IS DISTINCT FROM p_discipline THEN
    RAISE EXCEPTION
      'A evolução precisa ser da mesma área do agendamento.'
      USING ERRCODE = '22023';
  END IF;

  IF v_appointment.status NOT IN ('attended', 'no_show', 'excused') THEN
    RAISE EXCEPTION
      'Só é possível registrar evolução para um agendamento concluído (atendido, não compareceu ou cancelado pelo paciente).'
      USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    -- Serializa retries concorrentes da mesma chave antes de checar se
    -- já existe — sem o lock, duas requisições idênticas em paralelo
    -- passariam as duas pelo SELECT antes de qualquer uma inserir.
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'patient-evolution-idempotency:' || v_uid::TEXT || ':' || p_idempotency_key::TEXT,
        0
      )
    );

    SELECT pe.id, pe.atendimento_em, pe.registrado_em, pe.attendance_status, pe.revision
    INTO v_existing
    FROM public.patient_evolutions pe
    WHERE pe.therapist_id = v_uid
      AND pe.idempotency_key = p_idempotency_key;

    IF FOUND THEN
      RETURN QUERY SELECT v_existing.id, v_existing.atendimento_em, v_existing.registrado_em,
        v_existing.attendance_status, v_existing.revision;
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.patient_evolutions AS pe (
    patient_id,
    therapist_id,
    discipline,
    appointment_id,
    atendimento_em,
    conteudo_encrypted,
    idempotency_key
  )
  VALUES (
    p_patient_id,
    v_uid,
    p_discipline,
    p_appointment_id,
    p_atendimento_em,
    extensions.pgp_sym_encrypt(p_data, public.get_clinical_encryption_key()),
    p_idempotency_key
  )
  RETURNING pe.id INTO v_id;

  RETURN QUERY
  SELECT pe.id, pe.atendimento_em, pe.registrado_em, pe.attendance_status, pe.revision
  FROM public.patient_evolutions pe
  WHERE pe.id = v_id;
END;
$insert_patient_evolution$;

GRANT EXECUTE ON FUNCTION public.insert_patient_evolution(UUID, TEXT, TEXT, UUID, TIMESTAMPTZ, UUID) TO authenticated;
