// ============================================================
// DADOS: Avaliação da Nutrição — RASCUNHO A VALIDAR
//
// Abas próprias da área (além da anamnese): Antropometria, Consumo
// alimentar e Exames. Os dados ficam na MESMA sessão do registro
// nutri_anamnese (session.antropometria / session.consumo /
// session.exames) — sem record_type novo, sem migração.
//
// O sistema calcula IMC e relação cintura-quadril e mostra a faixa pelos
// pontos de corte usuais (OMS para adultos, Lipschitz para idosos). Não
// interpreta exame (a referência é a do laudo do laboratório) e NÃO gera
// conduta, cardápio nem plano alimentar — isso é da nutricionista.
// ============================================================

export const NUTRI_EVALUATION_NOTICE =
  'Avaliação em rascunho, ainda não validada por nutricionista. A faixa de IMC segue pontos de corte '
  + 'usuais (OMS para adultos; Lipschitz para idosos) e serve de apoio — a interpretação é sua. '
  + 'Nada aqui gera conduta ou plano alimentar.';

export const ANTHRO_BASIC_FIELDS = [
  { id: 'peso', label: 'Peso', unit: 'kg' },
  { id: 'altura', label: 'Altura', unit: 'cm' },
  { id: 'cintura', label: 'Circunferência da cintura', unit: 'cm' },
  { id: 'quadril', label: 'Circunferência do quadril', unit: 'cm' },
  { id: 'braco', label: 'Circunferência do braço', unit: 'cm' },
  { id: 'panturrilha', label: 'Circunferência da panturrilha', unit: 'cm' },
];

export const ANTHRO_SKINFOLD_FIELDS = [
  { id: 'tricipital', label: 'Dobra tricipital', unit: 'mm' },
  { id: 'subescapular', label: 'Dobra subescapular', unit: 'mm' },
  { id: 'suprailiaca', label: 'Dobra suprailíaca', unit: 'mm' },
  { id: 'abdominal', label: 'Dobra abdominal', unit: 'mm' },
];

export const ANTHRO_COMPOSITION_FIELDS = [
  { id: 'gordura', label: 'Gordura corporal (bioimpedância)', unit: '%' },
  { id: 'massaMagra', label: 'Massa magra', unit: 'kg' },
];

export const ANTHRO_ALL_FIELDS = [
  ...ANTHRO_BASIC_FIELDS,
  ...ANTHRO_SKINFOLD_FIELDS,
  ...ANTHRO_COMPOSITION_FIELDS,
];

export const MEALS = [
  { id: 'cafe', label: 'Café da manhã' },
  { id: 'lancheManha', label: 'Lanche da manhã' },
  { id: 'almoco', label: 'Almoço' },
  { id: 'lancheTarde', label: 'Lanche da tarde' },
  { id: 'jantar', label: 'Jantar' },
  { id: 'ceia', label: 'Ceia' },
];

export const DAY_TYPES = ['Dia típico (semana)', 'Fim de semana', 'Dia atípico'];

// Unidade padrão só como sugestão: vale a do laudo.
export const EXAM_CATALOG = [
  { name: 'Glicemia de jejum', unit: 'mg/dL' },
  { name: 'Hemoglobina glicada (HbA1c)', unit: '%' },
  { name: 'Insulina de jejum', unit: 'µUI/mL' },
  { name: 'Colesterol total', unit: 'mg/dL' },
  { name: 'HDL', unit: 'mg/dL' },
  { name: 'LDL', unit: 'mg/dL' },
  { name: 'Triglicerídeos', unit: 'mg/dL' },
  { name: 'Hemoglobina', unit: 'g/dL' },
  { name: 'Ferritina', unit: 'ng/mL' },
  { name: 'Ferro sérico', unit: 'µg/dL' },
  { name: 'Vitamina B12', unit: 'pg/mL' },
  { name: 'Vitamina D (25-OH)', unit: 'ng/mL' },
  { name: 'TSH', unit: 'µUI/mL' },
  { name: 'Creatinina', unit: 'mg/dL' },
  { name: 'Ureia', unit: 'mg/dL' },
  { name: 'TGO (AST)', unit: 'U/L' },
  { name: 'TGP (ALT)', unit: 'U/L' },
  { name: 'Ácido úrico', unit: 'mg/dL' },
  { name: 'Proteína C reativa (PCR)', unit: 'mg/L' },
  { name: 'Albumina', unit: 'g/dL' },
];

// ---- Cálculos ------------------------------------------------------

/** Aceita "72,5" e "72.5"; devolve null para vazio ou inválido. */
export function parseMeasure(value) {
  const text = String(value ?? '').trim().replace(',', '.');
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function formatDecimal(value, digits = 1) {
  return Number.isFinite(value)
    ? value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '';
}

export function computeBmi(peso, alturaCm) {
  const weight = parseMeasure(peso);
  const height = parseMeasure(alturaCm);
  if (!weight || !height) return null;
  const meters = height / 100;
  return Math.round((weight / (meters * meters)) * 10) / 10;
}

export function computeWaistHipRatio(cintura, quadril) {
  const waist = parseMeasure(cintura);
  const hip = parseMeasure(quadril);
  if (!waist || !hip) return null;
  return Math.round((waist / hip) * 100) / 100;
}

/**
 * Faixa de IMC pelos pontos de corte usuais. Descritiva: não é
 * diagnóstico nutricional. Criança/adolescente usa curva por idade.
 */
export function classifyBmi(bmi, age) {
  if (!Number.isFinite(bmi)) return null;
  // getPatientAge devolve texto ("34"); vazio = idade não informada.
  const years = typeof age === 'string' && age.trim() ? Number(age) : age;
  const knownAge = Number.isFinite(years);
  if (knownAge && years < 20) {
    return { label: 'use a curva de IMC para idade (OMS)', reference: 'crianças e adolescentes', needsCurve: true };
  }
  if (knownAge && years >= 60) {
    const label = bmi < 22 ? 'baixo peso' : bmi <= 27 ? 'eutrofia' : 'sobrepeso';
    return { label, reference: 'Lipschitz (idosos)' };
  }
  const label = bmi < 18.5
    ? 'baixo peso'
    : bmi < 25
      ? 'eutrofia'
      : bmi < 30
        ? 'sobrepeso'
        : bmi < 35
          ? 'obesidade grau I'
          : bmi < 40
            ? 'obesidade grau II'
            : 'obesidade grau III';
  return { label, reference: knownAge ? 'OMS (adultos)' : 'OMS (adultos) — idade não informada' };
}

// ---- Estruturas e normalização ------------------------------------

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = value => (Array.isArray(value) ? value : []);
const filled = value => String(value ?? '').trim().length > 0;
const withUnit = (value, unit) => `${value}${unit === '%' ? '' : ' '}${unit}`;

export function createMeasurement(id, date = '') {
  return {
    id,
    date,
    ...Object.fromEntries(ANTHRO_ALL_FIELDS.map(field => [field.id, ''])),
    observacoes: '',
  };
}

export function normalizeAntropometria(raw) {
  const source = asObject(raw);
  return { ...source, medidas: asArray(source.medidas) };
}

export function createEmptyConsumo() {
  return {
    tipoDia: '',
    refeicoes: Object.fromEntries(MEALS.map(meal => [meal.id, { horario: '', local: '', alimentos: '' }])),
    agua: '',
    observacoes: '',
  };
}

export function normalizeConsumo(raw) {
  const empty = createEmptyConsumo();
  const source = asObject(raw);
  const refeicoes = asObject(source.refeicoes);
  return {
    ...empty,
    ...source,
    refeicoes: Object.fromEntries(MEALS.map(meal => [meal.id, { ...empty.refeicoes[meal.id], ...asObject(refeicoes[meal.id]) }])),
  };
}

export function normalizeExames(raw) {
  const source = asObject(raw);
  return { observacoes: '', ...source, itens: asArray(source.itens) };
}

/** Medida mais recente é a primeira da lista (a tela insere no topo). */
export function latestMeasurement(antropometria) {
  return normalizeAntropometria(antropometria).medidas[0] || null;
}

export function describeMeasurement(entry, age) {
  if (!entry) return [];
  const rows = ANTHRO_ALL_FIELDS
    .filter(field => filled(entry[field.id]))
    .map(field => ({ label: field.label, value: withUnit(entry[field.id], field.unit) }));
  const bmi = computeBmi(entry.peso, entry.altura);
  if (bmi) {
    const range = classifyBmi(bmi, age);
    rows.push({ label: 'IMC', value: `${formatDecimal(bmi)} kg/m²${range ? ` — ${range.label}, referência ${range.reference}` : ''}` });
  }
  const ratio = computeWaistHipRatio(entry.cintura, entry.quadril);
  if (ratio) rows.push({ label: 'Relação cintura-quadril', value: formatDecimal(ratio, 2) });
  if (filled(entry.observacoes)) rows.push({ label: 'Observações da medida', value: String(entry.observacoes).trim() });
  return rows;
}

/**
 * Seções do relatório. O registro interno leva antropometria, consumo e
 * exames; o relatório que sai da clínica leva só a medida mais recente.
 */
export function buildNutriReportSections(session, scope, age) {
  const antropometria = normalizeAntropometria(session?.antropometria);
  const consumo = normalizeConsumo(session?.consumo);
  const exames = normalizeExames(session?.exames);
  const sections = [];

  const latest = antropometria.medidas[0];
  const measureRows = describeMeasurement(latest, age);
  if (measureRows.length) {
    sections.push({
      title: `Antropometria${latest?.date ? ` — ${latest.date}` : ''}`,
      rows: scope === 'full' ? measureRows : measureRows.filter(row => ['Peso', 'Altura', 'IMC'].includes(row.label)),
    });
  }
  if (scope !== 'full') return sections;

  if (antropometria.medidas.length > 1) {
    const previous = antropometria.medidas[1];
    const now = parseMeasure(latest?.peso);
    const before = parseMeasure(previous?.peso);
    if (now && before) {
      const delta = Math.round((now - before) * 10) / 10;
      sections.push({
        title: 'Evolução do peso',
        rows: [{
          label: `Desde ${previous.date || 'a medida anterior'}`,
          value: `${delta > 0 ? '+' : ''}${formatDecimal(delta)} kg`,
        }],
      });
    }
  }

  const mealRows = MEALS
    .filter(meal => filled(consumo.refeicoes[meal.id].alimentos))
    .map(meal => {
      const item = consumo.refeicoes[meal.id];
      const when = [item.horario, item.local].filter(filled).join(', ');
      return { label: `${meal.label}${when ? ` (${when})` : ''}`, value: String(item.alimentos).trim() };
    });
  const consumoRows = [
    ...(filled(consumo.tipoDia) ? [{ label: 'Dia avaliado', value: consumo.tipoDia }] : []),
    ...mealRows,
    ...(filled(consumo.agua) ? [{ label: 'Água', value: String(consumo.agua).trim() }] : []),
    ...(filled(consumo.observacoes) ? [{ label: 'Observações', value: String(consumo.observacoes).trim() }] : []),
  ];
  if (mealRows.length || filled(consumo.agua)) sections.push({ title: 'Consumo alimentar (recordatório 24h)', rows: consumoRows });

  const examRows = exames.itens
    .filter(item => filled(item.nome) && filled(item.valor))
    .map(item => ({
      label: `${item.nome}${item.data ? ` (${item.data})` : ''}`,
      value: `${item.valor}${item.unidade ? ` ${item.unidade}` : ''}${filled(item.obs) ? ` — ${String(item.obs).trim()}` : ''}`,
    }));
  if (filled(exames.observacoes)) {
    examRows.push({ label: 'Observações sobre os exames', value: String(exames.observacoes).trim() });
  }
  if (examRows.length) sections.push({ title: 'Exames laboratoriais', rows: examRows });

  return sections;
}
