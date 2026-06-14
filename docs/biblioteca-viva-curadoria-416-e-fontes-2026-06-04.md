# Biblioteca Viva - curadoria dos 416 pontos e novas fontes

Data: 2026-06-04

## O que significa "base curada"

No estado atual do projeto, ha tres camadas diferentes que nao devem ser misturadas:

- `frontend/src/knowledge/generated/km-agent/*`: base importada do KM-Agent. Contem os 416 registros como fonte/rascunho.
- `frontend/.local-source-assets/atlas-ednea/deep-curated-reviews.json`: pacote local de curadoria profunda. Normaliza os 416 registros com campos clinicos, fontes, cautelas e metadados, mas ainda exige auditoria profissional.
- `frontend/.local-source-assets/atlas-ednea/high-confidence-reviews.json`: pacote local aprovado por criterio de alta confianca/local only. Alimenta raciocinio clinico local quando carregado pelo app, mas continua marcado com `requiresProfessionalAudit: true`.
- `frontend/src/knowledge/knowledgeBase.js`: base ativa estatica do frontend. Hoje contem apenas um subconjunto pequeno de pontos sistemicos e auriculares usados diretamente por protocolos e relatorios.

Assim, "curado" pode significar duas coisas diferentes:

1. Normalizado e revisavel: o registro tem localizacao, acoes, indicacoes, cautelas, tecnicas, notas e fontes rastreaveis.
2. Aprovado para uso local: o registro esta em `approved_local`, com criterio e auditoria registrados, mas ainda nao e aprovacao profissional final nem migracao para producao.

## Estado atual dos 416

- Total KM-Agent: 416 registros.
- Pontos dos 14 meridianos classicos: 361.
- Pontos extras/anatomia/auricular complementar: 55.
- Curadoria profunda local: 416/416 registros normalizados.
- Aprovacao local materializada no arquivo atual: 341 registros.
- Desses 341, 305 correspondem aos 416 registros KM-Agent.
- Os outros 36 sao extras do Atlas, fora do universo KM-Agent original.
- Pendentes para fechar aprovacao local dentro dos 416: 111 registros.

Observacao: por isso a conta correta para os 416 e `305 aprovados + 111 pendentes = 416`.

## Pendencias por grupo

| Grupo | Total | Aprovados localmente | Pendentes |
| --- | ---: | ---: | ---: |
| LU | 11 | 6 | 5 |
| LI | 20 | 18 | 2 |
| ST | 45 | 35 | 10 |
| SP | 21 | 17 | 4 |
| HT | 9 | 8 | 1 |
| SI | 19 | 15 | 4 |
| BL | 67 | 52 | 15 |
| KI | 27 | 20 | 7 |
| PC | 9 | 9 | 0 |
| TE | 23 | 17 | 6 |
| GB | 44 | 32 | 12 |
| LR | 14 | 9 | 5 |
| GV | 28 | 19 | 9 |
| CV | 24 | 13 | 11 |
| EX-HN | 15 | 12 | 3 |
| EX-CA | 1 | 1 | 0 |
| EX-B | 9 | 7 | 2 |
| EX-UE | 11 | 8 | 3 |
| EX-LE | 12 | 7 | 5 |
| SA | 4 | 0 | 4 |
| AA | 3 | 0 | 3 |

## O que falta para considerar os 416 curados

Para cada ponto pendente, falta fechar um dossie minimo:

- Fonte primaria ou secundaria vinculada ao codigo do ponto.
- Pagina impressa/PDF, trecho curto e campo clinico afetado.
- Localizacao normalizada em pt-BR, sem ruido de OCR.
- Acoes/funcoes energeticas revisadas.
- Indicacoes revisadas, sem prometer tratamento autonomo.
- Cautelas e contraindicacoes, especialmente torax, abdome, olho, vasos, gestacao, sangria e mucosas.
- Tecnica/agulhamento/moxa revisados por seguranca.
- Relacoes MTC e sintomas relacionados com rastreabilidade.
- Status final local: `approved_local`, `review`, `rejected` ou `needs_professional_audit`.

Nao e necessario criar coordenadas de mapa para curar o ponto. Mapa e uma camada separada.

## Fila objetiva de revisao

Confianca media, revisar primeiro:

`LU4`, `LU6`, `LU7`, `LU8`, `LU9`, `LI16`, `LI17`, `ST5`, `ST10`, `ST11`, `ST12`, `ST15`, `ST17`, `ST24`, `ST30`, `ST38`, `ST43`, `SP1`, `SP12`, `SP13`, `SP16`, `HT5`, `SI9`, `SI14`, `SI15`, `SI18`, `BL4`, `BL8`, `BL10`, `BL13`, `BL17`, `BL19`, `BL21`, `BL33`, `BL36`, `BL43`, `BL45`, `BL49`, `BL50`, `BL52`, `BL57`, `KI3`, `KI6`, `KI15`, `KI17`, `KI24`, `KI25`, `KI27`, `TE4`, `TE11`, `TE12`, `TE15`, `TE20`, `GB14`, `GB15`, `GB16`, `GB28`, `GB31`, `GB32`, `GB35`, `GB37`, `GB40`, `GB41`, `GB42`, `GB43`, `LR2`, `LR5`, `LR8`, `LR9`, `LR12`, `GV4`, `GV8`, `GV10`, `GV11`, `GV12`, `GV13`, `GV15`, `GV22`, `GV28`, `CV1`, `CV2`, `CV4`, `CV9`, `CV10`, `CV13`, `CV17`, `CV19`, `CV20`, `CV21`, `CV24`.

Confianca baixa, revisar por ultimo ou exigir fonte adicional:

`TE17`, `EX-HN2`, `EX-HN9`, `EX-HN10`, `EX-B5`, `EX-B6`, `EX-UE5`, `EX-UE6`, `EX-UE8`, `EX-LE1`, `EX-LE8`, `EX-LE9`, `EX-LE11`, `EX-LE12`, `SA1`, `SA2`, `SA3`, `SA4`, `AA1`, `AA2`, `AA3`.

## PDFs recebidos em 2026-06-04

### Langevin e Yandow - Relationship of acupuncture points and meridians to connective tissue planes

Arquivo:

`C:\Users\m\Downloads\The Anatomical Record - 2003 - Langevin - Relationship of acupuncture points and meridians to connective tissue planes.pdf`

Classificacao:

- Tipo: artigo anatomico/cientifico.
- Paginas: 9.
- Texto extraivel: sim.
- DOI no PDF: `10.1002/ar.10185`.
- Uso recomendado na Biblioteca Viva: fonte de apoio anatomico para localizacao, planos fasciais, tecido conjuntivo, palpacao, mecanica de agulhamento e justificativas de seguranca.
- Limite: nao valida individualmente os 416 pontos. Deve ser usado como fonte transversal, nao como aprovacao ponto-a-ponto.

Resumo rastreavel:

- O artigo propoe relacao entre pontos/meridianos e planos de tecido conjuntivo.
- O texto relata correspondencia de 80% entre pontos avaliados e planos intermusculares/intramusculares em secoes anatomicas.
- O material e especialmente util para justificar cautela anatomica e revisao de localizacao em pontos de membros, mas nao substitui atlas de localizacao.

### pdf acuup.pdf

Arquivo:

`C:\Users\m\Downloads\pdf acuup.pdf`

Classificacao:

- Tipo: PDF gerado por impressao, provavelmente imagem.
- Paginas: 9.
- Texto extraivel: nao, 0 caracteres por pagina via `pypdf`.
- Titulo interno: referencia ao mesmo artigo de Langevin.
- Uso recomendado na Biblioteca Viva: manter como fonte visual duplicada/pendente apenas se houver necessidade de imagem; para curadoria textual, usar o PDF textual acima.
- Bloqueio: OCR nao disponivel no ambiente local atual (`tesseract` nao localizado).

## Estrategia recomendada

1. Manter o Langevin como fonte transversal de anatomia e seguranca.
2. Nao promover ponto por esse artigo sozinho.
3. Usar o Atlas Ednea e KM-Agent como fonte ponto-a-ponto; usar Langevin como reforco anatomico quando o ponto envolve planos fasciais, palpacao, tecido conjuntivo ou mecanismo de agulhamento.
4. Fechar os 111 pendentes por lote: primeiro os 90 de confianca media, depois os 21 de baixa.
5. Preservar `requiresProfessionalAudit: true` em qualquer aprovacao local em lote.
