-- ==========================================================
-- Escalas: responsável claro antes de enviar + administração lê sempre
-- REQUER: 20261008_patient_instruments e 20261011_patient_instruments_portal
-- (já aplicadas). Não recria admin_decide_patient_deletion: nenhuma
-- tabela nova aqui.
--
-- Incidente (09/10/2026): a administradora mandou a paciente para a
-- Psicologia escolhendo a psicóloga ("Enviar" na ficha) e, 22 s depois,
-- mandou o PHQ-9 para casa. O "Enviar" grava o profissional de destino no
-- compartilhamento, mas não na matrícula; e quem cria a matrícula fica
-- como "encaminhado por" (referred_by), que contava como "quem atende".
-- Resultado: o envio passou, a nota e o alerta de risco foram só para a
-- administradora, e a psicóloga recebeu "você precisa atender o paciente
-- nessa área". A tela ainda mandava indicar o "responsável pela
-- matrícula", campo que nenhuma tela preenchia.
--
-- Decisões da usuária (09/10/2026):
--   * "Quem atende" na área = atendimento na Agenda OU responsável da
--     matrícula (assigned_to). Quem só criou a matrícula deixa de contar.
--   * O responsável fica claro antes de enviar: a administração escolhe
--     (ou confirma) o responsável no próprio envio; sem matrícula na área
--     e sem ninguém na Agenda, o envio não sai.
--   * "Enviar para outra área" com profissional de destino grava o
--     destino como responsável quando a matrícula ainda não tem um.
--   * A administração da clínica lê as escalas (nota, faixa, respostas,
--     histórico) de qualquer paciente da clínica, sempre. Aplicar no
--     consultório, receber o alerta e marcar "Vi o alerta" seguem com quem
--     atende.
--   * Escolher ou trocar o responsável é só da administração
--     (set_enrollment_responsible); a escrita direta de assigned_to sai do
--     cliente — senão qualquer profissional da área se colocava como
--     responsável e passava a ver as escalas.
--
-- Reverter: recriar can_use_patient_instruments a partir de 20261008,
-- list_patient_instrument_applications, list_patient_instrument_requests
-- e portal_send_instrument (7 parâmetros) a partir de 20261011; DROP de
-- can_read_patient_instruments, is_enrollment_responsible_candidate,
-- instrument_result_recipients, set_enrollment_responsible, do trigger
-- record_shares_assign_enrollment_responsible e da função dele;
-- GRANT UPDATE (assigned_to) ON public.patient_enrollments TO authenticated.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regprocedure('public.can_use_patient_instruments(uuid, text, uuid)') IS NULL
     OR to_regprocedure('public.portal_send_instrument(uuid, text, text, integer, text, jsonb, date)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261008_patient_instruments.sql e 20261011_patient_instruments_portal.sql.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 1. Quem pode ser responsável por uma matrícula
--    (mesma regra do trigger enforce_enrollment_identity + papel clínico)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_enrollment_responsible_candidate(
  p_profile UUID,
  p_clinic UUID,
  p_discipline TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $is_enrollment_responsible_candidate$
  SELECT p_profile IS NOT NULL
    AND p_clinic IS NOT NULL
    AND p_discipline IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles candidate
      WHERE candidate.id = p_profile
        AND candidate.clinic_id = p_clinic
        AND candidate.role IN ('therapist', 'clinic_admin')
        AND candidate.is_active IS TRUE
        AND candidate.must_change_password IS NOT TRUE
        AND p_discipline = ANY(COALESCE(candidate.disciplines, ARRAY[]::TEXT[]))
    );
$is_enrollment_responsible_candidate$;

REVOKE ALL ON FUNCTION public.is_enrollment_responsible_candidate(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- 2. Quem atende: Agenda ou responsável. "Encaminhado por" não conta mais.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_use_patient_instruments(
  p_patient UUID,
  p_discipline TEXT,
  p_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_use_patient_instruments$
  SELECT p_patient IS NOT NULL
    AND p_discipline IS NOT NULL
    AND p_user IS NOT NULL
    AND public.can_access_clinical_data(p_user)
    AND p_discipline = ANY(public.user_disciplines(p_user))
    AND (
      EXISTS (
        SELECT 1
        FROM public.appointments appointment
        WHERE appointment.patient_id = p_patient
          AND appointment.professional_id = p_user
          AND appointment.discipline = p_discipline
          AND appointment.kind = 'appointment'
          AND appointment.clinic_id = public.user_clinic_id(p_user)
      )
      OR EXISTS (
        SELECT 1
        FROM public.patient_enrollments enrollment
        WHERE enrollment.patient_id = p_patient
          AND enrollment.discipline = p_discipline
          AND enrollment.status = 'active'
          AND enrollment.clinic_id = public.user_clinic_id(p_user)
          AND enrollment.assigned_to = p_user
      )
    );
$can_use_patient_instruments$;

REVOKE ALL ON FUNCTION public.can_use_patient_instruments(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_patient_instruments(UUID, TEXT, UUID) TO authenticated;

-- ----------------------------------------------------------
-- 3. Quem lê: quem atende + a administração da clínica do paciente
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_patient_instruments(
  p_patient UUID,
  p_discipline TEXT,
  p_user UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $can_read_patient_instruments$
  SELECT public.can_use_patient_instruments(p_patient, p_discipline, p_user)
    OR (
      p_patient IS NOT NULL
      AND p_discipline IS NOT NULL
      AND p_user IS NOT NULL
      AND public.is_clinic_admin(p_user)
      AND public.can_access_clinical_data(p_user)
      AND EXISTS (
        SELECT 1
        FROM public.patients patient
        WHERE patient.id = p_patient
          AND patient.clinic_id = public.user_clinic_id(p_user)
      )
    );
$can_read_patient_instruments$;

REVOKE ALL ON FUNCTION public.can_read_patient_instruments(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_patient_instruments(UUID, TEXT, UUID) TO authenticated;

-- Histórico: corpo de 20261011, só a checagem passa a ser de leitura.
CREATE OR REPLACE FUNCTION public.list_patient_instrument_applications(
  p_patient_id UUID,
  p_discipline TEXT
)
RETURNS TABLE (
  id UUID,
  instrument_id TEXT,
  instrument_version INTEGER,
  applied_at TIMESTAMPTZ,
  applied_by UUID,
  applied_by_name TEXT,
  source TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  voided_by_name TEXT,
  void_reason TEXT,
  has_risk BOOLEAN,
  risk_acknowledged_at TIMESTAMPTZ,
  risk_acknowledged_by_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_instrument_applications$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_read_patient_instruments(p_patient_id, p_discipline, v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: o paciente não está em atendimento nesta área com você.'
      USING ERRCODE = '42501';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    pia.id,
    pia.instrument_id,
    pia.instrument_version,
    pia.applied_at,
    pia.applied_by,
    author.full_name::TEXT,
    pia.source,
    extensions.pgp_sym_decrypt(pia.payload_encrypted, v_key)::JSONB,
    pia.created_at,
    pia.voided_at,
    voider.full_name::TEXT,
    CASE
      WHEN pia.void_reason_encrypted IS NULL THEN NULL::TEXT
      ELSE extensions.pgp_sym_decrypt(pia.void_reason_encrypted, v_key)::TEXT
    END,
    pia.has_risk,
    pia.risk_acknowledged_at,
    acknowledger.full_name::TEXT
  FROM public.patient_instrument_applications pia
  LEFT JOIN public.profiles author ON author.id = pia.applied_by
  LEFT JOIN public.profiles voider ON voider.id = pia.voided_by
  LEFT JOIN public.profiles acknowledger ON acknowledger.id = pia.risk_acknowledged_by
  WHERE pia.patient_id = p_patient_id
    AND pia.discipline = p_discipline
    AND pia.clinic_id = public.user_clinic_id(v_uid)
  ORDER BY pia.applied_at DESC, pia.created_at DESC
  LIMIT 500;
END;
$list_patient_instrument_applications$;

REVOKE ALL ON FUNCTION public.list_patient_instrument_applications(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_instrument_applications(UUID, TEXT) TO authenticated;

-- Envios para casa: corpo de 20261011, lê quem lê as escalas.
CREATE OR REPLACE FUNCTION public.list_patient_instrument_requests(p_patient_id UUID, p_discipline TEXT)
RETURNS TABLE (
  request_id UUID,
  instrument_id TEXT,
  instrument_version INTEGER,
  request_status TEXT,
  progress SMALLINT,
  due_date DATE,
  sent_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  sent_by_name TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_instrument_requests$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND
     OR NOT (
       public.can_manage_patient_portal(v_clinic, v_uid)
       OR public.can_read_patient_instruments(p_patient_id, p_discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Acesso negado: o paciente não está em atendimento nesta área com você.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.id, f.instrument_id, f.instrument_version, f.status, f.progress, f.due_date,
         f.created_at, f.submitted_at, f.cancelled_at, sender.full_name::TEXT
  FROM public.patient_form_assignments f
  LEFT JOIN public.profiles sender ON sender.id = f.created_by
  WHERE f.patient_id = p_patient_id
    AND f.clinic_id = v_clinic
    AND f.kind = 'instrument'
    AND f.discipline = p_discipline
  ORDER BY f.created_at DESC
  LIMIT 100;
END;
$list_patient_instrument_requests$;

REVOKE ALL ON FUNCTION public.list_patient_instrument_requests(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_instrument_requests(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 4. Para quem vai o resultado (tela de envio e aba Escalas)
--    Só nomes da equipe e o estado da matrícula; nenhum dado clínico.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.instrument_result_recipients(p_patient_id UUID, p_discipline TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $instrument_result_recipients$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_enrollment_id UUID;
  v_enrollment_status TEXT;
  v_responsible UUID;
  v_is_admin BOOLEAN;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND
     OR v_clinic IS DISTINCT FROM public.user_clinic_id(v_uid)
     OR NOT (
       public.can_manage_patient_portal(v_clinic, v_uid)
       OR public.can_read_patient_instruments(p_patient_id, p_discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Acesso negado: o paciente não está em atendimento nesta área com você.' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.is_clinic_admin(v_uid);

  SELECT e.id, e.status, e.assigned_to
  INTO v_enrollment_id, v_enrollment_status, v_responsible
  FROM public.patient_enrollments e
  WHERE e.patient_id = p_patient_id
    AND e.discipline = p_discipline
    AND e.clinic_id = v_clinic;

  RETURN pg_catalog.jsonb_build_object(
    'enrollment_id', v_enrollment_id,
    'enrollment_status', v_enrollment_status,
    'responsible', (
      SELECT pg_catalog.jsonb_build_object(
        'id', responsible.id,
        'name', responsible.full_name,
        'receives', public.can_use_patient_instruments(p_patient_id, p_discipline, responsible.id)
      )
      FROM public.profiles responsible
      WHERE responsible.id = v_responsible
    ),
    'agenda', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', professional.id, 'name', professional.full_name)
        ORDER BY professional.full_name
      )
      FROM public.profiles professional
      WHERE professional.clinic_id = v_clinic
        AND professional.id IS DISTINCT FROM v_responsible
        AND EXISTS (
          SELECT 1
          FROM public.appointments appointment
          WHERE appointment.patient_id = p_patient_id
            AND appointment.professional_id = professional.id
            AND appointment.discipline = p_discipline
            AND appointment.kind = 'appointment'
            AND appointment.clinic_id = v_clinic
        )
        AND public.can_use_patient_instruments(p_patient_id, p_discipline, professional.id)
    ), '[]'::JSONB),
    'candidates', CASE WHEN v_is_admin THEN COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('id', candidate.id, 'name', candidate.full_name)
        ORDER BY candidate.full_name
      )
      FROM public.profiles candidate
      WHERE candidate.clinic_id = v_clinic
        AND public.is_enrollment_responsible_candidate(candidate.id, v_clinic, p_discipline)
    ), '[]'::JSONB) ELSE '[]'::JSONB END,
    'viewer_attends', public.can_use_patient_instruments(p_patient_id, p_discipline, v_uid),
    'viewer_is_admin', v_is_admin
  );
END;
$instrument_result_recipients$;

REVOKE ALL ON FUNCTION public.instrument_result_recipients(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.instrument_result_recipients(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------
-- 5. Escolher ou trocar o responsável (ficha → Matrículas): só a administração
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_enrollment_responsible(p_enrollment_id UUID, p_responsible UUID)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $set_enrollment_responsible$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_discipline TEXT;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT e.clinic_id, e.discipline
  INTO v_clinic, v_discipline
  FROM public.patient_enrollments e
  WHERE e.id = p_enrollment_id
  FOR UPDATE;

  IF NOT FOUND OR v_clinic IS DISTINCT FROM public.user_clinic_id(v_uid) THEN
    RAISE EXCEPTION 'Matrícula não encontrada.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_clinic_admin(v_uid) THEN
    RAISE EXCEPTION 'Só a administração escolhe o responsável.' USING ERRCODE = '42501';
  END IF;

  IF p_responsible IS NOT NULL
     AND NOT public.is_enrollment_responsible_candidate(p_responsible, v_clinic, v_discipline) THEN
    RAISE EXCEPTION 'O responsável precisa estar ativo, na mesma instituição e atender nesta área.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_enrollments
  SET assigned_to = p_responsible
  WHERE patient_enrollments.id = p_enrollment_id;

  SELECT pr.full_name INTO v_name FROM public.profiles pr WHERE pr.id = p_responsible;

  RETURN pg_catalog.jsonb_build_object(
    'enrollment_id', p_enrollment_id,
    'responsible_id', p_responsible,
    'responsible_name', v_name
  );
END;
$set_enrollment_responsible$;

REVOKE ALL ON FUNCTION public.set_enrollment_responsible(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_enrollment_responsible(UUID, UUID) TO authenticated;

-- A escrita direta de assigned_to sai do cliente: com ela, qualquer
-- profissional da área se colocava como responsável e passava a ver as
-- escalas. Status continua como estava.
REVOKE UPDATE (assigned_to) ON TABLE public.patient_enrollments FROM authenticated;

-- ----------------------------------------------------------
-- 6. "Enviar para outra área" com profissional de destino: o destino
--    vira o responsável, se a matrícula ainda não tem um que atende.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_enrollment_responsible_from_share()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $assign_enrollment_responsible_from_share$
BEGIN
  IF NEW.to_user_id IS NOT NULL AND NEW.revoked_at IS NULL THEN
    UPDATE public.patient_enrollments e
    SET assigned_to = NEW.to_user_id
    WHERE e.patient_id = NEW.patient_id
      AND e.discipline = NEW.to_discipline
      AND e.clinic_id = NEW.clinic_id
      AND (
        e.assigned_to IS NULL
        OR NOT public.is_enrollment_responsible_candidate(e.assigned_to, e.clinic_id, e.discipline)
      )
      AND public.is_enrollment_responsible_candidate(NEW.to_user_id, e.clinic_id, e.discipline);
  END IF;
  RETURN NULL;
END;
$assign_enrollment_responsible_from_share$;

REVOKE ALL ON FUNCTION public.assign_enrollment_responsible_from_share() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS record_shares_assign_enrollment_responsible ON public.record_shares;
CREATE TRIGGER record_shares_assign_enrollment_responsible
  AFTER INSERT ON public.record_shares
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_enrollment_responsible_from_share();

-- Matrículas que já vieram de um "Enviar" com destino e ficaram sem
-- responsável que atende: o destino mais recente (não revogado) assume.
UPDATE public.patient_enrollments e
SET assigned_to = share.to_user_id
FROM (
  SELECT DISTINCT ON (rs.patient_id, rs.to_discipline)
    rs.patient_id, rs.to_discipline, rs.to_user_id, rs.clinic_id
  FROM public.record_shares rs
  WHERE rs.revoked_at IS NULL
    AND rs.to_user_id IS NOT NULL
  ORDER BY rs.patient_id, rs.to_discipline, rs.created_at DESC
) share
WHERE e.patient_id = share.patient_id
  AND e.discipline = share.to_discipline
  AND e.clinic_id = share.clinic_id
  AND (
    e.assigned_to IS NULL
    OR NOT public.is_enrollment_responsible_candidate(e.assigned_to, e.clinic_id, e.discipline)
  )
  AND public.is_enrollment_responsible_candidate(share.to_user_id, e.clinic_id, e.discipline);

-- ----------------------------------------------------------
-- 7. Enviar escala para casa com o responsável claro
--    Corpo de 20261011 + p_responsible. Novo parâmetro com DEFAULT: a
--    tela antiga continua chamando com sete.
-- ----------------------------------------------------------
DROP FUNCTION IF EXISTS public.portal_send_instrument(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, DATE);

CREATE FUNCTION public.portal_send_instrument(
  p_patient_id UUID,
  p_discipline TEXT,
  p_instrument_id TEXT,
  p_instrument_version INTEGER,
  p_title TEXT,
  p_questions JSONB,
  p_due_date DATE DEFAULT NULL,
  p_responsible UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_send_instrument$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_title TEXT := pg_catalog.btrim(COALESCE(p_title, ''));
  v_assignment UUID;
  v_is_admin BOOLEAN;
  v_enrollment_id UUID;
  v_responsible UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND
     OR NOT (
       public.can_manage_patient_portal(v_clinic, v_uid)
       OR public.can_use_patient_instruments(p_patient_id, p_discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Paciente não encontrado ou sem permissão para enviar a escala.' USING ERRCODE = '42501';
  END IF;

  IF p_discipline IS NULL
     OR p_discipline <> ALL (
       ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia']::TEXT[]
     ) THEN
    RAISE EXCEPTION 'Disciplina clínica inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_instrument_id IS NULL OR p_instrument_id !~ '^[a-z0-9][a-z0-9_-]{1,39}$'
     OR p_instrument_version IS NULL OR p_instrument_version < 1 THEN
    RAISE EXCEPTION 'Escala inválida.' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.char_length(v_title) < 2 OR pg_catalog.char_length(v_title) > 200 THEN
    RAISE EXCEPTION 'Nome da escala inválido.' USING ERRCODE = '22023';
  END IF;
  IF p_questions IS NULL
     OR pg_catalog.jsonb_typeof(p_questions) <> 'array'
     OR pg_catalog.jsonb_array_length(p_questions) = 0
     OR pg_catalog.jsonb_array_length(p_questions) > 100
     OR pg_catalog.octet_length(p_questions::TEXT) > 65536 THEN
    RAISE EXCEPTION 'Perguntas da escala inválidas.' USING ERRCODE = '22023';
  END IF;
  IF p_due_date IS NOT NULL AND p_due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'O prazo não pode ser uma data passada.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patient_form_assignments f
    WHERE f.patient_id = p_patient_id
      AND f.kind = 'instrument'
      AND f.instrument_id = p_instrument_id
      AND f.status IN ('pending', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Já existe um envio desta escala esperando a resposta do paciente.' USING ERRCODE = '22023';
  END IF;

  -- Responsável claro: a administração escolhe ou confirma quem recebe a
  -- nota e o alerta. Quem atende e não é da administração já recebe.
  v_is_admin := public.is_clinic_admin(v_uid) AND v_clinic = public.user_clinic_id(v_uid);

  SELECT e.id, e.assigned_to
  INTO v_enrollment_id, v_responsible
  FROM public.patient_enrollments e
  WHERE e.patient_id = p_patient_id
    AND e.discipline = p_discipline
    AND e.clinic_id = v_clinic
    AND e.status = 'active'
  FOR UPDATE;

  IF p_responsible IS NOT NULL THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Só a administração escolhe o responsável.' USING ERRCODE = '42501';
    END IF;
    IF v_enrollment_id IS NULL THEN
      RAISE EXCEPTION 'O paciente ainda não está matriculado nesta área. Na ficha, aba Matrículas, envie o paciente para a área escolhendo quem vai atender.'
        USING ERRCODE = '22023';
    END IF;
    IF NOT public.is_enrollment_responsible_candidate(p_responsible, v_clinic, p_discipline) THEN
      RAISE EXCEPTION 'O responsável precisa estar ativo, na mesma instituição e atender nesta área.' USING ERRCODE = '22023';
    END IF;
    IF v_responsible IS DISTINCT FROM p_responsible THEN
      UPDATE public.patient_enrollments
      SET assigned_to = p_responsible
      WHERE patient_enrollments.id = v_enrollment_id;
      v_responsible := p_responsible;
    END IF;
  END IF;

  IF v_is_admin
     AND v_enrollment_id IS NOT NULL
     AND (v_responsible IS NULL OR NOT public.can_use_patient_instruments(p_patient_id, p_discipline, v_responsible)) THEN
    RAISE EXCEPTION 'Escolha o responsável pela escala nesta área antes de enviar: é quem recebe a nota e o alerta de risco.'
      USING ERRCODE = '22023';
  END IF;

  -- A nota e o alerta de risco vão para quem atende o paciente na área
  -- da escala. Sem ninguém atendendo, não chegariam a ninguém: não envia.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.clinic_id = v_clinic
      AND public.can_use_patient_instruments(p_patient_id, p_discipline, pr.id)
  ) THEN
    RAISE EXCEPTION 'Ninguém da área desta escala atende o paciente ainda: a nota e o alerta de risco não chegariam a ninguém. Na ficha, aba Matrículas, envie o paciente para a área escolhendo quem vai atender, ou agende um atendimento.'
      USING ERRCODE = '22023';
  END IF;

  -- Mesma checagem de nascimento/arquivado do acesso; o código nasce aqui
  -- se faltar, mas só quem pode vê-lo (can_manage_patient_access) o lê.
  PERFORM public.portal_ensure_access_row(p_patient_id);

  INSERT INTO public.patient_form_assignments (
    clinic_id, patient_id, form_id, form_title, form_description, form_questions, due_date, created_by,
    kind, instrument_id, instrument_version, discipline
  )
  VALUES (
    v_clinic, p_patient_id, NULL, v_title, NULL, p_questions, p_due_date, v_uid,
    'instrument', p_instrument_id, p_instrument_version, p_discipline
  )
  RETURNING id INTO v_assignment;

  RETURN v_assignment;
END;
$portal_send_instrument$;

REVOKE ALL ON FUNCTION public.portal_send_instrument(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_send_instrument(UUID, TEXT, TEXT, INTEGER, TEXT, JSONB, DATE, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Conferência rápida depois de aplicar.
SELECT
  has_function_privilege('authenticated', 'public.instrument_result_recipients(uuid, text)', 'EXECUTE') AS para_quem_vai,
  has_function_privilege('authenticated', 'public.set_enrollment_responsible(uuid, uuid)', 'EXECUTE') AS escolher_responsavel,
  NOT has_function_privilege('authenticated', 'public.is_enrollment_responsible_candidate(uuid, uuid, text)', 'EXECUTE') AS candidato_interno,
  NOT has_column_privilege('authenticated', 'public.patient_enrollments', 'assigned_to', 'UPDATE') AS responsavel_so_por_rpc,
  has_column_privilege('authenticated', 'public.patient_enrollments', 'status', 'UPDATE') AS status_continua,
  (SELECT count(*) FROM pg_proc WHERE proname = 'portal_send_instrument') = 1 AS sem_sobrecarga_antiga;
