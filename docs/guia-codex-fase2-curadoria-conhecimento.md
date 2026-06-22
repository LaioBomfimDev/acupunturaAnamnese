# Guia para o Codex — Fase 2: Tela de Curadoria do Conhecimento (SuperAdm)

> Especificação. Implementa: Codex. Desenho/revisão: Claude (2026-06-16).
> Pré-requisito: a Fase 1 (`guia-codex-extractor-conhecimento-anamnese.md`) já gerou
> os arquivos de candidatos. Esta fase NÃO extrai nada — ela deixa o profissional
> revisar, editar e **aprovar** os candidatos, com o gate da Biblioteca Viva.

## 0. Resultado esperado

Uma seção nova no SuperAdm ("Conhecimento da Anamnese") que:
1. lê os candidatos da Fase 1 (`finding`, `question`, `pattern`);
2. mostra cada um com **prova rastreável** (imagem da página + trecho + fonte);
3. permite editar (rótulo, aliases/gatilhos, vínculos achado→padrão, peso, polaridade);
4. permite **aprovar / reprovar / deixar em revisão**;
5. grava as aprovações num **store local** que a Fase 3 (religar o motor) vai consumir.

Nada é aprovado automaticamente. App clínico do usuário comum não muda nesta fase.

## 1. Seguir o padrão que JÁ existe (não inventar outro)

Espelhar o fluxo de `PdfSourceLearningPanel.jsx`:
- Painel React em `frontend/src/components/panels/AnamneseKnowledgePanel.jsx`.
- Incluído em `SuperAdminPanel.jsx` como nova seção (ao lado de `<PdfSourceLearningPanel />`).
- Leitura de assets via o mesmo mecanismo de
  `services/knowledgeSourceAssetService.js`
  (`fetchKnowledgeSourceJsonAsset`, `resolveKnowledgeSourceAssetUrl`) — com fallback
  local `.local-source-assets` → público, igual aos outros painéis.
- Aprovação local via um serviço novo no mesmo estilo de
  `services/knowledgeAdminService.js` (`saveLocalKnowledgeReview` etc.):
  persistência em `localStorage` + arquivo `approved` local.
- Filtros no topo (chips), como em `PdfSourceLearningPanel` (`Nao respondidos`,
  `Alta confianca`, `Lingua`, `Diagnostico`, `Salvos`, `Todos`).

## 2. Entradas (da Fase 1)

Ler de `.local-source-assets/pdf-sources/knowledge/`:
- `finding-candidates.local.json`
- `question-candidates.local.json`
- `pattern-candidates.local.json`

Cada item segue o schema da seção 3 do guia da Fase 1. Resolver `source.imageUrl` pelo
serviço de assets (mostrar a `.webp` da página como prova visual).

## 3. Saídas (o que a curadoria grava)

Gravar aprovações em store local (não versionado), seguindo o padrão de reviews:
- `localStorage` chave dedicada (ex.: `acup.knowledge.anamnese.reviews.v1`).
- Espelho em `.local-source-assets/pdf-sources/knowledge/approved-knowledge.local.json`
  para exportação/curadoria offline.

Cada registro aprovado guarda: o item editado + `status: "approved_local"`,
`approvedByRole`, `approvedByLabel`, `approvedAt`, `requiresProfessionalAudit: true`,
e a `source` original (rastreabilidade preservada). Reprovar → `status: "rejected"`
(some da fila ativa, mas fica no histórico). Editar sem decidir → permanece `review`.

A Fase 3 vai ler SÓ os `approved_local` para religar a anamnese/motor. Por isso o
schema do aprovado deve bater 1:1 com o que o `analyzer.js` vai consumir
(achado → `aliases` (gatilhos) + `patternLinks`).

## 4. Telas / interações

### 4.1 Lista de candidatos (fila de curadoria)
- Agrupar por tipo (Achados | Perguntas | Padrões) e por domínio (Língua | Pulso |
  Anamnese | Diagnóstico).
- Cada linha: rótulo, domínio, nº de vínculos de padrão, % de confiança da fonte
  (reusar `pdfSourceLearning` se útil), status, e botão "Abrir".
- Filtros e busca por texto (rótulo/alias/padrão).

### 4.2 Detalhe do candidato (editor + prova)
- **Coluna esquerda (prova):** imagem `.webp` da página + trecho citado + fonte
  (título, página). Botão para abrir a página inteira.
- **Coluna direita (edição):**
  - `label` (rótulo que aparecerá no formulário) — editável.
  - `aliases` (gatilhos) — lista editável (adicionar/remover); explicar na UI que são
    os termos que fazem o achado "acender" na anamnese.
  - `checklistGroup` — select com os grupos reais de `data/checklists.js`
    (`sintomas, sono, digestao, ...`) + opção "novo".
  - `patternLinks[]` — para cada: select de padrão (lista de `patternDefinitions` +
    candidatos `pattern` novos), `weight` (1–7), `polarity` (+/−), trecho-evidência.
  - Ações: **Aprovar**, **Reprovar**, **Salvar em revisão**.
- Validação antes de aprovar: `label` não vazio; ≥1 `patternLink` com padrão válido;
  `source.imageUrl` resolvível; texto pt-BR.

### 4.3 Perguntas (`question`)
- Mostrar `prompt`, `options`, `rationale`, `checklistGroup`, `linkedFindings`.
- Aprovar uma pergunta = marcar para entrar no banco de perguntas (Fase 3 decide a
  inserção real em `checklists.js`; aqui só aprova o conteúdo).

### 4.4 Padrões (`pattern`)
- Mostrar sinais propostos (tongue/pulse/symptoms/differentials) com a prova.
- Aprovar candidato `pattern` novo cria a entrada-base que a Fase 3 levará a
  `patternDefinitions` (com auditoria).

### 4.5 Normalização de padrões (CRÍTICO — confirmado nos dados reais)

A extração da Fase 1 gerou **251 candidatos de `pattern`**, mas só **6 batem** com os
10 padrões canônicos de `patternDefinitions`. Os outros 245 são **frases de diagnóstico
cruas do livro** (Semiologia), incluindo:
- ruído/cabeçalho ("A seguir"),
- duplicatas por typo ("Abscesso intestinais" vs "Abscessos intestinais"),
- diagnósticos muito granulares ("Acometimento de Yin pela presença de calor no sangue").

Se aprovados crus, o motor terminaria com 251 micro-padrões em vez da taxonomia limpa.
Portanto a tela DEVE oferecer, para cada candidato `pattern` e para cada `patternLink`
de um `finding`, uma decisão de **normalização**:

1. **Mapear → canônico:** select com os padrões de `patternDefinitions`; ao escolher,
   todas as referências àquela frase passam a apontar para o canônico (a frase do livro
   vira `sourceLabel`/`rawPattern`, preservada para rastreio).
2. **Promover a novo padrão:** só quando for de fato uma síndrome nova legítima
   (`isNew: true` aprovado conscientemente).
3. **Descartar como ruído:** marcar `rejected` (ex.: "A seguir", entradas vazias,
   "paciente normal" quando não for diagnóstico).

Apoios obrigatórios na UI para tornar isso viável em escala (245 itens):
- **Pré-filtro de ruído:** ocultar/sinalizar automaticamente candidatos suspeitos
  (nome com <3 palavras e sem termo MTC, cabeçalhos, "normal"); o curador confirma.
- **Dedupe:** agrupar nomes quase idênticos (normalizar acento/caixa/typo óbvio) e
  permitir mapear o grupo de uma vez.
- **Mapa de normalização persistente:** salvar `rawPattern → canonicalPattern` num
  dicionário reaproveitável, para os **+10 PDFs futuros** herdarem os mapeamentos.
- **Visão por canônico:** após mapear, agrupar os `findings` pelo padrão canônico
  resultante, para o curador ver a taxonomia final tomando forma.

Saída desta etapa: além do `approved-knowledge.local.json`, gravar
`pattern-normalization-map.local.json` (`{ rawPattern, canonicalPattern, decision }`).

## 5. Guardrails (não-negociáveis)

- Seção visível **apenas para SuperAdm** (reusar o gate de papel já usado no painel).
- **Nada auto-aprovado**; toda aprovação é ação explícita do humano.
- Não editar `checklists.js`, `knowledgeBase.js` nem `analyzer.js` nesta fase — só
  gravar no store de aprovados. A religação é Fase 3.
- Rastreabilidade obrigatória: todo aprovado mantém `source` (fonte/página/trecho/imagem).
- Só pt-BR; bloquear aprovação de trecho não-pt-BR (reusar o gate de idioma existente).
- Sem dados de paciente.
- Idempotente: reabrir a tela reflete o store; reaprovar atualiza, não duplica.

## 6. Critérios de aceite

- Abrir o SuperAdm → nova seção "Conhecimento da Anamnese" lista os candidatos da Fase 1
  (255 achados, 251 padrões, 0 perguntas no lote atual).
- Aprovar um achado grava em `localStorage` + `approved-knowledge.local.json` com
  `status:"approved_local"` e `source` preservada; recarregar mantém.
- Normalização funciona: mapear um `pattern` cru → canônico atualiza todos os `findings`
  que o referenciam; o pré-filtro de ruído marca casos como "A seguir"; o dedupe agrupa
  "Abscesso intestinais"/"Abscessos intestinais"; gera `pattern-normalization-map.local.json`.
- Aprovação bloqueada se faltar padrão válido / imagem / pt-BR.
- Reprovar remove da fila ativa; filtro "Todos" ainda mostra com status `rejected`.
- Nenhum arquivo de runtime do app comum é alterado; usuário comum não vê nada novo.
- Testes de regressão existentes continuam passando; adicionar teste do serviço de
  aprovação (merge/persistência) no padrão de `tests/regression`.

## 7. Fora de escopo desta fase (é Fase 3, Claude faz depois)

- Religar `analyzer.js`/`assistantSynthesis` para usar a base aprovada (contar
  respostas reais, gatilhos ricos, mapa achado→padrão).
- Inserir perguntas aprovadas em `data/checklists.js`.
- Promover `pattern` novos para `patternDefinitions`.
- Migração para Supabase.

Referência geral: `docs/plano-atlas-lingua-pulso-espinha-dorsal.md` e
`docs/guia-codex-extractor-conhecimento-anamnese.md` (Fase 1).
