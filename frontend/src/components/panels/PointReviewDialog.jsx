import { useEffect } from 'react';

function formatPageList(pages = []) {
  return pages.length ? pages.join(', ') : 'sem página';
}

function originTone(detail) {
  if (!detail || detail.dataOrigin === 'Pendente') return 'blocked';
  if (detail.reviewStatus === 'approved_local') return 'active';
  return 'pending';
}

function locationStatus(location) {
  if (!location) return 'sem coordenada vinculada';
  if (location?.approved) return 'aprovado';
  if (location?.calibrationStatus === 'local_draft') return 'rascunho local';
  if (location?.calibrationStatus === 'draft_auto_high_confidence') return 'rascunho automático';
  return 'rascunho de calibração';
}

function DetailList({ items, empty = 'Não informado' }) {
  if (!items?.length) return <p className="small">{empty}</p>;
  return (
    <div className="point-detail-chip-row">
      {items.map(item => <span key={item}>{item}</span>)}
    </div>
  );
}

export function PointReviewDialog({
  atlasLoadState = 'ready',
  contextLabel = 'Biblioteca Viva',
  detail,
  entry,
  onClose,
}) {
  const resolvedDetail = detail || entry?.detail;
  const asset = entry?.asset;
  const location = entry?.location;
  const label = entry?.label || resolvedDetail?.displayCode;

  useEffect(() => {
    if (!resolvedDetail) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose?.();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, resolvedDetail]);

  if (!resolvedDetail) return null;

  const imageSources = (resolvedDetail.atlasReference?.imageUrls || []).filter(item => item.url);
  const hasAtlasImages = Boolean(resolvedDetail.atlasReference?.imageAvailable && imageSources.length);
  const hasClinicalNote = Boolean(resolvedDetail.clinicalNote?.trim());

  return (
    <div
      className="admin-modal-backdrop point-review-backdrop"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section className="point-review-dialog" role="dialog" aria-modal="true" aria-labelledby="point-review-title">
        <header className="point-review-head">
          <div>
            <p className="small">{contextLabel}</p>
            <h3 id="point-review-title">{resolvedDetail.name}</h3>
            <span>{resolvedDetail.meridian || 'Sem meridiano informado'}</span>
          </div>
          <div className="point-review-head-actions">
            <span className={`admin-status ${originTone(resolvedDetail)}`}>{resolvedDetail.dataOrigin}</span>
            <button className="quiet-button" type="button" onClick={onClose}>Fechar</button>
          </div>
        </header>

        <div className="point-review-body">
          <section className="point-review-source" aria-label="Fonte visual">
            <div className="point-review-source-head">
              <div>
                <b>Fonte visual</b>
                <span>
                  {resolvedDetail.atlasReference?.referenceLabel || 'Referência visual não associada'}
                </span>
              </div>
              {resolvedDetail.atlasReference && (
                <small>PDF p. {formatPageList(resolvedDetail.atlasReference.pdfPages)}</small>
              )}
            </div>

            <div className="point-review-source-frame">
              {hasAtlasImages ? (
                imageSources.map(item => (
                  <img
                    key={`${resolvedDetail.code}-${item.pdfPage}`}
                    src={item.url}
                    alt={`${resolvedDetail.displayCode || label}, PDF p. ${item.pdfPage}`}
                    loading="lazy"
                  />
                ))
              ) : (
                <div className="point-review-source-empty">
                  <b>Fonte visual indisponível</b>
                  <span>
                    {resolvedDetail.atlasReference
                      ? 'A referência do Atlas existe, mas a imagem renderizada não foi encontrada no índice local.'
                      : 'Este ponto ainda não tem imagem de fonte vinculada ao índice visual.'}
                  </span>
                </div>
              )}
            </div>

            <div className="point-review-map-meta">
              {asset && <span><b>Mapa:</b> {asset.label}</span>}
              {label && <span><b>Ponto:</b> {label}</span>}
              {location && <span><b>Coordenada:</b> x {location.xPct}% / y {location.yPct}%</span>}
              <span><b>Status visual:</b> {locationStatus(location)}</span>
            </div>
          </section>

          <div className="point-review-content">
            <section className="point-review-section">
              <div className="point-review-section-title">
                <b>Rascunho do ponto</b>
                <span>{resolvedDetail.displayCode}</span>
              </div>
              <p>{resolvedDetail.why || 'Registro disponível para conferência no contexto selecionado.'}</p>
              <p>{resolvedDetail.locationText || 'Localização aguardando revisão na Biblioteca Viva.'}</p>
            </section>

            <section className="point-review-section">
              <div className="point-review-section-title">
                <b>Revisão profissional</b>
                <span>{resolvedDetail.reviewStatus || 'review'}</span>
              </div>
              <p>{hasClinicalNote ? resolvedDetail.clinicalNote : 'Sem nota profissional registrada para este ponto.'}</p>
              {resolvedDetail.updatedAt && <small>Atualizado em {resolvedDetail.updatedAt}</small>}
            </section>

            <section className="point-review-section">
              <div className="point-review-grid">
                <div>
                  <b>Ações</b>
                  <DetailList items={resolvedDetail.actions} />
                </div>
                <div>
                  <b>Indicações</b>
                  <DetailList items={resolvedDetail.indications} />
                </div>
                <div>
                  <b>Cautelas</b>
                  <DetailList items={resolvedDetail.cautions} empty="Sem cautelas específicas registradas." />
                </div>
                <div>
                  <b>Técnicas</b>
                  <DetailList items={resolvedDetail.techniques} />
                </div>
              </div>
            </section>

            {resolvedDetail.needling && (
              <section className="point-review-section">
                <b>Agulhamento / técnica</b>
                <p>{resolvedDetail.needling}</p>
              </section>
            )}

            {resolvedDetail.relatedPatterns?.length > 0 && (
              <section className="point-review-section">
                <b>Padrões relacionados</b>
                <DetailList items={resolvedDetail.relatedPatterns} />
              </section>
            )}

            <section className="point-review-section point-review-footnote">
              <b>Fontes</b>
              <p>{resolvedDetail.sources?.length ? resolvedDetail.sources.join(' + ') : 'Fonte aguardando curadoria.'}</p>
              {atlasLoadState === 'loading' && <small>Carregando índice do Atlas...</small>}
              {atlasLoadState === 'error' && <small>Índice visual do Atlas indisponível no momento.</small>}
            </section>
          </div>
        </div>
      </section>
    </div>
  );
}
