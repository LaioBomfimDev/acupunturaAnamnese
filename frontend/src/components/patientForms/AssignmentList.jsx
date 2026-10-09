import { useState } from 'react';
import { assignmentStatus, formatDueDate } from '../../utils/patientForms';
import { cancelAssignment } from '../../services/patientPortalService';

// ============================================================
// Lista de envios (Importáveis e ficha do paciente): situação, prazo,
// "Ver respostas" e "Cancelar envio" (pede confirmação no próprio
// cartão; cancelado some da Área do Paciente e não volta). Escala
// (kind 'instrument') tem "Ver resultado" em vez de "Ver respostas": abre
// a janela da aba Escalas, e o banco só a devolve para quem atende o
// paciente na área (InstrumentRequestResult).
// ============================================================

function day(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}

const CARD_TONE = { success: ' gt-card-gold', warning: ' gt-card-warning', pending: '' };

export function AssignmentList({
  assignments,
  patientName = null,
  onView,
  onChanged,
  selectedIds = null,
  onToggleSelected = null,
  emptyLabel = 'Nenhum envio ainda.',
}) {
  const [confirmingId, setConfirmingId] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  async function handleCancel(assignment) {
    setBusyId(assignment.id);
    setError('');
    try {
      await cancelAssignment(assignment.id);
      setConfirmingId('');
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId('');
    }
  }

  if (!assignments.length) return <p className="gt-empty">{emptyLabel}</p>;

  return (
    <>
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}
      <ul className="gt-list">
        {assignments.map(assignment => {
          const status = assignmentStatus(assignment);
          const open = assignment.status === 'pending' || assignment.status === 'in_progress';
          const isInstrument = assignment.kind === 'instrument';
          const hasAnswers = !isInstrument && (assignment.status === 'submitted' || assignment.status === 'in_progress');
          const hasResult = isInstrument && assignment.status === 'submitted';
          const name = patientName ? patientName(assignment.patient_id) : '';
          const selected = selectedIds?.has(assignment.id) || false;
          const meta = [
            `Enviado em ${day(assignment.created_at)}`,
            assignment.due_date ? `prazo ${formatDueDate(assignment.due_date)}` : 'sem prazo',
            assignment.submitted_at ? `respondido em ${day(assignment.submitted_at)}` : null,
            isInstrument ? 'escala' : null,
          ].filter(Boolean).join(' · ');

          return (
            <li key={assignment.id} className={`gt-card${CARD_TONE[status.tone] || ''}${selected ? ' gt-card-selected' : ''}`}>
              {onToggleSelected && (
                <input
                  type="checkbox"
                  className="gt-card-check"
                  checked={selected}
                  onChange={() => onToggleSelected(assignment.id)}
                  aria-label={`Selecionar envio de ${assignment.form_title}${name ? ` para ${name}` : ''}`}
                />
              )}
              <div className="gt-card-info">
                <span className="gt-card-name">{name || assignment.form_title}</span>
                <span className="gt-card-meta">{name ? `${assignment.form_title} · ${meta}` : meta}</span>
              </div>
              <span className={`gt-badge gt-badge-${status.tone}`}>{status.label}</span>
              <div className="pq-actions">
                {(hasAnswers || hasResult) && (
                  <button type="button" className="gt-btn gt-btn--sm" onClick={() => onView(assignment)}>
                    {hasResult ? 'Ver resultado' : assignment.status === 'submitted' ? 'Ver respostas' : 'Ver o que já respondeu'}
                  </button>
                )}
                {open && confirmingId !== assignment.id && (
                  <button type="button" className="gt-btn gt-btn--sm" onClick={() => setConfirmingId(assignment.id)}>
                    Cancelar envio
                  </button>
                )}
                {open && confirmingId === assignment.id && (
                  <>
                    <button
                      type="button"
                      className="gt-btn gt-btn--sm gt-btn--danger"
                      onClick={() => handleCancel(assignment)}
                      disabled={busyId === assignment.id}
                    >
                      {busyId === assignment.id ? 'Cancelando…' : 'Confirmar cancelamento'}
                    </button>
                    <button type="button" className="gt-btn gt-btn--sm" onClick={() => setConfirmingId('')}>
                      Manter
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default AssignmentList;
