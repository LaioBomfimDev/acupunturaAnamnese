// Categoria "Pontos comumente usados" — curadoria clínica validada com mestra em acupuntura.
// Os usuários comuns visualizam apenas estes pontos no Protocolo e na Biblioteca;
// a biblioteca completa permanece editável no SuperAdm. Nada é excluído, apenas separado.
// O campo `map` indica o grupo anatômico canônico dos mapas visuais.
// A ordem dos blocos preserva a tabela clínica original; use `map` para exibição/agrupamento.

import { normalizePointCode } from './aliases';

export const COMMONLY_USED_CATEGORY = 'ponto_comumente_usado';
export const COMMONLY_USED_CATEGORY_LABEL = 'Pontos comumente usados';

export const commonlyUsedPoints = [
  // ── Torso e cabeça - frente ─────────────────────────────────────────────
  { id: 1, map: 'Torso e cabeça - frente', code: 'GV20', displayCode: 'VG20', name: 'Baihui', mainUse: 'Ansiedade, depressão, cognição, cefaleia, neuro', clinicalCategories: ['emocional', 'neuro', 'cefaleia'] },
  { id: 2, map: 'Torso e cabeça - frente', code: 'GV24', displayCode: 'VG24', name: 'Shenting', mainUse: 'Ansiedade, insônia, agitação mental, atenção', clinicalCategories: ['emocional', 'sono', 'neuro'] },
  { id: 3, map: 'Torso e cabeça - frente', code: 'EX-HN3', displayCode: 'EX-HN3', name: 'Yintang', mainUse: 'Ansiedade, estresse, rinite, cefaleia frontal', clinicalCategories: ['emocional', 'respiratório', 'cefaleia'] },
  { id: 4, map: 'Torso e cabeça - frente', code: 'EX-HN5', displayCode: 'EX-HN5', name: 'Taiyang', mainUse: 'Enxaqueca, cefaleia temporal, tensão ocular', clinicalCategories: ['dor', 'cefaleia', 'ocular'] },
  { id: 5, map: 'Torso e cabeça - frente', code: 'GB13', displayCode: 'VB13', name: 'Benshen', mainUse: 'Ansiedade, medo, cognição, estabilização mental', clinicalCategories: ['emocional', 'neuro'] },
  { id: 6, map: 'Torso e cabeça - frente', code: 'GB15', displayCode: 'VB15', name: 'Toulinqi', mainUse: 'Cefaleia frontal, olhos, tontura', clinicalCategories: ['cefaleia', 'neuro', 'ocular'] },
  { id: 7, map: 'Torso e cabeça - frente', code: 'GB8', displayCode: 'VB8', name: 'Shuaigu', mainUse: 'Enxaqueca temporal, dor lateral da cabeça', clinicalCategories: ['dor', 'cefaleia'] },
  { id: 8, map: 'Torso e cabeça - frente', code: 'LI20', displayCode: 'IG20', name: 'Yingxiang', mainUse: 'Rinite, congestão nasal, sinusite', clinicalCategories: ['respiratório', 'alergias'] },
  { id: 9, map: 'Torso e cabeça - frente', code: 'ST2', displayCode: 'E2', name: 'Sibai', mainUse: 'Sinusite, dor facial, olhos', clinicalCategories: ['respiratório', 'dor facial', 'ocular'] },
  { id: 10, map: 'Torso e cabeça - frente', code: 'ST3', displayCode: 'E3', name: 'Juliao', mainUse: 'Sinusite, face, maxilar', clinicalCategories: ['respiratório', 'dor facial'] },
  { id: 11, map: 'Torso e cabeça - frente', code: 'ST6', displayCode: 'E6', name: 'Jiache', mainUse: 'ATM, bruxismo, dor mandibular', clinicalCategories: ['dor', 'orofacial'] },
  { id: 12, map: 'Torso e cabeça - frente', code: 'ST7', displayCode: 'E7', name: 'Xiaguan', mainUse: 'ATM, neuralgia facial, dor orofacial', clinicalCategories: ['dor', 'orofacial', 'neuro'] },
  { id: 13, map: 'Torso e cabeça - frente', code: 'SI18', displayCode: 'ID18', name: 'Quanliao', mainUse: 'Dor facial, neuralgia, região zigomática', clinicalCategories: ['dor', 'orofacial', 'neuro'] },
  { id: 14, map: 'Torso e cabeça - frente', code: 'CV17', displayCode: 'VC17', name: 'Shanzhong', mainUse: 'Ansiedade torácica, tristeza, respiração curta', clinicalCategories: ['emocional', 'respiratório', 'tórax'] },
  { id: 15, map: 'Torso e cabeça - frente', code: 'CV22', displayCode: 'VC22', name: 'Tiantu', mainUse: 'Tosse, garganta, asma, disfagia', clinicalCategories: ['respiratório', 'garganta', 'neuro'] },
  { id: 16, map: 'Torso e cabeça - frente', code: 'CV23', displayCode: 'VC23', name: 'Lianquan', mainUse: 'Fala, deglutição, garganta', clinicalCategories: ['neuro', 'garganta'] },
  { id: 17, map: 'Torso e cabeça - frente', code: 'LU1', displayCode: 'P1', name: 'Zhongfu', mainUse: 'Tosse, opressão torácica, Pulmão', clinicalCategories: ['respiratório', 'tórax'] },
  { id: 18, map: 'Torso e cabeça - frente', code: 'KI27', displayCode: 'R27', name: 'Shufu', mainUse: 'Asma, respiração, ansiedade torácica', clinicalCategories: ['respiratório', 'emocional', 'tórax'] },
  { id: 19, map: 'Torso e cabeça - frente', code: 'CV12', displayCode: 'VC12', name: 'Zhongwan', mainUse: 'Estômago, refluxo, dispepsia, náusea', clinicalCategories: ['gástrico', 'digestivo'] },
  { id: 20, map: 'Torso e cabeça - frente', code: 'CV10', displayCode: 'VC10', name: 'Xiawan', mainUse: 'Digestão lenta, plenitude gástrica', clinicalCategories: ['gástrico', 'digestivo'] },
  { id: 21, map: 'Torso e cabeça - frente', code: 'CV13', displayCode: 'VC13', name: 'Shangwan', mainUse: 'Refluxo, náusea, epigastralgia', clinicalCategories: ['gástrico', 'digestivo'] },
  { id: 22, map: 'Torso e cabeça - frente', code: 'CV14', displayCode: 'VC14', name: 'Juque', mainUse: 'Ansiedade epigástrica, aperto emocional', clinicalCategories: ['emocional', 'gástrico'] },
  { id: 23, map: 'Torso e cabeça - frente', code: 'CV15', displayCode: 'VC15', name: 'Jiuwei', mainUse: 'Ansiedade, náusea, opressão epigástrica', clinicalCategories: ['emocional', 'gástrico'] },
  { id: 24, map: 'Torso e cabeça - frente', code: 'CV6', displayCode: 'VC6', name: 'Qihai', mainUse: 'Fadiga, Qi, ginecológico, dor abdominal', clinicalCategories: ['ginecológico', 'digestivo', 'fadiga'] },
  { id: 25, map: 'Torso e cabeça - frente', code: 'CV4', displayCode: 'VC4', name: 'Guanyuan', mainUse: 'Útero, fertilidade, cólica, vitalidade', clinicalCategories: ['ginecológico', 'dor', 'fadiga'] },
  { id: 26, map: 'Torso e cabeça - frente', code: 'CV3', displayCode: 'VC3', name: 'Zhongji', mainUse: 'Dor pélvica, bexiga, útero, dismenorreia', clinicalCategories: ['ginecológico', 'urinário', 'dor pélvica'] },

  // ── Torso e cabeça - costas ─────────────────────────────────────────────
  { id: 27, map: 'Torso e cabeça - costas', code: 'GV14', displayCode: 'VG14', name: 'Dazhui', mainUse: 'Imunidade, febre, cervical, Yang', clinicalCategories: ['respiratório', 'imunológico', 'dor'] },
  { id: 28, map: 'Torso e cabeça - costas', code: 'GV16', displayCode: 'VG16', name: 'Fengfu', mainUse: 'Neurológico, occipital, tontura', clinicalCategories: ['neuro', 'cefaleia', 'cervical'] },
  { id: 29, map: 'Torso e cabeça - costas', code: 'GV12', displayCode: 'VG12', name: 'Shenzhu', mainUse: 'Pulmão, imunidade, região torácica', clinicalCategories: ['respiratório', 'imunológico'] },
  { id: 30, map: 'Torso e cabeça - costas', code: 'GV4', displayCode: 'VG4', name: 'Mingmen', mainUse: 'Lombar, Rim Yang, vitalidade', clinicalCategories: ['dor lombar', 'fadiga', 'ginecológico'] },
  { id: 31, map: 'Torso e cabeça - costas', code: 'BL10', displayCode: 'B10', name: 'Tianzhu', mainUse: 'Cervicalgia, cefaleia occipital', clinicalCategories: ['dor', 'cefaleia', 'cervical'] },
  { id: 32, map: 'Torso e cabeça - costas', code: 'GB20', displayCode: 'VB20', name: 'Fengchi', mainUse: 'Enxaqueca, cervicalgia, tontura, estresse', clinicalCategories: ['dor', 'cefaleia', 'emocional'] },
  { id: 33, map: 'Torso e cabeça - costas', code: 'GB21', displayCode: 'VB21', name: 'Jianjing', mainUse: 'Trapézio, ombro, tensão cervical', clinicalCategories: ['dor', 'ombro', 'cervical'] },
  { id: 34, map: 'Torso e cabeça - costas', code: 'BL11', displayCode: 'B11', name: 'Dashu', mainUse: 'Ossos, coluna, dor dorsal', clinicalCategories: ['dor', 'coluna', 'ortopédico'] },
  { id: 35, map: 'Torso e cabeça - costas', code: 'BL12', displayCode: 'B12', name: 'Fengmen', mainUse: 'Resfriado, imunidade, vento, Pulmão', clinicalCategories: ['respiratório', 'imunológico'] },
  { id: 36, map: 'Torso e cabeça - costas', code: 'BL13', displayCode: 'B13', name: 'Feishu', mainUse: 'Tosse, asma, Pulmão, alergias respiratórias', clinicalCategories: ['respiratório', 'alergias'] },
  { id: 37, map: 'Torso e cabeça - costas', code: 'BL15', displayCode: 'B15', name: 'Xinshu', mainUse: 'Ansiedade, palpitação, insônia', clinicalCategories: ['emocional', 'sono', 'cardíaco'] },
  { id: 38, map: 'Torso e cabeça - costas', code: 'BL17', displayCode: 'B17', name: 'Geshu', mainUse: 'Sangue, estase, pele, dor crônica', clinicalCategories: ['dor', 'dermatológico', 'circulação'] },
  { id: 39, map: 'Torso e cabeça - costas', code: 'BL18', displayCode: 'B18', name: 'Ganshu', mainUse: 'Estresse, irritabilidade, Fígado', clinicalCategories: ['emocional', 'ginecológico', 'digestivo'] },
  { id: 40, map: 'Torso e cabeça - costas', code: 'BL20', displayCode: 'B20', name: 'Pishu', mainUse: 'Fadiga, digestão, ruminação, Baço', clinicalCategories: ['digestivo', 'emocional', 'fadiga'] },
  { id: 41, map: 'Torso e cabeça - costas', code: 'BL21', displayCode: 'B21', name: 'Weishu', mainUse: 'Estômago, refluxo, epigastralgia', clinicalCategories: ['gástrico', 'digestivo'] },
  { id: 42, map: 'Torso e cabeça - costas', code: 'BL22', displayCode: 'B22', name: 'Sanjiaoshu', mainUse: 'Líquidos, metabolismo, edema', clinicalCategories: ['metabólico', 'digestivo', 'urinário'] },
  { id: 43, map: 'Torso e cabeça - costas', code: 'BL23', displayCode: 'B23', name: 'Shenshu', mainUse: 'Lombalgia, Rim, medo, exaustão', clinicalCategories: ['dor lombar', 'emocional', 'fadiga'] },
  { id: 44, map: 'Torso e cabeça - costas', code: 'BL24', displayCode: 'B24', name: 'Qihaishu', mainUse: 'Lombar, Qi, abdome inferior', clinicalCategories: ['dor lombar', 'digestivo'] },
  { id: 45, map: 'Torso e cabeça - costas', code: 'BL25', displayCode: 'B25', name: 'Dachangshu', mainUse: 'Lombalgia, intestino grosso, constipação', clinicalCategories: ['dor lombar', 'intestinal'] },
  { id: 46, map: 'Torso e cabeça - costas', code: 'BL26', displayCode: 'B26', name: 'Guanyuanshu', mainUse: 'Lombossacra, sacroilíaca, dor pélvica', clinicalCategories: ['dor lombar', 'dor pélvica'] },
  { id: 47, map: 'Torso e cabeça - costas', code: 'BL27', displayCode: 'B27', name: 'Xiaochangshu', mainUse: 'Intestino delgado, dor abdominal', clinicalCategories: ['digestivo', 'intestinal'] },
  { id: 48, map: 'Torso e cabeça - costas', code: 'BL28', displayCode: 'B28', name: 'Pangguangshu', mainUse: 'Bexiga, lombossacro, líquidos', clinicalCategories: ['urinário', 'dor lombar'] },
  { id: 49, map: 'Torso e cabeça - costas', code: 'BL31', displayCode: 'B31', name: 'Shangliao', mainUse: 'Dor pélvica, ginecológico, sacral', clinicalCategories: ['ginecológico', 'dor pélvica'] },
  { id: 50, map: 'Torso e cabeça - costas', code: 'BL32', displayCode: 'B32', name: 'Ciliao', mainUse: 'Dismenorreia, dor pélvica, útero', clinicalCategories: ['ginecológico', 'dor pélvica'] },
  { id: 51, map: 'Torso e cabeça - costas', code: 'BL33', displayCode: 'B33', name: 'Zhongliao', mainUse: 'Pélvico, bexiga, ginecológico', clinicalCategories: ['ginecológico', 'urinário', 'dor pélvica'] },
  { id: 52, map: 'Torso e cabeça - costas', code: 'BL34', displayCode: 'B34', name: 'Xialiao', mainUse: 'Cólica, sacro, dor lombopélvica', clinicalCategories: ['ginecológico', 'dor'] },

  // ── Pernas - frente ─────────────────────────────────────────────────────
  { id: 53, map: 'Torso e cabeça - frente', code: 'ST30', displayCode: 'E30', name: 'Qichong', mainUse: 'Inguinal, útero, fertilidade', clinicalCategories: ['ginecológico', 'pélvico'] },
  { id: 54, map: 'Torso e cabeça - frente', code: 'ST29', displayCode: 'E29', name: 'Guilai', mainUse: 'Dismenorreia, frio no útero, dor pélvica', clinicalCategories: ['ginecológico', 'dor pélvica'] },
  { id: 55, map: 'Torso e cabeça - frente', code: 'ST28', displayCode: 'E28', name: 'Shuidao', mainUse: 'Edema, bexiga, pélvico', clinicalCategories: ['urinário', 'ginecológico', 'edema'] },
  { id: 56, map: 'Torso e cabeça - frente', code: 'ST25', displayCode: 'E25', name: 'Tianshu', mainUse: 'Intestino, constipação, diarreia, abdome', clinicalCategories: ['digestivo', 'intestinal'] },
  { id: 57, map: 'Torso e cabeça - frente', code: 'ST21', displayCode: 'E21', name: 'Liangmen', mainUse: 'Epigastralgia, digestão lenta', clinicalCategories: ['gástrico', 'digestivo'] },
  { id: 58, map: 'Pernas - frente', code: 'ST34', displayCode: 'E34', name: 'Liangqiu', mainUse: 'Dor aguda no joelho, estômago', clinicalCategories: ['dor', 'joelho', 'gástrico'] },
  { id: 59, map: 'Pernas - frente', code: 'ST35', displayCode: 'E35', name: 'Dubi', mainUse: 'Joelho, osteoartrite, dor patelar', clinicalCategories: ['dor', 'joelho', 'ortopédico'] },
  { id: 60, map: 'Pernas - frente', code: 'ST36', displayCode: 'E36', name: 'Zusanli', mainUse: 'Imunidade, fadiga, digestão, neuro', clinicalCategories: ['digestivo', 'fadiga', 'neuro', 'imunológico'] },
  { id: 61, map: 'Pernas - frente', code: 'ST37', displayCode: 'E37', name: 'Shangjuxu', mainUse: 'Intestino grosso, constipação, diarreia', clinicalCategories: ['intestinal', 'digestivo'] },
  { id: 62, map: 'Pernas - frente', code: 'ST39', displayCode: 'E39', name: 'Xiajuxu', mainUse: 'Intestino delgado, dor abdominal', clinicalCategories: ['intestinal', 'digestivo'] },
  { id: 63, map: 'Pernas - frente', code: 'ST40', displayCode: 'E40', name: 'Fenglong', mainUse: 'Fleuma, metabolismo, ruminação, tontura', clinicalCategories: ['metabólico', 'emocional', 'neuro'] },
  { id: 64, map: 'Pernas - frente', code: 'SP6', displayCode: 'BP6', name: 'Sanyinjiao', mainUse: 'Ginecológico, ansiedade, sono, digestivo', clinicalCategories: ['ginecológico', 'emocional', 'sono', 'digestivo'] },
  { id: 65, map: 'Pernas - frente', code: 'SP8', displayCode: 'BP8', name: 'Diji', mainUse: 'Cólica menstrual, dor aguda, sangue', clinicalCategories: ['ginecológico', 'dor'] },
  { id: 66, map: 'Pernas - frente', code: 'SP9', displayCode: 'BP9', name: 'Yinlingquan', mainUse: 'Umidade, edema, metabolismo', clinicalCategories: ['metabólico', 'digestivo', 'edema'] },
  { id: 67, map: 'Pernas - frente', code: 'SP10', displayCode: 'BP10', name: 'Xuehai', mainUse: 'Sangue, pele, estase, ginecológico', clinicalCategories: ['dermatológico', 'ginecológico', 'circulação'] },
  { id: 68, map: 'Pernas - frente', code: 'LR8', displayCode: 'F8', name: 'Ququan', mainUse: 'Útero, Sangue do Fígado, tendões', clinicalCategories: ['ginecológico', 'ortopédico'] },
  { id: 69, map: 'Pernas - frente', code: 'KI7', displayCode: 'R7', name: 'Fuliu', mainUse: 'Sudorese, menopausa, edema', clinicalCategories: ['ginecológico', 'climatério', 'edema'] },
  { id: 70, map: 'Pernas - frente', code: 'GB34', displayCode: 'VB34', name: 'Yanglingquan', mainUse: 'Tendões, espasticidade, joelho, irritabilidade', clinicalCategories: ['dor', 'neuro', 'emocional'] },
  { id: 71, map: 'Pernas - frente', code: 'GB39', displayCode: 'VB39', name: 'Xuanzhong', mainUse: 'Ossos, medula, cervical, dor crônica', clinicalCategories: ['dor', 'neuro', 'ortopédico'] },
  { id: 72, map: 'Mãos e punhos - dorso', code: 'LI10', displayCode: 'IG10', name: 'Shousanli', mainUse: 'Tônus, dor em membro superior, fortalecimento', clinicalCategories: ['dor', 'neuro', 'ortopédico'] },

  // ── Pernas - costas ─────────────────────────────────────────────────────
  { id: 73, map: 'Pernas - costas', code: 'BL36', displayCode: 'B36', name: 'Chengfu', mainUse: 'Ciatalgia, posterior de coxa, lombar', clinicalCategories: ['dor', 'ciática', 'lombar'] },
  { id: 74, map: 'Pernas - costas', code: 'BL37', displayCode: 'B37', name: 'Yinmen', mainUse: 'Ciatalgia, dor posterior de coxa', clinicalCategories: ['dor', 'ciática'] },
  { id: 75, map: 'Pernas - costas', code: 'BL40', displayCode: 'B40', name: 'Weizhong', mainUse: 'Lombalgia, ciática, dor posterior de joelho', clinicalCategories: ['dor', 'lombar', 'ciática'] },
  { id: 76, map: 'Pernas - costas', code: 'BL57', displayCode: 'B57', name: 'Chengshan', mainUse: 'Panturrilha, câimbra, hemorroida', clinicalCategories: ['dor', 'vascular', 'intestinal'] },
  { id: 77, map: 'Pernas - costas', code: 'BL58', displayCode: 'B58', name: 'Feiyang', mainUse: 'Lombar, ciática, tornozelo', clinicalCategories: ['dor', 'lombar', 'ciática'] },
  { id: 78, map: 'Pernas - costas', code: 'BL60', displayCode: 'B60', name: 'Kunlun', mainUse: 'Lombar, ciática, tornozelo', clinicalCategories: ['dor', 'lombar', 'ciática'] },
  { id: 79, map: 'Pernas - costas', code: 'BL62', displayCode: 'B62', name: 'Shenmai', mainUse: 'Sono, coluna, neuro, Yang Qiao Mai', clinicalCategories: ['sono', 'neuro', 'dor'] },
  { id: 80, map: 'Torso e cabeça - costas', code: 'BL54', displayCode: 'B54', name: 'Zhibian', mainUse: 'Quadril, ciática, dor pélvica', clinicalCategories: ['dor', 'ciática', 'pélvico'] },
  { id: 81, map: 'Pernas - costas', code: 'GB30', displayCode: 'VB30', name: 'Huantiao', mainUse: 'Ciatalgia, quadril, lombociatalgia', clinicalCategories: ['dor', 'ciática', 'quadril'] },
  { id: 82, map: 'Pernas - frente', code: 'GB31', displayCode: 'VB31', name: 'Fengshi', mainUse: 'Coxa lateral, prurido, dor muscular', clinicalCategories: ['dor', 'dermatológico'] },
  { id: 83, map: 'Pernas - frente', code: 'GB33', displayCode: 'VB33', name: 'Xiyangguan', mainUse: 'Joelho lateral, tendões', clinicalCategories: ['dor', 'joelho', 'ortopédico'] },
  { id: 84, map: 'Pernas - costas', code: 'BL56', displayCode: 'B56', name: 'Chengjin', mainUse: 'Panturrilha, tensão muscular', clinicalCategories: ['dor', 'muscular'] },
  { id: 85, map: 'Pernas - costas', code: 'BL59', displayCode: 'B59', name: 'Fuyang', mainUse: 'Lombar, tornozelo, dor posterior', clinicalCategories: ['dor', 'lombar', 'ortopédico'] },
  { id: 86, map: 'Pés - dorso', code: 'BL67', displayCode: 'B67', name: 'Zhiyin', mainUse: 'Cefaleia, olhos, obstetrícia com cautela', clinicalCategories: ['cefaleia', 'ocular', 'ginecológico'] },

  // ── Mãos e punhos - palma ───────────────────────────────────────────────
  { id: 87, map: 'Mãos e punhos - palma', code: 'PC6', displayCode: 'PC6', name: 'Neiguan', mainUse: 'Ansiedade, náusea, tórax, regulação vagal', clinicalCategories: ['emocional', 'gástrico', 'neurovegetativo'] },
  { id: 88, map: 'Mãos e punhos - palma', code: 'PC7', displayCode: 'PC7', name: 'Daling', mainUse: 'Ansiedade, túnel do carpo, inquietação', clinicalCategories: ['emocional', 'dor', 'punho'] },
  { id: 89, map: 'Mãos e punhos - palma', code: 'PC8', displayCode: 'PC8', name: 'Laogong', mainUse: 'Agitação, calor interno, ansiedade', clinicalCategories: ['emocional', 'calor'] },
  { id: 90, map: 'Mãos e punhos - palma', code: 'PC9', displayCode: 'PC9', name: 'Zhongchong', mainUse: 'Emergência, calor, agitação intensa', clinicalCategories: ['emergência', 'emocional', 'calor'] },
  { id: 91, map: 'Mãos e punhos - palma', code: 'HT7', displayCode: 'C7', name: 'Shenmen', mainUse: 'Ansiedade, insônia, palpitação', clinicalCategories: ['emocional', 'sono', 'cardíaco'] },
  { id: 92, map: 'Mãos e punhos - palma', code: 'HT5', displayCode: 'C5', name: 'Tongli', mainUse: 'Fala, palpitação, ansiedade', clinicalCategories: ['emocional', 'neuro', 'cardíaco'] },
  { id: 93, map: 'Mãos e punhos - palma', code: 'HT6', displayCode: 'C6', name: 'Yinxi', mainUse: 'Sudorese noturna, ansiedade, insônia', clinicalCategories: ['emocional', 'sono', 'climatério'] },
  { id: 94, map: 'Mãos e punhos - palma', code: 'HT8', displayCode: 'C8', name: 'Shaofu', mainUse: 'Agitação, calor, ansiedade', clinicalCategories: ['emocional', 'calor'] },
  { id: 95, map: 'Mãos e punhos - palma', code: 'LU9', displayCode: 'P9', name: 'Taiyuan', mainUse: 'Pulmão, tosse crônica, deficiência', clinicalCategories: ['respiratório', 'fadiga'] },
  { id: 96, map: 'Mãos e punhos - palma', code: 'LU10', displayCode: 'P10', name: 'Yuji', mainUse: 'Garganta, tosse, calor no Pulmão', clinicalCategories: ['respiratório', 'garganta'] },
  { id: 97, map: 'Mãos e punhos - palma', code: 'LU11', displayCode: 'P11', name: 'Shaoshang', mainUse: 'Garganta, emergência, calor', clinicalCategories: ['respiratório', 'garganta', 'emergência'] },
  { id: 98, map: 'Mãos e punhos - dorso', code: 'SI3', displayCode: 'ID3', name: 'Houxi', mainUse: 'Coluna, cervical, occipital, Du Mai', clinicalCategories: ['dor', 'coluna', 'cefaleia'] },
  { id: 99, map: 'Pés - planta', code: 'SP4', displayCode: 'BP4', name: 'Gongsun', mainUse: 'Digestivo, ginecológico, Chong Mai', clinicalCategories: ['digestivo', 'ginecológico'] },

  // ── Mãos e punhos - dorso ───────────────────────────────────────────────
  { id: 100, map: 'Mãos e punhos - dorso', code: 'LI4', displayCode: 'IG4', name: 'Hegu', mainUse: 'Analgesia geral, face, cabeça, dor aguda', clinicalCategories: ['dor', 'cefaleia', 'orofacial'] },
  { id: 101, map: 'Mãos e punhos - dorso', code: 'LI5', displayCode: 'IG5', name: 'Yangxi', mainUse: 'Punho, dor radial, garganta', clinicalCategories: ['dor', 'punho', 'respiratório'] },
  { id: 102, map: 'Torso e cabeça - frente', code: 'LI11', displayCode: 'IG11', name: 'Quchi', mainUse: 'Dor, inflamação, calor, imunidade', clinicalCategories: ['dor', 'inflamação', 'imunológico'] },
  { id: 103, map: 'Torso e cabeça - frente', code: 'LI14', displayCode: 'IG14', name: 'Binao', mainUse: 'Braço, ombro, dor muscular', clinicalCategories: ['dor', 'ombro', 'ortopédico'] },
  { id: 104, map: 'Torso e cabeça - frente', code: 'LI15', displayCode: 'IG15', name: 'Jianyu', mainUse: 'Ombro, capsulite, limitação de ADM', clinicalCategories: ['dor', 'ombro', 'ortopédico'] },
  { id: 105, map: 'Torso e cabeça - frente', code: 'LI16', displayCode: 'IG16', name: 'Jugu', mainUse: 'Ombro, cervical, escápula', clinicalCategories: ['dor', 'ombro', 'cervical'] },
  { id: 106, map: 'Mãos e punhos - dorso', code: 'TE3', displayCode: 'TA3', name: 'Zhongzhu', mainUse: 'Cefaleia temporal, ouvido, mão', clinicalCategories: ['cefaleia', 'otológico', 'dor'] },
  { id: 107, map: 'Mãos e punhos - dorso', code: 'TE5', displayCode: 'TA5', name: 'Waiguan', mainUse: 'Dor lateral, cervical, temporal', clinicalCategories: ['dor', 'cefaleia', 'cervical'] },
  { id: 108, map: 'Torso e cabeça - costas', code: 'TE14', displayCode: 'TA14', name: 'Jianliao', mainUse: 'Ombro, articulação glenoumeral', clinicalCategories: ['dor', 'ombro', 'ortopédico'] },
  { id: 109, map: 'Torso e cabeça - frente', code: 'TE17', displayCode: 'TA17', name: 'Yifeng', mainUse: 'ATM, ouvido, dor facial', clinicalCategories: ['orofacial', 'otológico', 'dor'] },
  { id: 110, map: 'Torso e cabeça - costas', code: 'SI9', displayCode: 'ID9', name: 'Jianzhen', mainUse: 'Ombro posterior, escápula', clinicalCategories: ['dor', 'ombro', 'escápula'] },
  { id: 111, map: 'Torso e cabeça - costas', code: 'SI10', displayCode: 'ID10', name: 'Naoshu', mainUse: 'Ombro, escápula, dor irradiada', clinicalCategories: ['dor', 'ombro', 'escápula'] },
  { id: 112, map: 'Torso e cabeça - costas', code: 'SI11', displayCode: 'ID11', name: 'Tianzong', mainUse: 'Dor escapular, tensão dorsal', clinicalCategories: ['dor', 'escápula', 'dorsal'] },
  { id: 113, map: 'Mãos e punhos - palma', code: 'LU7', displayCode: 'P7', name: 'Lieque', mainUse: 'Tosse, rinite, garganta, Wei Qi', clinicalCategories: ['respiratório', 'imunológico', 'garganta'] },

  // ── Pé - dorso ──────────────────────────────────────────────────────────
  { id: 114, map: 'Pés - dorso', code: 'LR3', displayCode: 'F3', name: 'Taichong', mainUse: 'Estresse, irritabilidade, dor, cefaleia', clinicalCategories: ['emocional', 'dor', 'cefaleia'] },
  { id: 115, map: 'Pés - dorso', code: 'LR2', displayCode: 'F2', name: 'Xingjian', mainUse: 'Raiva, calor do Fígado, cefaleia', clinicalCategories: ['emocional', 'cefaleia', 'calor'] },
  { id: 116, map: 'Pernas - frente', code: 'LR5', displayCode: 'F5', name: 'Ligou', mainUse: 'Genital, prurido, umidade-calor', clinicalCategories: ['ginecológico', 'dermatológico'] },
  { id: 117, map: 'Pés - dorso', code: 'ST41', displayCode: 'E41', name: 'Jiexi', mainUse: 'Tornozelo, digestivo, agitação', clinicalCategories: ['dor', 'digestivo', 'emocional'] },
  { id: 118, map: 'Pés - dorso', code: 'ST44', displayCode: 'E44', name: 'Neiting', mainUse: 'Calor no Estômago, refluxo, halitose', clinicalCategories: ['gástrico', 'digestivo'] },
  { id: 119, map: 'Pés - dorso', code: 'ST45', displayCode: 'E45', name: 'Lidui', mainUse: 'Estômago, calor, fome excessiva', clinicalCategories: ['gástrico', 'metabólico'] },
  { id: 120, map: 'Pés - dorso', code: 'GB40', displayCode: 'VB40', name: 'Qiuxu', mainUse: 'Tornozelo, vesícula, decisão, dor lateral', clinicalCategories: ['dor', 'ortopédico', 'emocional'] },
  { id: 121, map: 'Pés - dorso', code: 'GB41', displayCode: 'VB41', name: 'Zulinqi', mainUse: 'Cefaleia lateral, TPM, Dai Mai', clinicalCategories: ['cefaleia', 'ginecológico'] },
  { id: 122, map: 'Pés - dorso', code: 'KI3', displayCode: 'R3', name: 'Taixi', mainUse: 'Rim, medo, fadiga, lombar', clinicalCategories: ['emocional', 'fadiga', 'dor lombar'] },
  { id: 123, map: 'Pés - dorso', code: 'KI6', displayCode: 'R6', name: 'Zhaohai', mainUse: 'Insônia, ansiedade, Yin, garganta', clinicalCategories: ['sono', 'emocional', 'garganta'] },

  // ── Pé - planta ─────────────────────────────────────────────────────────
  { id: 124, map: 'Pés - planta', code: 'KI1', displayCode: 'R1', name: 'Yongquan', mainUse: 'Aterramento, ansiedade intensa, excesso na cabeça', clinicalCategories: ['emocional', 'neuro', 'crise'] },
  { id: 125, map: 'Pés - planta', code: 'KI2', displayCode: 'R2', name: 'Rangu', mainUse: 'Calor vazio, insônia, menopausa', clinicalCategories: ['climatério', 'sono', 'calor'] },
  { id: 126, map: 'Pés - planta', code: 'SP1', displayCode: 'BP1', name: 'Yinbai', mainUse: 'Sangramentos, ginecológico, Baço', clinicalCategories: ['ginecológico', 'digestivo'] },

  // ── Orelha - lateral (auriculoterapia) ──────────────────────────────────
  { id: 127, map: 'Orelha - lateral', auricularSlug: 'shen-men', name: 'Shen Men', mainUse: 'Ansiedade, dor, sono, modulação central', clinicalCategories: ['emocional', 'dor', 'sono'] },
  { id: 128, map: 'Orelha - lateral', auricularSlug: 'subcortex', name: 'Subcórtex', mainUse: 'Dor crônica, sono, regulação neurovegetativa', clinicalCategories: ['neuro', 'dor', 'sono'] },
  { id: 129, map: 'Orelha - lateral', auricularSlug: 'simpatico', name: 'Simpático', mainUse: 'Dor, sistema autonômico, espasmos', clinicalCategories: ['neurovegetativo', 'dor'] },
  { id: 130, map: 'Orelha - lateral', auricularSlug: 'rim', name: 'Rim', mainUse: 'Medo, exaustão, lombar, vitalidade', clinicalCategories: ['emocional', 'fadiga', 'dor lombar'] },
  { id: 131, map: 'Orelha - lateral', auricularSlug: 'figado', name: 'Fígado', mainUse: 'Estresse, irritabilidade, tensão muscular', clinicalCategories: ['emocional', 'dor', 'ginecológico'] },
  { id: 132, map: 'Orelha - lateral', auricularSlug: 'coracao', name: 'Coração', mainUse: 'Ansiedade, palpitação, sono', clinicalCategories: ['emocional', 'sono', 'cardíaco'] },
  { id: 133, map: 'Orelha - lateral', auricularSlug: 'pulmao', name: 'Pulmão', mainUse: 'Respiração, tristeza, pele, tabagismo', clinicalCategories: ['respiratório', 'emocional', 'dermatológico'] },
  { id: 134, map: 'Orelha - lateral', auricularSlug: 'baco', name: 'Baço', mainUse: 'Ruminação, fadiga, umidade, digestão', clinicalCategories: ['digestivo', 'emocional', 'fadiga'] },
  { id: 135, map: 'Orelha - lateral', auricularSlug: 'estomago', name: 'Estômago', mainUse: 'Náusea, compulsão, gastralgia', clinicalCategories: ['gástrico', 'metabólico'] },
  { id: 136, map: 'Orelha - lateral', auricularSlug: 'intestino-grosso', name: 'Intestino Grosso', mainUse: 'Constipação, diarreia, cólon', clinicalCategories: ['intestinal', 'digestivo'] },
  { id: 137, map: 'Orelha - lateral', auricularSlug: 'intestino-delgado', name: 'Intestino Delgado', mainUse: 'Digestão, dor abdominal, absorção', clinicalCategories: ['intestinal', 'digestivo'] },
  { id: 138, map: 'Orelha - lateral', auricularSlug: 'endocrino', name: 'Endócrino', mainUse: 'Hormonal, ginecológico, menopausa', clinicalCategories: ['endócrino', 'ginecológico', 'climatério'] },
  { id: 139, map: 'Orelha - lateral', auricularSlug: 'utero', name: 'Útero', mainUse: 'Cólica, ciclo menstrual, pélvico', clinicalCategories: ['ginecológico', 'dor pélvica'] },
  { id: 140, map: 'Orelha - lateral', auricularSlug: 'ovario', name: 'Ovário', mainUse: 'Ciclo, fertilidade, climatério', clinicalCategories: ['ginecológico', 'climatério'] },
  { id: 141, map: 'Orelha - lateral', auricularSlug: 'ansiedade', name: 'Ansiedade', mainUse: 'Crise ansiosa, inquietação, tensão', clinicalCategories: ['emocional', 'crise'] },
  { id: 142, map: 'Orelha - lateral', auricularSlug: 'depressao', name: 'Depressão', mainUse: 'Humor deprimido, apatia, tristeza', clinicalCategories: ['emocional', 'depressão'] },
  { id: 143, map: 'Orelha - lateral', auricularSlug: 'insonia', name: 'Insônia', mainUse: 'Dificuldade de iniciar ou manter sono', clinicalCategories: ['sono', 'emocional'] },
  { id: 144, map: 'Orelha - lateral', auricularSlug: 'occipital', name: 'Occipital', mainUse: 'Cefaleia, cervicalgia, sono', clinicalCategories: ['cefaleia', 'dor', 'sono'] },
  { id: 145, map: 'Orelha - lateral', auricularSlug: 'fronte', name: 'Fronte', mainUse: 'Cefaleia frontal, ansiedade, sinusite', clinicalCategories: ['cefaleia', 'emocional', 'respiratório'] },
  { id: 146, map: 'Orelha - lateral', auricularSlug: 'talamo', name: 'Tálamo', mainUse: 'Dor, modulação sensorial, neuro', clinicalCategories: ['neuro', 'dor'] },
  { id: 147, map: 'Orelha - lateral', auricularSlug: 'hipofise', name: 'Hipófise', mainUse: 'Endócrino, hormonal, regulação geral', clinicalCategories: ['endócrino', 'ginecológico'] },
  { id: 148, map: 'Orelha - lateral', auricularSlug: 'supra-renal', name: 'Adrenal', aliases: ['Supra-renal'], mainUse: 'Estresse, fadiga, inflamação', clinicalCategories: ['emocional', 'fadiga', 'inflamação'] },
  { id: 149, map: 'Orelha - lateral', auricularSlug: 'lombar', name: 'Coluna Lombar', aliases: ['Lombar'], mainUse: 'Lombalgia, ciática, dor crônica', clinicalCategories: ['dor lombar', 'ciática'] },
  { id: 150, map: 'Orelha - lateral', auricularSlug: 'joelho', name: 'Joelho', mainUse: 'Dor no joelho, osteoartrite, reabilitação', clinicalCategories: ['dor', 'joelho', 'ortopédico'] },
];

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

const bodyMetaByCode = new Map();
const auricularMetaByKey = new Map();

for (const entry of commonlyUsedPoints) {
  if (entry.code) {
    bodyMetaByCode.set(normalizePointCode(entry.code), entry);
    bodyMetaByCode.set(normalizePointCode(entry.displayCode), entry);
  }
  if (entry.auricularSlug) {
    auricularMetaByKey.set(entry.auricularSlug, entry);
    auricularMetaByKey.set(normalizeKey(entry.name), entry);
    for (const alias of entry.aliases || []) {
      auricularMetaByKey.set(normalizeKey(alias), entry);
    }
  }
}

export const commonlyUsedBodyPoints = commonlyUsedPoints.filter(entry => entry.code);
export const commonlyUsedAuricularPoints = commonlyUsedPoints.filter(entry => entry.auricularSlug);

export function getCommonlyUsedBodyPointMeta(code) {
  if (!code) return null;
  return bodyMetaByCode.get(normalizePointCode(code)) || null;
}

export function getCommonlyUsedAuricularMeta(slugOrName) {
  if (!slugOrName) return null;
  const key = String(slugOrName).replace(/^auricular:/i, '');
  return auricularMetaByKey.get(normalizeKey(key)) || null;
}

// Aceita código corporal (qualquer alias), slug ou nome auricular.
export function isCommonlyUsedPointKey(key) {
  return Boolean(getCommonlyUsedBodyPointMeta(key) || getCommonlyUsedAuricularMeta(key));
}

// Aceita entidades da base de conhecimento, reviews da Biblioteca Viva e rascunhos KM-Agent.
export function isCommonlyUsedEntity(entity) {
  if (!entity) return false;
  if (entity.commonlyUsed === true) return true;
  if (entity.slug && getCommonlyUsedAuricularMeta(entity.slug)) return true;
  if (entity.code && isCommonlyUsedPointKey(entity.code)) return true;
  if (entity.displayCode && isCommonlyUsedPointKey(entity.displayCode)) return true;
  if (typeof entity.name === 'string' && getCommonlyUsedAuricularMeta(entity.name)) return true;
  return false;
}
