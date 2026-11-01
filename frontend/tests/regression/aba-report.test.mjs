// ============================================================
// Relatório ABA (PDF/Excel, 31/10/2026). A planilha é gerada sem
// biblioteca (utils/aba/xlsx.js), então o teste abre o zip de volta e
// confere o que o Excel exige: CRC de cada parte, tipos de conteúdo,
// abas, gráfico ligado às células, texto como inlineStr (nada vira
// fórmula). O modelo do relatório usa os mesmos números da tela.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAbaReport, buildAbaWorkbook, criterionText, reportFileName } from '../../src/utils/aba/report.js';
import { buildXlsx, columnName, columnRef, crc32, escapeXml, sheetName } from '../../src/utils/aba/xlsx.js';

/** Lê um zip "stored": nome → texto, checando o CRC de cada entrada. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map();
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034B50) {
    assert.equal(view.getUint16(offset + 8, true), 0, 'sem compressão');
    const crc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    const data = bytes.subarray(offset + 30 + nameLength, offset + 30 + nameLength + size);
    assert.equal(crc32(data), crc, `CRC de ${name}`);
    files.set(name, decoder.decode(data));
    offset += 30 + nameLength + size;
  }
  assert.equal(view.getUint32(offset, true), 0x02014B50, 'diretório central logo após as entradas');
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054B50, 'fim do diretório');
  assert.equal(view.getUint16(end + 10, true), files.size, 'contagem de entradas');
  return files;
}

// XML bem formado o bastante para o Excel: tags abrem e fecham na ordem.
function assertBalancedXml(xml, name) {
  assert.ok(xml.startsWith('<?xml'), `${name}: cabeçalho XML`);
  const stack = [];
  for (const match of xml.replace(/<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) assert.equal(stack.pop(), tag, `${name}: </${tag}> fora de ordem`);
    else stack.push(tag);
  }
  assert.equal(stack.length, 0, `${name}: tags abertas ${stack.join(',')}`);
}

test('crc32 e nomes de coluna', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  assert.deepEqual([0, 25, 26, 27, 701, 702].map(columnName), ['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  assert.equal(columnRef("João's", 1, 2, 9), "'João''s'!$B$2:$B$9");
  assert.equal(sheetName('a/b:c*d?e[f]'), 'a b c d e f');
  assert.equal(sheetName('x'.repeat(40)).length, 31);
  assert.equal(escapeXml('a<b>&"c"\u0001'), 'a&lt;b&gt;&amp;&quot;c&quot;');
});

test('planilha mínima abre como xlsx válido', () => {
  const bytes = buildXlsx({
    date: new Date('2026-10-31T12:00:00Z'),
    sheets: [
      { name: 'Dados', columns: [{ width: 10 }], rows: [[{ v: 'Título', style: 'title' }], ['=HYPERLINK("x")', 3.5, null, '']], merges: ['A1:C1'], freezeRow: 1 },
      { name: 'Dados', rows: [['repetido']] },
    ],
  });
  const files = unzip(bytes);
  for (const part of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'docProps/core.xml']) {
    assert.ok(files.has(part), part);
    assertBalancedXml(files.get(part), part);
  }
  const sheet = files.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">=HYPERLINK\(&quot;x&quot;\)<\/t><\/is><\/c>/, 'texto com "=" fica texto');
  assert.doesNotMatch(sheet, /<f>/, 'nenhuma fórmula');
  assert.match(sheet, /<c r="B2"><v>3.5<\/v><\/c>/);
  assert.match(sheet, /<mergeCell ref="A1:C1"\/>/);
  assert.match(sheet, /state="frozen"/);
  assert.match(files.get('xl/workbook.xml'), /name="Dados".*name="Dados 2"/, 'nome de aba repetido ganha número');
});

const day = offset => {
  const date = new Date(Date.UTC(2026, 9, 1 + offset, 12));
  return date.toISOString().slice(0, 10);
};

function fixture() {
  const program = {
    id: 'p1', type: 'aquisicao', name: 'Nomear cores', status: 'Em ensino', criterion: '',
    criteria: { minimumPercentage: 80, requiredSessions: 2, sessionsMustBeConsecutive: true, consecutiveIndependent: 0, requiredEnvironments: 1, requiredTherapists: 1 },
  };
  const reduction = { id: 'r1', type: 'reducao', name: 'Morder', status: 'Em ensino', measure: 'Frequência', unit: 'ocorrências' };
  const session = (id, offset, trials, value) => ({
    id, date: day(offset), startAt: Date.parse(`${day(offset)}T13:00:00Z`), status: 'finalizada', reviewStatus: 'approved',
    therapistId: 't1', location: 'Clínica', incidents: [], behaviors: [], reinforcers: [],
    records: [
      { type: 'aquisicao', programId: 'p1', phase: 'intervencao', trials },
      { type: 'reducao', programId: 'r1', phase: 'intervencao', value },
    ],
  });
  const sessions = [
    session('s1', 0, ['independente', 'erro', 'independente', 'ajuda_verbal', null], 4),
    session('s2', 1, ['independente', 'independente', 'independente', 'independente', 'independente'], 2),
    session('s3', 2, ['recusa', 'nao_aplicavel', null, null, null], 1),
  ];
  return {
    patient: { id: 'paciente', name: 'João Pedro' },
    data: {
      programs: [program, reduction],
      sessions,
      team: { name: 'Time Girassol', supervisorId: 't1' },
      professionalName: () => 'Ana Psicóloga',
      fidelity: [{ sessionId: 's1', source: 'supervisao', scorePercentage: 60 }, { sessionId: 's1', source: 'autoavaliacao', scorePercentage: 100 }],
      ioa: [{ observedOn: day(1), method: 'contagem_total', programId: 'p1', primaryValue: 4, secondaryValue: 5, agreementPercentage: 80 }],
    },
  };
}

test('modelo do relatório usa os números da tela', () => {
  const { patient, data } = fixture();
  const report = buildAbaReport({ patient, data, sessions: data.sessions, periodLabel: 'Outubro', generatedBy: 'Ana', clinicName: 'Clínica Exemplo' });
  assert.equal(report.sessionCount, 3);
  assert.equal(report.overall.independencePercentage, 78, '7 de 9 pontuáveis; recusa e NA fora');
  const [acquisition] = report.acquisition;
  assert.equal(acquisition.percentage, 78);
  assert.equal(acquisition.met, false, 's1 = 2/4 = 50%, s2 = 100%: só 1 sessão seguida com 80%, o critério pede 2');
  assert.equal(acquisition.series.length, 3);
  assert.equal(acquisition.series[2].percentage, null, 'sessão só com recusa/NA é lacuna');
  assert.equal(report.reduction[0].last, 1);
  assert.equal(report.trialRows.length, 15);
  assert.equal(report.fidelityRows.length, 1);
  assert.deepEqual([report.fidelityRows[0].self, report.fidelityRows[0].supervision], [100, 60]);
  assert.equal(report.ioaRows[0].program, 'Nomear cores');
  assert.equal(criterionText(data.programs[0]), '80% de independência em 2 sessões seguidas');
});

test('planilha do relatório: abas, gráficos ligados e lacuna', () => {
  const { patient, data } = fixture();
  const report = buildAbaReport({ patient, data, sessions: data.sessions, periodLabel: 'Outubro' });
  const files = unzip(buildAbaWorkbook(report));
  const workbook = files.get('xl/workbook.xml');
  for (const sheet of ['Resumo', 'Gráficos', 'Sessões', 'Tentativas', 'Redução', 'Qualidade']) {
    assert.match(workbook, new RegExp(`name="${sheet}"`), sheet);
  }
  for (const [name, xml] of files) if (name.endsWith('.xml') || name.endsWith('.rels')) assertBalancedXml(xml, name);

  const charts = [...files.keys()].filter(name => /^xl\/charts\/chart\d+\.xml$/.test(name));
  assert.equal(charts.length, 2, 'um gráfico por programa com dado');
  const types = files.get('[Content_Types].xml');
  for (const chart of charts) assert.ok(types.includes(`PartName="/${chart}"`), `${chart} registrado`);
  const chart = files.get('xl/charts/chart1.xml');
  assert.match(chart, /<c:f>'Gráficos'!\$B\$2:\$B\$4<\/c:f>/, 'série ligada às células');
  assert.match(chart, /<c:dispBlanksAs val="gap"\/>/);
  assert.match(chart, /<c:pt idx="0"><c:v>50<\/c:v><\/c:pt><c:pt idx="1"><c:v>100<\/c:v><\/c:pt><\/c:numCache>/, 'terceira sessão sem ponto (lacuna)');
  assert.match(files.get('xl/worksheets/sheet2.xml'), /<drawing r:id="rId1"\/>/);
  assert.ok(files.has('xl/drawings/drawing1.xml') && files.has('xl/drawings/_rels/drawing1.xml.rels'));
  assert.match(files.get('xl/worksheets/sheet1.xml'), /Relatório ABA — João Pedro/);
});

test('nome do arquivo sem acento nem espaço', () => {
  assert.equal(reportFileName('João Pedro da Conceição', 'xlsx', new Date(2026, 9, 31)), 'relatorio-aba-joao-pedro-da-conceicao-2026-10-31.xlsx');
  assert.equal(reportFileName('', 'pdf', new Date(2026, 0, 2)), 'relatorio-aba-paciente-2026-01-02.pdf');
});
