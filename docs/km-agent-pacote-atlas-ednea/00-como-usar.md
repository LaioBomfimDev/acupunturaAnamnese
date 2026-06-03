# Como usar o pacote Atlas Ednea

Este pacote foi criado para a IA que nao aceita o JSON grande de entrada.

Total de pontos: 416
Total de lotes: 27
Tamanho maximo por lote: 25 pontos

## Fluxo recomendado

1. Anexe o PDF clinico principal: Atlas da Ednea Martins.
2. Cole ou anexe `00-prompt-pronto.md`.
3. Anexe um unico lote, por exemplo `01-LU-001.md`.
4. Peca para a IA responder apenas JSON valido.
5. Salve a resposta como arquivo, por exemplo `resposta-01-LU-001.json`.
6. Repita o processo para os proximos lotes.
7. Depois envie as respostas para conversao/importacao.

## Por que nao mandar tudo de uma vez

O arquivo JSON completo tem muitos dados. Em lotes por meridiano/subgrupo, a IA consegue consultar o PDF com mais precisao e a resposta tem menor chance de ser cortada.
