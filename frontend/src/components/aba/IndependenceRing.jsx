// Anel de independência (a "bolinha" do Atlas): o arco cresce com o
// percentual de respostas independentes sobre as tentativas preenchidas.
export function IndependenceRing({ percentage, size = 'large', label = 'Independência' }) {
  const safe = percentage ?? 0;
  const ariaLabel = percentage === null || percentage === undefined
    ? `${label}: sem dados`
    : `${label}: ${percentage}%`;

  return (
    <div
      className={`aba-ring aba-ring--${size}`}
      style={{ '--aba-ring-progress': `${safe * 3.6}deg` }}
      role="img"
      aria-label={ariaLabel}
    >
      <div className="aba-ring-disc">
        <strong>{percentage === null || percentage === undefined ? '—' : `${percentage}%`}</strong>
        {size === 'large' && <span>{percentage === null || percentage === undefined ? 'Sem dados' : label}</span>}
      </div>
    </div>
  );
}

export default IndependenceRing;
