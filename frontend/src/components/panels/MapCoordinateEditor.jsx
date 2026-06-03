import { useEffect, useMemo, useState } from 'react';
import {
  calibrationPointOptions,
  getAllMapLocations,
  getMapAsset,
  mapGroups,
  upsertStoredMapLocation,
} from '../../knowledge/mapLocations';
import { displayPointCode, normalizePointCode } from '../../knowledge/aliases';
import { buildPointDetail } from '../../knowledge/pointDetails';
import {
  getDeepCuratedKnowledgeReviews,
  getHighConfidenceKnowledgeReviews,
  getLocalKnowledgeReviews,
  mergeKnowledgeReviews,
} from '../../services/knowledgeAdminService';
import {
  findAtlasEdneaSourceReference,
  loadAtlasEdneaSourceIndex,
} from '../../knowledge/sourceReferences';
import { PointReviewDialog } from './PointReviewDialog';

const AURICULAR_CODES = {
  'Shen Men': 'auricular:shen-men',
  'Fígado': 'auricular:figado',
  'Subcórtex': 'auricular:subcortex',
  Ansiedade: 'auricular:ansiedade',
  Rim: 'auricular:rim',
  Estômago: 'auricular:estomago',
  Baço: 'auricular:baco',
  Endócrino: 'auricular:endocrino',
  Coração: 'auricular:coracao',
  Sono: 'auricular:sono',
  Fome: 'auricular:fome',
};

function asLocationCode(point) {
  return AURICULAR_CODES[point] || normalizePointCode(point);
}

function markerLabel(location) {
  if (location.label) return location.label;
  return displayPointCode(location.code);
}

function locationPointKey(location) {
  if (location.code?.startsWith('auricular:')) return location.label || location.code;
  return location.code;
}

function locationMatchesPoint(location, point) {
  if (!location) return false;
  const pointCode = asLocationCode(point);
  if (location.code?.startsWith('auricular:')) {
    return location.code === pointCode || location.label === point;
  }

  return normalizePointCode(location.code) === normalizePointCode(pointCode);
}

function locationStatus(location) {
  if (!location) return 'sem coordenada neste mapa';
  if (location?.approved) return 'aprovado';
  if (location?.calibrationStatus === 'local_draft') return 'rascunho local';
  if (location?.calibrationStatus === 'draft_auto_high_confidence') return 'rascunho automático';
  return 'rascunho de calibração';
}

function originTone(detail) {
  if (!detail || detail.dataOrigin === 'Pendente') return 'blocked';
  if (detail.reviewStatus === 'approved_local') return 'active';
  return 'pending';
}

export function MapCoordinateEditor() {
  const mapIds = mapGroups.flatMap(group => group.maps);
  const [activeMapId, setActiveMapId] = useState('feet_dorsal');
  const [selectedPoint, setSelectedPoint] = useState('LR3');
  const [allLocations, setAllLocations] = useState(() => getAllMapLocations());
  const [knowledgeReviews, setKnowledgeReviews] = useState(() => getLocalKnowledgeReviews());
  const [atlasSourceIndex, setAtlasSourceIndex] = useState(null);
  const [atlasLoadState, setAtlasLoadState] = useState('loading');
  const [dialogEntry, setDialogEntry] = useState(null);
  const asset = getMapAsset(activeMapId);

  const locations = useMemo(
    () => allLocations.filter(location => location.mapId === activeMapId),
    [activeMapId, allLocations],
  );

  const pointEntries = useMemo(() => {
    if (!asset) return [];

    return locations.map(location => {
      const pointKey = locationPointKey(location);
      const atlasReference = findAtlasEdneaSourceReference(atlasSourceIndex, pointKey);
      const detail = buildPointDetail({
        pointKey,
        reviews: knowledgeReviews,
        atlasReference,
      });

      return {
        asset,
        detail,
        label: markerLabel(location),
        location,
        pointKey,
      };
    });
  }, [asset, atlasSourceIndex, knowledgeReviews, locations]);

  const libraryEntries = pointEntries.filter(entry => entry.detail.dataOrigin !== 'Pendente');
  const listedEntries = libraryEntries.length ? libraryEntries : pointEntries;
  const selectedLocation = locations.find(location => locationMatchesPoint(location, selectedPoint)) || null;

  useEffect(() => {
    let cancelled = false;

    loadAtlasEdneaSourceIndex()
      .then(data => {
        if (cancelled) return;
        setAtlasSourceIndex(data);
        setAtlasLoadState('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setAtlasSourceIndex(null);
        setAtlasLoadState('error');
      });

    Promise.all([
      getHighConfidenceKnowledgeReviews(),
      getDeepCuratedKnowledgeReviews(),
    ])
      .then(([highConfidenceReviews, deepCuratedReviews]) => {
        if (cancelled) return;
        setKnowledgeReviews(mergeKnowledgeReviews(
          deepCuratedReviews,
          highConfidenceReviews,
          getLocalKnowledgeReviews(),
        ));
      })
      .catch(() => {
        if (!cancelled) setKnowledgeReviews(getLocalKnowledgeReviews());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function buildEntryForLocation(location) {
    const pointKey = locationPointKey(location);
    const freshReviews = mergeKnowledgeReviews(knowledgeReviews, getLocalKnowledgeReviews());
    const atlasReference = findAtlasEdneaSourceReference(atlasSourceIndex, pointKey);
    return {
      asset,
      detail: buildPointDetail({
        pointKey,
        reviews: freshReviews,
        atlasReference,
      }),
      label: markerLabel(location),
      location,
      pointKey,
    };
  }

  function openLocation(location) {
    if (!asset) return;
    setSelectedPoint(location.label || location.code);
    setDialogEntry(buildEntryForLocation(location));
  }

  function handleMapClick(event) {
    if (!asset) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const xPct = Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const yPct = Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(2));
    const stored = upsertStoredMapLocation({
      code: asLocationCode(selectedPoint),
      label: AURICULAR_CODES[selectedPoint] ? selectedPoint : undefined,
      mapId: activeMapId,
      view: asset.type,
      xPct,
      yPct,
    });
    setAllLocations(getAllMapLocations());
    setSelectedPoint(stored.label || stored.code);
  }

  return (
    <div className="box map-library-shell" style={{ marginBottom: 20 }}>
      <div className="map-library-head">
        <div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--navy)' }}>Mapas da Biblioteca</h3>
          <p className="small" style={{ margin: 0 }}>Pontos da Biblioteca Viva com fonte visual do Atlas no pop-up.</p>
        </div>
        <div className="map-calibration-toolbar">
          <select
            value={selectedPoint}
            onChange={event => setSelectedPoint(event.target.value)}
            className="map-point-select"
          >
            {calibrationPointOptions.map(point => (
              <option key={point} value={point}>{point}</option>
            ))}
          </select>
          {selectedLocation && (
            <span className="tag active">
              x {selectedLocation.xPct}% · y {selectedLocation.yPct}%
            </span>
          )}
        </div>
      </div>

      <div className="map-tab-strip" aria-label="Mapas disponíveis">
        {mapIds.map(mapId => {
          const map = getMapAsset(mapId);
          return (
            <button
              key={mapId}
              type="button"
              className={`tag${activeMapId === mapId ? ' active' : ''}`}
              onClick={() => setActiveMapId(mapId)}
            >
              {map?.label || mapId}
            </button>
          );
        })}
      </div>

      <div className="map-editor-grid">
        <div
          className="map-editor-stage"
          onClick={handleMapClick}
        >
          {asset && (
            <>
              <img
                src={asset.src}
                alt={asset.label}
                draggable={false}
              />
              {locations.map(location => {
                const isSelected = locationMatchesPoint(location, selectedPoint);
                return (
                  <button
                    key={`${location.code}-${location.mapId}`}
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      openLocation(location);
                    }}
                    title={markerLabel(location)}
                    className={`map-marker${isSelected ? ' selected' : ''}`}
                    style={{ left: `${location.xPct}%`, top: `${location.yPct}%` }}
                  >
                    {markerLabel(location).slice(0, 4)}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="tech-card map-library-panel" style={{ margin: 0 }}>
          <div className="map-library-panel-head">
            <div>
              <h4>{asset?.label || 'Mapa'}</h4>
              <span>{libraryEntries.length} registros da Biblioteca neste mapa</span>
            </div>
            {atlasLoadState === 'error' && <span className="admin-status blocked">Atlas indisponível</span>}
          </div>

          <div className="map-calibration-meta">
            <p><b>Ponto selecionado:</b> {selectedPoint}</p>
            <p><b>Coordenada:</b> {selectedLocation ? `x ${selectedLocation.xPct}% / y ${selectedLocation.yPct}%` : 'clique no mapa para posicionar'}</p>
            <p><b>Status:</b> {locationStatus(selectedLocation)}</p>
          </div>

          <div className="map-point-list">
            {listedEntries.length === 0 ? (
              <p className="small">Nenhum ponto calibrado para este mapa.</p>
            ) : (
              listedEntries.map(entry => (
                <button
                  key={`${entry.location.code}-${entry.location.mapId}-list`}
                  type="button"
                  className={`map-point-row${locationMatchesPoint(entry.location, selectedPoint) ? ' selected' : ''}`}
                  onClick={() => openLocation(entry.location)}
                >
                  <span className="map-point-row-code">{entry.label}</span>
                  <span className="map-point-row-main">
                    <b>{entry.detail.name}</b>
                    <small>{entry.detail.meridian || entry.detail.dataOrigin}</small>
                  </span>
                  <span className={`admin-status ${originTone(entry.detail)}`}>{entry.detail.dataOrigin}</span>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      <PointReviewDialog
        entry={dialogEntry}
        atlasLoadState={atlasLoadState}
        contextLabel="Registro da Biblioteca Viva"
        onClose={() => setDialogEntry(null)}
      />
    </div>
  );
}
