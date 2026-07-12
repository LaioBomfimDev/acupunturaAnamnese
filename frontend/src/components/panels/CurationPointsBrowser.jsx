// ============================================================
// Navegador da base completa de pontos (curadoria)
//
// Lista os ~329 pontos corporais curados e separa "comuns" (visíveis
// aos usuários comuns) dos "ocultos" (os ~300 restantes). Tocar no nome
// abre a FICHA do ponto (localização, agulhamento, ações, indicações,
// cautelas) para a revisora conferir antes de propor. Ela pode PROPOR
// promover um ponto oculto → comumente usado; o SuperAdm pode promover
// na hora. Nada é excluído — só promovido.
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

function toList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
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
      nameZh: point?.names?.zh || '',
      meridian: point?.meridian?.pt || point?.meridian?.code || '',
      location: point?.locationText || '',
      needling: point?.needlingText || '',
      actions: toList(point?.actions),
      indications: toList(point?.indications),
      cautions: toList(point?.cautions),
    });
  }
  return Array.from(byCode.values()).sort((a, b) => a.displayCode.localeCompare(b.displayCode));
}

function DetailBlock({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <p className="small" style={{ margin: '0 0 4px', color: 'var(--navy)', fontWeight: 700 }}>{title}</p>
      {children}
    </div>
  );
}

function PointDetailModal({ point, common, status, isPropose, onPropose, onPromoteNow, onClose }) {
  if (!point) return null;
  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label={`Ficha do ponto ${point.displayCode}`}>
      <div className="admin-profile-panel" style={{ maxWidth: 560 }}>
        <div className="admin-profile-head">
          <div>
            <p className="small">Ficha do ponto</p>
            <h2>{point.displayCode} · {point.name}</h2>
            <span>{[point.meridian, point.nameZh].filter(Boolean).join(' · ')}</span>
          </div>
          <button className="quiet-button" type="button" onClick={onClose}>Fechar</button>
        </div>

        <div style={{ padding: '4px 2px 8px' }}>
          {point.location && (
            <DetailBlock title="Localização">
              <p style={{ margin: 0, color: '#334155', fontSize: 14, lineHeight: 1.5 }}>{point.location}</p>
            </DetailBlock>
          )}
          {point.needling && (
            <DetailBlock title="Agulhamento">
              <p style={{ margin: 0, color: '#334155', fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-line' }}>{point.needling}</p>
            </DetailBlock>
          )}
          {point.actions.length > 0 && (
            <DetailBlock title="Ações">
              <ul style={{ margin: 0, paddingLeft: 18, color: '#334155', fontSize: 14, lineHeight: 1.5 }}>
                {point.actions.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </DetailBlock>
          )}
          {point.indications.length > 0 && (
            <DetailBlock title="Indicações">
              <ul style={{ margin: 0, paddingLeft: 18, color: '#334155', fontSize: 14, lineHeight: 1.5 }}>
                {point.indications.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </DetailBlock>
          )}
          {point.cautions.length > 0 && (
            <DetailBlock title="Cautelas">
              <ul style={{ margin: 0, paddingLeft: 18, color: '#b45309', fontSize: 14, lineHeight: 1.5 }}>
                {point.cautions.map((item, i) => <li key={i}>{item}</li>)}
              </ul>
            </DetailBlock>
          )}
        </div>

        <div className="admin-profile-actions" style={{ borderTop: '1px solid var(--line)', paddingTop: 14, marginTop: 6 }}>
          {common ? (
            <span className="tag active" style={{ background: '#e6f4ea', color: '#137333', borderColor: '#137333' }}>
              Já é comumente usado
            </span>
          ) : status === 'proposed' ? (
            <span className="tag" style={{ color: '#8a6d00', borderColor: '#e0c66b' }}>Enviado ao SuperAdm</span>
          ) : isPropose ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => onPropose(point)}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Enviando...' : 'Propor como comumente usado'}
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => onPromoteNow(point)}>
              Tornar comum agora
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CurationPointsBrowser({ actor = { role: 'super_admin', label: 'SuperAdm', mode: 'approve' } }) {
  const isPropose = actor?.mode === 'propose';
  const [filter, setFilter] = useState('hidden');
  const [query, setQuery] = useState('');
  const [statusByCode, setStatusByCode] = useState({});
  const [message, setMessage] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
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

  const selected = useMemo(
    () => decorated.find(p => p.code === selectedCode) || null,
    [decorated, selectedCode],
  );

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
            {counts.common} comuns · {counts.hidden} ocultos · {counts.all} no total · toque no nome para ver a ficha
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
                  background: 'white', border: '1px solid var(--line)', borderRadius: 12, padding: '6px 8px 6px 14px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setSelectedCode(point.code)}
                  title="Ver ficha do ponto"
                  style={{
                    flex: 1, textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
                    padding: '4px 0', display: 'flex', flexDirection: 'column', gap: 2,
                  }}
                >
                  <span>
                    <b style={{ color: 'var(--navy)', textDecoration: 'underline', textDecorationColor: 'var(--line)' }}>{point.displayCode}</b>
                    {point.name ? <span style={{ marginLeft: 8, color: '#334155' }}>{point.name}</span> : null}
                  </span>
                  {point.meridian ? <small style={{ color: '#64748b' }}>{point.meridian} · ver ficha</small> : <small style={{ color: '#64748b' }}>ver ficha</small>}
                </button>
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

      {selected && (
        <PointDetailModal
          point={selected}
          common={selected.common}
          status={statusByCode[selected.code]}
          isPropose={isPropose}
          onPropose={handlePropose}
          onPromoteNow={handlePromoteNow}
          onClose={() => setSelectedCode('')}
        />
      )}
    </section>
  );
}
