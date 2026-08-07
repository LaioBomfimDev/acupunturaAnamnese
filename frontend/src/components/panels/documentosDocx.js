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

  doc.querySelectorAll('script,style,iframe,object,embed,link,meta,form,input,button').forEach(el => el.remove());

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
   zebra, bordas) antes da conversão HTML→DOCX. */

const TABLE_BORDER = '1px solid #cbd5e1';

export function buildDocxExportHtml(html, accent) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const headerColor = accent || '#0E2A4A';

  doc.querySelectorAll('table').forEach(table => {
    table.setAttribute('style', 'border-collapse:collapse;width:100%;');
    table.querySelectorAll('thead th, thead td').forEach(cell => {
      cell.setAttribute('style', `border:${TABLE_BORDER};padding:4px 8px;background-color:${headerColor};color:#ffffff;font-weight:bold;text-align:left;`);
    });
    [...table.querySelectorAll('tbody tr')].forEach((row, index) => {
      const zebra = index % 2 === 1 ? 'background-color:#f1f5f9;' : '';
      row.querySelectorAll('td, th').forEach(cell => {
        cell.setAttribute('style', `border:${TABLE_BORDER};padding:4px 8px;text-align:left;vertical-align:top;${zebra}`);
      });
    });
  });

  return doc.body.firstChild?.innerHTML || '';
}

// Gera o Blob .docx do documento no padrão da clínica, com cabeçalho
// (nome/título/data/profissional) e rodapé de contato em toda página.
// Import dinâmico pela mesma razão do mammoth.
export async function exportStandardDocx({
  html, accent, clinicName, clinicDetails, docTitle, terapeuta, dateLabel, contactLine,
}) {
  // O build de navegador do html-to-docx referencia o `global` do Node.
  // Shim em runtime, e não `define` no vite.config: a substituição em
  // build quebrava a detecção de ambiente do mammoth (conversão travava).
  if (typeof window !== 'undefined' && typeof window.global === 'undefined') {
    window.global = window;
  }
  const HTMLtoDOCX = (await import('@turbodocx/html-to-docx')).default;
  const bodyHtml = buildDocxExportHtml(html, accent);
  const headerColor = accent || '#0E2A4A';

  const headerHtml = `<div>
    <p style="margin:0;font-size:14pt;"><strong style="color:${headerColor};">${escapeXmlText(clinicName)}</strong></p>
    ${clinicDetails ? `<p style="margin:0;font-size:8pt;color:#64748b;">${escapeXmlText(clinicDetails)}</p>` : ''}
    <p style="margin:0;font-size:9pt;color:#334155;">${escapeXmlText(docTitle)} • ${escapeXmlText(dateLabel)} • ${escapeXmlText(terapeuta)}</p>
  </div>`;

  const footerHtml = contactLine
    ? `<p style="font-size:8pt;color:#64748b;text-align:center;">${escapeXmlText(contactLine)}</p>`
    : '<p></p>';

  return HTMLtoDOCX(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${bodyHtml}</body></html>`,
    headerHtml,
    {
      header: true,
      footer: Boolean(contactLine),
      // Linha de tabela nunca quebra no meio entre páginas do Word.
      table: { row: { cantSplit: true } },
      title: docTitle || 'Documento da clínica',
    },
    footerHtml,
  );
}

function escapeXmlText(value) {
  return String(value || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
