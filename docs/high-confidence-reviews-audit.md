# Auditoria de qualidade — high-confidence-reviews.json

> Gerado por `tools/knowledge/audit-high-confidence-reviews.mjs` em 2026-06-23.
> Pacote local extraido por OCR do Atlas; exige curadoria profissional final.

## Resumo

- Total de registros: **341**
- ✅ Limpos: **207**
- ⚠️ Precisam limpeza (ainda utilizaveis): **120**
- ⛔ Em quarentena (bloqueados do raciocinio clinico): **14**

### Estado atual do pacote (apos correcoes ja aplicadas)
- `techniques` em lista limpa: **341/341**
- Titulos sem padrao generico "Ponto do meridiano": **341/341**

### Correcoes mecanicas nesta execucao (delta)
- `techniques` normalizado: **0** | banners removidos: **0** | titulos reconstruidos: **0**
> Zero no delta significa que o pacote ja foi auditado; rode com dados recem-gerados para ver os numeros completos.

## ⛔ Quarentena (revisar antes de qualquer uso clinico)

- **ATLAS-EXTRA-BICHONG** — Bichong (Meio do Antebraco)
  - empty_essential: indicacoes
  - misattributed: Trecho descreve Shixuan (insercao distal nas unhas / 10 pontos das pontas dos dedos), nao Bichong.
  - ocr_corruption: texto clinico com forte ruido de OCR
- **ATLAS-EXTRA-GENPING** — Genping (Seguir Lugar Plano)
  - empty_essential: acoes/funcoes, indicacoes, metodo/agulhamento
  - ocr_corruption: texto clinico com forte ruido de OCR
- **ATLAS-EXTRA-JIANMING** — Jianming (Fortalece o Brilho)
  - empty_essential: acoes/funcoes, indicacoes, metodo/agulhamento
  - ocr_corruption: texto clinico com forte ruido de OCR
- **ATLAS-EXTRA-JIANMING-N-1** — Jianming n. 1 (Fortalece o Brilho n. 1)
  - empty_essential: acoes/funcoes, indicacoes, metodo/agulhamento
  - misattributed: Trecho comeca em Shangjingming / B-1 (Jingming), nao Jianming n. 1.
  - ocr_corruption: texto clinico com forte ruido de OCR
- **ATLAS-EXTRA-JIANMING-N-3** — Jianming n. 3 (Fortalece o Brilho n. 3)
  - empty_essential: localizacao, acoes/funcoes, indicacoes, metodo/agulhamento
- **ATLAS-EXTRA-JIANXI** — Jianxi (Abaixo do Joelho)
  - empty_essential: localizacao, acoes/funcoes, indicacoes, metodo/agulhamento
- **ATLAS-EXTRA-SHANGJINGMING** — Shangjingming (Acima do Jingming)
  - empty_essential: acoes/funcoes, indicacoes, metodo/agulhamento
  - ocr_corruption: texto clinico com forte ruido de OCR
- **ATLAS-EXTRA-SHANGLIANQUAN** — Shanglianquan (Fonte de Agua Superior)
  - empty_essential: acoes/funcoes, indicacoes, metodo/agulhamento
  - ocr_corruption: texto clinico com forte ruido de OCR
- **EX-HN4** — EX-HN4 - Yuyao (Cintura do Peixe)
  - empty_essential: localizacao
  - ocr_corruption: texto clinico com forte ruido de OCR
- **EX-HN6** — EX-HN6 - Erjian (Apice da Orelha)
  - empty_essential: localizacao, indicacoes
  - misattributed: Trecho descreve nariz (rinite/sinusite/Shangyingxiang/Bitong); km-agent confirma EX-HN6 = Erjian (apice da orelha).
  - ocr_corruption: texto clinico com forte ruido de OCR
- **EX-HN8** — EX-HN8 - Shangyingxiang (Drenar o Nariz)
  - empty_essential: localizacao, indicacoes
  - ocr_corruption: texto clinico com forte ruido de OCR
- **EX-HN12** — EX-HN12 - Jinjin (Essencia Dourada)
  - empty_essential: localizacao, acoes/funcoes, indicacoes
- **EX-LE2** — EX-LE2 - Heding (No Topo da Testa da Garca)
  - empty_essential: localizacao, acoes/funcoes, indicacoes
- **EX-UE1** — EX-UE1 - Zhoujian (Ponta do Cotovelo)
  - empty_essential: localizacao, acoes/funcoes, indicacoes

## Registros por tipo de problema

### Campos essenciais vazios — 45

ATLAS-EXTRA-BICHONG, ATLAS-EXTRA-CHIQIAN, ATLAS-EXTRA-GENJIN, ATLAS-EXTRA-GENPING, ATLAS-EXTRA-JIACHENGJIANG, ATLAS-EXTRA-JIANMING, ATLAS-EXTRA-JIANMING-N-1, ATLAS-EXTRA-JIANMING-N-2, ATLAS-EXTRA-JIANMING-N-3, ATLAS-EXTRA-JIANNEILING-JIANQIAN, ATLAS-EXTRA-JIANXI, ATLAS-EXTRA-JINGBI, ATLAS-EXTRA-LINGHOU, ATLAS-EXTRA-LUOZHEN, ATLAS-EXTRA-MAIBU, ATLAS-EXTRA-NAOQING, ATLAS-EXTRA-QIANZHENG, ATLAS-EXTRA-QIMEN-EXTRA, ATLAS-EXTRA-SHANGJINGMING, ATLAS-EXTRA-SHANGLIANQUAN, ATLAS-EXTRA-SHANGMING, ATLAS-EXTRA-SHEZHU, ATLAS-EXTRA-TITUOXUE, ATLAS-EXTRA-WAIMING, ATLAS-EXTRA-XIAJINGMING, ATLAS-EXTRA-XIXIA, ATLAS-EXTRA-XUEYADIAN, ATLAS-EXTRA-YIJING, EX-B3, EX-CA1, EX-HN1, EX-HN4, EX-HN6, EX-HN7, EX-HN8, EX-HN11, EX-HN12, EX-HN13, EX-LE2, EX-LE6, EX-UE1, EX-UE3, EX-UE7, EX-UE9, EX-UE11

### Conteudo atribuido ao ponto errado — 3

ATLAS-EXTRA-BICHONG, ATLAS-EXTRA-JIANMING-N-1, EX-HN6

### OCR corrompido — 109

ATLAS-EXTRA-ANMIAN, ATLAS-EXTRA-BICHONG, ATLAS-EXTRA-GENJIN, ATLAS-EXTRA-GENPING, ATLAS-EXTRA-JIACHENGJIANG, ATLAS-EXTRA-JIANMING, ATLAS-EXTRA-JIANMING-N-1, ATLAS-EXTRA-JIANMING-N-2, ATLAS-EXTRA-JIANNEILING-JIANQIAN, ATLAS-EXTRA-JINGBI, ATLAS-EXTRA-LINGHOU, ATLAS-EXTRA-LUOZHEN, ATLAS-EXTRA-MAIBU, ATLAS-EXTRA-NAOQING, ATLAS-EXTRA-QIANZHENG, ATLAS-EXTRA-QIMEN-EXTRA, ATLAS-EXTRA-SANJIAOJIU, ATLAS-EXTRA-SHANGJINGMING, ATLAS-EXTRA-SHANGLIANQUAN, ATLAS-EXTRA-SHEZHU, ATLAS-EXTRA-SIQIANG, ATLAS-EXTRA-TITUOXUE, ATLAS-EXTRA-WEIBAO, ATLAS-EXTRA-WEISHANGXUE, ATLAS-EXTRA-XIAJINGMING, ATLAS-EXTRA-XIXIA, ATLAS-EXTRA-YIJING, BL6, BL9, BL23, BL26, BL27, BL28, BL39, BL40, BL53, BL56, BL58, BL59, BL63, BL67, CV12, EX-B1, EX-B2, EX-B3, EX-B4, EX-B7, EX-B8, EX-B9, EX-CA1, EX-HN1, EX-HN3, EX-HN4, EX-HN5, EX-HN6, EX-HN7, EX-HN8, EX-HN13, EX-HN14, EX-HN15, EX-LE3, EX-LE4, EX-LE5, EX-LE6, EX-LE7, EX-LE10, EX-UE7, EX-UE9, EX-UE10, EX-UE11, GB10, GB11, GB17, GB34, GV1, GV19, GV21, GV23, GV27, HT4, HT6, KI8, KI10, KI14, KI16, LI4, LI5, LI11, LR3, LR7, LR14, PC3, PC6, SI5, SI11, SI19, SP8, SP11, SP15, SP21, ST8, ST16, ST25, ST32, ST33, ST44, TE8, TE16, TE21

### Campos misturados — 10

ATLAS-EXTRA-JIACHENGJIANG, ATLAS-EXTRA-LUOZHEN, ATLAS-EXTRA-QIMEN-EXTRA, ATLAS-EXTRA-XIXIA, EX-HN5, EX-HN14, EX-UE7, EX-UE10, SP3, ST34

### Cabecalho/rodape do PDF nos dados — 16

BL2, BL9, BL18, BL20, BL27, BL30, BL64, GB6, GB21, LR3, LR13, SP3, SP5, SP14, ST1, ST4

### Titulo generico ou com lixo de OCR — 0
## Titulos reconstruidos (antes → depois)

