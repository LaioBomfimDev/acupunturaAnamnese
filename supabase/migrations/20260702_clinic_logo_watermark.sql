-- ============================================================
-- MARCA D'ÁGUA DA LOGO: exibe a logo da clínica grande, transparente
-- e centralizada atrás do corpo dos relatórios impressos, além do uso
-- tradicional no cabeçalho. Padrão ligado quando há logo cadastrada;
-- o adm da clínica pode desligar.
-- ============================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS logo_watermark BOOLEAN NOT NULL DEFAULT true;
