// ============================================================
// COMPONENTE: Indicador de status de salvamento
// Mostra feedback visual (salvando, salvo, erro) na interface.
// ============================================================

export function SaveIndicator({ status, lastSavedAt, onSave, hasPatient, hasPendingChanges }) {
  if (!hasPatient) return null;

  const configs = {
    idle: { text: 'Salvar alterações', tone: 'idle', clickable: true },
    dirty: { text: 'Alterações pendentes', tone: 'dirty', clickable: true },
    loading: { text: 'Carregando ficha...', tone: 'saving', clickable: false },
    saving: { text: 'Salvando...', tone: 'saving', clickable: false },
    saved: { text: 'Salvo', tone: 'saved', clickable: false },
    error: { text: 'Erro ao salvar', tone: 'error', clickable: true },
    load_error: { text: 'Erro ao carregar a ficha', tone: 'error', clickable: false },
  };

  const cfg = hasPendingChanges
    && !['loading', 'saving', 'error', 'load_error'].includes(status)
    ? configs.dirty
    : configs[status] || configs.idle;

  return (
    <button
      className={`save-button save-button-${cfg.tone}`}
      onClick={cfg.clickable ? onSave : undefined}
      disabled={!cfg.clickable}
      title={status === 'load_error'
        ? 'Reabra o paciente antes de editar ou salvar.'
        : lastSavedAt
          ? `Último salvamento: ${lastSavedAt.toLocaleTimeString('pt-BR')}`
          : 'Ainda não salvo'}
    >
      <span className="save-dot" />
      <span>{cfg.text}</span>
      {lastSavedAt && (
        <span className="save-time">
          {lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </button>
  );
}
