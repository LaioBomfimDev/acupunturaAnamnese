# Ingestao local de PDFs da Biblioteca Viva

Gerado em: 2026-07-10T18:55:29.111Z

## Regra de idioma e dominio

- Conteudo clinico normalizado no app deve permanecer em pt-BR.
- Texto original em ingles/outro idioma fica apenas como fonte bruta local.
- Fonte nao-pt-BR so pode alimentar ficha de ponto depois de sintese pt-BR revisada, com trecho e pagina rastreaveis.
- Fonte marcada como dominio especifico/source-only fica fora do scanner de pontos.
- Todo item importado destes PDFs permanece em rascunho/revisao e exige auditoria profissional.

## Resultado

| Fonte | Idioma original | Paginas | Telas renderizadas | OCR concluido | Gate para uso |
| --- | --- | ---: | ---: | ---: | --- |
| Manual Neuropsicologia - Ciencia e Profissao | pt-BR | 68 | 68 | 5 | fonte de dominio especifico; fora do scanner de pontos |
| CID-11 - Transtornos mentais, comportamentais ou do neurodesenvolvimento | pt-BR | 233 | 233 | 1 | fonte de dominio especifico; fora do scanner de pontos |
| Transtornos do Neurodesenvolvimento - CID-11 | pt-BR | 1 | 1 | 0 | fonte de dominio especifico; fora do scanner de pontos |
| Analise do Comportamento Aplicada para pessoas com Transtornos do Espectro do Autismo | pt-BR | 396 | 396 | 396 | fonte de dominio especifico; fora do scanner de pontos |
| DSM-5-TR - Manual Diagnostico e Estatistico de Transtornos Mentais | pt-BR | 1381 | 1381 | 37 | fonte de dominio especifico; fora do scanner de pontos |

## Arquivos locais

- Indice: `frontend/.local-source-assets/pdf-sources/source-index.local.json`
- Manifestos: `frontend/.local-source-assets/pdf-sources/<fonte>/manifest.json`
- Telas: `frontend/.local-source-assets/pdf-sources/<fonte>/pages/page-###.webp`
- Texto extraido: `frontend/.local-source-assets/pdf-sources/<fonte>/text/page-###.txt`
- OCR: `frontend/.local-source-assets/pdf-sources/<fonte>/ocr/page-###.txt`

Esses arquivos locais sao ignorados pelo Git e nao devem ser publicados no bundle principal.
