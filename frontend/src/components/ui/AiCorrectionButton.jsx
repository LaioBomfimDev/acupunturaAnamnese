// ============================================================
// COMPONENTE: Botão "Corrigir" + diálogo — ensinar a IA
//
// Aparece em toda saída de IA. A profissional digita a versão correta;
// a correção é anonimizada e registrada (aiCorrectionService). Ela já vale
// para as próximas análises da própria autora; para todas, após aprovação
// da SuperAdm. Não edita código — a IA passa a seguir a lição.
// ============================================================

import { useState } from 'react';
import {
  AI_SURFACE_LABELS,
  submitAiCorrection,
  looksLikeContainsPII,
} from '../../services/aiCorrectionService';

// Resumo legível do que a IA disse, a partir das formas conhecidas de saída.
function summarizeAiOutput(aiOutput) {
  if (!aiOutput || typeof aiOutput !== 'object') return '';
  const o = aiOutput;
  if (o.title) return `${o.title}${o.pattern ? ` → ${o.pattern}` : ''}`;
  if (o.item) return `${o.group ? `${o.group}: ` : ''}${o.item}`;
  if (typeof o.answer === 'string') return o.answer;
  if (typeof o.interpretation === 'string') return o.interpretation;
  if (Array.isArray(o.paragraphs)) return o.paragraphs.join('\n\n');
  return '';
}

export function AiCorrectionButton({
  surface,
  aiOutput,
  contextSnapshot = {},
  modelVersion,
  patientName,
  summary,
  label = '✎ Corrigir',
  className = 'btn-mini',
  onSaved,
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const saidText = summary || summarizeAiOutput(aiOutput);

  function reset() {
    setText('');
    setReason('');
    setError(null);
    setDone(false);
    setSaving(false);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!text.trim()) {
      setError('Escreva a versão correta para ensinar a IA.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = await submitAiCorrection(
        {
          surface,
          modelVersion,
          contextSnapshot,
          aiOutput,
          correctionText: text,
          reason: reason.trim() || undefined,
        },
        { patientName },
      );
      setDone(true);
      onSaved?.(saved);
      setTimeout(close, 1800);
    } catch (err) {
      setError(err.message || 'Não foi possível registrar a correção.');
      setSaving(false);
    }
  }

  const piiWarning = looksLikeContainsPII(text) || looksLikeContainsPII(reason);

  return (
    <>
      <button
        type="button"
        className={`ai-correct-btn ${className}`}
        title="Corrigir a IA — ensine a versão correta"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onMouseDown={event => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            className="ai-correction-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-correction-title"
          >
            <header className="ai-correction-head">
              <div>
                <p className="small">Ensinar a IA • {AI_SURFACE_LABELS[surface] || surface}</p>
                <h3 id="ai-correction-title">Corrigir a IA</h3>
              </div>
              <button className="quiet-button" type="button" onClick={close}>Fechar</button>
            </header>

            {done ? (
              <div className="inline-success" style={{ margin: 0 }}>
                Correção registrada. A IA já vai considerá-la nas suas próximas análises;
                passará a valer para todas após a aprovação da SuperAdm.
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="ai-correction-form">
                {saidText && (
                  <div className="ai-correction-said">
                    <span className="small"><b>A IA disse:</b></span>
                    <p>{saidText}</p>
                  </div>
                )}

                <label className="ai-correction-field">
                  <span>Como deveria ser (o correto):</span>
                  <textarea
                    value={text}
                    autoFocus
                    rows={4}
                    placeholder="Ex.: a saburra é amarela e gordurosa, não branca — padrão de Umidade-Calor no Aquecedor Médio."
                    onChange={event => setText(event.target.value)}
                  />
                </label>

                <label className="ai-correction-field">
                  <span>Por quê / regra (opcional):</span>
                  <textarea
                    value={reason}
                    rows={2}
                    placeholder="O sinal que decide, a fonte, ou a regra a seguir da próxima vez."
                    onChange={event => setReason(event.target.value)}
                  />
                </label>

                <p className="small ai-correction-note">
                  O texto é anonimizado (nome, CPF, telefone, datas) antes de sair. Não escreva
                  dados que identifiquem o paciente — a correção é conhecimento clínico, não prontuário.
                </p>
                {piiWarning && (
                  <div className="alert" style={{ marginTop: 4 }}>
                    O texto ainda parece conter um identificador. Revise antes de salvar.
                  </div>
                )}
                {error && <div className="inline-error">{error}</div>}

                <div className="ai-correction-actions">
                  <button type="submit" className="primary-button" disabled={saving}>
                    {saving ? 'Salvando…' : 'Salvar correção'}
                  </button>
                  <button type="button" className="quiet-button" onClick={close} disabled={saving}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
