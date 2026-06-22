# Plano: Atlas (corpo, língua, pulso) ensinando a espinha dorsal do sistema

> Status: **planejado, não implementar ainda.** Pré-requisito do usuário: terminar de
> alimentar a biblioteca com mais imagens/atlas (extractor em execução) e só então
> reformular Língua e Pulso. Documento criado em 2026-06-16.

## Refinamentos após inspeção dos 8 PDFs (2026-06-16)

Estado real verificado no disco (`.local-source-assets/pdf-sources/`):

- 8 fontes, **2.513 páginas** renderizadas, 874 com OCR (só Folcks 702 + Auteroche
  meridianos 172). Catálogo já traz `knowledgeDomain` + `curationTarget` (Fase 0 ✓).
- 3 atlas de pontos geraram **3.514 vínculos** página↔ponto e **404 rascunhos**, todos
  `review`, **0 aprovados**. Língua e diagnóstico: 0 vínculos (corretamente `sourceOnly`).

Achados que mudam o plano:

1. **O conector de pontos é raso (indexação por menção de código).** Ele NÃO lê nem
   extrai conteúdo: o rascunho só tem `code/title/sourceReferences/counts`, sem
   `actions/indications/locationText`. Ou seja, **nenhum dado clínico novo** dos atlas
   entrou nos pontos — o conhecimento que Folcks/Hecker/Auteroche têm além da Ednéa
   continua nas páginas, não lido. Enriquecer pontos de verdade exige um extractor que
   leia a seção de cada ponto e preencha campos estruturados.
2. **Qualidade de OCR é gate de qualidade da curadoria.** Folcks (OCR) produz trechos
   ilegíveis ("JARI macia maTES sinta AESA..."); Hecker (texto embutido) sai limpo
   ("B 10: Ponto com influência no sistema nervoso parassimpático..."). Lixo de OCR
   vira "dado errado com citação de fonte legítima" — pior cenário clínico. Corrigir
   OCR dos escaneados ANTES de extrair conhecimento.
3. **Há ruído nos 404 rascunhos:** códigos falsos (AA2, SA2, SA4) que o sistema real
   filtra. Triagem necessária; não aprovar em lote.
4. **Novo alvo de alimentação: o banco de perguntas da anamnese.** Sintoma relatado
   pelo usuário: o formulário "captura 1 gatilho de vez em quando" (mesma causa-raiz do
   "(1)" na Confiança: vocabulário de gatilhos pequeno e feito à mão). Os livros devem
   alimentar, por dentro: (a) banco de perguntas, (b) vocabulário de gatilhos,
   (c) mapa achado→padrão, (d) sinais de língua/pulso. Quando vira base única curada,
   o formulário passa a reconhecer dezenas de gatilhos em vez de 1.
5. **Pipeline repetível obrigatório:** usuário enviará +10 PDFs. O trilho
   (catálogo tipado → OCR bom → extractor de conhecimento → schema-alvo → curadoria →
   ativação) precisa rodar em lote, sem gambiarra única.

Sequência ajustada: terminar uploads → consertar OCR dos escaneados → construir o
extractor de CONHECIMENTO (semântico) com schema-alvo → curadoria → religar motor.
"Re-rodar OCR" sozinho NÃO resolve; OCR já existe, falta a camada semântica.

## 1. Diagnóstico do estado atual

A cadeia de raciocínio clínico (a "espinha dorsal") é:

```
achados (anamnese / língua / pulso) → PADRÃO (síndrome) → protocolo → pontos
```

Hoje o conhecimento extraído dos PDFs/Atlas é **point-centric**: todo o pipeline
(`tools/knowledge/*`, KM-Agent, Atlas Ednea, PDFs) mapeia conteúdo para `acupoints`
(código → página impressa → página PDF → trecho → imagem). Isso alimenta:

- a ficha do ponto (`pointDetails.js`),
- o ranking de pontos (`pointRecommendationEngine.js`),
- as coordenadas dos mapas (`mapLocations.js`).

**O que NÃO é alimentado pelos atlas hoje:**

- Os **padrões/síndromes** são fixos em `patternDefinitions` (`knowledgeBase.js`):
  têm `protocol`, `detail` (root/manifestation/eight/elements/question) e `tags`.
  Os sinais de língua/pulso existem só como **texto em prosa** dentro de
  `manifestation` (ex.: "ponta da língua vermelha e pulso rápido") e não são
  usados para pontuar.
- O motor da IA Assistente (`utils/analyzer.js` → `PATTERN_KEYWORDS`) é uma **segunda
  lista fixa**, separada de `patternDefinitions`, com vocabulário magro de língua/pulso.
- **Não existe** entidade estruturada de "sinal de língua" nem de "qualidade de pulso",
  nem um mapa `achado → padrão`.

### Consequência observável (origem da dúvida do usuário)

Na linha de Confiança da IA Assistente, língua/pulso quase sempre aparecem como
"(1)" mesmo marcando vários achados, porque o número conta **palavras-chave do
padrão que casaram no texto**, não respostas marcadas — e cada padrão tem 0–1
palavra de língua/pulso, às vezes nem alinhada ao rótulo do botão
(ex.: motor busca `marcas de dentes`, botão é "Marcas de dente").

## 2. Princípio da solução

Unificar três coisas hoje desconexas numa **fonte única de verdade**:

1. o **rótulo do botão** na tela de Língua/Pulso,
2. a **entidade de conhecimento** extraída do atlas,
3. o **vínculo achado → padrão** usado pelo raciocínio.

Quando o atlas ensina um sinal ("ponta vermelha"), ele vira um item de checklist
**e** um vínculo ponderado para os padrões que ele sustenta. Marcar o sinal passa a
contribuir diretamente para o(s) padrão(ões), com a fonte rastreável.

Mantém-se o gate de segurança da Biblioteca Viva: tudo entra `draft → review →
approved_local → produção`, nada auto-aprovado, com referência de fonte e gate pt-BR.

## 3. Fases

### Fase 0 — Modelo conceitual e tipagem dos atlas (fazer já, em paralelo à extração)

- Marcar cada atlas em catálogo com `atlasType`: `body | tongue | pulse`.
  - Atlas do corpo → alimenta **pontos** e protocolos `padrão → ponto` (etapa final).
  - Atlas da língua → alimenta **sinais de língua** + mapa `sinal → padrão` (etapa do meio).
  - Atlas do pulso → alimenta **qualidades de pulso** + mapa `qualidade → padrão` (etapa do meio).
- Catálogo local (fora do Git), no mesmo modelo já usado:
  `frontend/.local-source-assets/pdf-sources/source-catalog.local.json`
  com `key, title, authors, originalLanguage, sourceType, atlasType, path, trustTier,
  reference, licenseNote`.

> Ação imediata sugerida ao usuário: garantir que os atlas sendo extraídos agora
> já declarem `atlasType`, para a Fase 1 consumir sem retrabalho.

### Fase 1 — Pipeline de extração generalizado por tipo de atlas

- Generalizar `ingest-local-pdf-sources.mjs` + `connect-pdf-source-candidates.mjs`
  para ramificar por `atlasType`.
- Por atlas: catálogo → renderizar páginas → texto/OCR (fallback) → (opcional)
  Gemini Vision para figuras → **extração tipada** de candidatos → drafts `review`.
- Saídas estruturadas por tipo (espelhando os arquivos atuais de candidatos):
  - `tongue-sign-candidates.local.json`
  - `pulse-quality-candidates.local.json`
  - `pattern-link-candidates.local.json` (vínculos achado → padrão sugeridos)
- Reaproveitar: render de páginas, OCR, índice trecho/página, gate de idioma,
  percentuais de confiabilidade (`pdfSourceLearning.js`).

### Fase 2 — Novas entidades de conhecimento (schema)

Estender `patternDefinitions` (e a camada Supabase planejada `knowledge_entities` /
`knowledge_relationships`) com estrutura, não prosa:

- `tongueSigns[]`: `{ id, label, region, attribute(cor|saburra|forma|umidade),
  patterns: [{ name, weight, sourceRef }] }`
- `pulseQualities[]`: `{ id, label, position, patterns: [{ name, weight, sourceRef }] }`
- O vínculo `achado → padrão` é o coração da espinha dorsal. Pode viver como:
  - campos estruturados em cada padrão (rápido), e/ou
  - tabela `knowledge_relationships` (`finding_pattern`) já prevista na migration
    `20260527_living_library_knowledge_base.sql` (mais escalável).
- Migrar os sinais hoje presos em `manifestation` para esses campos (sem perder a
  prosa, que continua para o relatório).

### Fase 3 — Curadoria no SuperAdm

- Nova seção análoga a "Fontes PDF", para revisar/aprovar vínculos
  `sinal de língua/pulso → padrão` (peso, fonte, página/trecho/imagem).
- Mesmo gate: salvar cria `review`; aprovação clínica explícita; migração Supabase à parte.

### Fase 4 — Religar o motor (o ganho final na IA Assistente)

Substituir `PATTERN_KEYWORDS` (regex) pelo mapa curado `achado → padrão`. Resolve de
uma vez os problemas levantados:

- **(A) Contar respostas, não palavras:** cada achado marcado que sustenta o padrão
  vira 1 sinal — "3 sinais na língua" passa a significar 3 respostas suas.
- **(B) Vocabulário rico e alinhado:** os rótulos dos botões SÃO as entidades, então
  não há mais desencontro de texto.
- **(C) Mapa curado:** precisão clínica vinda da sua revisão, com fonte rastreável.
- **(D) Corrigir a inconsistência nome ↔ pontuação:** unificar a hipótese exibida e a
  pontuação graduada num único ranking (hoje o nome vem do `analyze()` binário e a
  %/diferencial do graduado; em empates eles divergem).
- Recalcular confiança com diversidade de origem real (língua/pulso finalmente
  "acendem" quando preenchidos).

### Fase 5 — Validação e calibração

- Atualizar/expandir `tests/regression/analyzer.test.mjs` para o novo motor.
- Calibrar pesos por origem e limiares de confiança com casos clínicos reais
  (continuação do combinado "ver funcionando e calibrar juntos").

## 4. Ordem de execução recomendada

1. Fase 0 agora (tipar atlas no catálogo) — barato e destrava o resto.
2. Terminar a extração (usuário).
3. Fase 1 → 2 → 3 (pipeline + schema + curadoria).
4. Fase 4 (religar motor) **só depois** da curadoria mínima de língua/pulso.
5. Fase 5 (calibração contínua).

## 5. Arquivos que serão tocados (referência futura)

- Extração: `tools/knowledge/ingest-local-pdf-sources.mjs`,
  `tools/knowledge/connect-pdf-source-candidates.mjs`, novos extractors por tipo.
- Conhecimento: `frontend/src/knowledge/knowledgeBase.js` (entidades/padrões),
  `frontend/src/knowledge/pdfSourceLearning.js`, schema Supabase.
- Curadoria: `frontend/src/components/panels/SuperAdminPanel.jsx` (nova seção),
  serviços em `frontend/src/services/`.
- Motor: `frontend/src/utils/analyzer.js` (`assistantSynthesis`, substituir
  `PATTERN_KEYWORDS`), telas Língua/Pulso (rótulos = entidades).
- Testes: `frontend/tests/regression/analyzer.test.mjs`.

## 6. Limites honestos

- "Aprender da imagem" = extrair + sugerir candidatos; a inteligência clínica final
  vem da sua curadoria. Nada entra no raciocínio sem aprovação (regra da Biblioteca Viva).
- Gemini Vision custa por chamada e exige créditos (hoje esgotados); usar pontualmente
  na extração de figuras, não em runtime do paciente.
