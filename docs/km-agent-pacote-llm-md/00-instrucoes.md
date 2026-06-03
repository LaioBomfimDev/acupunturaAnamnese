# Pacote KM-Agent para IA sem JSON

Este pacote existe porque algumas IAs recusam arquivos JSON grandes.
Use os arquivos Markdown de lote no lugar do JSON.

## Como enviar para a outra IA

1. Anexe o PDF clinico principal.
2. Anexe um lote por vez, por exemplo `lote-001.md`.
3. Peça para a IA responder preenchendo os campos abaixo de cada ponto.
4. Repita com os proximos lotes.

## Regra de fonte

1. O PDF clinico principal vem primeiro.
2. O contexto KM-Agent e rascunho.
3. AcuKG e apenas sugestao nao revisada.
4. Se nao houver evidencia, deixar campo vazio e explicar em `clinicalNote`.

## Campos a preencher

- `title`
- `techniques`
- `locationText`
- `actions`
- `indications`
- `cautions`
- `relatedPatterns`
- `needling`
- `clinicalNote`
- `references`
- `confidence`

Preserve sempre `IDENTIFICADOR`, `code`, `displayCode`, `meridianCode` e `meridian`, exceto se o PDF principal mostrar erro claro.

## Prompt curto sugerido

Preencha este lote de pontos de acupuntura em pt-BR usando primeiro o PDF clinico anexado. Use o contexto KM-Agent apenas como rascunho e AcuKG apenas como sugestao. Responda no mesmo formato do arquivo, mantendo o IDENTIFICADOR de cada ponto. Nao invente informacao clinica; quando nao houver fonte, deixe vazio e explique em clinicalNote.
