// ============================================================
// Curadoria da Anamnese de Psicologia
//
// Mostra a base curável (risco / eixos / checklist / perguntas) semeada
// em psych_curation_items. Em modo "propor" (revisora), cada decisão de
// grupo — aprovar / editar / rejeitar + redação pt-BR — vira uma proposta
// na fila do SuperAdm. Em modo "aprovar" (SuperAdm), é leitura da base
// (a aprovação final acontece na fila de propostas).
//
// Guardrails: nada aqui é conteúdo final. Os trechos são EVIDÊNCIA de
// fonte protegida (source-only); só a síntese pt-BR revisada vira base.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import {
  loadPsychCurationItems,
  PSYCH_PROPOSAL_TYPE,
  PSYCH_KIND_LABEL,
} from '../../services/psychCurationService';
import { submitCurationProposal } from '../../services/curationProposalService';

export function PsychAnamneseCurationPanel({ actor = { role: 'super_admin', label: 'SuperAdm', mode: 'approve' } }) {
  const isPropose = actor?.mode === 'propose';
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [data, setData] = useState({ grouped: {}, kinds: [], total: 0 });
  const [activeKind, setActiveKind] = useState('risk');
  const [selectedId, setSelectedId] = useState(null);
  const [wording, setWording] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const result = await loadPsychCurationItems();
        if (!alive) return;
        setData(result);
        setActiveKind(result.kinds[0] || 'risk');
        setLoadState('ready');
      } catch (err) {
        if (!alive) return;
        setError(err?.message || 'Não foi possível carregar a base de curadoria.');
        setLoadState('error');
      }
    })();
    return () => { alive = false; };
  }, []);

  const groups = useMemo(() => data.grouped[activeKind] || [], [data, activeKind]);
  const selected = useMemo(
    () => groups.find(g => g.id === selectedId) || null,
    [groups, selectedId],
  );

  function selectGroup(group) {
    // ao escolher um grupo, pré-carrega a redação com o rótulo como ponto de partida
    setSelectedId(group.id);
    setWording(String(group.label || ''));
    setMessage('');
  }

  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);

  async function propose(decision) {
    if (!selected) return;
    const type = PSYCH_PROPOSAL_TYPE[selected.kind];
    if (!type) {
      setMessage('Este tipo não é proponível (perguntas são apenas inspiração).');
      return;
    }
    if (decision !== 'rejected' && !String(wording).trim()) {
      setMessage('Escreva a redação final (pt-BR) antes de aprovar/editar.');
      return;
    }
    setBusy(true);
    try {
      await submitCurationProposal({
        type,
        targetRef: selected.id,
        payload: {
          decision,
          kind: selected.kind,
          label: selected.label,
          wording: String(wording).trim(),
          meta: selected.meta,
          evidenceCount: selected.unique_evidence,
        },
        note: `${PSYCH_KIND_LABEL[selected.kind]}: ${selected.label}`,
        proposerName: actor?.label || '',
      });
      setMessage(decision === 'rejected'
        ? 'Proposta de reprovação enviada ao SuperAdm.'
        : 'Proposta enviada ao SuperAdm.');
    } catch (err) {
      setMessage(err?.message || 'Não foi possível enviar a proposta.');
    } finally {
      setBusy(false);
    }
  }

  if (loadState === 'loading') {
    return <section className="admin-knowledge"><div className="empty-state">Carregando base de curadoria de psicologia…</div></section>;
  }
  if (loadState === 'error') {
    return (
      <section className="admin-knowledge">
        <div className="inline-error">{error}</div>
        <p className="small" style={{ marginTop: 8 }}>
          Se a tabela ainda não foi semeada, rode <code>seed-psych-curation-items.mjs</code>.
        </p>
      </section>
    );
  }
  if (data.total === 0) {
    return (
      <section className="admin-knowledge">
        <div className="empty-state">Nenhum item na base ainda. Rode o seed para popular <code>psych_curation_items</code>.</div>
      </section>
    );
  }

  return (
    <section className="admin-knowledge anamnese-knowledge-panel">
      <header className="admin-knowledge-head">
        <div>
          <h2>Curadoria da Anamnese · Psicologia</h2>
          <p className="small">{actor?.label || 'SuperAdm'} • {isPropose ? 'modo propor' : 'leitura'}</p>
        </div>
      </header>

      <div className="inline-notice" style={{ marginBottom: 12 }}>
        Os trechos são <b>evidência de origem</b> (manuais protegidos) — não são conteúdo final.
        Nada verbatim entra no app. Escreva a <b>síntese pt-BR revisada</b> e proponha.
      </div>

      {/* Abas por tipo */}
      <div className="tab-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {data.kinds.map(kind => (
          <button
            key={kind}
            type="button"
            className="chip"
            onClick={() => { setActiveKind(kind); setSelectedId(null); }}
            style={activeKind === kind ? { background: 'var(--brand, #2f6f4f)', color: '#fff', borderColor: 'transparent' } : undefined}
          >
            {PSYCH_KIND_LABEL[kind]} ({(data.grouped[kind] || []).length})
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Lista de grupos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {groups.map(g => {
            const isSel = selectedId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => selectGroup(g)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  cursor: 'pointer',
                  font: 'inherit',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: `1px solid ${isSel ? 'var(--brand, #2f6f4f)' : 'var(--line, #e3e8ee)'}`,
                  background: isSel ? 'var(--soft, #fff8e8)' : '#fff',
                }}
              >
                <b style={{ display: 'block', color: 'var(--navy, #0b2545)', fontSize: 14, overflowWrap: 'break-word', wordBreak: 'normal' }}>
                  {g.label}
                </b>
                <small style={{ display: 'block', color: '#64748b', fontSize: 12, marginTop: 2 }}>
                  {g.total_candidates} candidatos · {g.unique_evidence} evidências
                </small>
              </button>
            );
          })}
        </div>

        {/* Detalhe do grupo selecionado — acompanha o scroll (sticky) */}
        <div style={{ position: 'sticky', top: 16, alignSelf: 'start', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
          {!selected ? (
            <div className="empty-state">Selecione um grupo para ver a evidência e propor.</div>
          ) : (
            <div className="curation-detail">
              <h3 style={{ marginTop: 0 }}>{selected.label}</h3>
              <p className="small">
                Fontes: {(selected.sources || []).join(', ') || '—'}
                {selected.meta?.priority ? ` · prioridade ${selected.meta.priority}` : ''}
                {selected.meta?.framework ? ` · ${selected.meta.framework}` : ''}
                {selected.meta?.category ? ` · ${selected.meta.category}` : ''}
              </p>

              <details open>
                <summary className="small"><b>Evidência</b> (origem — não usar verbatim)</summary>
                <ul className="small" style={{ marginTop: 8 }}>
                  {(selected.evidence || []).slice(0, 8).map((e, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      <i>({e.sourceLabel}, p.{e.page})</i> {e.snippet}
                    </li>
                  ))}
                </ul>
              </details>

              {selected.kind === 'question' ? (
                <div className="inline-notice" style={{ marginTop: 12 }}>
                  Perguntas são <b>inspiração / descarte</b> (OCR cru). O roteiro de anamnese é
                  redigido a partir dos eixos e do checklist — não se propõe pergunta linha-a-linha.
                </div>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <label className="small" htmlFor="psic-wording"><b>Redação final (pt-BR, síntese revisada)</b></label>
                  <textarea
                    id="psic-wording"
                    rows={4}
                    value={wording}
                    onChange={e => setWording(e.target.value)}
                    placeholder="Escreva como este item deve aparecer na anamnese de psicologia…"
                    style={{ width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--line, #d8dcd9)', font: 'inherit' }}
                    disabled={!isPropose}
                  />

                  {isPropose ? (
                    <div className="curation-actions">
                      <button type="button" className="primary-button" disabled={busy} onClick={() => propose('approved_local')}>
                        Propor aprovação
                      </button>
                      <button type="button" className="quiet-button" disabled={busy} onClick={() => propose('review')}>
                        Propor edição
                      </button>
                      <button type="button" className="quiet-button" disabled={busy} onClick={() => propose('rejected')}>
                        Propor reprovação
                      </button>
                    </div>
                  ) : (
                    <p className="small" style={{ marginTop: 10 }}>
                      Leitura. A aprovação final acontece na fila de propostas do SuperAdm.
                    </p>
                  )}
                </div>
              )}

              {message && <div className="inline-notice" style={{ marginTop: 10 }}>{message}</div>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
