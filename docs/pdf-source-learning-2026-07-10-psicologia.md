# Base local de psicologia para anamnese

Gerado em: 2026-07-10T19:02:50.614Z

## Escopo

- 5 PDFs locais processados na lane `psicologia`, alvo `anamnese-psicologia`.
- Todo material permanece `review` e `requiresProfessionalAudit: true`.
- Nenhum dado foi publicado no app clinico, Supabase ou bundle publico.
- Candidatos foram extraidos de modo conservador, por termos e trechos rastreaveis, sem diagnostico, scoring ou conduta automatica.

## Cobertura

| Fonte | Paginas | Com texto | Puladas | Flagged | Fallback | Perguntas | Eixos | Checklist | Risco | Referencias |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| psicologia-neuropsicologia-manual-cfp | 68 | 67 | 1 | 3 | 2 | 0 | 37 | 72 | 2 | 65 |
| psicologia-cid-11-transtornos-mentais | 233 | 233 | 0 | 3 | 3 | 19 | 220 | 455 | 14 | 232 |
| psicologia-transtornos-neurodesenvolvimento-cid-11 | 1 | 1 | 0 | 0 | 0 | 0 | 1 | 4 | 1 | 1 |
| psicologia-analise-comportamento-aplicada-tea | 396 | 395 | 1 | 43 | 17 | 61 | 242 | 479 | 14 | 393 |
| psicologia-dsm-5-tr-revisao-texto | 1381 | 1352 | 29 | 5 | 5 | 37 | 1489 | 3028 | 349 | 1339 |

## Totais

- Perguntas candidatas: 117
- Eixos/hipoteses/formulacao: 1989
- Itens de checklist: 4038
- Sinais de risco: 380
- Referencias para Biblioteca/RAG: 2030
- Paginas marcadas pela validacao: 54
- Paginas na fila de fallback de qualidade: 27 (1.3% do lote)

## Arquivos locais

- `frontend/.local-source-assets/pdf-sources/<fonte>/ocr/transcript.local.json`
- `frontend/.local-source-assets/pdf-sources/<fonte>/ocr/validation-report.local.json`
- `frontend/.local-source-assets/pdf-sources/knowledge/psicologia/*.local.json`

## Observacao

O PDF de ABA/TEA veio sem texto embutido e foi tratado por OCR local. Paginas na fila de fallback ficam em worksheet local para conferencia humana/visao antes de qualquer uso clinico. Paginas apenas marcadas por idioma/contexto ficam no relatorio de validacao, mas nao entram automaticamente no fallback de qualidade.
