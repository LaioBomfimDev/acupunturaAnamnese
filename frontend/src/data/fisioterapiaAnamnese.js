// ============================================================
// DADOS: Anamnese de Fisioterapia — RASCUNHO A VALIDAR
//
// Segue o contrato genérico (data/anamneseKit.js) e o desenho fechado
// com o dono do produto em 07/08/2026: percursos por ÁREA (a área muda
// de fato o exame, as escalas e os testes) e contexto por PERTINÊNCIA.
//
// Raciocínio ancorado na CIF (Classificação Internacional de
// Funcionalidade): estrutura/função → atividade → participação, com
// fatores ambientais e pessoais. É o vocabulário que a fisioterapia
// brasileira usa para justificar conduta, e não fecha diagnóstico médico.
//
// O bloco de risco são as BANDEIRAS VERMELHAS: sinais que pedem
// encaminhamento antes de tratar. O sistema destaca e lembra; avaliar e
// encaminhar é da profissional.
//
// TUDO aqui é proposta conservadora: a fisioterapeuta é a autoridade e
// vai cortar/trocar/reescrever. Até lá o workspace exibe o rascunho.
// ============================================================

import { toAxis, toContextModule, toField, toRiskItem, toSection } from './anamneseKit.js';

export const FISIO_CONTENT_STATUS = 'rascunho_a_validar';
export const FISIO_RECORD_TYPE = 'fisio_anamnese';

export const FISIO_DRAFT_NOTICE =
  'Conteúdo provisório formulado a partir da literatura de avaliação cinético-funcional (CIF, '
  + 'bandeiras vermelhas musculoesqueléticas) e ainda não validado por fisioterapeuta. O registro '
  + 'já vale como anotação clínica, mas os campos, as escalas e os eixos podem mudar na revisão.';

// ---- Escuta livre (comum a todos os percursos) --------------------
const textFields = [
  [
    'queixaPrincipal',
    'Queixa principal (nas palavras da pessoa)',
    ['dor', 'fraqueza', 'rigidez', 'instabilidade', 'perda de movimento', 'falta de ar', 'perda de urina', 'desequilíbrio'],
    [
      'O que te trouxe até aqui?',
      'Onde incomoda e desde quando?',
      'Se tivesse que resumir em uma frase, qual é o problema?',
    ],
  ],
  [
    'historiaQueixa',
    'História da queixa: início, evolução, o que piora e o que melhora',
    ['início súbito', 'início gradual', 'após trauma', 'após esforço', 'pós-cirúrgico', 'piora progressiva', 'melhora com repouso', 'melhora com movimento'],
    [
      'Como começou? Teve algum episódio ou esforço específico?',
      'Desde então melhorou, piorou ou ficou igual?',
      'O que piora e o que alivia?',
    ],
  ],
  [
    'objetivoFuncional',
    'O que a pessoa quer voltar a fazer (meta funcional)',
    ['voltar a trabalhar', 'voltar a treinar', 'subir escada', 'dormir sem dor', 'carregar peso', 'andar sem apoio', 'dirigir', 'brincar com os filhos'],
    [
      'O que a dor/limitação te impede de fazer que você gostaria de voltar a fazer?',
      'Se melhorasse 100%, o que você faria primeiro?',
      'O que seria uma melhora suficiente para valer a pena?',
    ],
  ],
  [
    'historicoClinicoCirurgico',
    'Histórico clínico, cirúrgico e exames de imagem',
    ['sem histórico relevante', 'cirurgia prévia', 'fratura prévia', 'hipertensão', 'diabetes', 'osteoporose', 'doença reumática', 'exame de imagem recente'],
    [
      'Tem alguma condição de saúde em acompanhamento?',
      'Já fez cirurgia ou teve fratura nessa região?',
      'Trouxe exames de imagem? O que dizia o laudo?',
    ],
  ],
  [
    'medicacoesTratamentos',
    'Medicações em uso e tratamentos já realizados',
    ['não usa medicação', 'analgésico', 'anti-inflamatório', 'relaxante muscular', 'corticoide', 'infiltração', 'fisioterapia anterior', 'acupuntura'],
    [
      'Está usando alguma medicação para isso? Ajuda?',
      'Já fez fisioterapia antes para essa queixa? Como foi?',
      'Que tratamentos já tentou e o que funcionou?',
    ],
  ],
  [
    'rotinaAtividade',
    'Rotina, trabalho, atividade física e ergonomia',
    ['trabalho sentado', 'trabalho em pé', 'carrega peso', 'movimento repetitivo', 'sedentário', 'treina regularmente', 'home office', 'aposentado(a)'],
    [
      'Como é o seu dia? Quanto tempo sentada(o), em pé ou carregando peso?',
      'Pratica alguma atividade física? Com que frequência?',
      'Como é o posto de trabalho onde você passa mais tempo?',
    ],
  ],
].map(toField);

// ---- Percursos por área ------------------------------------------
const musculoesqueletica = [
  {
    id: 'me-dor',
    title: 'Caracterização da dor',
    fields: [
      ['meDorLocalIrradiacao', 'Localização, irradiação e mapa da dor',
        ['dor localizada', 'irradia para o membro', 'dor em faixa', 'dor difusa', 'muda de lugar', 'bilateral', 'unilateral'],
        ['Aponte com um dedo onde dói mais.', 'A dor caminha para algum lugar?', 'É sempre no mesmo ponto?']],
      ['meDorIntensidadeRitmo', 'Intensidade (EVA 0-10), ritmo e período do dia',
        ['EVA em repouso', 'EVA no pior momento', 'pior de manhã', 'pior à noite', 'pior no fim do dia', 'constante', 'em crises'],
        ['De 0 a 10, quanto dói agora e quanto dói no pior momento?', 'Em que hora do dia é pior?', 'A dor some completamente em algum momento?']],
      ['meDorFatores', 'Fatores de piora e de alívio',
        ['piora ao movimento', 'piora ao repouso', 'piora ao carregar', 'alivia com calor', 'alivia com frio', 'alivia com alongamento', 'alivia com analgésico'],
        ['O que faz doer mais?', 'O que faz aliviar, mesmo que pouco?', 'Consegue encontrar posição confortável?']],
    ],
  },
  {
    id: 'me-lesao',
    title: 'Mecanismo de lesão e história prévia',
    fields: [
      ['meMecanismoLesao', 'Mecanismo de lesão ou gatilho inicial',
        ['sem trauma', 'queda', 'torção', 'esforço com carga', 'movimento repetitivo', 'acidente', 'pós-operatório', 'não soube identificar'],
        ['Lembra do momento em que começou?', 'Que movimento você estava fazendo?', 'Ouviu ou sentiu algum estalo?']],
      ['meLesoesPrevias', 'Lesões anteriores na mesma região ou compensatórias',
        ['primeira vez', 'já teve antes', 'lesão recorrente', 'lesão no lado oposto', 'cirurgia na região', 'sequela antiga'],
        ['Já teve esse problema antes? Quantas vezes?', 'Como foi resolvido das outras vezes?', 'Tem alguma lesão antiga que ainda incomoda?']],
      ['meExamesImagem', 'Exames de imagem e laudos relevantes',
        ['não realizou', 'raio-X', 'ultrassom', 'ressonância', 'tomografia', 'eletroneuromiografia', 'laudo sem alterações'],
        ['Que exames já fez para isso?', 'O que o laudo apontou?', 'Algum profissional explicou o resultado para você?']],
    ],
  },
  {
    id: 'me-exame',
    title: 'Exame físico: postura, mobilidade e força',
    fields: [
      ['meInspecaoPostura', 'Inspeção, postura e achados visuais',
        ['sem alteração visível', 'edema', 'hematoma', 'assimetria', 'atrofia', 'desvio postural', 'alteração de pele', 'cicatriz'],
        ['Há edema, mudança de cor ou assimetria?', 'A postura mostra compensação evidente?', 'Existe atrofia visível comparando os lados?']],
      ['meAmplitudeMovimento', 'Amplitude de movimento (ativa e passiva)',
        ['amplitude preservada', 'amplitude reduzida', 'dor no fim do arco', 'arco doloroso', 'bloqueio articular', 'hipermobilidade', 'assimetria entre lados'],
        ['Registre os graus obtidos e o lado comparado.', 'A limitação é por dor ou por bloqueio real?', 'A amplitude passiva é maior que a ativa?']],
      ['meForcaMuscular', 'Força muscular e testes de resistência',
        ['força preservada', 'força reduzida', 'dor à contração resistida', 'fadiga precoce', 'grau 3', 'grau 4', 'grau 5', 'assimetria de força'],
        ['Registre o grau de força por grupo muscular testado.', 'A contração resistida reproduz a dor?', 'Quanto tempo sustenta antes de fadigar?']],
      ['meTestesEspeciais', 'Testes especiais e palpação',
        ['sem testes positivos', 'teste positivo', 'palpação dolorosa', 'ponto-gatilho', 'crepitação', 'instabilidade ao teste', 'teste inconclusivo'],
        ['Que testes especiais foram aplicados e qual o resultado?', 'A palpação reproduz a queixa da pessoa?', 'Há crepitação ou instabilidade?']],
    ],
  },
  {
    id: 'me-funcao',
    title: 'Impacto funcional e no trabalho',
    fields: [
      ['meLimitacoesAVD', 'Atividades de vida diária limitadas',
        ['vestir-se', 'higiene', 'subir escadas', 'levantar da cadeira', 'dormir', 'dirigir', 'carregar compras', 'agachar'],
        ['O que você deixou de fazer por causa disso?', 'Precisa de ajuda de alguém em alguma tarefa?', 'O que dá para fazer, mas com dor?']],
      ['meTrabalhoCarga', 'Trabalho, carga e afastamento',
        ['trabalhando normalmente', 'trabalhando com dor', 'função adaptada', 'afastado(a)', 'em processo de perícia', 'medo de perder o emprego', 'autônomo(a) sem cobertura'],
        ['Você consegue trabalhar hoje? Com que limitação?', 'Houve afastamento? Por quanto tempo?', 'O trabalho piora o quadro?']],
      ['meEscalaFuncional', 'Escala funcional aplicada e pontuação',
        ['não aplicada', 'EVA', 'DASH/QuickDASH', 'WOMAC', 'Oswestry', 'Roland-Morris', 'LEFS', 'PSFS'],
        ['Qual escala foi aplicada e qual a pontuação inicial?', 'Essa pontuação será o parâmetro de reavaliação?', 'A pessoa entendeu como responder?']],
    ],
  },
  {
    id: 'me-tratamento',
    title: 'Tratamentos, adesão e expectativa',
    fields: [
      ['meTratamentosPrevios', 'O que já foi tentado e a resposta obtida',
        ['nada tentado', 'repouso', 'medicação', 'fisioterapia', 'exercício orientado', 'infiltração', 'terapia manual', 'sem melhora com nada'],
        ['O que já tentou para isso?', 'O que deu mais resultado, mesmo temporário?', 'Algo piorou o quadro?']],
      ['meAdesaoExercicio', 'Disponibilidade, adesão e crenças sobre exercício',
        ['motivada(o)', 'cética(o)', 'sem tempo', 'medo de piorar', 'já faz exercício', 'prefere terapia passiva', 'boa adesão prévia'],
        ['Você acredita que exercício pode ajudar no seu caso?', 'Quanto tempo por semana consegue dedicar em casa?', 'O que já te fez desistir de um tratamento antes?']],
    ],
  },
].map(toSection);

const neurofuncional = [
  {
    id: 'nf-diagnostico',
    title: 'Diagnóstico neurológico e evolução',
    fields: [
      ['nfDiagnosticoTempo', 'Diagnóstico, data do evento e tempo de lesão',
        ['AVC', 'TCE', 'lesão medular', 'Parkinson', 'esclerose múltipla', 'paralisia cerebral', 'neuropatia periférica', 'em investigação'],
        ['Qual o diagnóstico e quando aconteceu?', 'Houve internação? Por quanto tempo?', 'Quem acompanha clinicamente hoje?']],
      ['nfEvolucaoQuadro', 'Evolução desde o evento e estabilidade atual',
        ['melhora progressiva', 'estável', 'piora progressiva', 'flutuante', 'com períodos on/off', 'após recidiva', 'primeira reabilitação'],
        ['Desde o início, melhorou, piorou ou ficou estável?', 'Há dias melhores e piores? O que muda?', 'Já fez reabilitação antes? Até onde chegou?']],
      ['nfExamesLaudos', 'Exames, laudos e medicações neurológicas',
        ['tomografia', 'ressonância', 'eletroneuromiografia', 'sem exames recentes', 'anticonvulsivante', 'relaxante muscular', 'toxina botulínica'],
        ['Que exames existem e o que apontaram?', 'Usa medicação neurológica? Alguma aplicação de toxina?', 'Quando foi a última reavaliação médica?']],
    ],
  },
  {
    id: 'nf-motor',
    title: 'Controle motor, tônus e coordenação',
    fields: [
      ['nfTonusEspasticidade', 'Tônus muscular e espasticidade',
        ['tônus normal', 'hipotonia', 'espasticidade leve', 'espasticidade moderada', 'espasticidade grave', 'clônus', 'padrão flexor', 'padrão extensor'],
        ['Registre o tônus por segmento (Ashworth, se aplicável).', 'O tônus muda com posição, esforço ou emoção?', 'Há encurtamento ou risco de contratura?']],
      ['nfForcaSeletividade', 'Força e seletividade de movimento',
        ['movimento seletivo', 'movimento em bloco', 'força reduzida', 'hemiparesia', 'paraparesia', 'tetraparesia', 'preensão preservada', 'sem movimento voluntário'],
        ['Consegue mover um segmento isoladamente ou vem em bloco?', 'Registre a força por grupo muscular.', 'Qual é o melhor movimento voluntário disponível hoje?']],
      ['nfCoordenacao', 'Coordenação, ataxia e movimentos involuntários',
        ['coordenação preservada', 'dismetria', 'tremor de repouso', 'tremor de intenção', 'ataxia', 'bradicinesia', 'discinesia'],
        ['Há tremor? Em repouso ou ao mirar um alvo?', 'A pessoa acerta o alvo ou passa do ponto?', 'A lentidão aparece ao iniciar ou ao longo do movimento?']],
    ],
  },
  {
    id: 'nf-mobilidade',
    title: 'Mobilidade, transferências e marcha',
    fields: [
      ['nfTransferencias', 'Rolar, sentar, levantar e transferências',
        ['independente', 'supervisão', 'assistência mínima', 'assistência moderada', 'assistência máxima', 'dependente', 'usa transfer board'],
        ['Como a pessoa sai da cama e levanta da cadeira?', 'Quanta ajuda é necessária, na prática?', 'Onde a transferência costuma falhar?']],
      ['nfMarchaDispositivos', 'Marcha, dispositivos e órteses',
        ['marcha independente', 'bengala', 'muleta', 'andador', 'cadeira de rodas', 'órtese de tornozelo', 'marcha ceifante', 'não deambula'],
        ['Anda hoje? Com que apoio e por quanto tempo?', 'Usa órtese? Está adequada e em uso?', 'Descreva o padrão de marcha observado.']],
      ['nfEquilibrioQuedas', 'Equilíbrio, quedas e medo de cair',
        ['equilíbrio preservado', 'instável em pé', 'instável ao girar', 'quedas no último ano', 'medo de cair', 'usa apoio de parede', 'não fica em pé sozinho(a)'],
        ['Caiu no último ano? Quantas vezes e como?', 'Tem medo de cair? Isso te faz evitar coisas?', 'Registre a escala de equilíbrio aplicada e a pontuação.']],
    ],
  },
  {
    id: 'nf-sensorio',
    title: 'Sensibilidade, cognição e comunicação',
    fields: [
      ['nfSensibilidade', 'Sensibilidade e propriocepção',
        ['preservada', 'hipoestesia', 'anestesia', 'parestesia', 'hiperestesia', 'propriocepção alterada', 'negligência do lado afetado'],
        ['Sente o toque igual dos dois lados?', 'Sabe onde está o membro sem olhar?', 'Há risco de lesão por não sentir?']],
      ['nfCognicaoComunicacao', 'Cognição, comunicação e compreensão de comandos',
        ['compreende bem', 'afasia de expressão', 'afasia de compreensão', 'disartria', 'déficit de atenção', 'déficit de memória', 'desorientação'],
        ['A pessoa compreende e executa comandos simples?', 'Consegue se expressar? Como se comunica melhor?', 'Há prejuízo de memória que afete o exercício em casa?']],
      ['nfDorNeuropatica', 'Dor neuropática, ombro doloroso e complicações',
        ['sem dor', 'dor em queimação', 'choque', 'alodinia', 'ombro doloroso', 'subluxação de ombro', 'dor ao mobilizar'],
        ['A dor é em queimação ou choque?', 'Dói ao toque leve?', 'Há subluxação de ombro no lado afetado?']],
    ],
  },
  {
    id: 'nf-avd',
    title: 'Independência, cuidador e ambiente',
    fields: [
      ['nfIndependenciaAVD', 'Independência nas atividades de vida diária',
        ['independente', 'necessita supervisão', 'necessita ajuda parcial', 'dependente', 'alimenta-se sozinho(a)', 'veste-se sozinho(a)', 'higiene com ajuda'],
        ['O que a pessoa faz sozinha hoje?', 'Registre a escala de independência aplicada e a pontuação.', 'Qual atividade seria mais valiosa recuperar primeiro?']],
      ['nfCuidadorSuporte', 'Cuidador principal, sobrecarga e rede',
        ['sem cuidador', 'cônjuge', 'filho(a)', 'cuidador contratado', 'reveza na família', 'cuidador sobrecarregado', 'rede ampla'],
        ['Quem cuida no dia a dia?', 'Essa pessoa consegue dar conta? Como ela está?', 'Quem ajudaria a fazer os exercícios em casa?']],
      ['nfAdaptacoesDomicilio', 'Ambiente domiciliar e adaptações',
        ['casa térrea', 'escadas', 'banheiro adaptado', 'barras de apoio', 'tapetes soltos', 'iluminação ruim', 'cadeira de banho', 'sem adaptação'],
        ['Como é a casa? Tem escada ou degrau na entrada?', 'O banheiro tem barra ou banco?', 'Há tapetes soltos ou obstáculos no caminho da cama ao banheiro?']],
    ],
  },
].map(toSection);

const cardiorrespiratoria = [
  {
    id: 'cr-dispneia',
    title: 'Dispneia e tolerância ao esforço',
    fields: [
      ['crDispneiaEsforco', 'Dispneia: quando aparece e em que intensidade',
        ['apenas em grandes esforços', 'ao subir escada', 'ao andar no plano', 'ao se vestir', 'em repouso', 'ao deitar', 'noturna', 'mMRC registrado'],
        ['Em que atividade você sente falta de ar?', 'Quantos degraus ou quantos metros até precisar parar?', 'Registre a escala de dispneia aplicada (mMRC/Borg).']],
      ['crToleranciaExercicio', 'Tolerância ao exercício e teste funcional',
        ['não testado', 'teste de caminhada de 6 minutos', 'sit-to-stand', 'interrompeu por dispneia', 'interrompeu por fadiga', 'saturação caiu', 'boa tolerância'],
        ['Que teste funcional foi aplicado e qual o resultado?', 'O que interrompeu o teste: fôlego, perna ou dor?', 'Houve queda de saturação durante o esforço?']],
      ['crSintomasAssociados', 'Sintomas associados ao esforço',
        ['sem sintomas', 'palpitação', 'tontura', 'dor torácica', 'edema de membros', 'cansaço desproporcional', 'sudorese fria'],
        ['Sente palpitação, tontura ou dor no peito ao se esforçar?', 'As pernas incham no fim do dia?', 'Já precisou parar por mal-estar?']],
    ],
  },
  {
    id: 'cr-vias',
    title: 'Tosse, secreção e função pulmonar',
    fields: [
      ['crTosseSecrecao', 'Tosse, secreção e eficácia da expectoração',
        ['sem tosse', 'tosse seca', 'tosse produtiva', 'secreção clara', 'secreção espessa', 'dificuldade para expectorar', 'piora pela manhã'],
        ['Tem tosse? Sai secreção?', 'Consegue expectorar sozinha(o) ou fica presa?', 'A secreção mudou de cor ou volume recentemente?']],
      ['crHistoricoRespiratorio', 'Histórico respiratório e internações',
        ['sem histórico', 'asma', 'DPOC', 'bronquiectasia', 'pneumonia recente', 'pós-COVID', 'internação no último ano', 'uso prévio de UTI'],
        ['Tem diagnóstico respiratório? Desde quando?', 'Precisou internar no último ano? Quantas vezes?', 'Já ficou em ventilação mecânica?']],
      ['crExamesFuncao', 'Exames de função pulmonar e imagem',
        ['não realizou', 'espirometria', 'raio-X de tórax', 'tomografia', 'gasometria', 'oximetria domiciliar', 'laudo sem alterações'],
        ['Fez espirometria? O que apontou?', 'Há exame de imagem recente?', 'Qual a saturação habitual em repouso?']],
    ],
  },
  {
    id: 'cr-cardio',
    title: 'Contexto cardiovascular e metabólico',
    fields: [
      ['crCondicoesCardio', 'Condições cardiovasculares e metabólicas',
        ['sem condição conhecida', 'hipertensão', 'insuficiência cardíaca', 'infarto prévio', 'arritmia', 'marcapasso', 'diabetes', 'dislipidemia'],
        ['Tem pressão alta, diabetes ou problema no coração?', 'Já teve infarto, cirurgia cardíaca ou colocou stent?', 'Usa marcapasso ou desfibrilador?']],
      ['crMedicacoesCardio', 'Medicações cardiorrespiratórias em uso',
        ['não usa', 'anti-hipertensivo', 'betabloqueador', 'diurético', 'anticoagulante', 'broncodilatador', 'corticoide inalatório', 'uso irregular'],
        ['Que medicações usa e em que horários?', 'Usa bomba/inalador antes de se esforçar?', 'Betabloqueador em uso muda a leitura da frequência cardíaca no treino.']],
      ['crSinaisAlertaEsforco', 'Parâmetros e limites combinados para o esforço',
        ['sem limite definido', 'limite de frequência cardíaca', 'saturação mínima', 'escala de Borg como guia', 'interromper se dor torácica', 'liberação médica obtida', 'aguardando liberação'],
        ['Há liberação médica para exercício? Com que restrição?', 'Que parâmetros vamos monitorar durante a sessão?', 'Quais sinais interrompem o atendimento imediatamente?']],
    ],
  },
  {
    id: 'cr-habitos',
    title: 'Hábitos, dispositivos e rotina',
    fields: [
      ['crTabagismoExposicao', 'Tabagismo e exposição ocupacional',
        ['nunca fumou', 'ex-tabagista', 'tabagista atual', 'carga tabágica registrada', 'exposição a poeira', 'exposição a fumaça', 'fumante passivo'],
        ['Fuma ou já fumou? Quantos maços por quantos anos?', 'Trabalha ou trabalhou exposta(o) a poeira, fumaça ou produtos químicos?', 'Alguém fuma dentro de casa?']],
      ['crOxigenoDispositivos', 'Oxigenoterapia e dispositivos em uso',
        ['não usa', 'oxigênio contínuo', 'oxigênio noturno', 'CPAP', 'BiPAP', 'nebulização', 'inalador de resgate', 'aspirador de secreção'],
        ['Usa oxigênio? Quantas horas por dia e em que fluxo?', 'Usa CPAP ou BiPAP à noite? Tolera bem?', 'Tem inalador de resgate por perto?']],
      ['crRotinaAtividade', 'Rotina, sono e nível de atividade atual',
        ['sedentário', 'caminha ocasionalmente', 'caminha regularmente', 'sono fragmentado', 'dorme sentado', 'ronco relatado', 'sonolência diurna'],
        ['Como está o sono? Precisa de travesseiros altos ou dorme sentada(o)?', 'Faz alguma atividade física hoje?', 'Sente sonolência durante o dia?']],
    ],
  },
].map(toSection);

const pelvica = [
  {
    id: 'pv-urinario',
    title: 'Função urinária',
    fields: [
      ['pvPerdasUrinarias', 'Perdas urinárias: quando e quanto',
        ['sem perdas', 'perda ao tossir', 'perda ao esforço', 'perda com urgência', 'perda contínua', 'usa absorvente', 'usa fralda', 'troca várias vezes ao dia'],
        ['Perde urina? Em que situação exatamente?', 'Precisa usar absorvente ou fralda? Quantos por dia?', 'Isso te faz evitar sair de casa ou se exercitar?']],
      ['pvFrequenciaUrgencia', 'Frequência, urgência e noctúria',
        ['frequência normal', 'vai ao banheiro muitas vezes', 'urgência forte', 'acorda para urinar', 'mapeia banheiros', 'segura por muito tempo'],
        ['Quantas vezes urina por dia? E à noite?', 'Quando dá vontade, dá tempo de chegar ao banheiro?', 'Você planeja saídas em função de banheiro?']],
      ['pvEsvaziamento', 'Esvaziamento, jato e sensação residual',
        ['esvaziamento completo', 'jato fraco', 'demora para iniciar', 'jato interrompido', 'sensação de bexiga cheia após urinar', 'faz força para urinar', 'infecções de repetição'],
        ['O jato é forte ou fraco? Precisa fazer força?', 'Fica sensação de que não esvaziou?', 'Tem infecção urinária com frequência?']],
    ],
  },
  {
    id: 'pv-intestinal',
    title: 'Função intestinal',
    fields: [
      ['pvHabitoIntestinal', 'Hábito intestinal e consistência',
        ['diário', 'a cada 2-3 dias', 'menos de 3 vezes por semana', 'fezes endurecidas', 'fezes pastosas', 'alternância', 'uso de laxante'],
        ['Com que frequência evacua?', 'Como é a consistência (escala de Bristol)?', 'Usa laxante ou algum recurso para conseguir evacuar?']],
      ['pvPerdasFecais', 'Perdas de fezes ou gases e urgência',
        ['sem perdas', 'perda de gases', 'perda de fezes líquidas', 'perda de fezes sólidas', 'urgência para evacuar', 'usa proteção', 'suja a roupa íntima'],
        ['Perde gases ou fezes sem querer?', 'Consegue segurar até chegar ao banheiro?', 'Isso mudou depois de algum evento (parto, cirurgia)?']],
      ['pvEsforcoEvacuatorio', 'Esforço evacuatório e postura',
        ['sem esforço', 'faz muita força', 'precisa de manobra digital', 'sensação de evacuação incompleta', 'usa banquinho', 'passa muito tempo no vaso', 'dor ao evacuar'],
        ['Precisa fazer muita força para evacuar?', 'Usa alguma manobra com o dedo para ajudar?', 'Quanto tempo costuma ficar no vaso?']],
    ],
  },
  {
    id: 'pv-obstetrico',
    title: 'História obstétrica, cirúrgica e hormonal',
    fields: [
      ['pvGestacoesPartos', 'Gestações, partos e intercorrências',
        ['sem gestações', 'parto normal', 'cesárea', 'parto instrumentado', 'episiotomia', 'laceração', 'bebê acima de 4kg', 'pós-parto recente'],
        ['Teve gestações? Quantas e que tipo de parto?', 'Houve corte ou laceração no parto?', 'Os sintomas começaram depois de algum parto?']],
      ['pvCirurgiasPelvicas', 'Cirurgias pélvicas, abdominais e prostáticas',
        ['nenhuma', 'histerectomia', 'cirurgia de bexiga', 'prostatectomia', 'cirurgia de hérnia', 'cirurgia de intestino', 'cesárea prévia', 'radioterapia pélvica'],
        ['Já fez alguma cirurgia na barriga ou na região pélvica?', 'Os sintomas começaram depois dela?', 'Fez radioterapia na região?']],
      ['pvClimaterioHormonal', 'Contexto hormonal e climatério, quando pertinente',
        ['não se aplica', 'ciclo regular', 'climatério', 'menopausa', 'hormonioterapia', 'ressecamento relatado', 'acompanhamento médico'],
        ['Há mudança hormonal recente?', 'Percebeu diferença nos sintomas nesse período?', 'Está em acompanhamento com outro profissional para isso?']],
    ],
  },
  {
    id: 'pv-dor',
    title: 'Dor pélvica, sexualidade e consciência perineal',
    fields: [
      ['pvDorPelvica', 'Dor pélvica, perineal ou lombopélvica',
        ['sem dor', 'dor perineal', 'dor lombopélvica', 'dor ao sentar', 'dor em cóccix', 'dor cíclica', 'dor constante', 'dor ao toque'],
        ['Onde dói e há quanto tempo?', 'Piora ao sentar, ao evacuar ou em algum período do ciclo?', 'A dor limita alguma atividade específica?']],
      ['pvFuncaoSexual', 'Função sexual, quando a pessoa desejar abordar',
        ['não investigado', 'sem queixa', 'dor na relação', 'dificuldade de penetração', 'queda de libido', 'alteração erétil', 'evita a relação', 'prefere não falar'],
        ['Existe queixa nessa área que você queira trazer? Só se quiser.', 'Há dor durante ou depois da relação?', 'Isso mudou junto com os outros sintomas?']],
      ['pvConscienciaPerineal', 'Consciência e controle da musculatura do assoalho pélvico',
        ['identifica a contração', 'não identifica', 'contrai com compensação', 'usa glúteo/adutor', 'prende a respiração', 'contração sustentada preservada', 'fadiga precoce'],
        ['A pessoa consegue perceber e contrair a musculatura?', 'Há compensação com glúteo, adutor ou abdome?', 'Registre força e sustentação avaliadas.']],
    ],
  },
].map(toSection);

// ---- Checklists (vocabulário fechado) -----------------------------
export const fisioChecklists = {
  fisioDor: [
    'Pontada', 'Queimação', 'Peso', 'Choque / irradiada', 'Latejante',
    'Rigidez matinal', 'Dor noturna', 'Dor em repouso', 'Dor ao movimento',
    'Dor à palpação', 'Dor difusa', 'Alodinia',
  ],
  fisioFuncao: [
    'Marcha', 'Subir e descer escadas', 'Levantar da cadeira', 'Elevar o braço',
    'Agachar', 'Carregar peso', 'Vestir-se', 'Higiene pessoal', 'Dormir',
    'Dirigir', 'Trabalhar', 'Praticar esporte',
  ],
  fisioNeuro: [
    'Formigamento', 'Dormência', 'Fraqueza', 'Perda de força',
    'Alteração de sensibilidade', 'Alteração de reflexos', 'Câimbras',
    'Espasticidade', 'Tremor', 'Descoordenação',
  ],
  fisioAmplitudeForca: [
    'Amplitude preservada', 'Amplitude reduzida', 'Dor no fim do arco',
    'Arco doloroso', 'Rigidez articular', 'Hipermobilidade',
    'Força preservada', 'Força reduzida', 'Atrofia', 'Instabilidade articular',
  ],
  fisioEquilibrioMarcha: [
    'Marcha independente', 'Usa bengala', 'Usa muleta', 'Usa andador',
    'Cadeira de rodas', 'Histórico de quedas', 'Medo de cair',
    'Desequilíbrio ao girar', 'Necessita apoio para levantar', 'Marcha assimétrica',
  ],
  fisioRespiratorio: [
    'Dispneia aos grandes esforços', 'Dispneia aos pequenos esforços',
    'Dispneia em repouso', 'Ortopneia', 'Tosse seca', 'Tosse produtiva',
    'Secreção espessa', 'Uso de musculatura acessória', 'Oxigenoterapia',
    'Queda de saturação ao esforço',
  ],
  fisioPelvico: [
    'Perda de urina ao esforço', 'Urgência miccional', 'Noctúria',
    'Perda de fezes ou gases', 'Constipação', 'Esvaziamento incompleto',
    'Dor pélvica', 'Dor na relação', 'Sensação de peso perineal',
    'Não identifica a contração',
  ],
  fisioContextoAdesao: [
    'Cinesiofobia', 'Catastrofização da dor', 'Boa adesão prévia',
    'Baixa adesão prévia', 'Expectativa realista', 'Expectativa irreal',
    'Suporte familiar presente', 'Sem tempo para exercício domiciliar',
  ],
};

export const FISIO_CHECKLIST_SECTIONS = [
  { group: 'fisioDor', title: 'Características da dor', items: fisioChecklists.fisioDor },
  { group: 'fisioFuncao', title: 'Atividades limitadas', items: fisioChecklists.fisioFuncao },
  { group: 'fisioNeuro', title: 'Sinais neurológicos', items: fisioChecklists.fisioNeuro },
  { group: 'fisioAmplitudeForca', title: 'Amplitude, força e estabilidade', items: fisioChecklists.fisioAmplitudeForca },
  { group: 'fisioEquilibrioMarcha', title: 'Equilíbrio e marcha', items: fisioChecklists.fisioEquilibrioMarcha },
  { group: 'fisioRespiratorio', title: 'Sinais cardiorrespiratórios', items: fisioChecklists.fisioRespiratorio },
  { group: 'fisioPelvico', title: 'Sinais pélvicos', items: fisioChecklists.fisioPelvico },
  { group: 'fisioContextoAdesao', title: 'Contexto, crenças e adesão', items: fisioChecklists.fisioContextoAdesao },
];

// ---- Bandeiras vermelhas (bloco de risco) -------------------------
export const FISIO_RISK_GROUP = 'fisioRisco';

export const FISIO_RISK_ITEMS = [
  {
    id: 'fisio-risk-cauda-equina',
    label: 'Suspeita de síndrome da cauda equina',
    priority: 'critica',
    summary: 'Emergência neurocirúrgica: a janela para preservar função é curta.',
    screening: [
      'Perdeu o controle da urina ou das fezes recentemente?',
      'Está com dormência na região da sela (períneo, genitália, parte interna das coxas)?',
      'A fraqueza nas pernas está piorando rápido?',
    ],
    observe: [
      'Retenção urinária ou incontinência de início recente',
      'Anestesia em sela',
      'Déficit motor bilateral e progressivo em membros inferiores',
    ],
    reminder: 'Não tratar. Encaminhamento a serviço de emergência no mesmo dia.',
  },
  {
    id: 'fisio-risk-neoplasia-infeccao',
    label: 'Suspeita de neoplasia ou infecção',
    priority: 'alta',
    summary: 'Dor que não obedece a mecânica alguma e vem acompanhada de sinais sistêmicos.',
    screening: [
      'Perdeu peso sem querer nos últimos meses?',
      'Tem febre, calafrios ou suor noturno?',
      'Já teve câncer? A dor acorda você à noite e não alivia em posição nenhuma?',
    ],
    observe: [
      'Dor não mecânica, constante, sem posição de alívio',
      'Perda de peso não intencional, febre, sudorese noturna',
      'Histórico oncológico, imunossupressão ou uso de drogas injetáveis',
      'Idade acima de 50 anos com dor de início recente e sem trauma',
    ],
    reminder: 'Suspender conduta e encaminhar para investigação médica antes de tratar.',
  },
  {
    id: 'fisio-risk-fratura',
    label: 'Suspeita de fratura',
    priority: 'alta',
    summary: 'Trauma, fragilidade óssea ou corticoide de uso prolongado mudam a conduta.',
    screening: [
      'Houve queda, pancada ou acidente antes de começar?',
      'Tem osteoporose ou já fraturou por queda da própria altura?',
      'Usa corticoide há muito tempo?',
    ],
    observe: [
      'Dor localizada intensa à percussão',
      'Impotência funcional imediata após trauma',
      'Deformidade, edema importante ou equimose extensa',
    ],
    reminder: 'Imobilizar se necessário e encaminhar para imagem antes de mobilizar a região.',
  },
  {
    id: 'fisio-risk-tvp',
    label: 'Suspeita de trombose venosa profunda',
    priority: 'critica',
    summary: 'Mobilizar um membro com TVP pode desencadear embolia pulmonar.',
    screening: [
      'A panturrilha está inchada, quente ou vermelha de um lado só?',
      'Ficou acamada(o), imobilizada(o) ou fez cirurgia/viagem longa recentemente?',
      'Está com falta de ar ou dor no peito junto com isso?',
    ],
    observe: [
      'Edema unilateral com calor e rubor',
      'Dor à palpação do trajeto venoso',
      'Imobilização, pós-operatório, gestação/puerpério ou uso de hormônio',
    ],
    reminder: 'Não mobilizar nem massagear o membro. Encaminhamento de urgência.',
  },
  {
    id: 'fisio-risk-cardio-esforco',
    label: 'Sinais cardiovasculares durante o esforço',
    priority: 'critica',
    summary: 'Sintoma cardíaco no esforço interrompe o atendimento — não se negocia com ele.',
    screening: [
      'Sente dor ou aperto no peito ao se esforçar?',
      'Já desmaiou ou quase desmaiou durante atividade?',
      'A falta de ar é desproporcional ao esforço que você fez?',
    ],
    observe: [
      'Dor torácica, irradiação para mandíbula ou braço',
      'Síncope, pré-síncope ou palidez e sudorese fria',
      'Queda de saturação, palpitação sustentada ou pressão descompensada',
    ],
    reminder: 'Interromper a sessão, monitorar e acionar avaliação médica. Só retomar com liberação.',
  },
  {
    id: 'fisio-risk-neuro-progressivo',
    label: 'Déficit neurológico progressivo',
    priority: 'alta',
    summary: 'Perda de força ou sensibilidade que aumenta semana a semana não é caso de tratar e observar.',
    screening: [
      'A fraqueza ou a dormência está aumentando?',
      'Está esbarrando, tropeçando ou deixando coisas cair mais que antes?',
      'Apareceu alteração na fala, na visão ou de um lado do corpo?',
    ],
    observe: [
      'Progressão do déficit motor ou sensitivo entre sessões',
      'Perda de destreza, quedas novas ou alteração de marcha',
      'Sinais de acometimento central de início recente',
    ],
    reminder: 'Documentar a progressão e encaminhar para reavaliação médica antes de seguir.',
  },
].map(toRiskItem);

export const FISIO_RISK_REMINDER =
  'Bandeira vermelha marcada: reavalie a conduta antes de tratar e considere encaminhamento, '
  + 'conforme seu julgamento clínico e o protocolo da clínica. O sistema destaca e lembra — a decisão é sempre sua.';

// ---- Eixos: raciocínio cinético-funcional (CIF) -------------------
export const FISIO_AXES = [
  {
    id: 'axis-0',
    label: 'Estrutura e função do corpo',
    framework: 'CIF',
    summary: 'Deficiências observadas: amplitude, força, tônus, dor, função respiratória, controle motor.',
    explore: [
      'Que estruturas e funções estão comprometidas, medidas por quê?',
      'O achado do exame explica a queixa da pessoa?',
      'O que é irreversível e o que é modificável?',
    ],
  },
  {
    id: 'axis-1',
    label: 'Atividade',
    framework: 'CIF',
    summary: 'Limitações na execução de tarefas: marcha, transferências, alcance, AVDs.',
    explore: [
      'Que tarefas a pessoa não consegue executar hoje?',
      'A limitação é por dor, por força, por medo ou por amplitude?',
      'O que ela consegue fazer com adaptação?',
    ],
  },
  {
    id: 'axis-2',
    label: 'Participação',
    framework: 'CIF',
    summary: 'Restrições em papéis de vida: trabalho, esporte, lazer, cuidado de outros, vida social.',
    explore: [
      'De que a pessoa deixou de participar por causa disso?',
      'Qual papel de vida ela mais quer recuperar?',
      'Há afastamento, perda de renda ou isolamento envolvido?',
    ],
  },
  {
    id: 'axis-3',
    label: 'Fatores ambientais',
    framework: 'CIF',
    summary: 'Barreiras e facilitadores externos: casa, trabalho, dispositivos, rede de apoio, acesso.',
    explore: [
      'O ambiente ajuda ou atrapalha a recuperação?',
      'Há dispositivo, órtese ou adaptação necessária e ausente?',
      'Quem em casa pode apoiar o programa domiciliar?',
    ],
  },
  {
    id: 'axis-4',
    label: 'Fatores pessoais',
    framework: 'CIF',
    summary: 'Crenças sobre dor e movimento, adesão, expectativa, experiências prévias, momento de vida.',
    explore: [
      'O que a pessoa acredita que está acontecendo no corpo dela?',
      'Há medo de movimento ou catastrofização?',
      'A expectativa dela é compatível com o prognóstico?',
    ],
  },
  {
    id: 'axis-5',
    label: 'Hipótese cinético-funcional',
    summary: 'Síntese que liga achado, limitação e restrição — descritiva e revisável, não diagnóstico médico.',
    explore: [
      'Qual a hipótese que costura exame, atividade e participação?',
      'Que achado a confirmaria e qual a derrubaria?',
      'Que diagnóstico diferencial precisa ficar em aberto?',
    ],
  },
  {
    id: 'axis-6',
    label: 'Prognóstico, metas e reavaliação',
    summary: 'Metas pactuadas com a pessoa, prazo estimado e o que será medido na reavaliação.',
    explore: [
      'Que metas foram pactuadas, em que prazo?',
      'Que medida objetiva será repetida para dizer se melhorou?',
      'Quando é a reavaliação e o que muda a conduta?',
    ],
  },
].map(toAxis);

export const FISIO_AXES_INTRO =
  'Andaime de raciocínio na CIF: do corpo à participação. Descritivo e provisório — orienta a conduta '
  + 'e justifica o plano, não substitui diagnóstico médico. Preencha o que fizer sentido para este caso.';

// ---- Módulos de contexto (por pertinência) ------------------------
const contextModules = [
  {
    id: 'dor-persistente-sensibilizacao',
    label: 'Dor persistente e sensibilização',
    summary:
      'Abrir quando a dor passa de 3 meses, não obedece mais ao padrão mecânico ou vem acompanhada de '
      + 'medo de movimento. Muda o raciocínio e a dose do exercício.',
    suggestedFor: [],
    fields: [
      ['ctxDorTempoPadrao', 'Tempo de dor e mudança do padrão ao longo do tempo',
        ['menos de 3 meses', 'mais de 3 meses', 'mais de 1 ano', 'espalhou para outras regiões', 'perdeu relação com esforço', 'piora sem motivo claro'],
        ['Há quanto tempo dói?', 'A dor mudou de lugar ou se espalhou?', 'Ainda dá para prever o que vai doer?']],
      ['ctxCrencasMedoMovimento', 'Crenças sobre a dor e medo de movimento',
        ['acha que vai piorar', 'evita movimentar', 'acredita em desgaste', 'teme lesionar de novo', 'entende que dor não é dano', 'já ouviu que não tem solução'],
        ['O que você acha que está acontecendo no seu corpo?', 'Tem receio de que o exercício piore?', 'Alguém já te disse que "não tem mais jeito"?']],
      ['ctxSonoEstresseDor', 'Sono, estresse e humor associados à dor',
        ['sono preservado', 'acorda de dor', 'sono não reparador', 'estresse elevado', 'humor deprimido', 'irritabilidade', 'ansiedade'],
        ['A dor atrapalha o sono? Acorda por causa dela?', 'Em períodos de estresse a dor muda?', 'Como está o humor desde que isso começou?']],
      ['ctxImpactoIdentidade', 'Impacto da dor na identidade e nos planos',
        ['sente-se limitada(o)', 'perdeu autonomia', 'depende de outros', 'abandonou atividades', 'medo do futuro', 'mantém projetos'],
        ['O que você deixou de ser capaz de fazer que mais te incomoda?', 'Isso mudou como você se enxerga?', 'O que teme para o futuro?']],
    ],
  },
  {
    id: 'trabalho-afastamento',
    label: 'Trabalho, ergonomia e afastamento',
    summary:
      'Abrir quando o trabalho for causa, fator mantenedor ou meta de retorno. Inclui perícia e '
      + 'readaptação, que mudam prazo e objetivo do tratamento.',
    suggestedFor: [],
    fields: [
      ['ctxExigenciaFisicaTrabalho', 'Exigência física da função',
        ['trabalho sentado', 'trabalho em pé', 'carga acima de 10kg', 'movimento repetitivo', 'vibração', 'turnos longos', 'sem pausa', 'ritmo imposto'],
        ['Descreva o que seu corpo faz numa jornada típica.', 'Quanto peso levanta e quantas vezes?', 'Consegue fazer pausas?']],
      ['ctxPostoErgonomia', 'Posto de trabalho e adaptações possíveis',
        ['posto adequado', 'cadeira inadequada', 'monitor baixo', 'sem apoio de pés', 'sem espaço', 'já houve avaliação ergonômica', 'empresa aceita adaptar'],
        ['Como é o posto onde você passa mais tempo?', 'Já houve avaliação ergonômica?', 'A empresa aceitaria alguma adaptação?']],
      ['ctxAfastamentoPericia', 'Afastamento, perícia e retorno ao trabalho',
        ['sem afastamento', 'afastado(a) atualmente', 'já retornou', 'em perícia', 'readaptação em curso', 'medo de perder o emprego', 'autônomo(a) sem cobertura'],
        ['Está afastada(o)? Desde quando?', 'Há processo de perícia ou readaptação?', 'O que precisa acontecer para você voltar?']],
      ['ctxRelacaoTrabalhoSintoma', 'Relação percebida entre trabalho e sintoma',
        ['piora no trabalho', 'melhora nas férias', 'sem relação percebida', 'piorou após mudança de função', 'conflito com a chefia', 'sobrecarga recente'],
        ['O sintoma muda nos fins de semana ou nas férias?', 'Piorou depois de alguma mudança na função?', 'Como está o ambiente com colegas e chefia?']],
    ],
  },
  {
    id: 'esporte-retorno',
    label: 'Esporte e retorno à prática',
    summary:
      'Abrir para quem treina ou compete. Retorno ao esporte tem critério próprio — tempo de lesão não '
      + 'é critério de alta.',
    suggestedFor: [],
    fields: [
      ['ctxModalidadeVolume', 'Modalidade, volume e nível de prática',
        ['recreativo', 'amador competitivo', 'profissional', 'treina 1-2x/semana', 'treina 3-5x/semana', 'treina diariamente', 'periodização orientada', 'sem orientação'],
        ['Que esporte pratica e com que frequência?', 'Compete? Em que nível?', 'Tem treinador orientando a carga?']],
      ['ctxLesaoPraticaHistorico', 'Histórico de lesões e recidivas no esporte',
        ['primeira lesão', 'lesão recorrente', 'mesma lesão do lado oposto', 'voltou antes da hora', 'já operou', 'sem lesão prévia'],
        ['Já se lesionou nessa modalidade antes?', 'Voltou a treinar antes de estar pronta(o) alguma vez?', 'A lesão se repete no mesmo lugar?']],
      ['ctxCriteriosRetorno', 'Critérios de retorno e testes aplicados',
        ['não definidos', 'força simétrica', 'testes de salto', 'controle neuromuscular', 'gesto esportivo sem dor', 'liberação médica', 'retorno progressivo'],
        ['Que critérios objetivos vamos usar para liberar o retorno?', 'Que testes serão repetidos antes da alta?', 'O retorno será progressivo ou direto?']],
      ['ctxPressaoCalendario', 'Pressão de calendário, equipe e expectativa',
        ['sem pressão', 'competição próxima', 'pressão do time', 'pressão pessoal', 'contrato em risco', 'temporada encerrada'],
        ['Há competição marcada?', 'Existe pressão de time, treinador ou sua para voltar logo?', 'O que acontece se o retorno atrasar?']],
    ],
  },
  {
    id: 'quedas-ambiente',
    label: 'Quedas e segurança domiciliar',
    summary:
      'Abrir a partir dos 60 anos, após qualquer queda ou quando houver medo de cair. Queda prévia é o '
      + 'maior preditor de nova queda.',
    suggestedFor: [],
    suggestedMinAge: 60,
    fields: [
      ['ctxHistoricoQuedas', 'Quedas no último ano: quantas, onde e como',
        ['nenhuma queda', 'uma queda', 'duas ou mais', 'queda com fratura', 'queda no banheiro', 'queda à noite', 'quase-quedas frequentes'],
        ['Caiu no último ano? Quantas vezes?', 'Onde e o que estava fazendo?', 'Conseguiu levantar sozinha(o)?']],
      ['ctxMedoRestricao', 'Medo de cair e restrição de atividades',
        ['sem medo', 'medo moderado', 'medo intenso', 'evita sair', 'evita banho sozinho(a)', 'reduziu caminhadas', 'anda só acompanhada(o)'],
        ['Tem medo de cair?', 'Deixou de fazer alguma coisa por causa desse medo?', 'Sai de casa sozinha(o)?']],
      ['ctxAmbienteDomiciliar', 'Riscos do ambiente domiciliar',
        ['tapetes soltos', 'escada sem corrimão', 'iluminação ruim', 'banheiro sem barra', 'piso escorregadio', 'móveis no caminho', 'casa adaptada'],
        ['Como é o caminho da cama até o banheiro à noite?', 'Há tapetes, degraus ou fios soltos?', 'O banheiro tem barra de apoio?']],
      ['ctxPolifarmaciaVisao', 'Medicações, visão e outros fatores de risco',
        ['sem medicação de risco', 'usa 5 ou mais medicações', 'sedativo', 'anti-hipertensivo', 'tontura ao levantar', 'visão ruim', 'catarata', 'calçado inadequado'],
        ['Quantas medicações usa por dia? Alguma dá sonolência ou tontura?', 'Sente tontura ao levantar rápido?', 'Quando foi a última consulta oftalmológica?']],
    ],
  },
  {
    id: 'gestacao-pos-parto-fisio',
    label: 'Gestação e pós-parto',
    summary:
      'Abrir quando houver gestação atual, pós-parto ou queixa que apareceu nesses períodos. Muda '
      + 'posicionamento, carga e critérios de segurança do exercício.',
    suggestedFor: [],
    fields: [
      ['ctxGestacaoAtual', 'Gestação atual: idade gestacional e intercorrências',
        ['não se aplica', 'primeiro trimestre', 'segundo trimestre', 'terceiro trimestre', 'gestação de risco', 'restrição médica', 'liberada para exercício'],
        ['Há gestação em curso? De quantas semanas?', 'Foi classificada como gestação de risco?', 'Há liberação médica para atividade física?']],
      ['ctxPosPartoRecuperacao', 'Pós-parto: tipo de parto, tempo e recuperação',
        ['não se aplica', 'pós-parto até 6 semanas', 'pós-parto até 6 meses', 'parto normal', 'cesárea', 'amamentando', 'cicatriz dolorosa', 'diástase percebida'],
        ['Quanto tempo faz do parto e como foi?', 'A cicatriz incomoda ou está aderida?', 'Percebeu afastamento da musculatura da barriga?']],
      ['ctxCargaPosicionamento', 'Tolerância a carga, posições e sintomas ao esforço',
        ['tolera bem', 'dor ao deitar de barriga para cima', 'desconforto em decúbito', 'peso perineal ao esforço', 'perda de urina ao exercício', 'tontura ao esforço'],
        ['Alguma posição já não é confortável?', 'Sente peso ou perda ao se esforçar?', 'Como o corpo responde ao exercício hoje?']],
      ['ctxRedeApoioPuerperio', 'Rede de apoio, sono e disponibilidade para o programa',
        ['boa rede de apoio', 'sem apoio', 'sono muito fragmentado', 'sem tempo para exercício', 'consegue 10 minutos por dia', 'traz o bebê à sessão'],
        ['Quem te ajuda com o bebê?', 'Como está o sono?', 'Quanto tempo por dia é realista para exercício em casa?']],
    ],
  },
].map(toContextModule);

// ---- Configuração completa ----------------------------------------
export const FISIOTERAPIA_ANAMNESE = {
  discipline: 'fisioterapia',
  label: 'Fisioterapia',
  recordType: FISIO_RECORD_TYPE,
  contentStatus: FISIO_CONTENT_STATUS,
  draftNotice: FISIO_DRAFT_NOTICE,

  pathsTitle: 'Escolha a área desta avaliação',
  pathsIntro:
    'A área define o exame, as escalas e os testes aplicados. Um mesmo paciente pode ter mais de uma '
    + 'queixa: escolha a que motiva esta avaliação — o contexto adicional entra pelos blocos de pertinência.',

  profiles: [
    {
      id: 'fisio_musculoesqueletica',
      label: 'Fisioterapia musculoesquelética',
      shortLabel: 'Musculoesquelética',
      description: 'Dor e disfunção articular, muscular ou tendínea; ortopedia e traumatologia.',
      sectionSet: 'musculoesqueletica',
    },
    {
      id: 'fisio_neurofuncional',
      label: 'Fisioterapia neurofuncional',
      shortLabel: 'Neurofuncional',
      description: 'AVC, TCE, lesão medular, doenças neurodegenerativas e neuropediatria.',
      sectionSet: 'neurofuncional',
    },
    {
      id: 'fisio_cardiorrespiratoria',
      label: 'Fisioterapia cardiorrespiratória',
      shortLabel: 'Cardiorrespiratória',
      description: 'Dispneia, doenças pulmonares e cardíacas, reabilitação pós-internação.',
      sectionSet: 'cardiorrespiratoria',
    },
    {
      id: 'fisio_pelvica',
      label: 'Fisioterapia pélvica',
      shortLabel: 'Pélvica',
      description: 'Incontinência, disfunção evacuatória, dor pélvica e assoalho pélvico.',
      sectionSet: 'pelvica',
    },
  ],

  sectionSets: {
    musculoesqueletica,
    neurofuncional,
    cardiorrespiratoria,
    pelvica,
  },

  textFields,
  checklistSections: FISIO_CHECKLIST_SECTIONS,
  checklistsTitle: 'Sinais organizados (proposta a validar)',
  // Grupos que respondem pelo escopo "Dores e sinais físicos" no
  // compartilhamento entre disciplinas.
  painGroups: ['fisioDor', 'fisioFuncao', 'fisioNeuro'],

  riskGroup: FISIO_RISK_GROUP,
  riskItems: FISIO_RISK_ITEMS,
  riskReminder: FISIO_RISK_REMINDER,
  riskTitle: 'Bandeiras vermelhas (sempre conferir)',
  riskNotesLabel: 'Anotações sobre bandeiras vermelhas e conduta combinada',

  axes: FISIO_AXES,
  axesIntro: FISIO_AXES_INTRO,
  axesTitle: 'Raciocínio cinético-funcional (CIF)',

  contextModules,
  contextTitle: 'Contexto específico (abrir conforme o caso)',

  // ---- Evolução ----
  // Indicadores numéricos são o que permite comparar sessões; o resto é
  // texto. Nenhum deles é calculado nem interpretado pelo sistema.
  evolution: {
    intro:
      'Registre cada atendimento: conduta realizada, resposta, intercorrências e progressão. '
      + 'Os indicadores servem para comparar sessões — quem lê a evolução é você.',
    indicators: [
      { id: 'eva', label: 'Dor (EVA 0-10)' },
      { id: 'amplitude', label: 'Amplitude (% do esperado)' },
      { id: 'forca', label: 'Força (0-5)' },
      { id: 'percepcaoMelhora', label: 'Percepção de melhora (0-10)' },
    ],
    fields: [
      { id: 'conduta', label: 'Conduta realizada nesta sessão', placeholder: 'Exercícios e dose, terapia manual, recursos…' },
      { id: 'respostaImediata', label: 'Resposta imediata', placeholder: 'Como respondeu durante e ao fim da sessão…' },
      { id: 'intercorrencias', label: 'Intercorrências', placeholder: 'Dor exacerbada, tontura, interrupção…' },
      { id: 'domiciliar', label: 'Programa domiciliar e adesão', placeholder: 'O que foi prescrito e o que está sendo feito…' },
      { id: 'proximosPassos', label: 'Progressão e próximos passos' },
      { id: 'obs', label: 'Observações' },
    ],
  },

  // ---- Relatório ----
  report: {
    modes: [
      { id: 'interno', label: 'Registro interno', title: 'REGISTRO CLÍNICO INTERNO — FISIOTERAPIA', scope: 'full' },
      { id: 'externo', label: 'Relatório de fisioterapia', title: 'RELATÓRIO DE FISIOTERAPIA', scope: 'summary' },
    ],
    // No documento que sai da clínica não se despeja a ficha inteira:
    // vão a queixa, a meta e a formulação. O detalhe fica no interno.
    summaryFieldIds: ['queixaPrincipal', 'historiaQueixa', 'objetivoFuncional'],
    externalNotice:
      'Documento emitido a pedido da pessoa atendida. Descreve avaliação e conduta fisioterapêutica; '
      + 'não substitui diagnóstico médico nem laudo de exame.',
  },

  riskFirstAction: 'Conferir primeiro as bandeiras vermelhas marcadas e registrar a conduta ou o encaminhamento.',
  emptyAction: 'Registrar a queixa e a meta funcional para iniciar a avaliação.',
  axesAction: 'Organizar os achados nos eixos da CIF que fizerem sentido para este caso.',
  readyAction: 'Definir metas mensuráveis e a data de reavaliação.',
};
