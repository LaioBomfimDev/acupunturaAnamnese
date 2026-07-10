import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { applyReocrEntry, mergeRelatedPatterns } from './apply-common-points-reocr.mjs';

test('mergeRelatedPatterns substitui caracteristicas OCR do Atlas e preserva etiquetas internas', () => {
  const merged = mergeRelatedPatterns(
    [
      'Ponto Mar (H e) do Canal.',
      'ação No ponto médio entre as margens lateral e medial da escápula, um ter ço da dis1ãncia entre o pon10 médio da espinha da escápula. Nota de',
      'Vento',
      'Calor',
      'Jiao Inferior',
    ],
    [
      'Ponto Mar (He) do Canal.',
      'Movimento Terra.',
    ],
  );

  assert.deepEqual(merged, [
    'Ponto Mar (He) do Canal.',
    'Movimento Terra.',
    'Vento',
    'Calor',
    'Jiao Inferior',
  ]);
});

test('applyReocrEntry aplica campos rastreados sem remover auditoria profissional', () => {
  const review = {
    code: 'BL32',
    title: 'B-32 (Ciliao) - Segu,ndo Orifício',
    relatedPatterns: ['Ponto de Encontro c om o Cana l de Energia da Ve s ícu la Biliar*.', 'Calor'],
    cautions: ['Manter auditoria profissional final.'],
    ocrCleanup: { doubtCount: 1 },
  };

  applyReocrEntry(review, {
    title: 'B-32 (Ciliao) - Segundo Orifício',
    needling: '1 a 1,5 cun.',
    cautions: ['Não puncionar em caso de contraindicação local.'],
    relatedPatterns: ['Ponto de Encontro com o Canal de Energia da Vesícula Biliar.'],
  });

  assert.equal(review.title, 'B-32 (Ciliao) - Segundo Orifício');
  assert.equal(review.needling, '1 a 1,5 cun.');
  assert.deepEqual(review.relatedPatterns, ['Ponto de Encontro com o Canal de Energia da Vesícula Biliar.', 'Calor']);
  assert.deepEqual(review.cautions, ['Não puncionar em caso de contraindicação local.', 'Manter auditoria profissional final.']);
  assert.equal(review.status, 'approved_local');
  assert.equal(review.approvalMode, 'local_only');
  assert.equal(review.clinicalSource, 'reocr_atlas');
  assert.equal(review.requiresProfessionalAudit, true);
  assert.equal(review.ocrCleanup.reocr, true);
});

test('applyReocrEntry substitui cautelas quando o re-OCR marca vazamento estrutural', () => {
  const review = {
    code: 'PC6',
    cautions: [
      'Revisar profundidade e direcao da agulha pela proximidade da cavidade toracica',
      'Atenção a vasos locais descritos no Atlas.',
    ],
  };

  applyReocrEntry(review, {
    cautionsMode: 'replace',
    cautions: ['Atenção a vasos locais descritos no Atlas; ajustar profundidade e direção à avaliação profissional.'],
  });

  assert.deepEqual(review.cautions, [
    'Atenção a vasos locais descritos no Atlas; ajustar profundidade e direção à avaliação profissional.',
  ]);
  assert.equal(JSON.stringify(review).includes('cavidade toracica'), false);
  assert.equal(review.clinicalSource, 'reocr_atlas');
  assert.equal(review.requiresProfessionalAudit, true);
});

test('re-OCR cobre bloco BL retirado da planilha de duvidas', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['BL11', 'BL20', 'BL24', 'BL25', 'BL26', 'BL27', 'BL31', 'BL32', 'BL34', 'BL40', 'BL58', 'BL59', 'BL60', 'BL62'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of ['co "ibinações', 'polil1ria', 'disl1ria', 'dis6ria', 'tun1a', '1JT', 'nLe', 'sLr', 'aLo', 'hei1gshan', 'Cllll', 'ozc lo', 'pla ce ntária', 'co nvulsões', 'dcsliz']) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.BL32.title, 'B-32 (Ciliao) - Segundo Orifício');
});

test('re-OCR cobre lote estrutural 1 sem ingles, AcuKG ou secoes misturadas', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['CV4', 'BL10', 'CV13', 'KI6', 'TE17', 'GV4', 'KI27', 'ST30'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Original Qi',
      'Ethereal',
      'brightens',
      'Otorrhea',
      'Trismus',
      'Nourishment',
      'Funções energéticas',
      'Indicações',
      'Exemplos de combinações',
      'cicauiz',
      'ótcro',
      'gular, leucorreia',
      'incontinência 17',
      '/rigidez',
      "',",
      'Via das Água.',
      'dtero',
      'Qida',
      'niú',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.CV4.title, 'Ren-4 (Guanyuan) - Residência do Qi Primordial');
  assert.equal(reocr.points.CV13.title, 'Ren-13 (Shangwan) - Epigástrio Superior');
  assert.ok(reocr.points.KI6.actions.includes('Beneficia os olhos e a garganta e regula o útero.'));
  assert.ok(reocr.points.TE17.indications.includes('otorreia'));
  assert.ok(reocr.points.TE17.indications.includes('trismo'));
  assert.ok(reocr.points.GV4.indications.includes('incontinência urinária'));
});

test('re-OCR cobre lote estrutural 2 sem ingles, AcuKG ou colunas do Atlas misturadas', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['BL17', 'GV12', 'GB41', 'LI16', 'BL33', 'CV17', 'LR2', 'GB31'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Belching',
      'Blood Spitting',
      'Afternoon Fever',
      'Measles',
      'Body',
      'Girdle Vessel',
      'Upper Extremity',
      'Lumbar Region',
      'Liver Fire',
      'Itching',
      'Funções energéticas',
      'Indicações',
      'Exemplos de combinações',
      'Ponto Sh11',
      'H111',
      'nuxo',
      '"áctea',
      'i, edema',
      'Lórax',
      'a liviando',
      'Ln vertido',
      'rioária',
      'Jombossacral',
      'claviculnr',
      'cosia)',
      'alrura',
      'intercostal U',
      'Vénebras',
      'tora,',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.LI16.title, 'IG-16 (Jugu) - Osso Largo');
  assert.equal(reocr.points.CV17.title, 'Ren-17 (Shanzhong ou Tanzhong) - Meio do Tórax');
  assert.ok(reocr.points.BL17.actions.includes('Fortalece o Ying Qi.'));
  assert.ok(reocr.points.BL17.indications.includes('eructação'));
  assert.ok(reocr.points.GB41.indications.includes('parar secreção láctea'));
  assert.ok(reocr.points.BL33.indications.includes('patologia geniturinária'));
  assert.ok(reocr.points.LR2.actions.includes('Drena o Fogo do Fígado e faz circular o Qi estagnado.'));
  assert.ok(reocr.points.GB31.indications.includes('dificuldade motora'));
});

test('re-OCR cobre lote estrutural 3 sem ingles, AcuKG ou secoes duplicadas', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['LU7', 'SI9', 'BL21', 'BL57', 'KI3', 'LR5', 'LU9', 'LR8'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Brain Circulation',
      'Memory',
      'subsides',
      'Connecting Vessels',
      'dissipates',
      'binds',
      'Gastrocnemius Spasm',
      'beriberi',
      'constipacao',
      'Funções energéticas',
      'Indicações',
      'Exemplos de combinações',
      'Ponto Estrela Celestial de Ma Dan Yang. 1',
      '/dor/atonia',
      'gástrico.gastrite',
      'B- (i()',
      'Rxtalece',
      'gastrocnêrnio',
      'delóquios',
      'nagcnitá',
      'rioária',
      'faiyuan',
      'ProfUndo',
      'odootalgia',
      'ruberculose',
      'reiençllo',
      'aoles',
      'lcucorreia',
      'vuJvar',
      'mtísculos',
      "'7",
      'impot l',
      'dis6',
      'en ce-',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.SI9.title, 'ID-9 (Jianzhen) - Normalização do Ombro');
  assert.equal(reocr.points.LU9.title, 'P-9 (Taiyuan) - Abismo Profundo');
  assert.ok(reocr.points.LU7.actions.includes('Regula e desobstrui o Qi do Ren Mai.'));
  assert.ok(!JSON.stringify(reocr.points.LU7.indications).includes('de suas mãos cruzarem'));
  assert.ok(reocr.points.BL21.indications.includes('dilatação, dor ou atonia do estômago'));
  assert.ok(reocr.points.BL57.actions.includes('Harmoniza o Qi das vísceras.'));
  assert.ok(reocr.points.KI3.indications.includes('inflamação e dor de garganta'));
  assert.ok(reocr.points.LR5.indications.includes('doença inflamatória pélvica'));
  assert.ok(!reocr.points.LR5.indications.some(item => String(item).startsWith('ria pélvica')));
  assert.ok(reocr.points.LR8.relatedPatterns.includes('Movimento Água.'));
});

test('re-OCR cobre lote estrutural 4 sem ingles, AcuKG ou secoes misturadas', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['BL13', 'GB15', 'BL36', 'CV10', 'SP1', 'GB40', 'HT5', 'SI18'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Receiving Support',
      'Connecting Vessels',
      'Stomach Qi Descending',
      'Food Stagnation',
      'Heart Qi',
      'Into Tongue',
      'balances Emotions',
      'brightens',
      'Funções energéticas',
      'Indicações',
      'Exemplos de combinações',
      'hnagine',
      'inseiçãooblíqua',
      'plenicude',
      'dismcnorreia',
      'hemacúria',
      'uloar',
      'Bexil!a',
      'Qua iao',
      'Dcsli:zc',
      "F1'nções",
      'csclcrótica',
      'he - moptise',
      'infraglútco',
      'bfceps',
      'semimembraaáceo',
      'Towe 1',
      'e11ergéticas',
      'Venio',
      'combi 11',
      'ex temo',
      'Méto®',
      'Desequiliôrio',
      'colccistitc',
      'pleuósia',
      'fonalecimento',
      'plenjtude',
      'parasitoscs',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.SP1.title, 'Ba-1 (Yinbai) - Branco Escondido');
  assert.equal(reocr.points.BL36.title, 'B-36 (Chengfu) - Receber o Suporte');
  assert.equal(reocr.points.CV10.title, 'Ren-10 (Xiawan) - Epigástrio Inferior');
  assert.equal(reocr.points.SI18.title, 'ID-18 (Quanliao) - Fenda Zigomática');
  assert.ok(reocr.points.BL13.indications.includes('afecção pulmonar (técnica Shu-Mu)'));
  assert.ok(reocr.points.GB15.indications.includes('lacrimejamento por exposição ao Vento'));
  assert.ok(reocr.points.CV10.cautions.includes('De acordo com alguns clássicos, a moxabustão é contraindicada.'));
  assert.ok(reocr.points.HT5.actions.includes('Beneficia a língua.'));
  assert.ok(reocr.points.GB40.relatedPatterns.includes('Ponto Fonte (Yuan) do Canal.'));
});

test('re-OCR cobre lote estrutural 5 sem titulos ingleses, genericos ou cautela vazada', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['CV6', 'CV23', 'SI3', 'SP4', 'ST25', 'SI10', 'PC6', 'SP6'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Sea of Qi',
      'Corner (Ridge) Spring',
      'Back Stream',
      'Ravine',
      'Yellow Emperor',
      'Three Yin Meeting',
      'N eiguan',
      'F ec hadura',
      'Sanyi j',
      'Reu11ião',
      'Umero',
      'Pi vô',
      'fianshu',
      'Funções energéticas',
      'Indicações',
      'Exemplos de combinações',
      'CUll',
      'c 11n',
      'gastrointestioal',
      'cardfaca',
      'hipocôodrio',
      'epiga5tralgia',
      'hematêmcsc',
      'bipertireoidismo',
      'histcrcctomia',
      'puerpemis',
      'mtísculo',
      'stíbita',
      'cavidade toracica',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.CV6.title, 'Ren-6 (Qihai) - Mar do Qi');
  assert.equal(reocr.points.CV23.title, 'Ren-23 (Lianquan) - Nascente Pura');
  assert.equal(reocr.points.SI3.title, 'ID-3 (Houxi) - Riacho Posterior');
  assert.equal(reocr.points.SP4.title, 'Ba-4 (Gongsun) - Colaterais de Conexão Geral');
  assert.equal(reocr.points.ST25.title, 'E-25 (Tianshu) - Pivô Celeste');
  assert.equal(reocr.points.SI10.title, 'ID-10 (Naoshu) - Ponto do Úmero');
  assert.equal(reocr.points.PC6.title, 'Pc-6 (Neiguan) - Fechadura Interior');
  assert.equal(reocr.points.SP6.title, 'Ba-6 (Sanyinjiao) - Reunião dos Três Yin');
  assert.equal(reocr.points.PC6.cautionsMode, 'replace');
  assert.deepEqual(reocr.points.PC6.cautions, [
    'Atenção a vasos locais descritos no Atlas; ajustar profundidade e direção à avaliação profissional.',
  ]);
  assert.ok(reocr.points.CV23.cautions.includes('De acordo com alguns clássicos, a moxabustão é contraindicada.'));
  assert.ok(reocr.points.CV6.actions.includes('Beneficia Intestinos.'));
  assert.ok(reocr.points.SP6.indications.includes('retenção de placenta'));
  assert.ok(reocr.points.ST25.relatedPatterns.includes('Ponto de Alarme (Mu) do Intestino Grosso.'));
});

test('re-OCR cobre lote estrutural 6 residual sem titulos ingleses ou residuos estruturais', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['CV3', 'CV12', 'CV14', 'CV15', 'CV22', 'GB8', 'GB21', 'LI15'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Middle Extremity',
      'Central Pole',
      'Middle of Epigastrium',
      'Great Palace',
      'Great Tower Gate',
      '(Turtle) Dove Tail',
      'Heaven Projection',
      'Shoulder Well',
      'Shoulder Transporting',
      'Shoulder Bone',
      'Funções energéticas',
      'Indicações',
      'Exemplos de combinações',
      'Ponto do meridiano',
      'Segu.indo',
      'Dazhul',
      'consciêocia',
      'dese -',
      '/dorso',
      'parto.retenção',
      'Jüw',
      'Hanian',
      'venigem',
      'conjuntÍV',
      'bemiplegia',
      'Vente>',
      'desequihôrio',
      'hiperhidr<>se',
      'gastroptosc',
      'estufa1nentofdor',
      'abdon1inal',
      'dueto biliar',
      'hannonizando',
      'paraaliviardornodiafragma',
      'c1111',
      'c1 m',
      'RCN MAi',
      'CONCCPÇAO',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.CV3.title, 'Ren-3 (Zhongji) - Posição do Meio');
  assert.equal(reocr.points.CV12.title, 'Ren-12 (Zhongwan) - Meio do Epigástrio');
  assert.equal(reocr.points.CV14.title, 'Ren-14 (Juque) - Palácio Grande');
  assert.equal(reocr.points.CV15.title, 'Ren-15 (Jiuwei) - Cauda do Pássaro');
  assert.equal(reocr.points.CV22.title, 'Ren-22 (Tiantu) - Proeminência do Céu');
  assert.equal(reocr.points.GB8.title, 'VB-8 (Shuaigu) - Seguindo o Vale');
  assert.equal(reocr.points.GB21.title, 'VB-21 (Jianjing) - Poço do Ombro');
  assert.equal(reocr.points.LI15.title, 'IG-15 (Jianyu) - Dobra do Ombro');
  assert.ok(reocr.points.CV15.cautions.includes('De acordo com alguns clássicos, a moxabustão é contraindicada.'));
  assert.ok(reocr.points.GB21.needling.includes('Não puncionar mais que 1,5 cun.'));
  assert.ok(reocr.points.LI15.relatedPatterns.includes('Ponto de Intersecção com o Yang Qiao Mai.'));
  assert.ok(reocr.points.CV3.relatedPatterns.includes('Ponto de Alarme (Mu) da Bexiga.'));
});

test('re-OCR cobre lote estrutural 7 residual sem titulos antigos ou cabecalhos colados', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['EXHN3', 'GB34', 'LI5', 'LI14', 'SI11', 'SP8', 'ST6', 'ST35'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Palacio da Fronte',
      'Palacio da Impressao',
      'Yintang (Yintang)',
      'Fenda da Terra',
      'Angu.lo',
      'l l 1 E',
      'Ji11g',
      'dis1ãncia',
      'pon10',
      'ter ço',
      'Exemplos de combinações',
      'Funções energéticas',
      'Indicações',
      '"ura labial',
      'distensão musculares',
      '"ensação de calor',
      'Ba-1 O',
      'B-l',
      'TG-4',
      '!, IG-4',
      '1G-34',
      'sangria',
      'anticoagulação',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.EXHN3.title, 'EX-HN3 (Yintang) - Palácio da Fronte');
  assert.equal(reocr.points.GB34.title, 'VB-34 (Yanglingquan) - Riacho do Monte Yang');
  assert.equal(reocr.points.LI5.title, 'IG-5 (Yangxi) - Riacho do Yang');
  assert.equal(reocr.points.LI14.title, 'IG-14 (Binao) - Proeminência Muscular do Braço');
  assert.equal(reocr.points.SI11.title, 'ID-11 (Tianzong) - Convergência Celestial');
  assert.equal(reocr.points.SP8.title, 'Ba-8 (Diji) - Eixo da Terra');
  assert.equal(reocr.points.ST6.title, 'E-6 (Jiache) - Veículo do Ângulo da Mandíbula');
  assert.equal(reocr.points.ST35.title, 'E-35 (Dubi) - Nariz do Bezerro');
  assert.equal(reocr.points.EXHN3.cautionsMode, 'replace');
  assert.deepEqual(reocr.points.EXHN3.cautions, []);
  assert.deepEqual(reocr.points.SI11.relatedPatterns, []);
  assert.ok(reocr.points.LI5.relatedPatterns.includes('Ponto Rio (Jing) do Canal.'));
  assert.ok(reocr.points.GB34.relatedPatterns.includes('Ponto de Influência (Hui) da Energia dos tendões.'));
  assert.ok(reocr.points.ST6.relatedPatterns.includes('Ponto Fantasma de Sun Si Miao.'));
});

test('re-OCR cobre lote estrutural 8 final sem titulo generico ou combinacoes coladas', () => {
  const reocr = JSON.parse(fs.readFileSync(new URL('./common-points-reocr.json', import.meta.url), 'utf8'));
  const resolvedCodes = ['ST41', 'ST44'];

  for (const code of resolvedCodes) {
    const entry = reocr.points[code];
    assert.ok(entry, `${code} sem entrada de re-OCR`);
    assert.ok(entry.atlasPage, `${code} sem pagina do Atlas`);
    assert.ok(entry.title, `${code} sem titulo rastreado`);
    assert.ok(!entry.title.includes('Ponto do meridiano'), `${code} ainda tem titulo generico`);
    assert.ok(entry.locationText, `${code} sem localização rastreada`);
    assert.ok(entry.needling, `${code} sem método rastreado`);
    assert.ok(entry.actions?.length, `${code} sem funções rastreadas`);
    assert.ok(entry.indications?.length, `${code} sem indicações rastreadas`);

    const text = JSON.stringify(entry);
    for (const noise of [
      'Dispersing Stream',
      'Ravine Divide',
      'Ponto do meridiano',
      'Exemplos de combinações',
      'Funções energéticas',
      'Indicações',
      'descquill',
      'rurofia',
      'adjaccnte',
      'Oiexi',
      'c11n',
      'Sha11gq',
      'cntcrit',
      'diafragr na',
      'TG-4',
      'e 7·',
      'combinQ',
    ]) {
      assert.ok(!text.includes(noise), `${code} ainda contém ruído conhecido: ${noise}`);
    }
  }

  assert.equal(reocr.points.ST41.title, 'E-41 (Jiexi) - Alívio do Fluxo');
  assert.equal(reocr.points.ST44.title, 'E-44 (Neiting) - Sala Interna');
  assert.equal(reocr.points.ST41.cautionsMode, 'replace');
  assert.deepEqual(reocr.points.ST41.cautions, [
    'Atenção à artéria e à veia tibiais anteriores descritas no Atlas; ajustar profundidade e direção à avaliação profissional.',
  ]);
  assert.ok(reocr.points.ST41.relatedPatterns.includes('Ponto de Tonificação do Canal.'));
  assert.ok(reocr.points.ST44.relatedPatterns.includes('Ponto Manancial (Ying) do Canal.'));
});
