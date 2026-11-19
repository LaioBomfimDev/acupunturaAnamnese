import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import {
  APPOINTMENT_STATUSES,
  CLINIC_CANCEL_STATUS,
  OUTCOME_STATUSES,
  deleteBlockReason,
} from '../../src/utils/agenda.js';

// Regressão (20/11/2026): sessão de paciente fixo só tinha "Excluir", que
// apaga o registro. Agora: Cancelado pelo paciente (entra na evolução),
// Cancelado pela clínica (não entra, não cria sessão) e Excluir só para
// erro de cadastro, com alcance perguntado em pacote.

const read = rel => readFile(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('Cancelado pela clínica é o status cancelled e não é resultado de evolução', () => {
  assert.equal(CLINIC_CANCEL_STATUS.id, 'cancelled');
  assert.equal(CLINIC_CANCEL_STATUS.label, 'Cancelado pela clínica');
  assert.ok(!OUTCOME_STATUSES.some(item => item.id === 'cancelled'));
  assert.equal(APPOINTMENT_STATUSES.find(item => item.id === 'excused').label, 'Cancelado pelo paciente');
});

test('sessão atendida não se exclui; agendada e cancelada podem', () => {
  assert.match(deleteBlockReason({ status: 'attended' }), /já foi atendida/);
  assert.equal(deleteBlockReason({ status: 'scheduled' }), '');
  assert.equal(deleteBlockReason({ status: 'cancelled' }), '');
  assert.equal(deleteBlockReason(null), '');
});

test('a Agenda pergunta o alcance e esconde o excluir em "Corrigir cadastro"', async () => {
  const src = await read('../../src/components/panels/Agenda.jsx');
  assert.match(src, /askScope\('cancel'/);
  assert.match(src, /askScope\('delete'/);
  assert.match(src, /<SessionScopeDialog/);
  assert.match(src, /<details className="ag-detail-fix">/);
  assert.doesNotMatch(src, /Excluir esta e as próximas do pacote/, 'não volta o botão solto do pacote inteiro');
  assert.match(src, /role === 'receptionist'/, 'recepção também exclui');
  // "Só esta sessão" vem primeiro: o alcance maior nunca é o padrão.
  assert.match(src, /id: 'one'[\s\S]*?id: 'from'/);
  // O excluir em pacote pula sessão atendida.
  assert.match(src, /sessions\.filter\(item => !deleteBlockReason\(item\)\)/);
});

test('cancelar pela clínica não cria sessão nova', async () => {
  const src = await read('../../src/services/appointmentService.js');
  const fn = src.match(/export async function cancelSeriesFrom[\s\S]*?\r?\n\}\r?\n/);
  assert.ok(fn);
  assert.doesNotMatch(fn[0], /insert\(/);
  assert.match(fn[0], /\.eq\('status', 'scheduled'\)/);
});

test('appointments_delete passa a aceitar a recepção, sem abrir para profissional', async () => {
  const sql = await read('../../../supabase/migrations/20261119_agenda_recepcao_exclui.sql');
  const policy = sql.match(/CREATE POLICY appointments_delete[\s\S]*?;/);
  assert.ok(policy);
  assert.match(policy[0], /is_clinic_admin\(\)/);
  assert.match(policy[0], /is_super_admin\(\)/);
  assert.match(policy[0], /is_receptionist\(\)/);
  assert.match(policy[0], /can_manage_agenda\(clinic_id\)/);
});
