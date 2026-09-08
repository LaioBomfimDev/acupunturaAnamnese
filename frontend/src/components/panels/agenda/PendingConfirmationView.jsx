import { useEffect, useMemo, useState } from 'react';
import { toDayKey } from '../../../utils/agenda';
import {
  confirmAppointment,
  listPendingConfirmations,
} from '../../../services/appointmentService';
import { buildWhatsAppLink, isLikelyValidWhatsAppPhone } from '../../../utils/whatsapp';
import { shortName } from '../../../services/clinicMembersService';

// ============================================================
// Fila de confirmação
//
// A confirmação por agendamento já existe nas outras visões (Hoje, Dia)
// — esta tela só junta, numa lista só, os próximos dias que ainda não
// foram confirmados. É uma fila de trabalho da recepção, não mais um
// jeito de navegar a agenda: por isso busca os próprios dados, fora da
// janela de mês que as outras visões usam.
//
// "Enviar WhatsApp" NÃO é envio automático por API — abre o WhatsApp do
// PRÓPRIO profissional/recepção com a mensagem e o link já prontos; quem
// manda é gente. Ver frontend/src/utils/whatsapp.js.
// ============================================================

const RANGE_OPTIONS = [3, 7, 14];

function hora(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function diaLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'long' });
}

function diaHoraCompleto(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const dia = date.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return `${dia} às ${hora(iso)}`;
}

export function PendingConfirmationView({
  members,
  patientName,
  patientPhone,
  professionalName,
  showProfessional = false,
  clinicName = '',
}) {
  const [days, setDays] = useState(7);
  const [professionalId, setProfessionalId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      const to = new Date(from);
      to.setDate(to.getDate() + days);
      to.setHours(23, 59, 59, 999);

      try {
        const list = await listPendingConfirmations({
          from: from.toISOString(),
          to: to.toISOString(),
          professionalId: professionalId || null,
        });
        if (!cancelled) { setItems(list); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Não foi possível carregar a fila de confirmação.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [days, professionalId]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const item of items) {
      const key = toDayKey(new Date(item.starts_at));
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
    }
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }, [items]);

  /**
   * professionalName (prop) troca o profissional logado por "você" — jeito
   * certo pra tela da equipe, sem sentido nenhum numa mensagem que o
   * PACIENTE vai ler ("confirma sua consulta com você?"). Aqui sempre o
   * nome de verdade, direto de members, sem essa substituição.
   */
  function professionalRealName(id) {
    const found = members.find(item => item.id === id);
    return found ? shortName(found.full_name) : 'o profissional';
  }

  /**
   * 'no-token' e 'no-phone' parecem a mesma coisa na tela ("sem WhatsApp
   * pra mandar"), mas são causas bem diferentes: a primeira é a migração
   * do token ainda não ter rodado (nada a ver com este paciente
   * específico — por isso não mostra aviso nenhum), a segunda é
   * realmente o cadastro sem telefone válido.
   */
  function whatsAppStatusFor(appointment) {
    if (!appointment.confirmation_token) return { href: null, reason: 'no-token' };

    const phone = patientPhone?.(appointment.patient_id);
    if (!isLikelyValidWhatsAppPhone(phone)) return { href: null, reason: 'no-phone' };

    const link = `${window.location.origin}/confirmar-agendamento?token=${appointment.confirmation_token}`;
    const message = `Olá ${patientName(appointment.patient_id)}! `
      + (clinicName ? `Aqui é da ${clinicName}. ` : '')
      + `Confirma sua consulta com ${professionalRealName(appointment.professional_id)} `
      + `${diaHoraCompleto(appointment.starts_at)}? Confirme aqui: ${link}`;

    return { href: buildWhatsAppLink({ phone, message }), reason: 'ok' };
  }

  async function handleConfirm(appointment) {
    setError('');
    setConfirmingId(appointment.id);
    try {
      await confirmAppointment(appointment.id);
      setItems(prev => prev.filter(item => item.id !== appointment.id));
    } catch (err) {
      setError(err.message || 'Não foi possível confirmar o agendamento.');
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <div className="agp">
      <div className="agp-filters">
        <div className="ag-seg" role="group" aria-label="Período">
          {RANGE_OPTIONS.map(option => (
            <button
              key={option}
              type="button"
              className="ag-seg-btn"
              aria-pressed={days === option}
              onClick={() => setDays(option)}
            >
              {option} dias
            </button>
          ))}
        </div>

        {members.length > 1 && (
          <select
            className="ag-select"
            value={professionalId}
            onChange={e => setProfessionalId(e.target.value)}
            aria-label="Filtrar por profissional"
          >
            <option value="">Toda a equipe</option>
            {members.map(member => (
              <option key={member.id} value={member.id}>{member.full_name}</option>
            ))}
          </select>
        )}
      </div>

      {error && <div className="ag-alert" role="alert">{error}</div>}

      {loading ? (
        <p className="ag-empty">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="ag-empty">Nada pendente de confirmação nos próximos {days} dias.</p>
      ) : (
        byDay.map(([dayKey, dayItems]) => (
          <section key={dayKey} className="agp-day">
            <h4 className="agp-day-title">{diaLabel(dayItems[0].starts_at)}</h4>
            <ul className="agp-list">
              {dayItems.map(appointment => {
                const whatsApp = whatsAppStatusFor(appointment);
                return (
                <li key={appointment.id} className="agp-row">
                  <span className="agp-hour">{hora(appointment.starts_at)}</span>
                  <span className="agp-name">{patientName(appointment.patient_id)}</span>
                  <span className="agp-meta">
                    {[
                      appointment.discipline,
                      showProfessional ? professionalName(appointment.professional_id) : null,
                    ].filter(Boolean).join(' · ')}
                  </span>
                  {whatsApp.reason === 'ok' && (
                    <a
                      className="ag-btn agp-whatsapp"
                      href={whatsApp.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Enviar WhatsApp
                    </a>
                  )}
                  {whatsApp.reason === 'no-phone' && (
                    <span className="agp-no-phone" title="Sem telefone válido cadastrado">
                      sem telefone
                    </span>
                  )}
                  <button
                    type="button"
                    className="ag-btn ag-btn--primary"
                    disabled={confirmingId === appointment.id}
                    onClick={() => handleConfirm(appointment)}
                  >
                    {confirmingId === appointment.id ? 'Confirmando…' : 'Confirmar'}
                  </button>
                </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export default PendingConfirmationView;
