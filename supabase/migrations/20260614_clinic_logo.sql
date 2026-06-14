-- ============================================================
-- LOGO DA CLÍNICA: imagem institucional usada no papel timbrado
-- de TODOS os relatórios. Guardada como data URL (base64) na própria
-- linha da clínica, para funcionar com o fallback local (localStorage)
-- e sem depender de um bucket de Storage separado.
-- ============================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
