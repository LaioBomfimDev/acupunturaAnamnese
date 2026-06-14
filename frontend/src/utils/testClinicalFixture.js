import { isPulseAssociatedSign } from '../data/pulseData';

const clinicalCases = [
  {
    expectedPattern: 'Ascensão do Yang do Fígado',
    sexo: 'Feminino',
    profissao: 'Administrativa',
    queixa: 'Cefaleia temporal, tontura e tensão cervical com irritabilidade e sensação de subida.',
    historia: 'Início há 2 anos após mudança de emprego. Piora com estresse, sono irregular e tensão emocional.',
    medicacoes: 'Usa anti-inflamatório ocasionalmente. Exames de imagem prévios sem achados graves relatados.',
    agua: 'Baixa ingestão hídrica, cerca de 1 litro ao dia.',
    dorLocal: 'Cervical e temporal',
    escalaDor: '7',
    obsSonoEmocoes: 'Sono leve, desperta entre 1h e 3h, acorda cansada e refere tensão emocional.',
    obsDigestao: 'Digestão irregular em períodos de estresse.',
    obsDor: 'Piora com tensão emocional. Melhora parcial com repouso e ambiente silencioso.',
    groups: {
      sintomas: ['Cefaleia', 'Tontura', 'Irritabilidade'],
      queixaEstruturada: ['Quadro crônico', 'Piora ao estresse', 'Piora à noite'],
      sono: ['Despertares frequentes', 'Acorda entre 1h-3h', 'Sono não reparador'],
      emocoes: ['Raiva/irritabilidade', 'Frustração', 'Ansiedade/agitação mental'],
      digestao: ['Gases'],
      fezes: ['Constipação'],
      dor: ['Rigidez', 'Dor migratória', 'Piora ao movimento'],
      clima: ['Piora com calor'],
      historico: ['Dor crônica'],
      substanciasUso: ['Cafeína', 'Anti-inflamatórios'],
      objetivos: ['Reduzir dor', 'Regular sono', 'Reduzir ansiedade'],
      seguranca: [],
      lingua: ['Vermelha', 'Saburra amarela'],
      regioesLingua: ['Laterais/Fígado-VB'],
    },
    tongue: {
      'Fígado e Vesícula Biliar': ['Laterais vermelhas', 'Pontos vermelhos nas laterais'],
    },
    pulse: [
      ['esquerdo', 'p8', ['Pulso em corda', 'Pulso tenso', 'Irritabilidade/raiva', 'Cefaleia temporal']],
    ],
  },
  {
    expectedPattern: 'Qi do Fígado invadindo Baço/Estômago',
    sexo: 'Masculino',
    profissao: 'Comercial',
    queixa: 'Refluxo, azia, náusea e distensão abdominal com piora após alimentação e em semanas de cobrança.',
    historia: 'Quadro recorrente há 8 meses, com constipação alternada e piora ao estresse.',
    medicacoes: 'Refere uso eventual de antiácido. Nega cirurgias recentes.',
    agua: 'Ingestão moderada, cerca de 1,5 litro ao dia.',
    dorLocal: 'Epigástrio',
    escalaDor: '5',
    obsSonoEmocoes: 'Sono interrompido por ruminação e preocupação.',
    obsDigestao: 'Refluxo, gases, distensão e sensação de peso após refeições maiores.',
    obsDor: 'Piora após alimentação pesada, café e estresse. Melhora com refeições leves.',
    groups: {
      sintomas: ['Refluxo', 'Azia', 'Náusea', 'Distensão abdominal', 'Constipação'],
      queixaEstruturada: ['Quadro recorrente', 'Piora após alimentação', 'Piora ao estresse'],
      sono: ['Dificuldade para iniciar sono'],
      emocoes: ['Frustração', 'Preocupação/ruminação'],
      digestao: ['Refluxo/azia', 'Gases', 'Náusea', 'Distensão abdominal', 'Peso após comer'],
      fezes: ['Constipação', 'Alternância intestinal'],
      dor: ['Queimação', 'Pressão'],
      clima: [],
      historico: ['Alergias'],
      substanciasUso: ['Cafeína'],
      objetivos: ['Melhorar digestão', 'Regular sono', 'Reduzir ansiedade'],
      seguranca: [],
      lingua: ['Saburra espessa'],
      regioesLingua: ['Centro/Baço-Estômago'],
    },
    tongue: {
      'Estômago e Baço': ['Saburra espessa no centro'],
    },
    pulse: [
      ['direito', 'p8', ['Pulso cheio', 'Distensão abdominal']],
    ],
  },
  {
    expectedPattern: 'Umidade-Calor',
    sexo: 'Feminino',
    profissao: 'Cozinheira',
    queixa: 'Sensação de umidade e calor no corpo, peso corporal, secreção espessa e odor forte nas eliminações.',
    historia: 'Piora após álcool, frituras e noites mal dormidas. Fezes tendem a tipo 6 ou tipo 7.',
    medicacoes: 'Sem medicamentos contínuos relatados.',
    agua: 'Baixa ingestão de água durante o expediente.',
    dorLocal: 'Sem dor principal',
    escalaDor: '1',
    obsSonoEmocoes: 'Sono pesado, acorda cansada.',
    obsDigestao: 'Sensação de peso e desconforto após refeições gordurosas.',
    obsDor: 'Sem limitação funcional relevante.',
    groups: {
      sintomas: ['Edema'],
      queixaEstruturada: ['Quadro recorrente', 'Piora após alimentação'],
      sono: ['Sono não reparador', 'Sonolência diurna'],
      emocoes: ['Apatia/desânimo'],
      digestao: ['Peso após comer'],
      fezes: ['Tipo 6', 'Tipo 7', 'Odor forte', 'Muco'],
      dor: ['Peso'],
      clima: ['Piora com umidade', 'Piora com calor'],
      historico: [],
      substanciasUso: ['Álcool'],
      objetivos: ['Reduzir edema', 'Melhorar digestão'],
      seguranca: [],
      lingua: ['Saburra amarela', 'Saburra espessa', 'Saburra gordurosa'],
      regioesLingua: [],
    },
    tongue: {},
    pulse: [
      ['direito', 'p8', ['Pulso escorregadio', 'Umidade/fleuma']],
    ],
  },
  {
    expectedPattern: 'Deficiência de Qi do Baço',
    sexo: 'Feminino',
    profissao: 'Professora',
    queixa: 'Fadiga persistente, baixa energia, digestão lenta e desejo por doce no fim do dia.',
    historia: 'Sintomas aumentaram nos últimos 6 meses, com rotina intensa, pouco descanso e alimentação irregular.',
    medicacoes: 'Sem medicamentos contínuos relatados. Refere suplementação ocasional.',
    agua: 'Baixa ingestão de água durante o expediente.',
    dorLocal: 'Sem dor principal',
    escalaDor: '2',
    obsSonoEmocoes: 'Sono não reparador e sonolência diurna, com ruminação mental.',
    obsDigestao: 'Pouca fome pela manhã e desejo por doces no período da tarde.',
    obsDor: 'Sensação de peso melhora com movimento leve.',
    groups: {
      sintomas: ['Fadiga'],
      queixaEstruturada: ['Início gradual', 'Quadro crônico', 'Melhora com movimento'],
      sono: ['Sono não reparador', 'Sonolência diurna'],
      emocoes: ['Preocupação/ruminação', 'Apatia/desânimo'],
      digestao: ['Pouca fome', 'Desejo por doce', 'Peso após comer'],
      fezes: ['Tipo 4', 'Evacuação incompleta'],
      dor: ['Peso'],
      clima: [],
      historico: ['Hipotireoidismo'],
      substanciasUso: ['Suplementos'],
      objetivos: ['Melhorar energia', 'Melhorar digestão'],
      seguranca: [],
      lingua: ['Pálida', 'Inchada', 'Marcas de dentes', 'Saburra branca'],
      regioesLingua: [],
    },
    tongue: {},
    pulse: [
      ['direito', 'p8', ['Pulso fraco ou vazio', 'Fadiga pós-prandial', 'Desejo por doce']],
    ],
  },
  {
    expectedPattern: 'Agitação do Shen por Calor',
    sexo: 'Masculino',
    profissao: 'Designer',
    queixa: 'Ansiedade, insônia, palpitação e agitação mental com dificuldade para desligar à noite.',
    historia: 'Período de alta demanda, muitos sonhos intensos e uso frequente de cafeína e energéticos.',
    medicacoes: 'Nega medicação contínua; usa termogênicos em alguns dias de treino.',
    agua: 'Ingestão hídrica irregular.',
    dorLocal: 'Tensão em ombros',
    escalaDor: '3',
    obsSonoEmocoes: 'Dificuldade para iniciar sono, despertares e sonhos intensos.',
    obsDigestao: 'Sem queixa digestiva principal.',
    obsDor: 'Tensão muscular no fim do dia.',
    groups: {
      sintomas: ['Ansiedade', 'Insônia', 'Palpitação'],
      queixaEstruturada: ['Crises', 'Piora à noite'],
      sono: ['Dificuldade para iniciar sono', 'Despertares frequentes', 'Sonhos intensos'],
      emocoes: ['Ansiedade/agitação mental', 'Oscilações emocionais'],
      digestao: [],
      fezes: ['Tipo 4'],
      dor: ['Rigidez'],
      clima: [],
      historico: [],
      substanciasUso: ['Cafeína', 'Energéticos', 'Termogênicos'],
      objetivos: ['Regular sono', 'Reduzir ansiedade'],
      seguranca: [],
      lingua: [],
      regioesLingua: ['Ponta/Coração'],
    },
    tongue: {
      'Coração': ['Ponta trêmula', 'Fissura central alcançando a ponta'],
    },
    pulse: [
      ['esquerdo', 'p9', ['Pulso rápido', 'Ansiedade', 'Insônia', 'Palpitação', 'Agitação mental', 'Sonhos intensos']],
    ],
  },
  {
    expectedPattern: 'Deficiência de Yin do Rim',
    sexo: 'Feminino',
    profissao: 'Psicóloga',
    queixa: 'Boca seca à noite, suores noturnos e sintomas de menopausa, com relato de yin deficiente.',
    historia: 'Acorda de madrugada com secura e inquietação leve, sem secreções ou sinais infecciosos.',
    medicacoes: 'Uso hormonal em avaliação médica; sem automedicação relatada.',
    agua: 'Sente sede à noite e mantém água ao lado da cama.',
    dorLocal: 'Lombar leve',
    escalaDor: '3',
    obsSonoEmocoes: 'Sono fragmentado por sudorese noturna.',
    obsDigestao: 'Apetite preservado.',
    obsDor: 'Desconforto lombar leve após jornadas longas.',
    groups: {
      sintomas: [],
      queixaEstruturada: ['Quadro crônico', 'Piora à noite'],
      sono: ['Despertares frequentes', 'Sudorese noturna'],
      emocoes: ['Medo/insegurança'],
      digestao: [],
      fezes: ['Tipo 3'],
      dor: ['Queimação'],
      clima: ['Piora com secura'],
      historico: ['Menopausa', 'Uso hormonal'],
      substanciasUso: [],
      objetivos: ['Regular sono'],
      seguranca: [],
      lingua: ['Sem saburra', 'Ressecada'],
      regioesLingua: ['Raiz/Rim-Intestinos'],
    },
    tongue: {
      'Rins e Bexiga': ['Raiz sem saburra', 'Raiz seca'],
    },
    pulse: [
      ['esquerdo', 'p7', ['Pulso fino']],
    ],
  },
  {
    expectedPattern: 'Deficiência de Yang do Rim',
    sexo: 'Masculino',
    profissao: 'Motorista',
    queixa: 'Lombar fria, membros frios, poliúria noturna, aversão ao frio e relato de yang deficiente.',
    historia: 'Sintomas pioram no inverno e após exposição prolongada ao frio. Precisa se proteger de ambientes frios.',
    medicacoes: 'Sem medicamentos contínuos relatados.',
    agua: 'Ingestão de água moderada, com várias micções à noite.',
    dorLocal: 'Lombar baixa',
    escalaDor: '5',
    obsSonoEmocoes: 'Sono interrompido por necessidade urinária.',
    obsDigestao: 'Sem queixa digestiva principal.',
    obsDor: 'Lombar melhora com calor local.',
    groups: {
      sintomas: ['Dor lombar'],
      queixaEstruturada: ['Quadro crônico'],
      sono: ['Despertares frequentes'],
      emocoes: ['Medo/insegurança'],
      digestao: [],
      fezes: ['Tipo 3'],
      dor: ['Peso'],
      clima: ['Piora com frio'],
      historico: ['Dor crônica'],
      substanciasUso: [],
      objetivos: ['Reduzir dor', 'Melhorar energia'],
      seguranca: [],
      lingua: ['Úmida'],
      regioesLingua: ['Raiz/Rim-Intestinos'],
    },
    tongue: {
      'Rins e Bexiga': ['Raiz muito úmida'],
    },
    pulse: [
      ['esquerdo', 'p7', ['Pulso profundo', 'Pulso lento', 'Alteração urinária', 'Frio interno']],
    ],
  },
  {
    expectedPattern: 'Deficiência de Xue do Fígado',
    sexo: 'Feminino',
    profissao: 'Costureira',
    queixa: 'Visão borrada, olhos secos, câimbras recorrentes e unhas quebradiças.',
    historia: 'Refere menstruação escassa nos últimos ciclos e sensação de esgotamento após jornadas longas.',
    medicacoes: 'Sem medicamentos contínuos relatados.',
    agua: 'Ingestão de água regular.',
    dorLocal: 'Panturrilhas',
    escalaDor: '4',
    obsSonoEmocoes: 'Sono leve, sem agitação importante.',
    obsDigestao: 'Apetite irregular em dias de trabalho intenso.',
    obsDor: 'Câimbras aparecem à noite e após longos períodos em pé.',
    groups: {
      sintomas: [],
      queixaEstruturada: ['Início gradual', 'Quadro recorrente'],
      sono: ['Sono não reparador'],
      emocoes: ['Apatia/desânimo'],
      digestao: ['Pouca fome'],
      fezes: ['Tipo 3'],
      dor: ['Rigidez'],
      clima: [],
      historico: [],
      substanciasUso: [],
      objetivos: ['Melhorar energia'],
      seguranca: [],
      lingua: ['Fina'],
      regioesLingua: [],
      gineco: ['Fluxo escasso'],
    },
    tongue: {},
    pulse: [
      ['esquerdo', 'p9', ['Pulso fino']],
    ],
  },
  {
    expectedPattern: 'Estagnação de Xue',
    sexo: 'Feminino',
    profissao: 'Atendente',
    queixa: 'Dor fixa em baixo ventre, com piora à noite e sensação de estase local.',
    historia: 'Relata coágulos no ciclo, lábios roxos e episódio recente de amenorreia dolorosa.',
    medicacoes: 'Usa analgésico eventual durante crises.',
    agua: 'Ingestão de água irregular.',
    dorLocal: 'Baixo ventre',
    escalaDor: '8',
    obsSonoEmocoes: 'Sono interrompido pela dor nas crises.',
    obsDigestao: 'Sem queixa digestiva principal.',
    obsDor: 'Dor fixa, profunda, com piora noturna.',
    groups: {
      sintomas: ['Cólicas'],
      queixaEstruturada: ['Quadro recorrente', 'Piora à noite'],
      sono: ['Despertares frequentes'],
      emocoes: [],
      digestao: [],
      fezes: ['Tipo 3'],
      dor: ['Dor fixa', 'Piora à pressão'],
      clima: [],
      historico: [],
      substanciasUso: ['Anti-inflamatórios'],
      objetivos: ['Reduzir dor', 'Regular ciclo'],
      seguranca: [],
      lingua: ['Arroxeada', 'Petéquias'],
      regioesLingua: ['Sublingual/Estagnação'],
      gineco: ['Cólicas', 'Coágulos', 'Fluxo intenso'],
    },
    tongue: {
      'Sublingual / Estase': ['Veias sublinguais arroxeadas', 'Petéquias sublinguais'],
    },
    pulse: [
      ['direito', 'p9', ['Pulso seco/áspero']],
    ],
  },
  {
    expectedPattern: 'Deficiência de Qi do Pulmão',
    sexo: 'Masculino',
    profissao: 'Professor de canto',
    queixa: 'Tosse fraca, voz baixa, resfriados frequentes, dispneia leve e sudorese espontânea.',
    historia: 'Refere pele sem brilho, baixa defesa e piora após falar por muitas horas.',
    medicacoes: 'Usa antialérgico eventual em crises respiratórias.',
    agua: 'Ingestão hídrica moderada.',
    dorLocal: 'Tórax alto e garganta',
    escalaDor: '2',
    obsSonoEmocoes: 'Sono preservado, acorda cansado após crises respiratórias.',
    obsDigestao: 'Sem queixa digestiva principal.',
    obsDor: 'Desconforto torácico leve ao esforço vocal.',
    groups: {
      sintomas: ['Rinite/Sinusite'],
      queixaEstruturada: ['Quadro recorrente', 'Piora progressiva'],
      sono: ['Sono não reparador'],
      emocoes: ['Tristeza'],
      digestao: [],
      fezes: ['Tipo 4'],
      dor: ['Pressão'],
      clima: ['Piora com vento'],
      historico: ['Alergias'],
      substanciasUso: ['Medicamentos contínuos'],
      objetivos: ['Melhorar energia'],
      seguranca: [],
      lingua: ['Saburra branca'],
      regioesLingua: [],
    },
    tongue: {
      'Pulmão': ['Saburra branca na área anterior', 'Fissura fina na região anterior'],
    },
    pulse: [
      ['direito', 'p9', ['Pulso superficial', 'Pulso seco/áspero', 'Tosse ou falta de ar', 'Pele ressecada', 'Baixa defesa']],
    ],
  },
];

export const TEST_CLINICAL_PATTERNS = clinicalCases.map(clinicalCase => clinicalCase.expectedPattern);

let fixtureQueue = [];
let lastPattern = null;

function shuffledIndexes(length) {
  const indexes = Array.from({ length }, (_, index) => index);
  for (let i = indexes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
  }
  return indexes;
}

function nextClinicalCase() {
  if (!fixtureQueue.length) {
    fixtureQueue = shuffledIndexes(clinicalCases.length);

    if (fixtureQueue.length > 1 && clinicalCases[fixtureQueue[0]].expectedPattern === lastPattern) {
      fixtureQueue.push(fixtureQueue.shift());
    }
  }

  const index = fixtureQueue.shift();
  const clinicalCase = clinicalCases[index];
  lastPattern = clinicalCase.expectedPattern;
  return clinicalCase;
}

function setGroup(map, group, items = []) {
  items.forEach(item => {
    map[`${group}:${item}`] = true;
  });
}

function buildClinicalFixture(clinicalCase) {
  const selectedMap = {};

  Object.entries(clinicalCase.groups).forEach(([group, items]) => {
    setGroup(selectedMap, group, items);
  });

  Object.entries(clinicalCase.tongue).forEach(([organ, items]) => {
    setGroup(selectedMap, `linguaOrgao:${organ}`, items);
  });

  clinicalCase.pulse.forEach(([side, position, items]) => {
    setGroup(selectedMap, `pulso:${side}:${position}`, items.filter(item => !isPulseAssociatedSign(item)));
    setGroup(selectedMap, `pulsoSinal:${side}:${position}`, items.filter(isPulseAssociatedSign));
  });

  return {
    expectedPattern: clinicalCase.expectedPattern,
    statePatch: {
      sexo: clinicalCase.sexo,
      profissao: clinicalCase.profissao,
      data: new Date().toLocaleDateString('pt-BR'),
      queixa: clinicalCase.queixa,
      historia: clinicalCase.historia,
      medicacoes: clinicalCase.medicacoes,
      agua: clinicalCase.agua,
      dorLocal: clinicalCase.dorLocal,
      escalaDor: clinicalCase.escalaDor,
      obsSonoEmocoes: clinicalCase.obsSonoEmocoes,
      obsDigestao: clinicalCase.obsDigestao,
      obsDor: clinicalCase.obsDor,
    },
    selectedMap,
  };
}

export function getTestClinicalFixturePatterns() {
  return [...TEST_CLINICAL_PATTERNS];
}

export function resetRandomClinicalFixtureCycle() {
  fixtureQueue = [];
  lastPattern = null;
}

export function buildClinicalFixtureForPattern(patternName) {
  const clinicalCase = clinicalCases.find(item => item.expectedPattern === patternName);
  if (!clinicalCase) {
    throw new Error(`Caso clínico de teste não encontrado para: ${patternName}`);
  }
  return buildClinicalFixture(clinicalCase);
}

export function buildRandomClinicalFixture() {
  return buildClinicalFixture(nextClinicalCase());
}
