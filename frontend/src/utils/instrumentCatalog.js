// Catálogo da tela de escalas: categoria (filtro) e título complementar de
// cada instrumento. Mora fora de `data/clinicalInstruments.js` de propósito:
// é só organização da tela, não pergunta, ponto nem faixa, então mudar aqui
// não sobe `version` do instrumento nem mexe no espelho da Edge Function.

export const INSTRUMENT_CATEGORIES = [
  { id: 'depressao', label: 'Depressão' },
  { id: 'ansiedade', label: 'Ansiedade' },
  { id: 'estresse', label: 'Estresse e trauma' },
  { id: 'sofrimento', label: 'Sofrimento psíquico' },
  { id: 'fisico', label: 'Sintomas físicos' },
  { id: 'atencao', label: 'Atenção e TDAH' },
  { id: 'autoimagem', label: 'Autoestima e autocompaixão' },
];

// `kind`: o complemento do título ("Rosenberg (escala de autoestima)").
const CATALOG = {
  phq9: { kind: 'escala de depressão', categories: ['depressao'] },
  phq8: { kind: 'escala de depressão', categories: ['depressao'] },
  gad7: { kind: 'escala de ansiedade', categories: ['ansiedade'] },
  phq4: { kind: 'rastreio rápido de ansiedade e depressão', categories: ['depressao', 'ansiedade'] },
  dass21: { kind: 'depressão, ansiedade e estresse', categories: ['depressao', 'ansiedade', 'estresse'] },
  k10: { kind: 'escala de sofrimento psíquico', categories: ['sofrimento'] },
  k6: { kind: 'escala de sofrimento psíquico', categories: ['sofrimento'] },
  pcl5: { kind: 'escala de estresse pós-traumático', categories: ['estresse'] },
  phq15: { kind: 'escala de sintomas físicos', categories: ['fisico'] },
  asrs6: { kind: 'rastreio de TDAH em adultos', categories: ['atencao'] },
  rosenberg: { kind: 'escala de autoestima', categories: ['autoimagem'] },
  scs: { kind: 'escala de autocompaixão', categories: ['autoimagem'] },
  scssf: { kind: 'escala de autocompaixão', categories: ['autoimagem'] },
};

/** Complemento do título; vazio se o instrumento ainda não foi catalogado. */
export function instrumentKind(instrument) {
  return CATALOG[instrument?.id]?.kind || '';
}

export function instrumentCategories(instrument) {
  return CATALOG[instrument?.id]?.categories || [];
}

/** Sem acento e sem maiúscula: "depressao" acha "Depressão". */
function fold(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** Categorias que existem de fato entre as escalas da área, na ordem do catálogo. */
export function categoriesPresent(instruments) {
  const present = new Set(instruments.flatMap(instrumentCategories));
  return INSTRUMENT_CATEGORIES.filter(category => present.has(category.id));
}

/** Busca por nome, sigla, o que mede, complemento e categoria; filtro por categoria. */
export function filterInstruments(instruments, { query = '', category = '' } = {}) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  return instruments.filter(instrument => {
    if (category && !instrumentCategories(instrument).includes(category)) return false;
    if (!words.length) return true;
    const haystack = fold([
      instrument.shortName,
      instrument.name,
      instrument.measures,
      instrumentKind(instrument),
      ...instrumentCategories(instrument).map(id => INSTRUMENT_CATEGORIES.find(c => c.id === id)?.label),
    ].join(' '));
    return words.every(word => haystack.includes(word));
  });
}
