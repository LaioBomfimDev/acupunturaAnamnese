// ============================================================
// Planilha .xlsx sem biblioteca: o formato é um zip de XML. Basta o que o
// relatório ABA usa — abas, larguras, células mescladas, cinco estilos e
// gráfico de linha nativo ligado às células (mexeu no número, a linha
// acompanha). O exceljs do Atlas custaria ~260 KB gz no bundle por um
// botão de exportar.
//
// Texto vai como "inlineStr": o Excel nunca o lê como fórmula, então um
// nome começando com "=" não vira comando (o problema do CSV).
// O XML do gráfico é o do Atlas (src/xlsx-charts.ts), com lacuna em vez de
// zero para sessão sem dado pontuável.
// ============================================================

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CHART_NS = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const SHEET_DRAWING_NS = 'http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing';

/** Índices de estilo (cellXfs em stylesXml). */
export const XLSX_STYLE = {
  normal: 0,
  title: 1,
  header: 2,
  bold: 3,
  wrap: 4,
  muted: 5,
};

// Caracteres que o XML 1.0 não aceita (controles, exceto tab e quebras).
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export const escapeXml = value => String(value ?? '')
  .replace(INVALID_XML, '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/** 0 → A, 25 → Z, 26 → AA. */
export function columnName(index) {
  let name = '';
  let current = index + 1;
  while (current > 0) {
    const rest = (current - 1) % 26;
    name = String.fromCharCode(65 + rest) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

/** Nome de aba válido no Excel: até 31 caracteres, sem []:*?/\. */
export function sheetName(value) {
  const clean = String(value || 'Aba').replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return clean || 'Aba';
}

/** Referência absoluta a um intervalo de uma coluna: 'Aba'!$B$2:$B$9. */
export function columnRef(sheet, column, firstRow, lastRow) {
  const col = columnName(column);
  return `'${sheet.replace(/'/g, "''")}'!$${col}$${firstRow}:$${col}$${lastRow}`;
}

function cellXml(value, rowNumber, columnIndex) {
  const ref = `${columnName(columnIndex)}${rowNumber}`;
  const cell = value !== null && typeof value === 'object' && !(value instanceof Date) ? value : { v: value };
  const style = cell.style ? XLSX_STYLE[cell.style] ?? 0 : 0;
  const styleAttr = style ? ` s="${style}"` : '';
  if (cell.v === null || cell.v === undefined || cell.v === '') {
    return style ? `<c r="${ref}"${styleAttr}/>` : '';
  }
  if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    return `<c r="${ref}"${styleAttr}><v>${cell.v}</v></c>`;
  }
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t xml:space="preserve">${escapeXml(cell.v)}</t></is></c>`;
}

function sheetXml(sheet, hasDrawing) {
  const columns = (sheet.columns || []).length
    ? `<cols>${sheet.columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width || 12}" customWidth="1"/>`).join('')}</cols>`
    : '';
  const rows = (sheet.rows || []).map((row, rowIndex) => {
    const cells = (row || []).map((value, columnIndex) => cellXml(value, rowIndex + 1, columnIndex)).join('');
    return cells ? `<row r="${rowIndex + 1}">${cells}</row>` : '';
  }).join('');
  const merges = (sheet.merges || []).length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`
    : '';
  const freeze = sheet.freezeRow
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.freezeRow}" topLeftCell="A${sheet.freezeRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  return `${XML_HEAD}<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">${freeze}${columns}<sheetData>${rows}</sheetData>${merges}${hasDrawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}

const STYLES_XML = `${XML_HEAD}<styleSheet xmlns="${MAIN_NS}">`
  + '<fonts count="4">'
  + '<font><sz val="11"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="14"/><name val="Calibri"/></font>'
  + '<font><b/><sz val="11"/><name val="Calibri"/></font>'
  + '<font><i/><sz val="10"/><color rgb="FF5A6472"/><name val="Calibri"/></font>'
  + '</fonts>'
  + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
  + '<fill><patternFill patternType="solid"><fgColor rgb="FFE7EEE5"/><bgColor indexed="64"/></patternFill></fill></fills>'
  + '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>'
  + '<border><left/><right/><top/><bottom style="thin"><color rgb="FFB9C7B5"/></bottom><diagonal/></border></borders>'
  + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
  + '<cellXfs count="6">'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
  + '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf>'
  + '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>'
  + '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
  + '</cellXfs>'
  + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
  + '</styleSheet>';

// ---------- gráfico (XML do Atlas, src/xlsx-charts.ts) ----------

const numberCache = (values, format) => {
  const points = values
    .map((value, index) => (value == null ? '' : `<c:pt idx="${index}"><c:v>${value}</c:v></c:pt>`))
    .join('');
  return `<c:numCache><c:formatCode>${escapeXml(format)}</c:formatCode><c:ptCount val="${values.length}"/>${points}</c:numCache>`;
};

const stringCache = labels => {
  const points = labels.map((label, index) => `<c:pt idx="${index}"><c:v>${escapeXml(label)}</c:v></c:pt>`).join('');
  return `<c:strCache><c:ptCount val="${labels.length}"/>${points}</c:strCache>`;
};

function chartXml(chart, axisSeed) {
  const catAxId = axisSeed;
  const valAxId = axisSeed + 1;
  const series = chart.series.map((entry, index) => '<c:ser>'
    + `<c:idx val="${index}"/><c:order val="${index}"/>`
    + `<c:tx><c:v>${escapeXml(entry.name)}</c:v></c:tx>`
    + `<c:spPr><a:ln w="22225"><a:solidFill><a:srgbClr val="${entry.color}"/></a:solidFill>${entry.dashed ? '<a:prstDash val="dash"/>' : ''}</a:ln></c:spPr>`
    + `<c:marker><c:symbol val="${entry.dashed ? 'none' : 'circle'}"/>${entry.dashed ? '' : '<c:size val="5"/>'}`
    + `${entry.dashed ? '' : `<c:spPr><a:solidFill><a:srgbClr val="${entry.color}"/></a:solidFill></c:spPr>`}</c:marker>`
    + `<c:cat><c:strRef><c:f>${escapeXml(chart.categories.ref)}</c:f>${stringCache(chart.categories.labels)}</c:strRef></c:cat>`
    + `<c:val><c:numRef><c:f>${escapeXml(entry.ref)}</c:f>${numberCache(entry.values, chart.numberFormat)}</c:numRef></c:val>`
    + '<c:smooth val="0"/>'
    + '</c:ser>').join('');

  const gridline = '<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="E8E5DF"/></a:solidFill>'
    + '<a:prstDash val="dash"/></a:ln></c:spPr></c:majorGridlines>';
  const scaling = '<c:scaling><c:orientation val="minMax"/>'
    + `${chart.maximum == null ? '' : `<c:max val="${chart.maximum}"/>`}<c:min val="0"/></c:scaling>`;
  const smallText = '<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="700"/></a:pPr><a:endParaRPr lang="pt-BR"/></a:p></c:txPr>';

  return `${XML_HEAD}<c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="${DRAWING_NS}" xmlns:r="${REL_NS}">`
    + '<c:lang val="pt-BR"/><c:roundedCorners val="0"/><c:chart>'
    + '<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p>'
    + `<a:r><a:rPr lang="pt-BR" sz="900" b="1"/><a:t>${escapeXml(chart.title)}</a:t></a:r>`
    + '</a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/>'
    + '<c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>'
    + series
    + `<c:marker val="1"/><c:axId val="${catAxId}"/><c:axId val="${valAxId}"/></c:lineChart>`
    + `<c:catAx><c:axId val="${catAxId}"/><c:scaling><c:orientation val="minMax"/></c:scaling>`
    + `<c:delete val="0"/><c:axPos val="b"/>${gridline}`
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${smallText}`
    + `<c:crossAx val="${valAxId}"/><c:crosses val="autoZero"/><c:auto val="1"/>`
    + '<c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>'
    + `<c:valAx><c:axId val="${valAxId}"/>${scaling}<c:delete val="0"/><c:axPos val="l"/>${gridline}`
    + `<c:numFmt formatCode="${escapeXml(chart.numberFormat)}" sourceLinked="0"/>`
    + `<c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${smallText}`
    + `<c:crossAx val="${catAxId}"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
    + '</c:plotArea>'
    + `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${smallText}</c:legend>`
    + '<c:plotVisOnly val="1"/>'
    // Lacuna, não zero: sessão sem dado pontuável não é desempenho zero.
    + '<c:dispBlanksAs val="gap"/>'
    + '</c:chart>'
    + '<c:spPr><a:noFill/><a:ln><a:solidFill><a:srgbClr val="E0DDD6"/></a:solidFill></a:ln></c:spPr>'
    + '</c:chartSpace>';
}

const anchorXml = (chart, frameId, relId) => '<xdr:twoCellAnchor>'
  + `<xdr:from><xdr:col>${chart.anchor.fromCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.anchor.fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>`
  + `<xdr:to><xdr:col>${chart.anchor.toCol}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${chart.anchor.toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
  + '<xdr:graphicFrame macro="">'
  + `<xdr:nvGraphicFramePr><xdr:cNvPr id="${frameId}" name="${escapeXml(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>`
  + '<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>'
  + `<a:graphic><a:graphicData uri="${CHART_NS}"><c:chart xmlns:c="${CHART_NS}" xmlns:r="${REL_NS}" r:id="${relId}"/></a:graphicData></a:graphic>`
  + '</xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>';

const relationships = entries => `${XML_HEAD}<Relationships xmlns="${PKG_REL_NS}">`
  + entries.map(entry => `<Relationship Id="${entry.id}" Type="${entry.type}" Target="${entry.target}"/>`).join('')
  + '</Relationships>';

// ---------- zip (sem compressão: "stored") ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xEDB88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) crc = CRC_TABLE[(crc ^ bytes[index]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Zip "stored" (método 0): válido para o Excel, sem dependência. */
export function zipStored(files, date = new Date()) {
  const encoder = new TextEncoder();
  const dosTime = ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) & 0xFFFF;
  const dosDate = (((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF;
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = typeof file.data === 'string' ? encoder.encode(file.data) : file.data;
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034B50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    locals.push(new Uint8Array(local.buffer), name, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014B50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array(central.buffer), name);

    offset += 30 + name.length + data.length;
  }

  const centralSize = centrals.reduce((total, part) => total + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const parts = [...locals, ...centrals, new Uint8Array(end.buffer)];
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let position = 0;
  for (const part of parts) {
    output.set(part, position);
    position += part.length;
  }
  return output;
}

/**
 * sheets: [{ name, columns: [{ width }], rows: [[valor | { v, style }]],
 *            merges: ['A1:E1'], freezeRow, charts: [{ title, categories:
 *            { ref, labels }, series: [{ name, ref, values, color, dashed }],
 *            numberFormat, maximum, anchor: { fromCol, fromRow, toCol, toRow } }] }]
 */
export function buildXlsx({ sheets, creator = 'Vitalis', date = new Date() }) {
  const names = new Set();
  const resolved = [];
  const files = [];
  const overrides = [];
  let chartCount = 0;
  let drawingCount = 0;
  let axisSeed = 100000000;

  sheets.forEach((sheet, index) => {
    let name = sheetName(sheet.name);
    for (let suffix = 2; names.has(name.toLowerCase()); suffix += 1) name = sheetName(`${sheet.name} ${suffix}`);
    names.add(name.toLowerCase());
    resolved.push(name);

    const charts = sheet.charts || [];
    const sheetPath = `xl/worksheets/sheet${index + 1}.xml`;
    files.push({ name: sheetPath, data: sheetXml(sheet, charts.length > 0) });
    overrides.push(`<Override PartName="/${sheetPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);

    if (charts.length) {
      drawingCount += 1;
      const drawingName = `drawing${drawingCount}.xml`;
      files.push({
        name: `xl/worksheets/_rels/sheet${index + 1}.xml.rels`,
        data: relationships([{ id: 'rId1', type: `${REL_NS}/drawing`, target: `../drawings/${drawingName}` }]),
      });
      const anchors = [];
      const drawingRels = [];
      charts.forEach((chart, chartIndex) => {
        chartCount += 1;
        files.push({ name: `xl/charts/chart${chartCount}.xml`, data: chartXml(chart, axisSeed) });
        overrides.push(`<Override PartName="/xl/charts/chart${chartCount}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        axisSeed += 2;
        const relId = `rId${chartIndex + 1}`;
        drawingRels.push({ id: relId, type: `${REL_NS}/chart`, target: `../charts/chart${chartCount}.xml` });
        anchors.push(anchorXml(chart, chartIndex + 2, relId));
      });
      files.push({
        name: `xl/drawings/${drawingName}`,
        data: `${XML_HEAD}<xdr:wsDr xmlns:xdr="${SHEET_DRAWING_NS}" xmlns:a="${DRAWING_NS}">${anchors.join('')}</xdr:wsDr>`,
      });
      files.push({ name: `xl/drawings/_rels/${drawingName}.rels`, data: relationships(drawingRels) });
      overrides.push(`<Override PartName="/xl/drawings/${drawingName}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    }
  });

  const workbook = `${XML_HEAD}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView/></bookViews><sheets>`
    + resolved.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
    + '</sheets></workbook>';
  const workbookRels = relationships([
    ...sheets.map((_sheet, index) => ({ id: `rId${index + 1}`, type: `${REL_NS}/worksheet`, target: `worksheets/sheet${index + 1}.xml` })),
    { id: `rId${sheets.length + 1}`, type: `${REL_NS}/styles`, target: 'styles.xml' },
  ]);
  const iso = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const core = `${XML_HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`
    + `<dc:creator>${escapeXml(creator)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created></cp:coreProperties>`;
  const contentTypes = `${XML_HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
    + overrides.join('')
    + '</Types>';
  const rootRels = relationships([
    { id: 'rId1', type: `${REL_NS}/officeDocument`, target: 'xl/workbook.xml' },
    { id: 'rId2', type: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties', target: 'docProps/core.xml' },
  ]);

  return zipStored([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rootRels },
    { name: 'docProps/core.xml', data: core },
    { name: 'xl/workbook.xml', data: workbook },
    { name: 'xl/_rels/workbook.xml.rels', data: workbookRels },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...files,
  ], date);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
