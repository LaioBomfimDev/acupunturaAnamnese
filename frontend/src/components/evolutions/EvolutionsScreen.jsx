import { useEffect, useMemo, useState } from 'react';
import { listAppointmentsAwaitingEvolution } from '../../services/appointmentService';
import { listClinicPatients } from '../../services/clinicPatientsService';
import { listClinicMembers, shortName } from '../../services/clinicMembersService';
import { getDiscipline, resolveUserDisciplines } from '../../data/disciplines';
import { GENERIC_ANAMNESE_DISCIPLINES } from '../../data/anamneseRegistry';
import {
  ATTENDANCE_LABELS,
  canWriteEvolution,
  evolutionDisciplinesFor,
  groupQueueByDay,
  nextQueueItem,
  toActiveAppointment,
} from '../../utils/evolutionQueue';
import { EvolutionRecordPanel } from './EvolutionRecordPanel';
import { PanelLoading } from '../ui/PanelLoading';
import '../../styles/evolutions.css';

// ============================================================
// Evoluções — tela própria, fora das disciplinas.
//
// Antes a evolução morava dentro de cada workspace (Acupuntura,
// Psicologia...): Agenda → "Evolução pendente" → abria o paciente na
// disciplina → escrevia → voltava pra Agenda → reabria a lista. Aqui a
// fila fica na mesma tela: clicou, o registro toma a tela; salvou, o
// próximo pendente já abre.
//
// "Todos os pacientes" cobre a evolução avulsa (encaixe sem agendamento),
// com data e hora informadas à mão — como já era nos formulários.
// ============================================================

// Disciplinas que têm formulário de evolução. Neuropsicologia fica de
// fora de propósito: é avaliação + relatório.
const EVOLUTION_DISCIPLINES = ['acupuntura', 'psicologia', ...GENERIC_ANAMNESE_DISCIPLINES];

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

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function DisciplineTag({ id }) {
  return (
    <span className="evs-tag" style={{ '--evs-disc': `var(--r1-discipline-${id}, var(--r1-accent))` }}>
      {getDiscipline(id)?.label || id}
    </span>
  );
}

function pendingCountLabel(count) {
  if (count === 0) return 'Nenhum atendimento aguardando evolução.';
  return count === 1 ? 'Falta 1 atendimento.' : `Faltam ${count} atendimentos.`;
}

export function EvolutionsScreen({ profile }) {
  const [items, setItems] = useState([]);
  const [patients, setPatients] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('fila');
  const [onlyMine, setOnlyMine] = useState(false);
  const [term, setTerm] = useState('');
  const [doneIds, setDoneIds] = useState(() => new Set());
  const [current, setCurrent] = useState(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      listAppointmentsAwaitingEvolution(),
      listClinicPatients(),
      listClinicMembers(),
    ]).then(([queueResult, patientsResult, membersResult]) => {
      if (cancelled) return;
      if (queueResult.status === 'fulfilled') setItems(queueResult.value);
      else setError(queueResult.reason?.message || 'Não foi possível carregar os atendimentos aguardando evolução.');
      // Sem a lista de pacientes a fila ainda funciona (a RLS decide no
      // servidor); só a busca de "Todos os pacientes" fica vazia.
      setPatients(patientsResult.status === 'fulfilled' ? patientsResult.value : null);
      setMembers(membersResult.status === 'fulfilled' ? membersResult.value : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const patientsById = useMemo(
    () => new Map((patients || []).map(patient => [patient.id, patient])),
    [patients],
  );
  const visiblePatientIds = patients ? new Set(patientsById.keys()) : null;
  const userDisciplines = evolutionDisciplinesFor(resolveUserDisciplines(profile), EVOLUTION_DISCIPLINES);

  const isWritable = item => canWriteEvolution(item, profile, visiblePatientIds);
  const pending = items.filter(item => !doneIds.has(item.appointment_id));
  const hasTeamItems = pending.some(item => item.professional_id !== profile?.id);
  const search = normalizeText(term.trim());

  function patientOf(item) {
    return patientsById.get(item.patient_id) || { id: item.patient_id, name: item.patient_name || 'Paciente' };
  }

  function professionalName(id) {
    if (id === profile?.id) return 'você';
    const found = members.find(member => member.id === id);
    return found ? shortName(found.full_name) : 'profissional';
  }

  const visibleQueue = pending.filter(item => (
    (!onlyMine || item.professional_id === profile?.id)
    && (!search || normalizeText(patientOf(item).name).includes(search))
  ));

  function openItem(item) {
    setToast('');
    setCurrent({ type: 'fila', item });
    window.scrollTo({ top: 0 });
  }

  function openAvulso(patient, discipline) {
    setToast('');
    setCurrent({ type: 'avulso', patient, discipline });
    window.scrollTo({ top: 0 });
  }

  function closeRecord() {
    setCurrent(null);
  }

  function handleSaved() {
    if (current?.type !== 'fila') {
      setToast(`Evolução de ${current.patient.name} salva.`);
      setCurrent(null);
      return;
    }
    const savedId = current.item.appointment_id;
    const nextDone = new Set(doneIds);
    nextDone.add(savedId);
    setDoneIds(nextDone);

    const remaining = items.filter(item => !nextDone.has(item.appointment_id) && isWritable(item)).length;
    setToast(`Evolução de ${patientOf(current.item).name} salva. ${pendingCountLabel(remaining)}`);

    const next = nextQueueItem(items, savedId, nextDone, isWritable);
    if (next) {
      setCurrent({ type: 'fila', item: next });
      window.scrollTo({ top: 0 });
    } else {
      setCurrent(null);
    }
  }

  if (loading) return <PanelLoading />;

  if (current) {
    const isQueue = current.type === 'fila';
    const patient = isQueue ? patientOf(current.item) : current.patient;
    const discipline = isQueue ? current.item.discipline : current.discipline;
    const hasNext = isQueue && Boolean(nextQueueItem(items, current.item.appointment_id, doneIds, isWritable));
    const ownQueue = pending.filter(isWritable);

    return (
      <div className="evs-take">
        <aside className="evs-take-queue" aria-label="Fila de evoluções">
          <button type="button" className="evs-btn evs-back" onClick={closeRecord}>← Voltar à fila</button>
          {isQueue && ownQueue.length > 0 && (
            <>
              <p className="evs-take-queue-title">Na fila ({ownQueue.length})</p>
              <ul>
                {ownQueue.map(item => (
                  <li key={item.appointment_id}>
                    <button
                      type="button"
                      className="evs-take-queue-item"
                      aria-current={item.appointment_id === current.item.appointment_id ? 'true' : undefined}
                      onClick={() => openItem(item)}
                    >
                      <b>{hora(item.starts_at)}</b> {patientOf(item).name}
                      <small>{diaLabel(item.starts_at)}</small>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <section className="evs-take-main">
          {toast && <div className="evs-toast" role="status">{toast}</div>}
          <header className="evs-take-head">
            <div>
              <h2>{patient.name}</h2>
              <div className="evs-tags">
                <DisciplineTag id={discipline} />
                {isQueue && (
                  <span className={`evs-status evs-status--${current.item.attendance_status}`}>
                    {ATTENDANCE_LABELS[current.item.attendance_status] || current.item.attendance_status}
                  </span>
                )}
                {!isQueue && <span className="evs-status">Avulso, sem agendamento</span>}
              </div>
            </div>
          </header>

          <EvolutionRecordPanel
            key={isQueue ? current.item.appointment_id : `${patient.id}:${discipline}`}
            patient={patient}
            discipline={discipline}
            activeAppointment={isQueue ? toActiveAppointment(current.item) : null}
            submitLabel={hasNext ? 'Salvar e ir para o próximo →' : 'Salvar evolução'}
            onSaved={handleSaved}
          />
        </section>
      </div>
    );
  }

  const avulsoPatients = (patients || [])
    .map(patient => ({
      patient,
      disciplines: userDisciplines.filter(id => (patient.enrollments || []).some(enrollment => enrollment.discipline === id)),
    }))
    .filter(entry => entry.disciplines.length > 0 && (!search || normalizeText(entry.patient.name).includes(search)))
    .sort((a, b) => a.patient.name.localeCompare(b.patient.name, 'pt-BR'));

  return (
    <div className="evs">
      <header className="evs-hero">
        <h2>Evoluções</h2>
        <p className="hub-note">
          Escolha o atendimento, escreva a evolução e salve: o próximo pendente abre sozinho.
          Falta e falta justificada também entram aqui e pedem uma observação.
          {hasTeamItems && ' Você vê as pendências da equipe, mas só escreve as suas.'}
        </p>
      </header>

      {toast && <div className="evs-toast" role="status">{toast}</div>}
      {error && <div className="evs-error" role="alert">{error}</div>}

      <div className="evs-controls">
        <div className="evs-seg" role="group" aria-label="O que mostrar">
          <button type="button" aria-pressed={mode === 'fila'} onClick={() => setMode('fila')}>
            Aguardando evolução <span className="evs-count">{pending.length}</span>
          </button>
          {userDisciplines.length > 0 && (
            <button type="button" aria-pressed={mode === 'todos'} onClick={() => setMode('todos')}>
              Todos os pacientes
            </button>
          )}
        </div>
        {mode === 'fila' && hasTeamItems && (
          <label className="evs-check">
            <input type="checkbox" checked={onlyMine} onChange={event => setOnlyMine(event.target.checked)} />
            Só os meus
          </label>
        )}
        <input
          type="search"
          className="evs-search"
          placeholder="Buscar paciente pelo nome"
          aria-label="Buscar paciente pelo nome"
          value={term}
          onChange={event => setTerm(event.target.value)}
        />
      </div>

      {mode === 'fila' ? (
        visibleQueue.length === 0 ? (
          <p className="evs-empty">
            {search ? 'Nenhum paciente com esse nome na fila.' : 'Nenhum atendimento aguardando evolução. Tudo em dia.'}
          </p>
        ) : (
          groupQueueByDay(visibleQueue).map(([dayKey, dayItems]) => (
            <section key={dayKey} className="evs-day">
              <h3 className="evs-day-title">{diaLabel(dayItems[0].starts_at)}</h3>
              <ul className="evs-list">
                {dayItems.map(item => {
                  const writable = isWritable(item);
                  const isFalta = item.attendance_status !== 'attended';
                  return (
                    <li key={item.appointment_id} className="evs-row">
                      <span className="evs-hour">{hora(item.starts_at)}</span>
                      <span className="evs-row-main">
                        <b>{patientOf(item).name}</b>
                        <span className="evs-tags">
                          <DisciplineTag id={item.discipline} />
                          <span className={`evs-status evs-status--${item.attendance_status}`}>
                            {ATTENDANCE_LABELS[item.attendance_status] || item.attendance_status}
                          </span>
                          {hasTeamItems && <span className="evs-meta">{professionalName(item.professional_id)}</span>}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="evs-btn evs-btn--primary"
                        disabled={!writable}
                        title={writable ? undefined : 'Só o profissional do atendimento pode escrever esta evolução.'}
                        onClick={() => openItem(item)}
                      >
                        {isFalta ? 'Registrar falta →' : 'Escrever evolução →'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )
      ) : (
        <>
          <p className="evs-hint">
            Evolução avulsa, para encaixe sem agendamento: a data e a hora você informa no formulário.
            Aparecem os pacientes matriculados nas suas áreas.
          </p>
          {patients === null ? (
            <p className="evs-empty">Não foi possível carregar a lista de pacientes.</p>
          ) : avulsoPatients.length === 0 ? (
            <p className="evs-empty">{search ? 'Nenhum paciente com esse nome.' : 'Nenhum paciente matriculado nas suas áreas.'}</p>
          ) : (
            <ul className="evs-list">
              {avulsoPatients.map(({ patient, disciplines }) => (
                <li key={patient.id} className="evs-row evs-row--patient">
                  <span className="evs-row-main"><b>{patient.name}</b></span>
                  <span className="evs-row-actions">
                    {disciplines.map(id => (
                      <button key={id} type="button" className="evs-btn" onClick={() => openAvulso(patient, id)}>
                        {disciplines.length > 1 ? `Nova evolução · ${getDiscipline(id)?.label || id}` : 'Nova evolução'}
                      </button>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
