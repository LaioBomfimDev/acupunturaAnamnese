import { useEffect, useState } from 'react';
import { Panel } from '../ui/Panel';
import {
  getClinicalKnowledgeReviews,
  getLocalKnowledgeReviews,
  mergeKnowledgeReviews,
} from '../../services/knowledgeAdminService';
import { getMapAsset, getLocationsForPoint } from '../../knowledge/mapLocations';
import { isDefaultCommonMapLocationCode } from '../../knowledge/auricularCuration';
import { buildPointDetail } from '../../knowledge/pointDetails';
import { buildSessionSuggestion } from '../../knowledge/pointRecommendationEngine';
import {
  buildLaserTechniquePlan,
  buildMoxaTechniquePlan,
  suggestVentosa,
} from '../../knowledge/protocolEngine';
import {
  findAtlasEdneaSourceReference,
  loadAtlasEdneaSourceIndex,
} from '../../knowledge/sourceReferences';
import { PointReviewDialog } from './PointReviewDialog';

function pointKey(point) {
  return point?.code || point?.displayCode || point?.label || point;
}

function MapOverlay({ points, mapId, onPointClick, commonOnly }) {
  const asset = getMapAsset(mapId);
  if (!asset) return null;

  const locations = points
    .flatMap(point => getLocationsForPoint(pointKey(point))
      .filter(location => location.mapId === mapId)
      .filter(location => !commonOnly || isDefaultCommonMapLocationCode(location.code))
      .map((location, index) => ({
        ...location,
        markerKey: `${mapId}-${location.code}-${location.xPct}-${location.yPct}-${index}`,
        point,
      })));

  return (
    <div style={{ position: 'relative' }}>
      <img src={asset.src} alt={asset.label} draggable={false} />
      {locations.map(location => (
        <button
          key={location.markerKey}
          onClick={() => onPointClick(location.point || location, { asset, location })}
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

const SUGGESTION_GROUP_LABELS = [
  { id: 'essential', label: 'Essenciais', hint: 'núcleo do protocolo para o padrão principal' },
  { id: 'complementary', label: 'Complementares', hint: 'apoiam padrões associados e achados fortes' },
  { id: 'optional', label: 'Opcionais', hint: 'coerentes com o caso, usar conforme objetivo da sessão' },
];

// Snapshot leve da sugestão gravado no estado clínico: permite comparar depois
// (na Evolução) o que foi sugerido com o que a profissional realmente usou.
function snapshotSuggestion(suggestion) {
  const compact = (item, origem) => ({
    code: item.point.code,
    label: item.point.label,
    group: item.group || 'auricular',
    score: item.score,
    origem,
  });
  return {
    sistemicos: suggestion.systemic.map(item => compact(item, 'sistemico')),
    auriculares: suggestion.auricular.map(item => compact(item, 'auricular')),
  };
}

function SuggestionRow({ item, origem, checked, onToggleSelect, onDetail }) {
  return (
    <div className="suggestion-row">
      <label className="suggestion-check">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggleSelect(item, origem)}
        />
        <span className="suggestion-checkmark" aria-hidden="true" />
      </label>
      <button type="button" className="suggestion-info" onClick={() => onDetail(item.point)}>
        <b>{item.point.label}</b>
        <small>{item.reasons.slice(0, 3).join(' • ')}</small>
        {item.cautions.length > 0 && <em>{item.cautions.join(' • ')}</em>}
      </button>
      <strong className="suggestion-score" title="Pontuação clínica">{item.score}</strong>
    </div>
  );
}

function selectedClinicalText(selectedMap) {
  return Object.entries(selectedMap || {})
    .filter(([, selected]) => selected)
    .map(([key]) => key.split(':').slice(1).join(':'))
    .filter(Boolean)
    .join(' ');
}

function TechniqueStatus({ status, label }) {
  return <span className={`tech-status ${status}`}>{label}</span>;
}

function TechniqueParameterGrid({ items }) {
  return (
    <div className="dose-grid tech-params">
      {items.map(item => (
        <div key={item.label} className="dose-box">
          <b>{item.label}</b><br />{item.value}
        </div>
      ))}
    </div>
  );
}

function TechniqueChecklist({ title, items }) {
  return (
    <div className="tech-section">
      <h5>{title}</h5>
      <ul className="tech-list">
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function TechniquePlanCard({ plan }) {
  return (
    <div className="tech-card technique-plan-card">
      <div className="tech-card-head">
        <h4>{plan.title}</h4>
        <TechniqueStatus status={plan.status} label={plan.statusLabel} />
      </div>
      <p className="small">{plan.summary}</p>
      <div className="tech-section">
        <h5>Pontos e alvo</h5>
        <p>{chips(plan.points)}</p>
        <p className="small"><b>Modo:</b> {plan.mode}</p>
      </div>
      <TechniqueParameterGrid items={plan.parameters} />
      <TechniqueChecklist title="Antes de aplicar" items={plan.checklist} />
      <div className="warning-soft">
        {plan.cautions.map(item => <p key={item}>{item}</p>)}
      </div>
      <p className="tech-source-note">{plan.sourceNote}</p>
    </div>
  );
}

const SYSTEMIC_PROTOCOL_MAP_ID = 'body_full';

export function Protocolo({ state, selectedMap, analysis, onUpdate }) {
  const { protocol, main, safetyAlerts = [] } = analysis;
  const bodyPoints = protocol.bodyPoints || [];
  const earPoints = protocol.earPoints || [];
  const eletro = protocol.eletro || [];
  const stiper = protocol.stiper || bodyPoints.slice(0, 4).map(p => `${p.displayCode} — considerar Stiper conforme tolerância e objetivo`);
  const ventosa = suggestVentosa(main);
  const clinicalTechniqueText = [
    state?.queixa,
    state?.historia,
    state?.medicamentos,
    state?.observacoes,
    selectedClinicalText(selectedMap),
    safetyAlerts.map(alert => alert.message).join(' '),
  ].filter(Boolean).join(' ');
  const laserPlan = buildLaserTechniquePlan({ protocol, patternName: main, clinicalText: clinicalTechniqueText });
  const moxaPlan = buildMoxaTechniquePlan({ protocol, patternName: main, clinicalText: clinicalTechniqueText });

  const [filtros, setFiltros] = useState([]);
  const [commonOnly, setCommonOnly] = useState(true);
  const [pointInfoBox, setPointInfoBox] = useState(null);
  const [atlasSourceIndex, setAtlasSourceIndex] = useState(null);
  const [atlasLoadState, setAtlasLoadState] = useState('loading');
  const [knowledgeReviews, setKnowledgeReviews] = useState(() => getLocalKnowledgeReviews());
  // Usuário comum trabalha apenas com a categoria "Pontos comumente usados";
  // a biblioteca completa permanece no SuperAdm.
  const sessionSuggestion = buildSessionSuggestion({ state, selectedMap, analysis, knowledgeReviews, commonlyUsedOnly: true });
  const sessaoSugestao = state.sessaoSugestao || { selecionados: [] };
  const selectedSuggestionCodes = new Set((sessaoSugestao.selecionados || []).map(p => p.code));

  // A seleção fica no estado clínico (persistido com a sessão); nenhum ponto é
  // obrigatório — a profissional marca apenas o que pretende usar.
  function toggleSuggestionPoint(item, origem) {
    const current = sessaoSugestao.selecionados || [];
    const selecionados = selectedSuggestionCodes.has(item.point.code)
      ? current.filter(p => p.code !== item.point.code)
      : [...current, { code: item.point.code, label: item.point.label, origem }];

    onUpdate('sessaoSugestao', {
      selecionados,
      sugeridos: snapshotSuggestion(sessionSuggestion),
      geradoEm: new Date().toISOString(),
    });
  }
  const fullBodyAsset = getMapAsset(SYSTEMIC_PROTOCOL_MAP_ID);

  useEffect(() => {
    let cancelled = false;

    loadAtlasEdneaSourceIndex()
      .then(data => {
        if (!cancelled) {
          setAtlasSourceIndex(data);
          setAtlasLoadState('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAtlasSourceIndex(null);
          setAtlasLoadState('error');
        }
      });

    getClinicalKnowledgeReviews()
      .then(reviews => {
        if (!cancelled) setKnowledgeReviews(reviews);
      })
      .catch(() => {
        if (!cancelled) setKnowledgeReviews(getLocalKnowledgeReviews());
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function toggleFiltro(t) {
    setFiltros(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  function enabled(t) {
    return filtros.length === 0 || filtros.includes(t);
  }

  function handleClick(point, markerContext = {}) {
    const key = point?.code || point?.displayCode || point?.label || point?.name || point;
    const freshReviews = mergeKnowledgeReviews(knowledgeReviews, getLocalKnowledgeReviews());
    const atlasReference = findAtlasEdneaSourceReference(atlasSourceIndex, key);
    const detail = buildPointDetail({
      pointKey: key,
      patternName: main,
      reviews: freshReviews,
      atlasReference,
    });

    setPointInfoBox({
      asset: markerContext.asset,
      detail,
      label: markerContext.location?.label || point?.displayCode || point?.label || detail.displayCode,
      location: markerContext.location,
    });
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
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
          <b>Pontos no mapa:</b>
          <button
            className={`tag${commonOnly ? ' active' : ''}`}
            onClick={() => setCommonOnly(true)}
            aria-pressed={commonOnly}
          >
            {commonOnly ? '✓ ' : ''}Mais usados
          </button>
          <button
            className={`tag${!commonOnly ? ' active' : ''}`}
            onClick={() => setCommonOnly(false)}
            aria-pressed={!commonOnly}
          >
            {!commonOnly ? '✓ ' : ''}Todos
          </button>
        </div>
      </div>

      {safetyAlerts.length > 0 && (
        <div className="alert" style={{ marginBottom: 16 }}>
          <b>Atenção clínica:</b> {safetyAlerts.map(alert => alert.message).join(' • ')}
        </div>
      )}

      <div className="protocol-layout">
        <div>
          {enabled('Sistêmicos') && fullBodyAsset && (
            <div className="map-card">
              <h3>Mapa corporal</h3>
              <div className="map-stage">
                <MapOverlay points={bodyPoints} mapId={SYSTEMIC_PROTOCOL_MAP_ID} onPointClick={handleClick} commonOnly={commonOnly} />
              </div>
              <div className="legend">
                <span><i className="dot" style={{ background: 'var(--gold)' }}></i>Pontos selecionados</span>
              </div>
            </div>
          )}
          {enabled('Auriculoterapia') && (
            <div className="map-card">
              <h3>Mapa auricular</h3>
              <div className="map-stage">
                <MapOverlay points={earPoints} mapId="ear_lateral" onPointClick={handleClick} commonOnly={commonOnly} />
              </div>
              <div className="legend">
                <span><i className="dot" style={{ background: 'var(--gold)' }}></i>Pontos auriculares</span>
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="tech-card">
            <h4>Resumo dos pontos</h4>
            <table className="protocol-table">
              <tbody>
                <tr><td>Corpo</td><td>{chips(bodyPoints)}</td></tr>
                <tr><td>Aurículo</td><td>{chips(earPoints)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="tech-card">
            <h4>Sugestão da sessão</h4>
            {sessionSuggestion.systemic.length > 0 || sessionSuggestion.auricular.length > 0 ? (
              <>
                <p className="small">
                  Até {sessionSuggestion.limits.systemicLimit} pontos sistêmicos + auriculares opcionais,
                  montados a partir do protocolo-base, dos {sessionSuggestion.candidateStats.candidateCount} pontos
                  comumente usados e dos achados de anamnese, língua e pulso.
                  {' '}Apoio à decisão: marque apenas o que fizer sentido clínico para esta sessão.
                </p>
                {sessionSuggestion.evidence.length > 0 && (
                  <p className="small">Evidências: {sessionSuggestion.evidence.map(item => item.label).join(', ')}.</p>
                )}
                {SUGGESTION_GROUP_LABELS.map(group => (
                  sessionSuggestion.groups[group.id].length > 0 && (
                    <div key={group.id} className="suggestion-group">
                      <h5>{group.label} <span>{group.hint}</span></h5>
                      <div className="point-recommendation-list">
                        {sessionSuggestion.groups[group.id].map(item => (
                          <SuggestionRow
                            key={item.point.code}
                            item={item}
                            origem="sistemico"
                            checked={selectedSuggestionCodes.has(item.point.code)}
                            onToggleSelect={toggleSuggestionPoint}
                            onDetail={handleClick}
                          />
                        ))}
                      </div>
                    </div>
                  )
                ))}
                {sessionSuggestion.auricular.length > 0 && (
                  <div className="suggestion-group">
                    <h5>Auriculares <span>complemento opcional, fora do limite sistêmico</span></h5>
                    <div className="point-recommendation-list">
                      {sessionSuggestion.auricular.map(item => (
                        <SuggestionRow
                          key={item.point.code}
                          item={item}
                          origem="auricular"
                          checked={selectedSuggestionCodes.has(item.point.code)}
                          onToggleSelect={toggleSuggestionPoint}
                          onDetail={handleClick}
                        />
                      ))}
                    </div>
                  </div>
                )}
                {(sessaoSugestao.selecionados || []).length > 0 && (
                  <p className="small suggestion-selected-note">
                    Selecionados para a sessão: {(sessaoSugestao.selecionados || []).map(p => p.label.split(' — ')[0]).join(', ')}.
                  </p>
                )}
              </>
            ) : (
              <p className="small">Aguardando evidências suficientes na anamnese, língua ou pulso.</p>
            )}
          </div>

          {enabled('Laser') && (
            <TechniquePlanCard plan={laserPlan} />
          )}

          {enabled('Moxa') && (
            <TechniquePlanCard plan={moxaPlan} />
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

      <PointReviewDialog
        entry={pointInfoBox}
        atlasLoadState={atlasLoadState}
        contextLabel="Protocolo da sessão"
        onClose={() => setPointInfoBox(null)}
      />
    </Panel>
  );
}
