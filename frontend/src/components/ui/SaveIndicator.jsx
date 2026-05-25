// ============================================================
// COMPONENTE: Indicador de status de salvamento
// Mostra feedback visual (salvando, salvo, erro) na interface.
// ============================================================

export function SaveIndicator({ status, lastSavedAt, onSave, hasPatient, hasPendingChanges }) {
  if (!hasPatient) return null;

  const configs = {
    idle: { text: 'Salvar alterações', tone: 'idle', clickable: true },
    dirty: { text: 'Alterações pendentes', tone: 'dirty', clickable: true },
    saving: { text: 'Salvando...', tone: 'saving', clickable: false },
    saved: { text: 'Salvo', tone: 'saved', clickable: false },
    error: { text: 'Erro ao salvar', tone: 'error', clickable: true },
  };

  const cfg = hasPendingChanges && status !== 'saving' && status !== 'error'
    ? configs.dirty
    : configs[status] || configs.idle;

  return (
    <button
      className={`save-button save-button-${cfg.tone}`}
      onClick={cfg.clickable ? onSave : undefined}
      disabled={!cfg.clickable}
      title={lastSavedAt ? `Último salvamento: ${lastSavedAt.toLocaleTimeString('pt-BR')}` : 'Ainda não salvo'}
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
