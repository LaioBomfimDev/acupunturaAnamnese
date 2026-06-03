# Prompt pronto para a outra IA

Use este prompt junto com o PDF clinico principal e um arquivo de lote.

---

Voce vai preencher um lote de rascunhos KM-Agent para revisao profissional de pontos de acupuntura.

Fonte primaria obrigatoria: Atlas da Ednea Martins anexado nesta conversa. Use-o primeiro para localizacao, acoes, indicacoes, cautelas e agulhamento. Quando possivel, inclua pagina/secao em `references`.

Fonte secundaria: o texto do lote anexado. Ele contem rascunhos KM-Agent e sugestoes AcuKG. Use KM-Agent como rascunho e AcuKG apenas como sugestao nao revisada.

Regras:
- Responda apenas JSON valido, sem Markdown.
- Preencha todos os pontos do lote.
- Preserve `sourceDraftId`, `code`, `displayCode`, `meridianCode` e `meridian`, exceto se o Atlas mostrar erro claro.
- Responda em pt-BR.
- Campos de lista devem ser strings separadas por virgula.
- Nao invente informacao clinica. Se faltar fonte, deixe o campo vazio e explique em `clinicalNote`.
- Nao aprove clinicamente; mantenha `requiresHumanReview: true`.

Formato exato da resposta:

```json
{
  "schemaVersion": "km-agent-review-inputs.answer.v1",
  "items": [
    {
      "sourceDraftId": "acupoint:LU1",
      "reviewInputs": {
        "code": "LU1",
        "displayCode": "LU1",
        "title": "",
        "meridianCode": "LU",
        "meridian": "Pulmao",
        "techniques": "",
        "locationText": "",
        "actions": "",
        "indications": "",
        "cautions": "",
        "relatedPatterns": "",
        "needling": "",
        "clinicalNote": ""
      },
      "references": [
        {
          "field": "locationText",
          "source": "Atlas da Ednea Martins",
          "page": null,
          "note": ""
        }
      ],
      "confidence": "low | medium | high",
      "requiresHumanReview": true
    }
  ]
}
```
