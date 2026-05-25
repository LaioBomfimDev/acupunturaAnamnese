// ============================================================
// DADOS: Protocolos terapêuticos e detalhes das síndromes MTC
// ============================================================

export const protocols = {
  "Ascensão do Yang do Fígado": {
    body: ["F3", "VB20", "VB34", "TA5", "IG4", "R3"],
    ear: ["Shen Men", "Fígado", "Subcórtex", "Ansiedade", "Rim"],
    moxa: ["Evitar se houver calor exuberante", "Considerar apenas em deficiência associada"],
    laser: ["F3", "VB20", "R3"],
    eletro: ["VB20 + F3 em baixa intensidade, conforme tolerância"],
    goal: "Ancorar Yang, mover Qi do Fígado, reduzir cefaleia/tontura e estabilizar irritabilidade."
  },
  "Qi do Fígado invadindo Baço/Estômago": {
    body: ["F3", "PC6", "VC12", "E36", "BP6", "IG4"],
    ear: ["Shen Men", "Fígado", "Estômago", "Baço", "Subcórtex"],
    moxa: ["VC12", "E36 se houver frio/deficiência"],
    laser: ["F3", "PC6", "VC12"],
    eletro: ["PC6 + E36 para regulação autonômica e digestiva"],
    goal: "Regular Madeira sobre Terra, harmonizar digestão e reduzir repercussão emocional no trato gastrointestinal."
  },
  "Umidade-Calor": {
    body: ["BP9", "E40", "IG11", "BP6", "VC12"],
    ear: ["Baço", "Estômago", "Endócrino", "Shen Men", "Fome"],
    moxa: ["Contraindicada enquanto houver calor/umidade-calor evidente"],
    laser: ["BP9", "E40", "IG11"],
    eletro: ["E40 + BP9 em baixa/moderada intensidade quando houver retenção importante"],
    goal: "Drenar umidade, limpar calor e regular metabolismo/digestão."
  },
  "Deficiência de Qi do Baço": {
    body: ["E36", "BP6", "BP3", "VC12", "VC6"],
    ear: ["Baço", "Estômago", "Shen Men", "Endócrino"],
    moxa: ["E36", "VC6", "VC12"],
    laser: ["E36", "BP6", "VC12"],
    eletro: ["E36 + BP6 em baixa frequência quando houver fadiga importante"],
    goal: "Tonificar Qi do Baço, melhorar transformação/transporte, energia e umidade."
  },
  "Agitação do Shen por Calor": {
    body: ["C7", "PC6", "Yintang", "VG20", "BP6"],
    ear: ["Shen Men", "Coração", "Subcórtex", "Sono", "Ansiedade"],
    moxa: ["Evitar se houver calor, agitação intensa ou insônia por calor"],
    laser: ["C7", "PC6", "Yintang"],
    eletro: ["Evitar estímulo excessivo; priorizar baixa intensidade e sedação suave"],
    goal: "Acalmar Shen, regular sono e reduzir hiperexcitação."
  }
};

export const syndromeDetails = {
  "Ascensão do Yang do Fígado": {
    root: "Estagnação do Qi do Fígado, deficiência de Yin/Sangue ou falha da Água em nutrir a Madeira.",
    manifestation: "Cefaleia, tontura, zumbido, irritabilidade, tensão, rubor ou sensação de subida.",
    eight: "Interno, tendência a Calor/Excesso na manifestação, com possível Deficiência na raiz.",
    elements: "Madeira em hiperatividade podendo repercutir no Fogo e invadir a Terra quando há sintomas digestivos associados.",
    question: "Investigar tontura, zumbido, rubor, qualidade da cefaleia, sono e sinais de deficiência de Yin."
  },
  "Qi do Fígado invadindo Baço/Estômago": {
    root: "Estagnação emocional do Qi do Fígado afetando a função de transformação e descida da Terra.",
    manifestation: "Refluxo, azia, náusea, distensão abdominal, alteração intestinal, compulsão ou piora digestiva por estresse.",
    eight: "Interno, geralmente Excesso por estagnação, podendo coexistir com Deficiência de Baço.",
    elements: "Madeira em excesso exercendo controle patológico sobre a Terra.",
    question: "Investigar relação direta entre estresse, alimentação, distensão, refluxo e hábito intestinal."
  },
  "Umidade-Calor": {
    root: "Dificuldade de transformação dos líquidos, dieta inadequada, calor interno ou retenção prolongada de umidade.",
    manifestation: "Saburra amarela/espessa/gordurosa, sensação de peso, edema, secreções, odor forte, acne ou fezes pastosas.",
    eight: "Interno, Calor, Excesso, com componente Yin patogênico por Umidade.",
    elements: "Terra sobrecarregada produzindo Umidade, com Calor associado que pode afetar Fígado, Estômago e Intestinos.",
    question: "Investigar alimentação gordurosa/condimentada, álcool, muco, odor, calor corporal e padrão das fezes."
  },
  "Deficiência de Qi do Baço": {
    root: "Fraqueza da transformação e transporte, dieta irregular, preocupação excessiva, excesso de trabalho mental ou cronicidade.",
    manifestation: "Fadiga, digestão lenta, distensão, fezes amolecidas, edema, língua pálida/inchada e marcas dentárias.",
    eight: "Interno, Deficiência, tendência a Frio/Umidade quando há Yang baixo.",
    elements: "Terra enfraquecida, podendo falhar em nutrir Metal e permitir acúmulo de Umidade/Fleuma.",
    question: "Investigar apetite, energia após alimentação, fezes, edema, compulsão por doce e ruminação mental."
  },
  "Agitação do Shen por Calor": {
    root: "Calor interno perturbando o Coração/Shen, podendo surgir de estagnação do Fígado, deficiência de Yin ou excesso de estimulantes.",
    manifestation: "Ansiedade, insônia, palpitação, muitos sonhos, agitação mental, ponta da língua vermelha e pulso rápido.",
    eight: "Interno, Calor, Excesso na manifestação; avaliar se há Deficiência de Yin na raiz.",
    elements: "Fogo hiperativo, podendo decorrer de Madeira aquecendo Fogo ou Água insuficiente para controlar Fogo.",
    question: "Investigar horário da insônia, sonhos, palpitações, sudorese, estimulantes e sinais de calor vazio."
  }
};
