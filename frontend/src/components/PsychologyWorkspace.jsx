/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { getPatientAge } from '../hooks/useClinicState';
import { PatientStart } from './PatientStart';
import { Sidebar } from './Sidebar';
import { SaveIndicator } from './ui/SaveIndicator';
import {
  getLatestRecord,
  saveClinicalRecord,
  updateClinicalRecord,
} from '../services/clinicalRecordService';
import {
  PSI_ANAMNESE_RECORD_TYPE,
  PSI_NEURO_RECORD_TYPE,
  PSYCHOLOGY_CONTENT_STATUS,
  PSYCHOLOGY_DRAFT_NOTICE,
  PSYCHOLOGY_PLACEHOLDER_TABS,
  PSYCHOLOGY_TABS,
  appendQuickWord,
  createEmptyPsychologySession,
  normalizePsychologySession,
} from '../data/psychologyAnamnese';
import {
  NEUROPSYCHOLOGY_CONTENT_STATUS,
  createEmptyNeuropsychologyEvaluation,
  normalizeNeuropsychologyEvaluation,
} from '../data/neuropsychologyEvaluation';
import { PSYCHOLOGY_INFORMANT_OPTIONS } from '../data/psychologyIntakeProfiles';
import { resolveUserDisciplines } from '../data/disciplines';
import { PsychologyAnamnese } from './psychology/PsychologyAnamnese';
import { PsychologyAssistantRail } from './psychology/PsychologyAssistantRail';
import { PsychologyEvolucao } from './psychology/PsychologyEvolucao';
import { PsychologyRelatorio } from './psychology/PsychologyRelatorio';
import { PsychologyPlaceholder } from './psychology/PsychologyPlaceholder';
import { PsychologyPathChooser } from './psychology/PsychologyPathChooser';
import { PsychologyNeuroAssessment } from './psychology/PsychologyNeuroAssessment';
import { PsychologyNeuroReport } from './psychology/PsychologyNeuroReport';
import { PsychologyHypotheses } from './psychology/PsychologyHypotheses';

// ============================================================
// Workspace de Psicologia — SHELL (Plano C, Rodada 1).
// Espelha o shell da Acupuntura (App.jsx): sidebar completa, topbar,
// salvamento automático, conteúdo central + rail lateral. Roteia
// activeTab → painel. Sem conceitos de MTC.
//
// Persistência: UM registro (psi_anamnese) carrega a sessão inteira
// do paciente — anamnese, evoluções (session.evolucoes) e rascunhos
// de relatório (session.relatorio). O auto-save cobre tudo.
//
// Invariantes: IA sugere e redige RASCUNHO; nada entra sozinho; o
// bloco de risco destaca e lembra, nunca decide.
// ============================================================

// Grupos da sidebar (Plano C). Abas teóricas são placeholders na
// Rodada 1 (ver PSYCHOLOGY_PLACEHOLDER_TABS).
const PSYCHOLOGY_NAV_GROUPS = [
  { title: null, tabs: [PSYCHOLOGY_TABS.HOME, PSYCHOLOGY_TABS.PAINEL] },
  { title: 'Avaliação', tabs: [PSYCHOLOGY_TABS.ANAMNESE, PSYCHOLOGY_TABS.NEURO] },
  { title: 'Formulação clínica', tabs: [PSYCHOLOGY_TABS.SINTESE, PSYCHOLOGY_TABS.HIPOTESES] },
  { title: 'Plano de cuidado', tabs: [PSYCHOLOGY_TABS.OBJETIVOS, PSYCHOLOGY_TABS.PLANO] },
  { title: 'Acompanhamento', tabs: [PSYCHOLOGY_TABS.EVOLUCAO] },
  { title: 'Documentos', tabs: [PSYCHOLOGY_TABS.RELATORIO] },
  { title: 'Apoio', tabs: [PSYCHOLOGY_TABS.BIBLIOTECA] },
];

const TABS_WITHOUT_PATIENT = [PSYCHOLOGY_TABS.HOME, PSYCHOLOGY_TABS.BIBLIOTECA];

export function PsychologyWorkspace({ profile, therapistName, onSwitchDiscipline, onSignOut }) {
  const { selectedPatient } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const hasMultipleDisciplines = resolveUserDisciplines(profile).length > 1;

  const [activeTab, setActiveTab] = useState(PSYCHOLOGY_TABS.HOME);
  const [activeJourney, setActiveJourney] = useState(null);
  const [session, setSession] = useState(createEmptyPsychologySession);
  const [neuroEvaluation, setNeuroEvaluation] = useState(createEmptyNeuropsychologyEvaluation);
  const [recordId, setRecordId] = useState(null);
  const [neuroRecordId, setNeuroRecordId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [neuroSaveStatus, setNeuroSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [neuroLastSavedAt, setNeuroLastSavedAt] = useState(null);
  const [hasPending, setHasPending] = useState(false);
  const [neuroHasPending, setNeuroHasPending] = useState(false);

  const hydratingRef = useRef(false);
  const neuroHydratingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const neuroSaveTimerRef = useRef(null);
  const patientIdRef = useRef(selectedPatient?.id || null);

  useEffect(() => {
    patientIdRef.current = selectedPatient?.id || null;
  }, [selectedPatient?.id]);

  // Carrega anamnese e avaliação em registros independentes do mesmo paciente.
  useEffect(() => {
    const patientId = selectedPatient?.id;
    setActiveJourney(null);
    setRecordId(null);
    setNeuroRecordId(null);
    setSaveStatus('idle');
    setNeuroSaveStatus('idle');
    setLastSavedAt(null);
    setNeuroLastSavedAt(null);
    setHasPending(false);
    setNeuroHasPending(false);
    hydratingRef.current = true;
    neuroHydratingRef.current = true;

    if (!patientId) {
      setSession(createEmptyPsychologySession());
      setNeuroEvaluation(createEmptyNeuropsychologyEvaluation());
      hydratingRef.current = false;
      neuroHydratingRef.current = false;
      return;
    }

    let cancelled = false;
    Promise.all([
      getLatestRecord(patientId, PSI_ANAMNESE_RECORD_TYPE),
      getLatestRecord(patientId, PSI_NEURO_RECORD_TYPE),
    ])
      .then(([record, neuroRecord]) => {
        if (cancelled || patientIdRef.current !== patientId) return;
        if (record?.sensitive_data?.session) {
          setSession(normalizePsychologySession(record.sensitive_data.session));
          setRecordId(record.id);
          setLastSavedAt(new Date(record.updated_at));
        } else {
          setSession(createEmptyPsychologySession());
        }
        if (neuroRecord?.sensitive_data?.evaluation) {
          setNeuroEvaluation(normalizeNeuropsychologyEvaluation(neuroRecord.sensitive_data.evaluation));
          setNeuroRecordId(neuroRecord.id);
          setNeuroLastSavedAt(new Date(neuroRecord.updated_at));
        } else {
          setNeuroEvaluation(createEmptyNeuropsychologyEvaluation());
        }
      })
      .catch(err => {
        console.error('Erro ao carregar prontuários de psicologia:', err);
      })
      .finally(() => {
        if (!cancelled) {
          setTimeout(() => {
            hydratingRef.current = false;
            neuroHydratingRef.current = false;
          }, 0);
        }
      });

    return () => { cancelled = true; };
  }, [selectedPatient?.id]);

  const doSaveAnamnese = useCallback(async () => {
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

  const doSaveNeuro = useCallback(async () => {
    const patientId = patientIdRef.current;
    if (!patientId) return;
    setNeuroSaveStatus('saving');
    const payload = {
      discipline: 'psicologia',
      contentStatus: NEUROPSYCHOLOGY_CONTENT_STATUS,
      evaluation: neuroEvaluation,
    };
    try {
      if (neuroRecordId) {
        await updateClinicalRecord(neuroRecordId, payload);
      } else {
        const newId = await saveClinicalRecord(patientId, PSI_NEURO_RECORD_TYPE, payload, 'psicologia');
        if (patientIdRef.current === patientId) setNeuroRecordId(newId);
      }
      if (patientIdRef.current === patientId) {
        setNeuroSaveStatus('saved');
        setNeuroLastSavedAt(new Date());
        setNeuroHasPending(false);
        setTimeout(() => setNeuroSaveStatus(status => (status === 'saved' ? 'idle' : status)), 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar avaliação neuropsicológica:', err);
      if (patientIdRef.current === patientId) setNeuroSaveStatus('error');
    }
  }, [neuroEvaluation, neuroRecordId]);

  // Auto-save com debounce (mesmo ritmo do MTC: 5s após a última mudança).
  useEffect(() => {
    if (hydratingRef.current || !selectedPatient?.id) return undefined;
    setHasPending(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSaveAnamnese, 5000);
    return () => clearTimeout(saveTimerRef.current);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (neuroHydratingRef.current || !selectedPatient?.id) return undefined;
    setNeuroHasPending(true);
    if (neuroSaveTimerRef.current) clearTimeout(neuroSaveTimerRef.current);
    neuroSaveTimerRef.current = setTimeout(doSaveNeuro, 5000);
    return () => clearTimeout(neuroSaveTimerRef.current);
  }, [neuroEvaluation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Alerta do navegador se sair com mudanças pendentes.
  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!hasPending && !neuroHasPending) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPending, neuroHasPending]);

  function confirmPending(message) {
    return (!hasPending && !neuroHasPending) || window.confirm(message);
  }

  function handleSwitchArea() {
    if (!confirmPending('Existem alterações ainda não salvas. Deseja trocar de área mesmo assim?')) return;
    onSwitchDiscipline?.();
  }

  function handleSignOut() {
    if (!confirmPending('Existem alterações ainda não salvas. Deseja sair mesmo assim?')) return;
    onSignOut?.();
  }

  function handleTabChange(tab) {
    if (!selectedPatient && !TABS_WITHOUT_PATIENT.includes(tab)) {
      setActiveTab(PSYCHOLOGY_TABS.HOME);
      return;
    }
    if (tab === PSYCHOLOGY_TABS.ANAMNESE) {
      if (!session.intakeProfile) {
        setActiveJourney(null);
        setActiveTab(PSYCHOLOGY_TABS.PAINEL);
        return;
      }
      setActiveJourney('anamnese');
    }
    if (tab === PSYCHOLOGY_TABS.NEURO) setActiveJourney('avaliacao');
    if (tab === PSYCHOLOGY_TABS.HIPOTESES) setActiveJourney('anamnese');
    setActiveTab(tab);
  }

  // ── Handlers de sessão (mutações pontuais) ──
  function toggleCheck(group, item) {
    setSession(prev => {
      const key = `${group}:${item}`;
      return { ...prev, selectedMap: { ...prev.selectedMap, [key]: !prev.selectedMap[key] } };
    });
  }

  // Confirmar sugestão da IA SETA o valor (não alterna).
  function setCheck(group, item, value) {
    setSession(prev => ({
      ...prev,
      selectedMap: { ...prev.selectedMap, [`${group}:${item}`]: Boolean(value) },
    }));
  }

  function updateFieldValue(fieldId, value) {
    setSession(prev => ({ ...prev, fields: { ...prev.fields, [fieldId]: value } }));
  }

  function handleQuickWord(fieldId, word) {
    setSession(prev => ({
      ...prev,
      fields: { ...prev.fields, [fieldId]: appendQuickWord(prev.fields[fieldId], word) },
    }));
  }

  function selectIntakeProfile(profileId) {
    setSession(prev => ({
      ...prev,
      intakeProfile: profileId,
      intakeSelectedAt: new Date().toISOString(),
    }));
    setActiveJourney('anamnese');
    setActiveTab(PSYCHOLOGY_TABS.ANAMNESE);
  }

  function updateFieldInformant(fieldId, informant) {
    setSession(prev => ({
      ...prev,
      fieldInformants: { ...prev.fieldInformants, [fieldId]: informant },
    }));
  }

  function archiveFieldResponse(fieldId) {
    setSession(prev => {
      const value = String(prev.fields?.[fieldId] || '').trim();
      if (!value) return prev;
      const informant = prev.fieldInformants?.[fieldId] || {};
      const informantLabel = PSYCHOLOGY_INFORMANT_OPTIONS
        .find(option => option.id === informant.type)?.label || 'Informante não identificado';
      const entry = {
        id: `response-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        value,
        informantType: informant.type || '',
        informantLabel,
        informantName: informant.name || '',
        recordedAt: new Date().toISOString(),
      };
      return {
        ...prev,
        fields: { ...prev.fields, [fieldId]: '' },
        fieldInformants: { ...prev.fieldInformants, [fieldId]: { type: '', name: '' } },
        responseHistory: {
          ...prev.responseHistory,
          [fieldId]: [...(prev.responseHistory?.[fieldId] || []), entry],
        },
      };
    });
  }

  function handleAxisNote(axisId, value) {
    setSession(prev => ({ ...prev, axisNotes: { ...prev.axisNotes, [axisId]: value } }));
  }

  function handleRiskNotes(value) {
    setSession(prev => ({ ...prev, riskNotes: value }));
  }

  function handleReadingChange(reading) {
    setSession(prev => ({ ...prev, aiReading: reading }));
  }

  function handleEvolucoesChange(evolucoes) {
    setSession(prev => ({ ...prev, evolucoes }));
  }

  function handleRelatorioChange(relatorio) {
    setSession(prev => ({ ...prev, relatorio }));
  }

  function handleHypothesisReviews(hypothesisReviews) {
    setSession(prev => ({ ...prev, hypothesisReviews }));
  }

  function openPathChooser() {
    setActiveJourney(null);
    setActiveTab(PSYCHOLOGY_TABS.PAINEL);
  }

  function openEvaluation() {
    setActiveJourney('avaliacao');
    setActiveTab(PSYCHOLOGY_TABS.NEURO);
  }

  const patientAge = getPatientAge(selectedPatient);
  const effectiveTab = !selectedPatient && !TABS_WITHOUT_PATIENT.includes(activeTab)
    ? PSYCHOLOGY_TABS.HOME
    : activeTab;
  const isNeuroContext = activeJourney === 'avaliacao' || effectiveTab === PSYCHOLOGY_TABS.NEURO;
  const showAssistantRail = effectiveTab === PSYCHOLOGY_TABS.ANAMNESE && Boolean(selectedPatient);
  const now = new Date();
  const dateLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function renderPanel() {
    if (effectiveTab === PSYCHOLOGY_TABS.HOME || (!selectedPatient && effectiveTab !== PSYCHOLOGY_TABS.BIBLIOTECA)) {
      return (
        <PatientStart
          initialDiscipline="psicologia"
          therapistName={therapistName}
          onCreatePatient={() => setActiveTab(PSYCHOLOGY_TABS.PAINEL)}
          onSelectPatient={() => setActiveTab(PSYCHOLOGY_TABS.PAINEL)}
          onSignOut={handleSignOut}
        />
      );
    }

    if (PSYCHOLOGY_PLACEHOLDER_TABS.includes(effectiveTab)) {
      return <PsychologyPlaceholder tab={effectiveTab} />;
    }

    switch (effectiveTab) {
      case PSYCHOLOGY_TABS.PAINEL:
        return (
          <PsychologyPathChooser
            session={session}
            neuroEvaluation={neuroEvaluation}
            selectedPatient={selectedPatient}
            patientAge={patientAge}
            onSelectIntakeProfile={selectIntakeProfile}
            onOpenEvaluation={openEvaluation}
            onOpenEvolution={() => setActiveTab(PSYCHOLOGY_TABS.EVOLUCAO)}
          />
        );
      case PSYCHOLOGY_TABS.ANAMNESE:
        return (
          <PsychologyAnamnese
            session={session}
            onUpdateField={updateFieldValue}
            onQuickWord={handleQuickWord}
            onToggleCheck={toggleCheck}
            onAxisNote={handleAxisNote}
            onRiskNotesChange={handleRiskNotes}
            onInformantChange={updateFieldInformant}
            onArchiveResponse={archiveFieldResponse}
            onChooseProfile={openPathChooser}
          />
        );
      case PSYCHOLOGY_TABS.NEURO:
        return (
          <PsychologyNeuroAssessment
            evaluation={neuroEvaluation}
            onChange={setNeuroEvaluation}
            onChoosePath={openPathChooser}
          />
        );
      case PSYCHOLOGY_TABS.HIPOTESES:
        return (
          <PsychologyHypotheses
            session={session}
            onReviewsChange={handleHypothesisReviews}
            onOpenAnamnese={() => handleTabChange(PSYCHOLOGY_TABS.ANAMNESE)}
          />
        );
      case PSYCHOLOGY_TABS.EVOLUCAO:
        if (isNeuroContext) {
          return (
            <PsychologyNeuroAssessment
              evaluation={neuroEvaluation}
              onChange={setNeuroEvaluation}
              onChoosePath={openPathChooser}
            />
          );
        }
        return (
          <PsychologyEvolucao
            session={session}
            onEvolucoesChange={handleEvolucoesChange}
          />
        );
      case PSYCHOLOGY_TABS.RELATORIO:
        if (isNeuroContext) {
          return (
            <PsychologyNeuroReport
              evaluation={neuroEvaluation}
              selectedPatient={selectedPatient}
              therapistProfile={profile}
              onChange={setNeuroEvaluation}
            />
          );
        }
        return (
          <PsychologyRelatorio
            session={session}
            selectedPatient={selectedPatient}
            therapistProfile={profile}
            onRelatorioChange={handleRelatorioChange}
          />
        );
      default:
        return (
          <PsychologyPathChooser
            session={session}
            neuroEvaluation={neuroEvaluation}
            selectedPatient={selectedPatient}
            patientAge={patientAge}
            onSelectIntakeProfile={selectIntakeProfile}
            onOpenEvaluation={openEvaluation}
            onOpenEvolution={() => setActiveTab(PSYCHOLOGY_TABS.EVOLUCAO)}
          />
        );
    }
  }

  return (
    <div className="app psi-app">
      <Sidebar
        activeTab={effectiveTab}
        onTabChange={handleTabChange}
        therapist={therapistName}
        profileRole={profile?.role}
        disciplineLabel="Psicologia"
        onSwitchDiscipline={handleSwitchArea}
        selectedPatient={selectedPatient}
        patientAge={patientAge}
        sessionCount={(Array.isArray(session.evolucoes) ? session.evolucoes.length : 0)
          + (Array.isArray(neuroEvaluation.sessions)
            ? neuroEvaluation.sessions.filter(item => item.status === 'concluida').length
            : 0)}
        lastVisit=""
        hasMultipleDisciplines={hasMultipleDisciplines}
        navGroups={PSYCHOLOGY_NAV_GROUPS}
        patientTab={PSYCHOLOGY_TABS.PAINEL}
        tabsWithoutPatient={TABS_WITHOUT_PATIENT}
      />

      <main className="main psi-main">
        <div className="app-topbar no-print">
          <div>
            <p className="app-eyebrow">{clinicName} · Psicologia</p>
            <h1>{selectedPatient ? 'Paciente em atendimento' : 'Workspace de Psicologia'}</h1>
          </div>
          <div className="app-topbar-actions">
            <div className="mini-clock" aria-label="Relógio">
              <span>{dateLabel}</span>
              <b>{timeLabel}</b>
            </div>
            <SaveIndicator
              status={isNeuroContext ? neuroSaveStatus : saveStatus}
              lastSavedAt={isNeuroContext ? neuroLastSavedAt : lastSavedAt}
              onSave={isNeuroContext ? doSaveNeuro : doSaveAnamnese}
              hasPatient={Boolean(selectedPatient)}
              hasPendingChanges={isNeuroContext ? neuroHasPending : hasPending}
            />
            <button type="button" className="topbar-button" onClick={handleSignOut}>Sair</button>
          </div>
        </div>

        {effectiveTab === PSYCHOLOGY_TABS.ANAMNESE && (
          <div className="alert psi-draft-banner">
            <b>Vocabulário em validação.</b> {PSYCHOLOGY_DRAFT_NOTICE}
          </div>
        )}

        <div className={`workspace-grid${showAssistantRail ? '' : ' workspace-grid-full'}`}>
          <section>
            {renderPanel()}
          </section>

          {showAssistantRail && (
            <aside className="assistant-rail no-print">
              <PsychologyAssistantRail
                session={session}
                onSetSelection={setCheck}
                onReadingChange={handleReadingChange}
                patientName={selectedPatient?.name}
              />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
