import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';
import { useDailyCall } from '../../hooks/useDailyCall';
import { useDismiss } from '../../hooks/useDismiss';
import { ScreenHelp } from '../ui/ScreenHelp';
import { SALA_ONLINE_HELP } from '../../data/screenHelp';
import { getDiscipline } from '../../data/disciplines';
import {
  loadBeforeSession,
  loadDailyUsage,
  loadPatientLinkInfo,
  loadSessionEvolutions,
  joinOnlineRoom,
  openOnlineRoom,
} from '../../services/onlineConsultationService';
import { updateAppointmentStatus } from '../../services/appointmentService';
import { shortName } from '../../services/clinicMembersService';
import { buildWhatsAppLink, isLikelyValidWhatsAppPhone } from '../../utils/whatsapp';
import { requestAppScreen } from '../../utils/appNavigationBridge';
import { formatInstrumentDate } from '../instruments/instrumentFormat';
import { InstrumentApplicationDialog } from '../instruments/InstrumentApplicationDialog';
import { sparkPoints } from '../../utils/beforeSession';
import {
  CONSULT_MINUTES,
  CONSULT_PARTICIPANT_MINUTES,
  consentRows,
  DAILY_DASHBOARD_URL,
  formatClock,
  formatMinutes,
  onlineConsultationHref,
  ONLINE_ROOM_WINDOWS,
  usageSummary,
} from '../../utils/onlineConsultation';
import '../../styles/instruments.css';
import '../../styles/onlineRoom.css';

// ============================================================
// Sala online de quem atende (/sala-online?agendamento=…), prévia C
// escolhida em 20/10/2026 e abas da prévia A de 21/10/2026: consulta
// rápida à esquerda (Resumo, Escalas e Evoluções, abertas ali mesmo), o
// vídeo no meio e, à direita, gravação, link do paciente, "Ao encerrar"
// e os minutos do mês no Daily. No celular e no tablet, uma coluna:
// vídeo, consulta rápida e o resto.
//
// Abre em aba própria (só aqui o navegador libera câmera e microfone).
// A evolução continua só na tela Evoluções: aqui ela é só leitura, e
// "Escrever a evolução" abre a tela na aba do sistema
// (utils/appNavigationBridge.js). Quem entra é decidido pela Edge
// Function online-consultation.
// ============================================================

function appointmentIdFromUrl() {
  return new URLSearchParams(window.location.search).get('agendamento') || '';
}

function Icon({ name, size = 19 }) {
  const paths = {
    mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
    micOff: <><path d="m3 3 18 18" /><path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.3V6a3 3 0 0 0-5.7-1.3" /><path d="M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.7M12 18v3" /></>,
    camera: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
    cameraOff: <><path d="m3 3 18 18" /><path d="M16 16H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1M10 6h4a2 2 0 0 1 2 2v3l5-3v9" /></>,
    screen: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>,
    expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
    collapse: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
    video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="m16 10 5-3v10l-5-3" /></>,
    link: <><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>,
    flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
    gauge: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 18 4-6" /></>,
    check: <path d="M20 6 9 17l-5-5" />,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={name === 'check' ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
// Consulta rápida (esquerda): Resumo, Escalas e Evoluções
// ---------------------------------------------------------------

const PANEL_TABS = ['resumo', 'escalas', 'evolucoes'];

function SummaryTab({ data, onTab, openScales }) {
  return (
    <>
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
                <button type="button" className="osr-scale" onClick={() => onTab('escalas')} title={row.trendLabel || undefined}>
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
                <button type="button" className="osr-attention-item" onClick={openScales} title="Abre a tela Escalas na aba do sistema">
                  <span className="osr-dot osr-dot--risk" aria-hidden="true" />
                  {row.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="osr-shortcuts">
        <button type="button" className="osr-shortcut" onClick={() => onTab('escalas')}>Ver escalas<span aria-hidden="true">→</span></button>
        <button type="button" className="osr-shortcut" onClick={() => onTab('evolucoes')}>Evoluções anteriores<span aria-hidden="true">→</span></button>
      </div>
    </>
  );
}

function ReappliedDates({ card }) {
  if (!card.reapplied.length) return null;
  return (
    <>
      {' · Reaplicada em '}
      {card.reapplied.map((date, index) => (
        <span key={`${date}-${index}`}>{index > 0 ? ', ' : ''}<b>{date}</b></span>
      ))}
      {card.hiddenReapplied > 0 ? ` (+${card.hiddenReapplied} antes)` : ''}
    </>
  );
}

function ScalesTab({ data, onOpen }) {
  if (!data) return <p className="osr-muted">Carregando…</p>;
  if (data.scales.error) return <p className="osr-muted">— Não deu para carregar as escalas.</p>;
  if (!data.scales.cards.length) return <p className="osr-muted">Nenhuma escala aplicada ainda.</p>;
  return (
    <ul className="osr-scale-cards">
      {data.scales.cards.map((card, index) => {
        const points = sparkPoints(card.spark);
        return (
          <li key={card.id}>
            <article className={`osr-scale-card${index === 0 ? ' is-latest' : ''}`}>
              <div className="osr-scale-card-head">
                <b className="osr-scale-card-name">{card.name}</b>
                {card.total && (
                  <span className="osr-scale-card-score">
                    <b>{card.total.text}</b>
                    {card.total.bandLabel && <span className="osr-band">{card.total.bandLabel}</span>}
                    {card.trend && <small title={card.trendLabel || undefined}>{card.trend}</small>}
                  </span>
                )}
              </div>
              {card.parts.length > 0 && (
                <ul className="osr-scale-parts">
                  {card.parts.map(part => (
                    <li key={part.id}>
                      <span>{part.label}</span>
                      <b>{part.text}</b>
                      {part.bandLabel && <span className="osr-band">{part.bandLabel}</span>}
                    </li>
                  ))}
                </ul>
              )}
              {points && (
                <svg className="osr-spark" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={points} vectorEffect="non-scaling-stroke" />
                </svg>
              )}
              <ul className="osr-scale-meta">
                <li>Aplicada em <b>{card.first}</b><ReappliedDates card={card} /></li>
                <li>{card.count === 1 ? '1 aplicação' : `${card.count} aplicações`}{card.source ? ` · ${card.source}` : ''}</li>
                {card.noBands && <li className="osr-scale-meta-note">Sem faixas clínicas: compare com as aplicações anteriores.</li>}
                <li className={card.reapplyFrom ? '' : 'is-ready'}>
                  {card.reapplyFrom ? <>Reaplicar a partir de <b>{card.reapplyFrom}</b></> : 'Já pode reaplicar'}
                </li>
              </ul>
              <button type="button" className="osr-answers-btn" onClick={() => onOpen(card.entries[0])}>
                Ver perguntas e respostas<span aria-hidden="true">→</span>
              </button>
              {card.entries.length > 1 && (
                <div className="osr-older">
                  <span>Outras aplicações:</span>
                  {card.entries.slice(1).map(entry => (
                    <button
                      key={entry.application.id}
                      type="button"
                      className="osr-older-btn"
                      onClick={() => onOpen(entry)}
                      aria-label={`Ver as respostas de ${entry.date}`}
                    >
                      {entry.date}
                    </button>
                  ))}
                </div>
              )}
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function EvolutionsTab({ evolutions }) {
  // null = a mais nova aberta; '' = todas fechadas.
  const [openId, setOpenId] = useState(null);
  if (!evolutions) return <p className="osr-muted">Carregando…</p>;
  if (evolutions.error) return <p className="osr-muted">— Não deu para carregar as evoluções aqui. Veja na tela Evoluções.</p>;
  if (!evolutions.rows.length) return <p className="osr-muted">Nenhuma evolução registrada ainda.</p>;
  const current = openId ?? evolutions.rows[0].id;
  return (
    <>
      <ul className="osr-evolutions">
        {evolutions.rows.map(entry => {
          const open = entry.id === current;
          const fields = entry.absent
            ? [{ key: 'observacao', label: 'Observação', value: entry.note || 'Sem observação.' }]
            : entry.fields;
          return (
            <li key={entry.id}>
              <article className={`osr-evolution${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="osr-evolution-head"
                  aria-expanded={open}
                  onClick={() => setOpenId(open ? '' : entry.id)}
                >
                  <span className="osr-evolution-title"><b>{entry.date}</b><small>{entry.status}</small></span>
                  <span className="osr-chevron" aria-hidden="true">›</span>
                </button>
                {open && (fields.length ? (
                  <dl className="osr-evolution-body">
                    {fields.map(field => (
                      <div key={field.key}>
                        <dt>{field.label}</dt>
                        <dd>{field.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="osr-muted osr-evolution-body">Sem texto registrado.</p>
                ))}
              </article>
            </li>
          );
        })}
      </ul>
      <p className="osr-hint">Só leitura. Corrigir e escrever continuam na tela Evoluções.</p>
    </>
  );
}

function QuickPanel({ data, evolutions, patient, openScreen }) {
  const [tab, setTab] = useState('resumo');
  // Aplicação aberta na janela de respostas (a mesma da tela Escalas, só leitura).
  const [opened, setOpened] = useState(null);
  const tabRefs = useRef({});
  const openScales = () => openScreen({ screen: 'escalas', patientId: patient.id, patientName: patient.name });
  const openEvolutions = () => openScreen({ screen: 'evolucao' });

  const scaleCount = data && !data.scales.error ? data.scales.cards.length : 0;
  const evolutionCount = evolutions && !evolutions.error ? evolutions.rows.length : 0;
  const labels = {
    resumo: 'Resumo',
    escalas: scaleCount ? `Escalas · ${scaleCount}` : 'Escalas',
    evolucoes: evolutionCount ? `Evoluções · ${evolutionCount}` : 'Evoluções',
  };

  function onTabKey(event) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = PANEL_TABS[(PANEL_TABS.indexOf(tab) + step + PANEL_TABS.length) % PANEL_TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <aside className="osr-before" aria-label="Consulta rápida">
      <div className="osr-tabs" role="tablist" aria-label="O que ver" onKeyDown={onTabKey}>
        {PANEL_TABS.map(id => (
          <button
            key={id}
            ref={element => { tabRefs.current[id] = element; }}
            type="button"
            role="tab"
            id={`osr-tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`osr-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            className={`osr-tab${tab === id ? ' is-active' : ''}`}
            onClick={() => setTab(id)}
          >
            {labels[id]}
          </button>
        ))}
      </div>

      <div className="osr-panel" role="tabpanel" id={`osr-panel-${tab}`} aria-labelledby={`osr-tab-${tab}`}>
        {tab === 'resumo' && <SummaryTab data={data} onTab={setTab} openScales={openScales} />}
        {tab === 'escalas' && <ScalesTab data={data} onOpen={setOpened} />}
        {tab === 'evolucoes' && <EvolutionsTab evolutions={evolutions} />}
      </div>

      {tab === 'escalas' && (
        <button type="button" className="osr-shortcut osr-panel-foot" onClick={openScales} title="Abre na aba do sistema">
          Abrir a tela Escalas, com o gráfico<span aria-hidden="true">→</span>
        </button>
      )}
      {tab === 'evolucoes' && (
        <button type="button" className="osr-shortcut osr-panel-foot" onClick={openEvolutions} title="Abre na aba do sistema">
          Abrir a tela Evoluções<span aria-hidden="true">→</span>
        </button>
      )}

      {opened && (
        <InstrumentApplicationDialog
          application={opened.application}
          instrument={opened.instrument}
          canVoid={false}
          placement="side"
          onClose={() => setOpened(null)}
        />
      )}
    </aside>
  );
}

// ---------------------------------------------------------------
// Vídeo
// ---------------------------------------------------------------

// Tela cheia do vídeo (pedido de 21/10/2026): a do navegador quando existe;
// no iPhone, que não tem tela cheia para um bloco da página, o vídeo cobre
// a janela. Sair (botão ou Esc) volta para a sala como estava.
function useStageFullscreen() {
  const stageRef = useRef(null);
  const [native, setNative] = useState(false);
  const [covering, setCovering] = useState(false);

  useEffect(() => {
    const onChange = () => setNative(document.fullscreenElement === stageRef.current && Boolean(stageRef.current));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useDismiss({ open: covering, onClose: () => setCovering(false) });

  const toggle = useCallback(() => {
    const stage = stageRef.current;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (covering) {
      setCovering(false);
      return;
    }
    if (stage?.requestFullscreen) {
      stage.requestFullscreen().catch(() => setCovering(true));
    } else {
      setCovering(true);
    }
  }, [covering]);

  return { stageRef, expanded: native || covering, covering, toggle };
}

function VideoStage({ call, patientName, windowState, opensAt, onJoin, joining }) {
  const remote = call.remotes[0] || null;
  const mainTrack = remote?.screen || remote?.video || null;
  // Paciente mostrando a tela: o rosto dela vai para o quadro pequeno.
  const peerTrack = remote?.screen ? remote.video : null;
  // O quadro "Você" mostra sempre a câmera, nunca a própria tela
  // compartilhada (23/10/2026: virava um espelho sem fim).
  const localTrack = call.local?.video || null;
  const firstName = String(patientName || '').split(' ')[0] || 'o paciente';
  const { stageRef, expanded, covering, toggle: toggleFullscreen } = useStageFullscreen();

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
    <section
      ref={stageRef}
      className={`osr-stage${covering ? ' is-covering' : ''}`}
      aria-label="Vídeo"
    >
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
        {remote && (
          <span className="osr-name">
            {patientName}{remote.screen ? ' · compartilhando a tela' : ''}{!remote.micOn ? ' · microfone desligado' : ''}
          </span>
        )}
      </div>
      {peerTrack && (
        <div className="osr-self osr-self--peer">
          <TrackVideo track={peerTrack} className="osr-video" />
          <span className="osr-self-label">{firstName}</span>
        </div>
      )}
      <div className="osr-self">
        {localTrack ? <TrackVideo track={localTrack} mirror className="osr-video" /> : <span className="osr-avatar">Você</span>}
        <span className="osr-self-label">Você</span>
      </div>
      {call.sharing && (
        <div className="osr-sharing" role="status">
          <Icon name="screen" size={16} />
          <span>Você está compartilhando a tela</span>
          <button type="button" onClick={call.toggleShare}>Parar</button>
        </div>
      )}
      {call.shareError && <p className="osr-share-error" role="alert">{call.shareError}</p>}
      <div className="osr-controls">
        <button type="button" className={`osr-control${call.micOn ? '' : ' is-off'}`} aria-pressed={call.micOn} aria-label={call.micOn ? 'Desligar microfone' : 'Ligar microfone'} onClick={call.toggleMic}>
          <Icon name={call.micOn ? 'mic' : 'micOff'} />
        </button>
        <button type="button" className={`osr-control${call.camOn ? '' : ' is-off'}`} aria-pressed={call.camOn} aria-label={call.camOn ? 'Desligar câmera' : 'Ligar câmera'} onClick={call.toggleCam}>
          <Icon name={call.camOn ? 'camera' : 'cameraOff'} />
        </button>
        {call.canShare && (
          <button
            type="button"
            className={`osr-control${call.sharing ? ' is-on' : ''}`}
            aria-pressed={call.sharing}
            aria-label={call.sharing ? 'Parar de compartilhar a tela' : 'Compartilhar tela'}
            title={call.sharing ? 'Parar de compartilhar a tela' : 'Compartilhar tela'}
            onClick={call.toggleShare}
          >
            <Icon name="screen" />
          </button>
        )}
        <button
          type="button"
          className="osr-control osr-control--expand"
          aria-pressed={expanded}
          aria-label={expanded ? 'Sair da tela cheia' : 'Tela cheia'}
          title={expanded ? 'Sair da tela cheia' : 'Tela cheia'}
          onClick={toggleFullscreen}
        >
          <Icon name={expanded ? 'collapse' : 'expand'} />
        </button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------
// Coluna da direita
// ---------------------------------------------------------------

function CardHead({ id, icon, title, chip = null }) {
  return (
    <div className="osr-card-head">
      <span className="osr-card-icon"><Icon name={icon} size={18} /></span>
      <h2 id={id}>{title}</h2>
      {chip && <span className="osr-chip">{chip}</span>}
    </div>
  );
}

function RecordingCard({ info }) {
  return (
    <section className="osr-card" aria-labelledby="osr-rec-title">
      <CardHead id="osr-rec-title" icon="mic" title="Gravação" chip="Em breve" />
      <ul className="osr-checks">
        {consentRows(info.consents, info.needsConsent).map(row => (
          <li key={row.key} className={row.ok ? 'is-ok' : ''}>
            <span className="osr-check" aria-hidden="true">{row.ok && <Icon name="check" size={12} />}</span>
            <span><b>{row.title}</b> · {row.detail}</span>
          </li>
        ))}
      </ul>
      <p className="osr-note">A gravação com transcrição chega na próxima etapa. Por enquanto, nada desta sala é gravado.</p>
    </section>
  );
}

function PatientLinkCard({ appointmentId, info, professionalName }) {
  const [link, setLink] = useState({ token: '', phone: '', loaded: false, failed: false });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadPatientLinkInfo(appointmentId, info.patient.id)
      .then(result => { if (!cancelled) setLink({ ...result, loaded: true, failed: false }); })
      .catch(() => { if (!cancelled) setLink({ token: '', phone: '', loaded: true, failed: true }); });
    return () => { cancelled = true; };
  }, [appointmentId, info.patient.id]);

  const href = link.token ? onlineConsultationHref(link.token) : '';
  const firstName = String(info.patient.name || '').split(' ')[0];
  const message = href
    ? `Olá, ${firstName}! Sua consulta online com ${professionalName} é às ${formatClock(info.startsAt)}. Entre por aqui: ${href}`
    : '';
  const whatsapp = href && isLikelyValidWhatsAppPhone(link.phone) ? buildWhatsAppLink({ phone: link.phone, message }) : '';
  const linkText = href
    ? href.replace(/^https?:\/\//, '')
    : !link.loaded ? 'Carregando o link…' : link.failed ? 'Não deu para carregar o link.' : 'Este atendimento ainda não tem link.';

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
      <CardHead id="osr-link-title" icon="link" title="Link do paciente" />
      <p className="osr-link-box" title={href || undefined}>{linkText}</p>
      <div className="osr-pair">
        <button type="button" className="osr-btn" onClick={copy} disabled={!href}>{copied ? 'Link copiado' : 'Copiar link'}</button>
        {whatsapp ? (
          <a className="osr-btn osr-btn--whatsapp" href={whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Enviar no WhatsApp">WhatsApp</a>
        ) : (
          <button type="button" className="osr-btn osr-btn--whatsapp" disabled title="Cadastro sem telefone válido" aria-label="Enviar no WhatsApp">WhatsApp</button>
        )}
      </div>
      <p className="osr-note">É o mesmo link da confirmação: no horário, ele leva para a sala.</p>
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
      <CardHead id="osr-finish-title" icon="flag" title="Ao encerrar" />
      {error && <p className="osr-warn" role="alert">{error}</p>}
      <button type="button" className="osr-btn osr-btn--primary" onClick={markAttended} disabled={attended || saving} aria-busy={saving}>
        {attended ? 'Atendido ✓' : saving ? 'Marcando…' : 'Marcar como Atendido'}
      </button>
      <button type="button" className="osr-btn" onClick={() => openScreen({ screen: 'evolucao' })} title="Abre a tela Evoluções na aba do sistema">
        Escrever a evolução →
      </button>
    </section>
  );
}

// Minutos do mês no Daily (pedido de 21/10/2026): como um contador de uso,
// para ninguém ser pego de surpresa quando os minutos grátis acabarem.
// Atualiza ao abrir, a cada 5 minutos e logo depois de sair da chamada.
const USAGE_REFRESH_MS = 5 * 60_000;
const USAGE_AFTER_LEAVE_MS = 5_000;

function UsageCard({ appointmentId, callPhase }) {
  const [usage, setUsage] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await loadDailyUsage(appointmentId);
      setUsage({ data, at: Date.now(), failed: false });
    } catch {
      setUsage(previous => ({ ...(previous || {}), failed: true }));
    } finally {
      setRefreshing(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, USAGE_REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  // O Daily fecha a conta da chamada logo depois que a pessoa sai.
  useEffect(() => {
    if (callPhase !== 'left') return undefined;
    const timer = setTimeout(refresh, USAGE_AFTER_LEAVE_MS);
    return () => clearTimeout(timer);
  }, [callPhase, refresh]);

  const summary = usageSummary(usage?.data);
  const consults = count => (count === 1 ? '1 consulta' : `${count} consultas`);

  return (
    <section className="osr-card osr-usage" aria-labelledby="osr-usage-title">
      <CardHead id="osr-usage-title" icon="gauge" title="Minutos do mês" chip={summary ? `${summary.percent}%` : null} />
      {!usage ? (
        <p className="osr-muted">Carregando…</p>
      ) : !summary ? (
        <p className="osr-muted">— Não deu para ler o uso agora.</p>
      ) : (
        <>
          <p className="osr-usage-numbers">
            <b>{formatMinutes(summary.used)}</b> de {formatMinutes(summary.free)} grátis
          </p>
          <div
            className="osr-meter"
            role="meter"
            aria-label="Minutos grátis usados no mês"
            aria-valuemin={0}
            aria-valuemax={summary.free}
            aria-valuenow={Math.min(summary.used, summary.free)}
            aria-valuetext={`${summary.percent}% dos minutos grátis usados`}
          >
            <span className={`osr-meter-fill${summary.near || summary.over ? ' is-near' : ''}`} style={{ width: `${summary.percent}%` }} />
          </div>
          <p className="osr-line">
            ≈ {consults(summary.consultsUsed)} de {CONSULT_MINUTES} min
            {summary.over ? ' · acabaram os minutos grátis' : ` · cabem mais ~${summary.consultsLeft} grátis`}
          </p>
          {summary.over ? (
            <p className="osr-warn" role="status">
              Os minutos grátis do mês acabaram: o Daily cobra cerca de US$ 0,004 por minuto de cada pessoa na chamada.
            </p>
          ) : summary.near ? (
            <p className="osr-warn" role="status">Perto do fim dos minutos grátis do mês.</p>
          ) : null}
          <p className="osr-note">
            Cada pessoa na chamada conta: {CONSULT_MINUTES} min a dois são {CONSULT_PARTICIPANT_MINUTES} min. Conta feita
            pelas chamadas desde {summary.since}; a fatura do Daily é a referência.
          </p>
          {usage.failed && <p className="osr-note">Não deu para atualizar agora; os números são das {formatClock(usage.at)}.</p>}
        </>
      )}
      <a className="osr-daily-link" href={DAILY_DASHBOARD_URL} target="_blank" rel="noopener noreferrer">
        Ver uso e fatura no painel do Daily<span aria-hidden="true">↗</span>
      </a>
      <div className="osr-usage-foot">
        <small>{usage?.at ? `Atualizado às ${formatClock(usage.at)}` : ''}</small>
        <button type="button" className="osr-mini" onClick={refresh} disabled={refreshing} aria-busy={refreshing}>
          {refreshing ? 'Atualizando…' : 'Atualizar'}
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
  const [evolutions, setEvolutions] = useState(null);
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
    // O texto das evoluções só aparece quando a aba Evoluções abre.
    loadSessionEvolutions({ patientId: info.patient.id })
      .then(rows => { if (!cancelled) setEvolutions({ rows }); })
      .catch(() => { if (!cancelled) setEvolutions({ error: true }); });
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
        <QuickPanel data={before} evolutions={evolutions} patient={info.patient} openScreen={openScreen} />
        <div className="osr-side">
          <RecordingCard info={info} />
          <PatientLinkCard appointmentId={appointmentId} info={info} professionalName={professionalName} />
          <FinishCard
            appointmentId={appointmentId}
            status={info.status}
            onStatus={status => setInfo(previous => ({ ...previous, status }))}
            openScreen={openScreen}
          />
          <UsageCard appointmentId={appointmentId} callPhase={call.phase} />
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
