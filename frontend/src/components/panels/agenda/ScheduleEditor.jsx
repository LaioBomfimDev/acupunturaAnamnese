import { useEffect, useMemo, useState } from 'react';
import { WEEKDAY_LABELS } from '../../../utils/agenda';
import { minutesToLabel, timeToMinutes } from '../../../utils/agendaExceptions';
import {
  deleteProfessionalSchedule,
  listProfessionalSchedules,
  saveProfessionalSchedule,
} from '../../../services/agendaScheduleService';

// ============================================================
// Jornada de trabalho
//
// Define o que é DENTRO DO NORMAL — nunca o que é permitido. Marcar
// fora daqui continua possível, com aviso e confirmação dupla
// (docs/plano-agenda-gestao-clinica.md §6.1). O texto da tela precisa
// dizer isso, senão a pessoa cadastra com medo de se trancar.
//
// Sem jornada, a agenda não sabe o que é horário livre e a visão Dia
// cai numa grade genérica. É a primeira coisa a configurar.
// ============================================================

const WEEKDAY_FULL = [
  'Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira',
  'Quinta-feira', 'Sexta-feira', 'Sábado',
];

const DIAS_UTEIS = [1, 2, 3, 4, 5];

function faixaLabel(schedule) {
  const from = minutesToLabel(timeToMinutes(schedule.starts_at));
  const to = minutesToLabel(timeToMinutes(schedule.ends_at));
  const pausa = schedule.break_starts_at
    ? ` · intervalo ${minutesToLabel(timeToMinutes(schedule.break_starts_at))}–${minutesToLabel(timeToMinutes(schedule.break_ends_at))}`
    : '';
  return `${from}–${to}${pausa} · atendimentos de ${schedule.slot_minutes} min`;
}

export function ScheduleEditor({ professionalId, professionalLabel, onBack }) {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    weekdays: DIAS_UTEIS,
    startsAt: '08:00',
    endsAt: '18:00',
    breakStartsAt: '12:00',
    breakEndsAt: '13:00',
    hasBreak: true,
    slotMinutes: 60,
  });

  // `loading` já nasce true; ligar de novo aqui seria setState síncrono
  // dentro do efeito. O editor é montado do zero a cada abertura, então
  // não existe segunda carga para reativar.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await listProfessionalSchedules({ professionalId });
        if (!cancelled) { setSchedules(list); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Não foi possível carregar a jornada.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [professionalId]);

  const byWeekday = useMemo(() => {
    const map = new Map();
    for (const schedule of schedules) {
      const list = map.get(schedule.weekday) || [];
      list.push(schedule);
      map.set(schedule.weekday, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (timeToMinutes(a.starts_at) ?? 0) - (timeToMinutes(b.starts_at) ?? 0));
    }
    return map;
  }, [schedules]);

  function toggleWeekday(weekday) {
    setForm(prev => ({
      ...prev,
      weekdays: prev.weekdays.includes(weekday)
        ? prev.weekdays.filter(item => item !== weekday)
        : [...prev.weekdays, weekday].sort(),
    }));
  }

  async function handleAdd(event) {
    event.preventDefault();
    setError('');

    if (form.weekdays.length === 0) {
      setError('Escolha pelo menos um dia da semana.');
      return;
    }

    setSaving(true);
    const criadas = [];

    try {
      // Um por dia escolhido: cadastrar a semana inteira de uma vez é o
      // caso comum, e repetir sete vezes o mesmo formulário é o tipo de
      // atrito que faz ninguém configurar a jornada.
      for (const weekday of form.weekdays) {
        const created = await saveProfessionalSchedule({
          professionalId,
          weekday,
          startsAt: form.startsAt,
          endsAt: form.endsAt,
          breakStartsAt: form.hasBreak ? form.breakStartsAt : null,
          breakEndsAt: form.hasBreak ? form.breakEndsAt : null,
          slotMinutes: Number(form.slotMinutes) || 60,
        });
        criadas.push(created);
      }
      setSchedules(prev => [...prev, ...criadas]);
    } catch (err) {
      // Falha no meio deixa o que já entrou: mostrar o parcial é mais
      // honesto do que fingir que nada aconteceu.
      if (criadas.length) setSchedules(prev => [...prev, ...criadas]);
      setError(err.message || 'Não foi possível salvar a jornada.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(schedule) {
    setError('');
    try {
      await deleteProfessionalSchedule(schedule.id);
      setSchedules(prev => prev.filter(item => item.id !== schedule.id));
    } catch (err) {
      setError(err.message || 'Não foi possível remover a faixa.');
    }
  }

  return (
    <div className="agj">
      <header className="agj-head">
        <div>
          <h3 className="agj-title">Horários de atendimento</h3>
          <p className="agj-sub">{professionalLabel}</p>
        </div>
        <button type="button" className="ag-btn" onClick={onBack}>← Voltar à agenda</button>
      </header>

      <p className="agj-note">
        A jornada diz o que é <b>horário normal</b>, não o que é permitido.
        Marcar fora dela — sábado, feriado, intervalo, madrugada — continua
        possível: a agenda avisa e pede uma confirmação, e registra como
        exceção. Cadastre o comum; o resto o sistema deixa você decidir na
        hora.
      </p>

      {error && <div className="ag-alert" role="alert">{error}</div>}

      <div className="agj-grid">
        {WEEKDAY_FULL.map((label, weekday) => {
          const faixas = byWeekday.get(weekday) || [];
          return (
            <div key={label} className={`agj-day${faixas.length ? '' : ' agj-day--off'}`}>
              <span className="agj-day-name">{label}</span>
              {faixas.length === 0 ? (
                <span className="agj-day-empty">
                  {loading ? 'Carregando…' : 'Não atende'}
                </span>
              ) : (
                <ul className="agj-list">
                  {faixas.map(schedule => (
                    <li key={schedule.id}>
                      <span>{faixaLabel(schedule)}</span>
                      <button
                        type="button"
                        className="ag-chip-btn"
                        onClick={() => handleDelete(schedule)}
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      <form className="agj-form" onSubmit={handleAdd}>
        <p className="ag-form-title">Adicionar faixa de atendimento</p>

        <div className="ag-field">
          <span className="agj-label">Dias</span>
          <div className="agj-days">
            {WEEKDAY_LABELS.map((label, weekday) => (
              <button
                key={label}
                type="button"
                className="ag-chip-btn ag-chip-btn--lg"
                aria-pressed={form.weekdays.includes(weekday)}
                onClick={() => toggleWeekday(weekday)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="ag-row">
          <div className="ag-field">
            <label htmlFor="agj-start">Início</label>
            <input
              id="agj-start"
              className="ag-input"
              type="time"
              value={form.startsAt}
              onChange={e => setForm(prev => ({ ...prev, startsAt: e.target.value }))}
              required
            />
          </div>
          <div className="ag-field">
            <label htmlFor="agj-end">Fim</label>
            <input
              id="agj-end"
              className="ag-input"
              type="time"
              value={form.endsAt}
              onChange={e => setForm(prev => ({ ...prev, endsAt: e.target.value }))}
              required
            />
          </div>
        </div>

        <label className="agj-check">
          <input
            type="checkbox"
            checked={form.hasBreak}
            onChange={e => setForm(prev => ({ ...prev, hasBreak: e.target.checked }))}
          />
          Tem intervalo (almoço)
        </label>

        {form.hasBreak && (
          <div className="ag-row">
            <div className="ag-field">
              <label htmlFor="agj-break-start">Intervalo — início</label>
              <input
                id="agj-break-start"
                className="ag-input"
                type="time"
                value={form.breakStartsAt}
                onChange={e => setForm(prev => ({ ...prev, breakStartsAt: e.target.value }))}
              />
            </div>
            <div className="ag-field">
              <label htmlFor="agj-break-end">Intervalo — fim</label>
              <input
                id="agj-break-end"
                className="ag-input"
                type="time"
                value={form.breakEndsAt}
                onChange={e => setForm(prev => ({ ...prev, breakEndsAt: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="ag-field">
          <label htmlFor="agj-slot">Duração padrão do atendimento</label>
          <select
            id="agj-slot"
            className="ag-select"
            value={form.slotMinutes}
            onChange={e => setForm(prev => ({ ...prev, slotMinutes: Number(e.target.value) }))}
          >
            {[20, 30, 40, 45, 50, 60, 90, 120].map(minutes => (
              <option key={minutes} value={minutes}>{minutes} min</option>
            ))}
          </select>
        </div>

        <button type="submit" className="ag-btn ag-btn--primary" disabled={saving || loading}>
          {saving ? 'Salvando…' : `Adicionar em ${form.weekdays.length} dia(s)`}
        </button>
      </form>
    </div>
  );
}

export default ScheduleEditor;
