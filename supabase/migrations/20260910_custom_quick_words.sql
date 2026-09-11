-- ==========================================================
-- Atalhos de texto customizados ("+ palavra") por clínica.
-- Decisão da usuária, 2026-09-10: o botão "+" ao lado dos quick word
-- chips permite que qualquer profissional adicione uma palavra/frase
-- nova, que fica disponível pra toda a clínica — mas ISOLADA por
-- disciplina + campo, pra não vazar (ex.: um atalho criado num campo
-- de Nutrição não pode aparecer no mesmo campo em Fisioterapia).
--
-- REQUER: 20260708_clinic_patients_enrollments.sql aplicada antes
-- (função public.user_clinic_id já existe, reaproveitada aqui).
--
-- clinic_id e created_by NUNCA vêm do payload do cliente — sempre
-- resolvidos por trigger no servidor, mesmo padrão de
-- patient_enrollments/patient_evolutions.
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.custom_quick_words (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  discipline TEXT NOT NULL CHECK (
    discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')
  ),
  field_id TEXT NOT NULL,
  word TEXT NOT NULL CHECK (btrim(word) <> ''),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (clinic_id, discipline, field_id, word)
);

CREATE INDEX IF NOT EXISTS idx_custom_quick_words_lookup
  ON public.custom_quick_words(clinic_id, discipline, field_id);

-- clinic_id/created_by resolvidos aqui, nunca aceitos do client.
CREATE OR REPLACE FUNCTION public.set_custom_quick_word_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.clinic_id := public.user_clinic_id(auth.uid());
  NEW.created_by := auth.uid();
  IF NEW.clinic_id IS NULL THEN
    RAISE EXCEPTION 'Usuário sem clínica associada não pode criar atalho compartilhado.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_custom_quick_word_defaults ON public.custom_quick_words;
CREATE TRIGGER trg_set_custom_quick_word_defaults
  BEFORE INSERT ON public.custom_quick_words
  FOR EACH ROW EXECUTE FUNCTION public.set_custom_quick_word_defaults();

ALTER TABLE public.custom_quick_words ENABLE ROW LEVEL SECURITY;

-- Compartilhado com toda a clínica: qualquer membro lê e cria.
DROP POLICY IF EXISTS custom_quick_words_select_clinic ON public.custom_quick_words;
CREATE POLICY custom_quick_words_select_clinic ON public.custom_quick_words
  FOR SELECT TO authenticated
  USING (clinic_id = public.user_clinic_id(auth.uid()));

DROP POLICY IF EXISTS custom_quick_words_insert_clinic ON public.custom_quick_words;
CREATE POLICY custom_quick_words_insert_clinic ON public.custom_quick_words
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.user_clinic_id(auth.uid()));

-- Exclusão restrita a quem criou (MVP; pode virar "qualquer um da
-- clínica" depois, se pedirem — troca só o USING abaixo).
DROP POLICY IF EXISTS custom_quick_words_delete_own ON public.custom_quick_words;
CREATE POLICY custom_quick_words_delete_own ON public.custom_quick_words
  FOR DELETE TO authenticated
  USING (created_by = auth.uid());

REVOKE ALL ON public.custom_quick_words FROM anon;
GRANT SELECT, INSERT, DELETE ON public.custom_quick_words TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  to_regclass('public.custom_quick_words') IS NOT NULL AS tabela_criada,
  (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'custom_quick_words') AS politicas_rls,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_set_custom_quick_word_defaults'
      AND tgrelid = 'public.custom_quick_words'::regclass
      AND NOT tgisinternal
  ) AS trigger_defaults_criado;
