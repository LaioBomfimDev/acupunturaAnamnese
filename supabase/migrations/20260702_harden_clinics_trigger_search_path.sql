-- ============================================================
-- HARDENING: trava o search_path do trigger set_clinics_updated_at.
-- Resolve o aviso do Supabase "Function Search Path Mutable" (lint 0011)
-- para esta função. É seguro: a função só faz NEW.updated_at = NOW()
-- (NOW() resolve por pg_catalog), então não depende de search_path;
-- fixá-lo em vazio apenas elimina o vetor de sequestro de search_path.
-- Não altera comportamento nem dados.
-- ============================================================

ALTER FUNCTION public.set_clinics_updated_at() SET search_path = '';
