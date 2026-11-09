import { ABA_OBJECTIVES, ABA_TECHNIQUES } from '../data/abaLibrary.js';

export const LIBRARY_FALLBACK_NOTICE = 'Biblioteca da clínica indisponível; mostrando os modelos do sistema';

// key é identidade do catálogo, nunca conteúdo aceito pela RPC.
export function libraryContent(model) {
  const content = structuredClone(model);
  delete content.key;
  return content;
}

export function canWriteLibrary(teams) {
  return Boolean(teams && (teams.isAdmin || (teams.userId && teams.supervisedTeamId)));
}

export function mergeAbaLibrary(rows = [], { canWrite = false, includeArchived = false, objectives = ABA_OBJECTIVES, techniques = ABA_TECHNIQUES } = {}) {
  const entries = [];
  for (const [kind, models] of [['objetivo', objectives], ['tecnica', techniques]]) {
    for (const model of models) {
      const systemKey = kind === 'objetivo' ? model.key : model.code;
      const row = rows.find(item => item.kind === kind && item.system_key === systemKey);
      const content = row ? structuredClone(row.content) : libraryContent(model);
      // O ajuste institucional não pode retirar nem acrescentar a marca do sistema.
      if (kind === 'tecnica') content.restricted = model.restricted === true;
      entries.push({ key: `${kind}:sistema:${systemKey}`, kind, systemKey, content,
        status: row?.status || 'ativo', row: row || null, system: true });
    }
  }
  for (const row of rows) {
    if (row.system_key == null && (['ativo', 'oculto'].includes(row.status) || (canWrite && includeArchived && row.status === 'arquivado')) && ['objetivo', 'tecnica'].includes(row.kind)) {
      entries.push({ key: `${row.kind}:clinica:${row.id}`, kind: row.kind, systemKey: null,
        content: structuredClone(row.content), status: row.status, row, system: false });
    }
  }
  const active = entries.filter(item => item.status === 'ativo');
  return {
    entries: entries.filter(item => item.status === 'ativo' || (canWrite && (item.status === 'oculto' || (includeArchived && item.status === 'arquivado' && !item.system)))),
    objectives: active.filter(item => item.kind === 'objetivo').map(item => ({ ...item.content, key: item.key })),
    techniques: active.filter(item => item.kind === 'tecnica').map(item => ({ goals: [], behaviorFunctions: [],
      ...item.content, code: item.key })),
  };
}

// Recarregar troca só os metadados. Conteúdo digitado não é substituído.
export function findLibraryItem(entry, rows) {
  return rows.find(row => row.id === entry.row?.id || (entry.system
    && row.kind === entry.kind && row.system_key === entry.systemKey)) || null;
}

export function isLibraryDuplicate(error, entry) {
  return entry.system && (error?.code === '23505'
    || /^Esta referência do sistema ou este evento já foi registrado na biblioteca\./u.test(error?.message || ''));
}

export function librarySavePayload(entry, content, { id, eventId, status = entry.status }) {
  return {
    id: entry.row?.id || id, revision: entry.row?.revision || 0, client_event_id: eventId,
    kind: entry.kind, system_key: entry.systemKey, status, content: libraryContent(content),
  };
}

export function libraryErrorMessage(error) {
  if (error?.code === 'conflict' || error?.code === '40001') return 'Este modelo foi alterado por outra pessoa. Recarregue antes de salvar; seu texto foi mantido.';
  if (error?.code === 'no_access' || error?.code === '42501') return 'Você não tem permissão para alterar a biblioteca. Apenas a administração ou a supervisão de time ativo pode gravar.';
  return error?.message || 'Não foi possível salvar o modelo. Tente de novo.';
}
