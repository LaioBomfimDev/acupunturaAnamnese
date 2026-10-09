import { useEffect, useRef, useState } from 'react';
import { clinicAccentStyle } from './utils/appointmentConfirmation';
import {
  formatAccessCodeInput,
  formatBirthInput,
  formatDueDate,
  isCompleteAccessCode,
  parseBirthInput,
} from './utils/patientForms';
import { callPortal, newSaveId, readStoredSession, storeSession } from './services/patientPortalPublic';
import { PatientFormRunner } from './components/patientForms/PatientFormRunner';
import { PatientRiskSupport } from './components/patientForms/PatientRiskSupport';
import { hasRiskAnswer } from './utils/instrumentPortal';
import {
  IconBuilding,
  IconCheckBold,
  PublicLoading,
  PublicStateMessage,
} from './components/public/PublicPageParts';
import './styles/tokens.css';
import './styles/confirmPage.css';
import './styles/patientForms.css';

// ============================================================
// Área do Paciente — página pública (/area-do-paciente)
//
// Montada direto por main.jsx, fora do AuthProvider: o paciente não tem
// conta no sistema. Entra com o código de acesso (vem no link da
// mensagem) + data de nascimento, vê os formulários que a clínica
// mandou e responde pelo celular. Toda regra mora na Edge Function
// patient-portal; aqui só a tela.
//
// Salvamento: a cada mudança, depois de uma pausa curta, um por vez
// (fila), com a revisão que o servidor devolveu e uma chave por
// salvamento — se a internet cair no meio, o mesmo salvamento é
// repetido com a mesma chave, sem duplicar nem sobrescrever.
// ============================================================

const SAVE_DEBOUNCE_MS = 2500;
const SAVE_MIN_GAP_MS = 3500;
const RETRY_MS = 10000;

function codeFromUrl() {
  try {
    return formatAccessCodeInput(new URLSearchParams(window.location.search).get('codigo') || '');
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

function dueLabel(dueDate) {
  return dueDate ? `Responder até ${formatDueDate(dueDate)}` : 'Sem prazo definido';
}

export function PatientPortalPage() {
  // boot | login | home | form | sent
  const [phase, setPhase] = useState(() => (readStoredSession() ? 'boot' : 'login'));
  const [home, setHome] = useState(null);
  const [notice, setNotice] = useState('');

  const [code, setCode] = useState(codeFromUrl);
  const [birth, setBirth] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saveState, setSaveState] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [serverMissing, setServerMissing] = useState([]);
  const [blocked, setBlocked] = useState(false);
  const [sentWithRisk, setSentWithRisk] = useState(false);
  const [opening, setOpening] = useState('');

  // O token só vive aqui (e no sessionStorage da aba): nada na tela depende dele.
  const sessionRef = useRef(readStoredSession());
  const formRef = useRef(null);
  const submitAttemptRef = useRef(null);
  const answersRef = useRef({});
  const revisionRef = useRef(0);
  const dirtyRef = useRef(false);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  const chainRef = useRef(Promise.resolve());
  const lastSaveAtRef = useRef(0);
  const stoppedRef = useRef(false);

  useEffect(() => {
    document.title = 'Área do Paciente';
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

  function endSession(message = '') {
    clearTimeout(timerRef.current);
    storeSession('');
    sessionRef.current = '';
    setHome(null);
    setForm(null);
    formRef.current = null;
    dirtyRef.current = false;
    pendingRef.current = null;
    setNotice(message);
    setPhase('login');
  }

  async function loadHome(token = sessionRef.current, message = '') {
    try {
      const data = await callPortal({ action: 'home', session: token });
      setHome(data);
      setNotice(message);
      setPhase('home');
    } catch (err) {
      if (err.expired) endSession(err.message);
      else {
        setNotice(err.message);
        setPhase(current => (current === 'boot' ? 'login' : current));
      }
    }
  }

  // Sessão guardada na aba (recarregou a página): volta direto à lista.
  useEffect(() => {
    if (phase !== 'boot') return;
    loadHome(sessionRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(event) {
    event.preventDefault();
    const birthDate = parseBirthInput(birth);
    if (!isCompleteAccessCode(code)) {
      setLoginError('Confira o código de acesso: são 6 letras e números, como ABC-234.');
      return;
    }
    if (!birthDate) {
      setLoginError('Digite a data de nascimento completa, como 25/03/1980.');
      return;
    }
    setLoggingIn(true);
    setLoginError('');
    try {
      const data = await callPortal({ action: 'login', code, birthDate });
      storeSession(data.session);
      sessionRef.current = data.session;
      setHome(data);
      setNotice('');
      setBirth('');
      setPhase('home');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleLogout() {
    const token = sessionRef.current;
    await flushSaves();
    callPortal({ action: 'logout', session: token }).catch(() => {});
    endSession('Você saiu. Para voltar, entre de novo com o código e a data de nascimento.');
  }

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
    const data = await callPortal({
      action: submit ? 'submit' : 'save',
      session: sessionRef.current,
      assignmentId: formRef.current?.id,
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
    if (err.expired) {
      endSession('Sua sessão terminou. Entre de novo: o que já estava salvo continua lá.');
      return;
    }
    if (err.closed) {
      dirtyRef.current = false;
      pendingRef.current = null;
      loadHome(sessionRef.current, err.message);
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
    if (stoppedRef.current || !formRef.current) return;
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

  function flushSaves() {
    clearTimeout(timerRef.current);
    if (!formRef.current || stoppedRef.current) return Promise.resolve();
    return enqueue(autosave);
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

  // ---------- abrir, voltar, enviar ----------

  async function openForm(id) {
    setOpening(id);
    setNotice('');
    try {
      const data = await callPortal({ action: 'open', session: sessionRef.current, assignmentId: id });
      formRef.current = data;
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
      window.scrollTo?.(0, 0);
    } catch (err) {
      if (err.expired) endSession(err.message);
      else if (err.closed) loadHome(sessionRef.current, err.message);
      else setNotice(err.message);
    } finally {
      setOpening('');
    }
  }

  async function backToList(message = '') {
    await flushSaves();
    formRef.current = null;
    setForm(null);
    await loadHome(sessionRef.current, message);
    window.scrollTo?.(0, 0);
  }

  async function handleSubmit() {
    clearTimeout(timerRef.current);
    setSubmitting(true);
    setFormError('');
    try {
      await enqueue(async () => {
        if (pendingRef.current) await sendSave(pendingRef.current, false);
        // Envio que caiu no meio repete com a mesma chave: se já tinha
        // chegado, o servidor só confirma, sem dizer "não disponível".
        const previous = submitAttemptRef.current;
        const attempt = previous && previous.snapshot === answersRef.current ? previous : newAttempt();
        submitAttemptRef.current = attempt;
        await sendSave(attempt, true);
        submitAttemptRef.current = null;
      });
      dirtyRef.current = false;
      setSentWithRisk(hasRiskAnswer(formRef.current?.questions, answersRef.current));
      formRef.current = null;
      setForm(null);
      setPhase('sent');
      window.scrollTo?.(0, 0);
    } catch (err) {
      if (err.missing?.length) {
        setServerMissing(err.missing);
        setFormError(err.message);
      } else if (err.expired || err.closed || err.conflict) {
        handleSaveError(err);
      } else {
        setFormError(err.offline ? 'Sem conexão. Confira a internet e toque em "Enviar respostas" de novo.' : err.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const accent = clinicAccentStyle(home?.clinicColor) || undefined;
  const clinicName = home?.clinicName || '';
  const wide = phase === 'form';

  return (
    <div className="cf-page pp-page" style={accent}>
      <main className={`cf-card${wide ? ' pp-card--wide' : ''}`} aria-busy={phase === 'boot'}>
        {phase === 'boot' && <PublicLoading>Abrindo a sua área…</PublicLoading>}

        {phase === 'login' && (
          <form onSubmit={handleLogin} noValidate>
            <header className="cf-head">
              <p className="cf-clinic"><IconBuilding size={14} />Área do Paciente</p>
              <h1>Entrar</h1>
              <p className="cf-note">Responda pelo celular os formulários que a clínica enviou para você.</p>
            </header>

            {notice && <p className="pq-alert" role="status">{notice}</p>}

            <label className="pp-field">
              Código de acesso
              <input
                className="pq-input pp-input pp-input--code"
                value={code}
                onChange={event => setCode(formatAccessCodeInput(event.target.value))}
                placeholder="ABC-234"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                disabled={loggingIn}
              />
              <small>Está na mensagem que a clínica mandou.</small>
            </label>

            <label className="pp-field">
              Data de nascimento
              <input
                className="pq-input pp-input"
                value={birth}
                onChange={event => setBirth(formatBirthInput(event.target.value))}
                placeholder="DD/MM/AAAA"
                inputMode="numeric"
                autoComplete="bday"
                disabled={loggingIn}
              />
            </label>

            {loginError && <div className="cf-error" role="alert">{loginError}</div>}

            <button type="submit" className="cf-submit" disabled={loggingIn} aria-busy={loggingIn}>
              {loggingIn ? <><span className="cf-spinner cf-spinner--on-accent" aria-hidden="true" />Entrando…</> : 'Entrar'}
            </button>
          </form>
        )}

        {phase === 'home' && home && (
          <>
            <div className="pp-top">
              <div>
                {clinicName && <p className="cf-clinic"><IconBuilding size={14} />{clinicName}</p>}
                <h1>{home.patientFirstName ? `Olá, ${home.patientFirstName}!` : 'Olá!'}</h1>
              </div>
              <button type="button" className="pp-link-btn" onClick={handleLogout}>Sair</button>
            </div>

            {notice && <p className="pq-alert" role="status">{notice}</p>}

            {home.forms?.length ? (
              <>
                <p className="pp-section-label">Para responder</p>
                <ul className="pp-list">
                  {home.forms.map(item => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="pp-form-card"
                        onClick={() => openForm(item.id)}
                        disabled={Boolean(opening)}
                      >
                        <span className="pp-form-title">{item.title}</span>
                        <span className="pp-form-meta">
                          {dueLabel(item.dueDate)}
                          {item.status === 'in_progress' ? ` · ${item.progress || 0}% respondido` : ''}
                        </span>
                        <span className="pp-form-cta">
                          {opening === item.id ? 'Abrindo…' : item.status === 'in_progress' ? 'Continuar →' : 'Responder →'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="pp-empty">Nenhum formulário para responder agora. Quando a clínica enviar um, ele aparece aqui.</p>
            )}

            {home.sent?.length > 0 && (
              <>
                <p className="pp-section-label">Já enviados</p>
                <div>
                  {home.sent.map(item => (
                    <div key={item.id} className="pp-sent">
                      <span>{item.title}</span>
                      <span>Enviado em {new Date(item.submittedAt).toLocaleDateString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {phase === 'form' && form && (
          <>
            <button type="button" className="pp-link-btn pp-back" onClick={() => backToList()} disabled={submitting}>
              ← Voltar aos formulários
            </button>
            <header className="cf-head">
              {clinicName && <p className="cf-clinic"><IconBuilding size={14} />{clinicName}</p>}
              <h1>{form.title}</h1>
              {form.description && <p className="pq-intro">{form.description}</p>}
              <p className="cf-note">
                {dueLabel(form.dueDate)}. Suas respostas são salvas sozinhas: pode parar e continuar depois.
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
              <button type="button" className="pq-btn" onClick={() => openForm(form.id)}>
                Abrir o formulário de novo
              </button>
            )}
          </>
        )}

        {phase === 'sent' && (
          <>
            <PublicStateMessage tone="success" icon={<IconCheckBold size={26} />} title="Respostas enviadas!">
              A clínica já recebeu. Obrigado por responder.
            </PublicStateMessage>
            {sentWithRisk && <PatientRiskSupport />}
            <button type="button" className="cf-submit" onClick={() => loadHome(sessionRef.current)}>
              Voltar aos formulários
            </button>
          </>
        )}
      </main>

      {(phase === 'login' || phase === 'home') && (
        <p className="cf-foot">Suas respostas vão só para a equipe da clínica que cuida do seu atendimento.</p>
      )}
    </div>
  );
}

export default PatientPortalPage;
