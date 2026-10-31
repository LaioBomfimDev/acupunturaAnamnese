import { useEffect, useState } from 'react';
import { acquisitionBreakdown, acquisitionTimeStats } from '../../utils/aba/calculations.js';
import { OUTCOME_CODES, orderedPromptHierarchy, PROGRAM_PHASES, trialCode } from '../../utils/aba/catalog.js';
import { columnTone, responseColumnLabel } from '../../utils/aba/labels.js';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Ficha de coleta ABA (trazida do Atlas, components/CollectionSheet.tsx).
// Cabeçalho preenchido pelo sistema, faixa do programa, fase de hoje e a
// matriz de tentativas: cada linha uma oportunidade, cada coluna um nível
// de ajuda ou resultado. Um toque registra; tocar de novo apaga. No
// celular a matriz vira uma tentativa por vez, com os mesmos botões.
// ============================================================


const seconds = value => `${value}s`;
// Relógio de parede para os toques (fora do componente: render fica puro).
const clockNow = () => Date.now();
const NARROW_QUERY = '(max-width: 760px)';

function useNarrowScreen() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return narrow;
}

const clockLabel = total => {
  const minutes = Math.floor(total / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}min`
    : `${minutes} min`;
};

/** Tempo de intervenção acumulado: relógio da sessão menos as pausas. */
function useInterventionSeconds(startAt, pauses) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const paused = pauses.reduce((total, pause) => total + ((pause.endAt ?? now) - pause.startAt), 0);
  return Math.max(0, Math.round((now - startAt - paused) / 1000));
}

/** Cabeçalho da ficha: identificação e contexto vêm do cadastro, nada é digitado. */
export function CollectionSheetHeader({
  patientName, age, sessionNumber, therapistName, supervisorName, date, startedAtLabel,
  location, startAt, pauses, programCount, protocolStart, teamName,
}) {
  const elapsed = useInterventionSeconds(startAt, pauses);
  const meta = [
    ['Idade', age],
    ['Time', teamName],
    ['Início do protocolo', protocolStart],
    ['Nº da sessão', String(sessionNumber)],
    ['Terapeuta', therapistName],
    ['Supervisão', supervisorName],
    ['Data', date],
    ['Início', startedAtLabel],
    ['Local', location],
    ['Tempo de intervenção', clockLabel(elapsed)],
  ];

  return (
    <header className="aba-sheet-masthead">
      <div className="aba-sheet-title">
        <h2>Coleta de dados — ABA</h2>
        <p>Ficha de coleta · {programCount} {programCount === 1 ? 'programa' : 'programas'}</p>
      </div>
      <div className="aba-sheet-identity">
        <h3>{patientName}</h3>
        <dl className="aba-sheet-meta">
          {meta.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value || '—'}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

/** Faixa do programa em coleta: objetivo e comportamento-alvo definidos pela supervisão. */
export function CollectionSheetProgram({ index, program }) {
  return (
    <section className="aba-sheet-program">
      <span className="aba-sheet-program-badge">P{index + 1}</span>
      <div>
        <p className="aba-eyebrow">Programa</p>
        <strong>{program?.name || 'Programa'}</strong>
      </div>
      <div>
        <p className="aba-eyebrow">Objetivo</p>
        <p>{program?.objective || '—'}</p>
      </div>
      <div>
        <p className="aba-eyebrow">Comportamento-alvo</p>
        <p>{program?.target || '—'}</p>
      </div>
    </section>
  );
}

/**
 * Fase deste programa nesta sessão. Um toque troca; o valor já vem do status
 * do programa. É o que separa linha de base de intervenção no gráfico.
 */
export function PhaseChips({ phase, onChange }) {
  const active = PROGRAM_PHASES.find(entry => entry.value === phase) || PROGRAM_PHASES[1];
  return (
    <div className="aba-phase-strip">
      <div className="aba-phase-strip-head">
        <span className="aba-eyebrow">Fase deste programa hoje</span>
        <small>{active.hint}</small>
      </div>
      <div className="aba-phase-strip-options" role="group" aria-label="Fase do programa nesta sessão">
        {PROGRAM_PHASES.map(entry => (
          <button
            key={entry.value}
            type="button"
            className="aba-phase-chip"
            aria-pressed={entry.value === phase}
            title={entry.hint}
            onClick={() => onChange(entry.value)}
          >
            <strong>{entry.short}</strong>
            <span>{entry.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

const NOTES_LIMIT = 300;

/**
 * Ficha de tentativas em matriz. Mostra só os níveis de ajuda que a
 * supervisão habilitou no programa, mais os resultados e os dois códigos
 * fora do cálculo (recusa e não aplicável).
 */
export function TrialMatrix({
  record, program, notes, onNotesChange, onSetTrial, onSetSeconds, autosaveLabel, autosaveSaved,
}) {
  const steps = program?.taskSteps ?? [];
  const promptColumns = orderedPromptHierarchy(program?.promptHierarchy);
  const scoredColumns = [
    ...promptColumns,
    ...OUTCOME_CODES.filter(entry => !entry.excluded).map(entry => entry.response),
  ];
  const excludedColumns = OUTCOME_CODES.filter(entry => entry.excluded).map(entry => entry.response);
  const allColumns = [...scoredColumns, ...excludedColumns];
  const tracksTime = (program?.timeMeasure ?? 'nenhuma') !== 'nenhuma';

  const breakdown = acquisitionBreakdown([record]);
  const timeStats = acquisitionTimeStats([record]);
  const programmedSeconds = program?.criteria?.minimumSeconds ?? 0;
  const minimumPercentage = program?.criteria?.minimumPercentage ?? 0;

  // Critério da sessão — mesma regra que evaluateProgression usa.
  const criterionMet = breakdown.independencePercentage != null
    && breakdown.independencePercentage >= minimumPercentage
    && (!programmedSeconds || (timeStats.maximum ?? 0) >= programmedSeconds);
  const criterionHint = breakdown.independencePercentage == null
    ? 'Sem tentativas pontuáveis registradas.'
    : `Exige ${minimumPercentage}% de independência${programmedSeconds ? ` e ${programmedSeconds}s` : ''}.`;
  const narrow = useNarrowScreen();

  const [timing, setTiming] = useState(null);
  const [now, setNow] = useState(clockNow);
  useEffect(() => {
    if (!timing) return undefined;
    const id = window.setInterval(() => setNow(clockNow()), 250);
    return () => window.clearInterval(id);
  }, [timing]);

  const toggleTimer = index => {
    if (timing?.index === index) {
      onSetSeconds(index, Math.max(1, Math.round((clockNow() - timing.startedAt) / 1000)));
      setTiming(null);
      return;
    }
    const startedAt = clockNow();
    setNow(startedAt);
    setTiming({ index, startedAt });
  };

  const timeCellContent = index => {
    if (timing?.index === index) return seconds(Math.max(0, Math.round((now - timing.startedAt) / 1000)));
    const recorded = record.trialSeconds?.[index];
    return typeof recorded === 'number' && recorded > 0 ? seconds(recorded) : <AbaIcon name="play" size={13} />;
  };

  return (
    <div className="aba-sheet-body">
      <section className="aba-trial-sheet">
        <div className="aba-trial-sheet-head">
          <h3>Registro de tentativas</h3>
          <span>
            {programmedSeconds > 0 && <span><strong>Tempo programado:</strong> {programmedSeconds} segundos · </span>}
            Marque a ajuda mais intrusiva usada em cada tentativa
          </span>
        </div>

        {narrow ? (
          <TrialStepper
            record={record}
            steps={steps}
            scoredColumns={scoredColumns}
            excludedColumns={excludedColumns}
            tracksTime={tracksTime}
            timingIndex={timing?.index ?? null}
            onSetTrial={onSetTrial}
            onToggleTimer={toggleTimer}
            timeCellContent={timeCellContent}
          />
        ) : (
          <div className="aba-trial-matrix-scroll">
            <table className="aba-trial-matrix">
              <thead>
                <tr>
                  <th rowSpan={2} className="aba-trial-matrix-corner">{steps.length ? 'Etapa' : 'Tentativa'}</th>
                  <th colSpan={scoredColumns.length} className="aba-trial-matrix-group">Nível de ajuda / resposta</th>
                  <th colSpan={excludedColumns.length} className="aba-trial-matrix-group is-out">Fora do cálculo</th>
                  {tracksTime && <th rowSpan={2} className="aba-trial-matrix-time-head">Tempo<small>(s)</small></th>}
                </tr>
                <tr>
                  {allColumns.map(response => (
                    <th key={response} className={`aba-trial-col aba-trial-col--${columnTone(response)}`} title={responseColumnLabel(response)}>
                      <b>{trialCode(response)}</b>
                      <span>{responseColumnLabel(response)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {record.trials.map((trial, index) => (
                  <tr key={index} className={trial ? 'is-filled' : ''}>
                    <th scope="row">
                      {steps.length ? (
                        <span className="aba-trial-step"><small>{index + 1}</small>{steps[index] || `Etapa ${index + 1}`}</span>
                      ) : index + 1}
                    </th>
                    {allColumns.map(response => {
                      const active = trial === response;
                      return (
                        <td key={response}>
                          <button
                            type="button"
                            className={`aba-trial-cell aba-trial-cell--${columnTone(response)}`}
                            aria-pressed={active}
                            aria-label={`Tentativa ${index + 1}: ${responseColumnLabel(response)} (${trialCode(response)})`}
                            onClick={() => onSetTrial(index, active ? null : response)}
                          >
                            {active && trialCode(response)}
                          </button>
                        </td>
                      );
                    })}
                    {tracksTime && (
                      <td className="aba-trial-matrix-time">
                        <button
                          type="button"
                          className={`aba-trial-time${timing?.index === index ? ' is-running' : ''}`}
                          aria-label={`Cronômetro da tentativa ${index + 1}`}
                          onClick={() => toggleTimer(index)}
                        >
                          {timeCellContent(index)}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label className="aba-trial-notes">
          <span className="aba-sr-only">Observações da sessão</span>
          <textarea
            value={notes}
            maxLength={NOTES_LIMIT}
            onChange={event => onNotesChange(event.target.value)}
            placeholder="Observações (opcional)"
          />
          <small>{notes.length} / {NOTES_LIMIT}</small>
        </label>
      </section>

      <aside className="aba-sheet-summary">
        <h3>Resumo automático</h3>
        <SummaryTile label="Total de tentativas" value={String(breakdown.scored)} />
        <SummaryTile label="Acertos" value={String(breakdown.independent + breakdown.prompted)} percentage={breakdown.correctPercentage} tone="ok" />
        <SummaryTile label="Independentes" value={String(breakdown.independent)} percentage={breakdown.independencePercentage} tone="ok" />
        <SummaryTile label="Com ajuda" value={String(breakdown.prompted)} percentage={breakdown.promptedPercentage} tone="info" />
        <SummaryTile label="Erros" value={String(breakdown.errors)} percentage={breakdown.errorPercentage} tone="bad" />
        {(breakdown.refused > 0 || breakdown.notApplicable > 0) && (
          <SummaryTile
            label="Fora do cálculo"
            value={String(breakdown.refused + breakdown.notApplicable)}
            hint={`${breakdown.refused} recusa · ${breakdown.notApplicable} não aplicável`}
          />
        )}
        <SummaryRing label="Percentual de acerto" percentage={breakdown.correctPercentage} />
        <SummaryRing label="Percentual de independência" percentage={breakdown.independencePercentage} />
        {tracksTime && (
          <>
            <SummaryTile label="Maior tempo" value={timeStats.maximum != null ? seconds(timeStats.maximum) : '—'} inline />
            <SummaryTile label="Média de tempo" value={timeStats.average != null ? seconds(timeStats.average) : '—'} inline />
          </>
        )}
        <div className={`aba-sheet-criterion${criterionMet ? ' is-met' : ''}`} title={criterionHint}>
          <span>Critério da sessão</span>
          <strong>{criterionMet ? 'Atingido' : 'Não atingido'}</strong>
        </div>
        <p className={`aba-sheet-autosave${autosaveSaved ? ' is-saved' : ''}`} role="status">{autosaveLabel}</p>
      </aside>
    </div>
  );
}

/** A mesma ficha, uma tentativa por vez (celular). */
function TrialStepper({
  record, steps, scoredColumns, excludedColumns, tracksTime, timingIndex,
  onSetTrial, onToggleTimer, timeCellContent,
}) {
  const total = record.trials.length;
  const [selected, setSelected] = useState(0);
  const active = Math.min(selected, Math.max(0, total - 1));
  const current = record.trials[active] ?? null;

  const register = response => {
    const wasEmpty = !current;
    onSetTrial(active, current === response ? null : response);
    // Avança sozinho só no primeiro registro da tentativa.
    if (wasEmpty && active < total - 1) setSelected(active + 1);
  };

  const option = response => (
    <button
      key={response}
      type="button"
      className={`aba-trial-option aba-trial-option--${columnTone(response)}`}
      aria-pressed={current === response}
      onClick={() => register(response)}
    >
      <b>{trialCode(response)}</b>
      <span>{responseColumnLabel(response)}</span>
    </button>
  );

  return (
    <div className="aba-trial-stepper">
      <div className="aba-trial-stepper-track" role="group" aria-label="Tentativas da ficha">
        {record.trials.map((trial, index) => (
          <button
            key={index}
            type="button"
            className={`aba-trial-pin${index === active ? ' is-active' : ''}${trial ? ` is-filled aba-trial-pin--${columnTone(trial)}` : ''}`}
            aria-current={index === active}
            aria-label={`Tentativa ${index + 1}${trial ? `: ${responseColumnLabel(trial)}` : ' — em branco'}`}
            onClick={() => setSelected(index)}
          >
            <small>{index + 1}</small>
            <strong>{trial ? trialCode(trial) : '·'}</strong>
          </button>
        ))}
      </div>

      <div className="aba-trial-stepper-panel">
        <div className="aba-trial-stepper-title">
          <strong>
            {steps.length ? steps[active] || `Etapa ${active + 1}` : `Tentativa ${active + 1}`}
            {' '}<span>{steps.length ? `etapa ${active + 1} de ${total}` : `de ${total}`}</span>
          </strong>
          <span className={current ? 'aba-trial-stepper-current is-on' : 'aba-trial-stepper-current'}>
            {current ? responseColumnLabel(current) : 'Sem registro'}
          </span>
        </div>

        <p className="aba-eyebrow">Nível de ajuda / resposta</p>
        <div className="aba-trial-stepper-options">{scoredColumns.map(option)}</div>

        <p className="aba-eyebrow">Fora do cálculo</p>
        <div className="aba-trial-stepper-options">{excludedColumns.map(option)}</div>

        {tracksTime && (
          <div className="aba-trial-stepper-timer">
            <span>Tempo da tentativa</span>
            <button
              type="button"
              className={`aba-trial-time${timingIndex === active ? ' is-running' : ''}`}
              aria-label={`Cronômetro da tentativa ${active + 1}`}
              onClick={() => onToggleTimer(active)}
            >
              {timeCellContent(active)}
            </button>
          </div>
        )}

        <div className="aba-trial-stepper-nav">
          <button type="button" className="quiet-button" disabled={active === 0} onClick={() => setSelected(active - 1)}>Anterior</button>
          {current && <button type="button" className="quiet-button" onClick={() => onSetTrial(active, null)}>Apagar</button>}
          <button type="button" className="quiet-button" disabled={active >= total - 1} onClick={() => setSelected(active + 1)}>Próxima</button>
        </div>
      </div>
    </div>
  );
}

function SummaryTile({ label, value, percentage, hint, tone, inline }) {
  return (
    <div className={`aba-sheet-tile${inline ? ' is-inline' : ''}`}>
      <small>{label}</small>
      <strong className={tone ? `aba-sheet-tile--${tone}` : undefined}>
        {value}
        {percentage != null && <span> ({percentage}%)</span>}
      </strong>
      {hint && <em>{hint}</em>}
    </div>
  );
}

function SummaryRing({ label, percentage }) {
  return (
    <div className="aba-sheet-tile aba-sheet-tile--ring">
      <div>
        <small>{label}</small>
        <strong>{percentage == null ? '—' : `${percentage}%`}</strong>
      </div>
      <span
        className="aba-sheet-ring"
        style={{ '--aba-ring-progress': `${(percentage ?? 0) * 3.6}deg` }}
        role="img"
        aria-label={percentage == null ? `${label}: sem dados` : `${label}: ${percentage}%`}
      />
    </div>
  );
}
