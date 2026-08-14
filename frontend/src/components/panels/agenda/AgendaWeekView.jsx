import { WEEKDAY_LABELS } from '../../../utils/agenda';
import { ROW_STATES, buildDayTimeline } from '../../../utils/agendaTimeline';
import { minutesToLabel } from '../../../utils/agendaExceptions';

// ============================================================
// Visão Semana — para o desktop
//
// Existe por um motivo que a visão Dia não cobre: enxergar BURACO.
// Planejar a semana é olhar onde há vazio, e isso só aparece com os
// sete dias lado a lado.
//
// No telefone esta visão não é oferecida: sete colunas em 375px dão
// 53px por dia, e nenhum nome de paciente cabe nisso. Lá o par certo é
// Dia + faixa da semana.
// ============================================================

/**
 * Une as faixas de horário de todos os dias numa régua só. Sem isto,
 * cada coluna teria a própria grade e as linhas não se alinhariam —
 * que é justamente o que faz a visão semanal servir para achar buraco.
 */
function buildRuler(timelines) {
  const marks = new Set();

  for (const timeline of timelines) {
    for (const row of timeline.rows) {
      marks.add(row.startMinutes);
    }
  }

  return [...marks].sort((a, b) => a - b);
}

export function AgendaWeekView({
  week,
  schedules,
  appointments,
  holidays,
  selectedKey,
  onPickCell,
  onSelectAppointment,
  patientName,
  movingId = null,
}) {
  const timelines = week.map(day => buildDayTimeline({
    date: day.date,
    schedules,
    appointments,
    holidays,
  }));

  const ruler = buildRuler(timelines);

  return (
    <div className="agw" role="table" aria-label="Agenda da semana">
      <div className="agw-head" role="row">
        <span className="agw-corner" />
        {week.map(day => (
          <span
            key={day.key}
            role="columnheader"
            className={`agw-day${day.key === selectedKey ? ' agw-day--on' : ''}${day.isToday ? ' agw-day--today' : ''}`}
          >
            <b>{WEEKDAY_LABELS[day.weekday]}</b>
            <span>{day.day}</span>
          </span>
        ))}
      </div>

      <div className="agw-body">
        {ruler.map(startMinutes => (
          <div className="agw-line" role="row" key={startMinutes}>
            <span className="agw-hour" role="rowheader">{minutesToLabel(startMinutes)}</span>

            {week.map((day, index) => {
              const row = timelines[index].rows.find(item => item.startMinutes === startMinutes);

              if (!row) {
                // Fora da jornada daquele dia: célula morta, sem borda de
                // botão. Continua clicável — marcar fora é decisão da
                // clínica —, só não convida.
                return (
                  <button
                    key={day.key}
                    type="button"
                    role="cell"
                    className="agw-cell agw-cell--none"
                    onClick={() => onPickCell(day, startMinutes, startMinutes + 60)}
                    aria-label={`${day.day} às ${minutesToLabel(startMinutes)}, fora da jornada`}
                  />
                );
              }

              if (row.items.length === 0) {
                return (
                  <button
                    key={day.key}
                    type="button"
                    role="cell"
                    className={`agw-cell agw-cell--${row.state}`}
                    onClick={() => onPickCell(day, row.startMinutes, row.endMinutes)}
                    aria-label={`${day.day} às ${row.label}, livre`}
                  >
                    {row.state === ROW_STATES.BREAK ? <span className="agw-break">intervalo</span> : null}
                  </button>
                );
              }

              return (
                <div key={day.key} role="cell" className={`agw-cell agw-cell--${row.state}`}>
                  {row.items.map(appointment => (
                    <button
                      key={appointment.id}
                      type="button"
                      className={`agw-item${appointment.kind === 'block' ? ' agw-item--block' : ''}${movingId === appointment.id ? ' agw-item--moving' : ''}`}
                      onClick={() => onSelectAppointment?.(appointment)}
                      title={appointment.kind === 'block'
                        ? (appointment.note || 'Bloqueio')
                        : patientName(appointment.patient_id)}
                    >
                      {appointment.kind === 'block'
                        ? (appointment.note?.trim() || 'Bloqueio')
                        : patientName(appointment.patient_id)}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgendaWeekView;
