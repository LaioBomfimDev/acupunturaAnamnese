const NUMERIC_LIMITS = {
  dorRepouso: { min: 0, max: 10, label: 'Dor em repouso' },
  dorMovimento: { min: 0, max: 10, label: 'Dor em movimento' },
  mudancaGlobal: { min: -5, max: 5, label: 'Mudança percebida global' },
  tugSegundos: { min: 0, max: 600, label: 'TUG' },
  sentarLevantar5xSegundos: { min: 0, max: 600, label: 'Sentar e levantar 5x' },
  equilibrioDireitoSegundos: { min: 0, max: 600, label: 'Equilíbrio unipodal direito' },
  equilibrioEsquerdoSegundos: { min: 0, max: 600, label: 'Equilíbrio unipodal esquerdo' },
  dedosSoloCm: { min: -100, max: 300, label: 'Distância dedos-solo' },
};

const MEASUREMENT_FIELDS = [
  ...Object.keys(NUMERIC_LIMITS),
  'amplitudeMovimento',
  'objetivoFuncional',
  'observacoes',
];

// Unidades de exibição em relatório/evolução (o input usa dicas próprias).
const METRIC_REPORT_SUFFIX = {
  tugSegundos: ' s',
  sentarLevantar5xSegundos: ' s',
  equilibrioDireitoSegundos: ' s',
  equilibrioEsquerdoSegundos: ' s',
  dedosSoloCm: ' cm',
};

export function createEmptyRehabilitationAssessment() {
  return {
    data: new Date().toLocaleDateString('pt-BR'),
    objetivoFuncional: '',
    dorRepouso: '',
    dorMovimento: '',
    mudancaGlobal: '',
    tugSegundos: '',
    sentarLevantar5xSegundos: '',
    equilibrioDireitoSegundos: '',
    equilibrioEsquerdoSegundos: '',
    dedosSoloCm: '',
    amplitudeMovimento: '',
    observacoes: '',
  };
}

export function normalizeRehabilitationState(value) {
  return {
    ativa: Boolean(value?.ativa),
    avaliacoes: Array.isArray(value?.avaliacoes) ? value.avaliacoes : [],
  };
}

function parseOptionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function hasMeaningfulValue(value) {
  return String(value ?? '').trim().length > 0;
}

export function validateRehabilitationAssessment(form = {}) {
  const errors = {};

  for (const [field, { min, max, label }] of Object.entries(NUMERIC_LIMITS)) {
    const value = parseOptionalNumber(form[field]);
    if (value === null) continue;
    if (!Number.isFinite(value) || value < min || value > max) {
      errors[field] = `${label}: informe um valor entre ${min} e ${max}.`;
    }
  }

  if (!MEASUREMENT_FIELDS.some(field => hasMeaningfulValue(form[field]))) {
    errors.form = 'Informe ao menos uma medida, objetivo funcional ou observação para registrar a avaliação.';
  }

  return {
    ok: Object.keys(errors).length === 0,
    errors,
  };
}

export function buildRehabilitationAssessment(form = {}, sequence = 1) {
  const validation = validateRehabilitationAssessment(form);
  if (!validation.ok) return { assessment: null, validation };

  const assessment = {
    avaliacao: sequence,
    data: String(form.data || '').trim() || new Date().toLocaleDateString('pt-BR'),
    objetivoFuncional: String(form.objetivoFuncional || '').trim(),
    amplitudeMovimento: String(form.amplitudeMovimento || '').trim(),
    observacoes: String(form.observacoes || '').trim(),
  };

  for (const field of Object.keys(NUMERIC_LIMITS)) {
    assessment[field] = parseOptionalNumber(form[field]);
  }

  return { assessment, validation };
}

export function formatOptionalMetric(value, suffix = '') {
  return value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
}

function numericOrNull(value) {
  const parsed = parseOptionalNumber(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// Resume as avaliações de reabilitação para o relatório/evolução: primeira →
// última e a variação bruta de cada medida. Apenas reporta números; não
// classifica "melhora/piora" — a interpretação fica com a profissional.
export function summarizeRehabilitation(value) {
  const { ativa, avaliacoes } = normalizeRehabilitationState(value);
  if (!ativa || avaliacoes.length === 0) return null;

  const primeira = avaliacoes[0];
  const ultima = avaliacoes[avaliacoes.length - 1];

  const metricas = Object.entries(NUMERIC_LIMITS)
    .map(([field, { label }]) => {
      const primeiro = numericOrNull(primeira[field]);
      const ultimo = numericOrNull(ultima[field]);
      if (primeiro === null && ultimo === null) return null;
      const delta = primeiro !== null && ultimo !== null
        ? Number((ultimo - primeiro).toFixed(2))
        : null;
      return { field, label, suffix: METRIC_REPORT_SUFFIX[field] || '', primeiro, ultimo, delta };
    })
    .filter(Boolean);

  return {
    total: avaliacoes.length,
    primeira: { avaliacao: primeira.avaliacao, data: primeira.data },
    ultima: { avaliacao: ultima.avaliacao, data: ultima.data },
    objetivoFuncional: String(ultima.objetivoFuncional || primeira.objetivoFuncional || '').trim(),
    metricas,
  };
}
