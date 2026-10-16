import { useMemo, useRef, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';
import { buildInterviewQuestions } from '../../data/clinicalInterviews';
import { recordInterviewAnswers } from '../../services/patientInterviewService';
import { newSaveId } from '../../services/patientPortalPublic';
import { PatientFormRunner } from '../patientForms/PatientFormRunner';
import { InterviewGlyph } from './InterviewGlyph';
import '../../styles/patientForms.css';

// ============================================================
// Entrevista no consultório: a profissional conversa com quem convive
// com o paciente e marca as respostas, parte por parte (o mesmo
// formulário que a pessoa vê pelo link). Grava de uma vez, no fim; com
// algo marcado, Esc e clique fora perguntam antes de descartar.
// ============================================================

export function InterviewOfficeDialog({ interview, patient, discipline, onCancel, onSaved }) {
  const questions = useMemo(() => buildInterviewQuestions(interview), [interview]);
  const [answers, setAnswers] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Mesmo salvamento repetido (internet caiu) usa a mesma chave: não duplica.
  const saveIdRef = useRef(null);
  const touched = Object.keys(answers).length > 0;
  const dismiss = useDismiss({ onClose: onCancel, busy: saving, guardUnsaved: true, unsaved: touched });

  async function handleSubmit() {
    setSaving(true);
    setError('');
    if (!saveIdRef.current) saveIdRef.current = newSaveId();
    try {
      await recordInterviewAnswers({
        patientId: patient.id,
        discipline,
        interview,
        answers,
        saveId: saveIdRef.current,
      });
      dismiss.markSaved();
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleChange(next) {
    // Mudou depois de uma tentativa que falhou: é outro salvamento.
    saveIdRef.current = null;
    setAnswers(next);
  }

  return (
    <div className="instrument-dialog-overlay" {...dismiss.backdropProps}>
      <div
        className="instrument-dialog interview-dialog interview-dialog--form forms-scope"
        role="dialog"
        aria-modal="true"
        aria-label={`${interview.shortName}: responder no consultório`}
        {...dismiss.panelProps}
      >
        <div className="panel">
          <div className="panel-title instrument-dialog-head">
            <span className="instrument-dialog-title">
              <span className="instrument-dialog-icon"><InterviewGlyph name="office" size={20} /></span>
              <span>
                {interview.shortName}
                <small>No consultório · {patient?.name || 'Paciente'}</small>
              </span>
            </span>
            <button type="button" className="instrument-dialog-close" aria-label="Fechar" onClick={onCancel} disabled={saving}>×</button>
          </div>
          <div className="panel-body instrument-dialog-body">
            <DismissPrompt dismiss={dismiss} />
            <p className="small interview-office-note">
              Marque o que a pessoa que convive com {patient?.name ? patient.name.split(/\s+/)[0] : 'o paciente'} contar.
              {' '}Na identificação vão o nome e o vínculo de quem está respondendo.
            </p>
            <PatientFormRunner
              questions={questions}
              answers={answers}
              onAnswersChange={handleChange}
              onSubmit={handleSubmit}
              submitting={saving}
              error={error}
              submitLabel="Salvar entrevista"
              submittingLabel="Salvando…"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default InterviewOfficeDialog;
