import { useState } from 'react';
import { APPOINTMENT_BLOCK_TYPES, APPOINTMENT_MODALITIES, APPOINTMENT_TYPES } from '../../../services/appointmentService';

function durationOf(appointment) {
  const start = new Date(appointment.starts_at);
  const end = new Date(appointment.ends_at);
  const minutes = Math.round((end - start) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
}

// ============================================================
// Editar atendimento — só o que é seguro editar depois de criado.
//
// De propósito, NÃO edita paciente nem profissional: trocar o
// paciente de um horário já marcado mistura o histórico de duas
// pessoas na mesma linha, e trocar o profissional reabre a checagem
// de jornada/exceção que "Mover" já faz sozinho. Quem marcou errado
// cancela e cria de novo. Horário (o instante de início) também fica
// de fora — isso é o botão "Mover", que já existe e já revalida
// feriado/jornada; duplicar essa lógica aqui só daria duas fontes da
// mesma verdade.
// ============================================================

const DURATIONS = [20, 30, 45, 60, 90, 120, 180, 240];

export function EditAppointmentPanel({
  open,
  appointment,
  availableDisciplines,
  saving = false,
  onClose,
  onSave,
}) {
  // Estado inicializado direto do agendamento — sem useEffect. A
  // troca de agendamento é resolvida pelo `key={appointment.id}` que
  // o chamador passa: React remonta o componente do zero, então não
  // existe "formulário do agendamento anterior" para limpar.
  const [discipline, setDiscipline] = useState(() => appointment?.discipline || '');
  const [appointmentType, setAppointmentType] = useState(() => appointment?.appointment_type || '');
  const [modality, setModality] = useState(() => appointment?.modality || 'presencial');
  const [blockType, setBlockType] = useState(() => appointment?.block_type || 'outro');
  const [durationMinutes, setDurationMinutes] = useState(() => (appointment ? durationOf(appointment) : 60));
  const [note, setNote] = useState(() => appointment?.note || '');

  if (!open || !appointment) return null;

  const isBlock = appointment.kind === 'block';

  function handleSubmit(event) {
    event.preventDefault();

    if (isBlock) {
      onSave({ blockType, note });
      return;
    }

    const start = new Date(appointment.starts_at);
    const endsAt = new Date(start.getTime() + durationMinutes * 60000);
    onSave({ discipline, appointmentType: appointmentType || null, modality, endsAt, note });
  }

  return (
    <div className="ag-dialog-overlay" role="dialog" aria-modal="true" aria-label="Editar atendimento">
      <div className="ag-dialog-panel">
        <div className="ag-dialog-head">
          <h3 className="ag-dialog-title">{isBlock ? 'Editar bloqueio' : 'Editar atendimento'}</h3>
          <button type="button" className="ag-chip-btn" onClick={onClose}>Fechar</button>
        </div>

        <form className="ag-dialog-body" onSubmit={handleSubmit}>
          {isBlock ? (
            <div className="ag-field">
              <span className="agj-label">Categoria</span>
              <div className="ag-seg" role="group" aria-label="Categoria do bloqueio">
                {APPOINTMENT_BLOCK_TYPES.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="ag-seg-btn"
                    aria-pressed={blockType === item.id}
                    onClick={() => setBlockType(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="ag-row">
                <div className="ag-field">
                  <label htmlFor="ag-edit-discipline">Área</label>
                  <select
                    id="ag-edit-discipline"
                    className="ag-select"
                    value={discipline}
                    onChange={e => setDiscipline(e.target.value)}
                    disabled={saving}
                    required
                  >
                    {availableDisciplines.map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>

                <div className="ag-field">
                  <label htmlFor="ag-edit-type">Tipo</label>
                  <select
                    id="ag-edit-type"
                    className="ag-select"
                    value={appointmentType}
                    onChange={e => setAppointmentType(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Não classificado</option>
                    {APPOINTMENT_TYPES.map(item => (
                      <option key={item.id} value={item.id}>{item.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="ag-field">
                <span className="agj-label">Modalidade</span>
                <div className="ag-seg" role="group" aria-label="Modalidade do atendimento">
                  {APPOINTMENT_MODALITIES.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      className="ag-seg-btn"
                      aria-pressed={modality === item.id}
                      onClick={() => setModality(item.id)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ag-field">
                <label htmlFor="ag-edit-duration">Duração</label>
                <select
                  id="ag-edit-duration"
                  className="ag-select"
                  value={durationMinutes}
                  onChange={e => setDurationMinutes(Number(e.target.value))}
                  disabled={saving}
                >
                  {[...new Set([durationMinutes, ...DURATIONS])].sort((a, b) => a - b).map(minutes => (
                    <option key={minutes} value={minutes}>{minutes} min</option>
                  ))}
                </select>
                <span className="ag-note">
                  Muda só a duração — o horário de início continua sendo o de "Mover".
                </span>
              </div>
            </>
          )}

          <div className="ag-field">
            <label htmlFor="ag-edit-note">{isBlock ? 'Motivo do bloqueio' : 'Observação da recepção'}</label>
            <input
              id="ag-edit-note"
              className="ag-input"
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={saving}
              required={isBlock}
            />
          </div>

          <div className="ag-dialog-actions">
            <button type="button" className="ag-btn" onClick={onClose} disabled={saving}>
              Cancelar
            </button>
            <button type="submit" className="ag-btn ag-btn--primary" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditAppointmentPanel;
