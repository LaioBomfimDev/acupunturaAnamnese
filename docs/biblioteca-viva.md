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
