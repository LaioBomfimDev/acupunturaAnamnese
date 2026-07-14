import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { hasPsychologyRiskSelected } from '../../data/psychologyAnamnese';

// ============================================================
// Evolução de Psicologia. Reusa o layout da Evolução da Acup
// (formulário de novo registro + histórico), mas com conteúdo
// psicológico: temas trabalhados, intervenções registradas pela
// profissional, resposta percebida, risco reavaliado, acordos e
// próximos passos. Sem pontos/radar/diagnóstico automático.
//
// Persiste em session.evolucoes (mesmo registro da anamnese) — o
// auto-save do shell cobre. A IA não interpreta a mudança clínica.
// ============================================================

function createEmptyForm() {
  return {
    data: '',
    temas: '',
    intervencoes: '',
    resposta: '',
    riscoReavaliado: '',
    acordos: '',
    proximosPassos: '',
    obs: '',
  };
}

export function PsychologyEvolucao({ session, onEvolucoesChange }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const sessions = Array.isArray(session.evolucoes) ? session.evolucoes : [];
  const riskInAnamnese = hasPsychologyRiskSelected(session.selectedMap);

  const [form, setForm] = useState(createEmptyForm);

  function setF(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function addSession() {
    // Exige ao menos um conteúdo para não gravar sessão vazia.
    if (!form.temas.trim() && !form.intervencoes.trim() && !form.obs.trim()) return;
    const record = {
      sessao: sessions.length + 1,
      data: form.data.trim() || hoje,
      temas: form.temas,
      intervencoes: form.intervencoes,
      resposta: form.resposta,
      riscoReavaliado: form.riscoReavaliado,
      acordos: form.acordos,
      proximosPassos: form.proximosPassos,
      obs: form.obs,
    };
    onEvolucoesChange([...sessions, record]);
    setForm(createEmptyForm());
  }

  function removeSession(idx) {
    const next = sessions
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, sessao: i + 1 }));
    onEvolucoesChange(next);
  }

  function updateSession(idx, key, val) {
    onEvolucoesChange(sessions.map((s, i) => (i === idx ? { ...s, [key]: val } : s)));
  }

  return (
    <Panel title="Evolução — registro de sessões">
      <div className="box">
        <b>Objetivo:</b> registrar cada atendimento — temas trabalhados, intervenções, resposta
        percebida, reavaliação de risco, acordos e próximos passos. O sistema guarda e organiza;
        a leitura clínica da evolução é sempre sua.
      </div>

      {riskInAnamnese && (
        <div className="alert psi-risk-reminder" style={{ marginTop: 12 }}>
          <b>⚠ Há sinais de risco marcados na anamnese.</b> Reavalie e registre a conduta desta sessão
          no campo próprio abaixo.
        </div>
      )}

      <div className="box">
        <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia,serif' }}>Novo registro de sessão</h3>
        <div className="form-grid two">
          <label>
            Data
            <input value={form.data} onChange={e => setF('data', e.target.value)} placeholder={hoje} />
          </label>
        </div>
        <label style={{ display: 'block', marginTop: 8 }}>
          Temas trabalhados na sessão
          <textarea value={form.temas} onChange={e => setF('temas', e.target.value)} placeholder="O que foi trazido e trabalhado…" />
        </label>
        <label style={{ display: 'block' }}>
          Intervenções registradas
          <textarea value={form.intervencoes} onChange={e => setF('intervencoes', e.target.value)} placeholder="Técnicas/abordagens que você conduziu…" />
        </label>
        <label style={{ display: 'block' }}>
          Resposta percebida
          <textarea value={form.resposta} onChange={e => setF('resposta', e.target.value)} placeholder="Como a pessoa respondeu ao longo da sessão…" />
        </label>
        <label style={{ display: 'block' }}>
          Risco reavaliado / conduta
          <textarea value={form.riscoReavaliado} onChange={e => setF('riscoReavaliado', e.target.value)} placeholder="Reavaliação de risco e conduta combinada, se aplicável…" />
        </label>
        <label style={{ display: 'block' }}>
          Acordos da sessão
          <textarea value={form.acordos} onChange={e => setF('acordos', e.target.value)} placeholder="Combinações, tarefas, encaminhamentos…" />
        </label>
        <label style={{ display: 'block' }}>
          Próximos passos
          <textarea value={form.proximosPassos} onChange={e => setF('proximosPassos', e.target.value)} placeholder="Tema para a próxima sessão…" />
        </label>
        <label style={{ display: 'block' }}>
          Observações
          <textarea value={form.obs} onChange={e => setF('obs', e.target.value)} />
        </label>
        <button className="tag active" onClick={addSession} style={{ marginTop: 10 }}>
          Adicionar sessão
        </button>
      </div>

      <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia,serif' }}>Histórico das sessões</h3>
      <div style={{ overflowX: 'auto' }}>
        <table className="evo-table">
          <thead>
            <tr>
              <th>Sessão</th>
              <th>Temas</th>
              <th>Intervenções / resposta</th>
              <th>Acordos / próximos passos</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={5}>Nenhuma evolução registrada ainda.</td></tr>
            ) : sessions.map((s, i) => (
              <tr key={i}>
                <td><b>{s.sessao}</b><br /><span className="small">{s.data}</span></td>
                <td>
                  <textarea className="mini-input" value={s.temas ?? ''} onChange={e => updateSession(i, 'temas', e.target.value)} />
                </td>
                <td>
                  <span className="small">{s.intervencoes || 'Sem intervenções registradas.'}</span><br />
                  {s.resposta && <span className="small">Resposta: {s.resposta}</span>}
                  {s.riscoReavaliado && <><br /><span className="small">Risco: {s.riscoReavaliado}</span></>}
                </td>
                <td>
                  <span className="small">{s.acordos || '—'}</span><br />
                  {s.proximosPassos && <span className="small">Próximo: {s.proximosPassos}</span>}
                  {s.obs && <><br /><span className="small">{s.obs}</span></>}
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
