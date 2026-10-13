import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Panel } from '../ui/Panel';
import { getInstrument, INSTRUMENT_REVIEW_STATUS, instrumentsForDiscipline } from '../../data/clinicalInstruments';
import {
  acknowledgeInstrumentRisk,
  listInstrumentApplications,
  listInstrumentRequests,
} from '../../services/patientInstrumentService';
import { riskMessages } from '../../utils/instrumentScoring';
import { currentReceivers, receiversLabel } from '../../utils/instrumentRecipients';
import { useInstrumentRecipients } from '../../hooks/useInstrumentRecipients';
import { useCountUp } from '../../hooks/useCountUp';
import { InstrumentApplyForm } from './InstrumentApplyForm';
import { BandMeter, InstrumentApplicationDialog } from './InstrumentApplicationDialog';
import { InstrumentPortalBox } from './InstrumentPortalBox';
import { InstrumentTrendChart } from './InstrumentTrendChart';
import {
  applicationDates,
  bandIndexOf,
  differenceLabel,
  formatInstrumentDate,
  namedInstrument,
  openRequestOf,
  orderInstrumentsForPatient,
  pointsLabel,
  formatScore,
  reapplyStatus,
  requestStatusLabel,
  savedNotice,
  scoreTrend,
  scoreViews,
  validApplications,
  viewApplications,
} from './instrumentFormat';
import '../../styles/instruments.css';

// ============================================================
// Escalas de um paciente numa área: a mesma peça na tela "Escalas" do
// menu principal, na aba Escalas da ficha e na aba da Psicologia.
//
// Acordeão (13/10/2026, pedido da administradora): todas as escalas
// começam fechadas. Fechada, cada uma já diz a última nota e a faixa, se
// subiu ou desceu, a linha pequena da evolução, a data da primeira
// aplicação, as datas das reaplicações e quando dá para reaplicar.
// Aberta: aplicar, enviar para casa, a nota com a régua das faixas, o
// gráfico e a lista de aplicações (a versão em texto do gráfico).
// Primeiro as escalas já aplicadas (da mais recente), depois as outras.
//
// Faixa é do instrumento, nunca diagnóstico; o aviso de risco destaca e
// lembra, nunca decide, e fica à vista mesmo com a escala fechada.
// Quem vê: o banco decide. Aplica e marca "Vi o alerta" quem atende o
// paciente nesta área (Agenda ou responsável da matrícula); a
// administração lê sempre (20261012) e, sem atender, vê só para leitura
// (readOnly), com o nome de quem atende.
// ============================================================

const DISCIPLINE_LABELS = {
  psicologia: 'Psicologia',
  neuropsicologia: 'Neuropsicologia',
  fisioterapia: 'Fisioterapia',
  nutricao: 'Nutrição',
  acupuntura: 'Acupuntura',
};

// Reaplicações mostradas no cartão fechado; as mais antigas viram "+N".
const SHOWN_REAPPLICATIONS = 3;

function isAccessDenied(message) {
  return /não está em atendimento nesta área/.test(String(message || ''));
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// Ícones de traço (24px, currentColor), como os da janela do resultado.
const GLYPHS = {
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </>
  ),
  repeat: (
    <>
      <path d="M4 11a8 8 0 0 1 13.7-5.6L20 7.5" />
      <path d="M20 3.5v4h-4" />
      <path d="M20 13a8 8 0 0 1-13.7 5.6L4 16.5" />
      <path d="M4 20.5v-4h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 9.5V20h12V9.5" />
    </>
  ),
  risk: (
    <>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5z" />
      <path d="M12 10v4.5M12 17.2v.3" />
    </>
  ),
};

function Glyph({ name }) {
  return (
    <svg className="instrument-glyph" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[name]}
    </svg>
  );
}

/** Linha pequena da evolução no cartão fechado (só com duas notas ou mais). */
function Sparkline({ values, min, max }) {
  if (values.length < 2 || !(max > min)) return null;
  const W = 84;
  const H = 30;
  const PAD = 4;
  const x = index => PAD + (index / (values.length - 1)) * (W - PAD * 2);
  const y = value => H - PAD - ((value - min) / (max - min)) * (H - PAD * 2);
  const points = values.map((value, index) => `${x(index)},${y(value)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg className="instrument-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      <polyline points={points} pathLength="1" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3.4" />
    </svg>
  );
}

/** Selo da faixa: o tom sobe com a faixa (cor da clínica), nunca vermelho. */
function BandChip({ bands, label, compact = false }) {
  if (!label) return null;
  const index = bandIndexOf(bands, label);
  return (
    <span className={`instrument-band-tag instrument-tone-${index < 0 ? 0 : Math.min(index, 4)}${compact ? ' is-compact' : ''}`}>
      {label}
    </span>
  );
}

function TrendTag({ trend }) {
  if (!trend) return null;
  const arrow = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '=';
  return (
    <span className={`instrument-trend is-${trend.direction}`} title={trend.label}>
      <span aria-hidden="true">{arrow}{trend.size ? ` ${formatScore(trend.size)}` : ''}</span>
      <span className="sr-only">{trend.label}.</span>
    </span>
  );
}

/** Nota grande que sobe de zero ao abrir o cartão; o leitor de tela lê o valor final. */
function AnimatedScore({ score, active }) {
  const shown = useCountUp(score, active);
  return (
    <span className="instrument-score">
      <span aria-hidden="true">{formatScore(shown)}</span>
      <span className="sr-only">{formatScore(score)}</span>
      <small> {typeof score === 'number' && Math.abs(score) === 1 ? 'ponto' : 'pontos'}</small>
    </span>
  );
}

export function InstrumentCard({
  instrument,
  applications,
  requests,
  patient,
  clinicName,
  discipline,
  currentUserId,
  recipients,
  readOnly,
  acknowledging,
  open,
  onToggle,
  onApply,
  onOpen,
  onAcknowledge,
  onPortalChanged,
}) {
  const valid = validApplications(applications);
  const latest = valid[0] || null;
  const previous = valid[1] || null;
  // Risco vindo de casa fica em destaque até alguém que atende marcar "Vi o alerta".
  const unseenRisks = valid.filter(app => app.hasRisk && !app.riskAcknowledgedAt);
  const latestRisks = latest && !unseenRisks.includes(latest)
    ? riskMessages(instrument, latest.result.riskItems || [], { source: latest.source })
    : [];
  const pending = instrument.review?.status !== INSTRUMENT_REVIEW_STATUS.APPROVED;
  const reapply = reapplyStatus(latest?.appliedAt, instrument.reapplyAfterDays);
  const dates = applicationDates(applications);
  const shownReapplied = dates.reapplied.slice(-SHOWN_REAPPLICATIONS);
  const hiddenReapplied = dates.reapplied.length - shownReapplied.length;
  const openRequest = openRequestOf(requests);
  // Uma nota (PHQ-9, GAD-7) ou uma por subescala (DASS-21). Com várias,
  // o gráfico mostra uma por vez e os botões trocam.
  const views = scoreViews(instrument);
  const single = views.length === 1;
  const [chartViewId, setChartViewId] = useState(views[0].id);
  const chartView = views.find(view => view.id === chartViewId) || views[0];
  // Fechado de início: o conteúdo só monta na primeira vez que abre e
  // depois fica (fechado = inerte), para a animação de fechar acontecer.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  const baseId = useId();
  const nameId = `${baseId}-name`;
  const summaryId = `${baseId}-summary`;
  const bodyId = `${baseId}-body`;
  const sparkValues = valid
    .slice()
    .reverse()
    .map(app => views[0].read(app.result).score)
    .filter(value => typeof value === 'number');

  return (
    <article className={`instrument-card${open ? ' is-open' : ''}${unseenRisks.length ? ' has-risk' : ''}${latest ? '' : ' is-empty'}`}>
      <h3 className="instrument-acc-heading">
        <button
          type="button"
          className="instrument-acc-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-labelledby={nameId}
          aria-describedby={summaryId}
          onClick={onToggle}
        >
          <span className="instrument-acc-title">
            <span className="instrument-acc-name" id={nameId}>{instrument.shortName}</span>
            {pending && (
              <span className="instrument-review-badge" title={instrument.review?.note}>Em conferência</span>
            )}
            {unseenRisks.length > 0 && (
              <span className="instrument-risk-tag"><Glyph name="risk" /> Alerta de risco</span>
            )}
            <span className="instrument-acc-full">{instrument.name} · {instrument.measures}</span>
          </span>

          <span className="instrument-acc-result" id={summaryId}>
            {latest ? (
              single ? (
                <>
                  <span className="instrument-acc-score">
                    {formatScore(latest.result.score)}
                    <small>{typeof latest.result.score === 'number' && Math.abs(latest.result.score) === 1 ? 'ponto' : 'pontos'}</small>
                  </span>
                  {instrument.noBands
                    ? <span className="instrument-band-tag is-plain">Sem faixas</span>
                    : <BandChip bands={views[0].bands} label={latest.result.bandLabel} />}
                  <TrendTag trend={scoreTrend(latest.result.score, previous?.result?.score)} />
                </>
              ) : (
                <span className="instrument-acc-subscales">
                  {views.map(view => {
                    const now = view.read(latest.result);
                    return (
                      <span key={view.id} className="instrument-acc-subscale" title={view.label}>
                        <span className="instrument-acc-subscale-label">{view.short}</span>
                        <b>{formatScore(now.score)}</b>
                        {view.bands.length > 0 && <BandChip bands={view.bands} label={now.bandLabel} compact />}
                      </span>
                    );
                  })}
                </span>
              )
            ) : (
              <span className="instrument-acc-empty">Ainda não aplicada · cerca de {instrument.minutes} min</span>
            )}
          </span>

          {/* Só com nota total: na DASS-21 a linha seria de uma subescala sem dizer qual. */}
          {views[0].id === 'total' && (
            <Sparkline values={sparkValues} min={views[0].scoring?.min ?? 0} max={views[0].scoring?.max ?? 0} />
          )}
          <span className="instrument-acc-chevron" aria-hidden="true" />

          {(latest || openRequest) && (
            <span className="instrument-acc-dates">
              {dates.first && (
                <span className="instrument-acc-date">
                  <Glyph name="calendar" /> Aplicada em <b>{formatInstrumentDate(dates.first)}</b>
                </span>
              )}
              {shownReapplied.length > 0 && (
                <span className="instrument-acc-date">
                  <Glyph name="repeat" /> Reaplicada em
                  {/* Um bloco só: o espaço do selo (gap) não entra antes da vírgula. */}
                  <span>
                    {hiddenReapplied > 0 && <span className="instrument-acc-more">+{hiddenReapplied}, </span>}
                    {shownReapplied.map((date, index) => (
                      <span key={date}>
                        {index > 0 && ', '}
                        <b>{formatInstrumentDate(date)}</b>
                      </span>
                    ))}
                  </span>
                </span>
              )}
              {dates.count > 0 && (
                <span className="instrument-acc-count">{plural(dates.count, 'aplicação', 'aplicações')}</span>
              )}
              {latest && (
                <span className={`instrument-acc-date instrument-acc-next${reapply.tooSoon ? '' : ' is-ready'}`}>
                  <Glyph name="clock" />
                  {reapply.tooSoon
                    ? <>Reaplicar a partir de <b>{formatInstrumentDate(reapply.availableFrom)}</b></>
                    : <b>Já pode reaplicar</b>}
                </span>
              )}
              {openRequest && (
                <span className="instrument-acc-date instrument-acc-home">
                  <Glyph name="home" /> Em casa: {requestStatusLabel(openRequest)}
                </span>
              )}
            </span>
          )}
        </button>
      </h3>

      {unseenRisks.map(app => (
        <div key={app.id} className="alert instrument-risk instrument-risk-unseen" role="alert">
          <p>
            <b>Alerta de risco</b> na aplicação de {formatInstrumentDate(app.appliedAt)}:{' '}
            {riskMessages(instrument, app.result.riskItems || [], { source: app.source }).map(risk => risk.message).join(' ')}
          </p>
          {readOnly ? (
            <p className="small">Quem atende o paciente marca “Vi o alerta”.</p>
          ) : (
            <button
              type="button"
              className="quiet-button"
              onClick={() => onAcknowledge(app)}
              disabled={acknowledging === app.id}
            >
              {acknowledging === app.id ? 'Marcando…' : 'Vi o alerta'}
            </button>
          )}
        </div>
      ))}

      <div className="instrument-acc-panel" id={bodyId} inert={!open}>
        <div className="instrument-acc-inner">
          {mounted && (
            <div className="instrument-acc-body">
              <div className="instrument-acc-actions">
                {!readOnly && (
                  <button type="button" className="primary-button" onClick={() => onApply(instrument, latest)}>Aplicar agora</button>
                )}
                <InstrumentPortalBox
                  instrument={instrument}
                  patient={patient}
                  clinicName={clinicName}
                  discipline={discipline}
                  requests={requests}
                  recipients={recipients}
                  currentUserId={currentUserId}
                  onChanged={onPortalChanged}
                />
              </div>

              {latest ? (
                <div className="instrument-latest">
                  {single ? (
                    <div className="instrument-latest-main">
                      <div className="instrument-latest-score">
                        <AnimatedScore score={latest.result.score} active={open} />
                        {instrument.noBands
                          ? <span>Sem faixas clínicas: compare com as aplicações anteriores.</span>
                          : <span>Faixa do instrumento: <BandChip bands={views[0].bands} label={latest.result.bandLabel} /></span>}
                      </div>
                      <BandMeter view={views[0]} score={latest.result.score} bandLabel={null} />
                    </div>
                  ) : (
                    <ul className="instrument-subscales" aria-label={`Notas ${namedInstrument(instrument, 'de')}`}>
                      {views.map(view => {
                        const now = view.read(latest.result);
                        const before = previous ? view.read(previous.result) : null;
                        return (
                          <li key={view.id}>
                            <span className="instrument-subscale-label">{view.label}</span>
                            <span className="instrument-subscale-score">{now.score == null ? '—' : pointsLabel(now.score)}</span>
                            {view.bands.length > 0 && <span>Faixa: <b>{now.bandLabel || '—'}</b></span>}
                            {before && <span className="small">{differenceLabel(now.score, before.score)}</span>}
                            <BandMeter view={view} score={now.score} bandLabel={null} />
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <span className="small instrument-latest-note">
                    Última aplicação em <b>{formatInstrumentDate(latest.appliedAt)}</b>. {single ? differenceLabel(latest.result.score, previous?.result?.score) : ''}
                    {' '}
                    {reapply.tooSoon
                      ? `Para medir mudança, reaplicar a partir de ${formatInstrumentDate(reapply.availableFrom)}.`
                      : 'Já pode reaplicar.'}
                  </span>
                </div>
              ) : (
                <p className="small area-empty">Ainda não aplicada para este paciente.</p>
              )}

              {latestRisks.map(risk => (
                <div key={risk.itemId} className="alert instrument-risk">
                  Na última aplicação: {risk.message}
                </div>
              ))}

              {single ? (
                <InstrumentTrendChart instrument={instrument} applications={applications} />
              ) : valid.length > 0 && (
                <div className="instrument-chart-switch">
                  <div className="instrument-chart-tabs" role="group" aria-label={`Gráfico ${namedInstrument(instrument, 'de')}`}>
                    {views.map(view => (
                      <button
                        key={view.id}
                        type="button"
                        aria-pressed={chartView.id === view.id}
                        onClick={() => setChartViewId(view.id)}
                      >
                        {view.label}
                      </button>
                    ))}
                  </div>
                  <InstrumentTrendChart
                    key={chartView.id}
                    instrument={{ ...instrument, shortName: `${instrument.shortName} · ${chartView.label}`, scoring: chartView.scoring, bands: chartView.bands }}
                    applications={viewApplications(applications, chartView)}
                  />
                </div>
              )}

              {applications.length > 0 && (
                <ul className="instrument-history" aria-label={`Aplicações ${namedInstrument(instrument, 'de')}`}>
                  {applications.map(app => (
                    <li key={app.id} className={`${app.voidedAt ? 'is-voided' : ''}${app === latest ? ' is-latest' : ''}`}>
                      <span className="instrument-history-date">{formatInstrumentDate(app.appliedAt)}</span>
                      <span className="instrument-history-score">
                        {single
                          ? (typeof app.result?.score === 'number' ? pointsLabel(app.result.score) : '—')
                          : views.map(view => `${view.short} ${formatScore(view.read(app.result).score)}`).join(' · ')}
                      </span>
                      <span className="instrument-history-band">
                        {single
                          ? (app.result?.bandLabel ? <BandChip bands={views[0].bands} label={app.result.bandLabel} /> : '—')
                          : views.map(view => view.read(app.result).bandLabel || '—').join(' · ')}
                      </span>
                      <span className="small instrument-history-author">
                        {app.source === 'area_do_paciente'
                          ? 'Respondida em casa'
                          : app.appliedById === currentUserId ? 'Você' : app.appliedByName}
                      </span>
                      {app === latest && <span className="instrument-latest-tag">Última</span>}
                      {app.hasRisk && !app.voidedAt && <span className="instrument-risk-tag">Risco</span>}
                      {app.voidedAt && <span className="instrument-voided-tag">Anulada</span>}
                      <button
                        type="button"
                        className="quiet-button"
                        aria-label={`Abrir a aplicação de ${formatInstrumentDate(app.appliedAt)}`}
                        onClick={() => onOpen(app)}
                      >
                        Abrir
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <details className="instrument-about">
                <summary>Sobre a escala</summary>
                <p className="small">{instrument.population} · cerca de {instrument.minutes} minutos.</p>
                <p className="small">{instrument.reading}</p>
                {pending && instrument.review?.note && <p className="small"><b>Em conferência:</b> {instrument.review.note}</p>}
                <ul className="small">
                  {instrument.sources.map(source => <li key={source}>{source}</li>)}
                </ul>
                <p className="small">{instrument.license}</p>
              </details>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// `onApplicationsLoaded`: avisa quem montou depois de cada carga (abriu,
// aplicou, marcou "Vi o alerta"), para o "Pede atenção" do menu e o
// resumo da aba da ficha reconferirem.
export function PatientInstrumentsPanel({
  patient,
  discipline,
  currentUserId,
  clinicName = '',
  title = 'Escalas',
  onApplicationsLoaded = null,
}) {
  const instruments = instrumentsForDiscipline(discipline);
  const patientId = patient?.id || null;
  const topRef = useRef(null);
  const [applications, setApplications] = useState([]);
  const [requests, setRequests] = useState([]);
  const [acknowledging, setAcknowledging] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [applying, setApplying] = useState(null);
  const [opened, setOpened] = useState(null);
  const [notice, setNotice] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  // Acordeão: tudo fechado de início (ids das escalas abertas).
  const [openIds, setOpenIds] = useState(() => new Set());
  const recipients = useInstrumentRecipients(patientId, discipline);
  const loadedRef = useRef(onApplicationsLoaded);
  useEffect(() => { loadedRef.current = onApplicationsLoaded; });
  // Administração que não atende: lê tudo, mas aplicar e marcar o alerta
  // ficam com quem atende. Sem a leitura (banco antigo), a aba segue como era.
  const readOnly = Boolean(recipients.info) && !recipients.info.viewerAttends;

  // Trocou de paciente: começa limpo (ajuste no render, não em efeito).
  const patientKey = `${patientId}|${discipline}`;
  const [shownKey, setShownKey] = useState(patientKey);
  if (shownKey !== patientKey) {
    setShownKey(patientKey);
    setApplications([]);
    setRequests([]);
    setLoading(true);
    setLoadedOnce(false);
    setError('');
    setApplying(null);
    setOpened(null);
    setNotice(null);
    setOpenIds(new Set());
  }

  useEffect(() => {
    if (!patientId) return undefined;
    let cancelled = false;
    // Envios para casa não podem travar a aba: sem eles (banco antigo ou
    // falha), as escalas do consultório continuam aparecendo.
    Promise.all([
      listInstrumentApplications({ patientId, discipline }),
      listInstrumentRequests({ patientId, discipline }).catch(() => []),
    ])
      .then(([rows, sent]) => {
        if (cancelled) return;
        setApplications(rows);
        setRequests(sent);
        setError('');
        loadedRef.current?.(rows);
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoadedOnce(true);
      });
    return () => { cancelled = true; };
  }, [patientId, discipline, reloadToken]);

  const reload = useCallback(() => {
    setLoading(true);
    setReloadToken(token => token + 1);
  }, []);

  function toggleCard(id) {
    setOpenIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAcknowledge(app) {
    setAcknowledging(app.id);
    try {
      await acknowledgeInstrumentRisk(app.id);
      setNotice({ text: 'Alerta marcado como visto.', risk: false });
      reload();
    } catch (err) {
      setNotice({ text: err.message, risk: true });
    } finally {
      setAcknowledging('');
    }
  }

  // Depois de salvar ou anular, o recado e o cartão atualizado ficam à vista.
  useEffect(() => {
    if (!notice || applying) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    topRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }, [notice, applying]);

  if (!patientId) return null;

  if (applying) {
    return (
      <InstrumentApplyForm
        instrument={applying.instrument}
        patientName={patient.name}
        patientId={patientId}
        discipline={discipline}
        lastAppliedAt={applying.lastAppliedAt}
        onCancel={() => setApplying(null)}
        onSaved={saved => {
          setNotice(savedNotice(applying.instrument, saved));
          // A escala recém-aplicada volta aberta, com o resultado à vista.
          setOpenIds(current => new Set(current).add(applying.instrument.id));
          setApplying(null);
          reload();
        }}
      />
    );
  }

  const openedInstrument = opened ? getInstrument(opened.instrumentId, opened.instrumentVersion) : null;
  const blocked = Boolean(error) && !applications.length;
  const area = DISCIPLINE_LABELS[discipline] || discipline;
  const { applied, notApplied } = orderInstrumentsForPatient(instruments, applications);
  const validCount = validApplications(applications).length;
  const latestAt = validApplications(applications)
    .map(app => app.appliedAt)
    .sort((a, b) => new Date(b) - new Date(a))[0] || null;
  const allOpen = instruments.length > 0 && instruments.every(instrument => openIds.has(instrument.id));

  const renderCard = instrument => (
    <InstrumentCard
      key={instrument.id}
      instrument={instrument}
      applications={applications.filter(app => app.instrumentId === instrument.id)}
      requests={requests.filter(request => request.instrumentId === instrument.id)}
      patient={patient}
      clinicName={clinicName}
      discipline={discipline}
      currentUserId={currentUserId}
      recipients={recipients}
      readOnly={readOnly}
      acknowledging={acknowledging}
      open={openIds.has(instrument.id)}
      onToggle={() => toggleCard(instrument.id)}
      onAcknowledge={handleAcknowledge}
      onPortalChanged={text => { setNotice({ text, risk: false }); reload(); }}
      onApply={(next, latest) => {
        setNotice(null);
        setApplying({ instrument: next, lastAppliedAt: latest?.appliedAt || null });
      }}
      onOpen={setOpened}
    />
  );

  return (
    <Panel title={title}>
      <div className="instrument-panel" ref={topRef}>
        <p className="small area-intro">
          Aplique a escala no atendimento ou envie para o paciente responder em casa: o sistema soma os pontos e mostra a faixa do instrumento e a evolução.
          A faixa não é diagnóstico. Veem as escalas quem atende o paciente nesta área (atendimento na Agenda ou responsável) e a administração.
        </p>

        {readOnly && (
          <div className="alert alert-info instrument-readonly-note" role="status">
            Você vê as escalas por ser da administração. Aplicar no atendimento e marcar “Vi o alerta” ficam com quem atende
            {currentReceivers(recipients.info).length
              ? `: ${receiversLabel(currentReceivers(recipients.info), currentUserId)}.`
              : '. Ninguém atende este paciente nesta área ainda: escolha o responsável na ficha, aba Matrículas.'}
          </div>
        )}

        {notice && (
          <div className={`alert ${notice.risk ? 'instrument-risk' : 'alert-info'}`} role="status">
            {notice.text}
            {notice.risk && ' Houve resposta positiva no item de risco: avalie o risco ainda neste atendimento.'}
          </div>
        )}

        {blocked ? (
          <div className="instrument-blocked">
            <div className="alert" role="alert">
              {error}
              {isAccessDenied(error) && (
                <>
                  {' '}Para ver e aplicar escalas, este paciente precisa ter um atendimento com você na {area}, marcado na Agenda,
                  ou você precisa ser o responsável dele nessa área (a administração escolhe na ficha, aba Matrículas).
                </>
              )}
            </div>
            <button type="button" className="quiet-button" onClick={reload} disabled={loading}>
              {loading ? 'Tentando…' : 'Tentar de novo'}
            </button>
          </div>
        ) : !loadedOnce ? (
          <p className="small instrument-loading" role="status">Carregando escalas…</p>
        ) : (
          <>
            {error && <div className="alert" role="alert">{error}</div>}

            <div className="instrument-overview">
              <dl className="instrument-overview-stats">
                <div>
                  <dt>Escalas aplicadas</dt>
                  <dd>{applied.length}<small> de {instruments.length}</small></dd>
                </div>
                <div>
                  <dt>Aplicações</dt>
                  <dd>{validCount}</dd>
                </div>
                <div>
                  <dt>Última aplicação</dt>
                  <dd className="is-date">{latestAt ? formatInstrumentDate(latestAt) : '—'}</dd>
                </div>
              </dl>
              {instruments.length > 0 && (
                <button
                  type="button"
                  className="quiet-button instrument-toggle-all"
                  onClick={() => setOpenIds(allOpen ? new Set() : new Set(instruments.map(instrument => instrument.id)))}
                >
                  {allOpen ? 'Fechar todas' : 'Abrir todas'}
                </button>
              )}
            </div>

            {applied.length > 0 && (
              <section className="instrument-group" aria-label="Escalas aplicadas a este paciente">
                <h4 className="instrument-group-title">
                  Aplicadas a este paciente <span>{applied.length}</span>
                </h4>
                <div className="instrument-list">{applied.map(renderCard)}</div>
              </section>
            )}

            {notApplied.length > 0 && (
              <section className="instrument-group" aria-label="Escalas ainda não aplicadas">
                <h4 className="instrument-group-title">
                  {applied.length ? 'Outras escalas disponíveis' : 'Escalas disponíveis'} <span>{notApplied.length}</span>
                </h4>
                <div className="instrument-list">{notApplied.map(renderCard)}</div>
              </section>
            )}
          </>
        )}
      </div>

      {opened && openedInstrument && (
        <InstrumentApplicationDialog
          application={opened}
          instrument={openedInstrument}
          canVoid={Boolean(currentUserId) && opened.appliedById === currentUserId}
          onClose={() => setOpened(null)}
          onVoided={() => {
            setOpened(null);
            setNotice({ text: 'Aplicação anulada. Ela continua na lista, marcada.', risk: false });
            reload();
          }}
        />
      )}
    </Panel>
  );
}

export default PatientInstrumentsPanel;
