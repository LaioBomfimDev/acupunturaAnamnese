-- ==========================================================
-- Pesquisa de satisfação
--
-- Sem anamnese prévia remota (rejeitada explicitamente pelo usuário) e sem
-- WhatsApp (ainda não aprovado): a equipe gera um link com token,
-- copia e envia pelo canal que já usa hoje. O paciente responde sem
-- login — primeiro fluxo anônimo do projeto, por isso o desenho é
-- deliberadamente contido:
--
--   * nenhum GRANT a anon nesta tabela. A resposta do paciente passa
--     inteira pela Edge Function satisfaction-survey, que usa
--     service-role — mesmo padrão de "quem não está autenticado nunca
--     toca a tabela direto" já usado em create-record-share.
--   * token é UUID (gen_random_uuid, 122 bits de entropia) — não é
--     sequencial, não dá para adivinhar o próximo a partir de um válido.
--   * expira e é de uso único (responded_at trava a resposta seguinte).
--
-- pergunta fixa (nota 1-5 + comentário livre) nesta primeira versão —
-- não um construtor de pesquisa. Fica documentado aqui como corte
-- deliberado, não esquecimento.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.satisfaction_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '14 days'),
  responded_at TIMESTAMPTZ,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,

  CONSTRAINT satisfaction_surveys_response_consistency CHECK (
    (responded_at IS NULL AND rating IS NULL)
    OR (responded_at IS NOT NULL AND rating IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_clinic_created
  ON public.satisfaction_surveys (clinic_id, created_at DESC);

ALTER TABLE public.satisfaction_surveys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.satisfaction_surveys FROM anon;

DROP POLICY IF EXISTS satisfaction_surveys_select ON public.satisfaction_surveys;
CREATE POLICY satisfaction_surveys_select ON public.satisfaction_surveys
  FOR SELECT TO authenticated
  USING (public.can_manage_agenda(clinic_id) OR public.is_super_admin());

DROP POLICY IF EXISTS satisfaction_surveys_insert ON public.satisfaction_surveys;
CREATE POLICY satisfaction_surveys_insert ON public.satisfaction_surveys
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_manage_agenda(clinic_id)
    AND created_by = auth.uid()
    -- Mesmo corte de appointments_insert: paciente tem que ser da MESMA
    -- instituição de quem está gerando o link.
    AND EXISTS (
      SELECT 1 FROM public.patients pa
      WHERE pa.id = patient_id AND pa.clinic_id = clinic_id
    )
  );

-- Sem UPDATE/DELETE para authenticated: a resposta do paciente é
-- gravada só pela Edge Function (service-role, que ignora RLS). Cliente
-- autenticado só cria o convite e lê os resultados.

GRANT SELECT, INSERT ON public.satisfaction_surveys TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'satisfaction_surveys'
  ) AS tabela_criada,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'satisfaction_surveys' AND policyname = 'satisfaction_surveys_select'
  ) AS policy_select_criada,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'satisfaction_surveys' AND policyname = 'satisfaction_surveys_insert'
  ) AS policy_insert_criada;
