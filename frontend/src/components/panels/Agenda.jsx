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
import { evaluateSlot, minutesToLabel } from '../../utils/agendaExceptions';
import { buildDayTimeline, buildWeekStrip } from '../../utils/agendaTimeline';
import {
  buildRecurrenceDates,
  describeSeries,
  summarizeSeries,
} from '../../utils/agendaRecurrence';
import { buildTodayQueue } from '../../utils/agendaToday';
import {
  APPOINTMENT_TYPES,
  cancelSeriesFrom,
  checkInAppointment,
  confirmAppointment,
  createAppointment,
  createSeries,
  listAppointments,
  rescheduleAppointment,
  updateAppointmentStatus,
} from '../../services/appointmentService';
import { listClinicMembers, shortName, sortWithSelfFirst } from '../../services/clinicMembersService';
import { listHolidays, listProfessionalSchedules } from '../../services/agendaScheduleService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { DISCIPLINES } from '../../data/disciplines';
import AgendaDayView from './agenda/AgendaDayView';
import AgendaWeekView from './agenda/AgendaWeekView';
import ScheduleEditor from './agenda/ScheduleEditor';
import SeriesPreview from './agenda/SeriesPreview';
import TodayPanel from './agenda/TodayPanel';
import { usePatient } from '../../hooks/PatientContext';
import '../../styles/agenda.css';

// Estados oferecidos como ação rápida. 'scheduled' fica de fora porque é
// o estado inicial — voltar para ele é remarcar, não marcar.
const QUICK_STATUSES = APPOINTMENT_STATUSES.filter(item => item.id !== 'scheduled');

const ALL_PROFESSIONALS = 'all';

const VIEWS = [
  { id: 'hoje', label: 'Hoje' },
  { id: 'dia', label: 'Dia' },
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
];

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
  const [year, month, day] = String(dayKey || '').split('-').map(Number);
  const [hour, minute] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

// A agenda abre em "Hoje": a primeira pergunta de qualquer clínica é o
// que está acontecendo agora, não como está o mês. Marcar continua a um
// toque, porque o formulário fica no painel lateral em qualquer visão.
const DEFAULT_VIEW = 'hoje';

export function Agenda({ profile, onStartAppointment = null }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  }));
  const [selectedKey, setSelectedKey] = useState(() => toDayKey(today));
  const [view, setView] = useState(DEFAULT_VIEW);
  const [showSchedule, setShowSchedule] = useState(false);

  const [appointments, setAppointments] = useState([]);
  const [patients, setPatients] = useState([]);
  const [members, setMembers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Quem a agenda está mostrando. 'all' é a visão de recepção.
  const [agendaOf, setAgendaOf] = useState(() => profile?.id || ALL_PROFESSIONALS);

  // Agendamento aberto no painel lateral (detalhe/ações).
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  // Agendamento em modo "mover": o próximo toque num horário remarca.
  const [moving, setMoving] = useState(null);

  // O painel da recepção mostra "esperando há 12 min"; sem um relógio
  // que anda, esse número congela no instante em que a tela abriu e
  // passa a mentir logo na primeira meia hora de expediente.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // A ponte agenda → prontuário e o cadastro rápido de paciente passam
  // pelo contexto: é ele que o resto do sistema lê.
  const { selectPatient, createPatient: createPatientInContext } = usePatient();

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
    // Pacote de sessões. Vazio em weekdays significa "o mesmo dia da
    // semana da data escolhida", que é o caso "toda terça".
    repeat: false,
    repeatWeekdays: [],
    repeatCount: 10,
  }));

  // Conferência do pacote antes de gravar: dez agendamentos de uma vez
  // é a ação mais cara de desfazer na agenda.
  const [seriesPreview, setSeriesPreview] = useState(null);

  // Cadastro rápido de paciente, dentro do próprio formulário.
  const [quickPatient, setQuickPatient] = useState({
    open: false, name: '', phone: '', birthDate: '',
  });

  // Confirmação dupla de horário atípico: enquanto isto tiver conteúdo,
  // nada é gravado — a tela mostra o que foge do normal e espera um
  // segundo "sim" explícito.
  const [pendingException, setPendingException] = useState(null);

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
      // Quebrar a tela inteira por causa de um aviso seria pior — mas o
      // silêncio precisa aparecer em algum lugar, então vira recado.
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
  }, [cursor.year, cursor.month, reloadToken]);

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
  const showProfessional = agendaOf === ALL_PROFESSIONALS && teamOptions.length > 1;

  const selectedDate = useMemo(() => combineLocal(selectedKey, '12:00'), [selectedKey]);

  // Na visão de recepção não há uma jornada só; a linha do tempo usa a
  // do profissional do formulário, que é para quem o horário vai.
  const timelineSchedules = useMemo(
    () => schedules.filter(item => item.professional_id === (
      agendaOf === ALL_PROFESSIONALS ? formProfessionalId : agendaOf
    )),
    [schedules, agendaOf, formProfessionalId],
  );

  const week = useMemo(
    () => buildWeekStrip(selectedDate || today, { today, counts: byDay }),
    [selectedDate, today, byDay],
  );

  const todayQueue = useMemo(
    () => buildTodayQueue({ appointments: visibleAppointments, now, dayKey: selectedKey }),
    [visibleAppointments, now, selectedKey],
  );

  const timeline = useMemo(() => buildDayTimeline({
    date: selectedDate || today,
    schedules: timelineSchedules,
    appointments: visibleAppointments,
    holidays,
  }), [selectedDate, today, timelineSchedules, visibleAppointments, holidays]);

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

  /** Avalia um horário candidato contra jornada, feriados e bloqueios. */
  function evaluate({ dayKey, time, durationMinutes, professionalId, ignoreId = null }) {
    const start = combineLocal(dayKey, time);
    if (!start) return { isException: false, reason: '', exceptions: [] };

    return evaluateSlot({
      start,
      end: addMinutes(start, Number(durationMinutes) || 60),
      schedules: schedules.filter(item => item.professional_id === professionalId),
      holidays,
      blocks: appointments.filter(item => (
        item.kind === 'block'
        && item.professional_id === professionalId
        && item.id !== ignoreId
      )),
    });
  }

  const slotEvaluation = useMemo(
    () => evaluate({
      dayKey: selectedKey,
      time: form.time,
      durationMinutes: form.durationMinutes,
      professionalId: formProfessionalId,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedKey, form.time, form.durationMinutes, formProfessionalId, schedules, holidays, appointments],
  );

  function resetTransient() {
    setPendingException(null);
    setSelectedAppointment(null);
    setSeriesPreview(null);
  }

  function shiftMonth(delta) {
    setLoading(true);
    resetTransient();
    setCursor(prev => {
      const date = new Date(prev.year, prev.month - 1 + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() + 1 };
    });
  }

  /** Anda um dia (visão Dia) ou sete (visão Semana), trocando de mês se precisar. */
  function shiftDay(delta) {
    const base = selectedDate || today;
    const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
    resetTransient();
    setSelectedKey(toDayKey(next));

    if (next.getFullYear() !== cursor.year || next.getMonth() + 1 !== cursor.month) {
      setLoading(true);
      setCursor({ year: next.getFullYear(), month: next.getMonth() + 1 });
    }
  }

  function goToday() {
    resetTransient();
    setSelectedKey(toDayKey(today));
    if (today.getFullYear() !== cursor.year || today.getMonth() + 1 !== cursor.month) {
      setLoading(true);
      setCursor({ year: today.getFullYear(), month: today.getMonth() + 1 });
    }
  }

  function selectDay(dayKey) {
    resetTransient();
    setSelectedKey(dayKey);
  }

  // ---------- criar ----------

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

  /** Monta a conferência do pacote a partir do que está no formulário. */
  function buildSeries() {
    const start = combineLocal(selectedKey, form.time);
    if (!start) return null;

    const dates = buildRecurrenceDates({
      start,
      weekdays: form.repeatWeekdays,
      count: Number(form.repeatCount) || 1,
    });

    const items = describeSeries({
      dates,
      time: form.time,
      durationMinutes: form.durationMinutes,
      professionalId: formProfessionalId,
      appointments,
      // Cada sessão é avaliada sozinha: uma cair em feriado não torna
      // as outras exceção.
      evaluate: (sessionStart, sessionEnd) => evaluateSlot({
        start: sessionStart,
        end: sessionEnd,
        schedules: schedules.filter(item => item.professional_id === formProfessionalId),
        holidays,
        blocks: appointments.filter(item => (
          item.kind === 'block' && item.professional_id === formProfessionalId
        )),
      }),
    });

    return { items, summary: summarizeSeries(items) };
  }

  async function confirmSeries() {
    const criaveis = seriesPreview.items.filter(item => !item.conflict);
    if (criaveis.length === 0) {
      setError('Todas as datas do pacote estão ocupadas. Ajuste o horário ou os dias.');
      return;
    }

    setSaving(true);
    try {
      const { created, failed } = await createSeries(
        {
          kind: 'appointment',
          patientId: form.patientId,
          professionalId: formProfessionalId,
          discipline: disciplineValue,
          appointmentType: form.appointmentType || null,
          note: form.note,
        },
        { items: criaveis },
      );

      setAppointments(prev => [...prev, ...created]);
      setSeriesPreview(null);
      setForm(prev => ({ ...prev, patientId: '', note: '', repeat: false }));

      // Falha parcial precisa aparecer nomeada: "criei 8 de 10" sem
      // dizer quais duas faltaram obriga a conferir a agenda inteira.
      if (failed.length) {
        setError(
          `${created.length} sessão(ões) criada(s). Não deu para criar em: `
          + failed.map(item => item.start.toLocaleDateString('pt-BR')).join(', ')
          + '. Marque essas manualmente em outro horário.',
        );
      } else {
        setError('');
      }
    } catch (err) {
      setError(err.message || 'Não foi possível criar o pacote.');
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError('');

    // Pacote: a conferência substitui a confirmação dupla. Ver dez datas
    // antes de gravar vale mais do que um "tem certeza?".
    if (form.repeat && form.kind === 'appointment') {
      const preview = buildSeries();
      if (!preview || preview.items.length === 0) {
        setError('Informe um horário e um número de sessões válidos.');
        return;
      }
      setSeriesPreview(preview);
      return;
    }

    // Horário atípico não é proibido — é atípico. O primeiro clique
    // apresenta o que foge do padrão; só o segundo grava.
    if (slotEvaluation.isException && !pendingException) {
      setPendingException(slotEvaluation);
      return;
    }

    persist(pendingException || slotEvaluation);
  }

  async function handleCancelSeries(appointment) {
    const total = appointments.filter(item => (
      item.recurrence_group_id === appointment.recurrence_group_id
      && new Date(item.starts_at) >= new Date(appointment.starts_at)
      && item.status === 'scheduled'
    )).length;

    if (!window.confirm(
      `Cancelar esta sessão e as ${total - 1} seguintes do pacote?

`
      + 'As sessões já atendidas não são afetadas.',
    )) return;

    setSaving(true);
    try {
      const cancelled = await cancelSeriesFrom(appointment.recurrence_group_id, {
        fromIso: appointment.starts_at,
      });
      const byId = new Map(cancelled.map(item => [item.id, item]));
      setAppointments(prev => prev.map(item => byId.get(item.id) || item));
      setSelectedAppointment(null);
      setError('');
    } catch (err) {
      setError(err.message || 'Não foi possível cancelar as sessões.');
    } finally {
      setSaving(false);
    }
  }

  function toggleRepeatWeekday(weekday) {
    setForm(prev => ({
      ...prev,
      repeatWeekdays: prev.repeatWeekdays.includes(weekday)
        ? prev.repeatWeekdays.filter(item => item !== weekday)
        : [...prev.repeatWeekdays, weekday].sort(),
    }));
  }

  // ---------- tocar num horário ----------

  async function moveTo(dayKey, startMinutes, endMinutes) {
    const appointment = moving;
    const time = minutesToLabel(startMinutes);
    const duration = endMinutes - startMinutes;

    const evaluation = evaluate({
      dayKey,
      time,
      durationMinutes: duration,
      professionalId: appointment.professional_id,
      ignoreId: appointment.id,
    });

    // Mover para um sábado também é exceção: a confirmação dupla vale
    // para remarcar, não só para criar.
    if (evaluation.isException && !window.confirm(
      `${evaluation.reason}\n\nMarcar aqui é permitido, e fica registrado como exceção. Confirmar?`,
    )) {
      return;
    }

    const start = combineLocal(dayKey, time);
    setSaving(true);
    try {
      const updated = await rescheduleAppointment(appointment.id, {
        startsAt: start.toISOString(),
        // Remarcar mantém a duração original do atendimento, não a da
        // faixa de destino: mover uma sessão de 90 min para um slot de
        // 60 não pode encurtar o atendimento sem ninguém pedir.
        endsAt: addMinutes(
          start,
          Math.round((new Date(appointment.ends_at) - new Date(appointment.starts_at)) / 60000) || duration,
        ).toISOString(),
        isException: evaluation.isException,
        exceptionReason: evaluation.reason,
      });
      setAppointments(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      setMoving(null);
      setSelectedAppointment(null);
      setError('');
    } catch (err) {
      setError(err.message || 'Não foi possível remarcar.');
    } finally {
      setSaving(false);
    }
  }

  function pickSlot(row, dayKey = selectedKey) {
    if (moving) {
      moveTo(dayKey, row.startMinutes, row.endMinutes);
      return;
    }

    if (dayKey !== selectedKey) setSelectedKey(dayKey);
    setSelectedAppointment(null);
    setPendingException(null);
    setForm(prev => ({
      ...prev,
      time: minutesToLabel(row.startMinutes),
      // A faixa manda na duração — foi ela que a pessoa tocou. Só não
      // deixa passar faixa degenerada.
      durationMinutes: Math.max(row.endMinutes - row.startMinutes, 5),
    }));
  }

  function pickCell(day, startMinutes, endMinutes) {
    pickSlot({ startMinutes, endMinutes }, day.key);
  }

  // ---------- ações no agendamento ----------

  async function handleStatus(appointment, status) {
    setError('');
    try {
      const updated = await updateAppointmentStatus(appointment.id, status);
      setAppointments(prev => prev.map(item => (item.id === updated.id ? updated : item)));
      setSelectedAppointment(prev => (prev?.id === updated.id ? updated : prev));
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o agendamento.');
    }
  }

  function openAppointment(appointment) {
    if (moving) return;
    setPendingException(null);
    setSelectedAppointment(appointment);
  }

  /** Aplica um patch vindo do service ao agendamento na lista e no detalhe. */
  function applyUpdate(updated) {
    setAppointments(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    setSelectedAppointment(prev => (prev?.id === updated.id ? updated : prev));
  }

  async function handleCheckIn(appointment, undo = false) {
    setError('');
    setSaving(true);
    try {
      applyUpdate(await checkInAppointment(appointment.id, { undo }));
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a chegada.');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm(appointment, undo = false) {
    setError('');
    setSaving(true);
    try {
      applyUpdate(await confirmAppointment(appointment.id, { undo }));
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a confirmação.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Quem pode abrir o prontuário a partir da agenda.
   *
   * O corte é duplo de propósito: precisa ser a agenda da própria pessoa
   * E uma disciplina que o perfil dela libera. A recepcionista marca
   * para todo mundo, mas não entra no prontuário de ninguém — e a RLS
   * recusaria de qualquer forma; barrar aqui evita oferecer um botão
   * que só daria erro.
   */
  function canStart(appointment) {
    if (!onStartAppointment || appointment.kind === 'block') return false;
    if (appointment.professional_id !== profile?.id) return false;

    const liberadas = Array.isArray(profile?.disciplines) ? profile.disciplines : [];
    if (!liberadas.includes(appointment.discipline)) return false;

    return patients.some(item => item.id === appointment.patient_id);
  }

  function startAppointment(appointment) {
    const patient = patients.find(item => item.id === appointment.patient_id);
    if (!patient) {
      setError('Paciente não encontrado na instituição.');
      return;
    }
    // A seleção mora aqui porque é aqui que o objeto do paciente existe;
    // ao App cabe só trocar de tela.
    selectPatient(patient);
    onStartAppointment({ patient, discipline: appointment.discipline });
  }

  /**
   * Cadastro rápido no ato de agendar. Paciente novo chega por telefone
   * o tempo todo; sem isso a recepção precisa sair da agenda, cadastrar
   * e voltar — e no meio do caminho perde o horário que estava segurando.
   *
   * A matrícula inicial usa a disciplina DO AGENDAMENTO, não um valor
   * fixo: é ela que decide se o profissional vai enxergar o paciente
   * (política patients_select_clinic_discipline).
   */
  async function handleQuickCreatePatient(event) {
    event.preventDefault();
    setError('');

    const nome = quickPatient.name.trim();
    if (!nome) {
      setError('Informe o nome do paciente.');
      return;
    }

    setSaving(true);
    try {
      const created = await createPatientInContext(
        { name: nome, phone: quickPatient.phone.trim() || null, birthDate: quickPatient.birthDate || null },
        disciplineValue,
      );
      setPatients(prev => [{ ...created, enrollments: [] }, ...prev]);
      setForm(prev => ({ ...prev, patientId: created.id }));
      setQuickPatient({ open: false, name: '', phone: '', birthDate: '' });
    } catch (err) {
      setError(err.message || 'Não foi possível cadastrar o paciente.');
    } finally {
      setSaving(false);
    }
  }

  const isBlock = form.kind === 'block';

  // ---------- jornada ----------

  if (showSchedule) {
    return (
      <ScheduleEditor
        professionalId={formProfessionalId}
        professionalLabel={
          formProfessionalId === profile?.id
            ? (profile?.full_name || 'Você')
            : (members.find(item => item.id === formProfessionalId)?.full_name || 'Profissional')
        }
        onBack={() => {
          setShowSchedule(false);
          // A jornada acabou de mudar: recarrega para a linha do tempo
          // refletir o que foi cadastrado.
          setReloadToken(token => token + 1);
        }}
      />
    );
  }

  const headerLabel = view === 'mes'
    ? `${MONTH_LABELS[cursor.month - 1]} ${cursor.year}`
    : view === 'hoje' && selectedKey === toDayKey(today)
    ? 'Hoje na clínica'
    : selectedDate?.toLocaleDateString('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long',
    }) || '';

  return (
    <div className={`ag${view === 'dia' ? ' ag--day' : ''}`}>
      <section className="ag-main">
        <header className="ag-head">
          <h2 className="ag-month">{headerLabel}</h2>
          <div className="ag-nav">
            <button
              type="button"
              className="ag-btn"
              onClick={() => (view === 'mes' ? shiftMonth(-1) : shiftDay(view === 'semana' ? -7 : -1))}
              disabled={saving}
              aria-label={view === 'mes' ? 'Mês anterior' : 'Anterior'}
            >←</button>
            <button type="button" className="ag-btn" onClick={goToday}>Hoje</button>
            <button
              type="button"
              className="ag-btn"
              onClick={() => (view === 'mes' ? shiftMonth(1) : shiftDay(view === 'semana' ? 7 : 1))}
              aria-label={view === 'mes' ? 'Próximo mês' : 'Próximo'}
            >→</button>
          </div>
        </header>

        <div className="ag-toolbar">
          <div className="ag-seg ag-seg--views" role="group" aria-label="Visão da agenda">
            {VIEWS.map(item => (
              <button
                key={item.id}
                type="button"
                className="ag-seg-btn"
                aria-pressed={view === item.id}
                onClick={() => { setView(item.id); resetTransient(); }}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button type="button" className="ag-btn" onClick={() => setShowSchedule(true)}>
            Horários de atendimento
          </button>
        </div>

        {teamOptions.length > 1 && (
          <div className="ag-team" role="group" aria-label="Agenda de qual profissional">
            <button
              type="button"
              className="ag-chip-btn ag-chip-btn--lg"
              aria-pressed={agendaOf === ALL_PROFESSIONALS}
              onClick={() => { setAgendaOf(ALL_PROFESSIONALS); resetTransient(); }}
            >
              Toda a equipe
            </button>
            {teamOptions.map(member => (
              <button
                key={member.id}
                type="button"
                className="ag-chip-btn ag-chip-btn--lg"
                aria-pressed={agendaOf === member.id}
                onClick={() => { setAgendaOf(member.id); resetTransient(); }}
              >
                {member.id === profile?.id ? 'Minha agenda' : shortName(member.full_name)}
              </button>
            ))}
          </div>
        )}

        {error && <div className="ag-alert" role="alert">{error}</div>}
        {notice && <div className="ag-notice">{notice}</div>}

        {moving && (
          <div className="ag-warn ag-warn--confirm">
            <p className="ag-warn-title">
              Movendo: {moving.kind === 'block'
                ? (moving.note?.trim() || 'bloqueio')
                : patientName(moving.patient_id)}
            </p>
            <p className="ag-warn-note">
              Toque no horário de destino. A duração do atendimento é
              mantida.
            </p>
            <div className="ag-warn-actions">
              <button type="button" className="ag-btn" onClick={() => setMoving(null)}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {view === 'hoje' && (
          <TodayPanel
            queue={todayQueue}
            isToday={selectedKey === toDayKey(today)}
            dateLabel={selectedDate?.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' }) || ''}
            patientName={patientName}
            professionalName={professionalName}
            showProfessional={showProfessional}
            saving={saving}
            onOpen={openAppointment}
            onCheckIn={appointment => handleCheckIn(appointment, false)}
            onUndoCheckIn={appointment => handleCheckIn(appointment, true)}
            onConfirm={handleConfirm}
            onStatus={handleStatus}
            onStart={startAppointment}
            canStart={canStart}
          />
        )}

        {view === 'dia' && (
          <AgendaDayView
            week={week}
            timeline={timeline}
            selectedKey={selectedKey}
            onSelectDay={selectDay}
            onPickSlot={row => pickSlot(row)}
            onSelectAppointment={openAppointment}
            patientName={patientName}
            professionalName={professionalName}
            showProfessional={showProfessional}
            movingId={moving?.id || null}
            onOpenSchedule={() => setShowSchedule(true)}
          />
        )}

        {view === 'semana' && (
          <AgendaWeekView
            week={week}
            schedules={timelineSchedules}
            appointments={visibleAppointments}
            holidays={holidays}
            selectedKey={selectedKey}
            onPickCell={pickCell}
            onSelectAppointment={openAppointment}
            patientName={patientName}
            movingId={moving?.id || null}
          />
        )}

        {view === 'mes' && (
          <div className="ag-cal">
            <div className="ag-weekdays">
              {WEEKDAY_LABELS.map(label => (
                <div key={label} className="ag-weekday">{label}</div>
              ))}
            </div>

            {grid.map((weekRow, index) => (
              <div className="ag-week" key={index}>
                {weekRow.map(cell => {
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
                      onClick={() => selectDay(cell.key)}
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
        )}
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
            {showProfessional ? ' · equipe inteira' : ''}
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

          {/* Um painel, uma coisa por vez: conferência do pacote, detalhe
              do agendamento ou formulário. Duas delas juntas confundem
              quem está no meio de uma ação. */}
          {seriesPreview ? (
            <SeriesPreview
              items={seriesPreview.items}
              summary={seriesPreview.summary}
              saving={saving}
              patientName={patientName}
              onConfirm={confirmSeries}
              onCancel={() => setSeriesPreview(null)}
            />
          ) : selectedAppointment ? (
            <div className="ag-detail">
              <div className="ag-item-top">
                <span className="ag-item-time">
                  {formatTime(selectedAppointment.starts_at)}–{formatTime(selectedAppointment.ends_at)}
                </span>
                <button
                  type="button"
                  className="ag-chip-btn"
                  onClick={() => setSelectedAppointment(null)}
                >
                  Fechar
                </button>
              </div>

              <p className="ag-detail-name">
                {selectedAppointment.kind === 'block'
                  ? (selectedAppointment.note?.trim() || 'Horário reservado')
                  : patientName(selectedAppointment.patient_id)}
              </p>
              <p className="ag-item-meta">
                {[
                  selectedAppointment.kind === 'block' ? 'bloqueio' : selectedAppointment.discipline,
                  professionalName(selectedAppointment.professional_id),
                ].filter(Boolean).join(' · ')}
              </p>

              {selectedAppointment.is_exception && (
                <p className="ag-item-exception">
                  Fora do padrão: {selectedAppointment.exception_reason}
                </p>
              )}

              {selectedAppointment.kind !== 'block' && (
                <div className="ag-item-actions">
                  {QUICK_STATUSES.map(status => (
                    <button
                      key={status.id}
                      type="button"
                      className="ag-chip-btn"
                      aria-pressed={selectedAppointment.status === status.id}
                      onClick={() => handleStatus(selectedAppointment, status.id)}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              )}

              {selectedAppointment.recurrence_group_id && (
                <p className="ag-detail-series">
                  Faz parte de um pacote de sessões.
                </p>
              )}

              <button
                type="button"
                className="ag-btn"
                onClick={() => { setMoving(selectedAppointment); setSelectedAppointment(null); }}
                disabled={saving}
              >
                Mover para outro horário
              </button>

              {selectedAppointment.recurrence_group_id
                && selectedAppointment.status === 'scheduled' && (
                <button
                  type="button"
                  className="ag-btn"
                  onClick={() => handleCancelSeries(selectedAppointment)}
                  disabled={saving}
                >
                  Cancelar esta e as próximas do pacote
                </button>
              )}
            </div>
          ) : (
            <>
              {/* A lista do dia só faz sentido na visão Mês: na visão Dia
                  a própria linha do tempo já é a lista, e repetir seria
                  duas fontes da mesma verdade. */}
              {view === 'mes' && (
                dayAppointments.length === 0 ? (
                  <p className="ag-empty">Nenhum atendimento marcado neste dia.</p>
                ) : (
                  <ul className="ag-list">
                    {dayAppointments.map(item => (
                      <li
                        key={item.id}
                        className={`ag-item ag-item--${item.status}${item.kind === 'block' ? ' ag-item--block' : ''}`}
                      >
                        <button
                          type="button"
                          className="ag-item-open"
                          onClick={() => openAppointment(item)}
                        >
                          <span className="ag-item-top">
                            <span className="ag-item-time">
                              {formatTime(item.starts_at)}–{formatTime(item.ends_at)}
                            </span>
                            <span className="ag-item-status">
                              {item.kind === 'block' ? 'Bloqueio' : getStatusLabel(item.status)}
                            </span>
                          </span>
                          <span className="ag-item-name">
                            {item.kind === 'block'
                              ? (item.note?.trim() || 'Horário reservado')
                              : patientName(item.patient_id)}
                          </span>
                          <span className="ag-item-meta">
                            {[
                              item.kind === 'block' ? null : item.discipline,
                              showProfessional ? professionalName(item.professional_id) : null,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
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
                        disabled={saving || loading || quickPatient.open}
                        required={!quickPatient.open}
                      >
                        <option value="">Selecione…</option>
                        {patients.map(patient => (
                          <option key={patient.id} value={patient.id}>{patient.name}</option>
                        ))}
                      </select>

                      {!quickPatient.open && (
                        <button
                          type="button"
                          className="agd-linkbtn"
                          onClick={() => setQuickPatient(prev => ({ ...prev, open: true }))}
                        >
                          Paciente novo? Cadastrar aqui
                        </button>
                      )}
                    </div>

                    {/* Cadastro rápido. Paciente novo chega por telefone o
                        tempo todo; sair da agenda para cadastrar faz perder
                        o horário que estava sendo segurado. */}
                    {quickPatient.open && (
                      <div className="ag-quick">
                        <p className="ag-form-title">Cadastrar paciente</p>

                        <div className="ag-field">
                          <label htmlFor="ag-qp-name">Nome</label>
                          <input
                            id="ag-qp-name"
                            className="ag-input"
                            type="text"
                            value={quickPatient.name}
                            onChange={e => setQuickPatient(prev => ({ ...prev, name: e.target.value }))}
                            disabled={saving}
                          />
                        </div>

                        <div className="ag-row">
                          <div className="ag-field">
                            <label htmlFor="ag-qp-phone">Telefone</label>
                            <input
                              id="ag-qp-phone"
                              className="ag-input"
                              type="tel"
                              value={quickPatient.phone}
                              onChange={e => setQuickPatient(prev => ({ ...prev, phone: e.target.value }))}
                              disabled={saving}
                            />
                          </div>
                          <div className="ag-field">
                            <label htmlFor="ag-qp-birth">Nascimento</label>
                            <input
                              id="ag-qp-birth"
                              className="ag-input"
                              type="date"
                              value={quickPatient.birthDate}
                              onChange={e => setQuickPatient(prev => ({ ...prev, birthDate: e.target.value }))}
                              disabled={saving}
                            />
                          </div>
                        </div>

                        <p className="ag-note">
                          O cadastro entra na área <b>{availableDisciplines.find(item => item.id === disciplineValue)?.label || disciplineValue}</b>,
                          que é a do agendamento — é ela que decide quem enxerga
                          o paciente. O restante da ficha se completa na anamnese.
                        </p>

                        <div className="ag-warn-actions">
                          <button
                            type="button"
                            className="ag-btn"
                            onClick={() => setQuickPatient({ open: false, name: '', phone: '', birthDate: '' })}
                            disabled={saving}
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            className="ag-btn ag-btn--primary"
                            onClick={handleQuickCreatePatient}
                            disabled={saving}
                          >
                            {saving ? 'Cadastrando…' : 'Cadastrar e selecionar'}
                          </button>
                        </div>
                      </div>
                    )}

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
                        <label htmlFor="ag-type">Tipo</label>
                        <select
                          id="ag-type"
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
                      {[...new Set([Number(form.durationMinutes) || 60, 20, 30, 45, 60, 90, 120, 180, 240])]
                        .sort((a, b) => a - b)
                        .map(minutes => (
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

                {/* Pacote de sessões. Só para atendimento: bloqueio
                    recorrente é outro problema (jornada), e misturar os
                    dois faria a tela prometer o que não entrega. */}
                {!isBlock && (
                  <div className="ag-repeat">
                    <label className="agj-check">
                      <input
                        type="checkbox"
                        checked={form.repeat}
                        onChange={e => setForm(prev => ({ ...prev, repeat: e.target.checked }))}
                        disabled={saving}
                      />
                      Repetir (pacote de sessões)
                    </label>

                    {form.repeat && (
                      <>
                        <div className="ag-field">
                          <span className="agj-label">
                            Dias da semana
                            {form.repeatWeekdays.length === 0 && selectedDate && (
                              <> — sem escolher, repete toda {WEEKDAY_LABELS[selectedDate.getDay()].toLowerCase()}.</>
                            )}
                          </span>
                          <div className="agj-days">
                            {WEEKDAY_LABELS.map((label, weekday) => (
                              <button
                                key={label}
                                type="button"
                                className="ag-chip-btn ag-chip-btn--lg"
                                aria-pressed={form.repeatWeekdays.includes(weekday)}
                                onClick={() => toggleRepeatWeekday(weekday)}
                                disabled={saving}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="ag-field">
                          <label htmlFor="ag-count">Número de sessões</label>
                          <input
                            id="ag-count"
                            className="ag-input"
                            type="number"
                            min="2"
                            max="60"
                            value={form.repeatCount}
                            onChange={e => setForm(prev => ({ ...prev, repeatCount: e.target.value }))}
                            disabled={saving}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* Aviso de horário atípico. Aparece já na digitação — a
                    pessoa vê antes de tentar salvar, não como punição. */}
                {slotEvaluation.isException && !pendingException && !form.repeat && (
                  <div className="ag-warn">
                    <p className="ag-warn-title">Horário fora do padrão</p>
                    <ul className="ag-warn-list">
                      {slotEvaluation.exceptions.map(item => (
                        <li key={item.kind}><b>{item.label}</b> — {item.detail}</li>
                      ))}
                    </ul>
                    <p className="ag-warn-note">
                      Marcar aqui é permitido. Ao continuar, o sistema pede
                      uma confirmação e registra a exceção.
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
                      <button type="submit" className="ag-btn ag-btn--warn" disabled={saving}>
                        {saving ? 'Salvando…' : 'Sim, marcar assim'}
                      </button>
                    </div>
                  </div>
                )}

                {!pendingException && (
                  <button type="submit" className="ag-btn ag-btn--primary" disabled={saving || loading}>
                    {saving
                      ? 'Salvando…'
                      : form.repeat && !isBlock
                        ? `Conferir ${form.repeatCount || 0} sessões`
                        : isBlock ? 'Bloquear' : 'Agendar'}
                  </button>
                )}

                <p className="ag-note">
                  Toque num horário livre da agenda para preencher a hora
                  daqui. O único horário que o sistema recusa é dois
                  pacientes ao mesmo tempo com o mesmo profissional.
                </p>
              </form>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

export default Agenda;
