// Perfis da anamnese de Psicologia. O sexo clínico direciona somente
// perguntas pertinentes; nunca é evidência diagnóstica. Identidade de
// gênero permanece um dado separado do cadastro/escuta.

export const PSYCHOLOGY_WELCOME_PATHS = [
  {
    id: 'infantojuvenil',
    label: 'Anamnese infantil',
    description: 'Até 17 anos, acompanhada por responsável e com autoria de cada resposta.',
  },
  {
    id: 'adulto',
    label: 'Anamnese adulto',
    description: 'A partir de 18 anos, com roteiro longitudinal de história e funcionamento.',
  },
  {
    id: 'avaliacao_neuropsicologica',
    label: 'Avaliação',
    description: 'Processo separado, com instrumentos, sessões, resultados, integração e relatório.',
  },
];

export const PSYCHOLOGY_INTAKE_PROFILES = [
  {
    id: 'infantojuvenil_feminino',
    path: 'infantojuvenil',
    ageGroup: 'infantojuvenil',
    clinicalSex: 'feminino',
    label: 'Anamnese infantil — menina',
    shortLabel: 'Infantil · menina',
  },
  {
    id: 'infantojuvenil_masculino',
    path: 'infantojuvenil',
    ageGroup: 'infantojuvenil',
    clinicalSex: 'masculino',
    label: 'Anamnese infantil — menino',
    shortLabel: 'Infantil · menino',
  },
  {
    id: 'adulto_feminino',
    path: 'adulto',
    ageGroup: 'adulto',
    clinicalSex: 'feminino',
    label: 'Anamnese adulta — mulher',
    shortLabel: 'Adulta · mulher',
  },
  {
    id: 'adulto_masculino',
    path: 'adulto',
    ageGroup: 'adulto',
    clinicalSex: 'masculino',
    label: 'Anamnese adulta — homem',
    shortLabel: 'Adulto · homem',
  },
];

export const PSYCHOLOGY_INFORMANT_OPTIONS = [
  { id: 'mae', label: 'Mãe' },
  { id: 'pai', label: 'Pai' },
  { id: 'responsavel', label: 'Outro responsável' },
  { id: 'paciente', label: 'Criança/adolescente' },
  { id: 'conjunto', label: 'Resposta conjunta' },
  { id: 'outro', label: 'Outro informante' },
];

const adultSections = [
  {
    id: 'adulto-contexto',
    title: 'Contexto atual e evolução da demanda',
    fields: [
      ['adultDescricaoAtual', 'Como a pessoa se descreve atualmente?', ['ansiosa', 'estressada', 'desatenta', 'organizada', 'reservada', 'sociável']],
      ['adultMudancasRelevantes', 'Quais mudanças recentes são consideradas mais relevantes?', ['piora recente', 'mudança de rotina', 'perda importante', 'mudança profissional', 'conflito familiar', 'sem mudança percebida']],
      ['adultInicioEvolucao', 'Quando as mudanças começaram e como evoluíram?', ['início súbito', 'início gradual', 'melhorou', 'piorou', 'permaneceu estável', 'não soube estimar']],
    ],
  },
  {
    id: 'adulto-historia',
    title: 'História pessoal, familiar e escolar',
    fields: [
      ['adultHistoriaVida', 'História de vida e acontecimentos marcantes', ['infância estável', 'conflitos familiares', 'perdas', 'mudanças frequentes', 'violência sofrida', 'adoecimento importante']],
      ['adultFamiliaOrigem', 'Composição familiar na infância e qualidade das relações', ['morava com os pais', 'mãe', 'pai', 'avós', 'irmãos', 'relação conflituosa', 'relação amistosa']],
      ['adultInfanciaPersonalidade', 'Como era o comportamento na infância e adolescência?', ['tímida(o)', 'extrovertida(o)', 'ansiosa(o)', 'desafiadora(or)', 'distraída(o)', 'afetiva(o)', 'isolada(o)']],
      ['adultTrajetoriaEscolar', 'Trajetória escolar, aprendizagem e relações na escola', ['boa adaptação', 'dificuldade de leitura', 'dificuldade de escrita', 'dificuldade em matemática', 'reprovação', 'advertência', 'muitos amigos']],
    ],
  },
  {
    id: 'adulto-ocupacional',
    title: 'Trajetória profissional e funcionamento cotidiano',
    fields: [
      ['adultTrajetoriaProfissional', 'Profissões, ocupações anteriores e identificação com o trabalho atual', ['trabalho formal', 'autônoma(o)', 'afastada(o)', 'desempregada(o)', 'satisfeita(o)', 'mudança recente']],
      ['adultFuncionamentoExecutivo', 'Organização, planejamento, prazos e adaptação a mudanças', ['dificuldade para iniciar', 'dificuldade para concluir', 'procrastinação', 'desorganização', 'cumpre prazos', 'dificuldade com mudanças']],
      ['adultAutonomia', 'Autonomia nas atividades de vida diária e necessidade de apoio', ['independente', 'necessita lembretes', 'necessita supervisão', 'depende de apoio', 'autocuidado preservado']],
    ],
  },
  {
    id: 'adulto-clinico',
    title: 'Histórico clínico e funcionamento neuropsicológico percebido',
    fields: [
      ['adultAcompanhamentos', 'Acompanhamentos, tratamentos, exames e internações anteriores', ['psicologia', 'psiquiatria', 'neurologia', 'internação', 'cirurgia', 'avaliação anterior', 'sem acompanhamento']],
      ['adultMedicacoes', 'Medicações atuais e anteriores, conforme relato', ['usa atualmente', 'uso anterior', 'uso irregular', 'não usa', 'não soube informar']],
      ['adultAtencaoMemoria', 'Atenção, memória, orientação e linha de raciocínio', ['alta distração', 'esquece compromissos', 'perde objetos', 'perde o raciocínio', 'desorientação temporal', 'sem queixa']],
      ['adultLinguagemAprendizagem', 'Linguagem, leitura, escrita e habilidades matemáticas', ['dificuldade para encontrar palavras', 'dificuldade de compreensão', 'dificuldade de escrita', 'dificuldade matemática', 'sem queixa']],
      ['adultSintomasFisicosSensoriais', 'Sintomas físicos e sensoriais relevantes', ['cefaleia', 'fadiga', 'tremores', 'vertigem', 'sensibilidade à luz', 'zumbido', 'sem queixa']],
    ],
  },
  {
    id: 'adulto-habitos',
    title: 'Humor, sono, hábitos e rede de apoio',
    fields: [
      ['adultHumorComportamento', 'Mudanças de humor, comportamento, energia e interesse', ['ansiedade', 'irritabilidade', 'apatia', 'choro fácil', 'baixa energia', 'perda de interesse', 'sem mudança']],
      ['adultSonoRotina', 'Sono, atividade física, lazer e participação social', ['sono satisfatório', 'insônia', 'despertares', 'bruxismo', 'atividade física regular', 'isolamento social']],
      ['adultSubstancias', 'Uso atual ou anterior de álcool, tabaco e outras substâncias', ['não usa', 'álcool', 'tabaco', 'cafeína', 'outras substâncias', 'uso aumentou recentemente']],
      ['adultRedeApoioDetalhada', 'Quem participa da rede de apoio e como ajuda?', ['cônjuge', 'mãe', 'pai', 'filhos', 'irmãos', 'amigos', 'sem apoio percebido']],
    ],
  },
];

const childSections = [
  {
    id: 'infantil-responsaveis',
    title: 'Responsáveis e fonte das informações',
    fields: [
      ['childCuidadorPrincipal', 'Quem é o cuidador principal e como participa da rotina?', ['mãe', 'pai', 'avó/avô', 'outro responsável', 'guarda compartilhada', 'cuidador profissional']],
      ['childResponsaveisRelacao', 'Como é a relação da criança/adolescente com cada responsável?', ['relação próxima', 'relação conflituosa', 'pouco contato', 'moram juntos', 'não moram juntos', 'guarda compartilhada']],
      ['childDemandaFamilia', 'O que a família considera a principal dificuldade neste momento?', ['comportamento', 'aprendizagem', 'atenção', 'comunicação', 'ansiedade', 'relações sociais', 'sono']],
    ],
  },
  {
    id: 'infantil-demanda',
    title: 'Motivo da consulta e evolução',
    fields: [
      ['childQueixaPrincipal', 'Qual é a queixa principal e quem a percebeu primeiro?', ['família percebeu', 'escola percebeu', 'paciente percebeu', 'outro profissional percebeu', 'piora recente']],
      ['childInicioEvolucao', 'Quando começaram as dificuldades e como evoluíram?', ['desde bebê', 'na educação infantil', 'na alfabetização', 'na adolescência', 'início súbito', 'início gradual', 'piora recente']],
      ['childProfissionaisAnteriores', 'Quais profissionais já acompanharam e quais foram as orientações?', ['pediatra', 'neuropediatra', 'psicologia', 'fonoaudiologia', 'terapia ocupacional', 'fisioterapia', 'psiquiatria']],
    ],
  },
  {
    id: 'infantil-desenvolvimento',
    title: 'Gestação, parto e desenvolvimento',
    fields: [
      ['childGestacao', 'Como transcorreu a gestação e o pré-natal?', ['planejada', 'não planejada', 'pré-natal realizado', 'complicações', 'uso de medicação', 'infecção na gestação']],
      ['childPartoNeonatal', 'Como foram o parto e o período neonatal?', ['parto vaginal', 'cesárea', 'prematuridade', 'UTI neonatal', 'icterícia', 'dificuldade respiratória', 'sem complicações']],
      ['childDesenvolvimentoMotor', 'Como ocorreram os marcos motores e o controle esfincteriano?', ['dentro do esperado', 'atraso percebido', 'não engatinhou', 'andou tardiamente', 'controle diurno', 'controle noturno', 'não soube informar']],
      ['childLinguagem', 'Como ocorreu o desenvolvimento da linguagem e da comunicação?', ['dentro do esperado', 'atraso de fala', 'usa gestos', 'aponta', 'compreende comandos', 'ecolalia', 'dificuldade atual']],
    ],
  },
  {
    id: 'infantil-social-cognitivo',
    title: 'Desenvolvimento social, cognitivo e sensorial',
    fields: [
      ['childBrincar', 'Como brinca e cria situações simbólicas?', ['brinca sozinha(o)', 'brinca com outras crianças', 'brincar simbólico', 'brincar repetitivo', 'cria histórias', 'interesse restrito']],
      ['childInteracaoSocial', 'Como interage, compartilha interesses e busca conforto?', ['contato visual presente', 'responde ao nome', 'demonstra empatia', 'compartilha interesses', 'evita contato', 'necessita mediação']],
      ['childCognicaoRotina', 'Como estão atenção, memória, resolução de problemas e seguimento de rotinas?', ['adequado para idade', 'atenção diminuída', 'dificuldade de memória', 'necessita apoio', 'rotina fácil', 'rotina difícil']],
      ['childSensorial', 'Existem sensibilidades ou buscas sensoriais relevantes?', ['sons', 'luzes', 'texturas', 'cheiros', 'alimentos', 'movimento', 'sem sensibilidade percebida']],
    ],
  },
  {
    id: 'infantil-emocional',
    title: 'Aspectos emocionais, comportamentais e autonomia',
    fields: [
      ['childHumorEmocoes', 'Como expressa emoções e lida com frustrações?', ['humor estável', 'irritabilidade', 'choro fácil', 'ansiedade', 'medo de errar', 'baixa autoestima', 'dificuldade com frustração']],
      ['childComportamentos', 'Há agitação, comportamentos repetitivos, regressivos ou agressivos?', ['agitação', 'desatenção', 'comportamento repetitivo', 'regressão', 'autoagressão', 'heteroagressão', 'não percebido']],
      ['childAutonomia', 'Qual é o nível de independência nas atividades de vida diária?', ['independente', 'necessita supervisão', 'dependente', 'pede ajuda', 'inicia atividades', 'cumpre combinados']],
      ['childSonoAlimentacaoTelas', 'Como estão sono, alimentação, atividade física e uso de telas?', ['sono adequado', 'insônia', 'pesadelos', 'alimentação seletiva', 'atividade física', 'uso de tela elevado']],
    ],
  },
  {
    id: 'infantil-escola',
    title: 'Vida escolar',
    fields: [
      ['childEscolaAdaptacao', 'Como foi a adaptação escolar e como se sente nos dias de aula?', ['boa adaptação', 'adaptação difícil', 'gosta da escola', 'não gosta da escola', 'mudança recente', 'ansiedade escolar']],
      ['childAprendizagem', 'Quais são as facilidades e dificuldades de aprendizagem?', ['leitura', 'escrita', 'matemática', 'atenção em sala', 'notas boas', 'notas regulares', 'notas baixas', 'reforço escolar']],
      ['childRelacoesEscola', 'Como são amizades, participação, regras e situações de bullying?', ['possui amigos', 'melhor amigo', 'isolamento', 'sofreu bullying', 'presenciou bullying', 'advertências', 'segue regras']],
      ['childAcompanhamentoFamiliarEscola', 'Como a família acompanha estudos, tarefas e comunicação com a escola?', ['acompanha diariamente', 'acompanha às vezes', 'rotina de estudos', 'local adequado', 'contato com professores', 'necessita apoio']],
    ],
  },
  {
    id: 'infantil-familia-clinico',
    title: 'Dinâmica familiar, histórico clínico e avaliações anteriores',
    fields: [
      ['childDinamicaFamiliar', 'Como a família organiza limites, disciplina, expectativas e apoio?', ['rotina estruturada', 'limites consistentes', 'divergência entre responsáveis', 'superproteção', 'conflitos', 'apoio familiar']],
      ['childObjetivosFamilia', 'Quais são os objetivos e as principais preocupações da família?', ['comunicação', 'autonomia', 'aprendizagem', 'regulação emocional', 'relações sociais', 'comportamento']],
      ['childHistoricoMedico', 'Histórico médico, hospitalizações, cirurgias, alergias e medicações', ['sem ocorrência relevante', 'hospitalização', 'cirurgia', 'traumatismo', 'convulsão', 'alergia', 'medicação atual']],
      ['childAvaliacoesAnteriores', 'Exames e avaliações anteriores, com resultados conhecidos', ['avaliação psicológica', 'avaliação neuropsicológica', 'fonoaudiologia', 'terapia ocupacional', 'exame de imagem', 'EEG', 'não realizou']],
      ['childHistoricoFamiliar', 'Histórico familiar de condições neurológicas, psiquiátricas ou de aprendizagem', ['sem histórico conhecido', 'TDAH', 'autismo', 'dificuldade de aprendizagem', 'transtorno psiquiátrico', 'epilepsia', 'síndrome genética']],
    ],
  },
];

function toField([id, label, quickWords]) {
  return { id, label, textarea: true, quickWords, questionGuide: [] };
}

function materialize(sections) {
  return sections.map(section => ({
    ...section,
    fields: section.fields.map(toField),
  }));
}

const adultFemaleSection = {
  id: 'adulto-contexto-feminino',
  title: 'Contexto corporal e reprodutivo — perguntar apenas quando pertinente',
  fields: [toField(['adultContextoFeminino', 'Há contexto menstrual, hormonal, gestacional ou urogenital relevante informado pela paciente?', ['não investigado', 'sem queixa', 'ciclo informado', 'gestação atual', 'pós-parto', 'menopausa', 'queixa urogenital']])],
};

const adultMaleSection = {
  id: 'adulto-contexto-masculino',
  title: 'Contexto corporal e urogenital — perguntar apenas quando pertinente',
  fields: [toField(['adultContextoMasculino', 'Há contexto hormonal, sexual ou urogenital relevante informado pelo paciente?', ['não investigado', 'sem queixa', 'alteração hormonal', 'queixa sexual', 'queixa urogenital', 'acompanhamento médico']])],
};

const childFemaleSection = {
  id: 'infantil-contexto-feminino',
  title: 'Desenvolvimento corporal — perguntar conforme idade e pertinência',
  fields: [toField(['childContextoFeminino', 'Há informações relevantes sobre puberdade, ciclo ou desenvolvimento corporal?', ['não investigado', 'não se aplica à idade', 'sem queixa', 'puberdade iniciada', 'ciclo informado', 'acompanhamento médico']])],
};

const childMaleSection = {
  id: 'infantil-contexto-masculino',
  title: 'Desenvolvimento corporal — perguntar conforme idade e pertinência',
  fields: [toField(['childContextoMasculino', 'Há informações relevantes sobre puberdade ou desenvolvimento corporal?', ['não investigado', 'não se aplica à idade', 'sem queixa', 'puberdade iniciada', 'queixa urogenital', 'acompanhamento médico']])],
};

const adultMaterialized = materialize(adultSections);
const childMaterialized = materialize(childSections);

export function getPsychologyIntakeProfile(profileId) {
  return PSYCHOLOGY_INTAKE_PROFILES.find(profile => profile.id === profileId) || null;
}

export function getPsychologyProfilesForPath(path) {
  return PSYCHOLOGY_INTAKE_PROFILES.filter(profile => profile.path === path);
}

export function isPsychologyPathEligible(path, age) {
  if (!Number.isFinite(age)) return true;
  if (path === 'infantojuvenil') return age <= 17;
  if (path === 'adulto') return age >= 18;
  return true;
}

export function getPsychologyProfileSections(profileId) {
  const profile = getPsychologyIntakeProfile(profileId);
  if (!profile) return [];
  if (profile.ageGroup === 'adulto') {
    return [...adultMaterialized, profile.clinicalSex === 'feminino' ? adultFemaleSection : adultMaleSection];
  }
  return [...childMaterialized, profile.clinicalSex === 'feminino' ? childFemaleSection : childMaleSection];
}

export function getAllPsychologyProfileFields() {
  const byId = new Map();
  for (const profile of PSYCHOLOGY_INTAKE_PROFILES) {
    for (const section of getPsychologyProfileSections(profile.id)) {
      for (const field of section.fields) byId.set(field.id, field);
    }
  }
  return [...byId.values()];
}
