# Instrucoes para preencher revisoes KM-Agent

Use este arquivo como guia antes de responder o JSON completo em
`docs/km-agent-review-inputs.json`.

## Objetivo

Voce recebera um JSON com 416 pontos de acupuntura importados do KM-Agent.
Cada item tem um bloco `reviewInputs` com os campos que precisam ser
preenchidos ou revisados para a tela de Revisao profissional do Sistema Acup.

Sua tarefa e devolver um JSON valido preenchendo os campos faltantes, sem
alterar o contexto original do rascunho.

## Arquivos que devem ser usados

1. PDF clinico principal fornecido pelo humano.
   - Esta e a primeira fonte.
   - Use pagina, secao ou trecho de referencia sempre que possivel.
2. `km-agent-review-inputs.json`.
   - Contem os inputs da tela e o contexto importado do KM-Agent.
3. Sugestoes AcuKG dentro de `sourceContext.acukg`.
   - Use apenas como sugestao nao revisada.
   - Nao trate AcuKG como aprovacao clinica automatica.

## Regra de prioridade das fontes

1. Se o PDF clinico principal disser algo diferente do KM-Agent, siga o PDF.
2. Se o PDF nao trouxer a informacao, use o contexto KM-Agent como rascunho.
3. Use AcuKG apenas para sugerir indicacoes, acoes, anatomia e evidencias.
4. Se nao houver fonte suficiente, deixe o campo vazio e explique em
   `clinicalNote`.

## Campos que aparecem em cada `reviewInputs`

- `code`: codigo WHO do ponto. Normalmente preserve.
- `displayCode`: codigo exibido no app. Normalmente preserve.
- `title`: titulo em pt-BR.
- `meridianCode`: codigo do meridiano, como LU, LI, ST, SP, HT, SI, BL, KI,
  PC, TE, GB, LR, CV, GV ou EX.
- `meridian`: nome do meridiano em pt-BR.
- `techniques`: tecnicas permitidas, separadas por virgula.
- `locationText`: localizacao textual em pt-BR.
- `actions`: acoes energeticas em pt-BR, separadas por virgula.
- `indications`: indicacoes em pt-BR, separadas por virgula.
- `cautions`: cautelas e contraindicacoes, separadas por virgula.
- `relatedPatterns`: padroes MTC relacionados, separados por virgula.
- `needling`: agulhamento ou tecnica em pt-BR.
- `clinicalNote`: justificativa breve, fonte usada e incertezas.

## Campos que mais precisam de preenchimento

Priorize preencher:

- `actions`
- `indications`
- `cautions`
- `relatedPatterns`
- `clinicalNote`

Tambem revise com cuidado:

- `title`
- `locationText`
- `needling`
- `techniques`

## Regras de resposta

- Responda em pt-BR.
- Retorne apenas JSON valido, sem Markdown.
- Preserve `sourceDraftId` de cada item.
- Preencha apenas `reviewInputs`, `references`, `confidence` e
  `requiresHumanReview`.
- Nao altere `sourceContext`.
- Nao marque nenhum item como aprovado.
- Nao invente informacoes clinicas quando nao houver fonte suficiente.
- Campos do tipo lista devem ser texto separado por virgula, porque o app
  divide esses campos por virgula ao salvar.

## Formato esperado da resposta

```json
{
  "schemaVersion": "km-agent-review-inputs.answer.v1",
  "items": [
    {
      "sourceDraftId": "acupoint:LU7",
      "reviewInputs": {
        "code": "LU7",
        "displayCode": "LU7",
        "title": "LU7 - Lieque (Pulmao)",
        "meridianCode": "LU",
        "meridian": "Pulmao",
        "techniques": "agulha, laser, stiper",
        "locationText": "Texto revisado em pt-BR conforme o PDF principal.",
        "actions": "liberar Exterior, regular Pulmao, beneficiar cabeca e nuca",
        "indications": "tosse, dor de garganta, cefaleia, rigidez cervical",
        "cautions": "evitar agulhamento profundo sem dominio anatomico local",
        "relatedPatterns": "Vento-Frio exterior, Qi do Pulmao rebelde",
        "needling": "Tecnica revisada em pt-BR conforme o PDF principal.",
        "clinicalNote": "Revisado com base no PDF principal; AcuKG usado apenas como apoio."
      },
      "references": [
        {
          "field": "locationText",
          "source": "primary_pdf",
          "page": null,
          "note": "Informar pagina/secao quando disponivel."
        }
      ],
      "confidence": "medium",
      "requiresHumanReview": true
    }
  ]
}
```

## Observacao de seguranca clinica

Estes dados sao rascunhos para revisao profissional. A resposta nao deve
transformar sugestoes em uso clinico automatico. Quando houver duvida, preserve
a cautela e registre a incerteza em `clinicalNote`.
