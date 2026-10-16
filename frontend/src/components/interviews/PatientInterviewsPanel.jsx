import { useCallback, useEffect, useId, useState } from 'react';
import { Panel } from '../ui/Panel';
import { ScreenHelp } from '../ui/ScreenHelp';
import { ENTREVISTAS_HELP } from '../../data/screenHelp';
import { INTERVIEW_SLOTS, interviewItemCount, interviewsForSlot } from '../../data/clinicalInterviews';
import {
  cancelInterviewLink,
  getInterviewLink,
  listPatientInterviews,
} from '../../services/patientInterviewService';
import {
  copyText,
  formatInterviewDate,
  interviewCardSummary,
  interviewLinkUrl,
  interviewState,
  isOpenLink,
  respondentLine,
  sortInterviewResponses,
} from '../../utils/clinicalInterviews';
import { InterviewLinkBox } from './InterviewLinkBox';
import { InterviewOfficeDialog } from './InterviewOfficeDialog';
import { InterviewResponseDialog } from './InterviewResponseDialog';
import { InterviewGlyph } from './InterviewGlyph';
import '../../styles/instruments.css';
import '../../styles/interviews.css';

// ============================================================
// Entrevistas de um paciente numa área (aba Entrevistas da Psicologia).
//
// Como as escalas (acordeão, tudo fechado de início), mas sem nota:
// fechada, cada entrevista diz quantas respostas tem, os links abertos e
// a data da última resposta. Aberta: responder no consultório, enviar o
// link para quem convive com o paciente e a lista das respostas, cada
// uma com "Ver respostas" (tela e papel timbrado).
//
// Quem vê: o banco decide (can_use_patient_interviews): quem atende o
// paciente nesta área e a administração.
// ============================================================

function isAccessDenied(message) {
  return /não está em atendimento nesta área/.test(String(message || ''));
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function InterviewCard({ interview, responses, patient, discipline, clinicName, open, onToggle, onApply, onOpen, onNotice, onChanged }) {
  const baseId = useId();
  const bodyId = `${baseId}-body`;
  const nameId = `${baseId}-name`;
  const summaryId = `${baseId}-summary`;
  const summary = interviewCardSummary(responses);
  const [busyId, setBusyId] = useState('');
  // Fechado de início: o conteúdo só monta na primeira vez que abre.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  async function handleCopy(response) {
    setBusyId(response.id);
    try {
      const token = await getInterviewLink(response.id);
      const ok = await copyText(interviewLinkUrl(window.location.origin, token));
      onNotice(ok ? `Link de ${response.recipientLabel} copiado.` : 'Não foi possível copiar: o navegador bloqueou.');
    } catch (err) {
      onNotice(err.message, true);
    } finally {
      setBusyId('');
    }
  }

  async function handleCancel(response) {
    setBusyId(response.id);
    try {
      await cancelInterviewLink(response.id);
      onChanged(`Link de ${response.recipientLabel} cancelado: ele não abre mais.`);
    } catch (err) {
      onNotice(err.message, true);
    } finally {
      setBusyId('');
    }
  }

  return (
    <article className={`instrument-card interview-card${open ? ' is-open' : ''}${summary.answered ? '' : ' is-empty'}`}>
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
            <span className="instrument-acc-name" id={nameId}>{interview.shortName}</span>
            <span className="interview-group-tag">{interview.group}</span>
            <span className="instrument-acc-full">{interview.title}</span>
          </span>
          <span className="instrument-acc-result" id={summaryId}>
            {summary.answered ? (
              <span className="interview-acc-count">
                {summary.answered}
                <small>{summary.answered === 1 ? 'resposta' : 'respostas'}</small>
              </span>
            ) : (
              <span className="instrument-acc-empty">Ainda sem resposta · {plural(interviewItemCount(interview), 'pergunta', 'perguntas')}</span>
            )}
          </span>
          <span className="instrument-acc-chevron" aria-hidden="true" />
          {(summary.last || summary.open > 0) && (
            <span className="instrument-acc-dates">
              {summary.last && (
                <span className="instrument-acc-date">
                  <InterviewGlyph name="calendar" /> Última resposta em <b>{formatInterviewDate(summary.last.submittedAt)}</b>
                </span>
              )}
              {summary.open > 0 && (
                <span className="instrument-acc-date instrument-acc-home">
                  <InterviewGlyph name="link" /> {plural(summary.open, 'link esperando resposta', 'links esperando resposta')}
                </span>
              )}
            </span>
          )}
        </button>
      </h3>

      <div className="instrument-acc-panel" id={bodyId} inert={!open}>
        <div className="instrument-acc-inner">
          {mounted && (
            <div className="instrument-acc-body">
              <div className="instrument-acc-actions">
                <button type="button" className="primary-button" onClick={() => onApply(interview)}>
                  Responder no consultório
                </button>
                <InterviewLinkBox
                  interview={interview}
                  patient={patient}
                  discipline={discipline}
                  clinicName={clinicName}
                  onCreated={onChanged}
                />
              </div>

              {responses.length > 0 ? (
                <ul className="instrument-history interview-history" aria-label={`Respostas de ${interview.shortName}`}>
                  {responses.map(response => {
                    const state = interviewState(response);
                    const openLink = isOpenLink(response);
                    return (
                      <li key={response.id} className={response.voidedAt ? 'is-voided' : ''}>
                        <span className="instrument-history-date">
                          {formatInterviewDate(response.submittedAt || response.createdAt)}
                        </span>
                        <span className="interview-history-who">
                          <InterviewGlyph name={response.channel === 'link' ? 'send' : 'office'} />
                          {response.status === 'submitted' ? respondentLine(response) : `Link para ${response.recipientLabel}`}
                        </span>
                        <span className={`interview-state-tag is-${state.tone}`}>{state.label}</span>
                        {openLink && response.linkExpiresAt && (
                          <span className="small instrument-history-author">vale até {formatInterviewDate(response.linkExpiresAt)}</span>
                        )}
                        <span className="interview-history-actions">
                          {response.status === 'submitted' && (
                            <button
                              type="button"
                              className="quiet-button"
                              onClick={() => onOpen(response)}
                              aria-label={`Ver as respostas de ${formatInterviewDate(response.submittedAt)}`}
                            >
                              Ver respostas
                            </button>
                          )}
                          {openLink && (
                            <>
                              <button type="button" className="quiet-button" onClick={() => handleCopy(response)} disabled={busyId === response.id}>
                                Copiar link
                              </button>
                              <button type="button" className="quiet-button" onClick={() => handleCancel(response)} disabled={busyId === response.id}>
                                Cancelar link
                              </button>
                            </>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="small area-empty">Nenhuma resposta nem link para este paciente ainda.</p>
              )}

              <details className="instrument-about">
                <summary>Sobre a entrevista</summary>
                <p className="small">{interview.purpose}</p>
                <p className="small"><b>Quem responde:</b> {interview.respondentLabel}. <b>Período:</b> os últimos 12 meses.</p>
                <p className="small"><b>Nota técnica:</b> {interview.technicalNote}</p>
                <p className="small">{interview.source}.</p>
              </details>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

// `slot`: um lugar do menu (pais e professores, familiar / laboral,
// rastreio). Lugar sem entrevista ainda mostra que espera o modelo.
export function PatientInterviewsPanel({ patient, discipline, profile, clinicName = '', slot = null, title = 'Entrevistas' }) {
  const interviews = interviewsForSlot(discipline, slot);
  const slotInfo = slot ? INTERVIEW_SLOTS[slot] : null;
  const patientId = patient?.id || null;
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [applying, setApplying] = useState(null);
  const [opened, setOpened] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [openIds, setOpenIds] = useState(() => new Set());

  // Trocou de paciente: começa limpo (ajuste no render, não em efeito).
  const patientKey = `${patientId}|${discipline}`;
  const [shownKey, setShownKey] = useState(patientKey);
  if (shownKey !== patientKey) {
    setShownKey(patientKey);
    setResponses([]);
    setLoading(true);
    setLoadedOnce(false);
    setError('');
    setNotice(null);
    setApplying(null);
    setOpened(null);
    setOpenIds(new Set());
  }

  // Lugar sem entrevista não busca nada no banco.
  const hasInterviews = interviews.length > 0;

  useEffect(() => {
    if (!patientId || !hasInterviews) return undefined;
    let cancelled = false;
    listPatientInterviews({ patientId, discipline })
      .then(rows => {
        if (cancelled) return;
        setResponses(sortInterviewResponses(rows));
        setError('');
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setLoadedOnce(true);
      });
    return () => { cancelled = true; };
  }, [patientId, discipline, hasInterviews, reloadToken]);

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

  function changed(text) {
    setNotice({ text, error: false });
    reload();
  }

  if (!patientId) return null;

  if (!interviews.length) {
    return (
      <Panel title={title}>
        <div className="instrument-panel interview-panel">
          <div className="interview-waiting">
            <span className="instrument-dialog-icon"><InterviewGlyph name="interview" size={20} /></span>
            <div>
              <p className="interview-waiting-title">Aguardando o modelo da clínica</p>
              <p className="small">
                Quando a clínica mandar o roteiro desta entrevista, ele entra aqui igual ao modelo, para responder
                no consultório ou mandar por link.
                {slotInfo?.respondent ? ` Quem responde: ${slotInfo.respondent.toLowerCase()}.` : ''}
              </p>
            </div>
          </div>
        </div>
      </Panel>
    );
  }

  const valid = responses.filter(item => item.status === 'submitted' && !item.voidedAt);
  const openLinks = responses.filter(item => isOpenLink(item));
  const blocked = Boolean(error) && !responses.length;
  const canVoid = response => response.createdById === profile?.id || profile?.role === 'clinic_admin';

  return (
    <Panel title={title}>
      <div className="instrument-panel interview-panel">
        {notice && (
          <div className={`alert ${notice.error ? '' : 'alert-info'}`} role="status">{notice.text}</div>
        )}

        {blocked ? (
          <div className="instrument-blocked">
            <div className="alert" role="alert">
              {error}
              {isAccessDenied(error) && (
                <>
                  {' '}Para ver e registrar entrevistas, este paciente precisa ter um atendimento com você nesta área, marcado na Agenda,
                  ou você precisa ser o responsável dele nessa área (a administração escolhe na ficha, aba Matrículas).
                </>
              )}
            </div>
            <button type="button" className="quiet-button" onClick={reload} disabled={loading}>
              {loading ? 'Tentando…' : 'Tentar de novo'}
            </button>
          </div>
        ) : !loadedOnce ? (
          <p className="small instrument-loading" role="status">Carregando entrevistas…</p>
        ) : (
          <>
            {error && <div className="alert" role="alert">{error}</div>}

            <div className="instrument-overview">
              <dl className="instrument-overview-stats">
                <div>
                  <dt>Respondidas</dt>
                  <dd>{valid.length}</dd>
                </div>
                <div>
                  <dt>Links esperando</dt>
                  <dd>{openLinks.length}</dd>
                </div>
                <div>
                  <dt>Última resposta</dt>
                  <dd className="is-date">{valid[0] ? formatInterviewDate(valid[0].submittedAt) : '—'}</dd>
                </div>
              </dl>
              <ScreenHelp topic={ENTREVISTAS_HELP} />
            </div>

            <div className="instrument-list">
              {interviews.map(interview => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  responses={responses.filter(item => item.interviewId === interview.id)}
                  patient={patient}
                  discipline={discipline}
                  clinicName={clinicName}
                  open={openIds.has(interview.id)}
                  onToggle={() => toggleCard(interview.id)}
                  onApply={next => { setNotice(null); setApplying(next); }}
                  onOpen={setOpened}
                  onNotice={(text, isError = false) => setNotice({ text, error: isError })}
                  onChanged={changed}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {applying && (
        <InterviewOfficeDialog
          interview={applying}
          patient={patient}
          discipline={discipline}
          onCancel={() => setApplying(null)}
          onSaved={() => {
            setOpenIds(current => new Set(current).add(applying.id));
            setApplying(null);
            changed('Entrevista salva. Ela está na lista, em “Ver respostas”.');
          }}
        />
      )}

      {opened && (
        <InterviewResponseDialog
          response={opened}
          patient={patient}
          profile={profile}
          canVoid={canVoid(opened)}
          onClose={() => setOpened(null)}
          onVoided={() => {
            setOpened(null);
            changed('Entrevista anulada. Ela continua na lista, marcada.');
          }}
        />
      )}
    </Panel>
  );
}

export default PatientInterviewsPanel;
