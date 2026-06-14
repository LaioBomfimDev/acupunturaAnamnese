import { Panel } from '../ui/Panel';
import { CheckGrid } from '../ui/CheckGrid';
import { pulsePositions } from '../../data/pulseData';

// Qualidades palpadas ficam no grupo "pulso:" (evidência de palpação);
// sinais associados vão para "pulsoSinal:" e pesam como sintoma na análise.
function PulsePositionBox({ side, pos, selectedMap, onToggle }) {
  return (
    <div className="pulse-organ-box">
      <h4>{pos.title}</h4>
      <p className="organ-note">Qualidade palpada</p>
      <CheckGrid group={`pulso:${side}:${pos.id}`} items={pos.qualities} cols={2} selectedMap={selectedMap} onToggle={onToggle} />
      <p className="organ-note" style={{ marginTop: 10 }}>Sinais associados</p>
      <CheckGrid group={`pulsoSinal:${side}:${pos.id}`} items={pos.associatedSigns} cols={2} selectedMap={selectedMap} onToggle={onToggle} />
    </div>
  );
}

export function Pulso({ selectedMap, onToggle }) {
  return (
    <Panel title="Diagnóstico pela pulsologia">
      <div className="box">
        <b>Proposta do módulo:</b> o checklist organiza achados por posição e órgão,
        incluindo qualidade do pulso e sinais associados para cruzar com língua e anamnese.
      </div>

      <h3 style={{ marginTop: 24 }}>Lado Direito</h3>
      <div className="pulse-organ-grid">
        {pulsePositions.direito.map((pos) => (
          <PulsePositionBox key={pos.id} side="direito" pos={pos} selectedMap={selectedMap} onToggle={onToggle} />
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Lado Esquerdo</h3>
      <div className="pulse-organ-grid">
        {pulsePositions.esquerdo.map((pos) => (
          <PulsePositionBox key={pos.id} side="esquerdo" pos={pos} selectedMap={selectedMap} onToggle={onToggle} />
        ))}
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <b>Leitura assistida:</b> pulso em corda no P8 esquerdo já pesa para Fígado/Vesícula; 
        pulso fraco no P8 direito já pesa para Baço/Estômago; pulso rápido ou irregular no P9 esquerdo 
        já fortalece a hipótese de Coração/Shen.
      </div>
    </Panel>
  );
}
