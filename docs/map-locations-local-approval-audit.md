# Auditoria local de coordenadas em mapLocations

Data: 2026-06-04

## Escopo

Revisão das coordenadas já existentes em `frontend/src/knowledge/mapLocations.js`.
O objetivo foi aprovar visualmente apenas pares `ponto + mapa` com evidência
coerente entre fonte KM-Agent/Atlas, dica OCR/MD e anatomia visível no asset do
mapa. A aprovação é local, não publica dados no Supabase e mantém auditoria
profissional obrigatória antes de produção.

## Critério

- Fonte clínica local: Atlas Ednea Martins via índice local de fonte e pacote
  KM-Agent/Atlas.
- Dica textual: `location_en`, OCR/MD e relações anatômicas do KM-Agent.
- Dica visual: mapa do app em `frontend/public/maps`.
- Status aplicado: `approved: true`, `calibrationStatus:
  approved_local_visual`, `approvalMode: local_only`,
  `requiresProfessionalAudit: true`.

## Camada funcional automática

Além das coordenadas aprovadas localmente, o app mantém `254` coordenadas
automáticas em `frontend/src/knowledge/generated/high-confidence-map-locations.js`.
Elas entram no mapa como `draft_auto_high_confidence`, aparecem na lista e no
seletor de calibração, mas preservam `approved: false`.

Essa camada serve para deixar mais de 200 pontos operáveis no mapa sem confundir
rascunho visual com aprovação clínica. A curadoria posterior deve promover cada
par `ponto + mapa` para `approved_local_visual` apenas quando fonte textual,
OCR/MD e anatomia visível concordarem.

## Aprovados localmente

- `EX-HN3 @ body_front`: seção nomeada do Atlas; ponto na fronte/linha mediana.
- `GV20 @ body_front` e `GV20 @ body_back`: vertex/cabeça, linha mediana.
- `GB20 @ body_back`: região posterior do pescoço, inferior ao occipital.
- `GB34 @ body_front`: aspecto fibular/lateral da perna, próximo à cabeça da fíbula.
- `CV12 @ body_front`: abdome superior, linha mediana anterior.
- `ST36 @ body_front`: perna anterior, 3 cun inferior a ST35.
- `SP6 @ body_front`: perna tibial/medial, 3 cun acima do maléolo medial.
- `SP9 @ body_front`: depressão inferior ao côndilo medial da tíbia.
- `ST40 @ body_front`: perna anterolateral, superior ao maléolo lateral.
- `LI11 @ body_front`: cotovelo lateral.
- `CV6 @ body_front`: abdome inferior, linha mediana anterior.
- `LR3 @ feet_dorsal`: dorso do pé entre 1o e 2o metatarsos.
- `SP3 @ feet_dorsal`: face medial do pé, proximal à articulação metatarsofalângica.
- `PC6 @ hands_palmar`: antebraço anterior, 2 cun proximal à prega palmar.
- `HT7 @ hands_palmar`: punho anteromedial, prega palmar.
- Pontos auriculares em `ear_protocol` e `ear_lateral`: a lateral herda a
  aprovação visual local dos mesmos pontos já aprovados no protocolo auricular.

## Mantidos em rascunho

- Duplicatas grosseiras no corpo inteiro quando havia mapa fino mais coerente:
  `LR3 @ body_front`, `SP3 @ body_front`, `PC6 @ body_front`, `HT7 @ body_front`.
- Pontos de mão com asset incompatível com a face descrita pela fonte:
  `LI4 @ hands_palmar` e `TE5 @ hands_palmar` pedem mapa dorsal da mão/antebraço.
- Pontos de perna colocados no mapa de pés, sem região suficiente para confirmar:
  `ST36 @ feet_dorsal`, `ST40 @ feet_dorsal`, `SP6 @ feet_dorsal`.
- Pontos com vista posterior ou confiança insuficiente para esse mapa:
  `GB20 @ body_front`, `GB34 @ body_back`, `KI3 @ body_front`,
  `KI3 @ body_back`, `KI3 @ feet_dorsal`, `SP6 @ body_back`,
  `LI4 @ body_front`, `TE5 @ body_front`, `LI11 @ hands_palmar`.

## Próximos lotes sugeridos

1. Adicionar ou gerar asset de mão/antebraço dorsal para `LI4`, `TE5` e pontos
   do Triplo Aquecedor/Intestino Grosso que correm na face dorsal.
2. Revisar `KI3` com foco em maléolo medial e página do Atlas antes de aprovação.
3. Criar camada visual de confirmação no MapCoordinateEditor para filtrar
   `draft`, `approved_local_visual` e `review_map_mismatch`.
