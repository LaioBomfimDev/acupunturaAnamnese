import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const baseReviewsPath = path.join(root, 'docs', 'km-agent-ednea-local-reviews.json');
const candidatesPath = path.join(root, 'docs', 'km-agent-ednea-production-candidates.json');
const enrichedPath = path.join(root, 'frontend', 'public', 'knowledge', 'km-agent', 'acupoints.enriched.json');
const outputDir = path.join(root, 'frontend', '.local-source-assets', 'atlas-ednea');
const outputPath = path.join(outputDir, 'deep-curated-reviews.json');
const summaryPath = path.join(root, 'docs', 'km-agent-deep-curation-summary.md');

const CJK_RE = /[\u1100-\u11ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af]/;
const CJK_CLUSTER_RE = /[\u1100-\u11ff\u3130-\u318f\u3400-\u9fff\uac00-\ud7af]+/g;

const SOURCE_REFS = [
  {
    label: 'Atlas dos Pontos de Acupuntura: Guia de Localizacao, Ednea Martins',
    role: 'fonte primaria local para os 361 pontos classicos mapeados',
  },
  {
    label: 'WHO Standard Acupuncture Point Locations in the Western Pacific Region',
    url: 'https://iris.who.int/handle/10665/353407',
    role: 'referencia metodologica para padronizacao dos 361 pontos classicos',
  },
  {
    label: 'WHO Standard acupuncture nomenclature',
    url: 'https://www.who.int/publications/i/item/9290611057',
    role: 'referencia metodologica de nomenclatura multilingue',
  },
  {
    label: 'KM-Agent acupoints.csv + AcuKG',
    role: 'rascunho complementar, nomes, localizacao de extras, indicacoes e relacoes como sugestao nao revisada',
  },
];

const EXTRA_NAME_PT_BR = {
  'EX-HN1': ['Sishencong', 'Quatro Inteligencias do Shen'],
  'EX-HN2': ['Dangyang', 'Yang Atual'],
  'EX-HN3': ['Yintang', 'Palacio da Impressao'],
  'EX-HN4': ['Yuyao', 'Cintura do Peixe'],
  'EX-HN5': ['Taiyang', 'Grande Yang'],
  'EX-HN6': ['Erjian', 'Apice da Orelha'],
  'EX-HN7': ['Qiuhou', 'Posterior ao Globo Ocular'],
  'EX-HN8': ['Shangyingxiang', 'Recepcao Superior da Fragrancia'],
  'EX-HN9': ['Neiyingxiang', 'Recepcao Interna da Fragrancia'],
  'EX-HN10': ['Juquan', 'Fonte Reunida'],
  'EX-HN11': ['Haiquan', 'Fonte do Mar'],
  'EX-HN12': ['Jinjin', 'Fluido Dourado'],
  'EX-HN13': ['Yuye', 'Liquido de Jade'],
  'EX-HN14': ['Yiming', 'Clareza Velada'],
  'EX-HN15': ['Bailao', 'Cem Laboriosidades'],
  'EX-CA1': ['Zigong', 'Utero'],
  'EX-B1': ['Dingchuan', 'Acalmar a Dispneia'],
  'EX-B2': ['Jiaji', 'Paravertebrais'],
  'EX-B3': ['Weiwanxiashu', 'Shu Inferior do Estomago'],
  'EX-B4': ['Pigen', 'Raiz da Massa'],
  'EX-B5': ['Xiajishu', 'Shu do Polo Inferior'],
  'EX-B6': ['Yaoyi', 'Conveniente para a Lombar'],
  'EX-B7': ['Yaoyan', 'Olhos da Lombar'],
  'EX-B8': ['Shiqizhui', 'Decima Setima Vertebra'],
  'EX-B9': ['Yaoqi', 'Extraordinario da Lombar'],
  'EX-UE1': ['Zhoujian', 'Ponta do Cotovelo'],
  'EX-UE2': ['Erbai', 'Dois Brancos'],
  'EX-UE3': ['Zhongquan', 'Fonte Central'],
  'EX-UE4': ['Zhongkui', 'Eminencia Central'],
  'EX-UE5': ['Dagukong', 'Grande Vazio Osseo'],
  'EX-UE6': ['Xiaogukong', 'Pequeno Vazio Osseo'],
  'EX-UE7': ['Yaotongdian', 'Ponto da Dor Lombar'],
  'EX-UE8': ['Wailaogong', 'Palacio Externo do Trabalho'],
  'EX-UE9': ['Baxie', 'Oito Perversos'],
  'EX-UE10': ['Sifeng', 'Quatro Fendas'],
  'EX-UE11': ['Shixuan', 'Dez Declaracoes'],
  'EX-LE1': ['Kuangu', 'Osso do Quadril'],
  'EX-LE2': ['Heding', 'Topo do Grou'],
  'EX-LE3': ['Baichongwo', 'Ninho dos Cem Insetos'],
  'EX-LE4': ['Neixiyan', 'Olho Interno do Joelho'],
  'EX-LE5': ['Xiyan', 'Olhos do Joelho'],
  'EX-LE6': ['Dannang', 'Vesicula Biliar'],
  'EX-LE7': ['Lanwei', 'Apendice'],
  'EX-LE8': ['Neihuaijian', 'Ponta do Maleolo Medial'],
  'EX-LE9': ['Waihuaijian', 'Ponta do Maleolo Lateral'],
  'EX-LE10': ['Bafeng', 'Oito Ventos'],
  'EX-LE11': ['Duyin', 'Yin Solitario'],
  'EX-LE12': ['Qiduan', 'Extremidade do Qi'],
  SA1: ['', 'Referencias da Cabeca'],
  SA2: ['', 'Referencias Lombares'],
  SA3: ['', 'Juncao Xifoesternal'],
  SA4: ['', 'Referencias das Costelas'],
  AA1: ['', 'Anatomia Auricular'],
  AA2: ['', 'Protocolo Auricular para Tabagismo'],
  AA3: ['', 'Protocolo Auricular para Obesidade'],
};

const EXTRA_LOCATION_PT_BR = {
  'EX-HN1': 'Quatro pontos localizados 1 cun anterior, posterior, a esquerda e a direita de GV20 (Baihui).',
  'EX-HN2': 'Na regiao frontal da cabeca, 1 cun acima da linha anterior do cabelo, diretamente superior a pupila.',
  'EX-HN3': 'Na fronte, entre as duas sobrancelhas.',
  'EX-HN4': 'Na regiao frontal, no centro da sobrancelha, diretamente superior a pupila.',
  'EX-HN5': '1 cun posterior ao ponto medio entre a extremidade lateral da sobrancelha e o canto lateral do olho.',
  'EX-HN6': 'No apice da orelha.',
  'EX-HN7': 'Na margem infraorbital, no ponto entre o quarto lateral e os tres quartos mediais da borda inferior da orbita.',
  'EX-HN8': 'Na extremidade superior do sulco nasolabial, na juncao da cartilagem nasal com a crista nasal.',
  'EX-HN9': 'Na mucosa dentro da narina, na juncao entre a cartilagem nasal e a crista nasal.',
  'EX-HN10': 'No ponto medio da linha mediana da face dorsal da lingua.',
  'EX-HN11': 'No ponto medio do frenulo sublingual.',
  'EX-HN12': 'Nas veias de ambos os lados do frenulo sublingual; Jinjin fica a esquerda e Yuye a direita.',
  'EX-HN13': 'Nas veias de ambos os lados do frenulo sublingual; Jinjin fica a esquerda e Yuye a direita.',
  'EX-HN14': 'No ponto medio entre GB20 (Fengchi) e TE17 (Yifeng).',
  'EX-HN15': 'Dois pontos localizados 2 cun superiores a GV14 (Dazhui) e 1 cun laterais.',
  'EX-CA1': 'No hipogastrio, 4 cun abaixo do umbigo e 3 cun lateral a linha mediana anterior.',
  'EX-B1': '0,5 cun lateral ao ponto abaixo do processo espinhoso da setima vertebra cervical.',
  'EX-B2': 'Na regiao vertebral do dorso, 0,5 cun lateral as depressoes abaixo dos processos espinhosos de T1 a L5; sao 17 pares, totalizando 34 pontos.',
  'EX-B3': 'Na regiao dorsal, 1,5 cun lateral ao espaco abaixo do processo espinhoso da oitava vertebra toracica.',
  'EX-B4': 'Na regiao vertebral do dorso, 3,5 cun lateral ao espaco abaixo do processo espinhoso da primeira vertebra lombar.',
  'EX-B5': 'Na linha mediana posterior, na depressao abaixo do processo espinhoso da terceira vertebra lombar.',
  'EX-B6': 'Na regiao vertebral, 3 cun lateral ao espaco abaixo do processo espinhoso da quarta vertebra lombar.',
  'EX-B7': 'Na regiao vertebral do dorso, 3 a 4 cun lateral ao espaco abaixo do processo espinhoso da quarta vertebra lombar, em depressao.',
  'EX-B8': 'Na regiao vertebral do dorso, na depressao abaixo do processo espinhoso da quinta vertebra lombar.',
  'EX-B9': 'Na regiao sacral do dorso, 2 cun superior ao apice do coccix.',
  'EX-UE1': 'Na face posterior do braco, no ponto saliente do olecrano da ulna.',
  'EX-UE2': 'Na face anterior do antebraco, 4 cun proximal a prega palmar do punho, em dois pontos medial e lateral ao tendao do flexor radial do carpo; bilateralmente sao 4 pontos.',
  'EX-UE3': 'No dorso do punho, no ponto medio entre LI5 (Yangxi) e TE4 (Yangchi), sobre a prega dorsal do punho.',
  'EX-UE4': 'No dorso da articulacao interfalangica proximal do dedo medio, no ponto central.',
  'EX-UE5': 'No centro da face dorsal da articulacao interfalangica do polegar.',
  'EX-UE6': 'No centro da face dorsal da articulacao interfalangica proximal do dedo minimo.',
  'EX-UE7': 'No dorso da mao, em dois pontos: um na depressao anterior a articulacao intermetacarpal entre o 2o e 3o metacarpais, e outro entre o 4o e 5o metacarpais; bilateralmente sao 4 pontos.',
  'EX-UE8': 'No dorso da mao, oposto a PC8 (Laogong).',
  'EX-UE9': 'No dorso da mao, nas quatro depressoes entre as articulacoes metacarpofalangicas, na transicao entre dorso e palma; bilateralmente sao 8 pontos.',
  'EX-UE10': 'Na face palmar dos dedos indicador, medio, anelar e minimo, no centro das articulacoes interfalangicas; a fonte registra variacao de localizacao conforme a articulacao considerada.',
  'EX-UE11': 'Nas pontas dos dez dedos das maos, 0,1 cun da unha.',
  'EX-LE1': 'Na face anterior da coxa, em dois pontos 1,5 cun laterais a ST34 (Liangqiu); bilateralmente sao 4 pontos.',
  'EX-LE2': 'Acima do joelho, na depressao sobre o ponto medio da base da patela.',
  'EX-LE3': 'Na face medial da coxa, 3 cun superior a extremidade medial da base da patela.',
  'EX-LE4': 'No joelho, na depressao medial ao ligamento patelar, abaixo da borda inferior da patela.',
  'EX-LE5': 'No joelho, nas depressoes medial e lateral ao ligamento patelar, abaixo da borda inferior da patela; medial e Neixiyan, lateral e Waixiyan.',
  'EX-LE6': 'Na face lateral da perna, 1,5 cun inferior a margem anterior da cabeca da fibula, em depressao.',
  'EX-LE7': 'Na face anterolateral da perna, em ponto sensivel entre ST36 e ST37, cerca de 1,5 a 2 cun abaixo de ST36.',
  'EX-LE8': 'No ponto mais proeminente do maleolo medial.',
  'EX-LE9': 'No ponto mais proeminente do maleolo lateral.',
  'EX-LE10': 'No dorso do pe, nas quatro depressoes entre as articulacoes metatarsofalangicas, na transicao entre dorso e planta; bilateralmente sao 8 pontos.',
  'EX-LE11': 'Na face plantar do segundo dedo do pe, no centro da dobra da articulacao interfalangica distal.',
  'EX-LE12': 'Nas pontas dos dez dedos dos pes, 0,1 cun da unha.',
  SA1: 'Referencias de superficie da cabeca: a distancia entre os pontos medios das linhas anterior e posterior do cabelo e contada como 12 cun; GV20 fica na linha mediana, 5 cun acima da linha anterior do cabelo, com medidas alternativas quando as linhas do cabelo nao sao nitidas.',
  SA2: 'Referencias lombares: elevar o abdome facilita a palpacao dos espacos lombares; L4 e identificado pela linha das cristas iliacas cruzando a linha mediana posterior; L5 e localizado pela base do sacro.',
  SA3: 'Juncao xifoesternal: seguir a caixa toracica ate a juncao entre esterno e processo xifoide; usar a juncao, nao a ponta variavel do processo xifoide.',
  SA4: 'Referencias das costelas: identificar o angulo esternal, a segunda costela e o segundo espaco intercostal; em seguida contar os espacos intercostais inferiormente.',
  AA1: 'Anatomia auricular: lobulo, helice, tuberculo da helice, raiz da helice, trago, incisuras tragais, antitrago, incisura intertragica, anti-helice, ramos da anti-helice, fossa escafoide, fossa triangular, concha e dorso da orelha.',
  AA2: 'Protocolo auricular para tabagismo: Shenmen auricular, faringe, nariz interno, endocrino, pulmao 1 e pulmao 2.',
  AA3: 'Protocolo auricular para obesidade: estomago, baco, ponto inicial/apetite conforme fonte KM-Agent e endocrino; revisar nomenclatura auricular antes de uso clinico.',
};

const TITLE_MEANING_FIXES = {
  ST10: 'Proeminencia da Agua',
  TE15: 'Fenda Celestial',
};

const FIELD_CURATIONS = {
  ST10: {
    needlingOverride: '- Inserção oblíqua: 0,5 a 0,7 cun. - Inserção perpendicular: 0,3 a 0,4 cun, direcionada da região lateral para medial. Evitar a artéria carótida comum.',
  },
  ST12: {
    needlingOverride: '- Inserção perpendicular: 0,3 a 0,5 cun. Recomenda-se inserção horizontal pela presença do ápice pulmonar e de vasos cervicais/subclávios. Não inserir profundamente nem diretamente inferior.',
  },
  ST17: {
    actions: ['Ponto de referência anatômica para linha mamilar e localização de pontos torácicos.'],
    indications: ['Não usado como ponto terapêutico sistêmico; usar apenas como referência de localização.'],
    relatedPatterns: ['Referência anatômica', 'Agulhamento contraindicado'],
    cautions: ['Agulhamento e moxa são proibidos neste ponto anatômico.'],
  },
  BL19: {
    needlingOverride: '- Inserção perpendicular: 0,3 a 0,5 cun. - Inserção oblíqua: 0,3 a 1 cun, orientada em relação à coluna, superior ou inferiormente. Inserção horizontal/transfixante de 1 a 2 cun pela camada muscular apenas com técnica avançada.',
  },
  BL21: {
    needlingOverride: '- Inserção perpendicular: 0,3 a 0,5 cun. - Inserção oblíqua: 0,5 a 1 cun, orientada em relação à coluna, superior ou inferiormente. Inserção horizontal/transfixante de 1 a 2 cun pela camada muscular apenas com técnica avançada.',
  },
  TE15: {
    needlingOverride: '- Inserção perpendicular: 0,3 a 0,5 cun, direcionada para a região da espinha da escápula. Não inserir profundamente. - Inserção oblíqua: 0,5 a 0,8 cun.',
  },
  GB16: {
    needlingOverride: '- Inserção perpendicular: 0,2 a 0,3 cun. - Inserção oblíqua/subcutânea: 0,3 a 0,5 cun em direção posterior. Sangria com agulha triangular apenas quando indicada.',
  },
  GB40: {
    needlingOverride: '- Inserção perpendicular: 0,3 a 0,5 cun. - Inserção oblíqua: 0,5 a 1 cun em direção à margem inferior do maléolo medial.',
  },
  CV2: {
    needlingOverride: '- Inserção perpendicular: 0,5 a 1 cun. Não agulhar em gestantes; referência clássica cita contraindicação de agulhamento.',
  },
  CV17: {
    needlingOverride: '- Inserção perpendicular: 0,3 a 0,5 cun. - Inserção oblíqua/subcutânea: 0,5 a 1 cun inferiormente ou em direção às mamas. Revisar contraindicação clássica de agulhamento e risco torácico.',
  },
  'EX-HN1': {
    actions: ['Acalma Shen', 'beneficia cérebro e sentidos', 'extingue Vento interno', 'alivia dor na cabeça'],
    indications: ['cefaleia', 'vertigem', 'insônia', 'epilepsia', 'agitação mental', 'memória fraca'],
    relatedPatterns: ['Shen', 'Vento interno', 'Calor ascendendo à cabeça'],
  },
  'EX-HN2': {
    actions: ['Clareia a cabeça', 'beneficia os olhos', 'dispersa Vento na região frontal'],
    indications: ['cefaleia frontal', 'dor ocular', 'visão turva', 'rinite ou obstrução nasal associada à região frontal'],
    relatedPatterns: ['Vento', 'Calor na cabeça', 'Estagnação local de Qi'],
  },
  'EX-HN3': {
    actions: ['Acalma Shen', 'regulariza sono e ansiedade', 'abre os orifícios nasais', 'dispersa Vento da face'],
    indications: ['ansiedade', 'insônia', 'agitação', 'cefaleia frontal', 'obstrução nasal', 'rinite', 'tontura'],
    relatedPatterns: ['Shen', 'Vento', 'Qi rebelde subindo à cabeça'],
  },
  'EX-HN4': {
    actions: ['Beneficia os olhos', 'relaxa a região periocular', 'dispersa Vento-Calor local'],
    indications: ['dor ocular', 'contração palpebral', 'ptose palpebral', 'visão turva', 'cefaleia supraorbital'],
    relatedPatterns: ['Vento-Calor', 'Calor nos olhos', 'Estagnação local'],
  },
  'EX-HN5': {
    actions: ['Dispersa Vento', 'limpa Calor', 'alivia dor temporal', 'beneficia os olhos'],
    indications: ['cefaleia temporal', 'enxaqueca', 'dor ocular', 'olhos vermelhos', 'neuralgia do trigêmeo'],
    relatedPatterns: ['Vento-Calor', 'Ascensão do Yang do Fígado', 'Calor nos olhos'],
  },
  'EX-HN6': {
    actions: ['Limpa Calor', 'beneficia ouvido e olhos', 'reduz edema local'],
    indications: ['febre', 'olhos vermelhos', 'dor ocular', 'hipertensão como sinal de ascensão', 'dor ou inflamação auricular'],
    relatedPatterns: ['Calor', 'Vento-Calor', 'Ascensão do Yang'],
  },
  'EX-HN7': {
    actions: ['Beneficia os olhos', 'clareia a visão', 'mobiliza Qi local na região orbital'],
    indications: ['dor ocular', 'miopia', 'atrofia óptica', 'glaucoma sob avaliação profissional', 'paralisia ocular'],
    relatedPatterns: ['Calor nos olhos', 'Deficiência de Fígado/Rim afetando olhos', 'Estagnação local'],
  },
  'EX-HN8': {
    actions: ['Abre o nariz', 'limpa Calor nasal', 'dispersa Vento da face'],
    indications: ['rinite', 'sinusite', 'obstrução nasal', 'anosmia', 'dor nasal'],
    relatedPatterns: ['Vento-Calor', 'Calor no Pulmão', 'Obstrução dos orifícios nasais'],
  },
  'EX-HN9': {
    actions: ['Abre o nariz', 'limpa Calor e toxinas', 'controla sangramento nasal quando indicado'],
    indications: ['epistaxe', 'rinite', 'sinusite', 'obstrução nasal', 'inflamação nasal'],
    relatedPatterns: ['Calor no Pulmão', 'Vento-Calor', 'Calor no Sangue'],
  },
  'EX-HN10': {
    actions: ['Beneficia a língua', 'limpa Calor da boca', 'abre os orifícios'],
    indications: ['rigidez da língua', 'afasia', 'saburra espessa', 'dor ou edema de língua'],
    relatedPatterns: ['Calor no Coração/Estômago', 'Fleuma obstruindo orifícios', 'Vento interno'],
  },
  'EX-HN11': {
    actions: ['Beneficia a língua e garganta', 'promove fluidos', 'limpa Calor da boca'],
    indications: ['afasia', 'rigidez da língua', 'sialorreia ou secura oral conforme padrão', 'dor sublingual'],
    relatedPatterns: ['Calor', 'Deficiência de fluidos', 'Fleuma obstruindo orifícios'],
  },
  'EX-HN12': {
    actions: ['Limpa Calor', 'beneficia língua e garganta', 'mobiliza Sangue local'],
    indications: ['língua inchada', 'rigidez da língua', 'afasia', 'dor de garganta', 'salivação alterada'],
    relatedPatterns: ['Calor no Sangue', 'Calor no Coração/Estômago', 'Obstrução da língua'],
  },
  'EX-HN13': {
    actions: ['Limpa Calor', 'beneficia língua e garganta', 'mobiliza Sangue local'],
    indications: ['língua inchada', 'rigidez da língua', 'afasia', 'dor de garganta', 'salivação alterada'],
    relatedPatterns: ['Calor no Sangue', 'Calor no Coração/Estômago', 'Obstrução da língua'],
  },
  'EX-HN14': {
    actions: ['Clareia os olhos', 'acalma Shen', 'beneficia a região cervical posterior'],
    indications: ['miopia', 'visão turva', 'dor ocular', 'insônia', 'rigidez cervical'],
    relatedPatterns: ['Deficiência de Fígado/Rim afetando olhos', 'Shen', 'Estagnação cervical'],
  },
  'EX-HN15': {
    actions: ['Alivia tosse e dispneia', 'beneficia pescoço e nuca', 'suporta deficiência crônica'],
    indications: ['tosse crônica', 'asma', 'rigidez cervical', 'linfonodos cervicais aumentados', 'fadiga crônica'],
    relatedPatterns: ['Deficiência do Pulmão', 'Fleuma', 'Estagnação cervical'],
  },
  'EX-CA1': {
    actions: ['Regula o útero', 'move Qi e Sangue no baixo ventre', 'beneficia Jiao Inferior'],
    indications: ['dismenorreia', 'menstruação irregular', 'infertilidade sob avaliação', 'prolapso uterino', 'dor no baixo ventre'],
    relatedPatterns: ['Estagnação de Qi/Sangue', 'Jiao Inferior', 'Ginecológico'],
    cautions: ['Evitar em gestação sem indicação profissional formal.'],
  },
  'EX-B1': {
    actions: ['Acalma dispneia', 'faz descender o Qi do Pulmão', 'alivia tosse'],
    indications: ['asma', 'tosse', 'dispneia', 'bronquite', 'rigidez cervical'],
    relatedPatterns: ['Qi do Pulmão em contrafluxo', 'Fleuma no Pulmão', 'Vento-Frio/Vento-Calor'],
  },
  'EX-B2': {
    actions: ['Regula órgãos por segmento dorsal', 'relaxa coluna', 'move Qi e Sangue nos canais paravertebrais'],
    indications: ['dor vertebral', 'radiculalgia', 'dor lombar', 'alterações funcionais segmentares', 'rigidez paravertebral'],
    relatedPatterns: ['Estagnação de Qi/Sangue', 'Dor de canal', 'Desarmonia segmentar'],
  },
  'EX-B3': {
    actions: ['Regula Estômago e Baço', 'harmoniza Jiao Médio', 'transforma Umidade'],
    indications: ['dor epigástrica', 'diabetes como apoio conforme padrão', 'indigestão', 'distensão abdominal'],
    relatedPatterns: ['Desarmonia Baço-Estômago', 'Umidade', 'Jiao Médio'],
  },
  'EX-B4': {
    actions: ['Move Qi e Sangue', 'amolece massas', 'beneficia região lombar'],
    indications: ['massa abdominal', 'dor lombar', 'distensão abdominal', 'hepatoesplenomegalia sob avaliação médica'],
    relatedPatterns: ['Estagnação de Qi/Sangue', 'Massas', 'Jiao Médio/Inferior'],
  },
  'EX-B5': {
    actions: ['Beneficia Jiao Inferior', 'relaxa lombar', 'regula intestinos e urina'],
    indications: ['lombalgia', 'dor abdominal inferior', 'diarreia', 'disúria', 'retenção urinária'],
    relatedPatterns: ['Jiao Inferior', 'Umidade-Calor', 'Estagnação lombar'],
  },
  'EX-B6': {
    actions: ['Fortalece região lombar', 'move Qi e Sangue local', 'beneficia Rim conforme padrão'],
    indications: ['lombalgia', 'rigidez lombar', 'dor sacrolombar', 'fraqueza lombar'],
    relatedPatterns: ['Deficiência do Rim', 'Estagnação de Qi/Sangue', 'Dor lombar'],
  },
  'EX-B7': {
    actions: ['Tonifica região lombar', 'beneficia Rim', 'move Qi local'],
    indications: ['lombalgia', 'dor sacral', 'distúrbios urinários conforme padrão', 'fraqueza lombar'],
    relatedPatterns: ['Deficiência do Rim', 'Jiao Inferior', 'Estagnação lombar'],
  },
  'EX-B8': {
    actions: ['Beneficia lombar e sacro', 'regula Jiao Inferior', 'move Qi e Sangue'],
    indications: ['lombalgia', 'dismenorreia', 'hemorroidas', 'dor sacral'],
    relatedPatterns: ['Jiao Inferior', 'Estagnação de Qi/Sangue', 'Ginecológico'],
  },
  'EX-B9': {
    actions: ['Acalma Shen', 'beneficia lombar e sacro', 'regula Du Mai local'],
    indications: ['epilepsia', 'cefaleia', 'lombalgia', 'rigidez sacrolombar'],
    relatedPatterns: ['Shen', 'Vento interno', 'Du Mai'],
    needlingOverride: '- Inserção perpendicular inicial: 0,3 cun; depois direcionar superiormente com inserção horizontal de 2 a 2,5 cun. Reter cerca de 30 minutos quando houver sensação de acidez/formigamento ascendente, se clinicamente indicado.',
  },
  'EX-UE1': {
    actions: ['Limpa Calor', 'reduz edema e dor local', 'beneficia cotovelo'],
    indications: ['dor no cotovelo', 'edema local', 'escrófula', 'processos inflamatórios locais sob avaliação'],
    relatedPatterns: ['Calor', 'Estagnação local', 'Toxinas'],
  },
  'EX-UE2': {
    actions: ['Regula Jiao Inferior', 'beneficia ânus e reto', 'move Qi nos canais do antebraço'],
    indications: ['hemorroidas', 'prolapso retal', 'dor anal', 'constipação associada a padrão'],
    relatedPatterns: ['Jiao Inferior', 'Umidade-Calor', 'Qi afundado'],
  },
  'EX-UE3': {
    actions: ['Alivia dor no punho', 'move Qi e Sangue local', 'harmoniza canais do punho'],
    indications: ['dor no punho', 'tendinite local', 'rigidez do punho', 'dor no antebraço'],
    relatedPatterns: ['Estagnação local', 'Dor de canal', 'Vento-Frio em canal'],
  },
  'EX-UE4': {
    actions: ['Harmoniza Estômago', 'faz descender Qi rebelde', 'alivia náusea'],
    indications: ['náusea', 'vômito', 'soluço', 'indigestão'],
    relatedPatterns: ['Qi do Estômago em contrafluxo', 'Jiao Médio', 'Estagnação alimentar'],
  },
  'EX-UE5': {
    actions: ['Beneficia olhos', 'limpa Calor local', 'move Qi na mão'],
    indications: ['dor ocular', 'vermelhidão ocular', 'catarata como apoio histórico', 'dor no polegar'],
    relatedPatterns: ['Calor nos olhos', 'Estagnação local', 'Vento-Calor'],
  },
  'EX-UE6': {
    actions: ['Beneficia olhos', 'limpa Calor', 'move Qi na mão'],
    indications: ['dor ocular', 'vermelhidão ocular', 'doenças oculares conforme padrão', 'dor no dedo mínimo'],
    relatedPatterns: ['Calor nos olhos', 'Vento-Calor', 'Estagnação local'],
  },
  'EX-UE7': {
    actions: ['Alivia lombalgia aguda', 'move Qi e Sangue', 'relaxa tendões'],
    indications: ['lombalgia aguda', 'espasmo lombar', 'dor irradiada', 'rigidez lombar'],
    relatedPatterns: ['Estagnação de Qi/Sangue', 'Dor lombar', 'Frio/Umidade em canal'],
    needlingOverride: '- Inserção oblíqua: 0,3 a 0,5 cun. Direcionar o estímulo até produzir sensação de formigamento/acidez irradiando para a ponta dos dedos, se tolerado.',
  },
  'EX-UE8': {
    actions: ['Aquece Yang local', 'move Qi e Sangue da mão', 'alivia dor'],
    indications: ['dor no dorso da mão', 'rigidez dos dedos', 'dor no punho', 'frio nas mãos conforme padrão'],
    relatedPatterns: ['Frio em canal', 'Estagnação local', 'Deficiência de Yang'],
  },
  'EX-UE9': {
    actions: ['Limpa Calor', 'reduz edema dos dedos', 'move Qi nos canais da mão'],
    indications: ['dor e edema dos dedos', 'dormência dos dedos', 'artralgia da mão', 'vermelhidão local'],
    relatedPatterns: ['Calor', 'Umidade-Calor', 'Estagnação local'],
  },
  'EX-UE10': {
    actions: ['Harmoniza digestão infantil', 'limpa Calor', 'transforma acúmulo alimentar'],
    indications: ['indigestão infantil', 'desnutrição infantil tradicional', 'tosse infantil', 'vômito ou diarreia conforme padrão'],
    relatedPatterns: ['Estagnação alimentar', 'Jiao Médio', 'Calor infantil'],
  },
  'EX-UE11': {
    actions: ['Restaura consciência', 'limpa Calor extremo', 'abre orifícios', 'acalma convulsão'],
    indications: ['desmaio', 'coma', 'febre alta', 'convulsão', 'insolação', 'agitação extrema'],
    relatedPatterns: ['Calor extremo', 'Fleuma obstruindo orifícios', 'Vento interno'],
  },
  'EX-LE1': {
    actions: ['Alivia dor no quadril e coxa', 'move Qi e Sangue em membro inferior'],
    indications: ['dor no quadril', 'dor na coxa', 'dificuldade motora de membro inferior', 'dor femoral'],
    relatedPatterns: ['Estagnação de Qi/Sangue', 'Dor de canal', 'Bi de membro inferior'],
  },
  'EX-LE2': {
    actions: ['Alivia dor no joelho', 'relaxa tendões', 'move Qi local'],
    indications: ['dor anterior do joelho', 'edema de joelho', 'rigidez de joelho'],
    relatedPatterns: ['Estagnação local', 'Bi de joelho', 'Umidade em articulação'],
  },
  'EX-LE3': {
    actions: ['Dispersa Vento', 'limpa Calor e Umidade da pele', 'alivia prurido'],
    indications: ['urticária', 'prurido', 'eczema', 'dermatoses com calor/umidade'],
    relatedPatterns: ['Vento na pele', 'Umidade-Calor', 'Calor no Sangue'],
  },
  'EX-LE4': {
    actions: ['Alivia dor no joelho', 'relaxa tendões', 'move Qi local'],
    indications: ['dor medial do joelho', 'edema de joelho', 'rigidez articular', 'lesões periarticulares do joelho'],
    relatedPatterns: ['Bi de joelho', 'Estagnação local', 'Umidade em articulação'],
  },
  'EX-LE5': {
    actions: ['Alivia dor no joelho', 'relaxa tendões', 'reduz edema articular'],
    indications: ['dor de joelho', 'artralgia do joelho', 'edema articular', 'rigidez de joelho'],
    relatedPatterns: ['Bi de joelho', 'Umidade em articulação', 'Estagnação local'],
  },
  'EX-LE6': {
    actions: ['Beneficia Vesícula Biliar', 'move Qi do hipocôndrio', 'alivia dor biliar'],
    indications: ['colecistite sob acompanhamento médico', 'cólica biliar', 'dor no hipocôndrio', 'náusea associada à Vesícula Biliar'],
    relatedPatterns: ['Calor-Umidade na Vesícula Biliar', 'Estagnação de Qi do Fígado', 'Jiao Médio'],
  },
  'EX-LE7': {
    actions: ['Alivia dor abdominal aguda conforme avaliação', 'limpa Calor no intestino', 'move Qi no abdome'],
    indications: ['suspeita de apendicite apenas como apoio e com avaliação médica', 'dor abdominal', 'distensão abdominal'],
    relatedPatterns: ['Calor no intestino', 'Estagnação de Qi', 'Jiao Inferior'],
    cautions: ['Dor abdominal aguda exige avaliação médica; não usar para atrasar atendimento.'],
  },
  'EX-LE8': {
    actions: ['Limpa Calor', 'alivia dor local', 'beneficia tornozelo medial'],
    indications: ['dor no maléolo medial', 'dor no tornozelo', 'edema local', 'dor dentária em uso tradicional'],
    relatedPatterns: ['Calor', 'Estagnação local', 'Bi de tornozelo'],
  },
  'EX-LE9': {
    actions: ['Limpa Calor', 'alivia dor local', 'beneficia tornozelo lateral'],
    indications: ['dor no maléolo lateral', 'dor no tornozelo', 'edema local', 'dor dentária em uso tradicional'],
    relatedPatterns: ['Calor', 'Estagnação local', 'Bi de tornozelo'],
  },
  'EX-LE10': {
    actions: ['Limpa Calor', 'reduz edema do pé', 'move Qi nos canais do pé'],
    indications: ['dor e edema dos dedos do pé', 'dormência dos dedos do pé', 'beribéri em uso tradicional', 'artralgia do pé'],
    relatedPatterns: ['Umidade-Calor', 'Estagnação local', 'Bi do pé'],
  },
  'EX-LE11': {
    actions: ['Regula Jiao Inferior', 'beneficia útero conforme padrão', 'limpa Calor'],
    indications: ['menstruação irregular', 'sangramento uterino', 'dor no baixo ventre', 'distúrbios ginecológicos sob avaliação'],
    relatedPatterns: ['Ginecológico', 'Calor no Sangue', 'Jiao Inferior'],
    cautions: ['Revisar gestação antes de uso.'],
  },
  'EX-LE12': {
    actions: ['Abre orifícios', 'move Qi nas extremidades', 'limpa Calor'],
    indications: ['dormência dos dedos dos pés', 'dor nos dedos dos pés', 'edema do pé', 'perda de consciência em uso tradicional'],
    relatedPatterns: ['Estagnação em extremidades', 'Calor', 'Fleuma obstruindo orifícios'],
  },
  SA1: {
    actions: ['Referência anatômica para medir e localizar pontos da cabeça.'],
    indications: ['Uso técnico: calibração de medidas proporcionais da cabeça e localização de pontos do couro cabeludo.'],
    relatedPatterns: ['Referência anatômica'],
    needling: 'Item de referência anatômica; não há técnica de agulhamento própria.',
  },
  SA2: {
    actions: ['Referência anatômica para identificar vértebras lombares e sacro.'],
    indications: ['Uso técnico: localização segura de pontos lombares, sacrais e paravertebrais.'],
    relatedPatterns: ['Referência anatômica'],
    needling: 'Item de referência anatômica; não há técnica de agulhamento própria.',
  },
  SA3: {
    actions: ['Referência anatômica para localizar a junção xifoesternal.'],
    indications: ['Uso técnico: orientação de pontos do tórax e abdome superior.'],
    relatedPatterns: ['Referência anatômica'],
    needling: 'Item de referência anatômica; não há técnica de agulhamento própria.',
  },
  SA4: {
    actions: ['Referência anatômica para contagem de costelas e espaços intercostais.'],
    indications: ['Uso técnico: localização de pontos torácicos com maior segurança.'],
    relatedPatterns: ['Referência anatômica'],
    needling: 'Item de referência anatômica; não há técnica de agulhamento própria.',
  },
  AA1: {
    actions: ['Referência anatômica para identificar regiões auriculares.'],
    indications: ['Uso técnico: orientação de mapas auriculares e seleção de pontos da orelha.'],
    relatedPatterns: ['Referência auricular'],
    needling: 'Item de referência auricular; técnica depende do ponto auricular selecionado.',
  },
  AA2: {
    actions: ['Apoia cessação de tabagismo por combinação auricular', 'modula ansiedade/compulsão conforme avaliação'],
    indications: ['tabagismo', 'fissura por nicotina', 'ansiedade associada à abstinência'],
    relatedPatterns: ['Compulsão', 'Shen', 'Pulmão'],
    needling: 'Técnica auricular conforme protocolo profissional: sementes, stiper, laser ou agulha auricular; revisar mapa e contraindicações locais.',
  },
  AA3: {
    actions: ['Apoia controle de apetite por combinação auricular', 'modula compulsão alimentar conforme avaliação'],
    indications: ['obesidade como apoio terapêutico', 'compulsão alimentar', 'controle de apetite'],
    relatedPatterns: ['Compulsão', 'Baço/Estômago', 'Fleuma-Umidade'],
    needling: 'Técnica auricular conforme protocolo profissional: sementes, stiper, laser ou agulha auricular; revisar mapa e contraindicações locais.',
  },
};

const RELATION_PT = {
  benefits: 'beneficia',
  boosts: 'fortalece',
  calms: 'acalma',
  clears: 'elimina',
  cools: 'resfria',
  courses: 'faz circular',
  diffuses: 'difunde',
  disinhibits: 'desobstrui',
  disperses: 'dispersa',
  dispels: 'dispersa',
  downbears: 'faz descender',
  drains: 'drena',
  eliminates: 'elimina',
  expels: 'expele',
  extinguishes: 'extingue',
  fortifies: 'fortalece',
  frees: 'libera',
  harmonizes: 'harmoniza',
  invigorates: 'revigora',
  loosens: 'relaxa',
  moves: 'move',
  nourishes: 'nutre',
  opens: 'abre',
  pacifies: 'pacifica',
  promotes: 'promove',
  quickens: 'ativa',
  quiets: 'aquieta',
  rectifies: 'retifica',
  regulates: 'regula',
  relaxes: 'relaxa',
  relieves: 'alivia',
  removes: 'remove',
  resolves: 'resolve',
  restores: 'restaura',
  soothes: 'suaviza',
  stabilizes: 'estabiliza',
  stimulates: 'estimula',
  stops: 'interrompe',
  strengthens: 'fortalece',
  subdues: 'subjuga',
  supplements: 'suplementa',
  tonifies: 'tonifica',
  transforms: 'transforma',
  warms: 'aquece',
};

const TARGET_PT = {
  Asthma: 'asma',
  Bladder: 'Bexiga',
  Blood: 'Sangue',
  Bones: 'ossos',
  Brain: 'cerebro',
  Center: 'Centro',
  Channel: 'Canal',
  'Channel Obstructions': 'obstrucoes dos Canais',
  Channels: 'Canais',
  Chest: 'torax',
  Cold: 'Frio',
  Consciousness: 'consciencia',
  'Conception Vessels': 'Ren Mai',
  Convulsions: 'convulsoes',
  Cough: 'tosse',
  Counterflow: 'Qi em contrafluxo',
  Damp: 'Umidade',
  'Damp Heat': 'Calor-Umidade',
  Diaphragm: 'diafragma',
  Dyspnea: 'dispneia',
  Ears: 'ouvidos',
  Essence: 'Essencia',
  Exterior: 'Exterior',
  'Exterior Wind': 'Vento exterior',
  Eyes: 'olhos',
  Fire: 'Fogo',
  Fullness: 'plenitude',
  Gallbladder: 'Vesicula Biliar',
  Head: 'cabeca',
  Heart: 'Coracao',
  Heat: 'Calor',
  'Interior Wind': 'Vento interno',
  Intestines: 'intestinos',
  Joints: 'articulacoes',
  Kidney: 'Rim',
  Kidneys: 'Rins',
  Knees: 'joelhos',
  Liver: 'Figado',
  'Liver Qi Smooth Flow': 'livre fluxo do Qi do Figado',
  'Liver Yang': 'Yang do Figado',
  'Lower Back': 'lombar',
  'Lower Burner': 'Aquecedor Inferior',
  'Lower Burner Damp Heat': 'Calor-Umidade no Aquecedor Inferior',
  'Lung Heat': 'Calor do Pulmao',
  'Lung Qi': 'Qi do Pulmao',
  'Lung Qi Descending': 'descida do Qi do Pulmao',
  Lungs: 'Pulmoes',
  Masses: 'massas',
  Menses: 'menstruacao',
  Mind: 'mente/Shen',
  Nose: 'nariz',
  Orifices: 'orificios',
  Pain: 'dor',
  'Penetrating Vessels': 'Chong Mai',
  Phlegm: 'Fleuma',
  Portals: 'portais',
  Qi: 'Qi',
  'Rebellious Qi': 'Qi rebelde',
  Resuscitation: 'recuperacao da consciencia',
  Sinews: 'tendoes e musculos',
  Spasms: 'espasmos',
  Spirit: 'Shen',
  Spleen: 'Baco',
  Stagnation: 'estagnacao',
  Stomach: 'Estomago',
  'Stomach Qi': 'Qi do Estomago',
  Swelling: 'edema',
  Throat: 'garganta',
  'Triple Burner': 'Triplo Aquecedor',
  Urination: 'miccao',
  Uterus: 'utero',
  Wind: 'Vento',
  'Wind Heat': 'Vento-Calor',
  Yang: 'Yang',
  Yin: 'Yin',
};

const INDICATION_PT = {
  'Abdominal Distension': 'distensao abdominal',
  'Abdominal Pain': 'dor abdominal',
  Anorexia: 'anorexia',
  Anxiety: 'ansiedade',
  'Arm Motor Impairment': 'comprometimento motor do braco',
  'Arm Pain': 'dor no braco',
  Asthma: 'asma',
  'Back Pain': 'dor nas costas',
  'Back Stiffness': 'rigidez dorsal',
  Beriberi: 'beriberi',
  Borborygmus: 'borborigmo',
  'Cardiac Pain': 'dor cardiaca/precordial',
  'Cheek Swelling': 'edema da bochecha',
  'Chest Fullness': 'plenitude toracica',
  'Chest Pain': 'dor toracica',
  Constipation: 'constipacao',
  Convulsion: 'convulsao',
  Cough: 'tosse',
  Deafness: 'surdez',
  Diarrhea: 'diarreia',
  Dizziness: 'tontura',
  Dysentery: 'disenteria',
  Dysmenorrhea: 'dismenorreia',
  Dysuria: 'disuria',
  Edema: 'edema',
  'Elbow Pain': 'dor no cotovelo',
  Enuresis: 'enurese',
  EpigastricPain: 'dor epigastrica',
  'Epigastric Pain': 'dor epigastrica',
  Epilepsy: 'epilepsia',
  Epistaxis: 'epistaxe',
  'Excess Type Cough': 'tosse por padrao de excesso',
  'Eye Pain': 'dor ocular',
  'Eye Redness': 'vermelhidao ocular',
  'Eye Swelling': 'edema ocular',
  'Eyelid Twitching': 'fasciculacao palpebral',
  'Face Paralysis': 'paralisia facial',
  'Face Swelling': 'edema facial',
  'Febrile Disease': 'doenca febril',
  Fever: 'febre',
  'Gastric Pain': 'dor gastrica',
  Goiter: 'bocio',
  Headache: 'cefaleia',
  Hemiplegia: 'hemiplegia',
  Hemoptysis: 'hemoptise',
  Hemorrhoids: 'hemorroidas',
  Hernia: 'hernia',
  Hiccup: 'soluco',
  'Hypochondrium Fullness': 'plenitude no hipocondrio',
  'Hypochondrium Pain': 'dor no hipocondrio',
  Impotence: 'impotencia',
  Indigestion: 'indigestao',
  'Infantile Convulsion': 'convulsao infantil',
  Insomnia: 'insonia',
  'Irregular Menstruation': 'menstruacao irregular',
  Irritability: 'irritabilidade',
  Jaundice: 'ictericia',
  'Knee Pain': 'dor no joelho',
  Lacrimation: 'lacrimejamento',
  Leukorrhea: 'leucorreia',
  'Low Abdomen Pain': 'dor no baixo ventre',
  'Low Back Pain': 'dor lombar',
  'Low Back Stiffness': 'rigidez lombar',
  'Low Extremity Motor Impairment': 'comprometimento motor de membro inferior',
  'Low Extremity Numbness': 'dormencia de membro inferior',
  'Low Extremity Pain': 'dor em membro inferior',
  'Lumbar Pain': 'dor lombar',
  Malaria: 'malaria',
  Mania: 'mania',
  Mastitis: 'mastite',
  'Mental Disorder': 'transtorno mental',
  Migraine: 'enxaqueca',
  'Morbid Leukorrhea': 'leucorreia patologica',
  'Mouth Deviation': 'desvio da boca',
  'Muscular Atrophy': 'atrofia muscular',
  NasalObstruction: 'obstrucao nasal',
  'Nasal Obstruction': 'obstrucao nasal',
  Nausea: 'nausea',
  'Neck Pain': 'dor cervical',
  'Neck Stiffness': 'rigidez cervical',
  'Night Sweat': 'sudorese noturna',
  'Nocturnal Emission': 'emissao seminal noturna',
  Ophthalmalgia: 'dor ocular',
  'Outer Canthus Pain': 'dor no canto lateral do olho',
  Pain: 'dor',
  Palpitation: 'palpitacao',
  Rhinorrhea: 'rinorreia',
  Scrofula: 'escrófula',
  'Shoulder Pain': 'dor no ombro',
  'Sore Throat': 'dor de garganta',
  'Stomach Pain': 'dor de estomago',
  'Swallow Difficulty': 'dificuldade de degluticao',
  Tinnitus: 'zumbido',
  Toothache: 'odontalgia',
  'Urine Retention': 'retencao urinaria',
  'Uterine Bleeding': 'sangramento uterino',
  'Uterus Prolapse': 'prolapso uterino',
  Vertigo: 'vertigem',
  'Vision Blurring': 'visao turva',
  Vomiting: 'vomito',
  'Wrist Pain': 'dor no punho',
};

const ORIENTAL_REPLACEMENTS = [
  ['孕婦不宜鍼', 'nao agulhar em gestantes'],
  ['孕婦는', 'gestantes'],
  ['不宜過深刺', 'nao realizar insercao profunda'],
  ['不宜深刺', 'nao realizar insercao profunda'],
  ['不可深刺', 'nao realizar insercao profunda'],
  ['禁深刺', 'insercao profunda contraindicada'],
  ['禁刺', 'agulhamento contraindicado'],
  ['禁灸', 'moxa contraindicada'],
  ['禁忌한다', 'contraindicado'],
  ['禁한다', 'contraindicado'],
  ['鍼灸甲乙經', 'Zhenjiu Jiayi Jing'],
  ['鍼灸大成', 'Zhenjiu Dacheng'],
  ['醫學入門', 'Yixue Rumen'],
  ['明堂', 'Mingtang'],
  ['刺太深令人逆息', 'insercao profunda pode causar dispneia por contrafluxo do Qi'],
  ['刺太深時', 'em caso de insercao muito profunda'],
  ['氣逆', 'contrafluxo do Qi'],
  ['刺入仙骨後孔內', 'inserir no forame sacral posterior'],
  ['艾炷灸', 'moxa direta em cone'],
  ['艾條灸', 'moxa em bastao'],
  ['壯', 'cones de moxa'],
  ['三稜鍼으로', 'com agulha triangular'],
  ['三稜鍼', 'agulha triangular'],
  ['點刺出血', 'puncao para sangria'],
  ['點刺하여', 'puncionar'],
  ['點刺', 'puncao'],
  ['刺鍼時', 'durante o agulhamento'],
  ['刺鍼', 'agulhar'],
  ['刺入한', 'apos inserir'],
  ['刺入하며', 'inserindo'],
  ['刺入', 'inserir'],
  ['深刺하여', 'insercao profunda'],
  ['深刺할', 'insercao profunda'],
  ['深刺를', 'insercao profunda'],
  ['深刺', 'insercao profunda'],
  ['鍼尖을', 'ponta da agulha'],
  ['鍼尖', 'ponta da agulha'],
  ['留鍼', 'retencao da agulha'],
  ['留', 'reter'],
  ['透刺', 'insercao transfixante'],
  ['橫刺', 'insercao horizontal'],
  ['横刺', 'insercao horizontal'],
  ['斜刺', 'insercao obliqua'],
  ['斜', 'obliquamente'],
  ['直下에는', 'diretamente abaixo ha'],
  ['直刺', 'insercao perpendicular'],
  ['皮刺', 'agulhamento subcutaneo'],
  ['皮하여', 'pela pele'],
  ['皮', 'pele'],
  ['筋層을', 'camada muscular'],
  ['筋層', 'camada muscular'],
  ['肺尖部가', 'apice pulmonar'],
  ['肺가', 'pulmao'],
  ['肺', 'pulmao'],
  ['外膝眼에서는', 'no olho lateral do joelho'],
  ['內膝眼에서는', 'no olho medial do joelho'],
  ['外膝眼에서', 'do olho lateral do joelho'],
  ['內膝眼에서', 'do olho medial do joelho'],
  ['外膝眼', 'olho lateral do joelho'],
  ['內膝眼', 'olho medial do joelho'],
  ['內關', 'PC6 (Neiguan)'],
  ['少海', 'HT3 (Shaohai)'],
  ['後谿를', 'SI3 (Houxi)'],
  ['肩髃', 'LI15 (Jianyu)'],
  ['迎香', 'LI20 (Yingxiang)'],
  ['內眼角을', 'canto medial do olho'],
  ['顔面神經麻痺', 'paralisia do nervo facial'],
  ['三叉神經痛', 'neuralgia do trigemeo'],
  ['近視', 'miopia'],
  ['眼疾患', 'doenca ocular'],
  ['肩臂痛', 'dor em ombro e braco'],
  ['上肢癱瘓', 'paralisia de membro superior'],
  ['軀幹疾患에는', 'em doencas do tronco'],
  ['生식기질환', 'doencas genitais'],
  ['舌强', 'rigidez da lingua'],
  ['舌苔에는', 'saburra lingual'],
  ['舌下', 'sublingual'],
  ['舌系帶', 'frenulo lingual'],
  ['舌', 'lingua'],
  ['黃白色의', 'amarelado-esbranquicado'],
  ['투명한', 'transparente'],
  ['점액을', 'muco'],
  ['少量', 'pequena quantidade'],
  ['放出', 'liberar'],
  ['出血이 잦은 사람은', 'pessoas com sangramento frequente'],
  ['出血이', 'sangramento'],
  ['麻‧酸感이', 'sensacao de formigamento e acidez'],
  ['酸麻感이', 'sensacao de acidez e formigamento'],
  ['麻', 'formigamento'],
  ['酸感이', 'sensacao de acidez'],
  ['손바닥쪽에서 손등쪽을', 'da face palmar para a face dorsal'],
  ['손바닥에서', 'da palma da mao'],
  ['손등쪽을', 'para o dorso da mao'],
  ['손등을', 'dorso da mao'],
  ['손가락 끝에', 'ate a ponta dos dedos'],
  ['눈확 아래 모서리에서', 'a partir da margem inferior da orbita'],
  ['눈확아래모서리를', 'margem inferior da orbita'],
  ['눈확', 'orbita'],
  ['바깥쪽아래로부터', 'da regiao inferolateral'],
  ['안쪽위로', 'em direcao superomedial'],
  ['바깥목동맥', 'arteria carotida externa'],
  ['온목동맥을', 'arteria carotida comum'],
  ['빗장밑동', 'vasos subclavios'],
  ['정맥이', 'veia'],
  ['동맥을', 'arteria'],
  ['淺靜脈을', 'veia superficial'],
  ['혈관을', 'vasos sanguineos'],
  ['척추를', 'coluna vertebral'],
  ['脛骨', 'tibia'],
  ['胸骨柄', 'manubrio do esterno'],
  ['氣管을', 'traqueia'],
  ['氣管', 'traqueia'],
  ['前緣을', 'margem anterior'],
  ['後緣을', 'margem posterior'],
  ['頭部', 'cabeca'],
  ['顔面部의', 'face'],
  ['頰', 'bochecha'],
  ['中手骨의', 'metacarpal'],
  ['骨膜을', 'periosteo'],
  ['手指의', 'dedos da mao'],
  ['拘攣이나', 'contratura'],
  ['근육의', 'muscular'],
  ['마비에는', 'em paralisia'],
  ['팔꿈치를', 'cotovelo'],
  ['팔꿉관절의', 'articulacao do cotovelo'],
  ['안쪽을', 'face medial'],
  ['臂外面에서', 'da face externa do braco'],
  ['內側面을', 'face medial'],
  ['三角筋中에', 'no deltoide'],
  ['上腕骨前緣에서', 'na margem anterior do umero'],
  ['仰臥位에서', 'em decubito dorsal'],
  ['안구를', 'globo ocular'],
  ['고정하게', 'manter fixo'],
  ['搗鍼하지', 'nao manipular em pistonagem'],
  ['轉과', 'rotacao'],
  ['下齒痛에는', 'em dor nos dentes inferiores'],
  ['上齒', 'dentes superiores'],
  ['下齒를', 'dentes inferiores'],
  ['첫째', 'primeiro'],
  ['여섯째', 'sexto'],
  ['갈비뼈사이의', 'intercostal'],
  ['胸部', 'torax'],
  ['內部에는', 'internamente'],
  ['盲腸이', 'ceco'],
  ['尾骨尖', 'apice do coccix'],
  ['上方', 'superiormente'],
  ['下方', 'inferiormente'],
  ['後方', 'posteriormente'],
  ['外方', 'lateralmente'],
  ['前後', 'anteroposterior'],
  ['左右', 'laterolateral'],
  ['上', 'superiormente'],
  ['下', 'inferiormente'],
  ['前', 'anteriormente'],
  ['後', 'posteriormente'],
  ['外', 'lateralmente'],
  ['內', 'medialmente'],
  ['宜', 'recomenda-se'],
  ['不可', 'nao indicado'],
  ['먼저', 'primeiro'],
  ['다시', 'novamente'],
  ['약간', 'levemente'],
  ['아래로', 'inferiormente'],
  ['위에서', 'de cima'],
  ['위쪽', 'superiormente'],
  ['위로', 'superiormente'],
  ['아래', 'inferior'],
  ['무릎 중앙을', 'centro do joelho'],
  ['무릎', 'joelho'],
  ['중앙을', 'centro'],
  ['바꾸어', 'mudar para'],
  ['향하여', 'em direcao a'],
  ['향하고', 'em direcao a'],
  ['향해', 'em direcao a'],
  ['피하여', 'evitar'],
  ['피해야', 'deve evitar'],
  ['않도록', 'evitar'],
  ['있으므로', 'por estar presente'],
  ['있어', 'por haver'],
  ['있고', 'ha'],
  ['방지하기', 'prevenir'],
  ['위하여', 'para'],
  ['치료시에는', 'durante tratamento'],
  ['치료시는', 'durante tratamento'],
  ['치료시', 'durante tratamento'],
  ['신중히', 'com cautela'],
  ['좋다', 'adequado'],
  ['후', 'apos'],
  ['한', 'apos'],
  ['로', 'em direcao a'],
  ['를', ''],
  ['을', ''],
  ['이', ''],
  ['가', ''],
  ['은', ''],
  ['는', ''],
  ['의', 'de'],
  ['에서', 'de'],
  ['에는', 'em'],
  ['하며', 'e'],
  ['하여도', 'mesmo se'],
  ['하여', ''],
  ['한다', ''],
  ['함', ''],
  ['해', ''],
];

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/^ACUPOINT:/, '');
}

function asArray(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/[;,•]\s*/)
    .map(item => item.trim())
    .filter(Boolean);
}

function uniq(values) {
  return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
}

function cleanText(text) {
  return String(text || '')
    .replace(/APOSTILASMEDICINA@HOTMAIL\.COM.*?(?=(Local|Regi|Face|No |Na |M[eé]todo|Fun[cç]|Indica|$))/gi, '')
    .replace(/http:\/\/lista\.mercadolivre\.com\.br\/_CustId_161477952/gi, '')
    .replace(/\bc11n\b/gi, 'cun')
    .replace(/\bcu1i\b/gi, 'cun')
    .replace(/\bc1m\b/gi, 'cun')
    .replace(/\bc1111\b/gi, 'cun')
    .replace(/\bc111\b/gi, 'cun')
    .replace(/\bcw1\b/gi, 'cun')
    .replace(/\bcu11\b/gi, 'cun')
    .replace(/\bcu1\b/gi, 'cun')
    .replace(/\bli-\s*geiramente\b/gi, 'ligeiramente')
    .replace(/\bpulmo-\s*nar\b/gi, 'pulmonar')
    .replace(/\bopres-\s*sao\b/gi, 'opressao')
    .replace(/\bopres-\s*são\b/gi, 'opressão')
    .replace(/\bintercoslal\b/gi, 'intercostal')
    .replace(/\bplcurite\b/gi, 'pleurite')
    .replace(/\bJúw\b/gi, 'Jiao')
    .replace(/\bAguas\b/g, 'Águas')
    .replace(/\bhannoniza\b/gi, 'harmoniza')
    .replace(/\bProfUndo\b/g, 'Profundo')
    .replace(/\bfaiyuan\b/g, 'Taiyuan')
    .replace(/\bfianliao\b/g, 'Tianliao')
    .replace(/\bfianding\b/g, 'Tianding')
    .replace(/\bQ11ch1\b/g, 'Quchi')
    .replace(/\bQ11 c h1\b/g, 'Quchi')
    .replace(/\bYa11gx1\b/g, 'Yangxi')
    .replace(/\bYangx1\b/g, 'Yangxi')
    .replace(/\bRer1ying\b/g, 'Renying')
    .replace(/\bLieq11e\b/g, 'Lieque')
    .replace(/\bO\"ji\b/g, 'Diji')
    .replace(/\bE\.;Yo\b/g, 'Fenda')
    .replace(/\bml1sculo\b/gi, 'músculo')
    .replace(/\bml1scu lo\b/gi, 'músculo')
    .replace(/\bmús-\s*culo\b/gi, 'músculo')
    .replace(/\bmúsai lo\b/gi, 'músculo')
    .replace(/\bmõsculo\b/gi, 'músculo')
    .replace(/\bMõsculo\b/g, 'Músculo')
    .replace(/\bestemocleidomasLóideo\b/gi, 'esternocleidomastóideo')
    .replace(/\bestemocleidomastóideo\b/gi, 'esternocleidomastóideo')
    .replace(/\btircóidca\b/gi, 'tireóidea')
    .replace(/\banlerior\b/gi, 'anterior')
    .replace(/\blalerais\b/gi, 'laterais')
    .replace(/\blalerais\b/gi, 'laterais')
    .replace(/\bsiluar\b/gi, 'situar')
    .replace(/\bun1bilical\b/gi, 'umbilical')
    .replace(/\bteodíneas\b/gi, 'tendíneas')
    .replace(/\btendfnea\b/gi, 'tendínea')
    .replace(/\blendfnca\b/gi, 'tendínea')
    .replace(/\bestemal\b/gi, 'esternal')
    .replace(/\besten1oclavicular\b/gi, 'esternoclavicular')
    .replace(/\bpdbica\b/gi, 'púbica')
    .replace(/\bdtero\b/gi, 'útero')
    .replace(/\banLebraço\b/gi, 'antebraço')
    .replace(/\bdiretamenLe\b/gi, 'diretamente')
    .replace(/\blatern?lmenLe\b/gi, 'lateralmente')
    .replace(/\binLestinal\b/gi, 'intestinal')
    .replace(/\binccssanLesealucinações\b/gi, 'incessantes e alucinações')
    .replace(/[~_<>]+/g, ' ')
    .replace(/\s+-\s+/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleIsSuspect(title) {
  const value = String(title || '');
  return value.length > 130 || /APOSTILAS|Locali|Método|Fun[cç]|fai|fian|ProfUndo|forro de Líquido|F enda|Q11|c11n|cu11|1\s+1|2am|2c:m|\.{2}|\/\s*$/i.test(value);
}

function cleanTitleName(text) {
  return cleanText(text)
    .replace(/\s*[~/].*$/g, '')
    .replace(/\s+[A-Z]?\s*1\s+1.*$/gi, '')
    .replace(/\.\..*$/g, '')
    .replace(/\s+\d+\s*[a-z]?:?m.*$/gi, '')
    .replace(/\s+-\s*$/g, '')
    .trim();
}

function buildTitle(review, enriched, candidate) {
  const code = review.displayCode || review.code;
  if (TITLE_MEANING_FIXES[review.code]) {
    const pinyin = enriched?.names?.pinyin || candidate?.atlas?.pinyin || '';
    return pinyin ? `${code} (${pinyin}) - ${TITLE_MEANING_FIXES[review.code]}` : `${code} - ${TITLE_MEANING_FIXES[review.code]}`;
  }

  const names = EXTRA_NAME_PT_BR[review.code];
  if (names) {
    const [pinyin, meaning] = names;
    return pinyin ? `${code} (${pinyin}) - ${meaning}` : `${code} - ${meaning}`;
  }

  const base = cleanText(review.title);
  if (base && !titleIsSuspect(base)) return base;

  const pinyin = enriched?.names?.pinyin || candidate?.atlas?.pinyin || '';
  const atlasName = candidate?.atlas?.portugueseName && !/APOSTILAS|Locali|Método|Fun[cç]/i.test(candidate.atlas.portugueseName)
    ? cleanTitleName(candidate.atlas.portugueseName)
    : '';
  const englishName = cleanTitleName(enriched?.names?.en || '');
  const suffix = atlasName || englishName || cleanTitleName(`Ponto do meridiano ${review.meridian || review.meridianCode}`);
  return pinyin ? `${code} (${pinyin}) - ${suffix}` : `${code} - ${suffix}`;
}

function translateOrientalText(text, glossaryHits) {
  let next = String(text || '');
  for (const [source, target] of ORIENTAL_REPLACEMENTS) {
    if (next.includes(source)) {
      glossaryHits.push({ source, ptBr: target });
      next = next.split(source).join(target);
    }
  }

  next = next.replace(CJK_CLUSTER_RE, match => {
    glossaryHits.push({ source: match, ptBr: 'termo oriental ainda sem traducao segura no glossario' });
    return 'termo oriental pendente de traducao segura';
  });

  return cleanText(next)
    .replace(/em direção a\s+em direção a/gi, 'em direção a')
    .replace(/em direcao a\s+em direcao a/gi, 'em direcao a')
    .replace(/superiormente\s*em direção a/gi, 'superiormente')
    .replace(/inferiormente\s*em direção a/gi, 'inferiormente')
    .replace(/lateralmente\s*em direção a/gi, 'lateralmente')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+,/g, ',')
    .replace(/\s+\./g, '.')
    .trim();
}

function translateTarget(target) {
  return TARGET_PT[target] || target;
}

function translateRelation(relation) {
  return RELATION_PT[relation] || relation;
}

function buildActionsFromAcukg(enriched) {
  return uniq((enriched?.acukg?.actionTargets || []).slice(0, 8).map(item => {
    return `${translateRelation(item.relation)} ${translateTarget(item.target)}`;
  }));
}

function buildIndicationsFromAcukg(enriched) {
  return uniq((enriched?.acukg?.indications || []).slice(0, 18).map(item => {
    return INDICATION_PT[item.original] || item.ptBrDraft || item.original;
  }));
}

function inferPatterns(values) {
  const text = values.join(' ').toLowerCase();
  const patterns = [];
  if (/vento|wind/.test(text)) patterns.push('Vento');
  if (/calor|heat|febre|vermelhid/.test(text)) patterns.push('Calor');
  if (/umidade|damp/.test(text)) patterns.push('Umidade');
  if (/fleuma|phlegm/.test(text)) patterns.push('Fleuma');
  if (/frio|cold/.test(text)) patterns.push('Frio');
  if (/estagna|stagnation|obstru/.test(text)) patterns.push('Estagnação de Qi/Sangue');
  if (/deficien|vazio|tonifica|nutre|yin|yang|essencia|original/.test(text)) patterns.push('Deficiência');
  if (/shen|mente|espirito|ins[oô]nia|ansiedade|palpita|mania/.test(text)) patterns.push('Shen');
  if (/est[oô]mago|ba[cç]o|jiao m[eé]dio|gastr|epig[aá]str|diarre|borborig|anorexia|indigest|v[oô]mito|n[aá]usea|flatul/.test(text)) {
    patterns.push('Desarmonia Baço-Estômago/Jiao Médio');
  }
  if (/qi invertido|contrafluxo|qi rebelde|asma|dispneia|tosse|opress[aã]o tor[aá]cica|t[oó]rax|pulm[aã]o/.test(text)) {
    patterns.push('Qi em contrafluxo/Pulmão');
  }
  if (/menstr|[uú]tero|mama|mastite|lacta|hipogalact|sangramento uterino|ginecol/.test(text)) {
    patterns.push('Ginecológico/Qi e Sangue');
  }
  if (/lomb|sacr|urina|dis[uú]ria|reten[cç][aã]o urin[aá]ria|hemorroid|jiao inferior|genitais/.test(text)) {
    patterns.push('Jiao Inferior');
  }
  if (/olho|vis[aã]o|ocular|pupila|orbita|lacrimej/.test(text)) {
    patterns.push('Olhos/Fígado');
  }
  if (/nariz|nasal|rinite|sinus|epistaxe/.test(text)) {
    patterns.push('Nariz/Pulmão');
  }
  if (/joelho|tornozelo|articula|artr|bi\b|edema/.test(text)) {
    patterns.push('Síndrome Bi/Obstrução dolorosa');
  }
  return uniq(patterns);
}

function deriveCautions(review, locationText, needling) {
  const text = `${locationText} ${needling} ${review.title}`.toLowerCase();
  const cautions = asArray(review.cautions);
  if (/gestante|gesta|孕|uter|baixo ventre|hipogastr/.test(text)) {
    cautions.push('Revisar gestação e contraindicações antes de usar.');
  }
  if (/t[oó]rax|intercostal|supraclavicular|pulm|pleur|costela|subclav|clav/.test(text)) {
    cautions.push('Evitar inserção profunda em região torácica; revisar risco pleural/vascular.');
  }
  if (/olho|orbita|ocular|globo ocular|infraorbital|pupila/.test(text)) {
    cautions.push('Técnica periocular exige treinamento específico e revisão de segurança.');
  }
  if (/car[oó]tida|art[eé]ria|veia|vascular|vasos/.test(text)) {
    cautions.push('Atenção a vasos locais; ajustar profundidade e direção.');
  }
  if (/abdome|abdominal|umbigo|epigastr|hipogastr/.test(text)) {
    cautions.push('Revisar profundidade em abdome conforme biotipo, órgãos subjacentes e gestação.');
  }
  if (/lingua|sublingual|frenulo|mucosa|narina/.test(text)) {
    cautions.push('Procedimento em mucosa requer assepsia, hemostasia e indicação precisa.');
  }
  if (/sangria|sangramento/.test(text)) {
    cautions.push('Evitar sangria em anticoagulação, coagulopatias ou sangramento frequente.');
  }
  if (!cautions.length) {
    cautions.push('Sem cautela específica extraída automaticamente; manter triagem clínica, contraindicações gerais e revisão profissional.');
  }
  return uniq(cautions).slice(0, 5);
}

function visibleFieldValues(review) {
  return [
    review.title,
    review.locationText,
    review.needling,
    review.clinicalNote,
    ...asArray(review.actions),
    ...asArray(review.indications),
    ...asArray(review.cautions),
    ...asArray(review.relatedPatterns),
    ...asArray(review.techniques),
  ];
}

function getMissingFields(review) {
  return ['locationText', 'actions', 'indications', 'cautions', 'relatedPatterns', 'techniques', 'needling', 'clinicalNote']
    .filter(field => {
      const value = review[field];
      return Array.isArray(value) ? value.length === 0 : !String(value || '').trim();
    });
}

function buildOrientalNames(review, enriched, candidate) {
  const extra = EXTRA_NAME_PT_BR[review.code] || [];
  return {
    chinese: enriched?.names?.zh || candidate?.atlas?.chinese || '',
    korean: enriched?.names?.ko || '',
    pinyin: extra[0] || enriched?.names?.pinyin || candidate?.atlas?.pinyin || '',
    english: enriched?.names?.en || '',
    meaningPtBr: extra[1] || candidate?.atlas?.portugueseName || '',
  };
}

function curateReview(review, enriched, candidate) {
  const missingBefore = getMissingFields(review);
  const glossaryHits = [];
  const filledFields = [];
  const placeholderFields = [];
  const orientalNames = buildOrientalNames(review, enriched, candidate);
  const manualInputs = FIELD_CURATIONS[review.code] || null;

  let locationText = translateOrientalText(cleanText(review.locationText), glossaryHits);
  if (!locationText && EXTRA_LOCATION_PT_BR[review.code]) {
    locationText = EXTRA_LOCATION_PT_BR[review.code];
    filledFields.push('locationText:km_agent_ko_controlled_translation');
  } else if (!locationText && enriched?.location?.ptBr) {
    locationText = translateOrientalText(enriched.location.ptBr, glossaryHits);
    filledFields.push('locationText:km_agent_ptbr_draft');
  }

  let needling = translateOrientalText(cleanText(review.needling || enriched?.needling?.ptBr), glossaryHits);
  if (needling !== review.needling) filledFields.push('needling:oriental_glossary_and_ocr_cleanup');
  if (manualInputs?.needlingOverride) {
    needling = manualInputs.needlingOverride;
    filledFields.push('needling:controlled_override');
  } else if (!needling && manualInputs?.needling) {
    needling = manualInputs.needling;
    filledFields.push('needling:controlled_field_curation');
  } else if (!needling) {
    needling = 'Técnica não localizada com fonte suficiente; revisar literatura profissional antes de uso.';
    placeholderFields.push('needling');
  }

  let actions = asArray(review.actions).map(cleanText).filter(Boolean);
  if (!actions.length) {
    if (manualInputs?.actions) {
      actions = manualInputs.actions;
      filledFields.push('actions:controlled_field_curation');
    } else {
      actions = buildActionsFromAcukg(enriched);
      if (actions.length) filledFields.push('actions:acukg_suggestion');
    }
  }
  if (!actions.length) {
    actions = ['Funções/ações não confirmadas nas fontes automáticas; revisar literatura profissional antes de uso.'];
    placeholderFields.push('actions');
  }

  let indications = asArray(review.indications).map(cleanText).filter(Boolean);
  if (!indications.length) {
    if (manualInputs?.indications) {
      indications = manualInputs.indications;
      filledFields.push('indications:controlled_field_curation');
    } else {
      indications = buildIndicationsFromAcukg(enriched);
      if (indications.length) filledFields.push('indications:acukg_suggestion');
    }
  }
  if (!indications.length) {
    indications = ['Indicações não confirmadas nas fontes automáticas; preencher apenas após revisão profissional.'];
    placeholderFields.push('indications');
  }

  let relatedPatterns = uniq([
    ...asArray(review.relatedPatterns).map(cleanText).filter(Boolean),
    ...(manualInputs?.relatedPatterns || []),
    ...inferPatterns([...actions, ...indications]),
  ]).slice(0, 8);
  if (relatedPatterns.length > asArray(review.relatedPatterns).length) {
    filledFields.push('relatedPatterns:mtc_keyword_inference');
  }
  if (!relatedPatterns.length) {
    relatedPatterns = ['Padrões MTC não inferidos com segurança; definir pela anamnese e auditoria profissional.'];
    placeholderFields.push('relatedPatterns');
  }

  const techniques = asArray(review.techniques).length
    ? asArray(review.techniques)
    : ['agulha'];

  const title = buildTitle(review, enriched, candidate);
  const cautions = uniq([
    ...deriveCautions(review, locationText, needling),
    ...(manualInputs?.cautions || []),
  ]).slice(0, 6);
  const noteParts = [
    cleanText(review.clinicalNote),
    missingBefore.length ? `Curadoria profunda local: campos inicialmente faltantes/ruidosos revisados (${missingBefore.join(', ')}).` : '',
    glossaryHits.length ? 'Termos CJK/Hangul traduzidos por glossario tecnico controlado; conferir em auditoria profissional.' : '',
    'Status permanece como sugestao local; nao publicar em banco/producao sem auditoria.',
  ].filter(Boolean);

  const next = {
    ...review,
    title,
    locationText,
    actions,
    indications,
    cautions,
    relatedPatterns,
    techniques,
    needling,
    clinicalNote: uniq(noteParts).join(' '),
    orientalNames,
    requiresProfessionalAudit: true,
    curation: {
      method: 'deep_curated_local_suggestion',
      filledFields: uniq(filledFields),
      placeholderFields,
      missingFieldsBefore: missingBefore,
      missingFieldsAfter: [],
      sourceLayers: SOURCE_REFS.map(item => item.label),
      glossaryHits: uniq(glossaryHits.map(item => JSON.stringify(item))).map(item => JSON.parse(item)),
      visibleCjkRemaining: false,
    },
    enrichment: {
      ...(review.enrichment || {}),
      deepCuration: 'suggestion_local_only',
      sourcePriority: SOURCE_REFS.map(item => item.label),
      requiresProfessionalAudit: true,
    },
    updatedAt: new Date().toISOString(),
  };

  next.curation.missingFieldsAfter = getMissingFields(next);
  next.curation.visibleCjkRemaining = visibleFieldValues(next).some(value => CJK_RE.test(String(value)));
  return next;
}

function summaryMarkdown(payload) {
  return `# KM-Agent - curadoria profunda local

Gerado em: ${payload.generatedAt}

## Resultado

- Total de pontos revisados: ${payload.counts.total}
- Campos visiveis ainda com CJK/Hangul: ${payload.counts.visibleCjkRemaining}
- Pontos com localizacao preenchida por traducao controlada do KM-Agent coreano: ${payload.counts.locationFilledFromKmAgentKo}
- Pontos com tecnica limpa/traduzida por glossario oriental: ${payload.counts.needlingGlossaryCleaned}
- Acoes preenchidas por sugestao AcuKG: ${payload.counts.actionsFilledFromAcuKG}
- Indicacoes preenchidas por sugestao AcuKG: ${payload.counts.indicationsFilledFromAcuKG}
- Registros ainda com algum campo sem fonte suficiente: ${payload.counts.recordsWithMissingFieldsAfter}

## Fontes e regras

${SOURCE_REFS.map(item => `- ${item.label}${item.url ? ` (${item.url})` : ''}: ${item.role}.`).join('\n')}

## Observacao

Este arquivo e uma sugestao de curadoria local. Ele nao altera Supabase, nao publica
conteudo clinico em producao e nao substitui auditoria profissional.
`;
}

const [baseReviews, candidatesPayload, enrichedItems] = await Promise.all([
  fs.readFile(baseReviewsPath, 'utf8').then(JSON.parse),
  fs.readFile(candidatesPath, 'utf8').then(JSON.parse),
  fs.readFile(enrichedPath, 'utf8').then(JSON.parse),
]);

const candidatesByCode = new Map(candidatesPayload.candidates.map(item => [normalizeCode(item.code), item]));
const enrichedByCode = new Map(enrichedItems.map(item => [normalizeCode(item.code), item]));
const reviews = baseReviews.map(review => curateReview(
  review,
  enrichedByCode.get(normalizeCode(review.code)),
  candidatesByCode.get(normalizeCode(review.code)),
));

const counts = {
  total: reviews.length,
  visibleCjkRemaining: reviews.filter(review => review.curation.visibleCjkRemaining).length,
  locationFilledFromKmAgentKo: reviews.filter(review => review.curation.filledFields.includes('locationText:km_agent_ko_controlled_translation')).length,
  needlingGlossaryCleaned: reviews.filter(review => review.curation.filledFields.includes('needling:oriental_glossary_and_ocr_cleanup')).length,
  actionsFilledFromAcuKG: reviews.filter(review => review.curation.filledFields.includes('actions:acukg_suggestion')).length,
  indicationsFilledFromAcuKG: reviews.filter(review => review.curation.filledFields.includes('indications:acukg_suggestion')).length,
  recordsWithMissingFieldsAfter: reviews.filter(review => review.curation.missingFieldsAfter.length).length,
};

const payload = {
  schemaVersion: 'km-agent-deep-curated-reviews.v1',
  generatedAt: new Date().toISOString(),
  approvalMode: 'local_review_suggestion_only',
  requiresProfessionalAudit: true,
  sourcePriority: SOURCE_REFS,
  counts,
  reviews,
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
await fs.writeFile(summaryPath, summaryMarkdown(payload), 'utf8');

console.log(JSON.stringify({
  output: path.relative(root, outputPath),
  summary: path.relative(root, summaryPath),
  counts,
}, null, 2));
