# Aprendizado local de conhecimento para anamnese

Gerado em: 2026-06-16T20:09:45.650Z

## Regra clinica

- Candidatos permanecem em `review` e exigem auditoria profissional.
- O app clinico nao foi alterado por este lote.
- Saidas locais ficam em `frontend/.local-source-assets/pdf-sources/knowledge/`.
- Fontes Tier C foram registradas como pendentes e nao geraram achado textual.
- Comando: `node tools/knowledge/extract-knowledge.mjs --tiers A,B --provider none`

## Contagens

| Tipo | Itens |
| --- | ---: |
| Achados clinicos | 255 |
| Perguntas de anamnese | 0 |
| Padroes/enriquecimentos | 251 |

## Cobertura por fonte

| Fonte | Tier | Acao | Paginas lidas | Achados | Perguntas | Padroes | Cobertura |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| atlas-guia-pratico-acupuntura-folcks | C | skipped_visual_pending | 0 | 0 | 0 | 0 | 0% |
| atlas-acupuntura-chinesa-meridianos-colaterais-auteroche | C | skipped_visual_pending | 0 | 0 | 0 | 0 | 0% |
| atlas-colorido-acupuntura-hecker | out_of_scope | skipped_not_selected | 0 | 0 | 0 | 0 | 0% |
| semiologia-da-lingua-completo | A | deterministic_section_parser | 293 | 255 | 0 | 251 | 100% |
| microssistema-lingua | C | skipped_visual_pending | 0 | 0 | 0 | 0 | 0% |
| diagnostico-medicina-chinesa-auteroche | B | dry_run_provider_none | 170 | 0 | 0 | 0 | 0% |
| combinacoes-pontos-acupuntura-jeremy-ross | B | dry_run_provider_none | 476 | 0 | 0 | 0 | 0% |
| classico-81-dificuldades-ebramec | B | dry_run_provider_none | 63 | 0 | 0 | 0 | 0% |

## Fontes visuais pendentes

- atlas-guia-pratico-acupuntura-folcks: OCR ruidoso; fonte visual pendente
- atlas-acupuntura-chinesa-meridianos-colaterais-auteroche: OCR ruidoso; fonte visual pendente
- microssistema-lingua: fonte visual/imagem; adiada para visao-OCR

## Arquivos locais

- `frontend/.local-source-assets/pdf-sources/knowledge/finding-candidates.local.json`
- `frontend/.local-source-assets/pdf-sources/knowledge/question-candidates.local.json`
- `frontend/.local-source-assets/pdf-sources/knowledge/pattern-candidates.local.json`
- `frontend/.local-source-assets/pdf-sources/knowledge/extract-knowledge-audit.local.json`
