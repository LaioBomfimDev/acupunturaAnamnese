import { useMemo, useRef, useState } from 'react';
import {
  computeProgress,
  isAnswerable,
  isQuestionVisible,
  missingRequired,
  splitIntoPages,
} from '../../utils/patientForms';
import { PatientFormQuestion } from './PatientFormQuestion';

// ============================================================
// O formulário em partes ("Nova parte" = uma página), com barra de
// progresso. O paciente pode pular pergunta e voltar depois: a
// conferência das obrigatórias acontece só no "Enviar respostas", e
// leva direto à primeira parte que tem falta.
//
// Usado na Área do Paciente (salva sozinho) e na pré-visualização da
// administração (`preview`: nada é gravado nem enviado).
// ============================================================

function mergeAnswers(current, patch) {
  const next = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function PatientFormRunner({
  questions,
  answers,
  onAnswersChange,
  onSubmit,
  saveState = null,
  submitting = false,
  error = '',
  serverMissing = [],
  preview = false,
  disabled = false,
}) {
  const topRef = useRef(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [attempted, setAttempted] = useState(false);
  const [previewNotice, setPreviewNotice] = useState('');

  const byId = useMemo(() => new Map((questions || []).map(question => [question.id, question])), [questions]);

  // Parte sem nenhuma pergunta aparecendo (todas condicionais) some.
  const pages = useMemo(() => splitIntoPages(questions)
    .map(page => ({
      ...page,
      visible: page.questions.filter(question => isQuestionVisible(question, answers, byId)),
    }))
    .filter(page => page.visible.length > 0), [questions, answers, byId]);

  const numbers = useMemo(() => {
    const map = new Map();
    let count = 0;
    for (const page of pages) {
      for (const question of page.visible) {
        if (isAnswerable(question)) map.set(question.id, ++count);
      }
    }
    return map;
  }, [pages]);

  const missing = useMemo(() => {
    const ids = new Set(serverMissing);
    if (attempted) for (const question of missingRequired(questions, answers)) ids.add(question.id);
    return ids;
  }, [attempted, serverMissing, questions, answers]);

  const progress = computeProgress(questions, answers);
  const safeIndex = Math.min(pageIndex, Math.max(pages.length - 1, 0));
  const page = pages[safeIndex] || { title: '', help: '', visible: [] };
  const isLast = safeIndex >= pages.length - 1;

  function goTo(index) {
    setPageIndex(index);
    setPreviewNotice('');
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  }

  function handleChange(patch) {
    onAnswersChange(mergeAnswers(answers, patch));
  }

  function handleSubmit() {
    setAttempted(true);
    const pending = missingRequired(questions, answers);
    if (pending.length) {
      const first = pages.findIndex(item => item.visible.some(question => question.id === pending[0].id));
      if (first >= 0 && first !== safeIndex) goTo(first);
      return;
    }
    if (preview) {
      setPreviewNotice('Tudo certo. Na pré-visualização nada é enviado.');
      return;
    }
    onSubmit?.();
  }

  const pendingCount = attempted ? missingRequired(questions, answers).length : 0;

  return (
    <div className="pq-runner" ref={topRef}>
      <div className="pq-progress" aria-label={`${progress}% respondido`}>
        <div className="pq-progress-top">
          <span>{pages.length > 1 ? `Parte ${safeIndex + 1} de ${pages.length}` : 'Formulário'}</span>
          <span>{progress}% respondido</span>
        </div>
        <div className="pq-progress-track" aria-hidden="true">
          <div className="pq-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {(page.title || page.help) && (
        <div className="pq-page-head">
          {page.title && <h2>{page.title}</h2>}
          {page.help && <p>{page.help}</p>}
        </div>
      )}

      {page.visible.map(question => (
        <PatientFormQuestion
          key={question.id}
          question={question}
          answers={answers}
          onChange={handleChange}
          number={numbers.get(question.id)}
          missing={missing.has(question.id)}
          disabled={disabled || submitting}
        />
      ))}

      {pendingCount > 0 && (
        <p className="pq-alert" role="alert">
          {pendingCount === 1
            ? 'Falta responder 1 pergunta obrigatória (marcada em amarelo).'
            : `Faltam responder ${pendingCount} perguntas obrigatórias (marcadas em amarelo).`}
        </p>
      )}
      {error && <p className="pq-alert pq-alert--error" role="alert">{error}</p>}
      {previewNotice && <p className="pq-alert" role="status">{previewNotice}</p>}

      <div className="pq-nav">
        {saveState && (
          <p className="pq-save-state" data-tone={saveState.tone} aria-live="polite">{saveState.text}</p>
        )}
        <div className="pq-nav-end">
          {safeIndex > 0 && (
            <button type="button" className="pq-btn" onClick={() => goTo(safeIndex - 1)} disabled={submitting}>
              Voltar
            </button>
          )}
          {isLast ? (
            <button type="button" className="pq-btn pq-btn--primary" onClick={handleSubmit} disabled={submitting || disabled}>
              {submitting ? 'Enviando…' : 'Enviar respostas'}
            </button>
          ) : (
            <button type="button" className="pq-btn pq-btn--primary" onClick={() => goTo(safeIndex + 1)} disabled={submitting}>
              Próxima parte
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default PatientFormRunner;
