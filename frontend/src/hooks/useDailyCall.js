import { useCallback, useEffect, useRef, useState } from 'react';
import { dailyErrorMessage, screenShareErrorMessage } from '../utils/onlineConsultation';

// ============================================================
// Chamada do Daily no modo "peças" (call object), para a sala de quem
// atende: a tela é nossa e cada voz chega separada (a gravação da etapa
// seguinte usa isso para saber quem falou). O Daily carrega aqui, só
// quando a profissional entra na sala, e nunca no bundle principal.
// avoidEval: o Daily carrega o código da chamada por <script> da CDN dele
// em vez de eval (CSP de /sala-online em vercel.json).
// ============================================================

const EMPTY = Object.freeze({
  local: null,
  remotes: [],
  micOn: false,
  camOn: false,
  sharing: false,
});

const CALL_EVENTS = [
  'joined-meeting',
  'participant-joined',
  'participant-updated',
  'participant-left',
  'track-started',
  'track-stopped',
  // Compartilhar tela (23/10/2026): o botão segue o que o navegador fez,
  // inclusive quando a pessoa para pela barra "Parar de compartilhar" ou
  // fecha a janela de escolha sem escolher.
  'local-screen-share-started',
  'local-screen-share-stopped',
  'local-screen-share-canceled',
];

// Estados em que a tela própria está saindo (ou começando a sair).
const SHARING_STATES = ['loading', 'sendable', 'playable', 'interrupted'];

// Na janela de escolha, a aba da própria sala fica de fora: compartilhar
// a sala dentro da sala vira um espelho sem fim para o paciente.
export const SCREEN_SHARE_OPTIONS = Object.freeze({
  displayMediaOptions: {
    audio: false,
    selfBrowserSurface: 'exclude',
    surfaceSwitching: 'include',
  },
});

function playableTrack(participant, kind) {
  const track = participant?.tracks?.[kind];
  if (!track || track.state !== 'playable') return null;
  return track.persistentTrack || track.track || null;
}

export function isSharingScreen(participant) {
  const state = participant?.tracks?.screenVideo?.state;
  return state ? SHARING_STATES.includes(state) : Boolean(participant?.screen);
}

function snapshot(call) {
  const all = call.participants() || {};
  const local = all.local || null;
  const remotes = Object.values(all)
    .filter(participant => participant && !participant.local)
    .map(participant => ({
      sessionId: participant.session_id,
      video: playableTrack(participant, 'video'),
      audio: playableTrack(participant, 'audio'),
      screen: playableTrack(participant, 'screenVideo'),
      micOn: Boolean(participant.audio),
    }));
  return {
    local: local ? {
      sessionId: local.session_id,
      video: playableTrack(local, 'video'),
    } : null,
    remotes,
    micOn: Boolean(local?.audio),
    camOn: Boolean(local?.video),
    sharing: isSharingScreen(local),
  };
}

export function useDailyCall() {
  const callRef = useRef(null);
  // idle | joining | joined | left | error
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [shareError, setShareError] = useState('');
  // Celular e tablet não compartilham tela pelo navegador: o botão some.
  const [canShare, setCanShare] = useState(false);
  const [state, setState] = useState(EMPTY);
  const [joinedAt, setJoinedAt] = useState(null);

  const refresh = useCallback(() => {
    if (callRef.current) setState(snapshot(callRef.current));
  }, []);

  const destroy = useCallback(() => {
    const call = callRef.current;
    callRef.current = null;
    if (call) call.destroy().catch(() => {});
  }, []);

  const join = useCallback(async ({ url, token }) => {
    setPhase('joining');
    setError('');
    setShareError('');
    let dailyError = '';
    try {
      const { default: Daily } = await import('@daily-co/daily-js');
      setCanShare(Boolean(Daily.supportedBrowser?.()?.supportsScreenShare));
      destroy();
      const call = Daily.createCallObject({ dailyConfig: { avoidEval: true } });
      callRef.current = call;
      CALL_EVENTS.forEach(name => call.on(name, refresh));
      call.on('local-screen-share-started', () => setShareError(''));
      call.on('left-meeting', () => {
        setPhase('left');
        setState(EMPTY);
      });
      call.on('error', event => {
        dailyError = event?.errorMsg || 'error';
        setError(dailyErrorMessage(dailyError, 'professional'));
        setPhase('error');
      });
      // Erro que não derruba a chamada: o de compartilhar tela aparecia em
      // lugar nenhum, e o botão parecia não fazer nada.
      call.on('nonfatal-error', event => {
        if (event?.type === 'screen-share-error') {
          setShareError(screenShareErrorMessage(event.errorMsg));
          refresh();
        }
      });
      call.on('camera-error', () => {
        setError('Não deu para usar a câmera ou o microfone. Libere os dois nas permissões do navegador.');
      });
      await call.join({ url, token });
      setJoinedAt(previous => previous || Date.now());
      setPhase('joined');
      refresh();
    } catch (err) {
      destroy();
      setError(dailyError || err?.errorMsg
        ? dailyErrorMessage(dailyError || err.errorMsg, 'professional')
        : err?.message || 'Não foi possível entrar na sala.');
      setPhase('error');
    }
  }, [destroy, refresh]);

  const leave = useCallback(async () => {
    const call = callRef.current;
    if (call) await call.leave().catch(() => {});
    destroy();
    setState(EMPTY);
    setShareError('');
    setPhase('left');
  }, [destroy]);

  const toggleMic = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    call.setLocalAudio(!call.localAudio());
    refresh();
  }, [refresh]);

  const toggleCam = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    call.setLocalVideo(!call.localVideo());
    refresh();
  }, [refresh]);

  const toggleShare = useCallback(() => {
    const call = callRef.current;
    if (!call) return;
    setShareError('');
    if (isSharingScreen(call.participants()?.local)) call.stopScreenShare();
    else call.startScreenShare(SCREEN_SHARE_OPTIONS);
  }, []);

  useEffect(() => destroy, [destroy]);

  return {
    phase,
    error,
    shareError,
    canShare,
    ...state,
    joinedAt,
    join,
    leave,
    toggleMic,
    toggleCam,
    toggleShare,
  };
}
