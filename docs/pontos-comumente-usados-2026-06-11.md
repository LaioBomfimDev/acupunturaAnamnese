# Categoria "Pontos comumente usados" — 2026-06-11

## Contexto

Pesquisa clínica com a mestra em acupuntura indicou que, na prática, não se usa a base
inteira (~400 pontos) durante a anamnese. Foi criada a categoria **Pontos comumente
usados** com 142 pontos ativos no filtro comum (126 corporais + 16 auriculares).

**Nada foi excluído da base** — apenas separado:

- **Usuários comuns** veem somente os 142 pontos comumente usados (Biblioteca e ranking
  por evidências do Protocolo).
- **SuperAdm** mantém a biblioteca completa e editável (Biblioteca Viva), agora com o
  selo "⭐ Comumente usado" nos pontos da categoria.

## Onde está cada coisa

| Arquivo | Papel |
| --- | --- |
| `frontend/src/knowledge/commonlyUsedPoints.js` | Fonte de verdade da categoria: 142 entradas com `map` (localização nos mapas visuais, pronta para o próximo passo de imagens), `code`/`displayCode`, `name`, `mainUse` e `clinicalCategories`. Helpers de matching por alias brasileiro, slug e nome auricular. |
| `frontend/src/knowledge/knowledgeBase.js` | Todos os `acupoints` e `auricularPoints` recebem `commonlyUsed: true/false` e `commonUsage` (mapa, uso principal, categorias clínicas). A lista auricular comum ativa fica restrita a pontos do trilho chinês/oficial com fonte/página rastreável. |
| `frontend/src/knowledge/pointRecommendationEngine.js` | Opção `commonlyUsedOnly` em `buildRecommendationCandidates`/`buildPointRecommendations` (padrão `false`, mantendo compatibilidade). |
| `frontend/src/components/panels/Protocolo.jsx` | Chama o ranking com `commonlyUsedOnly: true` (visão do usuário comum). |
| `frontend/src/components/panels/Biblioteca.jsx` | Cards de Ponto/Aurículo (curados, revisões e rascunhos) filtrados para a categoria. Demais categorias (síndromes, técnicas, mapas, segurança) seguem visíveis. |
| `frontend/src/components/panels/KnowledgeAdminPanel.jsx` | Selo "⭐ Comumente usado" na lista de rascunhos do SuperAdm. |
| `frontend/src/knowledge/aliases.js` | Alias `TAIYANG`/`EX-HN5` adicionado. |
| `frontend/tests/regression/commonly-used-points.test.mjs` | Regressão: 142 entradas, marcação completa na base, helpers de alias e comportamento do filtro. |

## Decisões de modelagem

- Códigos canônicos em inglês (`GV20`, `BL23`, `SI3`...) com `displayCode` brasileiro
  (`VG20`, `B23`, `ID3`...) conforme a tabela enviada.
- Auriculares casam por slug; "Adrenal" → slug existente `supra-renal` e
  "Coluna Lombar" → `lombar` (com aliases para busca pelos dois nomes).
- Revisões aprovadas na Biblioteca Viva que **não** pertencem à categoria não aparecem
  para o usuário comum (filtro estrito de 142). Sem o filtro (SuperAdm/testes), a base
  completa continua disponível.
- Os protocolos-base das síndromes (`patternDefinitions`) usam apenas auriculares
  comuns do trilho chinês/oficial; pontos funcionais/de escola (`Ansiedade`, `Sono`,
  `Fome` etc.) ficam fora dos protocolos padrão até curadoria separada.

## Atualização de curadoria — 2026-07-07

- Removidos da categoria comum auricular ativa os pontos funcionais/de escola ou sem
  equivalência rastreável suficiente: `Ansiedade`, `Útero`, `Ovário`, `Depressão`,
  `Insônia`, `Occipital`, `Fronte` e `Tálamo`.
- Permanecem 16 auriculares comuns com `officialChinese: true`, fonte/página local e
  texto pt-BR revisável: `Shen Men`, `Subcórtex`, `Simpático`, `Rim`, `Fígado`,
  `Coração`, `Pulmão`, `Baço`, `Estômago`, `Intestino Grosso`, `Intestino Delgado`,
  `Endócrino`, `Hipófise`, `Adrenal`, `Coluna Lombar`, `Joelho`.

## Observação para o passo dos mapas

- O campo `map` de cada entrada usa os nomes da tabela ("Torso e cabeça - frente",
  "Pernas - costas", "Pé - dorso", "Orelha - lateral" etc.).
- Atenção na revisão das imagens: a tabela posiciona **IG10/LI10 (Shousanli)** em
  "Pernas - frente" e **P7/LU7 (Lieque)** em "Mãos e punhos - dorso" — conferir se é a
  intenção, pois LI10 é ponto de antebraço.
