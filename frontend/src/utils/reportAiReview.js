// Gate do relatório para conteúdo que veio da IA. Entradas legadas sem
// aiReviewedAt permanecem pendentes até a confirmação explícita da profissional.
export function isAiDraftPendingReview(entry) {
  return Boolean(entry?.aiDraft && !entry?.aiReviewedAt);
}
