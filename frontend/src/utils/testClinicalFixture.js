import { checklists } from '../data/checklists';
import { pulsePositions } from '../data/pulseData';
import { tongueOrganAlterations } from '../data/tongueData';

const clinicalCases = [
  {
    sexo: 'Feminino',
    profissao: 'Administrativa',
    queixa: 'Dor crônica na região lombar que irradia para a perna direita. Apresenta piora com o frio e estresse.',
    historia: 'Início há 2 anos após mudança de emprego. Relata também episódios de insônia, irritabilidade e ansiedade leve.',
    medicacoes: 'Usa anti-inflamatório ocasionalmente. Exames de imagem prévios sem achados graves relatados.',
    agua: 'Baixa ingestão hídrica, cerca de 1 litro ao dia.',
    dorLocal: 'Lombar com irradiação para perna direita',
    escalaDor: '7',
    obsSonoEmocoes: 'Sono leve, desperta entre 1h e 3h, acorda cansada e refere tensão emocional.',
    obsDigestao: 'Digestão irregular, gases e distensão em períodos de estresse.',
    obsDor: 'Piora no frio, com esforço e tensão emocional. Melhora parcial com calor local e repouso.',
    groups: {
      sintomas: ['Insônia', 'Irritabilidade', 'Tontura', 'Dor lombar'],
      queixaEstruturada: ['Quadro crônico', 'Piora ao estresse', 'Melhora com calor', 'Piora à noite'],
      sono: ['Despertares frequentes', 'Acorda entre 1h-3h', 'Sono não reparador'],
      emocoes: ['Raiva/irritabilidade', 'Frustração', 'Ansiedade/agitação mental'],
      digestao: ['Gases', 'Distensão abdominal', 'Peso após comer'],
      fezes: ['Evacuação incompleta', 'Constipação'],
      dor: ['Rigidez', 'Irradiação', 'Melhora com calor', 'Piora ao movimento'],
      clima: ['Piora com frio', 'Busca calor'],
      historico: ['Dor crônica'],
      substanciasUso: ['Cafeína', 'Anti-inflamatórios'],
      objetivos: ['Reduzir dor', 'Regular sono', 'Reduzir ansiedade'],
      seguranca: ['Diabetes descompensada'],
      lingua: ['Vermelha', 'Saburra amarela'],
      regioesLingua: ['Laterais/Fígado-VB', 'Raiz/Rim-Intestinos'],
    },
    tongue: {
      'Fígado e Vesícula Biliar': ['Laterais vermelhas', 'Pontos vermelhos nas laterais'],
      'Rins e Bexiga': ['Raiz seca'],
    },
    pulse: [
      ['esquerdo', 'p8', ['Pulso em corda', 'Pulso tenso', 'Irritabilidade/raiva']],
      ['esquerdo', 'p7', ['Dor lombar', 'Pulso profundo']],
    ],
  },
  {
    sexo: 'Masculino',
    profissao: 'Comercial',
    queixa: 'Queimação epigástrica, refluxo e distensão abdominal com piora após alimentação e em semanas de muita cobrança.',
    historia: 'Quadro recorrente há 8 meses, associado a rotina alimentar irregular, cafeína e tensão no trabalho.',
    medicacoes: 'Refere uso eventual de antiácido. Nega cirurgias recentes.',
    agua: 'Ingestão moderada, cerca de 1,5 litro ao dia.',
    dorLocal: 'Epigástrio e hipocôndrio direito',
    escalaDor: '5',
    obsSonoEmocoes: 'Sono interrompido por agitação mental e preocupação.',
    obsDigestao: 'Refluxo, gases, distensão e sensação de peso após refeições maiores.',
    obsDor: 'Piora após alimentação pesada, café e estresse. Melhora com refeições leves.',
    groups: {
      sintomas: ['Refluxo', 'Azia', 'Distensão abdominal', 'Ansiedade'],
      queixaEstruturada: ['Quadro recorrente', 'Piora após alimentação', 'Piora ao estresse'],
      sono: ['Dificuldade para iniciar sono', 'Sonhos intensos'],
      emocoes: ['Frustração', 'Preocupação/ruminação'],
      digestao: ['Refluxo/azia', 'Gases', 'Distensão abdominal', 'Peso após comer'],
      fezes: ['Tipo 5', 'Odor forte', 'Alternância intestinal'],
      dor: ['Queimação', 'Pressão'],
      clima: ['Piora com calor'],
      historico: ['Alergias'],
      substanciasUso: ['Cafeína', 'Álcool'],
      objetivos: ['Melhorar digestão', 'Regular sono', 'Reduzir ansiedade'],
      seguranca: [],
      lingua: ['Vermelha', 'Saburra espessa', 'Saburra amarela'],
      regioesLingua: ['Centro/Baço-Estômago', 'Laterais/Fígado-VB'],
    },
    tongue: {
      'Estômago e Baço': ['Centro vermelho/amarelado', 'Saburra espessa no centro'],
      'Fígado e Vesícula Biliar': ['Saburra amarela nas laterais'],
    },
    pulse: [
      ['direito', 'p8', ['Pulso escorregadio', 'Distensão abdominal', 'Umidade/fleuma']],
      ['esquerdo', 'p8', ['Pulso em corda', 'Pulso cheio']],
    ],
  },
  {
    sexo: 'Feminino',
    profissao: 'Professora',
    queixa: 'Fadiga persistente, sensação de peso corporal, baixa energia e compulsão por doce no fim do dia.',
    historia: 'Sintomas aumentaram nos últimos 6 meses, com rotina intensa, pouco descanso e alimentação irregular.',
    medicacoes: 'Sem medicamentos contínuos relatados. Refere suplementação ocasional.',
    agua: 'Baixa ingestão de água durante o expediente.',
    dorLocal: 'Sem dor principal, apenas peso em pernas',
    escalaDor: '2',
    obsSonoEmocoes: 'Sono não reparador e sonolência diurna, com ruminação mental.',
    obsDigestao: 'Pouca fome pela manhã, distensão e desejo por doces no período da tarde.',
    obsDor: 'Sensação de peso piora com umidade e melhora com movimento leve.',
    groups: {
      sintomas: ['Fadiga', 'Edema', 'Distensão abdominal'],
      queixaEstruturada: ['Início gradual', 'Quadro crônico', 'Melhora com movimento'],
      sono: ['Sono não reparador', 'Sonolência diurna'],
      emocoes: ['Preocupação/ruminação', 'Apatia/desânimo'],
      digestao: ['Pouca fome', 'Desejo por doce', 'Distensão abdominal', 'Peso após comer'],
      fezes: ['Tipo 6', 'Evacuação incompleta'],
      dor: ['Peso'],
      clima: ['Piora com umidade'],
      historico: ['Hipotireoidismo'],
      substanciasUso: ['Suplementos'],
      objetivos: ['Melhorar energia', 'Melhorar digestão', 'Reduzir edema'],
      seguranca: [],
      lingua: ['Pálida', 'Inchada', 'Marcas de dentes', 'Saburra branca'],
      regioesLingua: ['Centro/Baço-Estômago'],
    },
    tongue: {
      'Estômago e Baço': ['Centro pálido', 'Centro inchado', 'Marcas dentárias nas bordas'],
      'Rins e Bexiga': ['Raiz muito úmida'],
    },
    pulse: [
      ['direito', 'p8', ['Pulso fraco ou vazio', 'Fadiga pós-prandial', 'Desejo por doce']],
      ['direito', 'p7', ['Pulso fraco', 'Alteração de líquidos/temperatura']],
    ],
  },
];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function randomSubset(items, min, max) {
  const limit = Math.min(items.length, min + Math.floor(Math.random() * (max - min + 1)));
  return [...items].sort(() => Math.random() - 0.5).slice(0, limit);
}

function setGroup(map, group, items = []) {
  items.forEach(item => {
    map[`${group}:${item}`] = true;
  });
}

function addLightRandomization(map) {
  const optionalGroups = ['substanciasUso', 'historico', 'seguranca'];

  optionalGroups.forEach(group => {
    if (Math.random() > 0.65) {
      setGroup(map, group, randomSubset(checklists[group], 1, 1));
    }
  });

  const tongueOrgans = Object.entries(tongueOrganAlterations);
  if (Math.random() > 0.45) {
    const [organ, data] = randomItem(tongueOrgans);
    setGroup(map, `linguaOrgao:${organ}`, randomSubset(data.items, 1, 1));
  }

  const side = randomItem(['direito', 'esquerdo']);
  const position = randomItem(pulsePositions[side]);
  setGroup(map, `pulso:${side}:${position.id}`, randomSubset(position.items, 1, 2));
}

export function buildRandomClinicalFixture() {
  const clinicalCase = randomItem(clinicalCases);
  const selectedMap = {};

  Object.entries(clinicalCase.groups).forEach(([group, items]) => {
    setGroup(selectedMap, group, items);
  });

  Object.entries(clinicalCase.tongue).forEach(([organ, items]) => {
    setGroup(selectedMap, `linguaOrgao:${organ}`, items);
  });

  clinicalCase.pulse.forEach(([side, position, items]) => {
    setGroup(selectedMap, `pulso:${side}:${position}`, items);
  });

  addLightRandomization(selectedMap);

  return {
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
