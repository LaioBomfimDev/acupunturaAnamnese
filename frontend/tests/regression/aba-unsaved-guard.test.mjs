import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const read = name => readFile(new URL('../../src/components/' + name, import.meta.url), 'utf8');
const workspace = await read('AbaWorkspace.jsx');
const context = await read('aba/AbaUnsavedContext.jsx');

test('ACUP-012: cada editor registra diferença real e bloqueio durante escrita; retirar qualquer registro quebra', async () => {
  for (const [name, expected] of [
    ['AbaProfile', /useAbaUnsaved\(\(\) => JSON\.stringify\(draft\) !== original\.current, busy\)/],
    ['AbaPlan', /useAbaUnsaved\(dirty, busy\)/],
    ['AbaLibrary', /useAbaUnsaved\(dirty, busy\)/],
    ['AbaSupervision', /useAbaUnsaved\(JSON\.stringify\(draft\) !== original, busy\)/],
    ['AbaCollection', /useAbaUnsaved\(\(\) => Boolean\(draft[\s\S]*?fingerprint\(draft\) !== lastSavedFingerprintRef\.current\), savingSession \|\| autosaveStatus === 'salvando'\)/],
  ]) assert.match(await read('aba/' + name + '.jsx'), expected, name);
});
test('ACUP-012: registro só sinalizadores, limpeza ao desmontar e beforeunload condicionado à pendência', () => {
  assert.match(context, /createContext\(null\)/);
  assert.match(context, /typeof dirty === 'function' \? dirty\(\) : dirty/);
  assert.match(context, /register\?\.\(id, false, false, true\)/);
  assert.match(context, /if \(remove\) editors\.current\.delete\(id\)/);
  assert.match(context, /if \(!dirty\) return;[\s\S]*?addEventListener\('beforeunload', warn\)[\s\S]*?removeEventListener\('beforeunload', warn\)/);
  assert.match(context, /entry\.busy\)\) return;[\s\S]*?entry\.dirty\)\) setPending\(\(\) => action\);\r?\n\s*else action\(\)/);
  assert.match(context, /const keepEditing = \(\) => setPending\(null\)/);
  assert.match(context, /if \(busy \|\| !pending\) return;[\s\S]*?pending\(\)/);
  assert.match(context, /<AbaDialog title="Sair sem salvar\?" onClose=\{keepEditing\} busy=\{busy\}>/);
  assert.match(context, /<DismissPrompt discardLabel="Descartar e sair"/);
  assert.doesNotMatch(context + workspace, /window\.confirm|localStorage|sessionStorage/);
});
test('ACUP-012: saídas do Workspace e seleção inteira de paciente passam pelo mesmo guarda', async () => {
  assert.match(workspace, /<AbaUnsavedContext.Provider value=\{unsaved.register\}>/);
  assert.match(workspace, /beforeSelectPatient=\{unsaved.navigate\}/);
  assert.match(workspace, /onSwitchDiscipline=\{\(\) => unsaved.navigate\(onSwitchDiscipline\)\}/);
  assert.match(workspace, /onSignOut=\{\(\) => unsaved.navigate\(onSignOut\)\}/);
  for (const fn of ['handleTabChange', 'openPatientSession', 'openFromAlert']) {
    const section = workspace.slice(workspace.indexOf('  function ' + fn));
    assert.match(section.slice(0, section.indexOf('\r\n  }') > 0 ? section.indexOf('\r\n  }') : section.indexOf('\n  }')), /unsaved.navigate\(\(\) =>/);
  }
  const patient = await read('PatientStart.jsx');
  assert.equal((patient.match(/return beforeSelectPatient \? beforeSelectPatient\(select\) : select\(\)/g) || []).length, 2);
  assert.match(patient, /const select = async \(\) => \{\r?\n\s*selectPatient\(patient\)/);
  assert.match(await read('ui/DismissPrompt.jsx'), /discardLabel = 'Descartar e fechar'/);
});
const server = await createServer({ root: fileURLToPath(new URL('../..', import.meta.url)), server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
after(() => server.close());
const { LibraryContentFields } = await server.ssrLoadModule('/src/components/aba/AbaLibrary.jsx');
test('ACUP-012: três grupos de caixas preservam códigos, removem vazio e mantêm históricos sem expor código cru', () => {
  for (const [key, code] of [['goals', 'comunicar'], ['behaviorFunctions', 'fuga'], ['prompt_hierarchy', 'ajuda_visual']]) {
    let result;
    const props = { content: { [key]: ['legado'] }, fields: { [key]: 'Escolhas' }, onChange: (...args) => { result = args; } };
    const [group] = LibraryContentFields(props);
    assert.equal(group.type, 'fieldset');
    const labels = group.props.children[1];
    const input = labels.find(label => label.props.children[0].props.value === code).props.children[0];
    assert.equal(input.props.type, 'checkbox');
    input.props.onChange({ target: { checked: true } });
    assert.deepEqual(result, [key, [code, 'legado']]);
    props.content[key] = [code];
    const [next] = LibraryContentFields(props);
    next.props.children[1].find(label => label.props.children[0].props.value === code).props.children[0].props.onChange({ target: { checked: false } });
    assert.deepEqual(result, [key, undefined]);
    const html = renderToStaticMarkup(React.createElement(LibraryContentFields, { ...props, content: { [key]: ['legado'] } }));
    assert.match(html, /fora do catálogo atual/);
    assert.doesNotMatch(html, /multiple|>legado</);
  }
});

// QA (review da ACUP-012): nenhuma rota do Workspace troca de aba por fora do guarda.
test('QA: atalhos do painel e da coleta trocam de aba pelo guarda; setActiveTab só dentro de navigate ou depois da seleção guardada', () => {
  for (const [prop, tab] of [['onCollect', 'COLETA'], ['onPrograms', 'PROGRAMAS'], ['onResults', 'RESULTADOS'], ['onSessions', 'SESSOES'], ['onAllAlerts', 'ALERTAS'], ['onOpenSessions', 'SESSOES']]) {
    assert.ok(workspace.includes(`${prop}={() => handleTabChange(TABS.${tab})}`), `${prop} passa por handleTabChange`);
  }
  assert.doesNotMatch(workspace, /on[A-Z]\w*=\{\(\) => setActiveTab\((?!TABS\.PAINEL\))/, 'nenhum atalho chama setActiveTab direto');
  assert.equal((workspace.match(/onSelectPatient=\{\(\) => setActiveTab\(TABS\.PAINEL\)\}/g) || []).length, 1, 'só o retorno da seleção já guardada');
  assert.ok(workspace.includes('beforeSelectPatient={unsaved.navigate}'));
});
