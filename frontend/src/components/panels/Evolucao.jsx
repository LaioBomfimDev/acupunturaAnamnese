import { useState } from 'react';
import { Panel } from '../ui/Panel';

// ── Helpers ───────────────────────────────────────────────────────────────────
function toNum(v) {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(x) ? null : x;
}

function createEmptyForm() {
  return {
    data: '', dor: '', sono: '', ansiedade: '',
    energia: '', intestino: '', humor: '',
    protocolo: '', intercorrencia: '', obs: ''
  };
}

// ── Barra do radar integrativo ────────────────────────────────────────────────
function RadarLine({ label, value }) {
  const val = value ?? 0;
  const pct = Math.max(0, Math.min(100, (val / 10) * 100));
  return (
    <div className="radar-box">
      <b>{label}</b>
      <div className="radar-track">
        <div className="radar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span>{val || 0}</span>
    </div>
  );
}

// ── Comparação de tendência ───────────────────────────────────────────────────
function TrendCard({ label, arr, inverse = false }) {
  if (arr.length < 2) {
    return (
      <div className="metric-card">
        <h4>{label}</h4>
        <p className="small">Aguardando 2 registros.</p>
      </div>
    );
  }
  const first = arr[0], last = arr[arr.length - 1];
  const diff = last - first;
  const base = Math.abs(first) || 1;
  const pct = Math.round((diff / base) * 100);
  const good = inverse ? diff < 0 : diff > 0;
  const cls = diff === 0 ? 'trend-neutral' : good ? 'trend-up' : 'trend-down';
  const word = diff === 0 ? 'sem variação' : good ? 'melhora' : 'atenção';
  return (
    <div className="metric-card">
      <h4>{label}</h4>
      <p><b>{first}</b> → <b>{last}</b></p>
      <p className={cls}>{word} ({pct > 0 ? '+' : ''}{pct}%)</p>
    </div>
  );
}

// ── COMPONENTE PRINCIPAL ──────────────────────────────────────────────────────
export function Evolucao({ state, onUpdate, analysis }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const sessions = Array.isArray(state.evolucoes) ? state.evolucoes : [];

  const [form, setForm] = useState(() => createEmptyForm());

  function setSessions(updater) {
    const next = typeof updater === 'function' ? updater(sessions) : updater;
    onUpdate('evolucoes', next);
  }

  function setF(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function addSession() {
    const newSess = {
      sessao: sessions.length + 1,
      data:   form.data || hoje,
      dor: form.dor, sono: form.sono, ansiedade: form.ansiedade,
      energia: form.energia, intestino: form.intestino, humor: form.humor,
      protocolo: form.protocolo, intercorrencia: form.intercorrencia,
      obs: form.obs,
      dx: analysis.main
    };
    setSessions(prev => [...prev, newSess]);
    setForm(createEmptyForm());
  }

  function removeSession(idx) {
    setSessions(prev => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((s, i) => ({ ...s, sessao: i + 1 }));
    });
  }

  function updateSession(idx, key, val) {
    setSessions(prev => prev.map((s, i) => i === idx ? { ...s, [key]: val } : s));
  }

  // Valores para radar e trend
  const lastSess = sessions[sessions.length - 1] || {};
  const getArr = (key) => sessions.map(s => toNum(s[key])).filter(x => x !== null);

  const METRICS = [
    { label:'Dor',       key:'dor',       inverse:true },
    { label:'Sono',      key:'sono',      inverse:false },
    { label:'Ansiedade', key:'ansiedade', inverse:true },
    { label:'Energia',   key:'energia',   inverse:false },
    { label:'Intestino', key:'intestino', inverse:false },
    { label:'Humor',     key:'humor',     inverse:false },
  ];

  return (
    <Panel title="Evolução terapêutica longitudinal — V11">
      <div className="box">
        <b>Objetivo:</b> registrar cada atendimento, comparar respostas clínicas e permitir ajustes do protocolo. A lógica proposta considera ciclos de até 10 sessões, com reavaliação clínica, língua, pulso e indicadores funcionais.
      </div>

      {/* ── Formulário + Radar ── */}
      <div className="evo-layout">
        {/* Formulário novo registro */}
        <div className="box">
          <h3 style={{ color:'var(--gold)', fontFamily:'Georgia,serif' }}>Novo registro de sessão</h3>
          <div className="form-grid two">
            <label>Data<input value={form.data} onChange={e => setF('data', e.target.value)} placeholder={hoje} /></label>
            <label>Dor 0–10<input value={form.dor} onChange={e => setF('dor', e.target.value)} type="number" min="0" max="10" /></label>
            <label>Sono 0–10<input value={form.sono} onChange={e => setF('sono', e.target.value)} type="number" min="0" max="10" /></label>
            <label>Ansiedade 0–10<input value={form.ansiedade} onChange={e => setF('ansiedade', e.target.value)} type="number" min="0" max="10" /></label>
            <label>Energia 0–10<input value={form.energia} onChange={e => setF('energia', e.target.value)} type="number" min="0" max="10" /></label>
            <label>Intestino 0–10<input value={form.intestino} onChange={e => setF('intestino', e.target.value)} type="number" min="0" max="10" /></label>
            <label>Humor 0–10<input value={form.humor} onChange={e => setF('humor', e.target.value)} type="number" min="0" max="10" /></label>
          </div>
          <label style={{ marginTop:10, display:'block' }}>
            Protocolo aplicado na sessão
            <textarea value={form.protocolo} onChange={e => setF('protocolo', e.target.value)} />
          </label>
          <label style={{ display:'block' }}>
            Intercorrência / entrave / reação clínica
            <textarea value={form.intercorrencia} onChange={e => setF('intercorrencia', e.target.value)} />
          </label>
          <label style={{ display:'block' }}>
            Observações evolutivas
            <textarea value={form.obs} onChange={e => setF('obs', e.target.value)} />
          </label>
          <button className="tag active" onClick={addSession} style={{ marginTop:10 }}>
            Adicionar sessão
          </button>
        </div>

        {/* Radar integrativo */}
        <div className="box">
          <h3 style={{ color:'var(--gold)', fontFamily:'Georgia,serif' }}>Radar integrativo atual</h3>
          {METRICS.map(m => (
            <RadarLine
              key={m.key}
              label={m.label}
              value={toNum(lastSess[m.key])}
            />
          ))}
        </div>
      </div>

      {/* ── Comparação estatística ── */}
      <h3 style={{ color:'var(--gold)', fontFamily:'Georgia,serif' }}>Comparação estatística simples</h3>
      <div className="metric-grid">
        {METRICS.map(m => (
          <TrendCard key={m.key} label={m.label} arr={getArr(m.key)} inverse={m.inverse} />
        ))}
      </div>

      {/* ── Alerta de ciclo ── */}
      <div className="warning">
        <b>Reavaliação sugerida:</b>{' '}
        {sessions.length >= 10
          ? 'o paciente atingiu 10 sessões. Recomenda-se reavaliar língua, pulso, hipótese energética e protocolo.'
          : `faltam ${10 - sessions.length} sessão(ões) para a reavaliação de ciclo.`}
      </div>

      {/* ── Histórico das sessões ── */}
      <h3 style={{ color:'var(--gold)', fontFamily:'Georgia,serif' }}>Histórico das sessões</h3>
      <div style={{ overflowX:'auto' }}>
        <table className="evo-table">
          <thead>
            <tr>
              <th>Sessão</th>
              <th>Sintomas centrais</th>
              <th>Função</th>
              <th>Hipótese/protocolo</th>
              <th>Intercorrência</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={6}>Nenhuma evolução registrada ainda.</td></tr>
            ) : sessions.map((s, i) => (
              <tr key={i}>
                <td><b>{s.sessao}</b><br /><span className="small">{s.data}</span></td>
                <td>
                  Dor: <input className="mini-input" value={s.dor ?? ''} onChange={e => updateSession(i,'dor',e.target.value)} /><br />
                  Sono: <input className="mini-input" value={s.sono ?? ''} onChange={e => updateSession(i,'sono',e.target.value)} /><br />
                  Ans.: <input className="mini-input" value={s.ansiedade ?? ''} onChange={e => updateSession(i,'ansiedade',e.target.value)} />
                </td>
                <td>
                  Energia: <input className="mini-input" value={s.energia ?? ''} onChange={e => updateSession(i,'energia',e.target.value)} /><br />
                  Intestino: <input className="mini-input" value={s.intestino ?? ''} onChange={e => updateSession(i,'intestino',e.target.value)} /><br />
                  Humor: <input className="mini-input" value={s.humor ?? ''} onChange={e => updateSession(i,'humor',e.target.value)} />
                </td>
                <td>
                  <b>{s.dx}</b><br />
                  <span className="small">{s.protocolo || 'Protocolo não descrito'}</span>
                </td>
                <td>
                  {s.intercorrencia || '—'}<br />
                  <span className="small">{s.obs || 'Sem observações.'}</span>
                </td>
                <td>
                  <button className="tag" onClick={() => removeSession(i)}>Excluir</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
