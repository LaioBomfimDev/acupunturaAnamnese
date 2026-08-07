import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Aba Documentos timbrados: valida a fiação (App/Sidebar/Psi) e as
// regras puras de aceitação de arquivo. A conversão em si (mammoth +
// DOMParser) só roda no navegador e é coberta pela verificação manual.

const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');

const appSource = read('../../src/App.jsx');
const sidebarSource = read('../../src/components/Sidebar.jsx');
const psychSource = read('../../src/components/PsychologyWorkspace.jsx');
const docxHelpers = read('../../src/components/panels/documentosDocx.js');
const pagination = read('../../src/components/report/reportPagination.js');

test('aba Documentos acessível sem paciente nos dois workspaces', () => {
  // MTC: renderPanel e handleTabChange liberam a aba sem paciente.
  assert.match(appSource, /case 'Documentos':\s*return <DocumentosTimbrados/);
  assert.match(appSource, /tab !== 'Biblioteca' && tab !== 'Documentos'/);
  assert.match(appSource, /activeTab !== 'Biblioteca' && activeTab !== 'Documentos'/);
  // O print-header genérico não pode imprimir por cima do timbrado.
  assert.match(appSource, /activeTab !== 'Relatório' && activeTab !== 'Documentos'/);

  // Sidebar: aba no grupo Apoio e liberada sem paciente.
  assert.match(sidebarSource, /'Biblioteca', 'Relatório', 'Documentos'/);
  assert.match(sidebarSource, /'Tela inicial', 'Biblioteca', 'Documentos'/);

  // Psicologia: mesma aba, mesmo componente.
  assert.match(psychSource, /PSYCHOLOGY_TABS\.DOCUMENTOS/);
  assert.match(psychSource, /<DocumentosTimbrados therapistProfile=\{profile\}/);
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
