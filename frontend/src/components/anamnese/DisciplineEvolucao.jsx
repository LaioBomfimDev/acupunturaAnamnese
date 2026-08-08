import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { hasRiskSelected } from '../../data/anamneseKit';

// ============================================================
// Evolução genérica de disciplina. Mesma mecânica da Psicologia e da
// Acupuntura (formulário de novo registro + histórico editável), com os
// campos e indicadores vindos da configuração.
//
// Indicadores são NUMÉRICOS e existem para comparar sessões. O sistema
// guarda e alinha; não calcula tendência, não interpreta melhora e não
// decide alta — isso é leitura clínica da profissional.
//
// Persiste em session.evolucoes (mesmo registro da anamnese); o
// auto-save do shell cobre.
// ============================================================

function createEmptyForm(config) {
  const form = { data: '' };
  for (const indicator of config.evolution.indicators) form[indicator.id] = '';
  for (const field of config.evolution.fields) form[field.id] = '';
  return form;
}

export function DisciplineEvolucao({ config, session, onEvolucoesChange }) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const sessions = Array.isArray(session.evolucoes) ? session.evolucoes : [];
  const riskInAnamnese = hasRiskSelected(config, session.selectedMap);
  const [form, setForm] = useState(() => createEmptyForm(config));

  function setF(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function addSession() {
    // Não grava sessão vazia: exige ao menos um campo de texto preenchido.
    const hasContent = config.evolution.fields
      .some(field => String(form[field.id] || '').trim());
    if (!hasContent) return;

    const record = { sessao: sessions.length + 1, data: form.data.trim() || hoje };
    for (const indicator of config.evolution.indicators) record[indicator.id] = form[indicator.id];
    for (const field of config.evolution.fields) record[field.id] = form[field.id];

    onEvolucoesChange([...sessions, record]);
    setForm(createEmptyForm(config));
  }

  function removeSession(index) {
    if (!window.confirm('Excluir este registro de sessão? A ação não pode ser desfeita.')) return;
    onEvolucoesChange(
      sessions.filter((_, i) => i !== index).map((s, i) => ({ ...s, sessao: i + 1 })),
    );
  }

  function updateSession(index, key, value) {
    onEvolucoesChange(sessions.map((s, i) => (i === index ? { ...s, [key]: value } : s)));
  }

  const [primeiro, ...demais] = config.evolution.fields;

  return (
    <Panel title="Evolução — registro de sessões">
      <div className="box">
        <b>Objetivo:</b> {config.evolution.intro}
      </div>

      {riskInAnamnese && (
        <div className="alert psi-risk-reminder" style={{ marginTop: 12 }}>
          <b>⚠ Há sinais de risco marcados na anamnese.</b> Reavalie e registre a conduta desta
          sessão antes de seguir.
        </div>
      )}

      <div className="box">
        <h3 style={{ color: 'var(--gold)', fontFamily: 'Georgia,serif' }}>Novo registro de sessão</h3>
        <div className="form-grid two">
          <label>
            Data
            <input value={form.data} onChange={e => setF('data', e.target.value)} placeholder={hoje} />
          </label>
          {config.evolution.indicators.map(indicator => (
            <label key={indicator.id}>
              {indicator.label}
              <input
                inputMode="decimal"
                value={form[indicator.id]}
                onChange={e => setF(indicator.id, e.target.value)}
              />
            </label>
          ))}
        </div>

        {config.evolution.fields.map(field => (
          <label key={field.id} style={{ display: 'block', marginTop: 8 }}>
            {field.label}
            <textarea
              lang="pt-BR"
              spellCheck
              value={form[field.id]}
              onChange={e => setF(field.id, e.target.value)}
              placeholder={field.placeholder}
            />
          </label>
        ))}

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
              <th>Indicadores</th>
              <th>{primeiro?.label || 'Registro'}</th>
              <th>Demais registros</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.length === 0 ? (
              <tr><td colSpan={5}>Nenhuma evolução registrada ainda.</td></tr>
            ) : sessions.map((s, i) => (
              <tr key={s.id || i}>
                <td>
                  <b>{s.sessao}</b><br />
                  <span className="small">{s.data}</span>
                </td>
                <td>
                  {config.evolution.indicators
                    .filter(indicator => String(s[indicator.id] || '').trim())
                    .map(indicator => (
                      <span key={indicator.id} className="small" style={{ display: 'block' }}>
                        {indicator.label}: <b>{s[indicator.id]}</b>
                      </span>
                    ))}
                  {config.evolution.indicators.every(i2 => !String(s[i2.id] || '').trim()) && (
                    <span className="small">—</span>
                  )}
                </td>
                <td>
                  {primeiro && (
                    <textarea
                      className="mini-input"
                      value={s[primeiro.id] ?? ''}
                      onChange={e => updateSession(i, primeiro.id, e.target.value)}
                    />
                  )}
                </td>
                <td>
                  {demais
                    .filter(field => String(s[field.id] || '').trim())
                    .map(field => (
                      <span key={field.id} className="small" style={{ display: 'block' }}>
                        {field.label}: {s[field.id]}
                      </span>
                    ))}
                  {demais.every(field => !String(s[field.id] || '').trim()) && (
                    <span className="small">—</span>
                  )}
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
