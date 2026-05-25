import { useState } from 'react';
import { Panel } from '../ui/Panel';

// ── Dados do HTML original (linha 113) — SVG idêntico ao original ─────────────
// bodyPointXY e earPointXY do HTML original (linhas 109-110)
const bodyXY = {
  Yintang:[50,13], VG20:[50,5], VB20:[38,18], F3:[42,96], VB34:[63,72],
  TA5:[75,48], IG4:[25,48], R3:[55,92], PC6:[30,52], VC12:[50,49],
  E36:[58,78], BP6:[43,84], BP9:[43,75], E40:[60,83], IG11:[23,39],
  C7:[30,56], VC6:[50,60], BP3:[41,93]
};
const earXY = {
  'Shen Men':[56,30], 'Fígado':[62,47], 'Subcórtex':[52,66], 'Ansiedade':[38,34],
  'Rim':[45,58], 'Estômago':[62,56], 'Baço':[55,52], 'Endócrino':[50,76],
  'Fome':[70,62], 'Coração':[48,48], 'Sono':[44,30]
};

// mapSvg fiel à linha 113 do HTML original, agora adaptado para usar imagens reais
function mapSvg(points, xy, type) {
  const unique = [...new Set(points)];
  const viewH = type === 'ear' ? 100 : 110;
  const bgImage = type === 'ear' ? '/ear-map-protocol.png' : '/body-map.png';
  
  const markers = unique.map(p => {
    if (!xy[p]) return null;
    return (
      <g key={p}>
        <circle cx={xy[p][0]} cy={xy[p][1]} r="3" fill="var(--gold)" stroke="var(--navy)"/>
        <text x={xy[p][0]+4} y={xy[p][1]+1} fontSize="4" fill="var(--navy)" fontWeight="bold" style={{textShadow: '0 0 2px white'}}>{p}</text>
      </g>
    );
  });
  return (
    <svg viewBox={`0 0 100 ${viewH}`} style={{ width:'100%', height:310 }}>
      <image href={bgImage} x="0" y="0" width="100" height={viewH} preserveAspectRatio="xMidYMid meet" />
      {markers}
    </svg>
  );
}

const pointInfo = {
  'E36':    { name:'E36 — Zusanli',       role:'Tonificação de Qi, suporte digestivo, vitalidade e regulação da Terra.', why:'Selecionado quando há fadiga, deficiência de Baço/Estômago, umidade ou necessidade de fortalecimento geral.' },
  'BP6':    { name:'BP6 — Sanyinjiao',    role:'Harmoniza Baço, Fígado e Rim; regula líquidos, Xue, ginecológico e sono.', why:'Útil em padrões mistos de Terra, Água e Madeira, especialmente com umidade, ciclo hormonal ou ansiedade.' },
  'VC12':   { name:'VC12 — Zhongwan',     role:'Harmoniza Estômago, fortalece Aquecedor Médio e regula náusea, refluxo e distensão.', why:'Entra quando a hipótese envolve digestão, Baço/Estômago ou Madeira invadindo Terra.' },
  'F3':     { name:'F3 — Taichong',       role:'Move Qi do Fígado, reduz estagnação, irritabilidade, tensão e cefaleia.', why:'Ponto central para padrões de Fígado, estresse, irritabilidade e repercussão emocional.' },
  'PC6':    { name:'PC6 — Neiguan',       role:'Regula Shen, tórax, náusea, ansiedade e eixo autonômico.', why:'Selecionado em ansiedade com repercussão digestiva ou torácica.' },
  'E40':    { name:'E40 — Fenglong',      role:'Transforma Fleuma/Umidade, regula muco e peso corporal/metabólico.', why:'Entra quando há umidade, fleuma, saburra espessa ou metabolismo lento.' },
  'BP9':    { name:'BP9 — Yinlingquan',   role:'Drena umidade e favorece metabolismo de líquidos.', why:'Indicado quando o padrão sugere retenção, edema, umidade-calor ou peso corporal.' },
  'IG11':   { name:'IG11 — Quchi',        role:'Limpa calor e auxilia padrões inflamatórios, pele e calor interno.', why:'Selecionado em calor, vermelhidão, saburra amarela ou sinais inflamatórios.' },
  'C7':     { name:'C7 — Shenmen',        role:'Acalma Shen, ansiedade, palpitações e sono.', why:'Entra quando o eixo dominante é insônia, agitação ou hiperexcitação.' },
  'Yintang':{ name:'Yintang',             role:'Acalma a mente, reduz ansiedade e tensão frontal.', why:'Recurso sintomático para agitação, sono leve e cefaleia frontal.' },
  'VG20':   { name:'VG20 — Baihui',       role:'Regula Yang, clareia mente e organiza eixo superior.', why:'Usado com cautela conforme objetivo: ancorar, regular ou clarear.' },
  'VB20':   { name:'VB20 — Fengchi',      role:'Libera região cervical/occipital, vento, cefaleia e tensão.', why:'Selecionado em cefaleia, tontura, tensão cervical e ascensão de Yang.' },
  'VB34':   { name:'VB34 — Yanglingquan', role:'Beneficia tendões, Vesícula Biliar e livre fluxo do Qi.', why:'Complementa padrões de Madeira com tensão muscular e rigidez.' },
  'R3':     { name:'R3 — Taixi',          role:'Tonifica Rim, ancora Yang e nutre base Yin/Yang.', why:'Selecionado quando há deficiência de base, lombalgia, medo, cansaço ou calor vazio.' },
  'IG4':    { name:'IG4 — Hegu',          role:'Move Qi, analgesia, face/cabeça e exterior.', why:'Complementa dor, cefaleia e estagnação; evitar em gestação sem indicação profissional.' },
  'TA5':    { name:'TA5 — Waiguan',       role:'Libera Shaoyang, regula lateralidade, tensão e sintomas externos.', why:'Útil em cefaleia lateral, tensão e padrões de Vesícula/Triplo Aquecedor.' },
  'VC6':    { name:'VC6 — Qihai',         role:'Tonifica Qi original e fortalece energia basal.', why:'Indicado em deficiência, fadiga e fraqueza constitucional.' },
  'BP3':    { name:'BP3 — Taibai',        role:'Tonifica Baço e regula umidade.', why:'Complementa deficiência de Qi do Baço e digestão lenta.' },
  'Shen Men':  { name:'Aurículo — Shen Men',    role:'Modulação central, analgesia, ansiedade e regulação geral.', why:'Ponto regulador de base em protocolos auriculares.' },
  'Subcórtex': { name:'Aurículo — Subcórtex',   role:'Regulação neurovegetativa, dor, sono e equilíbrio cortical-subcortical.', why:'Fortalece a dimensão neurofuncional do protocolo.' },
  'Fígado':    { name:'Aurículo — Fígado',       role:'Livre fluxo do Qi, emoções, tensão e detoxificação energética.', why:'Selecionado em Madeira, irritabilidade, estagnação e tensão.' },
  'Baço':      { name:'Aurículo — Baço',         role:'Terra, digestão, umidade, energia e ruminação.', why:'Selecionado em deficiência de Baço, umidade e fadiga.' },
  'Estômago':  { name:'Aurículo — Estômago',     role:'Digestão, fome, refluxo e epigástrio.', why:'Complementa queixas digestivas e regulação alimentar.' },
  'Rim':       { name:'Aurículo — Rim',           role:'Base energética, medo, lombar, água e essência.', why:'Complementa deficiência de base, cansaço, medo e lombalgia.' },
  'Endócrino': { name:'Aurículo — Endócrino',    role:'Regulação hormonal e metabólica.', why:'Selecionado em padrões hormonais, metabólicos e de eixo regulatório.' },
  'Ansiedade': { name:'Aurículo — Ansiedade',    role:'Ponto sintomático para ansiedade e agitação.', why:'Usado quando a queixa emocional é predominante.' },
  'Sono':      { name:'Aurículo — Sono',          role:'Regulação do sono e relaxamento.', why:'Complementa protocolos de insônia e hiperalerta.' },
  'Coração':   { name:'Aurículo — Coração',       role:'Shen, ansiedade, palpitação e sono.', why:'Indicado em agitação do Shen, palpitações e euforia/ansiedade.' },
  'Fome':      { name:'Aurículo — Fome',          role:'Regulação de apetite e compulsão alimentar.', why:'Entra quando há fome excessiva, desejo por doce ou compulsão.' }
};

function suggestVentosa(dx) {
  if (/Fígado|Yang/.test(dx))  return 'Região cervical, trapézio e paravertebral alta, preferindo técnica deslizante ou fixa suave se houver tensão/estagnação.';
  if (/Umidade/.test(dx))       return 'Dorsal médio e áreas de retenção, com técnica deslizante para mobilizar circulação e metabolismo de líquidos.';
  if (/Baço/.test(dx))          return 'Dorsal médio, região paravertebral de Baço/Estômago e abdome com cautela, priorizando estímulo moderado.';
  if (/Shen|Calor/.test(dx))   return 'Usar com parcimônia; priorizar relaxamento dorsal suave e evitar excesso de estímulo.';
  return 'Selecionar região conforme dor, tensão miofascial e diagnóstico energético.';
}

function chips(arr) {
  if (!arr || !arr.length) return <span className="small">Aguardando dados</span>;
  return arr.map((p, i) => <span key={i} className="point-chip">{p}</span>);
}

const TECNICOS = ['Sistêmicos','Auriculoterapia','Laser','Moxa','Ventosa','Stiper','Eletro'];

export function Protocolo({ analysis }) {
  const { protocol, main } = analysis;
  const body   = protocol.body   || [];
  const ear    = protocol.ear    || [];
  const laser  = protocol.laser  || [];
  const moxa   = protocol.moxa   || [];
  const eletro = protocol.eletro || [];
  const stiper = body.slice(0,4).map(p => `${p} — considerar Stiper conforme tolerância e objetivo`);
  const ventosa = suggestVentosa(main);

  const [filtros, setFiltros] = useState([]);
  const [pointInfoBox, setPointInfoBox] = useState(null);

  function toggleFiltro(t) {
    setFiltros(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }
  function enabled(t) { return filtros.length === 0 || filtros.includes(t); }
  function handleClick(p) {
    setPointInfoBox(pointInfo[p] || { name:p, role:'Ponto selecionado.', why:'Justificativa dependente da hipótese energética.' });
  }

  return (
    <Panel title="Protocolo terapêutico avançado — V10">
      <div className="protocol-hero">
        <h2>{main}</h2>
        <p><b>Princípio terapêutico:</b> {protocol.goal}</p>
        <p><b>Modelo:</b> hipótese energética → objetivo → técnica → pontos → parâmetro → justificativa clínica.</p>
      </div>

      <div className="box">
        <b>Filtros terapêuticos:</b>
        <div className="filterbar">
          {TECNICOS.map(t => (
            <button key={t} className={`tag${filtros.includes(t)?' active':''}`} onClick={() => toggleFiltro(t)}>
              {filtros.includes(t) ? '✓ ' : ''}{t}
            </button>
          ))}
        </div>
        <p className="small">Se nenhum filtro estiver marcado, o sistema mostra todas as técnicas disponíveis.</p>
      </div>

      <div className="protocol-layout">
        <div>
          {enabled('Sistêmicos') && (
            <div className="map-card">
              <h3>Mapa corporal sistêmico</h3>
              <div className="map-stage" onClick={e => {
                const title = e.target.closest('circle')?.nextElementSibling?.textContent;
                if (title) handleClick(title);
              }}>
                {mapSvg(body, bodyXY, 'body')}
              </div>
              <div className="legend">
                <span><i className="dot" style={{background:'var(--gold)'}}></i>Pontos selecionados</span>
              </div>
            </div>
          )}
          {enabled('Auriculoterapia') && (
            <div className="map-card">
              <h3>Mapa auricular</h3>
              <div className="map-stage">
                {mapSvg(ear, earXY, 'ear')}
              </div>
              <div className="legend">
                <span><i className="dot" style={{background:'var(--gold)'}}></i>Pontos auriculares</span>
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
              </>
            ) : (
              <p>Clique em um marcador do corpo ou da orelha para visualizar localização funcional, indicação e justificativa clínica.</p>
            )}
          </div>

          <div className="tech-card">
            <h4>Resumo dos pontos</h4>
            <table className="protocol-table">
              <tbody>
                <tr><td>Corpo</td><td>{chips(body)}</td></tr>
                <tr><td>Aurículo</td><td>{chips(ear)}</td></tr>
              </tbody>
            </table>
          </div>

          {enabled('Laser') && (
            <div className="tech-card">
              <h4>Laser / Fotobiomodulação</h4>
              <p>{chips(laser)}</p>
              <div className="dose-grid">
                <div className="dose-box"><b>Modo</b><br/>Pontual ou varredura</div>
                <div className="dose-box"><b>Dose</b><br/>Definir por objetivo, área e equipamento</div>
                <div className="dose-box"><b>Alerta</b><br/>Respeitar janela terapêutica</div>
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

      <div className="box" style={{ marginTop:16 }}>
        <b>Leitura clínica:</b> o protocolo não deve ser aplicado como receita fixa. A seleção final depende de idade, queixa, pulso, língua, tolerância, medicamentos, sinais de alerta e objetivo da sessão.
      </div>
    </Panel>
  );
}
