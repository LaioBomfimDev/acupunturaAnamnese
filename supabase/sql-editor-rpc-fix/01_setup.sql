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
