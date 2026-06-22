/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { HEALTH_STATUS, runDeployHealthCheck } from '../../services/deployHealthService';

function statusTone(status) {
  if (status === HEALTH_STATUS.OK) return 'active';
  if (status === HEALTH_STATUS.WARNING) return 'warning';
  return 'blocked';
}

function statusLabel(status) {
  if (status === HEALTH_STATUS.OK) return 'OK';
  if (status === HEALTH_STATUS.WARNING) return 'Atenção';
  return 'Bloqueado';
}

function formatCheckedAt(value) {
  if (!value) return 'Ainda não verificado';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function TechnicalDetails({ value }) {
  if (!value) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);

  return (
    <details className="deploy-health-details">
      <summary>Detalhes técnicos</summary>
      <pre>{text}</pre>
    </details>
  );
}

function DeployHealthRow({ item }) {
  return (
    <article className={`deploy-health-row ${item.status}`}>
      <div className="deploy-health-row-main">
        <div className="deploy-health-row-head">
          <span className={`admin-status ${statusTone(item.status)}`}>
            {statusLabel(item.status)}
          </span>
          <b>{item.title}</b>
        </div>
        <p>{item.detail}</p>
        {item.correction && (
          <small>
            <strong>Correção:</strong> {item.correction}
          </small>
        )}
      </div>
      <TechnicalDetails value={item.technical} />
    </article>
  );
}

function SummaryCard({ label, value, caption, tone = 'total' }) {
  return (
    <div className={`security-card admin-stat-card ${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
      <p>{caption}</p>
    </div>
  );
}

export function DeployHealthPanel() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      setHealth(await runDeployHealthCheck());
    } catch (err) {
      setError(err.message || 'Não foi possível verificar a saúde do deploy.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const groups = useMemo(() => {
    const map = new Map();
    for (const item of health?.items || []) {
      const group = item.group || 'Verificações';
      if (!map.has(group)) map.set(group, []);
      map.get(group).push(item);
    }
    return [...map.entries()];
  }, [health?.items]);

  const summary = health?.summary || { total: 0, ok: 0, warning: 0, blocked: 0 };

  return (
    <section className="deploy-health-panel">
      <div className="start-panel-head">
        <div>
          <p className="small">Deploy e Supabase</p>
          <h2>Saúde do ambiente</h2>
          <span>Verificação objetiva de schema, Storage, Edge Function e migrations críticas.</span>
        </div>
        <button className="quiet-button" type="button" onClick={load} disabled={loading}>
          {loading ? 'Verificando...' : 'Verificar agora'}
        </button>
      </div>

      {error && <div className="inline-error">{error}</div>}

      <div className="admin-stat-grid deploy-health-summary">
        <SummaryCard label="Verificações" value={summary.total} caption="avaliadas" />
        <SummaryCard label="OK" value={summary.ok} caption="sem ação" tone="active" />
        <SummaryCard label="Atenção" value={summary.warning} caption="revisar" tone="pending" />
        <SummaryCard label="Bloqueados" value={summary.blocked} caption="corrigir antes do deploy" tone="suspended" />
      </div>

      <section className="admin-users deploy-health-overview">
        <div className="deploy-health-overview-row">
          <span className={`admin-status ${statusTone(summary.status)}`}>
            {loading ? 'Verificando' : statusLabel(summary.status)}
          </span>
          <div>
            <b>Última verificação</b>
            <small>{loading ? 'Executando checks...' : formatCheckedAt(health?.checkedAt || new Date().toISOString())}</small>
          </div>
        </div>
      </section>

      {loading && !health ? (
        <div className="empty-state">Verificando Supabase, Storage e funções...</div>
      ) : groups.map(([group, items]) => (
        <section className="admin-users deploy-health-section" key={group}>
          <div className="start-panel-head">
            <div>
              <p className="small">{group}</p>
              <h2>{group}</h2>
            </div>
          </div>
          <div className="deploy-health-list">
            {items.map(item => (
              <DeployHealthRow item={item} key={item.id} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}
