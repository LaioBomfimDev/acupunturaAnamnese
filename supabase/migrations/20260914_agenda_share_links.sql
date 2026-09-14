-- ==========================================================
-- Link público da agenda (somente leitura, sem login)
--
-- Mesmo desenho de satisfaction_surveys/confirmation_token: quem cria o
-- link é staff autenticado (RLS normal); quem ABRE o link não tem conta
-- nenhuma — o acesso anônimo passa inteiro pela Edge Function
-- public-agenda (service-role), nunca toca esta tabela direto.
--
--   * nenhum GRANT a anon nesta tabela.
--   * token é UUID (gen_random_uuid) — não é sequencial.
--   * expira em 48h: o link é sobre "a agenda de um dia específico",
--     não uma assinatura permanente — depois disso, gera outro.
--   * revogável a qualquer momento por quem tem acesso à agenda da
--     clínica (DELETE), pra matar um link que foi encaminhado errado.
--   * `disciplines` vazio/nulo = todas; `professional_id` nulo = toda a
--     equipe — mesmo filtro que já existe no ShareAgendaPanel hoje.
--
-- A Edge Function nunca devolve procedimento/modalidade/observação —
-- só nome, horário e status (docs/plano-agenda-gestao-clinica.md,
-- "agenda pública não mostra detalhes sensíveis").
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.agenda_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  disciplines TEXT[],
  professional_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '48 hours')
);

CREATE INDEX IF NOT EXISTS idx_agenda_share_links_clinic_created
  ON public.agenda_share_links (clinic_id, created_at DESC);

ALTER TABLE public.agenda_share_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agenda_share_links FROM anon;

DROP POLICY IF EXISTS agenda_share_links_select ON public.agenda_share_links;
CREATE POLICY agenda_share_links_select ON public.agenda_share_links
  FOR SELECT TO authenticated
  USING (public.can_manage_agenda(clinic_id) OR public.is_super_admin());

DROP POLICY IF EXISTS agenda_share_links_insert ON public.agenda_share_links;
CREATE POLICY agenda_share_links_insert ON public.agenda_share_links
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND created_by = auth.uid()
  );

-- Revogar (DELETE) é a única escrita depois de criado — sem UPDATE,
-- porque um link já enviado não deveria mudar de escopo silenciosamente
-- por baixo de quem o recebeu; quem quer outro filtro gera outro link.
DROP POLICY IF EXISTS agenda_share_links_delete ON public.agenda_share_links;
CREATE POLICY agenda_share_links_delete ON public.agenda_share_links
  FOR DELETE TO authenticated
  USING (public.can_manage_agenda(clinic_id) OR public.is_super_admin());

GRANT SELECT, INSERT, DELETE ON public.agenda_share_links TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'agenda_share_links'
  ) AS tabela_criada,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agenda_share_links' AND policyname = 'agenda_share_links_select'
  ) AS policy_select_criada,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agenda_share_links' AND policyname = 'agenda_share_links_insert'
  ) AS policy_insert_criada,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'agenda_share_links' AND policyname = 'agenda_share_links_delete'
  ) AS policy_delete_criada;
