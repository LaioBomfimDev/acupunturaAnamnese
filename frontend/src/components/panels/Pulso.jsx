import { Panel } from '../ui/Panel';
import { CheckGrid } from '../ui/CheckGrid';
import { pulsePositions } from '../../data/pulseData';

const PULSE_MAP_SRC = '/maps/hands-palmar.webp';

export function Pulso({ selectedMap, onToggle }) {
  return (
    <Panel title="Diagnóstico pela pulsologia">
      <div className="box">
        <b>Proposta do módulo:</b> o mapa fixo da pulsologia fica como guia visual. A avaliação do
        paciente é registrada ao lado e, abaixo, o checklist organiza achados por posição e órgão, 
        incluindo qualidade do pulso e sinais associados para cruzar com língua e anamnese.
      </div>

      <div className="pulse-duo">
        <div className="pulse-card">
          <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>Mapa de mãos e punhos</h3>
          <img className="pulse-map-fixed" src={PULSE_MAP_SRC} alt="Ilustração de mãos e punhos para avaliação do pulso" />
          <p className="small">Referência visual para posicionamento de punho e palpação do pulso.</p>
        </div>

        <div className="pulse-card">
          <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>Registro clínico do paciente</h3>
          <div className="upload" style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Registrar foto/observação do posicionamento
          </div>
          <div className="box" style={{ marginTop: 12 }}>
            <b>Como avaliar:</b> marque a qualidade do pulso e os sinais clínicos associados da posição.
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>Lado Direito</h3>
      <div className="pulse-organ-grid">
        {pulsePositions.direito.map((pos) => (
          <div key={pos.id} className="pulse-organ-box">
            <h4>{pos.title}</h4>
            <p className="organ-note">Marque qualidade do pulso + sinais associados da posição.</p>
            <CheckGrid group={`pulso:direito:${pos.id}`} items={pos.items} cols={2} selectedMap={selectedMap} onToggle={onToggle} />
          </div>
        ))}
      </div>

      <h3 style={{ marginTop: 24 }}>Lado Esquerdo</h3>
      <div className="pulse-organ-grid">
        {pulsePositions.esquerdo.map((pos) => (
          <div key={pos.id} className="pulse-organ-box">
            <h4>{pos.title}</h4>
            <p className="organ-note">Marque qualidade do pulso + sinais associados da posição.</p>
            <CheckGrid group={`pulso:esquerdo:${pos.id}`} items={pos.items} cols={2} selectedMap={selectedMap} onToggle={onToggle} />
          </div>
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
