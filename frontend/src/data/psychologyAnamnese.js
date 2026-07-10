// ============================================================
// DADOS: Anamnese de Psicologia — RASCUNHO A VALIDAR
// Fase 5 do plano (docs/plano-clinica-multidisciplinar.md);
// conteúdo em docs/plano-anamnese-multidisciplinar.md §2.2 e
// docs/anamnese-psicologia-perguntas.md.
//
// TUDO aqui é a proposta conservadora feita por leigo: a
// psicóloga é a autoridade e vai cortar/trocar/reescrever ao
// responder as 7 perguntas. Até lá o workspace exibe o banner
// de rascunho.
//
// IA nesta disciplina (decisão do dono do produto, 2026-07-10):
// sugere marcações E redige uma leitura diagnóstica em RASCUNHO —
// o profissional revisa, aceita/ignora e pode Corrigir (loop de
// ensino igual ao MTC). A IA nunca decide nem entra sozinha.
// ============================================================

import { checklists } from './checklists.js';

// Estado editorial do vocabulário — vira 'aprovado' quando a
// psicóloga validar (gate humano, AGENTS.md §0/§8).
export const PSYCHOLOGY_CONTENT_STATUS = 'rascunho_a_validar';

export const PSYCHOLOGY_DRAFT_NOTICE =
  'Conteúdo provisório: campos e listas são uma proposta inicial aguardando a validação da psicóloga. '
  + 'O registro já vale como anotação clínica, mas o vocabulário ainda pode mudar.';

// record_type usados em clinical_records (discipline = psicologia).
export const PSI_ANAMNESE_RECORD_TYPE = 'psi_anamnese';
export const PSI_NEURO_RECORD_TYPE = 'psi_neuro_avaliacao';

// Duas modalidades do workspace de Psi (decisão da psicóloga em
// 2026-07-07): fluxos distintos, registros distintos.
export const PSYCHOLOGY_MODALITIES = [
  {
    id: 'anamnese_clinica',
    label: 'Anamnese clínica',
    description: 'Demanda, história e registro de sessão — com o vocabulário proposto no plano.',
    recordType: PSI_ANAMNESE_RECORD_TYPE,
    available: true,
  },
  {
    id: 'avaliacao_neuropsicologica',
    label: 'Avaliação neuropsicológica',
    description: 'Bateria e estrutura serão definidas com a psicóloga antes de construir.',
    recordType: PSI_NEURO_RECORD_TYPE,
    available: false,
  },
];

export function getPsychologyModality(id) {
  return PSYCHOLOGY_MODALITIES.find(item => item.id === id) || null;
}

// Campos de texto livre (plano §2.2 — sugestão inicial).
// `quickWords`: chips clicáveis que APENDAM a palavra na textarea —
// digitação mínima (pedido do dono do produto). Vocabulário também
// em rascunho até a psicóloga validar.
export const PSYCHOLOGY_TEXT_FIELDS = [
  {
    id: 'demanda',
    label: 'Demanda / queixa principal (nas palavras da pessoa)',
    textarea: true,
    quickWords: ['ansiedade', 'tristeza', 'estresse no trabalho', 'conflitos familiares', 'luto', 'insônia', 'crises de pânico', 'autoestima baixa'],
  },
  {
    id: 'motivoBusca',
    label: 'O que motivou a busca por atendimento agora',
    textarea: true,
    quickWords: ['piora recente', 'crise recente', 'evento marcante', 'indicação médica', 'indicação de familiar', 'decisão própria'],
  },
  {
    id: 'historiaPessoal',
    label: 'História pessoal e de vida relevante',
    textarea: true,
    quickWords: ['infância difícil', 'perda importante', 'separação recente', 'mudança recente', 'violência sofrida', 'dificuldades no trabalho/estudo'],
  },
  {
    id: 'saudeMental',
    label: 'Histórico de saúde mental e tratamentos anteriores (incl. medicação psiquiátrica)',
    textarea: true,
    quickWords: ['primeira vez em terapia', 'terapia anterior', 'acompanhamento psiquiátrico', 'usa medicação psiquiátrica', 'já usou medicação', 'internação prévia', 'sem tratamento anterior'],
  },
  {
    id: 'redeApoio',
    label: 'Rede de apoio / contexto familiar e social',
    textarea: true,
    quickWords: ['mãe', 'pai', 'avó', 'irmãos', 'cônjuge', 'filhos', 'amigos', 'mora sozinho(a)'],
  },
  {
    id: 'observacoesSessao',
    label: 'Observações da sessão',
    textarea: true,
    quickWords: ['choro na sessão', 'discurso organizado', 'boa vinculação', 'resistência inicial', 'orientações dadas', 'tema para próxima sessão'],
  },
];

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
// Sono é reaproveitado do módulo atual (plano §2.2: "reaproveitável").
export const psychologyChecklists = {
  psiHumor: [
    'Tristeza persistente', 'Apatia / desânimo', 'Perda de prazer (anedonia)',
    'Oscilações de humor', 'Irritabilidade', 'Choro frequente',
    'Culpa excessiva', 'Baixa autoestima',
  ],
  psiAnsiedade: [
    'Preocupação excessiva', 'Sintomas físicos (taquicardia, sudorese)',
    'Inquietação', 'Evitação de situações', 'Crises de pânico',
    'Medos específicos', 'Tensão constante',
  ],
  psiSono: checklists.sono,
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
  { group: 'psiHumor', title: 'Estado do humor', items: psychologyChecklists.psiHumor },
  { group: 'psiAnsiedade', title: 'Ansiedade', items: psychologyChecklists.psiAnsiedade },
  { group: 'psiSono', title: 'Sono', items: psychologyChecklists.psiSono },
  { group: 'psiFuncionamento', title: 'Funcionamento no dia a dia', items: psychologyChecklists.psiFuncionamento },
  { group: 'psiSubstancias', title: 'Uso de substâncias', items: psychologyChecklists.psiSubstancias },
];

// Bloco crítico de risco (plano §2.2: "crítico e obrigatório").
// O sistema DESTACA e LEMBRA — nunca decide (invariante de todas
// as disciplinas).
export const PSYCHOLOGY_RISK_GROUP = 'psiRisco';
export const psychologyRiskChecklist = [
  'Ideação suicida',
  'Planejamento ou tentativa prévia',
  'Autolesão',
  'Risco a terceiros',
  'Sinais de crise aguda',
  'Suspeita de violência ou negligência sofrida',
];

export const PSYCHOLOGY_RISK_REMINDER =
  'Sinal de risco marcado: avalie a conduta conforme seu julgamento clínico e o protocolo da clínica '
  + '(rede de urgência, contato de apoio, encaminhamento). O sistema destaca e lembra — a decisão é sempre sua.';

// Sessão vazia da anamnese clínica de Psi. selectedMap usa o mesmo
// formato do motor MTC ("grupo:item" → boolean) para reaproveitar o
// CheckGrid e, no futuro, o loop de sugestão/Corrigir.
export function createEmptyPsychologySession() {
  return {
    modality: 'anamnese_clinica',
    fields: Object.fromEntries(PSYCHOLOGY_TEXT_FIELDS.map(field => [field.id, ''])),
    selectedMap: {},
    riskNotes: '',
    // Última "Leitura da IA (rascunho)" gerada — persiste com a sessão
    // para o profissional retomar/corrigir depois. null = nunca gerada.
    aiReading: null,
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
