import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Botões de troca, opção C (escolhida em 10/10/2026): Evoluções
// (Escrever | Ver) e Importáveis (Formulários | Envios e respostas)
// viram abas de pasta com o número grande na frente, o nome e uma linha
// de resumo — quanto tem do outro lado antes de abrir.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = file => readFile(path.join(root, 'src', file), 'utf8');

let server;
let queue;
let review;
let forms;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  [queue, review, forms] = await Promise.all([
    server.ssrLoadModule('/src/utils/evolutionQueue.js'),
    server.ssrLoadModule('/src/utils/evolutionReview.js'),
    server.ssrLoadModule('/src/utils/patientForms.js'),
  ]);
});

after(async () => {
  await server?.close();
});

const NOW = new Date(2026, 9, 9, 15, 0);
const item = (id, day, professional = 'eu') => ({
  appointment_id: id, starts_at: new Date(2026, 9, day, 10).toISOString(), professional_id: professional,
});

test('Escrever evoluções: só o que a pessoa pode escrever, e quantos são de hoje', () => {
  const items = [item('a', 9), item('b', 9), item('c', 8), item('d', 9, 'colega'), item('e', 7)];
  const isWritable = entry => entry.professional_id === 'eu';
  const summary = queue.writeTabSummary(items, { done: new Set(['b']), isWritable, now: NOW });
  assert.deepEqual(summary, { pending: 3, today: 1 }, 'colega (cadeado) e evoluído agora não contam');
  assert.equal(queue.writeTabHint(summary), 'na sua fila · 1 de hoje');
  assert.equal(queue.writeTabHint({ pending: 2, today: 0 }), 'na sua fila');
  assert.equal(queue.writeTabHint({ pending: 0, today: 0 }), 'Nenhuma pendência sua');
});

test('Ver evoluções: os dois números da conferência, no mês', () => {
  assert.equal(review.reviewTabHint({ total: 48, pending: 5 }, NOW), 'concluídos em outubro · 5 falta evoluir');
  assert.equal(review.reviewTabHint({ total: 1, pending: 0 }, NOW), 'concluído em outubro · tudo evoluído');
});

test('Importáveis: formulários em uso e envios que valem, com plural certo', () => {
  const list = [{ status: 'published' }, { status: 'published' }, { status: 'draft' }, { status: 'archived' }];
  assert.deepEqual(forms.formsTabSummary(list), { count: 3, hint: '2 publicados · 1 rascunho' });
  assert.deepEqual(forms.formsTabSummary([{ status: 'published' }]), { count: 1, hint: '1 publicado' });

  const sends = forms.sendsTabSummary([
    { status: 'submitted' }, { status: 'submitted' }, { status: 'pending' }, { status: 'cancelled' },
  ], NOW);
  assert.equal(sends.count, 3, 'cancelado não conta');
  assert.equal(sends.hint, '2 respondidos · 1 aguardando');
  assert.equal(forms.sendsTabSummary([], NOW).hint, 'nada enviado ainda');
});

test('as duas telas usam o mesmo componente; sem número ainda, traço — nunca zero', async () => {
  const tabs = await read('components/ui/FolderTabs.jsx');
  assert.match(tabs, /aria-pressed=\{value === option\.id\}/);
  assert.match(tabs, /\{option\.number \?\? '–'\}/);

  const screen = await read('components/evolutions/EvolutionsScreen.jsx');
  assert.match(screen, /<FolderTabs\r?\n\s+label="O que fazer em Evoluções"/);
  assert.match(screen, /number: monthStats\?\.total \?\? null/);
  assert.doesNotMatch(screen, /evs-mode/, 'os botões antigos saíram');
  // A fila continua escondida, não desmontada, ao trocar de aba.
  assert.match(screen, /<div className="evs-layout" hidden=\{mode !== 'escrever'\}>/);

  const importaveis = await read('components/patientForms/Importaveis.jsx');
  assert.match(importaveis, /<FolderTabs\r?\n\s+label="Parte da aba Importáveis"/);
  assert.match(importaveis, /formsTabSummary\(forms\)/);
  assert.match(importaveis, /sendsTabSummary\(assignments\)/);

  const css = await read('styles/folderTabs.css');
  // Celular e tablet: dividem a largura, sem nada largo que role de lado.
  assert.match(css, /@media \(max-width: 1024px\) \{\r?\n\s+\.folder-tabs \{\r?\n\s+display: grid;\r?\n\s+grid-auto-columns: minmax\(0, 1fr\);/);
  assert.match(css, /\.folder-tab\[aria-pressed='true'\] \{[\s\S]*?box-shadow: inset 0 3px 0 var\(--r1-accent\);/, 'aba aberta segue a cor da clínica');
});
