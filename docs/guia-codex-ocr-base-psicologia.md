# Guia para o Codex — OCR e base de conhecimento da Anamnese de Psicologia

> Documento de especificação. Quem implementa/roda: **Codex** (custo de token menor).
> Quem definiu o desenho: Claude (2026-07-10). Escopo: **5 PDFs de psicologia,
> ~2.000 páginas no total**, virarem matéria-prima curável para a disciplina
> `psicologia` (anamnese multidisciplinar — ver `docs/plano-anamnese-multidisciplinar.md`).

## 0. Resultado esperado

1. Os 5 PDFs ingeridos na convenção local já existente
   (`frontend/.local-source-assets/pdf-sources/<key>/{pages,text,ocr,manifest.json}`),
   com transcrição pt-BR **fiel e limpa** de cada página.
2. Candidatos de conhecimento estruturados (perguntas de anamnese, itens de
   vocabulário/checklist, sinais de risco, blocos de referência), todos
   `status:"review"`, rastreáveis até PDF→página→trecho→imagem.
3. **Nada** entra no app clínico nesta fase. Gate humano (a psicóloga) aprova depois.

## 1. Como foi o "OCR potente" dos pontos (o que replicar)

O que corrigiu todo o ruído da vez passada **não foi rodar OCR 3 vezes no cego** —
foi um pipeline de 3 camadas, cada uma mais cara e mais focada que a anterior:

| Camada | O que era | Ferramenta da época | Cobertura |
|---|---|---|---|
| **A. Extração bruta** | Texto embutido do PDF (pdfjs) + OCR tesseract como fallback, página renderizada em webp | `ingest-local-pdf-sources.mjs` | 100% das páginas |
| **B. Limpeza determinística** | Regras de ruído sistemático (cabeçalho/rodapé injetado, nº de página, palavras quebradas) + dicionário de erros de OCR revisado à mão. Só corrige o **inequívoco**; o suspeito vira dúvida em worksheet, nunca chute | `clean-common-points-ocr.mjs` | 100%, custo ~zero |
| **C. Re-OCR dirigido (visão)** | Releitura da **imagem** da página por LLM com visão, só para os itens que a camada B marcou como irrecuperáveis. Transcrição fiel, com proveniência (`clinicalSource: 'reocr_atlas'`) e `requiresProfessionalAudit: true` | leitura de `pages/*.webp` → `common-points-reocr.json` → `apply-common-points-reocr.mjs` | só a fração problemática |

A sensação de "passar 3 vezes em cada PDF" vem daí — mas a 3ª passada só tocou as
páginas ruins. **É mais barato detectar onde o OCR falhou do que refazer tudo.**

## 2. ATENÇÃO: estes 5 PDFs são texto embutido, não escaneados

Diferença crítica para a vez anterior. O ruído do Atlas (`dis1ãncia`, `pon10`,
cabeçalho no meio da frase) **veio do OCR** — o tesseract adivinhando letras a
partir de pixels de página escaneada. Por isso precisou de várias passadas.

Estes 5 PDFs têm **texto embutido** (gerados digitalmente). Então:

- **Não há OCR.** Lê-se o caractere real de dentro do arquivo (`getTextContent`),
  exato e de graça. Sem `1`↔`l`, sem passar 3 vezes.
- O ingestor **já faz text-first automático**: extrai o texto embutido de toda
  página e só manda pro OCR a página com `charCount < ocrMinChars` (default 60),
  isto é, a que for imagem pura. Ver `pageNeedsOcr()` em
  `tools/knowledge/ingest-local-pdf-sources.mjs`.
- A camada de limpeza pesada deixa de ser o centro do trabalho. Texto embutido só
  precisa de faxina leve: hífen de quebra de linha (`refe-\nrência` → `referência`),
  ligadura `fi/fl`, e ordem de leitura em páginas de 2 colunas.

**Antes de rodar os 5, rodar 1 PDF de teste e olhar `manifest.json`:**
o campo `pagesOcrDone` diz quantas páginas caíram no OCR. Se vier ≈0, confirmado
texto embutido → seguir text-first. Se vier alto num PDF específico, aquele PDF é
escaneado e volta pra política de visão da seção 2b.

## 2a. Política de passadas — caminho text-first (esperado para os 5)

1. **Passada única (100%):** ingestão com `--ocr-mode none` (ou o default, que já
   pula OCR onde há texto). Sai o texto embutido por página.
2. **Faxina determinística (100%, custo zero):** des-hifenizar quebra de linha,
   normalizar ligaduras/acentos, remover cabeçalho/rodapé repetido. Nada de LLM.
3. **Validação determinística:** marca páginas suspeitas (seção 6). Espera-se
   pouquíssimas.
4. **Visão só como plano B por página (esperado <2%):** apenas nas páginas que a
   validação apontar como ilegíveis/embaralhadas, reler a imagem `pages/*.webp`.

Custo: praticamente **1 passada**, sem gasto de token de visão nas ~2k páginas.

## 2b. Fallback — se algum PDF vier escaneado (imagem)

Só entra em cena se o `manifest.json` de teste mostrar `pagesOcrDone` alto. Aí,
para aquele PDF específico, usar a política de 3 passadas dirigidas da vez do Atlas:

1. **Passada 1 (páginas-imagem):** transcrição por visão, schema estrito, confiança.
2. **Passada 2 (só flagged, ~5–15%):** reler com prompt de correção; concordou com
   a 1ª, resolveu; divergiu, vai pra 3.
3. **Passada 3 (só divergências, <2%):** terceira leitura desempata (2 de 3 vence);
   as 3 divergindo → worksheet de dúvidas humanas, **sem inventar**.

## 3. Ingestão (reusar o que existe)

- Adicionar os 5 PDFs ao catálogo/`SOURCE_DEFINITIONS` de
  `tools/knowledge/ingest-local-pdf-sources.mjs` (ou ao
  `source-catalog.local.json`) com:
  - `knowledgeDomain: 'psicologia'`
  - `curationTarget: 'anamnese-psicologia'`
  - `candidateExtractionPolicy: 'sourceOnly'` (**não** rodar o conector de pontos
    de acupuntura nessas fontes)
- Rodar a ingestão para gerar `pages/*.webp`, texto embutido e manifest, na mesma
  convenção das fontes de MTC.
- **Lane própria:** psicologia é outro paradigma. Nunca misturar candidatos de
  psicologia com `patternDefinitions`/achados de MTC (regra do AGENTS.md §8 —
  incluir sempre, blendar nunca).

### Os 5 PDFs (preencher antes de rodar)

| # | key (slug) | Título | Caminho do arquivo | Páginas |
|---|---|---|---|---|
| 1 | _a definir_ | | | |
| 2 | _a definir_ | | | |
| 3 | _a definir_ | | | |
| 4 | _a definir_ | | | |
| 5 | _a definir_ | | | |

## 4. Saída do texto (por página)

Gravar em `.local-source-assets/pdf-sources/<key>/ocr/transcript.local.json`
(envelope `{ schemaVersion, generatedAt, source, pages: [...] }`). O `method`
distingue de onde veio o texto — no caminho esperado será `embedded-text`:

```json
{
  "page": 132,
  "method": "embedded-text",
  "status": "ok",
  "text": "…texto fiel pt-BR, parágrafos preservados…",
  "headings": ["4.2 Entrevista inicial com adolescentes"],
  "confidence": 1.0,
  "flags": [],
  "passes": 1
}
```

- `method`: `embedded-text` (padrão, texto do próprio PDF) | `vision-pass-1/2/3`
  (só páginas que caíram no fallback da seção 2b). Texto embutido → `confidence: 1.0`.
- `status`: `ok | low_confidence | image_only | table | skipped`
- `flags`: motivos concretos (`"tabela complexa"`, `"manuscrito"`, `"figura com legenda"`,
  `"idioma != pt-BR"`, `"página em branco"`)
- Tabelas: transcrever como Markdown dentro de `text`.
- Figuras/diagramas: descrever em 1 linha entre colchetes `[Figura: …]` — **não**
  inventar conteúdo da figura.
- Regra de ouro herdada do re-OCR do Atlas: **transcrição fiel; nada inventado;
  dúvida vira flag, não chute.**

## 5. Prompt de transcrição — só no fallback de visão (seção 2b)

No caminho text-first **não há prompt de LLM**: o texto vem do PDF. O prompt abaixo
só é usado nas páginas escaneadas que caírem no fallback de visão.

> Transcreva fielmente a página da imagem, em português do Brasil, preservando a
> estrutura (títulos, listas, parágrafos; tabelas em Markdown). Não corrija, não
> resuma, não complete de memória, não traduza citações que já estejam em outro
> idioma (marque com flag). Ao final, informe `confidence` (0–1) e `flags` para
> qualquer trecho que você não conseguiu ler com certeza. Responda só JSON válido
> no schema fornecido.

Passada 2 usa o mesmo prompt + a lista de flags/suspeitas da validação
("atenção especial a: …"). Passada 3 idem, sem ver as anteriores (desempate cego).

## 6. Validadores determinísticos (o que marca página para a passada 2)

Espelhar as regras do `clean-common-points-ocr.mjs`, adaptadas a prosa:

- Taxa de palavras fora de dicionário pt-BR acima do limiar (~8%).
- Padrões de OCR quebrado: `dis1ãncia`-likes (dígito no meio de palavra),
  palavras de 1 letra em sequência, hífens de quebra de linha não resolvidos.
- Linha idêntica repetida em N páginas seguidas = cabeçalho/rodapé vazando → strip
  determinístico (não gasta LLM com isso).
- Número de página solto no meio do texto.
- Mudança brusca de idioma sem flag.
- `confidence < 0.9` autodeclarada.
- Divergência de tamanho: texto embutido existe mas difere >20% da transcrição.

Saída: `ocr/validation-report.local.json` + lista de páginas para a passada 2.

## 7. Extração de candidatos (depois da transcrição limpa)

Mesmo espírito do `guia-codex-extractor-conhecimento-anamnese.md`, com tipos da
psicologia.

> **Decisão da psicóloga (pergunta 4 de `docs/anamnese-psicologia-perguntas.md`):
> SIM — o sistema deve ajudar a organizar eixos / hipóteses de trabalho /
> formulação.** E o CONTEÚDO dessa camada de raciocínio **é aprendido desta
> extração** — os 5 livros é que ensinam quais são os eixos, como se estrutura uma
> formulação e como uma hipótese de trabalho é sustentada. Não é o dono nem o Claude
> que inventa a lista; ela sai das fontes, rastreável, e a psicóloga cura no fim.

Isso é o análogo — em outra lane — do que os `patternDefinitions` são para a MTC.
Mas com uma diferença de segurança que **não muda**: o sistema **organiza, não
interpreta nem decide**. A camada de raciocínio é um andaime de vocabulário que a
psicóloga preenche; nesta fase ela é só **matéria-prima em `review`**, nunca um motor
que cospe diagnóstico no registro.

### 7.1 Tipo `question` — pergunta de anamnese
```json
{
  "id": "question:psicologia:historico-tratamentos-anteriores",
  "status": "review",
  "discipline": "psicologia",
  "type": "question",
  "prompt": "Já fez psicoterapia ou tratamento psiquiátrico antes? Como foi?",
  "rationale": "…por que o livro considera discriminativo…",
  "source": { "key": "<slug>", "pdfPage": 132, "snippet": "…", "imageUrl": "…/pages/page-0132.webp" },
  "requiresProfessionalAudit": true
}
```

### 7.2 Tipo `reasoningAxis` — a camada de raciocínio (o "sim" da pergunta 4)
Captura o que os livros descrevem como eixos, dimensões de avaliação, hipóteses de
trabalho e estrutura de formulação de caso. **Sempre citando o trecho** — se o livro
não descreve, não existe candidato.
```json
{
  "id": "axis:psicologia:funcionamento-afetivo",
  "status": "review",
  "discipline": "psicologia",
  "type": "reasoningAxis",
  "label": "Funcionamento afetivo",
  "kind": "eixo",                     // eixo | hipotese-de-trabalho | dimensao-de-formulacao
  "describes": "Como o livro caracteriza este eixo (regulação, humor, afeto predominante…).",
  "observableCues": ["choro fácil relatado", "anedonia", "labilidade"],
  "linkedFindings": ["checklistItem:psicologia:humor-deprimido"],
  "framework": "nome da abordagem/autor se o livro explicitar (ex.: formulação CID/…)",
  "differentials": "distinções que o próprio texto faz, se houver",
  "source": { "key": "<slug>", "pdfPage": 210, "snippet": "…", "imageUrl": "…" },
  "requiresProfessionalAudit": true
}
```
- `kind` separa os três pedidos da pergunta 4: **eixo**, **hipótese de trabalho**,
  **dimensão de formulação**.
- `observableCues` / `linkedFindings` = a ponte achado→eixo (o equivalente
  psicológico do `patternLink`), mas **descritiva**, sem peso numérico e sem virar
  scoring automático nesta fase. Peso/ativação só numa fase futura, com a psicóloga.
- Se os 5 livros usarem **abordagens diferentes** (psicanalítica, TCC, sistêmica…),
  cada uma vira sua própria lane via `framework` — nunca blendar num eixo único
  (mesma regra do AGENTS.md §8: incluir amplo, rotear por domínio, não fundir).

### 7.3 Demais tipos
`checklistItem` (vocabulário fechado: humor, ansiedade, sono, funcionamento,
substâncias…), `riskSign` (**prioridade máxima**: ideação suicida, autolesão, risco
a terceiros, violência — alimenta o bloco de segurança), `reference` (trecho teórico
para a Biblioteca/RAG).

Gravar em `.local-source-assets/pdf-sources/knowledge/psicologia/`:
`question-candidates.local.json`, `reasoning-axis-candidates.local.json`,
`checklist-item-candidates.local.json`, `risk-sign-candidates.local.json`,
`reference-candidates.local.json` + `extract-audit.local.json` (cobertura por fonte,
páginas puladas e motivo).

## 8. Guardrails (não-negociáveis — iguais aos de sempre)

- Gate humano: **nada** auto-aprovado; `requiresProfessionalAudit: true` em tudo.
- Não editar `checklists.js`, `knowledgeBase.js`, `analyzer.js` nem runtime do app.
- Só pt-BR revisável; sem dado de paciente em lugar nenhum do pipeline.
- Todo candidato com `source` resolvível (página + webp existente + trecho literal).
- Idempotente: rodar 2× não duplica (id estável por slug).
- Derivados ficam em `.local-source-assets/` (fora do git e do bundle Vercel).
- Sigilo/ética CFP: conteúdo de risco (suicídio etc.) é transcrito fielmente para
  curadoria, mas jamais vira sugestão de conduta — o sistema lembra, não decide.
- **Camada de raciocínio (`reasoningAxis`) é andaime, não motor:** captura eixos/
  hipóteses/formulação que os livros ensinam, em `review`, para a psicóloga curar.
  NÃO ativar scoring/diagnóstico automático nesta fase; a IA organiza, não interpreta.
- Nada publicado no Supabase nesta fase.

## 9. Critérios de aceite

- 100% das páginas com entrada no transcript (ainda que `skipped` com motivo).
- ≤2% das páginas terminando no worksheet de dúvidas humanas.
- `validation-report` mostra quantas páginas foram à passada 2 e 3 e por quê.
- Nenhum candidato sem `source` válido; nenhuma mistura com `patternDefinitions`/MTC.
- Todo `reasoningAxis` cita trecho do livro; abordagens diferentes ficam em lanes
  (`framework`) separadas, sem fundir num eixo único.
- Rodar de novo não duplica; app clínico inalterado.
- Doc resumo do lote em `docs/` (padrão `pdf-source-learning-*.md`).

## 10. CLI sugerida

```bash
# 0. TESTE: ingerir 1 PDF e conferir se é texto embutido
node tools/knowledge/ingest-local-pdf-sources.mjs --sources <slug-1> --ocr-mode none
#    → abrir <slug-1>/manifest.json e olhar pagesOcrDone. ≈0 = texto (segue text-first).

# 1. Ingestão text-first dos 5 (texto embutido + webp + manifest; sem OCR)
node tools/knowledge/ingest-local-pdf-sources.mjs --sources <slugs> --ocr-mode none

# 2. Faxina determinística (des-hifenizar, ligaduras, cabeçalho/rodapé) → transcript
node tools/knowledge/clean-psych-text.mjs --source <slug>

# 3. Validação determinística → flags (páginas ilegíveis/embaralhadas)
node tools/knowledge/validate-psych-transcripts.mjs --source <slug>

# 4. FALLBACK (só se validação flagou páginas): visão nas páginas ruins
node tools/knowledge/transcribe-psych-sources.mjs --source <slug> --only-flagged

# 5. Extração de candidatos
node tools/knowledge/extract-psych-candidates.mjs --source <slug>
```

Implementar com `--dry` e retomada (checkpoint por página). No caminho text-first o
passo 1 é barato e rápido; o fallback de visão (passo 4) só toca as páginas ruins.
