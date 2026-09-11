/* eslint-disable react-hooks/set-state-in-effect */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { getPatientAge } from '../hooks/useClinicState';
import { PatientStart } from './PatientStart';
import { Sidebar } from './Sidebar';
import { Panel } from './ui/Panel';
import { SaveIndicator } from './ui/SaveIndicator';
import {
  getLatestRecord,
  upsertVersionedClinicalRecord,
} from '../services/clinicalRecordService';
import { createClinicalSaveQueue } from '../services/clinicalSaveQueue';
import { resolveUserDisciplines } from '../data/disciplines';
import {
  NEUROPSYCHOLOGY_CONTENT_STATUS,
  NEUROPSYCHOLOGY_DRAFT_NOTICE,
  createEmptyNeuropsychologyEvaluation,
  normalizeNeuropsychologyEvaluation,
} from '../data/neuropsychologyEvaluation';
import { PSI_NEURO_RECORD_TYPE } from '../data/psychologyAnamnese';
import { PsychologyNeuroAssessment } from './psychology/PsychologyNeuroAssessment';
import { PsychologyNeuroReport } from './psychology/PsychologyNeuroReport';

const DocumentosTimbrados = lazy(() => import('./panels/DocumentosTimbrados')
  .then(module => ({ default: module.DocumentosTimbrados })));

// ============================================================
// Workspace de Neuropsicologia — extraída de dentro de Psicologia em
// 10/09/2026 (era a opção "Avaliação" do PathChooser de Psicologia).
// Escopo mínimo decidido com a usuária: Painel + Avaliação
// (instrumentos/sessões) + Relatório — sem Anamnese nem Evolução
// próprias. Documentos timbrados só pelos botões de boas-vindas
// (Hub/PatientStart), sem aba na lateral — mesmo padrão adotado nas
// demais disciplinas.
//
// Reaproveita PsychologyNeuroAssessment/PsychologyNeuroReport tal como
// já existiam dentro de Psicologia — só o registro clínico muda de
// disciplina (psicologia → neuropsicologia, ver migration
// 20260910_neuropsicologia_discipline.sql, que também migrou o
// histórico já salvo).
// ============================================================

const TABS = {
  HOME: 'Tela inicial',
  PAINEL: 'Painel',
  AVALIACAO: 'Avaliação neuropsicológica',
  RELATORIO: 'Relatório',
  DOCUMENTOS: 'Documentos',
};

const NAV_GROUPS = [
  { title: null, tabs: [TABS.HOME, TABS.PAINEL] },
  { title: 'Avaliação', tabs: [TABS.AVALIACAO] },
  { title: 'Apoio', tabs: [TABS.RELATORIO] },
];

const TABS_WITHOUT_PATIENT = [TABS.HOME, TABS.DOCUMENTOS];

function NeuropsychologyPanel({ selectedPatient, onOpenAvaliacao }) {
  return (
    <Panel title="Boas-vindas — Neuropsicologia">
      <div className="psi-path-hero">
        <p className="app-eyebrow">Paciente selecionado</p>
        <h2>{selectedPatient?.name || 'Paciente'}</h2>
        <p>Instrumentos, sessões, resultados, integração profissional e relatório da avaliação neuropsicológica.</p>
      </div>
      <div className="cards summary-cards psi-path-summary">
        <button type="button" className="card psi-path-evolution-card" onClick={onOpenAvaliacao}>
          <p className="small">Avaliação</p>
          <h3>Iniciar/continuar avaliação</h3>
        </button>
      </div>
    </Panel>
  );
}

export function NeuropsychologyWorkspace({ profile, therapistName, onSwitchDiscipline, onSignOut }) {
  const { selectedPatient } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const hasMultipleDisciplines = resolveUserDisciplines(profile).length > 1;

  const [activeTab, setActiveTab] = useState(TABS.HOME);
  const [neuroEvaluation, setNeuroEvaluation] = useState(createEmptyNeuropsychologyEvaluation);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasPending, setHasPending] = useState(false);

  const hydratingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const patientIdRef = useRef(selectedPatient?.id || null);
  const changeVersionRef = useRef(0);
  const loadBlockedRef = useRef(false);
  const [saveQueue] = useState(() => (
    createClinicalSaveQueue({
      persist: operation => upsertVersionedClinicalRecord(
        operation.patientId,
        operation.recordType,
        operation.data,
        operation,
      ),
    })
  ));

  useLayoutEffect(() => {
    const patientId = selectedPatient?.id;
    patientIdRef.current = patientId || null;
    setNeuroEvaluation(createEmptyNeuropsychologyEvaluation());
    setSaveStatus(patientId ? 'loading' : 'idle');
    setLastSavedAt(null);
    setHasPending(false);
    changeVersionRef.current = 0;
    loadBlockedRef.current = false;
    hydratingRef.current = true;

    if (!patientId) {
      hydratingRef.current = false;
      return undefined;
    }

    let cancelled = false;
    getLatestRecord(patientId, PSI_NEURO_RECORD_TYPE, 'neuropsicologia')
      .then(record => {
        if (cancelled || patientIdRef.current !== patientId) return;
        if (record?.sensitive_data?.evaluation) {
          setNeuroEvaluation(normalizeNeuropsychologyEvaluation(record.sensitive_data.evaluation));
          setLastSavedAt(new Date(record.updated_at));
        }
        saveQueue.setHead(`${patientId}:${PSI_NEURO_RECORD_TYPE}`, record);
        setSaveStatus('idle');
      })
      .catch(err => {
        if (cancelled || patientIdRef.current !== patientId) return;
        loadBlockedRef.current = true;
        setSaveStatus('load_error');
        console.error('Erro ao carregar avaliação neuropsicológica:', {
          name: err?.name || 'Error',
          code: err?.code || 'NEUROPSYCHOLOGY_LOAD_ERROR',
        });
      })
      .finally(() => {
        if (!cancelled) setTimeout(() => { hydratingRef.current = false; }, 0);
      });

    return () => { cancelled = true; };
  }, [saveQueue, selectedPatient?.id]);

  const doSave = useCallback(async () => {
    const patientId = patientIdRef.current;
    if (!patientId || loadBlockedRef.current) return;
    const laneKey = `${patientId}:${PSI_NEURO_RECORD_TYPE}`;
    const changeVersion = changeVersionRef.current;
    setSaveStatus('saving');
    const payload = {
      discipline: 'neuropsicologia',
      contentStatus: NEUROPSYCHOLOGY_CONTENT_STATUS,
      evaluation: neuroEvaluation,
    };
    try {
      const result = await saveQueue.enqueue({
        patientId,
        laneKey,
        recordType: PSI_NEURO_RECORD_TYPE,
        discipline: 'neuropsicologia',
        data: payload,
        changeVersion,
      });
      if (patientIdRef.current === patientId) {
        const current = result.changeVersion === changeVersionRef.current;
        const queued = saveQueue.pendingFor(laneKey) > 0;
        setSaveStatus(current && !queued ? 'saved' : 'idle');
        setLastSavedAt(result.updated_at ? new Date(result.updated_at) : new Date());
        setHasPending(!current || queued);
        setTimeout(() => {
          if (
            patientIdRef.current === patientId
            && result.changeVersion === changeVersionRef.current
            && saveQueue.pendingFor(laneKey) === 0
          ) {
            setSaveStatus(status => (status === 'saved' ? 'idle' : status));
          }
        }, 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar avaliação neuropsicológica:', {
        name: err?.name || 'Error',
        code: err?.code || 'NEUROPSYCHOLOGY_SAVE_ERROR',
      });
      if (patientIdRef.current === patientId) {
        setSaveStatus('error');
        setHasPending(true);
      }
    }
  }, [neuroEvaluation, saveQueue]);

  // Autosave com debounce, mesmo ritmo das demais disciplinas.
  useEffect(() => {
    if (hydratingRef.current || !selectedPatient?.id) return undefined;
    changeVersionRef.current += 1;
    setHasPending(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 5000);
    return () => clearTimeout(saveTimerRef.current);
  }, [neuroEvaluation]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function handleTabChange(tab) {
    if (!selectedPatient && !TABS_WITHOUT_PATIENT.includes(tab)) {
      setActiveTab(TABS.HOME);
      return;
    }
    setActiveTab(tab);
  }

  const patientAge = getPatientAge(selectedPatient);
  const effectiveTab = !selectedPatient && !TABS_WITHOUT_PATIENT.includes(activeTab)
    ? TABS.HOME
    : activeTab;
  const now = new Date();
  const dateLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function renderPanel() {
    if (effectiveTab === TABS.HOME || (!selectedPatient && !TABS_WITHOUT_PATIENT.includes(effectiveTab))) {
      return (
        <PatientStart
          initialDiscipline="neuropsicologia"
          therapistName={therapistName}
          onSelectPatient={() => setActiveTab(TABS.PAINEL)}
          onSignOut={handleSignOut}
        />
      );
    }

    if (effectiveTab === TABS.DOCUMENTOS) {
      return (
        <Suspense fallback={<div className="empty-state">Carregando documentos...</div>}>
          <DocumentosTimbrados therapistProfile={profile} />
        </Suspense>
      );
    }

    if (effectiveTab === TABS.RELATORIO) {
      return (
        <PsychologyNeuroReport
          evaluation={neuroEvaluation}
          selectedPatient={selectedPatient}
          therapistProfile={profile}
          onChange={setNeuroEvaluation}
        />
      );
    }

    if (effectiveTab === TABS.AVALIACAO) {
      return (
        <PsychologyNeuroAssessment
          evaluation={neuroEvaluation}
          onChange={setNeuroEvaluation}
          onChoosePath={() => setActiveTab(TABS.PAINEL)}
        />
      );
    }

    return (
      <NeuropsychologyPanel
        selectedPatient={selectedPatient}
        onOpenAvaliacao={() => setActiveTab(TABS.AVALIACAO)}
      />
    );
  }

  return (
    <div className="app psi-app">
      <Sidebar
        activeTab={effectiveTab}
        onTabChange={handleTabChange}
        therapist={therapistName}
        profileRole={profile?.role}
        disciplineLabel="Neuropsicologia"
        onSwitchDiscipline={handleSwitchArea}
        selectedPatient={selectedPatient}
        patientAge={patientAge}
        sessionCount={Array.isArray(neuroEvaluation.sessions)
          ? neuroEvaluation.sessions.filter(item => item.status === 'concluida').length
          : 0}
        lastVisit=""
        hasMultipleDisciplines={hasMultipleDisciplines}
        navGroups={NAV_GROUPS}
        patientTab={TABS.PAINEL}
        tabsWithoutPatient={TABS_WITHOUT_PATIENT}
      />

      <main className="main psi-main">
        <div className="app-topbar no-print">
          <div>
            <p className="app-eyebrow">{clinicName} · Neuropsicologia</p>
            <h1>{selectedPatient ? 'Paciente em atendimento' : 'Workspace de Neuropsicologia'}</h1>
          </div>
          <div className="app-topbar-actions">
            <div className="mini-clock" aria-label="Relógio">
              <span>{dateLabel}</span>
              <b>{timeLabel}</b>
            </div>
            <SaveIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              onSave={doSave}
              hasPatient={Boolean(selectedPatient)}
              hasPendingChanges={hasPending}
            />
            <button type="button" className="topbar-button" onClick={handleSignOut}>Sair</button>
          </div>
        </div>

        {effectiveTab === TABS.AVALIACAO && (
          <div className="alert psi-draft-banner">
            <b>Vocabulário em validação.</b> {NEUROPSYCHOLOGY_DRAFT_NOTICE}
          </div>
        )}

        <div className="workspace-grid workspace-grid-full">
          <section>{renderPanel()}</section>
        </div>
      </main>
    </div>
  );
}
