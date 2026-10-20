import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';
import { useDailyCall } from '../../hooks/useDailyCall';
import { ScreenHelp } from '../ui/ScreenHelp';
import { SALA_ONLINE_HELP } from '../../data/screenHelp';
import { getDiscipline } from '../../data/disciplines';
import {
  loadBeforeSession,
  loadPatientLinkInfo,
  joinOnlineRoom,
  openOnlineRoom,
} from '../../services/onlineConsultationService';
import { updateAppointmentStatus } from '../../services/appointmentService';
import { shortName } from '../../services/clinicMembersService';
import { buildWhatsAppLink, isLikelyValidWhatsAppPhone } from '../../utils/whatsapp';
import { requestAppScreen } from '../../utils/appNavigationBridge';
import { formatInstrumentDate } from '../instruments/instrumentFormat';
import {
  formatClock,
  onlineConsultationHref,
  ONLINE_ROOM_WINDOWS,
  recordingConsentLabel,
  teleconsentLabel,
} from '../../utils/onlineConsultation';
import '../../styles/onlineRoom.css';

// ============================================================
// Sala online de quem atende (/sala-online?agendamento=…), prévia C
// escolhida em 20/10/2026: "Antes da sessão" à esquerda, o vídeo no
// meio e, à direita, gravação, link do paciente e "Ao encerrar". No
// celular e no tablet, uma coluna: vídeo, "Antes da sessão" e o resto.
//
// Abre em aba própria (só aqui o navegador libera câmera e microfone).
// A evolução continua só na tela Evoluções: daqui, "Ir para Evoluções"
// abre a tela na aba do sistema (utils/appNavigationBridge.js).
// Quem entra é decidido pela Edge Function online-consultation.
// ============================================================

function appointmentIdFromUrl() {
  return new URLSearchParams(window.location.search).get('agendamento') || '';
}

function Icon({ name }) {
  const paths = {
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    micOff: <><path d="m3 3 18 18" /><path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3" /><path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.7M12 18v3" /></>,
    camera: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
    cameraOff: <><path d="m3 3 18 18" /><path d="M16 16H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1M10 6h4a2 2 0 0 1 2 2v3l5-3v9" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
  };
  return (
    <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

function TrackVideo({ track, mirror = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.muted = true;
    element.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  return <video ref={ref} autoPlay playsInline muted className={`${className}${mirror ? ' is-mirror' : ''}`} />;
}

function TrackAudio({ track }) {
  const ref = useRef(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.srcObject = track ? new MediaStream([track]) : null;
  }, [track]);
  return <audio ref={ref} autoPlay />;
}

// ---------------------------------------------------------------
// Antes da sessão
// ---------------------------------------------------------------

function BeforeSession({ data, patient, openScreen }) {
  const openScales = () => openScreen({ screen: 'escalas', patientId: patient.id, patientName: patient.name });
  const openEvolutions = () => openScreen({ screen: 'evolucao' });

  return (
    <aside className="osr-before" aria-labelledby="osr-before-title">
      <h2 id="osr-before-title">Antes da sessão</h2>

      <div className="osr-block">
        <span className="osr-label">Última evolução</span>
        {!data ? (
          <p className="osr-muted">Carregando…</p>
        ) : data.lastEvolution.error ? (
          <p className="osr-muted">— Não deu para carregar.</p>
        ) : (
          <p className="osr-value">
            {data.lastEvolution.at ? formatInstrumentDate(data.lastEvolution.at) : 'Nenhuma ainda'}
          </p>
        )}
      </div>

      <div className="osr-block">
        <span className="osr-label">{data?.lastEvolution?.at ? 'Escalas desde então' : 'Escalas'}</span>
        {!data ? (
          <p className="osr-muted">Carregando…</p>
        ) : data.scales.error ? (
          <p className="osr-muted">— Não deu para carregar as escalas.</p>
        ) : data.scales.rows.length === 0 ? (
          <p className="osr-muted">
            {data.lastEvolution.at ? 'Nenhuma escala nova desde a última evolução.' : 'Nenhuma escala aplicada ainda.'}
          </p>
        ) : (
          <ul className="osr-scales">
            {data.scales.rows.map(row => (
              <li key={row.id}>
                <button type="button" className="osr-scale" onClick={openScales} title={row.trendLabel || undefined}>
                  <span className="osr-scale-name"><b>{row.name}</b><small>{row.when}</small></span>
                  <span className="osr-scale-score">
                    <b>{row.score}{row.bandLabel ? ` · ${row.bandLabel}` : ''}</b>
                    {row.trend && <small>{row.trend}</small>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="osr-block">
        <span className="osr-label">Pede atenção</span>
        {!data ? (
          <p className="osr-muted">Carregando…</p>
        ) : data.attention.error ? (
          <p className="osr-warn" role="status">Não deu para conferir os alertas de risco. Confira na tela Escalas.</p>
        ) : data.attention.rows.length === 0 ? (
          <p className="osr-muted">Nada pedindo atenção agora.</p>
        ) : (
          <ul className="osr-attention">
            {data.attention.rows.map(row => (
              <li key={row.id}>
                <button type="button" className="osr-attention-item" onClick={openScales}>
                  <span className="osr-dot osr-dot--risk" aria-hidden="true" />
                  {row.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="osr-shortcuts">
        <button type="button" className="osr-shortcut" onClick={openScales}>Ver escalas<span aria-hidden="true">→</span></button>
        <button type="button" className="osr-shortcut" onClick={openEvolutions}>Evoluções anteriores<span aria-hidden="true">→</span></button>
      </div>
      <p className="osr-hint">Os atalhos abrem a tela na aba do sistema.</p>
    </aside>
  );
}

// ---------------------------------------------------------------
// Vídeo
// ---------------------------------------------------------------

function VideoStage({ call, patientName, windowState, opensAt, onJoin, joining }) {
  const remote = call.remotes[0] || null;
  const mainTrack = remote?.screen || remote?.video || null;
  const localTrack = call.local?.screen || call.local?.video || null;
  const firstName = String(patientName || '').split(' ')[0] || 'o paciente';

  if (call.phase !== 'joined') {
    return (
      <section className="osr-stage osr-stage--idle" aria-label="Vídeo">
        <div className="osr-stage-center">
          <span className="osr-avatar osr-avatar--big">{initials(patientName)}</span>
          {call.phase === 'left' && <p className="osr-stage-text">Você saiu da sala.</p>}
          {call.error && <p className="osr-stage-text" role="alert">{call.error}</p>}
          {windowState === 'early' && (
            <p className="osr-stage-text">
              A sala abre às {formatClock(opensAt)}, {ONLINE_ROOM_WINDOWS.professional.beforeMinutes} minutos antes do horário.
            </p>
          )}
          {windowState === 'ended' && <p className="osr-stage-text">O horário desta consulta já passou.</p>}
          <button
            type="button"
            className="osr-join"
            onClick={onJoin}
            disabled={windowState !== 'open' || joining}
            aria-busy={joining}
          >
            <Icon name="video" />
            {joining ? 'Entrando…' : call.phase === 'left' ? 'Entrar de novo' : 'Entrar na sala'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="osr-stage" aria-label="Vídeo">
      {call.remotes.map(item => item.audio && <TrackAudio key={item.sessionId} track={item.audio} />)}
      <div className="osr-stage-main">
        {mainTrack ? (
          <TrackVideo track={mainTrack} className="osr-video" />
        ) : (
          <div className="osr-stage-center">
            <span className="osr-avatar osr-avatar--big">{initials(patientName)}</span>
            <p className="osr-stage-text">
              {remote ? `${firstName} está com a câmera desligada.` : `Aguardando ${firstName} entrar…`}
            </p>
          </div>
        )}
        {remote && <span className="osr-name">{patientName}{!remote.micOn ? ' · microfone desligado' : ''}</span>}
      </div>
      <div className="osr-self">
        {localTrack ? <TrackVideo track={localTrack} mirror={!call.local?.screen} className="osr-video" /> : <span className="osr-avatar">Você</span>}
        <span className="osr-self-label">Você</span>
      </div>
      <div className="osr-controls">
        <button type="button" className={`osr-control${call.micOn ? '' : ' is-off'}`} aria-pressed={call.micOn} aria-label={call.micOn ? 'Desligar microfone' : 'Ligar microfone'} onClick={call.toggleMic}>
          <Icon name={call.micOn ? 'mic' : 'micOff'} />
        </button>
        <button type="button" className={`osr-control${call.camOn ? '' : ' is-off'}`} aria-pressed={call.camOn} aria-label={call.camOn ? 'Desligar câmera' : 'Ligar câmera'} onClick={call.toggleCam}>
          <Icon name={call.camOn ? 'camera' : 'cameraOff'} />
        </button>
        <button type="button" className={`osr-control${call.sharing ? ' is-on' : ''}`} aria-pressed={call.sharing} aria-label={call.sharing ? 'Parar de compartilhar a tela' : 'Compartilhar tela'} onClick={call.toggleShare}>
          <Icon name="screen" />
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Coluna da direita
// ---------------------------------------------------------------

function RecordingCard({ info }) {
  return (
    <section className="osr-card" aria-labelledby="osr-rec-title">
      <div className="osr-card-head">
        <h2 id="osr-rec-title">Gravação</h2>
        <span className="osr-chip">Em breve</span>
      </div>
      <p className="osr-line">{teleconsentLabel(info.consents?.teleatendimento, info.needsConsent)}</p>
      <p className="osr-line">{recordingConsentLabel(info.consents?.gravacao_sessao)}</p>
      <p className="osr-muted">A gravação com transcrição chega na próxima etapa. Por enquanto, nada desta sala é gravado.</p>
    </section>
  );
}

function PatientLinkCard({ appointmentId, info, professionalName }) {
  const [link, setLink] = useState({ token: '', phone: '' });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPatientLinkInfo(appointmentId, info.patient.id)
      .then(result => { if (!cancelled) setLink(result); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [appointmentId, info.patient.id]);

  const href = link.token ? onlineConsultationHref(link.token) : '';
  const firstName = String(info.patient.name || '').split(' ')[0];
  const message = href
    ? `Olá, ${firstName}! Sua consulta online com ${professionalName} é às ${formatClock(info.startsAt)}. Entre por aqui: ${href}`
    : '';
  const whatsapp = href && isLikelyValidWhatsAppPhone(link.phone) ? buildWhatsAppLink({ phone: link.phone, message }) : '';

  async function copy() {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="osr-card" aria-labelledby="osr-link-title">
      <h2 id="osr-link-title">Link do paciente</h2>
      <p className="osr-muted">É o mesmo link da confirmação: no horário, ele leva para a sala.</p>
      <div className="osr-row">
        <button type="button" className="osr-btn" onClick={copy} disabled={!href}>{copied ? 'Link copiado' : 'Copiar link'}</button>
        {whatsapp ? (
          <a className="osr-btn" href={whatsapp} target="_blank" rel="noopener noreferrer">Enviar no WhatsApp</a>
        ) : (
          <button type="button" className="osr-btn" disabled title="Cadastro sem telefone válido">Enviar no WhatsApp</button>
        )}
      </div>
    </section>
  );
}

function FinishCard({ appointmentId, status, onStatus, openScreen }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const attended = status === 'attended';

  async function markAttended() {
    setSaving(true);
    setError('');
    try {
      const updated = await updateAppointmentStatus(appointmentId, 'attended');
      onStatus(updated?.status || 'attended');
    } catch (err) {
      setError(err.message || 'Não foi possível marcar como Atendido.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="osr-card" aria-labelledby="osr-finish-title">
      <h2 id="osr-finish-title">Ao encerrar</h2>
      <p className="osr-muted">Marque o status e escreva a evolução na tela Evoluções.</p>
      {error && <p className="osr-warn" role="alert">{error}</p>}
      <div className="osr-row">
        <button type="button" className="osr-btn osr-btn--accent" onClick={markAttended} disabled={attended || saving} aria-busy={saving}>
          {attended ? 'Atendido ✓' : saving ? 'Marcando…' : 'Marcar como Atendido'}
        </button>
        <button type="button" className="osr-link" onClick={() => openScreen({ screen: 'evolucao' })}>
          Ir para Evoluções →
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Sala
// ---------------------------------------------------------------

function OnlineRoom({ appointmentId, profile }) {
  const [info, setInfo] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [before, setBefore] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [joining, setJoining] = useState(false);
  const [navNote, setNavNote] = useState('');
  const call = useDailyCall();
  const { join, leave } = call;

  // Os atalhos abrem a tela na aba do sistema; o aviso diz onde foi parar.
  const openScreen = useCallback(async request => {
    const result = await requestAppScreen(request);
    setNavNote(result === 'existing'
      ? 'Aberto na aba do sistema.'
      : result === 'new-tab' ? 'O sistema abriu numa aba nova.' : '');
    setTimeout(() => setNavNote(''), 4000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    openOnlineRoom(appointmentId)
      .then(data => { if (!cancelled) setInfo(data); })
      .catch(err => { if (!cancelled) setLoadError(err.message || 'Não foi possível abrir a sala.'); });
    return () => { cancelled = true; };
  }, [appointmentId]);

  useEffect(() => {
    if (!info?.patient?.id || !profile?.id) return undefined;
    let cancelled = false;
    loadBeforeSession({ patientId: info.patient.id, professionalId: profile.id })
      .then(data => { if (!cancelled) setBefore(data); });
    return () => { cancelled = true; };
  }, [info?.patient?.id, profile?.id]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  const handleJoin = useCallback(async () => {
    setJoining(true);
    setInfo(previous => previous && { ...previous, joinError: '' });
    try {
      const invite = await joinOnlineRoom(appointmentId);
      await join({ url: invite.roomUrl, token: invite.token });
    } catch (err) {
      setInfo(previous => previous && { ...previous, joinError: err.message || 'Não foi possível entrar na sala.' });
    } finally {
      setJoining(false);
    }
  }, [appointmentId, join]);

  // Fechar a aba no meio da consulta também sai da sala.
  useEffect(() => {
    const onUnload = () => { leave(); };
    window.addEventListener('pagehide', onUnload);
    return () => window.removeEventListener('pagehide', onUnload);
  }, [leave]);

  if (loadError) {
    return <RoomMessage title="Sala indisponível">{loadError}</RoomMessage>;
  }
  if (!info) {
    return <RoomMessage title="Abrindo a sala…" />;
  }
  if (info.state === 'unavailable') {
    return (
      <RoomMessage title="Este atendimento não tem sala online">
        A sala do sistema é para atendimento online da Psicologia, com &quot;Atendimento online pela sala do sistema&quot;
        ligado em Configurar agenda.
      </RoomMessage>
    );
  }
  if (info.state === 'closed') {
    return (
      <RoomMessage title="Atendimento fechado">
        Este atendimento está como cancelado ou não compareceu na Agenda.
      </RoomMessage>
    );
  }

  const opensAt = Date.parse(info.opensAt);
  const closesAt = Date.parse(info.closesAt);
  const windowState = now < opensAt ? 'early' : now > closesAt ? 'ended' : 'open';
  const discipline = getDiscipline('psicologia');
  const professionalName = shortName(profile?.full_name);

  return (
    <div className="osr-page">
      <header className="osr-head">
        <div className="osr-head-title">
          <p className="osr-eyebrow">
            <span className="osr-dot" style={{ background: discipline?.color }} aria-hidden="true" />
            {info.clinicName ? `${info.clinicName} · ` : ''}Psicologia
          </p>
          <h1>Consulta online · {info.patient.name}</h1>
        </div>
        <div className="osr-head-side">
          <span className="osr-chip osr-chip--online"><Icon name="video" />Online</span>
          <span className="osr-clock">
            <small>{call.joinedAt ? `Começou às ${formatClock(call.joinedAt)}` : `Horário ${formatClock(info.startsAt)} às ${formatClock(info.endsAt)}`}</small>
            <b>{formatClock(now)}</b>
          </span>
          <ScreenHelp topic={SALA_ONLINE_HELP} />
          {call.phase === 'joined' && (
            <button type="button" className="osr-btn osr-btn--end" onClick={leave}>Encerrar consulta</button>
          )}
        </div>
      </header>

      {info.joinError && <p className="osr-warn" role="alert">{info.joinError}</p>}
      <p className="osr-nav-note" role="status">{navNote}</p>

      <div className="osr-grid">
        <VideoStage
          call={call}
          patientName={info.patient.name}
          windowState={windowState}
          opensAt={opensAt}
          onJoin={handleJoin}
          joining={joining || call.phase === 'joining'}
        />
        <BeforeSession data={before} patient={info.patient} openScreen={openScreen} />
        <div className="osr-side">
          <RecordingCard info={info} />
          <PatientLinkCard appointmentId={appointmentId} info={info} professionalName={professionalName} />
          <FinishCard
            appointmentId={appointmentId}
            status={info.status}
            onStatus={status => setInfo(previous => ({ ...previous, status }))}
            openScreen={openScreen}
          />
        </div>
      </div>
    </div>
  );
}

function RoomMessage({ title, children, action = null }) {
  return (
    <div className="osr-page osr-page--message">
      <main className="osr-message">
        <h1>{title}</h1>
        {children && <p>{children}</p>}
        {action}
        <a className="osr-link" href="/">Abrir o sistema</a>
      </main>
    </div>
  );
}

export function OnlineRoomPage() {
  const { user, profile, loading, mustChangePassword, needsMfa } = useAuth();
  const [appointmentId] = useState(appointmentIdFromUrl);

  if (loading) return <RoomMessage title="Abrindo a sala…" />;
  if (!user) {
    return (
      <RoomMessage title="Entre no sistema">
        A sala online é só para quem atende. Entre no sistema nesta mesma janela e abra a sala de novo pela Agenda.
      </RoomMessage>
    );
  }
  if (mustChangePassword || needsMfa) {
    return (
      <RoomMessage title="Termine o acesso">
        Antes de abrir a sala, conclua a troca de senha ou a verificação em duas etapas no sistema.
      </RoomMessage>
    );
  }
  if (!/^[0-9a-f-]{36}$/i.test(appointmentId)) {
    return <RoomMessage title="Sala indisponível">O endereço da sala está incompleto. Abra de novo pela Agenda.</RoomMessage>;
  }
  return <OnlineRoom appointmentId={appointmentId} profile={profile} />;
}

export default OnlineRoomPage;
