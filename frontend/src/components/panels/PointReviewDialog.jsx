import { useEffect, useState } from 'react';

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

function sourceImageLabel(detail, label, item, index, total) {
  const pointLabel = detail?.displayCode || label || 'Fonte visual';
  const pageLabel = item?.pdfPage ? `PDF p. ${item.pdfPage}` : `imagem ${index + 1}`;
  const positionLabel = total > 1 ? ` (${index + 1}/${total})` : '';
  return `${pointLabel}, ${pageLabel}${positionLabel}`;
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
  onPrev,
  onNext,
  currentIndex,
  totalCount,
}) {
  const resolvedDetail = detail || entry?.detail;
  const asset = entry?.asset;
  const location = entry?.location;
  const label = entry?.label || resolvedDetail?.displayCode;
  const imageSources = (resolvedDetail?.atlasReference?.imageUrls || []).filter(item => item.url);
  const imageCount = imageSources.length;
  const sourceImageKey = [
    resolvedDetail?.code || '',
    resolvedDetail?.atlasReference?.referenceLabel || '',
    imageSources.map(item => `${item.pdfPage || ''}:${item.url}`).join('|'),
  ].join('::');

  const [sourceView, setSourceView] = useState({
    activeImageIndex: 0,
    imageDirection: 1,
    imageKey: '',
    zoomOpen: false,
  });

  const hasNav = typeof currentIndex === 'number' && typeof totalCount === 'number';
  const canPrev = hasNav && currentIndex > 0;
  const canNext = hasNav && currentIndex < totalCount - 1;
  const hasImageCarousel = imageCount > 1;
  const activeImageIndex = sourceView.imageKey === sourceImageKey ? sourceView.activeImageIndex : 0;
  const imageDirection = sourceView.imageKey === sourceImageKey ? sourceView.imageDirection : 1;
  const zoomOpen = sourceView.imageKey === sourceImageKey ? sourceView.zoomOpen : false;
  const safeActiveImageIndex = imageCount ? Math.min(activeImageIndex, imageCount - 1) : 0;
  const activeImage = imageSources[safeActiveImageIndex];
  const activeImageAlt = activeImage
    ? sourceImageLabel(resolvedDetail, label, activeImage, safeActiveImageIndex, imageCount)
    : '';

  function moveSourceImage(offset) {
    if (!hasImageCarousel) return;
    setSourceView(current => {
      const baseIndex = current.imageKey === sourceImageKey
        ? Math.min(current.activeImageIndex, imageCount - 1)
        : 0;

      return {
        activeImageIndex: (baseIndex + offset + imageCount) % imageCount,
        imageDirection: offset < 0 ? -1 : 1,
        imageKey: sourceImageKey,
        zoomOpen: current.imageKey === sourceImageKey ? current.zoomOpen : false,
      };
    });
  }

  function selectSourceImage(index) {
    if (index === safeActiveImageIndex) return;
    setSourceView(current => ({
      activeImageIndex: index,
      imageDirection: index > safeActiveImageIndex ? 1 : -1,
      imageKey: sourceImageKey,
      zoomOpen: current.imageKey === sourceImageKey ? current.zoomOpen : false,
    }));
  }

  useEffect(() => {
    if (!resolvedDetail) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (zoomOpen) {
          setSourceView(current => ({ ...current, imageKey: sourceImageKey, zoomOpen: false }));
          return;
        }
        onClose?.();
        return;
      }

      if (event.key === 'ArrowLeft') {
        if (hasImageCarousel) {
          event.preventDefault();
          setSourceView(current => {
            const baseIndex = current.imageKey === sourceImageKey
              ? Math.min(current.activeImageIndex, imageCount - 1)
              : 0;

            return {
              activeImageIndex: (baseIndex - 1 + imageCount) % imageCount,
              imageDirection: -1,
              imageKey: sourceImageKey,
              zoomOpen: current.imageKey === sourceImageKey ? current.zoomOpen : false,
            };
          });
          return;
        }
        if (canPrev) onPrev?.();
      }

      if (event.key === 'ArrowRight') {
        if (hasImageCarousel) {
          event.preventDefault();
          setSourceView(current => {
            const baseIndex = current.imageKey === sourceImageKey
              ? Math.min(current.activeImageIndex, imageCount - 1)
              : 0;

            return {
              activeImageIndex: (baseIndex + 1 + imageCount) % imageCount,
              imageDirection: 1,
              imageKey: sourceImageKey,
              zoomOpen: current.imageKey === sourceImageKey ? current.zoomOpen : false,
            };
          });
          return;
        }
        if (canNext) onNext?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onPrev, onNext, canPrev, canNext, resolvedDetail, hasImageCarousel, imageCount, sourceImageKey, zoomOpen]);

  if (!resolvedDetail) return null;

  const hasAtlasImages = Boolean(resolvedDetail.atlasReference?.imageAvailable && imageSources.length);
  const hasClinicalNote = Boolean(resolvedDetail.clinicalNote?.trim());
  const hasMapPreview = Boolean(asset?.src && location);

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
            {hasNav && (
              <div className="point-review-nav" aria-label="Navegação entre pontos">
                <button
                  className="point-review-nav-btn"
                  type="button"
                  onClick={onPrev}
                  disabled={!canPrev}
                  aria-label="Ponto anterior"
                  title="Ponto anterior (←)"
                >
                  ←
                </button>
                <span className="point-review-nav-counter" aria-live="polite">
                  {currentIndex + 1} / {totalCount}
                </span>
                <button
                  className="point-review-nav-btn"
                  type="button"
                  onClick={onNext}
                  disabled={!canNext}
                  aria-label="Próximo ponto"
                  title="Próximo ponto (→)"
                >
                  →
                </button>
              </div>
            )}
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

            <div className={`point-review-source-frame${hasAtlasImages ? ' has-carousel' : ''}`}>
              {hasAtlasImages && activeImage ? (
                <>
                  <div className="point-review-source-carousel" aria-roledescription="carousel">
                    {hasImageCarousel && (
                      <button
                        className="point-review-source-arrow prev"
                        type="button"
                        onClick={() => moveSourceImage(-1)}
                        aria-label="Imagem anterior"
                        title="Imagem anterior"
                      >
                        ‹
                      </button>
                    )}

                    <button
                      className="point-review-source-zoom-button"
                      type="button"
                      onClick={() => {
                        setSourceView({
                          activeImageIndex: safeActiveImageIndex,
                          imageDirection,
                          imageKey: sourceImageKey,
                          zoomOpen: true,
                        });
                      }}
                      aria-label={`Ampliar ${activeImageAlt}`}
                      title="Ampliar imagem"
                    >
                      <img
                        key={`${activeImage.url}-${activeImage.pdfPage}-${safeActiveImageIndex}`}
                        className={`point-review-source-slide ${imageDirection < 0 ? 'from-left' : 'from-right'}`}
                        src={activeImage.url}
                        alt={activeImageAlt}
                        loading="lazy"
                      />
                      <span aria-hidden="true" className="point-review-source-zoom-badge">Zoom</span>
                    </button>

                    {hasImageCarousel && (
                      <button
                        className="point-review-source-arrow next"
                        type="button"
                        onClick={() => moveSourceImage(1)}
                        aria-label="Próxima imagem"
                        title="Próxima imagem"
                      >
                        ›
                      </button>
                    )}
                  </div>

                  {hasImageCarousel && (
                    <div className="point-review-source-pager" aria-label="Páginas da fonte visual">
                      <span>{safeActiveImageIndex + 1} / {imageCount}</span>
                      <div>
                        {imageSources.map((item, index) => (
                          <button
                            key={`${item.url}-${item.pdfPage || index}-pager`}
                            className={index === safeActiveImageIndex ? 'active' : ''}
                            type="button"
                            onClick={() => selectSourceImage(index)}
                            aria-label={sourceImageLabel(resolvedDetail, label, item, index, imageCount)}
                            aria-current={index === safeActiveImageIndex ? 'true' : undefined}
                          >
                            {item.pdfPage || index + 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
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

            {hasMapPreview && (
              <div className="point-review-map-preview" aria-label="Prévia do mapa calibrado">
                <img src={asset.src} alt={asset.label} loading="lazy" draggable={false} />
                <span
                  className="point-review-map-marker"
                  style={{ left: `${location.xPct}%`, top: `${location.yPct}%` }}
                >
                  {(label || resolvedDetail.displayCode || '').slice(0, 4)}
                </span>
              </div>
            )}

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

      {zoomOpen && activeImage && (
        <div
          className="point-review-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Fonte visual ampliada"
          onMouseDown={event => {
            if (event.target === event.currentTarget) {
              setSourceView(current => ({ ...current, imageKey: sourceImageKey, zoomOpen: false }));
            }
          }}
        >
          <section className="point-review-lightbox-panel">
            <header className="point-review-lightbox-head">
              <div>
                <b>{resolvedDetail.displayCode || label || resolvedDetail.name}</b>
                <span>{activeImage.pdfPage ? `PDF p. ${activeImage.pdfPage}` : activeImageAlt}</span>
              </div>
              <div className="point-review-lightbox-actions">
                {hasImageCarousel && (
                  <span className="point-review-nav-counter" aria-live="polite">
                    {safeActiveImageIndex + 1} / {imageCount}
                  </span>
                )}
                <button
                  className="quiet-button"
                  type="button"
                  onClick={() => setSourceView(current => ({ ...current, imageKey: sourceImageKey, zoomOpen: false }))}
                >
                  Fechar zoom
                </button>
              </div>
            </header>

            <div className="point-review-lightbox-frame">
              {hasImageCarousel && (
                <button
                  className="point-review-source-arrow lightbox prev"
                  type="button"
                  onClick={() => moveSourceImage(-1)}
                  aria-label="Imagem anterior"
                  title="Imagem anterior"
                >
                  ‹
                </button>
              )}
              <img
                key={`${activeImage.url}-${activeImage.pdfPage}-${safeActiveImageIndex}-zoom`}
                className={`point-review-source-slide ${imageDirection < 0 ? 'from-left' : 'from-right'}`}
                src={activeImage.url}
                alt={activeImageAlt}
                loading="eager"
              />
              {hasImageCarousel && (
                <button
                  className="point-review-source-arrow lightbox next"
                  type="button"
                  onClick={() => moveSourceImage(1)}
                  aria-label="Próxima imagem"
                  title="Próxima imagem"
                >
                  ›
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
