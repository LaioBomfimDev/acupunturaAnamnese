import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  DISCIPLINES,
  DISCIPLINE_IDS,
  buildHubCards,
  canEnterDiscipline,
  getDiscipline,
  resolveUserDisciplines,
} from '../../src/data/disciplines.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('catálogo de disciplinas: ids únicos, textos completos e acupuntura disponível', () => {
  assert.equal(new Set(DISCIPLINE_IDS).size, DISCIPLINES.length);
  for (const discipline of DISCIPLINES) {
    assert.ok(discipline.label && discipline.subtitle && discipline.description, discipline.id);
  }
  // MTC não pode regredir em nenhuma fase.
  assert.equal(getDiscipline('acupuntura')?.available, true);
  // Fase 5: workspace de Psicologia (esqueleto) no ar.
  assert.equal(getDiscipline('psicologia')?.available, true);
  // 07/08/2026: fisioterapia e nutrição ganharam anamnese no workspace
  // genérico (evolução e relatório ainda são placeholders).
  assert.equal(getDiscipline('fisioterapia')?.available, true);
  assert.equal(getDiscipline('nutricao')?.available, true);
});

test('resolveUserDisciplines: coluna do banco é a fonte da verdade e ids inválidos são filtrados', () => {
  assert.deepEqual(
    resolveUserDisciplines({ disciplines: ['psicologia', 'inexistente'] }),
    ['psicologia'],
  );
  assert.deepEqual(
    resolveUserDisciplines({ disciplines: DISCIPLINE_IDS }),
    DISCIPLINE_IDS,
  );
});

test('resolveUserDisciplines: fallback sem a coluna preserva acupuntura (ninguém perde acesso na virada)', () => {
  assert.deepEqual(resolveUserDisciplines({}), ['acupuntura']);
  assert.deepEqual(resolveUserDisciplines(null), ['acupuntura']);
  assert.deepEqual(resolveUserDisciplines({ disciplines: [] }), ['acupuntura']);
  assert.deepEqual(
    resolveUserDisciplines({ profession: 'psicologo' }),
    ['acupuntura', 'psicologia'],
  );
  assert.deepEqual(resolveUserDisciplines({ profession: 'acupunturista' }), ['acupuntura']);
});

test('buildHubCards: mostra TODAS as disciplinas — liberadas em cor, demais em cinza (locked)', () => {
  const cards = buildHubCards({ disciplines: ['acupuntura'] });
  assert.equal(cards.length, DISCIPLINES.length);
  const byId = Object.fromEntries(cards.map(card => [card.id, card.state]));
  assert.equal(byId.acupuntura, 'enabled');
  assert.equal(byId.psicologia, 'locked');

  // Multi-disciplina: as quatro têm workspace desde 07/08/2026, então
  // disciplina liberada no perfil abre. O estado 'soon' segue existindo
  // para a próxima disciplina que entrar antes da tela ficar pronta.
  const allCards = buildHubCards({ disciplines: DISCIPLINE_IDS });
  const allById = Object.fromEntries(allCards.map(card => [card.id, card.state]));
  for (const id of DISCIPLINE_IDS) {
    assert.equal(allById[id], 'enabled', `${id} liberada no perfil deve abrir`);
  }
  // O estado 'soon' (liberada no perfil, sem workspace) segue implementado
  // em buildHubCards, mas hoje nenhuma disciplina está nessa situação —
  // volta a ser exercitado quando entrar a próxima disciplina.
});

test('canEnterDiscipline: só entra em disciplina liberada NO PERFIL e com workspace construído', () => {
  assert.equal(canEnterDiscipline({ disciplines: ['acupuntura'] }, 'acupuntura'), true);
  // Fase 5: psicologia liberada no perfil abre o workspace próprio.
  assert.equal(canEnterDiscipline({ disciplines: DISCIPLINE_IDS }, 'psicologia'), true);
  // 07/08/2026: fisioterapia e nutrição passaram a ter workspace genérico.
  assert.equal(canEnterDiscipline({ disciplines: DISCIPLINE_IDS }, 'fisioterapia'), true);
  assert.equal(canEnterDiscipline({ disciplines: DISCIPLINE_IDS }, 'nutricao'), true);
  // Liberada no perfil não basta: sem workspace o hub continua sem abrir.
  assert.equal(canEnterDiscipline({ disciplines: ['fisioterapia'] }, 'inexistente'), false);
  // Psicologia NÃO liberada no perfil continua fechada mesmo com workspace pronto.
  assert.equal(canEnterDiscipline({ disciplines: ['acupuntura'] }, 'psicologia'), false);
  // Não liberada para o perfil.
  assert.equal(canEnterDiscipline({ disciplines: ['psicologia'] }, 'acupuntura'), false);
  // Valor inválido/ausente (ex.: sessionStorage antigo).
  assert.equal(canEnterDiscipline({ disciplines: ['acupuntura'] }, null), false);
  assert.equal(canEnterDiscipline({ disciplines: ['acupuntura'] }, 'qualquer'), false);
});

test('migração 20260707 existe e cobre coluna, backfill de acupuntura e contas de teste', async () => {
  // 10/09/2026: Neuropsicologia entrou como disciplina nova — migração
  // ADITIVA própria, não edita o arquivo original de 2026-07-07.
  const [sql, neuropsicologiaSql] = await Promise.all([
    readFile(
      path.resolve(root, '../supabase/migrations/20260707_profile_disciplines.sql'),
      'utf8',
    ),
    readFile(
      path.resolve(root, '../supabase/migrations/20260910_neuropsicologia_discipline.sql'),
      'utf8',
    ),
  ]);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS disciplines TEXT\[\]/);
  assert.match(sql, /ARRAY\['acupuntura'\]/);
  for (const username of ['admlaio', 'admdeni', 'admkaren']) {
    assert.ok(sql.includes(username), `migração deve liberar todas as disciplinas para ${username}`);
  }
  // Toda disciplina do catálogo aparece na migração original ou numa
  // extensão aditiva posterior (backfill por profissão/teste).
  for (const id of DISCIPLINE_IDS) {
    const presentInOriginal = sql.includes(id);
    const presentInLaterMigration = neuropsicologiaSql.includes(id);
    assert.ok(
      presentInOriginal || presentInLaterMigration,
      `disciplina ${id} ausente da migração original e das extensões aditivas`,
    );
  }
});
