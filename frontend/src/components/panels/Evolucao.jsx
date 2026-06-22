import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { summarizeEvolution, REPORT_AI_DISCLAIMER } from '../../services/reportAiService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import { summarizeRehabilitation, formatOptionalMetric } from '../../services/rehabilitationService';

// ── Helpers ───────────────────────────────────────────────────────────────────
function toNum(v) {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(x) ? null : x;
}

function createEmptyForm() {
  return {
    data: '', dor: '', sono: '', ansiedade: '',
    energia: '', intestino: '', humor: '',
    protocolo: '', intercorrencia: '', obs: '',
    pontosUsados: [], pontoLivre: '', tecnica: '', resposta: ''
  };
}

// Pontos candidatos ao registro da sessão: o que a profissional selecionou no
// Protocolo + o restante da sugestão, sem duplicar códigos.
function buildSessionPointPool(sessaoSugestao) {
  const pool = [];
  const seen = new Set();
  const selectedCodes = new Set((sessaoSugestao.selecionados || []).map(p => p.code));

  const push = (entry, origem) => {
    if (!entry?.code || seen.has(entry.code)) return;
    seen.add(entry.code);
    pool.push({
      code: entry.code,
      label: entry.label,
      origem: entry.origem || origem,
      selecionadoNoProtocolo: selectedCodes.has(entry.code),
    });
  };

  (sessaoSugestao.selecionados || []).forEach(entry => push(entry, entry.origem));
  (sessaoSugestao.sugeridos?.sistemicos || []).forEach(entry => push(entry, 'sistemico'));
  (sessaoSugestao.sugeridos?.auriculares || []).forEach(entry => push(entry, 'auricular'));

  return pool;
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
  const rehab = summarizeRehabilitation(state.reabilitacao);
  const rehabSingle = rehab?.total === 1;

  const [form, setForm] = useState(() => createEmptyForm());
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiSummary, setAiSummary] = useState(null);

  async function handleSummarize() {
    setAiError(null);
    setAiLoading(true);
    try {
      const res = await summarizeEvolution(sessions, { patientName: state.nome });
      setAiSummary(res);
    } catch (err) {
      setAiError(err.message || 'Falha ao resumir a evolução.');
    } finally {
      setAiLoading(false);
    }
  }

  function setSessions(updater) {
    const next = typeof updater === 'function' ? updater(sessions) : updater;
    onUpdate('evolucoes', next);
  }

  function setF(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  const sessaoSugestao = state.sessaoSugestao || {};
  const pointPool = buildSessionPointPool(sessaoSugestao);
  const usedCodes = new Set(form.pontosUsados.map(p => p.code));
  // Pontos digitados livremente também entram na lista (e já marcados)
  const customPoints = form.pontosUsados.filter(p => p.origem === 'livre');

  function togglePontoUsado(point) {
    setForm(prev => {
      const exists = prev.pontosUsados.some(p => p.code === point.code);
      return {
        ...prev,
        pontosUsados: exists
          ? prev.pontosUsados.filter(p => p.code !== point.code)
          : [...prev.pontosUsados, { code: point.code, label: point.label, origem: point.origem }],
      };
    });
  }

  function applyProtocolSelection() {
    const selecionados = (sessaoSugestao.selecionados || [])
      .map(p => ({ code: p.code, label: p.label, origem: p.origem }));
    setForm(prev => {
      const merged = [...prev.pontosUsados];
      selecionados.forEach(p => {
        if (!merged.some(existing => existing.code === p.code)) merged.push(p);
      });
      return { ...prev, pontosUsados: merged };
    });
  }

  // Ponto fora da sugestão: registra o que a profissional realmente considerou
  // certo — insumo para o aprendizado "sugerido vs usado".
  function addPontoLivre() {
    const label = form.pontoLivre.trim();
    if (!label) return;
    const code = `livre:${label.toLowerCase().replace(/\s+/g, '-')}`;
    setForm(prev => {
      if (prev.pontosUsados.some(p => p.code === code)) return { ...prev, pontoLivre: '' };
      return {
        ...prev,
        pontoLivre: '',
        pontosUsados: [...prev.pontosUsados, { code, label, origem: 'livre' }],
      };
    });
  }

  function addSession() {
    const newSess = {
      sessao: sessions.length + 1,
      data:   form.data || hoje,
      dor: form.dor, sono: form.sono, ansiedade: form.ansiedade,
      energia: form.energia, intestino: form.intestino, humor: form.humor,
      protocolo: form.protocolo, intercorrencia: form.intercorrencia,
      obs: form.obs,
      // Snapshot sugerido vs usado: base do aprendizado clínico longitudinal
      pontosUtilizados: form.pontosUsados,
      pontosSugeridos: sessaoSugestao.sugeridos || null,
      tecnica: form.tecnica,
      resposta: form.resposta,
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
          <div style={{ marginTop:14 }}>
            <div className="evo-points-header">
              <b>Pontos trabalhados na sessão</b>
              {(sessaoSugestao.selecionados || []).length > 0 && (
                <button type="button" className="tag" onClick={applyProtocolSelection}>
                  Usar seleção do Protocolo
                </button>
              )}
            </div>
            {pointPool.length === 0 && customPoints.length === 0 ? (
              <p className="small">Nenhuma sugestão registrada no Protocolo ainda. Adicione pontos manualmente abaixo.</p>
            ) : (
              <div className="evo-point-list">
                {[...pointPool, ...customPoints].map(point => (
                  <label key={point.code} className="evo-point-row">
                    <span className="suggestion-check">
                      <input
                        type="checkbox"
                        checked={usedCodes.has(point.code)}
                        onChange={() => togglePontoUsado(point)}
                      />
                      <span className="suggestion-checkmark" aria-hidden="true" />
                    </span>
                    <span className="evo-point-label">
                      {point.label}
                      {point.selecionadoNoProtocolo && <small> • selecionado no Protocolo</small>}
                      {point.origem === 'livre' && <small> • adicionado manualmente</small>}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <div className="evo-point-add">
              <input
                value={form.pontoLivre}
                onChange={e => setF('pontoLivre', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPontoLivre(); } }}
                placeholder="Usou um ponto fora da sugestão? Digite aqui (ex.: IG4, C7, Shen Men)"
              />
              <button type="button" className="tag" onClick={addPontoLivre}>Adicionar</button>
            </div>
          </div>

          <div className="form-grid two" style={{ marginTop:10 }}>
            <label>
              Técnica usada
              <input value={form.tecnica} onChange={e => setF('tecnica', e.target.value)} placeholder="Agulha, laser, moxa, ventosa..." />
            </label>
            <label>
              Resposta do paciente
              <input value={form.resposta} onChange={e => setF('resposta', e.target.value)} placeholder="Relaxou, dor reduziu, tonturas..." />
            </label>
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

      {/* ── Reavaliação funcional (somente leitura; edita-se no painel Reabilitação) ── */}
      {rehab && (
        <div className="box" style={{ borderColor: 'var(--gold)' }}>
          <h3 style={{ color:'var(--gold)', fontFamily:'Georgia,serif', marginTop: 0 }}>Reabilitação funcional (reavaliação)</h3>
          <p className="small">
            {rehab.total} avaliação(ões) {rehabSingle ? 'registrada' : `entre ${rehab.primeira.data} e ${rehab.ultima.data}`}.{' '}
            Registre ou edite no painel <b>Reabilitação</b>. O sistema apenas exibe as medidas — sem interpretação.
          </p>
          {rehab.metricas.length > 0 && (
            <div className="metric-grid">
              {rehab.metricas.map(m => (
                <div className="metric-card" key={m.field}>
                  <h4>{m.label}</h4>
                  {rehabSingle ? (
                    <p><b>{formatOptionalMetric(m.ultimo, m.suffix)}</b></p>
                  ) : (
                    <>
                      <p><b>{formatOptionalMetric(m.primeiro, m.suffix)}</b> → <b>{formatOptionalMetric(m.ultimo, m.suffix)}</b></p>
                      {m.delta !== null && <p className="small">Δ {m.delta > 0 ? '+' : ''}{m.delta}{m.suffix}</p>}
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {rehab.objetivoFuncional && <p className="small">Objetivo funcional: {rehab.objetivoFuncional}</p>}
        </div>
      )}

      {/* ── Resumo da evolução por IA ── */}
      <div className="box" style={{ borderColor: 'var(--gold)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <b>Resumo da evolução (IA)</b>
            <p className="small" style={{ margin: '4px 0 0' }}>{REPORT_AI_DISCLAIMER}</p>
          </div>
          <button
            type="button"
            className="ai-analyze-btn"
            style={{ margin: 0, whiteSpace: 'nowrap' }}
            disabled={aiLoading || sessions.length < 1}
            onClick={handleSummarize}
          >
            {aiLoading ? 'Resumindo…' : aiSummary ? 'Resumir novamente' : '✦ Resumir evolução com IA'}
          </button>
        </div>
        {sessions.length < 1 && <p className="small" style={{ marginTop: 6 }}>Registre ao menos uma sessão para habilitar.</p>}
        {aiError && <div className="alert" style={{ marginTop: 10 }}>{aiError}</div>}
        {aiSummary && (
          <div style={{ marginTop: 10 }}>
            {aiSummary.warning && <div className="alert" style={{ marginBottom: 8 }}>{aiSummary.warning}</div>}
            {aiSummary.paragraphs.map((p, i) => (
              <p key={i} style={{ margin: '0 0 8px', lineHeight: 1.6 }}>{p}</p>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
              <button
                type="button"
                className="tag"
                onClick={() => navigator.clipboard?.writeText(aiSummary.paragraphs.join('\n\n')).then(() => alert('Resumo copiado!'))}
              >
                Copiar resumo
              </button>
              <span className="small">Modelo: {aiSummary.modelVersion}{aiSummary.modelVersion?.startsWith('mock') ? ' (simulado)' : ''}.</span>
              <AiCorrectionButton
                surface={AI_SURFACES.NARRATIVE}
                aiOutput={{ paragraphs: aiSummary.paragraphs }}
                contextSnapshot={{ kind: 'evolution', sessions: sessions.length }}
                modelVersion={aiSummary.modelVersion}
                patientName={state.nome}
                label="✎ Corrigir o resumo"
              />
            </div>
          </div>
        )}
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
                  {Array.isArray(s.pontosUtilizados) && s.pontosUtilizados.length > 0 && (
                    <span className="small">
                      Pontos: {s.pontosUtilizados.map(p => String(p.label || '').split(' — ')[0]).join(', ')}<br />
                    </span>
                  )}
                  {s.tecnica && <span className="small">Técnica: {s.tecnica}<br /></span>}
                  <span className="small">{s.protocolo || 'Protocolo não descrito'}</span>
                </td>
                <td>
                  {s.intercorrencia || '—'}<br />
                  {s.resposta && <span className="small">Resposta: {s.resposta}<br /></span>}
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
