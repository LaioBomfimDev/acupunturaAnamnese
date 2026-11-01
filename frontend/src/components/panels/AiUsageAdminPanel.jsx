import { useEffect, useState } from 'react';
import { loadAiUsageEvents, loadAiUsageOverview, saveClinicAiLimit } from '../../services/clinicAssistantService';
import {
  AI_FUNCTION_LABELS,
  AI_USD_TO_BRL,
  aiAlertFor,
  eventCostUsd,
  formatBrl,
  formatUsd,
  summarizeAiByPerson,
  summarizeAiOverview,
  withLimit,
} from '../../utils/aiUsage';

// ============================================================
// SuperAdm → IA por instituição (30/10/2026).
//
// O gasto de IA do mês de cada instituição, com o limite que só o
// SuperAdm define (superadmin_set_ai_limit). Quem paga a conta do Google
// é a dona do sistema; ao vender para outras clínicas, o limite de cada
// uma é a cota do plano. Avisos em 50%, 80% e 100% (utils/aiUsage.js).
// O uso sem instituição (o próprio SuperAdm) aparece por último, sem
// limite. Embaixo, o gasto de cada pessoa e cada ação do mês, em real
// (câmbio de referência em utils/aiUsage.js), pedido de 31/10/2026.
// ============================================================

function parseUsd(text) {
  const clean = String(text || '').trim().replace(/\s/g, '').replace(/^US\$/i, '').replace(',', '.');
  if (!clean) return null;
  const value = Number(clean);
  return Number.isFinite(value) && value >= 0 && value <= 10000 ? Math.round(value * 100) / 100 : NaN;
}

function usdInput(value) {
  return value === null || value === undefined ? '' : value.toFixed(2).replace('.', ',');
}

function ClinicRow({ clinic, onSaved }) {
  const [text, setText] = useState(usdInput(clinic.limitUsd));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const percent = Math.round((clinic.limitShare || 0) * 100);
  const inputId = `ai-limit-${clinic.id}`;

  async function save(event) {
    event.preventDefault();
    const value = parseUsd(text);
    if (Number.isNaN(value)) {
      setError('Escreva o limite em dólar, de 0 a 10.000 (ex.: 20,00), ou deixe vazio para não ter limite.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveClinicAiLimit(clinic.id, value);
      setText(usdInput(value));
      onSaved(clinic.id, value);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="ca-admin-row">
      <header className="ca-admin-row-head">
        <h3>{clinic.name}</h3>
        {clinic.alert && <span className={`ca-admin-badge ca-admin-badge--${clinic.alert.tone}`}>{clinic.alert.level}%</span>}
      </header>
      <p className="ca-admin-numbers">
        <b>{formatBrl(clinic.totalUsd)}</b> ({formatUsd(clinic.totalUsd)})
        {clinic.limitUsd === null ? ' · sem limite' : ` de ${formatUsd(clinic.limitUsd)} (${percent}%)`}
        {` · ${clinic.calls} ${clinic.calls === 1 ? 'chamada' : 'chamadas'}`}
      </p>
      {clinic.limitUsd !== null && (
        <div className={`ca-usage-bar${clinic.alert ? ` ca-usage-bar--${clinic.alert.tone}` : ''}`} role="img" aria-label={`${percent}% do limite`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {clinic.functions.length > 0 && (
        <p className="ca-admin-functions">
          {clinic.functions.map(item => `${item.label}: ${formatUsd(item.usd)}`).join(' · ')}
        </p>
      )}
      {clinic.id && (
        <form className="ca-usage-limit" onSubmit={save}>
          <label htmlFor={inputId}>Limite do mês em dólar (vazio = sem limite)</label>
          <div className="ca-usage-limit-row">
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="20,00"
              disabled={saving}
            />
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar limite'}
            </button>
          </div>
          {error && <p className="ca-error" role="alert">{error}</p>}
        </form>
      )}
    </article>
  );
}

const WHEN = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo',
});

/** Gasto do mês por pessoa e a lista de cada ação, em real. */
function PeopleUsage({ events }) {
  const [showAll, setShowAll] = useState(false);
  const people = summarizeAiByPerson(events);
  const visible = showAll ? events : events.slice(0, 50);
  if (!events.length) return <p className="ca-admin-functions">Nenhuma ação de IA neste mês.</p>;
  return (
    <>
      <section className="ca-admin-row" aria-labelledby="ai-por-pessoa">
        <h3 id="ai-por-pessoa">Por pessoa</h3>
        <div className="ca-admin-table-wrap">
          <table className="ca-usage-table">
            <thead>
              <tr><th scope="col">Pessoa</th><th scope="col">Instituição</th><th scope="col">Ações</th><th scope="col">Gasto</th></tr>
            </thead>
            <tbody>
              {people.map(person => (
                <tr key={person.id || 'sem-pessoa'}>
                  <th scope="row">
                    {person.name}
                    <small className="ca-admin-sub">{person.functions.map(fn => `${fn.label}: ${fn.actions}`).join(' · ')}</small>
                  </th>
                  <td>{person.clinic}</td>
                  <td>{person.actions}</td>
                  <td>{formatBrl(person.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ca-admin-row" aria-labelledby="ai-por-acao">
        <h3 id="ai-por-acao">Cada ação</h3>
        <div className="ca-admin-table-wrap">
          <table className="ca-usage-table">
            <thead>
              <tr><th scope="col">Quando</th><th scope="col">Pessoa</th><th scope="col">Função</th><th scope="col">Tokens</th><th scope="col">Gasto</th></tr>
            </thead>
            <tbody>
              {visible.map((row, index) => (
                <tr key={`${row.quando}-${index}`}>
                  <td>{WHEN.format(new Date(row.quando))}</td>
                  <th scope="row">{row.pessoa || 'Sem nome'}</th>
                  <td>{AI_FUNCTION_LABELS[row.funcao] || row.funcao}</td>
                  <td>{((row.entrada || 0) + (row.saida || 0) + (row.raciocinio || 0)).toLocaleString('pt-BR')}</td>
                  <td>{formatBrl(eventCostUsd(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {events.length > visible.length && (
          <button type="button" className="quiet-button" onClick={() => setShowAll(true)}>
            Mostrar todas as {events.length} ações do mês
          </button>
        )}
      </section>
    </>
  );
}

export function AiUsageAdminPanel() {
  const [clinics, setClinics] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadAiUsageOverview(), loadAiUsageEvents()])
      .then(([rows, eventRows]) => {
        if (cancelled) return;
        setClinics(summarizeAiOverview(rows));
        setEvents(eventRows);
      })
      .catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  function updateLimit(clinicId, limitUsd) {
    setClinics(current => current.map(clinic => {
      if (clinic.id !== clinicId) return clinic;
      const next = withLimit(clinic, limitUsd);
      return { ...next, alert: aiAlertFor(next.limitShare) };
    }));
  }

  const totalUsd = (clinics || []).reduce((sum, clinic) => sum + clinic.totalUsd, 0);

  return (
    <section className="ca-admin">
      <header className="ca-admin-head">
        <h2>IA por instituição</h2>
        <p>
          Gasto estimado deste mês com a IA, por instituição, e o limite de cada uma. Ao chegar no limite,
          todas as funções de IA da instituição param até o mês virar ou o limite subir. A administração
          da instituição vê o gasto e os avisos de 50%, 80% e 100%, mas não muda o limite.
        </p>
        {clinics && (
          <p className="ca-admin-total">
            Total do mês: <b>{formatBrl(totalUsd)}</b> ({formatUsd(totalUsd)}). Estimativa pelo preço do Google em dólar,
            com câmbio de referência de R$ {AI_USD_TO_BRL.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}; a fatura do
            Google Cloud é a referência.
          </p>
        )}
      </header>
      {error && <div className="ca-usage-alert ca-usage-alert--full" role="alert">{error}</div>}
      {!clinics && !error && <p>Carregando…</p>}
      {clinics && clinics.map(clinic => (
        <ClinicRow key={clinic.id || 'sem-instituicao'} clinic={clinic} onSaved={updateLimit} />
      ))}
      {events && <PeopleUsage events={events} />}
    </section>
  );
}

export default AiUsageAdminPanel;
