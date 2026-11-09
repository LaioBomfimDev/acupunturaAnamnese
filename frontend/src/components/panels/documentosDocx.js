// ============================================================
// Aba Documentos: conversão de .docx em HTML timbrado.
//
// O arquivo do profissional é lido INTEIRAMENTE no navegador
// (mammoth.js) — nenhum conteúdo de paciente sai da máquina.
// O HTML resultante é sanitizado e re-estilizado no padrão da
// casa: a formatação de tabela que veio do Word é descartada e
// substituída por um único modelo (classe .doc-table), para
// todo documento da clínica sair igual.
// ============================================================

export const DOCX_EXTENSION = /\.docx$/i;
export const LEGACY_DOC_EXTENSION = /\.doc$/i;

// Mensagem discreta (não é erro) para formatos que o navegador não lê.
export function describeUnsupportedFile(fileName) {
  const name = String(fileName || '');
  if (LEGACY_DOC_EXTENSION.test(name) && !DOCX_EXTENSION.test(name)) {
    return 'Este é um .doc antigo, que o navegador não consegue ler. No Word: Arquivo → Salvar como → tipo "Documento do Word (.docx)" e envie novamente.';
  }
  if (/\.pdf$/i.test(name)) {
    return 'PDF ainda não é aceito aqui — envie o arquivo .docx original deste documento.';
  }
  return 'Formato não aceito. Envie um arquivo Word no formato .docx.';
}

export function isDocxFile(fileName) {
  return DOCX_EXTENSION.test(String(fileName || ''));
}

// Atributos visuais que o Word traz e que precisam morrer para o
// padrão da casa valer (o CSS de .doc-table/.doc-body assume o resto).
const STRIP_ATTRIBUTES = [
  'style', 'class', 'width', 'height', 'border', 'cellpadding',
  'cellspacing', 'align', 'valign', 'bgcolor', 'color', 'face', 'size',
];

// Sanitiza e padroniza o HTML vindo do mammoth. Mesma postura do
// sanitizeHtml do Relatório (scripts/eventos/javascript: fora) mais a
// normalização visual: tabelas ganham .doc-table e a primeira linha
// vira <thead> (é ela que se repete quando a tabela quebra de folha).
export function normalizeImportedHtml(rawHtml) {
  const doc = new DOMParser().parseFromString(`<div>${rawHtml || ''}</div>`, 'text/html');

  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,title,form,input,button,select,textarea').forEach(el => el.remove());
  removeComments(doc.body);

  // Conteúdo colado (Word, Google Docs, navegador) marca negrito e
  // itálico por estilo, que morre logo abaixo: vira <strong>/<em> antes.
  // O Google Docs embrulha tudo num <b style="font-weight:normal"> que,
  // sem o estilo, deixaria o texto inteiro em negrito.
  doc.querySelectorAll('b[id^="docs-internal-guid"]').forEach(unwrap);
  doc.querySelectorAll('span[style]').forEach(span => {
    const style = span.getAttribute('style') || '';
    const weight = /font-weight\s*:\s*(bold|[6-9]00)/i.test(style);
    const italic = /font-style\s*:\s*italic/i.test(style);
    if (!weight && !italic) return;
    let inner = doc.createDocumentFragment();
    while (span.firstChild) inner.appendChild(span.firstChild);
    if (italic) inner = wrapIn(doc, 'em', inner);
    if (weight) inner = wrapIn(doc, 'strong', inner);
    span.appendChild(inner);
  });
  // Marcas de formatação sem significado (span, font, o:p do Word).
  doc.querySelectorAll('span,font').forEach(unwrap);
  [...doc.body.getElementsByTagName('*')]
    .filter(el => el.tagName.includes(':'))
    .forEach(unwrap);

  doc.querySelectorAll('*').forEach(el => {
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const isEventHandler = name.startsWith('on');
      const isScriptUrl = ['href', 'src', 'xlink:href'].includes(name)
        && /^\s*javascript:/i.test(attr.value);
      if (isEventHandler || isScriptUrl) el.removeAttribute(attr.name);
    });
    STRIP_ATTRIBUTES.forEach(name => el.removeAttribute(name));
  });

  // Imagem colada do Word aponta para arquivo do computador (file://),
  // que nem a tela nem o PDF conseguem abrir: só ficam as embutidas.
  doc.querySelectorAll('img').forEach(img => {
    if (!/^(data:image\/|https:\/\/)/i.test(img.getAttribute('src') || '')) img.remove();
  });

  doc.querySelectorAll('table').forEach(table => {
    table.classList.add('doc-table');
    // Promove a primeira linha a cabeçalho quando o Word não marcou
    // nenhuma: é o comportamento esperado em laudo/tabela de escores.
    if (!table.tHead) {
      const firstRow = table.tBodies[0]?.rows?.[0];
      if (firstRow && table.tBodies[0].rows.length > 1) {
        const thead = doc.createElement('thead');
        thead.appendChild(firstRow);
        table.insertBefore(thead, table.tBodies[0]);
      }
    }
  });

  // Parágrafos totalmente vazios do Word viram respiros exagerados na
  // folha; um <p> vazio ocasional é aceitável, sequências não.
  let previousWasEmpty = false;
  doc.querySelectorAll('p').forEach(p => {
    const isEmpty = !p.textContent.trim() && !p.querySelector('img');
    if (isEmpty && previousWasEmpty) p.remove();
    else previousWasEmpty = isEmpty;
  });

  return doc.body.firstChild?.innerHTML || '';
}

function removeComments(root) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
  const comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach(node => node.remove());
}

function unwrap(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function wrapIn(doc, tag, content) {
  const el = doc.createElement(tag);
  el.appendChild(content);
  return el;
}

function escapeHtmlText(value) {
  return String(value || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Texto puro (sem formatação): linha em branco separa parágrafos e a
// quebra simples vira <br>, como a pessoa digitou.
export function plainTextToHtml(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n+/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p>${block.split('\n').map(escapeHtmlText).join('<br>')}</p>`)
    .join('');
}

// Conteúdo colado ou digitado na área "Colar conteúdo": passa pela mesma
// limpeza do .docx, para sair no mesmo padrão da casa.
export function normalizePastedContent(html) {
  const normalized = normalizeImportedHtml(html);
  const probe = new DOMParser().parseFromString(`<div>${normalized}</div>`, 'text/html');
  const hasContent = probe.body.textContent.trim() || probe.body.querySelector('img,table');
  return hasContent ? normalized : '';
}

// Converte o ArrayBuffer de um .docx em HTML padronizado. Import
// dinâmico: o mammoth (~500 KB) só é baixado quando alguém realmente
// usa a aba Documentos.
export async function convertDocxToStandardHtml(arrayBuffer) {
  const mammoth = (await import('mammoth/mammoth.browser.js')).default;
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = normalizeImportedHtml(result.value);
  if (!html.trim()) {
    throw new Error('O arquivo foi lido, mas não contém texto reconhecível.');
  }
  return { html, messages: result.messages || [] };
}


/* ── exportar de volta para Word (.docx) ─────────────────────
   O Word não lê nossas classes CSS, então o padrão da casa é
   re-aplicado como estilo inline (cabeçalho na cor da clínica,
   zebra, bordas) antes da conversão HTML→DOCX. O timbrado segue o
   mesmo desenho do PDF (PrintLetterhead/PrintFooter): folha A4, logo
   (ou monograma), nome, dados, faixa colorida, rodapé de contato e
   marca d'água do logo atrás do texto. As faixas, o monograma e os
   ícones vão como imagem desenhada aqui (o Word não tem gradiente). */

const TABLE_BORDER = '1px solid #cbd5e1';
const DOCX_FONT = 'Arial';
const TWIP_PER_MM = 1440 / 25.4;
const PX_PER_MM = 96 / 25.4;
const EMU_PER_PX = 9525;
const twip = mm => Math.round(mm * TWIP_PER_MM);
const px = mm => Math.round(mm * PX_PER_MM);

// Folha e margens do .docx, em mm (o mesmo A4 de .rpage: 21mm dos lados).
// Antes saía em papel Carta, com margens do Word e só o nome em texto.
export const DOCX_PAGE = {
  widthMm: 210,
  heightMm: 297,
  sideMm: 21,
  headerFromTopMm: 12,
  bodyTopMm: 44,
  footerFromBottomMm: 10,
  bodyBottomMm: 34,
};
const CONTENT_WIDTH_MM = DOCX_PAGE.widthMm - (2 * DOCX_PAGE.sideMm);

export function buildDocxExportHtml(html, accent) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const headerColor = accent || '#0E2A4A';

  doc.querySelectorAll('table').forEach(table => {
    table.setAttribute('style', 'border-collapse:collapse;width:100%;');
    table.querySelectorAll('thead th, thead td').forEach(cell => {
      cell.setAttribute('style', `border:${TABLE_BORDER};padding:4px 8px;background-color:${headerColor};color:#ffffff;font-weight:bold;text-align:left;`);
    });
    [...table.querySelectorAll('tbody tr')].forEach((row, index) => {
      // Toda célula com fundo próprio: a marca d'água não atravessa a tabela.
      const fill = index % 2 === 1 ? '#f1f5f9' : '#ffffff';
      row.querySelectorAll('td, th').forEach(cell => {
        cell.setAttribute('style', `border:${TABLE_BORDER};padding:4px 8px;text-align:left;vertical-align:top;background-color:${fill};`);
      });
    });
  });

  // Títulos na cor da clínica, como no PDF (.doc-body h1-h3).
  doc.querySelectorAll('h1, h2, h3').forEach(heading => {
    heading.setAttribute('style', `color:${headerColor};`);
  });

  return doc.body.firstChild?.innerHTML || '';
}

/* ── desenhos do timbrado (canvas → PNG) ── */

const RENDER_SCALE = 3; // PNG com 3× a resolução de tela: nítido na impressão

function makeCanvas(widthPx, heightPx) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(widthPx * RENDER_SCALE));
  canvas.height = Math.max(1, Math.round(heightPx * RENDER_SCALE));
  const ctx = canvas.getContext('2d');
  ctx.scale(RENDER_SCALE, RENDER_SCALE);
  return { canvas, ctx };
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Faixa segmentada (mesmas cores e cortes do CSS .rpage-rule e cia.).
function drawBand(widthPx, heightPx, segments) {
  const { canvas, ctx } = makeCanvas(widthPx, heightPx);
  ctx.save();
  roundedRect(ctx, 0, 0, widthPx, heightPx, Math.min(heightPx / 2, px(1.5)));
  ctx.clip();
  segments.forEach(([from, to, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(widthPx * from, 0, (widthPx * (to - from)) + 0.5, heightPx);
  });
  ctx.restore();
  return { src: canvas.toDataURL('image/png'), width: Math.round(widthPx), height: Math.round(heightPx) };
}

function drawMonogram(letter, accent) {
  const size = px(16);
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = accent;
  roundedRect(ctx, 0, 0, size, size, px(3.5));
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${Math.round(size * 0.45)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, size / 2, (size / 2) + 1);
  return { src: canvas.toDataURL('image/png'), width: size, height: size };
}

// Mesmos desenhos do PrintContactIcon (reportPrint.jsx).
const ICON_PATHS = {
  phone: 'M8.8 7.2c-.2 0-.5.1-.7.4-.3.4-.7.9-.7 1.8 0 1 .7 2.1 1 2.5.2.3 1.8 2.9 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.6-.4l-1.6-.8c-.3-.1-.5-.1-.7.2l-.7.9c-.1.2-.3.2-.6.1-.3-.1-1.1-.4-2-1.2-.8-.7-1.3-1.5-1.5-1.8-.1-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.6c-.2-.4-.4-.4-.7-.4h-.6Z',
  address: 'M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z',
  email: 'M3.5 6.2h17a.8.8 0 0 1 .8.8v10a.8.8 0 0 1-.8.8h-17a.8.8 0 0 1-.8-.8V7a.8.8 0 0 1 .8-.8Z',
};

function drawContactIcon(type, accent) {
  const size = px(8);
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  if (typeof Path2D === 'function') {
    const glyph = px(4.6);
    ctx.save();
    ctx.translate((size - glyph) / 2, (size - glyph) / 2);
    ctx.scale(glyph / 24, glyph / 24);
    ctx.fillStyle = '#ffffff';
    ctx.fill(new Path2D(ICON_PATHS[type] || ICON_PATHS.phone));
    if (type === 'address') {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(12, 9, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  return { src: canvas.toDataURL('image/png'), width: size, height: size };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('logo indisponível'));
    img.src = src;
  });
}

// Logo da clínica em PNG (o Word não abre webp/svg) e a marca d'água
// (cinza, 20% de opacidade, como .rpage-watermark). Sem logo ou sem
// conseguir ler a imagem: null, e o cabeçalho usa o monograma.
async function buildLogoAssets(logoUrl) {
  if (!logoUrl) return null;
  try {
    const img = await loadImage(logoUrl);
    const naturalW = img.naturalWidth || 1;
    const naturalH = img.naturalHeight || 1;
    const ratio = naturalW / naturalH;
    let height = px(18);
    let width = height * ratio;
    if (width > px(60)) { width = px(60); height = width / ratio; }
    const logo = makeCanvas(width, height);
    logo.ctx.drawImage(img, 0, 0, width, height);

    const boxW = px(CONTENT_WIDTH_MM);
    const boxH = px(DOCX_PAGE.heightMm - 16 - 24);
    const scale = Math.min(boxW / naturalW, boxH / naturalH);
    const wmW = naturalW * scale;
    const wmH = naturalH * scale;
    const wm = document.createElement('canvas');
    // Resolução moderada: a marca é clara e grande, não precisa de 3×.
    const wmScale = Math.min(2, 1600 / Math.max(wmW, wmH));
    wm.width = Math.max(1, Math.round(wmW * wmScale));
    wm.height = Math.max(1, Math.round(wmH * wmScale));
    const wctx = wm.getContext('2d');
    wctx.drawImage(img, 0, 0, wm.width, wm.height);
    const pixels = wctx.getImageData(0, 0, wm.width, wm.height);
    const data = pixels.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round((0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]));
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
      data[i + 3] = Math.round(data[i + 3] * 0.2);
    }
    wctx.putImageData(pixels, 0, 0);

    return {
      logo: { src: logo.canvas.toDataURL('image/png'), width: Math.round(width), height: Math.round(height) },
      watermark: { dataUrl: wm.toDataURL('image/png'), widthPx: wmW, heightPx: wmH },
    };
  } catch {
    // Logo de outro domínio sem CORS (canvas "sujo") ou link quebrado:
    // o documento sai com o monograma, sem travar a exportação.
    return null;
  }
}

function imgTag(image) {
  return `<img src="${image.src}" width="${image.width}" height="${image.height}" alt="" />`;
}

function plainCell(extra = '') {
  return `border:none;padding:0;vertical-align:middle;${extra}`;
}

// Cabeçalho do Word no desenho do PrintLetterhead.
function buildLetterheadHtml({ palette, brand, clinicName, clinicDetails, docTitle, terapeuta, dateLabel }) {
  const rule = drawBand(px(CONTENT_WIDTH_MM), px(3), [
    [0, 0.16, palette.shade], [0.16, 0.58, palette.accent], [0.58, 1, palette.soft],
  ]);
  const meta = (text, size, color, bold = false) => {
    const value = escapeXmlText(text);
    return `<p style="margin:0;text-align:right;font-size:${size}pt;color:${color};">${bold ? `<strong>${value}</strong>` : value}</p>`;
  };

  return `<table style="width:100%;border-collapse:collapse;border:none;"><tr>`
    + `<td style="${plainCell(`width:${brand.width + 18}px;`)}">${imgTag(brand)}</td>`
    + `<td style="${plainCell()}">`
    + `<p style="margin:0;font-family:Georgia;font-size:18pt;color:${palette.accent};"><strong>${escapeXmlText(clinicName)}</strong></p>`
    + (clinicDetails ? `<p style="margin:0;font-size:8.5pt;color:#53657a;">${escapeXmlText(clinicDetails)}</p>` : '')
    + `</td>`
    + `<td style="${plainCell('text-align:right;width:190px;')}">`
    + meta(dateLabel, 10, palette.accent, true)
    + meta(docTitle, 8.5, '#53657a')
    + meta(terapeuta, 8.5, '#53657a')
    + `</td></tr></table>`
    + `<p style="margin:0;margin-top:6px;">${imgTag(rule)}</p>`;
}

// Rodapé do Word no desenho do PrintFooter.
function buildFooterHtml({ palette, items, clinicName }) {
  const segments = drawBand(px(CONTENT_WIDTH_MM), px(2.6), [
    [0, 0.34, palette.soft], [0.34, 0.8, palette.accent], [0.8, 1, palette.shade],
  ]);
  const contactCells = (items || []).map(item => `<td style="${plainCell()}">`
    + `<table style="border-collapse:collapse;border:none;"><tr>`
    + `<td style="${plainCell('width:40px;')}">${imgTag(drawContactIcon(item.id, palette.accent))}</td>`
    + `<td style="${plainCell()}">`
    + `<p style="margin:0;font-size:6.5pt;color:${palette.accent};">${escapeXmlText(String(item.label || '').toUpperCase())}</p>`
    + `<p style="margin:0;font-size:8.5pt;color:#1f2937;"><strong>${escapeXmlText(item.value)}</strong></p>`
    + `</td></tr></table></td>`).join('');

  // A barra final ocupa o que sobra da linha depois do nome da clínica.
  const nameWidth = Math.min(px(80), (String(clinicName || '').length * 6.4) + 16);
  const bar = drawBand(Math.max(px(20), px(CONTENT_WIDTH_MM) - nameWidth), px(2.6), [
    [0, 0.7, palette.accent], [0.7, 1, palette.soft],
  ]);

  return `<p style="margin:0;">${imgTag(segments)}</p>`
    + (contactCells ? `<table style="width:100%;border-collapse:collapse;border:none;"><tr>${contactCells}</tr></table>` : '')
    + `<p style="margin:0;margin-top:4px;"><span style="font-family:Georgia;font-size:8pt;color:${palette.accent};"><strong>${escapeXmlText(clinicName)}</strong></span>&nbsp;&nbsp;${imgTag(bar)}</p>`;
}

/* ── marca d'água: desenho ancorado atrás do texto, no cabeçalho ── */

const WATERMARK_REL_ID = 'rIdTimbradoMarca';
const WATERMARK_MEDIA = 'media/timbrado-marca-dagua.png';

export function watermarkParagraphXml({ widthPx, heightPx }) {
  const cx = Math.round(widthPx * EMU_PER_PX);
  const cy = Math.round(heightPx * EMU_PER_PX);
  return '<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    + ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'
    + ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
    + ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"'
    + ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + '<w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/></w:pPr>'
    + '<w:r><w:drawing>'
    + '<wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="0" behindDoc="1" locked="1" layoutInCell="1" allowOverlap="1">'
    + '<wp:simplePos x="0" y="0"/>'
    + '<wp:positionH relativeFrom="margin"><wp:align>center</wp:align></wp:positionH>'
    + '<wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV>'
    + `<wp:extent cx="${cx}" cy="${cy}"/>`
    + '<wp:effectExtent l="0" t="0" r="0" b="0"/>'
    + '<wp:wrapNone/>'
    + '<wp:docPr id="90001" name="Marca dagua"/>'
    + '<wp:cNvGraphicFramePr/>'
    + '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<pic:pic><pic:nvPicPr><pic:cNvPr id="90001" name="timbrado-marca-dagua.png"/><pic:cNvPicPr/></pic:nvPicPr>'
    + `<pic:blipFill><a:blip r:embed="${WATERMARK_REL_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>`
    + `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>`
    + '</pic:pic></a:graphicData></a:graphic>'
    + '</wp:anchor></w:drawing></w:r></w:p>';
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// A primeira linha de cada tabela (o <thead>) repete no topo de cada
// página do Word, como no PDF. O conversor não marca isso sozinho.
export function markTableHeaderRows(documentXml) {
  return String(documentXml).replace(
    /(<w:tbl>(?:(?!<w:tr>)[\s\S])*?<w:tr>\s*<w:trPr>)(?!\s*<w:tblHeader)/g,
    '$1<w:tblHeader/>',
  );
}

// Acabamento do .docx gerado: cabeçalho de tabela que se repete e, com
// logo, a marca d'água (o conversor não faz nenhum dos dois).
export async function finishDocx(blob, { watermark = null } = {}) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(blob);
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (documentXml) zip.file('word/document.xml', markTableHeaderRows(documentXml));
  if (watermark) await addWatermark(zip, watermark);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

// Põe o logo desbotado atrás do texto, no cabeçalho do Word (repete em
// toda página).
async function addWatermark(zip, watermark) {
  const docRels = await zip.file('word/_rels/document.xml.rels')?.async('string');
  const headerRel = docRels?.match(/<Relationship\b[^>]*\/relationships\/header"[^>]*>/)?.[0] || '';
  const headerTarget = headerRel.match(/Target="([^"]+)"/)?.[1];
  if (!headerTarget) return;

  const headerPath = `word/${headerTarget}`;
  const relsPath = `word/_rels/${headerTarget.split('/').pop()}.rels`;
  const headerXml = await zip.file(headerPath)?.async('string');
  const closing = headerXml?.match(/<\/(?:[\w-]+:)?hdr>\s*$/);
  if (!closing) return;
  zip.file(headerPath, headerXml.slice(0, closing.index) + watermarkParagraphXml(watermark) + closing[0]);

  const rel = `<Relationship Id="${WATERMARK_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${WATERMARK_MEDIA}"/>`;
  const relsXml = await zip.file(relsPath)?.async('string');
  zip.file(relsPath, relsXml
    ? relsXml.replace(/<\/Relationships>\s*$/, `${rel}</Relationships>`)
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`);

  zip.file(`word/${WATERMARK_MEDIA}`, dataUrlToBytes(watermark.dataUrl));

  const typesXml = await zip.file('[Content_Types].xml')?.async('string');
  if (typesXml && !/Extension="png"/i.test(typesXml)) {
    zip.file('[Content_Types].xml', typesXml.replace(/<Types([^>]*)>/, '<Types$1><Default Extension="png" ContentType="image/png"/>'));
  }
}

// Gera o Blob .docx do documento no padrão da clínica, com o timbrado
// em toda página (cabeçalho, rodapé e marca d'água do Word).
// Import dinâmico pela mesma razão do mammoth.
export async function exportStandardDocx({
  html, palette, logoUrl, watermark = true, clinicName, clinicDetails, docTitle, terapeuta, dateLabel, contactItems,
}) {
  // O build de navegador do html-to-docx referencia o `global` do Node.
  // Shim em runtime, e não `define` no vite.config: a substituição em
  // build quebrava a detecção de ambiente do mammoth (conversão travava).
  if (typeof window !== 'undefined' && typeof window.global === 'undefined') {
    window.global = window;
  }
  // Ao embutir imagem (logo, faixas, figura do documento) ele chama
  // `Buffer.from` do Node direto: sem isto, qualquer imagem derrubava a
  // exportação com "Buffer is not defined" (09/11/2026).
  if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
    window.Buffer = (await import('buffer')).Buffer;
  }
  const HTMLtoDOCX = (await import('@turbodocx/html-to-docx')).default;
  const colors = {
    accent: palette?.accent || '#0E2A4A',
    shade: palette?.shade || '#061A31',
    soft: palette?.soft || '#9DB8D0',
  };
  const bodyHtml = buildDocxExportHtml(html, colors.accent);
  const assets = await buildLogoAssets(logoUrl);
  const brand = assets?.logo
    || drawMonogram(String(clinicName || 'R').trim().charAt(0).toUpperCase() || 'R', colors.accent);

  const headerHtml = buildLetterheadHtml({
    palette: colors, brand, clinicName, clinicDetails, docTitle, terapeuta, dateLabel,
  });
  const footerHtml = buildFooterHtml({ palette: colors, items: contactItems, clinicName });

  const blob = await HTMLtoDOCX(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${bodyHtml}</body></html>`,
    headerHtml,
    {
      orientation: 'portrait',
      pageSize: { width: twip(DOCX_PAGE.widthMm), height: twip(DOCX_PAGE.heightMm) },
      margins: {
        top: twip(DOCX_PAGE.bodyTopMm),
        bottom: twip(DOCX_PAGE.bodyBottomMm),
        left: twip(DOCX_PAGE.sideMm),
        right: twip(DOCX_PAGE.sideMm),
        header: twip(DOCX_PAGE.headerFromTopMm),
        footer: twip(DOCX_PAGE.footerFromBottomMm),
        gutter: 0,
      },
      font: DOCX_FONT,
      fontSize: 22,
      header: true,
      footer: true,
      lang: 'pt-BR',
      // Linha de tabela nunca quebra no meio entre páginas do Word.
      table: { row: { cantSplit: true } },
      title: docTitle || 'Documento da clínica',
      creator: clinicName || 'Clínica',
      lastModifiedBy: terapeuta || clinicName || 'Clínica',
    },
    footerHtml,
  );

  return finishDocx(blob, { watermark: watermark ? assets?.watermark || null : null });
}

function escapeXmlText(value) {
  return String(value || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
