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
import { evaluateSlot } from '../../utils/agendaExceptions';
import {
  APPOINTMENT_TYPES,
  createAppointment,
  listAppointments,
  updateAppointmentStatus,
} from '../../services/appointmentService';
import { listClinicMembers, shortName, sortWithSelfFirst } from '../../services/clinicMembersService';
import { listHolidays, listProfessionalSchedules } from '../../services/agendaScheduleService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { DISCIPLINES } from '../../data/disciplines';
import '../../styles/agenda.css';

// Estados oferecidos como ação rápida no dia. 'scheduled' fica de fora
// porque é o estado inicial — voltar para ele é remarcar, não marcar.
const QUICK_STATUSES = APPOINTMENT_STATUSES.filter(item => item.id !== 'scheduled');

const ALL_PROFESSIONALS = 'all';

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
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  // Quem a agenda está mostrando. 'all' é a visão de recepção.
  const [agendaOf, setAgendaOf] = useState(() => profile?.id || ALL_PROFESSIONALS);

  const availableDisciplines = useMemo(() => {
    const allowed = Array.isArray(profile?.disciplines) ? profile.disciplines : [];
    const list = DISCIPLINES.filter(item => item.available && allowed.includes(item.id));
    return list.length ? list : DISCIPLINES.filter(item => item.available);
  }, [profile]);

  const [form, setForm] = useState(() => ({
    kind: 'appointment',
    patientId: '',
    discipline: '',
    professionalId: profile?.id || '',
    appointmentType: '',
    time: '09:00',
    durationMinutes: 60,
    note: '',
  }));

  // Confirmação dupla de horário atípico: enquanto isto tiver conteúdo,
  // o formulário não grava — mostra o que há de fora do normal e espera
  // um segundo "sim" explícito.
  const [pendingException, setPendingException] = useState(null);

  // Derivado, não sincronizado por efeito: enquanto a pessoa não escolher,
  // vale a primeira disciplina que o perfil libera.
  const disciplineValue = form.discipline || availableDisciplines[0]?.id || '';
  const formProfessionalId = form.professionalId
    || (agendaOf !== ALL_PROFESSIONALS ? agendaOf : profile?.id)
    || '';

  // O flag de cancelamento evita que a resposta de um mês antigo
  // sobrescreva a do mês atual quando se troca de mês rápido.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const from = firstOfMonth(cursor.year, cursor.month);
      const to = lastOfMonth(cursor.year, cursor.month);

      try {
        const [monthAppointments, clinicPatients] = await Promise.all([
          listAppointments({ from: from.toISOString(), to: to.toISOString() }),
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

      // Equipe, jornada e feriados são configuração: se faltarem, a
      // agenda continua funcionando sem os avisos de horário atípico.
      // Quebrar a tela inteira por causa de um aviso seria pior do que
      // não ter o aviso — mas o silêncio precisa aparecer em algum
      // lugar, então vira recado, não erro.
      try {
        const [team, jornada, feriados] = await Promise.all([
          listClinicMembers(),
          listProfessionalSchedules(),
          listHolidays({ from: toDayKey(from), to: toDayKey(to) }),
        ]);
        if (cancelled) return;
        setMembers(team);
        setSchedules(jornada);
        setHolidays(feriados);
        setNotice('');
      } catch (err) {
        if (cancelled) return;
        setMembers([]);
        setSchedules([]);
        setHolidays([]);
        setNotice(err.message || 'Equipe e jornada indisponíveis: os avisos de horário atípico ficam desligados.');
      }
    })();

    return () => { cancelled = true; };
  }, [cursor.year, cursor.month]);

  const grid = useMemo(
    () => buildMonthGrid(cursor.year, cursor.month, { today }),
    [cursor.year, cursor.month, today],
  );

  // A agenda exibida respeita o profissional escolhido; a de recepção
  // ('all') mostra a casa inteira.
  const visibleAppointments = useMemo(() => (
    agendaOf === ALL_PROFESSIONALS
      ? appointments
      : appointments.filter(item => item.professional_id === agendaOf)
  ), [appointments, agendaOf]);

  const byDay = useMemo(() => appointmentsByDay(visibleAppointments), [visibleAppointments]);
  const birthdays = useMemo(
    () => birthdaysByDay(patients, cursor.year, cursor.month),
    [patients, cursor.year, cursor.month],
  );

  const teamOptions = useMemo(
    () => sortWithSelfFirst(members, profile?.id),
    [members, profile?.id],
  );

  function patientName(id) {
    return patients.find(item => item.id === id)?.name || 'Paciente';
  }

  function professionalName(id) {
    if (id === profile?.id) return 'você';
    const found = members.find(item => item.id === id);
    return found ? shortName(found.full_name) : 'profissional';
  }

  const dayAppointments = byDay.get(selectedKey) || [];
  const dayBirthdays = birthdays.get(selectedKey) || [];

  // Avaliação do horário digitado: é o que decide se o "Agendar" grava
  // direto ou pede o segundo sim.
  const slotEvaluation = useMemo(() => {
    const start = selectedKey ? combineLocal(selectedKey, form.time) : null;
    if (!start) return { isException: false, reason: '', exceptions: [] };
    const end = addMinutes(start, Number(form.durationMinutes) || 60);

    return evaluateSlot({
      start,
      end,
      schedules: schedules.filter(item => item.professional_id === formProfessionalId),
      holidays,
      blocks: appointments.filter(
        item => item.kind === 'block' && item.professional_id === formProfessionalId,
      ),
    });
  }, [selectedKey, form.time, form.durationMinutes, formProfessionalId, schedules, holidays, appointments]);

  function shiftMonth(delta) {
    setLoading(true);
    setPendingException(null);
    setCursor(prev => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  }

  function goToday() {
    setLoading(true);
    setPendingException(null);
    setCursor({ year: today.getFullYear(), month: today.getMonth() + 1 });
    setSelectedKey(toDayKey(today));
  }

  async function persist(evaluation) {
    const start = combineLocal(selectedKey, form.time);
    if (!start) {
      setError('Informe um horário válido.');
      return;
    }

    setSaving(true);
    try {
      const created = await createAppointment(
        {
          kind: form.kind,
          patientId: form.kind === 'block' ? null : form.patientId,
          professionalId: formProfessionalId,
          discipline: form.kind === 'block' ? null : disciplineValue,
          appointmentType: form.kind === 'block' ? null : (form.appointmentType || null),
          startsAt: start.toISOString(),
          endsAt: addMinutes(start, Number(form.durationMinutes) || 60).toISOString(),
          note: form.note,
          isException: evaluation.isException,
          exceptionReason: evaluation.reason,
        },
        { knownAppointments: appointments },
      );
      setAppointments(prev => [...prev, created]);
      setForm(prev => ({ ...prev, patientId: '', note: '' }));
      setPendingException(null);
      setError('');
    } catch (err) {
      setError(err.message || 'Não foi possível criar o agendamento.');
      setPendingException(null);
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError('');

    // Horário atípico não é proibido — é atípico. Primeiro clique
    // apresenta o que foge do padrão; só o segundo grava.
    if (slotEvaluation.isException && !pendingException) {
      setPendingException(slotEvaluation);
      return;
    }

    persist(pendingException || slotEvaluation);
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
  const isBlock = form.kind === 'block';

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

        {teamOptions.length > 1 && (
          <div className="ag-team" role="group" aria-label="Agenda de qual profissional">
            <button
              type="button"
              className="ag-chip-btn ag-chip-btn--lg"
              aria-pressed={agendaOf === ALL_PROFESSIONALS}
              onClick={() => setAgendaOf(ALL_PROFESSIONALS)}
            >
              Toda a equipe
            </button>
            {teamOptions.map(member => (
              <button
                key={member.id}
                type="button"
                className="ag-chip-btn ag-chip-btn--lg"
                aria-pressed={agendaOf === member.id}
                onClick={() => setAgendaOf(member.id)}
              >
                {member.id === profile?.id ? 'Minha agenda' : shortName(member.full_name)}
              </button>
            ))}
          </div>
        )}

        {error && <div className="ag-alert" role="alert">{error}</div>}
        {notice && <div className="ag-notice">{notice}</div>}

        <div className="ag-cal">
          <div className="ag-weekdays">
            {WEEKDAY_LABELS.map(label => (
              <div key={label} className="ag-weekday">{label}</div>
            ))}
          </div>

          {grid.map((week, index) => (
            <div className="ag-week" key={index}>
              {week.map(cell => {
                const dayItems = byDay.get(cell.key) || [];
                const count = dayItems.filter(item => item.kind !== 'block').length;
                const blocked = dayItems.some(item => item.kind === 'block');
                const cellBirthdays = birthdays.get(cell.key) || [];
                const holiday = holidays.find(item => item.day === cell.key);
                const classes = [
                  'ag-day',
                  cell.inMonth ? '' : 'ag-day--outside',
                  cell.isToday ? 'ag-day--today' : '',
                  cell.key === selectedKey ? 'ag-day--selected' : '',
                  holiday && !holiday.is_working_day ? 'ag-day--holiday' : '',
                ].filter(Boolean).join(' ');

                return (
                  <button
                    type="button"
                    key={cell.key}
                    className={classes}
                    onClick={() => { setSelectedKey(cell.key); setPendingException(null); }}
                    aria-pressed={cell.key === selectedKey}
                  >
                    <span className="ag-day-num">{cell.day}</span>
                    <span className="ag-day-marks">
                      {count > 0 && (
                        <span className="ag-pill ag-pill--count">
                          {count} {count === 1 ? 'atend.' : 'atends.'}
                        </span>
                      )}
                      {blocked && (
                        <span className="ag-pill ag-pill--block" title="Há bloqueio de horário neste dia">
                          bloqueio
                        </span>
                      )}
                      {holiday && (
                        <span className="ag-pill ag-pill--holiday" title={holiday.name}>
                          {holiday.name}
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
            {loading
              ? 'Carregando…'
              : `${dayAppointments.filter(item => item.kind !== 'block').length} atendimento(s)`}
            {agendaOf === ALL_PROFESSIONALS && teamOptions.length > 1 ? ' · equipe inteira' : ''}
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
                <li
                  key={item.id}
                  className={`ag-item ag-item--${item.status} ${item.kind === 'block' ? 'ag-item--block' : ''}`}
                >
                  <div className="ag-item-top">
                    <span className="ag-item-time">
                      {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
                    </span>
                    <span className="ag-item-status">
                      {item.kind === 'block' ? 'Bloqueio' : getStatusLabel(item.status)}
                    </span>
                  </div>

                  <span className="ag-item-name">
                    {item.kind === 'block'
                      ? (item.note?.trim() || 'Horário reservado')
                      : patientName(item.patient_id)}
                  </span>

                  <span className="ag-item-meta">
                    {[
                      item.kind === 'block' ? null : item.discipline,
                      agendaOf === ALL_PROFESSIONALS ? professionalName(item.professional_id) : null,
                    ].filter(Boolean).join(' · ')}
                  </span>

                  {item.kind !== 'block' && item.note && (
                    <span className="ag-item-meta">{item.note}</span>
                  )}

                  {item.is_exception && (
                    <span className="ag-item-exception" title={item.exception_reason || ''}>
                      Fora do padrão: {item.exception_reason}
                    </span>
                  )}

                  {item.kind !== 'block' && (
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
                  )}
                </li>
              ))}
            </ul>
          )}

          <form className="ag-form" onSubmit={handleSubmit}>
            <p className="ag-form-title">{isBlock ? 'Novo bloqueio' : 'Novo agendamento'}</p>

            <div className="ag-seg" role="group" aria-label="O que está sendo marcado">
              <button
                type="button"
                className="ag-seg-btn"
                aria-pressed={!isBlock}
                onClick={() => { setForm(prev => ({ ...prev, kind: 'appointment' })); setPendingException(null); }}
              >
                Atendimento
              </button>
              <button
                type="button"
                className="ag-seg-btn"
                aria-pressed={isBlock}
                onClick={() => { setForm(prev => ({ ...prev, kind: 'block', patientId: '' })); setPendingException(null); }}
              >
                Bloquear horário
              </button>
            </div>

            {teamOptions.length > 1 && (
              <div className="ag-field">
                <label htmlFor="ag-professional">Profissional</label>
                <select
                  id="ag-professional"
                  className="ag-select"
                  value={formProfessionalId}
                  onChange={e => { setForm(prev => ({ ...prev, professionalId: e.target.value })); setPendingException(null); }}
                  disabled={saving}
                  required
                >
                  {teamOptions.map(member => (
                    <option key={member.id} value={member.id}>
                      {member.id === profile?.id ? `${member.full_name || 'Você'} (você)` : member.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {!isBlock && (
              <>
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

                <div className="ag-row">
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

                  <div className="ag-field">
                    <label htmlFor="ag-kind">Tipo</label>
                    <select
                      id="ag-kind"
                      className="ag-select"
                      value={form.appointmentType}
                      onChange={e => setForm(prev => ({ ...prev, appointmentType: e.target.value }))}
                      disabled={saving}
                    >
                      <option value="">Não classificado</option>
                      {APPOINTMENT_TYPES.map(item => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="ag-row">
              <div className="ag-field">
                <label htmlFor="ag-time">Início</label>
                <input
                  id="ag-time"
                  className="ag-input"
                  type="time"
                  value={form.time}
                  onChange={e => { setForm(prev => ({ ...prev, time: e.target.value })); setPendingException(null); }}
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
                  onChange={e => { setForm(prev => ({ ...prev, durationMinutes: Number(e.target.value) })); setPendingException(null); }}
                  disabled={saving}
                >
                  {[30, 45, 60, 90, 120, 180, 240].map(minutes => (
                    <option key={minutes} value={minutes}>{minutes} min</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="ag-field">
              <label htmlFor="ag-note">
                {isBlock ? 'Motivo do bloqueio' : 'Observação da recepção'}
              </label>
              <input
                id="ag-note"
                className="ag-input"
                type="text"
                placeholder={isBlock ? 'Almoço, reunião, curso…' : 'Sala, encaixe, retorno…'}
                value={form.note}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                disabled={saving}
                required={isBlock}
              />
            </div>

            {/* Aviso de horário atípico. Aparece já na digitação — a
                pessoa vê antes de tentar salvar, não como punição depois. */}
            {slotEvaluation.isException && !pendingException && (
              <div className="ag-warn">
                <p className="ag-warn-title">Horário fora do padrão</p>
                <ul className="ag-warn-list">
                  {slotEvaluation.exceptions.map(item => (
                    <li key={item.kind}><b>{item.label}</b> — {item.detail}</li>
                  ))}
                </ul>
                <p className="ag-warn-note">
                  Marcar aqui é permitido. Ao continuar, o sistema pede uma
                  confirmação e registra a exceção.
                </p>
              </div>
            )}

            {pendingException && (
              <div className="ag-warn ag-warn--confirm" role="alertdialog" aria-label="Confirmar horário fora do padrão">
                <p className="ag-warn-title">Confirmar mesmo assim?</p>
                <ul className="ag-warn-list">
                  {pendingException.exceptions.map(item => (
                    <li key={item.kind}><b>{item.label}</b></li>
                  ))}
                </ul>
                <p className="ag-warn-note">
                  Fica registrado como exceção, com este motivo, para a
                  clínica saber depois por que este horário saiu do comum.
                </p>
                <div className="ag-warn-actions">
                  <button
                    type="button"
                    className="ag-btn"
                    onClick={() => setPendingException(null)}
                    disabled={saving}
                  >
                    Escolher outro horário
                  </button>
                  <button
                    type="submit"
                    className="ag-btn ag-btn--warn"
                    disabled={saving}
                  >
                    {saving ? 'Salvando…' : 'Sim, marcar assim'}
                  </button>
                </div>
              </div>
            )}

            {!pendingException && (
              <button type="submit" className="ag-btn ag-btn--primary" disabled={saving || loading}>
                {saving ? 'Salvando…' : isBlock ? 'Bloquear' : 'Agendar'}
              </button>
            )}

            <p className="ag-note">
              A agenda é da instituição: dá para marcar para qualquer
              profissional da casa. O único horário que o sistema recusa é
              dois pacientes ao mesmo tempo com o mesmo profissional.
            </p>
          </form>
        </div>
      </aside>
    </div>
  );
}

export default Agenda;
