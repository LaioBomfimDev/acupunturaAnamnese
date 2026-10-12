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

/** Faixa da lista em que a nota cai; null fora dela. */
export function bandIn(bands, score) {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return (bands || []).find(band => score >= band.min && score <= band.max) || null;
}

/** Faixa em que a nota cai; null fora da escala. */
export function bandForScore(instrument, score) {
  return bandIn(instrument.bands, score);
}

/**
 * Nota por média (`mean`, `subscale_means`): arredondada nas casas que a
 * fonte publica (`scoring.decimals`, 2 se não disser), para a tela, o
 * banco e a faixa usarem o mesmo número.
 */
function roundScore(instrument, value) {
  const factor = 10 ** (instrument.scoring.decimals ?? 2);
  return Math.round(value * factor) / factor;
}

function mean(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Subescalas. `subscales` (DASS-21): cada uma soma as próprias perguntas,
 * multiplica por `scoring.multiplier` e cai nas próprias faixas.
 * `subscale_means` (Escala de Autocompaixão): cada uma é a média das
 * próprias perguntas, sem inverter, como a fonte manda mostrar. Nota só com
 * todas as perguntas da subescala respondidas.
 */
function scoreSubscales(instrument, answers) {
  const items = instrument.items || [];
  const byMeans = instrument.scoring.method === 'subscale_means';
  const multiplier = instrument.scoring.multiplier || 1;
  return (instrument.scoring.subscales || []).map(subscale => {
    const subItems = subscale.items.map(id => items.find(item => item.id === id));
    const complete = subItems.length > 0 && subItems.every(item => item && isValidAnswer(item, answers?.[item.id]));
    let score = null;
    if (complete) {
      const values = subItems.map(item => answers[item.id]);
      score = byMeans
        ? roundScore(instrument, mean(values))
        : values.reduce((total, value) => total + value, 0) * multiplier;
    }
    return { id: subscale.id, label: subscale.label, score, band: complete ? bandIn(subscale.bands, score) : null };
  });
}

/**
 * Total de `subscale_means`: a média das médias das subescalas, com as
 * negativas (`reverseInTotal`) invertidas na própria régua (1 a 5 vira 5 a
 * 1). Usa as médias sem arredondar; arredonda só o total.
 */
function totalOfSubscaleMeans(instrument, answers) {
  const parts = (instrument.scoring.subscales || []).map(subscale => {
    const value = mean(subscale.items.map(id => answers[id]));
    return subscale.reverseInTotal ? subscale.min + subscale.max - value : value;
  });
  return roundScore(instrument, mean(parts));
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
  const method = instrument.scoring.method;
  const bySubscale = method === 'subscales';
  const withSubscales = bySubscale || method === 'subscale_means';
  let score = null;
  if (complete && !bySubscale) {
    if (method === 'sum_times_2') score = sum * 2;
    else if (method === 'mean') score = roundScore(instrument, sum / items.length);
    else if (method === 'subscale_means') score = totalOfSubscaleMeans(instrument, answers);
    else score = sum;
  }

  return {
    answered,
    total: items.length,
    complete,
    score,
    band: complete && !bySubscale ? bandForScore(instrument, score) : null,
    ...(withSubscales ? { subscales: scoreSubscales(instrument, answers) } : {}),
    riskItems,
  };
}

/**
 * Mensagens de risco dos itens marcados, na ordem da escala. Respondida em
 * casa (`source: 'area_do_paciente'`), usa a orientação própria do item.
 */
export function riskMessages(instrument, riskItems = [], { source = null } = {}) {
  const fromHome = source === 'area_do_paciente';
  return (instrument.items || [])
    .filter(item => item.risk && riskItems.includes(item.id))
    .map(item => ({ itemId: item.id, message: (fromHome && item.risk.homeMessage) || item.risk.message }));
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
      ...(result.subscales ? {
        subscales: result.subscales.map(subscale => ({
          id: subscale.id,
          label: subscale.label,
          score: subscale.score,
          bandId: subscale.band?.id || null,
          bandLabel: subscale.band?.label || null,
        })),
      } : {}),
      riskItems: result.riskItems,
    },
    ...(trimmedNote ? { note: trimmedNote } : {}),
  };
}

/**
 * Confere a definição: faixas cobrindo a escala inteira sem buraco nem
 * sobreposição (ou nenhuma, com `noBands`), máximo igual à soma dos
 * maiores pontos, ids únicos, item de risco dentro das opções e sombreado
 * com opção nos dois tons. Devolve a lista de problemas.
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
    // Sombreado da folha (ASRS-6): precisa de opção nos dois tons.
    if (item.shadeFrom != null
      && !(values.some(value => value >= item.shadeFrom) && values.some(value => value < item.shadeFrom))) {
      problems.push(`${item.id}: sombreado sem opção nos dois tons`);
    }
  }

  const rangeOf = (list, factor = 1) => ({
    min: list.reduce((total, item) => total + Math.min(...optionValues(item)), 0) * factor,
    max: list.reduce((total, item) => total + Math.max(...optionValues(item)), 0) * factor,
  });

  const method = instrument.scoring?.method;
  const step = instrument.scoring?.step || 1;
  if (method === 'subscales' || method === 'subscale_means') {
    const byMeans = method === 'subscale_means';
    const multiplier = instrument.scoring.multiplier || 1;
    const subscales = instrument.scoring.subscales || [];
    if (!subscales.length) problems.push('sem subescalas');
    const seen = new Map();
    for (const subscale of subscales) {
      const subItems = subscale.items.map(id => items.find(item => item.id === id));
      if (subItems.some(item => !item)) problems.push(`${subscale.id}: pergunta que não existe`);
      for (const id of subscale.items) seen.set(id, (seen.get(id) || 0) + 1);
      const found = subItems.filter(Boolean);
      const sums = rangeOf(found, byMeans ? 1 : multiplier);
      const range = byMeans ? { min: sums.min / found.length, max: sums.max / found.length } : sums;
      if (range.min !== subscale.min) problems.push(`${subscale.id}: mínimo declarado ${subscale.min}, cálculo dá ${range.min}`);
      if (range.max !== subscale.max) problems.push(`${subscale.id}: máximo declarado ${subscale.max}, cálculo dá ${range.max}`);
      // Na média por subescala a faixa é opcional (a Autocompaixão só tem
      // faixa no total); quando existe, cobre a régua inteira.
      if (!byMeans || (subscale.bands || []).length) {
        checkBands(subscale.bands, subscale.min, subscale.max, `${subscale.id}: `, problems, step);
      }
    }
    for (const item of items) {
      const count = seen.get(item.id) || 0;
      if (count !== 1) problems.push(`${item.id}: está em ${count} subescalas`);
    }
    if (!byMeans) return problems;
    // Total: média das subescalas, todas na mesma régua (inverter não muda a régua).
    const totalMin = mean(subscales.map(subscale => subscale.min));
    const totalMax = mean(subscales.map(subscale => subscale.max));
    if (totalMin !== instrument.scoring.min) problems.push(`mínimo declarado ${instrument.scoring.min}, cálculo dá ${totalMin}`);
    if (totalMax !== instrument.scoring.max) problems.push(`máximo declarado ${instrument.scoring.max}, cálculo dá ${totalMax}`);
  }

  if (method === 'sum' || method === 'mean') {
    const range = rangeOf(items);
    const divisor = method === 'mean' ? items.length : 1;
    if (range.min / divisor !== instrument.scoring.min) problems.push(`mínimo declarado ${instrument.scoring.min}, cálculo dá ${range.min / divisor}`);
    if (range.max / divisor !== instrument.scoring.max) problems.push(`máximo declarado ${instrument.scoring.max}, cálculo dá ${range.max / divisor}`);
  }

  // Escala sem ponto de corte clínico (Rosenberg): só a nota, nenhuma faixa.
  if (instrument.noBands) {
    if ((instrument.bands || []).length) problems.push('noBands com faixas declaradas');
    return problems;
  }

  checkBands(instrument.bands, instrument.scoring?.min, instrument.scoring?.max, '', problems, step);
  return problems;
}

/**
 * Faixas cobrindo [min, max] sem buraco nem sobreposição, ids únicos.
 * `step` = a menor diferença entre duas notas (1; 0,01 na nota por média).
 */
function checkBands(list, min, max, prefix, problems, step = 1) {
  const bands = [...(list || [])].sort((a, b) => a.min - b.min);
  if (!bands.length) {
    problems.push(`${prefix}sem faixas`);
    return;
  }
  if (bands[0].min !== min) problems.push(`${prefix}a primeira faixa não começa no mínimo`);
  if (bands[bands.length - 1].max !== max) problems.push(`${prefix}a última faixa não termina no máximo`);
  for (let index = 1; index < bands.length; index += 1) {
    if (Math.abs(bands[index].min - (bands[index - 1].max + step)) > 1e-9) {
      problems.push(`${prefix}buraco ou sobreposição entre ${bands[index - 1].id} e ${bands[index].id}`);
    }
  }
  const bandIds = bands.map(band => band.id);
  if (new Set(bandIds).size !== bandIds.length) problems.push(`${prefix}ids de faixa repetidos`);
}
