import { useEffect, useState } from 'react';
import { loadAiUsageMonth } from '../../services/clinicAssistantService';
import { aiAlertFor, formatUsd, summarizeAiUsage } from '../../utils/aiUsage';

// ============================================================
// Configurações → IA do mês (só a administração, 30/10/2026).
//
// Quanto a IA gastou no mês, por função, e o limite. Os tokens vêm do
// registro de cada chamada (ai_usage_events, a partir de 30/10/2026); o
// dólar é estimativa pela tabela pública da Vertex (utils/aiUsage.js).
// A fatura do Google Cloud é a referência. O limite é definido pela
// equipe do sistema (SuperAdm): aqui só se vê, com aviso em 50%, 80% e
// 100%. No limite, todas as funções de IA da instituição param.
// ============================================================

export function UsoIA() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadAiUsageMonth()
      .then(rows => { if (!cancelled) setSummary(summarizeAiUsage(rows)); })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="gt-empty">Carregando…</p>;

  const alert = summary ? aiAlertFor(summary.limitShare) : null;
  const percent = Math.round((summary?.limitShare || 0) * 100);

  return (
    <section className="gt-custom">
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}
      {alert && (
        <div className={`ca-usage-alert ca-usage-alert--${alert.tone}`} role="status">{alert.text}</div>
      )}

      {summary && (
        <div className="gt-custom-grid">
          <article className="gt-custom-card">
            <header>
              <h3>Gasto estimado do mês</h3>
              <span>{summary.calls} {summary.calls === 1 ? 'chamada' : 'chamadas'}</span>
            </header>
            <p className="ca-usage-total">{formatUsd(summary.totalUsd)}</p>
            {summary.limitUsd !== null && (
              <>
                <div
                  className={`ca-usage-bar${alert ? ` ca-usage-bar--${alert.tone}` : ''}`}
                  role="img"
                  aria-label={`${percent}% do limite`}
                >
                  <span style={{ width: `${percent}%` }} />
                </div>
                <p className="gt-custom-help">{percent}% de {formatUsd(summary.limitUsd)} de limite.</p>
              </>
            )}
            {summary.functions.length > 0 ? (
              <table className="ca-usage-table">
                <thead>
                  <tr><th scope="col">Função</th><th scope="col">Chamadas</th><th scope="col">Estimativa</th></tr>
                </thead>
                <tbody>
                  {summary.functions.map(item => (
                    <tr key={item.id}>
                      <th scope="row">{item.label}</th>
                      <td>{item.calls}</td>
                      <td>{formatUsd(item.usd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="gt-custom-help">Nenhuma chamada de IA registrada neste mês.</p>
            )}
            <p className="gt-custom-help">
              Estimativa pelo uso registrado a partir de 30/10/2026, com o preço público da Vertex em dólar.
              A fatura do Google Cloud é a referência.
            </p>
          </article>

          <article className="gt-custom-card">
            <header>
              <h3>Limite do mês</h3>
              <span>{summary.limitUsd === null ? 'Sem limite' : formatUsd(summary.limitUsd)}</span>
            </header>
            <p className="gt-custom-help">
              O limite é definido pela equipe do sistema. O gasto soma todas as funções de IA da
              instituição: ao chegar no limite, elas param até o mês virar ou o limite subir.
            </p>
            <p className="gt-custom-help">Avisos aparecem aqui e em “Sua atenção hoje” ao chegar em 50%, 80% e 100%.</p>
          </article>
        </div>
      )}
    </section>
  );
}

export default UsoIA;
