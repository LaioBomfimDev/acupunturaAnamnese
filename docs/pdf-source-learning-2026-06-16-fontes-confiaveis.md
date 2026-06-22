# Aprendizado local de PDFs por pagina

Gerado em: 2026-06-16T15:46:19.139Z

## Regra clinica

- 1118 paginas foram varridas pelo conector de pontos, dentro de 2513 paginas ingeridas de 8 PDFs.
- O resultado e evidencia candidata para curadoria, nao aprovacao clinica.
- Fichas de ponto permanecem em pt-BR; fonte nao-pt-BR exige sintese pt-BR revisada.
- Paginas/imagens continuam em `frontend/.local-source-assets`, fora do bundle principal.

## Fontes fora do scanner de pontos

Estas fontes foram ingeridas como biblioteca/rastreamento, mas nao foram varridas
pelo conector de pontos para evitar candidatos falsos em dominios especificos.

| Fonte | Paginas | Motivo |
| --- | ---: | --- |
| semiologia-da-lingua-completo | 295 | candidateExtractionPolicy sem varredura de pontos |
| microssistema-lingua | 103 | candidateExtractionPolicy sem varredura de pontos |
| diagnostico-medicina-chinesa-auteroche | 422 | candidateExtractionPolicy sem varredura de pontos |
| combinacoes-pontos-acupuntura-jeremy-ross | 511 | candidateExtractionPolicy sem varredura de pontos |
| classico-81-dificuldades-ebramec | 64 | candidateExtractionPolicy sem varredura de pontos |


## Cobertura de varredura

| Fonte | Paginas varridas | Paginas com texto/OCR |
| --- | ---: | ---: |
| atlas-guia-pratico-acupuntura-folcks | 702 | 702 |
| atlas-acupuntura-chinesa-meridianos-colaterais-auteroche | 269 | 155 |
| atlas-colorido-acupuntura-hecker | 147 | 147 |

## Pontos sistemicos/KM-Agent

- Links candidatos: 3514
- Pontos/registros conectados: 404
- Registros com fonte pt-BR elegivel para rascunho apos revisao: 404
- Registros com alguma fonte nao-pt-BR bloqueada para ficha: 0
- Registros com ao menos um link de alta confianca: 401
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte | Links candidatos |
| --- | ---: |
| atlas-acupuntura-chinesa-meridianos-colaterais-auteroche | 373 |
| atlas-colorido-acupuntura-hecker | 635 |
| atlas-guia-pratico-acupuntura-folcks | 2506 |

## Auriculoterapia

- Links candidatos auriculares: 0
- Alvos auriculares/protocolos conectados: 0
- Alvos com fonte pt-BR elegivel para rascunho apos revisao: 0
- Alvos com alguma fonte nao-pt-BR bloqueada para ficha: 0
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte auricular | Links candidatos |
| --- | ---: |


## Arquivos locais

- Links sistemicos: `frontend/.local-source-assets/pdf-sources/source-candidate-links.local.json`
- Links auriculares: `frontend/.local-source-assets/pdf-sources/auricular-candidate-links.local.json`
- Rascunhos de revisao: `frontend/.local-source-assets/pdf-sources/source-review-drafts.local.json`

## Observacao

As contagens representam conexoes por pagina/termo. Um ponto conectado ainda precisa de revisao humana para virar dado clinico aprovado.
