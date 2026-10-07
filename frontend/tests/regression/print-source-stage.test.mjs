import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

// Folhas timbradas (.report-print-pages): o que vai pro papel são só as
// folhas .rpage. A fonte do corpo (innerHTML lido antes de paginar) e os
// medidores ficam no .rpage-measure-stage, invisível. Em 06/10/2026 a
// ficha cadastral e a linha do tempo de evoluções deixavam a fonte fora
// do palco: na impressão (.report-print-pages volta a position: static)
// saía primeiro o texto cru, sem papel timbrado, e a folha de verdade
// começava no meio da página. Conferido com Chrome headless --print-to-pdf.

const componentsDir = new URL('../../src/components/', import.meta.url);
const read = rel => readFileSync(new URL(rel, import.meta.url), 'utf8');

// Bloco JSX pela indentação do fechamento: o </div> que fecha o bloco
// fica na mesma coluna do <div> que abre (formatação do projeto).
function jsxBlock(source, openTagPattern) {
  const re = new RegExp(`^([ \\t]*)${openTagPattern}[^\\n]*\\r?\\n([\\s\\S]*?)^\\1<\\/div>\\r?$`, 'm');
  const match = source.match(re);
  return match ? { whole: match[0], inner: match[2] } : null;
}

const printComponents = readdirSync(componentsDir, { recursive: true })
  .filter(file => file.endsWith('.jsx'))
  .map(file => ({ file: file.replace(/\\/g, '/'), source: readFileSync(new URL(file.replace(/\\/g, '/'), componentsDir), 'utf8') }))
  .filter(({ source }) => source.includes('className="report-print-pages"'));

test('toda tela com folhas timbradas foi encontrada', () => {
  const files = printComponents.map(c => c.file);
  for (const expected of ['ClinicPatientProfile.jsx', 'PatientEvolutionTimeline.jsx', 'panels/Relatorio.jsx']) {
    assert.ok(files.includes(expected), `${expected} deveria ter .report-print-pages`);
  }
});

test('dentro de .report-print-pages só há o palco invisível e as folhas .rpage', () => {
  for (const { file, source } of printComponents) {
    const pages = jsxBlock(source, '<div className="report-print-pages"');
    assert.ok(pages, `${file}: bloco .report-print-pages não encontrado`);
    const stage = jsxBlock(pages.inner, '<div className="rpage-measure-stage">');
    assert.ok(stage, `${file}: .rpage-measure-stage não encontrado dentro de .report-print-pages`);

    // Tirando o palco (e comentários JSX), o que sobra começa direto nas
    // folhas: qualquer <div> solto ali sai no papel antes delas.
    const rest = pages.inner
      .replace(stage.whole, '')
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
      .trim();
    assert.match(rest, /^\{printDoc\.pages\.map\(/,
      `${file}: elemento fora do .rpage-measure-stage antes das folhas .rpage`);
  }
});

test('ficha cadastral e evoluções leem a fonte do corpo de dentro do palco invisível', () => {
  for (const rel of ['../../src/components/ClinicPatientProfile.jsx', '../../src/components/PatientEvolutionTimeline.jsx']) {
    const source = read(rel);
    const stage = jsxBlock(source, '<div className="rpage-measure-stage">');
    assert.ok(stage, `${rel}: .rpage-measure-stage não encontrado`);
    assert.match(stage.inner, /<div ref=\{printSourceRef\}>\{printBody\}<\/div>\r?\n/,
      `${rel}: a fonte do corpo precisa morar dentro do .rpage-measure-stage`);
    assert.equal(source.match(/ref=\{printSourceRef\}/g)?.length, 1,
      `${rel}: printSourceRef só pode ser montado uma vez`);
    assert.match(source, /const html = printSourceRef\.current\?\.innerHTML \|\| '';/);
  }
});

test('na impressão o .hub-screen não guarda espaço da barra de baixo (sem folha em branco no fim)', () => {
  // A folha A4 tem menos de 1024px: sem isso, o padding-bottom da barra
  // de baixo (hub.css) empurra uma página em branco depois da última .rpage.
  const appCss = read('../../src/App.css');
  assert.match(appCss,
    /\.hub-screen \{\r?\n\s*background: white !important;\r?\n\s*min-height: auto !important;\r?\n\s*padding-bottom: 0 !important;\r?\n\s*\}/);
  // Zerar o espaço só é seguro porque a barra em si não vai pro papel.
  const hubNav = read('../../src/components/HubNav.jsx');
  assert.match(hubNav, /<nav className="hub-dock no-print"/);
});
