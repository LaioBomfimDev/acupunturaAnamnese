/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from 'react';
import { assistantSynthesis } from '../utils/analyzer';
import { getDiscipline } from '../data/disciplines';
import { getShareScope } from '../data/shareScopes';
import { getSharedRecords } from '../services/recordSharesService';
import { getAnamneseConfig } from '../data/anamneseRegistry';
import { getActiveTextFields, getProfile, getSelected } from '../data/anamneseKit';
import {
  PSYCHOLOGY_AXES,
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_RISK_GROUP,
  getPsychologyTextFields,
} from '../data/psychologyAnamnese';
import { getPsychologyIntakeProfile } from '../data/psychologyIntakeProfiles';

// ============================================================
// Leitura read-only do que foi compartilhado (Fase 3, ampliada em
// 07/08/2026 para todas as disciplinas).
//
// Autorização é do BANCO (get_shared_session): ele decide QUAIS
// registros o chamador pode ler, restritos à disciplina de origem do
// encaminhamento. Aqui só MOSTRAMOS as facetas presentes nos escopos —
// nunca editável.
//
// Acupuntura tem leitura própria (síntese energética, regiões de dor).
// As demais disciplinas são desenhadas a partir da configuração da
// anamnese: campo com valor vira linha, marcação vira chip.
// ============================================================

function selectedItems(selectedMap = {}, group) {
  const prefix = `${group}:`;
  return Object.entries(selectedMap)
    .filter(([key, value]) => value && key.startsWith(prefix))
    .map(([key]) => key.slice(prefix.length));
}

function Field({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <p className="shv-field"><b>{label}:</b> {value}</p>
  );
}

function Chips({ title, items }) {
  if (!items.length) return null;
  return (
    <div className="shv-chips-block">
      <span className="shv-chips-title">{title}</span>
      <div className="shv-chips">
        {items.map(item => <span key={item} className="shv-chip">{item}</span>)}
      </div>
    </div>
  );
}

// ---- Acupuntura (leitura histórica, específica de MTC) ------------

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
    <table className="shv-evolucao">
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

const MTC_SECTIONS = {
  resumo: { title: 'Resumo clínico', render: ResumoSection },
  anamnese: { title: 'Anamnese', render: AnamneseSection },
  dores: { title: 'Dores e sinais físicos', render: DoresSection },
  evolucao: { title: 'Evolução / progressão', render: EvolucaoSection },
  relatorio: { title: 'Relatório', render: RelatorioSection },
};

// ---- Demais disciplinas (desenhadas pela configuração) ------------

/**
 * Traduz uma disciplina + sessão salva no vocabulário necessário para
 * exibir: rótulos de campo, seções de checklist, grupo de risco e eixos.
 * Devolve null para disciplina sem configuração conhecida.
 */
function resolveDisciplineView(discipline, session) {
  const config = getAnamneseConfig(discipline);
  if (config) {
    return {
      label: config.label,
      profileLabel: getProfile(config, session.intakeProfile)?.label,
      fields: getActiveTextFields(config, session.intakeProfile, session.contextModules),
      checklistSections: config.checklistSections,
      riskGroup: config.riskGroup,
      riskTitle: config.riskTitle,
      painGroups: config.painGroups || [],
      axes: config.axes,
    };
  }
  if (discipline === 'psicologia') {
    return {
      label: 'Psicologia',
      profileLabel: getPsychologyIntakeProfile(session.intakeProfile)?.label,
      fields: getPsychologyTextFields(session.intakeProfile, session.contextModules),
      checklistSections: PSYCHOLOGY_CHECKLIST_SECTIONS,
      riskGroup: PSYCHOLOGY_RISK_GROUP,
      riskTitle: 'Sinais de risco',
      painGroups: [],
      axes: PSYCHOLOGY_AXES,
    };
  }
  return null;
}

function filledFields(view, session, limit) {
  const filled = view.fields
    .map(field => ({ label: field.label, value: String(session.fields?.[field.id] || '').trim() }))
    .filter(field => field.value);
  return Number.isFinite(limit) ? filled.slice(0, limit) : filled;
}

function RiskBlock({ view, session }) {
  const marked = getSelected(session.selectedMap, view.riskGroup);
  const notes = String(session.riskNotes || '').trim();
  if (!marked.length && !notes) return null;
  return (
    <div className={marked.length ? 'alert psi-risk-reminder' : undefined}>
      {marked.length > 0 && <Chips title={`⚠ ${view.riskTitle}`} items={marked} />}
      <Field label="Anotações sobre risco" value={notes} />
    </div>
  );
}

function GenericResumo({ view, session }) {
  const primeiros = filledFields(view, session, 2);
  return (
    <>
      <Field label="Percurso" value={view.profileLabel} />
      {primeiros.map(field => <Field key={field.label} label={field.label} value={field.value} />)}
      <RiskBlock view={view} session={session} />
      {primeiros.length === 0 && <p className="small">Ficha ainda sem conteúdo registrado.</p>}
    </>
  );
}

function GenericAnamnese({ view, session }) {
  const campos = filledFields(view, session);
  const marcados = view.checklistSections
    .map(section => ({ title: section.title, items: selectedItems(session.selectedMap, section.group) }))
    .filter(section => section.items.length);

  if (!campos.length && !marcados.length) {
    return <p className="small">Anamnese ainda sem conteúdo registrado.</p>;
  }
  return (
    <>
      <Field label="Percurso" value={view.profileLabel} />
      {campos.map(field => <Field key={field.label} label={field.label} value={field.value} />)}
      {marcados.map(section => <Chips key={section.title} title={section.title} items={section.items} />)}
      <RiskBlock view={view} session={session} />
    </>
  );
}

function GenericDores({ view, session }) {
  const grupos = view.painGroups
    .map(group => {
      const section = view.checklistSections.find(item => item.group === group);
      return { title: section?.title || group, items: selectedItems(session.selectedMap, group) };
    })
    .filter(section => section.items.length);
  if (!grupos.length) return <p className="small">Sem sinais físicos registrados nesta disciplina.</p>;
  return grupos.map(section => <Chips key={section.title} title={section.title} items={section.items} />);
}

function GenericEvolucao({ session }) {
  const evolucoes = Array.isArray(session.evolucoes) ? session.evolucoes : [];
  if (!evolucoes.length) return <p className="small">Sem sessões de evolução registradas.</p>;
  return (
    <ul className="shv-evolucao-list">
      {evolucoes.map((item, index) => (
        <li key={item.id || index}>
          <b>Sessão {item.sessao || index + 1}</b>
          {item.data ? ` — ${item.data}` : ''}
          {item.tema || item.resumo || item.obs
            ? <p className="small">{item.tema || item.resumo || item.obs}</p>
            : null}
        </li>
      ))}
    </ul>
  );
}

function GenericRelatorio({ session }) {
  const relatorio = session.relatorio && typeof session.relatorio === 'object' ? session.relatorio : {};
  const entries = Object.entries(relatorio).filter(([, value]) => String(value || '').trim());
  if (!entries.length) return <p className="small">Nenhum relatório salvo nesta disciplina.</p>;
  return entries.map(([key, value]) => <Field key={key} label={key} value={String(value)} />);
}

const GENERIC_SECTIONS = {
  resumo: { title: 'Resumo clínico', render: GenericResumo },
  anamnese: { title: 'Anamnese', render: GenericAnamnese },
  dores: { title: 'Dores e sinais físicos', render: GenericDores },
  evolucao: { title: 'Evolução / progressão', render: GenericEvolucao },
  relatorio: { title: 'Relatório', render: GenericRelatorio },
};

function formatAge(patient) {
  if (patient?.age !== undefined && patient?.age !== null && patient?.age !== '') return `${patient.age} anos`;
  return 'Idade não informada';
}

// Um bloco por disciplina compartilhada.
function DisciplineBlock({ record, scopes }) {
  const disciplineLabel = getDiscipline(record.discipline)?.label || record.discipline;

  if (record.discipline === 'acupuntura') {
    const state = record.data?.state || {};
    const selectedMap = record.data?.selectedMap || {};
    return (
      <div className="shv-discipline">
        <h3 className="shv-discipline-title">{disciplineLabel}</h3>
        {scopes.filter(id => MTC_SECTIONS[id]).map(id => {
          const { title, render: Render } = MTC_SECTIONS[id];
          return (
            <section key={id} className="shv-section">
              <h4>{title}</h4>
              <Render state={state} selectedMap={selectedMap} />
            </section>
          );
        })}
      </div>
    );
  }

  const session = record.data?.session || {};
  const view = resolveDisciplineView(record.discipline, session);
  if (!view) {
    return (
      <div className="shv-discipline">
        <h3 className="shv-discipline-title">{disciplineLabel}</h3>
        <p className="small">
          Esta disciplina ainda não tem leitura compartilhada. O registro existe e está preservado.
        </p>
      </div>
    );
  }

  return (
    <div className="shv-discipline">
      <h3 className="shv-discipline-title">{disciplineLabel}</h3>
      {record.data?.contentStatus === 'rascunho_a_validar' && (
        <p className="small">Vocabulário em validação pela profissional da área.</p>
      )}
      {scopes.filter(id => GENERIC_SECTIONS[id]).map(id => {
        const { title, render: Render } = GENERIC_SECTIONS[id];
        return (
          <section key={id} className="shv-section">
            <h4>{title}</h4>
            <Render view={view} session={session} />
          </section>
        );
      })}
    </div>
  );
}

export function SharedSessionViewer({ patient, scopes = [], fromDiscipline, onClose }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSharedRecords(patient.id)
      .then(data => { if (!cancelled) setRecords(data); })
      .catch(err => { if (!cancelled) setError(err.message || 'Não foi possível abrir o prontuário compartilhado.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patient.id]);

  return (
    <div className="cp-modal-overlay" role="dialog" aria-modal="true" aria-label={`Prontuário compartilhado de ${patient.name}`}>
      <div className="cp-modal-panel cp-modal-panel--wide">
        <div className="cp-modal-head">
          <h3 className="cp-modal-title">Prontuário compartilhado — {patient.name}</h3>
          <button type="button" className="cp-modal-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div className="cp-modal-body">
          <p className="cp-modal-intro">
            Somente leitura. Compartilhado {fromDiscipline ? `pela ${getDiscipline(fromDiscipline)?.label}` : ''}.
            Itens: {scopes.map(id => getShareScope(id)?.label || id).join(', ')}.
          </p>

          {loading && <p className="small">Abrindo…</p>}
          {error && <div className="cp-notice cp-notice-error">{error}</div>}

          {!loading && !error && (
            <div className="shv-sections">
              <section className="shv-section">
                <h4>Cadastro do paciente</h4>
                <Field label="Nome" value={patient.name} />
                <Field label="Contato" value={patient.phone} />
                <Field label="Idade" value={formatAge(patient)} />
              </section>

              {records.length === 0 && (
                <p className="small">Ainda não há registro clínico compartilhado para este paciente.</p>
              )}

              {records.map(record => (
                <DisciplineBlock key={record.discipline} record={record} scopes={scopes} />
              ))}
            </div>
          )}

          <div className="cps-actions">
            <button type="button" className="cp-btn cp-btn--primary" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
