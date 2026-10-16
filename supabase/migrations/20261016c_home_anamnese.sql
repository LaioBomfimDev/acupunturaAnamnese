-- ==========================================================
-- Anamnese para responder em casa (Área do Paciente)
-- REQUER: 20261006_patient_portal, 20261011_patient_instruments_portal e
-- 20261012_instrument_result_responsible (já aplicadas). Não recria
-- admin_decide_patient_deletion: a única tabela nova não tem paciente
-- (modelos), e o envio mora em patient_form_assignments, que a exclusão
-- de paciente já apaga desde 20261009.
--
-- Pedido da administradora (16/10/2026): as anamneses que já existem
-- (infantil e adulto, da Psicologia) também vão para o paciente
-- responder em casa, como as escalas.
--
-- Desenho:
--   * As perguntas são as da ficha (frontend/src/data/homeAnamneses.js,
--     mesmo id de campo) e moram aqui, em home_anamnese_templates. O
--     envio copia as perguntas do modelo, nunca do aparelho de quem
--     envia: quem atende não monta formulário livre para o paciente
--     (montar formulário segue só com a administração).
--   * O envio é uma linha de patient_form_assignments com kind
--     'anamnese' (+ disciplina e modelo). Para a Área do Paciente é um
--     formulário como os outros: a Edge Function patient-portal usa a
--     cópia das perguntas do envio e grava cifrado pelo mesmo
--     portal_save_answers. Nenhuma mudança na Edge Function.
--   * Envia, lista e cancela quem atende o paciente na área
--     (can_use_patient_instruments) e a administração. Lê as respostas
--     quem atende e a administração (can_read_patient_instruments), só
--     depois que o paciente envia: até lá é rascunho dele.
--   * Nada entra na ficha sozinho: a profissional lê e traz cada
--     resposta para o campo (tela da anamnese).
--
-- Reverter: DROP das funções novas; recriar portal_admin_read_answers
-- e a constraint patient_form_assignments_kind_check a partir de
-- 20261011; DROP das colunas anamnese_id/anamnese_version (antes,
-- apagar os envios kind 'anamnese'); DROP TABLE home_anamnese_templates.
-- ==========================================================

DO $requires$
BEGIN
  IF to_regclass('public.patient_form_assignments') IS NULL
     OR to_regprocedure('public.can_use_patient_instruments(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.can_read_patient_instruments(uuid,text,uuid)') IS NULL
     OR to_regprocedure('public.portal_ensure_access_row(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Aplique antes 20261006_patient_portal, 20261011_patient_instruments_portal e 20261012_instrument_result_responsible.';
  END IF;
END;
$requires$;

-- ----------------------------------------------------------
-- 1. Modelos (perguntas que vão para casa)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.home_anamnese_templates (
  id TEXT NOT NULL,
  version INTEGER NOT NULL,
  discipline TEXT NOT NULL,
  path TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),

  CONSTRAINT home_anamnese_templates_pkey PRIMARY KEY (id, version),
  CONSTRAINT home_anamnese_templates_id_check CHECK (id ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  CONSTRAINT home_anamnese_templates_version_check CHECK (version >= 1),
  CONSTRAINT home_anamnese_templates_discipline_check CHECK (
    discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')
  ),
  CONSTRAINT home_anamnese_templates_title_check CHECK (char_length(btrim(title)) BETWEEN 2 AND 120),
  CONSTRAINT home_anamnese_templates_questions_check CHECK (
    jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) BETWEEN 1 AND 200
  )
);

-- Só as funções abaixo leem (SECURITY DEFINER): ninguém lê nem grava direto.
ALTER TABLE public.home_anamnese_templates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.home_anamnese_templates FROM PUBLIC, anon, authenticated;

-- Versão nova de um modelo entra numa migration nova; esta nunca muda.
INSERT INTO public.home_anamnese_templates (id, version, discipline, path, title, description, questions)
VALUES (
  'psi_anamnese_adulto', 1, 'psicologia', 'adulto',
  'Anamnese — Psicologia',
  $description$Estas são as perguntas da anamnese, para você responder com calma e com as suas palavras. Nenhuma é obrigatória: o que preferir, deixe em branco para conversar na consulta. Dá para parar e continuar depois: o que você escreve fica salvo. As respostas são lidas pela profissional que acompanha você, não na hora. Em caso de urgência, ligue 188 (CVV) ou 192 (SAMU).$description$,
  $questions$[
  {"id":"escuta","type":"section","label":"Escuta livre","help":""},
  {"id":"demanda","type":"long_text","label":"Demanda / queixa principal (nas palavras da pessoa)","help":"O que te trouxe ao atendimento? Com suas palavras, como você descreveria o que está acontecendo? Desde quando isso vem acontecendo? Como isso tem afetado o seu dia a dia?","required":false,"showIf":null},
  {"id":"motivoBusca","type":"long_text","label":"O que motivou a busca por atendimento agora","help":"Por que você procurou ajuda neste momento? Aconteceu algo recente que pesou nessa decisão?","required":false,"showIf":null},
  {"id":"historiaPessoal","type":"long_text","label":"História pessoal e de vida relevante","help":"Como foi sua infância e adolescência? Houve eventos marcantes na sua vida (perdas, mudanças, separações, adoecimentos)? Como você descreveria sua trajetória até aqui?","required":false,"showIf":null},
  {"id":"saudeMental","type":"long_text","label":"Histórico de saúde mental e tratamentos anteriores (incl. medicação psiquiátrica)","help":"Você já fez acompanhamento psicológico ou psiquiátrico antes? Como foi? Usa ou já usou medicação psiquiátrica? Qual e por quanto tempo? Há histórico de saúde mental na sua família?","required":false,"showIf":null},
  {"id":"redeApoio","type":"long_text","label":"Rede de apoio / contexto familiar e social","help":"Com quem você mora? Como é a convivência? Com quem você pode contar quando precisa? Como estão suas relações mais próximas (família, amigos, trabalho)?","required":false,"showIf":null},
  {"id":"adulto-contexto","type":"section","label":"Contexto atual e evolução da demanda","help":""},
  {"id":"adultDescricaoAtual","type":"long_text","label":"Como a pessoa se descreve atualmente?","help":"","required":false,"showIf":null},
  {"id":"adultMudancasRelevantes","type":"long_text","label":"Quais mudanças recentes são consideradas mais relevantes?","help":"","required":false,"showIf":null},
  {"id":"adultInicioEvolucao","type":"long_text","label":"Quando as mudanças começaram e como evoluíram?","help":"","required":false,"showIf":null},
  {"id":"adulto-historia","type":"section","label":"História pessoal, familiar e escolar","help":""},
  {"id":"adultHistoriaVida","type":"long_text","label":"História de vida e acontecimentos marcantes","help":"","required":false,"showIf":null},
  {"id":"adultFamiliaOrigem","type":"long_text","label":"Composição familiar na infância e qualidade das relações","help":"","required":false,"showIf":null},
  {"id":"adultInfanciaPersonalidade","type":"long_text","label":"Como era o comportamento na infância e adolescência?","help":"","required":false,"showIf":null},
  {"id":"adultTrajetoriaEscolar","type":"long_text","label":"Trajetória escolar, aprendizagem e relações na escola","help":"","required":false,"showIf":null},
  {"id":"adulto-ocupacional","type":"section","label":"Trajetória profissional e funcionamento cotidiano","help":""},
  {"id":"adultTrajetoriaProfissional","type":"long_text","label":"Profissões, ocupações anteriores e identificação com o trabalho atual","help":"","required":false,"showIf":null},
  {"id":"adultFuncionamentoExecutivo","type":"long_text","label":"Organização, planejamento, prazos e adaptação a mudanças","help":"","required":false,"showIf":null},
  {"id":"adultAutonomia","type":"long_text","label":"Autonomia nas atividades de vida diária e necessidade de apoio","help":"","required":false,"showIf":null},
  {"id":"adulto-clinico","type":"section","label":"Histórico clínico e funcionamento neuropsicológico percebido","help":""},
  {"id":"adultAcompanhamentos","type":"long_text","label":"Acompanhamentos, tratamentos, exames e internações anteriores","help":"","required":false,"showIf":null},
  {"id":"adultMedicacoes","type":"long_text","label":"Medicações atuais e anteriores, conforme relato","help":"","required":false,"showIf":null},
  {"id":"adultAtencaoMemoria","type":"long_text","label":"Atenção, memória, orientação e linha de raciocínio","help":"","required":false,"showIf":null},
  {"id":"adultLinguagemAprendizagem","type":"long_text","label":"Linguagem, leitura, escrita e habilidades matemáticas","help":"","required":false,"showIf":null},
  {"id":"adultSintomasFisicosSensoriais","type":"long_text","label":"Sintomas físicos e sensoriais relevantes","help":"","required":false,"showIf":null},
  {"id":"adulto-habitos","type":"section","label":"Humor, sono, hábitos e rede de apoio","help":""},
  {"id":"adultHumorComportamento","type":"long_text","label":"Mudanças de humor, comportamento, energia e interesse","help":"","required":false,"showIf":null},
  {"id":"adultSonoRotina","type":"long_text","label":"Sono, atividade física, lazer e participação social","help":"","required":false,"showIf":null},
  {"id":"adultSubstancias","type":"long_text","label":"Uso atual ou anterior de álcool, tabaco e outras substâncias","help":"","required":false,"showIf":null},
  {"id":"adultRedeApoioDetalhada","type":"long_text","label":"Quem participa da rede de apoio e como ajuda?","help":"","required":false,"showIf":null}
]$questions$::jsonb
)
ON CONFLICT ON CONSTRAINT home_anamnese_templates_pkey DO NOTHING;

INSERT INTO public.home_anamnese_templates (id, version, discipline, path, title, description, questions)
VALUES (
  'psi_anamnese_infantil', 1, 'psicologia', 'infantojuvenil',
  'Anamnese infantil — Psicologia',
  $description$Estas são as perguntas da anamnese infantil, para o responsável pela criança ou adolescente responder com calma. Comece dizendo quem está respondendo. As outras perguntas não são obrigatórias: o que preferir, deixe em branco para conversar na consulta. Dá para parar e continuar depois: o que você escreve fica salvo. As respostas são lidas pela profissional que acompanha a criança, não na hora. Em caso de urgência, ligue 188 (CVV) ou 192 (SAMU).$description$,
  $questions$[
  {"id":"quem-responde","type":"section","label":"Quem está respondendo","help":""},
  {"id":"informante","type":"single","label":"Quem está respondendo?","help":"","required":true,"showIf":null,"options":["Mãe","Pai","Outro responsável","Criança/adolescente","Resposta conjunta","Outro informante"],"allowOther":false},
  {"id":"informanteNome","type":"short_text","label":"Nome ou vínculo complementar","help":"Opcional. Ex.: avó materna.","required":false,"showIf":null},
  {"id":"escuta","type":"section","label":"Escuta livre","help":""},
  {"id":"demanda","type":"long_text","label":"Demanda / queixa principal (nas palavras da pessoa)","help":"","required":false,"showIf":null},
  {"id":"motivoBusca","type":"long_text","label":"O que motivou a busca por atendimento agora","help":"","required":false,"showIf":null},
  {"id":"historiaPessoal","type":"long_text","label":"História pessoal e de vida relevante","help":"","required":false,"showIf":null},
  {"id":"saudeMental","type":"long_text","label":"Histórico de saúde mental e tratamentos anteriores (incl. medicação psiquiátrica)","help":"","required":false,"showIf":null},
  {"id":"redeApoio","type":"long_text","label":"Rede de apoio / contexto familiar e social","help":"","required":false,"showIf":null},
  {"id":"infantil-responsaveis","type":"section","label":"Responsáveis e fonte das informações","help":""},
  {"id":"childCuidadorPrincipal","type":"long_text","label":"Quem é o cuidador principal e como participa da rotina?","help":"","required":false,"showIf":null},
  {"id":"childResponsaveisRelacao","type":"long_text","label":"Como é a relação da criança/adolescente com cada responsável?","help":"","required":false,"showIf":null},
  {"id":"childDemandaFamilia","type":"long_text","label":"O que a família considera a principal dificuldade neste momento?","help":"","required":false,"showIf":null},
  {"id":"infantil-demanda","type":"section","label":"Motivo da consulta e evolução","help":""},
  {"id":"childQueixaPrincipal","type":"long_text","label":"Qual é a queixa principal e quem a percebeu primeiro?","help":"","required":false,"showIf":null},
  {"id":"childInicioEvolucao","type":"long_text","label":"Quando começaram as dificuldades e como evoluíram?","help":"","required":false,"showIf":null},
  {"id":"childProfissionaisAnteriores","type":"long_text","label":"Quais profissionais já acompanharam e quais foram as orientações?","help":"","required":false,"showIf":null},
  {"id":"infantil-desenvolvimento","type":"section","label":"Gestação, parto e desenvolvimento","help":""},
  {"id":"childGestacao","type":"long_text","label":"Como transcorreu a gestação e o pré-natal?","help":"","required":false,"showIf":null},
  {"id":"childPartoNeonatal","type":"long_text","label":"Como foram o parto e o período neonatal?","help":"","required":false,"showIf":null},
  {"id":"childDesenvolvimentoMotor","type":"long_text","label":"Como ocorreram os marcos motores e o controle esfincteriano?","help":"","required":false,"showIf":null},
  {"id":"childLinguagem","type":"long_text","label":"Como ocorreu o desenvolvimento da linguagem e da comunicação?","help":"","required":false,"showIf":null},
  {"id":"infantil-social-cognitivo","type":"section","label":"Desenvolvimento social, cognitivo e sensorial","help":""},
  {"id":"childBrincar","type":"long_text","label":"Como brinca e cria situações simbólicas?","help":"","required":false,"showIf":null},
  {"id":"childInteracaoSocial","type":"long_text","label":"Como interage, compartilha interesses e busca conforto?","help":"","required":false,"showIf":null},
  {"id":"childCognicaoRotina","type":"long_text","label":"Como estão atenção, memória, resolução de problemas e seguimento de rotinas?","help":"","required":false,"showIf":null},
  {"id":"childSensorial","type":"long_text","label":"Existem sensibilidades ou buscas sensoriais relevantes?","help":"","required":false,"showIf":null},
  {"id":"infantil-emocional","type":"section","label":"Aspectos emocionais, comportamentais e autonomia","help":""},
  {"id":"childHumorEmocoes","type":"long_text","label":"Como expressa emoções e lida com frustrações?","help":"","required":false,"showIf":null},
  {"id":"childComportamentos","type":"long_text","label":"Há agitação, comportamentos repetitivos, regressivos ou agressivos?","help":"","required":false,"showIf":null},
  {"id":"childAutonomia","type":"long_text","label":"Qual é o nível de independência nas atividades de vida diária?","help":"","required":false,"showIf":null},
  {"id":"childSonoAlimentacaoTelas","type":"long_text","label":"Como estão sono, alimentação, atividade física e uso de telas?","help":"","required":false,"showIf":null},
  {"id":"infantil-escola","type":"section","label":"Vida escolar","help":""},
  {"id":"childEscolaAdaptacao","type":"long_text","label":"Como foi a adaptação escolar e como se sente nos dias de aula?","help":"","required":false,"showIf":null},
  {"id":"childAprendizagem","type":"long_text","label":"Quais são as facilidades e dificuldades de aprendizagem?","help":"","required":false,"showIf":null},
  {"id":"childRelacoesEscola","type":"long_text","label":"Como são amizades, participação, regras e situações de bullying?","help":"","required":false,"showIf":null},
  {"id":"childAcompanhamentoFamiliarEscola","type":"long_text","label":"Como a família acompanha estudos, tarefas e comunicação com a escola?","help":"","required":false,"showIf":null},
  {"id":"infantil-familia-clinico","type":"section","label":"Dinâmica familiar, histórico clínico e avaliações anteriores","help":""},
  {"id":"childDinamicaFamiliar","type":"long_text","label":"Como a família organiza limites, disciplina, expectativas e apoio?","help":"","required":false,"showIf":null},
  {"id":"childObjetivosFamilia","type":"long_text","label":"Quais são os objetivos e as principais preocupações da família?","help":"","required":false,"showIf":null},
  {"id":"childHistoricoMedico","type":"long_text","label":"Histórico médico, hospitalizações, cirurgias, alergias e medicações","help":"","required":false,"showIf":null},
  {"id":"childAvaliacoesAnteriores","type":"long_text","label":"Exames e avaliações anteriores, com resultados conhecidos","help":"","required":false,"showIf":null},
  {"id":"childHistoricoFamiliar","type":"long_text","label":"Histórico familiar de condições neurológicas, psiquiátricas ou de aprendizagem","help":"","required":false,"showIf":null}
]$questions$::jsonb
)
ON CONFLICT ON CONSTRAINT home_anamnese_templates_pkey DO NOTHING;

-- ----------------------------------------------------------
-- 2. Envio de anamnese: colunas no envio
-- ----------------------------------------------------------
ALTER TABLE public.patient_form_assignments
  ADD COLUMN IF NOT EXISTS anamnese_id TEXT,
  ADD COLUMN IF NOT EXISTS anamnese_version INTEGER;

-- Corpo de 20261011 + o tipo 'anamnese'; formulário e escala seguem sem
-- modelo. Os IS NOT NULL fecham um buraco que vinha de 20261011: num
-- CHECK, `NULL ~ '...'` dá desconhecido e a linha passava; escala sem
-- instrument_id entrava (achado ao validar esta migration com ROLLBACK).
ALTER TABLE public.patient_form_assignments
  DROP CONSTRAINT IF EXISTS patient_form_assignments_kind_check;
ALTER TABLE public.patient_form_assignments
  ADD CONSTRAINT patient_form_assignments_kind_check CHECK (
    (
      kind = 'form'
      AND instrument_id IS NULL AND instrument_version IS NULL AND discipline IS NULL
      AND anamnese_id IS NULL AND anamnese_version IS NULL
    )
    OR (
      kind = 'instrument'
      AND instrument_id IS NOT NULL AND instrument_version IS NOT NULL AND discipline IS NOT NULL
      AND instrument_id ~ '^[a-z0-9][a-z0-9_-]{1,39}$'
      AND instrument_version >= 1
      AND discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')
      AND anamnese_id IS NULL AND anamnese_version IS NULL
    )
    OR (
      kind = 'anamnese'
      AND anamnese_id IS NOT NULL AND anamnese_version IS NOT NULL AND discipline IS NOT NULL
      AND form_id IS NULL
      AND instrument_id IS NULL AND instrument_version IS NULL
      AND discipline IN ('acupuntura', 'fisioterapia', 'psicologia', 'nutricao', 'neuropsicologia')
      AND anamnese_id ~ '^[a-z0-9][a-z0-9_-]{1,39}$'
      AND anamnese_version >= 1
    )
  );

ALTER TABLE public.patient_form_assignments
  DROP CONSTRAINT IF EXISTS patient_form_assignments_anamnese_template_fkey;
ALTER TABLE public.patient_form_assignments
  ADD CONSTRAINT patient_form_assignments_anamnese_template_fkey
  FOREIGN KEY (anamnese_id, anamnese_version)
  REFERENCES public.home_anamnese_templates (id, version)
  ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_patient_form_assignments_anamnese
  ON public.patient_form_assignments (patient_id, anamnese_id, status)
  WHERE kind = 'anamnese';

-- ----------------------------------------------------------
-- 3. Enviar, listar e cancelar
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_send_anamnese(
  p_patient_id UUID,
  p_anamnese_id TEXT,
  p_due_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_send_anamnese$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_template public.home_anamnese_templates;
  v_assignment UUID;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  -- Sempre a versão mais nova do modelo.
  SELECT t.* INTO v_template
  FROM public.home_anamnese_templates t
  WHERE t.id = p_anamnese_id
  ORDER BY t.version DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anamnese inválida.' USING ERRCODE = '22023';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND
     OR NOT (
       public.can_manage_patient_portal(v_clinic, v_uid)
       OR public.can_use_patient_instruments(p_patient_id, v_template.discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Paciente não encontrado ou sem permissão para enviar a anamnese.' USING ERRCODE = '42501';
  END IF;

  IF p_due_date IS NOT NULL AND p_due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::DATE THEN
    RAISE EXCEPTION 'O prazo não pode ser uma data passada.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patient_form_assignments f
    WHERE f.patient_id = p_patient_id
      AND f.kind = 'anamnese'
      AND f.anamnese_id = v_template.id
      AND f.status IN ('pending', 'in_progress')
  ) THEN
    RAISE EXCEPTION 'Já existe um envio desta anamnese esperando a resposta do paciente.' USING ERRCODE = '22023';
  END IF;

  -- Mesma checagem de nascimento/arquivado do acesso; o código nasce aqui
  -- se faltar, mas só quem pode vê-lo (can_manage_patient_access) o lê.
  PERFORM public.portal_ensure_access_row(p_patient_id);

  INSERT INTO public.patient_form_assignments (
    clinic_id, patient_id, form_id, form_title, form_description, form_questions, due_date, created_by,
    kind, discipline, anamnese_id, anamnese_version
  )
  VALUES (
    v_clinic, p_patient_id, NULL, v_template.title, v_template.description, v_template.questions,
    p_due_date, v_uid,
    'anamnese', v_template.discipline, v_template.id, v_template.version
  )
  RETURNING id INTO v_assignment;

  RETURN v_assignment;
END;
$portal_send_anamnese$;

REVOKE ALL ON FUNCTION public.portal_send_anamnese(UUID, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_send_anamnese(UUID, TEXT, DATE) TO authenticated;

-- Envios de anamnese do paciente na área. As perguntas são a cópia do
-- envio (o que o paciente viu); as respostas só depois que ele envia.
CREATE OR REPLACE FUNCTION public.list_patient_anamnese_requests(p_patient_id UUID, p_discipline TEXT)
RETURNS TABLE (
  result_id UUID,
  result_anamnese_id TEXT,
  result_anamnese_version INTEGER,
  result_title TEXT,
  result_status TEXT,
  result_progress SMALLINT,
  result_due_date DATE,
  result_sent_at TIMESTAMPTZ,
  result_submitted_at TIMESTAMPTZ,
  result_cancelled_at TIMESTAMPTZ,
  result_sent_by_name TEXT,
  result_questions JSONB,
  result_answers JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $list_patient_anamnese_requests$
DECLARE
  v_uid UUID := auth.uid();
  v_clinic UUID;
  v_key TEXT;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT p.clinic_id INTO v_clinic FROM public.patients p WHERE p.id = p_patient_id;
  IF NOT FOUND OR NOT public.can_read_patient_instruments(p_patient_id, p_discipline, v_uid) THEN
    RAISE EXCEPTION 'Acesso negado: o paciente não está em atendimento nesta área com você.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.patient_form_assignments f
    WHERE f.patient_id = p_patient_id
      AND f.clinic_id = v_clinic
      AND f.kind = 'anamnese'
      AND f.discipline = p_discipline
      AND f.status = 'submitted'
      AND f.answers_encrypted IS NOT NULL
  ) THEN
    v_key := public.get_clinical_encryption_key();
  END IF;

  RETURN QUERY
  SELECT
    f.id,
    f.anamnese_id,
    f.anamnese_version,
    f.form_title,
    f.status,
    f.progress,
    f.due_date,
    f.created_at,
    f.submitted_at,
    f.cancelled_at,
    sender.full_name::TEXT,
    f.form_questions,
    CASE
      WHEN f.status = 'submitted' AND f.answers_encrypted IS NOT NULL
        THEN extensions.pgp_sym_decrypt(f.answers_encrypted, v_key)::JSONB
      ELSE NULL
    END
  FROM public.patient_form_assignments f
  LEFT JOIN public.profiles sender ON sender.id = f.created_by
  WHERE f.patient_id = p_patient_id
    AND f.clinic_id = v_clinic
    AND f.kind = 'anamnese'
    AND f.discipline = p_discipline
  ORDER BY f.created_at DESC
  LIMIT 50;
END;
$list_patient_anamnese_requests$;

REVOKE ALL ON FUNCTION public.list_patient_anamnese_requests(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_patient_anamnese_requests(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_patient_anamnese_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $cancel_patient_anamnese_request$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.patient_form_assignments;
BEGIN
  IF v_uid IS NULL OR NOT public.can_access_clinical_data(v_uid) THEN
    RAISE EXCEPTION
      'Acesso negado: conclua a troca da senha temporária ou reative o usuário.'
      USING ERRCODE = '42501';
  END IF;

  SELECT f.* INTO v_row FROM public.patient_form_assignments f WHERE f.id = p_request_id FOR UPDATE;
  IF NOT FOUND
     OR v_row.kind <> 'anamnese'
     OR NOT (
       public.can_manage_patient_portal(v_row.clinic_id, v_uid)
       OR public.can_use_patient_instruments(v_row.patient_id, v_row.discipline, v_uid)
     ) THEN
    RAISE EXCEPTION 'Envio não encontrado ou sem permissão.' USING ERRCODE = '42501';
  END IF;
  IF v_row.status NOT IN ('pending', 'in_progress') THEN
    RAISE EXCEPTION 'Não foi possível cancelar: a anamnese já foi respondida ou cancelada.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patient_form_assignments f
     SET status = 'cancelled',
         cancelled_at = timezone('utc', now())
   WHERE f.id = v_row.id;
END;
$cancel_patient_anamnese_request$;

REVOKE ALL ON FUNCTION public.cancel_patient_anamnese_request(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_patient_anamnese_request(UUID) TO authenticated;

-- ----------------------------------------------------------
-- 4. Respostas para a administração (Importáveis, ficha): corpo de
-- 20261011 + a anamnese, que a administração já lê na área
-- (can_read_patient_instruments). Anamnese só depois de enviada.
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_admin_read_answers(p_assignment_ids UUID[])
RETURNS TABLE (assignment_id UUID, answers JSONB)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $portal_admin_read_answers$
DECLARE
  v_key TEXT;
BEGIN
  IF p_assignment_ids IS NULL OR cardinality(p_assignment_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_assignment_ids) > 500 THEN
    RAISE EXCEPTION 'No máximo 500 respostas por vez.' USING ERRCODE = '22023';
  END IF;

  v_key := public.get_clinical_encryption_key();

  RETURN QUERY
  SELECT
    f.id,
    CASE
      WHEN f.answers_encrypted IS NULL THEN '{}'::JSONB
      ELSE extensions.pgp_sym_decrypt(f.answers_encrypted, v_key)::JSONB
    END
  FROM public.patient_form_assignments f
  WHERE f.id = ANY (p_assignment_ids)
    AND (f.kind = 'form' OR (f.kind = 'anamnese' AND f.status = 'submitted'))
    AND public.can_manage_patient_portal(f.clinic_id);
END;
$portal_admin_read_answers$;

REVOKE ALL ON FUNCTION public.portal_admin_read_answers(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_admin_read_answers(UUID[]) TO authenticated;

-- ----------------------------------------------------------
-- Verificação
-- ----------------------------------------------------------
SELECT
  (SELECT count(*) FROM public.home_anamnese_templates) AS modelos,
  NOT has_table_privilege('authenticated', 'public.home_anamnese_templates', 'SELECT') AS modelos_sem_leitura_direta,
  has_function_privilege('authenticated', 'public.portal_send_anamnese(uuid, text, date)', 'EXECUTE') AS envio_de_anamnese,
  NOT has_function_privilege('anon', 'public.list_patient_anamnese_requests(uuid, text)', 'EXECUTE') AS lista_fechada_para_anon;
