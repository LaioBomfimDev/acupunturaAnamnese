import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

// Auditoria de segurança 2026-08-11, achados M1/item 5 (XSS): a lógica de
// sanitizeHtml() antes de dangerouslySetInnerHTML está duplicada em vários
// componentes de relatório em vez de numa biblioteca única — o que já
// causou uma divergência real (PsychologyNeuroReport.jsx não filtrava
// javascript: em href/src, ao contrário dos demais). Este teste garante
// paridade: todo arquivo que sanitiza HTML antes de renderizar precisa
// bloquear tanto atributos on* quanto URLs javascript:.

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const FILES_WITH_SANITIZE_HTML = [
  'src/components/panels/Relatorio.jsx',
  'src/components/psychology/PsychologyRelatorio.jsx',
  'src/components/psychology/PsychologyNeuroReport.jsx',
  'src/components/anamnese/DisciplineRelatorio.jsx',
];

let sources;

before(async () => {
  sources = await Promise.all(
    FILES_WITH_SANITIZE_HTML.map(file => readFile(path.join(frontendRoot, file), 'utf8')),
  );
});

test('todo sanitizeHtml local remove atributos on* (event handlers)', () => {
  sources.forEach((source, i) => {
    assert.match(
      source,
      /startsWith\('on'\)/,
      `${FILES_WITH_SANITIZE_HTML[i]}: sanitizeHtml precisa remover atributos on*`,
    );
  });
});

test('todo sanitizeHtml local bloqueia javascript: em href/src/xlink:href', () => {
  sources.forEach((source, i) => {
    assert.match(
      source,
      /javascript:/i,
      `${FILES_WITH_SANITIZE_HTML[i]}: sanitizeHtml precisa bloquear URLs javascript: em href/src`,
    );
  });
});
