import { Panel } from '../ui/Panel';
import { movementAnalysis, principleAnalysis, cycleInterpretation } from '../../utils/analyzer';

function BarLine({ label, value, max = 8 }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="barline">
      <b>{label}</b>
      <div className="bartrack">
        <div className="barfill" style={{ width: `${pct}%` }} />
      </div>
      <span>{value}</span>
    </div>
  );
}

export function RaciocinioClinical({ state, selectedMap, analysis }) {
  const mv = movementAnalysis(state, selectedMap);
  const pr = principleAnalysis(state, selectedMap);
  const sorted = Object.entries(mv).sort((a, b) => b[1].score - a[1].score);
  const cycle = cycleInterpretation(mv);
  const top = sorted[0];
  const root = top[1].score
    ? `${top[1].data.org} com predominância de ${top[0]}`
    : "Aguardando preenchimento";

  return (
    <Panel title="Raciocínio Clínico Integrado — MTC">
      <div className="box">
        <b>Objetivo:</b> integrar Oito Princípios, Cinco Movimentos, Zang Fu, língua, pulso e
        anamnese em uma hipótese clínica única.
      </div>

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>
        1. Predominância energética pelos 5 Movimentos
      </h3>
      <div className="cards">
        {sorted.map(([movement, data]) => (
          <div key={movement} className="movement-card">
            <h3>{movement}</h3>
            <p><b>{data.data.org}</b></p>
            <p className="small">Emoção: {data.data.emotion}</p>
            <span className="score-pill">{data.score} sinais</span>
            <div className="evidence">
              {data.evidence.length
                ? data.evidence.map(e => <div key={e}>✓ {e}</div>)
                : <span>Aguardando sinais</span>
              }
            </div>
          </div>
        ))}
      </div>

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>
        2. Dinâmica de geração, dominância e contradominância
      </h3>
      <div className="cycle-box">
        {['Madeira', 'Fogo', 'Terra', 'Metal', 'Água', 'Madeira'].flatMap((n, i, arr) =>
          i < arr.length - 1
            ? [<span key={`n-${i}`} className="node">{n}</span>, <span key={`a-${i}`} className="arrow">→</span>]
            : [<span key={`n-${i}`} className="node">{n}</span>]
        )}
      </div>
      {cycle.map((c, i) => <div key={i} className="warning">{c}</div>)}

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>
        3. Oito Princípios integrados
      </h3>
      <div className="box">
        {Object.entries(pr).map(([label, val]) => (
          <BarLine key={label} label={label} value={val} max={8} />
        ))}
      </div>

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>
        4. Hipótese integrativa
      </h3>
      <div className="box">
        <p><b>Raiz provável:</b> {root}</p>
        <p><b>Manifestação atual:</b> {analysis.main !== "Aguardando dados" && analysis.main ? analysis.main : "Aguardando cruzamento com anamnese, língua e pulso"}</p>
        <p><b>Confiança:</b> {analysis.confidence || "Baixa"}</p>
        <p><b>Produções patogênicas a observar:</b> Umidade, Fleuma, Estagnação de Qi, Estase de Xue ou Calor conforme sinais de língua/pulso.</p>
        <p><b>Próxima pergunta inteligente:</b> {analysis.detail?.question || "Completar anamnese, língua e pulso."}</p>
      </div>

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>
        5. Perguntas estratégicas sugeridas
      </h3>
      <div className="checkgrid two">
        {[
          "Piora com estresse?", "Desejo por doce?", "Sensação de peso?", "Edema?",
          "Sede ou boca seca?", "Piora com frio/calor?", "Sonhos intensos?", "Sintomas digestivos após emoção?"
        ].map(q => <div key={q} className="tag">{q}</div>)}
      </div>
    </Panel>
  );
}
