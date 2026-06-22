import { useEffect, useMemo, useState } from 'react';
import { Panel } from '../ui/Panel';
import {
  AI_BASE_PROMPTS,
  AI_INSTRUCTIONS_MAX_CHARS,
  AI_LAYERING_HEADER,
  getAiInstructionVersions,
  listAiInstructions,
  saveAiInstruction,
} from '../../services/aiInstructionsService';

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return String(value);
  }
}

export function AiInstructionsPanel() {
  const [rows, setRows] = useState([]);
  const [loadState, setLoadState] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState('');
  const [activeKey, setActiveKey] = useState('clinical-global');
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [history, setHistory] = useState(null);
  const [historyState, setHistoryState] = useState('idle'); // idle | loading | ready | error
  const [showBase, setShowBase] = useState(true);

  const activeRow = useMemo(
    () => rows.find(row => row.key === activeKey) || null,
    [rows, activeKey],
  );

  const basePrompts = AI_BASE_PROMPTS[activeKey] || [];
  const activeIsTongue = activeKey === 'tongue-analysis';

  useEffect(() => {
    let cancelled = false;
    listAiInstructions()
      .then(list => {
        if (cancelled) return;
        setRows(list);
        const first = list.find(row => row.key === activeKey) || list[0];
        if (first) {
          setActiveKey(first.key);
          setDraft(first.content || '');
        }
        setLoadState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setLoadError(err.message || 'Falha ao carregar.');
        setLoadState('error');
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectKey(key) {
    const row = rows.find(r => r.key === key);
    setActiveKey(key);
    setDraft(row?.content || '');
    setError('');
    setSuccess('');
    setHistory(null);
    setHistoryState('idle');
  }

  const dirty = activeRow ? draft !== (activeRow.content || '') : draft !== '';
  const tooLong = draft.length > AI_INSTRUCTIONS_MAX_CHARS;

  async function handleSave() {
    if (saving || !dirty || tooLong) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await saveAiInstruction(activeKey, draft);
      setRows(prev => prev.map(row => (row.key === activeKey
        ? { ...row, content: updated.content ?? draft, version: updated.version ?? (row.version + 1), updated_at: updated.updated_at }
        : row)));
      setSuccess(`Salvo. Versão ${updated.version ?? ''} ativa.`);
      if (history) loadHistory();
    } catch (err) {
      setError(err.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function loadHistory() {
    setHistoryState('loading');
    try {
      const versions = await getAiInstructionVersions(activeKey);
      setHistory(versions);
      setHistoryState('ready');
    } catch (err) {
      setError(err.message || 'Falha ao carregar histórico.');
      setHistoryState('error');
    }
  }

  if (loadState === 'loading') {
    return <Panel title="Instruções da IA"><div className="box">Carregando…</div></Panel>;
  }
  if (loadState === 'error') {
    return (
      <Panel title="Instruções da IA">
        <div className="alert">Não foi possível carregar as instruções. {loadError}</div>
      </Panel>
    );
  }

  return (
    <Panel title="Instruções da IA">
      <section className="ai-instructions-panel">
        <div className="ai-instructions-hero">
          <div>
            <p className="small">SuperAdm • Diretrizes editáveis</p>
            <h3>Camada clínica sobre o prompt fixo</h3>
            <span>
              Cada diretriz refina tom, foco e limites de uma IA. A base fixa, o escopo seguro
              e o gate humano permanecem no código e prevalecem em qualquer conflito.
            </span>
          </div>
          <div className="ai-instructions-guardrail">
            <b>Versionado e auditado</b>
            <span>Salvar cria uma nova versão ativa; a base fixa abaixo é somente leitura.</span>
          </div>
        </div>

        <div className="ai-instructions-layout">
          <aside className="ai-instruction-tabs" aria-label="Diretrizes da IA">
            {rows.map(row => {
              const isActive = row.key === activeKey;
              const hasContent = (row.content || '').trim().length > 0;
              return (
                <button
                  key={row.key}
                  type="button"
                  className={`ai-instruction-tab ${isActive ? 'active' : ''} ${hasContent ? 'configured' : ''}`}
                  onClick={() => selectKey(row.key)}
                >
                  <span>{hasContent ? 'Configurada' : 'Sem diretriz'}</span>
                  <b>{row.label || row.key}</b>
                  <small>{row.help || `Diretriz da chave ${row.key}.`}</small>
                  <em>{row.version ? `v${row.version}` : 'sem versão ativa'}</em>
                </button>
              );
            })}
          </aside>

          <section className="ai-instruction-editor-panel">
            {activeRow ? (
              <>
                <div className="ai-instruction-editor-head">
                  <div>
                    <p className="small">Diretriz selecionada</p>
                    <h3>{activeRow.label || activeRow.key}</h3>
                    <span>{activeRow.help || `Diretriz da chave ${activeRow.key}.`}</span>
                  </div>
                  <span className={`admin-status ${dirty ? 'pending' : 'active'}`}>
                    {dirty ? 'rascunho alterado' : 'sincronizada'}
                  </span>
                </div>

                {activeIsTongue && (
                  <div className="ai-tongue-guardrail">
                    <b>Inspeção da língua</b>
                    <span>
                      Esta camada ajusta linguagem e critérios de observação. Ela não altera o schema,
                      não cria tags novas e não transforma sugestão da IA em achado confirmado.
                    </span>
                  </div>
                )}

                {basePrompts.length > 0 && (
                  <div className="ai-base-card">
                    <div className="ai-base-card-head">
                      <div>
                        <b>Base fixa no código</b>
                        <span>Somente leitura</span>
                      </div>
                      <button type="button" className="quiet-button" onClick={() => setShowBase(v => !v)}>
                        {showBase ? 'Recolher' : 'Mostrar'}
                      </button>
                    </div>

                    {showBase && (
                      <>
                        <p className="small ai-base-copy">
                          {activeKey === 'clinical-global'
                            ? 'Esta diretriz geral é empilhada sobre as bases abaixo.'
                            : 'Sua diretriz é empilhada sobre a base abaixo.'}{' '}
                          Editar a diretriz não remove regras de segurança, escopo ou revisão humana.
                        </p>

                        {basePrompts.map(bp => (
                          <div key={bp.label} className="ai-base-prompt">
                            {basePrompts.length > 1 && (
                              <b className="small">{bp.label}</b>
                            )}
                            <pre className="ai-base-pre">{bp.text}</pre>
                          </div>
                        ))}

                        <p className="small ai-base-copy">
                          Depois da base, o servidor insere este cabeçalho e então as suas diretrizes:
                        </p>
                        <pre className="ai-layering-pre">{AI_LAYERING_HEADER}</pre>
                      </>
                    )}
                  </div>
                )}

                <div className="ai-custom-card">
                  <div className="ai-custom-card-head">
                    <div>
                      <b>Diretrizes da clínica</b>
                      <span>{activeRow.updated_at ? `Atualizado ${formatDate(activeRow.updated_at)}` : 'Ainda sem versão salva'}</span>
                    </div>
                    <span className={`ai-char-count ${tooLong ? 'danger' : ''}`}>
                      {draft.length}/{AI_INSTRUCTIONS_MAX_CHARS}
                    </span>
                  </div>

                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder="Ex.: Use linguagem acolhedora e objetiva. Seja conservadora quando a evidência visual for fraca. Evite afirmar padrões sem sinais suficientes."
                    rows={12}
                    className={`ai-instruction-textarea ${tooLong ? 'danger' : ''}`}
                  />

                  <div className="ai-instruction-footer">
                    <span className="small">
                      {activeRow.version ? `Versão ${activeRow.version} ativa` : 'Sem versão ativa'}
                      {activeRow.updated_at ? ` · ${formatDate(activeRow.updated_at)}` : ''}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="quiet-button"
                        onClick={() => { if (history) { setHistory(null); } else { loadHistory(); } }}
                      >
                        {history ? 'Ocultar histórico' : 'Ver histórico'}
                      </button>
                      <button
                        type="button"
                        className="ai-analyze-btn ai-save-instruction-btn"
                        disabled={saving || !dirty || tooLong}
                        onClick={handleSave}
                      >
                        {saving ? 'Salvando…' : (dirty ? 'Salvar diretriz' : 'Sem alterações')}
                      </button>
                    </div>
                  </div>

                  {error && <div className="alert tongue-inline-alert">{error}</div>}
                  {success && <div className="inline-success">{success}</div>}

                  {history && (
                    <div className="ai-instruction-history">
                      <b className="small">Histórico de versões</b>
                      {historyState === 'loading' && <p className="small">Carregando…</p>}
                      {historyState === 'ready' && history.length === 0 && (
                        <p className="small muted">Sem versões registradas ainda.</p>
                      )}
                      {historyState === 'ready' && history.map(version => (
                        <div key={version.id || version.version} className="ai-history-card">
                          <span className="small">
                            <b>v{version.version}</b> · {formatDate(version.created_at)}
                            {version.edited_by_label ? ` · ${version.edited_by_label}` : ''}
                          </span>
                          <p className="small">
                            {(version.content || '').trim() || '(vazio)'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="empty-state">Nenhuma diretriz disponível.</div>
            )}
          </section>
        </div>
      </section>
    </Panel>
  );
}
