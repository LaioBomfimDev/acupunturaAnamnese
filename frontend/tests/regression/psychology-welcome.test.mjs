// ============================================================
// Boas-vindas da Psicologia (Painel), 16/10/2026.
// Pedido da administradora: a tela estava "feia e sem cor". Ela escolheu,
// entre três prévias, a faixa do paciente na cor da tela (A) com os três
// atalhos da anamnese (C) e os percursos em cartões grandes (A). Antes de
// mexer, sempre três prévias (memória do projeto).
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
let server;
let chooser;
let formRoute;
let routeSpec;
let profiles;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  chooser = await server.ssrLoadModule('/src/components/psychology/PsychologyPathChooser.jsx');
  formRoute = await server.ssrLoadModule('/src/utils/formRoute.js');
  routeSpec = await server.ssrLoadModule('/src/data/psychologyRouteSpec.js');
  profiles = await server.ssrLoadModule('/src/data/psychologyIntakeProfiles.js');
});

after(async () => {
  await server?.close();
});

function render(props) {
  return renderToStaticMarkup(React.createElement(chooser.PsychologyPathChooser, {
    selectedPatient: { id: 'p1', name: 'Ana Beatriz Moura' },
    patientAge: '34',
    onSelectIntakeProfile: () => {},
    onOpenTab: () => {},
    ...props,
  }));
}

test('faixa do paciente e atalhos com a mesma conta do "Pede atenção"', () => {
  const session = {
    intakeProfile: 'adulto_feminino',
    fields: { demanda: 'Ansiedade', motivoBusca: 'Indicação médica' },
    selectedMap: {},
    contextModules: {},
    complementaryQuestions: [
      { id: 'c1', question: 'Apetite?', answer: 'Diminuiu' },
      { id: 'c2', question: 'Atividade física?', answer: '' },
    ],
  };
  const route = formRoute.buildAnamneseRoute({
    ...routeSpec.PSYCHOLOGY_ROUTE_SPEC,
    sections: profiles.getPsychologyProfileSections('adulto_feminino'),
  }, session);
  const { done, total } = formRoute.summarizeRoute(route);
  const html = render({ session, route });

  assert.match(html, /<span class="psi-welcome-avatar" aria-hidden="true">AB<\/span>/);
  assert.match(html, /<h2>Ana Beatriz Moura<\/h2>/);
  assert.match(html, /34 anos · Psicologia/);
  assert.match(html, /<span class="psi-welcome-pill">Anamnese adulta — mulher<\/span>/);
  assert.match(html, />Continuar anamnese →<\/button>/);
  // Atalho da anamnese = "Faltam N itens da anamnese · done de total" do menu.
  assert.match(html, new RegExp(`${done}<small> de ${total} itens</small>`));
  assert.match(html, /1<small> de 2 respondidas<\/small>/);
  assert.equal((html.match(/class="psi-welcome-tile"/g) || []).length, 3);
  // Percurso em uso marcado no cartão.
  assert.match(html, /class="psi-welcome-card in-use"[\s\S]*?<span class="psi-welcome-badge">Em uso<\/span><b>Anamnese adulto<\/b>/);
});

test('sem anamnese definida: sem atalhos nem "Continuar", percursos para escolher', () => {
  const html = render({ session: { intakeProfile: null, fields: {} }, route: null });
  assert.match(html, /<span class="psi-welcome-pill">Anamnese ainda não definida<\/span>/);
  assert.doesNotMatch(html, /Continuar anamnese/);
  assert.doesNotMatch(html, /psi-welcome-tile/);
  assert.equal((html.match(/>Escolher →</g) || []).length, 2);
  assert.match(html, /<h3>Escolha o percurso<\/h3>/);
});

test('aba Anamnese adulto sem percurso: título da aba, sem atalhos, já na segunda etapa', () => {
  const html = render({ session: { intakeProfile: null, fields: {} }, route: null, fixedPath: 'adulto' });
  assert.match(html, /<h3>Anamnese adulto<\/h3>/);
  assert.match(html, /<h4>Escolha a anamnese adulta<\/h4>/);
  assert.doesNotMatch(html, /psi-welcome-back/, 'na aba do percurso não há "Voltar"');
});

// Pedido de 16/10/2026: no Painel, os mesmos botões do menu (Infantil,
// Adulto e Avaliação), em cartões iguais aos das anamneses e com os
// mesmos ícones. A lista vem do próprio menu (menuGroups).
test('cartões com os mesmos itens dos grupos do menu', async () => {
  const anamnese = await server.ssrLoadModule('/src/data/psychologyAnamnese.js');
  const T = anamnese.PSYCHOLOGY_TABS;
  const menuGroups = [
    { title: 'Infantil', tabs: [T.ANAMNESE_INFANTIL, T.ENTREVISTA_PAIS] },
    { title: 'Adulto', tabs: [T.ANAMNESE_ADULTO, T.ENTREVISTA_FAMILIAR] },
    { title: 'Avaliação', tabs: [T.ENTREVISTA_RASTREIO, T.PERGUNTAS_COMPLEMENTARES, T.ESCALAS] },
  ];
  const html = render({
    session: { intakeProfile: null, fields: {}, complementaryQuestions: [] },
    route: null,
    menuGroups,
  });
  const groups = [...html.matchAll(/<p class="psi-welcome-group-title">([^<]+)<\/p>/g)].map(m => m[1]);
  assert.deepEqual(groups, ['Infantil', 'Adulto', 'Avaliação']);
  const titles = [...html.matchAll(/class="psi-welcome-card[^"]*"[^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(m => m[1]);
  assert.deepEqual(titles, [
    'Anamnese infantil', 'Entrevista pais e professores',
    'Anamnese adulto', 'Entrevista familiar / laboral',
    'Entrevista de rastreio', 'Perguntas complementares', 'Escalas',
  ]);
  assert.equal((html.match(/class="nav-icon"/g) || []).length, 7, 'o mesmo ícone do menu em cada cartão');
  assert.equal((html.match(/>Escolher →</g) || []).length, 2, 'anamnese escolhe o percurso aqui');
  assert.equal((html.match(/>Abrir →</g) || []).length, 5, 'os demais abrem a parte');
  assert.match(html, /Quem responde: Familiares, pessoas próximas e colegas de trabalho\./);
  assert.match(html, /Quem responde: O próprio paciente\. Aguardando o modelo da clínica\./);
  assert.match(html, /Nenhuma pergunta ainda\./);
  assert.match(html, /\d+ escalas para aplicar no consultório ou enviar para casa\./);
  assert.match(html, /class="psi-welcome-group psi-welcome-group--wide" aria-label="Avaliação"/);

  const workspace = await readFile(path.join(root, 'src/components/PsychologyWorkspace.jsx'), 'utf8');
  assert.match(workspace, /const PSYCHOLOGY_WELCOME_GROUPS = PSYCHOLOGY_NAV_GROUPS\r?\n\s+\.filter\(group => \['Infantil', 'Adulto', 'Avaliação'\]\.includes\(group\.title\)\);/,
    'os cartões saem da lista do menu, nunca de uma cópia');
  const sidebar = await readFile(path.join(root, 'src/components/Sidebar.jsx'), 'utf8');
  assert.match(sidebar, /export function NavIcon\(\{ name \}\)/);
});

test('cor da tela, nunca cor fixa; a área passa a navegação e a conta do menu', async () => {
  const css = await readFile(path.join(root, 'src/styles/psychologyWelcome.css'), 'utf8');
  assert.match(css, /\.psi-welcome-hero \{[^}]*background: linear-gradient\(125deg, var\(--r1-accent-strong\) 0%, var\(--r1-accent\) 100%\);/);
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b|--r1-navy|--r1-gold|--r1-surface-inverse/, 'só tokens');

  const workspace = await readFile(path.join(root, 'src/components/PsychologyWorkspace.jsx'), 'utf8');
  const choosers = workspace.match(/<PsychologyPathChooser\b[\s\S]*?\/>/g) || [];
  assert.equal(choosers.length, 3);
  for (const block of choosers) {
    assert.match(block, /route=\{anamneseRoute\}/, 'mesmo roteiro do "Pede atenção"');
    assert.match(block, /onOpenTab=\{handleTabChange\}/);
    assert.match(block, /menuGroups=\{PSYCHOLOGY_WELCOME_GROUPS\}/);
  }
});
