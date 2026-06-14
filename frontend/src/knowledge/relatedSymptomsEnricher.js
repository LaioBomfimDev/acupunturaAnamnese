/**
 * relatedSymptomsEnricher.js
 *
 * Enriquece reviews do KM-Agent com `relatedSymptoms` inferidos das indicações e ações,
 * permitindo que pontos approved_local sejam encontrados pelo EVIDENCE_RULES do engine.
 *
 * IMPORTANTE: inferência é local e não substitui curadoria profissional.
 * O campo `_symptomsInferred: true` sinaliza que o valor foi inferido automaticamente.
 */

// Mapeamento: padrão regex que pode aparecer em actions/indications -> sintomas clínicos PT-BR
const INDICATION_TO_SYMPTOM_MAP = [
  // Cabeça, Shen, Sono
  [/cefal|enxaqueca|dor de cabe/i, ['cefaleia', 'enxaqueca', 'dor de cabeça']],
  [/ins[oô]nia|dist[uú]rbio do sono|sono agitado/i, ['insônia', 'sono']],
  [/ansieda|agitaç|nervosi/i, ['ansiedade', 'agitação']],
  [/palpita/i, ['palpitação']],
  [/vertigo|tontura|zumbido/i, ['tontura', 'zumbido', 'vertigem']],
  // Digestão
  [/n[aá]usea|v[oô]mito/i, ['náusea', 'vômito']],
  [/refluxo|azia|regurgita/i, ['refluxo', 'azia']],
  [/dispers[aã]o|distens[aã]o abdominal/i, ['distensão']],
  [/constipa[cç]|pris[aã]o de ventre/i, ['constipação']],
  [/diarreia|fezes amolecidas/i, ['diarreia']],
  [/digest[aã]o|est[oô]mago|ba[cç]o/i, ['digestão', 'estômago']],
  // Fadiga e Qi
  [/fadiga|cansa[cç]|exaust[aã]o|fraque/i, ['fadiga', 'cansaço']],
  [/tonific|fortalec|defici[eê]ncia de Qi/i, ['fadiga', 'deficiência de Qi']],
  // Dor e mobilidade
  [/lombar|lombalg|dor lombar/i, ['lombalgia', 'dor lombar']],
  [/cervical|pesco[cç]o|rigidez/i, ['dor cervical', 'rigidez']],
  [/ombro|escap|trap[eé]zio/i, ['tensão cervical', 'ombro']],
  [/articular|artrite|reumat/i, ['dor articular']],
  [/dor cr[oô]nica|dor fixa|dor intensa/i, ['dor']],
  // Respiratório
  [/tosse|bronqui|asma|dispn/i, ['tosse', 'dispneia']],
  [/rinite|sinusi|obstru[cç][aã]o nasal/i, ['rinite', 'sinusite', 'obstrução nasal']],
  [/garganta|faringe|dor de garganta/i, ['garganta']],
  [/pulm[aã]o|respira/i, ['falta de ar', 'respiratório']],
  // Pele
  [/pele|dermatite|eczema|urtic/i, ['pele', 'coceira', 'eczema']],
  [/prurido|coceira/i, ['coceira', 'prurido']],
  // Ginecológico
  [/menstrua[cç]|ciclo|TPM|c[oó]lica/i, ['menstruação', 'cólicas', 'TPM']],
  [/menopausa|ondas de calor|climat[eé]rio/i, ['menopausa', 'ondas de calor']],
  [/co[aá]gulos|estase de xue/i, ['coágulos', 'menstruação']],
  // Rim e urinário
  [/reten[cç][aã]o de urina|retinçao de urina/i, ['retenção urinária']],
  [/urin[aá]ri|bexiga|enurese/i, ['urinária', 'bexiga']],
  [/rim|renal/i, ['rim']],
  // Estase e circulação
  [/estase|sangue estagnado|estagna[cç][aã]o de xue/i, ['estase', 'dor fixa']],
  [/circula[cç]|hemor/i, ['circulação']],
  // Umidade e fleuma
  [/umidade|fleuma|muco|edema/i, ['umidade', 'edema', 'fleuma']],
  // Calor, frio e clima
  [/febre|calor externo|infec[cç][aã]o/i, ['febre', 'infecção']],
  [/suores noturnos|transpira[cç][aã]o|sudo/i, ['suores noturnos', 'transpiração']],
];

/**
 * Infere relatedSymptoms a partir dos campos `indications` e `actions` de um review.
 * @param {object} review
 * @returns {string[]} Lista de sintomas inferidos (pode estar vazia).
 */
export function inferRelatedSymptoms(review) {
  const indications = Array.isArray(review.indications)
    ? review.indications
    : String(review.indications || '').split(',');
  const actions = Array.isArray(review.actions)
    ? review.actions
    : String(review.actions || '').split(',');

  const searchText = [...indications, ...actions].join(' ');

  const symptoms = new Set();
  for (const [pattern, terms] of INDICATION_TO_SYMPTOM_MAP) {
    if (pattern.test(searchText)) {
      terms.forEach(t => symptoms.add(t));
    }
  }
  return [...symptoms];
}

/**
 * Enriquece um único review adicionando `relatedSymptoms` se o campo estiver vazio.
 * Marca `_symptomsInferred: true` para rastreabilidade.
 * @param {object} review
 * @returns {object} Review original ou enriquecido (sem mutação).
 */
export function enrichReviewWithSymptoms(review) {
  if (review.relatedSymptoms && review.relatedSymptoms.length) return review;
  const inferred = inferRelatedSymptoms(review);
  if (!inferred.length) return review;
  return { ...review, relatedSymptoms: inferred, _symptomsInferred: true };
}

/**
 * Enriquece um array de reviews.
 * @param {object[]} reviews
 * @returns {object[]}
 */
export function enrichReviewsWithSymptoms(reviews) {
  return reviews.map(enrichReviewWithSymptoms);
}
