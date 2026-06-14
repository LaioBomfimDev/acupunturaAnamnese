# Ingestao local de PDFs da Biblioteca Viva

Gerado em: 2026-06-06T05:03:38.915Z

## Regra de idioma

- Paginas de ponto no app devem permanecer em pt-BR.
- Texto original em ingles/outro idioma fica apenas como fonte bruta local.
- Fonte nao-pt-BR so pode alimentar ficha de ponto depois de sintese pt-BR revisada, com trecho e pagina rastreaveis.
- Todo item importado destes PDFs permanece em rascunho/revisao e exige auditoria profissional.

## Resultado

| Fonte | Idioma original | Paginas | Telas renderizadas | OCR concluido | Gate para ficha |
| --- | --- | ---: | ---: | ---: | --- |
| Ear Acupuncture Clinical Treatment | en | 480 | 480 | 184 | bloqueado para ficha ate sintese pt-BR |
| Manual de Auriculoterapia: Acupuntura Auricular Francesa e Chinesa | pt-BR | 372 | 372 | 75 | elegivel como rascunho pt-BR apos revisao |
| Do acupuncture trials have lower risk of bias over the last five decades | en | 12 | 12 | 0 | bloqueado para ficha ate sintese pt-BR |
| Acupuncture decreased the risk of stroke among patients with fibromyalgia in Taiwan | en | 15 | 15 | 0 | bloqueado para ficha ate sintese pt-BR |
| Pontos de Acupuntura: Guia Ilustrado de Referencia | pt-BR | 372 | 372 | 27 | elegivel como rascunho pt-BR apos revisao |
| Livro Acupuntura Auricular | pt-BR | 108 | 108 | 14 | elegivel como rascunho pt-BR apos revisao |

## Arquivos locais

- Indice: `frontend/.local-source-assets/pdf-sources/source-index.local.json`
- Manifestos: `frontend/.local-source-assets/pdf-sources/<fonte>/manifest.json`
- Telas: `frontend/.local-source-assets/pdf-sources/<fonte>/pages/page-###.webp`
- Texto extraido: `frontend/.local-source-assets/pdf-sources/<fonte>/text/page-###.txt`
- OCR: `frontend/.local-source-assets/pdf-sources/<fonte>/ocr/page-###.txt`

Esses arquivos locais sao ignorados pelo Git e nao devem ser publicados no bundle principal.
