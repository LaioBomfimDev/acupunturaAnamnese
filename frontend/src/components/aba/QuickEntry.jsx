import { useEffect, useState } from 'react';
import {
  BEHAVIOR_ANTECEDENTS, BEHAVIOR_CONDUCTS, BEHAVIOR_CONSEQUENCES, BEHAVIOR_INTENSITIES,
  GUARDIAN_CONTACT_OPTIONS, OTHER_OPTION, PEOPLE_PRESENT_OPTIONS, REINFORCER_EFFICIENCIES,
  RISK_INJURIES, RISK_INTERVENTIONS, RISK_SITUATIONS,
} from '../../utils/aba/catalog.js';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Registros rápidos durante a coleta (trazidos do Atlas,
// components/QuickEntry.tsx): reforçador, comportamento interferente
// (ABC) e situação de risco. Tudo por toque; "Outro" abre um campo.
// ============================================================

/** Linha de escolha por toque. `Outro` abre o campo livre. */
function ChipChoice({ label, options, value, onChange, otherValue, onOtherChange }) {
  const usesOther = onOtherChange !== undefined;
  const isOther = usesOther && value === OTHER_OPTION;
  return (
    <div className="aba-quick-field">
      <span className="aba-chip-label">{label}</span>
      <div className="aba-chip-row">
        {options.map(option => (
          <button
            key={option}
            type="button"
            className="aba-chip"
            aria-pressed={value === option}
            onClick={() => onChange(value === option ? '' : option)}
          >
            {option}
          </button>
        ))}
      </div>
      {isOther && (
        <input
          className="aba-quick-other"
          autoFocus
          value={otherValue ?? ''}
          onChange={event => onOtherChange?.(event.target.value)}
          placeholder="Descreva"
          aria-label={`${label} — descrever`}
        />
      )}
    </div>
  );
}

const resolve = (choice, other) => (choice === OTHER_OPTION ? other.trim() : choice);

/** Episódio de comportamento interferente: comportamento, intensidade e ABC por toque. */
export function BehaviorQuickPanel({ behaviors, onRegister, onCancel }) {
  const [behaviorId, setBehaviorId] = useState('');
  const [intensity, setIntensity] = useState('');
  const [antecedent, setAntecedent] = useState('');
  const [antecedentOther, setAntecedentOther] = useState('');
  const [consequence, setConsequence] = useState('');
  const [consequenceOther, setConsequenceOther] = useState('');
  const [conduct, setConduct] = useState('');
  const [conductOther, setConductOther] = useState('');
  const [startedAt, setStartedAt] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const [newBehavior, setNewBehavior] = useState(false);

  useEffect(() => {
    if (startedAt == null) return undefined;
    const id = window.setInterval(() => setSeconds(Math.round((Date.now() - startedAt) / 1000)), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const resolvedAntecedent = resolve(antecedent, antecedentOther);
  const resolvedConsequence = resolve(consequence, consequenceOther);
  const resolvedConduct = resolve(conduct, conductOther);
  const ready = Boolean(behaviorId && intensity && resolvedAntecedent && resolvedConsequence && resolvedConduct);

  const submit = () => {
    if (!ready) return;
    onRegister({
      behaviorId,
      quantity: 1,
      intensity,
      durationSeconds: seconds || undefined,
      antecedent: resolvedAntecedent,
      consequence: resolvedConsequence,
      conduct: resolvedConduct,
      newBehavior,
    });
  };

  if (!behaviors.length) {
    return <p className="aba-empty">Nenhum comportamento interferente cadastrado para este paciente. Cadastre em Repertório.</p>;
  }

  return (
    <div className="aba-quick-panel">
      <ChipChoice
        label="Comportamento"
        options={behaviors.map(behavior => behavior.name)}
        value={behaviors.find(behavior => behavior.id === behaviorId)?.name ?? ''}
        onChange={name => setBehaviorId(behaviors.find(behavior => behavior.name === name)?.id ?? '')}
      />
      <ChipChoice label="Intensidade" options={BEHAVIOR_INTENSITIES} value={intensity} onChange={setIntensity} />
      <ChipChoice label="Antecedente" options={BEHAVIOR_ANTECEDENTS} value={antecedent} onChange={setAntecedent} otherValue={antecedentOther} onOtherChange={setAntecedentOther} />
      <ChipChoice label="Consequência" options={BEHAVIOR_CONSEQUENCES} value={consequence} onChange={setConsequence} otherValue={consequenceOther} onOtherChange={setConsequenceOther} />
      <ChipChoice label="Conduta realizada" options={BEHAVIOR_CONDUCTS} value={conduct} onChange={setConduct} otherValue={conductOther} onOtherChange={setConductOther} />

      <div className="aba-quick-field">
        <span className="aba-chip-label">Duração do episódio (opcional)</span>
        <div className="aba-quick-timer">
          <AbaIcon name="timer" size={18} />
          <strong>{seconds}s</strong>
          {startedAt == null ? (
            <button type="button" className="quiet-button" onClick={() => { setSeconds(0); setStartedAt(Date.now()); }}>
              <AbaIcon name="play" size={14} /> Iniciar cronômetro
            </button>
          ) : (
            <button type="button" className="primary-button" onClick={() => setStartedAt(null)}>
              <AbaIcon name="stop" size={14} /> Encerrar
            </button>
          )}
        </div>
      </div>

      {/* Topografia que o terapeuta não reconhece do plano: vai para a fila da supervisão. */}
      <div className="aba-quick-field">
        <button type="button" className="aba-chip aba-chip--wide" aria-pressed={newBehavior} onClick={() => setNewBehavior(current => !current)}>
          <AbaIcon name="sparkle" size={15} /> Apresentação nova deste comportamento
        </button>
        {newBehavior && <small className="aba-hint">A supervisão vê isto na revisão da sessão para rever a definição operacional.</small>}
      </div>

      <div className="aba-form-actions">
        <button type="button" className="quiet-button" onClick={onCancel}>Cancelar</button>
        <button type="button" className="primary-button" disabled={!ready} onClick={submit}>
          <AbaIcon name="check" /> Registrar episódio
        </button>
      </div>
    </div>
  );
}

/**
 * Situação de risco. Ao abrir, a coleta pausa (o terapeuta está atendendo a
 * ocorrência). O registro vai para a revisão da supervisão e não se apaga.
 */
export function RiskQuickPanel({ peoplePresent, onRegister, onCancel }) {
  const [situation, setSituation] = useState('');
  const [situationOther, setSituationOther] = useState('');
  const [severity, setSeverity] = useState('');
  const [intervention, setIntervention] = useState('');
  const [interventionOther, setInterventionOther] = useState('');
  const [injury, setInjury] = useState('');
  const [injuryOther, setInjuryOther] = useState('');
  const [guardian, setGuardian] = useState('');
  const [people, setPeople] = useState(peoplePresent.length ? peoplePresent : ['Somente terapeuta']);
  const [minutes, setMinutes] = useState(0);
  const [description, setDescription] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [error, setError] = useState(null);

  const resolvedSituation = resolve(situation, situationOther);
  const resolvedIntervention = resolve(intervention, interventionOther);
  const ready = Boolean(resolvedSituation && severity && resolvedIntervention);

  const submit = () => {
    if (!ready) return;
    if (!description.trim()) {
      setError('Descreva o que aconteceu — é o registro que a supervisão vai revisar.');
      return;
    }
    onRegister({
      reason: resolvedSituation,
      behavior: resolvedSituation,
      identifiedRisk: description.trim(),
      interventionType: resolvedIntervention,
      severity,
      durationMinutes: minutes,
      peoplePresent: people,
      injury: resolve(injury, injuryOther),
      followUp: followUp.trim(),
      guardianCommunication: guardian,
      notes: '',
    });
  };

  const togglePerson = person => setPeople(current => (current.includes(person)
    ? current.filter(item => item !== person)
    : [...current, person]));

  return (
    <div className="aba-quick-panel">
      <p className="aba-risk-callout">
        <AbaIcon name="alert" size={18} /> A coleta foi pausada e o horário registrado. Este registro vai para a revisão da supervisão e não pode ser apagado.
      </p>

      <ChipChoice label="Tipo de situação" options={RISK_SITUATIONS} value={situation} onChange={setSituation} otherValue={situationOther} onOtherChange={setSituationOther} />
      <ChipChoice label="Intensidade" options={BEHAVIOR_INTENSITIES} value={severity} onChange={setSeverity} />
      <ChipChoice label="Intervenção realizada" options={RISK_INTERVENTIONS} value={intervention} onChange={setIntervention} otherValue={interventionOther} onOtherChange={setInterventionOther} />
      <ChipChoice label="Lesão ou consequência física" options={RISK_INJURIES} value={injury} onChange={setInjury} otherValue={injuryOther} onOtherChange={setInjuryOther} />
      <ChipChoice label="Comunicação ao responsável" options={GUARDIAN_CONTACT_OPTIONS} value={guardian} onChange={setGuardian} />

      <div className="aba-quick-field">
        <span className="aba-chip-label">Pessoas presentes</span>
        <div className="aba-chip-row">
          {PEOPLE_PRESENT_OPTIONS.map(person => (
            <button key={person} type="button" className="aba-chip" aria-pressed={people.includes(person)} onClick={() => togglePerson(person)}>{person}</button>
          ))}
        </div>
      </div>

      <div className="aba-quick-field">
        <span className="aba-chip-label">Duração da ocorrência</span>
        <div className="aba-quick-timer">
          <strong>{minutes} min</strong>
          <button type="button" className="quiet-button" onClick={() => setMinutes(value => Math.max(0, value - 1))}>−1</button>
          <button type="button" className="quiet-button" onClick={() => setMinutes(value => value + 1)}>+1</button>
          <button type="button" className="quiet-button" onClick={() => setMinutes(value => value + 5)}>+5</button>
        </div>
      </div>

      <label className="aba-quick-field">
        <span className="aba-chip-label">O que aconteceu e qual o risco identificado</span>
        <textarea rows={3} value={description} placeholder="Descreva objetivamente o que foi observado." onChange={event => { setDescription(event.target.value); if (error) setError(null); }} />
      </label>
      <label className="aba-quick-field">
        <span className="aba-chip-label">Acompanhamento necessário (opcional)</span>
        <textarea rows={2} value={followUp} onChange={event => setFollowUp(event.target.value)} />
      </label>

      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" onClick={onCancel}>Cancelar</button>
        <button type="button" className="primary-button aba-button-risk" disabled={!ready} onClick={submit}>
          <AbaIcon name="alert" /> Registrar ocorrência
        </button>
      </div>
    </div>
  );
}

/**
 * Reforçador: cada toque soma uma apresentação. Na primeira vez o terapeuta
 * escolhe a eficiência — o sistema não arbitra isso sozinho. A contagem é
 * por par reforçador + programa aberto.
 */
export function ReinforcerQuickPanel({ reinforcers, uses, programId, onChange, onClose }) {
  const [pending, setPending] = useState(null);

  const tap = reinforcerId => {
    const existing = uses.find(use => use.reinforcerId === reinforcerId && use.programId === programId);
    if (existing) {
      onChange(uses.map(use => (use.reinforcerId === reinforcerId && use.programId === programId
        ? { ...use, uses: use.uses + 1 }
        : use)));
      return;
    }
    setPending(current => (current?.reinforcerId === reinforcerId
      ? { ...current, uses: current.uses + 1 }
      : { reinforcerId, uses: 1 }));
  };

  const commit = efficiency => {
    if (!pending) return;
    onChange([...uses, { reinforcerId: pending.reinforcerId, programId, uses: pending.uses, accessMinutes: 1, efficiency }]);
    setPending(null);
  };

  const setEfficiency = (use, efficiency) =>
    onChange(uses.map(item => (item === use ? { ...item, efficiency } : item)));

  const weak = uses.filter(use => use.efficiency === 'Ineficaz' || use.efficiency === 'Recusado');
  const pendingName = reinforcers.find(item => item.id === pending?.reinforcerId)?.name;

  if (!reinforcers.length) {
    return <p className="aba-empty">Nenhum reforçador cadastrado para este paciente. Cadastre em Repertório.</p>;
  }

  return (
    <div className="aba-quick-panel">
      <div className="aba-quick-field">
        <span className="aba-chip-label">Toque no reforçador utilizado — cada toque soma uma apresentação</span>
        <div className="aba-chip-row">
          {reinforcers.map(reinforcer => {
            const registered = uses.find(use => use.reinforcerId === reinforcer.id && use.programId === programId);
            const count = registered?.uses ?? (pending?.reinforcerId === reinforcer.id ? pending.uses : 0);
            return (
              <button key={reinforcer.id} type="button" className="aba-chip" aria-pressed={count > 0} onClick={() => tap(reinforcer.id)}>
                {reinforcer.name}{count > 0 && <strong> {count}×</strong>}
              </button>
            );
          })}
        </div>
      </div>

      {pending && (
        <div className="aba-quick-field aba-quick-field--highlight">
          <span className="aba-chip-label">Eficiência de “{pendingName}”</span>
          <div className="aba-chip-row">
            {REINFORCER_EFFICIENCIES.map(efficiency => (
              <button key={efficiency} type="button" className="aba-chip" onClick={() => commit(efficiency)}>{efficiency}</button>
            ))}
          </div>
          <small className="aba-hint">{pending.uses} {pending.uses === 1 ? 'apresentação aguardando' : 'apresentações aguardando'} classificação.</small>
        </div>
      )}

      {uses.length > 0 && (
        <div className="aba-quick-field">
          <span className="aba-chip-label">Registrados nesta sessão</span>
          <div className="aba-quick-uses">
            {uses.map((use, index) => {
              const reinforcer = reinforcers.find(item => item.id === use.reinforcerId);
              return (
                <div key={`${use.reinforcerId}-${use.programId || 'sem'}-${index}`} className="aba-quick-uses-row">
                  <strong>{reinforcer?.name || 'Reforçador'}</strong>
                  <span>{use.uses}×</span>
                  <select
                    value={use.efficiency}
                    aria-label={`Eficiência de ${reinforcer?.name || 'reforçador'}`}
                    onChange={event => setEfficiency(use, event.target.value)}
                  >
                    {REINFORCER_EFFICIENCIES.map(efficiency => <option key={efficiency}>{efficiency}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {weak.length > 0 && (
        <p className="aba-note">
          {weak.map(use => reinforcers.find(item => item.id === use.reinforcerId)?.name).filter(Boolean).join(', ')}
          {weak.length === 1 ? ' foi classificado' : ' foram classificados'} como ineficaz ou recusado. Selecione outro reforçador cadastrado se fizer sentido clinicamente.
        </p>
      )}

      <div className="aba-form-actions">
        <button type="button" className="primary-button" onClick={onClose} disabled={Boolean(pending)}>
          {pending ? 'Classifique a eficiência para concluir' : 'Concluir'}
        </button>
      </div>
    </div>
  );
}
