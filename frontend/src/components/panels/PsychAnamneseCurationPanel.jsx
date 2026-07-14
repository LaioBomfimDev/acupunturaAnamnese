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
  PSYCH_KIND_DESCRIPTION,
  PSYCH_KIND_LABEL,
} from '../../services/psychCurationService';
import { submitCurationProposal } from '../../services/curationProposalService';

function Bullets({ title, items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div className="small"><b>{title}</b></div>
      <ul className="small" style={{ marginTop: 4, paddingLeft: 18 }}>
        {items.map((it, i) => <li key={i} style={{ marginBottom: 4 }}>{it}</li>)}
      </ul>
    </div>
  );
}

function SourcePointers({ sources }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;
  return (
    <div className="small" style={{ marginTop: 12, color: '#64748b' }}>
      <b>Fontes para conferência:</b>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {sources.map(source => (
          <li key={`${source.key}:${source.pdfPage}`}>
            {source.title || source.key}, PDF p. {source.pdfPage}
            {source.supportLevel === 'contextual' ? ' (apoio contextual)' : ''}
          </li>
        ))}
      </ul>
      <span>As páginas são protegidas e a aprovação profissional continua obrigatória.</span>
    </div>
  );
}

const inputStyle = { width: '100%', marginTop: 4, padding: 8, borderRadius: 8, border: '1px solid var(--line, #d8dcd9)', font: 'inherit' };

// Campos do formulário de "adicionar novo" por tipo — os mesmos tópicos dos
// itens existentes. type 'lines' = uma linha por item (vira lista).
const ADD_FIELDS = {
  risk: [
    { key: 'label', label: 'Nome do sinal de risco', type: 'text' },
    { key: 'summary', label: 'Resumo (o que é / por que destacar)', type: 'text' },
    { key: 'screening', label: 'Perguntas de triagem (uma por linha)', type: 'lines' },
    { key: 'observe', label: 'O que observar (uma por linha)', type: 'lines' },
    { key: 'reminder', label: 'Lembrete de conduta', type: 'text' },
  ],
  axis: [
    { key: 'label', label: 'Nome do eixo', type: 'text' },
    { key: 'summary', label: 'Resumo', type: 'text' },
    { key: 'explore', label: 'O que investigar (uma por linha)', type: 'lines' },
  ],
  checklist: [
    { key: 'label', label: 'Nome da lista', type: 'text' },
    { key: 'summary', label: 'Resumo', type: 'text' },
    { key: 'examples', label: 'Itens da lista (um por linha)', type: 'lines' },
  ],
  question: [
    { key: 'block', label: 'Bloco (ex.: Queixa, Sono, Rede de apoio)', type: 'text' },
    { key: 'label', label: 'A pergunta', type: 'text' },
  ],
};

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
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({});

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
    // ao escolher um item, pré-carrega a redação com o rascunho formulado
    setSelectedId(group.id);
    setAdding(false);
    setWording(String(group.meta?.draft || group.label || ''));
    setMessage('');
  }

  function openAdd() {
    setAdding(true);
    setSelectedId(null);
    setAddForm({});
    setMessage('');
  }

  async function submitAdd() {
    const fields = ADD_FIELDS[activeKind] || [];
    const type = PSYCH_PROPOSAL_TYPE[activeKind];
    const item = {};
    for (const f of fields) {
      const raw = addForm[f.key] || '';
      item[f.key] = f.type === 'lines'
        ? String(raw).split('\n').map(s => s.trim()).filter(Boolean)
        : String(raw).trim();
    }
    if (!item.label) { setMessage('Dê um nome ao item antes de enviar.'); return; }
    setBusy(true);
    try {
      await submitCurationProposal({
        type,
        targetRef: `novo:${activeKind}`,
        payload: { decision: 'new', kind: activeKind, item },
        note: `Novo ${PSYCH_KIND_LABEL[activeKind]}: ${item.label}`,
        proposerName: actor?.label || '',
      });
      setMessage('Novo item enviado ao SuperAdm para aprovação.');
      setAdding(false);
      setAddForm({});
    } catch (err) {
      setMessage(err?.message || 'Não foi possível enviar o novo item.');
    } finally {
      setBusy(false);
    }
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
      setMessage('Tipo de item não reconhecido.');
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
          sources: selected.sources,
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
      </section>
    );
  }
  if (data.total === 0) {
    return (
      <section className="admin-knowledge">
        <div className="empty-state">Nenhum item na base ainda.</div>
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
        Rascunho <b>já formulado</b> para você revisar — ajuste a redação, aprove, edite ou
        reprove cada item. Nada vira registro sem a sua aprovação.
      </div>

      {/* Abas por tipo */}
      <div className="tab-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {data.kinds.map(kind => (
          <button
            key={kind}
            type="button"
            className="chip"
            onClick={() => { setActiveKind(kind); setSelectedId(null); setAdding(false); }}
            style={activeKind === kind ? { background: 'var(--brand, #2f6f4f)', color: '#fff', borderColor: 'transparent' } : undefined}
          >
            {PSYCH_KIND_LABEL[kind]} ({(data.grouped[kind] || []).length})
          </button>
        ))}
      </div>

      <div className="curation-guide-legend psych-curation-kind-legend" aria-label="Significado dos tipos de conteúdo">
        <h3>O que significa cada tipo?</h3>
        <div className="curation-guide-legend-grid">
          {data.kinds.map(kind => (
            <div key={kind} className={`curation-guide-legend-item${activeKind === kind ? ' active' : ''}`}>
              <b>{PSYCH_KIND_LABEL[kind]}</b>
              <span>{PSYCH_KIND_DESCRIPTION[kind]}</span>
            </div>
          ))}
        </div>
        <p className="psych-curation-count-hint">
          O botão verde é o tipo aberto. O número entre parênteses é a quantidade de itens para revisar.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        {/* Lista de grupos */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isPropose && (
            <button
              type="button"
              onClick={openAdd}
              style={{
                display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', font: 'inherit',
                padding: '10px 12px', borderRadius: 8, marginBottom: 2, fontWeight: 700,
                border: `1px dashed ${adding ? 'var(--brand, #2f6f4f)' : 'var(--line, #cbd5e1)'}`,
                background: adding ? 'var(--soft, #fff8e8)' : '#fff', color: 'var(--brand, #2f6f4f)',
              }}
            >
              + Adicionar {PSYCH_KIND_LABEL[activeKind].toLowerCase()}
            </button>
          )}
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
                  {g.meta?.block || g.meta?.framework || g.meta?.category
                    || (g.meta?.priority ? `prioridade ${g.meta.priority}` : '')
                    || (g.meta?.summary ? String(g.meta.summary).slice(0, 60) : '')}
                </small>
              </button>
            );
          })}
        </div>

        {/* Detalhe do grupo selecionado — acompanha o scroll (sticky) */}
        <div style={{ position: 'sticky', top: 16, alignSelf: 'start', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}>
          {adding ? (
            <div className="curation-detail">
              <h3 style={{ marginTop: 0 }}>Novo · {PSYCH_KIND_LABEL[activeKind].toLowerCase()}</h3>
              <p className="small" style={{ color: '#64748b' }}>
                Preencha os campos. Vai como proposta para o SuperAdm aprovar.
              </p>
              {(ADD_FIELDS[activeKind] || []).map(f => (
                <div key={f.key} style={{ marginTop: 10 }}>
                  <label className="small"><b>{f.label}</b></label>
                  {f.type === 'lines' ? (
                    <textarea rows={3} value={addForm[f.key] || ''} onChange={e => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={inputStyle} />
                  ) : (
                    <input value={addForm[f.key] || ''} onChange={e => setAddForm(prev => ({ ...prev, [f.key]: e.target.value }))} style={inputStyle} />
                  )}
                </div>
              ))}
              <div className="curation-actions">
                <button type="button" className="primary-button" disabled={busy} onClick={submitAdd}>Enviar novo item</button>
                <button type="button" className="quiet-button" disabled={busy} onClick={() => { setAdding(false); setAddForm({}); }}>Cancelar</button>
              </div>
              {message && <div className="inline-notice" style={{ marginTop: 10 }}>{message}</div>}
            </div>
          ) : !selected ? (
            <div className="empty-state">Selecione um item à esquerda, ou clique em <b>+ Adicionar</b>.</div>
          ) : (
            <div className="curation-detail">
              <h3 style={{ marginTop: 0 }}>{selected.label}</h3>
              <p className="small" style={{ color: '#64748b' }}>
                {[
                  selected.meta?.priority && `prioridade ${selected.meta.priority}`,
                  selected.meta?.framework,
                  selected.meta?.category,
                  selected.meta?.block,
                ].filter(Boolean).join(' · ') || PSYCH_KIND_LABEL[selected.kind]}
              </p>

              {selected.meta?.summary && <p style={{ marginTop: 4 }}>{selected.meta.summary}</p>}

              <Bullets title="Perguntas de triagem" items={selected.meta?.screening} />
              <Bullets title="O que observar" items={selected.meta?.observe} />
              <Bullets title="O que investigar" items={selected.meta?.explore} />
              <Bullets title="Itens da lista" items={selected.meta?.examples} />

              {selected.meta?.reminder && (
                <div className="inline-notice" style={{ marginTop: 10 }}>
                  <b>Lembrete de conduta:</b> {selected.meta.reminder}
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <label className="small" htmlFor="psic-wording">
                  <b>Redação final (pt-BR) — revise e ajuste ao seu jeito</b>
                </label>
                <textarea
                  id="psic-wording"
                  rows={4}
                  value={wording}
                  onChange={e => setWording(e.target.value)}
                  placeholder="Como este item deve aparecer na anamnese…"
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

              <SourcePointers sources={selected.sources} />

              {message && <div className="inline-notice" style={{ marginTop: 10 }}>{message}</div>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
