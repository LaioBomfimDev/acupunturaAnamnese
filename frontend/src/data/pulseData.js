// Posições do pulso radial: cada posição separa a qualidade palpada no dedo
// (evidência objetiva de palpação) dos sinais clínicos associados ao órgão
// (sintomas que contextualizam a posição e reforçam a anamnese com peso de sintoma).
export const pulsePositions = {
  direito: [
    {
      id: 'p7',
      title: 'Direito P7 / Triplo Aquecedor e Sexualidade',
      qualities: [
        "Pulso superficial", "Pulso profundo", "Pulso rápido", "Pulso lento",
        "Pulso fraco", "Pulso cheio", "Pulso tenso", "Pulso escorregadio"
      ],
      associatedSigns: [
        "Queixas hormonais/sexuais", "Alteração de líquidos/temperatura"
      ]
    },
    {
      id: 'p8',
      title: 'Direito P8 / Estômago e Baço-Pâncreas',
      qualities: [
        "Pulso fraco ou vazio", "Pulso escorregadio", "Pulso lento", "Pulso cheio"
      ],
      associatedSigns: [
        "Digestão lenta", "Distensão abdominal", "Fadiga pós-prandial",
        "Umidade/fleuma", "Desejo por doce", "Fezes amolecidas"
      ]
    },
    {
      id: 'p9',
      title: 'Direito P9 / Intestino Grosso e Pulmão',
      qualities: [
        "Pulso superficial", "Pulso fraco", "Pulso seco/áspero", "Pulso rápido"
      ],
      associatedSigns: [
        "Rinite/sinusite", "Tosse ou falta de ar", "Pele ressecada",
        "Constipação", "Tristeza/luto", "Baixa defesa"
      ]
    }
  ],
  esquerdo: [
    {
      id: 'p7',
      title: 'Esquerdo P7 / Bexiga e Rim',
      qualities: [
        "Pulso profundo", "Pulso fraco", "Pulso lento", "Pulso fino"
      ],
      associatedSigns: [
        "Dor lombar", "Edema", "Medo/insegurança", "Zumbido",
        "Alteração urinária", "Frio interno"
      ]
    },
    {
      id: 'p8',
      title: 'Esquerdo P8 / Vesícula Biliar e Fígado',
      qualities: [
        "Pulso em corda", "Pulso tenso", "Pulso rápido", "Pulso cheio"
      ],
      associatedSigns: [
        "Irritabilidade/raiva", "Cefaleia temporal", "Tensão muscular",
        "TPM", "Boca amarga", "Tomada de decisão difícil"
      ]
    },
    {
      id: 'p9',
      title: 'Esquerdo P9 / Intestino Delgado e Coração',
      qualities: [
        "Pulso rápido", "Pulso fino", "Pulso irregular", "Pulso superficial"
      ],
      associatedSigns: [
        "Ansiedade", "Insônia", "Palpitação", "Agitação mental",
        "Sonhos intensos", "Ponta da língua vermelha"
      ]
    }
  ]
};

// Sessões salvas antes da separação guardam sinais associados sob o prefixo
// "pulso:"; este conjunto permite classificá-los como sintoma ao reler dados antigos.
export const pulseAssociatedSignLabels = new Set(
  Object.values(pulsePositions)
    .flat()
    .flatMap(position => position.associatedSigns)
);

export function isPulseAssociatedSign(label) {
  return pulseAssociatedSignLabels.has(label);
}
