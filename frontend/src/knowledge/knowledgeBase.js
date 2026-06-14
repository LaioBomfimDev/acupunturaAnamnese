import { APPROVAL_STATUS, KNOWLEDGE_TYPES, TECHNIQUES, createApproval, createSource } from './schema';
import { displayPointCode, normalizePointCode } from './aliases';
import { getLocationsForPoint } from './mapLocations';
import { officialAuricularPdfPoints, auricularPdfSource } from './generated/auricular-pdf-points';
import { curatedAcupoints } from './generated/curated-body-points';
import { getCommonlyUsedAuricularMeta, getCommonlyUsedBodyPointMeta } from './commonlyUsedPoints';

const baseSource = createSource('base-clinica-mtc', 'Base clínica MTC + materiais integrativos');
const atlasSource = createSource('atlas-local', 'Atlas clínico local + revisão profissional');
const kmAgentSource = createSource('km-agent-acupoints', 'KM-Agent data/acupoints.csv', 'imported');

const baseAuricularSlugs = new Set([
  'shen-men',
  'subcortex',
  'figado',
  'baco',
  'estomago',
  'rim',
  'endocrino',
  'ansiedade',
  'coracao',
  'sono',
  'fome',
]);

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

const manualAcupoints = [
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
    code: 'EX-HN5',
    displayCode: 'EX-HN5',
    names: { pt: 'Taiyang', en: 'Taiyang' },
    meridian: { code: 'EX', pt: 'Extraordinário', en: 'Extra point' },
    locationText: 'Região temporal, na depressão cerca de 1 cun posterior ao ponto médio entre a extremidade lateral da sobrancelha e o canto externo do olho.',
    actions: ['reduzir cefaleia temporal', 'aliviar tensão ocular', 'clarear a visão'],
    indications: ['enxaqueca', 'cefaleia temporal', 'tensão ocular', 'olhos cansados'],
    cautions: ['técnica suave; evitar estímulo profundo na região temporal'],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
    relatedSymptoms: ['enxaqueca', 'cefaleia', 'tensão ocular'],
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

  // --- Novos pontos — Fase 1 ---

  acupoint({
    code: 'LU7',
    names: { pt: 'Lieque', en: 'Lieque' },
    meridian: { code: 'LU', pt: 'Pulmão', en: 'Lung' },
    locationText: 'Região radial do antebraço, 1,5 cun acima da prega do punho, na abertura entre os tendões do braquiorradial e abdutor longo do polegar.',
    actions: ['abre o Pulmão', 'descende o Qi do Pulmão', 'expele Vento externo', 'abre o Vaso Concepção', 'alivia tosse e dispneia'],
    indications: ['tosse', 'rinite', 'cefaleia', 'dor cervical', 'dispneia', 'garganta irritada', 'obstrução nasal'],
    cautions: ['nenhuma contraindicação absoluta; cautela em Yin deficiente com calor vazio'],
    relatedPatterns: ['Deficiência de Qi do Pulmão'],
    relatedSymptoms: ['tosse', 'rinite', 'cefaleia', 'dor cervical', 'dispneia', 'falta de ar', 'garganta', 'obstrução nasal'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'LU9',
    names: { pt: 'Taiyuan', en: 'Taiyuan' },
    meridian: { code: 'LU', pt: 'Pulmão', en: 'Lung' },
    locationText: 'Na face palmar do pulso, no sulco radial do pulso, na depressão entre o tendão do músculo abdutor longo do polegar e o rádio.',
    actions: ['tonifica o Qi e Yin do Pulmão', 'resolve fleuma', 'beneficia os vasos sanguíneos', 'fortalece o Wei Qi'],
    indications: ['tosse crônica', 'dispneia', 'hemoptise', 'dor no peito', 'pulso fraco', 'pele ressecada'],
    cautions: ['localizar a artéria radial e não atingi-la; cautela em anticoagulantes'],
    relatedPatterns: ['Deficiência de Qi do Pulmão'],
    relatedSymptoms: ['tosse crônica', 'dispneia', 'pele ressecada', 'pulso fraco', 'falta de ar'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'BL13',
    names: { pt: 'Feishu', en: 'Feishu' },
    meridian: { code: 'BL', pt: 'Bexiga', en: 'Bladder' },
    locationText: '1,5 cun lateral à linha mediana posterior, ao nível do processo espinhoso de T3.',
    actions: ['tonifica o Pulmão', 'descende o Qi rebelde', 'expele vento e frio do Pulmão', 'beneficia a pele'],
    indications: ['tosse', 'asma', 'bronquite', 'suores noturnos', 'urticária', 'pele com coceira'],
    cautions: ['agulhar obliquamente em direção à coluna; profundidade segura de 0,5 a 1 cun'],
    relatedPatterns: ['Deficiência de Qi do Pulmão'],
    relatedSymptoms: ['tosse', 'asma', 'pele', 'suores noturnos', 'bronquite'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'BL20',
    names: { pt: 'Pishu', en: 'Pishu' },
    meridian: { code: 'BL', pt: 'Bexiga', en: 'Bladder' },
    locationText: '1,5 cun lateral à linha mediana posterior, ao nível do processo espinhoso de T11.',
    actions: ['fortalece o Baço e o Estômago', 'resolve umidade', 'tonifica o Qi do meio', 'regula o Xue'],
    indications: ['digestão lenta', 'fadiga', 'distensão abdominal', 'diarreia', 'vômito', 'anemia', 'edema'],
    cautions: ['agulhar obliquamente; profundidade segura de 0,5 a 1 cun'],
    relatedPatterns: ['Deficiência de Qi do Baço'],
    relatedSymptoms: ['fadiga', 'digestão', 'distensão', 'diarreia', 'edema', 'anemia'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'BL23',
    names: { pt: 'Shenshu', en: 'Shenshu' },
    meridian: { code: 'BL', pt: 'Bexiga', en: 'Bladder' },
    locationText: '1,5 cun lateral à linha mediana posterior, ao nível do processo espinhoso de L2.',
    actions: ['tonifica o Rim', 'fortalece o Yang e Yin do Rim', 'beneficia as orelhas e olhos', 'fortalece a lombar'],
    indications: ['lombalgia', 'joelhos fracos', 'zumbido', 'surdez', 'impotência', 'infertilidade', 'poliúria', 'edema'],
    cautions: ['agulhar perpendicular ou levemente oblíquo; 0,8 a 1,2 cun de profundidade'],
    relatedPatterns: ['Deficiência de Yin do Rim', 'Deficiência de Yang do Rim'],
    relatedSymptoms: ['lombalgia', 'zumbido', 'joelhos', 'poliúria', 'fadiga profunda', 'edema'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.ELECTRO],
  }),

  acupoint({
    code: 'KI6',
    names: { pt: 'Zhaohai', en: 'Zhaohai' },
    meridian: { code: 'KI', pt: 'Rim', en: 'Kidney' },
    locationText: '1 cun abaixo da ponta do maléolo medial, na depressão abaixo do maléolo medial.',
    actions: ['nutre o Yin do Rim', 'abre o Vaso Yin', 'acalma a mente', 'umedece a garganta', 'regulariza o útero'],
    indications: ['insônia', 'garganta seca', 'cansaço', 'ondas de calor', 'menopausa', 'ciclo irregular'],
    cautions: ['nenhuma contraindicação absoluta; cautela em Yang deficiente'],
    relatedPatterns: ['Deficiência de Yin do Rim'],
    relatedSymptoms: ['insônia', 'garganta seca', 'ondas de calor', 'menopausa', 'ciclo irregular', 'yin deficiente'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'KI7',
    names: { pt: 'Fuliu', en: 'Fuliu' },
    meridian: { code: 'KI', pt: 'Rim', en: 'Kidney' },
    locationText: '2 cun acima do ponto KI3, na borda anterior do tendão calcâneo.',
    actions: ['tonifica o Yang do Rim', 'regula a sudorese', 'resolve edema', 'fortalece a lombar'],
    indications: ['suores noturnos', 'suores espontâneos', 'edema dos membros', 'poliúria noturna', 'lombalgia por deficiência'],
    cautions: ['nenhuma contraindicação absoluta'],
    relatedPatterns: ['Deficiência de Yang do Rim'],
    relatedSymptoms: ['suores noturnos', 'edema', 'poliúria noturna', 'lombalgia', 'frio nos membros'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'SP10',
    names: { pt: 'Xuehai', en: 'Xuehai' },
    meridian: { code: 'SP', pt: 'Baço', en: 'Spleen' },
    locationText: '2 cun acima da borda superomedial da patela, sobre o músculo vasto medial.',
    actions: ['regulariza o Xue e a menstruação', 'refresca o Sangue', 'resolve umidade-calor na pele'],
    indications: ['menstruação irregular', 'cólicas', 'coágulos', 'eczema', 'urticária', 'pele com coceira', 'estase de Xue'],
    cautions: ['nenhuma contraindicação absoluta; moxa apenas se não houver calor predominante'],
    relatedPatterns: ['Estagnação de Xue', 'Deficiência de Xue do Fígado'],
    relatedSymptoms: ['menstruação', 'cólicas', 'coágulos', 'pele', 'coceira', 'eczema', 'urticária'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.ELECTRO],
  }),

  acupoint({
    code: 'ST25',
    names: { pt: 'Tianshu', en: 'Tianshu' },
    meridian: { code: 'ST', pt: 'Estômago', en: 'Stomach' },
    locationText: '2 cun lateral ao umbigo.',
    actions: ['regula o Intestino Grosso', 'resolve umidade', 'move o Qi e o Xue no abdome'],
    indications: ['constipação', 'diarreia', 'dor abdominal', 'distensão', 'síndrome do intestino irritável'],
    cautions: ['evitar em gestantes (estimula o intestino); profundidade 1 a 1,5 cun'],
    relatedPatterns: ['Deficiência de Qi do Baço', 'Umidade-Calor'],
    relatedSymptoms: ['constipação', 'diarreia', 'dor abdominal', 'distensão', 'intestino', 'flatulência'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.ELECTRO],
  }),

  acupoint({
    code: 'CV4',
    names: { pt: 'Guanyuan', en: 'Guanyuan' },
    meridian: { code: 'CV', pt: 'Vaso Concepção', en: 'Conception Vessel' },
    locationText: '3 cun abaixo do umbigo, na linha mediana anterior.',
    actions: ['tonifica o Yuan Qi', 'aquece o Rim', 'fortalece o Yang', 'nutre o Xue', 'regula o útero'],
    indications: ['fadiga profunda', 'impotência', 'infertilidade', 'menstruação irregular', 'enurese', 'lombalgia por deficiência'],
    cautions: ['CONTRAINDICADO em gestação (ponto forte de movimentação do Qi); moxa apenas se Yang deficiente'],
    relatedPatterns: ['Deficiência de Yang do Rim', 'Deficiência de Yin do Rim'],
    relatedSymptoms: ['fadiga profunda', 'impotência', 'infertilidade', 'frio abdominal', 'yang deficiente'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER, TECHNIQUES.ELECTRO],
  }),

  acupoint({
    code: 'CV17',
    names: { pt: 'Danzhong', en: 'Danzhong' },
    meridian: { code: 'CV', pt: 'Vaso Concepção', en: 'Conception Vessel' },
    locationText: 'Na linha mediana anterior, ao nível do 4º espaço intercostal, entre os mamilos.',
    actions: ['regula o Qi do tórax (Zong Qi)', 'descende o Qi rebelde', 'abre o peito', 'favorece a lactação'],
    indications: ['dispneia', 'tosse', 'dor no peito', 'palpitações', 'tristeza', 'lactação insuficiente'],
    cautions: ['agulhar horizontalmente; não agulhar profundamente (risco de pneumotórax)'],
    relatedPatterns: ['Deficiência de Qi do Pulmão'],
    relatedSymptoms: ['dispneia', 'tosse', 'dor no peito', 'tristeza', 'palpitações', 'lactação', 'falta de ar'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'GV4',
    names: { pt: 'Mingmen', en: 'Mingmen' },
    meridian: { code: 'GV', pt: 'Vaso Governador', en: 'Governor Vessel' },
    locationText: 'Na linha mediana posterior, na depressão abaixo do processo espinhoso de L2.',
    actions: ['tonifica o Yang do Rim', 'aquece o Mingmen', 'fortalece a lombar e os joelhos', 'beneficia o Yang em geral'],
    indications: ['lombalgia por deficiência de Yang', 'frio geral', 'impotência', 'infertilidade por frio', 'diarreia matinal'],
    cautions: ['agulhar perpendicular 0,5 a 1 cun; moxa é a técnica preferencial'],
    relatedPatterns: ['Deficiência de Yang do Rim'],
    relatedSymptoms: ['lombalgia', 'frio', 'impotência', 'yang deficiente', 'diarreia matinal', 'joelhos fracos'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'GV14',
    names: { pt: 'Dazhui', en: 'Dazhui' },
    meridian: { code: 'GV', pt: 'Vaso Governador', en: 'Governor Vessel' },
    locationText: 'Na linha mediana posterior, na depressão abaixo do processo espinhoso de C7.',
    actions: ['expele vento e calor externo', 'libera a superfície', 'tonifica o Wei Qi', 'refresca o sangue'],
    indications: ['febre', 'resfriado', 'tosse', 'rigidez cervical', 'epilepsia', 'sudorese com febre'],
    cautions: ['agulhar perpendicular 0,5 a 1 cun; não agulhar profundamente'],
    relatedPatterns: [],
    relatedSymptoms: ['febre', 'resfriado', 'rigidez cervical', 'infecção', 'imunidade', 'tosse com febre'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'GB21',
    names: { pt: 'Jianjing', en: 'Jianjing' },
    meridian: { code: 'GB', pt: 'Vesícula Biliar', en: 'Gallbladder' },
    locationText: 'No ponto médio entre a base do pescoço e o acrômio, no ponto mais alto do trapézio.',
    actions: ['move o Qi e o Xue', 'relaxa os tendões', 'alivia a tensão cervical-escapular', 'facilita o parto e a lactação'],
    indications: ['tensão ombro-pescoço', 'cefaleia tensional', 'dificuldade no parto', 'lactação insuficiente'],
    cautions: ['CONTRAINDICADO em gestação (forte estimulação descendente); profundidade 0,3 a 0,5 cun'],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
    relatedSymptoms: ['tensão cervical', 'ombro', 'cefaleia', 'dor no pescoço', 'rigidez'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.MOXA, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),

  acupoint({
    code: 'LI20',
    names: { pt: 'Yingxiang', en: 'Yingxiang' },
    meridian: { code: 'LI', pt: 'Intestino Grosso', en: 'Large Intestine' },
    locationText: 'No sulco nasolabial, ao nível do ponto médio da asa nasal.',
    actions: ['abre os orifícios nasais', 'expele vento externo', 'beneficia o nariz e olfato'],
    indications: ['rinite', 'sinusite', 'obstrução nasal', 'anosmia', 'pólipos nasais', 'prurido nasal'],
    cautions: ['agulhar subcutâneo ou oblíquo; profundidade 0,2 a 0,3 cun; não usar moxa'],
    relatedPatterns: [],
    relatedSymptoms: ['rinite', 'sinusite', 'obstrução nasal', 'anosmia', 'prurido nasal', 'nariz'],
    techniques: [TECHNIQUES.NEEDLE, TECHNIQUES.LASER, TECHNIQUES.STIPER],
  }),
];

// Marca a categoria "Pontos comumente usados" sem excluir nada da base:
// usuários comuns veem apenas os pontos marcados; o SuperAdm mantém a biblioteca completa.
function withBodyCommonUsage(point) {
  const meta = getCommonlyUsedBodyPointMeta(point.code);
  if (!meta) return { ...point, commonlyUsed: false };
  return {
    ...point,
    commonlyUsed: true,
    commonUsage: {
      map: meta.map,
      mainUse: meta.mainUse,
      clinicalCategories: meta.clinicalCategories,
    },
  };
}

function withAuricularCommonUsage(point) {
  const meta = getCommonlyUsedAuricularMeta(point.slug) || getCommonlyUsedAuricularMeta(point.name);
  if (!meta) return { ...point, commonlyUsed: false };
  return {
    ...point,
    commonlyUsed: true,
    commonUsage: {
      map: meta.map,
      mainUse: meta.mainUse,
      clinicalCategories: meta.clinicalCategories,
    },
  };
}

export const acupoints = [
  ...manualAcupoints,
  ...curatedAcupoints,
].map(withBodyCommonUsage);

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
  // --- Pontos auriculares da categoria "Pontos comumente usados" sem equivalente no PDF oficial ---
  auricularPoint({
    slug: 'utero',
    name: 'Útero',
    actions: ['regular ciclo menstrual', 'apoiar região pélvica'],
    indications: ['cólica menstrual', 'irregularidade do ciclo', 'dor pélvica'],
    relatedPatterns: ['Estagnação de Xue', 'Deficiência de Xue do Fígado'],
  }),
  auricularPoint({
    slug: 'ovario',
    name: 'Ovário',
    actions: ['apoiar eixo hormonal e fertilidade'],
    indications: ['irregularidade do ciclo', 'fertilidade', 'climatério'],
    relatedPatterns: ['Deficiência de Yin do Rim'],
  }),
  auricularPoint({
    slug: 'depressao',
    name: 'Depressão',
    actions: ['apoio sintomático para humor deprimido e apatia'],
    indications: ['humor deprimido', 'apatia', 'tristeza'],
    relatedPatterns: ['Deficiência de Qi do Pulmão', 'Deficiência de Qi do Baço'],
  }),
  auricularPoint({
    slug: 'insonia',
    name: 'Insônia',
    actions: ['apoiar início e manutenção do sono'],
    indications: ['dificuldade de iniciar o sono', 'despertares noturnos'],
    relatedPatterns: ['Agitação do Shen por Calor', 'Deficiência de Yin do Rim'],
  }),
  auricularPoint({
    slug: 'occipital',
    name: 'Occipital',
    actions: ['modular cefaleia e tensão cervical', 'apoiar sono'],
    indications: ['cefaleia', 'cervicalgia', 'insônia'],
    relatedPatterns: ['Ascensão do Yang do Fígado'],
  }),
  auricularPoint({
    slug: 'fronte',
    name: 'Fronte',
    actions: ['modular cefaleia frontal e ansiedade'],
    indications: ['cefaleia frontal', 'ansiedade', 'sinusite'],
    relatedPatterns: ['Agitação do Shen por Calor'],
  }),
  auricularPoint({
    slug: 'talamo',
    name: 'Tálamo',
    actions: ['modulação central da dor e sensorial'],
    indications: ['dor crônica', 'hipersensibilidade', 'queixas neurológicas'],
    relatedPatterns: ['Estagnação de Xue'],
  }),
  // Apenas pontos do padrão chinês oficial (ISO 17316 / WHATC) são expostos nos protocolos e
  // seleções clínicas padrão. Os pontos complementares ficam preservados em
  // complementaryAuricularPdfPoints (mesmo arquivo) para uso futuro.
  ...officialAuricularPdfPoints
    .filter(point => !baseAuricularSlugs.has(point.slug))
    .map(point => auricularPoint({
      ...point,
      approvalStatus: APPROVAL_STATUS.REVIEW,
      sources: [auricularPdfSource],
    })),
].map(withAuricularCommonUsage);

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

  // --- Novas síndromes — Fase 1 ---

  'Deficiência de Yin do Rim': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Deficiência de Yin do Rim',
    tags: ['rim', 'yin', 'calor vazio', 'suores noturnos', 'menopausa', 'insônia', 'zumbido'],
    protocol: {
      body: ['KI3', 'KI6', 'SP6', 'CV4', 'BL23'],
      ear: ['Rim', 'Shen Men', 'Endócrino', 'Ansiedade', 'Sono'],
      moxa: ['Contraindicada em calor vazio ativo'],
      laser: ['KI3', 'KI6', 'SP6'],
      eletro: ['KI3', 'SP6'],
      goal: 'Nutrir o Yin do Rim, resfriar o calor vazio, ancorar o Yang, acalmar o Shen.',
    },
    detail: {
      root: 'Depleção do Yin renal por envelhecimento, doença crônica, excesso sexual ou calor interno prolongado.',
      manifestation: 'Calor vazio, suores noturnos, agitação noturna, lombalgia, zumbido, boca seca, insônia, ondas de calor.',
      eight: 'Interno, Deficiência, Calor vazio.',
      elements: 'Água (Rim/Bexiga) — depleção do aspecto Yin.',
      question: 'Investigar presença de suores noturnos, sensação de calor nas palmas/solas, menopausa, sexualidade e histórico de doenças crônicas.',
    },
  },

  'Deficiência de Yang do Rim': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Deficiência de Yang do Rim',
    tags: ['rim', 'yang', 'frio', 'edema', 'poliúria', 'lombalgia', 'fadiga profunda'],
    protocol: {
      body: ['CV4', 'GV4', 'BL23', 'KI7', 'ST36'],
      ear: ['Rim', 'Endócrino', 'Baço', 'Shen Men'],
      moxa: ['CV4', 'GV4', 'BL23'],
      laser: ['CV4', 'ST36', 'KI7'],
      eletro: ['ST36', 'CV4'],
      goal: 'Tonificar e aquecer o Yang do Rim, fortalecer o Mingmen, resolver edema e frio.',
    },
    detail: {
      root: 'Esgotamento do Yang renal por exposição ao frio, envelhecimento, doença prolongada ou excesso de atividade física.',
      manifestation: 'Frio geral e nos membros, lombar fria, edema dos membros inferiores, poliúria noturna, fadiga profunda, libido baixa, fezes aquosas.',
      eight: 'Interno, Deficiência, Frio.',
      elements: 'Água (Rim/Bexiga) — depleção do aspecto Yang.',
      question: 'Investigar sensação de frio, poliúria noturna, edema nos membros inferiores, diarreia matinal e libido.',
    },
  },

  'Deficiência de Xue do Fígado': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Deficiência de Xue do Fígado',
    tags: ['fígado', 'xue', 'sangue', 'visão', 'câimbras', 'unhas', 'menstruação escassa'],
    protocol: {
      body: ['LR3', 'SP6', 'SP10', 'BL20', 'CV4', 'HT7'],
      ear: ['Fígado', 'Coração', 'Baço', 'Shen Men', 'Endócrino'],
      moxa: ['SP6', 'BL20'],
      laser: ['LR3', 'SP6', 'SP10'],
      eletro: ['SP6', 'SP10'],
      goal: 'Nutrir e tonificar o Xue do Fígado, fortalecer o Baço como fonte de Xue, calmar o Shen.',
    },
    detail: {
      root: 'Insuficiência de Sangue por dieta inadequada, perda excessiva de sangue, Baço fraco ou deficiência de Yin prolongada.',
      manifestation: 'Visão borrada, olhos secos, câimbras, unhas quebradiças, pele ressecada, ansiedade suave, menstruação escassa ou ausente, tontura ao levantar.',
      eight: 'Interno, Deficiência.',
      elements: 'Madeira (Fígado/Vesícula) — insuficiência de Xue no Fígado.',
      question: 'Investigar qualidade da visão, condição das unhas, volume menstrual, câimbras e histórico alimentar.',
    },
  },

  'Estagnação de Xue': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Estagnação de Xue',
    tags: ['xue', 'estase', 'dor fixa', 'coágulos', 'amenorreia', 'língua roxa'],
    protocol: {
      body: ['SP10', 'BL17', 'LR3', 'PC6', 'SP6', 'LI4'],
      ear: ['Shen Men', 'Fígado', 'Coração', 'Endócrino'],
      moxa: ['SP10', 'BL17 (apenas se houver componente de frio)'],
      laser: ['SP10', 'BL17', 'LR3'],
      eletro: ['SP10', 'BL17'],
      goal: 'Mover e regularizar o Xue, dissolver estase, aliviar dor fixa, regularizar ciclo menstrual.',
    },
    detail: {
      root: 'Estagnação prolongada de Qi evoluindo para Xue, traumatismo, exposição ao frio ou deficiência de Yang.',
      manifestation: 'Dor fixa e intensa (piora à noite), possível massa palpável, lábios/língua arroxeados, petecias, coágulos menstruais, amenorreia dolorosa.',
      eight: 'Interno, Excesso (ou Deficiência com estase).',
      elements: 'Múltiplos elementos — predomínio de estase afetando circulação de Xue.',
      question: 'Investigar localização e caráter da dor, presença de coágulos menstruais, cor de lábios e língua, histórico de trauma.',
    },
  },

  'Deficiência de Qi do Pulmão': {
    type: KNOWLEDGE_TYPES.PATTERN,
    name: 'Deficiência de Qi do Pulmão',
    tags: ['pulmão', 'qi', 'tosse fraca', 'voz baixa', 'resfriados', 'wei qi', 'dispneia'],
    protocol: {
      body: ['LU7', 'LU9', 'BL13', 'CV17', 'ST36', 'SP6'],
      ear: ['Pulmão', 'Baço', 'Shen Men', 'Endócrino'],
      moxa: ['BL13', 'CV17', 'ST36'],
      laser: ['LU7', 'LU9', 'CV17'],
      eletro: ['ST36', 'LU7'],
      goal: 'Tonificar o Qi do Pulmão, fortalecer o Wei Qi, consolidar a superfície, reduzir susceptibilidade a patógenos externos.',
    },
    detail: {
      root: 'Tosse crônica, tristeza prolongada, dieta inadequada, doença respiratória ou exposição repetida ao frio.',
      manifestation: 'Tosse fraca, voz baixa, cansaço, dispneia leve ao esforço, sudorese espontânea, resfriados frequentes, pele sem brilho.',
      eight: 'Interno, Deficiência.',
      elements: 'Metal (Pulmão/Intestino Grosso) — deficiência de Qi no Pulmão.',
      question: 'Investigar frequência de resfriados, qualidade da tosse, energia geral, sudorese espontânea e histórico respiratório.',
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
    id: 'map:feet-plantar',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Pés - planta',
    tags: ['pé', 'pés', 'planta do pé', 'microssistema', 'mapa', 'KI1'],
    summary: 'Mapa visual plantar dos pés para consulta e calibração sob demanda, mantendo pontos em rascunho até revisão profissional.',
    sources: [createSource('asset-feet-plantar', 'Imagem WebP local das plantas dos pés')],
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
    id: 'map:hands-dorsal',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Mãos e punhos - dorso',
    tags: ['mão', 'punho', 'dorso da mão', 'antebraço', 'mapa', 'LI4', 'TE5'],
    summary: 'Mapa dorsal de mãos e punhos para pontos de dorso, espaços interdigitais, punho e antebraço distal.',
    sources: [createSource('asset-hands-dorsal', 'Imagem WebP local do dorso das mãos e punhos')],
  },
  {
    id: 'map:torso-head-front-back',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Torso e cabeça - frente e costas',
    tags: ['corpo', 'torso', 'cabeça', 'frente', 'costas', 'mapa', 'coluna'],
    summary: 'Mapas de torso e cabeça para pontos sistêmicos de face, crânio, tórax, abdome, ombro e coluna.',
    sources: [createSource('asset-torso-head-maps', 'Imagens WebP locais de torso e cabeça')],
  },
  {
    id: 'map:legs-front-back',
    type: KNOWLEDGE_TYPES.MAP_ASSET,
    name: 'Pernas - frente e costas',
    tags: ['perna', 'joelho', 'tornozelo', 'coxa', 'panturrilha', 'mapa', 'ST36', 'SP6'],
    summary: 'Mapas segmentados de pernas para coordenadas de joelho, coxa, panturrilha e tornozelo sem sobrecarregar o mapa de torso.',
    sources: [createSource('asset-legs-maps', 'Imagens WebP locais de pernas')],
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
