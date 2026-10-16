import { useEffect, useRef, useState } from 'react';
import { clinicAccentStyle } from './utils/appointmentConfirmation';
import { formatInterviewDate, tokenFromHash } from './utils/clinicalInterviews';
import { callInterviewLink } from './services/interviewLinkPublic';
import { newSaveId } from './services/patientPortalPublic';
import { PatientFormRunner } from './components/patientForms/PatientFormRunner';
import {
  IconBuilding,
  IconCheckBold,
  IconLinkOff,
  PublicLoading,
  PublicStateMessage,
} from './components/public/PublicPageParts';
import './styles/tokens.css';
import './styles/confirmPage.css';
import './styles/patientForms.css';

// ============================================================
// Link de entrevista — página pública (/entrevista#token)
//
// Montada direto por main.jsx, fora do AuthProvider: quem responde
// (mãe, cônjuge, professora) não tem conta. Abre só a entrevista daquele
// link, com o primeiro nome do paciente. Toda regra mora na Edge
// Function interview-link; aqui só a tela.
//
// Salvamento igual ao da Área do Paciente: a cada mudança, depois de
// uma pausa curta, um por vez (fila), com a revisão que o servidor
// devolveu e uma chave por salvamento — se a internet cair no meio, o
// mesmo salvamento é repetido com a mesma chave, sem duplicar.
// ============================================================

const SAVE_DEBOUNCE_MS = 2500;
const SAVE_MIN_GAP_MS = 3500;
const RETRY_MS = 10000;

function readToken() {
  try {
    return tokenFromHash(window.location.hash);
  } catch {
    return '';
  }
}

// Fora do componente: a regra de pureza do React não aceita Date.now()
// no corpo dele, mesmo dentro de função que só roda em evento.
function nowMs() {
  return Date.now();
}

function clockLabel() {
  return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function InterviewLinkPage() {
  const [token] = useState(readToken);
  // loading | closed | form | sent
  const [phase, setPhase] = useState(() => (token ? 'loading' : 'closed'));
  const [closed, setClosed] = useState(() => (token ? null : {
    message: 'Este link não existe ou foi copiado pela metade. Confira com a clínica.',
  }));
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saveState, setSaveState] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [serverMissing, setServerMissing] = useState([]);
  const [blocked, setBlocked] = useState(false);

  const answersRef = useRef({});
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const pendingRef = useRef(null);
  const submitAttemptRef = useRef(null);
  const timerRef = useRef(null);
  const chainRef = useRef(Promise.resolve());
  const lastSaveAtRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    document.title = 'Entrevista';
  }, []);

  useEffect(() => {
    function warnUnsaved(event) {
      if (dirtyRef.current || pendingRef.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', warnUnsaved);
    return () => window.removeEventListener('beforeunload', warnUnsaved);
  }, []);

  function showClosed(data) {
    clearTimeout(timerRef.current);
    stoppedRef.current = true;
    dirtyRef.current = false;
    pendingRef.current = null;
    setClosed(data);
    setPhase(data?.state === 'submitted' ? 'sent' : 'closed');
  }

  function applyOpened(data) {
    if (data.state !== 'ok') {
      showClosed(data);
      return;
    }
    answersRef.current = data.answers || {};
    revisionRef.current = data.revision || 0;
    dirtyRef.current = false;
    pendingRef.current = null;
    submitAttemptRef.current = null;
    stoppedRef.current = false;
    lastSaveAtRef.current = 0;
    setForm(data);
    setAnswers(answersRef.current);
    setSaveState(data.revision ? { text: 'Continuando de onde você parou.', tone: 'ok' } : null);
    setFormError('');
    setServerMissing([]);
    setBlocked(false);
    setPhase('form');
  }

  function applyOpenError(err) {
    setClosed({ message: err.message, retry: true });
    setPhase('closed');
  }

  function openLink() {
    setPhase('loading');
    callInterviewLink({ action: 'open', token }).then(applyOpened, applyOpenError);
  }

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    callInterviewLink({ action: 'open', token }).then(
      data => { if (!cancelled) applyOpened(data); },
      err => { if (!cancelled) applyOpenError(err); },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // ---------- salvamento ----------

  function enqueue(task) {
    const next = chainRef.current.then(task, task);
    chainRef.current = next.catch(() => {});
    return next;
  }

  function newAttempt() {
    return { saveId: newSaveId(), snapshot: answersRef.current, revision: revisionRef.current };
  }

  async function sendSave(attempt, submit) {
    const data = await callInterviewLink({
      action: submit ? 'submit' : 'save',
      token,
      answers: attempt.snapshot,
      revision: attempt.revision,
      saveId: attempt.saveId,
    });
    revisionRef.current = data.revision;
    pendingRef.current = null;
    lastSaveAtRef.current = nowMs();
    if (answersRef.current === attempt.snapshot) dirtyRef.current = false;
    return data;
  }

  function scheduleSave(delay = SAVE_DEBOUNCE_MS) {
    clearTimeout(timerRef.current);
    const sinceLast = nowMs() - lastSaveAtRef.current;
    const wait = Math.max(delay, SAVE_MIN_GAP_MS - sinceLast);
    timerRef.current = setTimeout(() => { enqueue(autosave); }, wait);
  }

  function handleSaveError(err) {
    if (err.closed) {
      showClosed({ message: err.message });
      return;
    }
    if (err.conflict) {
      stoppedRef.current = true;
      setBlocked(true);
      setSaveState({ text: 'Salvamento parado.', tone: 'warning' });
      setFormError(err.message);
      return;
    }
    if (err.status === 429) {
      setSaveState({ text: 'Salvando em instantes…', tone: 'warning' });
      scheduleSave(Math.max((err.retryAfterSeconds || 10) * 1000, SAVE_DEBOUNCE_MS));
      return;
    }
    setSaveState({ text: 'Sem conexão. Tentando salvar de novo…', tone: 'warning' });
    scheduleSave(RETRY_MS);
  }

  async function autosave() {
    if (stoppedRef.current) return;
    if (!dirtyRef.current && !pendingRef.current) return;
    const attempt = pendingRef.current || newAttempt();
    pendingRef.current = attempt;
    setSaveState({ text: 'Salvando…', tone: 'ok' });
    try {
      await sendSave(attempt, false);
      setSaveState({ text: `Salvo às ${clockLabel()}`, tone: 'ok' });
      if (dirtyRef.current) scheduleSave();
    } catch (err) {
      if (!err.offline && err.status !== 429 && err.status < 500) pendingRef.current = null;
      handleSaveError(err);
    }
  }

  function handleAnswersChange(next) {
    answersRef.current = next;
    setAnswers(next);
    if (stoppedRef.current) return;
    dirtyRef.current = true;
    setServerMissing([]);
    setSaveState({ text: 'Salvando em instantes…', tone: 'ok' });
    scheduleSave();
  }

  async function handleSubmit() {
    clearTimeout(timerRef.current);
    setSubmitting(true);
    setFormError('');
    try {
      await enqueue(async () => {
        if (pendingRef.current) await sendSave(pendingRef.current, false);
        // Envio que caiu no meio repete com a mesma chave: se já tinha
        // chegado, o servidor só confirma.
        const previous = submitAttemptRef.current;
        const attempt = previous && previous.snapshot === answersRef.current ? previous : newAttempt();
        submitAttemptRef.current = attempt;
        await sendSave(attempt, true);
        submitAttemptRef.current = null;
      });
      dirtyRef.current = false;
      stoppedRef.current = true;
      setPhase('sent');
      window.scrollTo?.(0, 0);
    } catch (err) {
      if (err.missing?.length) {
        setServerMissing(err.missing);
        setFormError(err.message);
      } else if (err.closed || err.conflict) {
        handleSaveError(err);
      } else {
        setFormError(err.offline ? 'Sem conexão. Confira a internet e toque em "Enviar respostas" de novo.' : err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const accent = clinicAccentStyle(form?.clinicColor || closed?.clinicColor) || undefined;
  const clinicName = form?.clinicName || closed?.clinicName || '';
  const who = form?.patientFirstName || 'a pessoa atendida';

  return (
    <div className="cf-page pp-page" style={accent}>
      <main className={`cf-card${phase === 'form' ? ' pp-card--wide' : ''}`} aria-busy={phase === 'loading'}>
        {phase === 'loading' && <PublicLoading>Abrindo a entrevista…</PublicLoading>}

        {phase === 'closed' && (
          <>
            {clinicName && <p className="cf-clinic"><IconBuilding size={14} />{clinicName}</p>}
            <PublicStateMessage tone="neutral" icon={<IconLinkOff />} title="Entrevista indisponível">
              {closed?.message || 'Este link não está mais disponível.'}
            </PublicStateMessage>
            {closed?.retry && (
              <button type="button" className="cf-submit" onClick={openLink}>Tentar de novo</button>
            )}
          </>
        )}

        {phase === 'form' && form && (
          <>
            <header className="cf-head">
              {clinicName && <p className="cf-clinic"><IconBuilding size={14} />{clinicName}</p>}
              <h1>{form.title}</h1>
              <p className="cf-note">
                Suas respostas são sobre <b>{who}</b> e vão só para a equipe da clínica que cuida do atendimento.
                {' '}Elas são salvas sozinhas: dá para parar e continuar depois pelo mesmo link
                {form.expiresAt ? `, até ${formatInterviewDate(form.expiresAt)}` : ''}.
              </p>
            </header>
            <PatientFormRunner
              questions={form.questions || []}
              answers={answers}
              onAnswersChange={handleAnswersChange}
              onSubmit={handleSubmit}
              saveState={saveState}
              submitting={submitting}
              error={formError}
              serverMissing={serverMissing}
              disabled={blocked}
            />
            {blocked && (
              <button type="button" className="pq-btn" onClick={openLink}>
                Abrir a entrevista de novo
              </button>
            )}
          </>
        )}

        {phase === 'sent' && (
          <>
            {clinicName && <p className="cf-clinic"><IconBuilding size={14} />{clinicName}</p>}
            <PublicStateMessage tone="success" icon={<IconCheckBold size={26} />} title="Respostas enviadas!">
              A clínica já recebeu. Obrigado por responder.
            </PublicStateMessage>
          </>
        )}
      </main>

      {phase === 'form' && (
        <p className="cf-foot">Este link abre só esta entrevista. Não repasse a outras pessoas.</p>
      )}
    </div>
  );
}

export default InterviewLinkPage;
