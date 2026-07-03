# Pontos comuns — dúvidas de OCR para revisão profissional

Gerado por `tools/knowledge/clean-common-points-ocr.mjs`. A limpeza automática
corrigiu ruído inequívoco; os trechos abaixo permaneceram suspeitos e **não foram
alterados** — exigem leitura do acupunturista contra o Atlas (nada foi inventado).

## Pontos retirados da planilha de dúvidas por fonte limpa

Os pontos abaixo não aparecem na lista de dúvidas porque seus campos clínicos
foram substituídos por uma fonte limpa rastreável. Isto não libera uso clínico
automático: todos continuam exigindo auditoria profissional final.

### deep_curated_clean — curadoria profunda limpa equivalente

- `EX-HN3` — EX-HN3 - Yintang (Palacio da Fronte)
- `EX-HN5` — EX-HN5 - Taiyang (Grande Yang)

### reocr_atlas — leitura direta/re-OCR manual do Atlas

- `BL12` — B-12 (Fengmen) - Porta do Vento (2 sinais residuais ignorados por fonte limpa)
- `BL15` — B-15 (Xinshu) - Ponto do Coração (1 sinal residual ignorado por fonte limpa)
- `BL18` — B-18 (Ganshu) - Ponto do Fígado (1 sinal residual ignorado por fonte limpa)
- `BL22` — B-22 (Sanjiaoshu) - Ponto do San Jiao (1 sinal residual ignorado por fonte limpa)
- `BL23` — B-23 (Shenshu) - Ponto do Rim (1 sinal residual ignorado por fonte limpa)
- `BL28` — B-28 (Pangguangshu) - Ponto da Bexiga
- `BL54` — B-54 (Zhibian) - Ordenar a Ponta
- `BL56` — B-56 (Chengjin) - Tendão do Suporte
- `BL67` — B-67 (Zhiyin) - Onde Começa o Yin (1 sinal residual ignorado por fonte limpa)
- `CV23` — CV23 (Lianquan) - Corner (Ridge) Spring
- `GV14` — Du-14 (Dazhui) - Grande Vértebra (1 sinal residual ignorado por fonte limpa)
- `KI7` — R-7 (Fuliu) - Corrente que Retorna
- `IG4` — IG-4 (Hegu) - Vale Circundado (1 sinal residual ignorado por fonte limpa)
- `LI5` — IG-5 (Yangxi) - Riacho do Yang (1 sinal residual ignorado por fonte limpa)
- `LI10` — LI10 (Shousanli) - Três Distâncias do Braço
- `IG11` — IG-11 (Quchi) - Lagoa Tortuosa (2 sinais residuais ignorados por fonte limpa)
- `SI3` — SI3 (Houxi) - Back Stream (Ravine) (2 sinais residuais ignorados por fonte limpa)
- `SI10` — ID-10 (Naoshu) - Ponto do Umero (1 sinal residual ignorado por fonte limpa)
- `SI11` — SI11 (Tianzong) - Convergência Celestial (2 sinais residuais ignorados por fonte limpa)
- `SP4` — SP4 (Gongsun) - Yellow Emperor (2 sinais residuais ignorados por fonte limpa)
- `SP10` — Ba-10 (Xuehai) - Mar do Sangue (1 sinal residual ignorado por fonte limpa)
- `ST25` — ST25 (Tianshu) - Pi vô Celeste (1 sinal residual ignorado por fonte limpa)
- `ST28` — ST28 (Shuidao) - Passagem da Água
- `TE3` — SJ-3 (Zhongzhu) - Ilha do Meio (2 sinais residuais ignorados por fonte limpa)

## BL11 — B-11 (Dazhu) - Grande Lançadeira
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…de En ergia…`
- **needling** (possivel palavra quebrada por espaco): `…em d ireção…`

## BL20 — B-20 (Pishu) - Ponto do Baço
- **locationText** (possivel palavra quebrada por espaco): `…torácica Xl…`
- **indications[0]** (possivel palavra quebrada por espaco): `…abdominai s distensão…`

## BL24 — B-24 (Qihaishu) - Ponto do Mar do Qi
- **locationText** (possivel palavra quebrada por espaco): `…lombar W…`
- **actions[0]** (possivel palavra quebrada por espaco): `…e Co laterais…`, `…Jiao In ferior…`
- **needling** (token com digito no meio de palavra): `a1`

## BL25 — B-25 (Dachanshu) - Ponto do Intestino Grosso
- **indications[0]** (possivel palavra quebrada por espaco): `…de co "ibinações…`

## BL26 — B-26 (Guanyuanshu) - Ponto do Portão da Essência
- **locationText** (possivel palavra quebrada por espaco): `…lombar V…`
- **actions[0]** (maiuscula no meio da palavra (OCR)): `fTc`
- **indications[0]** (token com digito no meio de palavra): `polil1ria`, `disl1ria`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Dorsal IJ do…`

## BL27 — B-27 (Xiaochangshu) - Ponto do Intestino Delgado
- **actions[0]** (possivel palavra quebrada por espaco): `…regu la e…`, `…do In tes…`, `…n1 za a…`
- **actions[0]** (token com digito no meio de palavra): `n1`
- **indications[0]** (token com digito no meio de palavra): `dis6ria`, `tun1a`
- **needling** (possivel palavra quebrada por espaco): `…cun l…`

## BL31 — B-31 (Shangliao) - Orifício Superior
- **locationText** (possivel palavra quebrada por espaco): `…1 c 1JT…`, `…sacral l e…`
- **locationText** (token com digito no meio de palavra): `1JT`
- **indications[0]** (possivel palavra quebrada por espaco): `…paralis ia de…`

## BL32 — B-32 (Ciliao) - Segu,ndo Orifício
- **actions[0]** (possivel palavra quebrada por espaco): `…joelho R eduz…`

## BL34 — B-34 (Xialiao) - Orifício Inferior
- **indications[0]** (possivel palavra quebrada por espaco): `…inferior di se…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Cana l de…`

## BL40 — B-40 (Weizhong) - Centro da Fossa Poplítea
- **locationText** (possivel palavra quebrada por espaco): `…loc al ização…`
- **locationText** (maiuscula no meio da palavra (OCR)): `nLe`
- **actions[0]** (maiuscula no meio da palavra (OCR)): `sLr`, `aLo`
- **indications[0]** (possivel palavra quebrada por espaco): `…convulsõe s febre…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Mar H e…`, `…de Ma Dan…`

## BL58 — B-58 (Feiyang) - Voar em Ascendência
- **locationText** (possivel palavra quebrada por espaco): `…vertic al que…`, `…B-57 C hei1gshan…`
- **locationText** (token com digito no meio de palavra): `hei1gshan`
- **actions[0]** (possivel palavra quebrada por espaco): `…ânu s trata…`
- **indications[0]** (maiuscula no meio da palavra (OCR)): `nLu`

## BL59 — B-59 (Fuyang) - Yang do Pé
- **actions[0]** (possivel palavra quebrada por espaco): `…da s pernas…`
- **relatedPatterns[0]** (token com digito no meio de palavra): `X1`
- **needling** (possivel palavra quebrada por espaco): `…a l Cllll…`
- **needling** (sequencia consonantal improvavel): `Cllll`

## BL60 — B-60 (Kunlun) - Grande e Alto
- **locationText** (possivel palavra quebrada por espaco): `…meia di stância…`
- **indications[0]** (possivel palavra quebrada por espaco): `…cervicalgia co ntratura…`, `…ozc lo calcanhar…`, `…pla ce ntária…`, `…e co nvulsões…`
- **indications[0]** (token com digito no meio de palavra): `cia1algia`, `1orn`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…de Ma Dan…`

## BL62 — B-62 (Shenmai) - Canal Estendido
- **locationText** (possivel palavra quebrada por espaco): `…Fa ce…`, `…Fa ce lateral…`, `…dcsliz ar o…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Sun Si Miao…`

## CV3 — CV3 (Zhongji) - Middle Extremity (Central Pole)
- **actions[0]** (possivel palavra quebrada por espaco): `…ifi ca e…`, `…oJíao In fe…`, `…In fe rior…`, `…o Qí do…`
- **actions[0]** (maiuscula no meio da palavra (OCR)): `oJí`
- **indications[0]** (possivel palavra quebrada por espaco): `…amenorreia di sme…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Alarme Mu da…`

## VC6 — VC6 (Qihai) - Sea of Qi
- **actions[0]** (possivel palavra quebrada por espaco): `…Harmoni za a…`
- **relatedPatterns[0]** (maiuscula no meio da palavra (OCR)): `nLo`

## VC12 — VC12 (Zhongwan) - Middle of Epigastrium
- **actions[0]** (possivel palavra quebrada por espaco): `…Qi Di spersa…`
- **indications[0]** (possivel palavra quebrada por espaco): `…diarreia di senteria…`, `…estufa1nentofdor/diste ns ão…`, `…ns ão abdon1inal…`, `…ccrebrovascular d istú…`
- **indications[0]** (token com digito no meio de palavra): `estufa1nentofdor`, `abdon1inal`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Alarme Mu do…`
- **needling** (possivel palavra quebrada por espaco): `…l a2cu…`, `…a2cu n…`
- **needling** (token com digito no meio de palavra): `a2cu`

## CV14 — CV14 (Juque) - Great Palace (Great Tower Gate)
- **locationText** (possivel palavra quebrada por espaco): `…c1 m acima…`, `…No ta de…`, `…de lo calização…`
- **locationText** (token com digito no meio de palavra): `c1`
- **actions[0]** (possivel palavra quebrada por espaco): `…tór ix e…`
- **indications[0]** (possivel palavra quebrada por espaco): `…palpitaçõe s insônia…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Alarme Mu do…`
- **needling** (possivel palavra quebrada por espaco): `…a l cun…`

## CV15 — CV15 (Jiuwei) - (Turtle) Dove Tail
- **locationText** (possivel palavra quebrada por espaco): `…toracoabdominal oa linha…`, `…de lo calização…`, `…Cap l Ângulo…`, `…localiz c o…`
- **indications[0]** (possivel palavra quebrada por espaco): `…náusea vô rnito…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Alarme Mu do…`

## CV22 — CV22 (Tiantu) - Heaven Projectio (Celestial Chimney)
- **actions[0]** (possivel palavra quebrada por espaco): `…difund ee regula…`
- **indications[0]** (possivel palavra quebrada por espaco): `…da s cordas…`, `…vocai s afonia…`
- **needling** (token com digito no meio de palavra): `penetrar0`

## GB8 — VB-8 (Shuaigu) - Segu.indo o Vale
- **indications[0]** (possivel palavra quebrada por espaco): `…infant il agudo…`

## GB13 — VB-13 (Benshen) - Origem do Espírito
- **locationText** (possivel palavra quebrada por espaco): `…horizontal j que…`, `…da ob !…`
- **locationText** (token com digito no meio de palavra): `e0`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Yang V ei…`, `…V ei Mai…`

## VB20 — VB-20 (Fengchi) - Lagoa dos Ventos
- **actions[0]** (possivel palavra quebrada por espaco): `…Remove s índromes…`
- **indications[0]** (possivel palavra quebrada por espaco): `…do ne rvo…`
- **indications[0]** (maiuscula no meio da palavra (OCR)): `cUt`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Yang V ei…`, `…V ei Mai…`

## GB21 — GB21 (Jianjing) - Shoulder Well
- **actions[0]** (possivel palavra quebrada por espaco): `…Acrõmlo CV li…`, `…CANA L 0[…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Yang V ei…`, `…V ei Mai…`
- **needling** (possivel palavra quebrada por espaco): `…ou an teriormente…`, `…1 l cun…`

## GB30 — VB-30 (Huantiao) - Salto em Círculo
- **indications[0]** (possivel palavra quebrada por espaco): `…joelho sí ndrome…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…de Ma Dan…`

## GB33 — VB-33 (Xiyangguan) - Lateral à Articulação do Joelho
- **locationText** (possivel palavra quebrada por espaco): `…3 cu n…`, `…cu n acima…`, `…pare ia entre…`
- **indications[0]** (possivel palavra quebrada por espaco): `…de íl exionar…`
- **indications[0]** (maiuscula no meio da palavra (OCR)): `pUt`

## VB34 — VB-34 (Yanglingquan) - Riacho do Monte Yang
- **locationText** (possivel palavra quebrada por espaco): `…Nota tk localiwção…`
- **actions[0]** (maiuscula no meio da palavra (OCR)): `iJi`, `uJa`
- **indications[0]** (token com digito no meio de palavra): `0s`, `1G`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Mar H e…`, `…Influência Hu i…`, `…Hu i da…`, `…de Ma Dan…`
- **needling** (token com digito no meio de palavra): `a2cun`

## GB39 — VB-39 (Xuanzong) - Sino Suspenso
- **locationText** (maiuscula no meio da palavra (OCR)): `fTb`
- **actions[0]** (possivel palavra quebrada por espaco): `…e f orta…`
- **indications[0]** (possivel palavra quebrada por espaco): `…dor/contratur i de…`, `…generalizada ri nites…`, `…toráci- ca sensação…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Influência Hu i…`, `…Hu i do…`

## GV16 — Du-16 (Fengfu) - Palácio dos Ventos
- **locationText** (possivel palavra quebrada por espaco): `…1 c 1111…`, `…aci ma da…`
- **indications[0]** (possivel palavra quebrada por espaco): `…súbita ob S…`, `…ob S surdez…`, `…neurol óg ica…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Sun Si Miao…`
- **needling** (possivel palavra quebrada por espaco): `…ame nt e…`, `…ou l a…`

## VG20 — Du-20 (Baihui) - Cem Encontros
- **indications[0]** (possivel palavra quebrada por espaco): `…esquizofre- h nia…`, `…nemória S fraca…`
- **indications[0]** (simbolo/ruido residual): `::h`

## GV24 — Du-24 (Shenting) - Pátio Espiritual
- **actions[0]** (possivel palavra quebrada por espaco): `…Redu za fe…`, `…za fe bre…`
- **indications[0]** (possivel palavra quebrada por espaco): `…l febre…`

## HT6 — C-6 (Yinxi) - Fenda do Yin
- **locationText** (possivel palavra quebrada por espaco): `…Cap l Tendão…`
- **locationText** (token com digito no meio de palavra): `Shenniet1`
- **actions[0]** (token com digito no meio de palavra): `Con1ção`
- **indications[0]** (possivel palavra quebrada por espaco): `…funcionai s angina…`
- **relatedPatterns[0]** (token com digito no meio de palavra): `X1`
- **needling** (token com digito no meio de palavra): `a0`
- **needling** (sequencia consonantal improvavel): `Cllfl`

## HT8 — C-8 (Shaofu) - Pequena Mansão
- **locationText** (possivel palavra quebrada por espaco): `…e V…`

## KI1 — R-1 (Yongquan) - Fonte Borbulhante
- **locationText** (possivel palavra quebrada por espaco): `…metatarsais JJ e…`, `…e rn na…`
- **indications[0]** (possivel palavra quebrada por espaco): `…intermação l convulsão…`, `…nos i pés…`, `…epileps ia letargia…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Canal R…`

## KI2 — R-2 (Rangu) - Osso Navicular
- **locationText** (possivel palavra quebrada por espaco): `…anteroinferio nn e…`, `…deprcs ão intr…`
- **actions[0]** (possivel palavra quebrada por espaco): `…Umidade s Elimina…`
- **actions[0]** (maiuscula no meio da palavra (OCR)): `oJi`
- **indications[0]** (possivel palavra quebrada por espaco): `…ro menstruação…`

## LI14 — IG-14 (Binao) - Proeminência Muscular do Braço
- **indications[0]** (possivel palavra quebrada por espaco): `…ExempÚ s de…`, `…tuberculose IG…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…de En co…`, `…En co ntro…`, `…Cana is do…`, `…lnt es ún…`, `…es ún o…`, `…Yang W e/…`

## LI15 — LI15 (Jianyu) - Shoulder Transporting Point (Shoulder Bone)
- **locationText** (possivel palavra quebrada por espaco): `…milscu lo deltoide…`, `…horizonte l cun…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…/ IG…`

## LI20 — IG-20 (Yingxiang) - Fragrância Acolhida
- **indications[0]** (possivel palavra quebrada por espaco): `…ramo Il prurido…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…-- IG…`
- **needling** (possivel palavra quebrada por espaco): `…3 cu 11…`

## F3 — F3 (Taichong) - Grande Jorrante
- **indications[0]** (possivel palavra quebrada por espaco): `…hipo cô ndrio…`, `…ndrio s dores…`, `…vertigen s neurile…`, `…turva h ér…`, `…h ér nia…`, `…paralisia fa cial…`
- **indications[0]** (token com digito no meio de palavra): `1rbios`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…do Ca nal…`, `…de Ma Dan…`

## LU1 — P-1 (Zhongfu) - Palácio Central
- **locationText** (possivel palavra quebrada por espaco): `…clavícula l cun…`
- **actions[0]** (possivel palavra quebrada por espaco): `…de ar Elimina…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Baço p Importante…`

## LU10 — P-10 (Yuji) - Eminência Tenar ou Borda do Peixe
- **locationText** (possivel palavra quebrada por espaco): `…de lo cal…`, `…cent ro…`
- **indications[0]** (possivel palavra quebrada por espaco): `…h emo…`, `…emo pt ise…`, `…as ma tubercul…`, `…te- i o…`
- **indications[0]** (maiuscula no meio da palavra (OCR)): `nOa`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Fogo p /…`

## LU11 — P-11 (Shaoshang) - Pequeno Mercador
- **indications[0]** (possivel palavra quebrada por espaco): `…ansiedade p icose…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Madeira p…`
- **needling** (token com digito no meio de palavra): `pan1`

## PC6 — Pc-6 (N eiguan) - F ec hadura Interior
- **locationText** (possivel palavra quebrada por espaco): `…de lo calização…`
- **indications[0]** (token com digito no meio de palavra): `epiga5tralgia`
- **indications[0]** (sequencia consonantal improvavel): `mcsc`
- **needling** (possivel palavra quebrada por espaco): `…trat ar doenças…`, `…ou l a…`

## PC7 — Pc-7 (Daling) - Grande Colina
- **locationText** (token com digito no meio de palavra): `encontn1r`
- **indications[0]** (possivel palavra quebrada por espaco): `…ansiedade in -…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Ponto Ri acho…`, `…Sun Si Miao…`
- **needling** (possivel palavra quebrada por espaco): `…ao lo ngo…`, `…tratar sí ndrome…`

## PC8 — Pc-8 (Laogong) - Templo do Trabalho
- **locationText** (possivel palavra quebrada por espaco): `…mão N ola…`, `…localização Es te…`
- **actions[0]** (possivel palavra quebrada por espaco): `…convulsõe s Elimina…`, `…consciência Di spersa…`
- **indications[0]** (possivel palavra quebrada por espaco): `…de l controle…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Manancia l Ying…`, `…Cana l Movimento…`, `…Suo Si Miao…`

## PC9 — Pc-9 (Zhongchong) - Meio do Movimento
- **locationText** (token com digito no meio de palavra): `li1`
- **indications[0]** (possivel palavra quebrada por espaco): `…infanti s pranto…`, `…da s mãos…`
- **needling** (possivel palavra quebrada por espaco): `…fazer sa ngria…`, `…agul ha Lriangu…`

## BP6 — BP6 (Sanyinjiao) - Three Yin Meeting
- **indications[0]** (possivel palavra quebrada por espaco): `…mol es com…`, `…o co prurido…`
- **indications[0]** (token com digito no meio de palavra): `abdo1ne`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Rim Ba…`

## SP8 — Ba-8 (Diji) - Fenda da Terra
- **locationText** (token com digito no meio de palavra): `1edial`
- **locationText** (maiuscula no meio da palavra (OCR)): `aJé`
- **indications[0]** (possivel palavra quebrada por espaco): `…Ba-9 Ba…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Canal Ba…`
- **relatedPatterns[0]** (token com digito no meio de palavra): `X1`

## BP9 — Ba-9 (Yinlingquan) - Fonte da Colina Yin
- **actions[0]** (possivel palavra quebrada por espaco): `…Intestino s Beneficia…`
- **indications[0]** (possivel palavra quebrada por espaco): `…com pu s…`, `…pu s muco…`
- **indications[0]** (token com digito no meio de palavra): `co1n`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…/ Ba…`

## ST2 — E-2 (Sibai) - Tudo Brilhando
- **locationText** (possivel palavra quebrada por espaco): `…de lo c…`, `…lo c a/ir…`, `…veia of tálmicas…`
- **locationText** (maiuscula no meio da palavra (OCR)): `rCa`
- **actions[0]** (possivel palavra quebrada por espaco): `…vis ão Relaxa…`
- **indications[0]** (possivel palavra quebrada por espaco): `…ramo I visão…`
- **needling** (token com digito no meio de palavra): `Q1wnliao`

## ST3 — E-3 (Juliao) - Grande Fenda
- **indications[0]** (possivel palavra quebrada por espaco): `…s dor…`

## ST6 — E-6 (Jiache) - Veículo do Angu.lo da Mandíbula
- **actions[0]** (possivel palavra quebrada por espaco): `…te1nporomandibular AT M…`, `…AT M Dispersa…`, `…Frio c limpa…`, `…Músc ul o…`, `…espasmos c dor…`
- **actions[0]** (token com digito no meio de palavra): `te1nporomandibular`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Sun Si Miao…`, `…da Ve sfcula…`
- **needling** (possivel palavra quebrada por espaco): `…E-4 Di cang…`

## ST7 — E-7 (Xianguan) - Barreira Inferior
- **locationText** (possivel palavra quebrada por espaco): `…mandíbula ea borda…`
- **actions[0]** (possivel palavra quebrada por espaco): `…mass et er…`, `…et er É…`
- **needling** (possivel palavra quebrada por espaco): `…perpendicular la l…`, `…la l 5…`

## ST21 — ST21 (Liangmen) - Porta do Alimento
- **actions[0]** (possivel palavra quebrada por espaco): `…dor i Eleva…`, `…a i estagnação…`
- **indications[0]** (possivel palavra quebrada por espaco): `…ca dilatação…`

## ST29 — ST29 (Guilai) - Retorno
- **actions[0]** (possivel palavra quebrada por espaco): `…Inferio r s…`, `…r s '…`

## ST34 — E-34 (Liangqiu) - Cume da Colina
- **locationText** (possivel palavra quebrada por espaco): `…de co nexão…`, `…de lo calização…`
- **actions[0]** (token com digito no meio de palavra): `EstômagoehannonÍ7`
- **actions[0]** (maiuscula no meio da palavra (OCR)): `oJi`, `oMé`
- **relatedPatterns[0]** (token com digito no meio de palavra): `X1`

## ST35 — E-35 (Dubi) - Nariz do Bezerro / l l 1 E
- **indications[0]** (possivel palavra quebrada por espaco): `…o s de…`, `…de co mbinações…`, `…Ba-10 VB E-36…`, `…E-36 VB -34…`

## E36 — E-36 (Zusanli) - Três Distâncias do Pé
- **locationText** (possivel palavra quebrada por espaco): `…a nt erior…`, `…anteri or e…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…Mar H e…`
- **needling** (token com digito no meio de palavra): `1a`

## ST37 — E-37 (Shangjuxu) - Grande Vazio Superior
- **locationText** (possivel palavra quebrada por espaco): `…fica qu atro…`
- **indications[0]** (possivel palavra quebrada por espaco): `…beribéri di spneia…`
- **indications[0]** (token com digito no meio de palavra): `mc1`

## ST39 — E-39 (Xiaojuxu) - Grande Vazio Inferior
- **locationText** (possivel palavra quebrada por espaco): `…ante ri or…`, `…ri or…`
- **indications[0]** (token com digito no meio de palavra): `transton1os`
- **needling** (token com digito no meio de palavra): `la2c`

## ST40 — E-40 (Fenglong) - Rico e Próspero
- **locationText** (possivel palavra quebrada por espaco): `…Cap l Determinação…`
- **locationText** (token com digito no meio de palavra): `7íaokou`
- **actions[0]** (possivel palavra quebrada por espaco): `…Slu111 r Elimina…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…do Es tômago…`, `…tômago u CD…`, `…u CD u…`, `…CD u CD…`, `…u CD…`

## ST41 — ST41 (Jiexi) - Dispersing Stream (Ravine Divide)
- **locationText** (possivel palavra quebrada por espaco): `…de lo calização…`, `…manei ra a…`
- **needling** (possivel palavra quebrada por espaco): `…a VB Qiuxu…`

## ST44 — E-44 (Neiting) - Sala Interna
- **indications[0]** (possivel palavra quebrada por espaco): `…do es tômago…`, `…- L ma…`, `…L ma Ba-6…`, `…"? VB -41…`, `…pelve TD -…`, `…gen- t givitc…`
- **indications[0]** (maiuscula no meio da palavra (OCR)): `nQf`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…de Ma Dan…`

## ST45 — E-45 (Lidui) - Porta Fundamental
- **actions[0]** (possivel palavra quebrada por espaco): `…Calo r e…`
- **indications[0]** (possivel palavra quebrada por espaco): `…epistax c paralisia…`, `…afta s perda…`

## TA5 — SJ-5 (Waiguan) - Fechadura Exterior
- **locationText** (possivel palavra quebrada por espaco): `…Fa ce…`, `…Fa ce dorsal…`
- **actions[0]** (possivel palavra quebrada por espaco): `…Harmoni za o…`, `…Mai Re laxa…`
- **relatedPatterns[0]** (possivel palavra quebrada por espaco): `…a es te…`

## TE14 — SJ-14 (Jialiao) - Fenda do Ombro
- **needling** (possivel palavra quebrada por espaco): `…2 am inseição…`
- **needling** (token com digito no meio de palavra): `1a`, `5am`
- **needling** (simbolo/ruido residual): `$`
