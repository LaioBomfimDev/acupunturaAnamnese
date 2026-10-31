// ============================================================
// Catálogo clínico da ficha de coleta ABA.
// Trazido do Atlas (src/clinical-catalog.ts) em 31/10/2026, sem mudar
// regra nenhuma: só os tipos do TypeScript saíram. Os mesmos códigos
// (resposta da tentativa, fase, medida, sonda) vivem nos CHECKs de
// supabase/migrations/20261101b_aba_coleta.sql — mudar um lado sem o outro
// quebra tests/regression/aba-catalog.test.mjs.
// ============================================================

// Respostas que NÃO entram no denominador de independência (Manual cap. 10,
// pág. 142-143): recusa/retirada de assentimento é registrada separadamente e
// não é classificada como erro; oportunidade não aplicável é excluída do
// denominador. "Não coletado" continua sendo a tentativa vazia (null).
export const EXCLUDED_FROM_DENOMINATOR = ['recusa', 'nao_aplicavel'];

// Catálogo clínico da ficha de coleta ABA.
//
// Este arquivo traduz a ficha usada em aula para listas selecionáveis: o
// supervisor configura o programa escolhendo itens destas listas (em vez de
// digitar texto livre) e a ficha do terapeuta se ajusta sozinha ao que foi
// escolhido. Mando, tato, ecoico e intraverbal aparecem como habilidades /
// operantes-alvo — nunca como técnicas de ensino.

// 2. Habilidades e comportamentos-alvo -----------------------------------------

export const TARGET_SKILLS = [
  { value: 'Mando', label: 'Mando', purpose: 'Ensinar a pedir objetos, atividades, ajuda, pausa ou atenção.' },
  { value: 'Tato', label: 'Tato', purpose: 'Ensinar a nomear objetos, pessoas, ações e acontecimentos.' },
  { value: 'Ecoico', label: 'Ecoico', purpose: 'Ensinar a repetir sons, sílabas ou palavras.' },
  { value: 'Intraverbal', label: 'Intraverbal', purpose: 'Ensinar a responder perguntas e completar verbalizações.' },
  { value: 'Imitação motora', label: 'Imitação motora', purpose: 'Reproduzir movimentos apresentados por outra pessoa.' },
  { value: 'Matching', label: 'Matching', purpose: 'Emparelhar objetos, imagens, cores ou categorias.' },
  { value: 'Espera', label: 'Espera', purpose: 'Permanecer adequadamente durante um intervalo.' },
  { value: 'Comunicação funcional (FCT)', label: 'Comunicação funcional (FCT)', purpose: 'Substituir um comportamento interferente por uma resposta comunicativa funcional.' },
  { value: 'Autonomia', label: 'Autonomia', purpose: 'Realizar atividades de vida diária com menor ajuda.' },
  { value: 'Habilidades sociais', label: 'Habilidades sociais', purpose: 'Interagir, compartilhar, esperar turnos e iniciar contato.' },
];

// 3. Estratégias de ensino ------------------------------------------------------

export const TEACHING_STRATEGIES = [
  { value: 'DTT', label: 'DTT (tentativas discretas)', purpose: 'Ensino estruturado por tentativas: instrução, resposta, consequência e intervalo.' },
  { value: 'NET', label: 'NET (ensino naturalístico)', purpose: 'Ensino em situações naturais, usando interesses e atividades cotidianas.' },
  { value: 'Ensino incidental', label: 'Ensino incidental', purpose: 'Aproveitamento de uma oportunidade iniciada ou motivada pela criança.' },
  { value: 'Análise de tarefas', label: 'Análise de tarefas', purpose: 'Divisão de uma habilidade complexa em pequenas etapas observáveis.' },
  { value: 'Encadeamento para frente', label: 'Encadeamento para frente', purpose: 'Ensino inicial da primeira etapa da sequência, avançando progressivamente.' },
  { value: 'Encadeamento para trás', label: 'Encadeamento para trás', purpose: 'O terapeuta realiza as etapas iniciais e a criança conclui a última.' },
  { value: 'Modelagem (shaping)', label: 'Modelagem (shaping)', purpose: 'Reforço de aproximações sucessivas até alcançar a resposta final. Não confundir com modelação, que é demonstrar a resposta para a criança imitar — essa é um nível de ajuda.' },
  { value: 'Treino de discriminação', label: 'Treino de discriminação', purpose: 'Ensino das condições em que uma resposta deve ou não ocorrer.' },
];

/**
 * "Treino de generalização" e "Manutenção" saíram desta lista: não são formatos
 * de ensino, são fases — e fase agora é um campo próprio, escolhido por toque na
 * ficha (ver PROGRAM_PHASES). Mantê-los aqui permitia a contradição de um
 * programa com formato "Manutenção" coletando em fase "Linha de base".
 *
 * Programas antigos que guardam esses valores continuam válidos: o formulário
 * mostra o valor histórico como opção extra até que alguém o troque.
 */
export const RETIRED_TEACHING_STRATEGIES = ['Treino de generalização', 'Manutenção'];

// 4. Procedimentos comportamentais ---------------------------------------------

export const BEHAVIOR_PROCEDURES = [
  { value: 'Reforço positivo', label: 'Reforço positivo', purpose: 'Apresentar uma consequência valorizada após a resposta adequada.' },
  { value: 'DRA', label: 'DRA', purpose: 'Reforçar um comportamento alternativo ao comportamento interferente.' },
  { value: 'DRI', label: 'DRI', purpose: 'Reforçar um comportamento incompatível com o comportamento interferente.' },
  { value: 'DRO', label: 'DRO', purpose: 'Reforçar períodos sem ocorrência do comportamento-alvo.' },
  { value: 'DRL', label: 'DRL', purpose: 'Reforçar a redução da frequência, sem exigir ausência total.' },
  // Único reforço diferencial que quer MAIS do comportamento: por isso a
  // direção do programa é um campo, e não uma dedução do tipo.
  { value: 'DRH', label: 'DRH', purpose: 'Reforçar quando a resposta apropriada ocorre acima de um critério mínimo — aumenta a frequência, não reduz.' },
  { value: 'FCT', label: 'FCT', purpose: 'Ensinar comunicação funcional como alternativa ao comportamento interferente.' },
  { value: 'Correção de erro', label: 'Correção de erro', purpose: 'Reapresentar a tentativa e oferecer a ajuda prevista no protocolo.' },
  { value: 'Pareamento', label: 'Pareamento', purpose: 'Construir uma relação positiva entre profissional, ambiente e reforçadores.' },
  { value: 'Extinção', label: 'Extinção', purpose: 'Suspender a consequência que mantinha o comportamento. Exige análise funcional, plano de segurança e autorização nominal da supervisão.' },
  { value: 'Extinção de fuga', label: 'Extinção de fuga', purpose: 'A fuga deixa de produzir a retirada da demanda, associada a comunicação funcional. Exige análise funcional, plano de segurança e autorização.' },
  { value: 'Interrupção e redirecionamento', label: 'Interrupção e redirecionamento', purpose: 'Interromper brevemente a resposta repetitiva e redirecionar para uma resposta apropriada. Exige análise funcional, plano de segurança e autorização.' },
  { value: 'Exposição gradual', label: 'Exposição gradual', purpose: 'Aproximar gradualmente do estímulo temido, reforçando tolerância. Exige análise funcional, plano de segurança e autorização.' },
];

/**
 * Procedimentos que não podem ser escolha livre (documento de técnicas, §9):
 * exigem análise funcional, definição operacional, plano de segurança e
 * autorização nominal da supervisão.
 *
 * Esta lista é só para a tela avisar antes; quem realmente barra é o banco, em
 * `private.is_restricted_procedure`. Uma tela não é lugar de trava clínica —
 * qualquer chamada direta à RPC passaria por cima dela.
 */
const RESTRICTED_PROCEDURES = [
  'extinção', 'extincao',
  'extinção de fuga', 'extincao de fuga',
  'interrupção e redirecionamento', 'interrupcao e redirecionamento',
  'bloqueio de resposta',
  'exposição gradual', 'exposicao gradual',
];

export const isRestrictedProcedure = (procedure) =>
  RESTRICTED_PROCEDURES.includes((procedure ?? '').trim().toLowerCase());

export const REINFORCEMENT_SCHEDULES

   = [
  { value: 'continuo', label: 'Contínuo', hint: 'Reforça toda resposta que atende ao critério. Indicado no início da aquisição.' },
  { value: 'intermitente', label: 'Intermitente', hint: 'Reforça parte das respostas, conforme esquema planejado. Indicado para manter o que já foi adquirido.' },
  { value: 'afinamento', label: 'Afinamento', hint: 'Aumenta gradualmente o esforço, o tempo ou o número de respostas exigidas antes do reforço.' },
];

export const reinforcementScheduleLabel = (schedule) =>
  REINFORCEMENT_SCHEDULES.find((entry) => entry.value === schedule)?.label ?? 'Não definido';

// 5. Estratégias de ajuda -------------------------------------------------------

// Hierarquia do menos para o mais intrusivo. O supervisor liga/desliga níveis e a
// ficha do terapeuta passa a mostrar só os níveis habilitados — em cada tentativa
// é registrada a ajuda mais intrusiva utilizada.

export const PROMPT_LEVELS = [
  { response: 'independente', code: 'I', label: 'Independente', intrusiveness: 0 },
  { response: 'ajuda_visual', code: 'AVS', label: 'Ajuda visual', intrusiveness: 1 },
  { response: 'ajuda_gestual', code: 'AG', label: 'Ajuda gestual', intrusiveness: 2 },
  { response: 'ajuda_verbal', code: 'AV', label: 'Ajuda verbal', intrusiveness: 3 },
  { response: 'modelacao', code: 'M', label: 'Modelação', intrusiveness: 4 },
  { response: 'fisica_parcial', code: 'AFP', label: 'Ajuda física parcial', intrusiveness: 5 },
  { response: 'fisica_total', code: 'AFT', label: 'Ajuda física total', intrusiveness: 6 },
];

export const PROMPT_FADING_STRATEGIES = [
  'Do menor para o maior suporte',
  'Do maior para o menor suporte',
  'Atraso de ajuda',
  'Esvanecimento gradual da ajuda',
];

// Hierarquia usada quando o supervisor ainda não configurou o programa.
export const DEFAULT_PROMPT_HIERARCHY = PROMPT_LEVELS.map((level) => level.response);

// 7. Códigos da ficha de tentativas --------------------------------------------

// Resultados que não são níveis de ajuda: aproximação, erro e ausência de
// resposta, além dos dois códigos que ficam fora do denominador clínico.
export const OUTCOME_CODES = [
  { response: 'aproximada', code: 'AP', label: 'Resposta aproximada' },
  { response: 'erro', code: 'E', label: 'Erro' },
  { response: 'sem_resposta', code: 'SR', label: 'Sem resposta' },
  { response: 'recusa', code: 'R', label: 'Recusa / retirada', excluded: true },
  { response: 'nao_aplicavel', code: 'NA', label: 'Não aplicável', excluded: true },
];

const TRIAL_CODES = {
  ...Object.fromEntries(PROMPT_LEVELS.map((level) => [level.response, level.code])),
  ...Object.fromEntries(OUTCOME_CODES.map((outcome) => [outcome.response, outcome.code])),
};

export const trialCode = (response) => TRIAL_CODES[response] ?? '?';

export const promptLevelOf = (response) =>
  PROMPT_LEVELS.find((level) => level.response === response) ?? null;

// Ordena a hierarquia escolhida pelo supervisor do menos para o mais intrusivo,
// descartando valores desconhecidos.
export function orderedPromptHierarchy(selected) {
  if (!selected?.length) return DEFAULT_PROMPT_HIERARCHY;
  const chosen = PROMPT_LEVELS.filter((level) => selected.includes(level.response));
  if (!chosen.length) return DEFAULT_PROMPT_HIERARCHY;
  return [...chosen]
    .sort((left, right) => left.intrusiveness - right.intrusiveness)
    .map((level) => level.response);
}

// 6. Formas de coleta de dados --------------------------------------------------

// `sheet` define qual ficha o terapeuta vê; `programType` define onde a forma de
// coleta pode ser usada. `measure` liga a forma de coleta à medida já existente
// dos programas de redução, para que a ficha mude sozinha conforme a dimensão.

export const COLLECTION_TYPES = [
  { value: 'tentativas', label: 'Tentativas', purpose: 'Aquisição de habilidades com oportunidades previamente definidas.', sheet: 'tentativas', programType: 'aquisicao' },
  { value: 'percentual_acertos', label: 'Percentual de acertos', purpose: 'Respostas corretas divididas pelas oportunidades realizadas.', sheet: 'tentativas', programType: 'aquisicao' },
  { value: 'percentual_independencia', label: 'Percentual de independência', purpose: 'Respostas independentes divididas pelas tentativas preenchidas.', sheet: 'tentativas', programType: 'aquisicao' },
  { value: 'tempo_maximo', label: 'Tempo máximo', purpose: 'Maior intervalo tolerado ou maior duração alcançada.', sheet: 'tentativas', programType: 'aquisicao', timeMeasure: 'tempo_maximo' },
  { value: 'frequencia', label: 'Frequência', purpose: 'Quantidade de vezes que o comportamento ocorreu.', sheet: 'contador', programType: 'reducao', measure: 'frequência', unit: 'ocorrências' },
  { value: 'taxa', label: 'Taxa', purpose: 'Frequência dividida pelo tempo de observação.', sheet: 'contador', programType: 'reducao', measure: 'taxa', unit: 'ocorrências/min' },
  { value: 'duracao', label: 'Duração', purpose: 'Tempo total de ocorrência do comportamento.', sheet: 'cronometro', programType: 'reducao', measure: 'duração', unit: 'segundos' },
  { value: 'latencia', label: 'Latência', purpose: 'Tempo entre a instrução e o início da resposta.', sheet: 'cronometro', programType: 'reducao', measure: 'latência', unit: 'segundos' },
  { value: 'intensidade', label: 'Intensidade', purpose: 'Classificação operacional da magnitude: leve, moderada ou alta.', sheet: 'escala', programType: 'reducao', measure: 'intensidade', unit: 'ocorrências' },
  { value: 'intervalo_parcial', label: 'Intervalo parcial', purpose: 'Registro se o comportamento ocorreu em algum momento do intervalo.', sheet: 'intervalo', programType: 'reducao', measure: 'intervalo parcial', unit: 'intervalos' },
  { value: 'intervalo_total', label: 'Intervalo total', purpose: 'Registro se o comportamento ocorreu durante todo o intervalo.', sheet: 'intervalo', programType: 'reducao', measure: 'intervalo total', unit: 'intervalos' },
  { value: 'amostragem_momentanea', label: 'Amostragem momentânea', purpose: 'Verificação da ocorrência no momento exato do término do intervalo.', sheet: 'intervalo', programType: 'reducao', measure: 'amostragem momentânea', unit: 'intervalos' },
  { value: 'produto_permanente', label: 'Produto permanente', purpose: 'Avaliação do resultado observável produzido pela atividade.', sheet: 'produto', programType: 'reducao', measure: 'frequência', unit: 'unidades produzidas' },
  { value: 'registro_abc', label: 'Registro ABC', purpose: 'Registro do antecedente, comportamento e consequência.', sheet: 'abc', programType: 'reducao', measure: 'frequência', unit: 'episódios' },
];

export const collectionTypeOf = (value) =>
  COLLECTION_TYPES.find((entry) => entry.value === value) ?? null;

export const collectionTypeLabel = (value) => collectionTypeOf(value)?.label ?? value;

// Formas de coleta que fazem sentido para cada tipo de programa.
export const collectionTypesFor = (type) =>
  COLLECTION_TYPES.filter((entry) => entry.programType === type || entry.programType === 'ambos');

/**
 * Programas criados antes deste catálogo guardam a forma de coleta como texto
 * livre ("Tentativa a tentativa", "frequência"). Traduz esse histórico para o
 * item equivalente do catálogo, sem reescrever o dado no banco.
 */
export function normalizeCollectionType(program

 ) {
  if (collectionTypeOf(program.collectionType)) return program.collectionType;
  if (program.type === 'reducao') {
    return COLLECTION_TYPES.find((entry) => entry.measure === program.measure)?.value ?? 'frequencia';
  }
  return 'tentativas';
}

export const TIME_MEASURES = [
  { value: 'nenhuma', label: 'Sem medida de tempo', hint: 'A ficha registra apenas a resposta de cada tentativa.' },
  { value: 'tempo_maximo', label: 'Tempo máximo alcançado', hint: 'Cronômetro por tentativa; o relatório traz o maior tempo e a média.' },
  { value: 'duracao', label: 'Duração da resposta', hint: 'Cronômetro por tentativa, do início ao fim da resposta.' },
  { value: 'latencia', label: 'Latência da resposta', hint: 'Cronômetro por tentativa, da instrução até o início da resposta.' },
];

export const timeMeasureLabel = (measure) =>
  TIME_MEASURES.find((entry) => entry.value === (measure ?? 'nenhuma'))?.label ?? 'Sem medida de tempo';

// 9b. Biblioteca de técnicas ----------------------------------------------------

// Os rótulos vivem aqui; o conteúdo das técnicas vive no banco, editável pela
// clínica. Só a taxonomia é do código, porque a busca e os filtros dependem
// dela para existir.
export const TECHNIQUE_CATEGORIES = [
  { value: 'formato_ensino', label: 'Formatos de ensino' },
  { value: 'ensino_habilidades', label: 'Ensino de novas habilidades' },
  { value: 'ajuda', label: 'Estratégias de ajuda' },
  { value: 'discriminacao', label: 'Ensino de discriminação' },
  { value: 'reforcamento', label: 'Reforçamento' },
  { value: 'reforco_diferencial', label: 'Reforço diferencial' },
  { value: 'baseada_funcao', label: 'Baseadas na função' },
  { value: 'reducao', label: 'Redução de interferentes' },
  { value: 'generalizacao', label: 'Generalização e manutenção' },
  { value: 'autogerenciamento', label: 'Autogerenciamento' },
];

export const techniqueCategoryLabel = (value) =>
  TECHNIQUE_CATEGORIES.find((entry) => entry.value === value)?.label ?? value;

/**
 * "O que você quer agora". É o primeiro filtro da biblioteca porque é assim que
 * a pergunta chega: a supervisora sabe o problema, e o nome da técnica é
 * justamente o que ela está tentando descobrir.
 */
export const TECHNIQUE_GOALS = [
  { value: 'ensinar_nova', label: 'Ensinar habilidade nova' },
  { value: 'comunicar', label: 'Ensinar a se comunicar' },
  { value: 'motivar', label: 'Aumentar motivação e iniciativa' },
  { value: 'discriminar', label: 'Ensinar a discriminar' },
  { value: 'autonomia', label: 'Aumentar autonomia' },
  { value: 'tolerar', label: 'Tolerar espera, negativa ou mudança' },
  { value: 'reduzir', label: 'Reduzir comportamento interferente' },
  { value: 'reduzir_ajuda', label: 'Retirar a ajuda' },
  { value: 'generalizar', label: 'Generalizar o que já aprendeu' },
  { value: 'manter', label: 'Manter o que já aprendeu' },
];

export const techniqueGoalLabel = (value) =>
  TECHNIQUE_GOALS.find((entry) => entry.value === value)?.label ?? value;

/** "O que mantém o comportamento" — segundo caminho de busca. */
export const BEHAVIOR_FUNCTIONS = [
  { value: 'fuga', label: 'Fuga / esquiva da demanda' },
  { value: 'atencao', label: 'Atenção' },
  { value: 'tangivel', label: 'Acesso a item ou atividade' },
  { value: 'sensorial', label: 'Automática / sensorial' },
];

export const behaviorFunctionLabel = (value) =>
  BEHAVIOR_FUNCTIONS.find((entry) => entry.value === value)?.label ?? value;

// 10. Fases do programa ---------------------------------------------------------

// A fase de cada sessão é o que separa "antes de ensinar" de "depois de ensinar".
// O terapeuta troca por toque na ficha; o padrão vem do status do programa para
// que o caso comum não exija nenhum toque.
export const PROGRAM_PHASES = [
  { value: 'linha_de_base', label: 'Linha de base', short: 'LB', hint: 'Medida antes de iniciar o ensino, sem ajuda planejada nem reforço programado.' },
  { value: 'intervencao', label: 'Intervenção', short: 'INT', hint: 'Ensino em curso, com a ajuda e o reforço previstos no programa.' },
  { value: 'generalizacao', label: 'Generalização', short: 'GEN', hint: 'Sonda fora da condição de ensino: outra pessoa, outro material ou outro ambiente.' },
  { value: 'manutencao', label: 'Manutenção', short: 'MAN', hint: 'Verificação da permanência da habilidade depois do critério atingido.' },
];

export const phaseLabel = (phase) =>
  PROGRAM_PHASES.find((entry) => entry.value === phase)?.label ?? 'Intervenção';

export const phaseShortLabel = (phase) =>
  PROGRAM_PHASES.find((entry) => entry.value === phase)?.short ?? 'INT';

/**
 * Fase sugerida a partir do status que o supervisor já definiu no programa.
 * "Planejado" é o status em que um programa nasce e do qual nada o tira sozinho
 * (ver NOT_COLLECTABLE_STATUSES em calculations.ts) — nesse ponto ainda não houve
 * ensino, então a primeira coleta é linha de base por padrão.
 */
export function defaultPhaseForStatus(status) {
  if (status === 'Planejado') return 'linha_de_base';
  if (status === 'Generalização') return 'generalizacao';
  if (status === 'Manutenção') return 'manutencao';
  return 'intervencao';
}

// O que muda numa sonda de generalização. O terapeuta escolhe a dimensão que
// variou; a análise para de inferir.
export const GENERALIZATION_CONDITIONS = [
  { value: 'pessoa', label: 'Pessoa diferente' },
  { value: 'material', label: 'Material diferente' },
  { value: 'ambiente', label: 'Ambiente diferente' },
  { value: 'instrucao', label: 'Instrução diferente' },
  { value: 'rotina', label: 'Rotina diferente' },
  { value: 'reforcador', label: 'Reforçador diferente' },
];

export const generalizationConditionLabel = (value) =>
  GENERALIZATION_CONDITIONS.find((entry) => entry.value === value)?.label ?? 'Condição não informada';

// Material / estímulo usado na sessão — dimensão de generalização (seção 10).
export const SESSION_MATERIALS = [
  'Material do treino',
  'Material novo',
  'Figuras / cartões',
  'Objetos concretos',
  'Tablet / aplicativo',
  'Sem material específico',
  'Outro',
];

// 8. Informações adicionais da sessão -------------------------------------------

export const ARRIVAL_STATES = [
  'Regulado e disponível',
  'Sonolento',
  'Agitado',
  'Choroso',
  'Resistente à entrada',
  'Indisponível para demanda',
];

export const HEALTH_CONDITIONS = [
  'Sem alterações',
  'Resfriado / febre recente',
  'Dor relatada',
  'Sono insuficiente',
  'Alteração de medicação',
  'Alimentação alterada',
];

export const ROUTINE_CHANGES = [
  'Sem alteração',
  'Mudança de horário',
  'Troca de terapeuta',
  'Ambiente diferente',
  'Viagem / feriado',
  'Evento familiar',
];

// Registro rápido de comportamento interferente e de reforçador (seções 7 e 9):
// tudo por toque. A digitação fica reservada ao item "Outro".
export const BEHAVIOR_INTENSITIES = ['Leve', 'Moderada', 'Alta'];

/**
 * Posição da intensidade na escala operacional, para o gráfico da seção 11
 * ("linha ou colunas com escala operacional"). Escala ordinal: a distância entre
 * leve e moderada não é a mesma que entre moderada e alta, então o número serve
 * para ordenar e desenhar — nunca para tirar média.
 */
export function intensityRank(value, scale = BEHAVIOR_INTENSITIES) {
  if (!value) return null;
  const index = scale.findIndex((level) => level.toLowerCase() === value.toLowerCase());
  return index < 0 ? null : index + 1;
}

export const BEHAVIOR_ANTECEDENTS = [
  'Espera',
  'Negativa',
  'Interrupção de atividade',
  'Demanda',
  'Transição',
  'Retirada de item',
  'Atenção indisponível',
  'Estímulo sensorial',
  'Outro',
];

export const BEHAVIOR_CONSEQUENCES = [
  'Acesso ao item',
  'Atenção do adulto',
  'Pausa / escape da demanda',
  'Sem consequência planejada',
  'Outro',
];

export const BEHAVIOR_CONDUCTS = [
  'Redirecionamento',
  'Ajuda visual',
  'Comunicação funcional',
  'Pausa planejada',
  'Reforço diferencial',
  'Ajuste da demanda',
  'Procedimento previsto no plano',
  'Outro',
];

export const REINFORCER_EFFICIENCIES = [
  'Muito eficiente',
  'Eficiente',
  'Parcialmente eficiente',
  'Ineficaz',
  'Recusado',
];

// Situação de risco (seção 8): o tipo, a intensidade e a intervenção viram
// listas fechadas. O que aconteceu e o acompanhamento seguem em texto — é o
// registro que a supervisão revisa, e resumir isso em botão empobreceria o dado.
export const RISK_SITUATIONS = [
  'Risco de lesão',
  'Autoagressão',
  'Heteroagressividade',
  'Fuga com risco',
  'Destruição de patrimônio',
  'Intervenção física necessária',
  'Outro',
];

export const RISK_INTERVENTIONS = [
  'Bloqueio de segurança',
  'Redirecionamento físico',
  'Retirada de risco ambiental',
  'Procedimento previsto no plano de crise',
  'Outro',
];

export const RISK_INJURIES = [
  'Sem lesão',
  'Lesão leve',
  'Necessitou avaliação',
  'Outro',
];

export const GUARDIAN_CONTACT_OPTIONS = [
  'Comunicado no mesmo dia',
  'Comunicação pendente',
  'Não se aplica',
];

export const PEOPLE_PRESENT_OPTIONS = [
  'Somente terapeuta',
  'Mãe',
  'Pai',
  'Responsável',
  'Professor',
  'Cuidador',
  'Familiar',
  'Outro',
];

export const OTHER_OPTION = 'Outro';

export const MOTIVATION_LEVELS = [
  'Alta',
  'Média',
  'Baixa',
  'Variável durante a sessão',
];

// 13. Modelos prontos da ficha de aula -----------------------------------------

// Os quatro treinos organizados na ficha usada em aula. Cada modelo já traz a
// configuração completa — o supervisor só revisa e aprova.

export const PROGRAM_PRESETS = [
  {
    id: 'espera',
    label: 'Espera',
    type: 'aquisicao',
    name: 'Espera',
    skill: 'Espera',
    objective: 'Tolerar até 30 segundos de espera.',
    target: 'Permanecer no local sem fuga, agressão ou choro intenso durante o intervalo programado.',
    applicationCondition: 'Após solicitar um item ou atividade preferida, com o item visível e o acesso adiado pelo tempo previsto.',
    correctResponseDefinition: 'Permanece no local até o fim do intervalo, sem fuga, agressão ou choro intenso.',
    errorDefinition: 'Sai do local, apresenta agressão, autoagressão ou choro intenso antes do fim do intervalo.',
    teachingFormat: 'DTT',
    procedure: 'Reforço positivo',
    promptHierarchy: ['independente', 'ajuda_visual', 'ajuda_gestual'],
    promptFading: 'Do menor para o maior suporte',
    collectionType: 'tempo_maximo',
    trialCount: 5,
    timeMeasure: 'tempo_maximo',
    criterion: 'Pelo menos 80% de acertos durante três sessões consecutivas e 30 segundos de espera.',
    minimumPercentage: 80,
    consecutiveIndependent: 3,
    requiredSessions: 3,
    requiredEnvironments: 2,
    requiredTherapists: 2,
    minimumSeconds: 30,
    generalizationCriterion: 'Nova pessoa, material ou rotina, mantendo 80% de acertos.',
    maintenanceCriterion: 'Sondagem semanal por 30 dias após o critério.',
  },
  {
    id: 'fct',
    label: 'Comunicação funcional (FCT)',
    type: 'aquisicao',
    name: 'Comunicação funcional',
    skill: 'Comunicação funcional (FCT)',
    objective: 'Substituir o comportamento interferente por um pedido funcional.',
    target: 'Emite a resposta comunicativa combinada (fala, gesto ou figura) diante da situação-alvo.',
    applicationCondition: 'Diante da situação que costuma evocar o comportamento interferente (tarefa difícil, item indisponível ou fim de atividade preferida).',
    correctResponseDefinition: 'Emite a resposta comunicativa funcional antes do comportamento interferente, em até 10 segundos.',
    errorDefinition: 'Apresenta o comportamento interferente ou não emite pedido no intervalo previsto.',
    teachingFormat: 'NET',
    procedure: 'FCT',
    promptHierarchy: ['independente', 'ajuda_gestual', 'modelacao', 'fisica_parcial'],
    promptFading: 'Do maior para o menor suporte',
    collectionType: 'percentual_independencia',
    trialCount: 10,
    timeMeasure: 'nenhuma',
    criterion: '80% de respostas funcionais independentes em três sessões consecutivas.',
    minimumPercentage: 80,
    consecutiveIndependent: 5,
    requiredSessions: 3,
    requiredEnvironments: 2,
    requiredTherapists: 2,
    minimumSeconds: 0,
    generalizationCriterion: 'Mesmo desempenho com duas pessoas e dois ambientes.',
    maintenanceCriterion: 'Sondagem quinzenal por 30 dias.',
  },
  {
    id: 'frustracao',
    label: 'Tolerância à frustração',
    type: 'reducao',
    name: 'Tolerância à frustração',
    skill: 'Autonomia',
    objective: 'Reduzir episódios de frustração diante de negativa ou interrupção.',
    target: 'Episódio de choro intenso, protesto agressivo ou queda ao solo após negativa ou interrupção.',
    applicationCondition: 'Situações de negativa, espera imposta ou interrupção de atividade preferida durante a sessão.',
    correctResponseDefinition: 'Aceita a negativa mantendo-se na atividade, com ou sem apoio verbal.',
    errorDefinition: 'Inicia episódio de frustração conforme a definição operacional do comportamento.',
    teachingFormat: 'NET',
    procedure: 'DRA',
    promptHierarchy: ['independente', 'ajuda_verbal', 'modelacao'],
    promptFading: 'Esvanecimento gradual da ajuda',
    collectionType: 'frequencia',
    trialCount: 0,
    timeMeasure: 'nenhuma',
    criterion: 'Redução de 70% sobre a linha de base em três sessões consecutivas.',
    minimumPercentage: 0,
    consecutiveIndependent: 0,
    requiredSessions: 3,
    requiredEnvironments: 2,
    requiredTherapists: 2,
    minimumSeconds: 0,
    generalizationCriterion: 'Mesma redução em casa e na escola.',
    maintenanceCriterion: 'Monitoramento mensal por 60 dias.',
    measure: 'frequência',
    unit: 'episódios',
    reductionCriterion: 'Redução de 70% sobre a linha de base.',
  },
  {
    id: 'generalizacao',
    label: 'Generalização',
    type: 'aquisicao',
    name: 'Generalização da habilidade',
    skill: 'Habilidades sociais',
    objective: 'Manter a habilidade adquirida com novas pessoas, materiais e ambientes.',
    target: 'Emite a resposta já dominada diante de pessoa, material ou ambiente diferente do treino original.',
    applicationCondition: 'Sondas conduzidas fora da condição de ensino: outro terapeuta, outro material ou outro ambiente.',
    correctResponseDefinition: 'Emite a resposta-alvo de forma independente na condição nova, sem retreino.',
    errorDefinition: 'Não emite a resposta ou precisa de ajuda acima do teto previsto na condição nova.',
    // O formato é o ensino naturalístico; o que faz deste um programa de
    // generalização é a fase, não o rótulo do formato.
    teachingFormat: 'NET',
    procedure: 'Reforço positivo',
    promptHierarchy: ['independente', 'ajuda_gestual'],
    promptFading: 'Atraso de ajuda',
    collectionType: 'percentual_independencia',
    trialCount: 5,
    timeMeasure: 'nenhuma',
    criterion: '80% de independência em três ambientes e com duas pessoas diferentes.',
    minimumPercentage: 80,
    consecutiveIndependent: 4,
    requiredSessions: 3,
    requiredEnvironments: 3,
    requiredTherapists: 2,
    minimumSeconds: 0,
    generalizationCriterion: 'Três ambientes e duas pessoas, sem retreino.',
    maintenanceCriterion: 'Sondagem mensal por 90 dias.',
  },
];
