# Ingestao local de PDFs da Biblioteca Viva

Gerado em: 2026-06-19T13:09:12.308Z

## Regra de idioma e dominio

- Conteudo clinico normalizado no app deve permanecer em pt-BR.
- Texto original em ingles/outro idioma fica apenas como fonte bruta local.
- Fonte nao-pt-BR so pode alimentar ficha de ponto depois de sintese pt-BR revisada, com trecho e pagina rastreaveis.
- Fonte marcada como dominio especifico/source-only fica fora do scanner de pontos.
- Todo item importado destes PDFs permanece em rascunho/revisao e exige auditoria profissional.

## Resultado

| Fonte | Idioma original | Paginas | Telas renderizadas | OCR concluido | Gate para uso |
| --- | --- | ---: | ---: | ---: | --- |
| E-book Ervas Medicinais | pt-BR | 440 | 440 | 0 | fonte de dominio especifico; fora do scanner de pontos |
| Sistema Chines de Curas Alimentares | pt-BR | 231 | 231 | 1 | fonte de dominio especifico; fora do scanner de pontos |

## Arquivos locais

- Indice: `frontend/.local-source-assets/pdf-sources/source-index.local.json`
- Manifestos: `frontend/.local-source-assets/pdf-sources/<fonte>/manifest.json`
- Telas: `frontend/.local-source-assets/pdf-sources/<fonte>/pages/page-###.webp`
- Texto extraido: `frontend/.local-source-assets/pdf-sources/<fonte>/text/page-###.txt`
- OCR: `frontend/.local-source-assets/pdf-sources/<fonte>/ocr/page-###.txt`

Esses arquivos locais sao ignorados pelo Git e nao devem ser publicados no bundle principal.
