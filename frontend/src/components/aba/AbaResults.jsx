import { useState } from 'react';
import {
  acquisitionBreakdown, acquisitionTimeStats, behaviorDurationSeries, behaviorHotspot, comparePhases,
  descriptiveStats, evaluateProgression, generalizationComparison, maximumIntensity, programDirection,
  programIndependence, programSeries, programTimeSeries, promptDistributionSeries, recordIntegrity,
  reductionPhaseChange, reductionSeries, reinforcerEfficiencySummary, taskStepIndependence,
} from '../../utils/aba/calculations.js';
import {
  BEHAVIOR_INTENSITIES, PROMPT_LEVELS, collectionTypeLabel, normalizeCollectionType, phaseLabel, timeMeasureLabel,
} from '../../utils/aba/catalog.js';
import { updateProgramStatus } from '../../services/abaService';
import { AbaDialog } from './AbaDialog';
import { ColumnChart, LineChart, PercentBars } from './AbaCharts';
import { AbaIcon } from './AbaIcon';
import { AbaReportActions } from './AbaReport';
import { responseColumnLabel } from '../../utils/aba/labels.js';

// ============================================================
// Resultados por dimensão (trazido do Atlas, ResultsPage). Cada programa
// tem o seu gráfico; percentual sempre sobre o total de tentativas
// preenchidas, nunca média de sessões. Mudança de fase é decisão da
// supervisão: o sistema avisa quando o critério foi atingido e registra a
// aprovação com o parecer.
// ============================================================

function DescriptiveStrip({ values, unit = '%' }) {
  const stats = descriptiveStats(values);
  if (!stats.points) return <p className="aba-muted">Sem dados suficientes para descrever a série.</p>;
  return (
    <div className="aba-descriptive-strip">
      <span><small>Nível atual</small><strong>{stats.level}{unit}</strong></span>
      <span><small>Média</small><strong>{stats.mean}{unit}</strong></span>
      <span><small>Mediana</small><strong>{stats.median}{unit}</strong></span>
      <span><small>Mínimo</small><strong>{stats.minimum}{unit}</strong></span>
      <span><small>Máximo</small><strong>{stats.maximum}{unit}</strong></span>
      <span><small>Tendência</small><strong>{stats.trend}</strong></span>
      <span><small>Variabilidade</small><strong>{stats.variability == null ? '—' : `${stats.variability}%`}</strong></span>
      <span><small>Sessões</small><strong>{stats.points}</strong></span>
    </div>
  );
}

function PhaseComparisonStrip({ comparison, unit = '%', direction }) {
  if (!comparison.baselinePoints) {
    return <p className="aba-muted">Nenhuma sessão marcada como linha de base neste programa — sem ela não dá para comparar fases nem medir sobreposição. A fase é escolhida por toque na ficha de coleta.</p>;
  }
  if (!comparison.interventionPoints) {
    return <p className="aba-muted">Só há sessões de linha de base ({comparison.baselinePoints}). A comparação aparece quando a intervenção começar.</p>;
  }
  const better = direction === 'aumentar' ? (comparison.meanChange ?? 0) > 0 : (comparison.meanChange ?? 0) < 0;
  const signed = value => `${(value ?? 0) > 0 ? '+' : ''}${value}`;
  return (
    <>
      <div className="aba-descriptive-strip">
        <span><small>Linha de base</small><strong>{comparison.baselineMean}{unit}</strong></span>
        <span><small>Intervenção</small><strong>{comparison.interventionMean}{unit}</strong></span>
        <span className={better ? 'is-better' : undefined}><small>Mudança de média</small><strong>{signed(comparison.meanChange)}{unit}</strong></span>
        <span><small>Mudança imediata</small><strong>{signed(comparison.immediateChange)}{unit}</strong></span>
        <span><small>Dados não sobrepostos</small><strong>{comparison.nonOverlap == null ? '—' : `${comparison.nonOverlap}%`}</strong></span>
        <span><small>Sobreposição</small><strong>{comparison.overlap == null ? '—' : `${comparison.overlap}%`}</strong></span>
        <span><small>Sessões</small><strong>{comparison.baselinePoints} + {comparison.interventionPoints}</strong></span>
      </div>
      <div className="aba-phase-segments">
        {comparison.segments.map((segment, index) => (
          <span key={`${segment.phase}-${index}`}>
            <em>{segment.label}</em>
            {segment.sessions} {segment.sessions === 1 ? 'sessão' : 'sessões'}{segment.mean == null ? '' : ` · média ${segment.mean}${unit}`}
          </span>
        ))}
      </div>
    </>
  );
}

const phaseLines = comparison => comparison.changes.map(change => ({ label: change.label, text: phaseLabel(change.to) }));

function ProgressionBanner({ program, sessions, canApprove, onApprove }) {
  const status = evaluateProgression(program, sessions);
  const suggestion = program.status === 'Generalização' ? 'Manutenção' : 'Generalização';
  if (!status.met) {
    return (
      <div className="aba-progression is-pending">
        <strong>Critério ainda não atingido</strong>
        <p>{status.pending.length ? `Falta: ${status.pending.join('; ')}.` : 'Sem sessões registradas para este programa.'}</p>
      </div>
    );
  }
  return (
    <div className="aba-progression is-met">
      <div>
        <strong>Critério atingido</strong>
        <p>
          {status.consecutiveSessions} sessões consecutivas com {program.criteria.minimumPercentage}%
          {program.criteria.minimumSeconds ? `, ${status.maxSeconds}s alcançados` : ''} · {status.environments.length} {status.environments.length === 1 ? 'ambiente' : 'ambientes'} · {status.therapists.length} {status.therapists.length === 1 ? 'terapeuta' : 'terapeutas'}. Sugestão: avançar para {suggestion.toLowerCase()}.
        </p>
      </div>
      {canApprove && <button type="button" className="primary-button" onClick={() => onApprove(program)}><AbaIcon name="shield" /> Aprovar progressão</button>}
    </div>
  );
}

const PROMPT_TONES = {
  independente: 'p1',
  ajuda_visual: 'p2',
  ajuda_gestual: 'p3',
  ajuda_verbal: 'p4',
  modelacao: 'p5',
  fisica_parcial: 'p6',
  fisica_total: 'p7',
};

function AcquisitionAnalysis({ program, sessions, allSessions, professionalName, children }) {
  const stats = programIndependence(program.id, sessions);
  const series = programSeries(program.id, sessions);
  const prompts = promptDistributionSeries(program.id, sessions);
  const timeSeries = programTimeSeries(program.id, sessions);
  const generalization = generalizationComparison(program.id, sessions, professionalName);
  const criterion = program.criteria?.minimumPercentage ?? 0;
  const timeMeasure = program.timeMeasure ?? 'nenhuma';
  const phases = comparePhases(series.map(point => ({ label: point.date, phase: point.phase, value: point.percentage })), 'aumentar');
  const overall = acquisitionBreakdown(sessions.flatMap(session => session.records.filter(record => record.type === 'aquisicao' && record.programId === program.id)));
  const progression = evaluateProgression(program, allSessions);
  const steps = taskStepIndependence(program, sessions);
  const weakestStep = steps.filter(step => step.scored > 0).sort((left, right) => (left.percentage ?? 0) - (right.percentage ?? 0))[0] ?? null;
  const usedPrompts = PROMPT_LEVELS.filter(level => prompts.some(point => typeof point[level.response] === 'number' && point[level.response] > 0));

  return (
    <article className="aba-chart-card">
      <div className="aba-chart-card-head">
        <div>
          <p className="aba-eyebrow">Aquisição · {collectionTypeLabel(normalizeCollectionType(program))}</p>
          <h3>{program.name}</h3>
          <small>{program.skill} · {program.status}</small>
        </div>
        <div className="aba-chart-card-value">
          <strong>{stats.percentage === null ? '—' : `${stats.percentage}%`}</strong>
          <small>Independência agregada</small>
        </div>
      </div>
      {children}
      <LineChart
        title={`Independência por sessão — ${program.name}`}
        data={series}
        series={[{ key: 'percentage', name: 'Independência', tone: 'main' }]}
        yMax={100}
        reference={criterion > 0 ? { value: criterion, label: `Critério ${criterion}%` } : null}
        phaseChanges={phaseLines(phases)}
      />
      <DescriptiveStrip values={series.map(point => point.percentage)} />

      <div className="aba-chart-block">
        <h4>Linha de base × intervenção</h4>
        <PhaseComparisonStrip comparison={phases} direction="aumentar" />
      </div>

      {steps.length > 0 && (
        <div className="aba-chart-block">
          <h4>Independência por etapa</h4>
          <PercentBars
            rows={steps.map(step => ({ label: step.label, value: step.percentage, hint: `${step.independent ?? 0} de ${step.scored} registros` }))}
            reference={criterion}
          />
          {weakestStep && (
            <p className="aba-insight">
              Etapa com menor independência: <strong>{weakestStep.label}</strong>
              {weakestStep.percentage == null ? ' — ainda sem registro pontuável.' : ` (${weakestStep.percentage}% em ${weakestStep.scored} ${weakestStep.scored === 1 ? 'registro' : 'registros'}).`}
              {' '}É onde a ajuda deve ser mantida enquanto as demais são esvanecidas.
            </p>
          )}
        </div>
      )}

      <div className="aba-descriptive-strip">
        <span><small>Ajuda mais utilizada</small><strong>{overall.mostUsedPrompt ? `${responseColumnLabel(overall.mostUsedPrompt.response)} (${overall.mostUsedPrompt.count}×)` : 'Nenhuma ajuda registrada'}</strong></span>
        <span><small>Maior nível de ajuda</small><strong>{overall.mostIntrusivePrompt ? responseColumnLabel(overall.mostIntrusivePrompt) : '—'}</strong></span>
        <span><small>Sessões até o domínio</small><strong>{progression.sessionsUntilCriterion ?? '—'}</strong></span>
        <span><small>Maior sequência independente</small><strong>{progression.longestIndependentStreak}</strong></span>
        <span><small>Respostas com ajuda</small><strong>{overall.promptedPercentage == null ? '—' : `${overall.promptedPercentage}%`}</strong></span>
        <span><small>Erros</small><strong>{overall.errorPercentage == null ? '—' : `${overall.errorPercentage}%`}</strong></span>
      </div>

      {timeMeasure !== 'nenhuma' && (
        <div className="aba-chart-block">
          <h4>{timeMeasureLabel(timeMeasure)} — segundos por sessão</h4>
          <LineChart
            title={`${timeMeasureLabel(timeMeasure)} — ${program.name}`}
            data={timeSeries}
            unit="s"
            height={200}
            series={[
              { key: 'maximum', name: 'Maior tempo', tone: 'main' },
              { key: 'average', name: 'Tempo médio', tone: 'muted', dashed: true, dots: 'small' },
            ]}
            reference={program.criteria.minimumSeconds ? { value: program.criteria.minimumSeconds, label: `${program.criteria.minimumSeconds}s` } : null}
            emptyText="Nenhum tempo registrado ainda."
          />
        </div>
      )}

      {usedPrompts.length > 0 && (
        <div className="aba-chart-block">
          <h4>Distribuição da ajuda por sessão</h4>
          <LineChart
            title={`Distribuição da ajuda — ${program.name}`}
            data={prompts}
            yMax={100}
            height={200}
            series={usedPrompts.map(level => ({ key: level.response, name: level.label, tone: PROMPT_TONES[level.response], dots: 'small' }))}
          />
        </div>
      )}

      {generalization.length > 0 && (
        <div className="aba-chart-block">
          <h4>Generalização — ambiente, pessoa e condição</h4>
          <div className="aba-comparison-grid">
            {generalization.map(row => (
              <div key={`${row.kind}-${row.label}`} className="aba-comparison-row">
                <span className="aba-tag">{row.kind}</span>
                <strong>{row.label}</strong>
                <span className="aba-comparison-bar"><span style={{ width: `${row.percentage ?? 0}%` }} /></span>
                <small>{row.percentage == null ? 'sem dado' : `${row.percentage}%`} · {row.sessions} {row.sessions === 1 ? 'sessão' : 'sessões'}</small>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="aba-insight">Linha sem suavização; lacunas indicam sessões sem dado pontuável (não interpoladas). Independência, tempo e ajuda ficam em gráficos separados. Mudança de fase depende da decisão da supervisão.</p>
    </article>
  );
}

function ReductionAnalysis({ program, sessions }) {
  const intensityScale = program.intensityScale?.length ? program.intensityScale : BEHAVIOR_INTENSITIES;
  const series = reductionSeries(program.id, sessions, intensityScale);
  const durations = behaviorDurationSeries(program.id, sessions);
  const hasRate = series.some(point => point.rate != null);
  const direction = programDirection(program);
  const baseline = reductionPhaseChange(series, direction);
  const phases = comparePhases(series.map(point => ({ label: point.date, phase: point.phase, value: point.value })), direction);
  const intensityPoints = series.filter(point => point.intensityRank != null);
  const worstIntensity = maximumIntensity(series);

  return (
    <article className="aba-chart-card">
      <div className="aba-chart-card-head">
        <div>
          <p className="aba-eyebrow">Redução · {collectionTypeLabel(normalizeCollectionType(program))}</p>
          <h3>{program.name}</h3>
          <small>{program.measure} · {program.unit} · {program.status}</small>
        </div>
        <div className="aba-chart-card-value"><strong>{series.at(-1)?.value ?? '—'}</strong><small>Último registro</small></div>
      </div>
      <LineChart
        title={`Registro por sessão — ${program.name}`}
        data={series}
        unit=""
        series={[
          { key: 'value', name: program.unit, tone: 'main' },
          ...(hasRate ? [{ key: 'rate', name: 'Taxa por minuto', tone: 'accent', dashed: true, dots: 'small' }] : []),
        ]}
        phaseChanges={phaseLines(phases)}
      />
      <DescriptiveStrip values={series.map(point => point.value)} unit="" />

      <div className="aba-chart-block">
        <h4>Linha de base × intervenção</h4>
        {baseline?.source === 'presumida' ? (
          <>
            <p className="aba-muted">Nenhuma sessão foi marcada como linha de base. Os números abaixo tratam as três primeiras sessões como linha de base — é uma estimativa, não o registro. Marque a fase na ficha de coleta para medir sobreposição e mudança imediata.</p>
            <div className="aba-descriptive-strip">
              <span><small>Linha de base (presumida)</small><strong>{baseline.baselineMean}</strong></span>
              <span><small>Intervenção</small><strong>{baseline.interventionMean}</strong></span>
              <span><small>Mudança</small><strong>{baseline.changePercentage}%</strong></span>
              <span><small>Sessões sem ocorrência</small><strong>{baseline.zeroSessions}</strong></span>
            </div>
          </>
        ) : (
          <>
            <PhaseComparisonStrip comparison={phases} unit="" direction={direction} />
            {baseline && <p className="aba-muted">Sessões sem nenhuma ocorrência na intervenção: <strong>{baseline.zeroSessions}</strong>.</p>}
          </>
        )}
      </div>

      {intensityPoints.length > 0 && (
        <div className="aba-chart-block">
          <h4>Intensidade por sessão (escala operacional)</h4>
          <ColumnChart
            title={`Intensidade — ${program.name}`}
            data={intensityPoints}
            series={[{ key: 'intensityRank', name: 'Intensidade', tone: 'warm' }]}
            yMax={intensityScale.length}
            yTicks={intensityScale.map((_, index) => index + 1)}
            yTickFormat={value => intensityScale[Math.round(value) - 1] ?? ''}
          />
          <div className="aba-descriptive-strip">
            <span><small>Intensidade máxima</small><strong>{worstIntensity?.intensity ?? '—'}</strong></span>
            <span><small>Registrada em</small><strong>{worstIntensity?.date ?? '—'}</strong></span>
            <span><small>Sessões com intensidade</small><strong>{worstIntensity?.sessions ?? 0}</strong></span>
          </div>
          <p className="aba-insight">Escala ordinal: a coluna mostra a posição na escala do programa. Não existe média de intensidade.</p>
        </div>
      )}
      {durations.length > 0 && (
        <div className="aba-chart-block">
          <h4>Duração dos episódios (gráfico separado)</h4>
          <ColumnChart
            title={`Duração dos episódios — ${program.name}`}
            data={durations}
            unit="s"
            series={[{ key: 'total', name: 'Duração total', tone: 'main' }, { key: 'average', name: 'Duração média', tone: 'accent' }]}
          />
        </div>
      )}
      <p className="aba-insight">Frequência, taxa e duração ficam em séries separadas.</p>
    </article>
  );
}

function ApproveProgressionDialog({ program, onClose, onDone }) {
  const [status, setStatus] = useState(program.status === 'Generalização' ? 'Manutenção' : 'Generalização');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateProgramStatus(program.id, {
        status: { Generalização: 'generalizacao', Manutenção: 'manutencao', Aquisição: 'aquisicao', Concluído: 'concluido' }[status],
        note: `Progressão para ${status}${note.trim() ? `: ${note.trim()}` : ''}`,
      });
      onDone();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <AbaDialog title={`Aprovar progressão · ${program.name}`} busy={saving} onClose={onClose}>
      <p className="aba-note">O histórico do programa é preservado. A mudança de fase fica registrada nas notas do programa, com o seu parecer e a data.</p>
      <div className="aba-chip-row">
        {['Generalização', 'Manutenção', 'Aquisição', 'Concluído'].map(option => (
          <button key={option} type="button" className="aba-chip" aria-pressed={status === option} onClick={() => setStatus(option)}>{option}</button>
        ))}
      </div>
      <label className="aba-field">Parecer da supervisão (opcional)
        <textarea rows={4} value={note} placeholder="Ex.: critério atingido em 3 sessões consecutivas com 2 terapeutas; iniciar sondas em casa." onChange={event => setNote(event.target.value)} />
      </label>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? 'Registrando...' : 'Registrar progressão'}</button>
      </div>
    </AbaDialog>
  );
}

export function AbaResults({ data, onChanged, patient, profile }) {
  const [period, setPeriod] = useState('all');
  const [locationFilter, setLocationFilter] = useState('');
  const [approving, setApproving] = useState(null);
  // "Últimos 30 dias" conta a partir de quando a tela abriu.
  const [openedAt] = useState(() => Date.now());

  const patientSessions = data.sessions.filter(session => session.status !== 'em_andamento');
  const locations = [...new Set(patientSessions.map(session => session.location).filter(Boolean))];
  const cutoff = openedAt - 30 * 86400000;
  const sessions = patientSessions.filter(session => (period === 'all' || Date.parse(`${session.date}T12:00:00`) >= cutoff)
    && (!locationFilter || session.location === locationFilter));
  const programs = data.programs.filter(program => !program.archivedAt);
  const acquisition = programs.filter(program => program.type === 'aquisicao');
  const reduction = programs.filter(program => program.type === 'reducao');
  const reinforcerRows = reinforcerEfficiencySummary(sessions, data.reinforcers);
  const behaviorTop = behaviorHotspot(sessions, id => data.programs.find(item => item.id === id)?.name ?? 'Programa');
  const integrity = recordIntegrity(sessions);

  const dates = sessions.map(session => session.date).sort();
  const periodLabel = dates.length
    ? `${new Date(`${dates[0]}T12:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${dates.at(-1)}T12:00:00`).toLocaleDateString('pt-BR')}`
    : 'Sem sessões no filtro';
  const records = sessions.flatMap(session => session.records.filter(record => record.type === 'aquisicao'));
  const overall = acquisitionBreakdown(records);
  const time = acquisitionTimeStats(records);
  const probes = sessions.filter(session => session.isGeneralizationProbe).length;
  const episodes = sessions.reduce((total, session) => total + session.behaviors.reduce((sum, event) => sum + event.quantity, 0), 0);
  const met = acquisition.filter(program => evaluateProgression(program, patientSessions).met).length;
  const tiles = [
    { label: 'Sessões', value: String(sessions.length) },
    { label: 'Acerto no período', value: overall.correctPercentage == null ? '—' : `${overall.correctPercentage}%`, hint: `${overall.independent + overall.prompted} de ${overall.scored} tentativas` },
    { label: 'Independência no período', value: overall.independencePercentage == null ? '—' : `${overall.independencePercentage}%`, hint: 'Totais reais, não média das sessões' },
    { label: 'Maior tempo alcançado', value: time.maximum == null ? '—' : `${time.maximum}s` },
    { label: 'Episódios interferentes', value: String(episodes) },
    { label: 'Sondas de generalização', value: String(probes) },
    { label: 'Programas com critério atingido', value: `${met} de ${acquisition.length}`, hint: met ? 'Aguardam decisão da supervisão' : undefined },
  ];

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Resultados</p>
          <h2>Análise clínica por dimensão</h2>
          <p className="aba-muted">Cada comportamento tem seu gráfico. Percentuais usam o total de tentativas preenchidas, nunca a média das sessões.</p>
        </div>
        <AbaReportActions patient={patient} data={data} sessions={sessions} periodLabel={periodLabel} profile={profile} />
      </div>
      <div className="aba-filter-bar">
        <div className="aba-chip-row" role="group" aria-label="Período">
          <button type="button" className="aba-chip" aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>Todos os registros</button>
          <button type="button" className="aba-chip" aria-pressed={period === '30'} onClick={() => setPeriod('30')}>Últimos 30 dias</button>
        </div>
        {locations.length > 1 && (
          <div className="aba-chip-row" role="group" aria-label="Ambiente">
            <button type="button" className="aba-chip" aria-pressed={!locationFilter} onClick={() => setLocationFilter('')}>Todos os ambientes</button>
            {locations.map(location => (
              <button key={location} type="button" className="aba-chip" aria-pressed={locationFilter === location} onClick={() => setLocationFilter(location)}>{location}</button>
            ))}
          </div>
        )}
      </div>

      <section className="aba-card">
        <div className="aba-section-head">
          <div><p className="aba-eyebrow">Resumo do período</p><h3>{periodLabel}</h3></div>
          <small className="aba-muted">{sessions.length} {sessions.length === 1 ? 'sessão' : 'sessões'} no filtro</small>
        </div>
        <div className="aba-period-grid">
          {tiles.map(tile => (
            <div key={tile.label} className="aba-period-tile">
              <small>{tile.label}</small>
              <strong>{tile.value}</strong>
              {tile.hint && <em>{tile.hint}</em>}
            </div>
          ))}
        </div>
      </section>

      <section className="aba-card">
        <div className="aba-section-head"><div><p className="aba-eyebrow">Integridade do registro</p><h3>Como os dados chegaram</h3></div></div>
        <div className="aba-descriptive-strip">
          <span><small>Tentativas registradas</small><strong>{integrity.trialPercentage == null ? '—' : `${integrity.trialPercentage}%`}</strong></span>
          <span><small>Campos de contexto</small><strong>{integrity.contextPercentage == null ? '—' : `${integrity.contextPercentage}%`}</strong></span>
          <span><small>Tentativas preenchidas</small><strong>{integrity.filled} / {integrity.slots}</strong></span>
          {behaviorTop && <span><small>Programa com mais episódios</small><strong>{behaviorTop.name} ({behaviorTop.episodes})</strong></span>}
        </div>
      </section>

      <div className="aba-results-grid">
        {acquisition.map(program => (
          <AcquisitionAnalysis key={program.id} program={program} sessions={sessions} allSessions={patientSessions} professionalName={data.professionalName}>
            <ProgressionBanner program={program} sessions={patientSessions} canApprove={data.permissions.canSupervise} onApprove={setApproving} />
          </AcquisitionAnalysis>
        ))}
        {reduction.map(program => <ReductionAnalysis key={program.id} program={program} sessions={sessions} />)}
        {!programs.length && <p className="aba-empty">Nenhum programa ativo para este paciente.</p>}
      </div>

      {reinforcerRows.length > 0 && (
        <section className="aba-card">
          <div className="aba-section-head"><div><p className="aba-eyebrow">Reforçadores</p><h3>Eficiência registrada</h3></div></div>
          <PercentBars rows={reinforcerRows.map(row => ({ label: row.name, value: row.effectivePercentage, hint: `${row.uses} ${row.uses === 1 ? 'uso' : 'usos'}` }))} />
          <p className="aba-insight">Percentual de registros classificados como eficiente ou muito eficiente. Reforçador recusado ou ineficaz pede revisão de preferências antes de mudar o programa.</p>
        </section>
      )}

      {approving && <ApproveProgressionDialog program={approving} onClose={() => setApproving(null)} onDone={() => { setApproving(null); onChanged?.(); }} />}
    </div>
  );
}

export default AbaResults;
