import { APPROVAL_STATUS, KNOWLEDGE_TYPES, TECHNIQUES, createApproval, createSource } from './schema';
import { displayPointCode, normalizePointCode } from './aliases';
import { getLocationsForPoint } from './mapLocations';

const baseSource = createSource('base-clinica-mtc', 'Base clínica MTC + materiais integrativos');
const atlasSource = createSource('atlas-local', 'Atlas clínico local + revisão profissional');
const kmAgentSource = createSource('km-agent-acupoints', 'KM-Agent data/acupoints.csv', 'imported');

function acupoint(data) {
  const code = normalizePointCode(data.code);
  return {
    id: `acupoint:${code}`,
    type: KNOWLEDGE_TYPES.ACUPOINT,
    displayCode: data.displayCode || displayPointCode(code),
    category: 'ponto_sistemico',
    approval: createApproval(data.approvalStatus || APPROVAL_STATUS.REVIEW),
    sources: data.sources || [atlasSource],
    locations: getLocationsForPoint(code),
    ...data,
    code,
  };
}

function auricularPoint(data) {
  return {
    id: `auricular:${data.slug}`,
    type: KNOWLEDGE_TYPES.AURICULAR_POINT,
    code: `auricular:${data.slug}`,
    category: 'ponto_auricular',
    approval: createApproval(data.approvalStatus || APPROVAL_STATUS.REVIEW),
    sources: data.sources || [baseSource],
    locations: getLocationsForPoint(data.name),
    ...data,
  };
}

export const acupoints = [
  acupoint({
    code: 'ST36',
    names: { pt: 'Zusanli', en: 'Zusanli' },
    meridian: { code: 'ST', pt: 'Estômago', en: 'Stomach' },
    locationText: 'Região anterolateral da perna, abaixo do joelho, conforme atlas adotado e calibração visual local.',
    actions: ['tonificar Qi', 'fortalecer Baço e Estômago', 'regular digestão', 'apoiar vitalidade'],
    indications: ['fadiga', 'digestão lenta', 'baixa resistência', 'deficiência de Qi do Baço'],
    cautions: [],
    relatedPatterns: ['Deficiência de Qi do Baço', 'Qi do Fígado invadindo Baço/Estômago'],
    relatedSymptoms: ['fadiga', 'náusea', 'distensão abdominal', 'edema'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.MOXA, TECHNIQUES.ELECTRO],
    sources: [atlasSource, kmAgentSource],
  }),
  acupoint({
    code: 'SP6',
    names: { pt: 'Sanyinjiao', en: 'Sanyinjiao' },
    meridian: { code: 'SP', pt: 'Baço', en: 'Spleen' },
    locationText: 'Região medial da perna, encontro funcional dos três meridianos Yin do membro inferior.',
    actions: ['harmonizar Baço, Fígado e Rim', 'regular Xue', 'regular líquidos', 'apoiar sono'],
    indications: ['ansiedade', 'insônia', 'queixas ginecológicas', 'umidade', 'fadiga'],
    cautions: ['cautela/evitar em gestação sem indicação profissional formal'],
    relatedPatterns: ['Deficiência de Qi do Baço', 'Agitação do Shen por Calor', 'Umidade-Calor'],
    relatedSymptoms: ['insônia', 'ansiedade', 'edema', 'cólicas', 'TPM'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
    sources: [atlasSource, kmAgentSource],
  }),
  acupoint({
    code: 'LR3',
    names: { pt: 'Taichong', en: 'Taichong' },
    meridian: { code: 'LR', pt: 'Fígado', en: 'Liver' },
    actions: ['mover Qi do Fígado', 'reduzir estagnação', 'regular tensão emocional'],
    indications: ['irritabilidade', 'cefaleia', 'tensão', 'dor migratória', 'TPM'],
    cautions: [],
    relatedPatterns: ['Ascensão do Yang do Fígado', 'Qi do Fígado invadindo Baço/Estômago'],
    relatedSymptoms: ['raiva', 'frustração', 'cefaleia', 'tensão'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'CV12',
    names: { pt: 'Zhongwan', en: 'Zhongwan' },
    meridian: { code: 'CV', pt: 'Vaso Concepção', en: 'Conception Vessel' },
    actions: ['harmonizar Estômago', 'regular Aquecedor Médio', 'reduzir náusea e distensão'],
    indications: ['refluxo', 'azia', 'náusea', 'distensão abdominal', 'digestão lenta'],
    cautions: ['avaliar gestação e sensibilidade abdominal antes de técnica invasiva'],
    relatedPatterns: ['Deficiência de Qi do Baço', 'Qi do Fígado invadindo Baço/Estômago', 'Umidade-Calor'],
    relatedSymptoms: ['náusea', 'refluxo', 'distensão abdominal'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.MOXA],
  }),
  acupoint({
    code: 'PC6',
    names: { pt: 'Neiguan', en: 'Neiguan' },
    meridian: { code: 'PC', pt: 'Pericárdio', en: 'Pericardium' },
    actions: ['regular Shen', 'harmonizar tórax', 'regular Estômago', 'modular náusea'],
    indications: ['ansiedade', 'palpitação', 'náusea', 'opressão torácica', 'refluxo'],
    cautions: [],
    relatedPatterns: ['Agitação do Shen por Calor', 'Qi do Fígado invadindo Baço/Estômago'],
    relatedSymptoms: ['ansiedade', 'palpitação', 'náusea'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.ELECTRO],
  }),
  acupoint({
    code: 'HT7',
    names: { pt: 'Shenmen', en: 'Shenmen' },
    meridian: { code: 'HT', pt: 'Coração', en: 'Heart' },
    actions: ['acalmar Shen', 'regular sono', 'reduzir palpitação e ansiedade'],
    indications: ['insônia', 'ansiedade', 'palpitação', 'agitação mental'],
    cautions: [],
    relatedPatterns: ['Agitação do Shen por Calor'],
    relatedSymptoms: ['insônia', 'ansiedade', 'palpitação'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'EX-HN3',
    displayCode: 'Yintang',
    names: { pt: 'Yintang', en: 'Yintang' },
    meridian: { code: 'EX', pt: 'Extraordinário', en: 'Extra point' },
    actions: ['acalmar mente', 'reduzir tensão frontal', 'apoiar sono'],
    indications: ['ansiedade', 'insônia', 'cefaleia frontal', 'agitação'],
    cautions: ['usar técnica suave e compatível com a sensibilidade local'],
    relatedPatterns: ['Agitação do Shen por Calor'],
    relatedSymptoms: ['ansiedade', 'insônia'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'GV20',
    names: { pt: 'Baihui', en: 'Baihui' },
    meridian: { code: 'GV', pt: 'Vaso Governador', en: 'Governor Vessel' },
    actions: ['regular Yang', 'clarear mente', 'organizar eixo superior'],
    indications: ['tontura', 'cefaleia', 'agitação', 'cansaço mental'],
    cautions: ['avaliar objetivo de tonificação, sedação ou ancoragem antes de estimular'],
    relatedPatterns: ['Agitação do Shen por Calor', 'Ascensão do Yang do Fígado'],
    relatedSymptoms: ['tontura', 'cefaleia', 'agitação'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'GB20',
    names: { pt: 'Fengchi', en: 'Fengchi' },
    meridian: { code: 'GB', pt: 'Vesícula Biliar', en: 'Gallbladder' },
    actions: ['liberar região cervical', 'regular vento', 'reduzir cefaleia e tensão'],
    indications: ['cefaleia', 'tontura', 'dor cervical', 'tensão occipital'],
    cautions: ['evitar agulhamento profundo sem domínio anatômico da região'],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
    relatedSymptoms: ['cefaleia', 'tontura', 'dor cervical'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'GB34',
    names: { pt: 'Yanglingquan', en: 'Yanglingquan' },
    meridian: { code: 'GB', pt: 'Vesícula Biliar', en: 'Gallbladder' },
    actions: ['beneficiar tendões', 'regular Vesícula Biliar', 'mover Qi'],
    indications: ['rigidez', 'tensão muscular', 'dor lateral', 'estagnação de Qi'],
    cautions: [],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
    relatedSymptoms: ['tensão', 'rigidez', 'dor migratória'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'KI3',
    names: { pt: 'Taixi', en: 'Taixi' },
    meridian: { code: 'KI', pt: 'Rim', en: 'Kidney' },
    actions: ['tonificar Rim', 'ancorar Yang', 'nutrir base Yin/Yang'],
    indications: ['lombalgia', 'fadiga profunda', 'medo', 'zumbido', 'calor vazio'],
    cautions: [],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
    relatedSymptoms: ['lombalgia', 'zumbido', 'medo'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'LI4',
    names: { pt: 'Hegu', en: 'Hegu' },
    meridian: { code: 'LI', pt: 'Intestino Grosso', en: 'Large Intestine' },
    actions: ['mover Qi', 'analgesia', 'regular face e cabeça'],
    indications: ['cefaleia', 'dor', 'tensão', 'estagnação'],
    cautions: ['cautela/evitar em gestação sem indicação profissional formal'],
    relatedPatterns: ['Ascensão do Yang do Fígado', 'Qi do Fígado invadindo Baço/Estômago'],
    relatedSymptoms: ['cefaleia', 'dor', 'tensão'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'TE5',
    names: { pt: 'Waiguan', en: 'Waiguan' },
    meridian: { code: 'TE', pt: 'Triplo Aquecedor', en: 'Triple Energizer' },
    actions: ['liberar Shaoyang', 'regular lateralidade', 'reduzir tensão'],
    indications: ['cefaleia lateral', 'tensão', 'sintomas externos', 'dor cervical'],
    cautions: [],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
    relatedSymptoms: ['cefaleia', 'tensão'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'SP9',
    names: { pt: 'Yinlingquan', en: 'Yinlingquan' },
    meridian: { code: 'SP', pt: 'Baço', en: 'Spleen' },
    actions: ['drenar umidade', 'regular metabolismo de líquidos'],
    indications: ['edema', 'peso corporal', 'umidade', 'saburra gordurosa'],
    cautions: [],
    relatedPatterns: ['Umidade-Calor'],
    relatedSymptoms: ['edema', 'peso', 'umidade'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.ELECTRO],
  }),
  acupoint({
    code: 'ST40',
    names: { pt: 'Fenglong', en: 'Fenglong' },
    meridian: { code: 'ST', pt: 'Estômago', en: 'Stomach' },
    actions: ['transformar Fleuma', 'regular umidade', 'modular peso/metabolismo'],
    indications: ['fleuma', 'saburra espessa', 'peso corporal', 'muco'],
    cautions: [],
    relatedPatterns: ['Umidade-Calor'],
    relatedSymptoms: ['muco', 'peso', 'saburra espessa'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.ELECTRO],
  }),
  acupoint({
    code: 'LI11',
    names: { pt: 'Quchi', en: 'Quchi' },
    meridian: { code: 'LI', pt: 'Intestino Grosso', en: 'Large Intestine' },
    actions: ['limpar calor', 'apoiar padrões inflamatórios', 'regular pele'],
    indications: ['calor', 'vermelhidão', 'saburra amarela', 'problemas de pele'],
    cautions: [],
    relatedPatterns: ['Umidade-Calor'],
    relatedSymptoms: ['calor', 'pele', 'saburra amarela'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
  acupoint({
    code: 'CV6',
    names: { pt: 'Qihai', en: 'Qihai' },
    meridian: { code: 'CV', pt: 'Vaso Concepção', en: 'Conception Vessel' },
    actions: ['tonificar Qi original', 'fortalecer energia basal'],
    indications: ['fadiga', 'fraqueza', 'deficiência de Qi'],
    cautions: ['avaliar gestação e região abdominal antes de técnica invasiva'],
    relatedPatterns: ['Deficiência de Qi do Baço'],
    relatedSymptoms: ['fadiga', 'fraqueza'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.MOXA],
  }),
  acupoint({
    code: 'SP3',
    names: { pt: 'Taibai', en: 'Taibai' },
    meridian: { code: 'SP', pt: 'Baço', en: 'Spleen' },
    actions: ['tonificar Baço', 'regular umidade'],
    indications: ['digestão lenta', 'fezes amolecidas', 'fadiga', 'umidade'],
    cautions: [],
    relatedPatterns: ['Deficiência de Qi do Baço'],
    relatedSymptoms: ['digestão lenta', 'fezes amolecidas', 'fadiga'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
];

export const auricularPoints = [
  auricularPoint({
    slug: 'shen-men',
    name: 'Shen Men',
    actions: ['modulação central', 'reduzir ansiedade', 'analgesia', 'regular sono'],
    indications: ['ansiedade', 'dor', 'insônia', 'hiperreatividade'],
    relatedPatterns: ['Agitação do Shen por Calor', 'Deficiência de Qi do Baço', 'Ascensão do Yang do Fígado'],
  }),
  auricularPoint({
    slug: 'subcortex',
    name: 'Subcórtex',
    actions: ['regulação neurovegetativa', 'modulação de dor e sono'],
    indications: ['dor crônica', 'ansiedade', 'insônia'],
    relatedPatterns: ['Agitação do Shen por Calor'],
  }),
  auricularPoint({
    slug: 'figado',
    name: 'Fígado',
    actions: ['apoiar livre fluxo do Qi', 'regular tensão emocional'],
    indications: ['irritabilidade', 'estagnação', 'tensão'],
    relatedPatterns: ['Ascensão do Yang do Fígado', 'Qi do Fígado invadindo Baço/Estômago'],
  }),
  auricularPoint({
    slug: 'baco',
    name: 'Baço',
    actions: ['regular Terra', 'apoiar digestão e umidade'],
    indications: ['fadiga', 'digestão lenta', 'umidade'],
    relatedPatterns: ['Deficiência de Qi do Baço'],
  }),
  auricularPoint({
    slug: 'estomago',
    name: 'Estômago',
    actions: ['regular digestão', 'apetite e epigástrio'],
    indications: ['refluxo', 'náusea', 'fome alterada'],
    relatedPatterns: ['Qi do Fígado invadindo Baço/Estômago'],
  }),
  auricularPoint({
    slug: 'rim',
    name: 'Rim',
    actions: ['apoiar base energética', 'regular medo, lombar e essência'],
    indications: ['lombalgia', 'medo', 'cansaço profundo'],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
  }),
  auricularPoint({
    slug: 'endocrino',
    name: 'Endócrino',
    actions: ['regulação hormonal e metabólica'],
    indications: ['padrões hormonais', 'metabolismo', 'umidade'],
    relatedPatterns: ['Umidade-Calor', 'Deficiência de Qi do Baço'],
  }),
  auricularPoint({
    slug: 'ansiedade',
    name: 'Ansiedade',
    actions: ['apoio sintomático para ansiedade e agitação'],
    indications: ['ansiedade', 'agitação'],
    relatedPatterns: ['Agitação do Shen por Calor'],
  }),
  auricularPoint({
    slug: 'coracao',
    name: 'Coração',
    actions: ['regular Shen', 'ansiedade, palpitação e sono'],
    indications: ['palpitação', 'insônia', 'ansiedade'],
    relatedPatterns: ['Agitação do Shen por Calor'],
  }),
  auricularPoint({
    slug: 'sono',
    name: 'Sono',
    actions: ['regular sono e relaxamento'],
    indications: ['insônia', 'sono leve'],
    relatedPatterns: ['Agitação do Shen por Calor'],
  }),
  auricularPoint({
    slug: 'fome',
    name: 'Fome',
    actions: ['regular apetite e compulsão'],
    indications: ['compulsão alimentar', 'fome aumentada', 'desejo por doce'],
    relatedPatterns: ['Umidade-Calor', 'Deficiência de Qi do Baço'],
  }),
];

export const patternDefinitions = {
  'Ascensão do Yang do Fígado': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Ascensão do Yang do Fígado',
    tags: ['fígado', 'yang', 'cefaleia', 'tontura', 'irritabilidade'],
    protocol: {
      body: ['LR3', 'GB20', 'GB34', 'TE5', 'LI4', 'KI3'],
      ear: ['Shen Men', 'Fígado', 'Subcórtex', 'Ansiedade', 'Rim'],
      moxa: ['Evitar se houver calor exuberante', 'Considerar apenas em deficiência associada'],
      laser: ['LR3', 'GB20', 'KI3'],
      eletro: ['GB20 + LR3 em baixa intensidade, conforme tolerância'],
      goal: 'Ancorar Yang, mover Qi do Fígado, reduzir cefaleia/tontura e estabilizar irritabilidade.',
    },
    detail: {
      root: 'Estagnação do Qi do Fígado, deficiência de Yin/Sangue ou falha da Água em nutrir a Madeira.',
      manifestation: 'Cefaleia, tontura, zumbido, irritabilidade, tensão, rubor ou sensação de subida.',
      eight: 'Interno, tendência a Calor/Excesso na manifestação, com possível Deficiência na raiz.',
      elements: 'Madeira em hiperatividade podendo repercutir no Fogo e invadir a Terra quando há sintomas digestivos associados.',
      question: 'Investigar tontura, zumbido, rubor, qualidade da cefaleia, sono e sinais de deficiência de Yin.',
    },
  },
  'Qi do Fígado invadindo Baço/Estômago': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Qi do Fígado invadindo Baço/Estômago',
    tags: ['fígado', 'baço', 'estômago', 'digestão', 'estresse'],
    protocol: {
      body: ['LR3', 'PC6', 'CV12', 'ST36', 'SP6', 'LI4'],
      ear: ['Shen Men', 'Fígado', 'Estômago', 'Baço', 'Subcórtex'],
      moxa: ['CV12', 'ST36 se houver frio/deficiência'],
      laser: ['LR3', 'PC6', 'CV12'],
      eletro: ['PC6 + ST36 para regulação autonômica e digestiva'],
      goal: 'Regular Madeira sobre Terra, harmonizar digestão e reduzir repercussão emocional no trato gastrointestinal.',
    },
    detail: {
      root: 'Estagnação emocional do Qi do Fígado afetando a função de transformação e descida da Terra.',
      manifestation: 'Refluxo, azia, náusea, distensão abdominal, alteração intestinal, compulsão ou piora digestiva por estresse.',
      eight: 'Interno, geralmente Excesso por estagnação, podendo coexistir com Deficiência de Baço.',
      elements: 'Madeira em excesso exercendo controle patológico sobre a Terra.',
      question: 'Investigar relação direta entre estresse, alimentação, distensão, refluxo e hábito intestinal.',
    },
  },
  'Umidade-Calor': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Umidade-Calor',
    tags: ['umidade', 'calor', 'saburra amarela', 'edema', 'secreção'],
    protocol: {
      body: ['SP9', 'ST40', 'LI11', 'SP6', 'CV12'],
      ear: ['Baço', 'Estômago', 'Endócrino', 'Shen Men', 'Fome'],
      moxa: ['Contraindicada enquanto houver calor/umidade-calor evidente'],
      laser: ['SP9', 'ST40', 'LI11'],
      eletro: ['ST40 + SP9 em baixa/moderada intensidade quando houver retenção importante'],
      goal: 'Drenar umidade, limpar calor e regular metabolismo/digestão.',
    },
    detail: {
      root: 'Dificuldade de transformação dos líquidos, dieta inadequada, calor interno ou retenção prolongada de umidade.',
      manifestation: 'Saburra amarela/espessa/gordurosa, sensação de peso, edema, secreções, odor forte, acne ou fezes pastosas.',
      eight: 'Interno, Calor, Excesso, com componente Yin patogênico por Umidade.',
      elements: 'Terra sobrecarregada produzindo Umidade, com Calor associado que pode afetar Fígado, Estômago e Intestinos.',
      question: 'Investigar alimentação gordurosa/condimentada, álcool, muco, odor, calor corporal e padrão das fezes.',
    },
  },
  'Deficiência de Qi do Baço': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Deficiência de Qi do Baço',
    tags: ['baço', 'terra', 'fadiga', 'umidade', 'digestão'],
    protocol: {
      body: ['ST36', 'SP6', 'SP3', 'CV12', 'CV6'],
      ear: ['Baço', 'Estômago', 'Shen Men', 'Endócrino'],
      moxa: ['ST36', 'CV6', 'CV12'],
      laser: ['ST36', 'SP6', 'CV12'],
      eletro: ['ST36 + SP6 em baixa frequência quando houver fadiga importante'],
      goal: 'Tonificar Qi do Baço, melhorar transformação/transporte, energia e umidade.',
    },
    detail: {
      root: 'Fraqueza da transformação e transporte, dieta irregular, preocupação excessiva, excesso de trabalho mental ou cronicidade.',
      manifestation: 'Fadiga, digestão lenta, distensão, fezes amolecidas, edema, língua pálida/inchada e marcas dentárias.',
      eight: 'Interno, Deficiência, tendência a Frio/Umidade quando há Yang baixo.',
      elements: 'Terra enfraquecida, podendo falhar em nutrir Metal e permitir acúmulo de Umidade/Fleuma.',
      question: 'Investigar apetite, energia após alimentação, fezes, edema, compulsão por doce e ruminação mental.',
    },
  },
  'Agitação do Shen por Calor': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Agitação do Shen por Calor',
    tags: ['shen', 'coração', 'ansiedade', 'insônia', 'palpitação'],
    protocol: {
      body: ['HT7', 'PC6', 'EX-HN3', 'GV20', 'SP6'],
      ear: ['Shen Men', 'Coração', 'Subcórtex', 'Sono', 'Ansiedade'],
      moxa: ['Evitar se houver calor, agitação intensa ou insônia por calor'],
      laser: ['HT7', 'PC6', 'EX-HN3'],
      eletro: ['Evitar estímulo excessivo; priorizar baixa intensidade e sedação suave'],
      goal: 'Acalmar Shen, regular sono e reduzir hiperexcitação.',
    },
    detail: {
      root: 'Calor interno perturbando o Coração/Shen, podendo surgir de estagnação do Fígado, deficiência de Yin ou excesso de estimulantes.',
      manifestation: 'Ansiedade, insônia, palpitação, muitos sonhos, agitação mental, ponta da língua vermelha e pulso rápido.',
      eight: 'Interno, Calor, Excesso na manifestação; avaliar se há Deficiência de Yin na raiz.',
      elements: 'Fogo hiperativo, podendo decorrer de Madeira aquecendo Fogo ou Água insuficiente para controlar Fogo.',
      question: 'Investigar horário da insônia, sonhos, palpitações, sudorese, estimulantes e sinais de calor vazio.',
    },
  },
};

export const techniqueKnowledge = [
  {
    id: 'technique:laser',
    type: KNOWLEDGE_TYPES.TECHNIQUE,
    name: 'Laser / Fotobiomodulação',
    tags: ['laser', 'fotobiomodulação', 'dose', 'joules', 'nm', 'potência'],
    summary: 'Registrar comprimento de onda, potência, energia, tempo por ponto, modo pontual/varredura e resposta clínica.',
    cautions: ['conferir parâmetros do equipamento e janela terapêutica antes da aplicação'],
    sources: [createSource('apostila-laser', 'Apostila Laser')],
  },
  {
    id: 'technique:moxa',
    type: KNOWLEDGE_TYPES.TECHNIQUE,
    name: 'Moxaterapia',
    tags: ['moxa', 'calor', 'yang', 'frio', 'tonificação'],
    summary: 'Técnica de calor voltada à tonificação, desbloqueio e regulação do Qi em padrões compatíveis com frio/deficiência.',
    cautions: ['evitar em calor exuberante, febre, inflamação aguda ou pele sem integridade'],
    sources: [createSource('ebook-moxaterapia', 'Ebook Moxaterapia')],
  },
  {
    id: 'technique:ventosa',
    type: KNOWLEDGE_TYPES.TECHNIQUE,
    name: 'Ventosaterapia',
    tags: ['ventosa', 'estagnação', 'dor', 'miofascial'],
    summary: 'Pode ser fixa, deslizante ou dinâmica em dor, tensão miofascial, estagnação e circulação local.',
    cautions: ['cautela em anticoagulantes, fragilidade vascular, feridas locais e pele sensível'],
    sources: [createSource('livro-ventosaterapia', 'Livro de ventosaterapia sistêmica')],
  },
  {
    id: 'technique:auriculoterapia',
    type: KNOWLEDGE_TYPES.TECHNIQUE,
    name: 'Auriculoterapia',
    tags: ['aurículo', 'orelha', 'microssistema', 'shen men'],
    summary: 'Microssistema auricular para avaliação e tratamento, com pontos, funções, método de estímulo e contraindicações.',
    cautions: ['avaliar integridade da pele, alergias a material adesivo e sensibilidade local'],
    sources: [createSource('curso-auriculo', 'Curso de auriculoacupuntura')],
  },
  {
    id: 'technique:stiper',
    type: KNOWLEDGE_TYPES.TECHNIQUE,
    name: 'Stiper',
    tags: ['stiper', 'silício', 'pontos', 'sem agulha'],
    summary: 'Recurso não invasivo para estímulo de pontos, com tempo de permanência ajustado à tolerância e objetivo.',
    cautions: ['monitorar pele, adesivo, tolerância e resposta clínica'],
    sources: [createSource('stiper-pontos', 'Material StiperPontosPDF')],
  },
];

export const staticKnowledge = [
  {
    id: 'map:feet-dorsal',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Pés - dorso',
    tags: ['pé', 'pés', 'dorso do pé', 'microssistema', 'mapa', 'LR3', 'SP3', 'KI3'],
    summary: 'Mapa visual dos pés para calibrar pontos do dorso e tornozelo, com coordenadas percentuais revisáveis.',
    sources: [createSource('asset-feet-dorsal', 'Imagem WebP local dos pés')],
  },
  {
    id: 'map:hands-palmar',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Mãos e punhos - palma',
    tags: ['mão', 'punho', 'palma', 'microssistema', 'mapa', 'LI4', 'PC6', 'HT7'],
    summary: 'Mapa visual de mãos e punhos para calibrar pontos de punho, palma e mão.',
    sources: [createSource('asset-hands-palmar', 'Imagem WebP local de mãos e punhos')],
  },
  {
    id: 'map:body-front-back',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Corpo frente e costas',
    tags: ['corpo', 'frente', 'costas', 'mapa', 'coluna', 'membros'],
    summary: 'Mapas corporais principais para renderizar pontos sistêmicos em vistas anterior e posterior.',
    sources: [createSource('asset-body-maps', 'Imagens WebP locais de corpo')],
  },
  {
    id: 'map:ear-lateral',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Orelha - lateral',
    tags: ['orelha', 'aurículo', 'auriculoterapia', 'mapa', 'Shen Men'],
    summary: 'Mapa auricular lateral para calibrar pontos de auriculoterapia.',
    sources: [createSource('asset-ear-lateral', 'Imagem WebP local de orelha')],
  },
  {
    id: 'safety:sinais-cautela',
    type: KNOWLEDGE_TYPES.SAFETY_RULE,
    name: 'Sinais de cautela',
    tags: ['contraindicação', 'gestação', 'febre', 'pele', 'anticoagulante'],
    summary: 'Gestação, febre, infecção, anticoagulantes, alteração de sensibilidade, queimaduras, lesões cutâneas e sintomas agudos importantes devem gerar alerta e adaptação técnica.',
    sources: [createSource('sintese-seguranca-clinica', 'Síntese de segurança clínica')],
  },
  {
    id: 'report:modelo-referencia',
    type: KNOWLEDGE_TYPES.REPORT_TEMPLATE,
    name: 'Estrutura de referência para relatório',
    tags: ['relatório', 'evolução', 'hipótese', 'protocolo', 'reavaliação'],
    summary: 'O relatório deve reunir identificação, queixa, achados, hipótese energética, raciocínio clínico, princípio terapêutico, protocolo, evolução e plano de reavaliação.',
    sources: [createSource('modelo-reability', 'Modelo Reability')],
  },
];

export const knowledgeEntities = [
  ...Object.values(patternDefinitions),
  ...acupoints,
  ...auricularPoints,
  ...techniqueKnowledge,
  ...staticKnowledge,
];

export function getPointByCode(codeOrAlias) {
  const normalized = normalizePointCode(codeOrAlias);
  return acupoints.find(point => point.code === normalized) || null;
}

export function getAuricularPoint(name) {
  const key = String(name || '').trim().toLowerCase();
  return auricularPoints.find(point => point.name.toLowerCase() === key || point.code.toLowerCase() === key) || null;
}

export function getPatternDefinition(name) {
  return patternDefinitions[name] || null;
}

export function getPointLabel(codeOrAlias) {
  const point = getPointByCode(codeOrAlias);
  if (!point) return displayPointCode(codeOrAlias);
  return `${point.displayCode} — ${point.names?.pt || point.names?.en || point.displayCode}`;
}

export function getKnowledgeSourceLabels(entity) {
  return (entity?.sources || []).map(source => source.label || source.citation || source.id).filter(Boolean);
}
