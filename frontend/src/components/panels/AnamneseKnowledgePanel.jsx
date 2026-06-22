import { useEffect, useMemo, useState } from 'react';
import { checklists } from '../../data/checklists';
import { patternDefinitions } from '../../knowledge/knowledgeBase';
import {
  KNOWLEDGE_FILTERS,
  buildApprovedKnowledgeEnvelope,
  filterAnamneseKnowledgeRows,
  getLocalAnamneseKnowledgeDecisions,
  sourceConfidencePercent,
  summarizeAnamneseKnowledgeRows,
} from '../../knowledge/anamneseKnowledgeCuration';
import {
  exportApprovedAnamneseKnowledge,
  exportPatternNormalizationMap,
  loadAnamneseKnowledgeCurationPayload,
  refreshAnamneseKnowledgeRows,
  saveAnamneseKnowledgeDecision,
  validateAnamneseKnowledgeCandidate,
} from '../../services/anamneseKnowledgeCurationService';
import { resolveKnowledgeSourceAssetUrl } from '../../services/knowledgeSourceAssetService';

const TYPE_LABELS = {
  finding: 'Achado',
  question: 'Pergunta',
  pattern: 'Padrão',
};

const STATUS_LABELS = {
  review: 'em revisão',
  approved_local: 'aprovado local',
  rejected: 'reprovado',
};

function toLines(value) {
  return Array.isArray(value) ? value.join('\n') : String(value || '');
}

function fromLines(value) {
  return String(value || '')
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function statusTone(status) {
  if (status === 'approved_local') return 'active';
  if (status === 'rejected') return 'blocked';
  return 'pending';
}

function typeDomain(candidate) {
  if (candidate.domain === 'lingua' || candidate.type === 'finding') return 'Língua';
  if (candidate.domain === 'diagnostico' || candidate.type === 'pattern') return 'Diagnóstico';
  return 'Anamnese';
}

function titleForCandidate(candidate) {
  return candidate.label || candidate.prompt || candidate.pattern || candidate.id;
}

function editorFromCandidate(candidate) {
  if (!candidate) return null;
  if (candidate.type === 'finding') {
    return {
      ...candidate,
      aliasesText: toLines(candidate.aliases),
      patternLinks: (candidate.patternLinks || []).map(link => ({ ...link })),
    };
  }
  if (candidate.type === 'question') {
    return {
      ...candidate,
      optionsText: toLines(candidate.options),
      linkedFindingsText: toLines(candidate.linkedFindings),
    };
  }
  return {
    ...candidate,
    tongueSignsText: toLines(candidate.tongueSigns),
    pulseSignsText: toLines(candidate.pulseSigns),
    symptomsText: toLines(candidate.symptoms),
    differentialsText: toLines(candidate.differentials),
  };
}

function candidateFromEditor(editor) {
  if (!editor) return null;
  if (editor.type === 'finding') {
    return {
      ...editor,
      aliases: fromLines(editor.aliasesText),
      patternLinks: (editor.patternLinks || []).map(link => ({
        pattern: link.pattern,
        rawPattern: link.rawPattern || link.sourceLabel || link.pattern,
        sourceLabel: link.sourceLabel || link.rawPattern || link.pattern,
        weight: Math.min(7, Math.max(1, Number(link.weight || 1))),
        polarity: link.polarity === '-' ? '-' : '+',
        evidence: link.evidence || '',
        hiddenByNormalization: Boolean(link.hiddenByNormalization),
        normalizationStatus: link.normalizationStatus || '',
        normalizationReason: link.normalizationReason || '',
      })),
    };
  }
  if (editor.type === 'question') {
    return {
      ...editor,
      options: fromLines(editor.optionsText),
      linkedFindings: fromLines(editor.linkedFindingsText),
    };
  }
  return {
    ...editor,
    tongueSigns: fromLines(editor.tongueSignsText),
    pulseSigns: fromLines(editor.pulseSignsText),
    symptoms: fromLines(editor.symptomsText),
    differentials: fromLines(editor.differentialsText),
  };
}

function SourceProof({ candidate }) {
  const imageUrl = candidate?.source?.imageUrl || '';
  const [state, setState] = useState({ status: 'idle', source: '', url: '', error: '' });
  const visualState = state.source === imageUrl
    ? state
    : { status: imageUrl ? 'loading' : 'idle', source: imageUrl, url: '', error: '' };

  useEffect(() => {
    let cancelled = false;
    if (!imageUrl) return undefined;

    resolveKnowledgeSourceAssetUrl(imageUrl, { purpose: 'anamnese-knowledge-review' })
      .then(url => {
        if (!cancelled) setState({ status: 'ready', source: imageUrl, url, error: '' });
      })
      .catch(error => {
        if (!cancelled) {
          setState({
            status: 'error',
            source: imageUrl,
            url: '',
            error: error.message || 'Fonte visual indisponível.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  if (!candidate) return <div className="empty-state">Selecione um candidato.</div>;

  return (
    <section className="anamnese-knowledge-proof">
      <div className="pdf-source-preview-head">
        <div>
          <b>{candidate.source?.title || candidate.source?.key || 'Fonte'}</b>
          <small>PDF p. {candidate.source?.pdfPage || '-'} • {candidate.source?.printedCase || 'trecho rastreável'}</small>
        </div>
        <span className="admin-status active">{formatPercent(sourceConfidencePercent(candidate))}</span>
      </div>

      {visualState.status === 'ready' ? (
        <div className="pdf-source-preview-frame">
          <img src={visualState.url} alt={`${candidate.source?.title || 'Fonte'}, PDF p. ${candidate.source?.pdfPage || '-'}`} loading="lazy" />
        </div>
      ) : visualState.status === 'loading' ? (
        <div className="pdf-source-preview-empty">Carregando fonte visual...</div>
      ) : (
        <div className="pdf-source-preview-empty">{visualState.error || 'Fonte visual indisponível.'}</div>
      )}

      <div className="pdf-source-snippets">
        <div>
          <span>Trecho citado</span>
          <p>{candidate.source?.snippet || 'Sem trecho citado.'}</p>
        </div>
      </div>
    </section>
  );
}

function PatternLinkEditor({ links, patternOptions, onChange }) {
  function updateLink(index, field, value) {
    onChange(links.map((link, itemIndex) => (
      itemIndex === index ? { ...link, [field]: value } : link
    )));
  }

  function removeLink(index) {
    onChange(links.filter((_, itemIndex) => itemIndex !== index));
  }

  function addLink() {
    onChange([
      ...links,
      {
        pattern: patternOptions[0]?.value || '',
        rawPattern: '',
        sourceLabel: '',
        weight: 3,
        polarity: '+',
        evidence: '',
      },
    ]);
  }

  return (
    <div className="anamnese-pattern-links">
      <div className="anamnese-editor-row-head">
        <b>Vínculos achado→padrão</b>
        <button className="quiet-button" type="button" onClick={addLink}>Adicionar</button>
      </div>
      {links.map((link, index) => (
        <div className={`anamnese-pattern-link ${link.hiddenByNormalization ? 'is-hidden' : ''}`} key={`${link.rawPattern || link.pattern}-${index}`}>
          <label>
            Padrão canônico
            <select value={link.pattern || ''} onChange={event => updateLink(index, 'pattern', event.target.value)}>
              {patternOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            Peso
            <input
              type="number"
              min="1"
              max="7"
              value={link.weight || 3}
              onChange={event => updateLink(index, 'weight', event.target.value)}
            />
          </label>
          <label>
            Polaridade
            <select value={link.polarity || '+'} onChange={event => updateLink(index, 'polarity', event.target.value)}>
              <option value="+">Sustenta (+)</option>
              <option value="-">Afasta (-)</option>
            </select>
          </label>
          <label className="anamnese-wide-field">
            Frase original do livro
            <input
              value={link.rawPattern || link.sourceLabel || ''}
              onChange={event => updateLink(index, 'rawPattern', event.target.value)}
            />
          </label>
          <label className="anamnese-wide-field">
            Evidência
            <textarea value={link.evidence || ''} onChange={event => updateLink(index, 'evidence', event.target.value)} />
          </label>
          {link.hiddenByNormalization && (
            <div className="inline-error">
              Sinalizado como ruído: {link.normalizationReason || 'não usar para aprovação sem editar.'}
            </div>
          )}
          <button className="danger-button" type="button" onClick={() => removeLink(index)}>Remover vínculo</button>
        </div>
      ))}
    </div>
  );
}

function CandidateEditor({ editor, setEditor, patternOptions }) {
  if (!editor) return <div className="empty-state">Nenhum candidato selecionado.</div>;

  if (editor.type === 'finding') {
    return (
      <div className="anamnese-knowledge-editor">
        <label>
          Rótulo
          <input value={editor.label || ''} onChange={event => setEditor(prev => ({ ...prev, label: event.target.value }))} />
        </label>
        <label>
          Grupo do checklist
          <select value={editor.checklistGroup || 'lingua'} onChange={event => setEditor(prev => ({ ...prev, checklistGroup: event.target.value }))}>
            {[...Object.keys(checklists), 'novo'].map(group => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </label>
        <label className="anamnese-wide-field">
          Gatilhos da anamnese
          <textarea value={editor.aliasesText || ''} onChange={event => setEditor(prev => ({ ...prev, aliasesText: event.target.value }))} />
        </label>
        <PatternLinkEditor
          links={editor.patternLinks || []}
          patternOptions={patternOptions}
          onChange={patternLinks => setEditor(prev => ({ ...prev, patternLinks }))}
        />
      </div>
    );
  }

  if (editor.type === 'question') {
    return (
      <div className="anamnese-knowledge-editor">
        <label className="anamnese-wide-field">
          Pergunta
          <input value={editor.prompt || ''} onChange={event => setEditor(prev => ({ ...prev, prompt: event.target.value }))} />
        </label>
        <label>
          Grupo do checklist
          <select value={editor.checklistGroup || 'sintomas'} onChange={event => setEditor(prev => ({ ...prev, checklistGroup: event.target.value }))}>
            {[...Object.keys(checklists), 'novo'].map(group => (
              <option key={group} value={group}>{group}</option>
            ))}
          </select>
        </label>
        <label className="anamnese-wide-field">
          Opções
          <textarea value={editor.optionsText || ''} onChange={event => setEditor(prev => ({ ...prev, optionsText: event.target.value }))} />
        </label>
        <label className="anamnese-wide-field">
          Racional
          <textarea value={editor.rationale || ''} onChange={event => setEditor(prev => ({ ...prev, rationale: event.target.value }))} />
        </label>
        <label className="anamnese-wide-field">
          Achados vinculados
          <textarea value={editor.linkedFindingsText || ''} onChange={event => setEditor(prev => ({ ...prev, linkedFindingsText: event.target.value }))} />
        </label>
      </div>
    );
  }

  return (
    <div className="anamnese-knowledge-editor">
      <label className="anamnese-wide-field">
        Padrão
        <input value={editor.pattern || ''} onChange={event => setEditor(prev => ({ ...prev, pattern: event.target.value }))} />
      </label>
      {editor.hiddenByNormalization && (
        <div className="inline-error">
          Nome sinalizado como ruído: {editor.normalization?.reason || 'revise antes de aprovar.'}
        </div>
      )}
      <label className="anamnese-wide-field">
        Sinais de língua
        <textarea value={editor.tongueSignsText || ''} onChange={event => setEditor(prev => ({ ...prev, tongueSignsText: event.target.value }))} />
      </label>
      <label className="anamnese-wide-field">
        Sinais de pulso
        <textarea value={editor.pulseSignsText || ''} onChange={event => setEditor(prev => ({ ...prev, pulseSignsText: event.target.value }))} />
      </label>
      <label className="anamnese-wide-field">
        Sintomas
        <textarea value={editor.symptomsText || ''} onChange={event => setEditor(prev => ({ ...prev, symptomsText: event.target.value }))} />
      </label>
      <label className="anamnese-wide-field">
        Diferenciais
        <textarea value={editor.differentialsText || ''} onChange={event => setEditor(prev => ({ ...prev, differentialsText: event.target.value }))} />
      </label>
    </div>
  );
}

export function AnamneseKnowledgePanel() {
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('unanswered');
  const [selectedId, setSelectedId] = useState('');
  const [editor, setEditor] = useState(null);
  const [payload, setPayload] = useState({
    findings: [],
    questions: [],
    patterns: [],
    rows: [],
    normalizationMap: null,
    seedDecisions: [],
    counts: {},
  });

  function refreshRows(base = payload) {
    const rows = refreshAnamneseKnowledgeRows(base);
    setPayload(prev => ({ ...prev, ...base, rows }));
    return rows;
  }

  useEffect(() => {
    let cancelled = false;
    loadAnamneseKnowledgeCurationPayload()
      .then(data => {
        if (cancelled) return;
        setPayload(data);
        setLoadState('ready');
        const first = data.rows.find(row => row.status === 'review' && !row.hiddenByNormalization) || data.rows[0] || null;
        setSelectedId(first?.candidateId || first?.id || '');
        setEditor(editorFromCandidate(first));
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Não foi possível carregar candidatos da anamnese.');
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const patternOptions = useMemo(() => {
    const fromDefinitions = Object.keys(patternDefinitions).map(name => ({
      value: name,
      label: name,
    }));
    const fromMap = (payload.normalizationMap?.items || [])
      .filter(item => !item.hidden && item.canonicalPattern)
      .map(item => ({
        value: item.canonicalPattern,
        label: item.canonicalSource === 'patternDefinitions'
          ? item.canonicalPattern
          : `${item.canonicalPattern} (candidato)`,
      }));
    const map = new Map();
    for (const option of [...fromDefinitions, ...fromMap]) {
      if (!map.has(option.value)) map.set(option.value, option);
    }
    return [...map.values()].sort((left, right) => left.label.localeCompare(right.label, 'pt-BR'));
  }, [payload.normalizationMap]);

  const summary = useMemo(() => summarizeAnamneseKnowledgeRows(payload.rows), [payload.rows]);
  const filteredRows = useMemo(
    () => filterAnamneseKnowledgeRows(payload.rows, { query, filter }),
    [filter, payload.rows, query],
  );
  const selectedCandidate = useMemo(() => {
    return payload.rows.find(row => (row.candidateId || row.id) === selectedId)
      || filteredRows[0]
      || payload.rows[0]
      || null;
  }, [filteredRows, payload.rows, selectedId]);

  function selectCandidate(candidate) {
    setSelectedId(candidate.candidateId || candidate.id);
    setEditor(editorFromCandidate(candidate));
    setMessage('');
  }

  function save(status) {
    const candidate = candidateFromEditor(editor);
    if (!candidate) return;

    if (status === 'approved_local') {
      const validation = validateAnamneseKnowledgeCandidate(candidate, patternOptions);
      if (!validation.ok) {
        setMessage(validation.errors.join(' '));
        return;
      }
    }

    const decision = saveAnamneseKnowledgeDecision(candidate, status, {
      approvedByRole: 'super_admin',
      approvedByLabel: 'SuperAdm',
    });
    const rows = refreshRows(payload);
    const fresh = rows.find(row => (row.candidateId || row.id) === decision.candidateId) || candidate;
    setSelectedId(decision.candidateId);
    setEditor(editorFromCandidate(fresh));
    setMessage(status === 'approved_local'
      ? 'Candidato aprovado localmente.'
      : status === 'rejected'
        ? 'Candidato reprovado e removido da fila ativa.'
        : 'Revisão salva localmente.');
  }

  function exportApproved() {
    const decisions = getLocalAnamneseKnowledgeDecisions();
    const envelope = buildApprovedKnowledgeEnvelope({ candidates: payload.rows, decisions });
    exportApprovedAnamneseKnowledge(payload.rows, decisions);
    setMessage(`Exportação preparada com ${envelope.counts.approvedLocal} aprovado(s) localmente.`);
  }

  useEffect(() => {
    if (!message || message.includes('bloqueada') || message.includes('obrigatório') || message.includes('Informe')) return undefined;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  if (loadState === 'loading') {
    return (
      <section className="admin-knowledge anamnese-knowledge-panel">
        <div className="empty-state">Carregando candidatos de conhecimento da anamnese...</div>
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
          <p className="small">SuperAdm • Curadoria</p>
          <h2>Conhecimento da Anamnese</h2>
          <span>Achados, perguntas e padrões em revisão com fonte visual rastreável.</span>
        </div>
        <div className="anamnese-panel-actions">
          <button className="quiet-button" type="button" onClick={() => exportPatternNormalizationMap(payload.normalizationMap)}>
            Exportar mapa
          </button>
          <button className="quiet-button" type="button" onClick={exportApproved}>
            Exportar aprovados
          </button>
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="security-card admin-stat-card total">
          <span>Candidatos</span>
          <b>{summary.total}</b>
          <p>{summary.active} na fila ativa</p>
        </div>
        <div className="security-card admin-stat-card pending">
          <span>Pendentes</span>
          <b>{summary.pending}</b>
          <p>sem decisão local</p>
        </div>
        <div className="security-card admin-stat-card active">
          <span>Aprovados</span>
          <b>{summary.approved}</b>
          <p>approved_local</p>
        </div>
        <div className="security-card admin-stat-card suspended">
          <span>Ruído</span>
          <b>{payload.normalizationMap?.counts?.hiddenNoise || 0}</b>
          <p>pré-filtrados</p>
        </div>
        <div className="security-card admin-stat-card patients">
          <span>Mapa</span>
          <b>{payload.normalizationMap?.counts?.groups || 0}</b>
          <p>grupos normalizados</p>
        </div>
      </div>

      {message && (
        <div className={/bloquead|obrigat|Informe|fora da lista/i.test(message) ? 'inline-error' : 'inline-success'}>
          {message}
        </div>
      )}

      <div className="pdf-learning-layout anamnese-knowledge-layout">
        <section className="admin-users pdf-learning-list-panel">
          <div className="admin-toolbar">
            <input
              className="admin-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar por rótulo, gatilho ou padrão"
            />
            <select value={filter} onChange={event => setFilter(event.target.value)}>
              {KNOWLEDGE_FILTERS.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="knowledge-confidence-tabs" role="tablist" aria-label="Filtros de conhecimento da anamnese">
            {KNOWLEDGE_FILTERS.map(item => {
              const count = filterAnamneseKnowledgeRows(payload.rows, { filter: item.id }).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`knowledge-confidence-tab ${filter === item.id ? 'active' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  <span>{item.label}</span>
                  <b>{count}</b>
                </button>
              );
            })}
          </div>

          {filteredRows.length === 0 ? (
            <div className="empty-state">Nenhum candidato neste filtro.</div>
          ) : (
            <div className="admin-user-list knowledge-draft-list pdf-learning-list">
              {filteredRows.slice(0, 220).map(row => (
                <button
                  key={`${row.type}:${row.candidateId || row.id}`}
                  type="button"
                  className={`admin-user-row admin-user-button knowledge-confidence-row ${selectedCandidate?.candidateId === row.candidateId ? 'selected' : ''} ${row.hiddenByNormalization ? 'warning' : 'active'}`}
                  onClick={() => selectCandidate(row)}
                >
                  <div className="admin-user-main">
                    <b>{TYPE_LABELS[row.type]} • {titleForCandidate(row)}</b>
                    <small>{typeDomain(row)} • {row.checklistGroup || row.domain || 'sem grupo'} • {formatPercent(sourceConfidencePercent(row))}</small>
                    <em>
                      {row.type === 'finding'
                        ? `${(row.patternLinks || []).filter(link => !link.hiddenByNormalization).length} vínculo(s) válido(s)`
                        : row.hiddenByNormalization
                          ? 'sinalizado como ruído'
                          : row.source?.title || 'conteúdo curável'}
                    </em>
                  </div>
                  <div className="admin-user-meta">
                    <span className={`admin-status ${statusTone(row.status)}`}>{STATUS_LABELS[row.status] || row.status}</span>
                    {(row.localDecision || row.seedDecision) && <span className="admin-status active">salvo</span>}
                    {row.hiddenByNormalization && <span className="admin-status warning">ruído</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-users anamnese-knowledge-detail">
          {!selectedCandidate || !editor ? (
            <div className="empty-state">Nenhum candidato selecionado.</div>
          ) : (
            <>
              <div className="pdf-learning-detail-head">
                <div>
                  <p className="small">{TYPE_LABELS[selectedCandidate.type]} • {typeDomain(selectedCandidate)}</p>
                  <h2>{titleForCandidate(selectedCandidate)}</h2>
                  <span>{selectedCandidate.candidateId || selectedCandidate.id}</span>
                </div>
                <div className="anamnese-panel-actions">
                  <span className={`admin-status ${statusTone(selectedCandidate.status)}`}>
                    {STATUS_LABELS[selectedCandidate.status] || selectedCandidate.status}
                  </span>
                </div>
              </div>

              <div className="anamnese-review-grid">
                <div className="anamnese-review-source">
                  <div className="anamnese-review-section-head">
                    <p className="small">Evidência</p>
                    <h3>Fonte rastreável</h3>
                  </div>
                  <SourceProof candidate={selectedCandidate} />
                </div>
                <section className="anamnese-knowledge-form">
                  <div className="anamnese-review-section-head">
                    <p className="small">Curadoria</p>
                    <h3>Dados do candidato</h3>
                  </div>
                  <CandidateEditor editor={editor} setEditor={setEditor} patternOptions={patternOptions} />
                  <div className="anamnese-editor-actions">
                    <button className="primary-button" type="button" onClick={() => save('approved_local')}>
                      Aprovar
                    </button>
                    <button className="danger-button" type="button" onClick={() => save('rejected')}>
                      Reprovar
                    </button>
                    <button className="quiet-button" type="button" onClick={() => save('review')}>
                      Salvar em revisão
                    </button>
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
