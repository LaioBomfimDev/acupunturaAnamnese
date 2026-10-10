import { useEffect, useMemo, useState } from 'react';
import { listAppointments, listAppointmentsAwaitingEvolution } from '../../services/appointmentService';
import { listEvolutionReviewRows } from '../../services/patientEvolutionService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { listClinicMembers, shortName } from '../../services/clinicMembersService';
import { DISCIPLINES, getDiscipline } from '../../data/disciplines';
import {
  ATTENDANCE_LABELS,
  EVOLUTION_DISCIPLINES,
  QUEUE_PERIODS,
  canWriteEvolution,
  endSentence,
  filterQueue,
  groupQueueByDay,
  nextQueueItem,
  onlyEvolutionDisciplines,
  sortQueue,
  toActiveAppointment,
  writeTabHint,
  writeTabSummary,
} from '../../utils/evolutionQueue';
import { COMPLETED_APPOINTMENT_LABEL, canChooseProfessional, toEvolutionQueueItem } from '../../utils/completedAppointment';
import {
  buildEvolutionReview,
  canSeeTeamEvolutions,
  evolutionReviewStats,
  reviewTabHint,
} from '../../utils/evolutionReview';
import { surveyPeriodRange } from '../../utils/gestaoSurveys';
import { EvolutionRecordPanel } from './EvolutionRecordPanel';
import { EvolutionsReview } from './EvolutionsReview';
import { RegisterCompletedDialog } from '../panels/agenda/RegisterCompletedDialog';
import { PanelLoading } from '../ui/PanelLoading';
import { FolderTabs } from '../ui/FolderTabs';
import { SearchSelect } from '../ui/SearchSelect';
import { ScreenHelp } from '../ui/ScreenHelp';
import { EVOLUCOES_HELP, EVOLUCOES_REVIEW_HELP } from '../../data/screenHelp';
import '../../styles/evolutions.css';

// ============================================================
// Evoluções — tela própria, fora das disciplinas.
//
// Dois botões no topo (2026-10-01): "Escrever evoluções" e "Ver
// evoluções".
//
// Escrever: a fila à esquerda, como caixa de entrada (escolhe o paciente,
// escreve ao lado), e o formulário do atendimento aberto à direita. A
// fila também é o filtro (busca + situação, área, atendimento e período).
// Salvou, o paciente fica VERDE na fila (não some) e o próximo pendente
// abre sozinho. Vermelho = falta evoluir.
//
// Ver: conferência do que foi evoluído e quando, sem o texto
// (EvolutionsReview). A administração vê a equipe; o profissional, as
// próprias.
//
// Só existe evolução a partir de agendamento concluído — não há registro
// avulso (o banco recusa desde 20260924b). Quem atendeu sem agendar usa
// "Registrar atendimento realizado": cria o agendamento já como Atendido
// e ele abre aqui para evoluir.
// ============================================================

// Só áreas com formulário de evolução: registrar uma área sem formulário
// aqui criaria um atendimento que a fila não mostra.
const REGISTER_DISCIPLINES = DISCIPLINES.filter(
  discipline => discipline.available && EVOLUTION_DISCIPLINES.includes(discipline.id),
);

const MODES = [
  { id: 'escrever', label: 'Escrever evoluções' },
  { id: 'ver', label: 'Ver evoluções' },
];

function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

const SITUACOES = [
  { id: 'todos', label: 'Todos' },
  { id: 'pendentes', label: 'Falta evoluir' },
  { id: 'evoluidos', label: 'Evoluídos' },
];

const ATENDIMENTOS = [
  { id: 'todos', label: 'Todos' },
  { id: 'atendido', label: 'Atendido' },
  { id: 'ausencia', label: 'Não compareceu ou cancelou' },
];

function hora(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diaLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
}

function IconPending() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
    </svg>
  );
}

function IconDone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.7 2.7L16 9.8" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function DisciplineTag({ id }) {
  return (
    <span className="evs-tag" style={{ '--evs-disc': `var(--r1-discipline-${id}, var(--r1-accent))` }}>
      {getDiscipline(id)?.label || id}
    </span>
  );
}

function StatusTag({ status }) {
  return (
    <span className={`evs-status evs-status--${status}`}>
      {ATTENDANCE_LABELS[status] || status}
    </span>
  );
}

function Chips({ label, options, value, onChange }) {
  return (
    <div className="evs-filter">
      <p className="evs-filter-label">{label}</p>
      <div className="evs-chips" role="group" aria-label={label}>
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            className="evs-chip"
            aria-pressed={value === option.id}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EvolutionsScreen({ profile }) {
  const [items, setItems] = useState([]);
  const [patients, setPatients] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // appointment_id → instante em que foi evoluído NESTA tela.
  const [done, setDone] = useState(() => new Map());
  const [currentId, setCurrentId] = useState(null);
  const [toast, setToast] = useState('');
  const [situacao, setSituacao] = useState('todos');
  const [area, setArea] = useState('');
  const [atendimento, setAtendimento] = useState('todos');
  const [periodo, setPeriodo] = useState('tudo');
  const [registering, setRegistering] = useState(false);
  // A administração entra conferindo a equipe; quem atende entra escrevendo.
  const [mode, setMode] = useState(() => (canSeeTeamEvolutions(profile) ? 'ver' : 'escrever'));

  const patientsById = useMemo(
    () => new Map((patients || []).map(patient => [patient.id, patient])),
    [patients],
  );
  const visiblePatientIds = useMemo(
    () => (patients ? new Set(patientsById.keys()) : null),
    [patients, patientsById],
  );
  const isWritable = item => canWriteEvolution(item, profile, visiblePatientIds);

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      listAppointmentsAwaitingEvolution(),
      listClinicPatients(),
      listClinicMembers(),
    ]).then(([queueResult, patientsResult, membersResult]) => {
      if (cancelled) return;
      const queue = onlyEvolutionDisciplines(queueResult.status === 'fulfilled' ? queueResult.value : []);
      if (queueResult.status !== 'fulfilled') {
        setError(queueResult.reason?.message || 'Não foi possível carregar os atendimentos aguardando evolução.');
      }
      // Sem a lista de pacientes a fila ainda funciona (a RLS decide no
      // servidor); só os nomes caem no que a própria view devolve.
      const patientList = patientsResult.status === 'fulfilled' ? patientsResult.value : null;
      setItems(queue);
      setPatients(patientList);
      setMembers(membersResult.status === 'fulfilled' ? membersResult.value : []);
      const visible = patientList ? new Set(patientList.map(patient => patient.id)) : null;
      const first = sortQueue(queue).find(item => canWriteEvolution(item, profile, visible));
      setCurrentId(first?.appointment_id || null);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // Carrega uma vez por pessoa logada; o objeto profile pode trocar de
    // identidade sem mudar de dono.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  // Número da aba "Ver evoluções": os dois números da conferência no mês
  // corrente (concluídos e falta evoluir), com o mesmo cálculo dela.
  // Recarrega depois de cada evolução salva aqui, para não ficar atrás.
  const [monthStats, setMonthStats] = useState(null);
  const [monthStatsToken, setMonthStatsToken] = useState(0);
  const teamView = canSeeTeamEvolutions(profile);
  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const range = surveyPeriodRange('month', now);
    Promise.all([
      listAppointments({ from: range.start.toISOString(), to: new Date(range.end.getTime() - 1).toISOString() }),
      listEvolutionReviewRows({ from: range.start.toISOString(), to: range.end.toISOString() }),
    ]).then(([appointments, evolutions]) => {
      if (cancelled) return;
      const rows = buildEvolutionReview(appointments, evolutions, {
        now,
        onlyProfessionalId: teamView ? null : profile?.id,
      });
      setMonthStats(evolutionReviewStats(rows));
    }).catch(() => {
      // Sem o número a aba continua funcionando; a conferência mostra o
      // erro de verdade quando abrir.
      if (!cancelled) setMonthStats(null);
    });
    return () => { cancelled = true; };
  }, [profile?.id, teamView, monthStatsToken]);

  const doneIds = useMemo(() => new Set(done.keys()), [done]);
  const current = items.find(item => item.appointment_id === currentId) || null;
  const hasTeamItems = items.some(item => item.professional_id !== profile?.id);
  const pendingCount = items.filter(item => !done.has(item.appointment_id)).length;
  const writeSummary = writeTabSummary(items, { done: doneIds, isWritable });
  const areasNaFila = DISCIPLINES.filter(discipline => items.some(item => item.discipline === discipline.id));

  function patientOf(item) {
    return patientsById.get(item.patient_id) || { id: item.patient_id, name: item.patient_name || 'Paciente' };
  }

  function professionalName(id) {
    if (id === profile?.id) return 'você';
    const found = members.find(member => member.id === id);
    return found ? shortName(found.full_name) : 'profissional';
  }

  const visibleQueue = filterQueue(items, { done: doneIds, situacao, area, atendimento, periodo });
  const searchOptions = sortQueue(items).map(item => ({
    id: item.appointment_id,
    label: patientOf(item).name,
    sublabel: `${hora(item.starts_at)} · ${getDiscipline(item.discipline)?.label || item.discipline}${done.has(item.appointment_id) ? ' · evoluído' : ''}`,
    avatar: true,
  }));

  function openItem(id) {
    setToast('');
    setCurrentId(id);
    window.scrollTo({ top: 0 });
  }

  function handleSaved() {
    if (!current) return;
    const savedId = current.appointment_id;
    const nextDone = new Map(done);
    nextDone.set(savedId, new Date());
    setDone(nextDone);

    const nextDoneIds = new Set(nextDone.keys());
    const remaining = items.filter(item => !nextDoneIds.has(item.appointment_id) && isWritable(item)).length;
    setToast(`Evolução de ${patientOf(current).name} salva. ${
      remaining === 0 ? 'Nenhuma pendência sua na fila.' : remaining === 1 ? 'Falta 1.' : `Faltam ${remaining}.`
    }`);

    const next = nextQueueItem(items, savedId, nextDoneIds, isWritable);
    if (next) setCurrentId(next.appointment_id);
    setMonthStatsToken(token => token + 1);
    window.scrollTo({ top: 0 });
  }

  function handlePatientCreated(created) {
    setPatients(prev => [created, ...(prev || [])]);
  }

  // O atendimento registrado entra na fila na hora. Se for da própria
  // pessoa, já abre para evoluir; se o admin registrou para um colega,
  // fica na fila dele (com cadeado aqui).
  function handleRegistered(created) {
    const name = patientsById.get(created.patient_id)?.name || 'Paciente';
    const item = toEvolutionQueueItem(created, name);
    setItems(prev => [item, ...prev.filter(entry => entry.appointment_id !== item.appointment_id)]);
    setRegistering(false);
    setMonthStatsToken(token => token + 1);
    setSituacao('todos');
    setArea('');
    setAtendimento('todos');
    setPeriodo('tudo');

    if (canWriteEvolution(item, profile, visiblePatientIds)) {
      setCurrentId(item.appointment_id);
      setToast(`Atendimento de ${name} registrado. Escreva a evolução abaixo.`);
    } else {
      setToast(`Atendimento de ${name} registrado. ${
        item.professional_id === profile?.id ? 'Ele está na sua fila.' : `Ele está na fila de ${endSentence(professionalName(item.professional_id))}`
      }`);
    }
    window.scrollTo({ top: 0 });
  }

  if (loading) return <PanelLoading />;

  function renderMain() {
    if (!current) {
      return (
        <div className="evs-empty-state">
          <span className="evs-icon evs-icon--done"><IconDone /></span>
          <p>
            {items.length === 0
              ? 'Nenhum atendimento aguardando evolução. Tudo em dia.'
              : 'Nenhuma evolução sua pendente. Escolha um paciente na fila para ver.'}
          </p>
        </div>
      );
    }

    const patient = patientOf(current);
    const savedAt = done.get(current.appointment_id);
    const writable = isWritable(current);
    const hasNext = Boolean(nextQueueItem(items, current.appointment_id, doneIds, isWritable));

    return (
      <>
        <header className="evs-take-head">
          <div>
            <h2>{patient.name}</h2>
            <div className="evs-tags">
              <DisciplineTag id={current.discipline} />
              <StatusTag status={current.attendance_status} />
              {hasTeamItems && <span className="evs-meta">{professionalName(current.professional_id)}</span>}
            </div>
          </div>
          {savedAt && (
            <span className="evs-saved-badge">
              <IconDone /> Evoluído às {hora(savedAt)}
            </span>
          )}
        </header>

        {savedAt ? (
          <p className="evs-note">
            Evolução registrada. Para corrigir o texto, use a linha do tempo na ficha do paciente.
          </p>
        ) : !writable ? (
          <p className="evs-note">
            Este atendimento é de {endSentence(professionalName(current.professional_id))} Só o profissional do
            atendimento escreve a evolução.
          </p>
        ) : (
          <EvolutionRecordPanel
            key={current.appointment_id}
            patient={patient}
            discipline={current.discipline}
            activeAppointment={toActiveAppointment(current)}
            submitLabel={hasNext ? 'Salvar e ir para o próximo →' : 'Salvar evolução'}
            onSaved={handleSaved}
          />
        )}
      </>
    );
  }

  return (
    <div className="evs">
      {/* Explicação da tela no "Como funciona" (data/screenHelp.js). O que
          muda o que dá pra fazer — atendimento de colega — já está na fila
          (cadeado + legenda) e no aviso do próprio atendimento. */}
      <header className="evs-hero screen-title-row">
        <h2>Evoluções</h2>
        {mode === 'escrever'
          ? <ScreenHelp topic={EVOLUCOES_HELP} />
          : <ScreenHelp topic={EVOLUCOES_REVIEW_HELP} />}
      </header>

      {/* Abas de pasta (opção C, 10/10/2026): cada uma diz quanto tem do
          outro lado — a fila de quem escreve e os dois números do mês. */}
      <FolderTabs
        label="O que fazer em Evoluções"
        value={mode}
        onChange={setMode}
        options={MODES.map(option => (option.id === 'escrever'
          ? { ...option, number: writeSummary.pending, hint: writeTabHint(writeSummary), alert: writeSummary.pending > 0 }
          : { ...option, number: monthStats?.total ?? null, hint: monthStats ? reviewTabHint(monthStats) : 'conferência do período' }))}
      />

      {mode === 'ver' && <EvolutionsReview profile={profile} patients={patients} members={members} />}

      {mode === 'escrever' && error && <div className="evs-error" role="alert">{error}</div>}

      {/* Escondido, não desmontado: quem está no meio de uma evolução e
          vai conferir algo em "Ver evoluções" volta com o texto lá.
          Fila primeiro (opção B, 05/10/2026): à esquerda no computador,
          em cima no celular. */}
      <div className="evs-layout" hidden={mode !== 'escrever'}>
        <aside className="evs-queue" aria-label="Fila de evoluções">
          <button type="button" className="evs-register" onClick={() => setRegistering(true)}>
            <IconPlus />
            {COMPLETED_APPOINTMENT_LABEL}
          </button>

          <div className="evs-queue-head">
            <b>Fila de evoluções</b>
            <span>{items.length - pendingCount} de {items.length} evoluídos</span>
          </div>

          <SearchSelect
            id="evs-busca"
            value={currentId || ''}
            onChange={id => { if (id) openItem(id); }}
            options={searchOptions}
            allowEmpty={false}
            placeholder="Buscar paciente na fila"
            emptyLabel="Ninguém na fila com esse nome."
          />

          {/* Dois a dois: Situação | Atendimento em cima, Área | Período
              embaixo. A fila estreita (celular) volta a uma coluna. */}
          <div className="evs-filters">
            <Chips
              label="Situação"
              options={SITUACOES.map(option => ({
                ...option,
                label: option.id === 'pendentes' ? `${option.label} (${pendingCount})`
                  : option.id === 'evoluidos' ? `${option.label} (${items.length - pendingCount})`
                    : option.label,
              }))}
              value={situacao}
              onChange={setSituacao}
            />
            <Chips label="Atendimento" options={ATENDIMENTOS} value={atendimento} onChange={setAtendimento} />
            {areasNaFila.length > 1 && (
              <Chips
                label="Área"
                options={[{ id: '', label: 'Todas' }, ...areasNaFila.map(item => ({ id: item.id, label: item.label }))]}
                value={area}
                onChange={setArea}
              />
            )}
            <div className="evs-filter">
              <label className="evs-filter-label" htmlFor="evs-periodo">Período</label>
              <select id="evs-periodo" className="evs-select" value={periodo} onChange={event => setPeriodo(event.target.value)}>
                {QUEUE_PERIODS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            </div>
          </div>

          <div className="evs-queue-list">
            {visibleQueue.length === 0 ? (
              <p className="evs-queue-empty">Nenhum atendimento com esses filtros.</p>
            ) : groupQueueByDay(visibleQueue).map(([dayKey, dayItems]) => (
              <div key={dayKey}>
                <p className="evs-queue-day">{diaLabel(dayItems[0].starts_at)}</p>
                <ul>
                  {dayItems.map(item => {
                    const savedAt = done.get(item.appointment_id);
                    const writable = isWritable(item);
                    const icon = savedAt ? 'done' : writable ? 'pending' : 'locked';
                    return (
                      <li key={item.appointment_id}>
                        <button
                          type="button"
                          className={`evs-queue-item${savedAt ? ' is-done' : ''}`}
                          aria-current={item.appointment_id === currentId ? 'true' : undefined}
                          onClick={() => openItem(item.appointment_id)}
                          title={writable ? undefined : 'Atendimento de outro profissional: só ele escreve a evolução.'}
                        >
                          {/* Hora na frente, em coluna: bate com a Agenda. */}
                          <span className="evs-queue-time">{hora(item.starts_at)}</span>
                          <span className={`evs-icon evs-icon--${icon}`}>
                            {icon === 'done' ? <IconDone /> : icon === 'pending' ? <IconPending /> : <IconLock />}
                          </span>
                          <span className="evs-queue-text">
                            <b>{patientOf(item).name}</b>
                            <small>
                              {getDiscipline(item.discipline)?.label || item.discipline}
                              {savedAt
                                ? <> · <span className="evs-ok">evoluído às {hora(savedAt)}</span></>
                                : item.attendance_status !== 'attended'
                                  ? ` · ${(ATTENDANCE_LABELS[item.attendance_status] || '').toLowerCase()}`
                                  : ''}
                              {hasTeamItems && item.professional_id !== profile?.id ? ` · ${professionalName(item.professional_id)}` : ''}
                            </small>
                          </span>
                          <span className="evs-queue-chev"><IconChevron /></span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>

          <p className="evs-legend">
            <span><span className="evs-icon evs-icon--pending"><IconPending /></span> falta evoluir</span>
            <span><span className="evs-icon evs-icon--done"><IconDone /></span> evoluído agora</span>
            {hasTeamItems && <span><span className="evs-icon evs-icon--locked"><IconLock /></span> de outro profissional</span>}
          </p>
        </aside>

        <section className="evs-main">
          {toast && <div className="evs-toast" role="status">{toast}</div>}
          {renderMain()}
        </section>
      </div>

      {registering && (
        <RegisterCompletedDialog
          profile={profile}
          patients={patients || []}
          members={members}
          disciplines={REGISTER_DISCIPLINES}
          afterNote="Depois de registrar, a evolução abre aqui."
          // Quem registra para a equipe pode estar lançando para um colega.
          submitLabel={canChooseProfessional(profile) ? undefined : 'Registrar e evoluir'}
          onClose={() => setRegistering(false)}
          onPatientCreated={handlePatientCreated}
          onCreated={handleRegistered}
        />
      )}
    </div>
  );
}
