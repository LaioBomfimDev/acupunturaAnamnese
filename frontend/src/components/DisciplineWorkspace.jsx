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
import { getAnamneseConfig } from '../data/anamneseRegistry';
import {
  buildWorkspaceSummary,
  createEmptySession,
  getSuggestedContextModules,
  normalizeSession,
} from '../data/anamneseKit';
import { DisciplineAnamnese } from './anamnese/DisciplineAnamnese';
import { DisciplineEvolucao } from './anamnese/DisciplineEvolucao';
import { DisciplineRelatorio } from './anamnese/DisciplineRelatorio';

const DocumentosTimbrados = lazy(() => import('./panels/DocumentosTimbrados')
  .then(module => ({ default: module.DocumentosTimbrados })));

// ============================================================
// Workspace GENÉRICO de disciplina (fisioterapia, nutrição e as
// próximas). Espelha o shell da Psicologia — sidebar, topbar,
// autosave, painel + anamnese — mas sem nada específico de uma área:
// tudo o que varia vem da configuração (data/anamneseRegistry.js).
//
// Persistência: UM registro por disciplina carrega a sessão inteira do
// paciente (anamnese, evoluções e rascunhos), como no MTC e na Psi.
//
// Invariante: a ficha organiza e lembra; quem decide é a profissional.
// ============================================================

const TABS = {
  HOME: 'Tela inicial',
  PAINEL: 'Painel',
  ANAMNESE: 'Anamnese',
  EVOLUCAO: 'Evolução',
  RELATORIO: 'Relatório',
  DOCUMENTOS: 'Documentos',
};

const NAV_GROUPS = [
  { title: null, tabs: [TABS.HOME, TABS.PAINEL] },
  { title: 'Avaliação', tabs: [TABS.ANAMNESE] },
  { title: 'Acompanhamento', tabs: [TABS.EVOLUCAO] },
  { title: 'Documentos', tabs: [TABS.RELATORIO, TABS.DOCUMENTOS] },
];

const TABS_WITHOUT_PATIENT = [TABS.HOME, TABS.DOCUMENTOS];

// Escolha do percurso: define o roteiro específico e pré-abre os
// módulos de contexto pertinentes.
function PathChooser({ config, session, selectedPatient, onSelectProfile, onFillTestAnswers }) {
  const current = config.profiles.find(profile => profile.id === session.intakeProfile);
  return (
    <Panel title={`Boas-vindas — ${config.label}`}>
      <div className="psi-path-hero">
        <p className="app-eyebrow">Paciente selecionado</p>
        <h2>{selectedPatient?.name || 'Paciente'}</h2>
        <p>{config.pathsIntro}</p>
        {onFillTestAnswers && (
          <button className="tag" type="button" onClick={onFillTestAnswers}>
            Preencher teste aleatório
          </button>
        )}
      </div>

      <h3 className="psi-section-title">{config.pathsTitle}</h3>
      <div className="psi-path-grid" aria-label={`Percursos de ${config.label}`}>
        {config.profiles.map(profile => (
          <button
            key={profile.id}
            type="button"
            className={`psi-path-card${current?.id === profile.id ? ' active' : ''}`}
            onClick={() => onSelectProfile(profile.id)}
          >
            <b>{profile.label}</b>
            <small>{profile.description}</small>
          </button>
        ))}
      </div>

      <div className="cards summary-cards psi-path-summary">
        <div className="card">
          <p className="small">Percurso selecionado</p>
          <h3>{current?.shortLabel || 'Ainda não definido'}</h3>
        </div>
      </div>
    </Panel>
  );
}

export function DisciplineWorkspace({
  disciplineId,
  profile,
  therapistName,
  onSwitchDiscipline,
  onSignOut,
}) {
  const config = getAnamneseConfig(disciplineId);
  const { selectedPatient } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const hasMultipleDisciplines = resolveUserDisciplines(profile).length > 1;

  const [activeTab, setActiveTab] = useState(TABS.HOME);
  const [session, setSession] = useState(() => createEmptySession(config));
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
    setSession(createEmptySession(config));
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
    getLatestRecord(patientId, config.recordType, disciplineId)
      .then(record => {
        if (cancelled || patientIdRef.current !== patientId) return;
        if (record?.sensitive_data?.session) {
          setSession(normalizeSession(config, record.sensitive_data.session));
          setLastSavedAt(new Date(record.updated_at));
        }
        saveQueue.setHead(`${patientId}:${config.recordType}`, record);
        setSaveStatus('idle');
      })
      .catch(err => {
        if (cancelled || patientIdRef.current !== patientId) return;
        // Leitura falhou: bloqueia escrita para não sobrescrever um
        // prontuário que não chegou a ser carregado.
        loadBlockedRef.current = true;
        setSaveStatus('load_error');
        console.error(`Erro ao carregar prontuário de ${disciplineId}:`, {
          name: err?.name || 'Error',
          code: err?.code || 'DISCIPLINE_LOAD_ERROR',
        });
      })
      .finally(() => {
        if (!cancelled) setTimeout(() => { hydratingRef.current = false; }, 0);
      });

    return () => { cancelled = true; };
  }, [config, disciplineId, saveQueue, selectedPatient?.id]);

  const doSave = useCallback(async () => {
    const patientId = patientIdRef.current;
    if (!patientId || loadBlockedRef.current) return;
    const laneKey = `${patientId}:${config.recordType}`;
    const changeVersion = changeVersionRef.current;
    setSaveStatus('saving');
    try {
      const result = await saveQueue.enqueue({
        patientId,
        laneKey,
        recordType: config.recordType,
        discipline: disciplineId,
        data: {
          discipline: disciplineId,
          contentStatus: config.contentStatus,
          session,
        },
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
      console.error(`Erro ao salvar anamnese de ${disciplineId}:`, {
        name: err?.name || 'Error',
        code: err?.code || 'DISCIPLINE_SAVE_ERROR',
      });
      if (patientIdRef.current === patientId) {
        setSaveStatus('error');
        setHasPending(true);
      }
    }
  }, [config, disciplineId, saveQueue, session]);

  // Autosave com debounce, no mesmo ritmo das demais disciplinas.
  useEffect(() => {
    if (hydratingRef.current || !selectedPatient?.id) return undefined;
    changeVersionRef.current += 1;
    setHasPending(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 5000);
    return () => clearTimeout(saveTimerRef.current);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Sem percurso escolhido a anamnese não tem roteiro: manda ao painel.
    if (tab === TABS.ANAMNESE && !session.intakeProfile) {
      setActiveTab(TABS.PAINEL);
      return;
    }
    setActiveTab(tab);
  }

  // ── Handlers de sessão ──
  function updateFieldValue(fieldId, value) {
    setSession(prev => ({ ...prev, fields: { ...prev.fields, [fieldId]: value } }));
  }

  function handleQuickWord(fieldId, word) {
    setSession(prev => {
      const base = String(prev.fields?.[fieldId] || '').trimEnd();
      const clean = String(word || '').trim();
      if (!clean) return prev;
      const next = !base
        ? clean.charAt(0).toUpperCase() + clean.slice(1)
        : `${base}${/[.,;:!?]$/.test(base) ? ' ' : ', '}${clean}`;
      return { ...prev, fields: { ...prev.fields, [fieldId]: next } };
    });
  }

  function toggleCheck(group, item) {
    setSession(prev => {
      const key = `${group}:${item}`;
      return { ...prev, selectedMap: { ...prev.selectedMap, [key]: !prev.selectedMap[key] } };
    });
  }

  // Fechar um módulo esconde; não apaga o que já foi escrito.
  function toggleContextModule(moduleId) {
    setSession(prev => ({
      ...prev,
      contextModules: { ...prev.contextModules, [moduleId]: !prev.contextModules?.[moduleId] },
    }));
  }

  function handleAxisNote(axisId, value) {
    setSession(prev => ({ ...prev, axisNotes: { ...prev.axisNotes, [axisId]: value } }));
  }

  function handleRiskNotes(value) {
    setSession(prev => ({ ...prev, riskNotes: value }));
  }

  function handleEvolucoesChange(evolucoes) {
    setSession(prev => ({ ...prev, evolucoes }));
  }

  function handleRelatorioChange(relatorio) {
    setSession(prev => ({ ...prev, relatorio }));
  }

  function selectProfile(profileId) {
    setSession(prev => ({
      ...prev,
      intakeProfile: profileId,
      intakeSelectedAt: new Date().toISOString(),
      // Sugestão do percurso entra primeiro; escolha da profissional prevalece.
      contextModules: {
        ...getSuggestedContextModules(config, profileId, getPatientAge(selectedPatient)),
        ...prev.contextModules,
      },
    }));
    setActiveTab(TABS.ANAMNESE);
  }

  const patientAge = getPatientAge(selectedPatient);
  const effectiveTab = !selectedPatient && !TABS_WITHOUT_PATIENT.includes(activeTab)
    ? TABS.HOME
    : activeTab;
  const summary = buildWorkspaceSummary(config, session);
  const now = new Date();
  const dateLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function renderPanel() {
    if (effectiveTab === TABS.HOME || (!selectedPatient && !TABS_WITHOUT_PATIENT.includes(effectiveTab))) {
      return (
        <PatientStart
          initialDiscipline={disciplineId}
          therapistName={therapistName}
          onCreatePatient={() => setActiveTab(TABS.PAINEL)}
          onSelectPatient={() => setActiveTab(TABS.PAINEL)}
          onOpenDocuments={() => setActiveTab(TABS.DOCUMENTOS)}
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

    if (effectiveTab === TABS.EVOLUCAO) {
      return (
        <DisciplineEvolucao
          config={config}
          session={session}
          onEvolucoesChange={handleEvolucoesChange}
        />
      );
    }

    if (effectiveTab === TABS.RELATORIO) {
      return (
        <DisciplineRelatorio
          config={config}
          session={session}
          selectedPatient={selectedPatient}
          therapistProfile={profile}
          onRelatorioChange={handleRelatorioChange}
        />
      );
    }

    if (effectiveTab === TABS.ANAMNESE) {
      return (
        <DisciplineAnamnese
          config={config}
          session={session}
          onUpdateField={updateFieldValue}
          onQuickWord={handleQuickWord}
          onToggleCheck={toggleCheck}
          onToggleContextModule={toggleContextModule}
          onAxisNote={handleAxisNote}
          onRiskNotesChange={handleRiskNotes}
          onChooseProfile={() => setActiveTab(TABS.PAINEL)}
        />
      );
    }

    return (
      <PathChooser
        config={config}
        session={session}
        selectedPatient={selectedPatient}
        onSelectProfile={selectProfile}
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
        disciplineLabel={config.label}
        onSwitchDiscipline={handleSwitchArea}
        selectedPatient={selectedPatient}
        patientAge={patientAge}
        sessionCount={Array.isArray(session.evolucoes) ? session.evolucoes.length : 0}
        lastVisit=""
        hasMultipleDisciplines={hasMultipleDisciplines}
        navGroups={NAV_GROUPS}
        patientTab={TABS.PAINEL}
        tabsWithoutPatient={TABS_WITHOUT_PATIENT}
      />

      <main className="main psi-main">
        <div className="app-topbar no-print">
          <div>
            <p className="app-eyebrow">{clinicName} · {config.label}</p>
            <h1>{selectedPatient ? 'Paciente em atendimento' : `Workspace de ${config.label}`}</h1>
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

        {effectiveTab === TABS.ANAMNESE && (
          <div className="alert psi-draft-banner">
            <b>Vocabulário em validação.</b> {config.draftNotice}
          </div>
        )}

        {effectiveTab === TABS.ANAMNESE && summary.riskItems > 0 && (
          <div className="alert psi-risk-reminder">
            <b>⚠ {summary.riskItems} sinal(is) de risco marcado(s).</b> {summary.nextAction}
          </div>
        )}

        <div className="workspace-grid workspace-grid-full">
          <section>{renderPanel()}</section>
        </div>
      </main>
    </div>
  );
}
