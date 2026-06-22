# Guia para o Codex — Biblioteca Viva: corpus RAG a partir do livro "Acupuntura Médica em Questões"

> Especificação. Implementa: Codex/IDE. Desenho/revisão: Claude (2026-06-18).
> Objetivo único: transformar o conteúdo **explicativo** do livro do Dr. Eduardo Cruz
> (repo GitHub `dreduardocruz/Livro`, GPL-3.0) em **corpus consultável da Biblioteca
> Viva (RAG)** — o "Pergunte à Biblioteca" passa a recuperar e citar esse material.
> NÃO é ficha de ponto, NÃO é ranking, NÃO é protocolo. É só texto de referência/raciocínio.

## 0. Resultado esperado

1. Um conjunto de docs curadas `docs/livro-questoes-*.md` (síntese pt-BR, confiança `medium`).
2. Essas docs registradas na allowlist de `tools/knowledge/ingest-docs-corpus.mjs`.
3. `frontend/src/knowledge/generated/doc-corpus.js` regenerado (cards no formato da Biblioteca).
4. `doc-corpus.js` ligado ao `allCards` da Biblioteca (1 import + 1 spread).
5. Verificação: perguntar algo respondível só por esse conteúdo no "Pergunte à Biblioteca"
   retorna resposta ancorada + cita a fonte do livro, com aviso de confiança `medium`.

Nada vira "Seguro para Uso Clínico" automaticamente. App do usuário comum não muda além
de a Biblioteca passar a saber responder mais coisas (apoio a estudo/consulta).

## 1. Seguir o padrão que JÁ existe (não inventar pipeline novo)

Este fluxo é uma **segunda fonte** para a tool que já existe. Leia antes de tocar em nada:

- `tools/knowledge/ingest-docs-corpus.mjs` — converte `docs/*.md` da allowlist
  `DOC_CORPUS_SOURCES` em cards. Regras que ELE já aplica (você só precisa alimentar
  markdown limpo): quebra por título `##`/`###` (vira breadcrumb "H1 › H2 › H3" = título
  do card), extrai **termos em negrito** como `tags` (chaves de busca de ouro), divide
  chunk > 1600 chars por parágrafo, confiança `medium` por padrão.
- `tools/knowledge/ingest-docs-corpus.test.mjs` — testes da tool (não quebrar).
- `supabase/functions/library-qa/index.ts` — geração ancorada (Gemini flash). Já cita
  fontes, respeita `confidence`, recusa quando o contexto não cobre. **Não mexer.**
- `frontend/src/services/libraryAiService.js` — `rankLibraryCards` (recuperação local por
  sobreposição de termos: título ×3, tags ×2, corpo ×1, + boost de confiança) e `askLibrary`.
  **Não mexer.**
- `frontend/src/components/panels/Biblioteca.jsx` — monta `allCards` e passa para
  `<LibraryAsk cards={allCards} />`. **Aqui entra o único wiring** (seção 5).

Formato do card (o que a tool emite e a Biblioteca consome) — para referência:

```js
{ id, cat, title, confidence, statusLabel, cardColor, tags, source, txt, docFile }
```

## 2. Passo A — Puxar e converter a fonte (sem OCR)

O repo é texto digital (LaTeX/EPUB), **não é PDF escaneado**: não há OCR neste fluxo.

1. Baixar o repo: `git clone https://github.com/dreduardocruz/Livro` (ou baixar só `ebook.epub`).
2. Converter o **EPUB** (`ebook.epub`, ~892 KB, é a versão mais limpa e já capitulada).
   Preferir `pandoc`:

   ```bash
   pandoc ebook.epub -t gfm -o scratch-livro.md
   ```

   Sem pandoc: descompactar o `.epub` (é um zip de XHTML) e converter os XHTML, ou usar
   o `ebook.docx` com um conversor Node (ex.: `mammoth`). Qualquer caminho serve — o alvo
   é um markdown bruto navegável.
3. **Onde guardar o bruto:** `frontend/.local-source-assets/livro-teac/scratch-livro.md`
   (pasta ignorada pelo Git). O texto integral do livro **NÃO entra** em `docs/` nem no
   bundle — só a síntese curada da seção 3 entra.

## 3. Passo B — Curar: de Q&A para chunk explicativo (o coração do trabalho)

O livro é **prova comentada** (questão de múltipla escolha + gabarito comentado). O lixo
de RAG é o andaime da prova (enunciado "qual a alternativa…", letras a/b/c/d, "alternativa
correta: C", metadados de ano). O **ouro** é o comentário explicativo. Regra geral:
**descartar o andaime, sintetizar o raciocínio, organizar por conceito clínico (não por ano de prova).**

### 3.1 Organização (arquivos = categorias)

Dividir a síntese por domínio. Crie só os que o conteúdo justificar:

| Arquivo `docs/` | `cat` do card |
| --- | --- |
| `livro-questoes-sindromes.md` | `Síndrome` |
| `livro-questoes-diagnostico.md` | `Diagnóstico` (língua, pulso, 4 exames) |
| `livro-questoes-fundamentos.md` | `Fundamentos` (canais, categorias de ponto, neurofisiologia) |
| `livro-questoes-auriculo.md` | `Auriculoterapia` |
| `livro-questoes-eletroacupuntura.md` | `Eletroacupuntura` |
| `livro-questoes-casos.md` | `Caso clínico` (casos integrados ocidental+MTC) |

> ⚠️ **Não usar `cat: "Ponto"` nem `cat: "Aurículo"`** — esses dois são filtrados do
> `allCards` (Biblioteca.jsx, ~linha 291: só passam se forem ponto "comumente usado").
> Os nomes acima passam livres. Conteúdo sobre um ponto específico vai como `Fundamentos`
> ou dentro de uma síndrome/caso, não como `cat: "Ponto"`.

### 3.2 Regras de chunk (o que faz o RAG recuperar bem)

- **Um `###` por conceito**, com o conceito no título (vira título do card, peso ×3 na busca).
  Ex.: `### Síndrome Bi por Vento`, `### Língua pálida com saburra branca`, `### VB20 — localização e indicações`.
- **Negrito em TODO termo de busca:** nome de padrão/síndrome, código de ponto (**VB20**,
  **E36**), sinal-chave (**língua pálida**, **pulso em corda**), sintoma que o chunk responde.
  O negrito **é** a tag — sem negrito, não recupera.
- **Síntese pt-BR, não cópia:** reescrever o raciocínio com suas palavras. Não colar
  parágrafos longos verbatim (ver licença, seção 6). Fatos clínicos não têm copyright; a
  síntese é melhor RAG e evita atrito de licença.
- **Chunk ≤ ~1600 chars.** Acima disso a tool quebra em "parte 1/2…" (título do card fica feio).
- **Só pt-BR.** Traduzir/descartar qualquer trecho em outro idioma.
- **Rastreabilidade:** terminar cada `###` com uma linha de origem, ex.:
  `> Fonte: Cruz E., *Acupuntura Médica em Questões* (TEAC 2016, q. 42).`
- **Sem múltipla escolha, sem gabarito, sem "ano da prova" como organização.**

### 3.3 Cabeçalho obrigatório de cada arquivo

```markdown
# Síndromes — notas do livro "Acupuntura Médica em Questões"

> Síntese pt-BR curada a partir de Cruz, Eduardo — *Acupuntura Médica em Questões*
> (repo `dreduardocruz/Livro`, licença GPL-3.0). Material de **referência/estudo**,
> confiança `medium`; não é conduta automática nem ficha de ponto. Auditoria profissional
> antes de qualquer uso clínico.
```

### 3.4 Exemplo de transformação (antes → depois)

**Antes (bruto, como vem da prova — descartar o andaime):**

> 42. Ponto usado no tratamento da cefaléia e do torcicolo, localizado numa depressão
> entre o esternocleidomastoideo e o trapézio. Assinale a alternativa correta:
> a) Du Mai 16  b) TA 17  c) VB 20  d) E 8 — **Gabarito: C.** VB20 (Fengchi) situa-se na
> depressão entre a inserção do ECM e do trapézio, abaixo do occipital…

**Depois (chunk explicativo, em `livro-questoes-fundamentos.md`):**

```markdown
### VB20 (Fengchi) — localização e indicações

**VB20** (*Fengchi*) localiza-se na depressão entre a inserção do **esternocleidomastoideo**
e do **trapézio**, abaixo do osso occipital. É **ponto do Vento** clássico, indicado em
**cefaleia**, **torcicolo**, rigidez de nuca, tontura e quadros de **Vento** externo/interno.
Diferenciar de Du Mai 16 (Fengfu), na linha média.

> Fonte: Cruz E., *Acupuntura Médica em Questões* (TEAC, questão de pontos).
```

### 3.5 Escala

São ~420 questões + capítulos de exercícios. Processar **por capítulo/lote**, com o mesmo
template, e ir acrescentando aos arquivos por `cat`. Não precisa ser uma passada só.
Dedupe: se duas questões ensinam o mesmo conceito, fundir em um chunk (não criar dois cards).

## 4. Passo C — Registrar na allowlist e gerar

1. Em `tools/knowledge/ingest-docs-corpus.mjs`, acrescentar ao array `DOC_CORPUS_SOURCES`
   um item por arquivo criado:

   ```js
   {
     file: 'livro-questoes-sindromes.md',
     cat: 'Síndrome',
     source: 'Cruz E. — Acupuntura Médica em Questões (TEAC), GPL-3.0 (curado)',
     confidence: 'medium',
   },
   ```

   (repetir para diagnostico/fundamentos/auriculo/eletroacupuntura/casos). Manter `confidence: 'medium'`.
2. Gerar o módulo:

   ```bash
   node tools/knowledge/ingest-docs-corpus.mjs
   ```

   Saída esperada: `doc-corpus: N chunk(s) gerados em frontend/src/knowledge/generated/doc-corpus.js`
   com a contagem por `cat`.

## 5. Passo D — Wiring na Biblioteca (única alteração de runtime)

Em `frontend/src/components/panels/Biblioteca.jsx`:

1. Importar o corpus gerado (topo do arquivo, junto dos outros imports de knowledge):

   ```js
   import { docCorpusCards } from '../../knowledge/generated/doc-corpus';
   ```

2. Incluir no `allCards` (hoje ~linha 288–292). Os cards do corpus já têm `cat`/`confidence`
   próprios e passam o filtro (não são `Ponto`/`Aurículo`):

   ```js
   const allCards = useMemo(() => {
     const pointCategories = new Set(['Ponto', 'Aurículo']);
     return [...curatedCards, ...reviewCards, ...docCorpusCards]
       .filter(card => !pointCategories.has(card.cat) || isCommonlyUsedEntity(card.entity));
   }, [curatedCards, reviewCards]);
   ```

   Isso já propaga para `<LibraryAsk cards={allCards} />` → `askLibrary` → `rankLibraryCards`
   → `library-qa`. Nenhuma mudança na Edge Function nem no service.

## 6. Guardrails (não-negociáveis)

- **Só Biblioteca/RAG.** Não tocar em `pointDetails.js`, `pointRecommendationEngine.js`,
  ranking, protocolo, ficha de ponto, `searchIndex`, `knowledgeBase.js`.
- **Confiança `medium`**, nunca `high`. Não inflar a aba "Seguro para Uso Clínico".
- **Só pt-BR.** Bloquear/traduzir qualquer trecho não-pt-BR.
- **Síntese, não cópia verbatim.** GPL-3.0 é copyleft: creditar autor + repo + licença no
  cabeçalho de cada arquivo e no campo `source`. Reproduzir passagens longas ao pé da letra
  exige rever compatibilidade de licença — então sintetizar (também é melhor RAG).
- **Rastreabilidade** em cada `###` (linha "Fonte: …").
- **Sem dados de paciente** (é base de conhecimento; o `library-qa` não anonimiza por isso).
- **Bruto fora do bundle:** o texto integral fica em `.local-source-assets/` (gitignored);
  só a síntese curada vai para `docs/`.
- **Nada auto-aprovado para conduta.** Continua sendo apoio a estudo/consulta.

## 7. Critérios de aceite

- `node tools/knowledge/ingest-docs-corpus.mjs` roda limpo e cria/atualiza
  `frontend/src/knowledge/generated/doc-corpus.js` com chunks das novas docs.
- `node --test tools/knowledge/ingest-docs-corpus.test.mjs` e a suíte de regressão passam.
- Build/lint do frontend OK.
- Na Biblioteca, aba de confiança **"medium"** mostra os novos cards nas `cat` corretas
  (Síndrome/Diagnóstico/Fundamentos/Auriculoterapia/Eletroacupuntura/Caso clínico).
- "Pergunte à Biblioteca" com uma pergunta respondível só pelo novo conteúdo (ex.: algo do
  livro que não estava na base) retorna resposta ancorada e **cita** a fonte do livro;
  pergunta fora do corpus retorna `insufficient` (não inventa).
- Abas "high"/"Seguro para uso clínico" **não** ganharam itens novos. Ficha de ponto,
  ranking e protocolo **inalterados**.

## 8. Fora de escopo

- Vetores/embeddings/pgvector — o RAG é deliberadamente por sobreposição de termos. Se um dia
  o corpus passar de alguns milhares de chunks, reavaliar; não agora.
- Migração do corpus para Supabase.
- Usar o livro para alimentar achado→padrão da anamnese, língua/pulso ou auriculoterapia
  clínica — é outro fluxo (ver `docs/plano-atlas-lingua-pulso-espinha-dorsal.md`).
- O repo irmão `dreduardocruz/ebook` (versão menor): é subconjunto deste; **não ingerir os
  dois** (duplicaria/contradiria passagens no RAG).
