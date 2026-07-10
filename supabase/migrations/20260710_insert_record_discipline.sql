-- ==========================================================
-- insert_clinical_record ganha o parâmetro p_discipline (Fase 5)
-- Plano: docs/plano-clinica-multidisciplinar.md
-- REQUER: 20260708_clinic_patients_enrollments.sql aplicada antes
-- (é ela que cria a coluna clinical_records.discipline).
--
-- Motivo: o workspace de Psicologia grava sessões com
-- discipline = 'psicologia'. Até aqui a RPC não recebia a
-- disciplina e toda linha caía no DEFAULT 'acupuntura'.
--
-- Compatibilidade: o parâmetro tem DEFAULT 'acupuntura', então
-- todas as chamadas existentes (3 argumentos) seguem funcionando
-- sem mudança. A função antiga de 3 argumentos é REMOVIDA para o
-- PostgREST não ficar ambíguo entre as duas assinaturas.
-- ==========================================================

-- Idempotência com a Fase 2 (não falha se já aplicada).
ALTER TABLE public.clinical_records
  ADD COLUMN IF NOT EXISTS discipline TEXT NOT NULL DEFAULT 'acupuntura'
  CHECK (discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao'));

DROP FUNCTION IF EXISTS public.insert_clinical_record(UUID, TEXT, TEXT);

CREATE FUNCTION public.insert_clinical_record(
  p_patient_id UUID,
  p_record_type TEXT,
  p_data TEXT,
  p_discipline TEXT DEFAULT 'acupuntura'
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS '
  INSERT INTO public.clinical_records (
    patient_id,
    therapist_id,
    record_type,
    discipline,
    sensitive_data_encrypted
  )
  SELECT
    p_patient_id,
    auth.uid(),
    p_record_type,
    p_discipline,
    pgp_sym_encrypt(p_data, ac.value)
  FROM public.app_config ac
  WHERE ac.key = ''encryption_key''
    AND p_discipline IN (''acupuntura'', ''fisioterapia'', ''psicologia'', ''nutricao'')
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = p_patient_id
        AND p.therapist_id = auth.uid()
    )
  RETURNING id;
';

REVOKE EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.insert_clinical_record(UUID, TEXT, TEXT, TEXT) TO authenticated;
