import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let server;
let queueModule;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  queueModule = await server.ssrLoadModule('/src/services/clinicalSaveQueue.js');
});

after(async () => {
  await server?.close();
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, reject, resolve };
}

test('fila clínica serializa escritas do mesmo paciente e encadeia a revisão', async () => {
  const calls = [];
  const first = deferred();
  const second = deferred();
  const queue = queueModule.createClinicalSaveQueue({
    makeIdempotencyKey: () => `operation-${calls.length + 1}`,
    persist: operation => {
      calls.push(operation);
      return calls.length === 1 ? first.promise : second.promise;
    },
  });
  queue.setHead('patient-1', { id: 'record-1', revision: 4 });

  const saveA = queue.enqueue({
    patientId: 'patient-1',
    data: { state: { queixa: 'A' } },
    changeVersion: 1,
  });
  const saveB = queue.enqueue({
    patientId: 'patient-1',
    data: { state: { queixa: 'B' } },
    changeVersion: 2,
  });

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1, 'a segunda escrita não pode começar enquanto a primeira está ativa');
  assert.equal(calls[0].expectedRevision, 4);
  assert.equal(queue.pendingFor('patient-1'), 2);

  first.resolve({ id: 'record-1', revision: 5, updated_at: '2026-07-23T10:00:00Z' });
  await saveA;
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(calls.length, 2);
  assert.equal(calls[1].expectedRevision, 5, 'a segunda escrita deve comparar com a revisão recém-confirmada');
  second.resolve({ id: 'record-1', revision: 6, updated_at: '2026-07-23T10:01:00Z' });
  const result = await saveB;

  assert.equal(result.revision, 6);
  assert.equal(result.changeVersion, 2);
  assert.equal(queue.getHead('patient-1').revision, 6);
  assert.equal(queue.pendingFor('patient-1'), 0);
});

test('snapshot enfileirado não muda quando o formulário é alterado depois', async () => {
  const seen = [];
  const queue = queueModule.createClinicalSaveQueue({
    persist: async operation => {
      seen.push(operation.data);
      return { id: 'record-1', revision: 1 };
    },
  });
  const state = { state: { sintomas: ['inicial'] } };
  const pending = queue.enqueue({ patientId: 'patient-1', data: state });
  state.state.sintomas.push('posterior');

  await pending;
  assert.deepEqual(seen[0], { state: { sintomas: ['inicial'] } });
});

test('falha de uma escrita não bloqueia a próxima nem avança a revisão', async () => {
  const expectedRevisions = [];
  let attempt = 0;
  const queue = queueModule.createClinicalSaveQueue({
    persist: async operation => {
      attempt += 1;
      expectedRevisions.push(operation.expectedRevision);
      if (attempt === 1) throw new Error('conflito');
      return { id: 'record-1', revision: 3 };
    },
  });
  queue.setHead('patient-1', { id: 'record-1', revision: 2 });

  await assert.rejects(
    queue.enqueue({ patientId: 'patient-1', data: { state: { a: 1 } } }),
    /conflito/,
  );
  await queue.enqueue({ patientId: 'patient-1', data: { state: { a: 2 } } });

  assert.deepEqual(expectedRevisions, [2, 2]);
  assert.equal(queue.getHead('patient-1').revision, 3);
});

test('pacientes diferentes usam filas independentes', async () => {
  const patientA = deferred();
  const started = [];
  const queue = queueModule.createClinicalSaveQueue({
    persist: operation => {
      started.push(operation.patientId);
      return operation.patientId === 'patient-a'
        ? patientA.promise
        : Promise.resolve({ id: 'record-b', revision: 1 });
    },
  });

  const saveA = queue.enqueue({ patientId: 'patient-a', data: { state: {} } });
  const saveB = queue.enqueue({ patientId: 'patient-b', data: { state: {} } });
  const resultB = await saveB;

  assert.deepEqual(started.sort(), ['patient-a', 'patient-b']);
  assert.equal(resultB.id, 'record-b');
  patientA.resolve({ id: 'record-a', revision: 1 });
  await saveA;
});

test('tipos clínicos do mesmo paciente mantêm revisões em lanes separadas', async () => {
  const calls = [];
  const queue = queueModule.createClinicalSaveQueue({
    persist: async operation => {
      calls.push(operation);
      return {
        id: `record-${operation.recordType}`,
        revision: operation.expectedRevision + 1,
      };
    },
  });
  queue.setHead('patient-1:psi_anamnese', { id: 'record-a', revision: 3 });
  queue.setHead('patient-1:psi_neuro_avaliacao', { id: 'record-b', revision: 8 });

  await Promise.all([
    queue.enqueue({
      patientId: 'patient-1',
      laneKey: 'patient-1:psi_anamnese',
      recordType: 'psi_anamnese',
      data: { session: {} },
    }),
    queue.enqueue({
      patientId: 'patient-1',
      laneKey: 'patient-1:psi_neuro_avaliacao',
      recordType: 'psi_neuro_avaliacao',
      data: { evaluation: {} },
    }),
  ]);

  const revisions = Object.fromEntries(
    calls.map(call => [call.recordType, call.expectedRevision]),
  );
  assert.deepEqual(revisions, {
    psi_anamnese: 3,
    psi_neuro_avaliacao: 8,
  });
});

test('chave de idempotência gerada usa formato UUID', () => {
  assert.match(
    queueModule.createIdempotencyKey(),
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
