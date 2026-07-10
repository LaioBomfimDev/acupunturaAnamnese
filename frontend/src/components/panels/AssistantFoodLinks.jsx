// ============================================================
// COMPONENTE: Alimentos ligados ao padrão (dietoterapia) no rail "IA Assistente".
//
// Cruza a síntese ao vivo (assistantSynthesis) com o catálogo de dietoterapia
// da fonte, mostrando ONDE a leitura tradicional associa um alimento ao
// sistema/natureza do padrão hipotético. É DETERMINÍSTICO (regra sobre a fonte
// curada), não uma geração de IA — instrui/indica, não prescreve. Sempre atrás
// do gate de confiança (motor) e do gate humano de curadoria (isBlocked).
// ============================================================

import { useMemo } from 'react';
import { linkFoodsToSynthesis } from '../../knowledge/foodPatternLinking';
import { getLocalFoodCurationDecisions } from '../../knowledge/foodDietoterapiaCuration';
import { FOOD_ENERGIES } from '../../knowledge/foodDietoterapia';

const ENERGY_TONE = {
  fria: '#1f6feb', fresca: '#3d8bd4', neutra: '#6b7280', morna: '#d98324', quente: '#c0392b',
};

function EnergyBadge({ energy }) {
  if (!energy) return null;
  const meta = FOOD_ENERGIES[energy];
  return (
    <span
      style={{
        background: ENERGY_TONE[energy] || '#6b7280', color: '#fff', borderRadius: 10,
        padding: '1px 7px', fontSize: 11, whiteSpace: 'nowrap',
      }}
      title={meta?.hint}
    >
      {meta?.label || energy}
    </span>
  );
}

export function AssistantFoodLinks({ synthesis }) {
  // Bloqueados pela curadoria não entram na sugestão (gate humano). Recalcula
  // junto da síntese; a curadoria muda pouco durante um atendimento.
  const isBlocked = useMemo(() => {
    const blocked = new Set(
      getLocalFoodCurationDecisions()
        .filter(d => d.status === 'bloqueado_risco')
        .map(d => d.foodId),
    );
    return id => blocked.has(id);
  }, []);

  const link = useMemo(
    () => linkFoodsToSynthesis(synthesis, { isBlocked, maxPerPattern: 6 }),
    [synthesis, isBlocked],
  );

  const hasHypothesis = synthesis?.primaryName && synthesis.primaryName !== 'Aguardando dados';
  if (!hasHypothesis) return null;

  return (
    <div className="synth-block synth-food-links">
      <span className="synth-label">Alimentos que a fonte associa ao padrão</span>

      {link.gated ? (
        <p className="small" style={{ marginTop: 4, opacity: 0.8 }}>{link.gateReason}</p>
      ) : (
        <>
          {link.patterns.map(pat => (
            <details key={`${pat.role}:${pat.name}`} open={pat.role === 'primary'} style={{ marginTop: 6 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {pat.name}
                {pat.percent > 0 ? ` · ${pat.percent}%` : ''}
                {pat.role === 'differential' ? ' (diferencial)' : ''}
              </summary>
              <p className="small" style={{ margin: '4px 0 6px', opacity: 0.75 }}>
                Direção tradicional: {pat.directionText}.
              </p>
              {pat.foods.length === 0 ? (
                <p className="small" style={{ opacity: 0.7 }}>Nenhum alimento liberado e coerente para este padrão.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 16 }}>
                  {pat.foods.map(food => (
                    <li key={food.id} style={{ marginBottom: 6 }}>
                      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 13 }}>{food.commonName}</b>
                        <EnergyBadge energy={food.energy} />
                      </span>
                      <p className="small" style={{ margin: '2px 0 0' }}>{food.rationale}</p>
                      {food.caution && (
                        <p className="small" style={{ margin: '2px 0 0', color: '#b3261e' }}>
                          <b>Cautela:</b> {food.caution}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}

          <p className="small" style={{ marginTop: 8, opacity: 0.7 }}>{link.disclaimer}</p>
          <p className="small" style={{ marginTop: 4, opacity: 0.7 }}>
            Abra a aba <b>Dietoterapia</b> para ler o card completo de cada alimento.
          </p>
        </>
      )}
    </div>
  );
}
