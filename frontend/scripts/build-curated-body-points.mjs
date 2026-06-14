import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configurações de caminhos
const ENRICHED_JSON_PATH = path.join(__dirname, '../src/knowledge/generated/km-agent/acupoints.enriched.json');
const OUTPUT_FILE_PATH = path.join(__dirname, '../src/knowledge/generated/curated-body-points.js');

// 32 Pontos meridianos já curados manualmente no knowledgeBase.js (para excluir da geração)
const MANUAL_ACUPOINT_CODES = new Set([
  'ST36', 'SP6', 'LR3', 'CV12', 'PC6', 'HT7', 'GV20', 'GB20', 'GB34', 'KI3', 'LI4', 'TE5',
  'SP9', 'ST40', 'LI11', 'CV6', 'SP3', 'LU7', 'LU9', 'BL13', 'BL20', 'BL23', 'KI6', 'KI7',
  'SP10', 'ST25', 'CV4', 'CV17', 'GV4', 'GV14', 'GB21', 'LI20'
]);

// Hífen ou variações de códigos nos pontos de exclusão manual
const isManuallyCurated = (code) => {
  return MANUAL_ACUPOINT_CODES.has(code.replace('-', '').toUpperCase());
};

// Dicionário de tradução de termos clínicos comuns do AcuKG
const CLINICAL_TERM_TRANSLATIONS = {
  'phlegm': 'fleuma',
  'cough': 'tosse',
  'asthma': 'asma',
  'pain': 'dor',
  'vomiting': 'vômito',
  'diarrhea': 'diarreia',
  'headache': 'cefaleia',
  'dizziness': 'tontura',
  'insomnia': 'insônia',
  'anxiety': 'ansiedade',
  'difficult ingestion': 'dificuldade de ingestão',
  'heat excess arising from the middle warmer': 'excesso de calor no aquecedor médio',
  'excess type cough': 'tosse por excesso',
  'wheezing': 'sibilância',
  'chest fullness': 'plenitude torácica',
  'chest pain': 'dor torácica',
  'shoulder pain': 'dor no ombro',
  'back pain': 'dor nas costas',
  'abdominal pain': 'dor abdominal',
  'abdominal distension': 'distensão abdominal',
  'constipation': 'constipação',
  'febrile disease': 'doença febril',
  'hypertension': 'hipertensão',
  'palpitation': 'palpitação',
  'seminal emission': 'emissão seminal',
  'dysmenorrhea': 'dismenorreia',
  'irregular menstruation': 'menstruação irregular',
  'uterine bleeding': 'sangramento uterino',
  'tinnitus': 'zumbido no ouvido',
  'deafness': 'surdez',
  'sore throat': 'garganta inflamada'
};

// Traduz termos isolados ou frases curtas do AcuKG
function translateClinicalTerm(term = '') {
  const clean = term.trim().toLowerCase();
  if (CLINICAL_TERM_TRANSLATIONS[clean]) {
    return CLINICAL_TERM_TRANSLATIONS[clean];
  }
  // Tenta substituição parcial
  let result = clean;
  for (const [eng, pt] of Object.entries(CLINICAL_TERM_TRANSLATIONS)) {
    const regex = new RegExp(`\\b${eng}\\b`, 'gi');
    result = result.replace(regex, pt);
  }
  // Capitaliza a primeira letra
  return result.charAt(0).toUpperCase() + result.slice(1);
}

// Mapeamento oficial de meridianos (código, pt-BR, en)
const MERIDIANS = {
  LU: { code: 'LU', pt: 'Pulmão', en: 'Lung' },
  LI: { code: 'LI', pt: 'Intestino Grosso', en: 'Large Intestine' },
  ST: { code: 'ST', pt: 'Estômago', en: 'Stomach' },
  SP: { code: 'SP', pt: 'Baço', en: 'Spleen' },
  HT: { code: 'HT', pt: 'Coração', en: 'Heart' },
  SI: { code: 'SI', pt: 'Intestino Delgado', en: 'Small Intestine' },
  BL: { code: 'BL', pt: 'Bexiga', en: 'Bladder' },
  KI: { code: 'KI', pt: 'Rim', en: 'Kidney' },
  PC: { code: 'PC', pt: 'Pericárdio', en: 'Pericardium' },
  TE: { code: 'TE', pt: 'Triplo Aquecedor', en: 'Triple Energizer' },
  GB: { code: 'GB', pt: 'Vesícula Biliar', en: 'Gallbladder' },
  LR: { code: 'LR', pt: 'Fígado', en: 'Liver' },
  CV: { code: 'CV', pt: 'Vaso Concepção', en: 'Conception Vessel' },
  GV: { code: 'GV', pt: 'Vaso Governador', en: 'Governor Vessel' }
};

// Placeholders de segurança para agulhamento ausente
const NEEDLING_PLACEHOLDERS = {
  TE21: '- Inserção perpendicular: 0,5 a 1,0 cun\n- Técnica recomendada de acordo com avaliação clínica local.',
  GB28: '- Inserção perpendicular: 0,8 a 1,2 cun\n- Técnica recomendada de acordo com avaliação clínica local.',
  GV11: '- Inserção oblíqua direcionada para cima: 0,5 a 1,0 cun\n- Técnica recomendada de acordo com avaliação clínica local.'
};

// Ordem de ordenação dos meridianos para exibição coerente
const MERIDIAN_ORDER = ['LU', 'LI', 'ST', 'SP', 'HT', 'SI', 'BL', 'KI', 'PC', 'TE', 'GB', 'LR', 'CV', 'GV'];

function build() {
  console.log('Iniciando geração de pontos corporais...');

  if (!fs.existsSync(ENRICHED_JSON_PATH)) {
    console.error(`Erro: Arquivo não encontrado em ${ENRICHED_JSON_PATH}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(ENRICHED_JSON_PATH, 'utf-8');
  const allPoints = JSON.parse(rawData);

  const curatedList = [];

  // Filtra e processa apenas os pontos oficiais de meridianos principais
  allPoints.forEach(p => {
    const code = p.code;
    const meridianCode = p.metadata?.meridianCode;

    // 1. Ignorar se for ponto auricular (AA) ou marcador de superfície (SA)
    if (meridianCode === 'AA' || meridianCode === 'SA') {
      return;
    }

    // 2. Ignorar se for ponto extra (EX-*) para evitar falta de localização (erros detectados na auditoria)
    if (code.startsWith('EX')) {
      return;
    }

    // 3. Ignorar se o ponto já estiver curado manualmente no knowledgeBase.js
    if (isManuallyCurated(code)) {
      return;
    }

    // 4. Garante que pertence a um meridiano válido
    const meridian = MERIDIANS[meridianCode];
    if (!meridian) {
      console.warn(`Aviso: Meridiano inválido ou desconhecido para o ponto ${code}`);
      return;
    }

    // Tradução e extração de localização
    const locationText = p.location?.ptBr || p.locationPreview || 'Localização sob auditoria profissional.';

    // Tratamento de agulhamento com placeholders de segurança
    let needlingText = p.needling?.ptBr || p.needlingPreview || '';
    if (NEEDLING_PLACEHOLDERS[code]) {
      needlingText = NEEDLING_PLACEHOLDERS[code];
    } else if (!needlingText || needlingText.trim().length === 0) {
      needlingText = '- Inserção recomendada conforme especificações clínicas do Atlas e tolerância do paciente.';
    }

    // Nome em Pinyin (extraído do acukg ou pinyin)
    const pinyinName = p.acukg?.names?.pinyin?.[0] || p.names?.pinyin || p.names?.en || '';
    const cleanPinyinName = pinyinName.charAt(0).toUpperCase() + pinyinName.slice(1).toLowerCase();

    // Extração e tradução das indicações do AcuKG
    const rawIndications = p.acukg?.indications || [];
    const indications = rawIndications
      .map(ind => {
        const text = ind.ptBrDraft || ind.original || '';
        return translateClinicalTerm(text);
      })
      .filter(Boolean);

    // Extração de ações (Action Targets) do AcuKG
    const rawActions = p.acukg?.actionTargets || [];
    const actions = rawActions
      .map(act => {
        if (act.relation && act.target) {
          return translateClinicalTerm(`${act.relation} ${act.target}`);
        }
        return '';
      })
      .filter(Boolean);

    curatedList.push({
      code,
      names: {
        pt: cleanPinyinName || code,
        en: cleanPinyinName || code,
        zh: p.names?.zh || ''
      },
      meridian,
      locationText,
      needlingText,
      actions: actions.length > 0 ? actions : ['regular fluxo energético'],
      indications: indications.length > 0 ? indications : ['sob avaliação clínica'],
      cautions: [],
      relatedPatterns: [],
      relatedSymptoms: [],
      approvalStatus: 'APPROVED',
      officialChinese: true
    });
  });

  // Ordena os pontos por meridiano e depois pelo número do ponto
  curatedList.sort((left, right) => {
    const leftIdx = MERIDIAN_ORDER.indexOf(left.meridian.code);
    const rightIdx = MERIDIAN_ORDER.indexOf(right.meridian.code);

    if (leftIdx !== rightIdx) {
      return leftIdx - rightIdx;
    }

    // Se no mesmo meridiano, extrai o número (ex: ST36 -> 36) e ordena numericamente
    const leftNum = parseInt(left.code.replace(/[^0-9]/g, ''), 10);
    const rightNum = parseInt(right.code.replace(/[^0-9]/g, ''), 10);

    return leftNum - rightNum;
  });

  console.log(`Gerados ${curatedList.length} pontos oficiais de meridianos clássicos.`);

  // Cria a string do código-fonte final do arquivo
  const fileContent = `// Generated automatically by scripts/build-curated-body-points.mjs
// Contains the 329 classic Chinese standard body acupoints imported and audited from KM-Agent
//
// Keep this file separate to avoid bloating knowledgeBase.js

import { APPROVAL_STATUS, KNOWLEDGE_TYPES, TECHNIQUES, createApproval, createSource } from '../schema';
import { getLocationsForPoint } from '../mapLocations';

const kmAgentSource = createSource('km-agent-acupoints', 'KM-Agent data/acupoints.csv', 'imported');

function rawAcupoint(data) {
  return {
    id: \`acupoint:\${data.code}\`,
    type: KNOWLEDGE_TYPES.ACUPOINT,
    displayCode: data.code,
    category: 'ponto_sistemico',
    approval: createApproval(APPROVAL_STATUS.APPROVED),
    sources: [kmAgentSource],
    locations: getLocationsForPoint(data.code),
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
    ...data
  };
}

export const curatedAcupoints = [
${curatedList.map(p => `  rawAcupoint(${JSON.stringify(p, null, 4).replace(/\n/g, '\n  ')})`).join(',\n')}
];
`;

  fs.writeFileSync(OUTPUT_FILE_PATH, fileContent, 'utf-8');
  console.log(`Arquivo gravado com sucesso em: ${OUTPUT_FILE_PATH}`);
}

build();
