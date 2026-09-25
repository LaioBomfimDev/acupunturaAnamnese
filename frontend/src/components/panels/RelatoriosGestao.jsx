import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { getStatusLabel } from '../../utils/agenda';
import { DASHBOARD_PERIOD_PRESETS, presetToRange } from '../../utils/gestaoDashboard';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import { getAvatarColor, getInitials } from '../../utils/patientUi';
import { buildWhatsAppLink, isLikelyValidWhatsAppPhone } from '../../utils/whatsapp';
import { listAppointments, listMissedAppointments, listPatientsAwaitingReturn } from '../../services/appointmentService';
import { listClinicMembers, setMemberHasAgenda, shortName } from '../../services/clinicMembersService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { listClinicAccessLogs } from '../../services/clinicAccessLogService';
import { loadDashboardMetrics } from '../../services/gestaoDashboardService';
import {
  buildSurveyLink,
  createSatisfactionSurvey,
  listSatisfactionSurveys,
} from '../../services/satisfactionSurveyService';
import { SearchSelect } from '../ui/SearchSelect';
import { ProfessionalCreateForm } from './ProfessionalCreateForm';
import { PersonalizarClinica } from './PersonalizarClinica';
import '../../styles/gestao.css';

// Mesmo componente que profissional e recepção abrem pelo menu do hub;
// lazy para o conversor de Word não pesar nas outras abas da Gestão.
const DocumentosTimbrados = lazy(() => import('./DocumentosTimbrados')
  .then(module => ({ default: module.DocumentosTimbrados })));

// ============================================================
// Gestão da instituição — relatórios operacionais (Fase 8)
//
// Ferramenta da clínica inteira, igual a Agenda: não depende de
// disciplina nem de paciente selecionado. Todo número de resumo é
// também um atalho — clicar filtra a lista logo abaixo ou abre o
// recurso relacionado (ver STAT_ROLE em cada seção).
//
// Documentos timbrados (2026-09-25): para o admin, mora aqui como aba
// própria e sai do menu solto do hub; quem não tem Gestão (profissional,
// recepção) continua abrindo pelo menu. Ver App.jsx (onOpenDocuments).
// ============================================================

const SECTIONS = [
  { id: 'faltosos', label: 'Faltosos' },
  { id: 'retornos', label: 'Retornos' },
  { id: 'profissionais', label: 'Profissionais' },
  { id: 'acessos', label: 'Acessos' },
  { id: 'pesquisa', label: 'Pesquisa de satisfação' },
  { id: 'indicadores', label: 'Indicadores' },
  { id: 'documentos', label: 'Documentos timbrados' },
  { id: 'personalizar', label: 'Personalizar' },
];

const TAB_ICONS = {
  faltosos: (
    <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5h.01" /></>
  ),
  retornos: (
    <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /></>
  ),
  profissionais: (
    <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 9.5a3 3 0 1 0 0-6" /><path d="M15 14.5c2.8.4 4.8 1.9 5.5 4" /></>
  ),
  acessos: (
    <><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>
  ),
  pesquisa: (
    <><path d="M12 3l2.6 5.9L21 9.6l-4.6 4.2L17.6 21 12 17.6 6.4 21l1.2-7.2L3 9.6l6.4-.7L12 3Z" /></>
  ),
  indicadores: (
    <><path d="M4 19h16" /><rect x="6" y="11" width="3" height="8" /><rect x="11" y="6" width="3" height="13" /><rect x="16" y="14" width="3" height="5" /></>
  ),
  documentos: (
    <><path d="M12 3v10" /><path d="m8 9 4 4 4-4" /><path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" /></>
  ),
  personalizar: (
    <><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.7-.9 1.4-1.9-.3-.9.3-1.8 1.3-1.8H17a4 4 0 0 0 4-4c0-5.1-4-10.3-9-10.3Z" /><circle cx="7.5" cy="11" r="1" /><circle cx="10" cy="7" r="1" /><circle cx="14.5" cy="7" r="1" /></>
  ),
};

const STAT_ICONS = {
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></>,
  return: <><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v4h4" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /></>,
  check: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  bars: <><path d="M4 19h16" /><rect x="6" y="11" width="3" height="8" /><rect x="11" y="6" width="3" height="13" /><rect x="16" y="14" width="3" height="5" /></>,
  star: <><path d="M12 3l2.6 5.9L21 9.6l-4.6 4.2L17.6 21 12 17.6 6.4 21l1.2-7.2L3 9.6l6.4-.7L12 3Z" /></>,
  cake: <><path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" /><path d="M4 17c1.2.8 2.2.8 3.4 0 1.2-.8 2.2-.8 3.4 0 1.2.8 2.2.8 3.4 0 1.2-.8 2.2-.8 3.4 0" /><path d="M9 12V8M12 12V8M15 12V8" /></>,
};

function Icon({ id, glyphs }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyphs[id]}
    </svg>
  );
}

function Stat({ icon, tone, value, label, active, onClick }) {
  return (
    <button
      type="button"
      className={`gt-stat${tone ? ` gt-stat-${tone}` : ''}${active ? ' gt-stat-active' : ''}`}
      onClick={onClick}
    >
      <span className="gt-stat-icon"><Icon id={icon} glyphs={STAT_ICONS} /></span>
      <span className="gt-stat-body"><b>{value}</b><span>{label}</span></span>
    </button>
  );
}

function Avatar({ name }) {
  return (
    <span className="gt-avatar" style={{ background: getAvatarColor(name) }}>{getInitials(name)}</span>
  );
}

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function DateChip({ iso }) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return <span className="gt-date-chip gt-date-chip-empty">—</span>;
  return (
    <span className="gt-date-chip">
      <span className="gt-date-chip-day">{String(date.getDate()).padStart(2, '0')}</span>
      <span className="gt-date-chip-month">{MONTH_SHORT[date.getMonth()]}</span>
    </span>
  );
}

function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return `${MONTH_SHORT[month - 1]}/${String(year).slice(2)}`;
}

function formatPercent(rate) {
  if (rate === null || rate === undefined) return '—';
  return `${Math.round(rate * 100)}%`;
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// Barra ranqueada única (faltas/cancelamentos, dia da semana, período do
// dia): largura relativa ao maior valor da própria lista, não a um teto
// fixo — o objetivo é comparar os itens entre si, não medir contra 100%.
function BarList({ items, emptyLabel }) {
  if (!items.length) return <p className="gt-empty">{emptyLabel}</p>;
  const max = Math.max(1, ...items.map(item => item.count));
  return (
    <ul className="gt-bars">
      {items.map(item => (
        <li key={item.id} className="gt-bar-row">
          <span className="gt-bar-label">{item.label}</span>
          <span className="gt-bar-track">
            <span className="gt-bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="gt-bar-value">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

// Barra empilhada de duas séries (novos vs. retorno por mês): largura
// total relativa ao maior total entre os meses, faixa de "novos" vem
// primeiro (destaque), "retorno" continua em seguida (neutro).
function StackedBarList({ items, emptyLabel }) {
  if (!items.length) return <p className="gt-empty">{emptyLabel}</p>;
  const max = Math.max(1, ...items.map(item => item.firstVisit + item.returning));
  return (
    <>
      <div className="gt-bar-legend">
        <span className="gt-bar-legend-item"><span className="gt-bar-legend-swatch" /> Novos</span>
        <span className="gt-bar-legend-item"><span className="gt-bar-legend-swatch gt-bar-legend-swatch--muted" /> Retorno</span>
      </div>
      <ul className="gt-bars">
        {items.map(item => {
          const total = item.firstVisit + item.returning;
          const firstPct = (item.firstVisit / max) * 100;
          const returningPct = (item.returning / max) * 100;
          return (
            <li key={item.monthKey} className="gt-bar-row">
              <span className="gt-bar-label">{monthLabel(item.monthKey)}</span>
              <span className="gt-bar-track">
                <span className="gt-bar-fill" style={{ width: `${firstPct}%` }} />
                <span className="gt-bar-fill gt-bar-fill--muted gt-bar-fill--stacked-end" style={{ left: `${firstPct}%`, width: `${returningPct}%` }} />
              </span>
              <span className="gt-bar-value">{total}</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

const ACCESS_ACTION_LABELS = { login: 'Entrou', logout: 'Saiu' };
const RETURN_THRESHOLD_OPTIONS = [15, 30, 45, 60, 90];

function toDayInput(date) {
  return date.toISOString().slice(0, 10);
}

function defaultRange() {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return { from: toDayInput(from), to: toDayInput(to) };
}

export function RelatoriosGestao({ profile, initialSection = null, onOpenBirthdays = null }) {
  const clinicId = profile?.clinic_id || null;
  const clinicName = profile?.clinic?.name || profile?.clinic_name || '';
  // Snapshot congelado na montagem: comparar contra Date.now() direto no
  // render/useMemo seria impuro (resultado mudaria a cada render sem
  // motivo). Nem a expiração da pesquisa nem o agrupamento de faltas por
  // semana precisam ser "ao vivo" na tela.
  const [now] = useState(() => Date.now());
  const [section, setSection] = useState(() => (
    SECTIONS.some(item => item.id === initialSection) ? initialSection : 'faltosos'
  ));
  const [range, setRange] = useState(defaultRange);
  const [professionalId, setProfessionalId] = useState('');
  const [statusFilter, setStatusFilter] = useState(''); // '' | 'no_show' | 'excused'
  const [patientQuery, setPatientQuery] = useState('');

  const [members, setMembers] = useState([]);
  const [patients, setPatients] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [returnThreshold, setReturnThreshold] = useState(30);
  const [returnItems, setReturnItems] = useState([]);
  const [returnLoading, setReturnLoading] = useState(true);
  const [returnError, setReturnError] = useState('');

  const professionalOptions = useMemo(
    () => members.map(member => ({ id: member.id, label: member.full_name })),
    [members],
  );
  const disciplineOptions = useMemo(
    () => DISCIPLINES.map(item => ({ id: item.id, label: item.label })),
    [],
  );

  useEffect(() => {
    if (section !== 'retornos') return undefined;
    let cancelled = false;

    (async () => {
      setReturnLoading(true);
      try {
        const [team, clinicPatients, awaiting] = await Promise.all([
          members.length ? Promise.resolve(members) : listClinicMembers(),
          patients.length ? Promise.resolve(patients) : listClinicPatients(),
          listPatientsAwaitingReturn({ minDays: returnThreshold }),
        ]);
        if (cancelled) return;
        if (!members.length) setMembers(team);
        if (!patients.length) setPatients(clinicPatients);
        setReturnItems([...awaiting].sort((a, b) => b.days_since - a.days_since));
        setReturnError('');
      } catch (err) {
        if (cancelled) return;
        setReturnError(err.message || 'Não foi possível carregar os retornos pendentes.');
        setReturnItems([]);
      } finally {
        if (!cancelled) setReturnLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, returnThreshold]);

  const [professionalsLoading, setProfessionalsLoading] = useState(true);
  const [professionalsError, setProfessionalsError] = useState('');
  const [savingAgendaFlagId, setSavingAgendaFlagId] = useState('');
  const [teamFilter, setTeamFilter] = useState(''); // '' | 'attending' | 'admin'
  const [showCreateProfessional, setShowCreateProfessional] = useState(false);
  const isClinicAdmin = profile?.role === 'clinic_admin';

  useEffect(() => {
    if (section !== 'profissionais') return undefined;
    let cancelled = false;

    (async () => {
      setProfessionalsLoading(true);
      try {
        const team = members.length ? members : await listClinicMembers();
        if (cancelled) return;
        if (!members.length) setMembers(team);
        setProfessionalsError('');
      } catch (err) {
        if (cancelled) return;
        setProfessionalsError(err.message || 'Não foi possível carregar a equipe.');
      } finally {
        if (!cancelled) setProfessionalsLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, members.length]);

  async function toggleMemberAgenda(member) {
    const next = member.has_agenda === false;
    setSavingAgendaFlagId(member.id);
    setMembers(prev => prev.map(item => (item.id === member.id ? { ...item, has_agenda: next } : item)));
    setProfessionalsError('');
    try {
      await setMemberHasAgenda(member.id, next);
    } catch (err) {
      setMembers(prev => prev.map(item => (item.id === member.id ? { ...item, has_agenda: !next } : item)));
      setProfessionalsError(err.message || 'Não foi possível atualizar quem atende.');
    } finally {
      setSavingAgendaFlagId('');
    }
  }

  const [accessItems, setAccessItems] = useState([]);
  const [accessLoading, setAccessLoading] = useState(true);
  const [accessError, setAccessError] = useState('');
  const [accessFilter, setAccessFilter] = useState(''); // '' | 'today' | 'unique'

  useEffect(() => {
    if (section !== 'acessos') return undefined;
    let cancelled = false;

    (async () => {
      setAccessLoading(true);
      try {
        const logs = await listClinicAccessLogs({ limit: 100 });
        if (cancelled) return;
        setAccessItems(logs);
        setAccessError('');
      } catch (err) {
        if (cancelled) return;
        setAccessError(err.message || 'Não foi possível carregar os acessos.');
        setAccessItems([]);
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [section]);

  const [surveyPatientId, setSurveyPatientId] = useState('');
  const [surveyAppointmentId, setSurveyAppointmentId] = useState('');
  const [patientAppointments, setPatientAppointments] = useState([]);
  const [patientAppointmentsLoading, setPatientAppointmentsLoading] = useState(false);
  const [surveyGenerating, setSurveyGenerating] = useState(false);
  const [surveyGeneratedLink, setSurveyGeneratedLink] = useState('');
  const [surveyCopied, setSurveyCopied] = useState(false);
  const [surveyError, setSurveyError] = useState('');
  const [surveys, setSurveys] = useState([]);
  const [surveysLoading, setSurveysLoading] = useState(true);
  const [surveysError, setSurveysError] = useState('');
  const [surveyProfessionalFilter, setSurveyProfessionalFilter] = useState('');
  const [surveyDisciplineFilter, setSurveyDisciplineFilter] = useState('');
  const [surveyStatusFilter, setSurveyStatusFilter] = useState(''); // '' | 'waiting' | 'rated'

  useEffect(() => {
    if (section !== 'pesquisa') return undefined;
    let cancelled = false;

    (async () => {
      setSurveysLoading(true);
      try {
        const [clinicPatients, list, team] = await Promise.all([
          patients.length ? Promise.resolve(patients) : listClinicPatients(),
          listSatisfactionSurveys({ limit: 100 }),
          members.length ? Promise.resolve(members) : listClinicMembers(),
        ]);
        if (cancelled) return;
        if (!patients.length) setPatients(clinicPatients);
        if (!members.length) setMembers(team);
        setSurveys(list);
        setSurveysError('');
      } catch (err) {
        if (cancelled) return;
        setSurveysError(err.message || 'Não foi possível carregar as pesquisas.');
        setSurveys([]);
      } finally {
        if (!cancelled) setSurveysLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  // Atendimento relacionado (Fase 8): sem isto a pesquisa só sabia o
  // paciente, nunca por qual profissional/disciplina — impossível
  // filtrar depois quem está sendo comentado.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!surveyPatientId) {
        setPatientAppointments([]);
        setSurveyAppointmentId('');
        return;
      }
      setPatientAppointmentsLoading(true);
      try {
        const list = await listAppointments({ patientId: surveyPatientId });
        if (cancelled) return;
        const recent = list
          .filter(item => item.kind === 'appointment')
          .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
          .slice(0, 10);
        setPatientAppointments(recent);
        setSurveyAppointmentId(recent[0]?.id || '');
      } catch {
        if (!cancelled) setPatientAppointments([]);
      } finally {
        if (!cancelled) setPatientAppointmentsLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [surveyPatientId]);

  const [dashboardPreset, setDashboardPreset] = useState('month');
  const [dashboardProfessionalId, setDashboardProfessionalId] = useState('');
  const [dashboardDiscipline, setDashboardDiscipline] = useState('');
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState('');
  const absencesSectionRef = useRef(null);

  useEffect(() => {
    if (section !== 'indicadores') return undefined;
    let cancelled = false;

    (async () => {
      setDashboardLoading(true);
      try {
        const team = members.length ? members : await listClinicMembers();
        const clinicPatients = patients.length ? patients : await listClinicPatients();
        if (cancelled) return;
        if (!members.length) setMembers(team);
        if (!patients.length) setPatients(clinicPatients);

        const { from, to } = presetToRange(dashboardPreset);
        const metrics = await loadDashboardMetrics({
          from,
          to,
          professionalId: dashboardProfessionalId || null,
          discipline: dashboardDiscipline || null,
          patients: clinicPatients,
        });
        if (cancelled) return;
        setDashboardData(metrics);
        setDashboardError('');
      } catch (err) {
        if (cancelled) return;
        setDashboardError(err.message || 'Não foi possível carregar os indicadores.');
        setDashboardData(null);
      } finally {
        if (!cancelled) setDashboardLoading(false);
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, dashboardPreset, dashboardProfessionalId, dashboardDiscipline]);

  async function handleGenerateSurvey(e) {
    e.preventDefault();
    if (!surveyPatientId) return;
    setSurveyError('');
    setSurveyGeneratedLink('');
    setSurveyCopied(false);
    setSurveyGenerating(true);
    try {
      const created = await createSatisfactionSurvey({
        patientId: surveyPatientId,
        appointmentId: surveyAppointmentId || null,
        clinicId,
      });
      const link = buildSurveyLink(created.token);
      setSurveyGeneratedLink(link);
      setSurveys(prev => [created, ...prev]);
      setSurveyPatientId('');
    } catch (err) {
      setSurveyError(err.message || 'Não foi possível gerar a pesquisa.');
    } finally {
      setSurveyGenerating(false);
    }
  }

  async function handleCopySurveyLink() {
    if (!surveyGeneratedLink) return;
    try {
      await navigator.clipboard.writeText(surveyGeneratedLink);
      setSurveyCopied(true);
    } catch {
      setSurveyCopied(false);
    }
  }

  function surveyStatus(survey) {
    if (survey.responded_at) return { label: `Nota ${survey.rating}/5`, tone: 'success', rated: true };
    if (new Date(survey.expires_at).getTime() < now) return { label: 'Expirada', tone: 'neutral', rated: false };
    return { label: 'Aguardando resposta', tone: 'pending', rated: false };
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [team, clinicPatients, missed] = await Promise.all([
          listClinicMembers(),
          listClinicPatients(),
          listMissedAppointments({
            from: new Date(`${range.from}T00:00:00`).toISOString(),
            to: new Date(`${range.to}T23:59:59`).toISOString(),
            professionalId: professionalId || null,
          }),
        ]);
        if (cancelled) return;
        setMembers(team);
        setPatients(clinicPatients);
        setItems(missed);
        setError('');
      } catch (err) {
        if (cancelled) return;
        setError(err.message || 'Não foi possível carregar o relatório.');
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [range.from, range.to, professionalId]);

  function patientName(id) {
    return patients.find(item => item.id === id)?.name || 'Paciente';
  }

  function patientPhone(id) {
    return patients.find(item => item.id === id)?.phone || '';
  }

  function professionalName(id) {
    const found = members.find(item => item.id === id);
    return found ? shortName(found.full_name) : 'profissional';
  }

  const filtered = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    let list = items;
    if (statusFilter) list = list.filter(item => item.status === statusFilter);
    if (query) list = list.filter(item => patientName(item.patient_id).toLowerCase().includes(query));
    return [...list].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, patientQuery, statusFilter, patients]);

  const faltososCounts = useMemo(() => ({
    total: items.length,
    noShow: items.filter(item => item.status === 'no_show').length,
    excused: items.filter(item => item.status === 'excused').length,
  }), [items]);

  // Agrupado por urgência (mesma ideia de utils/agenda.js upcomingBirthdays):
  // lista de faltas costuma crescer rápido, e "tudo junto" era difícil de
  // escanear pra quem só quer ver o que aconteceu essa semana.
  const faltososGroups = useMemo(() => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const groups = { week: [], older: [] };
    for (const item of filtered) {
      const age = now - new Date(item.starts_at).getTime();
      (age <= week ? groups.week : groups.older).push(item);
    }
    return groups;
  }, [filtered, now]);

  const returnStats = useMemo(() => {
    if (!returnItems.length) return { max: 0, avg: 0 };
    const days = returnItems.map(item => item.days_since);
    return {
      max: Math.max(...days),
      avg: Math.round(days.reduce((sum, value) => sum + value, 0) / days.length),
    };
  }, [returnItems]);

  const teamStats = useMemo(() => ({
    total: members.length,
    attending: members.filter(member => member.has_agenda !== false).length,
    admins: members.filter(member => member.role === 'clinic_admin').length,
  }), [members]);

  const filteredMembers = useMemo(() => {
    if (teamFilter === 'attending') return members.filter(member => member.has_agenda !== false);
    if (teamFilter === 'admin') return members.filter(member => member.role === 'clinic_admin');
    return members;
  }, [members, teamFilter]);

  const accessStats = useMemo(() => {
    const todayKey = new Date().toDateString();
    const uniquePeople = new Set(accessItems.map(item => item.actor_name));
    return {
      total: accessItems.length,
      today: accessItems.filter(item => new Date(item.created_at).toDateString() === todayKey).length,
      unique: uniquePeople.size,
    };
  }, [accessItems]);

  const filteredAccessItems = useMemo(() => {
    if (accessFilter === 'today') {
      const todayKey = new Date().toDateString();
      return accessItems.filter(item => new Date(item.created_at).toDateString() === todayKey);
    }
    if (accessFilter === 'unique') {
      const seen = new Set();
      const result = [];
      for (const item of accessItems) {
        if (seen.has(item.actor_name)) continue;
        seen.add(item.actor_name);
        result.push(item);
      }
      return result;
    }
    return accessItems;
  }, [accessItems, accessFilter]);

  const surveyStats = useMemo(() => {
    const responded = surveys.filter(item => item.responded_at);
    const rate = surveys.length ? responded.length / surveys.length : 0;
    const avg = responded.length
      ? responded.reduce((sum, item) => sum + item.rating, 0) / responded.length
      : 0;
    return { total: surveys.length, rate, avg };
  }, [surveys]);

  const filteredSurveys = useMemo(() => {
    let list = surveys;
    if (surveyProfessionalFilter) {
      list = list.filter(item => item.appointments?.professional_id === surveyProfessionalFilter);
    }
    if (surveyDisciplineFilter) {
      list = list.filter(item => item.appointments?.discipline === surveyDisciplineFilter);
    }
    if (surveyStatusFilter === 'waiting') {
      list = list.filter(item => !surveyStatus(item).rated && surveyStatus(item).label !== 'Expirada');
    } else if (surveyStatusFilter === 'rated') {
      list = [...list.filter(item => surveyStatus(item).rated)].sort((a, b) => a.rating - b.rating);
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surveys, surveyProfessionalFilter, surveyDisciplineFilter, surveyStatusFilter, now]);

  return (
    <div className="gt">
      {/* no-print: a aba Documentos imprime a folha timbrada daqui de dentro. */}
      <div className="gt-tabs no-print" role="tablist" aria-label="Relatórios de gestão">
        {SECTIONS.map(item => (
          <button
            key={item.id}
            type="button"
            className="gt-tab"
            aria-pressed={section === item.id}
            onClick={() => setSection(item.id)}
          >
            <Icon id={item.id} glyphs={TAB_ICONS} />
            {item.label}
          </button>
        ))}
      </div>

      {section === 'faltosos' && (
        <section>
          <p className="gt-note">
            Atendimentos marcados como &quot;não compareceu&quot; ou &quot;faltou com
            aviso&quot; no período. Busque pelo nome do paciente para ver só as
            faltas dele — data, horário e status de cada uma.
          </p>

          <div className="gt-stat-row">
            <Stat icon="agenda" value={faltososCounts.total} label="Faltas no período" active={!statusFilter} onClick={() => setStatusFilter('')} />
            <Stat icon="alert" tone="danger" value={faltososCounts.noShow} label="Sem aviso" active={statusFilter === 'no_show'} onClick={() => setStatusFilter(prev => (prev === 'no_show' ? '' : 'no_show'))} />
            <Stat icon="clock" tone="warning" value={faltososCounts.excused} label="Com aviso" active={statusFilter === 'excused'} onClick={() => setStatusFilter(prev => (prev === 'excused' ? '' : 'excused'))} />
          </div>

          <div className="gt-filters">
            <div className="gt-field">
              <label htmlFor="gt-from">De</label>
              <input id="gt-from" type="date" className="gt-input" value={range.from} onChange={e => setRange(prev => ({ ...prev, from: e.target.value }))} />
            </div>
            <div className="gt-field">
              <label htmlFor="gt-to">Até</label>
              <input id="gt-to" type="date" className="gt-input" value={range.to} onChange={e => setRange(prev => ({ ...prev, to: e.target.value }))} />
            </div>
            {members.length > 1 && (
              <div className="gt-field gt-field--grow">
                <label htmlFor="gt-prof">Profissional</label>
                <SearchSelect
                  id="gt-prof"
                  value={professionalId}
                  onChange={setProfessionalId}
                  options={professionalOptions}
                  placeholder="Toda a equipe"
                  emptyOptionLabel="Toda a equipe"
                />
              </div>
            )}
            <input
              type="text"
              className="gt-search"
              placeholder="Buscar paciente pelo nome…"
              value={patientQuery}
              onChange={e => setPatientQuery(e.target.value)}
              aria-label="Buscar paciente pelo nome"
            />
          </div>

          {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}

          {loading ? (
            <p className="gt-empty">Carregando…</p>
          ) : filtered.length === 0 ? (
            <p className="gt-empty">Nenhuma falta no período.</p>
          ) : (
            <>
              {faltososGroups.week.length > 0 && (
                <div className="gt-group">
                  <p className="gt-group-title">Esta semana <span className="gt-group-count">{faltososGroups.week.length}</span></p>
                  <ul className="gt-list">
                    {faltososGroups.week.map(appointment => (
                      <li key={appointment.id} className={`gt-card gt-card-${appointment.status === 'no_show' ? 'danger' : 'warning'}`}>
                        <DateChip iso={appointment.starts_at} />
                        <Avatar name={patientName(appointment.patient_id)} />
                        <div className="gt-card-info">
                          <span className="gt-card-name">{patientName(appointment.patient_id)}</span>
                          <span className="gt-card-meta">
                            {[formatTime(appointment.starts_at), professionalName(appointment.professional_id), appointment.discipline].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                        <span className={`gt-badge gt-badge-${appointment.status}`}>{getStatusLabel(appointment.status)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {faltososGroups.older.length > 0 && (
                <div className="gt-group">
                  <p className="gt-group-title">Mais antigas <span className="gt-group-count">{faltososGroups.older.length}</span></p>
                  <ul className="gt-list">
                    {faltososGroups.older.map(appointment => (
                      <li key={appointment.id} className={`gt-card gt-card-${appointment.status === 'no_show' ? 'danger' : 'warning'}`}>
                        <DateChip iso={appointment.starts_at} />
                        <Avatar name={patientName(appointment.patient_id)} />
                        <div className="gt-card-info">
                          <span className="gt-card-name">{patientName(appointment.patient_id)}</span>
                          <span className="gt-card-meta">
                            {[formatTime(appointment.starts_at), professionalName(appointment.professional_id), appointment.discipline].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                        <span className={`gt-badge gt-badge-${appointment.status}`}>{getStatusLabel(appointment.status)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {section === 'retornos' && (
        <section>
          <p className="gt-note">
            Pacientes cujo último atendimento não teve retorno agendado depois.
            Clique num número para focar direto naquele recorte, ou ajuste o limite manualmente.
          </p>

          <div className="gt-stat-row">
            <Stat icon="people" value={returnItems.length} label="Aguardando retorno" active={returnThreshold === 30} onClick={() => setReturnThreshold(30)} />
            <Stat icon="clock" tone="warning" value={returnStats.max} label="Mais dias sem voltar" active={returnThreshold === returnStats.max && returnStats.max > 0} onClick={() => returnStats.max > 0 && setReturnThreshold(returnStats.max)} />
            <Stat icon="bars" value={returnStats.avg} label="Média de dias" active={returnThreshold === returnStats.avg && returnStats.avg > 0} onClick={() => returnStats.avg > 0 && setReturnThreshold(returnStats.avg)} />
          </div>

          <div className="gt-filters">
            <div className="gt-field">
              <label htmlFor="gt-threshold">Dias sem retorno (mín.)</label>
              <select id="gt-threshold" className="gt-select" value={returnThreshold} onChange={e => setReturnThreshold(Number(e.target.value))}>
                {RETURN_THRESHOLD_OPTIONS.map(option => (
                  <option key={option} value={option}>{option} dias</option>
                ))}
                {!RETURN_THRESHOLD_OPTIONS.includes(returnThreshold) && (
                  <option value={returnThreshold}>{returnThreshold} dias</option>
                )}
              </select>
            </div>
          </div>

          {returnError && <div className="gt-notice gt-notice-error" role="alert">{returnError}</div>}

          {returnLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : returnItems.length === 0 ? (
            <p className="gt-empty">Ninguém passou de {returnThreshold} dias sem retorno.</p>
          ) : (
            <ul className="gt-list">
              {returnItems.map(item => {
                const name = item.patient_name || patientName(item.patient_id);
                const phone = patientPhone(item.patient_id);
                const canWhatsApp = isLikelyValidWhatsAppPhone(phone);
                return (
                  <li key={item.patient_id} className="gt-card gt-card-warning">
                    <DateChip iso={item.last_attended_at} />
                    <Avatar name={name} />
                    <div className="gt-card-info">
                      <span className="gt-card-name">{name}</span>
                      <span className="gt-card-meta">{professionalName(item.professional_id)}</span>
                    </div>
                    <span className="gt-badge gt-badge-excused">{item.days_since} dias</span>
                    {canWhatsApp && (
                      <a
                        className="gt-wa-btn"
                        href={buildWhatsAppLink({ phone, message: `Oi, ${name.split(' ')[0]}! Faz um tempinho que a gente não se vê por aqui — bora marcar seu retorno?` })}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm5.6 14.3c-.2.6-1.3 1.2-1.9 1.3-.5.1-1.1.1-1.8-.1-.4-.1-1-.3-1.7-.6-2.9-1.3-4.8-4.2-5-4.4-.1-.2-1.2-1.6-1.2-3s.7-2.1 1-2.4c.3-.3.6-.4.8-.4h.6c.2 0 .4 0 .6.5.2.5.7 1.8.8 1.9.1.1.1.3 0 .5-.1.2-.1.3-.3.5l-.4.5c-.1.2-.3.4-.1.7.2.3.9 1.4 1.9 2.3 1.3 1.1 2.4 1.5 2.7 1.6.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1.2.1 1.5.7 1.8.8.3.1.4.2.5.3.1.2.1.7-.1 1.3Z" /></svg>
                        Chamar no WhatsApp
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {section === 'profissionais' && (
        <section>
          <p className="gt-note">
            Quem atende paciente aparece como profissional na Agenda (chip de agenda
            pessoal e seletor de novo agendamento). Desmarque quem é só administrativo
            — não deixa de ser membro da equipe, só sai da lista de quem pode ser
            escolhido pra atender. Só administrador da clínica pode alterar.
          </p>

          <div className="gt-stat-row">
            <Stat icon="people" value={teamStats.total} label="Profissionais na equipe" active={!teamFilter} onClick={() => setTeamFilter('')} />
            <Stat icon="check" value={teamStats.attending} label="Atendem (na agenda)" active={teamFilter === 'attending'} onClick={() => setTeamFilter(prev => (prev === 'attending' ? '' : 'attending'))} />
            <Stat icon="bars" value={teamStats.admins} label="Administradores" active={teamFilter === 'admin'} onClick={() => setTeamFilter(prev => (prev === 'admin' ? '' : 'admin'))} />
          </div>

          {isClinicAdmin && (
            <div className="gt-create-professional">
              {!showCreateProfessional ? (
                <button type="button" className="gt-btn gt-btn--primary" onClick={() => setShowCreateProfessional(true)}>
                  + Novo profissional
                </button>
              ) : (
                <ProfessionalCreateForm
                  clinics={clinicId ? [{ id: clinicId, name: clinicName }] : []}
                  lockedClinicId={clinicId}
                  lockedClinicName={clinicName}
                  kicker="Sua equipe"
                  heading="Novo profissional"
                  onCancel={() => setShowCreateProfessional(false)}
                  onCreated={async () => {
                    setShowCreateProfessional(false);
                    try {
                      setMembers(await listClinicMembers());
                    } catch {
                      // lista recarrega na próxima visita à aba se isto falhar
                    }
                  }}
                />
              )}
            </div>
          )}

          {professionalsError && <div className="gt-notice gt-notice-error" role="alert">{professionalsError}</div>}

          {professionalsLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : filteredMembers.length === 0 ? (
            <p className="gt-empty">Nenhum profissional nesse recorte.</p>
          ) : (
            <ul className="gt-list">
              {filteredMembers.map(member => (
                <li key={member.id} className="gt-card">
                  <Avatar name={member.full_name} />
                  <div className="gt-card-info">
                    <span className="gt-card-name">
                      {member.full_name}
                      {member.role === 'clinic_admin' && <span className="gt-tag">Admin</span>}
                      {member.role === 'receptionist' && <span className="gt-tag">Recepção</span>}
                    </span>
                    <span className="gt-card-meta">{member.profession}</span>
                  </div>
                  {member.role === 'receptionist' ? (
                    <span className="gt-switch-field" title="Recepção não atende paciente — não aparece como opção na agenda.">
                      Não atende
                    </span>
                  ) : (
                    <label className="gt-switch-field">
                      Atende
                      <span className={`gt-switch${member.has_agenda !== false ? ' gt-switch-on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={member.has_agenda !== false}
                          disabled={savingAgendaFlagId === member.id}
                          onChange={() => toggleMemberAgenda(member)}
                        />
                        <span className="gt-switch-thumb" />
                      </span>
                    </label>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === 'acessos' && (
        <section>
          <p className="gt-note">
            Login e logout de quem acessa o sistema nesta instituição.
            Visível só para administrador da clínica.
          </p>

          <div className="gt-stat-row">
            <Stat icon="agenda" value={accessStats.total} label="Acessos registrados" active={!accessFilter} onClick={() => setAccessFilter('')} />
            <Stat icon="check" value={accessStats.today} label="Logins hoje" active={accessFilter === 'today'} onClick={() => setAccessFilter(prev => (prev === 'today' ? '' : 'today'))} />
            <Stat icon="people" value={accessStats.unique} label="Pessoas diferentes" active={accessFilter === 'unique'} onClick={() => setAccessFilter(prev => (prev === 'unique' ? '' : 'unique'))} />
          </div>

          {accessError && <div className="gt-notice gt-notice-error" role="alert">{accessError}</div>}

          {accessLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : filteredAccessItems.length === 0 ? (
            <p className="gt-empty">Nenhum acesso registrado ainda.</p>
          ) : (
            <ul className="gt-list">
              {filteredAccessItems.map(log => (
                <li key={log.id} className="gt-card">
                  <DateChip iso={log.created_at} />
                  <Avatar name={log.actor_name || 'Usuário'} />
                  <div className="gt-card-info">
                    <span className="gt-card-name">{log.actor_name || 'Usuário'}</span>
                    <span className="gt-card-meta">{formatTime(log.created_at)}</span>
                  </div>
                  <span className={`gt-badge gt-badge-${log.action}`}>{ACCESS_ACTION_LABELS[log.action] || log.action}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === 'pesquisa' && (
        <section>
          <p className="gt-note">
            Gere um link com nota de 1 a 5 e comentário livre, amarrado a um atendimento
            específico — assim dá pra ver depois quais profissionais e disciplinas estão
            sendo comentados. O paciente responde sem login; o link expira em 14 dias ou
            assim que respondido.
          </p>

          <div className="gt-stat-row">
            <Stat icon="agenda" value={surveyStats.total} label="Pesquisas enviadas" active={!surveyStatusFilter} onClick={() => setSurveyStatusFilter('')} />
            <Stat icon="check" value={formatPercent(surveyStats.rate)} label="Taxa de resposta" active={surveyStatusFilter === 'waiting'} onClick={() => setSurveyStatusFilter(prev => (prev === 'waiting' ? '' : 'waiting'))} />
            <Stat icon="star" value={surveyStats.avg ? surveyStats.avg.toFixed(1) : '—'} label="Nota média" active={surveyStatusFilter === 'rated'} onClick={() => setSurveyStatusFilter(prev => (prev === 'rated' ? '' : 'rated'))} />
          </div>

          {members.length > 1 && (
            <div className="gt-filters">
              <div className="gt-field gt-field--grow">
                <label htmlFor="gt-survey-prof-filter">Profissional</label>
                <SearchSelect id="gt-survey-prof-filter" value={surveyProfessionalFilter} onChange={setSurveyProfessionalFilter} options={professionalOptions} placeholder="Todos os profissionais" emptyOptionLabel="Todos os profissionais" />
              </div>
              <div className="gt-field gt-field--grow">
                <label htmlFor="gt-survey-disc-filter">Disciplina</label>
                <SearchSelect id="gt-survey-disc-filter" value={surveyDisciplineFilter} onChange={setSurveyDisciplineFilter} options={disciplineOptions} placeholder="Todas as disciplinas" emptyOptionLabel="Todas as disciplinas" />
              </div>
            </div>
          )}
          {(surveyProfessionalFilter || surveyDisciplineFilter) && (
            <p className="gt-filter-note">Mostrando <b>{filteredSurveys.length} de {surveys.length}</b> pesquisas</p>
          )}

          <form className="gt-filters" onSubmit={handleGenerateSurvey}>
            <div className="gt-field gt-field--grow">
              <label htmlFor="gt-survey-patient">Paciente</label>
              <SearchSelect
                id="gt-survey-patient"
                value={surveyPatientId}
                onChange={setSurveyPatientId}
                options={patients.map(patient => ({ id: patient.id, label: patient.name, avatar: true }))}
                placeholder="Digite o nome do paciente…"
                allowEmpty={false}
              />
            </div>
            <div className="gt-field gt-field--grow">
              <label htmlFor="gt-survey-appointment">Atendimento relacionado</label>
              <SearchSelect
                id="gt-survey-appointment"
                value={surveyAppointmentId}
                onChange={setSurveyAppointmentId}
                disabled={!surveyPatientId || patientAppointmentsLoading}
                options={patientAppointments.map(appointment => ({
                  id: appointment.id,
                  label: `${new Date(appointment.starts_at).toLocaleDateString('pt-BR')} · ${professionalName(appointment.professional_id)} · ${getDiscipline(appointment.discipline)?.label || appointment.discipline}`,
                }))}
                placeholder={patientAppointmentsLoading ? 'Carregando atendimentos…' : 'Selecione o atendimento'}
                emptyLabel="Este paciente ainda não tem atendimento registrado."
                allowEmpty={false}
              />
            </div>
            <button type="submit" className="gt-btn gt-btn--primary" disabled={!surveyPatientId || !clinicId || surveyGenerating}>
              {surveyGenerating ? 'Gerando…' : 'Gerar link'}
            </button>
          </form>

          {surveyError && <div className="gt-notice gt-notice-error" role="alert">{surveyError}</div>}

          {surveyGeneratedLink && (
            <div className="gt-notice gt-survey-link">
              <code>{surveyGeneratedLink}</code>
              <button type="button" className="gt-btn gt-btn--sm" onClick={handleCopySurveyLink}>
                {surveyCopied ? 'Copiado!' : 'Copiar link'}
              </button>
            </div>
          )}

          {surveysError && <div className="gt-notice gt-notice-error" role="alert">{surveysError}</div>}

          {surveysLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : filteredSurveys.length === 0 ? (
            <p className="gt-empty">Nenhuma pesquisa nesse recorte.</p>
          ) : (
            <ul className="gt-list">
              {filteredSurveys.map(survey => {
                const status = surveyStatus(survey);
                const name = patientName(survey.patient_id);
                const disciplineLabel = survey.appointments?.discipline ? getDiscipline(survey.appointments.discipline)?.label : null;
                const professionalLabel = survey.appointments?.professional_id ? professionalName(survey.appointments.professional_id) : null;
                return (
                  <li key={survey.id} className={`gt-card${status.rated ? ' gt-card-gold' : status.tone === 'pending' ? ' gt-card-warning' : ''}`}>
                    <DateChip iso={survey.created_at} />
                    <Avatar name={name} />
                    <div className="gt-card-info">
                      <span className="gt-card-name">{name}</span>
                      <span className="gt-card-meta">
                        {[professionalLabel, disciplineLabel].filter(Boolean).join(' · ') || 'Sem atendimento vinculado'}
                      </span>
                      {status.rated && (
                        <span className="gt-stars" aria-hidden="true">
                          {[1, 2, 3, 4, 5].map(n => (
                            <svg key={n} viewBox="0 0 24 24" className={n <= survey.rating ? 'gt-star-on' : 'gt-star-off'}>
                              <path d="M12 3l2.6 5.9L21 9.6l-4.6 4.2L17.6 21 12 17.6 6.4 21l1.2-7.2L3 9.6l6.4-.7L12 3Z" />
                            </svg>
                          ))}
                        </span>
                      )}
                      {survey.comment && <span className="gt-card-comment">&quot;{survey.comment}&quot;</span>}
                    </div>
                    <span className={`gt-badge gt-badge-${status.tone}`}>{status.label}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {section === 'indicadores' && (
        <section>
          <p className="gt-note">
            Panorama do período: faltas e cancelamentos, horários mais
            procurados e novos pacientes vs. retorno.
          </p>

          <div className="gt-filters">
            <div className="gt-field">
              <label htmlFor="gt-dash-preset">Período</label>
              <select id="gt-dash-preset" className="gt-select" value={dashboardPreset} onChange={e => setDashboardPreset(e.target.value)}>
                {DASHBOARD_PERIOD_PRESETS.map(option => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </div>
            {members.length > 1 && (
              <div className="gt-field gt-field--grow">
                <label htmlFor="gt-dash-prof">Profissional</label>
                <SearchSelect id="gt-dash-prof" value={dashboardProfessionalId} onChange={setDashboardProfessionalId} options={professionalOptions} placeholder="Toda a equipe" emptyOptionLabel="Toda a equipe" />
              </div>
            )}
            <div className="gt-field gt-field--grow">
              <label htmlFor="gt-dash-discipline">Disciplina</label>
              <SearchSelect id="gt-dash-discipline" value={dashboardDiscipline} onChange={setDashboardDiscipline} options={disciplineOptions} placeholder="Toda disciplina" emptyOptionLabel="Toda disciplina" />
            </div>
          </div>

          {dashboardError && <div className="gt-notice gt-notice-error" role="alert">{dashboardError}</div>}

          {dashboardLoading ? (
            <p className="gt-empty">Carregando…</p>
          ) : !dashboardData ? null : (
            <>
              <div className="gt-kpis">
                <button type="button" className="gt-kpi gt-kpi-clickable" onClick={() => absencesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  <span className="gt-kpi-icon"><Icon id="alert" glyphs={STAT_ICONS} /></span>
                  <span className="gt-kpi-body">
                    <span className="gt-kpi-label">Faltas e cancelamentos</span>
                    <span className="gt-kpi-value">{dashboardData.absences.total}</span>
                    <span className="gt-kpi-sub">ver detalhe abaixo ↓</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="gt-kpi gt-kpi-clickable"
                  onClick={() => onOpenBirthdays?.()}
                  disabled={!onOpenBirthdays}
                >
                  <span className="gt-kpi-icon"><Icon id="cake" glyphs={STAT_ICONS} /></span>
                  <span className="gt-kpi-body">
                    <span className="gt-kpi-label">Aniversariantes do mês</span>
                    <span className="gt-kpi-value">{dashboardData.birthdays.length}</span>
                    <span className="gt-kpi-sub">{onOpenBirthdays ? 'abrir lista completa ↗' : 'independente do período acima'}</span>
                  </span>
                </button>
              </div>

              <div ref={absencesSectionRef} className="gt-chart-grid">
                <div className="gt-chart-card">
                  <h4>Faltas e cancelamentos por profissional</h4>
                  <BarList
                    items={dashboardData.absences.byProfessional.map(item => ({ ...item, label: professionalName(item.id) }))}
                    emptyLabel="Nenhuma falta ou cancelamento no período."
                  />
                </div>
                <div className="gt-chart-card">
                  <h4>Faltas e cancelamentos por disciplina</h4>
                  <BarList items={dashboardData.absences.byDiscipline} emptyLabel="Nenhuma falta ou cancelamento no período." />
                </div>
                <div className="gt-chart-card">
                  <h4>Atendimentos por dia da semana</h4>
                  <BarList items={dashboardData.byWeekday} emptyLabel="Nenhum atendimento no período." />
                </div>
                <div className="gt-chart-card">
                  <h4>Atendimentos por período do dia</h4>
                  <BarList items={dashboardData.byTimeOfDay} emptyLabel="Nenhum atendimento no período." />
                </div>
                <div className="gt-chart-card gt-chart-card--wide">
                  <h4>Pacientes novos vs. retorno por mês</h4>
                  <StackedBarList
                    items={dashboardData.newVsReturning}
                    emptyLabel="Nenhum atendimento classificado como primeira vez ou retorno no período."
                  />
                </div>
              </div>
            </>
          )}
        </section>
      )}

      {section === 'documentos' && (
        <Suspense fallback={<p className="gt-note">Carregando documentos…</p>}>
          <DocumentosTimbrados therapistProfile={profile} />
        </Suspense>
      )}

      {section === 'personalizar' && <PersonalizarClinica profile={profile} />}
    </div>
  );
}

export default RelatoriosGestao;
