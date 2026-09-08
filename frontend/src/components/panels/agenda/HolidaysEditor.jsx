import { useEffect, useMemo, useState } from 'react';
import {
  deleteHoliday,
  listHolidays,
  saveHoliday,
} from '../../../services/agendaScheduleService';

// ============================================================
// Feriados da clínica
//
// Cadastrar aqui não bloqueia nada — a agenda já sabe avisar e pedir
// confirmação dupla ao marcar em cima de um feriado (agendaExceptions).
// Esta tela só alimenta essa checagem: sem feriado cadastrado, não há
// aviso nenhum.
// ============================================================

function formatDay(day) {
  const [year, month, date] = String(day || '').split('-').map(Number);
  if (!year || !month || !date) return day || '';
  return new Date(year, month - 1, date).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'long', year: 'numeric',
  });
}

export function HolidaysEditor({ onBack }) {
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ day: '', name: '', isWorkingDay: false });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const list = await listHolidays({});
        if (!cancelled) { setHolidays(list); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Não foi possível carregar os feriados.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const sorted = useMemo(
    () => [...holidays].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0)),
    [holidays],
  );

  async function handleAdd(event) {
    event.preventDefault();
    setError('');
    setSaving(true);

    try {
      const created = await saveHoliday({
        day: form.day,
        name: form.name,
        isWorkingDay: form.isWorkingDay,
      });
      setHolidays(prev => [...prev, created]);
      setForm({ day: '', name: '', isWorkingDay: false });
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o feriado.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(holiday) {
    setError('');
    try {
      await deleteHoliday(holiday.id);
      setHolidays(prev => prev.filter(item => item.id !== holiday.id));
    } catch (err) {
      setError(err.message || 'Não foi possível remover o feriado.');
    }
  }

  return (
    <div className="agj">
      <header className="agj-head">
        <div>
          <h3 className="agj-title">Feriados</h3>
          <p className="agj-sub">Avisos na agenda, não um bloqueio</p>
        </div>
        <button type="button" className="ag-btn" onClick={onBack}>← Voltar à agenda</button>
      </header>

      <p className="agj-note">
        Um feriado cadastrado aqui aparece na agenda e avisa com confirmação
        dupla antes de marcar em cima dele — não impede o agendamento.
        Marque <b>&quot;clínica atende neste dia&quot;</b> quando o feriado
        não fechar a clínica (ex.: ponto facultativo que vocês trabalham).
      </p>

      {error && <div className="ag-alert" role="alert">{error}</div>}

      <ul className="agj-list">
        {loading ? (
          <li><span>Carregando…</span></li>
        ) : sorted.length === 0 ? (
          <li><span>Nenhum feriado cadastrado.</span></li>
        ) : (
          sorted.map(holiday => (
            <li key={holiday.id}>
              <span>
                {formatDay(holiday.day)} — {holiday.name}
                {holiday.is_working_day ? ' · clínica atende' : ''}
              </span>
              <button
                type="button"
                className="ag-chip-btn"
                onClick={() => handleDelete(holiday)}
              >
                Remover
              </button>
            </li>
          ))
        )}
      </ul>

      <form className="agj-form" onSubmit={handleAdd}>
        <p className="ag-form-title">Adicionar feriado</p>

        <div className="ag-row">
          <div className="ag-field">
            <label htmlFor="agh-day">Data</label>
            <input
              id="agh-day"
              className="ag-input"
              type="date"
              value={form.day}
              onChange={e => setForm(prev => ({ ...prev, day: e.target.value }))}
              required
            />
          </div>
          <div className="ag-field">
            <label htmlFor="agh-name">Nome</label>
            <input
              id="agh-name"
              className="ag-input"
              type="text"
              placeholder="Ex.: Independência"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
        </div>

        <label className="agj-check">
          <input
            type="checkbox"
            checked={form.isWorkingDay}
            onChange={e => setForm(prev => ({ ...prev, isWorkingDay: e.target.checked }))}
          />
          Clínica atende neste dia
        </label>

        <button type="submit" className="ag-btn ag-btn--primary" disabled={saving}>
          {saving ? 'Salvando…' : 'Adicionar feriado'}
        </button>
      </form>
    </div>
  );
}

export default HolidaysEditor;
