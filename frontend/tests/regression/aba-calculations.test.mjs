// ============================================================
// Motor clínico do ABA (utils/aba/calculations.js e catalog.js).
// Os mesmos casos do Atlas (src/ficha-coleta.test.ts), trazidos junto com o
// código em 31/10/2026: provam que a conversão para JavaScript não mudou
// nenhum número — independência sobre tentativas preenchidas, recusa e não
// aplicável fora do denominador, critério com teto de ajuda, comparação de
// fases, sonda de generalização, análise de tarefas e redução.
// ============================================================

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  acquisitionBreakdown,
  acquisitionTimeStats,
  behaviorDurationSeries,
  behaviorHotspot,
  comparePhases,
  descriptiveStats,
  evaluateProgression,
  generalizationComparison,
  maximumIntensity,
  programDirection,
  programSeries,
  taskStepIndependence,
  promptDistributionSeries,
  reductionAgainstBaseline,
  reductionPhaseChange,
  reductionSeries,
  reinforcerEfficiencySummary,
  sessionNarrative,
  summarizeSession,
} from '../../src/utils/aba/calculations.js';
import { collectionTypeOf, orderedPromptHierarchy, trialCode } from '../../src/utils/aba/catalog.js';

// O Atlas usava vitest; aqui os mesmos casos rodam no node:test.
const it = test;
function expect(actual) {
  const matchers = {
    toBe: expected => assert.equal(actual, expected),
    toEqual: expected => assert.deepEqual(actual, expected),
    toBeNull: () => assert.equal(actual, null),
    toContain: expected => assert.ok(actual.includes(expected), `esperava conter ${JSON.stringify(expected)}`),
    toHaveLength: expected => assert.equal(actual.length, expected),
    toMatchObject: expected => assert.partialDeepStrictEqual(actual, expected),
  };
  matchers.not = {
    toContain: expected => assert.ok(!actual.includes(expected), `não esperava ${JSON.stringify(expected)}`),
  };
  return matchers;
}


const record = (
  trials,
  trialSeconds,
  phase,
) => ({ programId: 'prg', type: 'aquisicao', trials, trialSeconds, phase });

const reduction = (value, phase, intensity) =>
  ({ programId: 'prg', type: 'reducao', value, phase, intensity });

const session = (overrides) => ({
  id: crypto.randomUUID(),
  patientId: 'pat',
  therapistId: 'ter-1',
  supervisorId: 'sup-1',
  date: '2026-07-01',
  startAt: 0,
  location: 'Clínica',
  arrivalState: 'Regulado e disponível',
  peoplePresent: [],
  isGeneralizationProbe: false,
  status: 'finalizada',
  records: [],
  pauses: [],
  reinforcers: [],
  behaviors: [],
  incidents: [],
  notes: '',
  ...overrides,
});

const program = (criteria) => ({
  id: 'prg', planId: 'plan', patientId: 'pat', therapistId: 'ter-1',
  type: 'aquisicao', name: 'Espera', objective: '', target: '', skill: 'Espera',
  teachingFormat: 'DTT', promptStrategy: '', procedure: 'Reforço positivo',
  collectionType: 'tempo_maximo', trialCount: 5, durationMinutes: 15,
  criterion: '', generalizationCriterion: '', maintenanceCriterion: '',
  notes: '', status: 'Em ensino', protocolStartDate: '2026-06-01',
  criteria: {
    minimumPercentage: 80, consecutiveIndependent: 0, requiredSessions: 3,
    sessionsMustBeConsecutive: true, requiredEnvironments: 1, requiredTherapists: 1,
    maintenanceDays: 30, generalizationRule: '', ...criteria,
  },
});

describe('indicadores da ficha de tentativas', () => {
  it('separa acerto (com ou sem ajuda) de independência', () => {
    const breakdown = acquisitionBreakdown([
      record(['independente', 'independente', 'ajuda_gestual', 'ajuda_gestual', 'erro']),
    ]);
    expect(breakdown.scored).toBe(5);
    expect(breakdown.independencePercentage).toBe(40);
    expect(breakdown.correctPercentage).toBe(80);
    expect(breakdown.promptedPercentage).toBe(40);
    expect(breakdown.errorPercentage).toBe(20);
    expect(breakdown.mostUsedPrompt).toEqual({ response: 'ajuda_gestual', count: 2 });
  });

  it('mantém recusa e não aplicável fora do denominador', () => {
    const breakdown = acquisitionBreakdown([
      record(['independente', 'recusa', 'nao_aplicavel', null]),
    ]);
    expect(breakdown.scored).toBe(1);
    expect(breakdown.refused).toBe(1);
    expect(breakdown.notApplicable).toBe(1);
    expect(breakdown.independencePercentage).toBe(100);
  });

  it('usa o total bruto e não a média das porcentagens por sessão', () => {
    const breakdown = acquisitionBreakdown([
      record(['independente', 'independente', 'independente', 'independente', 'erro']),
      record(['erro', 'erro']),
    ]);
    // Média simples das sessões seria 40%; o correto é 4 ÷ 7.
    expect(breakdown.independencePercentage).toBe(57);
  });

  it('calcula tempo médio e maior tempo alcançado apenas de tentativas válidas', () => {
    const stats = acquisitionTimeStats([
      record(['independente', 'ajuda_visual', 'recusa', null], [30, 12, 99, 40]),
    ]);
    expect(stats).toEqual({ average: 21, maximum: 30, measured: 2 });
  });
});

describe('estatística descritiva', () => {
  it('descreve nível, média, mediana, extremos e tendência crescente', () => {
    const stats = descriptiveStats([20, 40, 60, 80]);
    expect(stats.level).toBe(80);
    expect(stats.mean).toBe(50);
    expect(stats.median).toBe(50);
    expect(stats.minimum).toBe(20);
    expect(stats.maximum).toBe(80);
    expect(stats.trend).toBe('crescente');
  });

  it('lê oscilação pequena como estável e ignora lacunas', () => {
    const stats = descriptiveStats([80, null, 81, 79, 80]);
    expect(stats.points).toBe(4);
    expect(stats.trend).toBe('estável');
  });

  it('não inventa dados quando a série está vazia', () => {
    expect(descriptiveStats([null, null]).trend).toBe('indefinida');
    expect(descriptiveStats([]).level).toBeNull();
  });
});

describe('critério de progressão', () => {
  const sessions = [
    session({ date: '2026-07-01', location: 'Clínica', therapistId: 'ter-1', records: [record(['independente', 'independente', 'independente', 'independente', 'erro'], [30, 30, 30, 30, 5])] }),
    session({ date: '2026-07-02', location: 'Casa', therapistId: 'ter-2', records: [record(['independente', 'independente', 'independente', 'independente', 'ajuda_visual'], [32, 30, 31, 30, 10])] }),
    session({ date: '2026-07-03', location: 'Clínica', therapistId: 'ter-1', records: [record(['independente', 'independente', 'independente', 'independente', 'independente'], [35, 30, 30, 30, 30])] }),
  ];

  it('reconhece o critério atingido com percentual, sessões consecutivas e tempo', () => {
    const status = evaluateProgression(
      program({ minimumPercentage: 80, requiredSessions: 3, minimumSeconds: 30, requiredEnvironments: 2, requiredTherapists: 2 }),
      sessions,
    );
    expect(status.met).toBe(true);
    expect(status.consecutiveSessions).toBe(3);
    expect(status.maxSeconds).toBe(35);
    expect(status.environments).toHaveLength(2);
    expect(status.pending).toEqual([]);
  });

  it('aponta o que falta quando o tempo mínimo não foi alcançado', () => {
    const status = evaluateProgression(
      program({ minimumSeconds: 60, requiredSessions: 3 }),
      sessions,
    );
    expect(status.met).toBe(false);
    expect(status.pending.join(' ')).toContain('60s');
  });

  it('conta a maior sequência de respostas independentes, reiniciando a cada erro', () => {
    const status = evaluateProgression(
      program({ consecutiveIndependent: 5, requiredSessions: 3, minimumSeconds: 30, requiredEnvironments: 2, requiredTherapists: 2 }),
      sessions,
    );
    // 4 independentes + erro, 4 + ajuda visual, 5 seguidas: a maior sequência é 5.
    expect(status.longestIndependentStreak).toBe(5);
    expect(status.met).toBe(true);

    const stricter = evaluateProgression(program({ consecutiveIndependent: 8, requiredSessions: 3 }), sessions);
    expect(stricter.met).toBe(false);
    expect(stricter.pending.join(' ')).toContain('5 de 8');
  });
});

describe('fases, mudança e sobreposição', () => {
  const phased = [
    session({ date: '2026-07-01', records: [record(['erro', 'erro', 'erro', 'erro'], undefined, 'linha_de_base')] }),
    session({ date: '2026-07-02', records: [record(['independente', 'erro', 'erro', 'erro'], undefined, 'linha_de_base')] }),
    session({ date: '2026-07-03', records: [record(['independente', 'independente', 'independente', 'erro'], undefined, 'intervencao')] }),
    session({ date: '2026-07-04', records: [record(['independente', 'independente', 'independente', 'independente'], undefined, 'intervencao')] }),
  ];

  it('separa os trechos, marca a mudança de fase e mede a sobreposição', () => {
    const comparison = comparePhases(
      programSeries('prg', phased).map((point) => ({
        label: point.date, phase: point.phase, value: point.percentage,
      })),
      'aumentar',
    );
    expect(comparison.segments.map((segment) => segment.phase))
      .toEqual(['linha_de_base', 'intervencao']);
    expect(comparison.changes).toEqual([
      { label: '03/07', from: 'linha_de_base', to: 'intervencao' },
    ]);
    expect(comparison.baselineMean).toBe(12.5);
    expect(comparison.interventionMean).toBe(87.5);
    expect(comparison.meanChange).toBe(75);
    // Último ponto da linha de base (25%) → primeiro da intervenção (75%).
    expect(comparison.immediateChange).toBe(50);
    // Os dois pontos da intervenção superam o melhor da linha de base.
    expect(comparison.nonOverlap).toBe(100);
    expect(comparison.overlap).toBe(0);
  });

  it('conta como sobreposta a intervenção que não supera a linha de base', () => {
    const comparison = comparePhases([
      { label: '1', phase: 'linha_de_base', value: 60 },
      { label: '2', phase: 'intervencao', value: 40 },
      { label: '3', phase: 'intervencao', value: 80 },
    ], 'aumentar');
    expect(comparison.nonOverlap).toBe(50);
  });

  it('inverte o lado da sobreposição nos programas de redução', () => {
    const comparison = comparePhases([
      { label: '1', phase: 'linha_de_base', value: 10 },
      { label: '2', phase: 'intervencao', value: 4 },
      { label: '3', phase: 'intervencao', value: 2 },
    ], 'reduzir');
    expect(comparison.nonOverlap).toBe(100);
    expect(comparison.meanChangePercentage).toBe(-70);
  });

  it('não conta sessão de linha de base para o critério de progressão', () => {
    const baselineOnly = evaluateProgression(
      program({ minimumPercentage: 80, requiredSessions: 2 }),
      [
        session({ date: '2026-07-01', records: [record(['independente', 'independente'], undefined, 'linha_de_base')] }),
        session({ date: '2026-07-02', records: [record(['independente', 'independente'], undefined, 'linha_de_base')] }),
      ],
    );
    expect(baselineOnly.met).toBe(false);
    expect(baselineOnly.qualifyingSessions).toBe(0);
  });

  it('usa as fases marcadas na redução e avisa quando a linha de base é presumida', () => {
    const marked = reductionPhaseChange(reductionSeries('prg', [
      session({ date: '2026-07-01', records: [reduction(10, 'linha_de_base')] }),
      session({ date: '2026-07-02', records: [reduction(8, 'linha_de_base')] }),
      session({ date: '2026-07-03', records: [reduction(3, 'intervencao')] }),
      session({ date: '2026-07-04', records: [reduction(0, 'intervencao')] }),
    ]));
    expect(marked?.source).toBe('fases');
    expect(marked?.baselineMean).toBe(9);
    expect(marked?.changePercentage).toBe(-83);
    expect(marked?.zeroSessions).toBe(1);

    const guessed = reductionPhaseChange(reductionSeries('prg', [
      session({ date: '2026-07-01', records: [reduction(10)] }),
      session({ date: '2026-07-02', records: [reduction(12)] }),
      session({ date: '2026-07-03', records: [reduction(8)] }),
      session({ date: '2026-07-04', records: [reduction(2)] }),
    ]));
    expect(guessed?.source).toBe('presumida');
    expect(guessed?.nonOverlap).toBeNull();
  });

  it('aponta a intensidade máxima pela escala, não pelo maior número', () => {
    const points = reductionSeries('prg', [
      session({ date: '2026-07-01', records: [reduction(9, 'intervencao', 'Leve')] }),
      session({ date: '2026-07-02', records: [reduction(1, 'intervencao', 'Alta')] }),
      session({ date: '2026-07-03', records: [reduction(4, 'intervencao', 'Moderada')] }),
    ]);
    expect(points.map((point) => point.intensityRank)).toEqual([1, 3, 2]);
    expect(maximumIntensity(points)).toMatchObject({ intensity: 'Alta', date: '02/07', sessions: 3 });
    expect(maximumIntensity([])).toBeNull();
  });

  it('declara tendência em escala pequena, onde o limiar fixo de 1 por sessão falhava', () => {
    // Redução de 6 para 1 episódio: inclinação ~-1,6 por sessão em valor
    // absoluto pequeno. A régua relativa enxerga a queda.
    expect(descriptiveStats([6, 5, 3, 1]).trend).toBe('decrescente');
    expect(descriptiveStats([3, 3, 2, 3]).trend).toBe('estável');
  });
});

describe('teto de ajuda no critério', () => {
  const ceilingProgram = (ceiling) => ({
    ...program({ minimumPercentage: 50, requiredSessions: 2, sessionsMustBeConsecutive: true }),
    promptCeiling: ceiling,
  });

  const sessions = [
    session({ date: '2026-07-01', records: [record(['independente', 'ajuda_gestual'])] }),
    // Percentual idêntico, mas com ajuda física total: é a sessão que o teto
    // deve desqualificar.
    session({ date: '2026-07-02', records: [record(['independente', 'fisica_total'])] }),
  ];

  it('desqualifica a sessão que passou do teto, por melhor que seja o percentual', () => {
    const semTeto = evaluateProgression(ceilingProgram(), sessions);
    expect(semTeto.met).toBe(true);
    expect(semTeto.qualifyingSessions).toBe(2);

    const comTeto = evaluateProgression(ceilingProgram('ajuda_gestual'), sessions);
    expect(comTeto.met).toBe(false);
    expect(comTeto.qualifyingSessions).toBe(1);
    expect(comTeto.pending.join(' ')).toContain('acima de Ajuda gestual');
  });

  it('não barra recusa, não aplicável nem tentativa em branco', () => {
    const status = evaluateProgression(
      { ...ceilingProgram('ajuda_visual'), criteria: { ...ceilingProgram().criteria, requiredSessions: 1 } },
      [session({ date: '2026-07-01', records: [record(['independente', 'recusa', 'nao_aplicavel', null])] })],
    );
    expect(status.met).toBe(true);
  });

  it('separa a ajuda mais utilizada da mais intrusiva', () => {
    const breakdown = acquisitionBreakdown([
      record(['ajuda_gestual', 'ajuda_gestual', 'ajuda_gestual', 'fisica_total']),
    ]);
    expect(breakdown.mostUsedPrompt?.response).toBe('ajuda_gestual');
    // Uma única física total no bloco não aparece na "mais utilizada" e é
    // justamente a que impede o critério.
    expect(breakdown.mostIntrusivePrompt).toBe('fisica_total');
    expect(acquisitionBreakdown([record(['independente'])]).mostIntrusivePrompt).toBeNull();
  });
});

describe('sonda de generalização e reforçador por programa', () => {
  it('compara a sonda pela condição registrada, sem inferir a dimensão', () => {
    const rows = generalizationComparison('prg', [
      session({ date: '2026-07-01', records: [record(['independente', 'independente'])] }),
      session({
        date: '2026-07-02',
        isGeneralizationProbe: true,
        generalizationCondition: 'pessoa',
        records: [record(['independente', 'erro'])],
      }),
    ], (id) => id);
    expect(rows.find((row) => row.label === 'Sonda · Pessoa diferente')?.percentage).toBe(50);
    expect(rows.find((row) => row.label === 'Ensino')?.percentage).toBe(100);
  });

  it('separa a eficiência do reforçador por programa', () => {
    const reinforcers = [
      { id: 'r1', patientId: 'pat', name: 'Bolha', category: 'Sensorial', initialPreference: 'Alta', notes: '', active: true },
    ];
    const sessions = [
      session({ reinforcers: [
        { reinforcerId: 'r1', programId: 'prg', uses: 2, accessMinutes: 1, efficiency: 'Eficiente' },
        { reinforcerId: 'r1', programId: 'outro', uses: 2, accessMinutes: 1, efficiency: 'Recusado' },
      ] }),
    ];
    expect(reinforcerEfficiencySummary(sessions, reinforcers, 'prg')[0].effectivePercentage).toBe(100);
    expect(reinforcerEfficiencySummary(sessions, reinforcers, 'outro')[0].effectivePercentage).toBe(0);
    // Sem filtro, o reforçador aparece uma vez com a média dos dois programas.
    expect(reinforcerEfficiencySummary(sessions, reinforcers)[0].effectivePercentage).toBe(50);
  });

  it('aponta o programa com mais episódios do comportamento', () => {
    const hotspot = behaviorHotspot([
      session({ behaviors: [
        { id: 'a', behaviorId: 'b1', programId: 'prg', quantity: 1, intensity: 'Leve', moment: '10:00', antecedent: '', consequence: '', conduct: '' },
        { id: 'b', behaviorId: 'b1', programId: 'prg', quantity: 2, intensity: 'Alta', moment: '10:10', antecedent: '', consequence: '', conduct: '' },
        { id: 'c', behaviorId: 'b1', programId: 'outro', quantity: 1, intensity: 'Leve', moment: '10:20', antecedent: '', consequence: '', conduct: '' },
      ] }),
    ], (id) => (id === 'prg' ? 'Espera' : 'FCT'));
    expect(hotspot).toEqual({ programId: 'prg', name: 'Espera', episodes: 3 });
    expect(behaviorHotspot([], (id) => id)).toBeNull();
  });
});

describe('análise de tarefas e direção do programa', () => {
  const chaining = () => ({
    ...program({}),
    name: 'Lavar as mãos',
    taskSteps: ['Abrir a torneira', 'Ensaboar', 'Enxaguar'],
    trialCount: 3,
  });

  it('mostra a independência de cada etapa, e não um percentual único', () => {
    const rows = taskStepIndependence(chaining(), [
      session({ date: '2026-07-01', records: [record(['independente', 'erro', 'independente'])] }),
      session({ date: '2026-07-02', records: [record(['independente', 'ajuda_verbal', 'independente'])] }),
    ]);
    expect(rows.map((row) => row.label)).toEqual(['Abrir a torneira', 'Ensaboar', 'Enxaguar']);
    expect(rows[0].percentage).toBe(100);
    // A etapa do meio é onde a criança trava — e some num percentual do
    // programa inteiro, que aqui daria 67%.
    expect(rows[1].percentage).toBe(0);
    expect(rows[1].prompted).toBe(1);
    expect(rows[1].errors).toBe(1);
    expect(rows[2].percentage).toBe(100);
  });

  it('ignora recusa e não aplicável no denominador da etapa', () => {
    const rows = taskStepIndependence(chaining(), [
      session({ date: '2026-07-01', records: [record(['recusa', 'nao_aplicavel', null])] }),
      session({ date: '2026-07-02', records: [record(['independente', 'erro', 'independente'])] }),
    ]);
    expect(rows[0]).toMatchObject({ scored: 1, percentage: 100 });
    expect(rows[1]).toMatchObject({ scored: 1, percentage: 0 });
  });

  it('não devolve etapas para programa sem análise de tarefas', () => {
    expect(taskStepIndependence(program({}), [])).toEqual([]);
  });

  it('usa a direção do programa: DRH quer aumentar, não reduzir', () => {
    const drh = {
      ...program({}),
      type: 'reducao',
      measure: 'frequência',
      unit: 'iniciações',
      procedure: 'DRH',
      goalDirection: 'aumentar',
    };
    expect(programDirection(drh)).toBe('aumentar');

    const points = reductionSeries('prg', [
      session({ date: '2026-07-01', records: [reduction(1, 'linha_de_base')] }),
      session({ date: '2026-07-02', records: [reduction(5, 'intervencao')] }),
      session({ date: '2026-07-03', records: [reduction(7, 'intervencao')] }),
    ]);
    // Subiu de 1 para 6: com a direção certa é 100% de dados não sobrepostos.
    expect(reductionPhaseChange(points, 'aumentar')?.nonOverlap).toBe(100);
    // Com a suposição antiga de que redução é sempre menos-é-melhor, o mesmo
    // dado apareceria como zero.
    expect(reductionPhaseChange(points, 'reduzir')?.nonOverlap).toBe(0);
  });

  it('assume aumentar na aquisição e reduzir na redução quando o campo não existe', () => {
    expect(programDirection(program({}))).toBe('aumentar');
    expect(programDirection({ ...program({}), type: 'reducao' })).toBe('reduzir');
  });
});

describe('gráficos por dimensão', () => {
  it('distribui o percentual de cada nível de ajuda por sessão', () => {
    const series = promptDistributionSeries('prg', [
      session({ date: '2026-07-01', records: [record(['independente', 'independente', 'ajuda_verbal', 'erro'])] }),
    ]);
    expect(series[0].independente).toBe(50);
    expect(series[0].ajuda_verbal).toBe(25);
    expect(series[0].fisica_total).toBe(0);
  });

  it('compara ambiente, pessoa, material e condição de generalização', () => {
    const rows = generalizationComparison('prg', [
      session({ date: '2026-07-01', location: 'Clínica', material: 'Material do treino', records: [record(['independente', 'independente'])] }),
      session({ date: '2026-07-02', location: 'Escola', material: 'Material novo', isGeneralizationProbe: true, records: [record(['independente', 'erro'])] }),
    ], (id) => (id === 'ter-1' ? 'Ana' : id));
    expect(rows.find((row) => row.label === 'Clínica')?.percentage).toBe(100);
    expect(rows.find((row) => row.label === 'Escola')?.percentage).toBe(50);
    // Sonda antiga, sem condição registrada: aparece nomeada como tal em vez de
    // se misturar com as sondas que dizem o que variou.
    expect(rows.find((row) => row.label === 'Sonda · Condição não informada')?.sessions).toBe(1);
    expect(rows.find((row) => row.label === 'Ana')?.kind).toBe('pessoa');
    expect(rows.find((row) => row.label === 'Material novo')?.kind).toBe('material');
  });

  it('omite a comparação por material quando nenhuma sessão registrou um', () => {
    const rows = generalizationComparison('prg', [
      session({ date: '2026-07-01', records: [record(['independente'])] }),
    ], (id) => id);
    expect(rows.some((row) => row.kind === 'material')).toBe(false);
  });

  it('mantém duração dos episódios em série separada da frequência', () => {
    const series = behaviorDurationSeries('prg', [
      session({
        date: '2026-07-01',
        behaviors: [
          { id: 'a', behaviorId: 'b1', programId: 'prg', quantity: 1, intensity: 'Alta', durationSeconds: 60, moment: '10:00', antecedent: '', consequence: '', conduct: '' },
          { id: 'b', behaviorId: 'b1', programId: 'prg', quantity: 1, intensity: 'Leve', durationSeconds: 20, moment: '10:20', antecedent: '', consequence: '', conduct: '' },
        ],
      }),
    ]);
    expect(series[0]).toMatchObject({ total: 80, average: 40, episodes: 2 });
  });

  it('compara linha de base e intervenção nos programas de redução', () => {
    const change = reductionAgainstBaseline([10, 12, 8, 3, 2, 0]);
    expect(change?.baselineMean).toBe(10);
    expect(change?.changePercentage).toBe(-83);
    expect(change?.zeroSessions).toBe(1);
  });

  it('ranqueia a eficiência dos reforçadores', () => {
    const reinforcers = [
      { id: 'r1', patientId: 'pat', name: 'Bolha', category: 'Sensorial', initialPreference: 'Alta', notes: '', active: true },
      { id: 'r2', patientId: 'pat', name: 'Tablet', category: 'Eletrônico', initialPreference: 'Alta', notes: '', active: true },
    ];
    const rows = reinforcerEfficiencySummary([
      session({ reinforcers: [
        { reinforcerId: 'r1', uses: 2, accessMinutes: 2, efficiency: 'Muito eficiente' },
        { reinforcerId: 'r2', uses: 1, accessMinutes: 1, efficiency: 'Ineficaz' },
      ] }),
    ], reinforcers);
    expect(rows[0]).toMatchObject({ name: 'Bolha', effectivePercentage: 100 });
    expect(rows[1]).toMatchObject({ name: 'Tablet', effectivePercentage: 0 });
  });
});

describe('finalização da sessão', () => {
  const reinforcers = [
    { id: 'r1', patientId: 'pat', name: 'Bolhas de sabão', category: 'Sensorial', initialPreference: 'Alta', notes: '', active: true },
  ];
  const behaviors = [{ id: 'b1', name: 'choro intenso' }];
  const closed = session({
    startAt: Date.parse('2026-07-31T14:00:00Z'),
    endAt: Date.parse('2026-07-31T14:40:00Z'),
    isGeneralizationProbe: true,
    notes: '',
    records: [record(['independente', 'independente', 'ajuda_visual', 'erro', null], [30, 26, 18, 4, null])],
    reinforcers: [{ reinforcerId: 'r1', uses: 3, accessMinutes: 2, efficiency: 'Eficiente' }],
    behaviors: [
      { id: 'e1', behaviorId: 'b1', quantity: 1, intensity: 'Leve', durationSeconds: 40, moment: '14:10', antecedent: 'Negativa', consequence: '', conduct: '' },
      { id: 'e2', behaviorId: 'b1', quantity: 1, intensity: 'Moderada', durationSeconds: 25, moment: '14:25', antecedent: 'Negativa', consequence: '', conduct: '' },
    ],
  });

  it('consolida o que foi registrado, sem completar lacunas', () => {
    const summary = summarizeSession(closed, [program({})], reinforcers, behaviors);
    expect(summary.durationMinutes).toBe(40);
    expect(summary.plannedTrials).toBe(5);
    expect(summary.filledTrials).toBe(4);
    expect(summary.correctPercentage).toBe(75);
    expect(summary.independencePercentage).toBe(50);
    expect(summary.maxSeconds).toBe(30);
    expect(summary.behaviors).toMatchObject({
      episodes: 2, totalDurationSeconds: 65, maxIntensity: 'Moderada', topAntecedent: 'Negativa',
    });
    expect(summary.missing).toContain('Espera: 1 tentativa sem registro');
    expect(summary.missing).toContain('Observação da sessão em branco');
  });

  it('escreve a síntese apenas com dados presentes', () => {
    const narrative = sessionNarrative(summarizeSession(closed, [program({})], reinforcers, behaviors));
    expect(narrative).toContain('4 de 5 oportunidades');
    expect(narrative).toContain('75% de acerto e 50% de independência');
    expect(narrative).toContain('maior tempo alcançado foi de 30 segundos');
    expect(narrative).toContain('Bolhas de sabão');
    expect(narrative).toContain('sonda de generalização');
  });

  it('omite as frases cujos dados não existem', () => {
    const bare = session({
      startAt: Date.parse('2026-07-31T14:00:00Z'),
      endAt: Date.parse('2026-07-31T14:15:00Z'),
      records: [record([null, null])],
    });
    const narrative = sessionNarrative(summarizeSession(bare, [program({})], [], []));
    expect(narrative).not.toContain('independência');
    expect(narrative).not.toContain('reforçador');
    expect(narrative).not.toContain('sonda');
    expect(narrative).toContain('A sessão durou 15 minutos');
  });
});

describe('catálogo clínico', () => {
  it('traduz respostas nos códigos da ficha de aula', () => {
    expect(trialCode('independente')).toBe('I');
    expect(trialCode('ajuda_visual')).toBe('AVS');
    expect(trialCode('fisica_total')).toBe('AFT');
    expect(trialCode('sem_resposta')).toBe('SR');
  });

  it('ordena a hierarquia de ajuda do menos para o mais intrusivo', () => {
    expect(orderedPromptHierarchy(['fisica_total', 'independente', 'ajuda_gestual']))
      .toEqual(['independente', 'ajuda_gestual', 'fisica_total']);
  });

  it('cai na hierarquia completa quando o programa não configurou ajuda', () => {
    expect(orderedPromptHierarchy([])).toHaveLength(7);
    expect(orderedPromptHierarchy(undefined)[0]).toBe('independente');
  });

  it('liga a forma de coleta à ficha que o terapeuta vai ver', () => {
    expect(collectionTypeOf('tempo_maximo')?.sheet).toBe('tentativas');
    expect(collectionTypeOf('taxa')?.measure).toBe('taxa');
    expect(collectionTypeOf('intervalo_parcial')?.sheet).toBe('intervalo');
  });
});
