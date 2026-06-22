# Biblioteca Viva

Este documento registra a arquitetura inicial da Biblioteca Viva do AcupunturaAnamnese.

## Objetivo

A Biblioteca Viva e a fonte consultavel do sistema para pontos, sindromes, tecnicas, mapas, justificativas, alertas e relatorios. Ela deve alimentar o raciocinio clinico sem misturar conhecimento bibliografico com dados pessoais de pacientes.

## Principios de seguranca e dados

- Dados de pacientes permanecem em `clinical_records`, com o fluxo criptografado ja existente.
- Conhecimento clinico, fontes, coordenadas e regras ficam em tabelas separadas da camada de paciente.
- Importacoes externas entram como `draft` e precisam de revisao profissional antes de uso clinico.
- IA/RAG deve consultar apenas conteudo aprovado e devolver referencia de fonte/versao.
- O frontend nunca deve receber chave administrativa, service role key ou segredo de criptografia.
- Relatorios e prompts de IA devem usar o minimo necessario de dados do paciente.

## Camada local atual

Arquivos principais:

- `frontend/src/knowledge/knowledgeBase.js`: base viva inicial.
- `frontend/src/knowledge/protocolEngine.js`: monta protocolo a partir da base.
- `frontend/src/knowledge/safetyEngine.js`: regras basicas de cautela.
- `frontend/src/knowledge/mapLocations.js`: coordenadas calibradas dos mapas.
- `frontend/src/knowledge/searchIndex.js`: consulta usada pela tela Biblioteca.
- `frontend/src/knowledge/reportFragments.js`: textos de relatorio vindos da base.
- `tools/knowledge/import-km-agent-acupoints.py`: conversao revisavel do KM-Agent.

## Banco de dados planejado

A migration `supabase/migrations/20260527_living_library_knowledge_base.sql` cria:

- `knowledge_sources`
- `knowledge_entities`
- `knowledge_entity_versions`
- `point_locations`
- `knowledge_relationships`
- `safety_rules`
- `ingestion_batches`
- `knowledge_drafts`
- `knowledge_audit_log`

Usuarios autenticados leem conhecimento aprovado. SuperAdm gerencia importacao, rascunhos, versoes e auditoria.

## KM-Agent

O importador gera:

- `acupoints.raw.json`: todas as colunas originais do CSV.
- `acupoints.docs.json`: documentos normalizados para busca, embeddings e agentes.
- `acupoints.index.json`: indice leve para a interface da Biblioteca.
- `frontend/public/knowledge/km-agent/acupoints.index.json`: copia servida sob demanda pela interface, para nao pesar o bundle principal.

O arquivo atual importado contem 416 pontos como `draft`. Eles aparecem na Biblioteca
como `KM-Agent Draft`, mas nao alimentam protocolo, relatorio ou alertas ate revisao
e aprovacao profissional.

Exemplo:

```bash
C:\Users\m\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe tools\knowledge\import-km-agent-acupoints.py --csv caminho\para\km-agent\data\acupoints.csv
```

Nenhum item importado e aprovado automaticamente.

### Aprovacao local por alta confianca

Quando houver solicitacao explicita do operador, os candidatos KM-Agent/Atlas
com faixa `high` podem ser materializados como `approved_local` em ambiente
local. Esse fluxo nao publica no Supabase e nao substitui auditoria profissional
antes de migracao para producao.

Arquivo local usado pelo app em desenvolvimento:

```text
frontend/.local-source-assets/atlas-ednea/high-confidence-reviews.json
```

Geracao:

```bash
node tools/knowledge/approve-high-confidence-km-agent-reviews.mjs
```

As revisoes manuais salvas no navegador substituem o pacote automatico quando
o codigo do ponto e o mesmo.

### Curadoria profunda local

Para responder campos faltantes sem publicar dados clinicos em producao, use o
pacote de sugestoes locais:

```text
frontend/.local-source-assets/atlas-ednea/deep-curated-reviews.json
```

Geracao:

```bash
node tools/knowledge/deep-curate-km-agent-reviews.mjs
node tools/knowledge/approve-high-confidence-km-agent-reviews.mjs
```

Esse fluxo preenche lacunas por camadas de fonte: Atlas Ednea para pontos
classicos, padroes WHO/WPRO como referencia de nomenclatura/localizacao,
KM-Agent para pontos extras e AcuKG como sugestao nao revisada de acoes e
indicacoes. Termos chineses/coreanos de tecnica sao traduzidos por glossario
tecnico controlado e preservados como rastreio de curadoria.

## Fontes visuais do Atlas

O Atlas da Ednea Martins pode ser usado como fonte primaria para revisar pontos
KM-Agent, desde que a rastreabilidade seja preservada. A estrategia aprovada para
o upgrade e:

- extrair texto por pagina e manter indice `ponto -> pagina impressa -> pagina PDF`;
- renderizar paginas/imagens apenas como fonte de consulta e revisao;
- usar imagens otimizadas e carregadas sob demanda, fora do bundle principal;
- exibir a fonte visual primeiro em fluxos de SuperAdm/Biblioteca Viva;
- mostrar, no detalhe do ponto, uma aba ou painel `Fonte` com pagina/trecho do
  Atlas quando o usuario tiver permissao;
- manter dados clinicos normalizados separados da imagem da fonte;
- nao aprovar automaticamente conteudo extraido, OCR, KM-Agent, AcuKG ou
  coordenadas inferidas.

Antes de tornar imagens do Atlas publicas, revisar licenca, acesso, tamanho de
deploy e politica de armazenamento. Em producao, prefira storage protegido ou
geracao/cache sob demanda em vez de copiar todas as paginas para `public`.

### Render local de paginas do Atlas

O app carrega primeiro um manifesto local opcional:

```text
frontend/.local-source-assets/atlas-ednea/source-index.local.json
```

Se ele nao existir, usa o manifesto publico leve:

```text
frontend/public/knowledge/source-assets/atlas-ednea/source-index.json
```

Para renderizar um lote local de paginas em WebP:

```bash
node tools/knowledge/render-atlas-source-pages.mjs --codes LU1,LI4,ST36
```

As imagens locais ficam em `frontend/.local-source-assets/atlas-ednea/pages/`
e sao ignoradas pelo Git. Em desenvolvimento, o Vite serve essa pasta no mesmo
caminho publico usado pelo app. Esse fluxo serve para curadoria e demonstracao
local; antes de deploy, mover o armazenamento para um bucket/servico protegido
ou gerar as imagens sob demanda com controle de acesso.

## Registro de fontes complementares

- `docs/biblioteca-viva-curadoria-416-e-fontes-2026-06-04.md`: estado da
  curadoria dos 416 registros KM-Agent, diferenca entre base curada e aprovacao
  local, pendencias por grupo e triagem dos PDFs Langevin/pdf acuup recebidos em
  2026-06-04.
- `docs/pdf-source-ingestion-2026-06-05.md`: ingestao local dos novos PDFs
  recebidos em 2026-06-05, com manifestos, paginas renderizadas, OCR de fallback
  e gate de idioma para impedir texto nao-pt-BR nas fichas de ponto.

Comando de ingestao local:

```bash
node tools/knowledge/ingest-local-pdf-sources.mjs --sources all --ocr fallback --render missing --ocrNodeModules C:\tmp\sistema-acup-ocr\node_modules
```

Para novos lotes confiaveis, prefira catalogo local em vez de editar o script.
O catalogo fica fora do Git/bundle:

```text
frontend/.local-source-assets/pdf-sources/source-catalog.local.json
```

Exemplo para ingerir apenas o catalogo atual:

```bash
node tools/knowledge/ingest-local-pdf-sources.mjs --catalog frontend/.local-source-assets/pdf-sources/source-catalog.local.json --sources all --ocr fallback --render missing --ocrNodeModules C:\tmp\sistema-acup-ocr\node_modules
```

Cada fonte do catalogo deve declarar `key`, `title`, `authors`,
`originalLanguage`, `sourceType`, `path`, `trustTier`, `reference` ou nota de
referencia pendente, `licenseNote` e a politica de ativacao clinica. Mesmo atlas
confiavel entra primeiro como fonte forte de curadoria/rastreamento; ranking,
ficha de ponto e IA comum so usam conteudo aprovado explicitamente.

Fontes de lingua/semiologia usam o mesmo catalogo, mas com dominio proprio:

```json
{
  "knowledgeDomain": "lingua",
  "curationTarget": "modulo_lingua",
  "candidateExtractionPolicy": "source_only_no_point_candidate_scan"
}
```

Essa marcacao preserva paginas/trechos/imagens para curadoria do modulo Lingua
e impede que o conector de pontos sistemicos gere candidatos falsos por
coincidencia textual.

Fontes de diagnostico, classicos, principios terapeuticos e combinacoes de
pontos tambem ficam em dominio proprio ate existir um extrator especifico:

```json
{
  "knowledgeDomain": "diagnostico",
  "curationTarget": "raciocinio_clinico_mtc",
  "candidateExtractionPolicy": "source_only_no_point_candidate_scan"
}
```

Elas servem para ensinar o sistema a reconhecer padroes, diferenciar sindromes,
entender principios e justificar condutas. Mesmo quando citarem pontos, nao
alimentam ranking, protocolo ou ficha de ponto automaticamente.

Comando para varrer todas as paginas ingeridas e gerar conexoes candidatas por
ponto/fonte/pagina:

```bash
node tools/knowledge/connect-pdf-source-candidates.mjs
```

Esse conector gera apenas evidencias locais em `review`, mantendo aprovacao
clinica automatica em zero. Os resultados ficam em:

- `frontend/.local-source-assets/pdf-sources/source-candidate-links.local.json`
- `frontend/.local-source-assets/pdf-sources/auricular-candidate-links.local.json`
- `frontend/.local-source-assets/pdf-sources/source-review-drafts.local.json`
- `docs/pdf-source-learning-2026-06-05.md`

No SuperAdm, a secao `Fontes PDF` usa esses arquivos para priorizar pontos nao
respondidos, exibir pagina/trecho, gerar traducao pt-BR preliminar de fonte em
ingles e mostrar percentuais de confiabilidade. Salvar nessa tela cria apenas
rascunho local em `review`; aprovacao clinica e migracao para Supabase continuam
fora desse fluxo.

### Reset operacional das fontes PDF - 2026-06-16

Decisao: manter os aprendizados dos PDFs legados como evidencia separada, mas
sem ativacao clinica automatica. A Biblioteca clinica comum e a IA de consulta
usam base curada + aprovacoes confiaveis do Atlas Ednea; rascunhos KM-Agent,
PDFs legados, AcuKG e fontes em outros idiomas ficam restritos a SuperAdm /
Fontes PDF ate nova curadoria.

Regra atual:

- `atlas-ednea/*` continua sendo a fonte visual publica de referencia para
  pontos aprovados localmente.
- `pdf-sources/*` permanece como fonte protegida e fila de curadoria, mesmo
  quando houver paginas publicas ou PDFs publicos.
- qualquer revisao antiga salva como `approved_local` a partir de PDF/KM-Agent
  e normalizada como `review` em tempo de execucao, preservando os dados mas
  impedindo entrada no ranking, ficha do ponto e contexto da IA.
- novos PDFs confiaveis devem seguir o modelo do Atlas: catalogo da fonte,
  renderizacao por pagina, texto/OCR, indice ponto -> pagina/trecho/imagem,
  idioma declarado, referencia bibliografica, nivel de confianca, revisao
  profissional e so entao aprovacao local explicita.
