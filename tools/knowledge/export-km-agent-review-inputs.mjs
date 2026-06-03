import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const DEFAULT_INPUT = path.join(projectRoot, 'frontend', 'public', 'knowledge', 'km-agent', 'acupoints.enriched.json');
const DEFAULT_OUTPUT = path.join(projectRoot, 'docs', 'km-agent-review-inputs.json');

const DEFAULT_REVIEW_INPUTS = {
  actions: '',
  indications: '',
  cautions: '',
  relatedPatterns: '',
  techniques: 'agulha, laser, stiper',
  clinicalNote: '',
};

const PROTOCOL_POINT_NAMES_PT_BR = {
  ST36: 'Zusanli',
  SP6: 'Sanyinjiao',
  LR3: 'Taichong',
  LI4: 'Hegu',
  PC6: 'Neiguan',
  HT7: 'Shenmen',
  CV12: 'Zhongwan',
  GV20: 'Baihui',
  GB20: 'Fengchi',
  GB34: 'Yanglingquan',
  TE5: 'Waiguan',
  KI3: 'Taixi',
  SP9: 'Yinlingquan',
  ST40: 'Fenglong',
  LI11: 'Quchi',
  CV6: 'Qihai',
  SP3: 'Taibai',
  'EX-HN3': 'Yintang',
};

const MERIDIANS_PT_BR = {
  AA: 'Auriculoterapia',
  BL: 'Bexiga',
  CV: 'Vaso Concepcao',
  'EX-B': 'Pontos extras das costas',
  'EX-CA': 'Pontos extras de torax e abdome',
  'EX-HN': 'Pontos extras de cabeca e pescoco',
  'EX-LE': 'Pontos extras de membros inferiores',
  'EX-UE': 'Pontos extras de membros superiores',
  GB: 'Vesicula Biliar',
  GV: 'Vaso Governador',
  HT: 'Coracao',
  KI: 'Rim',
  LI: 'Intestino Grosso',
  LR: 'Figado',
  LU: 'Pulmao',
  PC: 'Pericardio',
  SA: 'Anatomia de superficie',
  SI: 'Intestino Delgado',
  SP: 'Baco',
  ST: 'Estomago',
  TE: 'Triplo Aquecedor',
};

const EXPLICIT_ALIASES = {
  E36: 'ST36',
  ST36: 'ST36',
  BP6: 'SP6',
  SP6: 'SP6',
  BP9: 'SP9',
  SP9: 'SP9',
  BP3: 'SP3',
  SP3: 'SP3',
  VC12: 'CV12',
  CV12: 'CV12',
  VC6: 'CV6',
  CV6: 'CV6',
  VG20: 'GV20',
  GV20: 'GV20',
  C7: 'HT7',
  HT7: 'HT7',
  CS6: 'PC6',
  PC6: 'PC6',
  F3: 'LR3',
  LR3: 'LR3',
  VB20: 'GB20',
  GB20: 'GB20',
  VB34: 'GB34',
  GB34: 'GB34',
  R3: 'KI3',
  KI3: 'KI3',
  IG4: 'LI4',
  LI4: 'LI4',
  IG11: 'LI11',
  LI11: 'LI11',
  TA5: 'TE5',
  TE5: 'TE5',
  YINTANG: 'EX-HN3',
  'EX-HN3': 'EX-HN3',
};

const CANONICAL_TO_DISPLAY = {
  ST36: 'E36',
  SP6: 'BP6',
  SP9: 'BP9',
  SP3: 'BP3',
  CV12: 'VC12',
  CV6: 'VC6',
  GV20: 'VG20',
  HT7: 'C7',
  PC6: 'PC6',
  LR3: 'F3',
  GB20: 'VB20',
  GB34: 'VB34',
  KI3: 'R3',
  LI4: 'IG4',
  LI11: 'IG11',
  TE5: 'TA5',
  'EX-HN3': 'Yintang',
};

const REVIEW_FIELD_DEFINITIONS = [
  {
    key: 'code',
    label: 'Codigo WHO',
    ui: 'input',
    type: 'text',
    required: true,
    guidance: 'Preserve o codigo WHO salvo no rascunho, corrigindo apenas se o PDF primario provar erro.',
  },
  {
    key: 'displayCode',
    label: 'Codigo exibido',
    ui: 'input',
    type: 'text',
    required: true,
    guidance: 'Preserve a forma exibida ao usuario.',
  },
  {
    key: 'title',
    label: 'Titulo',
    ui: 'input',
    type: 'text',
    required: true,
    guidance: 'Responder em pt-BR, preferindo nome tradicional quando o PDF trouxer nome confiavel.',
  },
  {
    key: 'meridianCode',
    label: 'Meridiano',
    ui: 'input',
    type: 'text',
    required: true,
    guidance: 'Codigo do meridiano, como LU, LI, ST, SP, HT, SI, BL, KI, PC, TE, GB, LR, CV, GV ou EX.',
  },
  {
    key: 'meridian',
    label: 'Nome do meridiano',
    ui: 'payload_only',
    type: 'text',
    required: false,
    guidance: 'Nome em pt-BR preservado no payload, mesmo nao aparecendo como input separado na tela.',
  },
  {
    key: 'techniques',
    label: 'Tecnicas permitidas',
    ui: 'input',
    type: 'comma_separated_text',
    required: true,
    guidance: 'Lista curta separada por virgula. Use apenas tecnicas clinicamente coerentes e revisaveis.',
  },
  {
    key: 'locationText',
    label: 'Localizacao textual',
    ui: 'textarea',
    type: 'text',
    required: true,
    guidance: 'Localizacao em pt-BR, anatomica e objetiva. Conferir primeiro no PDF primario.',
  },
  {
    key: 'actions',
    label: 'Acoes energeticas',
    ui: 'textarea',
    type: 'comma_separated_text',
    required: false,
    guidance: 'Acoes energeticas em pt-BR, separadas por virgula, sem promessas terapeuticas absolutas.',
  },
  {
    key: 'indications',
    label: 'Indicacoes',
    ui: 'textarea',
    type: 'comma_separated_text',
    required: false,
    guidance: 'Indicacoes em pt-BR, separadas por virgula. Use AcuKG como sugestao, nao como fonte aprovada.',
  },
  {
    key: 'cautions',
    label: 'Cautelas / contraindicacoes',
    ui: 'textarea',
    type: 'comma_separated_text',
    required: false,
    guidance: 'Cautelas praticas e contraindicacoes relevantes, separadas por virgula.',
  },
  {
    key: 'relatedPatterns',
    label: 'Padroes relacionados',
    ui: 'textarea',
    type: 'comma_separated_text',
    required: false,
    guidance: 'Padroes MTC relacionados, em pt-BR, separados por virgula.',
  },
  {
    key: 'needling',
    label: 'Agulhamento / tecnica',
    ui: 'textarea',
    type: 'text',
    required: false,
    guidance: 'Tecnica em pt-BR. Resolver termos coreanos/chineses quando houver base no PDF primario.',
  },
  {
    key: 'clinicalNote',
    label: 'Nota de revisao',
    ui: 'textarea',
    type: 'text',
    required: false,
    guidance: 'Justificativa breve, fonte usada e qualquer incerteza que exija revisao humana.',
  },
];

const FORM_INPUT_KEYS = REVIEW_FIELD_DEFINITIONS
  .filter(field => field.ui !== 'payload_only')
  .map(field => field.key);

const HUMAN_FILL_KEYS = [
  'actions',
  'indications',
  'cautions',
  'relatedPatterns',
  'clinicalNote',
];

function normalizePointCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const upper = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, '');

  if (EXPLICIT_ALIASES[upper]) return EXPLICIT_ALIASES[upper];

  const match = upper.match(/^([A-Z]+)(\d+)$/);
  if (!match) return raw;

  const [, prefix, number] = match;
  const prefixMap = {
    E: 'ST',
    BP: 'SP',
    VC: 'CV',
    VG: 'GV',
    C: 'HT',
    CS: 'PC',
    F: 'LR',
    VB: 'GB',
    R: 'KI',
    IG: 'LI',
    TA: 'TE',
  };

  return `${prefixMap[prefix] || prefix}${number}`;
}

function displayPointCode(value) {
  const canonical = normalizePointCode(value);
  return CANONICAL_TO_DISPLAY[canonical] || canonical || value;
}

function getKmAgentDraftMeridianPtBr(item = {}) {
  if (item.metadata?.meridianPtBr) return item.metadata.meridianPtBr;
  const code = item.metadata?.meridianCode || item.meridianCode || item.meridian?.code || '';
  return MERIDIANS_PT_BR[code] || item.meridianPtBr || '';
}

function getKmAgentDraftTitlePtBr(item = {}) {
  if (item.titlePtBr) return item.titlePtBr;
  const normalized = normalizePointCode(item.code || item.displayCode || '');
  const displayCode = item.displayCode || displayPointCode(normalized);
  const pointName = PROTOCOL_POINT_NAMES_PT_BR[normalized];
  const meridianName = getKmAgentDraftMeridianPtBr(item);

  if (pointName) {
    return meridianName
      ? `${displayCode} - ${pointName} (${meridianName})`
      : `${displayCode} - ${pointName}`;
  }

  if (meridianName) {
    return `${displayCode || normalized} - Ponto do meridiano ${meridianName}`;
  }

  return `${displayCode || normalized || 'Ponto'} - Ponto de acupuntura`;
}

function getKmAgentLocationPtBr(item = {}) {
  return item.location?.ptBr || item.locationPtBr || item.locationPreview || '';
}

function getKmAgentNeedlingPtBr(item = {}) {
  return item.needling?.ptBr || item.needlingPtBr || item.needlingPreview || '';
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function compactAcukg(acukg = {}) {
  return {
    names: acukg.names || {},
    actionTargets: acukg.actionTargets || [],
    indications: acukg.indications || [],
    anatomy: acukg.anatomy || {},
    evidence: acukg.evidence || {},
  };
}

function getFieldStatus(item) {
  return {
    code: 'prefilled_from_source',
    displayCode: 'prefilled_from_source',
    title: 'prefilled_draft_review_recommended',
    meridianCode: 'prefilled_from_source',
    meridian: item?.metadata?.meridianPtBr ? 'prefilled_from_source' : 'missing_or_unknown',
    techniques: 'default_prefilled_review_recommended',
    locationText: item?.location?.reviewRequired ? 'prefilled_draft_review_required' : 'prefilled_from_source',
    actions: 'missing',
    indications: item?.acukgSummary?.hasMatch ? 'missing_with_acukg_suggestions' : 'missing',
    cautions: 'missing',
    relatedPatterns: 'missing',
    needling: item?.needling?.reviewRequired ? 'prefilled_draft_review_required' : 'prefilled_from_source',
    clinicalNote: 'missing',
  };
}

function buildReviewInputs(item) {
  return {
    code: item?.code || '',
    displayCode: item?.displayCode || item?.code || '',
    title: getKmAgentDraftTitlePtBr(item || {}),
    meridianCode: item?.metadata?.meridianCode || '',
    meridian: item?.metadata?.meridianPtBr || item?.metadata?.meridian || '',
    techniques: DEFAULT_REVIEW_INPUTS.techniques,
    locationText: getKmAgentLocationPtBr(item || {}),
    actions: DEFAULT_REVIEW_INPUTS.actions,
    indications: DEFAULT_REVIEW_INPUTS.indications,
    cautions: DEFAULT_REVIEW_INPUTS.cautions,
    relatedPatterns: DEFAULT_REVIEW_INPUTS.relatedPatterns,
    needling: getKmAgentNeedlingPtBr(item || {}),
    clinicalNote: DEFAULT_REVIEW_INPUTS.clinicalNote,
  };
}

function buildItem(item) {
  return {
    sourceDraftId: item.id || '',
    type: item.type || 'acupoint',
    sourceStatus: item.approvalStatus || 'draft',
    source: item.source || 'km-agent/data/acupoints.csv + AcuKG',
    sourceContext: {
      code: item.code || '',
      displayCode: item.displayCode || item.code || '',
      titlePtBr: item.titlePtBr || '',
      names: item.names || {},
      meridian: {
        code: item.metadata?.meridianCode || '',
        original: item.metadata?.meridian || '',
        ptBr: item.metadata?.meridianPtBr || '',
      },
      importedLocation: {
        originalEn: item.location?.originalEn || '',
        originalKo: item.location?.originalKo || '',
        ptBrDraft: item.location?.ptBr || item.locationPreview || '',
        translationStatus: item.location?.translationStatus || '',
        confidence: item.location?.confidence || '',
        reviewRequired: Boolean(item.location?.reviewRequired),
      },
      importedNeedling: {
        original: item.needling?.original || '',
        ptBrDraft: item.needling?.ptBr || item.needlingPreview || '',
        lines: item.needling?.lines || [],
        translationStatus: item.needling?.translationStatus || '',
        confidence: item.needling?.confidence || '',
        unresolvedTerms: item.needling?.unresolvedTerms || [],
        reviewRequired: Boolean(item.needling?.reviewRequired),
      },
      acukgSummary: item.acukgSummary || {},
      acukg: compactAcukg(item.acukg || {}),
      provenance: item.provenance || [],
    },
    reviewInputs: buildReviewInputs(item),
    fieldStatus: getFieldStatus(item),
    fillPriority: {
      mustFill: HUMAN_FILL_KEYS,
      shouldReview: ['title', 'locationText', 'needling', 'techniques'],
      preserveUnlessSourceContradicts: ['code', 'displayCode', 'meridianCode', 'meridian'],
    },
    answerReferences: {
      required: true,
      format: [
        {
          field: 'locationText',
          source: 'primary_pdf',
          page: null,
          note: '',
        },
      ],
    },
  };
}

function buildPayload(items) {
  return {
    schemaVersion: 'km-agent-review-inputs.v1',
    generatedAt: new Date().toISOString(),
    sourceFiles: [
      'frontend/public/knowledge/km-agent/acupoints.enriched.json',
      'frontend/src/components/panels/KnowledgeAdminPanel.jsx',
    ],
    purpose: 'JSON com todos os inputs da tela de Revisao profissional dos rascunhos KM-Agent, para outra LLM preencher campos faltantes antes da revisao humana.',
    sourcePriority: [
      {
        order: 1,
        source: 'primary_pdf',
        instruction: 'Use primeiro o PDF clinico fornecido junto com este JSON. Cite pagina/secao quando possivel.',
      },
      {
        order: 2,
        source: 'km-agent',
        instruction: 'Use localizacao, tecnica e nomes do KM-Agent como contexto importado em rascunho.',
      },
      {
        order: 3,
        source: 'acukg',
        instruction: 'Use AcuKG apenas como sugestao nao revisada, principalmente para indicacoes, acoes e anatomia.',
      },
    ],
    rulesForOtherLlm: [
      'Responder em pt-BR.',
      'Retornar JSON valido, sem markdown.',
      'Manter todos os itens pelo sourceDraftId.',
      'Preencher reviewInputs sem alterar sourceContext.',
      'Nao marcar nenhum item como aprovado.',
      'Quando nao houver evidencia suficiente no PDF primario nem no contexto, deixe o campo vazio e explique em clinicalNote.',
      'Para campos comma_separated_text, usar texto separado por virgula, pois o app atual divide esses campos por virgula ao salvar.',
    ],
    answerShape: {
      schemaVersion: 'km-agent-review-inputs.answer.v1',
      items: [
        {
          sourceDraftId: 'acupoint:LU7',
          reviewInputs: Object.fromEntries(REVIEW_FIELD_DEFINITIONS.map(field => [field.key, ''])),
          references: [
            {
              field: 'locationText',
              source: 'primary_pdf',
              page: null,
              note: '',
            },
          ],
          confidence: 'low | medium | high',
          requiresHumanReview: true,
        },
      ],
    },
    reviewFieldDefinitions: REVIEW_FIELD_DEFINITIONS,
    formInputKeys: FORM_INPUT_KEYS,
    count: items.length,
    items: items.map(buildItem),
  };
}

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(args.input || DEFAULT_INPUT);
const outputPath = path.resolve(args.output || DEFAULT_OUTPUT);
const items = readJson(inputPath);

if (!Array.isArray(items)) {
  throw new Error(`Expected an array in ${inputPath}`);
}

writeJson(outputPath, buildPayload(items));
console.log(`Wrote ${items.length} KM-Agent review input items to ${outputPath}`);
