-- ==========================================================
-- Funções RPC para manipulação segura de dados criptografados
-- A chave de criptografia fica em public.app_config, lida apenas
-- por funções SECURITY DEFINER. O search_path das funções inclui
-- extensions para encontrar pgcrypto no Supabase hosted.
-- ==========================================================

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO public.app_config (key, value)
SELECT 'encryption_key', 'acup-reability-mtc-2026-seguro'
WHERE NOT EXISTS (
  SELECT 1 FROM public.app_config WHERE key = 'encryption_key'
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_config FROM anon, authenticated;

-- Função para inserir ficha clínica com dados criptografados
CREATE OR REPLACE FUNCTION public.insert_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $insert_clinical_record$
DECLARE
  v_id UUID;
  v_therapist_id UUID;
  v_key TEXT;
BEGIN
  v_therapist_id := auth.uid();

  SELECT ac.value
    INTO v_key
  FROM public.app_config ac
  WHERE ac.key = 'encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: paciente não pertence ao profissional autenticado.';
  END IF;

  INSERT INTO public.clinical_records (
    patient_id,
    therapist_id,
    record_type,
    sensitive_data_encrypted
  ) VALUES (
    p_patient_id,
    v_therapist_id,
    p_record_type,
    pgp_sym_encrypt(p_data, v_key)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$insert_clinical_record$;

-- Função para buscar fichas clínicas descriptografadas do paciente
CREATE OR REPLACE FUNCTION public.get_clinical_records(
  p_patient_id UUID,
  p_record_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  patient_id UUID,
  record_type TEXT,
  sensitive_data TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $get_clinical_records$
DECLARE
  v_therapist_id UUID;
  v_key TEXT;
BEGIN
  v_therapist_id := auth.uid();

  SELECT ac.value
    INTO v_key
  FROM public.app_config ac
  WHERE ac.key = 'encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: paciente não pertence ao profissional autenticado.';
  END IF;

  RETURN QUERY
  SELECT
    cr.id,
    cr.patient_id,
    cr.record_type,
    pgp_sym_decrypt(cr.sensitive_data_encrypted, v_key)::TEXT AS sensitive_data,
    cr.created_at,
    cr.updated_at
  FROM public.clinical_records cr
  WHERE cr.patient_id = p_patient_id
    AND cr.therapist_id = v_therapist_id
    AND (p_record_type IS NULL OR cr.record_type = p_record_type)
  ORDER BY cr.created_at DESC;
END;
$get_clinical_records$;

-- Função para atualizar ficha clínica existente
CREATE OR REPLACE FUNCTION public.update_clinical_record(
  p_record_id UUID,
  p_data TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $update_clinical_record$
DECLARE
  v_therapist_id UUID;
  v_key TEXT;
BEGIN
  v_therapist_id := auth.uid();

  SELECT ac.value
    INTO v_key
  FROM public.app_config ac
  WHERE ac.key = 'encryption_key';

  IF v_key IS NULL THEN
    RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinical_records cr
    WHERE cr.id = p_record_id
      AND cr.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: ficha não pertence ao profissional autenticado.';
  END IF;

  UPDATE public.clinical_records
  SET sensitive_data_encrypted = pgp_sym_encrypt(p_data, v_key),
      updated_at = timezone('utc'::text, now())
  WHERE id = p_record_id
    AND therapist_id = v_therapist_id;
END;
$update_clinical_record$;

-- Função para deletar uma ficha clínica
CREATE OR REPLACE FUNCTION public.delete_clinical_record(
  p_record_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $delete_clinical_record$
DECLARE
  v_therapist_id UUID;
BEGIN
  v_therapist_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1
    FROM public.clinical_records cr
    WHERE cr.id = p_record_id
      AND cr.therapist_id = v_therapist_id
  ) THEN
    RAISE EXCEPTION 'Acesso negado: ficha não pertence ao profissional autenticado.';
  END IF;

  DELETE FROM public.clinical_records
  WHERE id = p_record_id
    AND therapist_id = v_therapist_id;
END;
$delete_clinical_record$;

REVOKE EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_clinical_record(UUID) FROM anon;

GRANT EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinical_records(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clinical_record(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_clinical_record(UUID) TO authenticated;
