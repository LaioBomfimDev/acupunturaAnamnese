import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { getMapAsset, getLocationsForPoint } from '../../knowledge/mapLocations';
import { getPointFicha, suggestVentosa } from '../../knowledge/protocolEngine';
import { normalizePointCode } from '../../knowledge/aliases';

function pointKey(point) {
  return point?.code || point?.displayCode || point?.label || point;
}

function samePoint(location, point) {
  if (!location || !point) return false;
  if (location.code?.startsWith('auricular:')) {
    return location.label === point.displayCode || location.label === point.label?.replace(/^Aurículo — /, '');
  }
  return normalizePointCode(location.code) === normalizePointCode(point.code || point.displayCode);
}

function hasMapLocations(points, mapId) {
  return points.some(point => getLocationsForPoint(pointKey(point)).some(location => location.mapId === mapId));
}

function MapOverlay({ points, mapId, onPointClick }) {
  const asset = getMapAsset(mapId);
  if (!asset) return null;

  const locations = points
    .flatMap(point => getLocationsForPoint(pointKey(point)))
    .filter(location => location.mapId === mapId)
    .map(location => ({
      ...location,
      point: points.find(point => samePoint(location, point)),
    }));

  return (
    <div style={{ position: 'relative' }}>
      <img src={asset.src} alt={asset.label} draggable={false} />
      {locations.map(location => (
        <button
          key={`${location.mapId}-${location.code}`}
          onClick={() => onPointClick(location.point || location)}
          title={location.point?.label || location.label}
          type="button"
          style={{
            position: 'absolute',
            left: `${location.xPct}%`,
            top: `${location.yPct}%`,
            transform: 'translate(-50%, -50%)',
            width: 24,
            height: 24,
            borderRadius: '50%',
            border: '2px solid var(--navy)',
            background: 'var(--gold)',
            color: 'var(--navy)',
            fontSize: 8,
            fontWeight: 800,
            padding: 0,
            boxShadow: '0 2px 8px rgba(15, 23, 42, 0.18)',
            cursor: 'pointer',
          }}
        >
          {(location.point?.displayCode || location.label || '').slice(0, 4)}
        </button>
      ))}
    </div>
  );
}

function chips(arr) {
  if (!arr || !arr.length) return <span className="small">Aguardando dados</span>;
  return arr.map((item, i) => {
    const label = item?.displayCode || item?.label || item;
    return <span key={`${label}-${i}`} className="point-chip">{label}</span>;
  });
}

const TECNICOS = ['Sistêmicos', 'Auriculoterapia', 'Laser', 'Moxa', 'Ventosa', 'Stiper', 'Eletro'];

export function Protocolo({ analysis }) {
  const { protocol, main, safetyAlerts = [] } = analysis;
  const bodyPoints = protocol.bodyPoints || [];
  const earPoints = protocol.earPoints || [];
  const laser = protocol.laser || [];
  const moxa = protocol.moxa || [];
  const eletro = protocol.eletro || [];
  const stiper = protocol.stiper || bodyPoints.slice(0, 4).map(p => `${p.displayCode} — considerar Stiper conforme tolerância e objetivo`);
  const ventosa = suggestVentosa(main);

  const [filtros, setFiltros] = useState([]);
  const [pointInfoBox, setPointInfoBox] = useState(null);

  function toggleFiltro(t) {
    setFiltros(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function enabled(t) {
    return filtros.length === 0 || filtros.includes(t);
  }

  function handleClick(point) {
    const key = point?.code || point?.displayCode || point?.label || point?.name || point;
    setPointInfoBox(getPointFicha(key, main));
  }

  return (
    <Panel title="Protocolo terapêutico avançado — Biblioteca Viva">
      <div className="protocol-hero">
        <h2>{main}</h2>
        <p><b>Princípio terapêutico:</b> {protocol.goal}</p>
        <p><b>Modelo:</b> hipótese energética → Biblioteca Viva → técnica → pontos → justificativa → segurança.</p>
      </div>

      <div className="box">
        <b>Filtros terapêuticos:</b>
        <div className="filterbar">
          {TECNICOS.map(t => (
            <button key={t} className={`tag${filtros.includes(t) ? ' active' : ''}`} onClick={() => toggleFiltro(t)}>
              {filtros.includes(t) ? '✓ ' : ''}{t}
            </button>
          ))}
        </div>
        <p className="small">Se nenhum filtro estiver marcado, o sistema mostra todas as técnicas disponíveis.</p>
      </div>

      {safetyAlerts.length > 0 && (
        <div className="alert" style={{ marginBottom: 16 }}>
          <b>Atenção clínica:</b> {safetyAlerts.map(alert => alert.message).join(' • ')}
        </div>
      )}

      <div className="protocol-layout">
        <div>
          {enabled('Sistêmicos') && (
            <div className="map-card">
              <h3>Mapa corporal sistêmico</h3>
              <div className="map-stage">
                <MapOverlay points={bodyPoints} mapId="body_front" onPointClick={handleClick} />
              </div>
              <div className="legend">
                <span><i className="dot" style={{ background: 'var(--gold)' }}></i>Pontos selecionados</span>
              </div>
            </div>
          )}
          {enabled('Sistêmicos') && hasMapLocations(bodyPoints, 'body_back') && (
            <div className="map-card">
              <h3>Mapa corporal posterior</h3>
              <div className="map-stage">
                <MapOverlay points={bodyPoints} mapId="body_back" onPointClick={handleClick} />
              </div>
            </div>
          )}
          {enabled('Sistêmicos') && hasMapLocations(bodyPoints, 'feet_dorsal') && (
            <div className="map-card">
              <h3>Mapa dos pés</h3>
              <div className="map-stage">
                <MapOverlay points={bodyPoints} mapId="feet_dorsal" onPointClick={handleClick} />
              </div>
            </div>
          )}
          {enabled('Sistêmicos') && hasMapLocations(bodyPoints, 'hands_palmar') && (
            <div className="map-card">
              <h3>Mapa mão/punho</h3>
              <div className="map-stage">
                <MapOverlay points={bodyPoints} mapId="hands_palmar" onPointClick={handleClick} />
              </div>
            </div>
          )}
          {enabled('Auriculoterapia') && (
            <div className="map-card">
              <h3>Mapa auricular</h3>
              <div className="map-stage">
                <MapOverlay points={earPoints} mapId="ear_lateral" onPointClick={handleClick} />
              </div>
              <div className="legend">
                <span><i className="dot" style={{ background: 'var(--gold)' }}></i>Pontos auriculares</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="tech-card">
            <h4>Ficha do ponto</h4>
            {pointInfoBox ? (
              <>
                <p><b>{pointInfoBox.name}</b></p>
                <p><b>Função:</b> {pointInfoBox.role}</p>
                <p><b>Por que entrou:</b> {pointInfoBox.why}</p>
                {pointInfoBox.cautions?.length > 0 && <p><b>Cautelas:</b> {pointInfoBox.cautions.join(', ')}</p>}
                {pointInfoBox.sources?.length > 0 && <p className="small"><b>Fonte:</b> {pointInfoBox.sources.join(' + ')}</p>}
              </>
            ) : (
              <p>Clique em um marcador do corpo ou da orelha para visualizar localização funcional, indicação e justificativa clínica vinda da Biblioteca Viva.</p>
            )}
          </div>

          <div className="tech-card">
            <h4>Resumo dos pontos</h4>
            <table className="protocol-table">
              <tbody>
                <tr><td>Corpo</td><td>{chips(bodyPoints)}</td></tr>
                <tr><td>Aurículo</td><td>{chips(earPoints)}</td></tr>
              </tbody>
            </table>
          </div>

          {enabled('Laser') && (
            <div className="tech-card">
              <h4>Laser / Fotobiomodulação</h4>
              <p>{chips(laser)}</p>
              <div className="dose-grid">
                <div className="dose-box"><b>Modo</b><br />Pontual ou varredura</div>
                <div className="dose-box"><b>Dose</b><br />Definir por objetivo, área e equipamento</div>
                <div className="dose-box"><b>Alerta</b><br />Respeitar janela terapêutica</div>
              </div>
              <div className="warning-soft">A dose deve ser conferida conforme potência do aparelho, comprimento de onda, área irradiada e resposta do paciente.</div>
            </div>
          )}

          {enabled('Moxa') && (
            <div className="tech-card">
              <h4>Moxaterapia</h4>
              <p>{chips(moxa)}</p>
              <div className="warning-soft">Priorizar em frio, deficiência e estagnação por frio. Evitar em calor exuberante, febre, inflamação aguda ou pele sem integridade.</div>
            </div>
          )}

          {enabled('Ventosa') && (
            <div className="tech-card">
              <h4>Ventosaterapia</h4>
              <p>{ventosa}</p>
              <div className="warning-soft">Regular intensidade conforme constituição, pele, idade, dor e presença de fragilidade vascular.</div>
            </div>
          )}

          {enabled('Stiper') && (
            <div className="tech-card">
              <h4>Stiper</h4>
              <p>{chips(stiper)}</p>
              <div className="warning-soft">Usar como estímulo não invasivo nos pontos selecionados, ajustando tempo de permanência à tolerância e objetivo.</div>
            </div>
          )}

          {enabled('Eletro') && (
            <div className="tech-card">
              <h4>Eletroacupuntura</h4>
              <p>{chips(eletro)}</p>
              <div className="warning-soft">Evitar estímulo excessivo em pacientes muito ansiosos, debilitados, gestantes ou com contraindicações específicas.</div>
            </div>
          )}
        </div>
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <b>Leitura clínica:</b> o protocolo não deve ser aplicado como receita fixa. A seleção final depende de idade, queixa, pulso, língua, tolerância, medicamentos, sinais de alerta e objetivo da sessão.
      </div>
    </Panel>
  );
}
