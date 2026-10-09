import { useState } from 'react';
import { setEnrollmentResponsible } from '../services/clinicPatientsService';
import { canBeResponsible } from '../utils/instrumentRecipients';

// ============================================================
// Ficha do paciente → Matrículas: o responsável do paciente em cada área
// (20261012). O responsável recebe as escalas da área e o alerta de
// risco, junto com quem tem atendimento na Agenda. "Enviar para outra
// área" já grava o profissional de destino; aqui a administração
// confere, escolhe ou troca. Os demais só veem.
// ============================================================

export function EnrollmentResponsible({ enrollment, disciplineLabel, members = [], canEdit = false, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const current = enrollment.assigned_to || '';
  const responsible = current ? members.find(member => member.id === current) || null : null;
  const candidates = members.filter(member => canBeResponsible(member, enrollment.discipline));
  // Responsável que saiu da equipe ou da área continua na lista até trocar.
  const options = responsible && !candidates.some(member => member.id === responsible.id)
    ? [responsible, ...candidates]
    : candidates;

  function startEditing() {
    setValue(current);
    setError('');
    setEditing(true);
  }

  async function handleSave(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const saved = await setEnrollmentResponsible(enrollment.id, value || null);
      setEditing(false);
      onSaved?.({ ...enrollment, assigned_to: saved.responsibleId }, saved.responsibleName);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pf-responsible">
      <span className="pf-responsible-text">
        {current
          ? <>Responsável: <b>{responsible ? responsible.full_name : 'pessoa fora da equipe ativa'}</b></>
          : 'Sem responsável'}
      </span>

      {canEdit && !editing && (
        <button type="button" className="cp-btn cp-btn--sm" onClick={startEditing}>
          {current ? 'Trocar' : 'Escolher'}
        </button>
      )}

      {editing && (
        <form className="pf-responsible-form" onSubmit={handleSave}>
          <select
            className="cp-select"
            aria-label={`Responsável na ${disciplineLabel}`}
            value={value}
            onChange={event => setValue(event.target.value)}
            disabled={saving}
          >
            <option value="">Sem responsável</option>
            {options.map(member => (
              <option key={member.id} value={member.id}>{member.full_name}</option>
            ))}
          </select>
          <button type="submit" className="cp-btn cp-btn--sm cp-btn--primary" disabled={saving || value === current}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button type="button" className="cp-btn cp-btn--sm" onClick={() => setEditing(false)} disabled={saving}>
            Cancelar
          </button>
        </form>
      )}

      {(editing || (canEdit && !current)) && (
        <span className="pf-responsible-hint">
          O responsável é quem atende o paciente nesta área: recebe as escalas e o alerta de risco, junto com quem tem
          atendimento na Agenda.
        </span>
      )}

      {error && <div className="cp-notice cp-notice-error pf-responsible-error" role="alert">{error}</div>}
    </div>
  );
}

export default EnrollmentResponsible;
