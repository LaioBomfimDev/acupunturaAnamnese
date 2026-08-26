import { WEEKDAY_LABELS } from '../../../utils/agenda';
import { ROW_STATES } from '../../../utils/agendaTimeline';
import {
  IconCheck, IconMic, IconPin, IconTag, IconUsers, IconVideo,
} from './AgendaIcons';

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
// ============================================================

const STATE_LABEL = {
  [ROW_STATES.FREE]: 'Livre',
  [ROW_STATES.BREAK]: 'Intervalo',
  [ROW_STATES.BLOCKED]: 'Bloqueado',
  [ROW_STATES.OUTSIDE]: 'Fora da jornada',
};

const DISCIPLINE_SHORT = {
  acupuntura: 'Acup.',
  fisioterapia: 'Fisio',
  psicologia: 'Psico',
  nutricao: 'Nutri',
};

const APPOINTMENT_TYPE_LABEL = {
  first_visit: 'Primeira vez',
  return: 'Retorno',
  evaluation: 'Avaliação',
};

const BLOCK_TYPE_LABEL = {
  reuniao: 'Reunião',
  entrevista: 'Entrevista',
  outro: 'Outro',
};

const BLOCK_TYPE_ICONS = {
  reuniao: IconUsers,
  entrevista: IconMic,
  outro: IconTag,
};

function isPast(appointment, now) {
  if (!(now instanceof Date)) return false;
  const end = new Date(appointment?.ends_at);
  return !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
}

function QuickActions({ appointment, onQuickStatus, onQuickConfirm, onQuickMove }) {
  const confirmed = Boolean(appointment.confirmed_at);

  return (
    <div className="agd-quick" role="group" aria-label="Ações rápidas">
      <button
        type="button"
        className={`agd-quick-btn${confirmed ? ' agd-quick-btn--on' : ''}`}
        onClick={e => { e.stopPropagation(); onQuickConfirm?.(appointment); }}
      >
        {confirmed ? 'Confirmado ✓' : 'Confirmar'}
      </button>
      <button
        type="button"
        className="agd-quick-btn"
        onClick={e => { e.stopPropagation(); onQuickStatus?.(appointment, 'attended'); }}
      >
        Atendido
      </button>
      <button
        type="button"
        className="agd-quick-btn agd-quick-btn--danger"
        onClick={e => { e.stopPropagation(); onQuickStatus?.(appointment, 'no_show'); }}
      >
        Não compareceu
      </button>
      <button
        type="button"
        className="agd-quick-btn"
        onClick={e => { e.stopPropagation(); onQuickMove?.(appointment); }}
      >
        Mover
      </button>
      <button
        type="button"
        className="agd-quick-btn agd-quick-btn--ghost"
        onClick={e => {
          e.stopPropagation();
          document.getElementById('ag-side-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      >
        Mais status
      </button>
    </div>
  );
}

function AppointmentCard({
  appointment,
  patientName,
  professionalName,
  showProfessional,
  isMoving,
  isPastItem,
  isSelected,
  onSelect,
  onQuickStatus,
  onQuickConfirm,
  onQuickMove,
}) {
  const isBlock = appointment.kind === 'block';
  const confirmed = Boolean(appointment.confirmed_at);
  const BlockIcon = BLOCK_TYPE_ICONS[appointment.block_type] || BLOCK_TYPE_ICONS.outro;

  return (
    <div className="agd-card-wrap">
      <button
        type="button"
        className={[
          'agd-card',
          isBlock ? 'agd-card--block' : `agd-card--${appointment.status}`,
          isMoving ? 'agd-card--moving' : '',
          isPastItem ? 'agd-card--past' : '',
          isSelected ? 'agd-card--selected' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => onSelect?.(appointment)}
      >
        {!isBlock && confirmed && (
          <span className="agd-card-confirmed" title="Confirmado">
            <IconCheck />
          </span>
        )}

        <span className="agd-card-name">
          {isBlock ? (appointment.note?.trim() || 'Horário reservado') : patientName(appointment.patient_id)}
        </span>

        <span className="agd-card-meta">
          {isBlock && (
            <span className="agd-chip">
              <BlockIcon />
              {BLOCK_TYPE_LABEL[appointment.block_type] || BLOCK_TYPE_LABEL.outro}
            </span>
          )}
          {!isBlock && (
            <span className="agd-chip">
              {DISCIPLINE_SHORT[appointment.discipline] || appointment.discipline}
            </span>
          )}
          {!isBlock && appointment.appointment_type && (
            <span className="agd-chip">
              {APPOINTMENT_TYPE_LABEL[appointment.appointment_type] || appointment.appointment_type}
            </span>
          )}
          {!isBlock && (
            <span className="agd-chip agd-chip--modality">
              {appointment.modality === 'online' ? <IconVideo /> : <IconPin />}
              {appointment.modality === 'online' ? 'Online' : 'Presencial'}
            </span>
          )}
          {showProfessional && <span className="agd-chip agd-chip--muted">{professionalName(appointment.professional_id)}</span>}
          {!isBlock && appointment.note && <span className="agd-chip agd-chip--muted">{appointment.note}</span>}
        </span>

        {appointment.is_exception && (
          <span className="agd-card-exception">Fora do padrão: {appointment.exception_reason}</span>
        )}
      </button>

      {isSelected && !isBlock && (
        <QuickActions
          appointment={appointment}
          onQuickStatus={onQuickStatus}
          onQuickConfirm={onQuickConfirm}
          onQuickMove={onQuickMove}
        />
      )}
    </div>
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

      <ul className="agd-rows">
        {rows.map(row => {
          const livre = row.items.length === 0;
          const rotulo = STATE_LABEL[row.state] || '';
          const split = row.items.length > 1;

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
                    <div className={split ? 'agd-slot-items agd-slot-items--split' : 'agd-slot-items'}>
                      {row.items.map(appointment => (
                        <AppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          patientName={patientName}
                          professionalName={professionalName}
                          showProfessional={showProfessional}
                          isMoving={movingId === appointment.id}
                          isPastItem={isPast(appointment, now)}
                          isSelected={selectedAppointmentId === appointment.id}
                          onSelect={onSelectAppointment}
                          onQuickStatus={onQuickStatus}
                          onQuickConfirm={onQuickConfirm}
                          onQuickMove={onQuickMove}
                        />
                      ))}
                    </div>
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
