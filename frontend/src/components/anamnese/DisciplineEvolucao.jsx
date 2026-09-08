import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { hasRiskSelected } from '../../data/anamneseKit';
import { insertPatientEvolution } from '../../services/patientEvolutionService';

// ============================================================
// Evolução genérica de disciplina. Mesma mecânica da Psicologia e da
// Acupuntura (formulário de novo registro + histórico editável), com os
// campos e indicadores vindos da configuração.
//
// Indicadores são NUMÉRICOS e existem para comparar sessões. O sistema
// guarda e alinha; não calcula tendência, não interpreta melhora e não
// decide alta — isso é leitura clínica da profissional.
//
// Registros novos (com ou sem agendamento vinculado) vão para
// patient_evolutions via insertPatientEvolution — a data do atendimento
// vem do agendamento e é travada no servidor (ver
// supabase/migrations/20260903_patient_evolutions.sql). O array legado
// (session.evolucoes) continua existindo só para exibição/edição do que
// já foi escrito antes desta migração; nunca recebe registro novo.
// ============================================================

function createEmptyForm(config) {
  const form = {};
  for (const indicator of config.evolution.indicators) form[indicator.id] = '';
  for (const field of config.evolution.fields) form[field.id] = '';
  return form;
}

function nowForDateTimeLocal() {
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function formatDateTimeBR(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

const ATTENDANCE_LABELS = {
  no_show: 'Paciente faltou',
  excused: 'Falta justificada',
};

export function DisciplineEvolucao({
  config,
  session,
  evolucoes,
  patientId,
  discipline,
  activeAppointment,
  onEvolucoesChange,
  onEvolutionSaved,
}) {
  const sessions = Array.isArray(evolucoes) ? evolucoes : (Array.isArray(session.evolucoes) ? session.evolucoes : []);
  const riskInAnamnese = hasRiskSelected(config, session.selectedMap);
  const [form, setForm] = useState(() => createEmptyForm(config));
  const [faltaObs, setFaltaObs] = useState('');
  const [avulsoDateTime, setAvulsoDateTime] = useState(() => nowForDateTimeLocal());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const isLinked = Boolean(activeAppointment);
  const isFalta = isLinked && activeAppointment.attendanceStatus !== 'attended';

  function setF(key, val) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  async function addSession() {
    setSaveError(null);

    if (!patientId) {
      setSaveError('Selecione um paciente antes de registrar a evolução.');
      return;
    }

    if (!isFalta) {
      const hasContent = config.evolution.fields.some(field => String(form[field.id] || '').trim());
      if (!hasContent) {
        setSaveError('Preencha ao menos um campo antes de registrar a sessão.');
        return;
      }
    }

    let atendimentoEm = null;
    if (!isLinked) {
      if (!avulsoDateTime) {
        setSaveError('Informe a data e hora do atendimento.');
        return;
      }
      const parsed = new Date(avulsoDateTime);
      if (Number.isNaN(parsed.getTime())) {
        setSaveError('Data do atendimento inválida.');
        return;
      }
      if (parsed.getTime() > Date.now()) {
        setSaveError('Data do atendimento não pode ser no futuro.');
        return;
      }
      atendimentoEm = parsed.toISOString();
    }

    let conteudo;
    if (isFalta) {
      conteudo = { tipo: 'falta', observacao: faltaObs.trim() };
    } else {
      conteudo = {};
      for (const indicator of config.evolution.indicators) conteudo[indicator.id] = form[indicator.id];
      for (const field of config.evolution.fields) conteudo[field.id] = form[field.id];
    }

    setSaving(true);
    try {
      await insertPatientEvolution({
        patientId,
        discipline,
        data: conteudo,
        appointmentId: activeAppointment?.id || null,
        atendimentoEm,
      });
      setForm(createEmptyForm(config));
      setFaltaObs('');
      setAvulsoDateTime(nowForDateTimeLocal());
      onEvolutionSaved?.();
    } catch (err) {
      setSaveError(err.message || 'Não foi possível salvar a evolução.');
    } finally {
      setSaving(false);
    }
  }

  // Sessões do array legado (session.evolucoes) continuam editáveis
  // inline; registros novos (source: 'record') são travados — a data e
  // a auditoria deles vivem no servidor. O índice bate direto com
  // session.evolucoes porque mergeEvolutionHistory sempre põe o legado
  // primeiro, na mesma ordem (ver utils/evolutionHistory).
  function removeSession(index) {
    if (!window.confirm('Excluir este registro de sessão? A ação não pode ser desfeita.')) return;
    const legacy = Array.isArray(session.evolucoes) ? session.evolucoes : [];
    onEvolucoesChange(
      legacy.filter((_, i) => i !== index).map((s, i) => ({ ...s, sessao: i + 1 })),
    );
  }

  function updateSession(index, key, value) {
    const legacy = Array.isArray(session.evolucoes) ? session.evolucoes : [];
    onEvolucoesChange(legacy.map((s, i) => (i === index ? { ...s, [key]: value } : s)));
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

        {isLinked ? (
          <div className={`evo-appointment-banner${isFalta ? ' evo-appointment-banner--falta' : ''}`}>
            <b>{isFalta ? ATTENDANCE_LABELS[activeAppointment.attendanceStatus] : 'Atendimento'}</b>
            <span>{formatDateTimeBR(activeAppointment.startsAt)}</span>
            <p className="small">
              {isFalta
                ? 'A data vem do agendamento e não pode ser alterada — mesmo faltas contam na evolução do paciente.'
                : 'A data/hora vem do agendamento e é gravada assim, mesmo que você escreva a evolução depois.'}
            </p>
          </div>
        ) : (
          <label className="evo-date-field">
            Data e hora do atendimento (avulso)
            <input
              type="datetime-local"
              value={avulsoDateTime}
              max={nowForDateTimeLocal()}
              onChange={e => setAvulsoDateTime(e.target.value)}
            />
          </label>
        )}

        {isFalta ? (
          <label style={{ display: 'block', marginTop: 8 }}>
            Observação (opcional)
            <textarea
              value={faltaObs}
              onChange={e => setFaltaObs(e.target.value)}
              placeholder="Ex.: 3ª falta consecutiva, considerar contato de reengajamento."
            />
          </label>
        ) : (
          <>
            <div className="form-grid two">
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
          </>
        )}

        {saveError && <div className="alert" style={{ marginTop: 10 }}>{saveError}</div>}
        <button className="tag active" onClick={addSession} disabled={saving} style={{ marginTop: 10 }}>
          {saving ? 'Salvando…' : 'Adicionar sessão'}
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
                  {s.attendanceStatus && s.attendanceStatus !== 'attended' && (
                    <><br /><span className="small">{ATTENDANCE_LABELS[s.attendanceStatus] || s.attendanceStatus}</span></>
                  )}
                </td>
                {s.tipo === 'falta' ? (
                  <td colSpan={3}>{s.observacao || 'Sem observações.'}</td>
                ) : (
                  <>
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
                          disabled={!s.editable}
                          onChange={e => s.editable && updateSession(i, primeiro.id, e.target.value)}
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
                  </>
                )}
                <td>
                  {s.editable ? (
                    <button className="tag" onClick={() => removeSession(i)}>Excluir</button>
                  ) : (
                    <span className="small">registro travado</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
