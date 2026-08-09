import { useEffect, useMemo, useState } from 'react';
import {
  APPOINTMENT_STATUSES,
  MONTH_LABELS,
  WEEKDAY_LABELS,
  appointmentsByDay,
  birthdaysByDay,
  buildMonthGrid,
  getStatusLabel,
  toDayKey,
} from '../../utils/agenda';
import {
  createAppointment,
  listAppointments,
  updateAppointmentStatus,
} from '../../services/appointmentService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { DISCIPLINES } from '../../data/disciplines';
import '../../styles/agenda.css';

// Estados oferecidos como ação rápida no dia. 'scheduled' fica de fora
// porque é o estado inicial — voltar para ele é remarcar, não marcar.
const QUICK_STATUSES = APPOINTMENT_STATUSES.filter(item => item.id !== 'scheduled');

function firstOfMonth(year, month) {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function lastOfMonth(year, month) {
  return new Date(year, month, 0, 23, 59, 59, 999);
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** 'YYYY-MM-DD' + 'HH:MM' -> Date local, sem passar pelo parser de ISO. */
function combineLocal(dayKey, time) {
  const [year, month, day] = dayKey.split('-').map(Number);
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

export function Agenda({ profile }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  }));
  const [selectedKey, setSelectedKey] = useState(() => toDayKey(today));

  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const availableDisciplines = useMemo(() => {
    const allowed = Array.isArray(profile?.disciplines) ? profile.disciplines : [];
    const list = DISCIPLINES.filter(item => item.available && allowed.includes(item.id));
    return list.length ? list : DISCIPLINES.filter(item => item.available);
  }, [profile]);

  const [form, setForm] = useState(() => ({
    patientId: '',
    discipline: '',
    time: '09:00',
    durationMinutes: 60,
    note: '',
  }));

  // Derivado, não sincronizado por efeito: enquanto a pessoa não escolher,
  // vale a primeira disciplina que o perfil libera.
  const disciplineValue = form.discipline || availableDisciplines[0]?.id || '';

  // O flag de cancelamento evita que a resposta de um mês antigo
  // sobrescreva a do mês atual quando se troca de mês rápido.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [monthAppointments, clinicPatients] = await Promise.all([
          listAppointments({
            from: firstOfMonth(cursor.year, cursor.month).toISOString(),
            to: lastOfMonth(cursor.year, cursor.month).toISOString(),
          }),
          listClinicPatients(),
        ]);
        if (cancelled) return;
        setAppointments(monthAppointments);
        setPatients(clinicPatients);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Não foi possível carregar a agenda.');
        setAppointments([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [cursor.year, cursor.month]);

  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, { today }),
    [cursor.year, cursor.month, today],
  );
  const byDay = useMemo(() => appointmentsByDay(appointments), [appointments]);
  const birthdays = useMemo(
    () => birthdaysByDay(patients, cursor.year, cursor.month),
    [patients, cursor.year, cursor.month],
  );

  function patientName(id) {
    return patients.find(item => item.id === id)?.name || 'Paciente';
  }

  const dayAppointments = byDay.get(selectedKey) || [];
  const dayBirthdays = birthdays.get(selectedKey) || [];

  function shiftMonth(delta) {
    setLoading(true);
    setCursor(prev => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  }

  function goToday() {
    setLoading(true);
    setCursor({ year: today.getFullYear(), month: today.getMonth() + 1 });
    setSelectedKey(toDayKey(today));
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError('');

    const start = combineLocal(selectedKey, form.time);
    if (!start) {
      setError('Informe um horário válido.');
      return;
    }

    setSaving(true);
    try {
      const created = await createAppointment(
        {
          patientId: form.patientId,
          // Sem leitura de colegas no banco (profiles é "só o próprio
          // perfil"), a agenda é a de quem está logado.
          professionalId: profile?.id,
          discipline: disciplineValue,
          startsAt: start.toISOString(),
          endsAt: addMinutes(start, Number(form.durationMinutes) || 60).toISOString(),
          note: form.note,
        },
        { knownAppointments: appointments },
      );
      setAppointments(prev => [...prev, created]);
      setForm(prev => ({ ...prev, patientId: '', note: '' }));
    } catch (err) {
      setError(err.message || 'Não foi possível criar o agendamento.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(appointment, status) {
    setError('');
    try {
      const updated = await updateAppointmentStatus(appointment.id, status);
      setAppointments(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o agendamento.');
    }
  }

  const selectedDate = selectedKey ? combineLocal(selectedKey, '12:00') : null;

  return (
    <div className="ag">
      <section>
        <header className="ag-head">
          <h2 className="ag-month">
            {MONTH_LABELS[cursor.month - 1]} {cursor.year}
          </h2>
          <div className="ag-nav">
            <button type="button" className="ag-btn" onClick={() => shiftMonth(-1)} aria-label="Mês anterior">←</button>
            <button type="button" className="ag-btn" onClick={goToday}>Hoje</button>
            <button type="button" className="ag-btn" onClick={() => shiftMonth(1)} aria-label="Próximo mês">→</button>
          </div>
        </header>

        {error && <div className="ag-alert" role="alert">{error}</div>}

        <div className="ag-cal">
          <div className="ag-weekdays">
            {WEEKDAY_LABELS.map(label => (
              <div key={label} className="ag-weekday">{label}</div>
            ))}
          </div>

          {grid.map((week, index) => (
            <div className="ag-week" key={index}>
              {week.map(cell => {
                const count = (byDay.get(cell.key) || []).length;
                const cellBirthdays = birthdays.get(cell.key) || [];
                const classes = [
                  'ag-day',
                  cell.inMonth ? '' : 'ag-day--outside',
                  cell.isToday ? 'ag-day--today' : '',
                  cell.key === selectedKey ? 'ag-day--selected' : '',
                ].filter(Boolean).join(' ');

                return (
                  <button
                    type="button"
                    key={cell.key}
                    className={classes}
                    onClick={() => setSelectedKey(cell.key)}
                    aria-pressed={cell.key === selectedKey}
                  >
                    <span className="ag-day-num">{cell.day}</span>
                    <span className="ag-day-marks">
                      {count > 0 && (
                        <span className="ag-pill ag-pill--count">
                          {count} {count === 1 ? 'atend.' : 'atends.'}
                        </span>
                      )}
                      {cellBirthdays.length > 0 && (
                        <span className="ag-pill ag-pill--birthday" title={cellBirthdays.map(b => b.name).join(', ')}>
                          🎂 {cellBirthdays.length}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <aside className="ag-side">
        <div className="ag-side-head">
          <h3 className="ag-side-title">
            {selectedDate
              ? selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
              : 'Selecione um dia'}
          </h3>
          <p className="ag-side-sub">
            {loading ? 'Carregando…' : `${dayAppointments.length} atendimento(s)`}
          </p>
        </div>

        <div className="ag-side-body">
          {dayBirthdays.length > 0 && (
            <div className="ag-birthday-note">
              <span aria-hidden="true">🎂</span>
              <span>
                {dayBirthdays.map(item => `${item.name} (${item.age})`).join(', ')}
                {dayBirthdays.length === 1 ? ' faz aniversário hoje.' : ' fazem aniversário.'}
              </span>
            </div>
          )}

          {dayAppointments.length === 0 ? (
            <p className="ag-empty">Nenhum atendimento marcado neste dia.</p>
          ) : (
            <ul className="ag-list">
              {dayAppointments.map(item => (
                <li key={item.id} className={`ag-item ag-item--${item.status}`}>
                  <div className="ag-item-top">
                    <span className="ag-item-time">
                      {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
                    </span>
                    <span className="ag-item-status">{getStatusLabel(item.status)}</span>
                  </div>
                  <span className="ag-item-name">{patientName(item.patient_id)}</span>
                  <span className="ag-item-meta">{item.discipline}</span>
                  {item.note && <span className="ag-item-meta">{item.note}</span>}
                  <div className="ag-item-actions">
                    {QUICK_STATUSES.map(status => (
                      <button
                        key={status.id}
                        type="button"
                        className="ag-chip-btn"
                        aria-pressed={item.status === status.id}
                        onClick={() => handleStatus(item, status.id)}
                      >
                        {status.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <form className="ag-form" onSubmit={handleCreate}>
            <p className="ag-form-title">Novo agendamento</p>

            <div className="ag-field">
              <label htmlFor="ag-patient">Paciente</label>
              <select
                id="ag-patient"
                className="ag-select"
                value={form.patientId}
                onChange={e => setForm(prev => ({ ...prev, patientId: e.target.value }))}
                disabled={saving || loading}
                required
              >
                <option value="">Selecione…</option>
                {patients.map(patient => (
                  <option key={patient.id} value={patient.id}>{patient.name}</option>
                ))}
              </select>
            </div>

            <div className="ag-field">
              <label htmlFor="ag-discipline">Área</label>
              <select
                id="ag-discipline"
                className="ag-select"
                value={disciplineValue}
                onChange={e => setForm(prev => ({ ...prev, discipline: e.target.value }))}
                disabled={saving}
                required
              >
                {availableDisciplines.map(item => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </div>

            <div className="ag-row">
              <div className="ag-field">
                <label htmlFor="ag-time">Início</label>
                <input
                  id="ag-time"
                  className="ag-input"
                  type="time"
                  value={form.time}
                  onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))}
                  disabled={saving}
                  required
                />
              </div>
              <div className="ag-field">
                <label htmlFor="ag-duration">Duração</label>
                <select
                  id="ag-duration"
                  className="ag-select"
                  value={form.durationMinutes}
                  onChange={e => setForm(prev => ({ ...prev, durationMinutes: Number(e.target.value) }))}
                  disabled={saving}
                >
                  {[30, 45, 60, 90, 120].map(minutes => (
                    <option key={minutes} value={minutes}>{minutes} min</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ag-field">
              <label htmlFor="ag-note">Observação da recepção</label>
              <input
                id="ag-note"
                className="ag-input"
                type="text"
                placeholder="Sala, encaixe, retorno…"
                value={form.note}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                disabled={saving}
              />
            </div>

            <button type="submit" className="ag-btn ag-btn--primary" disabled={saving || loading}>
              {saving ? 'Salvando…' : 'Agendar'}
            </button>

            <p className="ag-note">
              Esta é a sua agenda. Marcar para outro profissional depende de
              liberar a leitura de colegas no banco — hoje cada perfil só
              enxerga a si mesmo.
            </p>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default Agenda;
