# Sistematização canônica dos mapas de pontos

Data: 2026-06-10

## O que mudou

A lógica de posicionamento de pontos nos mapas deixou de usar heurísticas
parciais (listas soltas de intervalos como `isFrontLegPoint`) e passou a usar
uma camada canônica de roteamento anatômico em
`frontend/src/knowledge/mapRouting.js`, consumida por
`frontend/src/knowledge/mapLocations.js`.

### 1. Tabela canônica de regiões (`mapRouting.js`)

- Cada ponto dos 14 meridianos clássicos (LU1–GV28, 361 pontos) tem uma
  região anatômica canônica baseada na localização padrão WHO
  (ex.: `BL67 → foot_lateral`, `KI1 → foot_plantar`, `SI18 → face`).
- Cada região define os mapas do app onde o ponto pode aparecer, em ordem de
  preferência (`REGION_MAPS`). Regiões de tornozelo aceitam tanto o mapa de
  pés quanto o de pernas; face aceita apenas `body_front`.
- Pontos de linha mediana (VC, VG, Yintang) são identificados por
  `isMidlinePoint` e travados em `xPct = 50` nos mapas de corpo.
- Cobertura completa verificada por teste de regressão (nenhum ponto fica sem
  região nem sem mapa permitido).

### 2. Roteamento de rascunhos automáticos (`mapLocations.js`)

Os rascunhos gerados em coordenadas de corpo inteiro são roteados para o mapa
segmentado preferido da sua região, com reescala de coordenadas — agora
incluindo o caminho corpo → pés (`rescaleFootX/rescaleFootY`), que antes não
existia e deixava pontos como GB44 colados na borda do mapa.

Correções de rota em relação à heurística anterior:

- `BL60–BL67` (tornozelo/borda lateral do pé) vão para `feet_dorsal`, não
  para `legs_back`.
- `GB40` e `LR4` (tornozelo) vão para `feet_dorsal`.
- `KI1` permanece exclusivo de `feet_plantar`.
- Frente e costas nunca se misturam: não há rota `body_back → body_front`.

### 3. Sinalização `review_map_mismatch`

Rascunho automático cuja coordenada é incompatível com a região canônica
(fora da faixa vertical plausível da folha de corpo, ou desenhado na face
errada do corpo) **não é reescalado para um lugar errado**: mantém o mapa e a
coordenada originais e recebe `reviewStatus: 'review_map_mismatch'` +
`mapMismatch: true`, continuando não aprovado.

Sinalizados nesta data (23): `BL1`, `BL2` (pontos de face gerados no mapa das
costas), `BL41–BL54` (segunda linha das costas gerada na altura da coxa),
`GV25–GV28` (pontos de face no mapa das costas), `SI18`, `SI19` (face no mapa
das costas) e `KI11` (abdome gerado abaixo da faixa plausível).

### 4. Identidade por lado (pontos bilaterais)

A identidade de uma localização passou de `código::mapa` para
`código::mapa::lado` (`left`/`right`/`center`, derivado de `xPct`; mediana é
sempre `center`). Calibrar um lado de um ponto bilateral (ex.: ST25) não
apaga mais a coordenada do outro lado.

### 5. Validação contínua

- `validateMapLocations()` em `mapLocations.js` valida o conjunto completo:
  mapa existente, vista coerente com o asset, coordenadas em 0–100, ponto
  auricular apenas em mapa de orelha, mapa permitido pela região canônica e
  identidades duplicadas.
- Novo teste `frontend/tests/regression/map-locations.test.mjs` (10 casos)
  roda no `npm run test:regression` e cobre validação completa, cobertura da
  tabela, rotas de pé/mão, sinalização de divergência, linha mediana e
  bilateralidade.

### 6. Painel Mapas da Biblioteca

O `MapCoordinateEditor` ganhou o filtro de status pedido na auditoria de
2026-06-04 (Todos / Aprovados / Rascunhos / Automáticos / Revisar mapa),
marcador visual próprio (vermelho tracejado) e contagem de pontos a revisar
no cabeçalho do mapa.

## Estado atual

- 469 localizações ativas, 0 erros de validação.
- 23 rascunhos pendentes de recalibração visual (filtro "Revisar mapa").
- Aprovação clínica continua exigindo auditoria profissional
  (`requiresProfessionalAudit: true` preservado em todos os fluxos).

## Próximos passos sugeridos

1. Recalibrar visualmente os 23 pontos sinalizados usando o filtro
   "Revisar mapa" (prioridade: BL41–BL54 com página do Atlas).
2. Gerar/usar um asset frontal para BL1, BL2, GV25–GV28, SI18 e SI19 ao
   recalibrar (são pontos de face; basta selecionar o ponto e clicar no mapa
   `body_front`).
3. Avaliar um mapa lateral de cabeça para os trajetos de GB e TE na têmpora.
