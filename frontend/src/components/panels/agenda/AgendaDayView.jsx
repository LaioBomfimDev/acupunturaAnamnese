import { WEEKDAY_LABELS } from '../../../utils/agenda';
import { AgendaDayRows } from './AgendaDayRows';

// ============================================================
// Visão Dia — a tela que a recepção e o telefone usam
//
// Lista de faixas, não grade posicionada por pixel: tocar num bloco de
// 14px de altura é loteria, e é por isso que agenda de desktop portada
// para celular fica ruim de usar.
//
// Faixa livre é BOTÃO: tocar já abre o formulário com o horário
// preenchido. Ninguém digita hora no celular se puder tocar.
//
// Quando duas coisas colidem no mesmo horário, os cards dividem a
// largura lado a lado (agd-slot--split) em vez de empilhar — mesma
// ideia de "coluna de sobreposição" de agenda de calendário, só que
// aplicada dentro da faixa fixa em vez de um grid contínuo por pixel.
//
// As faixas em si (QuickActions/AppointmentCard/<ul class="agd-rows">)
// moraram em AgendaDayRows.jsx pra serem reaproveitadas também pela
// Semana no celular (AgendaWeekMobileView.jsx) sem duplicar interação.
// ============================================================

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
  now = null,
  selectedAppointmentId = null,
  onQuickStatus,
  onQuickConfirm,
  onQuickMove,
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

      <AgendaDayRows
        rows={rows}
        movingId={movingId}
        onPickSlot={onPickSlot}
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
    </div>
  );
}

export default AgendaDayView;
