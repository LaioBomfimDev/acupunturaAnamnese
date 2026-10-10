import { useCallback, useEffect, useRef, useState } from 'react';
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
import { InstrumentApplyForm } from './InstrumentApplyForm';
import { InstrumentApplicationDialog } from './InstrumentApplicationDialog';
import { InstrumentPortalBox } from './InstrumentPortalBox';
import { InstrumentTrendChart } from './InstrumentTrendChart';
import {
  differenceLabel,
  formatInstrumentDate,
  namedInstrument,
  pointsLabel,
  reapplyStatus,
  savedNotice,
  scoreViews,
  validApplications,
  viewApplications,
} from './instrumentFormat';
import '../../styles/instruments.css';

// ============================================================
// Aba "Escalas" de uma disciplina (etapa 1: aplicação no consultório).
// Um cartão por escala: último resultado, diferença para a anterior,
// quando dá para reaplicar, gráfico da evolução e a lista de aplicações
// (a versão em texto do gráfico). Faixa é do instrumento, nunca
// diagnóstico; o aviso de risco destaca e lembra, nunca decide.
// Quem vê: o banco decide. Aplica e marca "Vi o alerta" quem atende o
// paciente nesta área (Agenda ou responsável da matrícula); a
// administração lê sempre (20261012) e, sem atender, vê a aba só para
// leitura (readOnly), com o nome de quem atende.
// ============================================================

const DISCIPLINE_LABELS = {
  psicologia: 'Psicologia',
  neuropsicologia: 'Neuropsicologia',
  fisioterapia: 'Fisioterapia',
  nutricao: 'Nutrição',
  acupuntura: 'Acupuntura',
};

function isAccessDenied(message) {
  return /não está em atendimento nesta área/.test(String(message || ''));
}

function InstrumentCard({
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
  // Uma nota (PHQ-9, GAD-7) ou uma por subescala (DASS-21). Com várias,
  // o gráfico mostra uma por vez e os botões trocam.
  const views = scoreViews(instrument);
  const single = views.length === 1;
  const [chartViewId, setChartViewId] = useState(views[0].id);
  const chartView = views.find(view => view.id === chartViewId) || views[0];

  return (
    <article className="instrument-card">
      <header className="instrument-card-head">
        <div>
          <h3>
            {instrument.shortName}
            {pending && (
              <span className="instrument-review-badge" title={instrument.review?.note}>Em conferência</span>
            )}
          </h3>
          <p className="small">{instrument.name} · {instrument.measures}</p>
        </div>
        {!readOnly && (
          <button type="button" className="primary-button" onClick={() => onApply(instrument, latest)}>Aplicar agora</button>
        )}
      </header>

      {latest ? (
        <div className="instrument-latest">
          {single ? (
            <>
              <span className="instrument-score">{pointsLabel(latest.result.score)}</span>
              <span>Faixa do instrumento: <b>{latest.result.bandLabel}</b></span>
            </>
          ) : (
            <ul className="instrument-subscales" aria-label={`Notas ${namedInstrument(instrument, 'de')}`}>
              {views.map(view => {
                const now = view.read(latest.result);
                const before = previous ? view.read(previous.result) : null;
                return (
                  <li key={view.id}>
                    <span className="instrument-subscale-label">{view.label}</span>
                    <span className="instrument-subscale-score">{now.score == null ? '—' : pointsLabel(now.score)}</span>
                    <span>Faixa: <b>{now.bandLabel || '—'}</b></span>
                    {before && <span className="small">{differenceLabel(now.score, before.score)}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          <span className="small">
            Última aplicação em {formatInstrumentDate(latest.appliedAt)}. {single ? differenceLabel(latest.result.score, previous?.result?.score) : ''}
            {' '}
            {reapply.tooSoon
              ? `Para medir mudança, reaplicar a partir de ${formatInstrumentDate(reapply.availableFrom)}.`
              : 'Já pode reaplicar.'}
          </span>
        </div>
      ) : (
        <p className="small area-empty">Ainda não aplicada para este paciente.</p>
      )}

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

      {latestRisks.map(risk => (
        <div key={risk.itemId} className="alert instrument-risk">
          Na última aplicação: {risk.message}
        </div>
      ))}

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
            <li key={app.id} className={app.voidedAt ? 'is-voided' : ''}>
              <span className="instrument-history-date">{formatInstrumentDate(app.appliedAt)}</span>
              <span className="instrument-history-score">
                {single
                  ? (typeof app.result?.score === 'number' ? pointsLabel(app.result.score) : '—')
                  : views.map(view => `${view.short} ${view.read(app.result).score ?? '—'}`).join(' · ')}
              </span>
              <span className="instrument-history-band">
                {single
                  ? (app.result?.bandLabel || '—')
                  : views.map(view => view.read(app.result).bandLabel || '—').join(' · ')}
              </span>
              <span className="small instrument-history-author">
                {app.source === 'area_do_paciente'
                  ? 'Respondida em casa'
                  : app.appliedById === currentUserId ? 'Você' : app.appliedByName}
              </span>
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
    </article>
  );
}

// `onApplicationsLoaded`: avisa a área depois de cada carga (abriu, aplicou,
// marcou "Vi o alerta"), para o "Pede atenção" do menu reconferir o risco.
export function PatientInstrumentsPanel({ patient, discipline, currentUserId, clinicName = '', onApplicationsLoaded = null }) {
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
        loadedRef.current?.();
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
          setApplying(null);
          reload();
        }}
      />
    );
  }

  const openedInstrument = opened ? getInstrument(opened.instrumentId, opened.instrumentVersion) : null;
  const blocked = Boolean(error) && !applications.length;
  const area = DISCIPLINE_LABELS[discipline] || discipline;

  return (
    <Panel title="Escalas">
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
            <div className="instrument-list">
              {instruments.map(instrument => (
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
                  onAcknowledge={handleAcknowledge}
                  onPortalChanged={text => { setNotice({ text, risk: false }); reload(); }}
                  onApply={(next, latest) => {
                    setNotice(null);
                    setApplying({ instrument: next, lastAppliedAt: latest?.appliedAt || null });
                  }}
                  onOpen={setOpened}
                />
              ))}
            </div>
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
