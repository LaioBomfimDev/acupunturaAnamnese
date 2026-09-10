import { useEffect, useMemo, useState } from 'react';
import { toDayKey } from '../../../utils/agenda';
import { listAppointmentsAwaitingEvolution } from '../../../services/appointmentService';

// ============================================================
// Atendimentos aguardando evolução
//
// Ponto de entrada pensado pra não deixar o profissional "perdido" —
// junta, numa lista só, todo atendimento já concluído (atendido, falta
// ou falta justificada) sem evolução escrita ainda, sem filtro de
// período: o objetivo é não deixar nada esquecido para trás, mesmo que
// seja de semanas atrás.
//
// A liberação vem do status do agendamento (marcado na Agenda, sem
// nenhuma ação extra do profissional) — nunca de o profissional
// confirmar "vou atender"/"atendi". Falta e falta justificada também
// aparecem aqui: contam na evolução do paciente, a pedido da
// administradora da clínica.
// ============================================================

const STATUS_LABELS = {
  attended: 'Atendido',
  no_show: 'Faltou',
  excused: 'Falta justificada',
};

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

// A lista vem da view appointments_awaiting_evolution (appointment_id,
// não id) — adapta pro mesmo formato que startAppointment/canStart (de
// Agenda.jsx) já esperam de uma linha de `appointments`.
function toAppointmentShape(item) {
  return {
    id: item.appointment_id,
    clinic_id: item.clinic_id,
    patient_id: item.patient_id,
    professional_id: item.professional_id,
    discipline: item.discipline,
    starts_at: item.starts_at,
    status: item.attendance_status,
    kind: 'appointment',
  };
}

export function PendingEvolutionsView({
  members,
  patientName,
  professionalName,
  showProfessional = false,
  onWrite,
  canWrite,
  initialProfessionalId = '',
}) {
  const [professionalId, setProfessionalId] = useState(initialProfessionalId);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const list = await listAppointmentsAwaitingEvolution();
        if (!cancelled) { setItems(list); setError(''); }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Não foi possível carregar os atendimentos aguardando evolução.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => (
    professionalId ? items.filter(item => item.professional_id === professionalId) : items
  ), [items, professionalId]);

  const byDay = useMemo(() => {
    const map = new Map();
    for (const item of filtered) {
      const key = toDayKey(new Date(item.starts_at));
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at));
    }
    // Mais recente primeiro: é o que ainda está fresco na memória do
    // profissional para escrever.
    return [...map.entries()].sort(([a], [b]) => (a > b ? -1 : a < b ? 1 : 0));
  }, [filtered]);

  function handleWrite(item) {
    const appointment = toAppointmentShape(item);
    onWrite?.(appointment);
  }

  return (
    <div className="agp">
      <div className="agp-filters">
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
      ) : filtered.length === 0 ? (
        <p className="ag-empty">Nenhum atendimento aguardando evolução. Tudo em dia.</p>
      ) : (
        byDay.map(([dayKey, dayItems]) => (
          <section key={dayKey} className="agp-day">
            <h4 className="agp-day-title">{diaLabel(dayItems[0].starts_at)}</h4>
            <ul className="agp-list">
              {dayItems.map(item => {
                const appointment = toAppointmentShape(item);
                const writable = canWrite ? canWrite(appointment) : true;
                return (
                  <li key={item.appointment_id} className="agp-row">
                    <span className="agp-hour">{hora(item.starts_at)}</span>
                    <span className="agp-name">{patientName(item.patient_id) || item.patient_name}</span>
                    <span className={`ag-badge ag-badge--${item.attendance_status}`}>
                      {STATUS_LABELS[item.attendance_status] || item.attendance_status}
                    </span>
                    <span className="agp-meta">
                      {[
                        item.discipline,
                        showProfessional ? professionalName(item.professional_id) : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                    <button
                      type="button"
                      className="ag-btn ag-btn--primary"
                      disabled={!writable}
                      title={writable ? '' : 'Só o profissional do atendimento pode escrever esta evolução.'}
                      onClick={() => handleWrite(item)}
                    >
                      Escrever evolução →
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

export default PendingEvolutionsView;
