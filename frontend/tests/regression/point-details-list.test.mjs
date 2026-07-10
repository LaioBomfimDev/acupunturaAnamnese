import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let buildPointDetail;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  ({ buildPointDetail } = await server.ssrLoadModule('/src/knowledge/pointDetails.js'));
});

after(async () => {
  await server?.close();
});

test('ficha do ponto separa ações e indicações coladas pelo OCR em chips individuais', () => {
  const detail = buildPointDetail({
    pointKey: 'GB20',
    reviews: [{
      code: 'GB20',
      displayCode: 'VB20',
      status: 'approved_local',
      approvalMethod: 'bulk_high_confidence_operator_request',
      title: 'VB20 - Fengchi',
      source: 'Atlas Ednea Martins',
      locationText: 'Região lateral e posterior do pescoço, na depressão óssea localizada entre a tubcrosidadc occipital externa e o processo mastóidoo.',
      actions: [
        'Dispersa Vento, Vento -F rio, Vento-Calor e Frio., R eg u l ariia o Qi, ativa a circulação de Sangue e alivia dor., Remove s índromes exteriores., Faz descer a subida excessiva do Ya n g.',
      ],
      indications: [
        ", neuralgia da cabeça, cefaleia occipital, e nxaqueca, torcicolo, dor e rigidez cervical, coma, disartria, visão turva, catarata, iridocicUte, retioite, rin ite, atrofia 'l' do ne.rvo óptico, conjuntivite,.,., glaucoma, doenças ' cerebrais, transtor-nos mentais, des maios",
      ],
      clinicalNote: 'Nota de localizacao: lização A partir da linha mediana, deslizar o d edo na margem do occipúcio, até u ma depressão antes da inserção do músculo cstcmoclcidomastóideo.',
      techniques: ['agulha, moxa, ventosa'],
    }],
  });

  assert.deepEqual(detail.actions, [
    'Dispersa Vento, Vento-Frio, Vento-Calor e Frio',
    'Regulariza o Qi, ativa a circulação de Sangue e alivia dor',
    'Remove síndromes exteriores',
    'Faz descer a subida excessiva do Yang',
  ]);
  assert.deepEqual(detail.indications, [
    'neuralgia da cabeça',
    'cefaleia occipital',
    'enxaqueca',
    'torcicolo',
    'dor e rigidez cervical',
    'coma',
    'disartria',
    'visão turva',
    'catarata',
    'iridociclite',
    'retinite',
    'rinite',
    'atrofia do nervo óptico',
    'conjuntivite',
    'glaucoma',
    'doenças cerebrais',
    'transtornos mentais',
    'desmaios',
  ]);
  assert.equal(
    detail.locationText,
    'Região lateral e posterior do pescoço, na depressão óssea localizada entre a tuberosidade occipital externa e o processo mastóideo.',
  );
  assert.equal(
    detail.clinicalNote,
    'Nota de localização: A partir da linha mediana, deslizar o dedo na margem do occipúcio, até uma depressão antes da inserção do músculo esternocleidomastóideo.',
  );
  assert.deepEqual(detail.techniques, ['agulha', 'moxa', 'ventosa']);
});

test('ficha do TA5 limpa ruídos de OCR em localização, ações e indicações', () => {
  const detail = buildPointDetail({
    pointKey: 'TA5',
    reviews: [{
      code: 'TE5',
      displayCode: 'TA5',
      status: 'approved_local',
      approvalMethod: 'bulk_high_confidence_operator_request',
      title: 'SJ-5 (Waiguan) - Fechadura Exterior',
      meridian: 'Triplo Aquecedor',
      locationText: 'Fa ce dorsal do antebraço, na linha que une o SJ-4 (Ya11gch1) e a ponta da face lateral do epioôndilo do úmero, 2 cun acima do espaço da articulação da mão, no punho, e nue rádio e ulna.',
      actions: [
        'Expele Vento, Calor, Umidade, Secura, Fogo e reduz a febre., Harmoni za o Qi do San Jiao e do Yang Wei Mai., Re laxa e fortalece os tendões., Regula o Yang do Fígado., Beneficia a cabeça e o ouvido., CANAL OE ENERGIA DO SAN ]/',
      ],
      indications: [
        'hemicrania, enxaqueca, conjuntivit e, parotidite epidêm.ica, anralgias, dor nas articulações/ paralisia dos membros superiores, tremor/dor dos dedos e mãos, transtornos 1 notores de cotovelo e braço. dor torácica, dor no hipocôndrio',
      ],
      relatedPatterns: [
        'Ponto de Conexão (Luo) do Canal., Ponto de Abertura do Yang Wei Mai., O Canal Divergente nasce próximo a es te ponto.',
      ],
      clinicalNote: 'Nota de localizacao: lir.ação Situa-se entre o osso rádio e o tendão do músculo exten sor comum dos dedos, exatamente oposto a Pc-6 (Neigua11), a dois dedos de distância do espaço da aniculação da mão.',
      techniques: ['agulha, moxa, ventosa'],
    }],
  });

  assert.equal(
    detail.locationText,
    'Face dorsal do antebraço, na linha que une o SJ-4 (Yangchi) e a ponta da face lateral do epicôndilo do úmero, 2 cun acima do espaço da articulação da mão, no punho, entre rádio e ulna.',
  );
  assert.deepEqual(detail.actions, [
    'Expele Vento, Calor, Umidade, Secura, Fogo e reduz a febre',
    'Harmoniza o Qi do San Jiao e do Yang Wei Mai',
    'Relaxa e fortalece os tendões',
    'Regula o Yang do Fígado',
    'Beneficia a cabeça e o ouvido',
  ]);
  assert.ok(detail.indications.includes('conjuntivite'));
  assert.ok(detail.indications.includes('parotidite epidêmica'));
  assert.ok(detail.indications.includes('artralgias'));
  assert.ok(detail.indications.includes('dor nas articulações'));
  assert.ok(detail.indications.includes('paralisia dos membros superiores'));
  assert.ok(detail.indications.includes('transtornos motores de cotovelo e braço'));
  assert.ok(detail.indications.includes('dor torácica'));
  assert.deepEqual(detail.relatedPatterns.slice(0, 3), [
    'Ponto de Conexão (Luo) do Canal',
    'Ponto de Abertura do Yang Wei Mai',
    'O Canal Divergente nasce próximo a este ponto',
  ]);
  assert.equal(
    detail.clinicalNote,
    'Nota de localização: Situa-se entre o osso rádio e o tendão do músculo extensor comum dos dedos, exatamente oposto a Pc-6 (Neiguan), a dois dedos de distância do espaço da articulação da mão.',
  );
  assert.doesNotMatch(
    JSON.stringify(detail),
    /Fa ce|Ya11gch1|epioôndilo|e nue|Harmoni za|Re laxa|CANAL OE|conjuntivit e|epidêm\.ica|anralgias|1 notores|es te|lir\.ação|exten sor|Neigua11|aniculação|\]\//,
  );
});

test('ficha limpa ruídos do primeiro lote prioritário de pontos comuns', () => {
  const base = {
    status: 'approved_local',
    approvalMethod: 'bulk_high_confidence_operator_request',
    source: 'Atlas Ednea Martins',
    techniques: ['agulha'],
  };
  const cases = [
    {
      pointKey: 'CV3',
      review: {
        ...base,
        code: 'CV3',
        displayCode: 'VC3',
        title: 'CV3 (Zhongji)',
        actions: ['Regula Chong e Ren Mai, ton ifi ca e reforça o Qi do Rim, harmoniza oJíao In fe rior, harmoniza o Qí do iltero. RCN MAi ( ) 749'],
        indications: ['amenorreia, di sme norrcia, frequên cia de micção, interrupção do Huxo urinário'],
      },
      expected: ['tonifica e reforça', 'harmoniza o Jiao Inferior', 'Qi do útero', 'dismenorreia', 'frequência de micção', 'fluxo urinário'],
      forbidden: /ton ifi|oJíao|In fe|Qí|iltero|RCN MAi|di sme|frequên cia|Huxo/,
    },
    {
      pointKey: 'CV12',
      review: {
        ...base,
        code: 'CV12',
        displayCode: 'VC12',
        title: 'VC12 (Zhongwan)',
        actions: ['Toni fica, harmoniza o Qi do Estômago., Di spersa a Umidade.'],
        indications: ['gastri te aguda, aliviada após ingestã o de alimentos, di senteria, estufa1nentofdor/diste ns ão abdon1inal, doença ccrebrovascular, d istú rbios mentais, convul sões'],
        relatedPatterns: ['Ponto de Alarme (Mu) do &tômago. /'],
        needling: 'l a2cu n.',
      },
      expected: ['Tonifica', 'Dispersa a Umidade', 'gastrite aguda', 'ingestão de alimentos', 'disenteria', 'estufamento/dor/distensão abdominal', 'doença cerebrovascular', 'distúrbios mentais', 'convulsões', 'Estômago', '1 a 2 cun'],
      forbidden: /Toni fica|Di spersa|gastri te|ingestã o|di senteria|estufa1|diste ns|abdon1inal|ccrebrovascular|d istú|convul sões|&tômago|a2cu/,
    },
    {
      pointKey: 'CV14',
      review: {
        ...base,
        code: 'CV14',
        displayCode: 'VC14',
        title: 'CV14 (Juque)',
        locationText: 'No abdome, 6 c1 m acima. No ta de lo calização Encontre o ângulo cstemocostal.',
        actions: ['Harmoniza o Qi do Coração, e liminando Calor. Beneficia o diafragma, dispersando a Fleuma do tór.ix.'],
        indications: ['palpitaçõe s, insônia'],
        needling: '0,5 a l cun.',
      },
      expected: ['6 cun acima', 'Nota de localização', 'ângulo esternocostal', 'eliminando Calor', 'tórax', 'palpitações', '0,5 a 1 cun'],
      forbidden: /c1 m|No ta|lo calização|cstemocostal|e liminando|tór\.ix|palpitaçõe s|a l cun/,
    },
    {
      pointKey: 'CV15',
      review: {
        ...base,
        code: 'CV15',
        displayCode: 'VC15',
        title: 'CV15 (Jiuwei)',
        locationText: 'Região toracoabdominal, oa linha mediana. Nota de lo calização, costel as, parte óssea só)jda (ver Cap. l,Ângulo estemocostal). Algumas fontes dizern; localiz.c o ponto.',
        indications: ['náusea, vô rnito'],
        relatedPatterns: ['Ponto de Conexão do Re11 Mai.'],
      },
      expected: ['na linha mediana', 'Nota de localização', 'costelas', 'sólida', 'Cap. 1, Ângulo esternocostal', 'dizem', 'localize o ponto', 'vômito', 'Ren Mai'],
      forbidden: /oa linha|lo calização|costel as|só\)jda|Cap\. l|estemocostal|dizern|localiz\.c|vô rnito|Re11/,
    },
    {
      pointKey: 'CV22',
      review: {
        ...base,
        code: 'CV22',
        displayCode: 'VC22',
        title: 'CV22 (Tiantu)',
        actions: ['Tonilica,harmoniza,difund ee regula o Qi do Pulmão, interrompe a tosse e a. 1 ivia a asma.'],
        indications: ['doenças da s cordas vocai s, afonia'],
        needling: '0.2 a 0.3 cun, inserção perpend.icular; fazer penetrar0,5 cun.',
      },
      expected: ['Tonifica, harmoniza, difunde e regula', 'alivia a asma', 'doenças das cordas vocais', '0,2 a 0,3 cun', 'inserção perpendicular', 'penetrar 0,5 cun'],
      forbidden: /Tonilica|difund ee|a\. 1 ivia|da s cordas|vocai s|0\.2|0\.3|perpend\.icular|penetrar0/,
    },
    {
      pointKey: 'GB34',
      review: {
        ...base,
        code: 'GB34',
        displayCode: 'VB34',
        title: 'VB34 (Yanglingquan)',
        locationText: 'Nota tk localiwção Deslizar o dedo.',
        actions: ['Promove circulação de Fígado e Vesícula BiJiar. Beneficia articuJações.'],
        indications: ['ionadas ao fígado e à vesícula biliar. Exempl-0s de combinações, lG-11: hemiplegia., Ren- 14,C-7,Ba-6,F-3,1G-34:depressão., SJ-6: elimi na estagnação. relaxamento de múscu los e tendões. VI'],
        relatedPatterns: ['Ponto Mar (H e) do Canal., Ponto de Influência (Hu i) da Energia dos tendões.'],
        needling: '1 a2cun.',
      },
      expected: ['Nota de localização', 'Vesícula Biliar', 'articulações', 'relacionadas ao fígado', 'Exemplos de combinações', 'IG-11', 'Ren-14', 'VB-34: depressão', 'elimina estagnação', 'músculos e tendões', 'Ponto Mar (He)', 'Influência (Hui)', '1 a 2 cun'],
      forbidden: /localiwção|BiJiar|articuJações|^ionadas|Exempl-0s|lG-|1G-34|:depressão|elimi na|múscu los|tendões\. VI|Bilia"|H e|Hu i|a2cun/,
    },
    {
      pointKey: 'GV20',
      review: {
        ...base,
        code: 'GV20',
        displayCode: 'VG20',
        title: 'VG20 (Baihui)',
        indications: ['esquizofre-::h nia, 1 nemória S: fraca, prolapso de ãnus'],
      },
      expected: ['esquizofrenia', 'memória fraca', 'ânus'],
      forbidden: /esquizofre-|::h|nemória S|ãnus/,
    },
    {
      pointKey: 'PC6',
      review: {
        ...base,
        code: 'PC6',
        displayCode: 'PC6',
        title: 'Pc-6 (N eiguan) - F ec hadura Interior',
        locationText: 'Nota de lo calização, tendões dos múscu los, artéria anéria.',
        indications: ['istema cardiovascular, doença cardfaca, pericarditc, tó-, rax, hipocôodrio, epiga5tralgia, hematêmcsc, bipertireoidismo, pós-histcrcctomia'],
        needling: 'unir com SJ-5 (Waig11an), para trat ar doenças do tórax ou l a 1,5 cun.',
      },
      expected: ['Pc-6 (Neiguan) - Fechadura Interior', 'Nota de localização', 'músculos', 'artéria', 'sistema cardiovascular', 'doença cardíaca', 'pericardite', 'tórax', 'hipocôndrio', 'epigastralgia', 'hematêmese', 'hipertireoidismo', 'pós-histerectomia', 'Waiguan', 'tratar doenças', 'ou 1 a 1,5 cun'],
      forbidden: /N eiguan|F ec|lo calização|múscu los|anéria|cardfaca|pericarditc|tó-,\s*rax|hipocôodrio|epiga5tralgia|hematêmcsc|bipertireoidismo|histcrcctomia|Waig11an|trat ar|ou l a/,
    },
    {
      pointKey: 'ST34',
      review: {
        ...base,
        code: 'ST34',
        displayCode: 'E34',
        title: 'E34 (Liangqiu)',
        locationText: 'margem laterossuperior da palela, sobre a linha de co nexão. Nota de lo calização.',
        actions: ['Pacifica o EstômagoehannonÍ7.ao QidoJiaoMédio.'],
        relatedPatterns: ['Ponto de Acómulo ( X1) do Canal.'],
      },
      expected: ['patela', 'linha de conexão', 'Nota de localização', 'Estômago e harmoniza o Qi do Jiao Médio', 'Acúmulo (Xi)'],
      forbidden: /palela|co nexão|lo calização|Estômagoehannon|QidoJiao|Acómulo|X1/,
    },
    {
      pointKey: 'ST40',
      review: {
        ...base,
        code: 'ST40',
        displayCode: 'E40',
        title: 'E40 (Fenglong)',
        locationText: 'entre B- 35 (Dubi) e (ver Cap. l, Determinação), E-38 (7íaokou), músculos exte nsor, mrugem da uôia.',
        actions: ['acalma o Slu111. r, Elimina o Calor patogênico.:6.'],
        relatedPatterns: ['Ponto Luo do Canal de Energia do Es tômago. u CD u CD'],
      },
      expected: ['E-35 (Dubi)', 'Cap. 1, Determinação', 'E-38 (Tiaokou)', 'músculos extensor', 'margem da tíbia', 'acalma o Shen', 'Calor patogênico', 'Energia do Estômago'],
      forbidden: /B- 35|Cap\. l|7íaokou|exte nsor|mrugem|uôia|Slu111|patogênico\.:6|Es tômago|u CD/,
    },
    {
      pointKey: 'TE14',
      review: {
        ...base,
        code: 'TE14',
        displayCode: 'TE14',
        title: 'SJ-14 (Jialiao)',
        actions: ['Ativa os Canais.'],
        needling: 'O$ a 1,2 am, inseição perpendicular direto em relação à aitila; 1a 1,5am,inserçãooblíquaemdireçãoaoeotovelo. ]/',
      },
      expected: ['0,5 a 1,2 cun', 'inserção perpendicular direta', 'axila', '1 a 1,5 cun', 'inserção oblíqua em direção ao cotovelo'],
      forbidden: /O\$|1,2 am|inseição|direto em relação|aitila|1a 1,5am|inserçãooblíqua|eotovelo|\]\//,
    },
  ];

  for (const { pointKey, review, expected, forbidden } of cases) {
    const detail = buildPointDetail({ pointKey, reviews: [review] });
    const serialized = JSON.stringify(detail);
    for (const text of expected) assert.match(serialized, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serialized, forbidden, `${pointKey} ainda contém ruído de OCR`);
  }
});

test('ficha limpa ruídos do segundo lote de pontos comuns', () => {
  const base = {
    status: 'approved_local',
    approvalMethod: 'bulk_high_confidence_operator_request',
    source: 'Atlas Ednea Martins',
    actions: ['Move o Qi.'],
    techniques: ['agulha'],
  };
  const cases = [
    {
      pointKey: 'CV6',
      review: {
        ...base,
        code: 'CV6',
        displayCode: 'VC6',
        title: 'VC6 (Qihai)',
        relatedPatterns: ['Um dos ponLos mais importantes, usado para tonificação geral'],
      },
      expected: ['Um dos pontos mais importantes'],
      forbidden: /ponLos/,
    },
    {
      pointKey: 'GB8',
      review: {
        ...base,
        code: 'GB8',
        displayCode: 'VB8',
        title: 'VB-8 (Shuaigu) - Segu.indo o Vale',
        indications: ['bemicrania, venigem, hiperemia da conjuntÍV\'d, espasmo infant il agudo'],
      },
      expected: ['Seguindo o Vale', 'hemicrania', 'vertigem', 'conjuntiva', 'espasmo infantil agudo'],
      forbidden: /Segu\.indo|bemicrania|venigem|conjuntÍV|infant il/,
    },
    {
      pointKey: 'GB13',
      review: {
        ...base,
        code: 'GB13',
        displayCode: 'VB13',
        title: 'VB-13 (Benshen)',
        locationText: 'Região frontal, na horizontal j que passa pelo ponto Du-24 (Slienting), e0,5 cun posr.: terior à linha anterior. Na junção da ob !;; linha que une Du-24 (Slienting) e E-8.',
        relatedPatterns: ['Ponto de Encontro com o Yang V ei Mai.'],
      },
      expected: ['horizontal que passa', 'Du-24 (Shenting)', 'e 0,5 cun posterior', 'junção da linha que une', 'Yang Wei Mai'],
      forbidden: /horizontal j|Slienting|e0,5|posr|ob !|Yang V ei/,
    },
    {
      pointKey: 'GB20',
      review: {
        ...base,
        code: 'GB20',
        displayCode: 'VB20',
        title: 'VB20 (Fengchi)',
        locationText: 'Região cervical.',
        relatedPatterns: ['Ponto de Encontro com o Yang V ei Mai, Yang Qiao Mai. VI'],
      },
      expected: ['Yang Wei Mai', 'Yang Qiao Mai'],
      forbidden: /Yang V ei|\. VI/,
    },
    {
      pointKey: 'GB21',
      review: {
        ...base,
        code: 'GB21',
        displayCode: 'VB21',
        title: 'GB21 (Jianjing)',
        actions: ['restaura a consciêocia. Acrõmlo CV li CANA L 0[, Relaxa os tendões.'],
        relatedPatterns: ['Ponto de Encontro com o Yang V ei Mai e, segundo Deadrnan.'],
        needling: '0,.5 a 1,2 cun, inserir an teriormente. Não puncionar mais que 1;l. cun.',
      },
      expected: ['restaura a consciência', 'Relaxa os tendões', 'Yang Wei Mai', 'segundo Deadman', '0,5 a 1,2 cun', 'inserir anteriormente', '1,5 cun'],
      forbidden: /consciêocia|Acrõmlo|CANA L|Yang V ei|Deadrnan|0,\.\s*5|0,\s+5|an teriormente|1;l/,
    },
    {
      pointKey: 'GB30',
      review: {
        ...base,
        code: 'GB30',
        displayCode: 'VB30',
        title: 'VB30 (Huantiao)',
        indications: ['hemíplegia, dor no joelho, sí ndrome da obstrução dolorosa da bacia/tomo?.elo/canela/pema e coxa'],
      },
      expected: ['hemiplegia', 'síndrome da obstrução dolorosa', 'bacia/tornozelo/canela/perna e coxa'],
      forbidden: /hemíplegia|sí ndrome|tomo\?\.elo|pema/,
    },
    {
      pointKey: 'GB33',
      review: {
        ...base,
        code: 'GB33',
        displayCode: 'VB33',
        title: 'VB33 (Xiyangguan)',
        locationText: '3 cu n acima de VB-34 (Yanglinquan) e lateral a E-35 (D11bí), margem superior da pare ia, entre f\'êmur e tendão.',
        indications: ['ace lateral do joelho, fossa popUtea, intumcscimento, dificuldade de íl exionar ou esten- 6: der o joelho'],
      },
      expected: ['3 cun acima', 'VB-34 (Yanglingquan)', 'E-35 (Dubi)', 'margem superior da patela', 'entre fêmur', 'Face lateral do joelho', 'fossa poplítea', 'intumescimento', 'dificuldade de flexionar ou estender'],
      forbidden: /cu n|Yanglinquan|D11bí|pare ia|f'êmur|popUtea|intumcscimento|íl exionar|esten- 6/,
    },
    {
      pointKey: 'GB39',
      review: {
        ...base,
        code: 'GB39',
        displayCode: 'VB39',
        title: 'VB39 (Xuanzhong)',
        locationText: 'lizar quatro dedos acima da proeminência do maléolo lateral, na margem anterior da fTbula.',
        actions: ['Tonifica a Essência e f orta lece músculos, tendões e ossos.'],
        indications: ['dor/contratur.i.., de pescoço, ri nites, distensão/ ill dor nos hipocôndrios, plenitude toráci-:, ca, doença bemarológica'],
      },
      expected: ['Localizar quatro dedos acima', 'fíbula', 'fortalece músculos', 'dor/contratura de pescoço', 'rinites', 'distensão/dor nos hipocôndrios', 'plenitude torácica', 'doença hematológica'],
      forbidden: /^lizar|fTbula|f orta|contratur\.i|ri nites|distensão\/ ill|toráci-|bemarológica/,
    },
  ];

  for (const { pointKey, review, expected, forbidden } of cases) {
    const detail = buildPointDetail({ pointKey, reviews: [review] });
    const serialized = JSON.stringify(detail);
    for (const text of expected) assert.match(serialized, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serialized, forbidden, `${pointKey} ainda contém ruído de OCR`);
  }
});

test('ficha limpa ruídos do terceiro lote de pontos comuns', () => {
  const base = {
    status: 'approved_local',
    approvalMethod: 'bulk_high_confidence_operator_request',
    source: 'Atlas Ednea Martins',
    actions: ['Move o Qi.'],
    techniques: ['agulha'],
  };
  const cases = [
    {
      pointKey: 'GV16',
      review: {
        ...base,
        code: 'GV16',
        displayCode: 'VG16',
        title: 'VG16 (Fengfu)',
        locationText: 'ou 1 c 1111 aci ma da linha de inserção dos cabelos, na depressão entre os mdsculos trapézios.',
        indications: ['pares-... tesias de membros, afonia súbita, ob S: surdez súbita, cefaleia neurol óg ica, venigem'],
        needling: 'Lent ame nt e, 0,5 a 1 cun; ou l a 1,5 cun.',
      },
      expected: ['1 cun acima', 'músculos trapézios', 'parestesias de membros', 'surdez súbita', 'cefaleia neurológica', 'vertigem', 'Lentamente', 'ou 1 a 1,5 cun'],
      forbidden: /1 c 1111|aci ma|mdsculos|pares-|ob S|neurol óg|venigem|Lent ame/,
    },
    {
      pointKey: 'GV24',
      review: {
        ...base,
        code: 'GV24',
        displayCode: 'VG24',
        title: 'VG24 (Shenting)',
        actions: ['Redu za fe bre, interrompe con vu lsões e trata vômito.'],
        indications: ['l, febre com cefaleia, convulsão, lontura, rinite'],
      },
      expected: ['Reduz a febre', 'interrompe convulsões', 'febre com cefaleia', 'tontura'],
      forbidden: /Redu za|fe bre|con vu|^l,|lontura/,
    },
    {
      pointKey: 'HT6',
      review: {
        ...base,
        code: 'HT6',
        displayCode: 'C6',
        title: 'C-6 (Yinxi)',
        locationText: 'liuiç ã-0 O,5 cun acima do ponto C-7 (Shenniet1). Nota de loc ali zação. O tendão toma-se evidente (ver Cap. l).',
        actions: ['Tonifica o Qi e nutre o Yin do Con1ção.'],
        indications: ['doenças funcionai s, palpitaçã o, sudoresc noturna, tonsilitc, bematêmese, neurasteaia'],
        needling: '0,3 a0,5 cun; inserção oblíqua, 0,5 a) Cllfl.',
      },
      expected: ['0,5 cun acima', 'C-7 (Shenmen)', 'Nota de localização', 'tendão torna-se evidente', 'Cap. 1', 'Yin do Coração', 'funcionais', 'palpitação', 'sudorese', 'tonsilite', 'hematêmese', 'neurastenia', '0,3 a 0,5 cun', '0,5 a 1 cun'],
      forbidden: /liuiç|O,5|Shenniet1|loc ali|toma-se|Cap\. l|Con1ção|funcionai s|palpitaçã o|sudoresc|tonsilitc|bematêmese|neurasteaia|a0,5|Cllfl/,
    },
    {
      pointKey: 'HT8',
      review: {
        ...base,
        code: 'HT8',
        displayCode: 'C8',
        title: 'C-8 (Shaofu)',
        locationText: 'Na palma da mão, entre os ossos metacarpais TV e V.',
      },
      expected: ['metacarpais IV e V'],
      forbidden: /TV e V/,
    },
    {
      pointKey: 'KI1',
      review: {
        ...base,
        code: 'KI1',
        displayCode: 'R1',
        title: 'R-1 (Yongquan)',
        locationText: 'entre os ossos metatarsais JJ e rn. na depressão da trans ição.',
        indications: ['venigem, intermação, l convulsão infantil, dorde garganta, espasmo s/ paralisia, calor nos::, i pés, impotência,.. &, hipcnensão arterial, epileps ia'],
        relatedPatterns: ['Ponto de Dispersão do Canal. R'],
      },
      expected: ['metatarsais II e III', 'depressão da transição', 'vertigem', 'intermação', 'convulsão infantil', 'dor de garganta', 'espasmos/paralisia', 'calor nos pés', 'impotência', 'hipertensão arterial', 'epilepsia', 'Ponto de Dispersão do Canal'],
      forbidden: /JJ|rn\.|trans ição|venigem|l convulsão|dorde|espasmo s|nos::|&|hipcnensão|epileps ia|Canal\. R/,
    },
    {
      pointKey: 'KI2',
      review: {
        ...base,
        code: 'KI2',
        displayCode: 'R2',
        title: 'R-2 (Rangu)',
        locationText: 'anteroinferio nn e nte à tuberosidade, na deprcs..;ão intr.i-articular entre a borda iafcrior, posterior a Ba-4 (Gongs1111).',
        actions: ['Aumenta o QidoJiao Inferior. 00, Refresca o Calor e remove "\' a Umidade.::: s, Elimina o Calor.'],
        indications: ['ro, menstruação irregular, miocardile, dor /co ngestão da garganta'],
      },
      expected: ['anteroinferiormente à tuberosidade', 'na depressão intra-articular', 'borda inferior', 'Ba-4 (Gongsun)', 'Qi do Jiao Inferior', 'remove a Umidade', 'Elimina o Calor', 'menstruação irregular', 'miocardite', 'dor/congestão da garganta'],
      forbidden: /anteroinferio nn|deprcs|intr\.i|iafcrior|Gongs1111|QidoJiao|00,|Umidade\.:::|^ro,|miocardile|co ngestão/,
    },
    {
      pointKey: 'LR3',
      review: {
        ...base,
        code: 'LR3',
        displayCode: 'F3',
        title: 'F3 (Taichong)',
        indications: ['cnurese, colo ração branca, dor nos hipo cô ndrio s, he - patite, vertigen s, neurile sacra!, afccções oculares.congestão, h ér nia inguinal, paralisia fa cial, pardlisia cerebral, convu lsão infantil, dist\\1rbios do son o'],
        relatedPatterns: ['Ponto Riacho (Shu) do Ca nal.'],
      },
      expected: ['enurese', 'coloração branca', 'hipocôndrios', 'hepatite', 'vertigens', 'neurite sacral', 'afecções oculares', 'congestão', 'hérnia inguinal', 'paralisia facial', 'paralisia cerebral', 'convulsão infantil', 'distúrbios do sono', 'do Canal'],
      forbidden: /cnurese|colo ração|hipo cô|he - patite|vertigen s|neurile|afccções|oculares\.congestão|h ér|fa cial|pardlisia|convu lsão|dist\\1rbios|son o|Ca nal/,
    },
  ];

  for (const { pointKey, review, expected, forbidden } of cases) {
    const detail = buildPointDetail({ pointKey, reviews: [review] });
    const serialized = JSON.stringify(detail);
    for (const text of expected) assert.match(serialized, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(serialized, forbidden, `${pointKey} ainda contém ruído de OCR`);
  }
});
