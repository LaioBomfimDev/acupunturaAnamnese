import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as docx from '../../src/components/panels/documentosDocx.js';

// Aba Documentos timbrados: valida a fiação (App/Sidebar/Psi) e as
// regras puras de aceitação de arquivo. A conversão em si (mammoth +
// DOMParser) só roda no navegador e é coberta pela verificação manual.

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');

const appSource = read('../../src/App.jsx');
const sidebarSource = read('../../src/components/Sidebar.jsx');
const psychSource = read('../../src/components/PsychologyWorkspace.jsx');
const gestaoSource = read('../../src/components/panels/RelatoriosGestao.jsx');
const gestaoNavSource = read('../../src/components/panels/GestaoNav.jsx');
const gestaoCss = read('../../src/styles/gestao.css');
const docxHelpers = read('../../src/components/panels/documentosDocx.js');
const pagination = read('../../src/components/report/reportPagination.js');

test('Documentos timbrados só pelo Hub (10/09/2026: saiu da lateral e do PatientStart)', () => {
  // MTC: o render ainda existe (chamado só pelo botão do Hub, fora do
  // workspace) — mas não sobra nenhum botão dentro do workspace que
  // troque activeTab para 'Documentos'.
  assert.match(appSource, /case 'Documentos':\s*return <DocumentosTimbrados/);
  assert.doesNotMatch(sidebarSource, /'Biblioteca', 'Relatório', 'Documentos'/,
    'Documentos não deve mais aparecer no grupo Apoio da lateral');

  // Psicologia: mesmo componente, mas sem aba própria na lateral.
  assert.match(psychSource, /<DocumentosTimbrados therapistProfile=\{profile\}/);
  assert.doesNotMatch(psychSource, /tabs: \[PSYCHOLOGY_TABS\.RELATORIO, PSYCHOLOGY_TABS\.DOCUMENTOS\]/,
    'Documentos não deve mais aparecer nos grupos da lateral de Psicologia');
});

test('admin usa Documentos pela aba da Gestão; profissional e recepção pelo menu do hub (2026-09-25)', () => {
  // Aba própria dentro da Gestão, com o mesmo componente do hub.
  assert.match(gestaoSource, /\{ id: 'documentos', label: 'Documentos timbrados' \}/);
  assert.match(gestaoSource, /section === 'documentos' && \(\s*<Suspense[^\n]*\n\s*<DocumentosTimbrados therapistProfile=\{profile\} \/>/);
  // A folha timbrada é impressa de dentro da Gestão: as abas não podem ir pro papel.
  // Desde 2026-09-30 (noite) as abas são o menu à esquerda (GestaoNav) e o
  // título da aba + "Como funciona" moram no GestaoSectionHead: os dois
  // ficam fora da impressão, e o layout em colunas some no papel.
  assert.match(gestaoSource, /<GestaoNav\r?\n/);
  assert.match(gestaoSource, /<GestaoSectionHead /);
  assert.match(gestaoNavSource, /<nav className="gt-nav no-print"/);
  assert.match(gestaoNavSource, /<header className="gt-head no-print">/);
  assert.match(gestaoCss, /@media print \{\s*\.gt--rail \{\s*display: block;/);

  // Menu solto do hub some só para o admin (que tem a Gestão da
  // instituição, com a aba Documentos); os demais perfis têm só a Gestão
  // pessoal (sem Documentos, ver GestaoProfissional) e não podem perder o
  // acesso pelo hub.
  assert.match(appSource, /onOpenDocuments=\{isClinicAdmin \? undefined : \(\) => setShowHubDocuments\(true\)\}/);
  assert.match(appSource, /\{isClinicAdmin \? \(\s*<RelatoriosGestao/);
});

test('conversão é local e só aceita .docx (com orientação para .doc e PDF)', () => {
  assert.match(docxHelpers, /DOCX_EXTENSION = \/\\\.docx\$\/i/);
  assert.match(docxHelpers, /Salvar como/);
  assert.match(docxHelpers, /PDF ainda não é aceito/);
  // O mammoth precisa continuar em import dinâmico: só baixa ao usar a aba.
  assert.match(docxHelpers, /await import\('mammoth\/mammoth\.browser\.js'\)/);
});

test('paginador quebra tabela alta por linha repetindo o thead', () => {
  assert.match(pagination, /splitTableByRows/);
  assert.match(pagination, /node\.tagName === 'TABLE'/);
  // O cabeçalho da tabela deve ser reanexado em cada fatia.
  assert.match(pagination, /headRows\.forEach\(row => thead\.appendChild\(row\.cloneNode\(true\)\)\)/);
});

test('medição inclui margens (avanço entre blocos) — frases não podem ser cortadas', () => {
  // Regressão do corte de última linha: a altura de cada bloco vem do
  // avanço até o próximo irmão (inclui margens), não do retângulo puro.
  assert.match(pagination, /next\.offsetTop - node\.offsetTop/);
  // Fatia de tabela é montada e MEDIDA de verdade antes de ser aceita.
  assert.match(pagination, /measureDetached/);
});

test('exporta de volta para .docx editável com o padrão da casa', () => {
  assert.match(docxHelpers, /exportStandardDocx/);
  // Estilos viram inline porque o Word não lê nossas classes CSS.
  assert.match(docxHelpers, /buildDocxExportHtml/);
  // Conversor também em import dinâmico (só baixa quando exportar).
  assert.match(docxHelpers, /await import\('@turbodocx\/html-to-docx'\)/);
  // Linha de tabela não pode quebrar no meio entre páginas do Word.
  assert.match(docxHelpers, /cantSplit: true/);

  const panel = read('../../src/components/panels/DocumentosTimbrados.jsx');
  assert.match(panel, /Baixar Word \(\.docx\)/);
});

// 09/11/2026: na Gestão o "Imprimir / PDF" saía com uma página só com o
// topo da Gestão, páginas em branco intercaladas e folhas deslocadas. A
// folha ficava dentro do layout da tela; o navegador não aplicava a página
// A4 sem margem e a folha de 296,5mm passava da página. Agora a folha mora
// num portal direto no <body> e só ela imprime (.pq-printing).
test('folha de impressão em portal no body, só ela imprime (09/11/2026)', () => {
  const panel = read('../../src/components/panels/DocumentosTimbrados.jsx');
  const formsCss = read('../../src/styles/patientForms.css');
  assert.match(panel, /createPortal\(\r?\n\s*<div className="pq-print-root" aria-hidden="true">\r?\n\s*<div className="report-print-pages"/);
  assert.match(panel, /,\r?\n\s*document\.body,\r?\n\s*\)\}/);
  assert.match(panel, /document\.body\.classList\.add\('pq-printing'\);\r?\n\s*try \{\r?\n\s*window\.print\(\);/);
  assert.match(panel, /finally \{\r?\n\s*document\.body\.classList\.remove\('pq-printing'\);/);
  assert.match(panel, /import '\.\.\/\.\.\/styles\/patientForms\.css';/);
  assert.match(formsCss, /body\.pq-printing > \*:not\(\.pq-print-root\) \{\s*display: none !important;/);
});

test('tabela tem fundo próprio: a marca d\'água não aparece listrada por trás (09/11/2026)', () => {
  const css = read('../../src/App.css');
  assert.match(css, /\.doc-body table\.doc-table tbody td,\r?\n\.doc-body table\.doc-table tbody th \{\r?\n\s*background: #fff;/);
  assert.match(css, /\.doc-body table\.doc-table tbody tr:nth-child\(even\) td,[^{]*\{\r?\n\s*background: #f1f5f9;/);
});

test('Word sai em A4 com o timbrado do PDF: logo, faixas, rodapé, marca d\'água (09/11/2026)', () => {
  // Antes: papel Carta, margens do Word e só o nome da clínica em texto.
  assert.deepEqual(
    [docx.DOCX_PAGE.widthMm, docx.DOCX_PAGE.heightMm, docx.DOCX_PAGE.sideMm],
    [210, 297, 21],
  );
  assert.match(docxHelpers, /pageSize: \{ width: twip\(DOCX_PAGE\.widthMm\), height: twip\(DOCX_PAGE\.heightMm\) \}/);
  assert.match(docxHelpers, /buildLogoAssets\(logoUrl\)/);
  assert.match(docxHelpers, /drawMonogram\(/);
  assert.match(docxHelpers, /buildFooterHtml\(/);
  // O conversor chama Buffer.from ao embutir imagem: sem o polyfill,
  // qualquer imagem derrubava a exportação ("Buffer is not defined").
  assert.match(docxHelpers, /window\.Buffer = \(await import\('buffer'\)\)\.Buffer;/);
  assert.match(docxHelpers, /return finishDocx\(blob, \{ watermark:/);

  const wm = docx.watermarkParagraphXml({ widthPx: 600, heightPx: 300 });
  assert.match(wm, /behindDoc="1"/);
  assert.match(wm, /<wp:extent cx="5715000" cy="2857500"\/>/);
  assert.match(wm, /r:embed="rIdTimbradoMarca"/);
});

test('Word repete o cabeçalho da tabela em cada página', () => {
  const xml = '<w:tbl><w:tblPr/><w:tr><w:trPr><w:cantSplit/></w:trPr><w:tc/></w:tr>'
    + '<w:tr><w:trPr><w:cantSplit/></w:trPr></w:tr></w:tbl><w:p/>'
    + '<w:tbl><w:tr><w:trPr><w:cantSplit/></w:trPr></w:tr></w:tbl>';
  const marked = docx.markTableHeaderRows(xml);
  assert.equal(marked.match(/<w:tblHeader\/>/g).length, 2, 'só a primeira linha de cada tabela');
  assert.equal(docx.markTableHeaderRows(marked), marked, 'não marca duas vezes');
});

test('colar conteúdo: só texto vira parágrafos, sem HTML cru', () => {
  assert.equal(
    docx.plainTextToHtml('Primeira linha\r\nsegunda\n\n\nOutro <b>parágrafo</b> & fim'),
    '<p>Primeira linha<br>segunda</p><p>Outro &lt;b&gt;parágrafo&lt;/b&gt; &amp; fim</p>',
  );
  assert.equal(docx.plainTextToHtml('   \n\n  '), '');

  const panel = read('../../src/components/panels/DocumentosTimbrados.jsx');
  assert.match(panel, /\{ id: 'colar', label: 'Colar conteúdo' \}/);
  // Colado com formatação passa pela mesma limpeza do .docx.
  assert.match(panel, /rich \? normalizePastedContent\(rich\) : plainTextToHtml\(data\.getData\('text\/plain'\)\)/);
  assert.match(docxHelpers, /b\[id\^="docs-internal-guid"\]/);
  assert.match(docxHelpers, /file:\/\//);
});

// QA ACUP-021 (09/11/2026): "Colar conteúdo" recebe HTML de qualquer página,
// não só do mammoth. Na prévia sobravam links "java<TAB>script:", "data:text/html"
// e <svg><set attributeName="href" to="javascript:…"> (troca o href depois da
// limpeza). A CSP de produção segura o script, mas a limpeza não pode depender dela.
test('QA: limpeza do colado barra javascript: com tab/quebra, data: fora de imagem e svg/math', () => {
  assert.match(docxHelpers, /querySelectorAll\('[^']*\bbase\b[^']*\bsvg,math'\)\.forEach\(el => el\.remove\(\)\)/);
  // compara o esquema sem os caracteres que o navegador ignora
  assert.match(docxHelpers, /const scheme = \[\.\.\.attr\.value\]\.filter\(c => c\.charCodeAt\(0\) > 0x20 && c\.charCodeAt\(0\) !== 0x7f\)\.join\(''\)\.toLowerCase\(\);/);
  assert.match(docxHelpers, /\/\^\(javascript\|vbscript\):\/\.test\(scheme\)/);
  assert.match(docxHelpers, /scheme\.startsWith\('data:'\) && !\(el\.tagName === 'IMG' && name === 'src' && scheme\.startsWith\('data:image\/'\)\)/);
  assert.doesNotMatch(docxHelpers, /\/\^\s\*javascript:\/i\.test\(attr\.value\)/, 'o teste antigo do esquema era burlado por tab');
});
