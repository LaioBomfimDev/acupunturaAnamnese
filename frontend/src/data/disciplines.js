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

export const DISCIPLINES = [
  {
    id: 'acupuntura',
    label: 'Acupuntura',
    subtitle: 'Medicina Tradicional Chinesa',
    description: 'Anamnese energética, língua, pulso, protocolo e evolução.',
    available: true,
  },
  {
    id: 'fisioterapia',
    label: 'Fisioterapia',
    subtitle: 'Avaliação funcional',
    description: 'Anamnese e avaliação cinético-funcional.',
    available: false,
  },
  {
    id: 'psicologia',
    label: 'Psicologia',
    subtitle: 'Saúde mental',
    description: 'Anamnese clínica e avaliação neuropsicológica.',
    // Fase 5: workspace esqueleto no ar (vocabulário em validação
    // pela psicóloga; IA desligada nesta disciplina).
    available: true,
  },
  {
    id: 'nutricao',
    label: 'Nutrição',
    subtitle: 'Avaliação nutricional',
    description: 'Anamnese alimentar e acompanhamento nutricional.',
    available: false,
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
 * Fonte da verdade é a coluna `profiles.disciplines` (TEXT[]). Quando ela
 * está ausente/vazia (migração 20260707 não aplicada ou perfil antigo),
 * cai no fallback: acupuntura SEMPRE entra (todo o sistema era MTC até
 * aqui — ninguém pode perder acesso na virada) + a disciplina mapeada
 * da profissão, quando houver.
 */
export function resolveUserDisciplines(profile) {
  const fromColumn = Array.isArray(profile?.disciplines)
    ? profile.disciplines.filter(id => DISCIPLINE_IDS.includes(id))
    : [];
  if (fromColumn.length > 0) return fromColumn;

  const mapped = PROFESSION_TO_DISCIPLINE[profile?.profession];
  return mapped && mapped !== 'acupuntura' ? ['acupuntura', mapped] : ['acupuntura'];
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
export function canEnterDiscipline(profile, disciplineId) {
  const discipline = getDiscipline(disciplineId);
  return Boolean(discipline?.available && resolveUserDisciplines(profile).includes(disciplineId));
}
