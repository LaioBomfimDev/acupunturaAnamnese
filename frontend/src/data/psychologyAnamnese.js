// ============================================================
// DADOS: Anamnese de Psicologia — RASCUNHO A VALIDAR
// Fase 5 do plano (docs/plano-clinica-multidisciplinar.md);
// conteúdo em docs/plano-anamnese-multidisciplinar.md §2.2 e
// docs/anamnese-psicologia-perguntas.md.
//
// TUDO aqui é a proposta conservadora a validar: a psicóloga é a
// autoridade e vai cortar/trocar/reescrever. Até lá o workspace
// exibe o banner de rascunho.
//
// FONTE ÚNICA (decisão do dono do produto, 2026-07-13): o conteúdo
// clínico rico — sinais de risco (com perguntas de triagem e sinais
// a observar), eixos de avaliação e o roteiro de perguntas — vem do
// mesmo rascunho já extraído dos livros (psychAnamneseDraft.json,
// DSM-5-TR / CID-11 / ABA-TEA / Neuropsicologia-CFP). Antes o
// workspace usava um vocabulário de leigo bem mais pobre; agora ele
// espelha o que está na fila de curadoria. A psicóloga corrige lá e
// aqui de uma vez só.
//
// IA nesta disciplina: sugere marcações E redige uma leitura
// diagnóstica em RASCUNHO — o profissional revisa, aceita/ignora e
// pode Corrigir (loop de ensino igual ao MTC). A IA nunca decide.
// ============================================================

import { checklists } from './checklists.js';
import draft from './psychAnamneseDraft.json' with { type: 'json' };
import {
  getAllPsychologyProfileFields,
  getPsychologyProfileSections,
} from './psychologyIntakeProfiles.js';
import {
  getAllPsychologyContextFields,
  getOpenPsychologyContextFields,
  getSuggestedContextModules,
} from './psychologyContextModules.js';

// Estado editorial do vocabulário — vira 'aprovado' quando a
// psicóloga validar (gate humano, AGENTS.md §0/§8).
export const PSYCHOLOGY_CONTENT_STATUS = 'rascunho_a_validar';

export const PSYCHOLOGY_DRAFT_NOTICE =
  'Conteúdo provisório formulado a partir da literatura (DSM-5-TR, CID-11, ABA/TEA, Neuropsicologia-CFP) '
  + 'e ainda não validado pela psicóloga. O registro já vale como anotação clínica, mas o vocabulário, '
  + 'as perguntas e os eixos podem mudar quando ela revisar.';

// record_type usados em clinical_records (discipline = psicologia).
// A anamnese clínica é UM registro que carrega a sessão inteira do
// paciente — campos, marcações, eixos, evoluções e o relatório —
// espelhando o "estado único" da MTC. Evolução e Relatório de Psi
// gravam dentro deste mesmo registro (session.evolucoes / .relatorio),
// então não há record_type novo nem migração para a Rodada 1.
export const PSI_ANAMNESE_RECORD_TYPE = 'psi_anamnese';
export const PSI_NEURO_RECORD_TYPE = 'psi_neuro_avaliacao';

// Abas do workspace de Psicologia (Plano C). Ordem e rótulos espelham
// os grupos da Sidebar. As abas teóricas ainda são placeholders na
// Rodada 1 — ver PsychologyPlaceholder.
export const PSYCHOLOGY_TABS = {
  HOME: 'Tela inicial',
  PAINEL: 'Painel',
  ANAMNESE: 'Anamnese',
  PERGUNTAS_COMPLEMENTARES: 'Perguntas complementares',
  SINTESE: 'Síntese do caso',
  HIPOTESES: 'Hipóteses/diagnóstico',
  OBJETIVOS: 'Objetivos',
  PLANO: 'Plano terapêutico',
  EVOLUCAO: 'Evolução',
  RELATORIO: 'Relatório',
  DOCUMENTOS: 'Documentos',
  BIBLIOTECA: 'Biblioteca',
};

// Abas ainda não implementadas (renderizam PsychologyPlaceholder na
// Rodada 1; viram fluxos reais na Rodada 2, com a psicóloga).
export const PSYCHOLOGY_PLACEHOLDER_TABS = [
  PSYCHOLOGY_TABS.SINTESE,
  PSYCHOLOGY_TABS.OBJETIVOS,
  PSYCHOLOGY_TABS.PLANO,
  PSYCHOLOGY_TABS.BIBLIOTECA,
];

// Modalidade do workspace de Psi (decisão da psicóloga em 2026-07-07).
// A avaliação neuropsicológica migrou para a disciplina própria
// Neuropsicologia em 10/09/2026 — ver NeuropsychologyWorkspace.jsx.
export const PSYCHOLOGY_MODALITIES = [
  {
    id: 'anamnese_clinica',
    label: 'Anamnese clínica',
    description: 'Demanda, história, triagem de risco, eixos de avaliação e registro de sessão.',
    recordType: PSI_ANAMNESE_RECORD_TYPE,
    available: true,
  },
];

export function getPsychologyModality(id) {
  return PSYCHOLOGY_MODALITIES.find(item => item.id === id) || null;
}

// Acha o bloco do roteiro do rascunho por prefixo do nome (tolerante
// a acentos/pontuação), para reaproveitar as perguntas já extraídas.
function questionsFor(blockPrefix) {
  const block = (draft.questionnaire || []).find(b =>
    b.block?.toLowerCase().startsWith(blockPrefix.toLowerCase()));
  return block?.questions ? [...block.questions] : [];
}

// Campos de texto livre (plano §2.2). Cada campo carrega:
//  * `quickWords`: chips que APENDAM a palavra na textarea (digitação
//    mínima — pedido do dono do produto);
//  * `questionGuide`: perguntas concretas do roteiro extraído, para
//    guiar a escuta (o profissional lê e pergunta; não é texto a
//    inserir). Antes os campos eram um rótulo solto — daí a queixa de
//    "muito fraco".
export const PSYCHOLOGY_TEXT_FIELDS = [
  {
    id: 'demanda',
    label: 'Demanda / queixa principal (nas palavras da pessoa)',
    textarea: true,
    quickWords: ['ansiedade', 'tristeza', 'estresse no trabalho', 'conflitos familiares', 'luto', 'insônia', 'crises de pânico', 'autoestima baixa'],
    questionGuide: questionsFor('Demanda'),
  },
  {
    id: 'motivoBusca',
    label: 'O que motivou a busca por atendimento agora',
    textarea: true,
    quickWords: ['piora recente', 'crise recente', 'evento marcante', 'indicação médica', 'indicação de familiar', 'decisão própria'],
    questionGuide: questionsFor('Por que agora'),
  },
  {
    id: 'historiaPessoal',
    label: 'História pessoal e de vida relevante',
    textarea: true,
    quickWords: ['infância difícil', 'perda importante', 'separação recente', 'mudança recente', 'violência sofrida', 'dificuldades no trabalho/estudo'],
    questionGuide: questionsFor('História pessoal'),
  },
  {
    id: 'saudeMental',
    label: 'Histórico de saúde mental e tratamentos anteriores (incl. medicação psiquiátrica)',
    textarea: true,
    quickWords: ['primeira vez em terapia', 'terapia anterior', 'acompanhamento psiquiátrico', 'usa medicação psiquiátrica', 'já usou medicação', 'internação prévia', 'histórico familiar', 'sem tratamento anterior'],
    questionGuide: questionsFor('Saúde mental'),
  },
  {
    id: 'redeApoio',
    label: 'Rede de apoio / contexto familiar e social',
    textarea: true,
    quickWords: ['mãe', 'pai', 'avó', 'irmãos', 'cônjuge', 'filhos', 'amigos', 'mora sozinho(a)'],
    questionGuide: questionsFor('Rede de apoio'),
  },
  {
    id: 'observacoesSessao',
    label: 'Observações da sessão',
    textarea: true,
    quickWords: ['choro na sessão', 'discurso organizado', 'boa vinculação', 'resistência inicial', 'orientações dadas', 'tema para próxima sessão'],
    questionGuide: questionsFor('Observações da sessão'),
  },
];

export const PSYCHOLOGY_PROFILE_FIELDS = getAllPsychologyProfileFields();

export const PSYCHOLOGY_CONTEXT_FIELDS = getAllPsychologyContextFields();

/**
 * Campos de texto ATIVOS da ficha: escuta livre + roteiro da faixa etária
 * + módulos de contexto abertos. Módulo fechado não entra — é o que impede
 * pergunta que não cabe no caso de contar como lacuna, no relatório ou na IA.
 *
 * @param {string} profileId percurso escolhido
 * @param {object} [contextModules] mapa {moduleId: boolean} da sessão
 */
export function getPsychologyTextFields(profileId, contextModules) {
  const profileFields = getPsychologyProfileSections(profileId)
    .flatMap(section => section.fields);
  return [
    ...PSYCHOLOGY_TEXT_FIELDS,
    ...profileFields,
    ...getOpenPsychologyContextFields(contextModules),
  ];
}

// Perguntas de "Funcionamento atual" — guiam a seção de marcações
// (humor, sono, ansiedade, rotina) logo abaixo dos campos livres.
export const PSYCHOLOGY_FUNCTIONING_GUIDE = questionsFor('Funcionamento atual');

// Apendar palavra de chip na textarea: vazio → capitalizada; com texto →
// separa por ", " (ou só espaço, se o texto já termina em pontuação).
export function appendQuickWord(current, word) {
  const base = String(current || '').trimEnd();
  const clean = String(word || '').trim();
  if (!clean) return base;
  if (!base) return clean.charAt(0).toUpperCase() + clean.slice(1);
  const separator = /[.,;:!?]$/.test(base) ? ' ' : ', ';
  return `${base}${separator}${clean}`;
}

// Vocabulário fechado proposto. Grupos com prefixo psi* para nunca
// colidir com os grupos da MTC (selectedMap/correções futuras).
// Listas enriquecidas a partir do rascunho dos livros (categorias
// Humor/Ansiedade/Sono/Alimentação/Cognição/Desenvolvimento/Trauma/
// Funcionamento) + itens já existentes. Sono reaproveita o módulo MTC.
export const psychologyChecklists = {
  psiHumor: [
    'Tristeza persistente', 'Apatia / desânimo', 'Perda de prazer (anedonia)',
    'Oscilações de humor', 'Irritabilidade', 'Choro frequente',
    'Culpa excessiva', 'Baixa autoestima', 'Desesperança',
  ],
  psiAnsiedade: [
    'Preocupação excessiva', 'Pensamento acelerado / ruminação',
    'Sintomas físicos (taquicardia, sudorese)', 'Inquietação',
    'Evitação de situações', 'Crises de pânico', 'Medos específicos',
    'Tensão constante',
  ],
  psiSono: checklists.sono,
  psiAlimentacao: [
    'Redução do apetite', 'Aumento do apetite', 'Mudança de peso',
    'Compulsão alimentar', 'Restrição / relação disfuncional com a comida',
  ],
  psiCognicao: [
    'Dificuldade de atenção / concentração', 'Queixas de memória',
    'Dificuldade de linguagem / comunicação', 'Lentificação do pensamento',
    'Dificuldade de organização e planejamento',
  ],
  psiDesenvolvimento: [
    'Atraso em marcos do desenvolvimento', 'Dificuldade de aprendizagem escolar',
    'Dificuldade de interação social', 'Comportamentos repetitivos / restritos',
  ],
  psiTrauma: [
    'Exposição a evento traumático', 'Revivências / pesadelos',
    'Evitação de lembranças', 'Hipervigilância', 'Entorpecimento emocional',
  ],
  psiFuncionamento: [
    'Prejuízo no trabalho/estudo', 'Prejuízo nas relações',
    'Isolamento social', 'Autocuidado prejudicado',
    'Alteração de apetite', 'Queda de energia',
  ],
  psiSubstancias: [
    'Álcool', 'Tabaco', 'Cafeína em excesso', 'Maconha',
    'Outras substâncias', 'Uso aumentou recentemente',
  ],
};

export const PSYCHOLOGY_CHECKLIST_SECTIONS = [
  { group: 'psiHumor', title: 'Humor e afeto', items: psychologyChecklists.psiHumor },
  { group: 'psiAnsiedade', title: 'Ansiedade', items: psychologyChecklists.psiAnsiedade },
  { group: 'psiSono', title: 'Sono', items: psychologyChecklists.psiSono },
  { group: 'psiAlimentacao', title: 'Alimentação', items: psychologyChecklists.psiAlimentacao },
  { group: 'psiCognicao', title: 'Cognição (atenção, memória, linguagem)', items: psychologyChecklists.psiCognicao },
  { group: 'psiDesenvolvimento', title: 'Desenvolvimento e aprendizagem', items: psychologyChecklists.psiDesenvolvimento },
  { group: 'psiTrauma', title: 'Trauma e eventos estressores', items: psychologyChecklists.psiTrauma },
  { group: 'psiFuncionamento', title: 'Funcionamento no dia a dia', items: psychologyChecklists.psiFuncionamento },
  { group: 'psiSubstancias', title: 'Uso de substâncias', items: psychologyChecklists.psiSubstancias },
];

// ---- Eixos de avaliação e formulação (a "avaliação") -------------
// Vêm do rascunho dos livros (draft.axis). São o andaime de raciocínio
// clínico: cada eixo traz o que explorar e um campo para a formulação
// da profissional (session.axisNotes[id]). Descritivo, revisável, sem
// diagnóstico automático — invariante de todas as disciplinas.
export const PSYCHOLOGY_AXES = (draft.axis || []).map((axis, i) => ({
  id: `axis-${i}`,
  label: axis.label,
  framework: axis.framework || '',
  summary: axis.summary || '',
  explore: Array.isArray(axis.explore) ? [...axis.explore] : [],
}));

export const PSYCHOLOGY_AXES_INTRO =
  'Andaime de raciocínio para organizar a leitura do caso. Descritivo e provisório — '
  + 'orienta a escuta, não fecha diagnóstico. Preencha o que fizer sentido para este atendimento.';

// ---- Bloco crítico de risco (plano §2.2: "crítico e obrigatório") --
// Itens ricos vindos do rascunho: cada sinal traz perguntas de
// triagem, o que observar e um lembrete de conduta. O sistema DESTACA
// e LEMBRA — nunca decide (invariante de todas as disciplinas).
export const PSYCHOLOGY_RISK_GROUP = 'psiRisco';

export const PSYCHOLOGY_RISK_ITEMS = (draft.risk || []).map((risk, i) => ({
  id: `risk-${i}`,
  label: risk.label,
  priority: risk.priority || 'alta',
  summary: risk.summary || '',
  screening: Array.isArray(risk.screening) ? [...risk.screening] : [],
  observe: Array.isArray(risk.observe) ? [...risk.observe] : [],
  reminder: risk.reminder || '',
}));

// Rótulos planos para o selectedMap / CheckGrid / caso da IA.
export const psychologyRiskChecklist = PSYCHOLOGY_RISK_ITEMS.map(item => item.label);

export const PSYCHOLOGY_RISK_REMINDER =
  'Sinal de risco marcado: avalie a conduta conforme seu julgamento clínico e o protocolo da clínica '
  + '(rede de urgência, contato de apoio, encaminhamento). O sistema destaca e lembra — a decisão é sempre sua.';

// Sessão vazia da anamnese clínica de Psi. selectedMap usa o mesmo
// formato do motor MTC ("grupo:item" → boolean) para reaproveitar o
// CheckGrid e, no futuro, o loop de sugestão/Corrigir.
export function createEmptyPsychologySession() {
  return {
    modality: 'anamnese_clinica',
    intakeProfile: null,
    intakeSelectedAt: null,
    fields: Object.fromEntries(
      [
        ...PSYCHOLOGY_TEXT_FIELDS,
        ...PSYCHOLOGY_PROFILE_FIELDS,
        ...PSYCHOLOGY_CONTEXT_FIELDS,
      ].map(field => [field.id, '']),
    ),
    // Módulos de contexto abertos ({moduleId: boolean}). Abrem por
    // pertinência clínica; o percurso escolhido apenas pré-abre alguns.
    contextModules: {},
    // Na anamnese infantojuvenil, cada campo identifica quem respondeu.
    // O histórico preserva versões anteriores para comparação futura.
    fieldInformants: {},
    responseHistory: {},
    selectedMap: {},
    // Formulação por eixo de avaliação (id do eixo → texto).
    axisNotes: {},
    riskNotes: '',
    // Última "Leitura da IA (rascunho)" gerada — persiste com a sessão
    // para o profissional retomar/corrigir depois. null = nunca gerada.
    aiReading: null,
    // Perguntas propostas pela IA só entram aqui após seleção explícita
    // da profissional. Pergunta, resposta, informante e proveniência
    // permanecem editáveis e seguem para a IA/relatório como dados clínicos.
    complementaryQuestions: [],
    hypothesisReviews: [],
    // Registros de sessão (aba Evolução) e rascunhos de documento
    // (aba Relatório), guardados no mesmo registro da anamnese.
    evolucoes: [],
    relatorio: {},
  };
}

export function normalizePsychologySession(raw) {
  const empty = createEmptyPsychologySession();
  if (!raw || typeof raw !== 'object') return empty;
  return {
    ...empty,
    ...raw,
    fields: { ...empty.fields, ...(raw.fields || {}) },
    // Registro anterior a 07/08/2026 não tem contextModules: cai no padrão
    // do percurso, sem inventar módulo aberto que a profissional não pediu.
    contextModules: raw.contextModules && typeof raw.contextModules === 'object'
      ? { ...raw.contextModules }
      : getSuggestedContextModules(raw.intakeProfile),
    fieldInformants: { ...empty.fieldInformants, ...(raw.fieldInformants || {}) },
    responseHistory: { ...empty.responseHistory, ...(raw.responseHistory || {}) },
    selectedMap: { ...empty.selectedMap, ...(raw.selectedMap || {}) },
    axisNotes: { ...empty.axisNotes, ...(raw.axisNotes || {}) },
    complementaryQuestions: Array.isArray(raw.complementaryQuestions)
      ? raw.complementaryQuestions
        .filter(item => item && typeof item === 'object' && String(item.question || '').trim())
        .map((item, index) => ({
          id: String(item.id || `complementary-question-${index + 1}`),
          question: String(item.question || '').trim(),
          answer: String(item.answer || ''),
          informantType: String(item.informantType || ''),
          informantName: String(item.informantName || ''),
          source: item.source === 'manual' ? 'manual' : 'ai',
          sourceQuestion: String(item.sourceQuestion || item.question || '').trim(),
          modelVersion: String(item.modelVersion || ''),
          selectedAt: item.selectedAt || null,
          answeredAt: item.answeredAt || null,
        }))
        .slice(0, 60)
      : [],
    hypothesisReviews: Array.isArray(raw.hypothesisReviews) ? raw.hypothesisReviews : [],
    evolucoes: Array.isArray(raw.evolucoes) ? raw.evolucoes : [],
    relatorio: { ...empty.relatorio, ...(raw.relatorio || {}) },
  };
}

// Itens marcados de um grupo (mesma convenção do useClinicState).
export function getPsychologySelected(selectedMap, group) {
  const prefix = `${group}:`;
  return Object.keys(selectedMap || {})
    .filter(key => key.startsWith(prefix) && selectedMap[key])
    .map(key => key.slice(prefix.length));
}

// Há algum sinal de risco marcado? (dispara o lembrete de conduta)
export function hasPsychologyRiskSelected(selectedMap) {
  return getPsychologySelected(selectedMap, PSYCHOLOGY_RISK_GROUP).length > 0;
}

// Resumo de andamento da sessão de Psi — consumido pelo Painel e pelo
// rail de IA da Anamnese. O percentual mede APENAS preenchimento da
// ficha, nunca confiança diagnóstica (invariante de todas as disciplinas).
export function buildPsychologyWorkspaceSummary(session) {
  const activeFields = getPsychologyTextFields(session?.intakeProfile, session?.contextModules);
  const filledFields = activeFields
    .filter(field => String(session.fields?.[field.id] || '').trim()).length;
  const filledAxes = PSYCHOLOGY_AXES
    .filter(axis => String(session.axisNotes?.[axis.id] || '').trim()).length;
  const markedItems = Object.values(session.selectedMap || {}).filter(Boolean).length;
  const riskItems = Object.entries(session.selectedMap || {})
    .filter(([key, selected]) => selected && key.startsWith(`${PSYCHOLOGY_RISK_GROUP}:`))
    .length;
  const sessionCount = Array.isArray(session.evolucoes) ? session.evolucoes.length : 0;
  const complementaryQuestions = Array.isArray(session.complementaryQuestions)
    ? session.complementaryQuestions.length
    : 0;
  const answeredComplementaryQuestions = Array.isArray(session.complementaryQuestions)
    ? session.complementaryQuestions.filter(item => String(item.answer || '').trim()).length
    : 0;
  const totalSections = activeFields.length + PSYCHOLOGY_AXES.length + 1;
  const completedSections = filledFields + filledAxes + Number(markedItems > 0);

  return {
    filledFields,
    filledAxes,
    markedItems,
    riskItems,
    sessionCount,
    complementaryQuestions,
    answeredComplementaryQuestions,
    completion: Math.round((completedSections / totalSections) * 100),
    nextAction: riskItems > 0
      ? 'Conferir primeiro os sinais de risco marcados e registrar a avaliação profissional.'
      : filledFields === 0
        ? 'Registrar a demanda e o motivo da busca para iniciar a organização do caso.'
        : filledAxes === 0
          ? 'Organizar os dados nos eixos de avaliação que fizerem sentido para este caso.'
          : 'Gerar a leitura assistiva quando quiser revisar lacunas, cautelas e próximas perguntas.',
  };
}
