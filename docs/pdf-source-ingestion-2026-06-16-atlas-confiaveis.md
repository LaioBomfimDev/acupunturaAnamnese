# Ingestao local de PDFs da Biblioteca Viva

Gerado em: 2026-06-16T15:04:58.614Z

## Regra de idioma

- Paginas de ponto no app devem permanecer em pt-BR.
- Texto original em ingles/outro idioma fica apenas como fonte bruta local.
- Fonte nao-pt-BR so pode alimentar ficha de ponto depois de sintese pt-BR revisada, com trecho e pagina rastreaveis.
- Todo item importado destes PDFs permanece em rascunho/revisao e exige auditoria profissional.

## Resultado

| Fonte | Idioma original | Paginas | Telas renderizadas | OCR concluido | Gate para ficha |
| --- | --- | ---: | ---: | ---: | --- |
| Atlas Guia Pratico Acupuntura - Folcks | pt-BR | 702 | 702 | 702 | elegivel como rascunho pt-BR apos revisao |
| Atlas de Acupuntura Chinesa - Meridianos e Colaterais | pt-BR | 269 | 269 | 172 | elegivel como rascunho pt-BR apos revisao |
| Atlas Colorido de Acupuntura | pt-BR | 147 | 147 | 0 | elegivel como rascunho pt-BR apos revisao |

## Arquivos locais

- Indice: `frontend/.local-source-assets/pdf-sources/source-index.local.json`
- Manifestos: `frontend/.local-source-assets/pdf-sources/<fonte>/manifest.json`
- Telas: `frontend/.local-source-assets/pdf-sources/<fonte>/pages/page-###.webp`
- Texto extraido: `frontend/.local-source-assets/pdf-sources/<fonte>/text/page-###.txt`
- OCR: `frontend/.local-source-assets/pdf-sources/<fonte>/ocr/page-###.txt`

Esses arquivos locais sao ignorados pelo Git e nao devem ser publicados no bundle principal.
