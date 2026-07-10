/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { assistantSynthesis } from '../utils/analyzer';
import { getDiscipline } from '../data/disciplines';
import { getShareScope } from '../data/shareScopes';
import { getSharedSession } from '../services/recordSharesService';

// ============================================================
// Leitura read-only da sessão compartilhada (Fase 3)
// Plano: docs/plano-clinica-multidisciplinar.md
//
// O profissional de destino abre o que foi enviado. Autorização é do
// BANCO (get_shared_session); aqui só MOSTRAMOS as facetas presentes
// nos escopos do compartilhamento — nunca editável.
// ============================================================

// Itens marcados de um grupo do checklist, lidos direto do selectedMap
// ("grupo:item" => true), sem depender do catálogo.
function selectedItems(selectedMap = {}, group) {
  const prefix = `${group}:`;
  return Object.entries(selectedMap)
    .filter(([key, value]) => value && key.startsWith(prefix))
    .map(([key]) => key.slice(prefix.length));
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <p className="shared-field"><b>{label}:</b> {value}</p>
  );
}

function Chips({ title, items }) {
  if (!items.length) return null;
  return (
    <div className="shared-chips-block">
      <span className="shared-chips-title">{title}</span>
      <div className="shared-chips">
        {items.map(item => <span key={item} className="shared-chip">{item}</span>)}
      </div>
    </div>
  );
}

function ResumoSection({ state, selectedMap }) {
  const synthesis = assistantSynthesis(state, selectedMap);
  return (
    <>
      <Field label="Queixa principal" value={state.queixa} />
      <Field label="Hipótese principal" value={synthesis.primaryName !== '—' ? `${synthesis.primaryName}${synthesis.primaryPercent ? ` (${synthesis.primaryPercent}%)` : ''}` : null} />
      <Field label="Leitura" value={synthesis.reading} />
    </>
  );
}

function AnamneseSection({ state, selectedMap }) {
  return (
    <>
      <Field label="Queixa principal" value={state.queixa} />
      <Field label="História" value={state.historia} />
      <Field label="Medicações / diagnósticos" value={state.medicacoes} />
      <Field label="Atividade física" value={state.atividadeFisica} />
      <Field label="Observações de sono/emoções" value={state.obsSonoEmocoes} />
      <Chips title="Características da queixa" items={selectedItems(selectedMap, 'queixaEstruturada')} />
      <Chips title="Sono" items={selectedItems(selectedMap, 'sono')} />
      <Chips title="Emoções" items={selectedItems(selectedMap, 'emocoes')} />
      <Chips title="Digestão" items={selectedItems(selectedMap, 'digestao')} />
      <Chips title="Histórico" items={selectedItems(selectedMap, 'historico')} />
    </>
  );
}

function DoresSection({ state, selectedMap }) {
  return (
    <>
      <Field label="Localização da dor" value={state.dorLocal} />
      <Field label="Escala geral (0–10)" value={state.escalaDor} />
      <Field label="Em repouso (0–10)" value={state.dorRepouso} />
      <Field label="Em movimento (0–10)" value={state.dorMovimento} />
      <Field label="Observações de dor" value={state.obsDor} />
      <Chips title="Regiões com dor" items={selectedItems(selectedMap, 'dor').concat(selectedItems(selectedMap, 'dorRegioes'))} />
      <Chips title="Relação climática" items={selectedItems(selectedMap, 'clima')} />
    </>
  );
}

function EvolucaoSection({ state }) {
  const evolucoes = Array.isArray(state.evolucoes) ? state.evolucoes : [];
  if (!evolucoes.length) return <p className="small">Sem sessões de evolução registradas.</p>;
  return (
    <table className="shared-evolucao">
      <thead>
        <tr><th>Sessão</th><th>Data</th><th>Dor</th><th>Sono</th><th>Ansiedade</th><th>Energia</th></tr>
      </thead>
      <tbody>
        {evolucoes.map((s, i) => (
          <tr key={s.sessao || i}>
            <td>{s.sessao || i + 1}</td>
            <td>{s.data || '—'}</td>
            <td>{s.dor || '—'}</td>
            <td>{s.sono || '—'}</td>
            <td>{s.ansiedade || '—'}</td>
            <td>{s.energia || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RelatorioSection({ state }) {
  const edits = state.relatorioEdits && typeof state.relatorioEdits === 'object' ? state.relatorioEdits : {};
  const entries = Object.entries(edits).filter(([, value]) => String(value || '').trim());
  if (!entries.length) return <p className="small">Nenhum relatório salvo nesta sessão.</p>;
  return entries.map(([key, value]) => <Field key={key} label={key} value={String(value)} />);
}

const SECTION_RENDERERS = {
  resumo: { title: 'Resumo clínico', render: ResumoSection },
  anamnese: { title: 'Anamnese', render: AnamneseSection },
  dores: { title: 'Dores e sinais físicos', render: DoresSection },
  evolucao: { title: 'Evolução / progressão', render: EvolucaoSection },
  relatorio: { title: 'Relatório', render: RelatorioSection },
};

function formatAge(patient) {
  if (patient?.age !== undefined && patient?.age !== null && patient?.age !== '') return `${patient.age} anos`;
  return 'Idade não informada';
}

export function SharedSessionViewer({ patient, scopes = [], fromDiscipline, onClose }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSharedSession(patient.id)
      .then(data => { if (!cancelled) setSession(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Não foi possível abrir o prontuário compartilhado.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patient.id]);

  const state = session?.state || {};
  const selectedMap = session?.selectedMap || {};
  // Só as seções cujo escopo foi compartilhado (cadastro é sempre exibido no topo).
  const sections = scopes.filter(id => SECTION_RENDERERS[id]);

  return (
    <div className="share-overlay" role="dialog" aria-modal="true" aria-label={`Prontuário compartilhado de ${patient.name}`}>
      <div className="share-dialog shared-view">
        <div className="share-dialog-head">
          <b>Prontuário compartilhado — {patient.name}</b>
          <button type="button" className="share-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <p className="small">
          Somente leitura. Compartilhado {fromDiscipline ? `pela ${getDiscipline(fromDiscipline)?.label}` : ''}.
          Itens: {scopes.map(id => getShareScope(id)?.label || id).join(', ')}.
        </p>

        {loading && <p className="small">Abrindo…</p>}
        {error && <div className="alert">{error}</div>}

        {!loading && !error && (
          <div className="shared-sections">
            <section className="shared-section">
              <h4>Cadastro do paciente</h4>
              <Field label="Nome" value={patient.name} />
              <Field label="Contato" value={patient.phone} />
              <Field label="Idade" value={formatAge(patient)} />
            </section>

            {!session && <p className="small">Ainda não há sessão clínica registrada para este paciente.</p>}

            {session && sections.map(id => {
              const { title, render: Render } = SECTION_RENDERERS[id];
              return (
                <section key={id} className="shared-section">
                  <h4>{title}</h4>
                  <Render state={state} selectedMap={selectedMap} />
                </section>
              );
            })}
          </div>
        )}

        <div className="share-actions">
          <button type="button" className="tag active" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
