// ============================================================
// Fila serial de persistência clínica
//
// Cada paciente tem uma "lane" independente. Dentro da mesma lane,
// somente uma escrita é executada por vez e a revisão devolvida pelo
// servidor alimenta a próxima comparação otimista.
// ============================================================

function fallbackUuid() {
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);

  if (!bytes.some(Boolean)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

export function createIdempotencyKey() {
  return globalThis.crypto?.randomUUID?.() || fallbackUuid();
}

export function snapshotClinicalSession(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeHead(head) {
  if (!head?.id) return { id: null, revision: 0, updated_at: null };
  return {
    id: head.id,
    revision: Math.max(0, Number(head.revision) || 0),
    updated_at: head.updated_at || null,
  };
}

/**
 * Cria uma fila de escritas serializada por paciente.
 *
 * @param {object} options
 * @param {(operation: object) => Promise<object>} options.persist
 * @param {() => string} [options.makeIdempotencyKey]
 */
export function createClinicalSaveQueue({
  persist,
  makeIdempotencyKey = createIdempotencyKey,
}) {
  if (typeof persist !== 'function') {
    throw new TypeError('A fila clínica exige uma função persist.');
  }

  const lanes = new Map();

  function laneFor(patientId) {
    if (!patientId) throw new Error('Paciente é obrigatório para salvar a sessão.');
    if (!lanes.has(patientId)) {
      lanes.set(patientId, {
        head: normalizeHead(null),
        pending: 0,
        tail: Promise.resolve(),
      });
    }
    return lanes.get(patientId);
  }

  function setHead(patientId, head) {
    laneFor(patientId).head = normalizeHead(head);
  }

  function getHead(patientId) {
    return { ...laneFor(patientId).head };
  }

  function pendingFor(patientId) {
    return patientId && lanes.has(patientId) ? lanes.get(patientId).pending : 0;
  }

  function enqueue({
    patientId,
    laneKey = patientId,
    recordType = 'full_session',
    data,
    discipline = 'acupuntura',
    changeVersion = 0,
  }) {
    const lane = laneFor(laneKey);
    const idempotencyKey = makeIdempotencyKey();
    const snapshot = snapshotClinicalSession(data);
    lane.pending += 1;

    const task = lane.tail
      .catch(() => undefined)
      .then(async () => {
        const expectedRevision = lane.head.revision;
        const result = await persist({
          patientId,
          recordType,
          data: snapshot,
          discipline,
          expectedRevision,
          idempotencyKey,
        });
        lane.head = normalizeHead(result);
        return {
          ...result,
          changeVersion,
          expectedRevision,
          idempotencyKey,
        };
      });

    lane.tail = task.then(
      () => undefined,
      () => undefined,
    );
    void task.then(
      () => { lane.pending -= 1; },
      () => { lane.pending -= 1; },
    );

    return task;
  }

  return {
    enqueue,
    getHead,
    pendingFor,
    setHead,
  };
}
