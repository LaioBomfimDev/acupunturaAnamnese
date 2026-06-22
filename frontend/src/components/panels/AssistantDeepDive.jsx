// ============================================================
// COMPONENTE: Aprofundamento de raciocínio com IA (Fase 2)
// Vive no rail "IA Assistente". A síntese determinística continua ao
// vivo acima; aqui, SOB DEMANDA, o Gemini explica/enriquece o caso.
// ============================================================

import { useState } from 'react';
import {
  deepenClinicalReasoning,
  caseHasEvidence,
  REASONING_DISCLAIMER,
} from '../../services/clinicalReasoningService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';

export function AssistantDeepDive({ state, selectedMap, synthesis, patientName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const canRun = caseHasEvidence(state, selectedMap, synthesis);

  async function handleDeepen() {
    setError(null);
    setLoading(true);
    try {
      const res = await deepenClinicalReasoning(state, selectedMap, synthesis, { patientName });
      setResult(res);
    } catch (err) {
      setError(err.message || 'Falha ao aprofundar o raciocínio.');
    } finally {
      setLoading(false);
    }
  }

  const isMock = result?.modelVersion?.startsWith('mock');

  return (
    <div className="synth-block synth-deepdive">
      <button
        type="button"
        className="ai-analyze-btn"
        style={{ margin: '4px 0 0', width: '100%' }}
        disabled={loading || !canRun}
        onClick={handleDeepen}
      >
        {loading ? 'Raciocinando…' : result ? 'Aprofundar novamente' : '✦ Aprofundar com IA'}
      </button>
      {!canRun && (
        <p className="small" style={{ marginTop: 6 }}>Preencha sinais ou a anamnese para habilitar.</p>
      )}

      {error && <div className="alert" style={{ marginTop: 8 }}>{error}</div>}

      {result && (
        <div className="deepdive-result" style={{ marginTop: 10 }}>
          {result.warning && (
            <div className="alert" style={{ marginBottom: 8 }}>{result.warning}</div>
          )}

          {result.redFlags?.length > 0 && (
            <div className="deepdive-section deepdive-redflags">
              <span className="synth-label" style={{ color: '#b3261e' }}>⚠ Sinais de alerta</span>
              <ul>
                {result.redFlags.map((f, i) => (
                  <li key={i}><b>{f.sign}</b>{f.action ? ` — ${f.action}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="deepdive-section">
            <span className="synth-label">Interpretação</span>
            <p>{result.interpretation}</p>
          </div>

          {result.differentialReasoning && (
            <div className="deepdive-section">
              <span className="synth-label">Diferencial</span>
              <p>{result.differentialReasoning}</p>
            </div>
          )}

          {result.contradictions?.length > 0 && (
            <div className="deepdive-section">
              <span className="synth-label">Contradições</span>
              <ul>
                {result.contradictions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          {result.questions?.length > 0 && (
            <div className="deepdive-section">
              <span className="synth-label">Perguntas a investigar</span>
              <ul>
                {result.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}

          <p className="small deepdive-disclaimer" style={{ marginTop: 8 }}>
            {REASONING_DISCLAIMER} Modelo: {result.modelVersion}{isMock ? ' (simulado)' : ''}.
          </p>
          <div className="deepdive-correct-row">
            <AiCorrectionButton
              surface={AI_SURFACES.CLINICAL_REASONING}
              aiOutput={{
                interpretation: result.interpretation,
                differentialReasoning: result.differentialReasoning,
              }}
              contextSnapshot={{ primary: synthesis?.primaryName || null }}
              modelVersion={result.modelVersion}
              patientName={patientName}
              label="✎ Corrigir o raciocínio"
            />
          </div>
        </div>
      )}
    </div>
  );
}
