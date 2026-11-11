// ============================================================
// Planilha .xlsx sem biblioteca nova (11/11/2026): o jszip do projeto
// monta o pacote Office Open XML à mão. Dinheiro sai como número em
// reais com formato "R$ 1.234,56" (o contador soma na planilha), data
// como data de verdade (dd/mm/aaaa) e texto como texto. Nada de fórmula.
//
// sheets: [{ name, columns: [{ header, width, type: 'text'|'money'|'date'|'number' }], rows: [[valor, ...]] }]
//   money = centavos (inteiro); date = "AAAA-MM-DD".
// ============================================================

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(value) {
  return String(value ?? '')
    // Caracteres de controle quebram o XML do Excel.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "AAAA-MM-DD" → número de série do Excel (dias desde 30/12/1899). */
export function excelDateSerial(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!match) return null;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
}

/** Nome de aba válido: até 31 letras, sem : \ / ? * [ ]. */
export function sheetName(name, index) {
  const clean = String(name || '').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31);
  return clean || `Planilha ${index + 1}`;
}

function columnLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// Estilos: 0 normal, 1 cabeçalho em negrito, 2 dinheiro, 3 data.
const STYLES = `${XML_HEADER}
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00;\\-&quot;R$&quot;\\ #,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function cellXml(ref, value, type, bold = false) {
  if (value == null || value === '') return '';
  if (type === 'money' && Number.isFinite(Number(value))) return `<c r="${ref}" s="2"><v>${Number(value) / 100}</v></c>`;
  if (type === 'number' && Number.isFinite(Number(value))) return `<c r="${ref}"><v>${Number(value)}</v></c>`;
  if (type === 'date') {
    const serial = excelDateSerial(value);
    if (serial != null) return `<c r="${ref}" s="3"><v>${serial}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

export function sheetXml({ columns, rows }) {
  const cols = columns.map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width || 14}" customWidth="1"/>`).join('');
  const head = `<row r="1">${columns.map((column, index) => cellXml(`${columnLetter(index)}1`, column.header, 'text', true)).join('')}</row>`;
  const body = rows.map((row, rowIndex) => {
    const r = rowIndex + 2;
    return `<row r="${r}">${columns.map((column, index) => cellXml(`${columnLetter(index)}${r}`, row[index], column.type || 'text', row.bold)).join('')}</row>`;
  }).join('');
  return `${XML_HEADER}
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${head}${body}</sheetData></worksheet>`;
}

/** Monta o .xlsx e devolve um Blob. */
export async function buildXlsx(sheets) {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const names = sheets.map((sheet, index) => sheetName(sheet.name, index));
  zip.file('[Content_Types].xml', `${XML_HEADER}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`);
  zip.file('_rels/.rels', `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `${XML_HEADER}
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `${XML_HEADER}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet)));
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** Baixa um Blob com o nome dado. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
