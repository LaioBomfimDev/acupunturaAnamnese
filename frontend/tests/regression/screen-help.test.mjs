// ============================================================
// Ajuda "Como funciona" (2026-09-30): o parágrafo explicativo que abria
// cada aba da Gestão saiu da tela e foi para um painel lateral, com
// títulos fixos. Na mesma data seguiu para Evoluções, Pacientes da
// instituição e os editores da Agenda (Horários, Feriados, Configurar).
// Decisões:
// - cada aba tem o seu tópico, com os rótulos iguais aos da tela;
// - botão com texto ("Como funciona"), não só "?";
// - curadoria continua com a explicação aberta (AGENTS.md §8);
// - aviso que explica campo travado fica na tela (Meu cadastro).
// ============================================================

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const srcDir = path.join(root, 'src');

let server;
let help;
let ScreenHelp;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  help = await server.ssrLoadModule('/src/data/screenHelp.js');
  ScreenHelp = (await server.ssrLoadModule('/src/components/ui/ScreenHelp.jsx')).ScreenHelp;
});

after(async () => {
  await server?.close();
});

function tabIds(source) {
  const block = source.match(/const SECTIONS = \[([\s\S]*?)\];/)[1];
  return [...block.matchAll(/id: '([a-z]+)'/g)].map(match => match[1]);
}

// Todo tópico de ajuda do sistema, com um nome para a mensagem de erro.
function everyTopic() {
  return [
    ...Object.entries(help.GESTAO_HELP).map(([id, topic]) => [`Gestão/${id}`, topic]),
    ...Object.entries(help.GESTAO_PROFISSIONAL_HELP).map(([id, topic]) => [`Gestão pessoal/${id}`, topic]),
    ['Evoluções', help.EVOLUCOES_HELP],
    ['Pacientes', help.PACIENTES_HELP],
    ...Object.entries(help.AGENDA_HELP).map(([id, topic]) => [`Agenda/${id}`, topic]),
  ];
}

function allText(topic) {
  return help.HELP_SECTIONS
    .flatMap(section => [topic[section.key]].flat())
    .filter(Boolean)
    .join('\n');
}

test('toda aba da Gestão tem a sua ajuda', async () => {
  const gestao = await readFile(path.join(srcDir, 'components/panels/RelatoriosGestao.jsx'), 'utf8');
  const pessoal = await readFile(path.join(srcDir, 'components/panels/GestaoProfissional.jsx'), 'utf8');

  for (const [source, topics] of [[gestao, help.GESTAO_HELP], [pessoal, help.GESTAO_PROFISSIONAL_HELP]]) {
    for (const id of tabIds(source)) {
      const topic = topics[id];
      assert.ok(topic, `aba ${id} sem ajuda`);
      assert.ok(topic.title && topic.summary, `ajuda de ${id} sem título ou "O que é"`);
    }
    assert.match(source, /<ScreenHelp topic=\{GESTAO(?:_PROFISSIONAL)?_HELP\[section\]\} \/>/);
  }
});

test('ajuda só usa as seções fixas, na mesma ordem', () => {
  const allowed = new Set(['title', ...help.HELP_SECTIONS.map(section => section.key)]);
  assert.deepEqual(help.HELP_SECTIONS.map(section => section.title), [
    'O que é', 'O que dá pra fazer', 'Como ler', 'Quem vê e quem altera', 'Bom saber',
  ]);
  for (const [id, topic] of everyTopic()) {
    assert.ok(topic.title && topic.summary, `ajuda de ${id} sem título ou "O que é"`);
    for (const key of Object.keys(topic)) {
      assert.ok(allowed.has(key), `ajuda de ${id} com seção desconhecida: ${key}`);
    }
  }
});

test('texto da ajuda usa os nomes atuais da tela, em pt-BR', () => {
  for (const [id, topic] of everyTopic()) {
    const text = allText(topic);
    assert.doesNotMatch(text, /\bitems\b/i, `ajuda de ${id} com "items"`);
    assert.doesNotMatch(text, /\w\(s\)/, `ajuda de ${id} com plural "(s)"`);
    // Status antigo: hoje a Agenda chama de "Cancelado pelo paciente".
    assert.doesNotMatch(text, /faltou com aviso/i, `ajuda de ${id} com status antigo`);
  }
  assert.match(allText(help.GESTAO_HELP.faltosos), /Cancelado pelo paciente/);
  assert.match(allText(help.GESTAO_HELP.faltosos), /Não compareceu/);
});

test('o parágrafo explicativo saiu do topo das abas', async () => {
  for (const name of ['RelatoriosGestao.jsx', 'GestaoProfissional.jsx', 'PersonalizarClinica.jsx', 'MeuCadastro.jsx']) {
    const source = await readFile(path.join(srcDir, 'components/panels', name), 'utf8');
    assert.doesNotMatch(source, /<p className="gt-note">\r?\n/, `${name} ainda abre com parágrafo explicativo`);
  }
  // O aviso do campo travado continua visível, junto dos campos.
  const cadastro = await readFile(path.join(srcDir, 'components/panels/MeuCadastro.jsx'), 'utf8');
  assert.match(cadastro, /Só leitura · quem altera é a administração/);
});

test('botão diz "Como funciona" e o painel só aparece quando aberto', () => {
  const html = renderToStaticMarkup(React.createElement(ScreenHelp, { topic: help.GESTAO_HELP.faltosos }));
  assert.match(html, /Como funciona/);
  assert.match(html, /aria-haspopup="dialog"/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /help-drawer/);
  assert.equal(renderToStaticMarkup(React.createElement(ScreenHelp, { topic: null })), '');
});

test('painel de ajuda fecha com Esc, clique fora e ×', async () => {
  const source = await readFile(path.join(srcDir, 'components/ui/ScreenHelp.jsx'), 'utf8');
  assert.match(source, /useDismiss\(\{ open, onClose: close \}\)/);
  assert.match(source, /\{\.\.\.dismiss\.backdropProps\}/);
  assert.match(source, /aria-label="Fechar ajuda"/);
});

test('curadoria não usa o botão de ajuda: explicação fica aberta na tela', async () => {
  for (const name of [
    'components/panels/CurationPointsBrowser.jsx',
    'components/panels/CurationSections.jsx',
    'components/panels/KnowledgeAdminPanel.jsx',
    'components/panels/PsychAnamneseCurationPanel.jsx',
  ]) {
    const source = await readFile(path.join(srcDir, name), 'utf8');
    assert.doesNotMatch(source, /ScreenHelp/, `${name} escondeu a explicação da curadoria`);
  }
});

const SCREENS = [
  ['components/evolutions/EvolutionsScreen.jsx', 'EVOLUCOES_HELP'],
  ['components/ClinicPatientsPanel.jsx', 'PACIENTES_HELP'],
  ['components/panels/agenda/ScheduleEditor.jsx', 'AGENDA_HELP.horarios'],
  ['components/panels/agenda/HolidaysEditor.jsx', 'AGENDA_HELP.feriados'],
  ['components/panels/agenda/AgendaSettingsEditor.jsx', 'AGENDA_HELP.configurar'],
];

test('Evoluções, Pacientes e editores da Agenda têm "Como funciona" no lugar do parágrafo', async () => {
  for (const [name, topic] of SCREENS) {
    const source = await readFile(path.join(srcDir, name), 'utf8');
    assert.ok(source.includes(`<ScreenHelp topic={${topic}} />`), `${name} sem o botão de ajuda`);
    assert.doesNotMatch(source, /className="(?:hub-note|agj-note)"/, `${name} ainda abre com parágrafo explicativo`);
  }
});

test('o que muda o que dá pra fazer continua visível na tela', async () => {
  // Evoluções: atendimento de colega segue com cadeado, legenda e aviso.
  const evolucoes = await readFile(path.join(srcDir, 'components/evolutions/EvolutionsScreen.jsx'), 'utf8');
  assert.match(evolucoes, /de outro profissional<\/span>/);
  assert.match(evolucoes, /Só o profissional do\s+atendimento escreve a evolução\./);

  // Horários: quem cadastra não pode achar que se tranca fora da jornada.
  const horarios = await readFile(path.join(srcDir, 'components/panels/agenda/ScheduleEditor.jsx'), 'utf8');
  assert.match(horarios, /horário normal, não um limite/);
  // Feriados e Configurar agenda mantêm o subtítulo curto.
  const feriados = await readFile(path.join(srcDir, 'components/panels/agenda/HolidaysEditor.jsx'), 'utf8');
  assert.match(feriados, /Avisos na agenda, não um bloqueio/);
  const configurar = await readFile(path.join(srcDir, 'components/panels/agenda/AgendaSettingsEditor.jsx'), 'utf8');
  assert.match(configurar, /Vale para a equipe toda · só o Admin da clínica altera/);
});

test('botão de adicionar jornada usa plural de verdade, não "dia(s)"', async () => {
  const horarios = await readFile(path.join(srcDir, 'components/panels/agenda/ScheduleEditor.jsx'), 'utf8');
  assert.doesNotMatch(horarios, /dia\(s\)/);
  assert.match(horarios, /'Adicionar em 1 dia'/);
  assert.match(horarios, /`Adicionar em \$\{form\.weekdays\.length\} dias`/);
});

test('ajuda das novas telas confere com as regras do sistema', () => {
  const evolucoes = allText(help.EVOLUCOES_HELP);
  assert.match(evolucoes, /22\/09\/2026/);
  assert.match(evolucoes, /30 dias/);
  assert.match(evolucoes, /recepção não usa esta tela/);
  // Exclusão de paciente: só a administração exclui de vez.
  assert.match(allText(help.PACIENTES_HELP), /Excluir paciente de vez é só da administração/);
  // Feriado é aviso, não bloqueio; jornada é normal, não limite.
  assert.match(allText(help.AGENDA_HELP.feriados), /aviso, não bloqueio/);
  assert.match(allText(help.AGENDA_HELP.horarios), /não o que é permitido/);
});
