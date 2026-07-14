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

// Mede cabeçalho/rodapé/parágrafos num "palco" escondido e corta o
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
  const pages = [];
  let current = [];
  let currentH = 0;
  nodes.forEach(node => {
    const h = node.getBoundingClientRect().height;
    if (current.length && currentH + h > sliceBudget) {
      pages.push(current.map(n => n.outerHTML).join(''));
      current = [];
      currentH = 0;
    }
    current.push(node);
    currentH += h;
  });
  if (current.length) pages.push(current.map(n => n.outerHTML).join(''));

  stage.innerHTML = '';
  return { pages: pages.length ? pages : [''], bodyHeightPx: budget };
}
