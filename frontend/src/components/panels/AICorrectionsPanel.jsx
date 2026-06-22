// ============================================================
// PAINEL SuperAdm: Correções da IA — curadoria do loop de ensino
//
// Fila das correções registradas pelas profissionais sobre as saídas de IA.
// Aprovar → a correção passa a valer para TODAS (injetada no prompt de toda
// chamada). Reprovar → sai da injeção. A autora já usava a sua antes mesmo da
// aprovação. "Promover" é o gancho para levar a lição à base curada.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  AI_SURFACE_LABELS,
  CORRECTION_STATUS_LABELS,
  listCorrectionsForReview,
  setCorrectionStatus,
} from '../../services/aiCorrectionService';

const STATUS_FILTERS = [
  { id: 'pending', label: 'Pendentes' },
  { id: 'approved', label: 'Aprovadas' },
  { id: 'rejected', label: 'Reprovadas' },
  { id: 'all', label: 'Todas' },
];

const SURFACE_ORDER = [
  'tongue',
  'anamnese_marks',
  'clinical_reasoning',
  'narrative',
  'library_qa',
];

function statusTone(status) {
  if (status === 'approved') return 'active';
  if (status === 'rejected') return 'blocked';
  return 'pending';
}

function summarizeAiOutput(aiOutput) {
  if (!aiOutput || typeof aiOutput !== 'object') return '';
  const o = aiOutput;
  if (o.title) return `${o.title}${o.pattern ? ` → ${o.pattern}` : ''}`;
  if (o.item) return `${o.group ? `${o.group}: ` : ''}${o.item}`;
  if (typeof o.answer === 'string') return o.answer;
  if (typeof o.interpretation === 'string') return o.interpretation;
  if (Array.isArray(o.paragraphs)) return o.paragraphs.join('\n\n');
  if (o.mode) return `Texto do relatório (${o.mode})`;
  return '';
}

function getTongueSuggestedTags(row) {
  if (row?.surface !== 'tongue') return [];
  const outputTags = Array.isArray(row?.ai_output?.suggestedTags) ? row.ai_output.suggestedTags : [];
  const contextTags = Array.isArray(row?.context_snapshot?.suggestedTags) ? row.context_snapshot.suggestedTags : [];
  const tags = [...outputTags, ...contextTags];
  return [...new Set(tags.map(tag => String(tag || '').trim()).filter(Boolean))];
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function AICorrectionsPanel() {
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [surfaceFilter, setSurfaceFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [busyId, setBusyId] = useState('');

  async function load() {
    setLoadState('loading');
    setError('');
    try {
      const data = await listCorrectionsForReview();
      setRows(data);
      setLoadState('ready');
    } catch (err) {
      setError(err.message || 'Não foi possível carregar as correções.');
      setLoadState('error');
    }
  }

  useEffect(() => {
    let cancelled = false;
    listCorrectionsForReview()
      .then(data => {
        if (cancelled) return;
        setRows(data);
        setLoadState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Não foi possível carregar as correções.');
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(() => rows.filter(row =>
    (statusFilter === 'all' || row.approval_status === statusFilter)
    && (surfaceFilter === 'all' || row.surface === surfaceFilter)), [rows, statusFilter, surfaceFilter]);

  const selected = useMemo(
    () => filteredRows.find(row => row.id === selectedId) || filteredRows[0] || null,
    [filteredRows, selectedId],
  );

  const summary = useMemo(() => ({
    total: rows.length,
    pending: rows.filter(row => row.approval_status === 'pending').length,
    approved: rows.filter(row => row.approval_status === 'approved').length,
    rejected: rows.filter(row => row.approval_status === 'rejected').length,
  }), [rows]);

  const surfaceSummary = useMemo(() => {
    const known = Object.entries(AI_SURFACE_LABELS).map(([id, label]) => {
      const surfaceRows = rows.filter(row => row.surface === id);
      return {
        id,
        label,
        total: surfaceRows.length,
        pending: surfaceRows.filter(row => row.approval_status === 'pending').length,
        approved: surfaceRows.filter(row => row.approval_status === 'approved').length,
      };
    });
    return known.sort((a, b) => {
      const ai = SURFACE_ORDER.indexOf(a.id);
      const bi = SURFACE_ORDER.indexOf(b.id);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [rows]);

  function chooseSurface(surface) {
    setSurfaceFilter(surface);
    setSelectedId('');
  }

  function chooseStatus(status) {
    setStatusFilter(status);
    setSelectedId('');
  }

  async function applyStatus(row, status) {
    setBusyId(row.id);
    setMessage('');
    setError('');
    try {
      const updated = await setCorrectionStatus(row.id, status);
      setRows(prev => prev.map(item => (item.id === row.id ? { ...item, ...updated } : item)));
      setMessage(status === 'approved'
        ? 'Correção aprovada — agora vale para todas as profissionais.'
        : status === 'rejected'
          ? 'Correção reprovada — sai da injeção da IA.'
          : 'Correção reposta em revisão.');
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar a correção.');
    } finally {
      setBusyId('');
    }
  }

  function promote(row) {
    const text = [
      `Superfície: ${AI_SURFACE_LABELS[row.surface] || row.surface}`,
      `A IA dizia: ${summarizeAiOutput(row.ai_output) || '—'}`,
      `Correto: ${row.correction_text}`,
      row.reason ? `Motivo: ${row.reason}` : '',
      getTongueSuggestedTags(row).length ? `Tags sugeridas: ${getTongueSuggestedTags(row).join(', ')}` : '',
    ].filter(Boolean).join('\n');
    navigator.clipboard?.writeText(text);
    setMessage(row.surface === 'tongue'
      ? 'Lição copiada. Use como referência para revisar as tags e instruções do módulo Língua.'
      : 'Lição copiada. Leve para "Conhecimento da Anamnese" para promover à base curada.');
  }

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  if (loadState === 'loading') {
    return (
      <section className="admin-knowledge anamnese-knowledge-panel">
        <div className="empty-state">Carregando correções da IA...</div>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="admin-knowledge anamnese-knowledge-panel">
        <div className="inline-error">{error}</div>
      </section>
    );
  }

  return (
    <section className="admin-knowledge anamnese-knowledge-panel">
      <div className="start-panel-head">
        <div>
          <p className="small">SuperAdm • Ensino da IA</p>
          <h2>Correções da IA</h2>
          <span>As profissionais corrigem; as aprovadas viram lição para todas, injetada nos prompts.</span>
        </div>
        <div className="anamnese-panel-actions">
          <button className="quiet-button" type="button" onClick={load}>Atualizar</button>
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="security-card admin-stat-card total">
          <span>Correções</span><b>{summary.total}</b><p>no total</p>
        </div>
        <div className="security-card admin-stat-card pending">
          <span>Pendentes</span><b>{summary.pending}</b><p>aguardando curadoria</p>
        </div>
        <div className="security-card admin-stat-card active">
          <span>Aprovadas</span><b>{summary.approved}</b><p>valem para todas</p>
        </div>
        <div className="security-card admin-stat-card suspended">
          <span>Reprovadas</span><b>{summary.rejected}</b><p>fora da injeção</p>
        </div>
      </div>

      {message && <div className="inline-success">{message}</div>}
      {error && <div className="inline-error">{error}</div>}

      <div className="ai-surface-overview" aria-label="Correções por área da IA">
        <button
          type="button"
          className={`ai-surface-card ${surfaceFilter === 'all' ? 'active' : ''}`}
          onClick={() => chooseSurface('all')}
        >
          <span>Todas</span>
          <b>{rows.length}</b>
          <small>{summary.pending} pendente{summary.pending === 1 ? '' : 's'}</small>
        </button>
        {surfaceSummary.map(item => (
          <button
            key={item.id}
            type="button"
            className={`ai-surface-card ${surfaceFilter === item.id ? 'active' : ''} ${item.id === 'tongue' ? 'tongue' : ''}`}
            onClick={() => chooseSurface(item.id)}
          >
            <span>{item.label}</span>
            <b>{item.total}</b>
            <small>{item.pending} pendente{item.pending === 1 ? '' : 's'} · {item.approved} aprovada{item.approved === 1 ? '' : 's'}</small>
          </button>
        ))}
      </div>

      {surfaceFilter === 'tongue' && (
        <div className="ai-tongue-curation-note">
          <b>Língua exige curadoria por tag.</b>
          <span>
            Valide se a correção preserva tags estáveis, confiança conservadora e revisão profissional
            antes de aprovar para todas.
          </span>
        </div>
      )}

      <div className="pdf-learning-layout anamnese-knowledge-layout">
        <section className="admin-users pdf-learning-list-panel">
          <div className="admin-toolbar">
            <select value={surfaceFilter} onChange={event => chooseSurface(event.target.value)}>
              <option value="all">Todas as superfícies</option>
              {Object.entries(AI_SURFACE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>

          <div className="knowledge-confidence-tabs" role="tablist" aria-label="Filtros de correção">
            {STATUS_FILTERS.map(item => {
              const count = item.id === 'all'
                ? rows.length
                : rows.filter(row => row.approval_status === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`knowledge-confidence-tab ${statusFilter === item.id ? 'active' : ''}`}
                  onClick={() => chooseStatus(item.id)}
                >
                  <span>{item.label}</span>
                  <b>{count}</b>
                </button>
              );
            })}
          </div>

          {filteredRows.length === 0 ? (
            <div className="empty-state">Nenhuma correção neste filtro.</div>
          ) : (
            <div className="admin-user-list knowledge-draft-list pdf-learning-list">
              {filteredRows.slice(0, 220).map(row => {
                const tongueTags = getTongueSuggestedTags(row);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`admin-user-row admin-user-button ${selected?.id === row.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(row.id)}
                  >
                    <div className="admin-user-main">
                      <b>{AI_SURFACE_LABELS[row.surface] || row.surface}</b>
                      <small>{row.author_label || 'Profissional'} • {formatDate(row.created_at)}</small>
                      <em>{row.correction_text}</em>
                    </div>
                    <div className="admin-user-meta">
                      {tongueTags.length > 0 && (
                        <span className="admin-status">{tongueTags.length} tag{tongueTags.length === 1 ? '' : 's'}</span>
                      )}
                      <span className={`admin-status ${statusTone(row.approval_status)}`}>
                        {CORRECTION_STATUS_LABELS[row.approval_status] || row.approval_status}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="admin-users anamnese-knowledge-detail">
          {!selected ? (
            <div className="empty-state">Selecione uma correção.</div>
          ) : (
            <>
              <div className="pdf-learning-detail-head">
                <div>
                  <p className="small">{AI_SURFACE_LABELS[selected.surface] || selected.surface}</p>
                  <h2>Correção de {selected.author_label || 'Profissional'}</h2>
                  <span>{formatDate(selected.created_at)} • modelo {selected.model_version || '—'}</span>
                </div>
                <span className={`admin-status ${statusTone(selected.approval_status)}`}>
                  {CORRECTION_STATUS_LABELS[selected.approval_status] || selected.approval_status}
                </span>
              </div>

              <div className="ai-correction-meta-grid">
                <div>
                  <span>Área</span>
                  <b>{AI_SURFACE_LABELS[selected.surface] || selected.surface}</b>
                </div>
                <div>
                  <span>Modelo</span>
                  <b>{selected.model_version || '—'}</b>
                </div>
                <div>
                  <span>Profissional</span>
                  <b>{selected.author_label || '—'}</b>
                </div>
              </div>

              {selected.surface === 'tongue' && getTongueSuggestedTags(selected).length > 0 && (
                <div className="ai-tongue-tags-review">
                  <span className="synth-label">Tags sugeridas pela IA</span>
                  <div>
                    {getTongueSuggestedTags(selected).map(tag => (
                      <code key={tag}>{tag}</code>
                    ))}
                  </div>
                </div>
              )}

              <div className="ai-correction-review">
                <div className="ai-correction-review-block said">
                  <span className="synth-label">A IA dizia</span>
                  <p>{summarizeAiOutput(selected.ai_output) || '—'}</p>
                </div>
                <div className="ai-correction-review-block correct">
                  <span className="synth-label">O correto (ensinado)</span>
                  <p>{selected.correction_text}</p>
                </div>
                {selected.reason && (
                  <div className="ai-correction-review-block">
                    <span className="synth-label">Motivo / regra</span>
                    <p>{selected.reason}</p>
                  </div>
                )}
              </div>

              <div className="anamnese-editor-actions">
                <button
                  className="primary-button"
                  type="button"
                  disabled={busyId === selected.id || selected.approval_status === 'approved'}
                  onClick={() => applyStatus(selected, 'approved')}
                >
                  Aprovar (vale para todas)
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={busyId === selected.id || selected.approval_status === 'rejected'}
                  onClick={() => applyStatus(selected, 'rejected')}
                >
                  Reprovar
                </button>
                {selected.approval_status !== 'pending' && (
                  <button
                    className="quiet-button"
                    type="button"
                    disabled={busyId === selected.id}
                    onClick={() => applyStatus(selected, 'pending')}
                  >
                    Repor em revisão
                  </button>
                )}
                <button className="quiet-button" type="button" onClick={() => promote(selected)}>
                  Promover para base curada
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
