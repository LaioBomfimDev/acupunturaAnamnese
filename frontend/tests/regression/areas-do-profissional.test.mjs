import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { canEnterDiscipline, resolveUserDisciplines } from '../../src/data/disciplines.js';
import { buildProfessionalCreatePayload } from '../../src/components/panels/professionalFormHelpers.js';

// 12/11/2026 (pedido da administradora, opção B): toda pessoa cadastrada
// nascia com "acupuntura" nas áreas — Laize (nutricionista) e Paulo
// (fisioterapeuta) estavam gravados como acupunturistas em produção.
// Eram duas causas somadas:
//   1. o gatilho normalize_profile_disciplines_not_null injetava
//      ARRAY['acupuntura'] sempre que disciplines chegava NULL, e a
//      criação de terapeuta manda NULL;
//   2. o fallback resolveUserDisciplines fazia o mesmo na tela;
//   3. não existia NENHUM caminho para corrigir depois do cadastro.
// Este teste trava as três pontas. Herança da virada MTC →
// multidisciplinar: não repor.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = path.resolve(root, '..');
const read = rel => readFile(path.join(root, rel), 'utf8');
const readRepo = rel => readFile(path.join(repo, rel), 'utf8');

test('a área vem da profissão, nunca acupuntura por padrão', () => {
  assert.deepEqual(resolveUserDisciplines({ role: 'therapist', profession: 'nutricionista' }), ['nutricao']);
  assert.deepEqual(resolveUserDisciplines({ role: 'therapist', profession: 'fisioterapeuta' }), ['fisioterapia']);
  assert.deepEqual(resolveUserDisciplines({ role: 'therapist', profession: 'psicologo' }), ['psicologia']);
  // Acupunturista de verdade continua recebendo acupuntura.
  assert.deepEqual(resolveUserDisciplines({ role: 'therapist', profession: 'acupunturista' }), ['acupuntura']);
});

test('sem profissão mapeada, nasce sem área nenhuma', () => {
  assert.deepEqual(resolveUserDisciplines({ role: 'therapist', profession: 'outro' }), []);
  assert.deepEqual(resolveUserDisciplines({ role: 'therapist' }), []);
  assert.deepEqual(resolveUserDisciplines({}), []);
});

test('a coluna vence a profissão, e recepção nunca tem área', () => {
  assert.deepEqual(
    resolveUserDisciplines({ role: 'therapist', profession: 'nutricionista', disciplines: ['psicologia', 'aba'] }),
    ['psicologia', 'aba'],
  );
  assert.deepEqual(
    resolveUserDisciplines({ role: 'receptionist', profession: 'nutricionista', disciplines: ['nutricao'] }),
    [],
  );
});

test('quem não tem a área não entra no workspace dela', () => {
  const nutri = { role: 'therapist', profession: 'nutricionista', disciplines: ['nutricao'] };
  assert.equal(canEnterDiscipline(nutri, 'nutricao'), true);
  assert.equal(canEnterDiscipline(nutri, 'acupuntura'), false);
  assert.equal(canEnterDiscipline({ role: 'therapist', profession: 'outro' }, 'acupuntura'), false);
});

test('criar terapeuta manda a lista vazia: quem decide é o gatilho', () => {
  const payload = buildProfessionalCreatePayload({
    email: 'nova@example.invalid', fullName: 'Nova Pessoa', role: 'therapist',
    profession: 'nutricionista', clinicId: '11111111-1111-4111-8111-111111111111',
  }, [{ id: '11111111-1111-4111-8111-111111111111', name: 'Clínica' }]);
  assert.deepEqual(payload.disciplines, []);
});

test('revisora sem profissão mapeada não vira acupunturista', async () => {
  const source = await read('src/components/panels/professionalFormHelpers.js');
  assert.ok(
    !/return mapped \? \[mapped\] : \['acupuntura'\]/.test(source),
    'resolveCreateDisciplines voltou a cair em acupuntura',
  );
});

test('nenhum fallback de tela volta a injetar acupuntura', async () => {
  const source = await read('src/data/disciplines.js');
  assert.ok(
    !/return mapped && mapped !== 'acupuntura'/.test(source),
    'resolveUserDisciplines voltou a somar acupuntura ao fallback',
  );
});

test('o gatilho do banco dá só a área da profissão', async () => {
  const sql = await readRepo('supabase/migrations/20261112_areas_do_profissional.sql');
  assert.ok(/CREATE OR REPLACE FUNCTION public\.normalize_profile_disciplines_not_null/.test(sql));
  // O corpo novo não pode mais montar ARRAY['acupuntura'] como padrão.
  assert.ok(
    !/NEW\.disciplines := ARRAY\['acupuntura'\]/.test(sql),
    'a migration ainda injeta acupuntura no gatilho',
  );
  assert.ok(/WHEN v_profession_discipline IS NULL THEN ARRAY\[\]::TEXT\[\]/.test(sql));
  // Recepção segue sem área e fora da agenda.
  assert.ok(/IF NEW\.role = 'receptionist' THEN\r?\n\s*NEW\.disciplines := ARRAY\[\]::TEXT\[\];/.test(sql));
});

test('só a administração troca as áreas, e o banco limpa a lista', async () => {
  const sql = await readRepo('supabase/migrations/20261112_areas_do_profissional.sql');
  assert.ok(/CREATE OR REPLACE FUNCTION public\.set_member_disciplines/.test(sql));
  assert.ok(/is_clinic_admin\(v_actor_id\) OR public\.is_super_admin\(v_actor_id\)/.test(sql));
  // Clínica do alvo conferida no banco, nunca só na tela.
  assert.ok(/v_target\.clinic_id IS DISTINCT FROM v_actor_clinic/.test(sql));
  assert.ok(/v_target\.role = 'receptionist'/.test(sql));
  // Lista limpa no banco: só o que existe, sem repetir, na ordem do catálogo.
  assert.ok(/array_position\(v_known, d\)/.test(sql));
  assert.ok(/WHERE d = ANY \(v_known\)/.test(sql));
  assert.ok(/REVOKE ALL ON FUNCTION public\.set_member_disciplines\(UUID, TEXT\[\]\) FROM PUBLIC, anon;/.test(sql));
  assert.ok(/GRANT EXECUTE ON FUNCTION public\.set_member_disciplines\(UUID, TEXT\[\]\) TO authenticated;/.test(sql));
});

test('a tela grava o que a RPC devolveu, não o que mandou', async () => {
  const service = await read('src/services/clinicMembersService.js');
  assert.ok(/export async function setMemberDisciplines/.test(service));
  assert.ok(/rpc\('set_member_disciplines'/.test(service));
  assert.ok(/disciplines: Array\.isArray\(data\) \? data : wanted/.test(service));

  const screen = await read('src/components/panels/RelatoriosGestao.jsx');
  assert.ok(/const saved = await setMemberDisciplines\(member\.id, next\);/.test(screen));
  assert.ok(/item\.disciplines = /.test(screen) === false);
  assert.ok(/\{ \.\.\.item, disciplines: saved\.disciplines \}/.test(screen));
  // Só a administração vê o controle, e a recepção nunca recebe área.
  assert.ok(/isClinicAdmin && member\.role !== 'receptionist'/.test(screen));
});
