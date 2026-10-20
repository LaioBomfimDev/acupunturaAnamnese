import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { clinicAccentStyle, describeAppointmentWhen } from './utils/appointmentConfirmation';
import { dailyErrorMessage, formatClock, ONLINE_ROOM_WINDOWS } from './utils/onlineConsultation';
import { RECORDING_TERM, TELECONSULTATION_TERM } from './data/onlineConsentTerms';
import {
  joinConsultation,
  openConsultation,
  saveConsultationConsent,
} from './services/onlineConsultationPublic';
import { IconVideo } from './components/panels/agenda/AgendaIcons';
import {
  IconBuilding,
  IconCalendarOff,
  IconLinkOff,
  IconStethoscope,
  PublicLoading,
  PublicStateMessage,
  PublicWhenBlock,
} from './components/public/PublicPageParts';
import './styles/tokens.css';
import './styles/confirmPage.css';
import './styles/onlineConsultation.css';

// ============================================================
// Consulta online — página do paciente (/consulta-online?token=…)
//
// Montada por main.jsx FORA de AuthProvider: o paciente não tem conta.
// Chega pelo link do agendamento (o mesmo da confirmação no WhatsApp).
// Antes da primeira consulta responde o termo (prévia A, 20/10/2026);
// depois testa câmera e som e entra na sala pronta do Daily, já na cor
// da clínica. Quem decide se a sala abre e quando é a Edge Function
// online-consultation; esta tela só mostra o que ela devolve.
// Só nesta página o navegador libera câmera e microfone (vercel.json).
// ============================================================

const HEX_COLOR = /^#?[0-9a-fA-F]{6}$/;
const FALLBACK_COLOR = '#0F4C49';

function getTokenFromUrl() {
  return new URLSearchParams(window.location.search).get('token') || '';
}

function dailyAccent(color) {
  const text = String(color || '').trim();
  if (!HEX_COLOR.test(text)) return FALLBACK_COLOR;
  return text.startsWith('#') ? text : `#${text}`;
}

function IconMic() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}

function ClinicLine({ name, withIcon = false }) {
  if (!name) return null;
  return (
    <p className="cf-clinic">
      {withIcon && <IconBuilding size={14} />}
      {name}
    </p>
  );
}

// ---------------------------------------------------------------
// Termo (prévia A, com a edição da usuária: a gravação ficou só com a
// pergunta e o link do termo)
// ---------------------------------------------------------------

function ConsentStep({ view, onSaved, token }) {
  const [agreed, setAgreed] = useState(false);
  const [recording, setRecording] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const checkId = useId();

  async function handleSubmit(event) {
    event.preventDefault();
    if (!agreed || !recording) return;
    setSaving(true);
    setError('');
    try {
      onSaved(await saveConsultationConsent(token, recording));
    } catch (err) {
      setError(err.message || 'Não foi possível guardar sua resposta. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="oc-consent" onSubmit={handleSubmit}>
      <header className="cf-head">
        <ClinicLine name={view.clinicName} />
        <h1>Antes da primeira consulta online</h1>
        <p className="cf-note">Leia e escolha. Leva um minuto.</p>
      </header>

      <section className="oc-section" aria-labelledby={`${checkId}-tele`}>
        <div className="oc-section-head">
          <h2 id={`${checkId}-tele`}>{TELECONSULTATION_TERM.title}</h2>
          <span className="oc-tag">Obrigatório</span>
        </div>
        <ul className="oc-bullets">
          {TELECONSULTATION_TERM.summary.map(line => <li key={line}>{line}</li>)}
        </ul>
        <label className="oc-check" htmlFor={checkId}>
          <input id={checkId} type="checkbox" checked={agreed} onChange={event => setAgreed(event.target.checked)} />
          Li e concordo com o atendimento online
        </label>
        <details className="oc-term">
          <summary>Ler o termo completo</summary>
          {TELECONSULTATION_TERM.paragraphs.map(text => <p key={text}>{text}</p>)}
        </details>
      </section>

      <section className="oc-section">
        <fieldset className="oc-choice">
          <legend>{RECORDING_TERM.question}</legend>
          <div className="oc-choice-options">
            <label className={`oc-option${recording === 'accepted' ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="gravacao"
                value="accepted"
                checked={recording === 'accepted'}
                onChange={() => setRecording('accepted')}
              />
              Autorizo
            </label>
            <label className={`oc-option${recording === 'declined' ? ' is-on' : ''}`}>
              <input
                type="radio"
                name="gravacao"
                value="declined"
                checked={recording === 'declined'}
                onChange={() => setRecording('declined')}
              />
              Não autorizo
            </label>
          </div>
        </fieldset>
        <details className="oc-term">
          <summary>Ler o termo de gravação</summary>
          {RECORDING_TERM.paragraphs.map(text => <p key={text}>{text}</p>)}
        </details>
      </section>

      {error && <div className="cf-error" role="alert">{error}</div>}

      <button type="submit" className="cf-submit" disabled={!agreed || !recording || saving} aria-busy={saving}>
        {saving ? <><span className="cf-spinner cf-spinner--on-accent" aria-hidden="true" />Guardando…</> : 'Continuar'}
      </button>
      <p className="oc-small">Sua escolha fica registrada com a data e a versão do termo.</p>
    </form>
  );
}

// ---------------------------------------------------------------
// Entrada (prévia A): câmera, som e "Entrar na consulta"
// ---------------------------------------------------------------

function useCameraPreview(active) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) return undefined;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {
        if (!cancelled) setProblem('Libere a câmera e o microfone para este site nas permissões do navegador.');
      });
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, [active]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = micOn; });
  }, [micOn]);

  useEffect(() => {
    streamRef.current?.getVideoTracks().forEach(track => { track.enabled = camOn; });
  }, [camOn]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
  }, []);

  return { videoRef, micOn, setMicOn, camOn, setCamOn, problem, stop };
}

function EntryStep({
  view,
  now,
  joining,
  joinError,
  onJoin,
  videoRef,
  micOn,
  camOn,
  onToggleMic,
  onToggleCam,
  problem,
}) {
  const when = describeAppointmentWhen(view.startsAt, view.endsAt, new Date(now));
  const opensAt = Date.parse(view.opensAt);
  const closesAt = Date.parse(view.closesAt);
  const early = Number.isFinite(opensAt) && now < opensAt;
  const ended = Number.isFinite(closesAt) && now > closesAt;

  return (
    <>
      <header className="cf-head">
        <ClinicLine name={view.clinicName} withIcon />
        <h1>Sua consulta online</h1>
        <p className="cf-note">Confira a câmera e o som e toque em “Entrar na consulta”.</p>
      </header>

      <PublicWhenBlock when={when} />

      <ul className="cf-details">
        <li className="cf-detail">
          <span className="cf-detail-icon"><IconStethoscope /></span>
          <div className="cf-detail-text">
            <span className="cf-detail-label">Profissional</span>
            <span className="cf-detail-value">{view.professionalName}</span>
          </div>
        </li>
        <li className="cf-detail">
          <span className="cf-detail-icon"><IconVideo width="18" height="18" /></span>
          <div className="cf-detail-text">
            <span className="cf-detail-label">Atendimento</span>
            <span className="cf-detail-value">Online</span>
          </div>
        </li>
      </ul>

      <section className="oc-preview-block" aria-label="Sua câmera">
        <div className="oc-preview">
          <video ref={videoRef} autoPlay playsInline muted className={camOn ? '' : 'is-off'} />
          {!camOn && <span className="oc-preview-off"><IconCamera />Câmera desligada</span>}
          <span className="oc-preview-label">Sua câmera</span>
        </div>
        {problem && <p className="oc-problem" role="status">{problem}</p>}
        <div className="oc-toggles">
          <button type="button" className="oc-toggle" aria-pressed={micOn} onClick={onToggleMic}>
            <IconMic />{micOn ? 'Microfone ligado' : 'Microfone desligado'}
          </button>
          <button type="button" className="oc-toggle" aria-pressed={camOn} onClick={onToggleCam}>
            <IconCamera />{camOn ? 'Câmera ligada' : 'Câmera desligada'}
          </button>
        </div>
      </section>

      {joinError && <div className="cf-error" role="alert">{joinError}</div>}

      <button type="button" className="cf-submit" onClick={onJoin} disabled={early || ended || joining} aria-busy={joining}>
        {joining ? <><span className="cf-spinner cf-spinner--on-accent" aria-hidden="true" />Entrando…</> : 'Entrar na consulta'}
      </button>
      {early && (
        <p className="oc-small">
          A sala abre às {formatClock(opensAt)}, {ONLINE_ROOM_WINDOWS.patient.beforeMinutes} minutos antes do horário.
        </p>
      )}
      {ended && <p className="oc-small">O horário desta consulta já passou.</p>}
      {!early && !ended && <p className="oc-small">Se a ligação cair, abra este mesmo link de novo.</p>}
    </>
  );
}

// ---------------------------------------------------------------
// Página
// ---------------------------------------------------------------

export function OnlineConsultationPage() {
  const [token] = useState(getTokenFromUrl);
  // loading | invalid | unavailable | closed | ended | consent | entry | call | left
  const [phase, setPhase] = useState(() => (getTokenFromUrl() ? 'loading' : 'invalid'));
  const [view, setView] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const callRef = useRef(null);
  const frameRef = useRef(null);
  const {
    videoRef,
    micOn,
    setMicOn,
    camOn,
    setCamOn,
    problem: previewProblem,
    stop: stopPreview,
  } = useCameraPreview(phase === 'entry');

  const applyView = useCallback((data) => {
    setView(data);
    if (['invalid', 'unavailable', 'closed', 'ended'].includes(data.state)) {
      setPhase(data.state);
      return;
    }
    setPhase(data.needsConsent ? 'consent' : 'entry');
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;
    openConsultation(token)
      .then(data => { if (!cancelled) applyView(data); })
      .catch(() => { if (!cancelled) setPhase('invalid'); });
    return () => { cancelled = true; };
  }, [token, applyView]);

  // Relógio da tela: o botão acende sozinho quando a sala abre.
  useEffect(() => {
    if (phase !== 'entry') return undefined;
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [phase]);

  useEffect(() => () => {
    frameRef.current?.destroy();
    frameRef.current = null;
  }, []);

  async function handleJoin() {
    setJoining(true);
    setJoinError('');
    // Erro que o Daily manda pelo evento 'error' (ex.: conta sem forma de
    // pagamento): sem ouvir o evento, a tela só dizia "Tente de novo".
    let dailyError = '';
    let joined = false;
    try {
      const invite = await joinConsultation(token);
      const { default: DailyIframe } = await import('@daily-co/daily-js');
      stopPreview();
      // A sala pronta do Daily ocupa a tela; a cor é a do link da clínica.
      // flushSync: o contêiner da sala precisa existir antes do createFrame.
      flushSync(() => setPhase('call'));
      const accent = dailyAccent(view?.clinicColor);
      const frame = DailyIframe.createFrame(callRef.current, {
        iframeStyle: { width: '100%', height: '100%', border: '0' },
        showLeaveButton: true,
        showFullscreenButton: true,
        lang: 'pt-BR',
        theme: {
          colors: {
            accent,
            accentText: '#FFFFFF',
            background: '#0B1614',
            backgroundAccent: '#132321',
            baseText: '#FFFFFF',
            border: '#2B423E',
            mainAreaBg: '#0B1614',
            mainAreaBgAccent: '#132321',
            mainAreaText: '#FFFFFF',
            supportiveText: '#CDD8D7',
          },
        },
      });
      frameRef.current = frame;
      frame.on('left-meeting', () => {
        frame.destroy();
        frameRef.current = null;
        setNow(Date.now());
        setPhase('left');
      });
      frame.on('error', event => {
        dailyError = event?.errorMsg || 'error';
        if (!joined) return;
        frame.destroy();
        frameRef.current = null;
        setPhase('entry');
        setJoinError(dailyErrorMessage(dailyError, 'patient'));
      });
      await frame.join({ url: invite.roomUrl, token: invite.token, startVideoOff: !camOn, startAudioOff: !micOn });
      joined = true;
    } catch (err) {
      frameRef.current?.destroy();
      frameRef.current = null;
      if (err?.needsConsent) {
        setPhase('consent');
      } else {
        setPhase('entry');
        setJoinError(dailyError || err?.errorMsg
          ? dailyErrorMessage(dailyError || err.errorMsg, 'patient')
          : err?.message || 'Não foi possível entrar agora. Tente de novo.');
      }
    } finally {
      setJoining(false);
    }
  }

  const accentStyle = clinicAccentStyle(view?.clinicColor) || undefined;
  const clinic = view?.clinicName || 'a clínica';
  const stillOpen = view && Date.parse(view.closesAt) > now;

  if (phase === 'call') {
    return <div className="oc-call" ref={callRef} style={accentStyle} />;
  }

  return (
    <div className="cf-page" style={accentStyle}>
      <main className="cf-card" aria-busy={phase === 'loading'}>
        {phase === 'loading' && <PublicLoading>Carregando sua consulta…</PublicLoading>}

        {phase === 'invalid' && (
          <PublicStateMessage tone="neutral" icon={<IconLinkOff />} title="Link indisponível">
            Este link é inválido. Se você recebeu um link novo, confira se copiou o endereço completo.
          </PublicStateMessage>
        )}

        {phase === 'unavailable' && (
          <PublicStateMessage tone="neutral" icon={<IconCalendarOff />} title="Consulta sem sala online">
            Esta consulta não acontece pela sala do sistema. Se tiver dúvida, fale com {clinic}.
          </PublicStateMessage>
        )}

        {phase === 'closed' && (
          <PublicStateMessage tone="neutral" icon={<IconCalendarOff />} title="Consulta não disponível">
            Este agendamento não está mais aberto. Se precisar remarcar, fale com {clinic}.
          </PublicStateMessage>
        )}

        {phase === 'ended' && (
          <PublicStateMessage tone="neutral" icon={<IconCalendarOff />} title="Consulta encerrada">
            O horário desta consulta já passou. Se precisar, fale com {clinic}.
          </PublicStateMessage>
        )}

        {phase === 'consent' && view && (
          <ConsentStep view={view} token={token} onSaved={data => applyView(data)} />
        )}

        {phase === 'entry' && view && (
          <EntryStep
            view={view}
            now={now}
            joining={joining}
            joinError={joinError}
            onJoin={handleJoin}
            videoRef={videoRef}
            micOn={micOn}
            camOn={camOn}
            onToggleMic={() => setMicOn(on => !on)}
            onToggleCam={() => setCamOn(on => !on)}
            problem={previewProblem}
          />
        )}

        {phase === 'left' && (
          <div className="cf-state">
            <span className="cf-state-icon"><IconVideo width="26" height="26" /></span>
            <h1>Você saiu da consulta</h1>
            <p className="cf-note">
              {stillOpen ? 'Se saiu sem querer, dá para entrar de novo.' : 'Obrigado! Até a próxima.'}
            </p>
            {stillOpen && (
              <button type="button" className="cf-submit oc-again" onClick={() => setPhase('entry')}>
                Entrar de novo
              </button>
            )}
          </div>
        )}
      </main>

      {(phase === 'entry' || phase === 'consent') && (
        <p className="cf-foot">Este link é pessoal: mostra só o seu agendamento.</p>
      )}
    </div>
  );
}

export default OnlineConsultationPage;
