-- ----------------------------------------------------------------------
-- attends_patients: separa "quais áreas o perfil pode ver" (disciplines)
-- de "esse perfil atende paciente ou é administração pura". Até aqui os
-- dois eram a mesma coisa (clinic_admin sem disciplines = admin puro),
-- o que impedia dar visão total das áreas pra um admin que não atende
-- (ele passava a ser tratado como profissional comum ao ganhar acesso
-- de visualização às disciplinas). Default TRUE preserva o
-- comportamento de todo mundo que já existe hoje.
-- ----------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS attends_patients BOOLEAN NOT NULL DEFAULT true;

-- Karen Karoline é administração pura da Reability (não atende) — ganha
-- visão total das áreas da clínica só para consulta (ver
-- docs/plano-clinica-multidisciplinar.md, "enxerga todas as áreas").
UPDATE public.profiles
SET attends_patients = false,
    disciplines = ARRAY['acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia'],
    updated_at = timezone('utc'::text, now())
WHERE username = 'karenkaroline';
