// ============================================================
// DADOS: Módulos de contexto da anamnese de Psicologia — RASCUNHO A VALIDAR
//
// Substituem os antigos blocos "por sexo clínico", que traziam um único
// campo genérico e presumiam o que perguntar a partir do sexo. O gatilho
// agora é PERTINÊNCIA, não sexo: todos os módulos existem para todos os
// percursos, e o perfil escolhido apenas PRÉ-ABRE os que costumam
// interessar. A profissional abre e fecha qualquer um.
//
// Por que a troca (decisão do dono do produto, 2026-08-07): o dado
// clinicamente útil nunca é "é mulher" — é "existe contexto hormonal",
// "existe sobrecarga de cuidado", "existe violência do parceiro". Amarrar
// os campos ao sexo gerava campo vazio (pergunta que não cabe no caso) e
// campo ausente (homem cuidador principal, mulher sem queixa reprodutiva).
// Também alinha o formulário à regra que a própria IA já segue: nunca
// presumir anatomia, ciclo, identidade ou queixa a partir de sexo/gênero.
//
// TUDO aqui é proposta conservadora: a psicóloga é a autoridade e vai
// cortar/trocar/reescrever. Até lá o workspace exibe o banner de rascunho.
// ============================================================

function toField([id, label, quickWords, questionGuide = []]) {
  return { id, label, textarea: true, quickWords, questionGuide };
}

// `suggestedFor` lista os perfis em que o módulo já nasce aberto. É uma
// SUGESTÃO de ponto de partida — nunca uma restrição de quem pode abrir.
const modules = [
  {
    id: 'ciclo-hormonios-reproducao',
    label: 'Ciclo, hormônios e reprodução',
    summary:
      'Abrir quando houver contexto menstrual, hormonal, gestacional ou de climatério relacionado ao sofrimento atual. '
      + 'Registre o que a pessoa relatar — não presuma anatomia, ciclo nem identidade.',
    suggestedFor: ['adulto_feminino'],
    fields: [
      [
        'ctxCicloHumor',
        'Relação entre fase do ciclo e humor, ansiedade ou sono',
        ['sem relação percebida', 'piora pré-menstrual', 'irritabilidade cíclica', 'insônia pré-menstrual', 'cólica incapacitante', 'ciclo irregular', 'não menstrua'],
        [
          'Você percebe mudança de humor, sono ou ansiedade em alguma fase do ciclo?',
          'Esses dias chegam a atrapalhar trabalho, estudo ou relações?',
          'Há quanto tempo percebe esse padrão?',
        ],
      ],
      [
        'ctxGestacaoPuerperioPerdas',
        'Gestação, puerpério e perdas gestacionais',
        ['não se aplica', 'gestação atual', 'pós-parto recente', 'perda gestacional', 'dificuldade para engravidar', 'tentando engravidar', 'acompanhamento médico'],
        [
          'Há gestação atual, pós-parto recente ou tentativa de engravidar?',
          'Houve perda gestacional? Como foi vivida e com quem pôde falar disso?',
          'No pós-parto, como estavam sono, humor e apoio da rede?',
        ],
      ],
      [
        'ctxTransicaoHormonal',
        'Climatério, menopausa ou outras transições hormonais',
        ['não se aplica', 'ondas de calor', 'insônia', 'irritabilidade', 'queda de libido', 'alteração de tireoide', 'em acompanhamento médico'],
        [
          'Houve mudança hormonal recente (climatério, tireoide, hormonioterapia)?',
          'O que mudou no sono, no humor e na energia desde então?',
          'Isso está sendo acompanhado por outro profissional?',
        ],
      ],
      [
        'ctxContracepcaoHumor',
        'Contracepção, hormonioterapia e efeito percebido no humor',
        ['não usa', 'anticoncepcional oral', 'DIU hormonal', 'implante', 'hormonioterapia', 'percebeu mudança de humor', 'sem mudança percebida'],
        [
          'Usa algum método hormonal? Desde quando?',
          'Percebeu mudança no humor, na ansiedade ou na libido ao iniciar ou trocar?',
          'Já conversou sobre isso com quem prescreveu?',
        ],
      ],
    ],
  },
  {
    id: 'violencia-seguranca',
    label: 'Violência, segurança e coerção',
    summary:
      'Rastreio conduzido A SÓS com a pessoa — nunca na frente de acompanhante, parceiro ou responsável. '
      + 'Registre o relato e o que foi combinado. O sistema destaca e lembra; a conduta é sempre sua.',
    suggestedFor: ['adulto_feminino', 'adulto_masculino'],
    fields: [
      [
        'ctxViolenciaSituacao',
        'Situações de violência, ameaça ou controle relatadas',
        ['nega', 'violência psicológica', 'violência física', 'ameaças', 'controle financeiro', 'controle de deslocamento', 'violência sexual', 'assédio no trabalho'],
        [
          'Alguém próximo já te machucou, ameaçou ou humilhou?',
          'Alguém controla seu dinheiro, seu celular ou aonde você vai?',
          'Você se sente segura(o) em casa hoje?',
        ],
      ],
      [
        'ctxViolenciaAutorContexto',
        'Quem, desde quando e em que contexto',
        ['não se aplica', 'parceiro atual', 'ex-parceiro', 'familiar', 'cuidador', 'chefe ou colega', 'episódio único', 'recorrente'],
        [
          'Quem faz isso e há quanto tempo?',
          'Já aconteceu antes, com essa pessoa ou com outras?',
          'Há armas em casa? Há uso de álcool ou drogas envolvido?',
        ],
      ],
      [
        'ctxViolenciaRedeProtecao',
        'Rede de proteção, recursos e medidas já tomadas',
        ['ninguém sabe', 'família sabe', 'amigos sabem', 'boletim de ocorrência', 'medida protetiva', 'acompanhamento jurídico', 'sem recursos no momento'],
        [
          'Quem sabe do que está acontecendo?',
          'Já houve registro, medida protetiva ou atendimento em algum serviço?',
          'Para onde você poderia ir se precisasse sair de casa hoje?',
        ],
      ],
      [
        'ctxViolenciaPlanoSeguranca',
        'Plano de segurança combinado nesta sessão',
        ['reavaliar na próxima sessão', 'contatos de emergência anotados', 'rede acionada', 'encaminhamento realizado', 'pessoa optou por não agir agora'],
        [
          'O que ficou combinado hoje?',
          'Quais contatos de emergência foram anotados e onde ficam guardados?',
          'Quando será a reavaliação?',
        ],
      ],
    ],
  },
  {
    id: 'parentalidade-cuidado',
    label: 'Parentalidade e carga de cuidado',
    summary:
      'Abrir quando a pessoa cuida de alguém (filhos, pais, pessoa em adoecimento) ou quando parentalidade '
      + 'aparece como fonte de sofrimento, culpa ou conflito. Vale para qualquer pessoa que exerça o cuidado.',
    suggestedFor: ['adulto_feminino', 'adulto_masculino'],
    fields: [
      [
        'ctxCuidadoDependentes',
        'De quem cuida hoje, com que frequência e desde quando',
        ['não cuida de ninguém', 'filhos pequenos', 'filhos adolescentes', 'pai ou mãe idoso(a)', 'pessoa com deficiência', 'pessoa em adoecimento', 'cuidado integral', 'cuidado parcial'],
        [
          'Quem depende de você no dia a dia?',
          'Quantas horas do seu dia esse cuidado ocupa?',
          'Desde quando você assumiu esse papel?',
        ],
      ],
      [
        'ctxDivisaoCargaMental',
        'Divisão do cuidado e carga mental (quem organiza e quem executa)',
        ['divide bem', 'divide mal', 'organiza sozinha(o)', 'apoio pago', 'apoio da família', 'sem apoio'],
        [
          'Quem organiza (lembra, agenda, planeja) e quem executa?',
          'Você consegue delegar? O que acontece quando tenta?',
          'Sobra algum tempo só seu na semana?',
        ],
      ],
      [
        'ctxImpactoCuidadoSofrimento',
        'Como o cuidado se relaciona com o sofrimento atual',
        ['exaustão', 'culpa', 'perda de tempo próprio', 'conflito com o parceiro', 'medo de falhar', 'ambivalência', 'realização'],
        [
          'O que pesa mais nesse cuidado hoje?',
          'Há culpa envolvida? Culpa de quê, especificamente?',
          'O que mudou na sua vida desde que assumiu esse papel?',
        ],
      ],
      [
        'ctxProjetoParentalidade',
        'Projetos, dúvidas ou lutos ligados à parentalidade',
        ['não se aplica', 'deseja ter filhos', 'decidiu não ter', 'dificuldade para engravidar', 'processo de adoção', 'luto por não ter', 'pressão da família'],
        [
          'Ter (ou não ter) filhos é um tema hoje para você?',
          'Existe pressão de alguém em torno disso?',
          'Houve alguma perda ou renúncia ligada a esse projeto?',
        ],
      ],
    ],
  },
  {
    id: 'sexualidade-corpo-imagem',
    label: 'Sexualidade, corpo e imagem corporal',
    summary:
      'Abrir quando houver queixa sexual, sofrimento com o corpo ou uso de recursos para modificá-lo. '
      + 'Tema com vergonha frequente: pergunte de forma aberta e aceite o não-dito.',
    suggestedFor: ['adulto_feminino', 'adulto_masculino'],
    fields: [
      [
        'ctxSexualidadeQueixa',
        'Queixas sexuais relatadas e desde quando',
        ['sem queixa', 'queda de libido', 'dor na relação', 'dificuldade de excitação', 'alteração erétil', 'alteração ejaculatória', 'anorgasmia', 'evitação da intimidade'],
        [
          'Há alguma queixa em relação à vida sexual hoje?',
          'Desde quando? Começou junto com algum outro sintoma ou medicação?',
          'Acontece em todas as situações ou em algumas?',
        ],
      ],
      [
        'ctxSexualidadeImpacto',
        'O quanto incomoda e como afeta a relação',
        ['não incomoda', 'incomoda muito', 'afeta a relação', 'vergonha de falar', 'parceria sabe', 'parceria não sabe', 'sem parceria atual'],
        [
          'O quanto isso te incomoda, de fato?',
          'Você consegue conversar sobre isso com quem se relaciona?',
          'Como a outra pessoa reage?',
        ],
      ],
      [
        'ctxImagemCorporal',
        'Relação com o corpo e imagem corporal',
        ['satisfeita(o)', 'insatisfação leve', 'insatisfação intensa', 'evita espelho', 'evita fotos', 'evita sair', 'comparação nas redes', 'mudança recente de peso'],
        [
          'Como você se sente em relação ao seu corpo hoje?',
          'Deixa de fazer alguma coisa por causa disso?',
          'Isso mudou em algum momento específico?',
        ],
      ],
      [
        'ctxRecursosCorpoSubstancias',
        'Dietas restritivas, exercício e substâncias usadas para o corpo',
        ['não usa', 'dieta restritiva', 'uso de laxante ou diurético', 'exercício compulsivo', 'anabolizantes', 'termogênicos', 'procedimentos estéticos', 'cirurgia'],
        [
          'Faz ou já fez dieta restritiva, jejum prolongado ou uso de algo para emagrecer/ganhar massa?',
          'Como é sua relação com exercício? O que acontece quando não consegue treinar?',
          'Já usou anabolizante, termogênico ou algo semelhante?',
        ],
      ],
    ],
  },
  {
    id: 'trabalho-provisao-identidade',
    label: 'Trabalho, provisão e identidade',
    summary:
      'Abrir quando trabalho, desemprego ou o papel de provedor aparecerem como fonte de sofrimento, '
      + 'vergonha ou cobrança. Vale para quem sustenta a casa e para quem depende financeiramente de alguém.',
    suggestedFor: ['adulto_feminino', 'adulto_masculino'],
    fields: [
      [
        'ctxTrabalhoSignificado',
        'O que o trabalho representa hoje para a pessoa',
        ['realização', 'apenas sustento', 'fonte de identidade', 'peso', 'vazio', 'orgulho', 'indiferença'],
        [
          'O que o seu trabalho significa para você, além do dinheiro?',
          'Você se reconhece no que faz?',
          'Se perdesse esse trabalho amanhã, o que mudaria em como você se vê?',
        ],
      ],
      [
        'ctxProvisaoSustento',
        'Quem sustenta a casa e como isso é vivido',
        ['sustenta sozinho(a)', 'renda dividida', 'depende financeiramente', 'sustenta outras pessoas', 'renda instável', 'dívidas', 'sem pressão financeira'],
        [
          'Quem paga as contas na sua casa?',
          'Como você se sente nesse arranjo?',
          'Existe cobrança de alguém — ou sua — em torno disso?',
        ],
      ],
      [
        'ctxDesempregoAfastamento',
        'Desemprego, afastamento ou aposentadoria e o que mudou',
        ['não se aplica', 'desempregado(a)', 'afastamento por saúde', 'aposentadoria recente', 'trabalho informal', 'busca ativa', 'desistiu de procurar'],
        [
          'Houve desemprego, afastamento ou aposentadoria recente?',
          'Como foram os primeiros dias e como estão agora?',
          'O que você faz com o tempo que antes era do trabalho?',
        ],
      ],
      [
        'ctxAmbienteRelacoesTrabalho',
        'Ambiente, relações e sobrecarga no trabalho',
        ['bom ambiente', 'sobrecarga', 'assédio moral', 'conflito com chefia', 'isolamento na equipe', 'metas inatingíveis', 'medo de demissão'],
        [
          'Como são as relações no seu trabalho?',
          'Já se sentiu humilhada(o) ou perseguida(o) ali?',
          'Você consegue desligar quando sai?',
        ],
      ],
    ],
  },
  {
    id: 'expressao-emocional-ajuda',
    label: 'Expressão emocional e busca de ajuda',
    summary:
      'Abrir quando o sofrimento parecer aparecer por vias indiretas — irritabilidade, corpo, trabalho '
      + 'excessivo, uso de substâncias — ou quando houver dificuldade em pedir ajuda. Mapeia repertório, '
      + 'não julga estilo.',
    suggestedFor: ['adulto_feminino', 'adulto_masculino'],
    fields: [
      [
        'ctxRepertorioEmocional',
        'Repertório para nomear e falar do que sente',
        ['nomeia bem', 'dificuldade de nomear', 'fala pouco de si', 'só fala quando pressionada(o)', 'chora com facilidade', 'não chora há anos', 'racionaliza'],
        [
          'Você costuma conseguir dizer o que está sentindo?',
          'Com quem você fala dessas coisas?',
          'Como era falar de sentimento na casa onde você cresceu?',
        ],
      ],
      [
        'ctxComoSofrimentoAparece',
        'Como o sofrimento costuma aparecer nesta pessoa',
        ['irritabilidade', 'dores no corpo', 'trabalho em excesso', 'isolamento', 'uso de álcool', 'uso de telas', 'silêncio', 'explosões'],
        [
          'Quando você não está bem, o que os outros percebem primeiro?',
          'O que seu corpo faz nesses períodos?',
          'O que você costuma fazer para não pensar?',
        ],
      ],
      [
        'ctxBuscaAjudaBarreiras',
        'O que dificulta pedir ajuda',
        ['nunca pediu ajuda', 'vergonha', 'medo de julgamento', 'acha que dá conta', 'não quer preocupar', 'experiência ruim anterior', 'falta de tempo', 'custo'],
        [
          'O que te fez demorar a procurar ajuda?',
          'O que você imaginou que iria acontecer aqui?',
          'Já tentou antes? Como foi?',
        ],
      ],
      [
        'ctxModelosCuidadoAprendidos',
        'Modelos de cuidado aprendidos na família',
        ['ninguém falava de sentimento', 'buscar ajuda era fraqueza', 'família acolhedora', 'religião como recurso', 'remédio como única via', 'aprendeu a se virar sozinho(a)'],
        [
          'Na sua família, o que se fazia quando alguém adoecia emocionalmente?',
          'Alguém já fez terapia ou tomou medicação psiquiátrica?',
          'Como isso era comentado em casa?',
        ],
      ],
    ],
  },
  {
    id: 'identidade-genero-orientacao',
    label: 'Identidade de gênero e orientação sexual',
    summary:
      'Abrir quando a pessoa trouxer o tema ou quando houver sofrimento ligado a identidade, orientação, '
      + 'rejeição ou discriminação. NUNCA pré-aberto e nunca deduzido do cadastro: quem informa é a pessoa. '
      + 'Registre com as palavras dela.',
    suggestedFor: [],
    fields: [
      [
        'ctxIdentidadeAutodefinicao',
        'Como a pessoa se identifica e como quer ser chamada',
        ['não investigado', 'nome social', 'pronomes informados', 'cisgênero', 'transgênero', 'não binário', 'prefere não especificar'],
        [
          'Como você se identifica e como prefere ser chamada(o)?',
          'Quais pronomes devo usar com você?',
          'Esse é o nome que consta nos documentos ou é o nome social?',
        ],
      ],
      [
        'ctxOrientacaoVinculos',
        'Orientação sexual e vínculos afetivos, quando pertinente',
        ['não investigado', 'sem queixa', 'em relacionamento', 'sem parceria atual', 'relação não monogâmica', 'em processo de descoberta', 'prefere não especificar'],
        [
          'Como estão seus vínculos afetivos hoje?',
          'Existe algo nessa área que te traga sofrimento?',
          'Você se sente à vontade para falar disso aqui?',
        ],
      ],
      [
        'ctxAceitacaoRedeEstresse',
        'Aceitação na família, no trabalho e na escola',
        ['família acolhe', 'família rejeita', 'não contou à família', 'acolhimento no trabalho', 'discriminação no trabalho', 'discriminação na escola', 'violência sofrida'],
        [
          'Quem na sua vida sabe? Como reagiram?',
          'Você já sofreu discriminação ou violência por isso?',
          'Há lugares onde você precisa se esconder?',
        ],
      ],
      [
        'ctxAfirmacaoCuidados',
        'Processos de afirmação e cuidados em curso',
        ['não se aplica', 'acompanhamento médico', 'hormonioterapia', 'cirurgia realizada', 'cirurgia desejada', 'dificuldade de acesso ao serviço', 'sem acompanhamento'],
        [
          'Há algum processo de afirmação em curso ou desejado?',
          'Você tem acompanhamento de saúde para isso?',
          'Encontra barreiras de acesso a esse cuidado?',
        ],
      ],
    ],
  },
  {
    id: 'puberdade-desenvolvimento-corporal',
    label: 'Puberdade e desenvolvimento corporal (infantil)',
    summary:
      'Abrir conforme idade e pertinência, com linguagem adequada à faixa etária. Pergunte à criança ou '
      + 'adolescente sempre que possível, e registre quem informou. Não presuma etapa a partir da idade.',
    suggestedFor: ['infantojuvenil_feminino', 'infantojuvenil_masculino'],
    // Só pré-abre com idade conhecida e a partir dos 9 anos: sugerir este
    // bloco na ficha de uma criança de 4 seria exatamente o tipo de campo
    // vazio que motivou a troca do modelo por sexo.
    suggestedMinAge: 9,
    fields: [
      [
        'ctxPuberdadeSinais',
        'Sinais de puberdade percebidos e desde quando',
        ['não se aplica à idade', 'não iniciada', 'em curso', 'início precoce percebido', 'início tardio percebido', 'acompanhamento médico', 'não soube informar'],
        [
          'Já começaram mudanças no corpo? Quais e desde quando?',
          'Isso está sendo acompanhado por algum profissional?',
          'A criança/adolescente comenta espontaneamente sobre essas mudanças?',
        ],
      ],
      [
        'ctxInformacaoPreparo',
        'Informação recebida e preparo para as mudanças',
        ['conversou com a família', 'aprendeu na escola', 'buscou na internet', 'nenhuma conversa', 'tem dúvidas', 'demonstra vergonha', 'lida com naturalidade'],
        [
          'Quem conversou com ele(a) sobre essas mudanças?',
          'O que ele(a) já sabe e de onde veio essa informação?',
          'Há dúvidas ou medos que apareceram?',
        ],
      ],
      [
        'ctxImagemCorpoComparacao',
        'Relação com o próprio corpo e comparação com pares',
        ['satisfeito(a)', 'incomodado(a) com o corpo', 'compara-se com colegas', 'evita educação física', 'evita se trocar na escola', 'sofreu comentários', 'sem queixa'],
        [
          'Como ele(a) se sente em relação ao próprio corpo?',
          'Deixa de fazer alguma coisa por causa disso?',
          'Já sofreu comentário ou apelido sobre o corpo?',
        ],
      ],
      [
        'ctxAutonomiaPrivacidadeCorpo',
        'Autonomia, privacidade e cuidados com o corpo',
        ['cuida sozinho(a)', 'necessita lembretes', 'necessita ajuda', 'pede privacidade', 'sem noção de privacidade', 'higiene adequada', 'higiene prejudicada'],
        [
          'Ele(a) cuida sozinho(a) da higiene e do próprio corpo?',
          'Como a família lida com privacidade em casa?',
          'Ele(a) sabe que partes do corpo são só dele(a)?',
        ],
      ],
    ],
  },
  {
    id: 'protecao-seguranca-infantil',
    label: 'Proteção e segurança infantil',
    summary:
      'Rastreio de negligência, violência e exposição — conduzido A SÓS com a criança ou adolescente '
      + 'quando possível, nunca diante de quem possa ser o autor. Suspeita de violência contra criança tem '
      + 'NOTIFICAÇÃO COMPULSÓRIA (ECA): o sistema registra e lembra; a avaliação e a notificação são suas.',
    suggestedFor: ['infantojuvenil_feminino', 'infantojuvenil_masculino'],
    fields: [
      [
        'ctxCuidadoSupervisao',
        'Supervisão, cuidados básicos e quem fica com a criança',
        ['supervisão adequada', 'fica sozinha(o)', 'aos cuidados de irmão', 'rede de cuidado ampla', 'faltas escolares', 'atraso em vacinas ou consultas', 'sem preocupação'],
        [
          'Com quem a criança fica quando os responsáveis trabalham?',
          'Alimentação, sono, higiene e saúde estão sendo cobertos?',
          'Há faltas escolares ou consultas em atraso?',
        ],
      ],
      [
        'ctxSinaisProtecao',
        'Relatos ou sinais que levantam preocupação de proteção',
        ['nada percebido', 'relato espontâneo', 'medo de alguém', 'mudança brusca de comportamento', 'regressão', 'lesões sem explicação', 'comportamento sexualizado', 'castigo físico'],
        [
          'Alguém já machucou, ameaçou ou fez algo que ele(a) não gostou?',
          'Existe alguém de quem a criança tem medo?',
          'Houve mudança brusca de comportamento, sono ou apetite?',
        ],
      ],
      [
        'ctxSegurancaDigital',
        'Segurança digital e exposição online',
        ['uso supervisionado', 'uso sem supervisão', 'contato com desconhecidos', 'jogos online com chat', 'sofreu cyberbullying', 'exposição de imagens', 'sem preocupação'],
        [
          'O que ele(a) faz na internet e com quem conversa?',
          'Alguém que ele(a) não conhece pessoalmente já pediu foto ou encontro?',
          'A família acompanha esse uso? Como?',
        ],
      ],
      [
        'ctxRedeProtecaoEncaminhamento',
        'Rede de proteção acionada e encaminhamentos',
        ['nenhuma ação necessária', 'escola informada', 'conselho tutelar acionado', 'notificação realizada', 'acompanhamento em rede', 'encaminhamento médico', 'reavaliar na próxima sessão'],
        [
          'Quem já sabe e quem precisa saber?',
          'Há situação que exija notificação compulsória?',
          'O que ficou combinado e quando será reavaliado?',
        ],
      ],
    ],
  },
];

export const PSYCHOLOGY_CONTEXT_MODULES = modules.map(module => ({
  ...module,
  fields: module.fields.map(toField),
}));

export const PSYCHOLOGY_CONTEXT_MODULES_INTRO =
  'Blocos abertos por pertinência clínica, não por sexo. O percurso escolhido já sugere alguns; '
  + 'abra ou feche livremente conforme o caso. Fechar um bloco apenas o esconde — o que já foi escrito é preservado.';

export function getPsychologyContextModule(moduleId) {
  return PSYCHOLOGY_CONTEXT_MODULES.find(module => module.id === moduleId) || null;
}

/**
 * Mapa {moduleId: true} com os módulos que o percurso pré-abre. Perfil
 * desconhecido (ou ainda não escolhido) não pré-abre nada.
 *
 * Módulo com `suggestedMinAge` só é pré-aberto com a idade CONHECIDA e
 * dentro da faixa — idade ausente não sugere, para nunca abrir um bloco
 * que talvez não caiba no caso.
 *
 * @param {string} profileId percurso escolhido
 * @param {number} [age] idade do paciente, quando conhecida
 */
export function getSuggestedContextModules(profileId, age) {
  const suggested = {};
  for (const module of PSYCHOLOGY_CONTEXT_MODULES) {
    if (!profileId || !module.suggestedFor.includes(profileId)) continue;
    if (Number.isFinite(module.suggestedMinAge)
      && !(Number.isFinite(age) && age >= module.suggestedMinAge)) continue;
    suggested[module.id] = true;
  }
  return suggested;
}

export function isContextModuleOpen(contextModules, moduleId) {
  return Boolean(contextModules?.[moduleId]);
}

export function getAllPsychologyContextFields() {
  return PSYCHOLOGY_CONTEXT_MODULES.flatMap(module => module.fields);
}

// Campos dos módulos ABERTOS — é o que conta como ficha ativa (resumo,
// relatório e IA). Módulo fechado não entra, mesmo que tenha conteúdo antigo.
export function getOpenPsychologyContextFields(contextModules) {
  return PSYCHOLOGY_CONTEXT_MODULES
    .filter(module => isContextModuleOpen(contextModules, module.id))
    .flatMap(module => module.fields);
}

export function getOpenPsychologyContextModules(contextModules) {
  return PSYCHOLOGY_CONTEXT_MODULES
    .filter(module => isContextModuleOpen(contextModules, module.id));
}
