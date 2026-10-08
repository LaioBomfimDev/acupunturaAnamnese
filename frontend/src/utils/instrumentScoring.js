// ============================================================
// Cálculo das escalas clínicas (data/clinicalInstruments.js).
// Funções puras: a mesma regra serve à tela, ao teste e, na etapa 2,
// à Edge Function da Área do Paciente (espelho em TypeScript).
// ============================================================

function optionValues(item) {
  return (item.options || []).map(option => option.value);
}

function isValidAnswer(item, value) {
  return typeof value === 'number' && Number.isFinite(value) && optionValues(item).includes(value);
}

/** Faixa em que a nota cai; null fora da escala. */
export function bandForScore(instrument, score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return instrument.bands.find(band => score >= band.min && score <= band.max) || null;
}

/**
 * Soma a escala. A nota e a faixa só existem com todas as perguntas que
 * pontuam respondidas; o risco aparece assim que o item de risco é
 * marcado, mesmo com a escala pela metade.
 */
export function scoreInstrument(instrument, answers = {}) {
  const items = instrument.items || [];
  let sum = 0;
  let answered = 0;
  const riskItems = [];

  for (const item of items) {
    const value = answers?.[item.id];
    if (!isValidAnswer(item, value)) continue;
    answered += 1;
    sum += value;
    if (item.risk && value >= item.risk.fromValue) riskItems.push(item.id);
  }

  const complete = items.length > 0 && answered === items.length;
  let score = null;
  if (complete) {
    if (instrument.scoring.method === 'sum_times_2') score = sum * 2;
    else if (instrument.scoring.method === 'mean') score = sum / items.length;
    else score = sum;
  }

  return {
    answered,
    total: items.length,
    complete,
    score,
    band: complete ? bandForScore(instrument, score) : null,
    riskItems,
  };
}

/** Mensagens de risco dos itens marcados, na ordem da escala. */
export function riskMessages(instrument, riskItems = []) {
  return (instrument.items || [])
    .filter(item => item.risk && riskItems.includes(item.id))
    .map(item => ({ itemId: item.id, message: item.risk.message }));
}

/**
 * Perguntas extras (não pontuam) que valem agora. `showWhen: 'anyPositive'`
 * = só quando alguma pergunta que pontua passou de zero.
 */
export function visibleExtraItems(instrument, answers = {}) {
  const anyPositive = (instrument.items || []).some(item => {
    const value = answers?.[item.id];
    return isValidAnswer(item, value) && value > 0;
  });
  return (instrument.extraItems || []).filter(item => item.showWhen !== 'anyPositive' || anyPositive);
}

/**
 * Só as respostas de perguntas conhecidas, com valores que a pergunta
 * aceita. Pergunta extra escondida não é gravada, mesmo que tenha sido
 * respondida antes de sumir.
 */
export function sanitizeInstrumentAnswers(instrument, answers = {}) {
  const clean = {};
  for (const item of [...(instrument.items || []), ...visibleExtraItems(instrument, answers)]) {
    const value = answers?.[item.id];
    if (isValidAnswer(item, value)) clean[item.id] = value;
  }
  return clean;
}

export const INSTRUMENT_NOTE_MAX = 2000;

/**
 * O que vai cifrado para o banco: respostas, resultado mostrado na hora
 * (nota, faixa, risco) e a observação. A versão do instrumento vai em
 * coluna própria.
 */
export function buildApplicationPayload(instrument, answers, note = '') {
  const clean = sanitizeInstrumentAnswers(instrument, answers);
  const result = scoreInstrument(instrument, clean);
  if (!result.complete) {
    throw new Error(`Responda as ${result.total} perguntas para salvar (faltam ${result.total - result.answered}).`);
  }
  const trimmedNote = String(note || '').trim().slice(0, INSTRUMENT_NOTE_MAX);
  return {
    answers: clean,
    result: {
      score: result.score,
      bandId: result.band?.id || null,
      bandLabel: result.band?.label || null,
      riskItems: result.riskItems,
    },
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };
}

/**
 * Confere a definição: faixas cobrindo a escala inteira sem buraco nem
 * sobreposição, máximo igual à soma dos maiores pontos, ids únicos e
 * item de risco dentro das opções. Devolve a lista de problemas.
 */
export function validateInstrumentDefinition(instrument) {
  const problems = [];
  const items = instrument.items || [];
  const allItems = [...items, ...(instrument.extraItems || [])];

  const ids = allItems.map(item => item.id);
  if (new Set(ids).size !== ids.length) problems.push('ids de pergunta repetidos');
  if (!items.length) problems.push('sem perguntas que pontuam');

  for (const item of allItems) {
    const values = optionValues(item);
    if (values.length < 2) problems.push(`${item.id}: menos de 2 opções`);
    if (new Set(values).size !== values.length) problems.push(`${item.id}: pontos de opção repetidos`);
    if (item.risk && !values.some(value => value >= item.risk.fromValue)) {
      problems.push(`${item.id}: risco fora das opções`);
    }
  }

  if (instrument.scoring?.method === 'sum') {
    const minSum = items.reduce((total, item) => total + Math.min(...optionValues(item)), 0);
    const maxSum = items.reduce((total, item) => total + Math.max(...optionValues(item)), 0);
    if (minSum !== instrument.scoring.min) problems.push(`mínimo declarado ${instrument.scoring.min}, soma dá ${minSum}`);
    if (maxSum !== instrument.scoring.max) problems.push(`máximo declarado ${instrument.scoring.max}, soma dá ${maxSum}`);
  }

  const bands = [...(instrument.bands || [])].sort((a, b) => a.min - b.min);
  if (!bands.length) problems.push('sem faixas');
  if (bands.length) {
    if (bands[0].min !== instrument.scoring.min) problems.push('a primeira faixa não começa no mínimo');
    if (bands[bands.length - 1].max !== instrument.scoring.max) problems.push('a última faixa não termina no máximo');
    for (let index = 1; index < bands.length; index += 1) {
      if (bands[index].min !== bands[index - 1].max + 1) {
        problems.push(`buraco ou sobreposição entre ${bands[index - 1].id} e ${bands[index].id}`);
      }
    }
    const bandIds = bands.map(band => band.id);
    if (new Set(bandIds).size !== bandIds.length) problems.push('ids de faixa repetidos');
  }

  return problems;
}
