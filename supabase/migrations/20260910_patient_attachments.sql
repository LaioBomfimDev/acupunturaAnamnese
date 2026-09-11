-- ==========================================================
-- Anexos do paciente (PDF/imagem) — bucket privado + tabela de
-- metadados + RLS.
-- REQUER: 20260910_patient_registration_open_clinic (can_manage_agenda
-- já existe desde 20260809_appointments), 20260723_clinical_data_hardening
-- (can_access_clinical_data, is_clinic_admin, is_super_admin).
--
-- Decisão do Laio (2026-09-10): visualizar um anexo é parte do cadastro
-- aberto à clínica (qualquer profissional ativo da clínica pode ver),
-- mas ENVIAR/REMOVER um anexo é ação administrativa (feita fora do
-- atendimento) — só clinic_admin/super_admin. Caminho do arquivo:
-- clinic_id/patient_id/timestamp-nome (1º segmento é o clinic_id, não
-- o therapist_id — diferente do padrão de clinical-tongue-photos,
-- porque aqui o acesso é por clínica, não por dono).
-- ==========================================================

-- 1. Bucket privado (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'patient-attachments',
  'patient-attachments',
  false,
  10485760, -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Políticas de storage.objects — 1º segmento do caminho = clinic_id
DROP POLICY IF EXISTS "Clinica le anexos de paciente da propria clinica" ON storage.objects;
CREATE POLICY "Clinica le anexos de paciente da propria clinica"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'patient-attachments'
  AND public.can_access_clinical_data(auth.uid())
  AND public.can_manage_agenda(((storage.foldername(name))[1])::uuid, auth.uid())
);

DROP POLICY IF EXISTS "Admin envia anexo de paciente da propria clinica" ON storage.objects;
CREATE POLICY "Admin envia anexo de paciente da propria clinica"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'patient-attachments'
  AND public.can_access_clinical_data(auth.uid())
  AND public.can_manage_agenda(((storage.foldername(name))[1])::uuid, auth.uid())
  AND (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Admin remove anexo de paciente da propria clinica" ON storage.objects;
CREATE POLICY "Admin remove anexo de paciente da propria clinica"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'patient-attachments'
  AND public.can_access_clinical_data(auth.uid())
  AND public.can_manage_agenda(((storage.foldername(name))[1])::uuid, auth.uid())
  AND (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
);

-- 3. Metadados (nome original, quem enviou, tipo) — o Storage não guarda isso pesquisável.
CREATE TABLE IF NOT EXISTS public.patient_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS patient_attachments_patient_idx ON public.patient_attachments (patient_id, created_at DESC);

ALTER TABLE public.patient_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_attachments_select_clinic ON public.patient_attachments;
CREATE POLICY patient_attachments_select_clinic
  ON public.patient_attachments
  FOR SELECT
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND public.can_manage_agenda(clinic_id, auth.uid())
  );

DROP POLICY IF EXISTS patient_attachments_insert_admin ON public.patient_attachments;
CREATE POLICY patient_attachments_insert_admin
  ON public.patient_attachments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.can_access_clinical_data(auth.uid())
    AND public.can_manage_agenda(clinic_id, auth.uid())
    AND (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
    AND uploaded_by = auth.uid()
  );

DROP POLICY IF EXISTS patient_attachments_delete_admin ON public.patient_attachments;
CREATE POLICY patient_attachments_delete_admin
  ON public.patient_attachments
  FOR DELETE
  TO authenticated
  USING (
    public.can_access_clinical_data(auth.uid())
    AND public.can_manage_agenda(clinic_id, auth.uid())
    AND (public.is_clinic_admin(auth.uid()) OR public.is_super_admin(auth.uid()))
  );

-- Sem política de UPDATE: um anexo trocado é upload novo + delete do antigo.

-- ============================================================
-- REVERSÃO (executar manualmente se necessário):
-- DROP TABLE IF EXISTS public.patient_attachments;
-- DROP POLICY IF EXISTS "Clinica le anexos de paciente da propria clinica" ON storage.objects;
-- DROP POLICY IF EXISTS "Admin envia anexo de paciente da propria clinica" ON storage.objects;
-- DROP POLICY IF EXISTS "Admin remove anexo de paciente da propria clinica" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'patient-attachments';
-- ============================================================
