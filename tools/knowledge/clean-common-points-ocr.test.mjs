import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanField, stripRunningHeads, collectDoubts, renderCleanSourceSection, shouldPreferDeepClean } from './clean-common-points-ocr.mjs';

test('remove cabecalho/rodape de pagina injetado', () => {
  assert.equal(stripRunningHeads('Beneficia o nariz. ( TA/YANG DO PÉ ) - 363').trim(), 'Beneficia o nariz.');
  assert.equal(stripRunningHeads('palmas das mãos, ( ) - 285 distúrbios').replace(/\s+/g, ' ').trim(), 'palmas das mãos, distúrbios');
  assert.equal(
    stripRunningHeads('Coração., CANAL DE ENERGIA DO CORAÇÃO (SHAOYIN DA MÃO) - 285 Fortalece').replace(/\s+/g, ' ').trim(),
    'Coração., Fortalece',
  );
});

test('corrige OCR inequivoco de termos clinicos', () => {
  assert.equal(cleanField('Faz a li1npcza do Ca l or do Coração'), 'Faz a limpeza do Calor do Coração');
  assert.equal(cleanField('transforma a Mu cosidade'), 'transforma a Mucosidade');
  assert.equal(cleanField('o tendão do mllsculo flexor'), 'o tendão do músculo flexor');
  assert.equal(cleanField('e Yi11 do Coração'), 'e Yin do Coração');
  assert.equal(cleanField('1:S c un lateral'), '1,5 cun lateral');
  assert.equal(cleanField('inserção medial cm direção'), 'inserção medial em direção');
  assert.equal(cleanField('palpitação e lfngua pálida'), 'palpitação e língua pálida');
});

test('corrige ruidos comuns do VB20 sem inventar conteudo clinico', () => {
  assert.equal(
    cleanField('lização A partir da linha mediana, deslizar o d edo na margem do occipúcio, até u ma depressão, antes da inserção do músculo cstcmoclcidomastóideo.'),
    'A partir da linha mediana, deslizar o dedo na margem do occipúcio, até uma depressão, antes da inserção do músculo esternocleidomastóideo.',
  );
  assert.equal(
    cleanField('Região lateral e posterior do pescoço, entre a tubcrosidadc occipital externa e o processo mastóidoo.'),
    'Região lateral e posterior do pescoço, entre a tuberosidade occipital externa e o processo mastóideo.',
  );
  assert.equal(
    cleanField('Nota de localizacao: lização A partir da linha mediana, deslizar o d edo.'),
    'Nota de localização: A partir da linha mediana, deslizar o dedo.',
  );
  assert.equal(
    cleanField("e nxaqueca, iridocicUte, retioite, rin ite, atrofia 'l' do ne.rvo óptico, conjuntivite,.,., glaucoma, doenças ' cerebrais, transtor-nos mentais, des maios"),
    'enxaqueca, iridociclite, retinite, rinite, atrofia do nervo óptico, conjuntivite, glaucoma, doenças cerebrais, transtornos mentais, desmaios',
  );
});

test('corrige ruidos comuns do TA5/Waiguan sem inventar conteudo clinico', () => {
  assert.equal(
    cleanField('Fa ce dorsal do antebraço, na linha que une o SJ-4 (Ya11gch1) e a ponta da face lateral do epioôndilo do úmero, no punho, e nue rádio e ulna.'),
    'Face dorsal do antebraço, na linha que une o SJ-4 (Yangchi) e a ponta da face lateral do epicôndilo do úmero, no punho, entre rádio e ulna.',
  );
  assert.equal(
    cleanField('Harmoni za o Qi do San Jiao., Re laxa e fortalece os tendões., Beneficia a cabeça e o ouvido., CANAL OE ENERGIA DO SAN ]/'),
    'Harmoniza o Qi do San Jiao. Relaxa e fortalece os tendões. Beneficia a cabeça e o ouvido.',
  );
  assert.equal(
    cleanField('conjuntivit e, parotidite epidêm.ica, anralgias, dor nas articulações/ paralisia dos membros superiores, transtornos 1 notores de cotovelo e braço. dor torácica'),
    'conjuntivite, parotidite epidêmica, artralgias, dor nas articulações, paralisia dos membros superiores, transtornos motores de cotovelo e braço, dor torácica',
  );
  assert.equal(
    cleanField('Nota de localizacao: lir.ação Situa-se entre o tendão do músculo exten sor comum dos dedos, oposto a Pc-6 (Neigua11), no espaço da aniculação da mão.'),
    'Nota de localização: Situa-se entre o tendão do músculo extensor comum dos dedos, oposto a Pc-6 (Neiguan), no espaço da articulação da mão.',
  );
});

test('corrige ruidos do primeiro lote prioritario de pontos comuns', () => {
  assert.equal(
    cleanField('Regula Chong e Ren Mai, ton ifi ca e reforça o Qi do Rim, harmoniza oJíao In fe rior, harmoniza o Qí do iltero. RCN MAi ( ) 749'),
    'Regula Chong e Ren Mai, tonifica e reforça o Qi do Rim, harmoniza o Jiao Inferior, harmoniza o Qi do útero.',
  );
  assert.equal(
    cleanField('gastri te aguda, aliviada após ingestã o de alimentos, di senteria, estufa1nentofdor/diste ns ão abdon1inal, doença ccrebrovascular, d istú rbios mentais, convul sões'),
    'gastrite aguda, aliviada após ingestão de alimentos, disenteria, estufamento/dor/distensão abdominal, doença cerebrovascular, distúrbios mentais, convulsões',
  );
  assert.equal(
    cleanField('No abdome, 6 c1 m acima. No ta de lo calização Encontre o ângulo cstemocostal.'),
    'No abdome, 6 cun acima. Nota de localização Encontre o ângulo esternocostal.',
  );
  assert.equal(
    cleanField('Região toracoabdominal, oa linha mediana. Nota de lo calização, costel as, parte óssea só)jda (ver Cap. l,Ângulo estemocostal). Algumas fontes dizern; localiz.c o ponto.'),
    'Região toracoabdominal, na linha mediana. Nota de localização, costelas, parte óssea sólida (ver Cap. 1, Ângulo esternocostal). Algumas fontes dizem; localize o ponto.',
  );
  assert.equal(
    cleanField('Tonilica,harmoniza,difund ee regula o Qi do Pulmão, interrompe a tosse e a. 1 ivia a asma.'),
    'Tonifica, harmoniza, difunde e regula o Qi do Pulmão, interrompe a tosse e alivia a asma.',
  );
  assert.equal(
    cleanField('Nota tk localiwção. Vesícula BiJiar, articuJações. ionadas ao fígado. Exempl-0s de combinações, lG-11, Ren- 14,C-7,Ba-6,F-3,1G-34:depressão., SJ-6: elimi na estagnação. relaxamento de múscu los e tendões. VI Ponto Mar (H e), Influência (Hu i), 1 a2cun.'),
    'Nota de localização. Vesícula Biliar, articulações. relacionadas ao fígado. Exemplos de combinações, IG-11, Ren-14, C-7, Ba-6, F-3, VB-34: depressão. SJ-6: elimina estagnação. relaxamento de músculos e tendões. Ponto Mar (He), Influência (Hui), 1 a 2 cun.',
  );
  assert.equal(
    cleanField('esquizofre-::h nia, 1 nemória S: fraca, prolapso de ãnus'),
    'esquizofrenia, memória fraca, prolapso de ânus',
  );
  assert.equal(
    cleanField('Pc-6 (N eiguan) - F ec hadura Interior; istema cardiovascular, doença cardfaca, pericarditc, tó-, rax, hipocôodrio, epiga5tralgia, hematêmcsc, bipertireoidismo, pós-histcrcctomia, SJ-5 (Waig11an), trat ar doenças ou l a 1,5 cun'),
    'Pc-6 (Neiguan) - Fechadura Interior; sistema cardiovascular, doença cardíaca, pericardite, tórax, hipocôndrio, epigastralgia, hematêmese, hipertireoidismo, pós-histerectomia, SJ-5 (Waiguan), tratar doenças ou 1 a 1,5 cun',
  );
  assert.equal(
    cleanField('palela, linha de co nexão. Nota de lo calização. Pacifica o EstômagoehannonÍ7.ao QidoJiaoMédio. Ponto de Acómulo ( X1).'),
    'patela, linha de conexão. Nota de localização. Pacifica o Estômago e harmoniza o Qi do Jiao Médio. Ponto de Acúmulo (Xi).',
  );
  assert.equal(
    cleanField('B- 35 (Dubi), Cap. l, E-38 (7íaokou), músculos exte nsor, mrugem da uôia, Slu111. r, Calor patogênico.:6, Es tômago. u CD u CD'),
    'E-35 (Dubi), Cap. 1, E-38 (Tiaokou), músculos extensor, margem da tíbia, Shen, Calor patogênico, Estômago.',
  );
  assert.equal(
    cleanField('O$ a 1,2 am, inseição perpendicular direto em relação à aitila; 1a 1,5am,inserçãooblíquaemdireçãoaoeotovelo. ]/'),
    '0,5 a 1,2 cun, inserção perpendicular direta em relação à axila; 1 a 1,5 cun, inserção oblíqua em direção ao cotovelo.',
  );
});

test('corrige ruidos do segundo lote de pontos comuns', () => {
  assert.equal(
    cleanField('Um dos ponLos mais importantes, usado para tonificação geral'),
    'Um dos pontos mais importantes, usado para tonificação geral',
  );
  assert.equal(
    cleanField("VB-8 (Shuaigu) - Segu.indo o Vale: bemicrania, venigem, hiperemia da conjuntÍV'd, espasmo infant il agudo"),
    'VB-8 (Shuaigu) - Seguindo o Vale: hemicrania, vertigem, hiperemia da conjuntiva, espasmo infantil agudo',
  );
  assert.equal(
    cleanField('horizontal j que passa pelo ponto Du-24 (Slienting), e0,5 cun posr.: terior à linha anterior. Na junção da ob !;; linha que une Du-24 (Slienting), Yang V ei Mai'),
    'horizontal que passa pelo ponto Du-24 (Shenting), e 0,5 cun posterior à linha anterior. Na junção da linha que une Du-24 (Shenting), Yang Wei Mai',
  );
  assert.equal(
    cleanField('restaura a consciêocia. Acrõmlo CV li CANA L 0[, Relaxa os tendões. Ponto de Encontro com o Yang V ei Mai e, segundo Deadrnan. 0,.5 a 1,2 cun, inserir an teriormente. Não puncionar mais que 1;l. cun.'),
    'restaura a consciência. Relaxa os tendões. Ponto de Encontro com o Yang Wei Mai e, segundo Deadman. 0,5 a 1,2 cun, inserir anteriormente. Não puncionar mais que 1,5 cun.',
  );
  assert.equal(
    cleanField('hemíplegia, dor no joelho, sí ndrome da obstrução dolorosa da bacia/tomo?.elo/canela/pema e coxa'),
    'hemiplegia, dor no joelho, síndrome da obstrução dolorosa da bacia/tornozelo/canela/perna e coxa',
  );
  assert.equal(
    cleanField("3 cu n acima de VB-34 (Yanglinquan) e lateral a E-35 (D11bí), margem superior da pare ia, entre f'êmur. ace lateral do joelho, fossa popUtea, intumcscimento, dificuldade de íl exionar ou esten- 6: der o joelho"),
    '3 cun acima de VB-34 (Yanglingquan) e lateral a E-35 (Dubi), margem superior da patela, entre fêmur. Face lateral do joelho, fossa poplítea, intumescimento, dificuldade de flexionar ou estender o joelho',
  );
  assert.equal(
    cleanField('lizar quatro dedos acima da proeminência do maléolo lateral, na margem anterior da fTbula. Tonifica a Essência e f orta lece músculos. dor/contratur.i.., de pescoço, ri nites, distensão/ ill dor, plenitude toráci-:, ca, doença bemarológica'),
    'Localizar quatro dedos acima da proeminência do maléolo lateral, na margem anterior da fíbula. Tonifica a Essência e fortalece músculos. dor/contratura de pescoço, rinites, distensão/dor, plenitude torácica, doença hematológica',
  );
});

test('corrige ruidos do terceiro lote de pontos comuns', () => {
  assert.equal(
    cleanField('ou 1 c 1111 aci ma da linha, entre os mdsculos. pares-... tesias, ob S: surdez, neurol óg ica. Lent ame nt e.'),
    'ou 1 cun acima da linha, entre os músculos. parestesias, surdez, neurológica. Lentamente.',
  );
  assert.equal(
    cleanField('Redu za fe bre, interrompe con vu lsões. l, febre com cefaleia, lontura.'),
    'Reduz a febre, interrompe convulsões. febre com cefaleia, tontura.',
  );
  assert.equal(
    cleanField('liuiç ã-0 O,5 cun acima de C-7 (Shenniet1). Nota de loc ali zação. O tendão toma-se evidente (ver Cap. l). Con1ção, funcionai s, palpitaçã o, sudoresc, tonsilitc, bematêmese, neurasteaia. 0,3 a0,5 cun; 0,5 a) Cllfl.'),
    '0,5 cun acima de C-7 (Shenmen). Nota de localização. O tendão torna-se evidente (ver Cap. 1). Coração, funcionais, palpitação, sudorese, tonsilite, hematêmese, neurastenia. 0,3 a 0,5 cun; 0,5 a 1 cun.',
  );
  assert.equal(
    cleanField('Na palma da mão, entre os ossos metacarpais TV e V.'),
    'Na palma da mão, entre os ossos metacarpais IV e V.',
  );
  assert.equal(
    cleanField('metatarsais JJ e rn. na depressão da trans ição. venigem, intermação, l convulsão infantil, dorde garganta, espasmo s/ paralisia, calor nos::, i pés, impotência,.. &, hipcnensão arterial, epileps ia. Ponto de Dispersão do Canal. R'),
    'metatarsais II e III. na depressão da transição. vertigem, intermação, convulsão infantil, dor de garganta, espasmos/paralisia, calor nos pés, impotência, hipertensão arterial, epilepsia. Ponto de Dispersão do Canal.',
  );
  assert.equal(
    cleanField('anteroinferio nn e nte, deprcs..;ão intr.i-articular, borda iafcrior, Ba-4 (Gongs1111). Aumenta o QidoJiao Inferior. 00, Refresca e remove "\' a Umidade.::: s, Elimina. ro, menstruação, miocardile, dor /co ngestão.'),
    'anteroinferiormente, depressão intra-articular, borda inferior, Ba-4 (Gongsun). Aumenta o Qi do Jiao Inferior. Refresca e remove a Umidade. Elimina. menstruação, miocardite, dor/congestão.',
  );
  assert.equal(
    cleanField('cnurese, colo ração, hipo cô ndrio s, he - patite, vertigen s, neurile sacra!, afccções oculares.congestão, h ér nia, fa cial, pardlisia, convu lsão, dist\\1rbios do son o. Ponto do Ca nal.'),
    'enurese, coloração, hipocôndrios, hepatite, vertigens, neurite sacral, afecções oculares, congestão, hérnia, facial, paralisia, convulsão, distúrbios do sono. Ponto do Canal.',
  );
});

test('corrige ruidos do quarto lote de pontos comuns', () => {
  assert.equal(
    cleanField('Ponto de En co ntro com os Cana is do lnt es ún o Delgado e da Bexiga e Yang W e/ Mar | Vento. ExempÚ s de combinações. IG-13: adenopatia cervical por tuberculose. IG'),
    'Ponto de Encontro com os Canais do Intestino Delgado e da Bexiga e Yang Wei Mai | Vento. Exemplos de combinações. IG-13: adenopatia cervical por tuberculose.',
  );
  assert.equal(
    cleanField('Ponto de Intersecção com o Yang Qiao Mai. / IG'),
    'Ponto de Intersecção com o Yang Qiao Mai.',
  );
  assert.equal(
    cleanField('milscu lo deltoide, Cal or do Yang111ing. ical tuberculosa, bemiplegia, dor por Vente -Umidade, desequihôrio motor, hiper- hidr<>- se axilar, hiperhidr - se axilar.'),
    'músculo deltoide, Calor do Yangming. Linfadenite cervical tuberculosa, hemiplegia, dor por Vento-Umidade, desequilíbrio motor, hiperhidrose axilar, hiperhidrose axilar.',
  );
  assert.equal(
    cleanField('1 cun superior e lateral a JGl 9. 0.2 a 0,3 cu 11, inserção obliqua. Traia ascaridíase, episraxe, neuralgias do trigêmeo (ramo Il ). / -- IG | Vento'),
    '1 cun superior e lateral a IG-19. 0,2 a 0,3 cun, inserção oblíqua. Trata ascaridíase, epistaxe, neuralgias do trigêmeo (ramo II). | Vento',
  );
  assert.equal(
    cleanField('l cun abaixo, Ponto Mudo Pulmão. p | Calor. tcnar, encon- t rar, cent ro, Pubnão, h emo pt ise, as ma, tubercul ose, inOamação, laringofaringit e, fe- "\'.o bre, te-:::i.o oossinuvite.'),
    '1 cun abaixo, Ponto Mu do Pulmão. | Calor. tenar, encontrar, centro, Pulmão, hemoptise, asma, tuberculose, inflamação, laringofaringite, febre, tenossinovite.',
  );
  assert.equal(
    cleanField('Ponto de Encontro com o Canal do Baço. p, Importante para o tratamento.'),
    'Ponto de Encontro com o Canal do Baço. Importante para o tratamento.',
  );
  assert.equal(
    cleanField('loc alir.açã o, sit ua-se, Pulmã o, orillcios, tosse cronica, parotiditc, p icose, iofantil, pard fazer, pan1 sangrar. p | Vento'),
    'localização, situa-se, Pulmão, orifícios, tosse crônica, parotidite, psicose, infantil, para fazer, para sangrar. | Vento',
  );
  assert.equal(
    cleanField('nexor radial. Nota de loc a/ir.ação C-7 (Shen 111 e11), encontn1r, Capí tulo 1. Desobst.rui. ansiedade in - tensa. Ponto Ri acho, Fonte ( Yiwn). ao lo ngo do túnel.'),
    'flexor radial. Nota de localização C-7 (Shenmen), encontrar, Capítulo 1. Desobstrui. ansiedade intensa. Ponto Riacho, Fonte (Yuan). ao longo do túnel.',
  );
  assert.equal(
    cleanField('enlre os ossos melacarpais TI em. N ola de localização Es te ponto. convulsõe.s. ostal, Lristeza, perda de l controle emocional. Ponto Manancia l do Cana l. Suo Si Miao. 1 1 | Shen'),
    'entre os ossos metacarpais II e III. Nota de localização Este ponto. convulsões. Neuralgia intercostal, tristeza, perda de controle emocional. Ponto Manancial do Canal. Sun Si Miao. | Shen',
  );
  assert.equal(
    cleanField('li1.llçiio Ponto distal. Ponto de Tonificaçiio do Canal. 1 1 | Vento. convulsões infanti s, palma da s mãos, fazer sa ngria com agul ha Lriangu lar.'),
    'Localização Ponto distal. Ponto de Tonificação do Canal. | Vento. convulsões infantis, palma das mãos, fazer sangria com agulha triangular.',
  );
  assert.equal(
    cleanField('tonüica e Hannoniza o Qi. ema reprodutor, fezes mol es, tórax e abdo1ne, empachamento epigástri-.o co, espennatorreia, dor/parcstesia, sudorcsc noturna. Rim. Ba | Calor'),
    'tonifica e Harmoniza o Qi. Afecções do sistema reprodutor, fezes moles, tórax e abdome, empachamento epigástrico, espermatorreia, dor/parestesia, sudorese noturna. Rim. | Calor',
  );
  assert.equal(
    cleanField('Face 11 1edial, maJéolo medial, Ba-9 (Yinlinquan). Nota de locali<.11ção abaixo de ste ponto. Método 1a1,5 cun. fonalecendo-o, meoorragia. Exemplos de combiflllfões Ba- 1 O, B-36: 101nbalgia. Ponto de Acúmulo (X1). Ba | Calor'),
    'Face medial, maléolo medial, Ba-9 (Yinlingquan). Nota de localização abaixo de este ponto. Método 1 a 1,5 cun. fortalecendo-o, menorragia. Exemplos de combinações Ba-1 O, B-36: lombalgia. Ponto de Acúmulo (Xi). | Calor',
  );
  assert.equal(
    cleanField("B-36: lombalgia. ' ' ' Ba-9 Ba"),
    'B-36: lombalgia.',
  );
  assert.equal(
    cleanField('joelho ílexionado, oôndilo medial da uôia, músculo sanório e VB-34 (Yanglinquan). Com o joelho Hexionado, des li ze ascendente1nente e1 n direção ao côodilo. Intestino s, Jioo Inferior, remo~do a Umidade, remo do a Umidade, enurese nocuma, pu s, co1n odor, arcrite reumática, Movimento Agua. Canal..,, Ba | Umidade'),
    'joelho flexionado, côndilo medial da tíbia, músculo sartório e VB-34 (Yanglingquan). Com o joelho Flexionado, deslize ascendentemente em direção ao côndilo. Intestinos, Jiao Inferior, removendo a Umidade, removendo a Umidade, enurese noturna, pus, com odor, artrite reumática, Movimento Água. Canal. | Umidade',
  );
  assert.equal(
    cleanField('Importante para eliminação da Umidade. / Ba'),
    'Importante para eliminação da Umidade.',
  );
});

test('corrige ruidos do quinto lote de pontos comuns', () => {
  assert.equal(
    cleanField('Nota de lo c a/ir.ação Nesta região, enco ntramse ramos de artéria e veia of tálmicas.'),
    'Nota de localização Nesta região, encontram-se ramos de artéria e veia oftálmicas.',
  );
  assert.equal(
    cleanField('0,3 a 0,5 cun, inserção horizontal em direção à articulação, ao ponto 10 (Q1wnliao) ou IG-20 (Yingxiang), etc.'),
    '0,3 a 0,5 cun, inserção horizontal em direção à articulação, ao ponto ID-18 (Quanliao) ou IG-20 (Yingxiang), etc.',
  );
  assert.equal(
    cleanField('s, dor ocular, lacrimcjamento, cpistaxe, innamação e dor.'),
    'Afecções oculares, dor ocular, lacrimejamento, epistaxe, inflamação e dor.',
  );
  assert.equal(
    cleanField('Fortalece os dentes, relaxa músculos faciais e faci- 1 ita a abertura da mandíbula e melhor.a o Qi da articulação te1nporomandibular (AT M). Dispersa Vento, Frio c limpa o Calor patogênico. Músc ul o masseter, Elimina o Vento da face e alivia espasmos c dor.'),
    'Fortalece os dentes, relaxa músculos faciais e facilita a abertura da mandíbula e melhora o Qi da articulação temporomandibular (ATM). Dispersa Vento, Frio e limpa o Calor patogênico. Músculo masseter, Elimina o Vento da face e alivia espasmos e dor.',
  );
  assert.equal(
    cleanField('Na face, distalmente ao osso zigomático, no centro da depressão entre a incisura da mandíbula ea borda inferior. Músculo mass et er (É) - 1 41, Melhora. la l,5 cun, E-6 (Jiaclie), ID-19 (Tinggo11g) ou ID-18 (Qua11/iao).'),
    'Na face, distalmente ao osso zigomático, no centro da depressão entre a incisura da mandíbula e a borda inferior. Músculo masseter Melhora. 1 a 1,5 cun, E-6 (Jiache), ID-19 (Tinggong) ou ID-18 (Quanliao).',
  );
  assert.equal(
    cleanField('Harmoniza a inversão do Qi e alivia a dor.....: i, Eleva. ", ":, Harmoniza, regula o Qi do Jiao Médio e elimina a i, estagnação alimentar. ca, dilatação gástrica.'),
    'Harmoniza a inversão do Qi e alivia a dor. Eleva. Harmoniza, regula o Qi do Jiao Médio e elimina a estagnação alimentar. Disfunção gástrica; dilatação gástrica.',
  );
  assert.equal(
    cleanField('Regula o Ouxo do Qi. Aquece o Jiao Inferio r. s: \'.. l!ii....:2 \'...... "\' -, Regula a menstruação.'),
    'Regula o fluxo do Qi. Aquece o Jiao Inferior. Regula a menstruação.',
  );
  assert.equal(
    cleanField('lizar com o joelho nexionado. foc inho. Alivia edema....:, !), Limpa. hos e suas partes moles. Exempl.o s de co mbinações, E-34, Ba-10, VB, E-36. JG-11, VB -34. Patela E'),
    'Localizar com o joelho flexionado. focinho. Alivia edema. Limpa. Doenças dos joelhos e suas partes moles. Exemplos de combinações, E-34, Ba-10, VB-34, E-36. IG-11, VB-34.',
  );
  assert.equal(
    cleanField('Na face antcrolatcral, margem a nt erior, tibial anteri or. ato gastrintestinal, cpigastralgia, crabalbos. 1a 2 cun.'),
    'Na face anterolateral, margem anterior, tibial anterior. Distúrbios do trato gastrintestinal, epigastralgia, trabalhos. 1 a 2 cun.',
  );
  assert.equal(
    cleanField('E-37 fica qu atro dedos. abdominal, hemiplegia, paralisia dos mc1 nbros inferiores, enteritc, dia.rrcia, di spneia. Estimulálo em todas as afccçõcs. 1 a 2 CU/1. / E'),
    'E-37 fica quatro dedos. Dor e distensão abdominal; hemiplegia, paralisia dos membros inferiores, enterite, diarreia, dispneia. Estimulá-lo em todas as afecções. 1 a 2 cun.',
  );
  assert.equal(
    cleanField('ante ri or. e crônica, fraqueza, transton1os musculares, escápu las, borboógmo, sangue.anemia. la2c 11n. / \\),'),
    'anterior. Enterites aguda e crônica, fraqueza, transtornos musculares, escápulas, borborigmo, sangue, anemia. 1 a 2 cun.',
  );
  assert.equal(
    cleanField('manei.ra. Fonalccc o Qi. adjaccnte, descquillôrio motor, rurofia muscular domembro inferior. a VB (Qiuxu) ou Ba-5 (Sha11gqí11).'),
    'maneira. Fortalece o Qi. adjacente, desequilíbrio motor, atrofia muscular do membro inferior. a VB-40 (Qiuxu) ou Ba-5 (Shangqiu).',
  );
  assert.equal(
    cleanField('cada superior, trigémeo, cntcritcs, do es tômago e do rnúsculo diafragr na. Exemplos de combinQfões, e 7· \' nso, -. L ma. "?, VB -41. TD - 18. gen-: t givitc. Canal.. \', Movimento Água. 1 1 E'),
    'Odontalgia da arcada superior, trigêmeo, enterites, do estômago e do músculo diafragma. Exemplos de combinações, VB-41. TD-18. gengivite. Canal. Movimento Água.',
  );
  assert.equal(
    cleanField('harmoniza o Qi. Elimina Calo r e Umidade. do, edema facial, odo ntalgia, epistax c, beparite, afta s. agu lha triangular.'),
    'Harmoniza o Qi. Elimina Calor e Umidade. Edema generalizado, edema facial, odontalgia, epistaxe, hepatite, aftas. agulha triangular.',
  );
});

test('corrige ruidos do sexto lote deep-curated de pontos comuns', () => {
  assert.equal(
    cleanField('Nota de loc ali wç ão Faça. Fun ções ene rg éticas, astenia ger il. Ponto de Abertura do Ren Mai. p, Ponto de Comando (Gao W11). (, I'),
    'Nota de localização Faça. Funções energéticas, astenia geral. Ponto de Abertura do Ren Mai. Ponto de Comando (Gao Wu).',
  );
  assert.equal(
    cleanField('Como ponto Shu do Canal Taiyin da M ão. gripe, re sfriado, mal -estar. tuberculo se pulmonar, odootalgia.'),
    'Como ponto Shu do Canal Taiyin da Mão. gripe, resfriado, mal-estar. tuberculose pulmonar, odontalgia.',
  );
  assert.equal(
    cleanField('I, Dcadman 1ai, 2001 (p. l 17). l11dic ações d or e dcscquillbrio motor, hemoplise.'),
    'Indicações dor e desequilíbrio motor, hemoptise.',
  );
  assert.equal(
    cleanField('Na margem superior da sínfise pdb ica. Nota de loc al izilção. loscrção perpendicular. J nserção oblíqua. R egu la as funções e n ergét ica do Cfwng M ai. Harmoniza o Qida Be xi ga, d os niú sc ulosedosteodões. I, 1 1 T 1 1 T 1'),
    'Na margem superior da sínfise púbica. Nota de localização. Inserção perpendicular. Inserção oblíqua. Regula as funções energéticas do Chong Mai. Harmoniza o Qi da Bexiga, dos músculos e dos tendões.',
  );
  assert.equal(
    cleanField('os reprodutores, dor em pênis e/ou testíc ul os.'),
    'Doenças dos órgãos reprodutores, dor em pênis e/ou testículos.',
  );
  assert.equal(
    cleanField('Nota de lo caliuição, flexor u ln ar. Esta região é va.scularízada pela artéria uloar. Bexil!a. 1 íngua, hemarúria, sangr.imento.'),
    'Nota de localização, flexor ulnar. Esta região é vascularizada pela artéria ulnar. Bexiga. língua, hematúria, sangramento.',
  );
  assert.equal(
    cleanField('0,8 a J,2 CUfl. Flln çõe s energéticas Dispersa o Ve nto patogênico e be ne fi cia o om bro. inftamação do s tecidos moles. Eumpl os de combinações, LD - 10, L D-3, ele 1r oacupuntura, 01 nbro, umeroescap ul ar, delto l de.'),
    '0,8 a 1,2 cun. Funções energéticas Dispersa o Vento patogênico e beneficia o ombro. inflamação dos tecidos moles. Exemplos de combinações, ID-10, ID-3, eletroacupuntura, ombro, umeroescapular, deltoide.',
  );
  assert.equal(
    cleanField('Dcsli: zc o dedo até a depressão siruada. sura da boca e dos o lh os, gengivi te, csclcrótica, trigêmco, espasrno. Auterocbe, Mu sculares Yang do Pé. ID'),
    'Deslize o dedo até a depressão situada. Desvio da comissura da boca e dos olhos, gengivite, esclerótica, trigêmeo, espasmo. Auteroche, Musculares Yang do Pé.',
  );
  assert.equal(
    cleanField("E4 (Dicang), IG (Yingxia11g), E-6 (Jiaclie). F1'nções energéticas."),
    'E-4 (Dicang), IG-20 (Yingxiang), E-6 (Jiache). Funções energéticas.',
  );
  assert.equal(
    cleanField("lize Du-16(Fengfu), depress ão0,5 cun. ce faleia do véni ce, re sfriado, obs trução nasal, d is túrbi os mentais, hi steria, con ce ntração. Exen1plos de con1binações, P-1 1, lD -3, JG-J l, L1 1 o'l.hen, li e Ili, forta lece, cé rebro."),
    'Localize Du-16 (Fengfu), depressão 0,5 cun. cefaleia do vértice, resfriado, obstrução nasal, distúrbios mentais, histeria, concentração. Exemplos de combinações, P-11, ID-3, IG-11, Luozhen, II e III, fortalece, cérebro.',
  );
});

test('corrige ruidos do setimo lote deep-curated de pontos comuns', () => {
  assert.equal(
    cleanField('vértebra torácica UI, 1,5 cun. Todos os pontos SIM Do W. slo. 0,5 a 0,8 c u11. F un ções energéticas Harmoniza o Qi cio Pulmão. Bahr" ai 2007 (p. 212). patogênica s. Ying Q1.'),
    'vértebra torácica III, 1,5 cun. Todos os pontos Shu Dorsais. 0,5 a 0,8 cun. Funções energéticas Harmoniza o Qi do Pulmão. patogênicas. Ying Qi.',
  );
  assert.equal(
    cleanField('processo espinhoso de T 1. vértebra torácica m quando. se nsação torác ica, eruc ta ção. Jin ye.'),
    'processo espinhoso de T I. vértebra torácica VII quando. sensação torácica, eructação. Jin ye.',
  );
  assert.equal(
    cleanField('Nota tk localização. Métodb 0,5 a 0,8 cun; l a l, S cun. epigastnllgia, bipocôndrio. Exemplos tk combinações. I.........: i 1 ('),
    'Nota de localização. Método 0,5 a 0,8 cun; 1 a 1,5 cun. epigastralgia, hipocôndrio. Exemplos de combinações.',
  );
  assert.equal(
    cleanField("espinha ilfaca po sterossupcrior e sacr.iis. sacra!. linha i mediana, mínimo gg sobre. Cada Uao ficará. Exemplos de co mbi11a ções, Eletroacupuoturaem B-31 a B-34, Rcn- 3. ijJ - J '. Forame saCl(ll ll l - Fu11ç ões e 11erg éticas. S;"),
    'espinha ilíaca posterossuperior e sacrais. sacral. linha mediana, mínimo sobre. Cada forame ficará. Exemplos de combinações, Eletroacupuntura em B-31 a B-34, Ren-3. Funções energéticas.',
  );
  assert.equal(
    cleanField('1,5 a 2,5 cun. Flln ções energéticas Regula o fluxo.'),
    '1,5 a 2,5 cun. Funções energéticas Regula o fluxo.',
  );
  assert.equal(
    cleanField('Relaxa os te nd õe s. Beneficia o ânu s, sangue na s fezes, prolapso ut erino, combinações Ml todo, membros infe ri ores, pann1rrilha. Funções energlticas a.livia dor, espamos, dcpressiio.'),
    'Relaxa os tendões. Beneficia o ânus, sangue nas fezes, prolapso uterino, combinações Método, membros inferiores, panturrilha. Funções energéticas alivia dor, espasmos, depressão.',
  );
  assert.equal(
    cleanField('On posteromedial face de ankle, na depressão entre prominence de maleolo medial e calcaneal tendon. odontaJgia, impotência sexua l, dor e inch aço, h cmopt i sc, sedc. Ponto Fonte (Ylllln) do Canal. 1 1, R i: a Loc a/ir.a ção À meia di stâ ncia. Nota de loc a/ir.a ção. vasculari1..ada. M éto do. Funções ene rg éticas. K1111/11n. Ytn. Ancor.i. harmo-. n1zando.'),
    'Face posteromedial do tornozelo, na depressão entre a proeminência do maléolo medial e o tendão do calcâneo. odontalgia, impotência sexual, dor e inchaço, hemoptise, sede. Ponto Fonte (Yuan) do Canal. Localização À meia distância. Nota de localização. vascularizada. Método. Funções energéticas. Kunlun. Yin. Ancora. harmonizando.',
  );
  assert.equal(
    cleanField('particularmente nos S, idosos. Exenip/ {)S de combinações. Ren-3: 1n enstruação irregular. sonolê ncia excessiva. doença epidérm.ica, polal ciúria, "!" insônia, f! tosse. R)(-'),
    'particularmente nos idosos. Exemplos de combinações. Ren-3: menstruação irregular. sonolência excessiva. doença epidérmica, polaciúria, insônia, tosse.',
  );
});

test('corrige ruidos do oitavo lote deep-curated de pontos comuns', () => {
  assert.equal(
    cleanField('c lavícula. Nota de /o cal iw ção. estimula Kidney Function Of Reception Of Qi. F1111 ções e11ergéticas: í Aumenta. Re so lve a tosse. função do R im. I 11di cações plcurisia, anrite c laviculoestemal.'),
    'clavícula. Nota de localização. estimula a função de recepção do Qi do Rim. Funções energéticas: Aumenta. Resolve a tosse. função do Rim. Indicações pleurisia, artrite claviculoesternal.',
  );
  assert.equal(
    cleanField('In anterior região de neck, posterior a ear lobe, na depressão anterior a inferior end de mastoid process. Ponto de Encontro com a Vesícu la Biliar.'),
    'Na região anterior do pescoço, posterior ao lóbulo da orelha, na depressão anterior à extremidade inferior do processo mastoideo. Ponto de Encontro com a Vesícula Biliar.',
  );
  assert.equal(
    cleanField('Venio, dor no i, j.... canto lateral do olho. Exemplos de combi 11 ações, si nusite. CANAL OE ENERGIA DA VESÍCULA Bllt, VI. Siga as 1 ncsn1as observações.'),
    'Vento, dor no canto lateral do olho. Exemplos de combinações, sinusite. Siga as mesmas observações.',
  );
  assert.equal(
    cleanField('Face l ater-.U da coxa, prega do joe lh o, entre o troca nt er 1 naior e a flbula. do r surda, cut âneo ge neralizado, anexit e. 1a2c un. F un çõ es energéticas.'),
    'Face lateral da coxa, prega do joelho, entre o trocanter maior e a fíbula. dor surda, cutâneo generalizado, anexite. 1 a 2 cun. Funções energéticas.',
  );
  assert.equal(
    cleanField('lado ex temo. intcrcostalgia, colccistitc, linfoadenit.c axilar, opa- $ cificação da córnea, pleuósia, fonalecimento. Ponto Fonte (Yi1an).'),
    'lado externo. intercostalgia, colecistite, linfoadenite axilar, opacificação da córnea, pleurisia, fortalecimento. Ponto Fonte (Yuan).',
  );
  assert.equal(
    cleanField('metatarsais rv e v. Nota de /o cfdiwção. atrás do t.endão. urctritc, dor espasmód ica no dor so do pé, síndro me.... da obstrução, lombal- S, gia, conjunlivite. Dai M ai. 0,3 a0,8 cun, circu la o Qi.'),
    'metatarsais IV e V. Nota de localização. atrás do tendão. uretrite, dor espasmódica no dorso do pé, síndrome da obstrução, lombalgia, conjuntivite. Dai Mai. 0,3 a 0,8 cun, circula o Qi.',
  );
  assert.equal(
    cleanField('Nota de /o c a/ir.ação, segund o dedo, pele venn. elha. il, epilepsia, ure1rite, visão rurva, transpiração noruma, eomissura da boca. 0,5 a 1 cun, in - serção. sangramcnto. Desobstru i o Qi. Umidade- -Calor.'),
    'Nota de localização, segundo dedo, pele vermelha. epilepsia, uretrite, visão turva, transpiração noturna, comissura da boca. 0,5 a 1 cun, inserção. sangramento. Desobstrui o Qi. Umidade-Calor.',
  );
  assert.equal(
    cleanField('dislância entre o maléolo. reiençllo urinária, dislensão e dor aoles da micção, prurido vuJvar, lcucorreia, gargan1a, dificuldade de e ngolir. Funções e 11 ergéticas. R emoveCalore Umidade do Ffgadoe fortalece Yin.'),
    'distância entre o maléolo. retenção urinária, distensão e dor antes da micção, prurido vulvar, leucorreia, garganta, dificuldade de engolir. Funções energéticas. Remove Calor e Umidade do Fígado e fortalece Yin.',
  );
  assert.deepEqual(
    collectDoubts('LR5', 'indications[0]', '', 'opressão torácica e nó na garganta'),
    [],
  );
});

test('corrige ruidos do nono lote deep-curated de pontos comuns', () => {
  assert.equal(
    cleanField("semitendín eo. Harmoniza o Qi do Fígado e dos Co laterais. R ev igora o Sangue. Jiao Inferior l Tonifica a função s, do Rim. emissão sem in al, impot l'.! ncia, leuc-0rreia, dis6- ria, en cerite. Ponto M ar. Tonificaçiío."),
    'semitendíneo. Harmoniza o Qi do Fígado e dos Colaterais. Revigora o Sangue. Jiao Inferior. Tonifica a função do Rim. emissão seminal, impotência, leucorreia, disúria, enterite. Ponto Mar. Tonificação.',
  );
  assert.equal(
    cleanField('inftexibilidade da costas, infiamação pélvica, emissão noturna, gg impotência, diarreia por Deficiência do:: l.o Rim.'),
    'inflexibilidade das costas, inflamação pélvica, emissão noturna, impotência, diarreia por Deficiência do Rim.',
  );
  assert.equal(
    cleanField('liwç ão Linha média das costas. dis pneia, hcmatêmese, início de furúnculos ecarbú nculos, patologia crô ni ca consumptiva, alucinações visuai s. Fllnções energéticas, acalma o Slien, nas cos tas.'),
    'Localização Linha média das costas. dispneia, hematêmese, início de furúnculos e carbúnculos, patologia crônica consumptiva, alucinações visuais. Funções energéticas, acalma o Shen, nas costas.',
  );
  assert.equal(
    cleanField('On lower abdomen, 3 B-cun inferior a centre de umbilicus, sobre a linha mediana anterior. hemorragia pós-part. o, infecção/inflamação do troto urinário, ascaridfase, sfndrome flácida, conibinações, emissão semi nal, dor puerperdl, síndrome Hácida, hematúria po li úria.'),
    'No abdome inferior, 3 cun abaixo do centro da cicatriz umbilical, sobre a linha mediana anterior. hemorragia pós-parto, infecção/inflamação do trato urinário, ascaridíase, síndrome flácida, combinações, emissão seminal, dor puerperal, síndrome flácida, hematúria poliúria.',
  );
  assert.equal(
    cleanField('1 / 1 - -, 1 Ren Li Ding, 1996 (p. 405). Determinação do ponto mé - dio. Chong Mai e dor e11 Mai. Y11a11 Qi. JiM Inferior. lntcstino Delgado. REN MAi {VASO CONCCPÇAO 751'),
    'Determinação do ponto médio. Chong Mai e Ren Mai. Yuan Qi. Jiao Inferior. Intestino Delgado.',
  );
  assert.equal(
    cleanField('se ão de plenjtude pós-prandial, parasitoscs. intestinais, indigestão fl atulência. / l 1. 1 a 2 c 1111.'),
    'sensação de plenitude pós-prandial, parasitoses intestinais, indigestão flatulência. 1 a 2 cun.',
  );
  assert.equal(
    cleanField('Nota de lo ca li zação. M ito do 1 a 1,5 cun. Funções energiticas Hrumoniza, rcgulacpromoveo Qi. vontade R ed ireciona. gastr.ilgia, esrupor, diafr.igmático. REN MAi {VASO CONCCPÇAOJ 769 - f::: i -. -. -.. Ren'),
    'Nota de localização. Método 1 a 1,5 cun. Funções energéticas Harmoniza, regula e promove o Qi. vontade Redireciona. gastralgia, estupor, diafragmático.',
  );
  assert.equal(
    cleanField('Na linha mediana do Ló ra.x, sobre o osso eslerno, entre os mamilo s, no cruzamenLo com a horizonlal traçada acima do espaço in1ercos1al IV. Qi Ln vertido, hipodesenvolvimen10 mamário, conslrição torácica, pcricardite. Sa11 Jiao e Grande nLo.'),
    'Na linha mediana do tórax, sobre o osso esterno, entre os mamilos, no cruzamento com a horizontal traçada acima do espaço intercostal IV. Qi invertido, hipodesenvolvimento mamário, constrição torácica, pericardite. San Jiao e Grande Luo.',
  );
  assert.deepEqual(
    collectDoubts('CV4', 'relatedPatterns[0]', '', 'Ba-1, Ba, E-36: hemorragia uterina disfuncional. Li Ding, 1996 (p. 405).'),
    [],
  );
  assert.deepEqual(
    collectDoubts('CV17', 'needling', '', '0,5 a 1 cun inferiormente ou em direção às mamas.'),
    [],
  );
});


test('remove virgula/ponto orfao inicial', () => {
  assert.equal(cleanField(', dor cardíaca, doença cardíaca'), 'dor cardíaca, doença cardíaca');
});

test('junta hifen de quebra de linha apenas em continuacao minuscula', () => {
  assert.equal(cleanField('para- lisia do músculo'), 'paralisia do músculo');
  assert.equal(cleanField('pro- blemas em ossos'), 'problemas em ossos');
  // NAO juntar quando a proxima palavra comeca com maiuscula (provavel item novo)
  assert.equal(cleanField('Frio., - Reduz o Calor'), 'Frio. - Reduz o Calor');
});

test('nao inventa: trechos ambiguos permanecem e viram duvida', () => {
  const cleaned = cleanField("Null'e Sangue e Yin");
  assert.match(cleaned, /Null'e Sangue/); // nao reescreve palpite
  const doubts = collectDoubts('HT7', 'indications', '', 'paralisia do músculo hloglosso, ní veis');
  const labels = doubts.map(d => d.label);
  assert.ok(labels.includes('possivel palavra quebrada por espaco'));
});

test('idempotente: limpar texto ja limpo nao muda', () => {
  const once = cleanField('Faz a li1npcza do Ca l or do Coração');
  assert.equal(cleanField(once), once);
});

test('documenta pontos retirados da planilha por fonte limpa', () => {
  const section = renderCleanSourceSection([
    { code: 'LI4', displayCode: 'IG-4', title: 'Hegu', clinicalSource: 'reocr_atlas', residualDoubtCount: 3 },
    { code: 'EXHN3', displayCode: 'EX-HN3', title: 'Yintang', clinicalSource: 'deep_curated_clean', residualDoubtCount: 0 },
  ]).join('\n');

  assert.match(section, /Pontos retirados da planilha de dúvidas por fonte limpa/);
  assert.match(section, /reocr_atlas/);
  assert.match(section, /deep_curated_clean/);
  assert.match(section, /`IG-4`/);
  assert.match(section, /`EX-HN3`/);
  assert.match(section, /3 sinais residuais/);
});

test('deep-curated limpo nao sobrepoe ponto ja resolvido por re-OCR do Atlas', () => {
  const deepCleanMap = new Map([['EXHN3', { code: 'EX-HN3' }]]);

  assert.equal(
    shouldPreferDeepClean({ code: 'EX-HN3', clinicalSource: 'reocr_atlas' }, 'EXHN3', deepCleanMap),
    false,
  );
  assert.equal(
    shouldPreferDeepClean({ code: 'EX-HN3', clinicalSource: 'deep_curated_clean' }, 'EXHN3', deepCleanMap),
    true,
  );
});
