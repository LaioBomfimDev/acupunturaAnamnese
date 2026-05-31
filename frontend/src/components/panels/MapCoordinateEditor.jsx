import { useState } from 'react';
import {
  calibrationPointOptions,
  getAllMapLocations,
  getLocationsForPoint,
  getMapAsset,
  mapGroups,
  upsertStoredMapLocation,
} from '../../knowledge/mapLocations';
import { displayPointCode, normalizePointCode } from '../../knowledge/aliases';

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

export function MapCoordinateEditor() {
  const mapIds = mapGroups.flatMap(group => group.maps);
  const [activeMapId, setActiveMapId] = useState('feet_dorsal');
  const [selectedPoint, setSelectedPoint] = useState('LR3');
  const [allLocations, setAllLocations] = useState(() => getAllMapLocations());
  const asset = getMapAsset(activeMapId);

  const locations = allLocations.filter(location => location.mapId === activeMapId);
  const selectedLocations = getLocationsForPoint(selectedPoint).filter(location => location.mapId === activeMapId);
  const selectedLocation = selectedLocations[0] || null;

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
    <div className="box" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: '0 0 6px', color: 'var(--navy)' }}>Mapas da Biblioteca</h3>
          <p className="small" style={{ margin: 0 }}>Coordenadas em rascunho local, calibradas manualmente sobre as imagens do sistema.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            value={selectedPoint}
            onChange={event => setSelectedPoint(event.target.value)}
            style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '9px 10px', background: 'white' }}
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {mapIds.map(mapId => {
          const map = getMapAsset(mapId);
          return (
            <button
              key={mapId}
              className={`tag${activeMapId === mapId ? ' active' : ''}`}
              onClick={() => setActiveMapId(mapId)}
            >
              {map?.label || mapId}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(260px, 0.6fr)', gap: 16 }}>
        <div
          onClick={handleMapClick}
          style={{
            border: '1px solid var(--line)',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#fff',
            position: 'relative',
            minHeight: 360,
            cursor: 'crosshair',
          }}
        >
          {asset && (
            <>
              <img
                src={asset.src}
                alt={asset.label}
                style={{ width: '100%', display: 'block', userSelect: 'none' }}
                draggable={false}
              />
              {locations.map(location => {
                const isSelected = asLocationCode(selectedPoint) === location.code || selectedPoint === location.label;
                return (
                  <button
                    key={`${location.code}-${location.mapId}`}
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      setSelectedPoint(location.label || displayPointCode(location.code));
                    }}
                    title={markerLabel(location)}
                    style={{
                      position: 'absolute',
                      left: `${location.xPct}%`,
                      top: `${location.yPct}%`,
                      transform: 'translate(-50%, -50%)',
                      width: isSelected ? 28 : 22,
                      height: isSelected ? 28 : 22,
                      borderRadius: '50%',
                      border: '2px solid var(--navy)',
                      background: isSelected ? 'var(--gold)' : 'rgba(250, 204, 21, 0.86)',
                      color: 'var(--navy)',
                      fontSize: 9,
                      fontWeight: 800,
                      lineHeight: 1,
                      padding: 0,
                      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.18)',
                      cursor: 'pointer',
                    }}
                  >
                    {markerLabel(location).slice(0, 4)}
                  </button>
                );
              })}
            </>
          )}
        </div>

        <div className="tech-card" style={{ margin: 0 }}>
          <h4>{asset?.label || 'Mapa'}</h4>
          <p><b>Ponto selecionado:</b> {selectedPoint}</p>
          <p><b>Coordenada:</b> {selectedLocation ? `x ${selectedLocation.xPct}% / y ${selectedLocation.yPct}%` : 'clique no mapa para posicionar'}</p>
          <p><b>Status:</b> {selectedLocation?.approved ? 'aprovado' : 'rascunho de calibração'}</p>
          <div style={{ marginTop: 12 }}>
            <b>Pontos neste mapa</b>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {locations.map(location => (
                <button
                  key={`${location.code}-${location.mapId}-list`}
                  className={`tag${asLocationCode(selectedPoint) === location.code || selectedPoint === location.label ? ' active' : ''}`}
                  onClick={() => setSelectedPoint(location.label || displayPointCode(location.code))}
                >
                  {markerLabel(location)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
