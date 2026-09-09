import { WEEKDAY_LABELS } from '../../../utils/agenda';
import { buildDayTimeline } from '../../../utils/agendaTimeline';
import { AgendaDayRows } from './AgendaDayRows';

// ============================================================
// Visão Semana — celular
//
// O grid desktop (AgendaWeekView.jsx) alinha os 7 dias numa régua de
// horário só, pra enxergar buraco na semana inteira de uma vez — isso
// exige colunas lado a lado, que em ~375px viram ilegíveis (é o "fica
// feio" que motivou este arquivo). Empilhado verticalmente essa régua
// compartilhada se perde (Segunda 8h não fica ao lado de Terça 8h), mas
// ganha o que nenhum grid de calendário sobrevive no celular: zero
// scroll horizontal, e cada dia usa a MESMA faixa/card da visão Dia
// (AgendaDayRows) em vez de uma terceira versão da interação.
// ============================================================

export function AgendaWeekMobileView({
  week,
  schedules,
  appointments,
  holidays,
  selectedKey,
  onPickSlot,
  onSelectAppointment,
  patientName,
  professionalName,
  showProfessional = false,
  movingId = null,
  now = null,
  selectedAppointmentId = null,
  onQuickStatus,
  onQuickConfirm,
  onQuickMove,
}) {
  return (
    <div className="agwm" role="list" aria-label="Agenda da semana, um dia por vez">
      {week.map(day => {
        const timeline = buildDayTimeline({ date: day.date, schedules, appointments, holidays });

        return (
          <section
            key={day.key}
            role="listitem"
            className={`agwm-day${day.key === selectedKey ? ' agwm-day--on' : ''}${day.isToday ? ' agwm-day--today' : ''}`}
          >
            <header className="agwm-day-head">
              <span className="agwm-day-name">
                <b>{WEEKDAY_LABELS[day.weekday]}</b>
                {day.day}
              </span>
              {day.count > 0 && <span className="ag-pill ag-pill--count">{day.count} atend.</span>}
              {timeline.holiday && (
                <span className="ag-pill ag-pill--holiday" title={timeline.holiday.name}>Feriado</span>
              )}
              {!timeline.hasSchedule && <span className="agwm-day-tag">sem jornada cadastrada</span>}
            </header>

            <AgendaDayRows
              rows={timeline.rows}
              movingId={movingId}
              onPickSlot={row => onPickSlot(row, day.key)}
              onSelectAppointment={onSelectAppointment}
              patientName={patientName}
              professionalName={professionalName}
              showProfessional={showProfessional}
              now={now}
              selectedAppointmentId={selectedAppointmentId}
              onQuickStatus={onQuickStatus}
              onQuickConfirm={onQuickConfirm}
              onQuickMove={onQuickMove}
            />
          </section>
        );
      })}
    </div>
  );
}

export default AgendaWeekMobileView;
