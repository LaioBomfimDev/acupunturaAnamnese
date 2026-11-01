// ============================================================
// Relatório ABA do paciente (PDF timbrado e planilha .xlsx). Um modelo só,
// montado a partir dos mesmos cálculos da tela de Resultados, para o
// papel nunca mostrar número diferente da tela. Trazido do Atlas
// (reports.ts exportResultsReport / exportDataCollectionXlsx), sem o
// desenho da ficha de papel da Integrare.
// ============================================================

import {
  acquisitionBreakdown,
  evaluateProgression,
  programIndependence,
  programSeries,
  reductionSeries,
} from './calculations.js';
import { phaseLabel } from './catalog.js';
import { responseColumnLabel, reviewStatusLabel, sessionStatusLabel } from './labels.js';
import { ioaMethod, summarizeFidelity, summarizeIoa } from './quality.js';
import { XLSX_STYLE, buildXlsx, columnName, columnRef } from './xlsx.js';

const dateBR = isoDate => (isoDate ? new Date(`${isoDate}T12:00:00`).toLocaleDateString('pt-BR') : '—');
const percentText = value => (value == null ? '—' : `${value}%`);

/** Critério em uma frase (o texto do plano, ou o que a configuração diz). */
export function criterionText(program) {
  if (program.type === 'reducao') return program.reductionCriterion || program.criterion || '—';
  if (program.criterion) return program.criterion;
  const criteria = program.criteria || {};
  const sessions = criteria.requiredSessions || 1;
  return `${criteria.minimumPercentage ?? 80}% de independência em ${sessions === 1 ? '1 sessão' : `${sessions} sessões`}${criteria.sessionsMustBeConsecutive ? ' seguidas' : ''}`;
}

/**
 * sessions: as sessões finalizadas do período (o filtro da tela de
 * Resultados). allSessions: todas as finalizadas — o critério olha o
 * histórico inteiro, como na tela.
 */
export function buildAbaReport({ patient, data, sessions, periodLabel, generatedBy = '', clinicName = '' }) {
  const ordered = [...sessions].sort((left, right) => left.date.localeCompare(right.date) || (left.startAt || 0) - (right.startAt || 0));
  const allSessions = data.sessions.filter(session => session.status !== 'em_andamento');
  const programs = data.programs.filter(program => !program.archivedAt);
  const programName = id => data.programs.find(program => program.id === id)?.name || 'Programa';
  const sessionIds = new Set(ordered.map(session => session.id));

  const acquisitionRecords = ordered.flatMap(session => session.records.filter(record => record.type === 'aquisicao'));
  const overall = acquisitionBreakdown(acquisitionRecords);

  const acquisition = programs
    .filter(program => program.type === 'aquisicao')
    .map(program => {
      const stats = programIndependence(program.id, ordered);
      const series = programSeries(program.id, ordered);
      return {
        program,
        name: program.name,
        status: program.status,
        sessions: series.length,
        independent: stats.independent,
        filled: stats.filled,
        percentage: stats.percentage,
        criterion: criterionText(program),
        minimum: program.criteria?.minimumPercentage ?? 0,
        met: evaluateProgression(program, allSessions).met,
        series,
      };
    });

  const reduction = programs
    .filter(program => program.type === 'reducao')
    .map(program => {
      const series = reductionSeries(program.id, ordered, program.intensityScale);
      return {
        program,
        name: program.name,
        status: program.status,
        measure: program.measure,
        unit: program.unit,
        sessions: series.length,
        last: series.at(-1)?.value ?? null,
        criterion: criterionText(program),
        series,
      };
    });

  const sessionRows = ordered.map(session => ({
    id: session.id,
    date: session.date,
    therapist: data.professionalName(session.therapistId),
    location: session.location,
    programs: session.records.length,
    status: sessionStatusLabel(session.status),
    review: reviewStatusLabel(session.reviewStatus),
    incidents: session.incidents.length,
  }));

  const trialRows = ordered.flatMap(session => session.records
    .filter(record => record.type === 'aquisicao')
    .flatMap(record => record.trials.map((response, index) => ({
      date: session.date,
      program: programName(record.programId),
      phase: phaseLabel(record.phase),
      trial: index + 1,
      response: response ? responseColumnLabel(response) : '',
      seconds: record.trialSeconds?.[index] ?? null,
    }))));

  const reductionRows = ordered.flatMap(session => session.records
    .filter(record => record.type === 'reducao')
    .map(record => {
      const program = data.programs.find(item => item.id === record.programId);
      return {
        date: session.date,
        program: program?.name || 'Programa',
        phase: phaseLabel(record.phase),
        value: record.value,
        unit: program?.unit || '',
        intensity: record.intensity || '',
      };
    }));

  const fidelity = data.fidelity.filter(entry => sessionIds.has(entry.sessionId));
  const fidelityRows = ordered
    .map(session => {
      const self = fidelity.find(entry => entry.sessionId === session.id && entry.source === 'autoavaliacao');
      const supervision = fidelity.find(entry => entry.sessionId === session.id && entry.source === 'supervisao');
      return {
        date: session.date,
        therapist: data.professionalName(session.therapistId),
        self: self ? Math.round(self.scorePercentage) : null,
        supervision: supervision ? Math.round(supervision.scorePercentage) : null,
      };
    })
    .filter(row => row.self != null || row.supervision != null);

  const firstDate = ordered[0]?.date || null;
  // IOA do período: a partir da primeira sessão (o registro pode vir dias
  // depois da última coleta, quando o segundo observador entrega a folha).
  const ioa = data.ioa.filter(record => !firstDate || record.observedOn >= firstDate);
  const ioaRows = [...ioa]
    .sort((left, right) => left.observedOn.localeCompare(right.observedOn))
    .map(record => ({
      date: record.observedOn,
      method: ioaMethod(record.method).label,
      program: record.programId ? programName(record.programId) : '',
      primary: record.primaryValue,
      secondary: record.secondaryValue,
      agreement: Math.round(record.agreementPercentage),
    }));

  return {
    patientName: patient?.name || 'Paciente',
    clinicName,
    generatedBy,
    generatedAt: new Date(),
    periodLabel,
    team: data.team ? `${data.team.name} · supervisão ${data.professionalName(data.team.supervisorId)}` : 'Sem time',
    sessionCount: ordered.length,
    overall,
    acquisition,
    reduction,
    sessionRows,
    trialRows,
    reductionRows,
    fidelityRows,
    fidelitySummary: summarizeFidelity(fidelity),
    ioaRows,
    ioaSummary: summarizeIoa(ioa),
  };
}

// ---------- planilha ----------

const header = labels => labels.map(label => ({ v: label, style: 'header' }));
const PALETTE = ['3F5F3A', '2F6690', 'B5651D', '7A4E9C', '1F7A7A', '8C3B3B'];

function summarySheet(report) {
  const rows = [
    [{ v: `Relatório ABA — ${report.patientName}`, style: 'title' }],
    [{ v: `${report.clinicName ? `${report.clinicName} · ` : ''}Gerado em ${report.generatedAt.toLocaleString('pt-BR')}${report.generatedBy ? ` por ${report.generatedBy}` : ''}`, style: 'muted' }],
    [],
    [{ v: 'Paciente', style: 'bold' }, report.patientName],
    [{ v: 'Time', style: 'bold' }, report.team],
    [{ v: 'Período', style: 'bold' }, report.periodLabel],
    [{ v: 'Sessões no período', style: 'bold' }, report.sessionCount],
    [{ v: 'Independência no período', style: 'bold' }, percentText(report.overall.independencePercentage),
      { v: `${report.overall.independent} independentes ÷ ${report.overall.scored} tentativas pontuáveis`, style: 'muted' }],
    [{ v: 'Fidelidade da supervisão (média)', style: 'bold' }, percentText(report.fidelitySummary.supervisionMean)],
    [{ v: 'Concordância entre observadores (média)', style: 'bold' }, percentText(report.ioaSummary.mean)],
    [],
    header(['Programa', 'Tipo', 'Fase/status', 'Sessões no período', 'Resultado no período', 'Critério', 'Critério atingido']),
  ];
  for (const item of report.acquisition) {
    rows.push([
      { v: item.name, style: 'wrap' }, 'Aquisição', item.status, item.sessions,
      item.percentage == null ? '—' : `${item.percentage}% (${item.independent}/${item.filled})`,
      { v: item.criterion, style: 'wrap' }, item.met ? 'Sim, aguarda a supervisão' : 'Não',
    ]);
  }
  for (const item of report.reduction) {
    rows.push([
      { v: item.name, style: 'wrap' }, `Redução · ${item.measure}`, item.status, item.sessions,
      item.last == null ? '—' : `Último: ${item.last} ${item.unit}`,
      { v: item.criterion, style: 'wrap' }, '—',
    ]);
  }
  rows.push([]);
  rows.push([{ v: 'Independência = respostas independentes ÷ tentativas preenchidas. Recusa e não aplicável ficam registradas e fora da conta; não é média entre sessões.', style: 'muted' }]);
  return {
    name: 'Resumo',
    columns: [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 12 }, { width: 24 }, { width: 40 }, { width: 22 }],
    rows,
    merges: ['A1:G1', 'A2:G2'],
  };
}

/**
 * Aba de gráficos: uma linha por sessão do período e, por programa, a
 * coluna de valores (+ a do critério na aquisição). Cada gráfico lê as
 * próprias colunas — mexeu no número, a linha acompanha.
 */
function chartsSheet(report) {
  const name = 'Gráficos';
  const dates = [...new Set([
    ...report.acquisition.flatMap(item => item.series.map(point => point.fullDate)),
    ...report.reduction.flatMap(item => item.series.map(point => point.fullDate)),
  ])].sort();
  if (!dates.length) return null;

  const columns = [{ width: 12 }];
  const head = [{ v: 'Sessão', style: 'header' }];
  const blocks = [];
  let column = 1;
  for (const item of report.acquisition.filter(entry => entry.series.length)) {
    blocks.push({ kind: 'aquisicao', item, valueColumn: column, criterionColumn: column + 1 });
    head.push({ v: `${item.name} (%)`, style: 'header' }, { v: `Critério ${item.name}`, style: 'header' });
    columns.push({ width: 18 }, { width: 14 });
    column += 2;
  }
  for (const item of report.reduction.filter(entry => entry.series.length)) {
    blocks.push({ kind: 'reducao', item, valueColumn: column });
    head.push({ v: `${item.name} (${item.unit})`, style: 'header' });
    columns.push({ width: 18 });
    column += 1;
  }

  // Mesmo dia com duas sessões: a última do dia (o gráfico da tela faz igual).
  const valueAt = (series, date, key) => {
    const points = series.filter(point => point.fullDate === date);
    const point = points.at(-1);
    return point ? point[key] ?? null : null;
  };

  const rows = [head];
  for (const date of dates) {
    const row = [dateBR(date)];
    for (const block of blocks) {
      if (block.kind === 'aquisicao') {
        row[block.valueColumn] = valueAt(block.item.series, date, 'percentage');
        row[block.criterionColumn] = block.item.minimum || null;
      } else {
        row[block.valueColumn] = valueAt(block.item.series, date, 'value');
      }
    }
    rows.push(row);
  }

  const firstRow = 2;
  const lastRow = dates.length + 1;
  const labels = dates.map(dateBR);
  const chartLeft = column + 1;
  const charts = blocks.map((block, index) => {
    const values = rows.slice(1).map(row => row[block.valueColumn] ?? null);
    const series = [{
      name: block.kind === 'aquisicao' ? 'Independência' : block.item.unit || 'Registro',
      ref: columnRef(name, block.valueColumn, firstRow, lastRow),
      values,
      color: PALETTE[index % PALETTE.length],
    }];
    if (block.kind === 'aquisicao' && block.item.minimum) {
      series.push({
        name: `Critério ${block.item.minimum}%`,
        ref: columnRef(name, block.criterionColumn, firstRow, lastRow),
        values: rows.slice(1).map(row => row[block.criterionColumn] ?? null),
        color: '9AA59A',
        dashed: true,
      });
    }
    return {
      title: block.kind === 'aquisicao' ? `Independência por sessão — ${block.item.name}` : `Registro por sessão — ${block.item.name}`,
      categories: { ref: columnRef(name, 0, firstRow, lastRow), labels },
      series,
      numberFormat: block.kind === 'aquisicao' ? '0"%"' : '0',
      maximum: block.kind === 'aquisicao' ? 100 : undefined,
      anchor: { fromCol: chartLeft, fromRow: index * 16, toCol: chartLeft + 9, toRow: index * 16 + 15 },
    };
  });

  return { name, columns, rows, freezeRow: 1, charts };
}

export function buildAbaWorkbook(report) {
  const sheets = [summarySheet(report)];
  const charts = chartsSheet(report);
  if (charts) sheets.push(charts);
  sheets.push({
    name: 'Sessões',
    columns: [{ width: 12 }, { width: 26 }, { width: 14 }, { width: 11 }, { width: 14 }, { width: 22 }, { width: 10 }],
    freezeRow: 1,
    rows: [
      header(['Data', 'Terapeuta', 'Local', 'Programas', 'Situação', 'Revisão', 'Riscos']),
      ...report.sessionRows.map(row => [dateBR(row.date), row.therapist, row.location, row.programs, row.status, row.review, row.incidents]),
    ],
  });
  sheets.push({
    name: 'Tentativas',
    columns: [{ width: 12 }, { width: 30 }, { width: 16 }, { width: 10 }, { width: 24 }, { width: 10 }],
    freezeRow: 1,
    rows: [
      header(['Data', 'Programa', 'Fase', 'Tentativa', 'Resposta', 'Segundos']),
      ...report.trialRows.map(row => [dateBR(row.date), row.program, row.phase, row.trial, row.response || { v: 'Em branco', style: 'muted' }, row.seconds]),
    ],
  });
  if (report.reductionRows.length) {
    sheets.push({
      name: 'Redução',
      columns: [{ width: 12 }, { width: 30 }, { width: 16 }, { width: 10 }, { width: 16 }, { width: 16 }],
      freezeRow: 1,
      rows: [
        header(['Data', 'Programa', 'Fase', 'Valor', 'Unidade', 'Intensidade']),
        ...report.reductionRows.map(row => [dateBR(row.date), row.program, row.phase, row.value, row.unit, row.intensity]),
      ],
    });
  }
  sheets.push({
    name: 'Qualidade',
    columns: [{ width: 12 }, { width: 26 }, { width: 24 }, { width: 18 }, { width: 18 }, { width: 14 }],
    rows: [
      [{ v: 'Fidelidade de aplicação (%)', style: 'title' }],
      header(['Data', 'Terapeuta', 'Autoavaliação', 'Supervisão']),
      ...(report.fidelityRows.length
        ? report.fidelityRows.map(row => [dateBR(row.date), row.therapist, row.self, row.supervision])
        : [[{ v: 'Nenhuma fidelidade registrada no período.', style: 'muted' }]]),
      [],
      [{ v: 'Concordância entre observadores (IOA)', style: 'title' }],
      header(['Data', 'Método', 'Programa', 'Valor A / acordos', 'Valor B / total', 'Concordância (%)']),
      ...(report.ioaRows.length
        ? report.ioaRows.map(row => [dateBR(row.date), row.method, row.program, row.primary, row.secondary, row.agreement])
        : [[{ v: 'Nenhum registro de concordância no período.', style: 'muted' }]]),
    ],
  });
  return buildXlsx({ sheets, creator: report.clinicName || 'Vitalis', date: report.generatedAt });
}

/** Nome de arquivo sem acento nem espaço: relatorio-aba-joao-pedro-2026-10-31. */
export function reportFileName(patientName, extension, date = new Date()) {
  const slug = String(patientName || 'paciente')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'paciente';
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `relatorio-aba-${slug}-${day}.${extension}`;
}

export { XLSX_STYLE, columnName };
