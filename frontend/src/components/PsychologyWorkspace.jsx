/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { getPatientAge } from '../hooks/useClinicState';
import { PatientStart } from './PatientStart';
import { CheckGrid } from './ui/CheckGrid';
import { FieldInput } from './ui/FieldInput';
import { QuickWordChips } from './ui/QuickWordChips';
import { AiCorrectionButton } from './ui/AiCorrectionButton';
import { AI_SURFACES } from '../services/aiCorrectionService';
import {
  getLatestRecord,
  saveClinicalRecord,
  updateClinicalRecord,
} from '../services/clinicalRecordService';
import {
  PSYCHOLOGY_AI_DISCLAIMER,
  PSYCHOLOGY_READING_DISCLAIMER,
  confidenceBand,
  generatePsychologyReading,
  suggestPsychologyMarks,
} from '../services/psychologyAiService';
import {
  PSI_ANAMNESE_RECORD_TYPE,
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_CONTENT_STATUS,
  PSYCHOLOGY_DRAFT_NOTICE,
  PSYCHOLOGY_MODALITIES,
  PSYCHOLOGY_RISK_GROUP,
  PSYCHOLOGY_RISK_REMINDER,
  PSYCHOLOGY_TEXT_FIELDS,
  appendQuickWord,
  createEmptyPsychologySession,
  hasPsychologyRiskSelected,
  psychologyRiskChecklist,
} from '../data/psychologyAnamnese';
import { resolveUserDisciplines } from '../data/disciplines';

// ============================================================
// Workspace de Psicologia (Fase 5 — docs/plano-clinica-multidisciplinar.md)
// Nasce enxuto (paciente → modalidade → anamnese clínica), com o
// vocabulário RASCUNHO do plano de anamnese multidisciplinar.
//
// Decisões que este arquivo respeita:
//  * IA assistiva LIGADA (decisão do dono do produto, 2026-07-10):
//    sugere marcações e redige uma LEITURA EM RASCUNHO — nada entra
//    sozinho; aceitar/ignorar + botão Corrigir (loop igual ao MTC);
//  * bloco de risco sempre visível — o sistema destaca e lembra,
//    NUNCA decide;
//  * quick-word chips sob os campos: máximo de clique, mínimo de
//    digitação (pedido do dono do produto);
//  * registros gravam record_type 'psi_anamnese' + discipline
//    'psicologia' (payload sempre carrega a disciplina; a coluna
//    depende da migração 20260710);
//  * avaliação neuropsicológica aparece como modalidade, mas fica
//    "a definir com a psicóloga" antes de ganhar formulário.
// ============================================================

// Rótulos dos grupos psi para os cards de sugestão.
const PSI_GROUP_LABELS = Object.fromEntries([
  ...PSYCHOLOGY_CHECKLIST_SECTIONS.map(section => [section.group, section.title]),
  [PSYCHOLOGY_RISK_GROUP, 'Sinais de risco'],
]);

// Assistente de sugestões: lê o texto livre e sugere marcações do
// vocabulário psi para aceitar/ignorar. Sob demanda, nunca ao vivo.
function PsychologyAiAssistant({ session, onSetSelection, patientName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleSuggest() {
    setError(null);
    setLoading(true);
    try {
      const res = await suggestPsychologyMarks(session, { patientName });
      setResult({
        ...res,
        suggestions: res.suggestions.map((s, i) => ({
          ...s,
          id: `${s.group}:${s.item}:${i}`,
          // Já marcado no checklist conta como aceito de saída.
          status: session.selectedMap[`${s.group}:${s.item}`] ? 'accepted' : 'pending',
        })),
      });
    } catch (err) {
      setError(err.message || 'Falha ao gerar sugestões.');
    } finally {
      setLoading(false);
    }
  }

  function updateSuggestion(id, status) {
    setResult(prev => prev && ({
      ...prev,
      suggestions: prev.suggestions.map(s => (s.id === id ? { ...s, status } : s)),
    }));
  }

  function handleAccept(s) {
    onSetSelection(s.group, s.item, true);
    updateSuggestion(s.id, 'accepted');
  }

  const pending = result?.suggestions.filter(s => s.status === 'pending').length ?? 0;
  const isMock = result?.modelVersion?.startsWith('mock');

  return (
    <div className="box" style={{ borderColor: 'var(--gold)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b>Assistente de marcações (IA)</b>
          <p className="small" style={{ margin: '4px 0 0' }}>{PSYCHOLOGY_AI_DISCLAIMER}</p>
        </div>
        <button type="button" className="ai-analyze-btn" disabled={loading} onClick={handleSuggest} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          {loading ? 'Lendo o texto…' : result ? 'Sugerir novamente' : 'Sugerir marcações com IA'}
        </button>
      </div>

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}

      {result && (
        <div className="ai-findings-section" style={{ marginTop: 12 }}>
          <p className="small">
            Modelo: {result.modelVersion}{isMock ? ' (simulado)' : ''}.
            {pending > 0 && <span className="ai-pending-pill">{pending} pendente{pending === 1 ? '' : 's'}</span>}
          </p>
          {result.warning && (
            <div className="alert" style={{ marginTop: 8 }}><b>Aviso:</b> {result.warning}</div>
          )}
          {result.suggestions.length === 0 && (
            <p className="small" style={{ marginTop: 8 }}>Nenhuma marcação sugerida para este texto.</p>
          )}

          <div className="ai-findings-grid">
            {result.suggestions.map(s => {
              const band = confidenceBand(s.confidence);
              const pct = Math.round(s.confidence * 100);
              const isRisk = s.group === PSYCHOLOGY_RISK_GROUP;
              return (
                <div key={s.id} className={`ai-finding-card ${s.status}`}>
                  <div className="ai-finding-head">
                    <div>
                      <span className="ai-finding-type">{PSI_GROUP_LABELS[s.group] || s.group}</span>
                      <h4 style={isRisk ? { color: '#b3261e' } : undefined}>{s.item}</h4>
                      <p className="ai-finding-pattern small">{s.rationale}</p>
                    </div>
                    <div className={`ai-confidence ${band.level}`} title={`Confiança estimada: ${pct}%`}>
                      <span className="ai-confidence-label">confiança {band.label}</span>
                      <div className="ai-confidence-bar"><div className="ai-confidence-fill" style={{ width: `${pct}%` }} /></div>
                      <span className="small">{pct}%</span>
                    </div>
                  </div>
                  <div className="ai-finding-actions">
                    {s.status === 'pending' ? (
                      <>
                        <button type="button" className="btn-mini accept" onClick={() => handleAccept(s)}>✓ Aceitar</button>
                        <button type="button" className="btn-mini" onClick={() => updateSuggestion(s.id, 'ignored')}>Ignorar</button>
                      </>
                    ) : (
                      <>
                        <span className={`ai-status-badge ${s.status}`}>
                          {s.status === 'accepted' ? 'Marcado no checklist' : 'Ignorado'}
                        </span>
                        {s.status === 'ignored' && (
                          <button type="button" className="btn-mini" onClick={() => updateSuggestion(s.id, 'pending')}>Desfazer</button>
                        )}
                      </>
                    )}
                    <AiCorrectionButton
                      surface={AI_SURFACES.PSYCH_MARKS}
                      aiOutput={{ group: s.group, item: s.item, rationale: s.rationale, confidence: s.confidence }}
                      contextSnapshot={{ group: s.group }}
                      modelVersion={result.modelVersion}
                      patientName={patientName}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Leitura da IA (rascunho): visão geral + hipóteses + riscos + perguntas,
// gerada sob demanda e persistida com a sessão (session.aiReading).
function PsychologyAiReading({ session, onReadingChange, patientName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reading = session.aiReading;
  const isMock = reading?.modelVersion?.startsWith('mock');

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      const res = await generatePsychologyReading(session, { patientName });
      onReadingChange({ ...res, generatedAt: new Date().toISOString() });
    } catch (err) {
      setError(err.message || 'Falha ao gerar a leitura.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="box psi-reading-box">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <b>Leitura da IA <span className="psi-draft-badge">RASCUNHO — revisar</span></b>
          <p className="small" style={{ margin: '4px 0 0' }}>{PSYCHOLOGY_READING_DISCLAIMER}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="ai-analyze-btn" disabled={loading} onClick={handleGenerate} style={{ margin: 0, whiteSpace: 'nowrap' }}>
            {loading ? 'Lendo a anamnese…' : reading ? 'Gerar novamente' : 'Gerar leitura (rascunho)'}
          </button>
          {reading && (
            <button type="button" className="btn-mini" onClick={() => onReadingChange(null)}>Descartar</button>
          )}
        </div>
      </div>

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}

      {reading && (
        <div className="psi-reading-body">
          <p className="small">
            Modelo: {reading.modelVersion}{isMock ? ' (simulado)' : ''}
            {reading.generatedAt ? ` · gerada em ${new Date(reading.generatedAt).toLocaleString('pt-BR')}` : ''}.
          </p>

          {reading.riskAlerts?.length > 0 && (
            <div className="alert psi-risk-reminder" style={{ marginTop: 8 }}>
              <b>⚠ Sinais de risco destacados pela IA (confira primeiro):</b>
              <ul className="psi-reading-list">
                {reading.riskAlerts.map((alert, i) => (
                  <li key={i}><b>{alert.sign}</b>{alert.note ? ` — ${alert.note}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {reading.overview && (
            <div className="psi-reading-block">
              <h4>Visão geral</h4>
              <p>{reading.overview}</p>
            </div>
          )}

          {reading.hypotheses?.length > 0 && (
            <div className="psi-reading-block">
              <h4>Hipóteses de trabalho (não é diagnóstico)</h4>
              {reading.hypotheses.map((h, i) => {
                const band = confidenceBand(h.confidence);
                const pct = Math.round(h.confidence * 100);
                return (
                  <div key={i} className="psi-hypothesis">
                    <div className="psi-hypothesis-head">
                      <b>{h.name}</b>
                      <span className={`ai-confidence ${band.level}`} title={`Confiança estimada: ${pct}%`}>
                        <span className="ai-confidence-label">confiança {band.label} · {pct}%</span>
                      </span>
                    </div>
                    {h.basis && <p className="small">{h.basis}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {reading.questions?.length > 0 && (
            <div className="psi-reading-block">
              <h4>Perguntas para explorar</h4>
              <ul className="psi-reading-list">
                {reading.questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}

          {reading.cautions?.length > 0 && (
            <div className="psi-reading-block">
              <h4>Cautelas da própria IA</h4>
              <ul className="psi-reading-list">
                {reading.cautions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          <div className="ai-finding-actions" style={{ marginTop: 10 }}>
            <AiCorrectionButton
              surface={AI_SURFACES.PSYCH_READING}
              aiOutput={reading}
              contextSnapshot={{
                markedGroups: Object.keys(session.selectedMap || {}).filter(key => session.selectedMap[key]).length,
                hasRisk: hasPsychologyRiskSelected(session.selectedMap),
              }}
              modelVersion={reading.modelVersion}
              patientName={patientName}
              summary={reading.overview}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function formatTime(date) {
  return date?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) || '';
}

const SAVE_LABELS = {
  saving: 'Salvando…',
  saved: 'Salvo',
  error: 'Erro ao salvar — tente de novo',
};

export function PsychologyWorkspace({ profile, therapistName, onSwitchDiscipline, onSignOut }) {
  const { selectedPatient, clearSelection } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const hasMultipleDisciplines = resolveUserDisciplines(profile).length > 1;

  const [modality, setModality] = useState(null); // null = escolher modalidade
  const [session, setSession] = useState(createEmptyPsychologySession);
  const [recordId, setRecordId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasPending, setHasPending] = useState(false);

  const hydratingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const patientIdRef = useRef(selectedPatient?.id || null);

  useEffect(() => {
    patientIdRef.current = selectedPatient?.id || null;
  }, [selectedPatient?.id]);

  // Carrega a última anamnese de Psi ao trocar de paciente.
  useEffect(() => {
    const patientId = selectedPatient?.id;
    setModality(null);
    setRecordId(null);
    setSaveStatus('idle');
    setLastSavedAt(null);
    setHasPending(false);
    hydratingRef.current = true;

    if (!patientId) {
      setSession(createEmptyPsychologySession());
      hydratingRef.current = false;
      return;
    }

    let cancelled = false;
    getLatestRecord(patientId, PSI_ANAMNESE_RECORD_TYPE)
      .then(record => {
        if (cancelled || patientIdRef.current !== patientId) return;
        if (record?.sensitive_data?.session) {
          setSession({ ...createEmptyPsychologySession(), ...record.sensitive_data.session });
          setRecordId(record.id);
          setLastSavedAt(new Date(record.updated_at));
        } else {
          setSession(createEmptyPsychologySession());
        }
      })
      .catch(err => {
        console.error('Erro ao carregar anamnese de psicologia:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setTimeout(() => { hydratingRef.current = false; }, 0);
        }
      });

    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  const doSave = useCallback(async () => {
    const patientId = patientIdRef.current;
    if (!patientId) return;
    setSaveStatus('saving');
    const payload = {
      discipline: 'psicologia',
      contentStatus: PSYCHOLOGY_CONTENT_STATUS,
      session,
    };
    try {
      if (recordId) {
        await updateClinicalRecord(recordId, payload);
      } else {
        const newId = await saveClinicalRecord(patientId, PSI_ANAMNESE_RECORD_TYPE, payload, 'psicologia');
        if (patientIdRef.current === patientId) setRecordId(newId);
      }
      if (patientIdRef.current === patientId) {
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        setHasPending(false);
        setTimeout(() => setSaveStatus(status => (status === 'saved' ? 'idle' : status)), 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar anamnese de psicologia:', err);
      if (patientIdRef.current === patientId) setSaveStatus('error');
    }
  }, [session, recordId]);

  // Auto-save com debounce (mesmo ritmo do MTC: 5s após a última mudança).
  useEffect(() => {
    if (hydratingRef.current || !selectedPatient?.id) return undefined;
    setHasPending(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 5000);
    return () => clearTimeout(saveTimerRef.current);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alerta do navegador se sair com mudanças pendentes.
  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!hasPending) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPending]);

  function confirmPending(message) {
    return !hasPending || window.confirm(message);
  }

  function handleSwitchArea() {
    if (!confirmPending('Existem alterações ainda não salvas. Deseja trocar de área mesmo assim?')) return;
    onSwitchDiscipline?.();
  }

  function handleSignOut() {
    if (!confirmPending('Existem alterações ainda não salvas. Deseja sair mesmo assim?')) return;
    onSignOut?.();
  }

  function handleChangePatient() {
    if (!confirmPending('Existem alterações ainda não salvas. Deseja trocar de paciente mesmo assim?')) return;
    clearSelection();
  }

  function toggleCheck(group, item) {
    setSession(prev => {
      const key = `${group}:${item}`;
      return { ...prev, selectedMap: { ...prev.selectedMap, [key]: !prev.selectedMap[key] } };
    });
  }

  // Aceitar sugestão da IA SETA o valor (não alterna): aceitar um item
  // já marcado não pode desmarcá-lo.
  function setCheck(group, item, value) {
    setSession(prev => ({
      ...prev,
      selectedMap: { ...prev.selectedMap, [`${group}:${item}`]: Boolean(value) },
    }));
  }

  function updateFieldValue(fieldId, value) {
    setSession(prev => ({ ...prev, fields: { ...prev.fields, [fieldId]: value } }));
  }

  // Quick-word chip: apenda a palavra na caixa de texto do campo.
  function handleQuickWord(fieldId, word) {
    setSession(prev => ({
      ...prev,
      fields: { ...prev.fields, [fieldId]: appendQuickWord(prev.fields[fieldId], word) },
    }));
  }

  function handleReadingChange(reading) {
    setSession(prev => ({ ...prev, aiReading: reading }));
  }

  const riskSelected = hasPsychologyRiskSelected(session.selectedMap);
  const patientAge = getPatientAge(selectedPatient);

  return (
    <div className="hub-screen psi-screen">
      <header className="hub-topbar">
        <div className="hub-brand">
          <h1>{clinicName}</h1>
          <p>Psicologia · {therapistName || 'Profissional'}</p>
        </div>
        <div className="psi-topbar-actions">
          <button type="button" className={hasMultipleDisciplines ? 'btn-switch-specialty-top' : 'topbar-button'} onClick={handleSwitchArea}>
            {hasMultipleDisciplines ? 'Mudar Especialidade' : 'Trocar de área'}
          </button>
          <button type="button" className="topbar-button" onClick={handleSignOut}>Sair</button>
        </div>
      </header>

      <main className="hub-body psi-body">
        <div className="alert psi-draft-banner">
          <b>Vocabulário em validação.</b> {PSYCHOLOGY_DRAFT_NOTICE}
        </div>

        {!selectedPatient ? (
          <PatientStart
            initialDiscipline="psicologia"
            therapistName={therapistName}
            onCreatePatient={() => setModality('anamnese_clinica')}
            onSelectPatient={() => setModality(null)}
            onSignOut={handleSignOut}
          />
        ) : !modality ? (
          <section className="psi-modalities">
            <div className="psi-patient-bar">
              <div>
                <b>{selectedPatient.name}</b>
                <small>{patientAge ? `${patientAge} anos` : 'Idade não informada'}</small>
              </div>
              <button type="button" className="tag" onClick={handleChangePatient}>Trocar paciente</button>
            </div>

            <h2>Como você vai atender agora?</h2>
            <p className="hub-note">Fluxos distintos, registros distintos — os dois gravam na área de Psicologia.</p>

            <div className="hub-grid psi-modality-grid">
              {PSYCHOLOGY_MODALITIES.map(item => (
                <button
                  key={item.id}
                  type="button"
                  className={`hub-card ${item.available ? 'hub-card-enabled' : 'hub-card-soon'}`}
                  disabled={!item.available}
                  onClick={item.available ? () => setModality(item.id) : undefined}
                  title={item.available ? `Abrir ${item.label}` : 'Estrutura a definir com a psicóloga.'}
                >
                  <span className="hub-card-text">
                    <b>{item.label}</b>
                    <span className="hub-card-desc">{item.description}</span>
                  </span>
                  {item.available
                    ? <span className="hub-card-cta">Abrir →</span>
                    : <span className="hub-card-badge hub-card-badge-soon">A definir com a psicóloga</span>}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="psi-anamnese">
            <div className="psi-patient-bar">
              <div>
                <b>{selectedPatient.name}</b>
                <small>{patientAge ? `${patientAge} anos` : 'Idade não informada'} · Anamnese clínica</small>
              </div>
              <div className="psi-patient-bar-actions">
                <span className={`psi-save-status psi-save-${saveStatus}`}>
                  {SAVE_LABELS[saveStatus] || (lastSavedAt ? `Salvo às ${formatTime(lastSavedAt)}` : 'Sem alterações salvas')}
                </span>
                <button type="button" className="tag" onClick={doSave} disabled={saveStatus === 'saving'}>
                  Salvar agora
                </button>
                <button type="button" className="tag" onClick={() => setModality(null)}>Modalidades</button>
                <button type="button" className="tag" onClick={handleChangePatient}>Trocar paciente</button>
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">Anamnese clínica — Psicologia</div>
              <div className="panel-body">
                <h3 className="psi-section-title">1. Escuta livre</h3>
                <p className="small">
                  Registre com as suas palavras — os botões abaixo de cada campo escrevem por você.
                  A IA sugere e redige em rascunho; você decide o que entra e pode corrigi-la.
                </p>
                {PSYCHOLOGY_TEXT_FIELDS.map(field => (
                  <div key={field.id} className="psi-field">
                    <FieldInput
                      label={field.label}
                      field={field.id}
                      value={session.fields[field.id]}
                      onChange={updateFieldValue}
                      textarea={field.textarea}
                    />
                    <QuickWordChips
                      words={field.quickWords}
                      onPick={word => handleQuickWord(field.id, word)}
                    />
                  </div>
                ))}

                <PsychologyAiAssistant
                  session={session}
                  onSetSelection={setCheck}
                  patientName={selectedPatient?.name}
                />

                <h3 className="psi-section-title">2. Sinais organizados (proposta a validar)</h3>
                {PSYCHOLOGY_CHECKLIST_SECTIONS.map(section => (
                  <div key={section.group}>
                    <h4>{section.title}</h4>
                    <CheckGrid
                      group={section.group}
                      items={section.items}
                      selectedMap={session.selectedMap}
                      onToggle={toggleCheck}
                    />
                  </div>
                ))}

                <h3 className="psi-section-title psi-risk-title">3. Sinais de risco (sempre conferir)</h3>
                <div className={`box psi-risk-box${riskSelected ? ' psi-risk-active' : ''}`}>
                  <CheckGrid
                    group={PSYCHOLOGY_RISK_GROUP}
                    items={psychologyRiskChecklist}
                    cols={2}
                    selectedMap={session.selectedMap}
                    onToggle={toggleCheck}
                  />
                  {riskSelected && (
                    <div className="alert psi-risk-reminder">
                      <b>⚠ Atenção.</b> {PSYCHOLOGY_RISK_REMINDER}
                    </div>
                  )}
                  <FieldInput
                    label="Anotações sobre risco e conduta combinada"
                    field="riskNotes"
                    value={session.riskNotes}
                    onChange={(_, value) => setSession(prev => ({ ...prev, riskNotes: value }))}
                    textarea
                  />
                </div>

                <h3 className="psi-section-title">4. Leitura da IA (rascunho para sua revisão)</h3>
                <PsychologyAiReading
                  session={session}
                  onReadingChange={handleReadingChange}
                  patientName={selectedPatient?.name}
                />
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
