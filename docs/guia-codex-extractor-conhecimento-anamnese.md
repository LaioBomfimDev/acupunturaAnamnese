# Guia para o Codex — Extractor de Conhecimento (Fase 1): alimentar a anamnese

> Documento de especificação. Quem implementa: Codex. Quem revisou o terreno e
> definiu o desenho: Claude (2026-06-16). Objetivo do dono: deixar o formulário de
> anamnese (e depois língua/pulso) reconhecer muito mais gatilhos, alimentado pelo
> que os PDFs ensinam — hoje ele "captura 1 gatilho de vez em quando".

## 0. Resultado esperado desta fase

Construir um **extractor de conhecimento semântico** que lê o texto JÁ extraído dos
PDFs confiáveis e gera **candidatos estruturados** (achados, gatilhos, vínculos
achado→padrão e perguntas novas de anamnese), em `review`, rastreáveis, **sem tocar no
app clínico**. NÃO é re-rodar OCR. NÃO é o conector raso de pontos atual.

Esses candidatos depois são curados (aprovados por humano) e só então religam o motor
da anamnese/IA Assistente. Esta fase entrega **a matéria-prima curável**, não a ativação.

## 1. Contexto e regras que JÁ existem (respeitar)

- Derivados locais (não versionados, fora do bundle Vercel):
  `frontend/.local-source-assets/pdf-sources/<key>/{pages,text,ocr,manifest.json}`
- Catálogo das fontes: `.local-source-assets/pdf-sources/source-catalog.local.json`
  (já tem `knowledgeDomain`, `curationTarget`, `candidateExtractionPolicy`).
- Índice geral: `.local-source-assets/pdf-sources/source-index.local.json`.
- Gate da Biblioteca Viva (OBRIGATÓRIO): tudo entra `draft/review`, **nada
  auto-aprovado**; só conteúdo **pt-BR revisado**; rastreabilidade
  PDF→página→trecho→imagem; nunca misturar com dado de paciente; frontend nunca
  recebe chave/segredo.
- Grupos reais da anamnese ficam em `frontend/src/data/checklists.js`
  (`objetivos, sintomas, queixaEstruturada, historico, substanciasUso, sono,
  digestao, gineco, dor, lingua, regioesLingua, clima, emocoes, fezes, oito,
  substancias, seguranca`). A chave de resposta no app é `grupo:Rótulo`.
- Padrões/síndromes ficam em `frontend/src/knowledge/knowledgeBase.js`
  (`patternDefinitions`). O motor ao vivo usa `frontend/src/utils/analyzer.js`
  (`PATTERN_KEYWORDS`, `assistantSynthesis`). NÃO editar esses nesta fase.

## 2. Triagem de qualidade das fontes (verificada no disco)

| Fonte | Tipo de texto | Tier | Ação nesta fase |
|---|---|---|---|
| Semiologia da Língua (Completo) | embutido, **limpo e estruturado** | A | Extrair já (parser estruturado) |
| Clássico das 81 Dificuldades | embutido, bom | B | Extrair (limpeza leve) |
| Diagnóstico da Medicina Chinesa (Auteroche) | embutido parcial (177/422), resto ruído | B/C | Extrair páginas limpas; marcar sujas p/ visão depois |
| Combinações dos Pontos (Jeremy Ross) | embutido, sem acentos/ruído leve | B | Extrair (normalizar acentos) |
| Microssistema Língua | **imagem pura** ("Scanned by CamScanner") | C | Adiar: precisa visão-OCR |
| Atlas Folcks / Auteroche-meridianos | **OCR lixo** | C | Adiar: tratar como fonte visual / visão-OCR |

Regra: **Tier A/B agora; Tier C depois**, e Tier C com Gemini Vision (não OCR
tradicional). Nenhuma fonte Tier C deve gerar achado clínico textual nesta fase.

## 3. Schema-alvo (o que extrair PARA dentro)

Gerar candidatos nestes 3 tipos. Todos com `status:"review"` e `source` rastreável.

### 3.1 Achado clínico (`finding`) — base da anamnese e do raciocínio
```json
{
  "id": "finding:lingua:saburra-amarela-espessa",
  "status": "review",
  "domain": "lingua",
  "checklistGroup": "lingua",
  "label": "Saburra amarela e espessa",
  "aliases": ["saburra amarela", "revestimento amarelo espesso", "saburra grossa amarelada"],
  "patternLinks": [
    { "pattern": "Umidade-Calor", "weight": 3, "polarity": "+", "evidence": "Saburra amarela espessa indica calor com umidade" }
  ],
  "source": {
    "key": "semiologia-da-lingua-completo",
    "pdfPage": 40,
    "snippet": "Saburra: Amarela, espessa e de aspecto sujo... Diagnóstico: ...",
    "imageUrl": "/knowledge/source-assets/pdf-sources/semiologia-da-lingua-completo/pages/page-040.webp"
  },
  "requiresProfessionalAudit": true,
  "generatedFrom": "extract-knowledge.mjs"
}
```
- `checklistGroup`: usar grupo existente de `checklists.js` quando o achado já existe lá;
  se for achado novo, sugerir o grupo mais próximo e marcar `"isNew": true`.
- `aliases`: sinônimos/variações = **vocabulário de gatilho** (resolve o "captura 1").
- `polarity`: `+` (sustenta) ou `-` (contraindica/afasta) o padrão.
- `pattern`: deve casar EXATAMENTE com um nome em `patternDefinitions`; se o livro citar
  um padrão ainda não existente, criar candidato `pattern` novo (ver 3.3) e referenciar.

### 3.2 Pergunta de anamnese (`question`) — melhorar/expandir o formulário
```json
{
  "id": "question:digestao:preferencia-temperatura-bebida",
  "status": "review",
  "checklistGroup": "digestao",
  "prompt": "Preferência de temperatura das bebidas",
  "options": ["Prefere quente", "Prefere gelado", "Indiferente"],
  "rationale": "Diferencia Frio (prefere quente) de Calor (prefere gelado).",
  "linkedFindings": ["finding:digestao:prefere-quente", "finding:digestao:prefere-gelado"],
  "source": { "key": "...", "pdfPage": 0, "snippet": "...", "imageUrl": "..." }
}
```
Usado para sugerir perguntas que faltam no `checklists.js` mas que os livros mostram
serem discriminativas. Não alterar `checklists.js` — só propor.

### 3.3 Enriquecimento de padrão (`pattern`) — quando o livro descreve a síndrome
```json
{
  "id": "pattern:Umidade-Calor",
  "status": "review",
  "pattern": "Umidade-Calor",
  "isNew": false,
  "tongueSigns": ["saburra amarela espessa", "língua vermelha"],
  "pulseSigns": ["escorregadio", "rápido"],
  "symptoms": ["sensação de peso", "fezes pastosas com odor forte"],
  "differentials": ["distinguir de Umidade-Frio pela cor da saburra"],
  "source": { "key": "diagnostico-medicina-chinesa-auteroche", "pdfPage": 0, "snippet": "...", "imageUrl": "..." }
}
```

## 4. Pipeline por tier

### Tier A — texto estruturado (Semiologia da Língua) → parser determinístico
A Semiologia segue blocos repetidos por caso: `ASPECTO LINGUAL`, `Saburra`,
`Principais etiopatogenias`, `Diagnóstico`. Escrever um **parser por seções** que:
1. quebra o texto por caso;
2. extrai o achado (aspecto+saburra) como `finding.label`/`aliases`;
3. lê `Diagnóstico/etiopatogenias` e mapeia para `patternLinks` (casar nomes com
   `patternDefinitions`; o que não casar vira candidato `pattern` novo);
4. anexa `source` (página + webp + trecho).
Sem LLM, barato, alta precisão. **Começar por aqui.**

### Tier B — texto limpo narrativo → extração assistida por LLM
Para 81 Dificuldades, Auteroche (páginas limpas), Jeremy Ross:
- normalizar texto (acentos, ligaduras "fl/fi", hífens de quebra de linha);
- enviar página a página a um LLM com **schema de saída estrito** (os JSON da seção 3)
  e instrução: "extraia apenas o que está no texto; cite o trecho; não invente;
  responda só JSON válido; pt-BR".
- `--provider` configurável (gemini | openai | none). **Atenção: créditos Gemini podem
  estar esgotados** — implementar modo `--dry-run`/`none` que só valida o pipeline sem
  chamar a API, e permitir rodar Tier B depois que houver crédito.
- Toda saída do LLM passa por validação de schema antes de virar candidato.

### Tier C — imagem pura → adiar (visão-OCR depois)
Microssistema, Folcks, Auteroche-meridianos: NÃO extrair texto clínico agora.
Planejar passo futuro com Gemini Vision (descrever figura/legenda → candidato),
mantendo o mesmo schema e gate. Por enquanto, só registrar como "fonte visual pendente".

## 5. Saídas (arquivos, não versionados)

Gravar em `.local-source-assets/pdf-sources/knowledge/`:
- `finding-candidates.local.json`
- `question-candidates.local.json`
- `pattern-candidates.local.json`
- `extract-knowledge-audit.local.json` (por fonte: páginas lidas, candidatos gerados,
  páginas puladas e motivo, % de cobertura)
- Um doc resumo em `docs/` por lote (espelhar o padrão `pdf-source-learning-*.md`).

Formato: envelope `{ schemaVersion, generatedAt, policy, counts, items }` como os
arquivos atuais. Tudo `status:"review"`.

## 6. Guardrails (não-negociáveis)

- NÃO editar `checklists.js`, `knowledgeBase.js`, `analyzer.js` nem nada do app clínico.
- NÃO aprovar nada automaticamente; `requiresProfessionalAudit: true` sempre.
- Só pt-BR; descartar ou marcar trecho que não seja pt-BR limpo.
- Todo candidato precisa de `source` resolvível (página + webp existente + trecho).
- Sem dados de paciente em nenhum lugar do pipeline.
- Idempotente: rodar de novo não duplica (chavear por `id` estável).
- Repetível para os **+10 PDFs futuros**: basta adicioná-los ao catálogo com
  `knowledgeDomain`/`curationTarget` e rodar o mesmo comando.

## 7. Critérios de aceite

- Tier A (Semiologia) gera ≥1 `finding` por caso descrito, cada um com ≥1 `patternLink`
  e `source` válido; 0 auto-aprovados.
- `pattern` referenciado em `patternLinks` ou casa com `patternDefinitions` ou existe
  como candidato `pattern` novo (sem nome órfão).
- `extract-knowledge-audit` mostra cobertura por fonte e páginas puladas com motivo.
- Rodar 2x não duplica candidatos.
- Nenhuma fonte Tier C produz achado textual nesta fase.
- App clínico inalterado (nenhum arquivo de runtime tocado).

## 8. CLI sugerida

```bash
# Tier A + B (B em dry-run se sem credito)
node tools/knowledge/extract-knowledge.mjs --tiers A,B --provider none
node tools/knowledge/extract-knowledge.mjs --source semiologia-da-lingua-completo --tier A
node tools/knowledge/extract-knowledge.mjs --tiers B --provider gemini   # quando houver credito
```

## 9. O que NÃO fazer

- Não usar o conector raso de pontos (`connect-pdf-source-candidates.mjs`) para isto —
  ele só indexa menção de código, não extrai conhecimento.
- Não tentar extrair de OCR lixo (Folcks) — vira "dado errado com citação legítima".
- Não inventar vínculo achado→padrão fora do que o texto diz; sempre citar trecho.
- Não publicar nada no Supabase nesta fase.

---

Próxima fase (fora deste guia): UI de curadoria no SuperAdm para aprovar candidatos e,
só então, religar `analyzer.js`/anamnese para usar a base curada (contar respostas reais,
vocabulário de gatilhos rico, mapa achado→padrão). Ver
`docs/plano-atlas-lingua-pulso-espinha-dorsal.md`.
