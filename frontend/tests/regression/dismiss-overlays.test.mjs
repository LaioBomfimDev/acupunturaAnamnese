// ============================================================
// Janelas sobrepostas fecham com Esc, clique fora e o botão de fechar.
//
// Antes (2026-09-30) várias janelas só fechavam no ×/Fechar: Editar
// atendimento, Registrar atendimento realizado, Aniversários,
// Compartilhar agenda, Enviar paciente, prontuário compartilhado,
// exclusão de paciente, painéis do SuperAdm... E o "Corrigir a IA"
// fechava no clique fora jogando fora a correção já digitada.
//
// Regra: toda janela sobreposta usa hooks/useDismiss.js; formulário usa
// guardUnsaved e mostra <DismissPrompt> em vez de descartar calado.
// As exceções abaixo são de propósito e dizem por quê.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = path.join(root, 'src');

let server;
let layers;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  layers = await server.ssrLoadModule('/src/utils/dismissLayers.js');
});

after(async () => {
  await server?.close();
});

async function listJsx(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listJsx(full);
    return entry.name.endsWith('.jsx') ? [full] : [];
  }));
  return files.flat();
}

// Marcas de janela sobreposta (fundo que cobre a tela).
const OVERLAY_MARKERS = /aria-modal="true"|className="(?:ag-dialog-overlay|cp-modal-overlay|admin-modal-backdrop|r1-modal|help-drawer-scrim)\b/;

// Exceções de propósito — cada uma com o motivo.
const NOT_DISMISSABLE = {
  // Bloqueio de conta e troca obrigatória de senha: não pode fechar.
  'components/AccessBlocked.jsx': 'bloqueio obrigatório',
  'components/FirstAccessPasswordChange.jsx': 'troca de senha obrigatória',
};
const OWN_DISMISS = {
  // Curadoria com teclado próprio (setas, zoom da fonte) que já fecha com
  // Esc e clique fora — conferido abaixo que continua assim.
  'components/panels/KnowledgeAdminPanel.jsx': 'Esc e clique fora próprios',
  'components/panels/PointReviewDialog.jsx': 'Esc (fecha o zoom primeiro) e clique fora próprios',
};

function rel(file) {
  return path.relative(srcDir, file).split(path.sep).join('/');
}

test('Esc fecha só a janela de cima da pilha', () => {
  layers.pushLayer('ficha');
  layers.pushLayer('enviar');
  assert.equal(layers.isTopLayer('enviar'), true);
  assert.equal(layers.isTopLayer('ficha'), false);
  layers.removeLayer('enviar');
  assert.equal(layers.isTopLayer('ficha'), true);
  layers.removeLayer('ficha');
  assert.equal(layers.openLayerCount(), 0);
});

test('reabrir a mesma janela não duplica a camada', () => {
  layers.pushLayer('a');
  layers.pushLayer('b');
  layers.pushLayer('a');
  assert.equal(layers.isTopLayer('a'), true);
  layers.removeLayer('a');
  assert.equal(layers.isTopLayer('b'), true);
  layers.removeLayer('b');
  assert.equal(layers.openLayerCount(), 0);
});

test('Esc já tratado (lista aberta) ou no meio de acento não fecha a janela', () => {
  assert.equal(layers.isDismissKey({ key: 'Escape' }), true);
  assert.equal(layers.isDismissKey({ key: 'Esc' }), true);
  assert.equal(layers.isDismissKey({ key: 'Escape', defaultPrevented: true }), false);
  assert.equal(layers.isDismissKey({ key: 'Escape', isComposing: true }), false);
  assert.equal(layers.isDismissKey({ key: 'Enter' }), false);
  assert.equal(layers.isDismissKey(null), false);
});

test('toda janela sobreposta fecha com Esc e clique fora', async () => {
  const files = await listJsx(path.join(srcDir, 'components'));
  const missing = [];
  let checked = 0;

  for (const file of files) {
    const name = rel(file);
    const source = await readFile(file, 'utf8');
    if (!OVERLAY_MARKERS.test(source)) continue;
    if (NOT_DISMISSABLE[name]) continue;
    checked += 1;

    if (OWN_DISMISS[name]) {
      assert.match(source, /'Escape'/, `${name} perdeu o Esc`);
      assert.match(source, /event\.target === event\.currentTarget/, `${name} perdeu o clique fora`);
      continue;
    }

    const usesHook = /useDismiss\(/.test(source) && /\{\.\.\.[A-Za-z]*[dD]ismiss\.backdropProps\}/.test(source);
    if (!usesHook) missing.push(name);
  }

  assert.ok(checked >= 15, `esperava achar as janelas do sistema, achei ${checked}`);
  assert.deepEqual(missing, [], `janelas sem Esc/clique fora: ${missing.join(', ')}`);
});

test('formulário protegido mostra a pergunta antes de descartar', async () => {
  const files = await listJsx(path.join(srcDir, 'components'));
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    if (!/guardUnsaved:\s*(?!false)/.test(source)) continue;
    assert.match(source, /<DismissPrompt dismiss=\{/, `${rel(file)} protege o formulário mas não mostra a pergunta`);
    assert.match(source, /\{\.\.\.[A-Za-z]*[dD]ismiss\.panelProps\}/, `${rel(file)} não marca o que foi digitado`);
  }
});

test('formulários que perdiam dado ao fechar ficaram protegidos', async () => {
  const guarded = [
    'components/panels/agenda/EditAppointmentPanel.jsx',
    'components/panels/agenda/RegisterCompletedDialog.jsx',
    'components/SharePatientDialog.jsx',
    'components/ui/AiCorrectionButton.jsx',
    'components/panels/ClinicAdminPanel.jsx',
    'components/panels/SuperAdminPanel.jsx',
  ];
  for (const name of guarded) {
    const source = await readFile(path.join(srcDir, name), 'utf8');
    assert.match(source, /guardUnsaved:\s*(true|!done)/, `${name} sem proteção de rascunho`);
  }

  // O "Corrigir a IA" fechava no clique fora jogando a correção fora.
  const ai = await readFile(path.join(srcDir, 'components/ui/AiCorrectionButton.jsx'), 'utf8');
  assert.doesNotMatch(ai, /onMouseDown=\{event => \{\r?\n\s*if \(event\.target === event\.currentTarget\) close\(\);/);
});

test('clique fora só conta quando começa e termina no fundo', async () => {
  const hook = await readFile(path.join(srcDir, 'hooks/useDismiss.js'), 'utf8');
  // Selecionar texto dentro do painel e soltar o mouse fora não fecha.
  assert.match(hook, /onMouseDown\(event\) \{\r?\n\s*pressStartedOnBackdrop\.current = event\.target === event\.currentTarget;/);
  assert.match(hook, /if \(startedOutside && event\.target === event\.currentTarget\) requestDismiss\(\);/);
  // Salvando/enviando segura a janela; Esc com a pergunta na tela não descarta.
  assert.match(hook, /if \(busy\) return;/);
  assert.match(hook, /if \(confirmingDiscard\) \{\r?\n\s*keepEditing\(\);/);
});

test('primeiro Esc na busca fecha só a lista, não a janela', async () => {
  const searchSelect = await readFile(path.join(srcDir, 'components/ui/SearchSelect.jsx'), 'utf8');
  assert.match(searchSelect, /event\.key === 'Escape' && open\) \{[\s\S]{0,200}event\.preventDefault\(\);/);
});
