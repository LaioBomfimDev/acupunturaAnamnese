/* eslint-disable react-hooks/set-state-in-effect */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { getDiscipline } from '../data/disciplines';
import { getAnamneseConfig } from '../data/anamneseRegistry';
import { listPatientEvolutions, updatePatientEvolution } from '../services/patientEvolutionService';
import { listAppointmentsAwaitingEvolution } from '../services/appointmentService';
import { formatRegisteredSessionCount } from '../utils/reportUtils';
import { PrintFooter, PrintLetterhead } from './report/reportPrint';
import { paginateReportBody } from './report/reportPagination';
import { buildReportAccentPalette, buildReportContactItems } from '../utils/reportUtils';

// ============================================================
// Linha do tempo da evolução de UM paciente — destino do botão "Ver
// evolução" da ficha (ClinicPatientProfile). Diferente da ideia inicial
// (navegar entre pacientes), o propósito aqui é só um: mostrar o que a
// profissional escreveu em cada sessão, na íntegra, porque esse texto
// serve de prova pra fiscalização. Dá pra corrigir o texto (RPC
// update_patient_evolution — só quem escreveu pode corrigir; erro de
// acesso aparece normal se outra pessoa tentar), imprimir uma sessão ou
// o conjunto todo, e "baixar PDF" é o mesmo botão de imprimir (o
// navegador oferece "Salvar como PDF" no diálogo) — mesma infra de
// papel timbrado já usada no cadastro e nos relatórios.
//
// Escopo desta tela: só patient_evolutions (registros desde 03/09/2026).
// Sessões antigas que ainda vivem só no JSON legado (session.evolucoes,
// dentro do full_session de clinical_records) não aparecem aqui — essa
// leitura pertence ao workspace da própria disciplina, não à ficha
// administrativa. Ver docs/dossie-tecnico-due-diligence-2026-09-03.md.
// ============================================================

const DEFAULT_ACCENT = '#0E2A4A';

const ATTENDANCE_LABELS = {
  attended: 'Atendido',
  no_show: 'Faltou',
  excused: 'Falta justificada',
};

const ACUPUNTURA_METRICS = [
  { id: 'dor', label: 'Dor' },
  { id: 'sono', label: 'Sono' },
  { id: 'ansiedade', label: 'Ansiedade' },
  { id: 'energia', label: 'Energia' },
  { id: 'intestino', label: 'Intestino' },
  { id: 'humor', label: 'Humor' },
];

const ACUPUNTURA_FIELDS = [
  { id: 'tecnica', label: 'Técnica usada' },
  { id: 'protocolo', label: 'Protocolo aplicado' },
  { id: 'resposta', label: 'Resposta do paciente' },
  { id: 'intercorrencia', label: 'Intercorrência' },
  { id: 'obs', label: 'Observações' },
];

const PSICOLOGIA_FIELDS = [
  { id: 'temas', label: 'Temas trabalhados' },
  { id: 'intervencoes', label: 'Intervenções' },
  { id: 'resposta', label: 'Resposta percebida' },
  { id: 'riscoReavaliado', label: 'Risco reavaliado / conduta' },
  { id: 'acordos', label: 'Acordos da sessão' },
  { id: 'proximosPassos', label: 'Próximos passos' },
  { id: 'obs', label: 'Observações' },
];

// Acupuntura e Psicologia têm tela própria (sem config de disciplina
// genérica); Fisioterapia/Nutrição leem de anamneseRegistry — mesma
// fonte que DisciplineEvolucao já usa, sem duplicar rótulo em dois
// lugares. Neuropsicologia não tem evolução própria (ver disciplines.js).
function getEvolutionSchema(discipline) {
  if (discipline === 'acupuntura') {
    return { metrics: ACUPUNTURA_METRICS, fields: ACUPUNTURA_FIELDS, hasPoints: true };
  }
  if (discipline === 'psicologia') {
    return { metrics: [], fields: PSICOLOGIA_FIELDS, hasPoints: false };
  }
  const config = getAnamneseConfig(discipline);
  if (config?.evolution) {
    return {
      metrics: config.evolution.indicators || [],
      fields: config.evolution.fields || [],
      hasPoints: false,
    };
  }
  return { metrics: [], fields: [], hasPoints: false };
}

function parseConteudo(raw) {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function formatDateTimeBR(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function shortDate() {
  return new Date().toLocaleDateString('pt-BR');
}

function PrintRow({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return <p style={{ margin: '8px 0', lineHeight: 1.6, fontSize: 15 }}><b>{label}:</b> {value}</p>;
}

export function PatientEvolutionTimeline({ patient, therapistProfile, onBack }) {
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  // "corrigido" só marca o que foi editado NESTA sessão do navegador — os
  // timestamps do servidor não servem pra essa comparação, porque o
  // trigger de INSERT chama clock_timestamp() em created_at/updated_at
  // separadamente e quase nunca batem no mesmo microssegundo.
  const [editedIds, setEditedIds] = useState(() => new Set());
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const [printScope, setPrintScope] = useState(null);

  const printSourceRef = useRef(null);
  const printMeasureRef = useRef(null);
  const printHeaderMeasureRef = useRef(null);
  const printFooterMeasureRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      listPatientEvolutions(patient.id),
      listAppointmentsAwaitingEvolution({ patientId: patient.id }).catch(() => []),
    ]).then(([evolutions, awaiting]) => {
      if (cancelled) return;
      setRows(evolutions || []);
      setPending(awaiting || []);
    }).catch(err => { if (!cancelled) setError(err.message || 'Não foi possível carregar a evolução.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patient.id]);

  // Sessão numerada pela ordem real do atendimento (mesma regra de
  // mergeEvolutionHistory), mas exibida da mais recente pra mais antiga —
  // é isso que fiscalização/leitura rápida costuma querer primeiro.
  const entries = useMemo(() => {
    const ordered = [...rows]
      .sort((a, b) => new Date(a.atendimento_em) - new Date(b.atendimento_em))
      .map((row, index) => ({ ...row, sessionNumber: index + 1, conteudo: parseConteudo(row.conteudo) }));
    return ordered.slice().reverse();
  }, [rows]);

  function startEdit(entry) {
    const schema = getEvolutionSchema(entry.discipline);
    const form = {};
    if (entry.conteudo.tipo === 'falta') {
      form.observacao = entry.conteudo.observacao ?? '';
    } else {
      [...schema.metrics, ...schema.fields].forEach(f => { form[f.id] = entry.conteudo[f.id] ?? ''; });
    }
    setEditForm(form);
    setSaveError(null);
    setEditingId(entry.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
    setSaveError(null);
  }

  async function saveEdit(entry) {
    setSaving(true);
    setSaveError(null);
    try {
      const payload = { ...entry.conteudo, ...editForm };
      await updatePatientEvolution(entry.id, payload);
      setRows(prev => prev.map(row => (row.id === entry.id
        ? { ...row, conteudo: JSON.stringify(payload) }
        : row)));
      setEditedIds(prev => new Set(prev).add(entry.id));
      setEditingId(null);
      setEditForm(null);
    } catch (err) {
      setSaveError(err.message || 'Não foi possível corrigir a evolução. Só quem escreveu o registro pode corrigi-lo.');
    } finally {
      setSaving(false);
    }
  }

  const terapeuta = therapistProfile?.full_name || 'Profissional';
  const clinic = therapistProfile?.clinic || null;
  const clinicName = clinic?.name || therapistProfile?.clinic_name || 'Reability';
  const clinicLogo = clinic?.logo_url || '';
  const clinicMonogram = clinicName.trim().charAt(0).toUpperCase() || 'R';
  const accentPalette = buildReportAccentPalette(clinic?.brand_color || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const clinicDetails = [clinic?.legal_name, clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null].filter(Boolean).join(' • ');
  const contactItems = buildReportContactItems({ clinic, therapistProfile });
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

  // "Baixar PDF" reaproveita o mesmo botão: o navegador já oferece
  // "Salvar como PDF" no diálogo de impressão — mesma infra de papel
  // timbrado do cadastro/relatório, sem gerar PDF por outro caminho.
  function handlePrint(scopeEntry) {
    flushSync(() => setPrintScope(scopeEntry));
    const html = printSourceRef.current?.innerHTML || '';
    const doc = paginateReportBody(html, {
      stage: printMeasureRef.current,
      header: printHeaderMeasureRef.current,
      footer: printFooterMeasureRef.current,
    });
    flushSync(() => setPrintDoc(doc));
    window.print();
  }

  const printList = printScope
    ? [printScope]
    : entries.slice().sort((a, b) => a.sessionNumber - b.sessionNumber);

  const printBody = (
    <>
      <h2 style={{ margin: '0 0 4px', textTransform: 'uppercase', color: 'var(--navy)' }}>Evolução — {patient.name}</h2>
      <p style={{ textAlign: 'center', margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>{clinicName}</p>
      {printList.map(entry => {
        const schema = getEvolutionSchema(entry.discipline);
        const isFalta = entry.conteudo.tipo === 'falta';
        return (
          <div key={entry.id} style={{ marginBottom: 22 }}>
            <h3 style={{ margin: '18px 0 6px', color: 'var(--navy)', fontSize: 16 }}>
              Sessão {entry.sessionNumber} — {formatDateTimeBR(entry.atendimento_em)} · {getDiscipline(entry.discipline)?.label || entry.discipline}
              {entry.attendance_status !== 'attended' ? ` (${ATTENDANCE_LABELS[entry.attendance_status] || entry.attendance_status})` : ''}
            </h3>
            {isFalta ? (
              <PrintRow label="Observação" value={entry.conteudo.observacao} />
            ) : (
              <>
                {schema.metrics.map(m => <PrintRow key={m.id} label={m.label} value={entry.conteudo[m.id]} />)}
                {schema.hasPoints && Array.isArray(entry.conteudo.pontosUtilizados) && entry.conteudo.pontosUtilizados.length > 0 && (
                  <PrintRow
                    label="Pontos usados"
                    value={entry.conteudo.pontosUtilizados.map(p => String(p.label || '').split(' — ')[0]).join(', ')}
                  />
                )}
                {schema.fields.map(f => <PrintRow key={f.id} label={f.label} value={entry.conteudo[f.id]} />)}
              </>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <div className="hub-screen">
      <header className="hub-topbar no-print">
        <div className="hub-brand">
          <h1>Evolução — {patient.name}</h1>
          <p>Registro de cada sessão, como a profissional escreveu</p>
        </div>
        <button type="button" className="topbar-button" onClick={onBack}>← Voltar à ficha</button>
      </header>

      <main className="hub-body clinic-patients no-print">
        {error && <div className="cp-notice cp-notice-error">{error}</div>}
        {loading && <p className="small">Carregando evolução…</p>}

        {!loading && !error && (
          <>
            <div className="pet-topbar">
              <p style={{ margin: 0, fontSize: 13, color: 'var(--r1-text-muted)' }}>
                {formatRegisteredSessionCount(entries.length) || 'Nenhuma sessão registrada ainda'}
                {pending.length > 0 ? ` · ${pending.length} aguardando evolução` : ''}
              </p>
              <div className="pet-actions">
                <button type="button" className="cp-btn cp-btn--sm" onClick={() => handlePrint(null)} disabled={entries.length === 0}>⬇ Baixar PDF</button>
                <button type="button" className="cp-btn cp-btn--sm" onClick={() => handlePrint(null)} disabled={entries.length === 0}>🖨 Imprimir</button>
              </div>
            </div>

            <div className="pet-list">
              {pending.map(item => (
                <div className="pet-item is-pending" key={item.appointment_id}>
                  <div className="pet-card is-pending">
                    <div className="pet-when">
                      {formatDateTimeBR(item.starts_at)} · {getDiscipline(item.discipline)?.label || item.discipline}
                      <span>
                        Atendimento marcado como {(ATTENDANCE_LABELS[item.attendance_status] || item.attendance_status).toLowerCase()},
                        {' '}sem evolução escrita ainda.
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {entries.length === 0 && pending.length === 0 && (
                <p className="small">Nenhuma evolução registrada ainda para este paciente.</p>
              )}

              {entries.map(entry => {
                const schema = getEvolutionSchema(entry.discipline);
                const isFalta = entry.conteudo.tipo === 'falta';
                const isEditing = editingId === entry.id;
                return (
                  <div className="pet-item" key={entry.id}>
                    <div className="pet-card">
                      <div className="pet-card-head">
                        <div className="pet-when">
                          Sessão {entry.sessionNumber}
                          <span>{formatDateTimeBR(entry.atendimento_em)} · {getDiscipline(entry.discipline)?.label || entry.discipline}</span>
                        </div>
                        <div className="pet-tags">
                          {entry.attendance_status !== 'attended' && (
                            <span className="cp-badge cp-badge-warn">{ATTENDANCE_LABELS[entry.attendance_status] || entry.attendance_status}</span>
                          )}
                          {editedIds.has(entry.id) && (
                            <span className="pet-lock">✎ corrigido agora</span>
                          )}
                        </div>
                      </div>

                      {isFalta ? (
                        isEditing ? (
                          <div className="pet-edit-field wide">
                            <label>Observação</label>
                            <textarea
                              className="cps-textarea"
                              value={editForm.observacao}
                              onChange={e => setEditForm(f => ({ ...f, observacao: e.target.value }))}
                            />
                          </div>
                        ) : (
                          <p style={{ margin: 0, fontSize: 13.5 }}>{entry.conteudo.observacao || 'Falta sem observações.'}</p>
                        )
                      ) : isEditing ? (
                        <>
                          {schema.metrics.length > 0 && (
                            <div className="pet-edit-grid">
                              {schema.metrics.map(m => (
                                <div className="pet-edit-field" key={m.id}>
                                  <label>{m.label}</label>
                                  <input
                                    className="cp-input"
                                    value={editForm[m.id] ?? ''}
                                    onChange={e => setEditForm(f => ({ ...f, [m.id]: e.target.value }))}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                          {schema.fields.map(f => (
                            <div className="pet-edit-field wide" key={f.id} style={{ marginBottom: 10 }}>
                              <label>{f.label}</label>
                              <textarea
                                className="cps-textarea"
                                value={editForm[f.id] ?? ''}
                                onChange={e => setEditForm(state => ({ ...state, [f.id]: e.target.value }))}
                              />
                            </div>
                          ))}
                        </>
                      ) : (
                        <>
                          {schema.metrics.some(m => String(entry.conteudo[m.id] ?? '').trim()) && (
                            <div className="pet-metrics">
                              {schema.metrics
                                .filter(m => String(entry.conteudo[m.id] ?? '').trim())
                                .map(m => <span className="pet-metric" key={m.id}>{m.label} <b>{entry.conteudo[m.id]}</b></span>)}
                            </div>
                          )}
                          <div className="pet-body">
                            <dl>
                              {schema.hasPoints && Array.isArray(entry.conteudo.pontosUtilizados) && entry.conteudo.pontosUtilizados.length > 0 && (
                                <Fragment>
                                  <dt>Pontos usados</dt>
                                  <dd>{entry.conteudo.pontosUtilizados.map(p => String(p.label || '').split(' — ')[0]).join(', ')}</dd>
                                </Fragment>
                              )}
                              {schema.fields
                                .filter(f => String(entry.conteudo[f.id] || '').trim())
                                .map(f => (
                                  <Fragment key={f.id}>
                                    <dt>{f.label}</dt>
                                    <dd>{entry.conteudo[f.id]}</dd>
                                  </Fragment>
                                ))}
                            </dl>
                            {schema.fields.every(f => !String(entry.conteudo[f.id] || '').trim())
                              && !(schema.hasPoints && Array.isArray(entry.conteudo.pontosUtilizados) && entry.conteudo.pontosUtilizados.length > 0) && (
                              <p className="small">Sessão sem texto registrado.</p>
                            )}
                          </div>
                        </>
                      )}

                      {saveError && isEditing && <div className="cp-notice cp-notice-error" style={{ marginTop: 10 }}>{saveError}</div>}

                      <div className="pet-card-foot">
                        {isEditing ? (
                          <>
                            <button type="button" className="cp-btn cp-btn--sm" onClick={cancelEdit} disabled={saving}>Cancelar</button>
                            <button type="button" className="cp-btn cp-btn--sm cp-btn--primary" onClick={() => saveEdit(entry)} disabled={saving}>
                              {saving ? 'Salvando…' : 'Salvar correção'}
                            </button>
                          </>
                        ) : (
                          <>
                            <button type="button" className="cp-btn cp-btn--sm" onClick={() => startEdit(entry)}>✎ Corrigir texto</button>
                            <button type="button" className="cp-btn cp-btn--sm" onClick={() => handlePrint(entry)}>🖨 Imprimir esta sessão</button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* Papel timbrado — mesma infra de ClinicPatientProfile/relatórios. */}
      <div className="report-print-pages" style={accentStyle} aria-hidden="true">
        <div className="rpage-measure-stage">
          <div ref={printHeaderMeasureRef}>
            <PrintLetterhead
              clinicLogo={clinicLogo}
              clinicMonogram={clinicMonogram}
              clinicName={clinicName}
              clinicDetails={clinicDetails}
              dateLabel={shortDate()}
              sessaoLabel="Evolução"
              terapeuta={terapeuta}
            />
          </div>
          <div ref={printFooterMeasureRef}>
            <PrintFooter items={contactItems} clinicName={clinicName} />
          </div>
          <div ref={printMeasureRef} className="rpage-body" />
        </div>

        <div ref={printSourceRef}>{printBody}</div>

        {printDoc.pages.map((html, index) => (
          <section className="rpage" key={index}>
            {watermarkEnabled && (
              <div className="rpage-watermark" aria-hidden="true">
                <img src={clinicLogo} alt="" />
              </div>
            )}
            <PrintLetterhead
              clinicLogo={clinicLogo}
              clinicMonogram={clinicMonogram}
              clinicName={clinicName}
              clinicDetails={clinicDetails}
              dateLabel={shortDate()}
              sessaoLabel="Evolução"
              terapeuta={terapeuta}
            />
            <div
              className="rpage-body"
              style={printDoc.bodyHeightPx ? { height: printDoc.bodyHeightPx } : undefined}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="rpage-footer">
              <PrintFooter items={contactItems} clinicName={clinicName} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export default PatientEvolutionTimeline;
