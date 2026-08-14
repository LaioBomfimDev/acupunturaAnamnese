-- ==========================================================
-- Imutabilidade do log administrativo (auditoria de segurança
-- 2026-08-11, achado A5)
--
-- admin_audit_logs (criação de usuário, suspensão, reset de senha/MFA)
-- tinha RLS + REVOKE de anon/authenticated, mas nenhum trigger contra
-- UPDATE/DELETE — ao contrário de clinical_record_audit_log, que já
-- recusa estruturalmente (20260723_clinical_data_hardening.sql:309-327).
-- Reutiliza a mesma função de rejeição, sem duplicar lógica.
-- ==========================================================

DROP TRIGGER IF EXISTS admin_audit_logs_reject_mutation
  ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_reject_mutation
  BEFORE UPDATE OR DELETE
  ON public.admin_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.reject_immutable_clinical_log_mutation();

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'admin_audit_logs_reject_mutation'
      AND tgrelid = 'public.admin_audit_logs'::regclass
      AND NOT tgisinternal
  ) AS trigger_criado;
