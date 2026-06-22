# Catalogo inicial de PDFs novos - 2026-06-19

## Escopo e suposicao

- Lote analisado: `C:\Users\m\Downloads\PDFS acup`.
- A pasta `C:\Users\m\Downloads` nao tinha PDFs com `LastWriteTime` em 2026-06-19; por isso tratei "novos" como PDFs de acupuntura ainda fora do catalogo local.
- PDFs soltos com perfil de relatorio, ficha, nota, paciente, documento administrativo ou material nao bibliografico nao foram catalogados por privacidade e por nao serem fontes clinicas da Biblioteca Viva.
- Nenhum dado entrou em producao, ranking, ficha clinica ou Supabase.

## Pipeline atual revisado

- `tools/knowledge/ingest-local-pdf-sources.mjs`: le catalogo, extrai texto de PDF, opcionalmente renderiza paginas e faz OCR, gera `source-index.local.json` e manifests locais.
- `tools/knowledge/connect-pdf-source-candidates.mjs`: scanner raso de mencao de ponto. Ele cria vinculos pagina-ponto em `review`; nao extrai indicacoes, acoes, localizacao clinica nem tecnica.
- `tools/knowledge/extract-knowledge.mjs`: extractor semantico para anamnese/lingua/diagnostico. Com `provider none` faz dry-run/auditoria sem chamada LLM.
- Regra de seguranca preservada: tudo fica `review`, `requiresProfessionalAudit: true`, `automaticClinicalApprovals: 0`.

## Catalogo aplicado

Arquivo alterado: `frontend/.local-source-assets/pdf-sources/source-catalog.local.json`.

Alteracoes principais:

- Corrigidos caminhos locais de `semiologia-da-lingua-completo` e `microssistema-lingua` para os arquivos com prefixo `ok`.
- As 3 fontes de atlas ja existentes receberam explicitamente `knowledgeDomain`, `curationTarget` e `candidateExtractionPolicy`.
- Incluidas 27 novas fontes do lote `2026-06-19-catalogo-inicial-001`.
- Validacao do catalogo: 35 fontes, 0 chaves duplicadas, 0 caminhos quebrados, 0 fontes sem politica.

Distribuicao:

| Dominio | Fontes | Paginas |
| --- | ---: | ---: |
| `pontos_sistemicos` | 6 | 2014 |
| `diagnostico` | 13 | 4785 |
| `lingua` | 2 | 398 |
| `pulso` | 4 | 732 |
| `dietoterapia` | 3 | 621 |
| `fitoterapia` | 1 | 440 |
| `tecnicas_terapeuticas` | 4 | 1263 |
| `microssistemas` | 2 | 107 |

Politicas:

| Politica | Fontes | Decisao |
| --- | ---: | --- |
| `acupoint_candidate_scan` | 6 | Pode alimentar curadoria de ponto como candidato `review` apos ingestao completa. |
| `source_only_no_point_candidate_scan` | 29 | Fica fora do scanner de pontos; usar como fonte visual/rastreamento ou extractor proprio futuro. |

## Pode alimentar curadoria agora

Curadoria de ponto, sempre como candidato `review`, sem aprovacao automatica:

| Key | Fonte | Observacao |
| --- | --- | --- |
| `atlas-guia-pratico-acupuntura-folcks` | Atlas Guia Pratico Acupuntura - Folcks | Ja existia; OCR historicamente ruidoso, revisar trechos antes de aprovar. |
| `atlas-acupuntura-chinesa-meridianos-colaterais-auteroche` | Atlas de Acupuntura Chinesa - Meridianos e Colaterais | Ja existia; parte do texto/OCR pode ser ruidosa. |
| `atlas-colorido-acupuntura-hecker` | Atlas Colorido de Acupuntura | Ja existia; texto embutido melhor que OCR dos escaneados. |
| `anatomia-topografica-pontos-eachou-chen` | Anatomia Topografica dos Pontos de Acupuntura | Novo; elegivel para scanner de pontos apos ingestao completa. |
| `atlas-acupuntura-claudia-focks` | Atlas de Acupuntura | Novo; elegivel para scanner de pontos apos ingestao completa. |
| `atlas-grafico-acupuntura-seirin` | Atlas Grafico de Acupuntura Seirin | Novo; elegivel para scanner de pontos apos ingestao completa. |

Curadoria de lingua/anamnese:

- `semiologia-da-lingua-completo` permanece `source_only_no_point_candidate_scan`, mas ja e dominio correto para `modulo_lingua`. O pipeline semantico anterior ja conseguia gerar candidatos de lingua em `review`; nao entra no scanner de pontos.
- `microssistema-lingua` permanece fonte visual/source-only ate extractor visual/OCR proprio.

## Deve ficar source_only ou fonte visual

Diagnostico e raciocinio clinico MTC (`raciocinio_clinico_mtc`):

- `diagnostico-medicina-chinesa-auteroche`
- `combinacoes-pontos-acupuntura-jeremy-ross`
- `classico-81-dificuldades-ebramec`
- `casos-clinicos-acupuntura-china`
- `depressao-medicina-ocidental-mtc`
- `diagnostico-medicina-chinesa-guia-geral-maciocia`
- `essencia-medicina-chinesa-volume-1-sionneau`
- `pratica-medicina-chinesa-maciocia`
- `diagnostico-em-acupuntura`
- `diagnostico-diferencial`
- `diga-me-onde-doi`
- `dominio-do-yin-completo`
- `esp-101-enfermedades-acupuntura-moxibustion` (espanhol; exige sintese pt-BR revisada)

Pulso (`modulo_pulso`):

- `classico-do-pulso-mai-jing`
- `segredo-diagnostico-chines-pulso`
- `pulsologia-celso-yamamoto`
- `pulsologia-yamamoto`

Dietoterapia/fitoterapia:

- `dieta-yin-yang-joao-curvo`
- `dietoterapia-chinesa-corpo-mente-espirito`
- `sistema-chines-curas-alimentares`
- `ebook-ervas-medicinais`

Tecnicas e microssistemas:

- `arte-inserir-yamamura`
- `acupuntura-chinesa-moxibustao`
- `manual-acupuntura-laser-sanagua`
- `manual-pratico-acupuntura-saulo-wanderley`
- `craniopuntura-yamamoto`
- `pulso-e-tornozelo`

## Dry-runs executados

Ingestao completa em dry-run:

```powershell
node tools\knowledge\ingest-local-pdf-sources.mjs --catalog frontend\.local-source-assets\pdf-sources\source-catalog.local.json --dryRun --sources all
```

Resultado:

- 35 fontes
- 10.360 paginas
- 34 fontes pt-BR
- 1 fonte nao-pt-BR (`es`)
- 0 paginas renderizadas
- 0 OCR
- 0 manifests/imagens gravados pela execucao `--dryRun`

Ingestao temporaria segura para testar conectores:

```powershell
node tools\knowledge\ingest-local-pdf-sources.mjs --catalog frontend\.local-source-assets\pdf-sources\source-catalog.local.json --sources all --limit 1 --render none --ocr none --outputRoot .tmp\pdf-catalog-safety-20260619 --summary .tmp\pdf-catalog-safety-20260619-ingestion.md
```

Conector de pontos em diretorio temporario:

```powershell
node tools\knowledge\connect-pdf-source-candidates.mjs --pdfRoot .tmp\pdf-catalog-safety-20260619 --index .tmp\pdf-catalog-safety-20260619\source-index.local.json --links .tmp\pdf-catalog-safety-20260619\source-candidate-links.local.json --auricularLinks .tmp\pdf-catalog-safety-20260619\auricular-candidate-links.local.json --drafts .tmp\pdf-catalog-safety-20260619\source-review-drafts.local.json --summary .tmp\pdf-catalog-safety-20260619-learning.md
```

Resultado:

- 6 paginas escaneadas (1 pagina por atlas de ponto)
- 29 fontes puladas por `candidateExtractionPolicy`
- 2 vinculos candidatos de amostra (`BL1`, `LU1`) vindos de `atlas-acupuntura-claudia-focks`, pagina 1
- Os 2 vinculos parecem ruido de texto de pagina inicial, nao conteudo pronto para aprovacao
- `automaticClinicalApprovals: 0`

Extractor semantico em diretorio temporario:

```powershell
node tools\knowledge\extract-knowledge.mjs --dryRun --provider none --pdfRoot .tmp\pdf-catalog-safety-20260619 --index .tmp\pdf-catalog-safety-20260619\source-index.local.json --catalog frontend\.local-source-assets\pdf-sources\source-catalog.local.json --outDir .tmp\pdf-catalog-safety-20260619\knowledge --summary .tmp\pdf-catalog-safety-20260619-extract-knowledge.md --tiers A,B
```

Resultado:

- 35 fontes auditadas
- 0 achados clinicos
- 0 perguntas
- 0 padroes/enriquecimentos
- `provider: none`
- `appRuntimeTouched: false`

## Validacao

```powershell
node --test tools\knowledge\ingest-local-pdf-sources.test.mjs tools\knowledge\connect-pdf-source-candidates.test.mjs tools\knowledge\extract-knowledge.test.mjs
```

Resultado: 12 testes passaram.

## Proxima etapa segura

1. Rodar ingestao completa real apenas quando quiser gerar manifests, textos, paginas webp e OCR local.
2. Para os 3 novos atlas de pontos, revisar qualidade de texto/OCR antes de aceitar qualquer vinculo.
3. Para diagnostico, pulso, dietoterapia, fitoterapia, tecnicas e microssistemas, criar extractors especificos antes de qualquer uso clinico estruturado.
4. Nada deve ser migrado para Supabase/producao sem auditoria profissional e rastreabilidade de pagina/trecho/imagem.
