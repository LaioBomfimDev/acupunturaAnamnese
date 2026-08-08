// ============================================================
// DADOS: Anamnese de Nutrição — RASCUNHO A VALIDAR
//
// Segue o contrato genérico (data/anamneseKit.js) e o desenho fechado
// com o dono do produto em 07/08/2026: percursos por OBJETIVO do
// acompanhamento e contexto por PERTINÊNCIA.
//
// Raciocínio organizado nos domínios que a nutrição usa para fechar
// diagnóstico nutricional: consumo, antropometria, bioquímico/clínico,
// comportamento e contexto — vocabulário compatível com o processo de
// cuidado nutricional, sem prescrever conduta automática.
//
// Duas escolhas de conteúdo que valem explicitar:
//  * INSEGURANÇA ALIMENTAR é bloco de risco, não curiosidade social:
//    prescrever plano que a pessoa não tem como comprar é iatrogenia;
//  * TRANSTORNO ALIMENTAR entra com triagem própria, porque conduta de
//    emagrecimento sobre quadro não reconhecido agrava o quadro.
//
// TUDO aqui é proposta conservadora: a nutricionista é a autoridade e
// vai cortar/trocar/reescrever. Até lá o workspace exibe o rascunho.
// ============================================================

import { toAxis, toContextModule, toField, toRiskItem, toSection } from './anamneseKit.js';

export const NUTRI_CONTENT_STATUS = 'rascunho_a_validar';
export const NUTRI_RECORD_TYPE = 'nutri_anamnese';

export const NUTRI_DRAFT_NOTICE =
  'Conteúdo provisório formulado a partir da literatura de avaliação nutricional (processo de cuidado '
  + 'nutricional, triagem de risco e de comportamento alimentar) e ainda não validado por nutricionista. '
  + 'O registro já vale como anotação clínica, mas os campos e os eixos podem mudar na revisão.';

// ---- Escuta livre (comum a todos os percursos) --------------------
const textFields = [
  [
    'queixaObjetivo',
    'Queixa e objetivo com o acompanhamento (nas palavras da pessoa)',
    ['emagrecer', 'ganhar peso', 'ganhar massa', 'melhorar exames', 'melhorar digestão', 'ter mais energia', 'organizar a rotina', 'orientação para condição de saúde'],
    [
      'O que te trouxe até aqui?',
      'O que você espera que mude com o acompanhamento?',
      'Como seria um bom resultado para você em três meses?',
    ],
  ],
  [
    'historiaPeso',
    'História do peso: variações, marcos e tentativas anteriores',
    ['peso estável', 'ganho progressivo', 'perda recente', 'oscila muito', 'ganhou após gestação', 'ganhou após medicação', 'já fez muitas dietas', 'efeito sanfona'],
    [
      'Como seu peso variou ao longo da vida?',
      'Houve algum momento em que mudou bastante? O que acontecia então?',
      'O que já tentou antes e como foi?',
    ],
  ],
  [
    'rotinaAlimentar',
    'Rotina alimentar: horários, onde come, quem cozinha',
    ['come em casa', 'come fora', 'marmita', 'pula café da manhã', 'janta tarde', 'come na frente da tela', 'horários irregulares', 'trabalho em turnos'],
    [
      'Como é um dia comum de alimentação para você?',
      'Quem cozinha e quem decide o que entra em casa?',
      'Onde você faz a maior parte das refeições?',
    ],
  ],
  [
    'recordatorioHabitual',
    'Recordatório habitual (24h) com horários e porções',
    ['café da manhã', 'lanche da manhã', 'almoço', 'lanche da tarde', 'jantar', 'ceia', 'belisca entre refeições', 'não lembra'],
    [
      'Me conte tudo o que comeu e bebeu ontem, do acordar ao dormir.',
      'Esse dia foi típico? O que costuma ser diferente?',
      'E nos fins de semana, muda?',
    ],
  ],
  [
    'sintomasDigestivos',
    'Sintomas digestivos e como se relacionam com o que come',
    ['sem sintomas', 'azia', 'distensão', 'gases', 'náusea', 'constipação', 'diarreia', 'piora com algum alimento'],
    [
      'Sente algum desconforto depois de comer?',
      'Consegue relacionar com algum alimento ou horário?',
      'Como está o funcionamento do intestino?',
    ],
  ],
  [
    'contextoRotinaSono',
    'Contexto de vida: trabalho, sono, estresse e atividade',
    ['rotina previsível', 'rotina imprevisível', 'trabalho noturno', 'sono insuficiente', 'estresse elevado', 'sedentário', 'ativa(o)', 'mora sozinho(a)'],
    [
      'Como é sua rotina de trabalho e sono?',
      'Em períodos de estresse, o que muda na sua alimentação?',
      'Você se movimenta ao longo do dia?',
    ],
  ],
].map(toField);

// ---- Percursos por objetivo --------------------------------------
const clinica = [
  {
    id: 'nc-clinico',
    title: 'Condições clínicas, exames e medicações',
    fields: [
      ['ncCondicoesClinicas', 'Condições de saúde em acompanhamento',
        ['nenhuma', 'hipertensão', 'diabetes', 'dislipidemia', 'hipotireoidismo', 'esteatose hepática', 'doença renal', 'doença inflamatória intestinal'],
        ['Tem alguma condição de saúde diagnosticada?', 'Desde quando e com quem acompanha?', 'Alguma delas já motivou orientação alimentar antes?']],
      ['ncExamesBioquimicos', 'Exames bioquímicos recentes e alterações',
        ['sem exames recentes', 'glicemia', 'hemoglobina glicada', 'perfil lipídico', 'TSH', 'ferritina', 'vitamina D', 'função renal'],
        ['Trouxe exames? De quando são?', 'Que valores vieram alterados?', 'Algum profissional já comentou esses resultados com você?']],
      ['ncMedicacoesSuplementos', 'Medicações e suplementos em uso',
        ['não usa', 'uso contínuo', 'anti-hipertensivo', 'metformina', 'levotiroxina', 'estatina', 'polivitamínico', 'suplemento por conta própria'],
        ['Que medicações usa e em que horários?', 'Toma algum suplemento? Quem indicou?', 'Alguma delas atrapalha ou muda o apetite?']],
    ],
  },
  {
    id: 'nc-antropo',
    title: 'Antropometria e composição corporal',
    fields: [
      ['ncAntropometria', 'Peso, altura, circunferências e histórico de medidas',
        ['peso atual', 'altura', 'IMC calculado', 'circunferência da cintura', 'circunferência do quadril', 'peso habitual', 'peso desejado', 'não quis se pesar'],
        ['Registre as medidas aferidas hoje e a data.', 'Qual o peso habitual e o peso máximo já atingido?', 'Se a pessoa não quis se pesar, registre e respeite.']],
      ['ncComposicaoCorporal', 'Composição corporal e método usado',
        ['não avaliada', 'bioimpedância', 'dobras cutâneas', 'estimativa clínica', 'massa magra preservada', 'perda de massa magra', 'retenção percebida'],
        ['Que método foi usado e em que condições?', 'Há comparação com avaliação anterior?', 'O resultado é coerente com o exame clínico?']],
      ['ncAtividadeGasto', 'Atividade física e gasto energético estimado',
        ['sedentário', 'caminhada leve', 'atividade moderada', 'atividade intensa', 'trabalho fisicamente exigente', 'trabalho sentado', 'poucos passos ao dia'],
        ['Que atividade física você faz e com que frequência?', 'Seu trabalho exige esforço físico?', 'Quanto você se movimenta fora do treino?']],
    ],
  },
  {
    id: 'nc-comportamento',
    title: 'Apetite, saciedade e comportamento alimentar',
    fields: [
      ['ncApetiteSaciedade', 'Apetite, saciedade e fome ao longo do dia',
        ['apetite preservado', 'fome constante', 'pouca fome', 'saciedade precoce', 'não percebe saciedade', 'fome noturna', 'fome emocional'],
        ['Você sente fome nos horários das refeições?', 'Percebe quando está satisfeita(o)?', 'Em que momento do dia a fome aperta mais?']],
      ['ncGatilhosCompulsao', 'Gatilhos, beliscos e episódios de compulsão',
        ['sem episódios', 'belisca à tarde', 'belisca à noite', 'come por ansiedade', 'come por tédio', 'episódios de exagero', 'come escondido', 'sensação de perda de controle'],
        ['Existem momentos em que come mais do que gostaria?', 'O que costuma disparar isso?', 'Como você se sente depois?']],
      ['ncPreferenciasAversoes', 'Preferências, aversões e alimentos evitados',
        ['come de tudo', 'não come verdura', 'não come carne', 'evita carboidrato', 'evita gordura', 'aversão a alimento específico', 'seletividade importante'],
        ['O que você gosta e o que não come de jeito nenhum?', 'Evita algum grupo de alimentos? Por quê?', 'Essa restrição foi orientada por alguém?']],
    ],
  },
  {
    id: 'nc-viabilidade',
    title: 'Viabilidade do plano e pactuação',
    fields: [
      ['ncQuemCozinhaCompras', 'Quem cozinha, quem faz as compras e o que entra em casa',
        ['cozinha sozinha(o)', 'outra pessoa cozinha', 'divide o preparo', 'compra pronto', 'delivery frequente', 'feira semanal', 'compra mensal'],
        ['Quem decide e prepara a comida na sua casa?', 'Com que frequência vocês compram alimentos frescos?', 'Quanto tempo você tem para cozinhar?']],
      ['ncEstruturaPreparo', 'Estrutura disponível para preparo e armazenamento',
        ['fogão', 'geladeira', 'freezer', 'micro-ondas', 'sem estrutura de preparo', 'sem local para refeição', 'cozinha compartilhada'],
        ['Você tem onde preparar e guardar comida?', 'Consegue levar refeição para o trabalho?', 'Há geladeira e local para comer no trabalho?']],
      ['ncPactuacaoDisponibilidade', 'O que a pessoa topa mudar agora',
        ['topa mudanças amplas', 'prefere mudanças pequenas', 'não quer contar calorias', 'quer plano detalhado', 'quer flexibilidade', 'já tentou e desistiu', 'pouco tempo disponível'],
        ['Que tipo de orientação funciona melhor para você: plano fechado ou ajustes?', 'O que você NÃO está disposta(o) a mudar agora?', 'Quantas mudanças por vez são realistas?']],
    ],
  },
].map(toSection);

const maternoInfantil = [
  {
    id: 'mi-fase',
    title: 'Fase atual e acompanhamento',
    fields: [
      ['miFaseAtual', 'Fase do ciclo: gestação, lactação ou infância',
        ['gestação', 'lactação', 'lactente', 'primeira infância', 'idade escolar', 'adolescência', 'tentante'],
        ['Em que fase estamos: gestação, amamentação ou acompanhamento da criança?', 'Idade gestacional ou idade da criança?', 'Quem responde a anamnese hoje?']],
      ['miAcompanhamentoSaude', 'Pré-natal ou puericultura em curso',
        ['pré-natal regular', 'pré-natal irregular', 'puericultura em dia', 'consultas atrasadas', 'gestação de risco', 'acompanhamento em UBS', 'acompanhamento particular'],
        ['O acompanhamento de saúde está em dia?', 'Houve classificação de risco?', 'Que orientações já foram dadas por outro profissional?']],
      ['miIntercorrencias', 'Intercorrências relevantes desta fase',
        ['sem intercorrências', 'anemia', 'diabetes gestacional', 'hipertensão gestacional', 'prematuridade', 'baixo peso ao nascer', 'internação', 'alergia alimentar'],
        ['Houve alguma intercorrência nesta gestação ou no nascimento?', 'A criança teve internação ou alergia diagnosticada?', 'Isso mudou a alimentação de alguma forma?']],
    ],
  },
  {
    id: 'mi-gestacao-lactacao',
    title: 'Gestação e lactação',
    fields: [
      ['miGanhoPeso', 'Ganho de peso gestacional e peso pré-gestacional',
        ['não se aplica', 'ganho adequado', 'ganho acima do esperado', 'ganho abaixo do esperado', 'peso pré-gestacional informado', 'não soube informar'],
        ['Qual era o peso antes de engravidar?', 'Quanto ganhou até agora?', 'Houve orientação sobre a meta de ganho?']],
      ['miSintomasGestacionais', 'Sintomas que afetam a alimentação',
        ['não se aplica', 'náusea', 'vômito', 'azia', 'constipação', 'aversões alimentares', 'desejos específicos', 'sem sintomas'],
        ['Algum sintoma está atrapalhando comer?', 'Em que horário é pior?', 'O que você consegue comer nesses momentos?']],
      ['miLactacaoAmamentacao', 'Amamentação: prática, dificuldades e apoio',
        ['não se aplica', 'aleitamento exclusivo', 'aleitamento misto', 'fórmula', 'dor ao amamentar', 'baixa produção percebida', 'já desmamou', 'sem apoio'],
        ['Como está a amamentação?', 'Há dor, ferida ou percepção de leite insuficiente?', 'Quem te apoia nisso?']],
    ],
  },
  {
    id: 'mi-alimentacao-infantil',
    title: 'Alimentação da criança',
    fields: [
      ['miIntroducaoAlimentar', 'Introdução alimentar: quando e como foi',
        ['não se aplica', 'aos 6 meses', 'antes dos 6 meses', 'após 6 meses', 'papinha', 'comida da família', 'método participativo', 'processo difícil'],
        ['Quando começou a comer outros alimentos e como foi conduzido?', 'Quem oferece a comida no dia a dia?', 'Como foi a aceitação no começo?']],
      ['miAceitacaoSeletividade', 'Aceitação, seletividade e recusa',
        ['come de tudo', 'recusa verduras', 'recusa carnes', 'come poucos alimentos', 'seletividade importante', 'recusa por textura', 'recusa por cor', 'come melhor na escola'],
        ['Quantos alimentos diferentes ela(e) aceita hoje?', 'A recusa é por sabor, textura ou aparência?', 'Come diferente na escola ou com outras pessoas?']],
      ['miLeiteFormulaBebidas', 'Leite, fórmula e outras bebidas',
        ['leite materno', 'fórmula infantil', 'leite de vaca', 'bebida vegetal', 'suco industrializado', 'refrigerante', 'só água', 'mamadeira à noite'],
        ['O que bebe ao longo do dia e em que quantidade?', 'Usa mamadeira? Em que momentos?', 'Bebe água ao longo do dia?']],
    ],
  },
  {
    id: 'mi-crescimento',
    title: 'Crescimento, desenvolvimento e exames',
    fields: [
      ['miCurvasCrescimento', 'Curvas de crescimento e evolução',
        ['não se aplica', 'curva adequada', 'curva ascendente', 'curva descendente', 'baixo peso', 'excesso de peso', 'estatura abaixo do esperado', 'caderneta em dia'],
        ['Trouxe a caderneta de saúde? O que mostram as curvas?', 'Houve mudança de canal de crescimento?', 'Como foi a evolução nos últimos meses?']],
      ['miMarcosAlimentares', 'Marcos alimentares e autonomia à mesa',
        ['não se aplica', 'come sozinha(o)', 'precisa de ajuda', 'mastiga bem', 'engasga com frequência', 'ainda amassa a comida', 'usa talher'],
        ['A criança come sozinha ou precisa de ajuda?', 'Mastiga bem? Já engasgou?', 'Consegue ficar sentada durante a refeição?']],
      ['miExamesPediatricos', 'Exames e suplementações pediátricas',
        ['sem exames', 'hemograma', 'ferritina', 'vitamina D', 'suplementa ferro', 'suplementa vitamina D', 'sem suplementação', 'orientação médica em curso'],
        ['Há exames recentes?', 'Faz alguma suplementação orientada?', 'Quem prescreveu e há quanto tempo?']],
    ],
  },
  {
    id: 'mi-ambiente',
    title: 'Ambiente e rotina alimentar da família',
    fields: [
      ['miRotinaFamiliarRefeicoes', 'Rotina e refeições em família',
        ['refeições em família', 'cada um come num horário', 'come na frente da tela', 'refeição em pé', 'horários irregulares', 'mesa sem disputa', 'refeição tensa'],
        ['A família come junto? Em que refeições?', 'Como é o clima na hora da comida?', 'A TV ou o celular ficam ligados?']],
      ['miTelasComportamento', 'Telas, distração e estratégias usadas para a criança comer',
        ['sem telas', 'come com tela', 'come brincando', 'é alimentada(o) para comer', 'usa recompensa', 'usa castigo', 'pressão para comer'],
        ['O que a família faz quando a criança não quer comer?', 'Usa vídeo, brinquedo, recompensa ou insistência?', 'O que já funcionou e o que piorou?']],
      ['miInfluenciaCuidadores', 'Outros cuidadores e coerência de orientação',
        ['orientação coerente', 'avós oferecem doces', 'escola oferece diferente', 'divergência entre responsáveis', 'cuidador contratado', 'come em duas casas'],
        ['Quem mais oferece comida para a criança?', 'As regras são parecidas nos diferentes lugares?', 'Há divergência entre os responsáveis?']],
    ],
  },
].map(toSection);

const esportiva = [
  {
    id: 'ne-treino',
    title: 'Modalidade, volume e objetivo',
    fields: [
      ['neModalidadeVolume', 'Modalidade, frequência e volume de treino',
        ['musculação', 'corrida', 'ciclismo', 'esporte coletivo', 'luta', 'crossfit', 'treina 3-4x/semana', 'treina 6x ou mais'],
        ['Que modalidade pratica e há quanto tempo?', 'Quantas sessões por semana e quanto tempo cada uma?', 'Treina em jejum ou alimentada(o)?']],
      ['nePeriodizacaoObjetivo', 'Fase de treino e objetivo atual',
        ['base', 'hipertrofia', 'força', 'resistência', 'pré-competição', 'transição', 'recuperação de lesão', 'sem periodização'],
        ['Em que fase do treino você está?', 'Qual o objetivo desta fase?', 'Há treinador orientando a periodização?']],
      ['neCompeticoes', 'Competições, categorias e controle de peso',
        ['não compete', 'compete amador', 'compete profissional', 'categoria por peso', 'corte de peso', 'competição próxima', 'sem prazo definido'],
        ['Tem competição marcada? Quando?', 'A modalidade tem categoria por peso?', 'Já fez corte de peso? Como foi?']],
    ],
  },
  {
    id: 'ne-alimentacao-treino',
    title: 'Alimentação em torno do treino',
    fields: [
      ['neRefeicaoPreTreino', 'Alimentação antes do treino',
        ['treina em jejum', 'lanche leve', 'refeição completa', 'só café', 'sem tempo de comer', 'desconforto se come antes', 'varia muito'],
        ['O que você come antes de treinar e quanto tempo antes?', 'Sente desconforto se comer antes?', 'Isso muda conforme o horário do treino?']],
      ['neDuranteTreino', 'Consumo durante o treino e hidratação',
        ['só água', 'bebida esportiva', 'gel de carboidrato', 'nada durante', 'não sente sede', 'sua muito', 'câimbras frequentes'],
        ['O que consome durante o treino?', 'Quanto de líquido em uma sessão?', 'Costuma ter câimbra ou tontura no treino?']],
      ['nePosTreino', 'Alimentação após o treino e recuperação',
        ['come logo depois', 'demora a comer', 'só suplemento', 'refeição completa', 'sem apetite após treinar', 'treina tarde e janta tarde'],
        ['O que você come depois do treino e em quanto tempo?', 'Sente apetite logo após?', 'Como está a recuperação entre as sessões?']],
    ],
  },
  {
    id: 'ne-suplementos',
    title: 'Suplementos e recursos ergogênicos',
    fields: [
      ['neSuplementosUso', 'Suplementos em uso, dose e horário',
        ['não usa', 'whey protein', 'creatina', 'cafeína', 'beta-alanina', 'polivitamínico', 'ômega 3', 'proteína vegetal'],
        ['Que suplementos usa, em que dose e horário?', 'Há quanto tempo?', 'Percebeu efeito?']],
      ['neQuemOrientou', 'Quem orientou e com que critério',
        ['nutricionista', 'médico', 'treinador', 'indicação de amigo', 'vídeo na internet', 'por conta própria', 'loja de suplementos'],
        ['Quem indicou cada um deles?', 'Houve exame ou avaliação antes?', 'Você sabe para que serve cada um?']],
      ['neRecursosRiscos', 'Recursos ergogênicos, hormonais e substâncias',
        ['não usa', 'termogênico', 'pré-treino estimulante', 'anabolizante atual', 'anabolizante prévio', 'hormônio prescrito', 'diurético', 'prefere não informar'],
        ['Usa ou já usou algum recurso hormonal ou termogênico?', 'Houve acompanhamento médico?', 'Percebeu efeito adverso? Registre sem julgamento.']],
    ],
  },
  {
    id: 'ne-disponibilidade',
    title: 'Disponibilidade energética e sinais de alerta',
    fields: [
      ['neDisponibilidadeEnergetica', 'Ingestão frente à demanda de treino',
        ['ingestão compatível', 'ingestão abaixo do gasto', 'restringe para emagrecer', 'não consegue comer o suficiente', 'come pouco em dia de treino', 'sem noção da quantidade'],
        ['Você sente que come o suficiente para o volume que treina?', 'Restringe alimentos para reduzir peso ou percentual?', 'Já foi orientada(o) a comer menos para performar?']],
      ['neSinaisAlertaDesempenho', 'Sinais de baixa disponibilidade energética',
        ['sem sinais', 'fadiga persistente', 'queda de desempenho', 'lesões repetidas', 'fraturas por estresse', 'alteração menstrual', 'infecções frequentes', 'irritabilidade'],
        ['O desempenho caiu sem explicação de treino?', 'Tem se lesionado com frequência?', 'Houve alteração ou ausência de menstruação?']],
      ['neHidratacaoSudorese', 'Hidratação, sudorese e ambiente de treino',
        ['hidratação adequada', 'bebe pouco', 'sua muito', 'treina no calor', 'treina em ambiente fechado', 'urina escura', 'perde peso na sessão'],
        ['Quanto você bebe num dia de treino?', 'Costuma se pesar antes e depois?', 'Treina em ambiente quente?']],
    ],
  },
].map(toSection);

// ---- Checklists (vocabulário fechado) -----------------------------
export const nutriChecklists = {
  nutriHabitos: [
    'Pula refeições', 'Come muito rápido', 'Belisca entre refeições',
    'Come na frente de telas', 'Come fora com frequência', 'Delivery frequente',
    'Ultraprocessados diários', 'Cozinha em casa', 'Leva marmita', 'Repete o prato',
  ],
  nutriGastro: [
    'Refluxo / azia', 'Distensão abdominal', 'Gases', 'Náusea',
    'Saciedade precoce', 'Constipação', 'Diarreia', 'Alternância intestinal',
    'Dor abdominal', 'Intolerância percebida',
  ],
  nutriApetite: [
    'Fome aumentada', 'Fome reduzida', 'Não percebe saciedade',
    'Compulsão alimentar', 'Beliscar noturno', 'Fome emocional',
    'Desejo por doce', 'Desejo por salgado', 'Come escondido',
  ],
  nutriBebidas: [
    'Baixa ingestão de água', 'Refrigerante', 'Suco industrializado',
    'Álcool', 'Café em excesso', 'Energéticos', 'Adoçante',
    'Bebida esportiva', 'Chá sem açúcar',
  ],
  nutriRestricoes: [
    'Alergia alimentar', 'Intolerância à lactose', 'Doença celíaca',
    'Vegetariano', 'Vegano', 'Restrição religiosa', 'Restrição por crença',
    'Seletividade alimentar', 'Restrição prescrita', 'Restrição por conta própria',
  ],
  nutriSintomasSistemicos: [
    'Fadiga', 'Queda de cabelo', 'Unhas quebradiças', 'Câimbras',
    'Tontura', 'Pele seca', 'Cicatrização lenta', 'Alteração menstrual',
    'Sensação de frio', 'Sonolência após refeições',
  ],
  nutriAtividadeSono: [
    'Sedentário', 'Atividade leve', 'Atividade moderada', 'Atividade intensa',
    'Sono adequado', 'Sono insuficiente', 'Trabalho noturno',
    'Rotina irregular', 'Come de madrugada',
  ],
  nutriRelacaoComida: [
    'Relação tranquila', 'Culpa ao comer', 'Classifica alimentos em certo/errado',
    'Medo de engordar', 'Conta calorias o tempo todo', 'Pesa-se todo dia',
    'Já fez dieta muito restritiva', 'Compensa depois de comer',
  ],
};

export const NUTRI_CHECKLIST_SECTIONS = [
  { group: 'nutriHabitos', title: 'Hábitos e rotina alimentar', items: nutriChecklists.nutriHabitos },
  { group: 'nutriApetite', title: 'Apetite, saciedade e comportamento', items: nutriChecklists.nutriApetite },
  { group: 'nutriGastro', title: 'Sintomas gastrointestinais', items: nutriChecklists.nutriGastro },
  { group: 'nutriBebidas', title: 'Bebidas e hidratação', items: nutriChecklists.nutriBebidas },
  { group: 'nutriRestricoes', title: 'Restrições, alergias e escolhas', items: nutriChecklists.nutriRestricoes },
  { group: 'nutriSintomasSistemicos', title: 'Sinais sistêmicos e carenciais', items: nutriChecklists.nutriSintomasSistemicos },
  { group: 'nutriAtividadeSono', title: 'Atividade, sono e rotina', items: nutriChecklists.nutriAtividadeSono },
  { group: 'nutriRelacaoComida', title: 'Relação com a comida', items: nutriChecklists.nutriRelacaoComida },
];

// ---- Bloco de risco ------------------------------------------------
export const NUTRI_RISK_GROUP = 'nutriRisco';

export const NUTRI_RISK_ITEMS = [
  {
    id: 'nutri-risk-transtorno-alimentar',
    label: 'Sinais de transtorno alimentar',
    priority: 'critica',
    summary:
      'Conduta de emagrecimento sobre quadro não reconhecido agrava o quadro. Triar antes de prescrever '
      + 'qualquer restrição.',
    screening: [
      'Você já provocou vômito ou usou laxante/diurético para controlar o peso?',
      'Sente que perde o controle sobre o quanto come?',
      'O peso ou a forma do corpo influenciam muito como você se sente sobre si mesma(o)?',
      'Perdeu peso de forma importante nos últimos meses?',
    ],
    observe: [
      'Restrição alimentar rígida com regras de "certo e errado"',
      'Compensação após comer (vômito, laxante, exercício excessivo, jejum)',
      'Pesagem diária, checagem corporal ou evitação de espelho',
      'Isolamento em refeições sociais, comer escondido, culpa intensa',
    ],
    reminder:
      'Não prescrever restrição. Considerar encaminhamento para psicologia e psiquiatria e conduzir em equipe.',
  },
  {
    id: 'nutri-risk-perda-peso',
    label: 'Perda de peso não intencional',
    priority: 'alta',
    summary: 'Emagrecer sem querer é sinal de investigação clínica, não resultado a comemorar.',
    screening: [
      'Perdeu peso sem estar tentando?',
      'Quanto, em quanto tempo?',
      'Veio acompanhado de febre, dor, sangramento ou mudança do hábito intestinal?',
    ],
    observe: [
      'Perda superior a 5% do peso em 6 meses sem intenção',
      'Roupas visivelmente largas, perda de massa magra',
      'Sintomas sistêmicos associados',
    ],
    reminder: 'Encaminhar para investigação médica em paralelo à conduta nutricional.',
  },
  {
    id: 'nutri-risk-inseguranca-alimentar',
    label: 'Insegurança alimentar',
    priority: 'alta',
    summary:
      'Prescrever plano que a pessoa não tem como comprar é iatrogenia e produz culpa. Perguntar muda o plano, '
      + 'não a pessoa.',
    screening: [
      'Nos últimos meses, a comida chegou a acabar antes de ter dinheiro para comprar mais?',
      'Já precisou diminuir a quantidade ou pular refeição por falta de recurso?',
      'Alguma criança da casa deixou de comer o suficiente?',
    ],
    observe: [
      'Compra concentrada em alimentos baratos e de alta densidade energética',
      'Refeições puladas em determinados dias do mês',
      'Ausência de geladeira, fogão ou local de preparo',
      'Dependência de doação, cesta básica ou refeição comunitária',
    ],
    reminder:
      'Adequar a orientação ao que existe em casa e no orçamento. Considerar encaminhamento à assistência social.',
  },
  {
    id: 'nutri-risk-desnutricao',
    label: 'Risco nutricional ou desnutrição',
    priority: 'alta',
    summary: 'Idoso, criança em queda de curva e pós-internação exigem conduta de recuperação, não de restrição.',
    screening: [
      'Tem comido menos que o habitual nas últimas semanas?',
      'Houve internação, cirurgia ou doença recente?',
      'Sente fraqueza para atividades que antes fazia?',
    ],
    observe: [
      'Redução de ingestão sustentada, perda de força e de massa muscular',
      'Criança com queda de canal de crescimento',
      'Idoso com sarcopenia, dificuldade de mastigação ou deglutição',
      'Cicatrização lenta, infecções de repetição',
    ],
    reminder: 'Priorizar recuperação nutricional e acionar equipe. Restrição aqui é contraindicada.',
  },
  {
    id: 'nutri-risk-condicao-descompensada',
    label: 'Condição clínica descompensada ou interação medicamentosa',
    priority: 'alta',
    summary: 'Diabetes descompensada, doença renal e anticoagulação mudam o plano e o que não pode ser prescrito.',
    screening: [
      'Tem alguma condição fora de controle no momento?',
      'Já teve episódio de hipoglicemia ou de pressão muito alterada?',
      'Usa anticoagulante, diurético ou medicação que exija cuidado com a dieta?',
    ],
    observe: [
      'Glicemia ou pressão descompensadas, doença renal em estágio avançado',
      'Uso de anticoagulante (atenção a vitamina K) ou de medicação com interação relevante',
      'Disfagia, vômitos recorrentes ou sangramento digestivo',
    ],
    reminder:
      'Alinhar com o profissional que acompanha antes de mudar a dieta. Registrar a interação identificada.',
  },
].map(toRiskItem);

export const NUTRI_RISK_REMINDER =
  'Sinal de risco marcado: reavalie a conduta antes de prescrever e considere encaminhamento ou trabalho '
  + 'em equipe, conforme seu julgamento clínico. O sistema destaca e lembra — a decisão é sempre sua.';

// ---- Eixos: diagnóstico nutricional -------------------------------
export const NUTRI_AXES = [
  {
    id: 'axis-0',
    label: 'Consumo e padrão alimentar',
    summary: 'O que come, quanto, quando e com que qualidade — comparado à necessidade estimada.',
    explore: [
      'O padrão descrito é compatível com a demanda desta pessoa?',
      'Que grupos estão em falta ou em excesso?',
      'O recordatório representa a rotina ou foi um dia atípico?',
    ],
  },
  {
    id: 'axis-1',
    label: 'Antropometria e composição',
    summary: 'Medidas aferidas, evolução e o que elas dizem — e o que não dizem — sobre o caso.',
    explore: [
      'A medida atual muda a conduta ou só descreve?',
      'Há evolução comparável com avaliação anterior?',
      'O número está sendo interpretado junto do clínico, e não isolado?',
    ],
  },
  {
    id: 'axis-2',
    label: 'Bioquímico e clínico',
    summary: 'Exames, sinais e condições de saúde que restringem ou direcionam a conduta.',
    explore: [
      'Que alteração bioquímica tem impacto nutricional direto?',
      'Há condição clínica que contraindique alguma conduta?',
      'Que interação fármaco-nutriente precisa ser considerada?',
    ],
  },
  {
    id: 'axis-3',
    label: 'Comportamento e relação com a comida',
    summary: 'Gatilhos, culpa, restrição, compulsão e história de dietas — o que sustenta o padrão atual.',
    explore: [
      'O que mantém o padrão alimentar de hoje?',
      'Há sinal de relação sofrida com a comida que contraindique restrição?',
      'A pessoa consegue perceber fome e saciedade?',
    ],
  },
  {
    id: 'axis-4',
    label: 'Contexto, acesso e cultura alimentar',
    summary: 'Orçamento, estrutura, tempo, quem cozinha, cultura e crenças — o que torna um plano viável.',
    explore: [
      'O que existe de fato na casa e no orçamento desta pessoa?',
      'Que alimento tem valor cultural ou afetivo e não deve ser tratado como erro?',
      'Quem mais precisa concordar para o plano funcionar?',
    ],
  },
  {
    id: 'axis-5',
    label: 'Diagnóstico nutricional (hipótese)',
    summary: 'Síntese que liga achado, causa provável e sinal que o sustenta. Descritiva e revisável.',
    explore: [
      'Qual o diagnóstico nutricional, sua causa provável e a evidência que o sustenta?',
      'Que dado confirmaria e qual derrubaria essa leitura?',
      'O que precisa ficar em aberto até a próxima consulta?',
    ],
  },
  {
    id: 'axis-6',
    label: 'Metas pactuadas e reavaliação',
    summary: 'O que foi combinado com a pessoa, em que prazo e o que será medido no retorno.',
    explore: [
      'Que metas foram pactuadas — e a pessoa concordou de fato?',
      'Que indicador será reavaliado, além do peso?',
      'Quando é o retorno e o que muda a conduta?',
    ],
  },
].map(toAxis);

export const NUTRI_AXES_INTRO =
  'Andaime de raciocínio nutricional: consumo, antropometria, clínica, comportamento e contexto convergem '
  + 'para o diagnóstico nutricional e as metas. Descritivo e provisório — orienta a conduta, não a automatiza.';

// ---- Módulos de contexto (por pertinência) ------------------------
const contextModules = [
  {
    id: 'acesso-orcamento-alimentar',
    label: 'Acesso, orçamento e estrutura',
    summary:
      'Abrir sempre que houver dúvida sobre a viabilidade do plano. Plano que não cabe no orçamento nem na '
      + 'estrutura da casa não é adesão baixa — é prescrição inadequada.',
    suggestedFor: ['nutri_clinica', 'nutri_materno_infantil'],
    fields: [
      ['ctxOrcamentoAlimentar', 'Orçamento disponível para alimentação',
        ['sem restrição', 'orçamento apertado', 'compra por prioridade', 'recebe auxílio', 'renda variável', 'divide despesas', 'prefere não informar'],
        ['Como funciona o orçamento de comida na sua casa?', 'Há semanas do mês mais difíceis que outras?', 'O que costuma sair da lista quando aperta?']],
      ['ctxAcessoAlimentos', 'Acesso e local de compra',
        ['supermercado', 'feira', 'mercadinho do bairro', 'produtor local', 'cesta básica', 'doação', 'compra online', 'acesso difícil'],
        ['Onde vocês compram comida?', 'Fica longe? Como transporta?', 'Consegue encontrar alimentos frescos com facilidade?']],
      ['ctxEstruturaCasa', 'Estrutura de preparo e armazenamento',
        ['fogão', 'geladeira', 'freezer', 'micro-ondas', 'sem geladeira', 'sem fogão', 'cozinha compartilhada', 'sem local de preparo'],
        ['Você tem geladeira e fogão funcionando?', 'Dá para guardar comida pronta?', 'Divide a cozinha com outras pessoas?']],
      ['ctxTempoPreparo', 'Tempo e disposição para preparar comida',
        ['cozinha diariamente', 'cozinha no fim de semana', 'sem tempo', 'outra pessoa cozinha', 'não sabe cozinhar', 'não gosta de cozinhar', 'topa aprender'],
        ['Quanto tempo por dia sobra para cozinhar?', 'Quem cozinha na prática?', 'Você se sente à vontade na cozinha?']],
    ],
  },
  {
    id: 'relacao-comida-imagem',
    label: 'Relação com a comida e imagem corporal',
    summary:
      'Abrir quando houver culpa, restrição rígida, história longa de dietas ou sofrimento com o corpo. '
      + 'Antes de prescrever restrição, entender o que já foi feito com o corpo desta pessoa.',
    suggestedFor: ['nutri_clinica'],
    fields: [
      ['ctxHistoriaDietas', 'História de dietas e restrições anteriores',
        ['nunca fez dieta', 'muitas dietas', 'dieta muito restritiva', 'jejum prolongado', 'uso de medicação para emagrecer', 'efeito sanfona', 'acompanhamento anterior'],
        ['Quantas vezes já tentou mudar o peso e como?', 'Qual foi a mais restritiva que já fez?', 'O que acontecia quando a dieta acabava?']],
      ['ctxCulpaRegras', 'Culpa, regras alimentares e classificação moral da comida',
        ['sem culpa', 'culpa frequente', 'alimentos proibidos', 'certo e errado', 'compensa depois', 'come escondido', 'evita comer em público'],
        ['Existe comida que você considera proibida?', 'Como se sente depois de comer algo assim?', 'Costuma compensar depois?']],
      ['ctxImagemCorporalNutri', 'Imagem corporal e checagem',
        ['satisfeita(o)', 'insatisfação leve', 'insatisfação intensa', 'pesa-se todo dia', 'evita a balança', 'evita espelho', 'evita fotos', 'mede o corpo com frequência'],
        ['Como você se sente em relação ao seu corpo?', 'Com que frequência se pesa ou se mede?', 'Deixa de fazer coisas por causa disso?']],
      ['ctxExpectativaResultado', 'Expectativa de resultado e pressão externa',
        ['expectativa realista', 'quer resultado rápido', 'pressão de terceiros', 'evento marcado', 'indicação médica', 'comparação com outros', 'sem prazo'],
        ['O que você espera em quanto tempo?', 'Alguém está cobrando esse resultado de você?', 'Já ouviu promessa de resultado rápido antes?']],
    ],
  },
  {
    id: 'condicoes-clinicas-farmaco',
    label: 'Condições clínicas e interação com medicações',
    summary:
      'Abrir quando houver doença crônica em acompanhamento, uso contínuo de medicação ou exame alterado que '
      + 'mude a conduta. Aqui mora o que NÃO pode ser prescrito.',
    suggestedFor: ['nutri_clinica'],
    fields: [
      ['ctxDoencaControle', 'Condição de base e grau de controle atual',
        ['bem controlada', 'parcialmente controlada', 'descompensada', 'em ajuste de medicação', 'sem acompanhamento', 'internação recente'],
        ['A condição está controlada hoje? Como você sabe?', 'Quando foi a última consulta e o último exame?', 'Houve mudança recente de medicação?']],
      ['ctxInteracaoFarmacoNutriente', 'Medicações com impacto nutricional',
        ['nenhuma', 'anticoagulante', 'metformina', 'levotiroxina', 'inibidor de bomba de prótons', 'diurético', 'corticoide', 'antibiótico recente'],
        ['Que medicações usa e em que horário em relação às refeições?', 'Alguma exige cuidado com algum alimento?', 'Já foi orientada(o) sobre isso?']],
      ['ctxSintomasLimitantes', 'Sintomas que limitam a alimentação',
        ['sem limitação', 'disfagia', 'dor ao mastigar', 'prótese mal adaptada', 'boca seca', 'alteração de paladar', 'náusea por medicação', 'saciedade precoce'],
        ['Tem dificuldade para mastigar ou engolir?', 'A comida mudou de gosto?', 'Algum sintoma faz você comer menos?']],
      ['ctxOrientacoesOutrosProfissionais', 'Orientações já dadas por outros profissionais',
        ['nenhuma', 'orientação médica', 'orientação de outro nutricionista', 'orientação conflitante', 'restrição prescrita', 'dieta hospitalar prévia'],
        ['Alguém já te passou orientação alimentar para isso?', 'O que foi dito exatamente?', 'Há orientação que conflita com o que conversamos hoje?']],
    ],
  },
  {
    id: 'cultura-crencas-alimentares',
    label: 'Cultura, crenças e escolhas alimentares',
    summary:
      'Abrir quando houver restrição por religião, filosofia de vida, cultura ou crença. Tratar escolha '
      + 'legítima como erro nutricional destrói o vínculo e a adesão.',
    suggestedFor: [],
    fields: [
      ['ctxRestricaoEscolha', 'Restrições por escolha, religião ou cultura',
        ['nenhuma', 'vegetariano', 'vegano', 'restrição religiosa', 'jejum religioso', 'não come carne vermelha', 'tradição familiar', 'restrição por crença'],
        ['Há alimentos que você não come por escolha ou por crença?', 'Há quanto tempo?', 'Existe flexibilidade em alguma situação?']],
      ['ctxAlimentosAfetivos', 'Alimentos com valor afetivo, cultural ou de pertencimento',
        ['comida da família', 'comida regional', 'refeição de domingo', 'comida de festa', 'preparo herdado', 'sem apego específico'],
        ['Que comida é importante para você por motivo que não é nutrição?', 'Que refeição você não abriria mão?', 'Isso costuma virar motivo de culpa?']],
      ['ctxFontesInformacao', 'De onde vem a informação alimentar que a pessoa segue',
        ['profissional de saúde', 'internet', 'redes sociais', 'família', 'academia', 'livro', 'grupo de amigos', 'não busca'],
        ['Onde você costuma buscar informação sobre alimentação?', 'Segue alguém especificamente?', 'Já tentou algo que viu e não deu certo?']],
      ['ctxCrencasSobreAlimentos', 'Crenças sobre alimentos específicos',
        ['sem crenças rígidas', 'evita glúten sem diagnóstico', 'evita lactose sem diagnóstico', 'acredita em detox', 'evita carboidrato à noite', 'acredita em alimento que engorda sozinho'],
        ['Há algum alimento que você evita por acreditar que faz mal?', 'De onde veio essa informação?', 'Já testou reintroduzir?']],
    ],
  },
  {
    id: 'suplementacao-recursos',
    label: 'Suplementação e recursos por conta própria',
    summary:
      'Abrir quando houver uso de suplemento, fitoterápico ou recurso sem prescrição. Muitos chegam por '
      + 'indicação de loja ou rede social e interagem com medicação.',
    suggestedFor: [],
    fields: [
      ['ctxSuplementosAtuais', 'Suplementos e fitoterápicos em uso',
        ['não usa', 'polivitamínico', 'vitamina D', 'ferro', 'ômega 3', 'proteína', 'creatina', 'fitoterápico'],
        ['O que você toma hoje, em que dose e horário?', 'Há quanto tempo?', 'Toma junto de alguma medicação?']],
      ['ctxOrigemIndicacao', 'Quem indicou e com que critério',
        ['nutricionista', 'médico', 'treinador', 'farmacêutico', 'rede social', 'amigo', 'loja de suplementos', 'por conta própria'],
        ['Quem indicou?', 'Foi feito algum exame antes?', 'Você sabe para que serve?']],
      ['ctxEfeitoPercebido', 'Efeito percebido e efeitos adversos',
        ['sem efeito percebido', 'melhora de energia', 'melhora de exame', 'desconforto gástrico', 'alteração intestinal', 'não sabe avaliar', 'parou por conta própria'],
        ['Percebeu diferença desde que começou?', 'Sentiu algum efeito ruim?', 'Já parou e voltou?']],
      ['ctxGastoPrioridade', 'Custo da suplementação frente ao orçamento de comida',
        ['custo irrelevante', 'pesa no orçamento', 'gasta mais em suplemento que em comida', 'comprou por promessa de resultado', 'quer reduzir o gasto'],
        ['Quanto isso pesa no seu orçamento?', 'Se precisasse escolher entre suplemento e comida fresca, o que ficaria?', 'Faz sentido manter tudo isso?']],
    ],
  },
].map(toContextModule);

// ---- Configuração completa ----------------------------------------
export const NUTRICAO_ANAMNESE = {
  discipline: 'nutricao',
  label: 'Nutrição',
  recordType: NUTRI_RECORD_TYPE,
  contentStatus: NUTRI_CONTENT_STATUS,
  draftNotice: NUTRI_DRAFT_NOTICE,

  pathsTitle: 'Escolha o objetivo deste acompanhamento',
  pathsIntro:
    'O objetivo define o roteiro específico. O que é comum a todos — escuta, hábitos, sintomas e contexto — '
    + 'aparece em qualquer percurso; o restante entra pelos blocos de pertinência.',

  profiles: [
    {
      id: 'nutri_clinica',
      label: 'Nutrição clínica e ambulatorial',
      shortLabel: 'Clínica',
      description: 'Adulto com condição de saúde, objetivo de peso, sintomas digestivos ou exames alterados.',
      sectionSet: 'clinica',
    },
    {
      id: 'nutri_materno_infantil',
      label: 'Materno-infantil',
      shortLabel: 'Materno-infantil',
      description: 'Gestação, lactação, introdução alimentar, infância e adolescência.',
      sectionSet: 'maternoInfantil',
    },
    {
      id: 'nutri_esportiva',
      label: 'Nutrição esportiva',
      shortLabel: 'Esportiva',
      description: 'Desempenho, composição corporal para treino, suplementação e competição.',
      sectionSet: 'esportiva',
    },
  ],

  sectionSets: {
    clinica,
    maternoInfantil,
    esportiva,
  },

  textFields,
  checklistSections: NUTRI_CHECKLIST_SECTIONS,
  checklistsTitle: 'Sinais organizados (proposta a validar)',

  riskGroup: NUTRI_RISK_GROUP,
  riskItems: NUTRI_RISK_ITEMS,
  riskReminder: NUTRI_RISK_REMINDER,
  riskTitle: 'Sinais de risco (sempre conferir)',
  riskNotesLabel: 'Anotações sobre risco e conduta combinada',

  axes: NUTRI_AXES,
  axesIntro: NUTRI_AXES_INTRO,
  axesTitle: 'Raciocínio e diagnóstico nutricional',

  contextModules,
  contextTitle: 'Contexto específico (abrir conforme o caso)',

  // ---- Evolução ----
  // Peso é indicador, não veredito: entra ao lado de adesão e sintomas
  // justamente para não virar a única leitura do acompanhamento.
  evolution: {
    intro:
      'Registre cada retorno: o que foi ajustado, dificuldades relatadas e metas pactuadas. '
      + 'Os indicadores servem para comparar consultas — a leitura clínica é sua.',
    indicators: [
      { id: 'peso', label: 'Peso (kg)' },
      { id: 'cintura', label: 'Cintura (cm)' },
      { id: 'adesao', label: 'Adesão ao combinado (0-10)' },
      { id: 'sintomas', label: 'Sintomas digestivos (0-10)' },
    ],
    fields: [
      { id: 'trabalhado', label: 'O que foi trabalhado nesta consulta', placeholder: 'Orientações, ajustes, educação alimentar…' },
      { id: 'dificuldades', label: 'Dificuldades relatadas', placeholder: 'O que não funcionou e por quê…' },
      { id: 'ajustesPlano', label: 'Ajustes no plano', placeholder: 'O que mudou em relação ao combinado anterior…' },
      { id: 'examesNovos', label: 'Exames novos ou intercorrências clínicas' },
      { id: 'metas', label: 'Metas pactuadas até o próximo retorno' },
      { id: 'obs', label: 'Observações' },
    ],
  },

  // ---- Relatório ----
  report: {
    modes: [
      { id: 'interno', label: 'Registro interno', title: 'REGISTRO CLÍNICO INTERNO — NUTRIÇÃO', scope: 'full' },
      { id: 'externo', label: 'Relatório nutricional', title: 'RELATÓRIO NUTRICIONAL', scope: 'summary' },
    ],
    summaryFieldIds: ['queixaObjetivo', 'historiaPeso', 'contextoRotinaSono'],
    externalNotice:
      'Documento emitido a pedido da pessoa atendida. Descreve avaliação e conduta nutricional; '
      + 'não substitui diagnóstico médico nem laudo de exame.',
  },

  riskFirstAction: 'Conferir primeiro os sinais de risco marcados e registrar a conduta antes de qualquer prescrição.',
  emptyAction: 'Registrar a queixa, o objetivo e a rotina alimentar para iniciar a avaliação.',
  axesAction: 'Organizar os achados nos eixos que fizerem sentido para este caso.',
  readyAction: 'Fechar o diagnóstico nutricional em hipótese e pactuar metas com a pessoa.',
};
