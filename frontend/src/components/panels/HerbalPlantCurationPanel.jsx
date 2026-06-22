import { useEffect, useMemo, useState } from 'react';
import {
  HERBAL_CURATION_FILTERS,
  HERBAL_RELEASE_STATUS,
  downloadHerbalCurationDecisions,
  filterHerbalCurationRows,
  getLocalHerbalCurationDecisions,
  materializeHerbalCurationRows,
  removeLocalHerbalCurationDecision,
  summarizeHerbalCurationRows,
  validateHerbalCurationDecision,
} from '../../knowledge/herbalPlantCuration';
import {
  loadHerbalPlantCurationPayload,
  saveHerbalPlantCurationDecision,
} from '../../services/herbalPlantCurationService';
import { resolveKnowledgeSourceAssetUrl } from '../../services/knowledgeSourceAssetService';

const SAFETY_FIELDS = [
  ['botanicalIdentityConfirmed', 'Espécie botânica confirmada'],
  ['partUsedConfirmed', 'Parte usada confirmada'],
  ['toxicologyReviewed', 'Toxicologia revisada'],
  ['interactionsReviewed', 'Interações revisadas'],
  ['vulnerableGroupsReviewed', 'Grupos vulneráveis revisados'],
  ['sourceScopeConfirmed', 'Escopo educativo conferido'],
];

const SOURCE_SECTION_LABELS = [
  ['partsUsed', 'Partes utilizadas'],
  ['traditionalProperties', 'Propriedades tradicionais da fonte'],
  ['traditionalIndications', 'Indicações tradicionais da fonte'],
  ['formsOfUse', 'Formas de uso descritas na fonte'],
  ['toxicology', 'Toxicologia e cautelas da fonte'],
];

const BODY_TERM_LABELS = {
  cerebro: 'cérebro',
  coracao: 'coração',
  estomago: 'estômago',
  figado: 'fígado',
  intestinos: 'intestinos',
  pulmoes: 'pulmões',
  rins: 'rins',
  utero: 'útero',
};

function statusTone(status) {
  if (status === 'educativo_aprovado') return 'active';
  if (status === 'bloqueado_risco') return 'blocked';
  if (status === 'restrito_profissional') return 'warning';
  if (status === 'curadoria_tecnica') return 'pending';
  return 'neutral';
}

function statusLabel(status) {
  return HERBAL_RELEASE_STATUS.find(item => item.value === status)?.label || 'Somente fonte';
}

function pageLabel(pages = []) {
  return pages.length ? `PDF p. ${pages.join(', ')}` : 'Página não informada';
}

function reviewFormFromRow(row) {
  const decision = row?.curationDecision || {};
  return {
    plantId: row?.id || '',
    status: decision.status || row?.contentReleaseStatus || 'source_only',
    contentType: decision.contentType || 'planta_medicinal',
    educationalSummary: decision.educationalSummary || '',
    cautionSummary: decision.cautionSummary || '',
    reviewNote: decision.reviewNote || '',
    mtcAssociationNote: decision.mtcAssociationNote || '',
    mtcAssociationSource: decision.mtcAssociationSource || '',
    safetyReview: {
      botanicalIdentityConfirmed: false,
      partUsedConfirmed: false,
      toxicologyReviewed: false,
      interactionsReviewed: false,
      vulnerableGroupsReviewed: false,
      sourceScopeConfirmed: false,
      ...(decision.safetyReview || {}),
    },
  };
}

function sourcePageKey(page) {
  return `pdf-sources/ebook-ervas-medicinais/pages/page-${String(page).padStart(3, '0')}.webp`;
}

function SourcePreview({ plant, activePage, onPageChange }) {
  const [imageState, setImageState] = useState({ key: '', status: 'idle', url: '', error: '' });
  const pages = plant?.sourcePdfPages || [];
  const page = activePage || pages[0];
  const assetKey = page ? sourcePageKey(page) : '';
  const isCurrent = imageState.key === assetKey;

  useEffect(() => {
    let cancelled = false;
    if (!assetKey) return undefined;

    resolveKnowledgeSourceAssetUrl(assetKey, { purpose: 'herbal-curation-source' })
      .then(url => {
        if (!cancelled) setImageState({ key: assetKey, status: 'ready', url, error: '' });
      })
      .catch(error => {
        if (!cancelled) {
          setImageState({
            key: assetKey,
            status: 'error',
            url: '',
            error: error.message || 'Fonte visual indisponível.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [assetKey]);

  if (!plant) return <div className="empty-state">Selecione uma planta.</div>;

  return (
    <section className="herbal-source-preview">
      <div className="herbal-source-preview-head">
        <div>
          <span>Fonte protegida</span>
          <b>E-book Ervas Medicinais</b>
          <small>{pageLabel(pages)}</small>
        </div>
        <span className="admin-status neutral">source_only</span>
      </div>

      {pages.length > 1 && (
        <div className="herbal-page-picker" aria-label="Selecionar página da fonte">
          {pages.map(item => (
            <button
              key={item}
              type="button"
              className={item === page ? 'active' : ''}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}

      {isCurrent && imageState.status === 'ready' ? (
        <div className="pdf-source-preview-frame herbal-source-image">
          <img src={imageState.url} alt={`Página ${page} do E-book Ervas Medicinais`} loading="lazy" />
        </div>
      ) : (
        <div className="pdf-source-preview-empty">
          {isCurrent && imageState.status === 'error' ? imageState.error : 'Carregando página da fonte...'}
        </div>
      )}
    </section>
  );
}

function SourceSections({ plant }) {
  const sections = SOURCE_SECTION_LABELS
    .map(([key, label]) => ({ key, label, value: plant?.sourceSections?.[key] }))
    .filter(item => item.value?.text);

  return (
    <section className="herbal-source-sections">
      <div className="anamnese-review-section-head">
        <div>
          <p className="small">Trechos rastreáveis</p>
          <h3>Conteúdo da fonte</h3>
        </div>
      </div>
      {sections.map(section => (
        <details className="herbal-source-section" key={section.key} open={section.key === 'toxicology'}>
          <summary>
            <b>{section.label}</b>
            <span>{pageLabel(section.value.pdfPages)}</span>
          </summary>
          <p>{section.value.text}</p>
        </details>
      ))}
      {!sections.length && <div className="empty-state">Sem trechos estruturados para esta planta.</div>}
    </section>
  );
}

function SafetyChecklist({ form, setForm }) {
  return (
    <fieldset className="herbal-safety-checklist">
      <legend>Conferência de segurança</legend>
      {SAFETY_FIELDS.map(([field, label]) => (
        <label key={field}>
          <input
            type="checkbox"
            checked={Boolean(form.safetyReview?.[field])}
            onChange={event => setForm(prev => ({
              ...prev,
              safetyReview: { ...prev.safetyReview, [field]: event.target.checked },
            }))}
          />
          <span>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}

export function HerbalPlantCurationPanel() {
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('pending');
  const [safetyFilter, setSafetyFilter] = useState('all');
  const [selectedId, setSelectedId] = useState('');
  const [activePage, setActivePage] = useState(0);
  const [form, setForm] = useState(() => reviewFormFromRow(null));
  const [payload, setPayload] = useState({ catalog: null, decisions: [], rows: [] });

  useEffect(() => {
    let cancelled = false;
    loadHerbalPlantCurationPayload()
      .then(data => {
        if (cancelled) return;
        setPayload(data);
        const first = data.rows.find(row => !row.curationDecision) || data.rows[0] || null;
        setSelectedId(first?.id || '');
        setActivePage(first?.sourcePdfPages?.[0] || 0);
        setForm(reviewFormFromRow(first));
        setLoadState('ready');
      })
      .catch(loadError => {
        if (cancelled) return;
        setError(loadError.message || 'Não foi possível carregar o catálogo de plantas.');
        setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const summary = useMemo(() => summarizeHerbalCurationRows(payload.rows), [payload.rows]);
  const filteredRows = useMemo(
    () => filterHerbalCurationRows(payload.rows, { query, filter, safety: safetyFilter }),
    [filter, payload.rows, query, safetyFilter],
  );
  const selectedRow = useMemo(
    () => payload.rows.find(row => row.id === selectedId) || filteredRows[0] || payload.rows[0] || null,
    [filteredRows, payload.rows, selectedId],
  );

  function selectPlant(row) {
    setSelectedId(row.id);
    setActivePage(row.sourcePdfPages?.[0] || 0);
    setForm(reviewFormFromRow(row));
    setMessage('');
  }

  function updateRows() {
    const decisions = getLocalHerbalCurationDecisions();
    const rows = materializeHerbalCurationRows(payload.catalog?.items || [], decisions);
    setPayload(prev => ({ ...prev, decisions, rows }));
    return rows;
  }

  function saveDecision(event) {
    event.preventDefault();
    if (!selectedRow) return;
    const validation = validateHerbalCurationDecision({
      ...form,
      plantId: selectedRow.id,
      reviewedByRole: 'super_admin',
      reviewedByLabel: 'SuperAdm',
    }, selectedRow);
    if (!validation.ok) {
      setMessage(validation.errors.join(' '));
      return;
    }

    saveHerbalPlantCurationDecision({
      ...validation.decision,
      reviewedByRole: 'super_admin',
      reviewedByLabel: 'SuperAdm',
    }, selectedRow);
    const rows = updateRows();
    const fresh = rows.find(row => row.id === selectedRow.id) || selectedRow;
    setForm(reviewFormFromRow(fresh));
    setMessage(validation.decision.status === 'educativo_aprovado'
      ? 'Curadoria educativa aprovada localmente.'
      : 'Decisão de curadoria salva localmente.');
  }

  function resetDecision() {
    if (!selectedRow?.curationDecision) return;
    removeLocalHerbalCurationDecision(selectedRow.id);
    const rows = updateRows();
    const fresh = rows.find(row => row.id === selectedRow.id) || selectedRow;
    setForm(reviewFormFromRow(fresh));
    setMessage('Decisão local removida; a planta voltou para somente fonte.');
  }

  function exportDecisions() {
    const envelope = downloadHerbalCurationDecisions();
    setMessage(`${envelope.decisions.length} decisão(ões) exportada(s).`);
  }

  if (loadState === 'loading') {
    return <section className="admin-knowledge herbal-curation-panel"><div className="empty-state">Carregando catálogo de plantas...</div></section>;
  }

  if (loadState === 'error') {
    return <section className="admin-knowledge herbal-curation-panel"><div className="inline-error">{error}</div></section>;
  }

  return (
    <section className="admin-knowledge herbal-curation-panel">
      <div className="start-panel-head">
        <div>
          <p className="small">SuperAdm • Curadoria interna</p>
          <h2>Curadoria de ervas</h2>
          <span>Fonte, cautelas e decisão profissional por planta.</span>
        </div>
        <button className="quiet-button" type="button" onClick={exportDecisions}>Exportar decisões</button>
      </div>

      <div className="admin-stat-grid">
        <div className="security-card admin-stat-card total"><span>Plantas</span><b>{summary.total}</b><p>fichas da fonte</p></div>
        <div className="security-card admin-stat-card pending"><span>Sem decisão</span><b>{summary.pending}</b><p>na fila inicial</p></div>
        <div className="security-card admin-stat-card active"><span>Aprovadas</span><b>{summary.approved}</b><p>{summary.patientEligible} apta(s) para educação</p></div>
        <div className="security-card admin-stat-card suspended"><span>Bloqueadas</span><b>{summary.blocked}</b><p>por risco</p></div>
        <div className="security-card admin-stat-card patients"><span>Toxicologia</span><b>{summary.withToxicology}</b><p>fichas com trecho</p></div>
      </div>

      {message && <div className={/obrigat|bloquead|confirme|inclua|informe/i.test(message) ? 'inline-error' : 'inline-success'}>{message}</div>}

      <div className="herbal-curation-layout">
        <section className="admin-users herbal-curation-list-panel">
          <div className="admin-toolbar herbal-curation-toolbar">
            <input
              className="admin-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar planta, espécie, indicação ou termo corporal"
            />
            <select value={safetyFilter} onChange={event => setSafetyFilter(event.target.value)} aria-label="Filtrar por dados de segurança">
              <option value="all">Todas as fichas</option>
              <option value="with_toxicology">Com toxicologia</option>
              <option value="without_toxicology">Sem toxicologia</option>
              <option value="with_indications">Com indicações</option>
            </select>
          </div>

          <div className="knowledge-confidence-tabs herbal-status-tabs" aria-label="Filtrar status da curadoria">
            {HERBAL_CURATION_FILTERS.map(item => {
              const count = item.id === 'all'
                ? summary.total
                : item.id === 'pending'
                  ? summary.pending
                  : payload.rows.filter(row => row.contentReleaseStatus === item.id).length;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`knowledge-confidence-tab ${filter === item.id ? 'active' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  <span>{item.label}</span><b>{count}</b>
                </button>
              );
            })}
          </div>

          <div className="admin-user-list knowledge-draft-list herbal-curation-list">
            {filteredRows.length === 0 ? (
              <div className="empty-state">Nenhuma planta para estes filtros.</div>
            ) : filteredRows.map(row => (
              <button
                key={row.id}
                type="button"
                className={`admin-user-row admin-user-button knowledge-confidence-row ${selectedRow?.id === row.id ? 'selected' : ''}`}
                onClick={() => selectPlant(row)}
              >
                <div className="admin-user-main">
                  <b>{row.commonName}</b>
                  <small><i>{row.scientificNameSource}</i></small>
                  <em>{pageLabel(row.sourcePdfPages)} • {row.sourceSections?.toxicology?.text ? 'toxicologia registrada' : 'sem trecho de toxicologia'}</em>
                </div>
                <div className="admin-user-meta">
                  <span className={`admin-status ${statusTone(row.contentReleaseStatus)}`}>{statusLabel(row.contentReleaseStatus)}</span>
                  {row.curationDecision && <small>revisão local</small>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-users herbal-curation-detail">
          {!selectedRow ? <div className="empty-state">Nenhuma planta selecionada.</div> : (
            <>
              <div className="pdf-learning-detail-head herbal-curation-detail-head">
                <div>
                  <p className="small">{selectedRow.botanicalFamily || 'Família não informada'}</p>
                  <h2>{selectedRow.commonName}</h2>
                  <span><i>{selectedRow.scientificNameSource}</i></span>
                </div>
                <div className="herbal-detail-statuses">
                  <span className={`admin-status ${statusTone(selectedRow.contentReleaseStatus)}`}>{statusLabel(selectedRow.contentReleaseStatus)}</span>
                  {selectedRow.wikipediaUrl && <a href={selectedRow.wikipediaUrl} target="_blank" rel="noreferrer">Wikipedia</a>}
                </div>
              </div>

              <div className="herbal-detail-grid">
                <div className="herbal-detail-source-column">
                  <SourcePreview plant={selectedRow} activePage={activePage} onPageChange={setActivePage} />
                  <SourceSections plant={selectedRow} />
                  <div className="herbal-mtc-note">
                    <b>Associação MTC</b>
                    <span>{selectedRow.traditionalMtcAssociations?.length ? 'Registrada em fonte específica.' : 'Não registrada neste e-book.'}</span>
                    {selectedRow.sourceMentionedBodyTerms?.length > 0 && (
                      <small>Termos corporais literais: {selectedRow.sourceMentionedBodyTerms.map(term => BODY_TERM_LABELS[term] || term).join(', ')}.</small>
                    )}
                  </div>
                </div>

                <form className="herbal-curation-form" onSubmit={saveDecision}>
                  <div className="anamnese-review-section-head">
                    <div>
                      <p className="small">Decisão profissional</p>
                      <h3>Revisão da ficha</h3>
                    </div>
                  </div>

                  <div className="herbal-form-grid">
                    <label>
                      Classificação
                      <select value={form.contentType} onChange={event => setForm(prev => ({ ...prev, contentType: event.target.value }))}>
                        <option value="planta_medicinal">Planta medicinal</option>
                        <option value="alimento">Alimento</option>
                      </select>
                    </label>
                    <label>
                      Status de liberação
                      <select value={form.status} onChange={event => setForm(prev => ({ ...prev, status: event.target.value }))}>
                        {HERBAL_RELEASE_STATUS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                      </select>
                    </label>
                    <label className="herbal-form-wide">
                      Síntese educativa interna
                      <textarea value={form.educationalSummary} onChange={event => setForm(prev => ({ ...prev, educationalSummary: event.target.value }))} />
                    </label>
                    <label className="herbal-form-wide">
                      Cautelas revisadas
                      <textarea value={form.cautionSummary} onChange={event => setForm(prev => ({ ...prev, cautionSummary: event.target.value }))} />
                    </label>
                    <label className="herbal-form-wide">
                      Nota de curadoria
                      <textarea value={form.reviewNote} onChange={event => setForm(prev => ({ ...prev, reviewNote: event.target.value }))} required={form.status !== 'source_only'} />
                    </label>
                    <label className="herbal-form-wide">
                      Associação MTC em revisão
                      <textarea value={form.mtcAssociationNote} onChange={event => setForm(prev => ({ ...prev, mtcAssociationNote: event.target.value }))} />
                    </label>
                    <label className="herbal-form-wide">
                      Fonte da associação MTC
                      <input value={form.mtcAssociationSource} onChange={event => setForm(prev => ({ ...prev, mtcAssociationSource: event.target.value }))} />
                    </label>
                  </div>

                  <SafetyChecklist form={form} setForm={setForm} />

                  <div className="herbal-curation-actions">
                    <button className="primary-button" type="submit">Salvar decisão</button>
                    {selectedRow.curationDecision && <button className="quiet-button" type="button" onClick={resetDecision}>Remover decisão</button>}
                  </div>
                </form>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
