import { useState } from 'react';
import { Panel } from '../ui/Panel';

export function PsychologyHypotheses({ session, onReviewsChange, onOpenAnamnese }) {
  const [manualName, setManualName] = useState('');
  const candidates = Array.isArray(session.aiReading?.hypotheses) ? session.aiReading.hypotheses : [];
  const reviews = Array.isArray(session.hypothesisReviews) ? session.hypothesisReviews : [];

  function upsert(candidate, status) {
    const existing = reviews.find(item => item.name === candidate.name);
    const next = existing
      ? reviews.map(item => item.name === candidate.name
        ? { ...item, status, basis: candidate.basis || item.basis, updatedAt: new Date().toISOString() }
        : item)
      : [...reviews, {
        id: `hypothesis-ai-${encodeURIComponent(candidate.name.toLowerCase())}`,
        name: candidate.name,
        basis: candidate.basis || '',
        confidence: candidate.confidence,
        status,
        source: 'leitura_assistiva_base_pdf_em_revisao',
        updatedAt: new Date().toISOString(),
      }];
    onReviewsChange(next);
  }

  function updateReview(index, field, value) {
    onReviewsChange(reviews.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value, updatedAt: new Date().toISOString() } : item
    )));
  }

  function addManual() {
    const name = manualName.trim();
    if (!name) return;
    onReviewsChange([...reviews, {
      id: `hypothesis-professional-${reviews.length + 1}`,
      name,
      basis: '',
      confidence: null,
      status: 'em_revisao',
      source: 'profissional',
      updatedAt: new Date().toISOString(),
    }]);
    setManualName('');
  }

  return (
    <Panel title="Hipóteses de trabalho — Psicologia">
      <div className="alert psi-draft-banner">
        <b>Gate humano obrigatório.</b> As hipóteses sugeridas usam o caso estruturado e os eixos
        extraídos da base de PDFs ainda em curadoria. Nenhuma sugestão é diagnóstico e nada é
        confirmado sem decisão da psicóloga.
      </div>

      {candidates.length === 0 ? (
        <div className="box">
          <h3>Nenhuma hipótese sugerida ainda</h3>
          <p>Preencha a anamnese e gere uma “Leitura da IA” para trazer candidatas a esta fila.</p>
          <button type="button" className="primary-button" onClick={onOpenAnamnese}>Abrir anamnese</button>
        </div>
      ) : (
        <div className="psi-hypothesis-review-grid">
          {candidates.map(candidate => {
            const review = reviews.find(item => item.name === candidate.name);
            return (
              <div key={candidate.name} className="box psi-hypothesis-review-card">
                <p className="app-eyebrow">Candidata da leitura assistiva</p>
                <h3>{candidate.name}</h3>
                <p>{candidate.basis}</p>
                <p className="small">
                  Confiança da sugestão: {Math.round(Number(candidate.confidence || 0) * 100)}% —
                  não representa certeza clínica.
                </p>
                <div className="psi-neuro-row-actions">
                  <button type="button" className="tag active" onClick={() => upsert(candidate, 'aceita_como_hipotese')}>Aceitar como hipótese</button>
                  <button type="button" className="tag" onClick={() => upsert(candidate, 'em_revisao')}>Manter em revisão</button>
                  <button type="button" className="tag" onClick={() => upsert(candidate, 'rejeitada')}>Rejeitar</button>
                </div>
                {review && <p className="small"><b>Decisão atual:</b> {review.status.replaceAll('_', ' ')}</p>}
              </div>
            );
          })}
        </div>
      )}

      <div className="box">
        <h3>Adicionar hipótese escrita pela profissional</h3>
        <div className="psi-neuro-row-actions">
          <input
            lang="pt-BR"
            spellCheck
            value={manualName}
            onChange={event => setManualName(event.target.value)}
            placeholder="Hipótese provisória"
          />
          <button type="button" className="tag active" onClick={addManual}>Adicionar em revisão</button>
        </div>
      </div>

      {reviews.length > 0 && (
        <div className="psi-hypothesis-decisions">
          <h3>Decisões registradas</h3>
          {reviews.map((item, index) => (
            <div key={item.id || index} className="box">
              <label>
                Hipótese
                <input value={item.name || ''} onChange={event => updateReview(index, 'name', event.target.value)} />
              </label>
              <label>
                Fundamentação revisada pela profissional
                <textarea value={item.basis || ''} onChange={event => updateReview(index, 'basis', event.target.value)} />
              </label>
              <label>
                Estado
                <select value={item.status || 'em_revisao'} onChange={event => updateReview(index, 'status', event.target.value)}>
                  <option value="em_revisao">Em revisão</option>
                  <option value="aceita_como_hipotese">Aceita como hipótese de trabalho</option>
                  <option value="rejeitada">Rejeitada</option>
                </select>
              </label>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
