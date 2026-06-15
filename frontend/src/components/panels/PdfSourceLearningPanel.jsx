import { useEffect, useMemo, useState } from 'react';
import {
  KM_AGENT_ENRICHED_INDEX_URL,
  KM_AGENT_DRAFT_INDEX_URL,
} from '../../knowledge/kmAgentDrafts';
import {
  PDF_AURICULAR_CANDIDATE_LINKS_ASSET_KEY,
  PDF_AURICULAR_CANDIDATE_LINKS_URL,
  PDF_SOURCE_CANDIDATE_LINKS_ASSET_KEY,
  PDF_SOURCE_CANDIDATE_LINKS_URL,
  PDF_SOURCE_REVIEW_DRAFTS_ASSET_KEY,
  PDF_SOURCE_REVIEW_DRAFTS_URL,
  buildPdfLearningRows,
  filterPdfLearningRows,
  summarizePdfLearningRows,
  translatePdfSnippetPtBr,
} from '../../knowledge/pdfSourceLearning';
import {
  getDeepCuratedKnowledgeReviews,
  getHighConfidenceKnowledgeReviews,
  getLocalKnowledgeReviews,
  saveLocalKnowledgeReview,
} from '../../services/knowledgeAdminService';
import {
  fetchKnowledgeSourceJsonAsset,
  resolveKnowledgeSourceAssetUrl,
} from '../../services/knowledgeSourceAssetService';

const FILTERS = [
  { id: 'unanswered', label: 'Nao respondidos' },
  { id: 'high', label: 'Alta confianca' },
  { id: 'sistemico', label: 'Sistemicos' },
  { id: 'auricular', label: 'Auricular' },
  { id: 'blocked', label: 'Idioma' },
  { id: 'saved', label: 'Salvos' },
  { id: 'all', label: 'Todos' },
];

function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function getReliabilityTone(percent) {
  if (percent >= 85) return 'active';
  if (percent >= 70) return 'pending';
  return 'warning';
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchKmAgentRecords() {
  try {
    return await fetchJson(KM_AGENT_ENRICHED_INDEX_URL);
  } catch {
    return fetchJson(KM_AGENT_DRAFT_INDEX_URL);
  }
}

function sourceLabel(link) {
  return link?.source?.title || link?.sourceTitle || link?.source?.key || link?.sourceKey || 'Fonte PDF';
}

function sourceLanguage(link) {
  return link?.source?.originalLanguage || link?.originalLanguage || 'desconhecido';
}

function getLinkPage(link) {
  return link?.page?.pdfPage || link?.pdfPage || '';
}

function getLinkImageUrl(link) {
  return link?.page?.imageUrl || link?.imageUrl || '';
}

function SourcePreview({ link }) {
  const imageUrl = getLinkImageUrl(link);
  const [imageState, setImageState] = useState({ status: 'idle', url: '', source: '' });

  useEffect(() => {
    let cancelled = false;

    if (!imageUrl) {
      return undefined;
    }

    resolveKnowledgeSourceAssetUrl(imageUrl, { purpose: 'pdf-source-preview' })
      .then(url => {
        if (!cancelled) setImageState({ status: 'ready', url, source: imageUrl });
      })
      .catch(error => {
        if (!cancelled) {
          setImageState({
            status: 'error',
            url: '',
            source: imageUrl,
            message: error.message || 'Fonte visual protegida indisponível.',
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  if (!link) return <div className="empty-state">Selecione uma fonte para conferir pagina e trecho.</div>;

  const translated = translatePdfSnippetPtBr(link);
  const imageReady = imageState.status === 'ready' && imageState.source === imageUrl;
  const imageLoading = imageUrl
    && (imageState.source !== imageUrl || imageState.status === 'loading');

  return (
    <section className="pdf-source-preview">
      <div className="pdf-source-preview-head">
        <div>
          <b>{sourceLabel(link)}</b>
          <small>PDF p. {getLinkPage(link) || '-'} • {sourceLanguage(link)}</small>
        </div>
        <span className={`admin-status ${getReliabilityTone(translated.reliabilityPercent)}`}>
          traducao {formatPercent(translated.reliabilityPercent)}
        </span>
      </div>

      {imageLoading ? (
        <div className="pdf-source-preview-empty">Carregando fonte visual protegida...</div>
      ) : imageUrl && imageReady ? (
        <div className="pdf-source-preview-frame">
          <img
            src={imageState.url}
            alt={`${sourceLabel(link)}, PDF p. ${getLinkPage(link)}`}
            loading="lazy"
            onError={() => setImageState({
              status: 'error',
              url: '',
              source: imageState.source,
              message: 'A URL assinada expirou ou o arquivo não foi encontrado.',
            })}
          />
        </div>
      ) : imageUrl ? (
        <div className="pdf-source-preview-empty">
          Fonte visual protegida indisponível. Verifique o upload no Storage privado.
        </div>
      ) : (
        <div className="pdf-source-preview-empty">Pagina visual indisponivel neste ambiente.</div>
      )}

      <div className="pdf-source-snippets">
        <div>
          <span>{translated.label}</span>
          <p>{translated.text || 'Sem trecho textual extraido nesta pagina.'}</p>
        </div>
        {translated.mode !== 'original_pt_br' && (
          <div>
            <span>Trecho original</span>
            <p>{link.snippet || 'Sem trecho original extraido.'}</p>
          </div>
        )}
      </div>
    </section>
  );
}

function ReliabilityBars({ reliability }) {
  const items = [
    ['Ligacao do ponto', reliability.pointLinkPercent],
    ['Traducao pt-BR', reliability.translationPercent],
    ['Link entre fontes', reliability.sourceLinkingPercent],
    ['Confiabilidade geral', reliability.overallPercent],
  ];

  return (
    <div className="pdf-reliability-grid">
      {items.map(([label, percent]) => (
        <div key={label} className="pdf-reliability-item">
          <span>{label}</span>
          <b>{formatPercent(percent)}</b>
          <div className="pdf-reliability-bar" aria-hidden="true">
            <i style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PdfSourceLearningPanel() {
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('unanswered');
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedSourceIndex, setSelectedSourceIndex] = useState(0);
  const [message, setMessage] = useState('');
  const [payload, setPayload] = useState({
    sourceLinks: [],
    auricularLinks: [],
    drafts: [],
    kmAgentRecords: [],
    reviews: [],
    curatedReviews: [],
    highConfidenceReviews: [],
    sourceCounts: null,
    auricularCounts: null,
    draftCounts: null,
  });

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetchKnowledgeSourceJsonAsset(PDF_SOURCE_CANDIDATE_LINKS_ASSET_KEY, PDF_SOURCE_CANDIDATE_LINKS_URL),
      fetchKnowledgeSourceJsonAsset(PDF_AURICULAR_CANDIDATE_LINKS_ASSET_KEY, PDF_AURICULAR_CANDIDATE_LINKS_URL),
      fetchKnowledgeSourceJsonAsset(PDF_SOURCE_REVIEW_DRAFTS_ASSET_KEY, PDF_SOURCE_REVIEW_DRAFTS_URL),
      fetchKmAgentRecords(),
      getDeepCuratedKnowledgeReviews(),
      getHighConfidenceKnowledgeReviews(),
    ])
      .then(([sourceData, auricularData, draftsData, kmAgentRecords, curatedReviews, highConfidenceReviews]) => {
        if (cancelled) return;
        setPayload({
          sourceLinks: sourceData.links || [],
          auricularLinks: auricularData.links || [],
          drafts: draftsData.reviews || [],
          kmAgentRecords: Array.isArray(kmAgentRecords) ? kmAgentRecords : [],
          reviews: getLocalKnowledgeReviews(),
          curatedReviews,
          highConfidenceReviews,
          sourceCounts: sourceData.counts || null,
          auricularCounts: auricularData.counts || null,
          draftCounts: draftsData.counts || null,
        });
        setLoadState('ready');
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Nao foi possivel carregar fontes PDF protegidas.');
        setLoadState('error');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => buildPdfLearningRows(payload), [payload]);
  const summary = useMemo(() => summarizePdfLearningRows(rows), [rows]);
  const filteredRows = useMemo(
    () => filterPdfLearningRows(rows, { query, filter }),
    [filter, query, rows],
  );
  const selectedRow = useMemo(() => {
    return filteredRows.find(row => row.code === selectedCode) || filteredRows[0] || rows[0] || null;
  }, [filteredRows, rows, selectedCode]);
  const selectedLinks = selectedRow?.links || [];
  const activeSourceIndex = selectedLinks[selectedSourceIndex] ? selectedSourceIndex : 0;
  const selectedLink = selectedLinks[activeSourceIndex] || null;

  function refreshLocalReviews() {
    setPayload(prev => ({
      ...prev,
      reviews: getLocalKnowledgeReviews(),
    }));
  }

  function selectNextPendingRow(savedCode) {
    const list = filteredRows.length ? filteredRows : rows;
    const currentIndex = list.findIndex(row => row.code === savedCode);
    const next = list.slice(currentIndex + 1).find(row => !row.localReview)
      || list.slice(0, Math.max(currentIndex, 0)).find(row => !row.localReview);
    if (next) {
      setSelectedCode(next.code);
      setSelectedSourceIndex(0);
    }
  }

  function saveDraftReview({ advance = false } = {}) {
    if (!selectedRow) return;

    const topReferences = selectedLinks.slice(0, 12).map(link => ({
      sourceKey: link.source?.key,
      sourceTitle: link.source?.title,
      originalLanguage: link.source?.originalLanguage,
      pdfPage: link.page?.pdfPage,
      imageUrl: link.page?.imageUrl,
      confidence: link.confidenceLabel,
      matchedTerms: (link.matchedTerms || []).map(term => term.value),
      snippet: link.snippet,
      ptBrDraft: translatePdfSnippetPtBr(link).text,
      translationMode: translatePdfSnippetPtBr(link).mode,
      translationReliabilityPercent: translatePdfSnippetPtBr(link).reliabilityPercent,
    }));

    saveLocalKnowledgeReview({
      code: selectedRow.code,
      displayCode: selectedRow.draft.displayCode || selectedRow.code,
      title: selectedRow.title,
      status: 'review',
      type: selectedRow.targetKind === 'auricular' ? 'auricular_candidate' : 'acupoint',
      source: 'Biblioteca Viva - Fontes PDF',
      sourceDraftId: selectedRow.draft.id,
      requiresProfessionalAudit: true,
      sourceReferences: topReferences,
      pdfLearningReliability: selectedRow.reliability,
      languagePolicy: {
        pointPageLanguage: 'pt-BR',
        allowRawOriginalInPointPages: false,
        ptBrReviewed: false,
        preliminaryPtBrTranslation: true,
        requiresProfessionalAudit: true,
      },
      clinicalNote: `Rascunho criado a partir de fontes PDF. Confiabilidade geral ${formatPercent(selectedRow.reliability.overallPercent)}.`,
      actions: asArray(selectedRow.bestReview?.actions),
      indications: asArray(selectedRow.bestReview?.indications),
      cautions: asArray(selectedRow.bestReview?.cautions),
      relatedPatterns: asArray(selectedRow.bestReview?.relatedPatterns),
      techniques: asArray(selectedRow.bestReview?.techniques),
    });
    refreshLocalReviews();
    setMessage(`${selectedRow.code} salvo como rascunho local com fontes PDF.`);
    if (advance) selectNextPendingRow(selectedRow.code);
  }

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  if (loadState === 'loading') {
    return (
      <section className="admin-knowledge pdf-learning-panel">
        <div className="empty-state">Carregando aprendizado dos PDFs...</div>
      </section>
    );
  }

  if (loadState === 'error') {
    return (
      <section className="admin-knowledge pdf-learning-panel">
        <div className="inline-error">Fontes PDF protegidas indisponiveis: {error}</div>
      </section>
    );
  }

  return (
    <section className="admin-knowledge pdf-learning-panel">
      <div className="start-panel-head">
        <div>
          <p className="small">SuperAdm • Fontes PDF</p>
          <h2>Aprendizado por pagina</h2>
          <span>Fila local de pontos nao respondidos, fontes, traducao preliminar e confiabilidade.</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="quiet-button" type="button" onClick={() => saveDraftReview()} disabled={!selectedRow}>
            {selectedRow?.localReview ? 'Atualizar rascunho' : 'Salvar rascunho'}
          </button>
          <button className="primary-button" type="button" onClick={() => saveDraftReview({ advance: true })} disabled={!selectedRow}>
            Salvar e proximo
          </button>
        </div>
      </div>

      <div className="admin-stat-grid">
        <div className="security-card admin-stat-card total">
          <span>Rascunhos</span>
          <b>{summary.total}</b>
          <p>{summary.unanswered} com lacunas</p>
        </div>
        <div className="security-card admin-stat-card active">
          <span>Confiabilidade</span>
          <b>{formatPercent(summary.averageReliabilityPercent)}</b>
          <p>media geral</p>
        </div>
        <div className="security-card admin-stat-card patients">
          <span>Sistemicos</span>
          <b>{payload.sourceCounts?.connectedTargets || 0}</b>
          <p>{payload.sourceCounts?.links || 0} links</p>
        </div>
        <div className="security-card admin-stat-card pending">
          <span>Auricular</span>
          <b>{payload.auricularCounts?.connectedTargets || 0}</b>
          <p>{payload.auricularCounts?.links || 0} links</p>
        </div>
        <div className="security-card admin-stat-card suspended">
          <span>Salvos local</span>
          <b>{summary.savedLocal}</b>
          <p>de {summary.total} • sempre revisao</p>
        </div>
      </div>

      {message && <div className="inline-success">{message}</div>}

      <div className="pdf-learning-layout">
        <section className="admin-users pdf-learning-list-panel">
          <div className="admin-toolbar">
            <input
              className="admin-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar por codigo, nome, campo ou indicacao"
            />
            <select
              value={filter}
              onChange={event => setFilter(event.target.value)}
              style={{ border: '1px solid var(--line)', borderRadius: 10, padding: '10px 12px', background: 'white' }}
            >
              {FILTERS.map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="knowledge-confidence-tabs" role="tablist" aria-label="Filtros de fontes PDF">
            {FILTERS.map(item => {
              const count = filterPdfLearningRows(rows, { filter: item.id }).length;
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
            <div className="empty-state">Nenhum ponto para os filtros atuais.</div>
          ) : (
            <div className="admin-user-list knowledge-draft-list pdf-learning-list">
              {filteredRows.slice(0, 180).map(row => (
                <button
                  key={row.draft.id}
                  type="button"
                  className={`admin-user-row admin-user-button knowledge-confidence-row ${getReliabilityTone(row.reliability.overallPercent)} ${selectedRow?.code === row.code ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedCode(row.code);
                    setSelectedSourceIndex(0);
                  }}
                >
                  <div className="admin-user-main">
                    <b>{row.code} • {row.title}</b>
                    <small>{row.targetKind} • {row.links.length} links • {row.reliability.sourceCount} fontes</small>
                    <em>{row.missingFields.length ? `Faltam: ${row.missingFields.join(', ')}` : 'Campos principais preenchidos localmente.'}</em>
                  </div>
                  <div className="admin-user-meta">
                    <span className={`admin-status ${getReliabilityTone(row.reliability.overallPercent)}`}>
                      {formatPercent(row.reliability.overallPercent)}
                    </span>
                    <span className={`admin-status ${row.unanswered ? 'pending' : 'active'}`}>
                      {row.unanswered ? 'lacuna' : 'respondido'}
                    </span>
                    {row.localReview && <span className="admin-status active">salvo</span>}
                    {row.blockedByLanguage && <span className="admin-status warning">traduzido</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="admin-users pdf-learning-detail">
          {!selectedRow ? (
            <div className="empty-state">Nenhum ponto selecionado.</div>
          ) : (
            <>
              <div className="pdf-learning-detail-head">
                <div>
                  <p className="small">{selectedRow.targetKind}</p>
                  <h2>{selectedRow.code}</h2>
                  <span>{selectedRow.title}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {selectedRow.localReview && <span className="admin-status active">rascunho local salvo</span>}
                  <span className={`admin-status ${getReliabilityTone(selectedRow.reliability.overallPercent)}`}>
                    geral {formatPercent(selectedRow.reliability.overallPercent)}
                  </span>
                </div>
              </div>

              <ReliabilityBars reliability={selectedRow.reliability} />

              <div className="pdf-learning-gap-row">
                <span className={`admin-status ${selectedRow.unanswered ? 'pending' : 'active'}`}>
                  {selectedRow.unanswered ? 'ponto nao respondido' : 'respondido localmente'}
                </span>
                <span className="admin-status pending">
                  {selectedRow.reliability.ptBrSourceCount} fonte(s) pt-BR
                </span>
                <span className="admin-status warning">
                  {selectedRow.reliability.nonPtBrSourceCount} fonte(s) traduzidas
                </span>
              </div>

              <div className="pdf-source-reference-list">
                {selectedLinks.slice(0, 12).map((link, index) => (
                  <button
                    key={link.id || `${link.source?.key}-${link.page?.pdfPage}-${index}`}
                    type="button"
                    className={index === activeSourceIndex ? 'active' : ''}
                    onClick={() => setSelectedSourceIndex(index)}
                  >
                    <b>{sourceLabel(link)}</b>
                    <span>PDF p. {getLinkPage(link)} • {sourceLanguage(link)} • {formatPercent(link.confidence * 100 || 0)}</span>
                  </button>
                ))}
              </div>

              <SourcePreview link={selectedLink} />
            </>
          )}
        </section>
      </div>
    </section>
  );
}
