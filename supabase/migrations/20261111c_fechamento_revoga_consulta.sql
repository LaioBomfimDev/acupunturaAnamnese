-- ============================================================
-- Correção da revisão do Financeiro (11/11/2026)
--
-- finance_month_is_closed saiu liberada para qualquer pessoa logada em
-- 20261111_financeiro_fechamento_mes.sql. Ela é SECURITY DEFINER e lê
-- finance_month_closings, então quem estivesse logado em OUTRA
-- instituição podia perguntar "o mês X da clínica Y está fechado?" e
-- receber a resposta. Não sai valor nenhum, mas é informação de outra
-- instituição e não há motivo para a liberação existir:
--
--   * o gatilho (finance_guard_closed_month) e finance_close_month são
--     SECURITY DEFINER do mesmo dono, então chamam sem precisar do GRANT;
--   * a tela sabe o que está fechado lendo finance_month_closings pela
--     RLS da administração, nunca por esta função.
--
-- Reversão: GRANT EXECUTE ON FUNCTION
-- public.finance_month_is_closed(UUID, DATE) TO authenticated;
-- ============================================================

REVOKE ALL ON FUNCTION public.finance_month_is_closed(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  NOT has_function_privilege('authenticated', 'public.finance_month_is_closed(uuid,date)', 'EXECUTE') AS consulta_fechada,
  NOT has_function_privilege('anon', 'public.finance_month_is_closed(uuid,date)', 'EXECUTE') AS anon_fechado,
  -- O fechamento continua funcionando: as duas usam a função por dentro.
  to_regprocedure('public.finance_close_month(date)') IS NOT NULL AS fechar_existe,
  (SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_finance_receipts_closed_month',
    'trg_finance_expenses_closed_month', 'trg_convenio_payments_closed_month')) = 3 AS travas_no_lugar;
