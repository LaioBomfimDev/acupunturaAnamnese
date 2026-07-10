# Pontos comuns — lotes de correção OCR estrutural

Preparado para revisar os 32 pontos corporais que não estavam no pacote
`high-confidence-reviews.json` e dependem do registro em
`deep-curated-reviews.json`.

Critério: 4 lotes de 8 pontos, equilibrados por dificuldade estimada. A
pontuação considera título genérico/inglês, seção do PDF vazando para campo
errado, termo em inglês/AcuKG e resíduo OCR estrutural. Corrigir contra a fonte
do Atlas/PDF antes de manter `approved_local`.

## Lote 1

- `CV4` Guanyuan — título genérico; seção misturada; inglês/AcuKG; resíduo OCR.
- `BL10` Tianzhu — seção misturada; inglês/AcuKG; resíduo OCR.
- `CV13` Shangwan — título genérico; seção misturada; resíduo OCR.
- `KI6` Zhaohai — título genérico; seção misturada; resíduo OCR.
- `TE17` Yifeng — inglês/AcuKG; resíduo OCR.
- `GV4` Mingmen — resíduo OCR.
- `KI27` Shufu — seção misturada.
- `ST30` Qichong — seção misturada.

## Lote 2

- `BL17` Geshu — seção misturada; inglês/AcuKG; resíduo OCR.
- `GV12` Shenzhu — seção misturada; inglês/AcuKG; resíduo OCR.
- `GB41` Zulinqi — seção misturada; inglês/AcuKG; resíduo OCR.
- `LI16` Jugu — título genérico; seção misturada; inglês/AcuKG.
- `BL33` Zhongliao — seção misturada.
- `CV17` Shanzhong — título genérico; resíduo OCR.
- `LR2` Xingjian — seção misturada.
- `GB31` Fengshi — seção misturada.

## Lote 3

- `LU7` Lieque — seção misturada; inglês/AcuKG; resíduo OCR.
- `SI9` Jianzhen — título genérico; seção misturada; inglês/AcuKG.
- `BL21` Weishu — seção misturada; resíduo OCR.
- `BL57` Chengshan — seção misturada; resíduo OCR.
- `KI3` Taixi — seção misturada; resíduo OCR.
- `LR5` Ligou — seção misturada; resíduo OCR.
- `LU9` Taiyuan — resíduo OCR.
- `LR8` Ququan — resíduo OCR.

## Lote 4

- `BL13` Feishu — seção misturada; inglês/AcuKG; resíduo OCR.
- `GB15` Toulinqi — seção misturada; inglês/AcuKG; resíduo OCR.
- `BL36` Chengfu — título em inglês; seção misturada; inglês/AcuKG.
- `CV10` Xiawan — título genérico; seção misturada; inglês/AcuKG.
- `SP1` Yinbai — título genérico; resíduo OCR.
- `GB40` Qiuxu — resíduo OCR.
- `HT5` Tongli — seção misturada.
- `SI18` Quanliao — título genérico; seção misturada.

### Resultado do Lote 4 — 2026-07-07

- Corrigidos contra páginas renderizadas/texto do Atlas: `BL13`, `GB15`, `BL36`, `CV10`, `SP1`, `GB40`, `HT5`, `SI18`.
- Removidos títulos genéricos/inglês/AcuKG e seções coladas de `needling`/`actions`/`indications`.
- Os 8 permanecem `approved_local`, `approvalMode: local_only`, `clinicalSource: reocr_atlas`, `doubtCount: 0`, `requiresProfessionalAudit: true`.
- Regressão específica adicionada em `tools/knowledge/apply-common-points-reocr.test.mjs`.

## Lote 5 residual

- `CV6` Qihai — título em inglês/genérico; localização, método, funções e indicações ainda com resíduos estruturais.
- `CV23` Lianquan — título em inglês/genérico; cautela de moxa precisava ficar rastreada.
- `SI3` Houxi — título em inglês/genérico.
- `SP4` Gongsun — título em inglês/genérico.
- `ST25` Tianshu — título com OCR (`Pi vô`/`fianshu`).
- `SI10` Naoshu — título com OCR (`Umero` sem acento).
- `PC6` Neiguan — título e campos com OCR; cautela torácica vazada de outro contexto.
- `SP6` Sanyinjiao — título em inglês/OCR e campos colados em parágrafo único.

### Resultado do Lote 5 residual — 2026-07-07

- Corrigidos contra páginas renderizadas/texto do Atlas: `CV6`, `CV23`, `SI3`, `SP4`, `ST25`, `SI10`, `PC6`, `SP6`.
- Removidos títulos genéricos/inglês, OCR visível e campos colados em `actions`/`indications`.
- `PC6` recebeu substituição explícita de cautela porque a cautela torácica anterior não pertencia ao ponto; manteve aviso local sobre vasos descritos no Atlas.
- Os 8 ficam `approved_local`, `approvalMode: local_only`, `clinicalSource: reocr_atlas`, `doubtCount: 0`, `requiresProfessionalAudit: true`.
- Regressão específica adicionada em `tools/knowledge/apply-common-points-reocr.test.mjs`.

## Lote 6 residual

- `CV3` Zhongji — título em inglês; `relatedPatterns` e campos com vazamento estrutural.
- `CV12` Zhongwan — título em inglês; indicação truncada e OCR em `gastroptose`.
- `CV14` Juque — título em inglês; OCR e indicação de ducto biliar.
- `CV15` Jiuwei — título em inglês; OCR em funções/método e cautela de moxa a rastrear.
- `CV22` Tiantu — título em inglês; método/localização exigiam reOCR rastreado.
- `GB8` Shuaigu — título com OCR; `Hanyan`, vertigem e campos misturados.
- `GB21` Jianjing — título em inglês; OCR em método/funções/indicações e limite de profundidade a rastrear.
- `LI15` Jianyu — título em inglês/AcuKG; OCR em Vento-Umidade, hemiplegia e hiperhidrose.

### Resultado do Lote 6 residual — 2026-07-07

- Corrigidos contra páginas renderizadas/texto do Atlas: `CV3`, `CV12`, `CV14`, `CV15`, `CV22`, `GB8`, `GB21`, `LI15`.
- Removidos títulos genéricos/inglês/AcuKG, OCR pequeno e seções coladas de `locationText`, `needling`, `actions`, `indications` e `relatedPatterns`.
- `CV15` manteve cautela rastreada de moxabustão contraindicada segundo alguns clássicos; `GB21` registrou o limite de não puncionar mais que 1,5 cun.
- Os 8 ficam `approved_local`, `approvalMode: local_only`, `clinicalSource: reocr_atlas`, `doubtCount: 0`, `requiresProfessionalAudit: true`.
- Regressão específica adicionada em `tools/knowledge/apply-common-points-reocr.test.mjs`.

## Residual após Lote 6

- A varredura residual ampliada encontrou 10 candidatos reais restantes: `EXHN3`, `GB34`, `LI5`, `LI14`, `SI11`, `SP8`, `ST6`, `ST35`, `ST41`, `ST44`.
- Isso corresponde a 2 lotes finais: um lote de 8 e um lote pequeno de 2.
- Falsos positivos conferidos e excluídos desta contagem: `GV14` (`Du-14 (Dazhui) - Grande Vértebra`) e `ST25` (`E-25 (Tianshu) - Pivô Celeste`).

## Lote 7 residual

- `EXHN3` Yintang — título sem acento/duplicado e fallback `deep_curated_clean` sobrepondo o reOCR.
- `GB34` Yanglingquan — `Exemplos de combinações` colado em `indications`.
- `LI5` Yangxi — característica com OCR (`Ji11g`) em `relatedPatterns`.
- `LI14` Binao — `Exemplos de combinações` colado em `indications`.
- `SI11` Tianzong — localização vazada em `relatedPatterns` (`dis1ãncia`, `pon10`).
- `SP8` Diji — título divergente (`Fenda da Terra`) e `Exemplos de combinações` colado.
- `ST6` Jiache — título com OCR (`Angu.lo`) e indicação truncada.
- `ST35` Dubi — título com ruído (`/ l l 1 E`) e `Exemplos de combinações` colado.

### Resultado do Lote 7 residual — 2026-07-07

- Corrigidos contra páginas renderizadas/texto do Atlas: `EXHN3`, `GB34`, `LI5`, `LI14`, `SI11`, `SP8`, `ST6`, `ST35`.
- Removidos títulos antigos, OCR em características e cabeçalhos de combinações vazando para `indications`.
- `EXHN3` agora preserva `reocr_atlas` e não é mais sobrescrito por `deep_curated_clean`; o aplicador de reOCR grava `approved_local`/`local_only` explicitamente.
- Os 8 ficam `approved_local`, `approvalMode: local_only`, `clinicalSource: reocr_atlas`, `doubtCount: 0`, `requiresProfessionalAudit: true`.
- Regressões específicas adicionadas em `tools/knowledge/apply-common-points-reocr.test.mjs` e `tools/knowledge/clean-common-points-ocr.test.mjs`.

## Residual após Lote 7

- Restam 2 candidatos reais: `ST41` e `ST44`.
- Isso corresponde ao lote final pequeno.

## Lote 8 final

- `ST41` Jiexi — título em inglês/genérico (`Dispersing Stream`/`Ravine Divide`), resíduos de OCR em localização/método e cautela vascular a rastrear.
- `ST44` Neiting — `Exemplos de combinações` colado em `indications` e resíduos de combinação/OCR.

### Resultado do Lote 8 final — 2026-07-07

- Corrigidos contra páginas renderizadas/texto do Atlas: `ST41`, `ST44`.
- Removidos título genérico/inglês, OCR pequeno e cabeçalho de combinações vazando para `indications`.
- `ST41` recebeu cautela vascular local rastreada contra o Atlas, substituindo o texto anterior por aviso específico sobre artéria e veia tibiais anteriores.
- Os 2 ficam `approved_local`, `approvalMode: local_only`, `clinicalSource: reocr_atlas`, `doubtCount: 0`, `requiresProfessionalAudit: true`.
- Regressão específica adicionada em `tools/knowledge/apply-common-points-reocr.test.mjs`.

## Residual após Lote 8

- Restam 0 candidatos reais na varredura residual estrutural de pontos comuns.
- `high-confidence`: 0 pontos com dúvidas OCR.
- `deep-curated`: 0 pontos com dúvidas OCR.
- `reocr_atlas`: 89 pontos fonte; 57 aplicados em `high-confidence`, 89 aplicados em `deep-curated`.

## Observações

- Os candidatos estruturais podem aparecer no JSON local como `approved_local`, mas
  esta auditoria estrutural não os trata como prontos enquanto houver seção do
  PDF no campo errado ou conteúdo vindo de AcuKG/inferência local sem conferência
  contra a fonte.
- A correção deve separar `locationText`, `actions`, `indications`, `needling` e
  `relatedPatterns`, removendo títulos genéricos e termos em inglês quando a
  fonte pt-BR permitir.
- Depois de cada lote: rodar `node tools/knowledge/clean-common-points-ocr.mjs
  --dry`, regressões específicas e, antes de fechar, o gate do frontend.
