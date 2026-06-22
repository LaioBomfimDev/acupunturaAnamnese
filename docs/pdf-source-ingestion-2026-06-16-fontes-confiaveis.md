# Ingestao local de PDFs da Biblioteca Viva

Gerado em: 2026-06-16T15:41:55.719Z

## Regra de idioma e dominio

- Conteudo clinico normalizado no app deve permanecer em pt-BR.
- Texto original em ingles/outro idioma fica apenas como fonte bruta local.
- Fonte nao-pt-BR so pode alimentar ficha de ponto depois de sintese pt-BR revisada, com trecho e pagina rastreaveis.
- Fonte marcada como dominio especifico/source-only fica fora do scanner de pontos.
- Todo item importado destes PDFs permanece em rascunho/revisao e exige auditoria profissional.

## Resultado

| Fonte | Idioma original | Paginas | Telas renderizadas | OCR concluido | Gate para uso |
| --- | --- | ---: | ---: | ---: | --- |
| Atlas Guia Pratico Acupuntura - Folcks | pt-BR | 702 | 702 | 702 | elegivel como rascunho pt-BR apos revisao |
| Atlas de Acupuntura Chinesa - Meridianos e Colaterais | pt-BR | 269 | 269 | 172 | elegivel como rascunho pt-BR apos revisao |
| Atlas Colorido de Acupuntura | pt-BR | 147 | 147 | 0 | elegivel como rascunho pt-BR apos revisao |
| Semiologia da Lingua (Completo) | pt-BR | 295 | 295 | 0 | fonte de dominio especifico; fora do scanner de pontos |
| Microssistema Lingua | pt-BR | 103 | 103 | 0 | fonte de dominio especifico; fora do scanner de pontos |
| Diagnostico da Medicina Chinesa | pt-BR | 422 | 422 | 0 | fonte de dominio especifico; fora do scanner de pontos |
| Combinacoes dos Pontos de Acupuntura - A Chave para o Exito Clinico | pt-BR | 511 | 511 | 0 | fonte de dominio especifico; fora do scanner de pontos |
| Classico das 81 Dificuldades - EBRAMEC | pt-BR | 64 | 64 | 0 | fonte de dominio especifico; fora do scanner de pontos |

## Arquivos locais

- Indice: `frontend/.local-source-assets/pdf-sources/source-index.local.json`
- Manifestos: `frontend/.local-source-assets/pdf-sources/<fonte>/manifest.json`
- Telas: `frontend/.local-source-assets/pdf-sources/<fonte>/pages/page-###.webp`
- Texto extraido: `frontend/.local-source-assets/pdf-sources/<fonte>/text/page-###.txt`
- OCR: `frontend/.local-source-assets/pdf-sources/<fonte>/ocr/page-###.txt`

Esses arquivos locais sao ignorados pelo Git e nao devem ser publicados no bundle principal.
