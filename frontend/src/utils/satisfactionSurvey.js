// ============================================================
// Regras da página pública da pesquisa de satisfação (SurveyPage).
// A nota continua 1-5 (CHECK de satisfaction_surveys.rating); aqui só
// o que o paciente lê em volta dela.
// ============================================================

export const SURVEY_RATINGS = [1, 2, 3, 4, 5];

const RATING_LABELS = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente',
};

export const COMMENT_MAX_LENGTH = 1000;

/**
 * Título da pesquisa com quem atendeu, pro paciente não avaliar o
 * atendimento errado. Sem artigo ("com a/o profissional") e sem "na/no"
 * antes da clínica: o sistema não sabe o gênero de quem atendeu nem do
 * nome da instituição ("no Instituto", "na Clínica"). A clínica fica
 * logo acima do título.
 */
export function surveyTitle(professionalName) {
  const name = String(professionalName || '').trim();
  return name ? `Como foi seu atendimento com ${name}?` : 'Como foi seu atendimento?';
}

/** Rótulo da nota escolhida (ou a instrução, antes de escolher). */
export function ratingLabel(rating) {
  return RATING_LABELS[rating] || 'Toque numa estrela para dar sua nota';
}

/**
 * O convite do comentário acompanha a nota: nota baixa pergunta o que
 * melhorar, nota alta o que agradou. Comentário segue opcional sempre.
 */
export function commentPlaceholder(rating) {
  if (rating >= 4) return 'O que você mais gostou?';
  if (rating >= 1) return 'O que podemos melhorar?';
  return 'Conte como foi, se quiser.';
}
