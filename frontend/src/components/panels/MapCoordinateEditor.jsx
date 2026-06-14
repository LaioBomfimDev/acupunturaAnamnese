import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  auricularLabelToCode,
  calibrationPointOptions,
  getAllMapLocations,
  getLocationIdentity,
  getMapAsset,
  mapGroups,
  readStoredMapLocations,
  upsertStoredMapLocation,
  writeStoredMapLocations,
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

const AUTO_DRAFT_STATUSES = new Set([
  'draft_auto_high_confidence',
  'draft_auto_medium_confidence',
  'draft_auto_auricular_pdf',
]);

function asLocationCode(point) {
  return auricularLabelToCode[point] || normalizePointCode(point);
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

function isMapMismatch(location) {
  return location?.reviewStatus === 'review_map_mismatch';
}

function locationStatus(location) {
  if (!location) return 'sem coordenada neste mapa';
  if (isMapMismatch(location)) return 'revisar: mapa divergente';
  if (location?.approved) return 'aprovado local';
  if (location?.calibrationStatus === 'local_draft') return 'rascunho local';
  if (location?.calibrationStatus === 'draft_auto_high_confidence') return 'rascunho automático';
  if (location?.calibrationStatus === 'draft_auto_medium_confidence') return 'rascunho médio automático';
  if (location?.calibrationStatus === 'draft_auto_auricular_pdf') return 'rascunho auricular PDF';
  return 'rascunho de calibração';
}

function locationStatusTone(location) {
  if (isMapMismatch(location)) return 'blocked';
  if (location?.approved) return 'active';
  if (location?.calibrationStatus === 'draft_auto_high_confidence') return 'warning';
  if (location?.calibrationStatus === 'draft_auto_medium_confidence') return 'pending';
  if (location?.calibrationStatus === 'local_draft') return 'pending';
  return 'pending';
}

function markerStatusClass(location) {
  if (isMapMismatch(location)) return 'mismatch';
  if (location?.approved) return 'approved';
  if (AUTO_DRAFT_STATUSES.has(location?.calibrationStatus)) return 'auto-draft';
  return 'draft';
}

function locationSortPriority(location) {
  if (isMapMismatch(location)) return 1;
  if (location?.approved) return 0;
  if (location?.calibrationStatus === 'local_draft') return 2;
  if (location?.calibrationStatus === 'draft_auto_high_confidence') return 3;
  if (location?.calibrationStatus === 'draft_auto_medium_confidence') return 4;
  if (location?.calibrationStatus === 'draft_auto_auricular_pdf') return 4;
  return 5;
}

function locationFilterBucket(location) {
  if (isMapMismatch(location)) return 'review';
  if (location?.approved) return 'approved';
  if (AUTO_DRAFT_STATUSES.has(location?.calibrationStatus)) return 'auto';
  return 'draft';
}

const STATUS_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'approved', label: 'Aprovados' },
  { id: 'draft', label: 'Rascunhos' },
  { id: 'auto', label: 'Automáticos' },
  { id: 'review', label: 'Revisar mapa' },
];

export function MapCoordinateEditor({
  approvalActorRole = 'therapist',
  approvalActorLabel = 'acupunturista',
} = {}) {
  const [activeMapId, setActiveMapId] = useState('feet_dorsal');
  const [selectedPoint, setSelectedPoint] = useState('LR3');
  const [statusFilter, setStatusFilter] = useState('all');
  const [allLocations, setAllLocations] = useState(() => getAllMapLocations());
  const [knowledgeReviews, setKnowledgeReviews] = useState(() => getLocalKnowledgeReviews());
  const [atlasSourceIndex, setAtlasSourceIndex] = useState(null);
  const [atlasLoadState, setAtlasLoadState] = useState('loading');
  const [dialogEntry, setDialogEntry] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [dragPosition, setDragPosition] = useState(null);
  const [pendingMove, setPendingMove] = useState(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [undoStack, setUndoStack] = useState([]);
  const stageRef = useRef(null);
  const dragRef = useRef(null);
  const dragListenersRef = useRef(null);
  const asset = getMapAsset(activeMapId);

  const locations = useMemo(
    () => allLocations.filter(location => location.mapId === activeMapId),
    [activeMapId, allLocations],
  );

  const filterCounts = useMemo(() => {
    const counts = { all: locations.length, approved: 0, draft: 0, auto: 0, review: 0 };
    for (const location of locations) {
      counts[locationFilterBucket(location)] += 1;
    }
    return counts;
  }, [locations]);

  const visibleLocations = useMemo(() => {
    if (statusFilter === 'all') return locations;
    return locations.filter(location => locationFilterBucket(location) === statusFilter);
  }, [locations, statusFilter]);

  const pointEntries = useMemo(() => {
    if (!asset) return [];

    return visibleLocations.map(location => {
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
    }).sort((left, right) => {
      const priorityDiff = locationSortPriority(left.location) - locationSortPriority(right.location);
      if (priorityDiff !== 0) return priorityDiff;
      return markerLabel(left.location).localeCompare(markerLabel(right.location));
    });
  }, [asset, atlasSourceIndex, knowledgeReviews, visibleLocations]);

  const selectedLocation = locations.find(location => locationMatchesPoint(location, selectedPoint)) || null;
  const locationStats = useMemo(() => {
    return locations.reduce((stats, location) => {
      stats.total += 1;
      if (location.approved) stats.approved += 1;
      if (AUTO_DRAFT_STATUSES.has(location.calibrationStatus)) stats.autoDrafts += 1;
      if (isMapMismatch(location)) stats.mismatches += 1;
      return stats;
    }, { total: 0, approved: 0, autoDrafts: 0, mismatches: 0 });
  }, [locations]);

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

  const pctFromClient = useCallback((clientX, clientY) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const xPct = Number(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)).toFixed(2));
    const yPct = Number(Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100)).toFixed(2));
    return { xPct, yPct };
  }, []);

  const detachDragListeners = useCallback(() => {
    const listeners = dragListenersRef.current;
    if (!listeners) return;
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.up);
    window.removeEventListener('pointercancel', listeners.up);
    dragListenersRef.current = null;
  }, []);

  useEffect(() => () => detachDragListeners(), [detachDragListeners]);

  useEffect(() => {
    if (!saveMessage) return undefined;
    const timer = setTimeout(() => setSaveMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [saveMessage]);

  // Atalhos do modo de edição: Ctrl+Z desfaz o último salvamento, Esc cancela
  // a confirmação pendente. Sem array de deps de propósito: o handler precisa
  // sempre enxergar o estado mais recente.
  useEffect(() => {
    if (!editMode) return undefined;
    function handleKeyDown(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        undoLastMove();
      } else if (event.key === 'Escape' && pendingMove) {
        setPendingMove(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function handleMarkerPointerDown(location, event) {
    if (!editMode || pendingMove) return;
    event.preventDefault();
    event.stopPropagation();
    detachDragListeners();
    dragRef.current = {
      location,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      xPct: location.xPct,
      yPct: location.yPct,
    };
    setDragPosition({ location, xPct: location.xPct, yPct: location.yPct });

    const move = moveEvent => {
      const drag = dragRef.current;
      if (!drag) return;
      if (!drag.moved) {
        const distance = Math.hypot(moveEvent.clientX - drag.startClientX, moveEvent.clientY - drag.startClientY);
        if (distance < 3) return;
        drag.moved = true;
      }
      const point = pctFromClient(moveEvent.clientX, moveEvent.clientY);
      if (!point) return;
      drag.xPct = point.xPct;
      drag.yPct = point.yPct;
      setDragPosition({ location: drag.location, xPct: point.xPct, yPct: point.yPct });
    };

    const up = () => {
      detachDragListeners();
      const drag = dragRef.current;
      dragRef.current = null;
      setDragPosition(null);
      if (!drag) return;

      setSelectedPoint(drag.location.label || drag.location.code);
      if (!drag.moved) return;

      setPendingMove({
        origin: drag.location,
        code: drag.location.code,
        label: drag.location.label,
        displayLabel: markerLabel(drag.location),
        fromXPct: drag.location.xPct,
        fromYPct: drag.location.yPct,
        xPct: drag.xPct,
        yPct: drag.yPct,
        isNew: false,
      });
    };

    dragListenersRef.current = { move, up };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function handleMapClick(event) {
    if (!asset || !editMode || pendingMove) return;
    const point = pctFromClient(event.clientX, event.clientY);
    if (!point) return;
    setPendingMove({
      origin: selectedLocation,
      code: asLocationCode(selectedPoint),
      label: auricularLabelToCode[selectedPoint] ? selectedPoint : undefined,
      displayLabel: selectedLocation ? markerLabel(selectedLocation) : selectedPoint,
      fromXPct: selectedLocation?.xPct ?? null,
      fromYPct: selectedLocation?.yPct ?? null,
      xPct: point.xPct,
      yPct: point.yPct,
      isNew: !selectedLocation,
    });
  }

  function cancelPendingMove() {
    setPendingMove(null);
  }

  function confirmPendingMove() {
    if (!pendingMove || !asset) return;
    // Snapshot do estado local antes da gravação para suportar "Desfazer".
    const snapshot = readStoredMapLocations();
    const stored = upsertStoredMapLocation({
      code: pendingMove.code,
      label: pendingMove.label,
      mapId: activeMapId,
      view: asset.view || asset.type,
      xPct: pendingMove.xPct,
      yPct: pendingMove.yPct,
    }, {
      actorRole: approvalActorRole,
      actorLabel: approvalActorLabel,
    });

    // Se o arrasto cruzou a linha média, a identidade (lado) muda e o registro
    // local antigo ficaria órfão no mapa — remove para não duplicar marcador.
    if (pendingMove.origin) {
      const oldIdentity = getLocationIdentity(pendingMove.origin);
      const newIdentity = getLocationIdentity(stored);
      if (oldIdentity !== newIdentity) {
        const remaining = readStoredMapLocations().filter(item => getLocationIdentity(item) !== oldIdentity);
        writeStoredMapLocations(remaining);
      }
    }

    setAllLocations(getAllMapLocations());
    setSelectedPoint(stored.label || stored.code);
    setPendingMove(null);
    setUndoStack(stack => [
      ...stack.slice(-19),
      {
        snapshot,
        mapId: activeMapId,
        description: `${pendingMove.displayLabel} em x ${pendingMove.xPct}% · y ${pendingMove.yPct}%`,
      },
    ]);
    setSaveMessage(`${pendingMove.displayLabel} salvo em x ${pendingMove.xPct}% · y ${pendingMove.yPct}%.`);
  }

  function undoLastMove() {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    writeStoredMapLocations(last.snapshot);
    setUndoStack(undoStack.slice(0, -1));
    setAllLocations(getAllMapLocations());
    setPendingMove(null);
    setDragPosition(null);
    if (last.mapId !== activeMapId) setActiveMapId(last.mapId);
    setSaveMessage(`Desfeito: ${last.description}.`);
  }

  function toggleEditMode() {
    setEditMode(current => !current);
    setPendingMove(null);
    setDragPosition(null);
  }

  function changeActiveMap(mapId) {
    setActiveMapId(mapId);
    setPendingMove(null);
    setDragPosition(null);
  }

  return (
    <div className="box map-library-shell" style={{ marginBottom: 20 }}>
      <div className="map-library-head">
        <div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--navy)' }}>Mapas da Biblioteca</h3>
          <p className="small" style={{ margin: 0 }}>
            {editMode
              ? 'Modo de edição ativo: arraste um ponto até o local desejado e confirme em "OK, salvar". Clicar em área vazia posiciona o ponto selecionado na lista.'
              : 'Clique em "Editar mapa" para mover pontos. Fora da edição, clique em um ponto para abrir os detalhes.'}
          </p>
        </div>
        <div className="map-calibration-toolbar">
          <button
            type="button"
            className={`map-edit-toggle${editMode ? ' active' : ''}`}
            onClick={toggleEditMode}
          >
            {editMode ? '✓ Concluir edição' : '✎ Editar mapa'}
          </button>
          <button
            type="button"
            className="map-edit-toggle"
            onClick={undoLastMove}
            disabled={undoStack.length === 0}
            title={undoStack.length
              ? `Desfazer: ${undoStack[undoStack.length - 1].description} (Ctrl+Z)`
              : 'Nenhum ajuste para desfazer'}
          >
            ↩ Desfazer{undoStack.length > 0 ? ` (${undoStack.length})` : ''}
          </button>
          <span className="admin-status active">aprovação automática local</span>
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

      {saveMessage && <div className="inline-success">{saveMessage}</div>}

      <div className="map-status-filter" aria-label="Filtro de status de calibração">
        {STATUS_FILTERS.map(filter => (
          <button
            key={filter.id}
            type="button"
            className={`tag${statusFilter === filter.id ? ' active' : ''}`}
            onClick={() => setStatusFilter(filter.id)}
          >
            {filter.label} ({filterCounts[filter.id]})
          </button>
        ))}
      </div>

      <div className="map-tab-strip" aria-label="Mapas disponíveis">
        {mapGroups.map(group => (
          <div className="map-tab-group" key={group.id}>
            <span>{group.label}</span>
            <div>
              {group.maps.map(mapId => {
                const map = getMapAsset(mapId);
                return (
                  <button
                    key={mapId}
                    type="button"
                    className={`tag${activeMapId === mapId ? ' active' : ''}`}
                    onClick={() => changeActiveMap(mapId)}
                  >
                    {map?.label || mapId}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="map-editor-grid">
        <div
          ref={stageRef}
          className={`map-editor-stage${editMode ? ' editing' : ''}`}
          onClick={handleMapClick}
        >
          {asset && (
            <>
              <img
                src={asset.src}
                alt={asset.label}
                draggable={false}
              />
              {visibleLocations.map((location, index) => {
                const isSelected = locationMatchesPoint(location, selectedPoint);
                const isDragging = dragPosition?.location === location;
                const isPending = pendingMove?.origin === location;
                const xPct = isDragging ? dragPosition.xPct : isPending ? pendingMove.xPct : location.xPct;
                const yPct = isDragging ? dragPosition.yPct : isPending ? pendingMove.yPct : location.yPct;
                return (
                  <button
                    key={`${location.code}-${location.mapId}-${location.xPct}-${location.yPct}-${index}`}
                    type="button"
                    onPointerDown={event => handleMarkerPointerDown(location, event)}
                    onClick={event => {
                      event.stopPropagation();
                      if (editMode) return;
                      openLocation(location);
                    }}
                    title={markerLabel(location)}
                    className={`map-marker ${markerStatusClass(location)}${isSelected ? ' selected' : ''}${isDragging ? ' dragging' : ''}${isPending ? ' pending' : ''}`}
                    style={{ left: `${xPct}%`, top: `${yPct}%` }}
                  >
                    {markerLabel(location).slice(0, 4)}
                  </button>
                );
              })}
              {pendingMove && (pendingMove.isNew || !visibleLocations.includes(pendingMove.origin)) && (
                <span
                  className="map-marker pending ghost"
                  style={{ left: `${pendingMove.xPct}%`, top: `${pendingMove.yPct}%` }}
                >
                  {pendingMove.displayLabel.slice(0, 4)}
                </span>
              )}
              {pendingMove && (
                <div
                  className={`map-move-confirm${pendingMove.yPct < 24 ? ' below' : ''}`}
                  style={{
                    left: `${Math.min(82, Math.max(18, pendingMove.xPct))}%`,
                    top: `${pendingMove.yPct}%`,
                  }}
                  onClick={event => event.stopPropagation()}
                  role="alertdialog"
                  aria-label={`Confirmar posição de ${pendingMove.displayLabel}`}
                >
                  <b>{pendingMove.isNew ? 'Adicionar' : 'Mover'} {pendingMove.displayLabel}?</b>
                  <span>
                    {pendingMove.fromXPct != null && `de x ${pendingMove.fromXPct}% · y ${pendingMove.fromYPct}% `}
                    para x {pendingMove.xPct}% · y {pendingMove.yPct}%
                  </span>
                  <div className="map-move-confirm-actions">
                    <button type="button" className="primary-button" onClick={confirmPendingMove}>
                      OK, salvar
                    </button>
                    <button type="button" className="quiet-button" onClick={cancelPendingMove}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="tech-card map-library-panel" style={{ margin: 0 }}>
          <div className="map-library-panel-head">
            <div>
              <h4>{asset?.label || 'Mapa'}</h4>
              <span>
                {locationStats.total} pontos posicionados · {locationStats.approved} aprovados · {locationStats.autoDrafts} automáticos
                {locationStats.mismatches > 0 && ` · ${locationStats.mismatches} para revisar`}
              </span>
            </div>
            {atlasLoadState === 'error' && <span className="admin-status blocked">Atlas indisponível</span>}
          </div>

          <div className="map-calibration-meta">
            <p><b>Ponto selecionado:</b> {selectedPoint}</p>
            <p><b>Coordenada:</b> {selectedLocation
              ? `x ${selectedLocation.xPct}% / y ${selectedLocation.yPct}%`
              : editMode ? 'clique no mapa para posicionar' : 'ative "Editar mapa" para posicionar'}</p>
            <p><b>Status:</b> {locationStatus(selectedLocation)}</p>
          </div>

          <div className="map-point-list">
            {pointEntries.length === 0 ? (
              <p className="small">
                {statusFilter === 'all'
                  ? 'Nenhum ponto calibrado para este mapa.'
                  : 'Nenhum ponto neste mapa com o status filtrado.'}
              </p>
            ) : (
              pointEntries.map(entry => (
                <button
                  key={`${entry.location.code}-${entry.location.mapId}-${entry.location.xPct}-${entry.location.yPct}-list`}
                  type="button"
                  className={`map-point-row${locationMatchesPoint(entry.location, selectedPoint) ? ' selected' : ''}`}
                  onClick={() => openLocation(entry.location)}
                >
                  <span className="map-point-row-code">{entry.label}</span>
                  <span className="map-point-row-main">
                    <b>{entry.detail.name}</b>
                    <small>{entry.detail.meridian || entry.detail.dataOrigin}</small>
                  </span>
                  <span className={`admin-status ${locationStatusTone(entry.location)}`}>
                    {locationStatus(entry.location)}
                  </span>
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
