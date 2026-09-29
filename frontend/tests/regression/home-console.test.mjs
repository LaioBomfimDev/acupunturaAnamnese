// ============================================================
// Tela inicial (HomeConsole)
//
// O que estes testes protegem (2026-09-29):
//  * as áreas de atendimento aparecem só no conteúdo — a barra lateral
//    não repete a lista (antes o admin que atende via as mesmas áreas
//    duas vezes);
//  * a saudação fica no conteúdo, acima do título, e muda pelo horário
//    (bom dia / boa tarde / boa noite), não um "Oi" fixo na lateral.
// ============================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';

const { greetingForHour, greetingFor } = await import(
  new URL('../../src/utils/greeting.js', import.meta.url).href
);

const homeSource = await readFile(
  new URL('../../src/components/HomeConsole.jsx', import.meta.url),
  'utf8',
);

function between(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `trecho ${start}…${end} não encontrado`);
  return source.slice(from, to);
}

test('saudação muda pelo horário local', () => {
  assert.equal(greetingForHour(5), 'Bom dia');
  assert.equal(greetingForHour(11), 'Bom dia');
  assert.equal(greetingForHour(12), 'Boa tarde');
  assert.equal(greetingForHour(17), 'Boa tarde');
  assert.equal(greetingForHour(18), 'Boa noite');
  assert.equal(greetingForHour(23), 'Boa noite');
  assert.equal(greetingForHour(0), 'Boa noite');
  assert.equal(greetingForHour(4), 'Boa noite');
});

test('saudação usa o nome e cai em "profissional" sem nome', () => {
  assert.equal(greetingFor('Denise', new Date(2026, 8, 29, 9, 0)), 'Bom dia, Denise');
  assert.equal(greetingFor('', new Date(2026, 8, 29, 15, 0)), 'Boa tarde, profissional');
});

test('barra lateral não repete as áreas de atendimento nem a saudação', () => {
  const rail = between(homeSource, '<aside className="hc-rail">', '</aside>');
  assert.doesNotMatch(rail, /attendable/);
  assert.doesNotMatch(rail, /Suas áreas/);
  assert.doesNotMatch(rail, /hc-greeting|Oi, /);
});

test('saudação fica no conteúdo, acima do título', () => {
  const main = between(homeSource, '<main className="hc-main">', '</main>');
  const greeting = main.indexOf('greetingFor(therapistName)');
  const heading = main.indexOf('<h2>{copy.heading}</h2>');
  assert.ok(greeting >= 0, 'saudação ausente do conteúdo');
  assert.ok(heading > greeting, 'saudação precisa vir antes do título');
});
