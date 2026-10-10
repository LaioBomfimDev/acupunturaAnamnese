import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { getStatusLabel } from '../../utils/agenda';
import { DASHBOARD_PERIOD_PRESETS, presetToRange } from '../../utils/gestaoDashboard';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import { getAvatarColor, getInitials, isDeleteConfirmationValid } from '../../utils/patientUi';
import {
  SURVEY_PERIOD_MODES,
  canAdvanceSurveyPeriod,
  isInSurveyPeriod,
  shiftSurveyPeriod,
  surveyDeletedMessage,
  surveyDeletionSummary,
  surveyPeriodLabel,
  surveyPeriodRange,
  surveySelectionLabel,
  surveyStats as computeSurveyStats,
} from '../../utils/gestaoSurveys';
import { buildWhatsAppLink, isLikelyValidWhatsAppPhone } from '../../utils/whatsapp';
import { listAppointments, listMissedAppointments, listPatientsAwaitingReturn } from '../../services/appointmentService';
import { listClinicMembers, setMemberHasAgenda, shortName } from '../../services/clinicMembersService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { listClinicAccessLogs } from '../../services/clinicAccessLogService';
import { loadDashboardMetrics } from '../../services/gestaoDashboardService';
import {
  SURVEY_DELETE_MIGRATION_HINT,
  buildSurveyLink,
  createSatisfactionSurvey,
  deleteSatisfactionSurveys,
  listSatisfactionSurveys,
} from '../../services/satisfactionSurveyService';
import { SearchSelect } from '../ui/SearchSelect';
import { ScreenHelp } from '../ui/ScreenHelp';
import { GESTAO_HELP } from '../../data/screenHelp';
import { GestaoNav, GestaoSectionHead } from './GestaoNav';
import { GestaoResumo } from './GestaoResumo';
import { HubBackButton } from '../HubNav';
import { loadGestaoSummary } from '../../services/gestaoSummaryService';
import { summaryDisplay } from '../../utils/gestaoSummary';
import { ProfessionalCreateForm } from './ProfessionalCreateForm';
import { PersonalizarClinica } from './PersonalizarClinica';
import { MeuCadastro } from './MeuCadastro';
import { AcessoPaciente } from './AcessoPaciente';
import '../../styles/gestao.css';

// Mesmo componente que profissional e recepção abrem pelo menu do hub;
// lazy para o conversor de Word não pesar nas outras abas da Gestão.
const DocumentosTimbrados = lazy(() => import('./DocumentosTimbrados')
  .then(module => ({ default: module.DocumentosTimbrados })));

// Importáveis (formulários que o paciente responde na Área do Paciente):
// editor, respostas e exportação só carregam quando a aba abre.
const Importaveis = lazy(() => import('../patientForms/Importaveis')
  .then(module => ({ default: module.Importaveis })));

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
  { id: 'resumo', label: 'Resumo' },
  { id: 'indicadores', label: 'Indicadores' },
  { id: 'faltosos', label: 'Faltosos' },
  { id: 'retornos', label: 'Retornos' },
  { id: 'pesquisa', label: 'Pesquisa de satisfação' },
  { id: 'importaveis', label: 'Importáveis' },
  { id: 'profissionais', label: 'Profissionais' },
  { id: 'acessos', label: 'Acessos' },
  { id: 'documentos', label: 'Documentos timbrados' },
  { id: 'personalizar', label: 'Personalizar' },
  { id: 'acessopaciente', label: 'Acesso do paciente' },
  { id: 'cadastro', label: 'Meu cadastro' },
];

// Dois lados (08/10/2026, pedido da administradora: "já tem muito lá em
// gestão"): Gestão é o dia a dia, Configurações é o que se ajusta uma vez
// só. Cada lado mostra só os próprios grupos no menu.
const SIDES = [
  { id: 'gestao', label: 'Gestão' },
  { id: 'configuracoes', label: 'Configurações' },
];

// Ordem do menu (2026-09-30): primeiro o panorama, depois o que pede ação
// com paciente e a equipe. Área do Paciente (2026-10-06): formulários que
// o paciente responde online. Resumo (opção B, 10/10/2026): a entrada,
// um quadro com número por aba; no celular é o índice da Gestão.
const SECTION_GROUPS = [
  { side: 'gestao', label: 'Visão geral', ids: ['resumo'] },
  { side: 'gestao', label: 'Atendimentos', ids: ['indicadores', 'faltosos', 'retornos', 'pesquisa'] },
  { side: 'gestao', label: 'Área do Paciente', ids: ['importaveis'] },
  { side: 'gestao', label: 'Equipe', ids: ['profissionais', 'acessos'] },
  { side: 'gestao', label: 'Documentos', ids: ['documentos'] },
  { side: 'configuracoes', label: 'Instituição', ids: ['personalizar', 'acessopaciente'] },
  { side: 'configuracoes', label: 'Sua conta', ids: ['cadastro'] },
];

function sideOf(sectionId) {
  return SECTION_GROUPS.find(group => group.ids.includes(sectionId))?.side || SIDES[0].id;
}

const TAB_ICONS = {
  resumo: (
    <><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>
  ),
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
  importaveis: (
    <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="m8.5 11 1.5 1.5 3-3" /><path d="M8.5 16.5h7" /></>
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
  cadastro: (
    <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16.2a3.4 3.4 0 0 1 6.4 0" /><path d="M14.5 10h4M14.5 13.5h3" /></>
  ),
  acessopaciente: (
    <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /><path d="m14.5 8.5 2 2" /></>
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
// `unit` = [singular, plural] escrito ao lado do número; `item.hint` é uma
// linha menor sob o rótulo (o horário de cada faixa do dia).
function BarList({ items, emptyLabel, unit = null }) {
  if (!items.length) return <p className="gt-empty">{emptyLabel}</p>;
  const max = Math.max(1, ...items.map(item => item.count));
  return (
    <ul className={unit ? 'gt-bars gt-bars--unit' : 'gt-bars'}>
      {items.map(item => (
        <li key={item.id} className="gt-bar-row">
          <span className="gt-bar-label">
            {item.label}
            {item.hint && <span className="gt-bar-hint">{item.hint}</span>}
          </span>
          <span className="gt-bar-track">
            <span className="gt-bar-fill" style={{ width: `${(item.count / max) * 100}%` }} />
          </span>
          <span className="gt-bar-value">
            {item.count}
            {unit && <span className="gt-bar-unit"> {item.count === 1 ? unit[0] : unit[1]}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

const ATTENDANCE_UNIT = ['atendimento', 'atendimentos'];

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
// Teto da lista de pesquisas; passando dele a tela avisa que é um recorte.
const SURVEY_LIST_LIMIT = 500;

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
    SECTIONS.some(item => item.id === initialSection) ? initialSection : SECTION_GROUPS[0].ids[0]
  ));
  const side = sideOf(section);
  const sideGroups = SECTION_GROUPS.filter(group => group.side === side);
  // Volta para a última aba aberta de cada lado ao trocar Gestão ↔ Configurações.
  const lastSectionBySide = useRef({});

  function selectSide(nextSide) {
    if (nextSide === side) return;
    lastSectionBySide.current[side] = section;
    const firstOfSide = SECTION_GROUPS.find(group => group.side === nextSide).ids[0];
    setSection(lastSectionBySide.current[nextSide] || firstOfSide);
  }
  // Números do Resumo e do menu (opção B): carregados uma vez, ao abrir a
  // Gestão. Cada quadro que falha fica com traço; os outros seguem.
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    loadGestaoSummary()
      .then(result => { if (!cancelled) setSummary(result); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setSummaryLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const navCounts = useMemo(() => {
    if (!summary || side !== 'gestao') return null;
    return Object.fromEntries(Object.entries(summary)
      .filter(([, tile]) => tile.value != null || tile.display)
      .map(([id, tile]) => [id, { text: summaryDisplay(tile), tone: tile.tone }]));
  }, [summary, side]);
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
  // Semana/mês pela data de envio; os números do topo seguem o período.
  const [surveyPeriodMode, setSurveyPeriodMode] = useState('month');
  const [surveyPeriodAnchor, setSurveyPeriodAnchor] = useState(() => new Date(now));
  const surveyRange = useMemo(
    () => surveyPeriodRange(surveyPeriodMode, surveyPeriodAnchor),
    [surveyPeriodMode, surveyPeriodAnchor],
  );
  const surveyRangeKey = surveyRange ? `${surveyRange.start.getTime()}-${surveyRange.end.getTime()}` : 'all';
  const [selectedSurveyIds, setSelectedSurveyIds] = useState(() => new Set());
  const [surveyDeleteOpen, setSurveyDeleteOpen] = useState(false);
  const [surveyDeleteText, setSurveyDeleteText] = useState('');
  const [surveyDeleting, setSurveyDeleting] = useState(false);
  const [surveyDeleteNotice, setSurveyDeleteNotice] = useState('');

  useEffect(() => {
    if (section !== 'pesquisa') return undefined;
    let cancelled = false;

    (async () => {
      setSurveysLoading(true);
      setSelectedSurveyIds(new Set());
      setSurveyDeleteOpen(false);
      try {
        const [clinicPatients, list, team] = await Promise.all([
          patients.length ? Promise.resolve(patients) : listClinicPatients(),
          listSatisfactionSurveys({
            limit: SURVEY_LIST_LIMIT,
            from: surveyRange?.start.toISOString() || null,
            to: surveyRange?.end.toISOString() || null,
          }),
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
  }, [section, surveyRangeKey]);

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
      // Olhando um mês/semana passado, a nova não pertence à lista aberta.
      if (isInSurveyPeriod(created.created_at, surveyRange)) setSurveys(prev => [created, ...prev]);
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

  function changeSurveyPeriodMode(mode) {
    setSurveyPeriodMode(mode);
    setSurveyPeriodAnchor(new Date(now));
    setSurveyDeleteNotice('');
  }

  function shiftSurveyPeriodBy(step) {
    setSurveyPeriodAnchor(prev => shiftSurveyPeriod(surveyPeriodMode, prev, step));
    setSurveyDeleteNotice('');
  }

  function toggleSurveySelected(id) {
    setSelectedSurveyIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openSurveyDelete() {
    setSurveyDeleteText('');
    setSurveyDeleteNotice('');
    setSurveysError('');
    setSurveyDeleteOpen(true);
  }

  // Apaga só o que está marcado E visível: marcar, trocar o filtro e
  // excluir não pode levar junto o que saiu da tela.
  async function handleDeleteSurveys(e) {
    e.preventDefault();
    if (!isDeleteConfirmationValid(surveyDeleteText) || !selectedSurveys.length) return;
    const requestedIds = selectedSurveys.map(item => item.id);
    setSurveyDeleting(true);
    setSurveysError('');
    try {
      const deletedIds = await deleteSatisfactionSurveys(requestedIds);
      const deleted = new Set(deletedIds);
      setSurveys(prev => prev.filter(item => !deleted.has(item.id)));
      setSelectedSurveyIds(prev => new Set([...prev].filter(id => !deleted.has(id))));
      if (deletedIds.length === requestedIds.length) {
        setSurveyDeleteOpen(false);
        setSurveyDeleteNotice(surveyDeletedMessage(deletedIds.length));
      } else if (!deletedIds.length) {
        setSurveysError(`Nenhuma pesquisa foi excluída. ${SURVEY_DELETE_MIGRATION_HINT}`);
      } else {
        const kept = requestedIds.length - deletedIds.length;
        setSurveyDeleteNotice(surveyDeletedMessage(deletedIds.length));
        setSurveysError(`${kept === 1 ? '1 pesquisa não pôde ser excluída' : `${kept} pesquisas não puderam ser excluídas`} — continua marcada na lista.`);
      }
    } catch (err) {
      setSurveysError(err.message || 'Não foi possível excluir as pesquisas.');
    } finally {
      setSurveyDeleting(false);
      setSurveyDeleteText('');
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

  const surveyStats = useMemo(() => computeSurveyStats(surveys), [surveys]);

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

  const selectedSurveys = filteredSurveys.filter(item => selectedSurveyIds.has(item.id));
  const allSurveysSelected = filteredSurveys.length > 0 && selectedSurveys.length === filteredSurveys.length;
  const surveyDeletion = surveyDeletionSummary(selectedSurveys);

  function toggleAllSurveys() {
    setSelectedSurveyIds(allSurveysSelected ? new Set() : new Set(filteredSurveys.map(item => item.id)));
  }

  return (
    <div className={`gt gt--rail${side === 'gestao' ? ' gt--index' : ''}`}>
      {/* Os dois botões grandes ocupam a largura toda, acima do menu. */}
      <div className="gt-sides no-print" role="group" aria-label="Gestão ou configurações">
        {SIDES.map(option => (
          <button
            key={option.id}
            type="button"
            className="gt-side-btn"
            aria-pressed={side === option.id}
            onClick={() => selectSide(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {/* Menu e título ficam fora da impressão (no-print dentro do
          GestaoNav): a aba Documentos imprime a folha timbrada daqui. */}
      <GestaoNav
        label={side === 'configuracoes' ? 'Configurações da instituição' : 'Relatórios de gestão'}
        sections={SECTIONS}
        groups={sideGroups}
        icons={TAB_ICONS}
        active={section}
        onSelect={setSection}
        counts={navCounts}
      />

      <div className="gt-main">
        <GestaoSectionHead groups={SECTION_GROUPS} sections={SECTIONS} active={section}>
          {/* Explicação de cada aba mora aqui (data/screenHelp.js), não
              mais num parágrafo aberto no topo. */}
          <ScreenHelp topic={GESTAO_HELP[section]} />
        </GestaoSectionHead>

        {/* Só no celular e no tablet (gestao.css): o Resumo é o índice e a
            aba aberta volta para ele pela faixa de baixo. */}
        {side === 'gestao' && section !== 'resumo' && (
          <HubBackButton nested label="Voltar ao Resumo" onClick={() => setSection('resumo')} className="topbar-button gt-back-summary" />
        )}

        {section === 'resumo' && (
          <GestaoResumo
            sections={SECTIONS}
            groups={sideGroups}
            icons={TAB_ICONS}
            summary={summary}
            loading={summaryLoading}
            onOpen={setSection}
          />
        )}

        {section === 'faltosos' && (
          <section>
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
            <div className="gt-period-bar">
              <div className="gt-segmented" role="group" aria-label="Período das pesquisas">
                {SURVEY_PERIOD_MODES.map(mode => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={surveyPeriodMode === mode.id}
                    onClick={() => changeSurveyPeriodMode(mode.id)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {surveyRange && (
                <div className="gt-period-nav">
                  <button
                    type="button"
                    className="gt-period-arrow"
                    onClick={() => shiftSurveyPeriodBy(-1)}
                    aria-label={surveyPeriodMode === 'week' ? 'Semana anterior' : 'Mês anterior'}
                  >
                    ‹
                  </button>
                  <span className="gt-period-label" aria-live="polite">{surveyPeriodLabel(surveyPeriodMode, surveyPeriodAnchor)}</span>
                  <button
                    type="button"
                    className="gt-period-arrow"
                    onClick={() => shiftSurveyPeriodBy(1)}
                    disabled={!canAdvanceSurveyPeriod(surveyPeriodMode, surveyPeriodAnchor, new Date(now))}
                    aria-label={surveyPeriodMode === 'week' ? 'Próxima semana' : 'Próximo mês'}
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

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
            {surveyDeleteNotice && <div className="gt-notice gt-notice-success" role="status">{surveyDeleteNotice}</div>}

            {isClinicAdmin && !surveysLoading && filteredSurveys.length > 0 && (
              <div className="gt-select-bar">
                <label className="gt-check">
                  <input type="checkbox" checked={allSurveysSelected} onChange={toggleAllSurveys} />
                  {surveySelectionLabel(selectedSurveys.length)}
                </label>
                <button
                  type="button"
                  className="gt-btn gt-btn--sm gt-btn--danger"
                  disabled={!selectedSurveys.length || surveyDeleteOpen}
                  onClick={openSurveyDelete}
                >
                  Excluir
                </button>
              </div>
            )}

            {isClinicAdmin && surveyDeleteOpen && selectedSurveys.length > 0 && (
              <form
                className="gt-delete-panel"
                onSubmit={handleDeleteSurveys}
                role="alertdialog"
                aria-labelledby="gt-survey-delete-title"
              >
                <h4 id="gt-survey-delete-title">{surveyDeletion.title}</h4>
                <ul className="gt-delete-list">
                  {selectedSurveys.map(survey => (
                    <li key={survey.id}>
                      <b>{patientName(survey.patient_id)}</b>
                      <span>enviada em {new Date(survey.created_at).toLocaleDateString('pt-BR')}</span>
                      <span className={survey.responded_at ? 'gt-delete-rated' : ''}>
                        {survey.responded_at ? `nota ${survey.rating}/5${survey.comment ? ' e comentário' : ''}` : 'sem resposta'}
                      </span>
                    </li>
                  ))}
                </ul>
                {surveyDeletion.ratedWarning && (
                  <p className="gt-delete-warning">{surveyDeletion.ratedWarning}</p>
                )}
                <p>
                  Some da lista e dos números desta aba, e o link enviado para de funcionar.
                  Não dá para desfazer. Confirme digitando <b>excluir</b>.
                </p>
                <label className="gt-field">
                  Confirmação
                  <input
                    className="gt-input"
                    value={surveyDeleteText}
                    onChange={e => setSurveyDeleteText(e.target.value)}
                    placeholder="Digite excluir"
                    autoFocus
                  />
                </label>
                <div className="gt-delete-actions">
                  <button type="button" className="gt-btn gt-btn--sm" onClick={() => setSurveyDeleteOpen(false)} disabled={surveyDeleting}>
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="gt-btn gt-btn--sm gt-btn--danger-solid"
                    disabled={!isDeleteConfirmationValid(surveyDeleteText) || surveyDeleting}
                  >
                    {surveyDeleting ? 'Excluindo…' : 'Excluir definitivamente'}
                  </button>
                </div>
              </form>
            )}

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
                  const selected = selectedSurveyIds.has(survey.id);
                  return (
                    <li key={survey.id} className={`gt-card${status.rated ? ' gt-card-gold' : status.tone === 'pending' ? ' gt-card-warning' : ''}${selected ? ' gt-card-selected' : ''}`}>
                      {isClinicAdmin && (
                        <input
                          type="checkbox"
                          className="gt-card-check"
                          checked={selected}
                          onChange={() => toggleSurveySelected(survey.id)}
                          aria-label={`Selecionar pesquisa de ${name}, enviada em ${new Date(survey.created_at).toLocaleDateString('pt-BR')}`}
                        />
                      )}
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
            {!surveysLoading && surveys.length >= SURVEY_LIST_LIMIT && (
              <p className="gt-filter-note">
                Mostrando só as {SURVEY_LIST_LIMIT} mais recentes deste recorte — um período menor mostra as demais.
              </p>
            )}
          </section>
        )}

        {section === 'indicadores' && (
          <section>
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
                    <BarList items={dashboardData.byWeekday} unit={ATTENDANCE_UNIT} emptyLabel="Nenhum atendimento no período." />
                  </div>
                  <div className="gt-chart-card">
                    <h4>Atendimentos por período do dia</h4>
                    <BarList items={dashboardData.byTimeOfDay} unit={ATTENDANCE_UNIT} emptyLabel="Nenhum atendimento no período." />
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

        {section === 'importaveis' && (
          <Suspense fallback={<p className="gt-note">Carregando formulários…</p>}>
            <Importaveis profile={profile} />
          </Suspense>
        )}

        {section === 'documentos' && (
          <Suspense fallback={<p className="gt-note">Carregando documentos…</p>}>
            <DocumentosTimbrados therapistProfile={profile} />
          </Suspense>
        )}

        {section === 'personalizar' && <PersonalizarClinica profile={profile} />}

        {section === 'acessopaciente' && <AcessoPaciente profile={profile} />}

        {section === 'cadastro' && <MeuCadastro profile={profile} />}
      </div>
    </div>
  );
}

export default RelatoriosGestao;
