# KM-Agent + Atlas Ednea - resumo de producao

Fonte primaria usada: Atlas dos Pontos de Acupuntura: Guia de Localizacao

## Resultado

- Total de rascunhos KM-Agent: 416
- Pontos dos 14 canais mapeados no Atlas: 361
- Pontos extras/SA/AA sem mapeamento automatico: 55
- Candidatos referenciados pelo Atlas: 270
- Itens ainda em revisao: 146
- Confianca alta: 270
- Confianca media: 90
- Confianca baixa: 56

## Por meridiano

- LU: 6/11 com confianca alta; 5 ainda em revisao.
- LI: 18/20 com confianca alta; 2 ainda em revisao.
- ST: 35/45 com confianca alta; 10 ainda em revisao.
- SP: 17/21 com confianca alta; 4 ainda em revisao.
- HT: 8/9 com confianca alta; 1 ainda em revisao.
- SI: 15/19 com confianca alta; 4 ainda em revisao.
- BL: 52/67 com confianca alta; 15 ainda em revisao.
- KI: 20/27 com confianca alta; 7 ainda em revisao.
- PC: 9/9 com confianca alta; 0 ainda em revisao.
- TE: 17/23 com confianca alta; 6 ainda em revisao.
- GB: 32/44 com confianca alta; 12 ainda em revisao.
- LR: 9/14 com confianca alta; 5 ainda em revisao.
- GV: 19/28 com confianca alta; 9 ainda em revisao.
- CV: 13/24 com confianca alta; 11 ainda em revisao.
- EXHN: 0/15 com confianca alta; 15 ainda em revisao.
- EXCA: 0/1 com confianca alta; 1 ainda em revisao.
- EXB: 0/9 com confianca alta; 9 ainda em revisao.
- EXUE: 0/11 com confianca alta; 11 ainda em revisao.
- EXLE: 0/12 com confianca alta; 12 ainda em revisao.
- SA: 0/4 com confianca alta; 4 ainda em revisao.
- AA: 0/3 com confianca alta; 3 ainda em revisao.

## Arquivos gerados

- `docs/km-agent-ednea-production-candidates.json`: candidatos completos com texto do Atlas e referencias.
- `docs/km-agent-ednea-local-reviews.json`: formato proximo ao export de revisoes locais da tela.
- `docs/ednea-atlas-pages.json`: extracao paginada do PDF.

## Observacao clinica

Os itens com `atlas_referenced_candidate` tem fonte e pagina, mas permanecem com `requiresHumanReview: true`. A promocao final para `approved` deve ocorrer apenas apos revisao profissional ou criterio explicito do SuperAdm.
