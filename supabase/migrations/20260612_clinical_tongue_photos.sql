-- ============================================================
-- Fotos clínicas da língua — bucket privado + RLS
-- Fase 4 do módulo Língua (análise assistiva por IA).
--
-- Decisões (AGENTS.md §11 "Fotos e dados sensíveis"):
--  * bucket PRIVADO: nenhuma foto de paciente acessível por URL pública;
--  * caminho obrigatório: therapist_id/patient_id/yyyy-mm-dd/arquivo.webp;
--  * isolamento por terapeuta: o 1º segmento da pasta deve ser o
--    auth.uid() do dono — mesma filosofia do RLS de patients/clinical_records;
--  * só image/webp (o frontend re-codifica antes do upload, removendo EXIF/GPS);
--  * 5 MB de limite (após compressão cliente, arquivos ficam bem menores).
--
-- Reversão: ver bloco comentado no fim do arquivo.
-- ============================================================

-- 1. Bucket privado (idempotente)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-tongue-photos',
  'clinical-tongue-photos',
  false,
  5242880, -- 5 MB
  ARRAY['image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Políticas de acesso em storage.objects
-- (storage.foldername(name))[1] = primeiro segmento do caminho = therapist_id

DROP POLICY IF EXISTS "Terapeuta envia fotos de língua na própria pasta" ON storage.objects;
CREATE POLICY "Terapeuta envia fotos de língua na própria pasta"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'clinical-tongue-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Terapeuta lê fotos de língua da própria pasta" ON storage.objects;
CREATE POLICY "Terapeuta lê fotos de língua da própria pasta"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'clinical-tongue-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Terapeuta remove fotos de língua da própria pasta" ON storage.objects;
CREATE POLICY "Terapeuta remove fotos de língua da própria pasta"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'clinical-tongue-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Sem política de UPDATE: fotos são imutáveis (substituir = novo upload + delete),
-- o que preserva o vínculo entre a análise IA salva e a imagem que a gerou.

-- ============================================================
-- REVERSÃO (executar manualmente se necessário):
-- DROP POLICY IF EXISTS "Terapeuta envia fotos de língua na própria pasta" ON storage.objects;
-- DROP POLICY IF EXISTS "Terapeuta lê fotos de língua da própria pasta" ON storage.objects;
-- DROP POLICY IF EXISTS "Terapeuta remove fotos de língua da própria pasta" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'clinical-tongue-photos';
--   (o DELETE do bucket exige que os objetos sejam removidos antes)
-- ============================================================
