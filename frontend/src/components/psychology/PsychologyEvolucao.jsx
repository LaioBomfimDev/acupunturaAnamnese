import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { hasPsychologyRiskSelected } from '../../data/psychologyAnamnese';
import { insertPatientEvolution } from '../../services/patientEvolutionService';

// ============================================================
// Evolução de Psicologia. Reusa o layout da Evolução da Acup
// (formulário de novo registro + histórico), mas com conteúdo
// psicológico: temas trabalhados, intervenções registradas pela
// profissional, resposta percebida, risco reavaliado, acordos e
// próximos passos. Sem pontos/radar/diagnóstico automático.
//
// Registros novos (com ou sem agendamento vinculado) vão para
// patient_evolutions via insertPatientEvolution — a data do atendimento
// vem do agendamento e é travada no servidor (ver
// supabase/migrations/20260903_patient_evolutions.sql). session.evolucoes
// (legado) continua existindo só para exibição/edição do que já foi
// escrito antes desta migração.
// ============================================================

function createEmptyForm() {
  return {
    temas: '',
    intervencoes: '',
    resposta: '',
    riscoReavaliado: '',
    acordos: '',
    proximosPassos: '',
    obs: '',
  };
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

export function PsychologyEvolucao({ session, evolucoes, patientId, activeAppointment, onEvolucoesChange, onEvolutionSaved }) {
  const sessions = Array.isArray(evolucoes) ? evolucoes : (Array.isArray(session.evolucoes) ? session.evolucoes : []);
  const riskInAnamnese = hasPsychologyRiskSelected(session.selectedMap);

  const [form, setForm] = useState(createEmptyForm);
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

    if (!isFalta && !form.temas.trim() && !form.intervencoes.trim() && !form.obs.trim()) {
      setSaveError('Preencha ao menos um campo antes de registrar a sessão.');
      return;
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

    const conteudo = isFalta
      ? { tipo: 'falta', observacao: faltaObs.trim() }
      : {
        temas: form.temas,
        intervencoes: form.intervencoes,
        resposta: form.resposta,
        riscoReavaliado: form.riscoReavaliado,
        acordos: form.acordos,
        proximosPassos: form.proximosPassos,
        obs: form.obs,
      };

    setSaving(true);
    try {
      await insertPatientEvolution({
        patientId,
        discipline: 'psicologia',
        data: conteudo,
        appointmentId: activeAppointment?.id || null,
        atendimentoEm,
      });
      setForm(createEmptyForm());
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
  // inline; registros novos (source: 'record') são travados. O índice
  // bate direto com session.evolucoes porque mergeEvolutionHistory
  // sempre põe o legado primeiro, na mesma ordem.
  function removeSession(idx) {
    const legacy = Array.isArray(session.evolucoes) ? session.evolucoes : [];
    const next = legacy
      .filter((_, i) => i !== idx)
      .map((s, i) => ({ ...s, sessao: i + 1 }));
    onEvolucoesChange(next);
  }

  function updateSession(idx, key, val) {
    const legacy = Array.isArray(session.evolucoes) ? session.evolucoes : [];
    onEvolucoesChange(legacy.map((s, i) => (i === idx ? { ...s, [key]: val } : s)));
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
                      <textarea
                        className="mini-input"
                        value={s.temas ?? ''}
                        disabled={!s.editable}
                        onChange={e => s.editable && updateSession(i, 'temas', e.target.value)}
                      />
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
