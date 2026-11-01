// ============================================================
// Cálculos clínicos da coleta ABA: independência, critério, comparação de
// fases e as séries dos gráficos. Trazido do Atlas (src/calculations.ts) em
// 31/10/2026 sem mudar regra — só os tipos do TypeScript saíram. Percentual
// é sempre sobre as tentativas preenchidas (nunca média de sessões); recusa e
// não aplicável ficam fora do denominador.
// ============================================================

import {
  EXCLUDED_FROM_DENOMINATOR,
  generalizationConditionLabel, intensityRank, phaseLabel, promptLevelOf, PROMPT_LEVELS,
} from './catalog.js';

/**
 * Status em que o programa existe no plano mas não entra na coleta da sessão.
 *
 * "Planejado" NÃO entra nesta lista: nem o app nem o banco têm qualquer ação que
 * tire um programa desse status depois que a versão do plano é aprovada — o
 * `save_program_to_patient_plan` exige um rascunho aberto. Excluir "Planejado"
 * criava um beco sem saída: programa aprovado e ativo que nunca podia ser
 * coletado. Dentro de uma versão aprovada e ativa, coletar é justamente o que
 * inicia o programa. Para deixar um programa de fora da sessão use "Pausado".
 */
const NOT_COLLECTABLE_STATUSES = ['Concluído', 'Pausado', 'Extinto'];

// Plural de verdade (regra do Vitalis: nunca "(s)").
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

// Rótulo do eixo dos gráficos: dia/mês, como se lê no Brasil (o Atlas
// mostrava mês/dia).
const chartDay = (isoDate) => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;

/**
 * Fase de um registro. Sessões anteriores à existência da fase não têm o campo:
 * elas contam como intervenção, que é o que de fato eram — a coleta só começava
 * depois do plano aprovado.
 */
export const recordPhase = (record) =>
  record.phase ?? 'intervencao';

const emptyStats = () => ({
  independent: 0,
  filled: 0,
  percentage: null,
  refused: 0,
  notApplicable: 0,
});

export function aggregateAcquisitionRecords(
  records,
) {
  const totals = records.reduce(
    (acc, record) => {
      for (const trial of record.trials) {
        if (trial === null) continue; // NC — não coletado; nunca conta como zero.
        if (trial === 'recusa') {
          acc.refused += 1; // R — registrada, fora do denominador.
          continue;
        }
        if (trial === 'nao_aplicavel') {
          acc.notApplicable += 1; // NA — excluída do denominador.
          continue;
        }
        acc.filled += 1;
        if (trial === 'independente') acc.independent += 1;
      }
      return acc;
    },
    { independent: 0, filled: 0, refused: 0, notApplicable: 0 },
  );

  return {
    ...totals,
    percentage:
      totals.filled === 0
        ? null
        : Math.round((totals.independent / totals.filled) * 100),
  };
}

// Códigos que ficam fora do cálculo de independência (mantido junto ao tipo).
export { EXCLUDED_FROM_DENOMINATOR };

export function programIndependence(
  programId,
  allSessions,
) {
  const records = allSessions.flatMap((session) =>
    session.records.filter(
      (record) =>
        record.type === 'aquisicao' && record.programId === programId,
    ),
  );
  return records.length ? aggregateAcquisitionRecords(records) : emptyStats();
}

export function patientIndependence(
  patientId,
  allPrograms,
  allSessions,
) {
  const acquisitionIds = new Set(
    allPrograms
      .filter(
        (program) =>
          program.patientId === patientId && program.type === 'aquisicao',
      )
      .map((program) => program.id),
  );

  const records = allSessions
    .filter((session) => session.patientId === patientId)
    .flatMap((session) =>
      session.records.filter(
        (record) =>
          record.type === 'aquisicao' && acquisitionIds.has(record.programId),
      ),
    );

  return records.length ? aggregateAcquisitionRecords(records) : emptyStats();
}

export function programSeries(programId, allSessions) {
  return allSessions
    .flatMap((session) => {
      const record = session.records.find(
        (item) =>
          item.type === 'aquisicao' && item.programId === programId,
      );
      if (!record) return [];
      const stats = aggregateAcquisitionRecords([record]);
      // Sessões que existiram mas ficaram sem oportunidade pontuável (só recusa/
      // NA/vazio) entram como lacuna (percentage null) — o Manual (pág. 145)
      // exige "lacuna para ausência real de dado" e proíbe interpolar. O gráfico
      // usa connectNulls=false para quebrar a linha nesses pontos.
      return [
        {
          date: chartDay(session.date),
          fullDate: session.date,
          percentage: stats.percentage,
          independent: stats.independent,
          filled: stats.filled,
          location: session.location,
          phase: recordPhase(record),
        },
      ];
    })
    .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
}

// --- Cálculos automáticos da ficha de coleta (seção 9) ------------------------

const PROMPT_RESPONSES = PROMPT_LEVELS
  .filter((level) => level.response !== 'independente')
  .map((level) => level.response);

const percentage = (part, total) =>
  total === 0 ? null : Math.round((part / total) * 100);

/**
 * Consolida as tentativas de um ou mais registros. "Acerto" é a resposta correta
 * com ou sem ajuda; independência é o subconjunto sem ajuda nenhuma. Recusa e não
 * aplicável continuam registradas e fora do denominador (Manual pág. 142-143).
 * O percentual geral usa o total de respostas ÷ total de tentativas preenchidas —
 * nunca a média simples das porcentagens de cada sessão.
 */
export function acquisitionBreakdown(records) {
  const promptCounts = {};
  let scored = 0;
  let independent = 0;
  let prompted = 0;
  let approximate = 0;
  let errors = 0;
  let noResponse = 0;
  let refused = 0;
  let notApplicable = 0;

  for (const record of records) {
    for (const trial of record.trials) {
      if (trial === null) continue;
      if (trial === 'recusa') { refused += 1; continue; }
      if (trial === 'nao_aplicavel') { notApplicable += 1; continue; }
      scored += 1;
      if (trial === 'independente') independent += 1;
      else if (PROMPT_RESPONSES.includes(trial)) {
        prompted += 1;
        promptCounts[trial] = (promptCounts[trial] ?? 0) + 1;
      } else if (trial === 'aproximada') approximate += 1;
      else if (trial === 'erro') errors += 1;
      else if (trial === 'sem_resposta') noResponse += 1;
    }
  }

  const mostUsed = Object.entries(promptCounts)
    .sort((left, right) => right[1] - left[1])[0];

  // "Ajuda mais utilizada" e "maior nível de ajuda" respondem coisas
  // diferentes: uma única ajuda física total num bloco de gestuais não aparece
  // na primeira e é justamente o que impede o critério.
  const mostIntrusive = Object.keys(promptCounts)
    .map((response) => promptLevelOf(response))
    .filter((level) => level != null)
    .sort((left, right) => right.intrusiveness - left.intrusiveness)[0] ?? null;

  return {
    scored,
    independent,
    prompted,
    approximate,
    errors,
    noResponse,
    refused,
    notApplicable,
    independencePercentage: percentage(independent, scored),
    correctPercentage: percentage(independent + prompted, scored),
    promptedPercentage: percentage(prompted, scored),
    errorPercentage: percentage(errors, scored),
    promptCounts,
    mostUsedPrompt: mostUsed
      ? { response: mostUsed[0], count: mostUsed[1] }
      : null,
    mostIntrusivePrompt: mostIntrusive?.response ?? null,
  };
}

/** Tempo médio para executar e maior tempo alcançado (seção 9). */
export function acquisitionTimeStats(records) {
  const values = records.flatMap((record) =>
    (record.trialSeconds ?? []).filter(
      (seconds, index) =>
        typeof seconds === 'number'
        && seconds > 0
        && record.trials[index] != null
        && !EXCLUDED_FROM_DENOMINATOR.includes(record.trials[index]),
    ));
  if (!values.length) return { average: null, maximum: null, measured: 0 };
  return {
    average: Math.round(values.reduce((total, value) => total + value, 0) / values.length),
    maximum: Math.max(...values),
    measured: values.length,
  };
}

/**
 * Estatística descritiva da análise visual (seção 10): nível atual, média,
 * mediana, extremos, tendência e variabilidade. Sessões sem dado pontuável são
 * lacunas e ficam fora do cálculo — não viram zero.
 */
export function descriptiveStats(values) {
  const points = values.filter((value) => value != null);
  if (!points.length) {
    return {
      level: null, mean: null, median: null, minimum: null, maximum: null,
      trend: 'indefinida', slope: null, variability: null, range: null, points: 0,
    };
  }
  const sorted = [...points].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const mean = points.reduce((total, value) => total + value, 0) / points.length;
  const median = sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
  const variance = points.reduce((total, value) => total + (value - mean) ** 2, 0) / points.length;
  const deviation = Math.sqrt(variance);

  let slope = null;
  if (points.length >= 2) {
    const meanIndex = (points.length - 1) / 2;
    let covariance = 0;
    let indexVariance = 0;
    points.forEach((value, index) => {
      covariance += (index - meanIndex) * (value - mean);
      indexVariance += (index - meanIndex) ** 2;
    });
    slope = indexVariance === 0 ? 0 : covariance / indexVariance;
  }

  // A tendência é declarada comparando a mudança total prevista pela reta ao
  // longo da série com o nível médio dela. Um limiar fixo em "1 por sessão"
  // servia à independência (0-100) e falhava na redução: num programa com três
  // episódios por sessão, nada nunca chegaria a 1 de inclinação e toda série
  // pareceria estável. Aqui a régua é relativa — a reta precisa percorrer 20% do
  // nível médio — e vale igual para percentual, segundos e contagem. Os 20%
  // seguram o outro extremo: numa série de contagens baixas, uma sessão fora da
  // curva não deve virar "decrescente".
  const span = slope == null ? null : slope * (points.length - 1);
  const threshold = 0.2 * (Math.abs(mean) || Math.abs(span ?? 0));
  const trend = span == null
    ? 'indefinida'
    : span > threshold ? 'crescente' : span < -threshold ? 'decrescente' : 'estável';

  return {
    level: points.at(-1) ?? null,
    mean: Math.round(mean * 10) / 10,
    median: Math.round(median * 10) / 10,
    minimum: sorted[0],
    maximum: sorted.at(-1) ?? null,
    trend,
    slope: slope == null ? null : Math.round(slope * 100) / 100,
    variability: mean === 0 ? null : Math.round((deviation / mean) * 100),
    range: (sorted.at(-1) ?? 0) - sorted[0],
    points: points.length,
  };
}

// --- Comparação entre fases e sobreposição (seção 10) -------------------------

const average = (values) =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;

const round1 = (value) => value == null ? null : Math.round(value * 10) / 10;

/**
 * Compara linha de base e intervenção (seção 10: "mudança entre linha de base e
 * intervenção", "mudança imediata", "sobreposição", "consistência entre fases").
 *
 * `direction` diz para que lado é melhorar: um programa de aquisição quer subir,
 * um de redução quer descer. A sobreposição depende disso — sem o parâmetro, o
 * mesmo cálculo diria que uma redução bem-sucedida piorou.
 *
 * PND (percentual de dados não sobrepostos) conta os pontos da intervenção que
 * superam o melhor ponto da linha de base. É descritivo, não um teste
 * estatístico: com uma linha de base curta ou instável ele exagera, e por isso a
 * tela mostra sempre quantos pontos entraram em cada fase.
 */
export function comparePhases(
  points,
  direction,
) {
  const segments = [];
  const changes = [];

  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous && previous.phase !== point.phase) {
      changes.push({ label: point.label, from: previous.phase, to: point.phase });
    }
    const current = segments.at(-1);
    if (!current || current.phase !== point.phase) {
      segments.push({
        phase: point.phase,
        label: phaseLabel(point.phase),
        startLabel: point.label,
        sessions: 0,
        mean: null,
        level: null,
      });
    }
  });

  // Média e nível de cada trecho contíguo — é assim que "consistência entre
  // fases" fica visível: dois trechos da mesma fase aparecem separados.
  let segmentIndex = -1;
  let buffer = [];
  const flush = () => {
    if (segmentIndex < 0) return;
    segments[segmentIndex].mean = round1(average(buffer));
    segments[segmentIndex].level = buffer.at(-1) ?? null;
    segments[segmentIndex].sessions = buffer.length;
  };
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (!previous || previous.phase !== point.phase) {
      flush();
      segmentIndex += 1;
      buffer = [];
    }
    if (point.value != null) buffer.push(point.value);
  });
  flush();

  const baseline = points.filter((point) => point.phase === 'linha_de_base' && point.value != null);
  const intervention = points.filter((point) => point.phase === 'intervencao' && point.value != null);
  const baselineValues = baseline.map((point) => point.value);
  const interventionValues = intervention.map((point) => point.value);
  const baselineMean = average(baselineValues);
  const interventionMean = average(interventionValues);

  let nonOverlap = null;
  if (baselineValues.length && interventionValues.length) {
    const reference = direction === 'aumentar'
      ? Math.max(...baselineValues)
      : Math.min(...baselineValues);
    const beyond = interventionValues.filter((value) =>
      direction === 'aumentar' ? value > reference : value < reference).length;
    nonOverlap = Math.round((beyond / interventionValues.length) * 100);
  }

  const meanChange = baselineMean == null || interventionMean == null
    ? null
    : interventionMean - baselineMean;

  return {
    segments,
    changes,
    baselineMean: round1(baselineMean),
    interventionMean: round1(interventionMean),
    meanChange: round1(meanChange),
    meanChangePercentage: meanChange == null || !baselineMean
      ? null
      : Math.round((meanChange / Math.abs(baselineMean)) * 100),
    immediateChange: baselineValues.length && interventionValues.length
      ? round1((interventionValues[0]) - (baselineValues.at(-1)))
      : null,
    nonOverlap,
    overlap: nonOverlap == null ? null : 100 - nonOverlap,
    baselinePoints: baselineValues.length,
    interventionPoints: interventionValues.length,
  };
}

/** Sessões (em ordem) que trazem registro de aquisição do programa. */
function acquisitionSessions(programId, allSessions) {
  return allSessions
    .filter((session) => session.status !== 'em_andamento')
    .map((session) => ({
      session,
      record: session.records.find(
        (item) =>
          item.type === 'aquisicao' && item.programId === programId,
      ),
    }))
    .filter((entry) => Boolean(entry.record))
    .sort((left, right) => left.session.date.localeCompare(right.session.date));
}

/**
 * Critério de progressão (seção 12). Só descreve o que os dados mostram; a
 * mudança de fase continua dependendo da aprovação do supervisor.
 */
export function evaluateProgression(program, allSessions) {
  const criteria = program.criteria;
  // Sessão de linha de base é medida antes do ensino: nunca conta para o
  // critério. Sem esta exclusão, três linhas de base boas "atingiriam" um
  // critério que o ensino nem começou a perseguir.
  const entries = acquisitionSessions(program.id, allSessions)
    .filter((entry) => recordPhase(entry.record) !== 'linha_de_base');
  const minimum = criteria.minimumPercentage ?? 0;

  // Teto de ajuda: a sessão que usou ajuda mais intrusiva do que o programa
  // permite não conta para o critério, por melhor que tenha sido o percentual.
  // É o "sem ajuda física" que os critérios escritos trazem e que o cálculo
  // ignorava enquanto o campo era só texto.
  const ceiling = program.promptCeiling
    ? promptLevelOf(program.promptCeiling)?.intrusiveness ?? null
    : null;
  const withinCeiling = (record) => ceiling == null || record.trials.every((trial) => {
    if (trial === null || EXCLUDED_FROM_DENOMINATOR.includes(trial)) return true;
    const level = promptLevelOf(trial);
    return level == null || level.intrusiveness <= ceiling;
  });

  const perSession = entries.map((entry) => {
    const breakdown = acquisitionBreakdown([entry.record]);
    const seconds = acquisitionTimeStats([entry.record]);
    const value = breakdown.independencePercentage;
    return {
      session: entry.session,
      value,
      maxSeconds: seconds.maximum,
      withinCeiling: withinCeiling(entry.record),
      qualifies: value != null
        && value >= minimum
        && withinCeiling(entry.record)
        && (!criteria.minimumSeconds || (seconds.maximum ?? 0) >= criteria.minimumSeconds),
    };
  });

  let consecutive = 0;
  let bestConsecutive = 0;
  let sessionsUntilCriterion = null;
  perSession.forEach((entry, index) => {
    consecutive = entry.qualifies ? consecutive + 1 : 0;
    bestConsecutive = Math.max(bestConsecutive, consecutive);
    if (sessionsUntilCriterion == null && consecutive >= (criteria.requiredSessions || 1)) {
      sessionsUntilCriterion = index + 1;
    }
  });

  const qualifying = perSession.filter((entry) => entry.qualifies);
  const environments = [...new Set(qualifying.map((entry) => entry.session.location).filter(Boolean))];
  const therapists = [...new Set(qualifying.map((entry) => entry.session.therapistId).filter(Boolean))];

  // Maior sequência de respostas independentes, atravessando sessões.
  let streak = 0;
  let bestStreak = 0;
  for (const entry of entries) {
    for (const trial of entry.record.trials) {
      if (trial === null || EXCLUDED_FROM_DENOMINATOR.includes(trial)) continue;
      streak = trial === 'independente' ? streak + 1 : 0;
      bestStreak = Math.max(bestStreak, streak);
    }
  }

  const maxSeconds = perSession.reduce (
    (best, entry) => entry.maxSeconds == null ? best : Math.max(best ?? 0, entry.maxSeconds),
    null,
  );

  const requiredSessions = criteria.requiredSessions || 1;
  const achievedSessions = criteria.sessionsMustBeConsecutive ? bestConsecutive : qualifying.length;
  const pending = [];
  if (achievedSessions < requiredSessions) {
    pending.push(`${achievedSessions} de ${requiredSessions} sessões${criteria.sessionsMustBeConsecutive ? ' consecutivas' : ''} com ${minimum}%`);
  }
  if (criteria.consecutiveIndependent && bestStreak < criteria.consecutiveIndependent) {
    pending.push(`${bestStreak} de ${criteria.consecutiveIndependent} respostas independentes consecutivas`);
  }
  if (criteria.requiredEnvironments && environments.length < criteria.requiredEnvironments) {
    pending.push(`${environments.length} de ${criteria.requiredEnvironments} ambientes`);
  }
  if (criteria.requiredTherapists && therapists.length < criteria.requiredTherapists) {
    pending.push(`${therapists.length} de ${criteria.requiredTherapists} terapeutas`);
  }
  if (criteria.minimumSeconds && (maxSeconds ?? 0) < criteria.minimumSeconds) {
    pending.push(`${maxSeconds ?? 0}s de ${criteria.minimumSeconds}s exigidos`);
  }
  const aboveCeiling = perSession.filter((entry) => !entry.withinCeiling).length;
  if (ceiling != null && aboveCeiling > 0) {
    pending.push(
      `${plural(aboveCeiling, 'sessão', 'sessões')} com ajuda acima de ${promptLevelOf(program.promptCeiling)?.label ?? 'teto'}`,
    );
  }

  return {
    met: entries.length > 0 && pending.length === 0,
    qualifyingSessions: qualifying.length,
    consecutiveSessions: bestConsecutive,
    requiredSessions,
    environments,
    therapists,
    longestIndependentStreak: bestStreak,
    maxSeconds,
    sessionsUntilCriterion,
    pending,
  };
}

/**
 * Para que lado é melhorar. Programas antigos não têm o campo: aquisição sobe,
 * redução desce — que era a suposição embutida antes de o campo existir.
 */
export const programDirection = (program) =>
  program.goalDirection ?? (program.type === 'aquisicao' ? 'aumentar' : 'reduzir');

/**
 * Independência etapa a etapa numa análise de tarefas (documento de técnicas,
 * §3). O índice da etapa é o índice da tentativa: a ficha grava uma linha por
 * etapa, então basta ler a mesma coluna ao longo das sessões.
 *
 * É a única pergunta que um encadeamento faz — "em qual etapa ela trava" — e um
 * percentual único do programa inteiro justamente esconde a resposta.
 */
export function taskStepIndependence(
  program,
  allSessions,
) {
  const steps = program.taskSteps ?? [];
  if (!steps.length) return [];
  const entries = acquisitionSessions(program.id, allSessions);

  return steps.map((label, index) => {
    let independent = 0;
    let prompted = 0;
    let errors = 0;
    let scored = 0;
    for (const entry of entries) {
      const trial = entry.record.trials[index];
      if (trial == null || EXCLUDED_FROM_DENOMINATOR.includes(trial)) continue;
      scored += 1;
      if (trial === 'independente') independent += 1;
      else if (PROMPT_RESPONSES.includes(trial)) prompted += 1;
      else if (trial === 'erro' || trial === 'sem_resposta') errors += 1;
    }

    const latest = [...entries].reverse().find((entry) => {
      const trial = entry.record.trials[index];
      return trial != null && !EXCLUDED_FROM_DENOMINATOR.includes(trial);
    });

    return {
      index,
      label,
      independent,
      prompted,
      errors,
      scored,
      percentage: percentage(independent, scored),
      latestPercentage: latest
        ? (latest.record.trials[index] === 'independente' ? 100 : 0)
        : null,
    };
  });
}

/** Percentual de cada nível de ajuda por sessão (gráfico "Ajuda", seção 11). */
export function promptDistributionSeries(
  programId,
  allSessions,
) {
  return acquisitionSessions(programId, allSessions).map((entry) => {
    const breakdown = acquisitionBreakdown([entry.record]);
    const share = (response) => breakdown.scored === 0
      ? null
      : Math.round(((response === 'independente'
        ? breakdown.independent
        : breakdown.promptCounts[response] ?? 0) / breakdown.scored) * 100);
    return {
      date: chartDay(entry.session.date),
      fullDate: entry.session.date,
      independente: share('independente'),
      ajuda_visual: share('ajuda_visual'),
      ajuda_gestual: share('ajuda_gestual'),
      ajuda_verbal: share('ajuda_verbal'),
      modelacao: share('modelacao'),
      fisica_parcial: share('fisica_parcial'),
      fisica_total: share('fisica_total'),
    };
  });
}

/** Série de segundos alcançados por sessão (gráfico de Espera, seção 11). */
export function programTimeSeries(programId, allSessions) {
  return acquisitionSessions(programId, allSessions)
    .map((entry) => {
      const stats = acquisitionTimeStats([entry.record]);
      return {
        date: chartDay(entry.session.date),
        fullDate: entry.session.date,
        maximum: stats.maximum,
        average: stats.average,
      };
    })
    .filter((point) => point.maximum != null);
}

/**
 * Comparação de generalização (seções 10 e 11): desempenho por ambiente, por
 * pessoa, por material e entre ensino e sonda de generalização.
 */
export function generalizationComparison(
  programId,
  allSessions,
  professionalName,
) {
  const entries = acquisitionSessions(programId, allSessions);
  const group = (
    kind,
    keyOf,
  ) => {
    const buckets = new Map ();
    for (const entry of entries) {
      const key = keyOf(entry) || 'Não informado';
      buckets.set(key, [...(buckets.get(key) ?? []), entry.record]);
    }
    return [...buckets.entries()].map(([label, records]) => {
      const breakdown = acquisitionBreakdown(records);
      return {
        label,
        kind,
        independent: breakdown.independent,
        scored: breakdown.scored,
        percentage: breakdown.independencePercentage,
        sessions: records.length,
      };
    });
  };

  // O material só vira linha quando alguma sessão registrou um: antes deste
  // campo existir todas cairiam em "Não informado", que não compara nada.
  const materials = entries.some((entry) => entry.session.material)
    ? group('material', (entry) => entry.session.material ?? '')
    : [];

  return [
    ...group('ambiente', (entry) => entry.session.location),
    ...group('pessoa', (entry) => professionalName(entry.session.therapistId)),
    ...materials,
    // A condição da sonda vem registrada; antes a dimensão era inferida
    // comparando ambiente e material com as sessões de ensino.
    ...group('condição', (entry) => entry.session.isGeneralizationProbe
      ? `Sonda · ${generalizationConditionLabel(entry.session.generalizationCondition)}`
      : 'Ensino'),
  ].sort((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
}

/** Série de um programa de redução, com taxa quando há tempo observado. */
export function reductionSeries(
  programId,
  allSessions,
  intensityScale,
) {
  return allSessions
    .filter((session) => session.status !== 'em_andamento')
    .flatMap((session) => {
      const record = session.records.find(
        (item) => item.type === 'reducao' && item.programId === programId,
      );
      if (record?.type !== 'reducao') return [];
      return [{
        date: chartDay(session.date),
        fullDate: session.date,
        value: record.value,
        observedSeconds: record.observedSeconds,
        rate: record.observedSeconds
          ? Math.round((record.value / (record.observedSeconds / 60)) * 100) / 100
          : null,
        phase: recordPhase(record),
        intensity: record.intensity,
        intensityRank: intensityRank(record.intensity, intensityScale),
      }];
    })
    .sort((left, right) => left.fullDate.localeCompare(right.fullDate));
}

/**
 * Intensidade máxima registrada e em que sessão (seção 9, programas de redução).
 * Trabalha sobre a escala operacional do programa: "máxima" é a posição mais
 * alta da escala, não o maior número.
 */
export function maximumIntensity(points) {
  const ranked = points.filter((point) => point.intensityRank != null);
  if (!ranked.length) return null;
  const worst = ranked.reduce((best, point) =>
    (point.intensityRank) > (best.intensityRank) ? point : best);
  return {
    intensity: worst.intensity,
    rank: worst.intensityRank,
    date: worst.date,
    sessions: ranked.length,
  };
}

/**
 * Duração dos episódios registrados no ABC para um programa de redução. Fica em
 * gráfico separado: frequência, duração e intensidade nunca se misturam em um
 * índice só (seção 11).
 */
export function behaviorDurationSeries(programId, allSessions) {
  return allSessions
    .filter((session) => session.status !== 'em_andamento')
    .flatMap((session) => {
      const events = session.behaviors.filter(
        (event) => event.programId === programId && event.durationSeconds,
      );
      if (!events.length) return [];
      const total = events.reduce((sum, event) => sum + (event.durationSeconds ?? 0), 0);
      return [{
        date: chartDay(session.date),
        fullDate: session.date,
        total,
        average: Math.round(total / events.length),
        episodes: events.length,
      }];
    })
    .sort((left, right) => left.fullDate.localeCompare(right.fullDate));
}

/**
 * Percentual de redução em relação à linha de base **presumida**: compara a
 * média das primeiras sessões com a média das demais.
 *
 * É a saída de emergência para o histórico anterior à marcação de fase. Quando
 * alguma sessão está marcada como linha de base, quem manda é `comparePhases` —
 * ver `reductionPhaseChange`, que escolhe entre os dois e diz qual usou.
 */
export function reductionAgainstBaseline(values, baselineSessions = 3) {
  if (values.length <= baselineSessions) return null;
  const baseline = values.slice(0, baselineSessions);
  const intervention = values.slice(baselineSessions);
  const baselineMean = baseline.reduce((total, value) => total + value, 0) / baseline.length;
  if (baselineMean === 0) return null;
  const interventionMean = intervention.reduce((total, value) => total + value, 0) / intervention.length;
  return {
    baselineMean: Math.round(baselineMean * 10) / 10,
    interventionMean: Math.round(interventionMean * 10) / 10,
    changePercentage: Math.round(((interventionMean - baselineMean) / baselineMean) * 100),
    zeroSessions: intervention.filter((value) => value === 0).length,
  };
}

/**
 * Mudança entre linha de base e intervenção num programa de redução (seções 9 e
 * 10). Usa as fases marcadas na coleta; sem nenhuma sessão marcada como linha de
 * base, cai na estimativa das três primeiras sessões e o diz em `source`, para
 * que a tela nunca apresente um palpite como se fosse dado registrado.
 */
export function reductionPhaseChange(
  points,
  direction = 'reduzir',
) {
  const marked = points.some((point) => point.phase === 'linha_de_base');
  if (marked) {
    const comparison = comparePhases(
      points.map((point) => ({ label: point.date, phase: point.phase, value: point.value })),
      direction,
    );
    if (!comparison.baselinePoints || !comparison.interventionPoints) return null;
    return {
      source: 'fases',
      baselineMean: comparison.baselineMean,
      interventionMean: comparison.interventionMean,
      changePercentage: comparison.meanChangePercentage,
      immediateChange: comparison.immediateChange,
      nonOverlap: comparison.nonOverlap,
      zeroSessions: points.filter((point) => point.phase === 'intervencao' && point.value === 0).length,
      baselinePoints: comparison.baselinePoints,
      interventionPoints: comparison.interventionPoints,
    };
  }

  const estimate = reductionAgainstBaseline(points.map((point) => point.value));
  if (!estimate) return null;
  return {
    source: 'presumida',
    baselineMean: estimate.baselineMean,
    interventionMean: estimate.interventionMean,
    changePercentage: estimate.changePercentage,
    immediateChange: null,
    nonOverlap: null,
    zeroSessions: estimate.zeroSessions,
    baselinePoints: Math.min(3, points.length),
    interventionPoints: Math.max(0, points.length - 3),
  };
}

/**
 * Programa em que o comportamento interferente mais apareceu. O vínculo existe
 * desde sempre (o episódio guarda o programa aberto na hora) e nunca havia sido
 * lido — é o que diz se o problema é do programa ou do dia.
 */
export function behaviorHotspot(
  allSessions,
  programName,
) {
  const counts = new Map ();
  for (const session of allSessions) {
    for (const event of session.behaviors) {
      if (!event.programId) continue;
      counts.set(event.programId, (counts.get(event.programId) ?? 0) + event.quantity);
    }
  }
  const top = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  if (!top) return null;
  return { programId: top[0], name: programName(top[0]), episodes: top[1] };
}

/** Eficiência de cada reforçador (gráfico "Reforçadores", seção 11). */
export function reinforcerEfficiencySummary(
  allSessions,
  reinforcers,
  programId,
) {
  const buckets = new Map ();
  for (const session of allSessions) {
    for (const use of session.reinforcers) {
      // Filtrar por programa só é possível nos registros que têm o vínculo;
      // os anteriores à coluna ficam de fora em vez de poluir a comparação.
      if (programId && use.programId !== programId) continue;
      const bucket = buckets.get(use.reinforcerId)
        ?? { uses: 0, effective: 0, entries: 0, sessions: new Set () };
      bucket.uses += use.uses;
      bucket.entries += 1;
      if (use.efficiency === 'Muito eficiente' || use.efficiency === 'Eficiente') bucket.effective += 1;
      bucket.sessions.add(session.id);
      buckets.set(use.reinforcerId, bucket);
    }
  }
  return [...buckets.entries()]
    .map(([reinforcerId, bucket]) => ({
      reinforcerId,
      name: reinforcers.find((item) => item.id === reinforcerId)?.name ?? 'Reforçador',
      uses: bucket.uses,
      effectivePercentage: percentage(bucket.effective, bucket.entries),
      sessions: bucket.sessions.size,
    }))
    .sort((left, right) => (right.effectivePercentage ?? -1) - (left.effectivePercentage ?? -1));
}

const INTENSITY_ORDER = ['Leve', 'Moderada', 'Alta'];

/**
 * Resumo automático da finalização (seção 14 do modelo da ficha). Só consolida o
 * que foi registrado; nada aqui é estimado ou completado pelo sistema.
 */
export function summarizeSession(
  session,
  allPrograms,
  allReinforcers,
  allBehaviors,
) {
  const endAt = session.endAt ?? Date.now();
  const pausedMs = session.pauses.reduce(
    (total, pause) => total + ((pause.endAt ?? endAt) - pause.startAt), 0,
  );

  const programs = session.records.map((record) => {
    const program = allPrograms.find((item) => item.id === record.programId);
    const name = program?.name ?? 'Programa';
    if (record.type === 'reducao') {
      return {
        programId: record.programId, name, type: 'reducao',
        plannedTrials: 0, filledTrials: 0,
        correctPercentage: null, independencePercentage: null, maxSeconds: null,
        value: record.value,
        unit: program?.type === 'reducao' ? program.unit : undefined,
      };
    }
    const breakdown = acquisitionBreakdown([record]);
    const time = acquisitionTimeStats([record]);
    return {
      programId: record.programId, name, type: 'aquisicao',
      plannedTrials: record.trials.length,
      filledTrials: record.trials.filter((trial) => trial !== null).length,
      correctPercentage: breakdown.correctPercentage,
      independencePercentage: breakdown.independencePercentage,
      maxSeconds: time.maximum,
    };
  });

  const acquisitionRecords = session.records.filter(
    (record) => record.type === 'aquisicao',
  );
  const overall = acquisitionBreakdown(acquisitionRecords);
  const overallTime = acquisitionTimeStats(acquisitionRecords);

  const antecedents = new Map ();
  for (const event of session.behaviors) {
    const key = event.antecedent.trim();
    if (key) antecedents.set(key, (antecedents.get(key) ?? 0) + 1);
  }
  const topAntecedent = [...antecedents.entries()]
    .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  const maxIntensity = session.behaviors
    .map((event) => event.intensity)
    .filter(Boolean)
    .sort((left, right) => INTENSITY_ORDER.indexOf(right) - INTENSITY_ORDER.indexOf(left))[0] ?? null;

  const missing = [];
  for (const program of programs) {
    if (program.type === 'aquisicao' && program.filledTrials < program.plannedTrials) {
      missing.push(`${program.name}: ${plural(program.plannedTrials - program.filledTrials, 'tentativa', 'tentativas')} sem registro`);
    }
  }
  if (!session.reinforcers.length) missing.push('Nenhum reforçador registrado');
  if (!session.notes.trim()) missing.push('Observação da sessão em branco');
  if (!session.healthCondition) missing.push('Condição de saúde não informada');
  if (!session.apparentMotivation) missing.push('Motivação aparente não informada');

  return {
    durationMinutes: Math.max(0, Math.round((endAt - session.startAt) / 60000)),
    pausedMinutes: Math.round(pausedMs / 60000),
    programs,
    plannedTrials: programs.reduce((total, program) => total + program.plannedTrials, 0),
    filledTrials: programs.reduce((total, program) => total + program.filledTrials, 0),
    correctPercentage: overall.correctPercentage,
    independencePercentage: overall.independencePercentage,
    maxSeconds: overallTime.maximum,
    behaviors: {
      episodes: session.behaviors.reduce((total, event) => total + event.quantity, 0),
      totalDurationSeconds: session.behaviors.reduce((total, event) => total + (event.durationSeconds ?? 0), 0),
      maxIntensity,
      topAntecedent,
      names: [...new Set(session.behaviors.map((event) =>
        allBehaviors.find((item) => item.id === event.behaviorId)?.name ?? 'comportamento'))],
    },
    reinforcers: session.reinforcers.map((use) => ({
      name: allReinforcers.find((item) => item.id === use.reinforcerId)?.name ?? 'Reforçador',
      uses: use.uses,
      efficiency: use.efficiency,
    })),
    incidents: session.incidents.length,
    isGeneralizationProbe: session.isGeneralizationProbe,
    missing,
  };
}

/**
 * Observação clínica automatizada (seção 15). Escreve apenas sobre o que foi
 * registrado: cada frase depende de um dado existir, e nenhuma conclusão
 * clínica é inferida. O terapeuta confirma ou complementa antes de salvar.
 */
export function sessionNarrative(summary) {
  const sentences = [];

  const acquisition = summary.programs.filter((program) => program.type === 'aquisicao');
  if (acquisition.length && summary.filledTrials > 0) {
    const names = acquisition.map((program) => program.name).join(', ');
    sentences.push(
      `Foram registradas ${summary.filledTrials} de ${summary.plannedTrials} oportunidades previstas em ${names}.`,
    );
    if (summary.correctPercentage != null && summary.independencePercentage != null) {
      sentences.push(
        `O desempenho foi de ${summary.correctPercentage}% de acerto e ${summary.independencePercentage}% de independência.`,
      );
    }
    if (summary.maxSeconds != null) {
      sentences.push(`O maior tempo alcançado foi de ${summary.maxSeconds} segundos.`);
    }
  }

  for (const program of summary.programs.filter((item) => item.type === 'reducao')) {
    sentences.push(`Em ${program.name} foram registradas ${program.value ?? 0} ${program.unit ?? 'ocorrências'}.`);
  }

  if (summary.behaviors.episodes > 0) {
    const parts = [`Foram registrados ${plural(summary.behaviors.episodes, 'episódio', 'episódios')} de ${summary.behaviors.names.join(', ')}`];
    if (summary.behaviors.maxIntensity) parts.push(`intensidade máxima ${summary.behaviors.maxIntensity.toLowerCase()}`);
    if (summary.behaviors.totalDurationSeconds > 0) parts.push(`duração total de ${summary.behaviors.totalDurationSeconds} segundos`);
    if (summary.behaviors.topAntecedent) parts.push(`antecedente mais frequente: ${summary.behaviors.topAntecedent}`);
    sentences.push(`${parts.join(', ')}.`);
  }

  for (const reinforcer of summary.reinforcers) {
    sentences.push(`O reforçador "${reinforcer.name}" foi apresentado ${plural(reinforcer.uses, 'vez', 'vezes')} e classificado como ${reinforcer.efficiency.toLowerCase()}.`);
  }

  if (summary.isGeneralizationProbe) {
    sentences.push('A sessão foi conduzida como sonda de generalização.');
  }
  if (summary.incidents > 0) {
    sentences.push(summary.incidents === 1
      ? 'Foi registrada 1 situação de risco, encaminhada para revisão da supervisão.'
      : `Foram registradas ${summary.incidents} situações de risco, encaminhadas para revisão da supervisão.`);
  }

  sentences.push(`A sessão durou ${plural(summary.durationMinutes, 'minuto', 'minutos')}${summary.pausedMinutes > 0 ? `, com ${plural(summary.pausedMinutes, 'minuto', 'minutos')} de pausa` : ''}.`);

  return sentences.join(' ');
}

/**
 * Integridade do registro do terapeuta (seção 11): percentual de tentativas e
 * campos preenchidos nas sessões avaliadas.
 */
export function recordIntegrity(allSessions) {
  let slots = 0;
  let filled = 0;
  let contextFields = 0;
  let contextFilled = 0;
  for (const session of allSessions) {
    for (const record of session.records) {
      if (record.type !== 'aquisicao') continue;
      slots += record.trials.length;
      filled += record.trials.filter((trial) => trial !== null).length;
    }
    const context = [
      session.arrivalState, session.location, session.healthCondition,
      session.routineChange, session.apparentMotivation, session.notes,
    ];
    contextFields += context.length;
    contextFilled += context.filter((value) => Boolean(value && value.trim())).length;
  }
  return {
    trialPercentage: percentage(filled, slots),
    contextPercentage: percentage(contextFilled, contextFields),
    slots,
    filled,
  };
}

export function reductionLatestValue(programId, allSessions) {
  const records = allSessions
    .flatMap((session) => {
      const record = session.records.find(
        (item) => item.type === 'reducao' && item.programId === programId,
      );
      return record?.type === 'reducao'
        ? [{ date: session.date, value: record.value }]
        : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return records.at(-1) ?? null;
}

/**
 * Qual plano do paciente manda. Espelha o `save_program_to_patient_plan`: entre
 * os planos abertos (rascunho, ativo ou pausado) vale o mais recente; se todos
 * estiverem fechados, mostra o mais recente só para a tela ter o que exibir.
 *
 * Importa porque um paciente acumula planos: ao concluir um plano, o próximo
 * programa salvo cria outro. E `createdAt` chega só com a data — dois planos do
 * mesmo dia empatavam e a escolha ficava ao acaso da ordem do banco.
 */
export function activePatientPlan (
  plans,
  patientId,
) {
  const ofPatient = plans
    .filter((plan) => plan.patientId === patientId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return ofPatient.find((plan) => ['Rascunho', 'Ativo', 'Pausado'].includes(plan.status))
    ?? ofPatient[0];
}

/**
 * Programas que podem ser coletados numa sessão do paciente, e — quando não há
 * nenhum — a razão que o terapeuta precisa ler para destravar a coleta.
 *
 * São quatro portões: o programa é do paciente, o plano está ativo, o programa
 * pertence à versão ativa do plano e o status permite coleta. Ficam juntos na
 * mesma função de propósito: a lista e a explicação não podem se desencontrar.
 */
export function sessionProgramAvailability(
  programs,
  patientId,
  plan,
) {
  const ofPatient = programs.filter((program) => program.patientId === patientId);
  const available = ofPatient.filter((program) =>
    (!plan || plan.status === 'Ativo')
    && (!plan?.activeVersionId || program.planVersionId === plan.activeVersionId)
    && !NOT_COLLECTABLE_STATUSES.includes(program.status));

  if (available.length) return { available, reason: null };

  if (!ofPatient.length) {
    return {
      available,
      reason: 'Este paciente ainda não tem programas cadastrados. Crie os programas na aba Programas.',
    };
  }
  if (plan && plan.status !== 'Ativo') {
    return {
      available,
      reason: `O plano deste paciente está em "${plan.status}". Ative o plano para liberar a coleta.`,
    };
  }
  const inActiveVersion = plan?.activeVersionId
    ? ofPatient.filter((program) => program.planVersionId === plan.activeVersionId)
    : ofPatient;
  if (!inActiveVersion.length) {
    return {
      available,
      reason: 'Os programas cadastrados são de uma versão anterior do plano. Só os da versão ativa entram na coleta.',
    };
  }
  const statuses = [...new Set(inActiveVersion.map((program) => program.status))].join(', ');
  return {
    available,
    reason: `Nenhum programa está em status de coleta (hoje: ${statuses}). "Pausado", "Concluído" e "Extinto" ficam de fora — reative o programa na aba Programas.`,
  };
}
