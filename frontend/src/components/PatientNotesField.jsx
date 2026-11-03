import {
  PATIENT_NOTES_HINT,
  PATIENT_NOTES_LABEL,
  PATIENT_NOTES_MAX,
  PATIENT_NOTES_PLACEHOLDER,
  patientNotesCounter,
} from '../utils/patientNotes';

// Campo "Observações" do cadastro (03/11/2026): o mesmo em Cadastrar
// paciente (NewPatientForm) e em Editar cadastro (ClinicPatientProfile).
// O aviso de quem vê fica sempre à vista, junto do campo.
export function PatientNotesField({ id, value, onChange }) {
  const hintId = `${id}-hint`;
  return (
    <div className="cp-notes">
      <label className="cp-field" htmlFor={id}>
        {PATIENT_NOTES_LABEL}
        <textarea
          id={id}
          className="cp-input cp-textarea"
          rows={3}
          maxLength={PATIENT_NOTES_MAX}
          value={value}
          onChange={event => onChange(event.target.value)}
          placeholder={PATIENT_NOTES_PLACEHOLDER}
          aria-describedby={hintId}
        />
      </label>
      <p className="cp-notes-hint" id={hintId}>
        <span>{PATIENT_NOTES_HINT}</span>
        <span className="cp-notes-count">{patientNotesCounter(value)}</span>
      </p>
    </div>
  );
}

export default PatientNotesField;
