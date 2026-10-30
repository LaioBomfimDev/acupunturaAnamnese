import { useEffect, useState } from 'react';
import { loadAiUsageMonth, saveAiMonthlyLimit } from '../../services/clinicAssistantService';
import { formatUsd, summarizeAiUsage, withLimit } from '../../utils/aiUsage';

// ============================================================
// Configurações → IA do mês (só a administração, 30/10/2026).
//
// Quanto a IA gastou no mês, por função, e o teto. Os tokens vêm do
// registro de cada chamada (ai_usage_events, a partir de 30/10/2026); o
// dólar é estimativa pela tabela pública da Vertex (utils/aiUsage.js).
// A fatura do Google Cloud é a referência. No teto, só a assistente
// para; as funções clínicas continuam, para não travar um atendimento.
// ============================================================

function parseUsd(text) {
  const clean = String(text || '').trim().replace(/\s/g, '').replace(/^US\$/i, '').replace(',', '.');
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 && value <= 10000 ? Math.round(value * 100) / 100 : NaN;
}

function usdInput(value) {
  return value === null || value === undefined ? '' : String(value.toFixed(2)).replace('.', ',');
}

export function UsoIA() {
  const [summary, setSummary] = useState(null);
  const [limitText, setLimitText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadAiUsageMonth()
      .then(rows => {
        if (cancelled) return;
        const next = summarizeAiUsage(rows);
        setSummary(next);
        setLimitText(usdInput(next.limitUsd));
      })
      .catch(err => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function saveLimit(event) {
    event.preventDefault();
    const value = parseUsd(limitText);
    if (Number.isNaN(value)) {
      setError('Escreva o teto em dólar, de 0 a 10.000 (ex.: 20,00), ou deixe vazio para não ter teto.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await saveAiMonthlyLimit(value);
      setSummary(current => withLimit(current, value));
      setLimitText(usdInput(value));
      setNotice(value === null ? 'Salvo. A assistente não tem teto neste mês.' : `Salvo. Teto de ${formatUsd(value)} por mês.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="gt-empty">Carregando…</p>;

  return (
    <section className="gt-custom">
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}
      {notice && <div className="gt-notice gt-notice-success" role="status">{notice}</div>}

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
                  className={`ca-usage-bar${summary.limitReached ? ' ca-usage-bar--full' : ''}`}
                  role="img"
                  aria-label={`${Math.round((summary.limitShare || 0) * 100)}% do teto`}
                >
                  <span style={{ width: `${Math.round((summary.limitShare || 0) * 100)}%` }} />
                </div>
                <p className="gt-custom-help">
                  {summary.limitReached
                    ? `Teto de ${formatUsd(summary.limitUsd)} atingido: a assistente fica parada até o mês virar.`
                    : `de ${formatUsd(summary.limitUsd)} de teto.`}
                </p>
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
              <h3>Teto do mês</h3>
              <span>{summary.limitUsd === null ? 'Sem teto' : formatUsd(summary.limitUsd)}</span>
            </header>
            <form className="ca-usage-limit" onSubmit={saveLimit}>
              <label htmlFor="ai-monthly-limit">Teto em dólar (vazio = sem teto)</label>
              <div className="ca-usage-limit-row">
                <input
                  id="ai-monthly-limit"
                  type="text"
                  inputMode="decimal"
                  value={limitText}
                  onChange={event => setLimitText(event.target.value)}
                  placeholder="20,00"
                  disabled={saving}
                />
                <button type="submit" className="gt-btn gt-btn--primary" disabled={saving}>
                  {saving ? 'Salvando…' : 'Salvar teto'}
                </button>
              </div>
            </form>
            <p className="gt-custom-help">
              O gasto do mês soma todas as funções de IA. Quando chega no teto, só a assistente para;
              as funções dos atendimentos continuam, para não travar ninguém no meio de uma sessão.
            </p>
          </article>
        </div>
      )}
    </section>
  );
}

export default UsoIA;
