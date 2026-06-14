# Aprendizado local de PDFs por pagina

Gerado em: 2026-06-08T02:30:24.109Z

## Regra clinica

- Todas as 1359 paginas dos 6 PDFs foram varridas como fonte local.
- O resultado e evidencia candidata para curadoria, nao aprovacao clinica.
- Fichas de ponto permanecem em pt-BR; fonte nao-pt-BR exige sintese pt-BR revisada.
- Paginas/imagens continuam em `frontend/.local-source-assets`, fora do bundle principal.

## Cobertura de varredura

| Fonte | Paginas varridas | Paginas com texto/OCR |
| --- | ---: | ---: |
| sumiko-ear-acupuncture-clinical-treatment | 480 | 472 |
| scavone-manual-auriculoterapia | 372 | 349 |
| long-acupuncture-trials-risk-of-bias | 12 | 12 |
| huang-acupuncture-fibromyalgia-stroke-cohort | 15 | 15 |
| ednea-garcia-guia-ilustrado-referencia | 372 | 369 |
| livro-acupuntura-auricular | 108 | 108 |

## Pontos sistemicos/KM-Agent

- Links candidatos: 4937
- Pontos/registros conectados: 362
- Registros com fonte pt-BR elegivel para rascunho apos revisao: 362
- Registros com alguma fonte nao-pt-BR bloqueada para ficha: 9
- Registros com ao menos um link de alta confianca: 355
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte | Links candidatos |
| --- | ---: |
| ednea-garcia-guia-ilustrado-referencia | 4886 |
| huang-acupuncture-fibromyalgia-stroke-cohort | 3 |
| livro-acupuntura-auricular | 23 |
| long-acupuncture-trials-risk-of-bias | 1 |
| scavone-manual-auriculoterapia | 18 |
| sumiko-ear-acupuncture-clinical-treatment | 6 |

## Auriculoterapia

- Links candidatos auriculares: 2065
- Alvos auriculares/protocolos conectados: 86
- Alvos com fonte pt-BR elegivel para rascunho apos revisao: 86
- Alvos com alguma fonte nao-pt-BR bloqueada para ficha: 61
- Validacoes/aprovacoes clinicas automaticas: 0

| Fonte auricular | Links candidatos |
| --- | ---: |
| livro-acupuntura-auricular | 267 |
| scavone-manual-auriculoterapia | 792 |
| sumiko-ear-acupuncture-clinical-treatment | 1006 |

## Arquivos locais

- Links sistemicos: `frontend/.local-source-assets/pdf-sources/source-candidate-links.local.json`
- Links auriculares: `frontend/.local-source-assets/pdf-sources/auricular-candidate-links.local.json`
- Rascunhos de revisao: `frontend/.local-source-assets/pdf-sources/source-review-drafts.local.json`

## Observacao

As contagens representam conexoes por pagina/termo. Um ponto conectado ainda precisa de revisao humana para virar dado clinico aprovado.
