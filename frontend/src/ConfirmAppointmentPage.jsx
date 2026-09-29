import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import {
  buildConfirmationDetails,
  clinicAccentStyle,
  describeAppointmentWhen,
} from './utils/appointmentConfirmation';
import { IconPin, IconVideo } from './components/panels/agenda/AgendaIcons';
import {
  IconBuilding,
  IconCalendarOff,
  IconCheckBold,
  IconDoor,
  IconExternal,
  IconLinkOff,
  IconPerson,
  IconStethoscope,
  PublicLoading,
  PublicStateMessage,
  PublicWhenBlock,
} from './components/public/PublicPageParts';
import './styles/tokens.css';
import './styles/confirmPage.css';

// ============================================================
// Confirmação de agendamento — página pública
//
// Montada diretamente por main.jsx quando a URL é
// /confirmar-agendamento, FORA de AuthProvider/PatientProvider — mesmo
// padrão de SurveyPage.jsx. Quem chega aqui veio de um link que o
// próprio profissional mandou pelo WhatsApp dele (ver
// frontend/src/utils/whatsapp.js); não há conta nem sessão.
// Toda validação (token existe, agendamento ainda ativo) acontece na
// Edge Function confirm-appointment — esta tela só reflete o que ela
// devolve. O que aparece em cada caso (endereço só presencial etc.)
// mora em utils/appointmentConfirmation.js.
// ============================================================

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

async function callConfirmFunction(body) {
  const { data, error } = await supabase.functions.invoke('confirm-appointment', { body });
  if (error) throw new Error('Não foi possível concluir. Tente novamente em instantes.');
  if (data?.error) throw new Error(data.error);
  return data;
}

const DETAIL_ICONS = {
  patient: <IconPerson />,
  professional: <IconStethoscope />,
  presencial: <IconBuilding />,
  online: <IconVideo width="18" height="18" />,
  address: <IconPin width="18" height="18" />,
  room: <IconDoor />,
};

export function ConfirmAppointmentPage() {
  const [token] = useState(getTokenFromUrl);
  // loading | invalid | view | closed
  const [status, setStatus] = useState(() => (getTokenFromUrl() ? 'loading' : 'invalid'));
  const [appointment, setAppointment] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await callConfirmFunction({ token });
        if (cancelled) return;
        setAppointment(data);
        setStatus(data.confirmable || data.confirmed ? 'view' : 'closed');
      } catch {
        if (!cancelled) setStatus('invalid');
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  async function handleConfirm() {
    setConfirming(true);
    setErrorMessage('');
    try {
      const data = await callConfirmFunction({ token, confirm: true });
      setAppointment(data);
    } catch (err) {
      setErrorMessage(err.message || 'Não foi possível confirmar. Tente novamente.');
    } finally {
      setConfirming(false);
    }
  }

  const when = appointment ? describeAppointmentWhen(appointment.startsAt, appointment.endsAt, new Date()) : null;
  const details = buildConfirmationDetails(appointment);
  const confirmed = Boolean(appointment?.confirmed);

  return (
    <div className="cf-page" style={clinicAccentStyle(appointment?.clinicColor) || undefined}>
      <main className="cf-card" aria-busy={status === 'loading'}>
        {status === 'loading' && <PublicLoading>Carregando seu agendamento…</PublicLoading>}

        {status === 'invalid' && (
          <PublicStateMessage tone="neutral" icon={<IconLinkOff />} title="Link indisponível">
            Este link é inválido. Se você recebeu um link novo, confira se
            copiou o endereço completo.
          </PublicStateMessage>
        )}

        {status === 'closed' && appointment && (
          <PublicStateMessage tone="neutral" icon={<IconCalendarOff />} title="Agendamento não disponível">
            Este agendamento não está mais aberto para confirmação. Se
            precisar remarcar, entre em contato com {appointment.clinicName || 'a clínica'}.
          </PublicStateMessage>
        )}

        {status === 'view' && appointment && (
          <>
            <header className="cf-head">
              {appointment.clinicName && (
                <p className="cf-clinic">
                  <IconBuilding size={14} />
                  {appointment.clinicName}
                </p>
              )}
              <h1>{confirmed ? 'Consulta confirmada' : 'Confirme sua consulta'}</h1>
              {!confirmed && (
                <p className="cf-note">Confira os dados abaixo e toque em “Confirmar presença”.</p>
              )}
            </header>

            <PublicWhenBlock when={when} />

            <ul className="cf-details">
              {details.map(row => (
                <li key={row.id} className="cf-detail">
                  <span className="cf-detail-icon">{DETAIL_ICONS[row.id]}</span>
                  <div className="cf-detail-text">
                    <span className="cf-detail-label">{row.label}</span>
                    <span className="cf-detail-value">{row.value}</span>
                    {row.href && (
                      <a className="cf-map-link" href={row.href} target="_blank" rel="noopener noreferrer">
                        Abrir no mapa
                        <IconExternal />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {errorMessage && <div className="cf-error" role="alert">{errorMessage}</div>}

            {confirmed ? (
              <div className="cf-done" role="status">
                <span className="cf-done-icon"><IconCheckBold size={20} /></span>
                <div>
                  <strong>Presença confirmada</strong>
                  <span>Obrigado! Até lá.</span>
                </div>
              </div>
            ) : (
              <button type="button" className="cf-submit" onClick={handleConfirm} disabled={confirming} aria-busy={confirming}>
                {confirming ? (
                  <><span className="cf-spinner cf-spinner--on-accent" aria-hidden="true" />Confirmando…</>
                ) : (
                  <><IconCheckBold />Confirmar presença</>
                )}
              </button>
            )}
          </>
        )}
      </main>

      {status === 'view' && (
        <p className="cf-foot">Este link é pessoal: mostra só o seu agendamento.</p>
      )}
    </div>
  );
}

export default ConfirmAppointmentPage;
