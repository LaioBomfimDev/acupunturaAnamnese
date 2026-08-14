import { WEEKDAY_LABELS } from '../../../utils/agenda';
import { ROW_STATES } from '../../../utils/agendaTimeline';

// ============================================================
// Visão Dia — a tela que a recepção e o telefone usam
//
// Lista de faixas, não grade posicionada por pixel: tocar num bloco de
// 14px de altura é loteria, e é por isso que agenda de desktop portada
// para celular fica ruim de usar.
//
// Faixa livre é BOTÃO: tocar já abre o formulário com o horário
// preenchido. Ninguém digita hora no celular se puder tocar.
// ============================================================

const STATE_LABEL = {
  [ROW_STATES.FREE]: 'Livre',
  [ROW_STATES.BREAK]: 'Intervalo',
  [ROW_STATES.BLOCKED]: 'Bloqueado',
  [ROW_STATES.OUTSIDE]: 'Fora da jornada',
};

function AppointmentCard({
  appointment,
  patientName,
  professionalName,
  showProfessional,
  isMoving,
  onSelect,
}) {
  const isBlock = appointment.kind === 'block';

  return (
    <button
      type="button"
      className={`agd-card${isBlock ? ' agd-card--block' : ''}${isMoving ? ' agd-card--moving' : ''}`}
      onClick={() => onSelect?.(appointment)}
    >
      <span className="agd-card-name">
        {isBlock ? (appointment.note?.trim() || 'Horário reservado') : patientName(appointment.patient_id)}
      </span>
      <span className="agd-card-meta">
        {[
          isBlock ? 'bloqueio' : appointment.discipline,
          showProfessional ? professionalName(appointment.professional_id) : null,
          !isBlock && appointment.note ? appointment.note : null,
        ].filter(Boolean).join(' · ')}
      </span>
      {appointment.is_exception && (
        <span className="agd-card-exception">Fora do padrão: {appointment.exception_reason}</span>
      )}
    </button>
  );
}

export function AgendaDayView({
  week,
  timeline,
  selectedKey,
  onSelectDay,
  onPickSlot,
  onSelectAppointment,
  patientName,
  professionalName,
  showProfessional = false,
  movingId = null,
  onOpenSchedule,
}) {
  const { rows, hasSchedule, holiday } = timeline;

  return (
    <div className="agd">
      {/* Faixa da semana: navegação de uma mão. Trocar de dia não
          devolve ninguém para o calendário mensal. */}
      <div className="agd-week" role="group" aria-label="Dias da semana">
        {week.map(day => (
          <button
            key={day.key}
            type="button"
            className={`agd-wday${day.key === selectedKey ? ' agd-wday--on' : ''}${day.isToday ? ' agd-wday--today' : ''}`}
            onClick={() => onSelectDay(day.key)}
            aria-pressed={day.key === selectedKey}
          >
            <span className="agd-wday-name">{WEEKDAY_LABELS[day.weekday]}</span>
            <span className="agd-wday-num">{day.day}</span>
            <span className="agd-wday-dot" aria-hidden="true">
              {day.count > 0 ? '•' : ''}
            </span>
          </button>
        ))}
      </div>

      {holiday && (
        <p className={`agd-banner${holiday.is_working_day ? '' : ' agd-banner--warn'}`}>
          {holiday.is_working_day
            ? `${holiday.name} — a instituição atende normalmente.`
            : `${holiday.name} — a instituição não atende neste dia por padrão. Marcar aqui pede confirmação.`}
        </p>
      )}

      {!hasSchedule && (
        <p className="agd-banner">
          Sem jornada cadastrada para este profissional neste dia — a grade
          abaixo é só uma sugestão das 07h às 20h.{' '}
          {onOpenSchedule && (
            <button type="button" className="agd-linkbtn" onClick={onOpenSchedule}>
              Cadastrar horários
            </button>
          )}
        </p>
      )}

      <ul className="agd-rows">
        {rows.map(row => {
          const livre = row.items.length === 0;
          const rotulo = STATE_LABEL[row.state] || '';

          return (
            <li key={row.key} className={`agd-row agd-row--${row.state}`}>
              <span className="agd-time">
                <b>{row.label}</b>
                <small>{row.endLabel}</small>
              </span>

              <div className="agd-slot">
                {livre ? (
                  <button
                    type="button"
                    className="agd-free"
                    onClick={() => onPickSlot(row)}
                  >
                    <span>{movingId ? 'Mover para cá' : rotulo}</span>
                    {!movingId && <span className="agd-free-plus" aria-hidden="true">+</span>}
                  </button>
                ) : (
                  <>
                    {row.items.map(appointment => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        patientName={patientName}
                        professionalName={professionalName}
                        showProfessional={showProfessional}
                        isMoving={movingId === appointment.id}
                        onSelect={onSelectAppointment}
                      />
                    ))}
                    {/* Faixa ocupada continua aceitando encaixe: quem
                        recusa sobreposição de paciente é o banco, com
                        mensagem própria. */}
                    <button
                      type="button"
                      className="agd-add"
                      onClick={() => onPickSlot(row)}
                    >
                      {movingId ? 'Mover para cá' : '+ encaixe'}
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default AgendaDayView;
