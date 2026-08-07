// ============================================================
// Paginação manual de relatórios para impressão (Acup e Psi).
// Extraído de panels/Relatorio.jsx; fica separado dos componentes
// (reportPrint.jsx) por causa do fast-refresh, mas é a MESMA lógica.
//
// O navegador não estica de forma confiável a última folha de uma
// tabela paginada até o fim físico da página. Aqui cada folha (.rpage)
// é do tamanho do PAPEL (margens embutidas no padding + @page report
// margin 0), o rodapé fica position:absolute no fundo dela e o corpo
// recebe altura fixa — o texto nunca invade o rodapé, mesmo se o
// diálogo de impressão usar margens/papel diferentes do previsto.
//
// Medição: cada bloco é medido pelo AVANÇO real (distância do topo
// dele ao topo do bloco seguinte), que inclui as margens verticais.
// Medir só o retângulo do bloco (getBoundingClientRect) acumulava
// ~10-14px de erro por parágrafo e cortava a última frase da folha.
// ============================================================

const MM_TO_PX = 96 / 25.4;
const PAGE_H_MM = 296.5; // folha A4 inteira (0.5mm de folga p/ arredondamento)
const PAGE_PAD_TOP_MM = 16; // margem superior embutida (menor: sem a barra do topo)
const PAGE_PAD_BOTTOM_MM = 24; // margem inferior embutida (reserva do rodapé)
const HEADER_GAP_MM = 9;
const FOOTER_GAP_MM = 6;
const MIN_BODY_BUDGET_MM = 60;
// Corta a folha 4% antes do limite real: absorve pequenas variações de
// medição (fontes/arredondamento) antes que o clip do .rpage-body atue.
const SLICE_SAFETY = 0.96;

function verticalMargin(node) {
  const cs = getComputedStyle(node);
  return (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
}

// Altura real que o elemento ocuparia numa folha: monta no palco (mesma
// largura/tipografia do .rpage-body) e mede com margens.
function measureDetached(el, stage) {
  stage.appendChild(el);
  const h = el.offsetHeight + verticalMargin(el);
  stage.removeChild(el);
  return h;
}

// Uma tabela mais alta que a folha inteira não pode ser tratada como
// bloco indivisível: o overflow hidden do .rpage-body cortaria as
// linhas de baixo em silêncio. Ela é fatiada por LINHA, repetindo o
// <thead> no topo de cada continuação. Tabela que CABE numa folha
// nunca é fatiada — vai inteira para a folha seguinte, mesmo que isso
// deixe um respiro grande (decisão de produto, 2026-07-20).
function buildTableChunk(table, headRows, rows) {
  const clone = table.cloneNode(false);
  const colgroup = table.querySelector(':scope > colgroup');
  if (colgroup) clone.appendChild(colgroup.cloneNode(true));
  if (headRows.length) {
    const thead = document.createElement('thead');
    headRows.forEach(row => thead.appendChild(row.cloneNode(true)));
    clone.appendChild(thead);
  }
  const tbody = document.createElement('tbody');
  rows.forEach(row => tbody.appendChild(row.cloneNode(true)));
  clone.appendChild(tbody);
  return clone;
}

// Fatia a tabela em pedaços que caibam primeiro em `firstBudget`
// (espaço restante da folha atual) e depois em `fullBudget` (folhas
// inteiras). Cada pedaço é MONTADO E MEDIDO de verdade no palco antes
// de ser aceito — se estourar o orçamento, perde linhas até caber.
// Retorna [{ html, height }].
function splitTableByRows(table, firstBudget, fullBudget, stage) {
  const headRows = table.tHead ? Array.from(table.tHead.rows) : [];
  const bodyRows = Array.from(table.tBodies).flatMap(tbody => Array.from(tbody.rows));
  if (!bodyRows.length) {
    return [{ html: table.outerHTML, height: table.offsetHeight + verticalMargin(table) }];
  }

  // Estimativa por linha para o palpite inicial de quantas linhas cabem
  // (a verificação real vem depois, medindo o chunk montado).
  const headH = headRows.reduce((sum, row) => sum + row.offsetHeight, 0);
  const chromeH = verticalMargin(table) + 8; // margens + bordas da tabela

  const chunks = [];
  let budget = firstBudget;
  let index = 0;

  while (index < bodyRows.length) {
    let count = 0;
    let used = headH + chromeH;
    while (index + count < bodyRows.length) {
      const rowH = bodyRows[index + count].offsetHeight;
      if (count > 0 && used + rowH > budget) break;
      used += rowH;
      count += 1;
    }

    // Verificação real: mede o pedaço montado e encolhe até caber.
    // (Uma linha sozinha maior que a folha entra assim mesmo — não há
    // como dividir uma <tr>.)
    let chunk = buildTableChunk(table, headRows, bodyRows.slice(index, index + count));
    let measured = measureDetached(chunk, stage);
    while (count > 1 && measured > budget) {
      count -= 1;
      chunk = buildTableChunk(table, headRows, bodyRows.slice(index, index + count));
      measured = measureDetached(chunk, stage);
    }

    chunks.push({ html: chunk.outerHTML, height: measured });
    index += count;
    budget = fullBudget;
  }

  return chunks;
}

// Mede cabeçalho/rodapé/blocos num "palco" escondido e corta o
// conteúdo em folhas que cabem no espaço disponível de cada página.
// Retorna também a altura exata da área de texto, aplicada como height
// fixo do .rpage-body (overflow hidden) — a garantia final de que nada
// passa por cima do rodapé.
export function paginateReportBody(html, { stage, header, footer }) {
  if (!stage || !header || !footer) return { pages: [html], bodyHeightPx: null };
  stage.innerHTML = html;

  const headerH = header.getBoundingClientRect().height;
  const footerH = footer.getBoundingClientRect().height;
  const usableH = (PAGE_H_MM - PAGE_PAD_TOP_MM - PAGE_PAD_BOTTOM_MM) * MM_TO_PX;
  const budget = Math.max(
    usableH - headerH - (HEADER_GAP_MM * MM_TO_PX) - footerH - (FOOTER_GAP_MM * MM_TO_PX),
    MIN_BODY_BUDGET_MM * MM_TO_PX,
  );
  const sliceBudget = budget * SLICE_SAFETY;

  const nodes = Array.from(stage.children);

  // Avanço de cada bloco: topo dele até o topo do próximo irmão —
  // inclui margens (com colapso) sem depender de estilo por elemento.
  const advances = nodes.map((node, i) => {
    const next = nodes[i + 1];
    if (next) return next.offsetTop - node.offsetTop;
    return node.offsetHeight + verticalMargin(node);
  });

  const pages = [];
  let current = [];
  let currentH = 0;

  const closePage = () => {
    if (!current.length) return;
    pages.push(current.map(part => (typeof part === 'string' ? part : part.outerHTML)).join(''));
    current = [];
    currentH = 0;
  };

  nodes.forEach((node, i) => {
    const h = advances[i];

    // Tabela mais alta que uma folha inteira: fatiar por linha. (Tabela
    // que cabe numa folha cai no fluxo normal abaixo e vai INTEIRA para
    // a próxima folha — nunca é cortada.)
    if (node.tagName === 'TABLE' && h > sliceBudget) {
      const remaining = sliceBudget - currentH;
      // Se o espaço restante mal comporta cabeçalho + uma linha típica,
      // começa a tabela em folha nova para não criar fatia anã.
      const firstBudget = remaining > sliceBudget * 0.18 ? remaining : (closePage(), sliceBudget);
      const chunks = splitTableByRows(node, firstBudget, sliceBudget, stage);
      chunks.forEach((chunk, index) => {
        if (index > 0) closePage();
        current.push(chunk.html);
        currentH += chunk.height;
      });
      return;
    }

    if (current.length && currentH + h > sliceBudget) closePage();
    current.push(node);
    currentH += h;
  });
  closePage();

  stage.innerHTML = '';
  return { pages: pages.length ? pages : [''], bodyHeightPx: budget };
}
