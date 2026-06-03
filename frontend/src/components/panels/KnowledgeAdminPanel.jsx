import { useEffect, useMemo, useState } from 'react';
import {
  KM_AGENT_ENRICHED_INDEX_URL,
  KM_AGENT_DRAFT_INDEX_URL,
  getKmAgentLocationPtBr,
  getKmAgentNeedlingPtBr,
  getKmAgentDraftStats,
  getKmAgentDraftTitlePtBr,
  getKmAgentTranslationBadges,
  titleNeedsPtBr,
} from '../../knowledge/kmAgentDrafts';
import {
  findAtlasEdneaSourceReference,
  loadAtlasEdneaSourceIndex,
} from '../../knowledge/sourceReferences';
import {
  downloadKnowledgeReviews,
  getDeepCuratedKnowledgeReviews,
  getLocalKnowledgeReviews,
  removeLocalKnowledgeReview,
  saveLocalKnowledgeReview,
} from '../../services/knowledgeAdminService';

const EMPTY_REVIEW = {
  actions: '',
  indications: '',
  cautions: '',
  relatedPatterns: '',
  techniques: 'agulha, laser, stiper',
  clinicalNote: '',
};

function asSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function getDraftTitle(item) {
  return getKmAgentDraftTitlePtBr(item);
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function draftToReviewForm(item) {
  return {
    code: item?.code || '',
    displayCode: item?.displayCode || item?.code || '',
    title: getDraftTitle(item || {}),
    meridianCode: item?.metadata?.meridianCode || '',
    meridian: item?.metadata?.meridianPtBr || item?.metadata?.meridian || '',
    locationText: getKmAgentLocationPtBr(item || {}),
    needling: getKmAgentNeedlingPtBr(item || {}),
    source: item?.source || 'km-agent/data/acupoints.csv',
    ...EMPTY_REVIEW,
  };
}

function reviewToForm(review) {
  if (!review) return draftToReviewForm(null);
  return {
    ...review,
    title: titleNeedsPtBr(review.title) ? getKmAgentDraftTitlePtBr(review) : review.title,
    actions: Array.isArray(review.actions) ? review.actions.join(', ') : review.actions || '',
    indications: Array.isArray(review.indications) ? review.indications.join(', ') : review.indications || '',
    cautions: Array.isArray(review.cautions) ? review.cautions.join(', ') : review.cautions || '',
    relatedPatterns: Array.isArray(review.relatedPatterns) ? review.relatedPatterns.join(', ') : review.relatedPatterns || '',
    techniques: Array.isArray(review.techniques) ? review.techniques.join(', ') : review.techniques || '',
  };
}

function reviewMatchesCode(review, code) {
  return String(review?.code || '').toUpperCase() === String(code || '').toUpperCase();
}

function formatPageList(pages = []) {
  return pages.length ? pages.join(', ') : 'sem página';
}

function getAtlasConfidenceTone(confidence) {
  if (confidence === 'high') return 'active';
  if (confidence === 'medium') return 'pending';
  return 'blocked';
}

function getAtlasStatusLabel(status) {
  if (status === 'atlas_referenced_candidate') return 'referência localizada';
  if (status === 'review_needed') return 'revisão necessária';
  return status || 'rascunho';
}

function AtlasSourceReferencePanel({ reference, loadState }) {
  const imageSources = (reference?.imageUrls || []).filter(item => item.url);
  const hasImages = Boolean(reference?.imageAvailable && imageSources.length);

  if (loadState === 'loading') {
    return (
      <div className="knowledge-source-note atlas-source-note">
        <b>Fonte Atlas</b>
        <span>Carregando índice de páginas do Atlas...</span>
      </div>
    );
  }

  if (loadState === 'error') {
    return (
      <div className="knowledge-source-note atlas-source-note">
        <b>Fonte Atlas</b>
        <span>Índice de fonte indisponível neste ambiente.</span>
      </div>
    );
  }

  if (!reference) {
    return (
      <div className="knowledge-source-note atlas-source-note">
        <b>Fonte Atlas</b>
        <span>Sem referência automática do Atlas para este rascunho.</span>
      </div>
    );
  }

  return (
    <div className="knowledge-source-note atlas-source-note">
      <div className="atlas-source-head">
        <b>Fonte Atlas</b>
        <span className={`admin-status ${getAtlasConfidenceTone(reference.confidence)}`}>
          {reference.confidence || 'baixa'}
        </span>
      </div>
      <span>{reference.title || reference.referenceLabel}</span>
      <small>
        {reference.referenceLabel} • PDF p. {formatPageList(reference.pdfPages)}
      </small>
      <small>{getAtlasStatusLabel(reference.status)} • revisão profissional obrigatória</small>

      {!hasImages && (
        <small>Imagem da fonte ainda não renderizada; metadados já indexados para consulta.</small>
      )}

      {hasImages && (
        <div className="atlas-source-images">
          {imageSources.map(item => (
            <img
              key={`${reference.code}-${item.pdfPage}`}
              src={item.url}
              alt={`${reference.referenceLabel}, PDF p. ${item.pdfPage}`}
              loading="lazy"
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgeAdminPanel() {
  const [drafts, setDrafts] = useState([]);
  const [draftLoadState, setDraftLoadState] = useState('loading');
  const [atlasSourceIndex, setAtlasSourceIndex] = useState(null);
  const [atlasSourceLoadState, setAtlasSourceLoadState] = useState('loading');
  const [query, setQuery] = useState('');
  const [meridianFilter, setMeridianFilter] = useState('all');
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [reviewForm, setReviewForm] = useState(() => draftToReviewForm(null));
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviews, setReviews] = useState(() => getLocalKnowledgeReviews());
  const [curatedReviews, setCuratedReviews] = useState([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    fetch(KM_AGENT_ENRICHED_INDEX_URL)
      .then(response => {
        if (!response.ok) {
          return fetch(KM_AGENT_DRAFT_INDEX_URL).then(fallback => {
            if (!fallback.ok) throw new Error(`HTTP ${fallback.status}`);
            return fallback;
          });
        }
        return response;
      })
      .then(response => {
        return response.json();
      })
      .then(data => {
        if (cancelled) return;
        const items = Array.isArray(data) ? data : [];
        setDrafts(items);
        setDraftLoadState('ready');
        if (!selectedDraft && items[0]) {
          setSelectedDraft(items[0]);
          setReviewForm(draftToReviewForm(items[0]));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDraftLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled = false;

    getDeepCuratedKnowledgeReviews()
      .then(items => {
        if (!cancelled) setCuratedReviews(items);
      })
      .catch(() => {
        if (!cancelled) setCuratedReviews([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadAtlasEdneaSourceIndex()
      .then(data => {
        if (cancelled) return;
        setAtlasSourceIndex(data);
        setAtlasSourceLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setAtlasSourceLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = getKmAgentDraftStats(drafts);
  const meridians = useMemo(
    () => [...new Set(drafts.map(item => item.metadata?.meridianCode).filter(Boolean))].sort(),
    [drafts],
  );

  const filteredDrafts = useMemo(() => {
    const term = asSearchText(query);
    return drafts.filter(item => {
      if (meridianFilter !== 'all' && item.metadata?.meridianCode !== meridianFilter) return false;
      if (!term) return true;
      return asSearchText([
        item.code,
        item.displayCode,
        item.names?.ko,
        item.names?.zh,
        item.names?.en,
        item.metadata?.meridianCode,
        item.metadata?.meridian,
        item.metadata?.meridianPtBr,
        item.location?.ptBr,
        item.locationPreview,
        item.acukg?.indications?.map(indication => indication.ptBrDraft || indication.original).join(' '),
      ].join(' ')).includes(term);
    });
  }, [drafts, query, meridianFilter]);

  const selectedExistingReview = reviews.find(item => reviewMatchesCode(item, selectedDraft?.code));
  const selectedCuratedReview = curatedReviews.find(item => reviewMatchesCode(item, selectedDraft?.code));
  const selectedAtlasSource = useMemo(
    () => findAtlasEdneaSourceReference(atlasSourceIndex, selectedDraft?.code),
    [atlasSourceIndex, selectedDraft?.code],
  );

  function selectDraft(item) {
    const existingReview = reviews.find(review => reviewMatchesCode(review, item.code));
    const curatedReview = curatedReviews.find(review => reviewMatchesCode(review, item.code));
    setSelectedDraft(item);
    setReviewForm(existingReview ? reviewToForm(existingReview) : curatedReview ? reviewToForm(curatedReview) : draftToReviewForm(item));
    setReviewDialogOpen(true);
    setMessage('');
  }

  function setField(field, value) {
    setReviewForm(prev => ({ ...prev, [field]: value }));
  }

  function saveReview(status = 'review') {
    const review = saveLocalKnowledgeReview({
      ...reviewForm,
      status,
      type: 'acupoint',
      sourceDraftId: selectedDraft?.id || '',
      source: selectedDraft?.source || reviewForm.source,
      enrichment: selectedDraft ? {
        locationTranslationStatus: selectedDraft.location?.translationStatus || null,
        needlingTranslationStatus: selectedDraft.needling?.translationStatus || null,
        needlingUnresolvedTerms: selectedDraft.needling?.unresolvedTerms || [],
        acukgSummary: selectedDraft.acukgSummary || null,
        provenance: selectedDraft.provenance || [],
      } : null,
      actions: splitCsv(reviewForm.actions),
      indications: splitCsv(reviewForm.indications),
      cautions: splitCsv(reviewForm.cautions),
      relatedPatterns: splitCsv(reviewForm.relatedPatterns),
      techniques: splitCsv(reviewForm.techniques),
    });
    setReviews(getLocalKnowledgeReviews());
    setReviewForm(prev => ({
      ...prev,
      ...review,
      actions: review.actions.join(', '),
      indications: review.indications.join(', '),
      cautions: review.cautions.join(', '),
      relatedPatterns: review.relatedPatterns.join(', '),
      techniques: review.techniques.join(', '),
    }));
    setMessage(status === 'approved_local' ? 'Ponto marcado como aprovado localmente.' : 'Revisão salva como rascunho.');
  }

  function removeReview(id) {
    removeLocalKnowledgeReview(id);
    setReviews(getLocalKnowledgeReviews());
      if (selectedDraft) setReviewForm(draftToReviewForm(selectedDraft));
    setMessage('Revisão local removida.');
  }

  useEffect(() => {
    if (!reviewDialogOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') setReviewDialogOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [reviewDialogOpen]);

  return (
    <section className="admin-knowledge">
      <div className="start-panel-head">
        <div>
          <p className="small">Biblioteca Viva</p>
          <h2>Curadoria de pontos e fontes</h2>
          <span>Importe, revise e aprove conhecimento antes de alimentar protocolo, mapa ou relatório.</span>
        </div>
        <button className="quiet-button" type="button" onClick={() => downloadKnowledgeReviews()}>
          Exportar revisões
        </button>
      </div>

      <div className="admin-stat-grid">
        <div className="security-card admin-stat-card total">
          <span>KM-Agent</span>
          <b>{stats.total || '...'}</b>
          <p>pontos em rascunho</p>
        </div>
        <div className="security-card admin-stat-card active">
          <span>Meridianos</span>
          <b>{stats.meridians || 0}</b>
          <p>categorias</p>
        </div>
        <div className="security-card admin-stat-card pending">
          <span>Revisões</span>
          <b>{reviews.length}</b>
          <p>salvas localmente</p>
        </div>
        <div className="security-card admin-stat-card suspended">
          <span>Curadoria</span>
          <b>{curatedReviews.length}</b>
          <p>sugestões locais</p>
        </div>
      </div>

      {message && <div className="inline-success">{message}</div>}

      <div className="admin-knowledge-layout admin-knowledge-layout-contextual">
        <section className="admin-users">
          <div className="start-panel-head">
            <div>
              <p className="small">Fonte importada</p>
              <h2>Rascunhos KM-Agent</h2>
            </div>
          </div>

          <div className="admin-toolbar">
            <input
              className="admin-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar por código, meridiano, nome ou localização"
            />
            <select
              value={meridianFilter}
              onChange={event => setMeridianFilter(event.target.value)}
              style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'white' }}
            >
              <option value="all">Todos</option>
              {meridians.map(meridian => (
                <option key={meridian} value={meridian}>{meridian}</option>
              ))}
            </select>
          </div>

          {draftLoadState === 'loading' ? (
            <div className="empty-state">Carregando pontos importados...</div>
          ) : draftLoadState === 'error' ? (
            <div className="inline-error">Não foi possível carregar o índice KM-Agent enriquecido.</div>
          ) : (
            <div className="admin-user-list knowledge-draft-list">
              {filteredDrafts.slice(0, 120).map(item => {
                const hasReview = reviews.some(review => reviewMatchesCode(review, item.code));
                const hasCuratedReview = curatedReviews.some(review => reviewMatchesCode(review, item.code));
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`admin-user-row admin-user-button ${selectedDraft?.id === item.id ? 'selected' : ''}`}
                    onClick={() => selectDraft(item)}
                  >
                    <div className="admin-user-main">
                      <b>{getDraftTitle(item)}</b>
                      <small>{item.metadata?.meridianCode || 'sem meridiano'} • {item.metadata?.meridianPtBr || item.metadata?.meridian || 'sem nome de meridiano'}</small>
                      <em>{getKmAgentLocationPtBr(item) || 'Sem localização no índice.'}</em>
                      <span className="knowledge-badge-row">
                        {getKmAgentTranslationBadges(item).map(badge => (
                          <span key={badge.label} className={`admin-status ${badge.tone}`}>
                            {badge.label}
                          </span>
                        ))}
                      </span>
                    </div>
                    <div className="admin-user-meta">
                      <span className={`admin-status ${hasReview ? 'pending' : 'blocked'}`}>
                        {hasReview ? 'Em revisão' : hasCuratedReview ? 'Sugestão curada' : 'Rascunho'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {reviewDialogOpen && selectedDraft && (
        <div
          className="admin-modal-backdrop knowledge-review-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setReviewDialogOpen(false);
          }}
        >
          <form className="admin-create-form knowledge-review-form knowledge-review-dialog" onSubmit={event => {
            event.preventDefault();
            saveReview('review');
          }}>
            <div className="knowledge-review-dialog-head">
              <div>
                <p className="small">Revisão profissional</p>
                <h2>{reviewForm.displayCode || selectedDraft.code}</h2>
                <span>{reviewForm.title || getDraftTitle(selectedDraft)}</span>
              </div>
              <button className="quiet-button" type="button" onClick={() => setReviewDialogOpen(false)}>Fechar</button>
            </div>

            {message && <div className="inline-success">{message}</div>}

            <div className="knowledge-review-dialog-body">
              <section className="knowledge-review-source-column">
                <AtlasSourceReferencePanel
                  key={selectedAtlasSource?.code || selectedDraft?.code || 'atlas-source-empty'}
                  reference={selectedAtlasSource}
                  loadState={atlasSourceLoadState}
                />

                {selectedDraft?.provenance?.length > 0 && (
                  <div className="knowledge-source-note">
                    <b>Proveniência</b>
                    <span>Localização e técnica são traduções controladas em rascunho. Relações AcuKG aparecem como sugestão não revisada.</span>
                  </div>
                )}

                {selectedDraft?.needling?.unresolvedTerms?.length > 0 && (
                  <div className="inline-error">
                    Técnica com termos não resolvidos: {selectedDraft.needling.unresolvedTerms.slice(0, 8).join(', ')}. Revisar antes de aprovar.
                  </div>
                )}

                {selectedCuratedReview?.curation && !selectedExistingReview && (
                  <div className="knowledge-source-note">
                    <b>Curadoria profunda local</b>
                    <span>
                      Inputs preenchidos: {selectedCuratedReview.curation.filledFields.length || 0}. Auditoria profissional segue obrigatória.
                    </span>
                    {selectedCuratedReview.curation.glossaryHits.length > 0 && (
                      <small>
                        Termos orientais traduzidos: {selectedCuratedReview.curation.glossaryHits.slice(0, 5).map(item => `${item.source} = ${item.ptBr}`).join('; ')}.
                      </small>
                    )}
                  </div>
                )}

                {selectedDraft?.acukgSummary?.hasMatch && (
                  <div className="knowledge-source-note">
                    <b>Sugestões AcuKG</b>
                    <span>
                      {selectedDraft.acukgSummary.indicationCount || 0} indicações, {selectedDraft.acukgSummary.actionTargetCount || 0} alvos/ações, {selectedDraft.acukgSummary.anatomyRelationCount || 0} relações anatômicas.
                    </span>
                    <small>
                      Indicações iniciais: {(selectedDraft.acukg?.indications || []).slice(0, 6).map(item => item.ptBrDraft || item.original).join(', ') || 'sem indicações vinculadas'}.
                    </small>
                  </div>
                )}
              </section>

              <section className="knowledge-review-form-column">
                <div className="admin-form-grid">
                  <label>
                    Código WHO
                    <input value={reviewForm.code} onChange={event => setField('code', event.target.value)} />
                  </label>
                  <label>
                    Código exibido
                    <input value={reviewForm.displayCode} onChange={event => setField('displayCode', event.target.value)} />
                  </label>
                  <label className="admin-notes">
                    Título
                    <input value={reviewForm.title} onChange={event => setField('title', event.target.value)} />
                  </label>
                  <label>
                    Meridiano
                    <input value={reviewForm.meridianCode} onChange={event => setField('meridianCode', event.target.value)} />
                  </label>
                  <label>
                    Técnicas permitidas
                    <input value={reviewForm.techniques} onChange={event => setField('techniques', event.target.value)} />
                  </label>
                  <label className="admin-notes">
                    Localização textual
                    <textarea value={reviewForm.locationText} onChange={event => setField('locationText', event.target.value)} />
                  </label>
                  <label className="admin-notes">
                    Ações energéticas
                    <textarea value={reviewForm.actions} onChange={event => setField('actions', event.target.value)} placeholder="acalmar Shen, regular sono..." />
                  </label>
                  <label className="admin-notes">
                    Indicações
                    <textarea value={reviewForm.indications} onChange={event => setField('indications', event.target.value)} />
                  </label>
                  <label className="admin-notes">
                    Cautelas / contraindicações
                    <textarea value={reviewForm.cautions} onChange={event => setField('cautions', event.target.value)} />
                  </label>
                  <label className="admin-notes">
                    Padrões relacionados
                    <textarea value={reviewForm.relatedPatterns} onChange={event => setField('relatedPatterns', event.target.value)} />
                  </label>
                  <label className="admin-notes">
                    Agulhamento / técnica
                    <textarea value={reviewForm.needling} onChange={event => setField('needling', event.target.value)} />
                  </label>
                  <label className="admin-notes">
                    Nota de revisão
                    <textarea value={reviewForm.clinicalNote} onChange={event => setField('clinicalNote', event.target.value)} placeholder="Justificativa da aprovação, ajustes, fonte complementar..." />
                  </label>
                </div>

                <div className="form-actions">
                  <button className="primary-button" type="submit">Salvar revisão</button>
                  <button className="tag active" type="button" onClick={() => saveReview('approved_local')}>
                    Aprovar localmente
                  </button>
                  {selectedExistingReview && (
                    <button className="danger-button" type="button" onClick={() => removeReview(selectedExistingReview.id)}>
                      Remover revisão
                    </button>
                  )}
                </div>
                <p className="small">Aprovação local alimenta o protocolo neste ambiente, mas não publica no Supabase/produção sem migração controlada e auditoria profissional.</p>
              </section>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
