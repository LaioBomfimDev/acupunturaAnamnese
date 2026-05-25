import { Panel } from '../ui/Panel';
import { diagnosticProfile } from '../../utils/analyzer';

function ConfBar({ label, value, max = 30 }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="conf-row">
      <b>{label}</b>
      <div className="conf-track">
        <div className="conf-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>+{value}</span>
    </div>
  );
}

export function Diagnostico({ state, selectedMap, analysis }) {
  const d = diagnosticProfile(state, selectedMap);

  return (
    <Panel title="Diagnóstico Integrativo MTC">
      <div className="diag-grid">
        <div>
          <div className="diag-card">
            <h3>1. Síntese diagnóstica</h3>
            <p><span className="diag-badge">Principal</span> <b>{d.main || 'Aguardando dados'}</b></p>
            <p><span className="diag-badge">Associado</span> {d.assoc || 'Aguardando dados complementares'}</p>
            <p><span className="diag-badge">Compensatório</span> {d.compensatory || 'Não evidenciado no momento'}</p>
            <p className="small">A síntese diferencia o padrão predominante, os padrões associados e as manifestações que podem estar mascarando a raiz.</p>
          </div>

          <div className="diag-card">
            <h3>2. Ben × Biao</h3>
            <p><b>Raiz provável (Ben):</b> {d.root || 'Aguardando dados.'}</p>
            <p><b>Manifestação (Biao):</b> {d.manifestation || 'Aguardando dados.'}</p>
            <p><b>Produção patogênica:</b> {d.pathogenic?.length ? d.pathogenic.join(', ') : 'Aguardando confirmação'}</p>
            <p><b>Zang Fu predominante:</b> {d.top?.[1]?.data?.org || 'Achados sugerem comprometimento predominante de Fígado / Vesícula Biliar'}</p>
          </div>

          <div className="diag-card">
            <h3>3. Cadeia causal provável</h3>
            <div className="causal">
              {[
                d.root || 'Dados iniciais da anamnese',
                d.top?.[0] ? `Comprometimento de ${d.top[0]} — ${d.top[1]?.data?.org || ''}` : 'Cruzamento com língua e pulso',
                d.manifestation || 'Hipótese energética progressiva',
                d.assoc
              ].filter(Boolean).map((step, i, arr) => (
                <span key={i}>
                  <div className="causal-step">{step}</div>
                  {i < arr.length - 1 && <div className="causal-arrow">↓</div>}
                </span>
              ))}
            </div>
          </div>

          <div className="diag-card">
            <h3>4. Tradução funcional complementar</h3>
            <p style={{ margin: '8px 0', fontSize: 14 }}>• leitura funcional complementar será refinada após novos sinais</p>
            <p className="small">Leitura complementar para comunicação interdisciplinar; não substitui a interpretação energética da MTC.</p>
          </div>
        </div>

        <div>
          <div className="diag-card" style={{ textAlign: 'center' }}>
            <h3>Confiança diagnóstica</h3>
            <p className="confidence-big">{d.confidence || 18}%</p>
            <ConfBar label="Língua" value={d.parts?.tongue || 0} max={35} />
            <ConfBar label="Pulso" value={d.parts?.pulse || 0} max={35} />
            <ConfBar label="Sintomas" value={d.parts?.symptoms || 0} max={45} />
            <ConfBar label="Emoções" value={d.parts?.emotions || 0} max={25} />
          </div>

          <div className="diag-card">
            <h3>5. Conflitos diagnósticos</h3>
            {d.conflicts?.length
              ? d.conflicts.map((c, i) => <div key={i} className="conflict">⚠ {c}</div>)
              : <div className="box">Nenhum conflito relevante detectado até o momento.</div>
            }
          </div>

          <div className="diag-card">
            <h3>6. Lacunas antes de fechar conduta</h3>
            {d.missing?.length
              ? d.missing.map((m, i) => <div key={i} className="missing">□ Investigar {m}</div>)
              : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="missing" style={{ margin: 0 }}>□ Investigar hábitos intestinais/fezes</div>
                  <div className="missing" style={{ margin: 0 }}>□ Investigar sede e ingestão hídrica</div>
                  <div className="missing" style={{ margin: 0 }}>□ Investigar sono e horário dos despertares</div>
                  <div className="missing" style={{ margin: 0 }}>□ Investigar ciclo menstrual/hormonal, quando aplicável</div>
                  <div className="missing" style={{ margin: 0 }}>□ Investigar relação com frio, calor, umidade, vento ou secura</div>
                </div>
              )
            }
          </div>

          <div className="diag-card">
            <h3>7. Próxima pergunta clínica</h3>
            <p>{analysis?.detail?.question || 'Completar anamnese, língua e pulso.'}</p>
          </div>
        </div>
      </div>
    </Panel>
  );
}
