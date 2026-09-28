-- ==========================================================
-- Configurar agenda (Admin da clínica) + sessão remarcada
--
-- Pedido (2026-09-28): o Admin personaliza a agenda da equipe toda —
-- visual do cancelado e do não-compareceu, fixo × avulso, esconder
-- cancelados, cor de cada disciplina e padrões (duração, visão inicial,
-- grade de quem não cadastrou jornada).
--
--   1. clinics.agenda_settings (JSONB, '{}' = tudo no padrão). A tela
--      normaliza o conteúdo (utils/agendaSettings.js): chave desconhecida
--      ou valor fora da lista cai no padrão, então o banco só garante que
--      é um objeto e que não cresce sem limite.
--   2. RPC clinic_admin_update_agenda_settings: o clinic_admin grava SÓ
--      esse campo da PRÓPRIA instituição. A policy de UPDATE de clinics
--      continua exclusiva do SuperAdm — mesmo desenho de
--      clinic_admin_update_appearance (20260923).
--   3. appointments.rescheduled_from: horário original da sessão antes
--      de "Mover para outro horário". Sessão de pacote movida (terça →
--      sexta só nesta semana) deixa de parecer fixa na agenda. NULL =
--      nunca foi movida, ou voltou ao horário original.
--
-- Aditiva: nenhuma linha existente muda de significado.
-- ==========================================================

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS agenda_settings JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.clinics DROP CONSTRAINT IF EXISTS clinics_agenda_settings_object;
ALTER TABLE public.clinics
  ADD CONSTRAINT clinics_agenda_settings_object
  CHECK (jsonb_typeof(agenda_settings) = 'object' AND pg_column_size(agenda_settings) <= 8192);

COMMENT ON COLUMN public.clinics.agenda_settings IS
  'Configuração da agenda da instituição (Admin). {} = padrão. Normalizada no frontend: utils/agendaSettings.js.';

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS rescheduled_from TIMESTAMPTZ;

COMMENT ON COLUMN public.appointments.rescheduled_from IS
  'Horário original antes de "Mover para outro horário". NULL = nunca movida (ou voltou ao original).';

CREATE OR REPLACE FUNCTION public.clinic_admin_update_agenda_settings(
  p_settings JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_clinic UUID := public.user_clinic_id(auth.uid());
  v_saved JSONB;
BEGIN
  -- is_clinic_admin já exige conta ativa e senha trocada.
  IF NOT public.is_clinic_admin(v_actor_id) THEN
    RAISE EXCEPTION 'Acesso negado: só o administrador da clínica pode configurar a agenda.'
      USING ERRCODE = '42501';
  END IF;

  IF v_clinic IS NULL THEN
    RAISE EXCEPTION 'Seu usuário não está vinculado a uma instituição.'
      USING ERRCODE = '42501';
  END IF;

  IF p_settings IS NULL OR jsonb_typeof(p_settings) <> 'object' THEN
    RAISE EXCEPTION 'Configuração da agenda inválida.' USING ERRCODE = '22023';
  END IF;

  IF pg_column_size(p_settings) > 8192 THEN
    RAISE EXCEPTION 'Configuração da agenda grande demais.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.clinics
  SET agenda_settings = p_settings
  WHERE id = v_clinic
  RETURNING agenda_settings INTO v_saved;

  RETURN v_saved;
END;
$$;

REVOKE ALL ON FUNCTION public.clinic_admin_update_agenda_settings(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clinic_admin_update_agenda_settings(JSONB) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'clinics' AND column_name = 'agenda_settings'
  ) AS coluna_settings_criada,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'rescheduled_from'
  ) AS coluna_remarcada_criada,
  to_regprocedure('public.clinic_admin_update_agenda_settings(jsonb)') IS NOT NULL AS rpc_criada,
  has_function_privilege('authenticated', 'public.clinic_admin_update_agenda_settings(jsonb)', 'EXECUTE') AS authenticated_pode_executar,
  NOT has_function_privilege('anon', 'public.clinic_admin_update_agenda_settings(jsonb)', 'EXECUTE') AS anon_bloqueado;
