import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './styles/tokens.css';
import './styles/confirmPage.css';

// ============================================================
// Agenda pública — link somente leitura
//
// Montada diretamente por main.jsx quando a URL é /agenda-publica, FORA
// de AuthProvider/PatientProvider — mesmo padrão de ConfirmAppointmentPage
// e SurveyPage. Quem abre veio de um link que o profissional/recepção
// gerou no botão Compartilhar da Agenda e mandou pelo canal que já usa
// hoje (WhatsApp, e-mail); não há conta nem sessão.
//
// Só mostra nome, horário e status — nunca procedimento, modalidade ou
// observação. Toda validação (token existe, ainda não expirou) acontece
// na Edge Function public-agenda; esta tela só reflete o que ela devolve.
// ============================================================

function getTokenFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('token') || '';
}

async function callPublicAgendaFunction(token) {
  const { data, error } = await supabase.functions.invoke('public-agenda', { body: { token } });
  if (error) throw new Error('Não foi possível carregar a agenda. Tente novamente em instantes.');
  if (data?.error) throw new Error(data.error);
  return data;
}

function formatDay(day) {
  const [year, month, dayOfMonth] = String(day || '').split('-').map(Number);
  if (!year || !month || !dayOfMonth) return '';
  const date = new Date(year, month - 1, dayOfMonth);
  return date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
}

const STATUS_TONE = {
  scheduled: 'pa-status--neutral',
  ready: 'pa-status--info',
  attended: 'pa-status--success',
  cancelled: 'pa-status--muted',
  no_show: 'pa-status--danger',
  excused: 'pa-status--warning',
};

export function PublicAgendaPage() {
  const [token] = useState(getTokenFromUrl);
  // loading | invalid | view
  const [status, setStatus] = useState(() => (getTokenFromUrl() ? 'loading' : 'invalid'));
  const [agenda, setAgenda] = useState(null);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const data = await callPublicAgendaFunction(token);
        if (cancelled) return;
        setAgenda(data);
        setStatus('view');
      } catch {
        if (!cancelled) setStatus('invalid');
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="cf-page">
      <div className="cf-card">
        {status === 'loading' && <p className="cf-note">Carregando…</p>}

        {status === 'invalid' && (
          <>
            <h1>Link indisponível</h1>
            <p className="cf-note">
              Este link é inválido, expirou ou foi revogado. Peça um link
              novo a quem enviou.
            </p>
          </>
        )}

        {status === 'view' && agenda && (
          <>
            <h1>Agenda do dia</h1>
            {agenda.clinicName && <p className="cf-clinic">{agenda.clinicName}</p>}
            <p className="cf-note" style={{ textTransform: 'capitalize' }}>{formatDay(agenda.day)}</p>

            {agenda.items.length === 0 ? (
              <p className="cf-note">Nenhum atendimento marcado neste dia.</p>
            ) : (
              <ul className="pa-list">
                {agenda.items.map((item, index) => (
                  <li key={index} className="pa-item">
                    <span className="pa-item-time">{formatTime(item.time)}</span>
                    <span className="pa-item-name">{item.name}</span>
                    <span className={`pa-status ${STATUS_TONE[item.status] || 'pa-status--neutral'}`}>
                      {item.statusLabel}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PublicAgendaPage;
