// ============================================================
// DADOS: Avaliação física da Fisioterapia — RASCUNHO A VALIDAR
//
// Abas próprias da área (além da anamnese): Exame físico e Escalas
// funcionais. Os dados ficam na MESMA sessão do registro fisio_anamnese
// (session.exameFisico / session.escalas) — sem record_type novo, então
// sem migração e sem o gate de upsert_versioned_clinical_record.
//
// Referências de amplitude são aproximadas (goniometria usual no ensino
// brasileiro) e servem só de apoio visual: o sistema NÃO julga se o
// valor medido está "normal". Escalas protegidas por direito autoral
// entram só com nome + escore — nunca as perguntas.
//
// Tudo aqui é proposta conservadora para a fisioterapeuta revisar.
// ============================================================

export const FISIO_EVALUATION_NOTICE =
  'Exame físico e escalas em rascunho, montados a partir de referências usuais de avaliação '
  + '(goniometria, escala MRC de força, testes especiais) e ainda não validados por fisioterapeuta. '
  + 'As referências de amplitude são aproximadas — confira com o protocolo que você usa.';

export const PAIN_SCALE_VALUES = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

export const VITAL_SIGNS = [
  { id: 'pa', label: 'Pressão arterial', unit: 'mmHg', placeholder: '120/80' },
  { id: 'fc', label: 'Frequência cardíaca', unit: 'bpm', placeholder: '72' },
  { id: 'fr', label: 'Frequência respiratória', unit: 'irpm', placeholder: '16' },
  { id: 'spo2', label: 'Saturação (SpO₂)', unit: '%', placeholder: '97' },
];

export const PAIN_FIELDS = [
  { id: 'repouso', label: 'Dor em repouso' },
  { id: 'movimento', label: 'Dor ao movimento' },
  { id: 'pior24h', label: 'Pior dor nas últimas 24 horas' },
];

// [id, rótulo, referência aproximada]
export const ROM_JOINTS = [
  {
    id: 'cervical',
    label: 'Coluna cervical',
    bilateral: false,
    movements: [['flexao', 'Flexão', '0–65°'], ['extensao', 'Extensão', '0–50°'], ['inclinacao', 'Inclinação lateral', '0–40°'], ['rotacao', 'Rotação', '0–55°']],
  },
  {
    id: 'toracolombar',
    label: 'Coluna toracolombar',
    bilateral: false,
    movements: [['flexao', 'Flexão', '0–95°'], ['extensao', 'Extensão', '0–35°'], ['inclinacao', 'Inclinação lateral', '0–40°'], ['rotacao', 'Rotação', '0–35°']],
  },
  {
    id: 'ombro',
    label: 'Ombro',
    bilateral: true,
    movements: [['flexao', 'Flexão', '0–180°'], ['extensao', 'Extensão', '0–45°'], ['abducao', 'Abdução', '0–180°'], ['aducao', 'Adução', '0–40°'], ['rotacaoInterna', 'Rotação interna', '0–70°'], ['rotacaoExterna', 'Rotação externa', '0–90°']],
  },
  {
    id: 'cotovelo',
    label: 'Cotovelo e antebraço',
    bilateral: true,
    movements: [['flexao', 'Flexão', '0–145°'], ['pronacao', 'Pronação', '0–90°'], ['supinacao', 'Supinação', '0–90°']],
  },
  {
    id: 'punho',
    label: 'Punho',
    bilateral: true,
    movements: [['flexao', 'Flexão', '0–90°'], ['extensao', 'Extensão', '0–70°'], ['desvioRadial', 'Desvio radial', '0–20°'], ['desvioUlnar', 'Desvio ulnar', '0–45°']],
  },
  {
    id: 'quadril',
    label: 'Quadril',
    bilateral: true,
    movements: [['flexao', 'Flexão', '0–125°'], ['extensao', 'Extensão', '0–10°'], ['abducao', 'Abdução', '0–45°'], ['aducao', 'Adução', '0–15°'], ['rotacaoInterna', 'Rotação interna', '0–45°'], ['rotacaoExterna', 'Rotação externa', '0–45°']],
  },
  {
    id: 'joelho',
    label: 'Joelho',
    bilateral: true,
    movements: [['flexao', 'Flexão', '0–140°']],
  },
  {
    id: 'tornozelo',
    label: 'Tornozelo e pé',
    bilateral: true,
    movements: [['dorsiflexao', 'Dorsiflexão', '0–20°'], ['flexaoPlantar', 'Flexão plantar', '0–45°'], ['inversao', 'Inversão', '0–40°'], ['eversao', 'Eversão', '0–20°']],
  },
];

export const SIDES = [
  ['D', 'Direito'],
  ['E', 'Esquerdo'],
];

// Escala MRC (Medical Research Council) de força muscular, 0–5.
export const MRC_GRADES = [
  ['0', '0 — sem contração'],
  ['1', '1 — contração sem movimento'],
  ['2', '2 — movimento sem a gravidade'],
  ['3', '3 — vence a gravidade'],
  ['4', '4 — vence alguma resistência'],
  ['5', '5 — força normal'],
];

export const STRENGTH_GROUPS = [
  'Flexores de ombro',
  'Abdutores de ombro',
  'Rotadores externos de ombro',
  'Flexores de cotovelo',
  'Extensores de cotovelo',
  'Extensores de punho',
  'Preensão palmar',
  'Flexores de quadril',
  'Abdutores de quadril',
  'Extensores de quadril',
  'Extensores de joelho (quadríceps)',
  'Flexores de joelho (isquiotibiais)',
  'Dorsiflexores de tornozelo',
  'Flexores plantares',
  'Estabilizadores do tronco',
];

export const SPECIAL_TESTS = [
  { region: 'Coluna', tests: ['Elevação da perna estendida (Lasègue)', 'Slump', 'Spurling', 'Distração cervical'] },
  { region: 'Ombro', tests: ['Neer', 'Hawkins-Kennedy', 'Jobe', 'Speed', 'Apreensão'] },
  { region: 'Cotovelo, punho e mão', tests: ['Cozen', 'Phalen', 'Tinel no punho', 'Finkelstein'] },
  { region: 'Quadril e pelve', tests: ['FABER (Patrick)', 'Thomas', 'Trendelenburg'] },
  { region: 'Joelho', tests: ['Lachman', 'Gaveta anterior do joelho', 'McMurray', 'Estresse em valgo', 'Estresse em varo'] },
  { region: 'Tornozelo e pé', tests: ['Gaveta anterior do tornozelo', 'Thompson'] },
];

export const TEST_RESULTS = [
  ['', 'Não testado'],
  ['negativo', 'Negativo'],
  ['positivo', 'Positivo'],
  ['inconclusivo', 'Inconclusivo'],
];

export const EXAM_TEXT_FIELDS = [
  { id: 'inspecao', label: 'Inspeção, postura e marcha' },
  { id: 'palpacao', label: 'Palpação' },
  { id: 'observacoes', label: 'Outros achados do exame' },
];

// Só nome, faixa e unidade — as perguntas das escalas não são reproduzidas.
export const FUNCTIONAL_SCALES = [
  { id: 'odi', label: 'Oswestry (ODI)', unit: '%', range: '0–100%', about: 'incapacidade por dor lombar' },
  { id: 'ndi', label: 'Neck Disability Index (NDI)', unit: '%', range: '0–100%', about: 'incapacidade por dor cervical' },
  { id: 'quickdash', label: 'QuickDASH', unit: 'pontos', range: '0–100', about: 'função do membro superior' },
  { id: 'lefs', label: 'LEFS', unit: 'pontos', range: '0–80', about: 'função do membro inferior' },
  { id: 'berg', label: 'Escala de Berg', unit: 'pontos', range: '0–56', about: 'equilíbrio' },
  { id: 'tug', label: 'Timed Up and Go (TUG)', unit: 's', range: 'tempo em segundos', about: 'mobilidade e risco de queda' },
  { id: 'tc6', label: 'Teste de caminhada de 6 minutos', unit: 'm', range: 'distância em metros', about: 'capacidade funcional' },
  { id: 'borg', label: 'Escala de Borg (esforço)', unit: 'pontos', range: '6–20 ou 0–10', about: 'percepção de esforço' },
  { id: 'barthel', label: 'Índice de Barthel', unit: 'pontos', range: '0–100', about: 'independência nas atividades diárias' },
  { id: 'mmrc', label: 'Escala mMRC de dispneia', unit: 'grau', range: '0–4', about: 'limitação por falta de ar' },
];

export const CUSTOM_SCALE_ID = 'outra';

// ---- Estruturas e normalização ------------------------------------

export function createEmptyFisioExame() {
  return {
    sinais: Object.fromEntries(VITAL_SIGNS.map(field => [field.id, ''])),
    dor: Object.fromEntries(PAIN_FIELDS.map(field => [field.id, ''])),
    adm: [],
    forca: [],
    testes: {},
    ...Object.fromEntries(EXAM_TEXT_FIELDS.map(field => [field.id, ''])),
  };
}

const asObject = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const asArray = value => (Array.isArray(value) ? value : []);

export function normalizeFisioExame(raw) {
  const empty = createEmptyFisioExame();
  const source = asObject(raw);
  return {
    ...empty,
    ...source,
    sinais: { ...empty.sinais, ...asObject(source.sinais) },
    dor: { ...empty.dor, ...asObject(source.dor) },
    adm: asArray(source.adm),
    forca: asArray(source.forca),
    testes: { ...asObject(source.testes) },
  };
}

export function createEmptyFisioEscalas() {
  return { itens: [], observacoes: '' };
}

export function normalizeFisioEscalas(raw) {
  const source = asObject(raw);
  return { ...createEmptyFisioEscalas(), ...source, itens: asArray(source.itens) };
}

export function getRomJoint(jointId) {
  return ROM_JOINTS.find(joint => joint.id === jointId) || null;
}

export function getRomMovement(jointId, movementId) {
  const joint = getRomJoint(jointId);
  const movement = joint?.movements.find(([id]) => id === movementId);
  return movement ? { id: movement[0], label: movement[1], reference: movement[2] } : null;
}

export function getFunctionalScale(scaleId) {
  return FUNCTIONAL_SCALES.find(scale => scale.id === scaleId) || null;
}

export function scaleLabel(entry) {
  if (entry?.scaleId === CUSTOM_SCALE_ID) return String(entry.label || '').trim() || 'Outra escala';
  return getFunctionalScale(entry?.scaleId)?.label || 'Escala';
}

const filled = value => String(value ?? '').trim().length > 0;
// "34%" e "150°" sem espaço; demais unidades com espaço ("72 bpm").
export const withUnit = (value, unit) => (unit ? `${value}${['%', '°'].includes(unit) ? '' : ' '}${unit}` : `${value}`);
const sideLabel = side => (side === 'D' ? 'direito' : side === 'E' ? 'esquerdo' : '');

export function describeRomEntry(entry) {
  const joint = getRomJoint(entry.joint);
  const movement = getRomMovement(entry.joint, entry.movement);
  const where = [joint?.label, movement?.label?.toLowerCase(), sideLabel(entry.side)].filter(Boolean).join(' — ');
  const values = [
    filled(entry.active) ? `ativo ${entry.active}°` : '',
    filled(entry.passive) ? `passivo ${entry.passive}°` : '',
  ].filter(Boolean).join(', ');
  const reference = movement?.reference ? ` (ref. ${movement.reference})` : '';
  const pain = entry.pain ? '; com dor' : '';
  return { label: where || 'Movimento', value: `${values || 'sem valor registrado'}${reference}${pain}` };
}

export function describeStrengthEntry(entry) {
  const grade = MRC_GRADES.find(([value]) => value === String(entry.grade));
  return {
    label: [entry.group || 'Grupo muscular', sideLabel(entry.side)].filter(Boolean).join(' — '),
    value: grade ? `grau ${grade[1]}` : 'grau não registrado',
  };
}

/**
 * Seções do relatório. O registro interno leva o exame inteiro; o
 * relatório que sai da clínica leva só dor, testes positivos e escalas
 * (medidas objetivas, sem o detalhe do prontuário).
 */
export function buildFisioReportSections(session, scope) {
  const exame = normalizeFisioExame(session?.exameFisico);
  const escalas = normalizeFisioEscalas(session?.escalas);
  const sections = [];

  const pain = PAIN_FIELDS
    .filter(field => filled(exame.dor[field.id]))
    .map(field => ({ label: field.label, value: `${exame.dor[field.id]}/10` }));
  const positives = Object.entries(exame.testes)
    .filter(([, result]) => result?.result === 'positivo')
    .map(([name, result]) => `${name}${result.side ? ` (${sideLabel(result.side)})` : ''}`);

  if (scope === 'full') {
    const rows = [
      ...VITAL_SIGNS.filter(field => filled(exame.sinais[field.id]))
        .map(field => ({ label: field.label, value: withUnit(exame.sinais[field.id], field.unit) })),
      ...pain,
      ...exame.adm.map(describeRomEntry),
      ...exame.forca.map(describeStrengthEntry),
      ...Object.entries(exame.testes)
        .filter(([, result]) => filled(result?.result))
        .map(([name, result]) => ({
          label: `Teste ${name}${result.side ? ` (${sideLabel(result.side)})` : ''}`,
          value: TEST_RESULTS.find(([value]) => value === result.result)?.[1].toLowerCase() || result.result,
        })),
      ...EXAM_TEXT_FIELDS.filter(field => filled(exame[field.id]))
        .map(field => ({ label: field.label, value: String(exame[field.id]).trim() })),
    ];
    if (rows.length) sections.push({ title: 'Exame físico', rows });
  } else {
    const rows = [
      ...pain,
      ...(positives.length ? [{ label: 'Testes especiais positivos', value: positives.join('; ') }] : []),
    ];
    if (rows.length) sections.push({ title: 'Exame físico', rows });
  }

  const scaleRows = escalas.itens
    .filter(entry => filled(entry.score))
    .map(entry => {
      const scale = getFunctionalScale(entry.scaleId);
      return {
        label: scaleLabel(entry),
        value: `${withUnit(entry.score, scale?.unit)}${entry.date ? ` — ${entry.date}` : ''}`,
      };
    });
  if (scope === 'full' && filled(escalas.observacoes)) {
    scaleRows.push({ label: 'Observações da avaliação funcional', value: String(escalas.observacoes).trim() });
  }
  if (scaleRows.length) sections.push({ title: 'Escalas funcionais', rows: scaleRows });

  return sections;
}
