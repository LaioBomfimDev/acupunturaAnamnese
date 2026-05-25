import { Panel } from '../ui/Panel';
import { CheckGrid } from '../ui/CheckGrid';
import { tongueOrganAlterations } from '../../data/tongueData';

// Imagem extraída do HTML original e salva em public/
const TONGUE_MAP_SRC = '/tongue-map.jpg';

export function Lingua({ selectedMap, onToggle }) {
  return (
    <Panel title="Inspeção da língua">
      <div className="box">
        <b>Proposta do módulo:</b> a imagem fixa funciona como mapa-guia. A foto do paciente fica
        ao lado para comparação clínica e, abaixo, o checklist organiza os achados por região/órgão.
        Assim, a IA cruza mapa + foto + marcações e gera a hipótese energética com mais precisão.
      </div>

      <div className="tongue-duo">
        <div className="tongue-card">
          <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>Mapa fixo da língua</h3>
          <img className="tongue-map-fixed" src={TONGUE_MAP_SRC} alt="Mapa da língua por órgãos na MTC" />
          <p className="small">Referência visual para comparar com a foto clínica.</p>
        </div>

        <div className="tongue-card">
          <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia, serif' }}>Foto do paciente</h3>
          <div className="upload" style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            Adicionar foto superior da língua
          </div>
          <div className="upload" style={{ marginTop: 12 }}>
            Adicionar foto sublingual
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>Checklist único por órgão / região do mapa</h3>
      <div className="organ-grid">
        {Object.entries(tongueOrganAlterations).map(([organ, data]) => (
          <div key={organ} className="organ-box">
            <h4>{organ}</h4>
            <p className="organ-note">{data.subtitle}</p>
            <CheckGrid
              group={`linguaOrgao:${organ}`}
              items={data.items}
              cols={2}
              selectedMap={selectedMap}
              onToggle={onToggle}
            />
          </div>
        ))}
      </div>

      <div className="box" style={{ marginTop: 16 }}>
        <b>Leitura assistida:</b> agora a IA não precisa cruzar um achado geral solto com uma região marcada separadamente. 
        Exemplo: “laterais vermelhas” já pesa diretamente para Fígado/Vesícula; “centro inchado com marcas dentárias” 
        já pesa para Baço/Estômago; “ponta muito vermelha” já pesa para Coração/Shen.
      </div>
    </Panel>
  );
}
