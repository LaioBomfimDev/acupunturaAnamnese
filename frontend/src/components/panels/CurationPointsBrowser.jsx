// ============================================================
// Navegador da base completa de pontos (curadoria)
//
// Lista os ~329 pontos corporais curados e separa "comuns" (visíveis
// aos usuários comuns) dos "ocultos" (os ~300 restantes). A revisora
// pode PROPOR promover um ponto oculto → comumente usado; o SuperAdm
// pode promover na hora (override live) ou aprovar a proposta na fila.
// Nada é excluído — só promovido.
// ============================================================

import { useMemo, useState } from 'react';
import { curatedAcupoints } from '../../knowledge/generated/curated-body-points';
import { isCommonlyUsedPointKey } from '../../knowledge/commonlyUsedPoints';
import { addCommonlyUsedOverride } from '../../knowledge/commonlyUsedOverrides';
import { submitCurationProposal } from '../../services/curationProposalService';

function asSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function buildPointList() {
  const byCode = new Map();
  for (const point of curatedAcupoints) {
    const code = point.code || point.displayCode;
    if (!code || byCode.has(code)) continue;
    byCode.set(code, {
      code,
      displayCode: point.displayCode || code,
      name: point?.names?.pt || point?.names?.en || '',
      meridian: point?.meridian?.pt || point?.meridian?.code || '',
    });
  }
  return Array.from(byCode.values()).sort((a, b) => a.displayCode.localeCompare(b.displayCode));
}

export function CurationPointsBrowser({ actor = { role: 'super_admin', label: 'SuperAdm', mode: 'approve' } }) {
  const isPropose = actor?.mode === 'propose';
  const [filter, setFilter] = useState('hidden');
  const [query, setQuery] = useState('');
  const [statusByCode, setStatusByCode] = useState({});
  const [message, setMessage] = useState('');
  // Contador para forçar recomputo depois de promover (override é lido de localStorage).
  const [version, setVersion] = useState(0);

  const allPoints = useMemo(() => buildPointList(), []);

  const decorated = useMemo(() => {
    // `version` participa da dependência para reavaliar após promoções.
    void version;
    return allPoints.map(point => ({
      ...point,
      common: isCommonlyUsedPointKey(point.code),
    }));
  }, [allPoints, version]);

  const counts = useMemo(() => ({
    all: decorated.length,
    common: decorated.filter(p => p.common).length,
    hidden: decorated.filter(p => !p.common).length,
  }), [decorated]);

  const visible = useMemo(() => {
    const term = asSearchText(query.trim());
    return decorated.filter(point => {
      if (filter === 'common' && !point.common) return false;
      if (filter === 'hidden' && point.common) return false;
      if (!term) return true;
      return asSearchText(`${point.displayCode} ${point.code} ${point.name} ${point.meridian}`).includes(term);
    });
  }, [decorated, filter, query]);

  async function handlePropose(point) {
    setMessage('');
    setStatusByCode(prev => ({ ...prev, [point.code]: 'saving' }));
    try {
      await submitCurationProposal({
        type: 'point_promote_common',
        targetRef: point.code,
        payload: { code: point.code, displayCode: point.displayCode, name: point.name, meridian: point.meridian },
        proposerName: actor?.label || '',
      });
      setStatusByCode(prev => ({ ...prev, [point.code]: 'proposed' }));
      setMessage(`Proposta enviada ao SuperAdm: promover ${point.displayCode} a comumente usado.`);
    } catch (err) {
      setStatusByCode(prev => ({ ...prev, [point.code]: 'error' }));
      setMessage(err?.message || 'Não foi possível enviar a proposta.');
    }
  }

  function handlePromoteNow(point) {
    addCommonlyUsedOverride(point.code);
    setVersion(v => v + 1);
    setMessage(`${point.displayCode} agora aparece como comumente usado.`);
  }

  return (
    <section className="box" style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 18, padding: 20 }}>
      <div className="start-panel-head" style={{ marginBottom: 12 }}>
        <div>
          <p className="small">Curadoria de pontos</p>
          <h2>Base completa · comuns e ocultos</h2>
          <span className="small">
            {counts.common} comuns · {counts.hidden} ocultos · {counts.all} no total
          </span>
        </div>
      </div>

      {message && <div className="inline-success" style={{ marginBottom: 12 }}>{message}</div>}

      <div className="admin-toolbar" style={{ marginBottom: 12 }}>
        <input
          className="admin-search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Buscar por código, nome ou meridiano"
        />
        <div className="admin-filter" aria-label="Filtrar pontos">
          {[
            ['hidden', `Ocultos (${counts.hidden})`],
            ['common', `Comuns (${counts.common})`],
            ['all', `Todos (${counts.all})`],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'active' : ''}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="empty-state">Nenhum ponto neste filtro.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 560, overflowY: 'auto' }}>
          {visible.map(point => {
            const status = statusByCode[point.code];
            return (
              <div
                key={point.code}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                  background: 'white', border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px',
                }}
              >
                <div>
                  <b style={{ color: 'var(--navy)' }}>{point.displayCode}</b>
                  {point.name ? <span style={{ marginLeft: 8, color: '#334155' }}>{point.name}</span> : null}
                  {point.meridian ? <small style={{ display: 'block', color: '#64748b' }}>{point.meridian}</small> : null}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                  {point.common ? (
                    <span className="tag active" style={{ background: '#e6f4ea', color: '#137333', borderColor: '#137333' }}>
                      Comumente usado
                    </span>
                  ) : status === 'proposed' ? (
                    <span className="tag" style={{ color: '#8a6d00', borderColor: '#e0c66b' }}>Enviado ao SuperAdm</span>
                  ) : isPropose ? (
                    <button
                      className="curation-row-cta"
                      type="button"
                      onClick={() => handlePropose(point)}
                      disabled={status === 'saving'}
                    >
                      {status === 'saving' ? 'Enviando...' : '+ Propor como comum'}
                    </button>
                  ) : (
                    <button className="tag active" type="button" onClick={() => handlePromoteNow(point)}>
                      Tornar comum agora
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
