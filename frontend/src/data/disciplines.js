// ============================================================
// DADOS: Disciplinas da clínica multidisciplinar
// Fase 1 do plano (docs/plano-clinica-multidisciplinar.md).
//
// Cada disciplina é um "pacote de workspace" (abas, anamnese, IA,
// relatório). Na Fase 1 só a acupuntura tem workspace real; as
// demais aparecem no hub como "em construção".
//
// O hub mostra TODAS as disciplinas para todo mundo: as liberadas
// no perfil em cor (clicáveis), as demais em cinza (visíveis, mas
// sem entrada) — decisão do Laio em 2026-07-07.
// ============================================================

// Cor de cada disciplina nos cartões da Agenda (var(--r1-discipline-*),
// tokens.css) — fonte única; nenhuma tela deve manter um mapa próprio.
export const DISCIPLINES = [
  {
    id: 'acupuntura',
    label: 'Acupuntura',
    subtitle: 'Medicina Tradicional Chinesa',
    description: 'Anamnese energética, língua, pulso, protocolo e evolução.',
    available: true,
    color: 'var(--r1-discipline-acupuntura)',
  },
  {
    id: 'fisioterapia',
    label: 'Fisioterapia',
    subtitle: 'Avaliação funcional',
    description: 'Anamnese e avaliação cinético-funcional.',
    // Anamnese genérica no ar desde 07/08/2026 (vocabulário em validação
    // por fisioterapeuta). Evolução e relatório ainda são placeholders.
    available: true,
    color: 'var(--r1-discipline-fisioterapia)',
  },
  {
    id: 'psicologia',
    label: 'Psicologia',
    subtitle: 'Saúde mental',
    description: 'Anamnese clínica e avaliação neuropsicológica.',
    // Fase 5: workspace esqueleto no ar (vocabulário em validação
    // pela psicóloga; IA desligada nesta disciplina).
    available: true,
    color: 'var(--r1-discipline-psicologia)',
  },
  {
    id: 'nutricao',
    label: 'Nutrição',
    subtitle: 'Avaliação nutricional',
    description: 'Anamnese alimentar e acompanhamento nutricional.',
    // Anamnese genérica no ar desde 07/08/2026 (vocabulário em validação
    // por nutricionista). Evolução e relatório ainda são placeholders.
    available: true,
    color: 'var(--r1-discipline-nutricao)',
  },
  {
    id: 'neuropsicologia',
    label: 'Neuropsicologia',
    subtitle: 'Avaliação neuropsicológica',
    description: 'Instrumentos, sessões, resultados, integração e relatório.',
    // Extraída de dentro de Psicologia em 10/09/2026 (era a opção
    // "Avaliação" do PathChooser). Escopo mínimo: Avaliação + Relatório,
    // sem Anamnese/Evolução próprias.
    available: true,
    color: 'var(--r1-discipline-neuropsicologia)',
  },
  {
    id: 'aba',
    label: 'ABA',
    subtitle: 'Análise do Comportamento Aplicada',
    description: 'Programas, coleta por tentativa, gráficos e times.',
    // Trazida do Atlas em 31/10/2026 como área "da Psicologia": por
    // enquanto só psicólogo atende (20261101_aba_discipline.sql libera a
    // área para quem já tem Psicologia). Coleta separada da evolução.
    available: true,
    color: 'var(--r1-discipline-aba)',
  },
];

export const DISCIPLINE_IDS = DISCIPLINES.map(item => item.id);

export function getDiscipline(id) {
  return DISCIPLINES.find(item => item.id === id) || null;
}

// Profissão do cadastro → disciplina correspondente (para o fallback
// quando a coluna disciplines ainda não foi populada/migrada).
const PROFESSION_TO_DISCIPLINE = {
  acupunturista: 'acupuntura',
  fisioterapeuta: 'fisioterapia',
  terapeuta_ocupacional: 'fisioterapia',
  psicologo: 'psicologia',
  nutricionista: 'nutricao',
};

/**
 * Disciplinas liberadas para um perfil.
 *
 * Fonte da verdade é a coluna `profiles.disciplines` (TEXT[]). Vazia, cai
 * na área da profissão — e, sem profissão mapeada, em NENHUMA área: a
 * administração escolhe em Gestão → Equipe (`set_member_disciplines`).
 *
 * Até 12/11/2026 este fallback injetava 'acupuntura' em todo mundo (era a
 * virada MTC → multidisciplinar, quando ninguém podia perder acesso).
 * Isso deixava nutricionista e fisioterapeuta como acupunturistas; o
 * gatilho do banco fazia o mesmo e gravava. Não repor: ver a migration
 * 20261112_areas_do_profissional.sql.
 */
export function resolveUserDisciplines(profile) {
  // Recepção não atende: nunca recebe área, mesmo com a coluna
  // preenchida por engano. O gate real é canEnterDiscipline, abaixo.
  if (profile?.role === 'receptionist') return [];

  const fromColumn = Array.isArray(profile?.disciplines)
    ? profile.disciplines.filter(id => DISCIPLINE_IDS.includes(id))
    : [];
  if (fromColumn.length > 0) return fromColumn;

  const mapped = PROFESSION_TO_DISCIPLINE[profile?.profession];
  return mapped ? [mapped] : [];
}

/**
 * Estado de cada card do hub para um perfil: `enabled` (pode entrar),
 * `soon` (liberada, mas workspace em construção) ou `locked` (não
 * habilitada para o perfil — aparece em cinza).
 */
export function buildHubCards(profile) {
  const licensed = new Set(resolveUserDisciplines(profile));
  return DISCIPLINES.map(discipline => ({
    ...discipline,
    state: !licensed.has(discipline.id)
      ? 'locked'
      : discipline.available
        ? 'enabled'
        : 'soon',
  }));
}

// Disciplina válida para ABRIR workspace (liberada no perfil + construída).
// Recepção é bloqueada explicitamente aqui (não só via resolveUserDisciplines
// acima) porque este é o gate que o App.jsx de fato usa pra decidir se
// mostra um workspace clínico — não pode depender só do dado no perfil.
export function canEnterDiscipline(profile, disciplineId) {
  if (profile?.role === 'receptionist') return false;
  const discipline = getDiscipline(disciplineId);
  return Boolean(discipline?.available && resolveUserDisciplines(profile).includes(disciplineId));
}

/**
 * Disciplina "principal" de uma revisora de curadoria.
 *
 * O papel knowledge_reviewer é genérico: a interface (home, workspace de
 * curadoria) e as seções visíveis derivam desta disciplina, não de um
 * valor chumbado. Regra: a primeira disciplina liberada que NÃO seja
 * acupuntura (a revisora de psicologia tem disciplines=['psicologia']);
 * se só houver acupuntura, mantém acupuntura — preserva a revisora atual.
 */
export function resolveReviewerDiscipline(profile) {
  const licensed = resolveUserDisciplines(profile);
  return licensed.find(id => id !== 'acupuntura') || 'acupuntura';
}
