import { useEffect, useRef, useState } from 'react';
import { recordPhase, sessionNarrative, sessionProgramAvailability, summarizeSession } from '../../utils/aba/calculations.js';
import {
  ARRIVAL_STATES, BEHAVIOR_INTENSITIES, GENERALIZATION_CONDITIONS, HEALTH_CONDITIONS, MOTIVATION_LEVELS,
  PEOPLE_PRESENT_OPTIONS, PROMPT_LEVELS, ROUTINE_CHANGES, SESSION_MATERIALS, collectionTypeLabel,
  collectionTypeOf, defaultPhaseForStatus, isRestrictedProcedure, normalizeCollectionType,
  orderedPromptHierarchy, promptLevelOf, reinforcementScheduleLabel,
} from '../../utils/aba/catalog.js';
import { SESSION_LOCATIONS, newId } from '../../utils/aba/mapping.js';
import { isDeleteConfirmationValid } from '../../utils/patientUi';
import { getPatientAge } from '../../hooks/useClinicState';
import { AbaConflictError, discardSession, saveSession } from '../../services/abaService';
import { AbaDialog } from './AbaDialog';
import { AbaIcon } from './AbaIcon';
import { CollectionSheetHeader, CollectionSheetProgram, PhaseChips, TrialMatrix } from './CollectionSheet';
import { BehaviorQuickPanel, ReinforcerQuickPanel, RiskQuickPanel } from './QuickEntry';

// ============================================================
// Coleta da sessão ABA (trazida do Atlas, SessionsPage). O rascunho vai
// para o banco 900 ms depois de cada toque (aba_save_session, em
// andamento); finalizar grava finalizada ou, com tentativa em branco,
// incompleta — que entra na janela de correção. Sem cópia local no
// navegador: coleta é dado clínico (AGENTS.md §9); quem fecha a aba com
// algo ainda não enviado recebe o aviso do navegador.
// ============================================================

// Relógio de parede para os toques (fora do componente: render fica puro).
const clockNow = () => Date.now();

const formatSeconds = total => `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;

const fingerprint = session => JSON.stringify({
  records: session.records,
  pauses: session.pauses,
  reinforcers: session.reinforcers,
  behaviors: session.behaviors,
  incidents: session.incidents,
  notes: session.notes,
});

function ReductionCollection({ record, program, episodes, onAddEpisode, onChange }) {
  const measure = program?.measure ?? 'frequência';
  const unit = program?.unit ?? 'registro';
  const sheet = program ? collectionTypeOf(normalizeCollectionType(program))?.sheet : undefined;
  const [swSeconds, setSwSeconds] = useState(0);
  const [swRunning, setSwRunning] = useState(false);
  const startRef = useRef(null);

  useEffect(() => {
    if (!swRunning) return undefined;
    const id = window.setInterval(() => {
      if (startRef.current != null) setSwSeconds(Math.round((clockNow() - startRef.current) / 1000));
    }, 250);
    return () => window.clearInterval(id);
  }, [swRunning]);

  const toggleSw = () => {
    if (swRunning) { setSwRunning(false); return; }
    startRef.current = clockNow() - swSeconds * 1000;
    setSwRunning(true);
  };
  const resetSw = () => { setSwRunning(false); setSwSeconds(0); startRef.current = null; };

  const isInterval = measure === 'intervalo parcial' || measure === 'intervalo total' || measure === 'amostragem momentânea';
  const isStopwatchValue = measure === 'duração' || measure === 'latência';
  const isRate = measure === 'taxa';
  const isProduct = sheet === 'produto';
  const isAbc = sheet === 'abc';
  const showsCounter = !isAbc && (measure === 'frequência' || measure === 'intensidade' || isRate);
  const intensityScale = program?.intensityScale?.length ? program.intensityScale : BEHAVIOR_INTENSITIES;

  // Na ficha ABC o valor do programa é a contagem de episódios registrados.
  const episodeCount = episodes.length;
  const syncAbcValue = useRef(onChange);
  useEffect(() => { syncAbcValue.current = onChange; });
  useEffect(() => {
    if (isAbc && record.value !== episodeCount) syncAbcValue.current({ value: episodeCount });
  }, [isAbc, episodeCount, record.value]);

  if (isInterval) {
    const totalIntervals = program?.intervalSeconds && program?.durationMinutes
      ? Math.min(60, Math.max(1, Math.floor((program.durationMinutes * 60) / program.intervalSeconds)))
      : 10;
    const marks = record.intervalMarks && record.intervalMarks.length === totalIntervals
      ? record.intervalMarks
      : Array(totalIntervals).fill(false);
    const occurred = marks.filter(Boolean).length;
    const toggle = index => {
      const next = marks.map((mark, position) => (position === index ? !mark : mark));
      onChange({ intervalMarks: next, value: next.filter(Boolean).length });
    };
    return (
      <div className="aba-reduction aba-reduction--interval">
        <h2><AbaIcon name="activity" size={22} /> {measure}</h2>
        <p>{program?.target}</p>
        <p className="aba-hint">
          Toque cada intervalo em que o comportamento {measure === 'intervalo total' ? 'ocorreu durante todo o intervalo' : measure === 'amostragem momentânea' ? 'estava presente no instante observado' : 'ocorreu em qualquer momento'}.
          {program?.intervalSeconds ? ` Intervalo de ${program.intervalSeconds}s.` : ''}
        </p>
        <div className="aba-interval-grid">
          {marks.map((mark, index) => (
            <button key={index} type="button" aria-pressed={mark} onClick={() => toggle(index)}>{index + 1}</button>
          ))}
        </div>
        <div className="aba-reduction-readout">
          <strong>{occurred}</strong>
          <small>de {totalIntervals} intervalos ({Math.round((occurred / totalIntervals) * 100)}%)</small>
        </div>
      </div>
    );
  }

  if (isAbc) {
    return (
      <div className="aba-reduction aba-reduction--abc">
        <h2><AbaIcon name="activity" size={22} /> Registro ABC</h2>
        <p>{program?.target}</p>
        <p className="aba-hint">Cada episódio é registrado com antecedente, comportamento e consequência. A contagem acompanha os episódios — não há número para digitar.</p>
        <div className="aba-reduction-readout"><strong>{episodeCount}</strong><small>{episodeCount === 1 ? 'episódio nesta sessão' : 'episódios nesta sessão'}</small></div>
        <button type="button" className="primary-button" onClick={onAddEpisode}><AbaIcon name="plus" /> Registrar episódio</button>
        <div className="aba-abc-list">
          {episodes.map(episode => (
            <article key={episode.id}>
              <span className="aba-tag">{episode.moment}</span>
              <div>
                <strong>A: {episode.antecedent}</strong>
                <small>C (consequência): {episode.consequence} · conduta: {episode.conduct}</small>
                <small>Intensidade {episode.intensity || '—'}{episode.durationSeconds ? ` · ${episode.durationSeconds}s` : ''}</small>
              </div>
            </article>
          ))}
          {!episodeCount && <p className="aba-empty">Nenhum episódio registrado até agora.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="aba-reduction">
      <h2><AbaIcon name="activity" size={22} /> {isProduct ? 'Produto permanente' : `Registro de ${measure}`}</h2>
      <p>{program?.target}</p>
      {isProduct && <p className="aba-hint">Conte o resultado observável deixado pela atividade, ao final dela — não o comportamento durante a execução.</p>}
      {showsCounter && (
        <>
          <div className="aba-counter">
            <button type="button" className="aba-counter-step" onClick={() => onChange({ value: Math.max(0, record.value - 1) })} aria-label="Diminuir">−</button>
            <div className="aba-counter-value"><strong>{record.value}</strong><small>{isRate ? 'ocorrências' : unit}</small></div>
            <button type="button" className="aba-counter-step is-add" onClick={() => onChange({ value: record.value + 1 })} aria-label="Adicionar">+</button>
          </div>
          {measure === 'intensidade' && (
            <div className="aba-chip-row">
              {intensityScale.map(level => (
                <button key={level} type="button" className="aba-chip" aria-pressed={record.intensity === level} onClick={() => onChange({ intensity: level })}>{level}</button>
              ))}
            </div>
          )}
        </>
      )}

      {(isStopwatchValue || isRate) && (
        <div className="aba-stopwatch">
          <div className="aba-stopwatch-display">{formatSeconds(swSeconds)}</div>
          <div className="aba-button-row">
            <button type="button" className="quiet-button" onClick={toggleSw}>
              {swRunning ? <><AbaIcon name="pause" /> Pausar</> : <><AbaIcon name="play" /> Iniciar</>}
            </button>
            <button type="button" className="quiet-button" onClick={resetSw}><AbaIcon name="reset" /> Zerar</button>
            <button
              type="button"
              className="primary-button"
              disabled={!swSeconds}
              onClick={() => { setSwRunning(false); onChange(isRate ? { observedSeconds: swSeconds } : { value: swSeconds }); }}
            >
              <AbaIcon name="check" /> Registrar tempo
            </button>
          </div>
          <small>
            {isRate
              ? `Tempo observado registrado: ${record.observedSeconds ? formatSeconds(record.observedSeconds) : '—'}`
              : `${measure === 'latência' ? 'Latência' : 'Duração'} registrada: ${record.value ? formatSeconds(record.value) : '—'}`}
          </small>
        </div>
      )}

      {isRate && (
        <div className="aba-reduction-readout">
          <strong>{record.observedSeconds ? (record.value / (record.observedSeconds / 60)).toFixed(2).replace('.', ',') : '—'}</strong>
          <small>{unit || 'ocorrências/min'} (taxa = ocorrências ÷ tempo)</small>
        </div>
      )}
      {isStopwatchValue && <small className="aba-hint">Unidade: segundos.</small>}
    </div>
  );
}

/** Aviso de fim de bloco: faixa, não janela — interromper no meio de uma tentativa é pior. */
function BlockPauseNotice({ startAt, pauses, blockMinutes, pauseMinutes, onPause }) {
  const [dismissedFor, setDismissedFor] = useState(0);
  const [now, setNow] = useState(() => clockNow());
  useEffect(() => {
    const id = window.setInterval(() => setNow(clockNow()), 15000);
    return () => window.clearInterval(id);
  }, []);

  const paused = pauses.reduce((total, pause) => total + ((pause.endAt ?? now) - pause.startAt), 0);
  const isPaused = pauses.some(pause => !pause.endAt);
  const elapsedMinutes = Math.floor((now - startAt - paused) / 60000);
  const blocksDone = blockMinutes > 0 ? Math.floor(elapsedMinutes / blockMinutes) : 0;

  if (isPaused || blocksDone < 1 || blocksDone <= dismissedFor) return null;

  return (
    <div className="aba-block-pause" role="status">
      <AbaIcon name="timer" size={17} />
      <p>
        <strong>Bloco de {blockMinutes} min concluído.</strong>
        {' '}Pausa prevista de {pauseMinutes} min — o relógio da intervenção para enquanto isso.
      </p>
      <div className="aba-button-row">
        <button type="button" className="primary-button" onClick={() => { setDismissedFor(blocksDone); onPause(); }}>
          <AbaIcon name="pause" /> Iniciar pausa
        </button>
        <button type="button" className="quiet-button" onClick={() => setDismissedFor(blocksDone)}>Continuar</button>
      </div>
    </div>
  );
}

/** Configuração do programa definida pela supervisão, só exibida na coleta. */
function ProtocolStrip({ program, reinforcers }) {
  const hierarchy = orderedPromptHierarchy(program?.promptHierarchy);
  const programReinforcers = program?.reinforcerIds?.length
    ? reinforcers.filter(reinforcer => program.reinforcerIds.includes(reinforcer.id))
    : [];
  const restricted = isRestrictedProcedure(program?.procedure);
  return (
    <>
      {restricted && (
        <div className="aba-protocol-restricted">
          <AbaIcon name="shield" size={17} />
          <div>
            <strong>Procedimento restrito: {program?.procedure}</strong>
            <p>{program?.restrictedAuthorization || 'Autorizado pela supervisão.'}</p>
            <small>Siga o plano de segurança do comportamento. Qualquer dúvida, pause e chame a supervisão.</small>
          </div>
        </div>
      )}
      <div className="aba-protocol-strip">
        <div><small>Condição de aplicação</small><p>{program?.applicationCondition || '—'}</p></div>
        <div><small>Resposta correta</small><p>{program?.correctResponseDefinition || '—'}</p></div>
        <div><small>Erro</small><p>{program?.errorDefinition || '—'}</p></div>
        <div>
          <small>Ajuda máxima que vale para o critério</small>
          <p>
            {program?.promptCeiling
              ? `Até ${promptLevelOf(program.promptCeiling)?.label.toLowerCase() ?? program.promptCeiling}`
              : program?.maxPromptLevel || PROMPT_LEVELS.filter(level => hierarchy.includes(level.response)).at(-1)?.label || '—'}
          </p>
        </div>
        <div><small>Reforçadores previstos</small><p>{programReinforcers.length ? programReinforcers.map(reinforcer => reinforcer.name).join(', ') : '—'}</p></div>
        <div>
          <small>Entrega do reforço</small>
          <p>{reinforcementScheduleLabel(program?.reinforcementSchedule)}{program?.tokenEconomy ? ' · economia de fichas' : ''}</p>
        </div>
      </div>
    </>
  );
}

const ageLabel = patient => {
  const age = getPatientAge(patient);
  if (age === '' || age === null || age === undefined) return '';
  return `${age} ${String(age) === '1' ? 'ano' : 'anos'}`;
};

export function AbaCollection({ patient, data, userId, onChanged, onOpenSessions }) {
  const programs = data.programs.filter(program => !program.archivedAt);
  const { available, reason: unavailableReason } = sessionProgramAvailability(programs, patient.id, null);
  const myOpenDraft = data.sessions.find(session => session.status === 'em_andamento' && session.therapistId === userId);
  const otherOpenDraft = data.sessions.find(session => session.status === 'em_andamento' && session.therapistId !== userId);

  const [location, setLocation] = useState('Clínica');
  const [isGeneralizationProbe, setIsGeneralizationProbe] = useState(false);
  const [probeCondition, setProbeCondition] = useState('material');
  const [context, setContext] = useState({
    arrivalState: ARRIVAL_STATES[0],
    healthCondition: HEALTH_CONDITIONS[0],
    routineChange: ROUTINE_CHANGES[0],
    apparentMotivation: MOTIVATION_LEVELS[0],
    material: SESSION_MATERIALS[0],
  });
  const [peoplePresent, setPeoplePresent] = useState(['Somente terapeuta']);
  const [selectedIds, setSelectedIds] = useState([]);
  const [draft, setDraft] = useState(null);
  const [activeProgramId, setActiveProgramId] = useState('');
  const [eventModal, setEventModal] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closingNote, setClosingNote] = useState('');
  const [savingSession, setSavingSession] = useState(false);
  const [sessionError, setSessionError] = useState(null);
  const [conflict, setConflict] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [discardText, setDiscardText] = useState('');
  const [autosaveStatus, setAutosaveStatus] = useState('aguardando');
  const [autosaveRetry, setAutosaveRetry] = useState(0);
  const autosavePausedRef = useRef(false);
  const autosavePromiseRef = useRef(null);
  const lastSavedFingerprintRef = useRef('');
  const draftRef = useRef(null);
  useEffect(() => { draftRef.current = draft; }, [draft]);

  useEffect(() => {
    const retryWhenOnline = () => setAutosaveRetry(value => value + 1);
    window.addEventListener('online', retryWhenOnline);
    return () => window.removeEventListener('online', retryWhenOnline);
  }, []);

  // Fechar a aba com coleta ainda não enviada: o navegador pergunta.
  useEffect(() => {
    if (!draft || draft.status !== 'em_andamento') return undefined;
    const warn = event => {
      if (fingerprint(draft) === lastSavedFingerprintRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [draft]);

  // Salvamento automático: 900 ms depois do último toque, um envio por vez.
  useEffect(() => {
    if (!draft || draft.status !== 'em_andamento' || autosavePausedRef.current || conflict) return undefined;
    const print = fingerprint(draft);
    if (print === lastSavedFingerprintRef.current) return undefined;

    const timer = window.setTimeout(() => {
      if (autosavePausedRef.current) return;
      if (autosavePromiseRef.current) {
        setAutosaveRetry(value => value + 1);
        return;
      }
      setAutosaveStatus('salvando');
      const snapshot = draftRef.current;
      const operation = saveSession(patient.id, snapshot)
        .then(saved => {
          lastSavedFingerprintRef.current = print;
          setAutosaveStatus('salvo');
          setSessionError(null);
          setDraft(current => (current ? { ...current, id: saved.id, revision: saved.revision } : current));
        })
        .catch(error => {
          if (error instanceof AbaConflictError) {
            setConflict(true);
            setAutosaveStatus('erro');
            setSessionError('Esta coleta foi alterada em outra aba ou aparelho. Recarregue para continuar de onde ela está.');
            return;
          }
          setAutosaveStatus('erro');
          setSessionError(`Salvamento automático pendente: ${error.message || 'tentaremos novamente.'}`);
          window.setTimeout(() => setAutosaveRetry(value => value + 1), 5000);
        })
        .finally(() => { autosavePromiseRef.current = null; });
      autosavePromiseRef.current = operation;
    }, 900);

    return () => window.clearTimeout(timer);
  }, [autosaveRetry, draft, patient.id, conflict]);

  const start = () => {
    const ids = selectedIds.length ? selectedIds : available.map(program => program.id);
    // A fase já vem do status do programa: "Planejado" nasce em linha de base.
    const records = available.filter(program => ids.includes(program.id)).map(program => (program.type === 'aquisicao'
      ? {
        programId: program.id,
        type: 'aquisicao',
        phase: defaultPhaseForStatus(program.status),
        trials: Array(program.taskSteps?.length || program.trialCount || 1).fill(null),
      }
      : { programId: program.id, type: 'reducao', phase: defaultPhaseForStatus(program.status), value: 0 }));
    const now = clockNow();
    autosavePausedRef.current = false;
    lastSavedFingerprintRef.current = '';
    setConflict(false);
    setAutosaveStatus('aguardando');
    setSessionError(null);
    setDraft({
      id: null,
      clientEventId: newId(),
      revision: undefined,
      patientId: patient.id,
      therapistId: userId,
      supervisorId: data.team?.supervisorId || '',
      date: new Date(now).toISOString().slice(0, 10),
      startAt: now,
      location,
      arrivalState: context.arrivalState,
      healthCondition: context.healthCondition,
      routineChange: context.routineChange,
      apparentMotivation: context.apparentMotivation,
      material: context.material,
      peoplePresent: peoplePresent.length ? peoplePresent : ['Somente terapeuta'],
      isGeneralizationProbe,
      generalizationCondition: isGeneralizationProbe ? probeCondition : undefined,
      status: 'em_andamento',
      records,
      pauses: [],
      reinforcers: [],
      behaviors: [],
      incidents: [],
      notes: '',
    });
    setActiveProgramId(ids[0] ?? '');
  };

  const resume = session => {
    autosavePausedRef.current = false;
    lastSavedFingerprintRef.current = fingerprint(session);
    setConflict(false);
    setAutosaveStatus('salvo');
    setSessionError(null);
    setLocation(session.location);
    setDraft(session);
    setActiveProgramId(session.records[0]?.programId ?? '');
  };

  // Descartar apaga de vez: confirma digitando "excluir" (regra do sistema).
  const discardDraft = async () => {
    if (!draft || !isDeleteConfirmationValid(discardText)) return;
    autosavePausedRef.current = true;
    setSavingSession(true);
    try {
      await autosavePromiseRef.current?.catch(() => undefined);
      if (draftRef.current?.id) await discardSession(draftRef.current.id);
      setDiscarding(false);
      setDiscardText('');
      setDraft(null);
      setSelectedIds([]);
      onChanged?.();
    } catch (error) {
      autosavePausedRef.current = false;
      setSessionError(error.message);
    } finally {
      setSavingSession(false);
    }
  };

  const activeRecord = draft?.records.find(record => record.programId === activeProgramId);
  const activeProgram = data.programs.find(program => program.id === activeProgramId);

  const updateActiveRecord = patch => setDraft(current => current && ({
    ...current,
    records: current.records.map(record => (record.programId === activeProgramId ? { ...record, ...patch(record) } : record)),
  }));

  const setTrialAt = (index, value) => updateActiveRecord(record => (record.type !== 'aquisicao' ? {} : {
    trials: record.trials.map((trial, position) => (position === index ? value : trial)),
  }));
  const setTrialSecondsAt = (index, value) => updateActiveRecord(record => {
    if (record.type !== 'aquisicao') return {};
    const base = record.trialSeconds ?? Array(record.trials.length).fill(null);
    return { trialSeconds: base.map((entry, position) => (position === index ? value : entry)) };
  });
  const setPhaseAt = value => updateActiveRecord(() => ({ phase: value }));

  const togglePause = () => setDraft(current => current && ({
    ...current,
    pauses: current.pauses.at(-1) && !current.pauses.at(-1).endAt
      ? current.pauses.map((pause, index) => (index === current.pauses.length - 1 ? { ...pause, endAt: clockNow() } : pause))
      : [...current.pauses, { startAt: clockNow() }],
  }));

  const finalize = async (status, extraNotes = '') => {
    if (!draft) return;
    autosavePausedRef.current = true;
    setSavingSession(true);
    setSessionError(null);
    const endedAt = clockNow();
    try {
      await autosavePromiseRef.current?.catch(() => undefined);
      const current = draftRef.current;
      await saveSession(patient.id, {
        ...current,
        status,
        endAt: endedAt,
        notes: [current.notes, extraNotes].map(part => part.trim()).filter(Boolean).join('\n'),
        pauses: current.pauses.map(pause => (pause.endAt ? pause : { ...pause, endAt: endedAt })),
      });
      setDraft(null);
      setSelectedIds([]);
      setClosing(false);
      setAutosaveStatus('salvo');
      onChanged?.();
    } catch (error) {
      setSessionError(error instanceof AbaConflictError
        ? 'Esta coleta foi alterada em outra aba ou aparelho. Recarregue antes de finalizar.'
        : (error.message || 'Não foi possível salvar a sessão.'));
      autosavePausedRef.current = false;
      setAutosaveRetry(value => value + 1);
    } finally {
      setSavingSession(false);
    }
  };

  // Abrir o registro de risco pausa a coleta: o terapeuta está atendendo a ocorrência.
  const openRisk = () => {
    setDraft(current => {
      if (!current) return current;
      const last = current.pauses.at(-1);
      return last && !last.endAt ? current : { ...current, pauses: [...current.pauses, { startAt: clockNow() }] };
    });
    setEventModal('risk');
  };
  const registerRisk = incident => {
    setDraft(current => current && ({ ...current, incidents: [...current.incidents, { ...incident, id: newId(), reviewed: false }] }));
    setEventModal(null);
  };
  const registerBehavior = event => {
    setDraft(current => current && ({
      ...current,
      behaviors: [...current.behaviors, {
        ...event,
        id: newId(),
        moment: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        programId: activeProgramId || undefined,
      }],
    }));
    setEventModal(null);
  };

  if (draft) {
    const acquisition = activeRecord?.type === 'aquisicao' ? activeRecord : null;
    const lastPause = draft.pauses.at(-1);
    const isPaused = Boolean(lastPause && !lastPause.endAt);
    const patientReinforcers = data.reinforcers.filter(reinforcer => reinforcer.active);
    const patientBehaviors = data.behaviors.filter(behavior => behavior.status !== 'inactive');
    const sessionNumber = data.sessions.filter(session => session.id !== draft.id && session.status !== 'em_andamento').length + 1;
    const activeIndex = Math.max(0, draft.records.findIndex(record => record.programId === activeProgramId));
    const autosaveLabel = autosaveStatus === 'salvando'
      ? 'Salvando dados...'
      : autosaveStatus === 'salvo'
        ? `Dados salvos automaticamente · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
        : autosaveStatus === 'erro'
          ? 'Sem sincronização; tentando de novo.'
          : 'O salvamento automático começa no primeiro toque.';

    return (
      <div className="aba-page">
        <div className="aba-page-head">
          <div>
            <p className="aba-eyebrow">Sessão em andamento</p>
            <h2>{patient.name}</h2>
            <p className="aba-muted">{draft.location} · {draft.records.length} {draft.records.length === 1 ? 'programa' : 'programas'}</p>
          </div>
          <div className="aba-button-row">
            <button type="button" className="quiet-button" disabled={savingSession} onClick={togglePause}>
              <AbaIcon name={isPaused ? 'play' : 'pause'} /> {isPaused ? 'Retomar' : 'Pausar'}
            </button>
            <button type="button" className="quiet-button" disabled={savingSession} onClick={() => { setDiscardText(''); setDiscarding(true); }}>
              <AbaIcon name="trash" /> Descartar
            </button>
            <button type="button" className="primary-button" disabled={savingSession || conflict} onClick={() => { setClosingNote(''); setClosing(true); }}>
              <AbaIcon name="check" /> Finalizar sessão
            </button>
          </div>
        </div>
        {sessionError && (
          <p className="aba-error" role="alert">
            {sessionError}
            {conflict && <button type="button" className="quiet-button" onClick={() => { setDraft(null); onChanged?.(); }}>Recarregar</button>}
          </p>
        )}

        <section className="aba-collection-sheet">
          <CollectionSheetHeader
            patientName={patient.name}
            age={ageLabel(patient)}
            teamName={data.team?.name || 'Sem time'}
            protocolStart={activeProgram?.protocolStartDate ? new Date(`${activeProgram.protocolStartDate}T12:00:00`).toLocaleDateString('pt-BR') : '—'}
            sessionNumber={sessionNumber}
            therapistName={data.professionalName(draft.therapistId)}
            supervisorName={draft.supervisorId ? data.professionalName(draft.supervisorId) : '—'}
            date={new Date(draft.startAt).toLocaleDateString('pt-BR')}
            startedAtLabel={new Date(draft.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            location={draft.location}
            startAt={draft.startAt}
            pauses={draft.pauses}
            programCount={draft.records.length}
          />

          <div className="aba-program-cards">
            {draft.records.map((record, index) => {
              const program = data.programs.find(item => item.id === record.programId);
              const done = record.type === 'aquisicao' ? record.trials.filter(trial => trial !== null).length : 0;
              const total = record.type === 'aquisicao' ? record.trials.length : 0;
              const complete = total > 0 && done === total;
              return (
                <button
                  key={record.programId}
                  type="button"
                  className={`aba-program-card${complete ? ' is-complete' : ''}`}
                  aria-pressed={record.programId === activeProgramId}
                  onClick={() => setActiveProgramId(record.programId)}
                >
                  <span className="aba-program-card-top">
                    <span className="aba-program-card-badge">P{index + 1}</span>
                    {complete && <AbaIcon name="check" size={15} />}
                  </span>
                  <strong>{program?.name || 'Programa'}</strong>
                  <small>{program?.objective || '—'}</small>
                  <span className="aba-program-card-meta">
                    {record.type === 'aquisicao'
                      ? <>{program?.criteria?.minimumSeconds ? <span>Tempo-alvo {program.criteria.minimumSeconds}s</span> : null}<span>{done}/{total} registradas</span></>
                      : <span>{program?.type === 'reducao' ? `${program.measure} · ${program.unit}` : 'Redução'} · coleta contínua</span>}
                  </span>
                </button>
              );
            })}
          </div>

          <CollectionSheetProgram index={activeIndex} program={activeProgram} />
          {activeRecord && <PhaseChips phase={recordPhase(activeRecord)} onChange={setPhaseAt} />}
          <ProtocolStrip program={activeProgram} reinforcers={data.reinforcers} />

          {acquisition ? (
            <TrialMatrix
              record={acquisition}
              program={activeProgram}
              notes={draft.notes}
              onNotesChange={value => setDraft(current => current && { ...current, notes: value })}
              onSetTrial={setTrialAt}
              onSetSeconds={setTrialSecondsAt}
              autosaveLabel={autosaveLabel}
              autosaveSaved={autosaveStatus === 'salvo'}
            />
          ) : activeRecord?.type === 'reducao' && (
            <>
              <ReductionCollection
                record={activeRecord}
                program={activeProgram?.type === 'reducao' ? activeProgram : undefined}
                episodes={draft.behaviors.filter(event => event.programId === activeProgramId)}
                onAddEpisode={() => setEventModal('behavior')}
                onChange={patch => updateActiveRecord(() => patch)}
              />
              <label className="aba-session-notes">
                Notas da sessão
                <textarea value={draft.notes} onChange={event => setDraft(current => current && { ...current, notes: event.target.value })} placeholder="Contexto, variações e observações relevantes" />
              </label>
              <p className="aba-muted" role="status">{autosaveLabel}</p>
            </>
          )}

          <BlockPauseNotice
            startAt={draft.startAt}
            pauses={draft.pauses}
            blockMinutes={data.settings.programBlockMinutes}
            pauseMinutes={data.settings.pauseMinutes}
            onPause={() => setDraft(current => current && { ...current, pauses: [...current.pauses, { startAt: clockNow() }] })}
          />

          <div className="aba-event-bar">
            <button type="button" onClick={() => setEventModal('reinforcer')}><AbaIcon name="plus" /> Reforçador <small>{draft.reinforcers.length}</small></button>
            <button type="button" onClick={() => setEventModal('behavior')}><AbaIcon name="plus" /> Registro ABC <small>{draft.behaviors.length}</small></button>
            <button type="button" className="is-risk" onClick={openRisk}><AbaIcon name="alert" /> Situação de risco <small>{draft.incidents.length}</small></button>
          </div>
        </section>

        {closing && (() => {
          const summary = summarizeSession(draft, data.programs, data.reinforcers, data.behaviors);
          const incomplete = summary.filledTrials < summary.plannedTrials;
          return (
            <AbaDialog title="Finalizar sessão" busy={savingSession} onClose={() => setClosing(false)}>
              <div className="aba-session-close">
                <div className="aba-descriptive-strip">
                  <span><small>Tempo total</small><strong>{summary.durationMinutes} min</strong></span>
                  <span><small>Programas</small><strong>{summary.programs.length}</strong></span>
                  <span><small>Tentativas</small><strong>{summary.filledTrials}/{summary.plannedTrials}</strong></span>
                  <span><small>Acerto</small><strong>{summary.correctPercentage == null ? '—' : `${summary.correctPercentage}%`}</strong></span>
                  <span><small>Independência</small><strong>{summary.independencePercentage == null ? '—' : `${summary.independencePercentage}%`}</strong></span>
                  {summary.maxSeconds != null && <span><small>Maior tempo</small><strong>{summary.maxSeconds}s</strong></span>}
                  <span><small>Interferentes</small><strong>{summary.behaviors.episodes}</strong></span>
                  <span><small>Risco</small><strong>{summary.incidents}</strong></span>
                </div>

                <div className="aba-session-close-programs">
                  {summary.programs.map(program => (
                    <article key={program.programId}>
                      <strong>{program.name}</strong>
                      {program.type === 'aquisicao'
                        ? <small>{program.filledTrials}/{program.plannedTrials} tentativas · {program.independencePercentage == null ? 'sem dado' : `${program.independencePercentage}% de independência`}{program.maxSeconds != null ? ` · maior tempo ${program.maxSeconds}s` : ''}</small>
                        : <small>{program.value ?? 0} {program.unit ?? 'ocorrências'}</small>}
                    </article>
                  ))}
                </div>

                {summary.reinforcers.length > 0 && (
                  <div className="aba-session-close-block">
                    <h3>Reforçadores</h3>
                    <p>{summary.reinforcers.map(item => `${item.name} (${item.uses}× · ${item.efficiency.toLowerCase()})`).join(' · ')}</p>
                  </div>
                )}

                <div className="aba-session-close-block">
                  <h3>Observação clínica automática</h3>
                  <p className="aba-session-close-narrative">{sessionNarrative(summary)}</p>
                  <small className="aba-hint">Gerada só com o que foi registrado nesta sessão. Se algo estiver errado, corrija o dado — não o texto.</small>
                </div>

                {summary.missing.length > 0 && (
                  <div className="aba-session-close-block is-warn">
                    <h3>Campos não preenchidos</h3>
                    <ul>{summary.missing.map(item => <li key={item}>{item}</li>)}</ul>
                    {incomplete && <small className="aba-hint">Com tentativa em branco a sessão é salva como <strong>incompleta</strong> e entra na janela de correção.</small>}
                  </div>
                )}

                <label className="aba-field">
                  Acrescentar observação (opcional)
                  <textarea value={closingNote} onChange={event => setClosingNote(event.target.value)} rows={3} placeholder="Só o que não estiver nos dados registrados." />
                </label>

                {sessionError && <p className="aba-error" role="alert">{sessionError}</p>}
                <div className="aba-form-actions">
                  <button type="button" className="quiet-button" disabled={savingSession} onClick={() => setClosing(false)}>Voltar à coleta</button>
                  <button type="button" className="primary-button" disabled={savingSession} onClick={() => void finalize(incomplete ? 'incompleta' : 'finalizada', closingNote)}>
                    <AbaIcon name="check" /> {savingSession ? 'Salvando...' : 'Salvar e finalizar'}
                  </button>
                </div>
              </div>
            </AbaDialog>
          );
        })()}

        {discarding && (
          <AbaDialog title="Descartar coleta" busy={savingSession} onClose={() => setDiscarding(false)}>
            <p>O que foi registrado nesta coleta será apagado e não volta. Situação de risco já registrada impede o descarte: nesse caso, finalize como incompleta.</p>
            <label className="aba-field">
              Para confirmar, digite excluir
              <input value={discardText} onChange={event => setDiscardText(event.target.value)} placeholder="Digite excluir" autoComplete="off" />
            </label>
            {sessionError && <p className="aba-error" role="alert">{sessionError}</p>}
            <div className="aba-form-actions">
              <button type="button" className="quiet-button" disabled={savingSession} onClick={() => setDiscarding(false)}>Voltar à coleta</button>
              <button type="button" className="primary-button aba-button-risk" disabled={savingSession || !isDeleteConfirmationValid(discardText)} onClick={() => void discardDraft()}>
                <AbaIcon name="trash" /> Descartar coleta
              </button>
            </div>
          </AbaDialog>
        )}
        {eventModal === 'reinforcer' && (
          <AbaDialog title="Reforçador" onClose={() => setEventModal(null)}>
            <ReinforcerQuickPanel
              reinforcers={patientReinforcers}
              uses={draft.reinforcers}
              programId={activeProgramId}
              onChange={next => setDraft(current => current && { ...current, reinforcers: next })}
              onClose={() => setEventModal(null)}
            />
          </AbaDialog>
        )}
        {eventModal === 'behavior' && (
          <AbaDialog title="Comportamento interferente" onClose={() => setEventModal(null)}>
            <BehaviorQuickPanel behaviors={patientBehaviors} onRegister={registerBehavior} onCancel={() => setEventModal(null)} />
          </AbaDialog>
        )}
        {eventModal === 'risk' && (
          <AbaDialog title="Situação de risco" guardUnsaved onClose={() => setEventModal(null)}>
            <RiskQuickPanel peoplePresent={draft.peoplePresent} onRegister={registerRisk} onCancel={() => setEventModal(null)} />
          </AbaDialog>
        )}
      </div>
    );
  }

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Coleta</p>
          <h2>Iniciar coleta clínica</h2>
          <p className="aba-muted">Escolha o contexto e os programas; aquisição e redução podem ser coletadas na mesma sessão.</p>
        </div>
        <button type="button" className="quiet-button" onClick={onOpenSessions}>Ver sessões</button>
      </div>

      {myOpenDraft && (
        <section className="aba-card aba-callout">
          <div>
            <p className="aba-eyebrow">Coleta não finalizada</p>
            <h3>Sessão de {new Date(myOpenDraft.startAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</h3>
            <p className="aba-muted">Continua de onde parou: tudo o que foi tocado já estava salvo.</p>
          </div>
          <button type="button" className="primary-button" onClick={() => resume(myOpenDraft)}>
            <AbaIcon name="play" /> Continuar sessão em andamento
          </button>
        </section>
      )}
      {otherOpenDraft && !myOpenDraft && (
        <p className="aba-note">
          {data.professionalName(otherOpenDraft.therapistId)} está com uma coleta deste paciente em andamento. Uma nova sessão aqui é separada da dela.
        </p>
      )}

      <section className="aba-card">
        <div className="aba-form-grid">
          <label className="aba-field">Ambiente
            <select value={location} onChange={event => setLocation(event.target.value)}>
              {SESSION_LOCATIONS.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="aba-field">Estado de chegada
            <select value={context.arrivalState} onChange={event => setContext(current => ({ ...current, arrivalState: event.target.value }))}>
              {ARRIVAL_STATES.map(state => <option key={state}>{state}</option>)}
            </select>
          </label>
          <label className="aba-field">Condição de saúde
            <select value={context.healthCondition} onChange={event => setContext(current => ({ ...current, healthCondition: event.target.value }))}>
              {HEALTH_CONDITIONS.map(condition => <option key={condition}>{condition}</option>)}
            </select>
          </label>
          <label className="aba-field">Alteração de rotina
            <select value={context.routineChange} onChange={event => setContext(current => ({ ...current, routineChange: event.target.value }))}>
              {ROUTINE_CHANGES.map(change => <option key={change}>{change}</option>)}
            </select>
          </label>
          <label className="aba-field">Motivação aparente
            <select value={context.apparentMotivation} onChange={event => setContext(current => ({ ...current, apparentMotivation: event.target.value }))}>
              {MOTIVATION_LEVELS.map(level => <option key={level}>{level}</option>)}
            </select>
          </label>
          <label className="aba-field">Material
            <select value={context.material} onChange={event => setContext(current => ({ ...current, material: event.target.value }))}>
              {SESSION_MATERIALS.map(item => <option key={item}>{item}</option>)}
            </select>
            <small className="aba-hint">Terceira dimensão da generalização, junto de pessoa e ambiente.</small>
          </label>
        </div>

        <div className="aba-quick-field">
          <button type="button" className="aba-chip aba-chip--wide" aria-pressed={isGeneralizationProbe} onClick={() => setIsGeneralizationProbe(current => !current)}>
            Sonda de generalização
          </button>
        </div>
        {isGeneralizationProbe && (
          <div className="aba-quick-field">
            <span className="aba-chip-label">O que muda nesta sonda</span>
            <div className="aba-chip-row">
              {GENERALIZATION_CONDITIONS.map(entry => (
                <button key={entry.value} type="button" className="aba-chip" aria-pressed={probeCondition === entry.value} onClick={() => setProbeCondition(entry.value)}>{entry.label}</button>
              ))}
            </div>
          </div>
        )}
        <div className="aba-quick-field">
          <span className="aba-chip-label">Pessoas presentes</span>
          <div className="aba-chip-row">
            {PEOPLE_PRESENT_OPTIONS.map(person => (
              <button
                key={person}
                type="button"
                className="aba-chip"
                aria-pressed={peoplePresent.includes(person)}
                onClick={() => setPeoplePresent(current => (current.includes(person) ? current.filter(item => item !== person) : [...current, person]))}
              >
                {person}
              </button>
            ))}
          </div>
        </div>

        <div className="aba-section-head">
          <div><p className="aba-eyebrow">Programas disponíveis</p><h3>Escolha os blocos da sessão</h3></div>
          <small className="aba-muted">Sem escolha, entram todos.</small>
        </div>
        <div className="aba-select-programs">
          {available.map(program => (
            <button
              key={program.id}
              type="button"
              className="aba-select-program"
              aria-pressed={selectedIds.includes(program.id)}
              onClick={() => setSelectedIds(ids => (ids.includes(program.id) ? ids.filter(id => id !== program.id) : [...ids, program.id]))}
            >
              <span>
                <strong>{program.name}</strong>
                <small>{program.type === 'aquisicao'
                  ? `${program.taskSteps?.length || program.trialCount} ${program.taskSteps?.length ? 'etapas' : 'oportunidades'} · ${collectionTypeLabel(normalizeCollectionType(program))}`
                  : `${program.measure} · ${program.unit}`}</small>
              </span>
              <span className="aba-tag">{program.type === 'aquisicao' ? 'Aquisição' : 'Redução'}</span>
            </button>
          ))}
        </div>
        {unavailableReason && <p className="aba-empty">{unavailableReason}</p>}
        {sessionError && <p className="aba-error" role="alert">{sessionError}</p>}
        <button type="button" className="primary-button aba-button-wide" disabled={!available.length} onClick={start}>
          <AbaIcon name="play" size={18} /> Iniciar sessão com {selectedIds.length || available.length} {(selectedIds.length || available.length) === 1 ? 'programa' : 'programas'}
        </button>
      </section>
    </div>
  );
}

export default AbaCollection;
