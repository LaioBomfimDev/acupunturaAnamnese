import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
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
// devolve.
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

function formatWhen(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dia = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${dia}, às ${hora}`;
}

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

  return (
    <div className="cf-page">
      <div className="cf-card">
        {status === 'loading' && <p className="cf-note">Carregando…</p>}

        {status === 'invalid' && (
          <>
            <h1>Link indisponível</h1>
            <p className="cf-note">
              Este link é inválido. Se você recebeu um link novo, confira se
              copiou o endereço completo.
            </p>
          </>
        )}

        {status === 'closed' && appointment && (
          <>
            <h1>Agendamento não disponível</h1>
            <p className="cf-note">
              Este agendamento não está mais aberto para confirmação. Se
              precisar remarcar, entre em contato com {appointment.clinicName || 'a clínica'}.
            </p>
          </>
        )}

        {status === 'view' && appointment && (
          <>
            <h1>{appointment.confirmed ? 'Consulta confirmada' : 'Confirmar consulta'}</h1>
            {appointment.clinicName && <p className="cf-clinic">{appointment.clinicName}</p>}

            <dl className="cf-summary">
              <div>
                <dt>Paciente</dt>
                <dd>{appointment.patientName || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Profissional</dt>
                <dd>{appointment.professionalName || 'Não informado'}</dd>
              </div>
              <div>
                <dt>Quando</dt>
                <dd>{formatWhen(appointment.startsAt)}</dd>
              </div>
              {appointment.room && (
                <div>
                  <dt>Local</dt>
                  <dd>{appointment.room}</dd>
                </div>
              )}
            </dl>

            {errorMessage && <div className="cf-error" role="alert">{errorMessage}</div>}

            {appointment.confirmed ? (
              <p className="cf-confirmed-badge">✓ Presença confirmada</p>
            ) : (
              <button type="button" className="cf-submit" onClick={handleConfirm} disabled={confirming}>
                {confirming ? 'Confirmando…' : 'Confirmar presença'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default ConfirmAppointmentPage;
