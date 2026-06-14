export const tongueOrganAlterations = {
  "Pulmão": {
    subtitle: "Área anterior: defesa, respiração, pele, secura e difusão/descida do Qi.",
    items: [
      "Região anterior pálida", "Região anterior vermelha", "Saburra branca na área anterior",
      "Saburra amarela na área anterior", "Ressecamento anterior", "Umidade excessiva anterior",
      "Manchas ou pontos na borda anterior", "Fissura fina na região anterior"
    ]
  },
  "Coração": {
    subtitle: "Ponta: Shen, sono, ansiedade, palpitação e calor no Coração.",
    items: [
      "Ponta muito vermelha", "Ponta pálida", "Pontos vermelhos na ponta",
      "Fissura central alcançando a ponta", "Ponta trêmula", "Ponta sem saburra",
      "Ponta arroxeada", "Ponta ressecada"
    ]
  },
  "Estômago e Baço": {
    subtitle: "Centro: digestão, umidade, fleuma, energia e transformação/transporte.",
    items: [
      "Centro pálido", "Centro vermelho/amarelado", "Centro inchado",
      "Marcas dentárias nas bordas", "Saburra espessa no centro", "Saburra gordurosa",
      "Saburra branca no centro", "Fissuras centrais", "Centro úmido", "Centro ressecado"
    ]
  },
  "Fígado e Vesícula Biliar": {
    subtitle: "Laterais: livre fluxo do Qi, raiva/frustração, tensão, tendões e TPM.",
    items: [
      "Laterais vermelhas", "Laterais arroxeadas", "Laterais pálidas", "Laterais inchadas",
      "Pontos vermelhos nas laterais", "Bordas com marcas dentárias", "Saburra amarela nas laterais",
      "Tremor ou desvio lateral"
    ]
  },
  "Rins e Bexiga": {
    subtitle: "Raiz: Jing, lombar, líquidos, frio/calor vazio e base constitucional.",
    items: [
      "Raiz sem saburra", "Raiz com saburra espessa", "Raiz amarelada", "Raiz muito úmida",
      "Raiz seca", "Raiz pálida", "Região posterior escura/arroxeada", "Fissuras na raiz"
    ]
  },
  "Intestino Grosso e Delgado": {
    subtitle: "Região posterior: eliminação, calor/umidade intestinal e função de separação.",
    items: [
      "Saburra espessa posterior", "Saburra amarela posterior", "Saburra gordurosa posterior",
      "Fissuras na região posterior", "Região posterior inchada", "Aspecto seco posterior",
      "Marcas ou pontos posteriores", "Muco/umidade sugerida pela saburra"
    ]
  },
  "Sublingual / Estase": {
    subtitle: "Face inferior: estagnação de Qi/Xue e circulação.",
    items: [
      "Veias sublinguais dilatadas", "Veias sublinguais arroxeadas", "Veias tortuosas",
      "Petéquias sublinguais", "Coloração azulada", "Estagnação visível em vasos",
      "Vasos muito escuros", "Vasos finos e pouco visíveis"
    ]
  }
};

// ============================================================
// Mapeamento de tags estáveis da IA → itens do checklist acima.
// A IA (mock ou serviço real) NUNCA referencia o texto literal dos
// itens: ela retorna tags. Se um rótulo for editado acima, basta
// atualizar o `item` correspondente aqui — o contrato com o serviço
// de IA não quebra. Tag sem entrada aqui é exibida como não mapeada
// na UI e não marca nada.
// ============================================================
export const tongueAiTagMap = {
  // Estômago e Baço (centro)
  swollen_center:        { organ: "Estômago e Baço", item: "Centro inchado" },
  teeth_marks:           { organ: "Estômago e Baço", item: "Marcas dentárias nas bordas" },
  thick_center_coating:  { organ: "Estômago e Baço", item: "Saburra espessa no centro" },
  greasy_coating:        { organ: "Estômago e Baço", item: "Saburra gordurosa" },
  pale_center:           { organ: "Estômago e Baço", item: "Centro pálido" },
  central_cracks:        { organ: "Estômago e Baço", item: "Fissuras centrais" },

  // Coração (ponta)
  red_tip:               { organ: "Coração", item: "Ponta muito vermelha" },
  red_dots_tip:          { organ: "Coração", item: "Pontos vermelhos na ponta" },
  pale_tip:              { organ: "Coração", item: "Ponta pálida" },
  central_crack_to_tip:  { organ: "Coração", item: "Fissura central alcançando a ponta" },

  // Fígado e Vesícula Biliar (laterais)
  red_sides:             { organ: "Fígado e Vesícula Biliar", item: "Laterais vermelhas" },
  purple_sides:          { organ: "Fígado e Vesícula Biliar", item: "Laterais arroxeadas" },
  swollen_sides:         { organ: "Fígado e Vesícula Biliar", item: "Laterais inchadas" },
  red_dots_sides:        { organ: "Fígado e Vesícula Biliar", item: "Pontos vermelhos nas laterais" },

  // Pulmão (região anterior)
  pale_anterior:         { organ: "Pulmão", item: "Região anterior pálida" },
  white_anterior_coating:{ organ: "Pulmão", item: "Saburra branca na área anterior" },
  dry_anterior:          { organ: "Pulmão", item: "Ressecamento anterior" },

  // Rins e Bexiga (raiz)
  no_root_coating:       { organ: "Rins e Bexiga", item: "Raiz sem saburra" },
  thick_root_coating:    { organ: "Rins e Bexiga", item: "Raiz com saburra espessa" },
  wet_root:              { organ: "Rins e Bexiga", item: "Raiz muito úmida" },

  // Intestinos (região posterior)
  yellow_posterior_coating: { organ: "Intestino Grosso e Delgado", item: "Saburra amarela posterior" },
  greasy_posterior_coating: { organ: "Intestino Grosso e Delgado", item: "Saburra gordurosa posterior" },

  // Sublingual / Estase
  distended_sublingual_veins: { organ: "Sublingual / Estase", item: "Veias sublinguais dilatadas" },
  purple_sublingual_veins:    { organ: "Sublingual / Estase", item: "Veias sublinguais arroxeadas" },
  tortuous_sublingual_veins:  { organ: "Sublingual / Estase", item: "Veias tortuosas" },
  sublingual_petechiae:       { organ: "Sublingual / Estase", item: "Petéquias sublinguais" },
};

// Resolve uma tag da IA para { group, item } do checklist, ou null se não mapeada.
export function resolveTongueAiTag(tag) {
  const entry = tongueAiTagMap[tag];
  if (!entry) return null;
  return { group: `linguaOrgao:${entry.organ}`, organ: entry.organ, item: entry.item };
}
