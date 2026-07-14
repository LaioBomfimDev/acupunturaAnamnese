const LEGACY_REVIEWER_LABELS = new Set([
  'curadoria acupuntura',
  'revisora psicologia',
]);

export function getReviewerDisplayName(value) {
  const name = String(value || '').trim();
  if (!name) return 'profissional';
  if (LEGACY_REVIEWER_LABELS.has(name.toLocaleLowerCase('pt-BR'))) return 'Denise Neves';
  return name;
}
