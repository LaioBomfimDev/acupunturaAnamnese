# Aprendizado local de PDFs por pagina

Gerado em: 2026-06-19T18:48:41.789Z

## Regra clinica

- 2477 paginas foram varridas pelo conector de pontos, dentro de 5194 paginas ingeridas de 19 PDFs.
- 562 paginas de capa, sumario, front matter ou texto insuficiente foram ignoradas antes de gerar candidatos.
- O resultado e evidencia candidata para curadoria, nao aprovacao clinica.
- Fichas de ponto permanecem em pt-BR; fonte nao-pt-BR exige sintese pt-BR revisada.
- Paginas/imagens continuam em `frontend/.local-source-assets`, fora do bundle principal.

## Fontes fora do scanner de pontos

Estas fontes foram ingeridas como biblioteca/rastreamento, mas nao foram varridas
pelo conector de pontos para evitar candidatos falsos em dominios especificos.

| Fonte | Paginas | Motivo |
| --- | ---: | --- |
| acupuntura-chinesa-moxibustao | 373 | candidateExtractionPolicy sem varredura de pontos |
| classico-81-dificuldades-ebramec | 64 | candidateExtractionPolicy sem varredura de pontos |
| combinacoes-pontos-acupuntura-jeremy-ross | 511 | candidateExtractionPolicy sem varredura de pontos |
| diagnostico-medicina-chinesa-auteroche | 422 | candidateExtractionPolicy sem varredura de pontos |
| dietoterapia-chinesa-corpo-mente-espirito | 197 | candidateExtractionPolicy sem varredura de pontos |
| ebook-ervas-medicinais | 440 | candidateExtractionPolicy sem varredura de pontos |
| manual-acupuntura-laser-sanagua | 81 | candidateExtractionPolicy sem varredura de pontos |
| microssistema-lingua | 103 | candidateExtractionPolicy sem varredura de pontos |
| semiologia-da-lingua-completo | 295 | candidateExtractionPolicy sem varredura de pontos |
| sistema-chines-curas-alimentares | 231 | candidateExtractionPolicy sem varredura de pontos |


## Cobertura de varredura

| Fonte | Paginas varridas | Paginas com texto/OCR | Paginas ignoradas |
| --- | ---: | ---: | ---: |
| huang-acupuncture-fibromyalgia-stroke-cohort | 15 | 15 | 1 |
| atlas-colorido-acupuntura-hecker | 147 | 147 | 9 |
| atlas-acupuntura-chinesa-meridianos-colaterais-auteroche | 269 | 241 | 81 |
| atlas-guia-pratico-acupuntura-folcks | 702 | 702 | 27 |
| long-acupuncture-trials-risk-of-bias | 12 | 12 | 1 |
| sumiko-ear-acupuncture-clinical-treatment | 480 | 472 | 273 |
| livro-acupuntura-auricular | 108 | 108 | 27 |
| scavone-manual-auriculoterapia | 372 | 349 | 94 |
| ednea-garcia-guia-ilustrado-referencia | 372 | 369 | 49 |

## Pontos sistemicos/KM-Agent

- Links candidatos: 8718
- Pontos/registros conectados: 408
- Registros com fonte pt-BR elegivel para rascunho apos revisao: 408
- Registros com alguma fonte nao-pt-BR bloqueada para ficha: 3
- Registros com ao menos um link de alta confianca: 407
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte | Links candidatos |
| --- | ---: |
| atlas-acupuntura-chinesa-meridianos-colaterais-auteroche | 707 |
| atlas-colorido-acupuntura-hecker | 631 |
| atlas-guia-pratico-acupuntura-folcks | 2504 |
| ednea-garcia-guia-ilustrado-referencia | 4840 |
| huang-acupuncture-fibromyalgia-stroke-cohort | 3 |
| livro-acupuntura-auricular | 21 |
| scavone-manual-auriculoterapia | 12 |

## Auriculoterapia

- Links candidatos auriculares: 1713
- Alvos auriculares/protocolos conectados: 86
- Alvos com fonte pt-BR elegivel para rascunho apos revisao: 86
- Alvos com alguma fonte nao-pt-BR bloqueada para ficha: 60
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte auricular | Links candidatos |
| --- | ---: |
| livro-acupuntura-auricular | 266 |
| scavone-manual-auriculoterapia | 712 |
| sumiko-ear-acupuncture-clinical-treatment | 735 |

## Arquivos locais

- Links sistemicos: `frontend/.local-source-assets/pdf-sources/source-candidate-links.local.json`
- Links auriculares: `frontend/.local-source-assets/pdf-sources/auricular-candidate-links.local.json`
- Rascunhos de revisao: `frontend/.local-source-assets/pdf-sources/source-review-drafts.local.json`

## Observacao

As contagens representam conexoes por pagina/termo. Um ponto conectado ainda precisa de revisao humana para virar dado clinico aprovado.
