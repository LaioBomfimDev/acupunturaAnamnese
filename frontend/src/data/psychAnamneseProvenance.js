// Ponteiros de conferência para a síntese curável de Psicologia.
//
// O texto integral e os trechos dos livros continuam protegidos fora do bundle.
// Estes registros permitem que a revisora abra a página correspondente antes de
// aprovar a síntese. Um ponteiro não transforma o rascunho em conteúdo aprovado.

const SOURCE_TITLES = {
  'psicologia-dsm-5-tr-revisao-texto': 'DSM-5-TR',
  'psicologia-cid-11-transtornos-mentais': 'CID-11 — transtornos mentais',
  'psicologia-analise-comportamento-aplicada-tea': 'ABA/TEA',
  'psicologia-neuropsicologia-manual-cfp': 'Manual de Neuropsicologia (CFP)',
};

function pageSource(key, pdfPage, supportLevel = 'contextual') {
  const page = String(pdfPage).padStart(3, '0');
  const assetKey = `pdf-sources/${key}/pages/page-${page}.webp`;
  return Object.freeze({
    key,
    title: SOURCE_TITLES[key] || key,
    pdfPage,
    assetKey,
    imageUrl: `/knowledge/source-assets/${assetKey}`,
    supportLevel,
    verificationStatus: 'verified_page_pointer',
    requiresProfessionalAudit: true,
  });
}

const dsm = (page, supportLevel) => pageSource('psicologia-dsm-5-tr-revisao-texto', page, supportLevel);
const cid = (page, supportLevel) => pageSource('psicologia-cid-11-transtornos-mentais', page, supportLevel);
const aba = (page, supportLevel) => pageSource('psicologia-analise-comportamento-aplicada-tea', page, supportLevel);

// IDs espelham buildItems() em psychCurationService.js. As páginas foram
// conferidas contra os candidatos locais extraídos em 10/07/2026.
export const PSYCH_ANAMNESE_PROVENANCE = Object.freeze({
  'risk-0': [dsm(258, 'direct')],
  'risk-1': [dsm(133, 'direct')],
  'risk-2': [dsm(214, 'direct')],
  'risk-3': [cid(49, 'direct')],
  'risk-4': [dsm(209, 'direct')],

  'axis-0': [dsm(909, 'direct')],
  'axis-1': [dsm(1117, 'contextual')],
  'axis-2': [dsm(134, 'direct')],
  'axis-3': [dsm(1135, 'contextual')],
  'axis-4': [dsm(1136, 'direct')],
  'axis-5': [aba(339, 'direct')],
  'axis-6': [dsm(113, 'direct')],
  'axis-7': [dsm(113, 'direct')],

  'checklist-0': [dsm(1117, 'direct')],
  'checklist-1': [dsm(1117, 'direct')],
  'checklist-2': [dsm(1117, 'direct')],
  'checklist-3': [dsm(1117, 'direct')],
  'checklist-4': [dsm(909, 'direct')],
  'checklist-5': [aba(13, 'contextual'), dsm(139, 'contextual')],
  'checklist-6': [cid(49, 'direct')],
  'checklist-7': [cid(228, 'direct'), cid(229, 'direct')],

  // O roteiro é uma formulação revisável, não uma transcrição. Por isso os
  // ponteiros são contextuais e apontam para a Entrevista de Formulação
  // Cultural e instrumentos de avaliação, sem alegar citação literal.
  'question-block-0': [dsm(1134, 'contextual')],
  'question-block-1': [dsm(1134, 'contextual')],
  'question-block-2': [dsm(1135, 'contextual')],
  'question-block-3': [dsm(1137, 'contextual')],
  'question-block-4': [dsm(1136, 'contextual')],
  'question-block-5': [dsm(1117, 'contextual'), cid(229, 'contextual')],
  'question-block-6': [dsm(209, 'contextual'), dsm(909, 'contextual')],
});

export function getPsychAnamneseSources(itemId, blockIndex = null) {
  const direct = PSYCH_ANAMNESE_PROVENANCE[itemId];
  if (direct) return direct.map(source => ({ ...source }));
  if (Number.isInteger(blockIndex)) {
    return (PSYCH_ANAMNESE_PROVENANCE[`question-block-${blockIndex}`] || [])
      .map(source => ({ ...source }));
  }
  return [];
}
