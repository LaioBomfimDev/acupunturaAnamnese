import { useEffect, useState } from 'react';
import { listReviewQueue } from '../../services/abaService';
import { reviewStatusLabel } from '../../utils/aba/labels.js';

// Fila da supervisão (sessões aguardando decisão) e correções pedidas a
// quem está logado, de todas as crianças que a pessoa enxerga.
export function AbaReviewQueue({ onOpenPatient }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    listReviewQueue()
      .then(rows => { if (!cancelled) setItems(rows); })
      .catch(loadError => { if (!cancelled) setError(loadError.message); });
    return () => { cancelled = true; };
  }, []);

  if (error) return <div className="aba-page"><p className="aba-error" role="alert">{error}</p></div>;
  if (!items) return <div className="aba-page"><p className="aba-muted">Carregando a fila...</p></div>;

  const supervision = items.filter(item => item.forSupervision);
  const corrections = items.filter(item => !item.forSupervision);

  const list = rows => (
    <div className="aba-review-grid">
      {rows.map(item => (
        <article key={item.id}>
          <div>
            <span className={`aba-status aba-status--${item.reviewStatus}`}>{reviewStatusLabel(item.reviewStatus)}</span>
            <h4>{item.patientName}</h4>
            <p className="aba-muted">{new Date(`${item.date}T12:00:00`).toLocaleDateString('pt-BR')} · {item.therapistName}</p>
            {item.correctionReason && <small>{item.correctionReason}</small>}
            {item.correctionDeadline && <small>Prazo: {new Date(item.correctionDeadline).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>}
          </div>
          <button type="button" className="quiet-button" onClick={() => onOpenPatient(item.patientId, item.id)}>Abrir sessão</button>
        </article>
      ))}
    </div>
  );

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Revisão</p>
          <h2>Sessões aguardando</h2>
          <p className="aba-muted">O que a supervisão precisa decidir e as correções pedidas a você.</p>
        </div>
      </div>
      <section className="aba-card">
        <div className="aba-section-head"><div><p className="aba-eyebrow">Fila da supervisão</p><h3>Aguardando decisão</h3></div><span className="aba-pill">{supervision.length}</span></div>
        {supervision.length ? list(supervision) : <p className="aba-empty">Nenhuma sessão aguardando a sua revisão.</p>}
      </section>
      <section className="aba-card">
        <div className="aba-section-head"><div><p className="aba-eyebrow">Correções</p><h3>Pedidas pela supervisão</h3></div><span className="aba-pill">{corrections.length}</span></div>
        {corrections.length ? list(corrections) : <p className="aba-empty">Nenhuma correção pendente.</p>}
      </section>
    </div>
  );
}

export default AbaReviewQueue;
