import { ROW_STATES } from '../../../utils/agendaTimeline';
import { getDiscipline } from '../../../data/disciplines';
import {
  IconCheck, IconMic, IconPin, IconTag, IconUsers, IconVideo,
} from './AgendaIcons';

// ============================================================
// Faixas de um dia (lista de horários + cards de atendimento)
//
// Extraído de AgendaDayView.jsx pra ser reaproveitado também pela
// Semana mobile (AgendaWeekMobileView.jsx) — mesma interação, mesmo
// visual, sem duplicar "+encaixe"/ações rápidas/cores por status numa
// segunda versão. AgendaWeekView.jsx (desktop) também importa
// isPast/BLOCK_TYPE_LABEL/BLOCK_TYPE_ICONS daqui em vez de manter cópia
// local.
// ============================================================

// eslint-disable-next-line react-refresh/only-export-components
export const STATE_LABEL = {
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

// eslint-disable-next-line react-refresh/only-export-components
export const BLOCK_TYPE_LABEL = {
  reuniao: 'Reunião',
  entrevista: 'Entrevista',
  outro: 'Outro',
};

// eslint-disable-next-line react-refresh/only-export-components
export const BLOCK_TYPE_ICONS = {
  reuniao: IconUsers,
  entrevista: IconMic,
  outro: IconTag,
};

// eslint-disable-next-line react-refresh/only-export-components
export function isPast(appointment, now) {
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
  // Cor por disciplina (não por status) — ver tokens.css. Bloqueio nunca
  // tem disciplina (constraint do banco), continua no visual tracejado.
  const disciplineColor = !isBlock ? getDiscipline(appointment.discipline)?.color : null;

  return (
    <div className="agd-card-wrap">
      <button
        type="button"
        className={[
          'agd-card',
          isBlock ? 'agd-card--block' : 'agd-card--filled',
          isBlock ? '' : `agd-card--${appointment.status}`,
          isMoving ? 'agd-card--moving' : '',
          isPastItem ? 'agd-card--past' : '',
          isSelected ? 'agd-card--selected' : '',
        ].filter(Boolean).join(' ')}
        style={disciplineColor ? { '--card-color': disciplineColor } : undefined}
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

export function AgendaDayRows({
  rows,
  movingId = null,
  onPickSlot,
  onSelectAppointment,
  patientName,
  professionalName,
  showProfessional = false,
  now = null,
  selectedAppointmentId = null,
  onQuickStatus,
  onQuickConfirm,
  onQuickMove,
}) {
  return (
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
  );
}

export default AgendaDayRows;
