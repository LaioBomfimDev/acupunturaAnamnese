/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { getPatientAge } from '../hooks/useClinicState';
import { PatientStart } from './PatientStart';
import { Sidebar } from './Sidebar';
import { ScreenHelp } from './ui/ScreenHelp';
import { getDiscipline, resolveUserDisciplines } from '../data/disciplines';
import { ABA_HELP } from '../data/screenHelp';
import { AbaAccessError, loadAbaPatient } from '../services/abaService';
import { AbaAlerts } from './aba/AbaAlerts';
import { AbaCollection } from './aba/AbaCollection';
import { AbaPatientPanel } from './aba/AbaPatientPanel';
import { AbaPrograms } from './aba/AbaPrograms';
import { AbaPlan } from './aba/AbaPlan';
import { AbaProfile } from './aba/AbaProfile';
import { AbaQuality } from './aba/AbaQuality';
import { AbaRepertoire } from './aba/AbaRepertoire';
import { AbaResults } from './aba/AbaResults';
import { AbaReviewQueue } from './aba/AbaReviewQueue';
import { AbaSessions } from './aba/AbaSessions';
import { AbaTeams } from './aba/AbaTeams';
import '../styles/aba.css';

// ============================================================
// Workspace ABA (Análise do Comportamento Aplicada) — área própria "da
// Psicologia", decidida com o usuário em 31/10/2026 (por enquanto só
// psicólogo atende). Trazido do Atlas: programas, coleta por tentativa,
// gráficos por dimensão, revisão da supervisão e times; na segunda etapa
// (20261101c), fidelidade, concordância (IOA), alertas e PDF/Excel.
//
// A coleta é separada da evolução: o atendimento ABA continua sendo
// evoluído na tela Evoluções, com o formulário da Psicologia. Quem vê o
// quê é decidido no banco (aba_can_access_patient): time da criança,
// supervisão do time, convocação ativa ou a administração da clínica.
// ============================================================

const TABS = {
  HOME: 'Tela inicial',
  PAINEL: 'Painel',
  COLETA: 'Coleta',
  SESSOES: 'Sessões',
  RESULTADOS: 'Resultados',
  QUALIDADE: 'Qualidade',
  PROGRAMAS: 'Programas',
  PLANO: 'Plano terapêutico',
  PERFIL: 'Perfil',
  REPERTORIO: 'Repertório',
  TIMES: 'Times',
  REVISAO: 'Revisão',
  ALERTAS: 'Alertas',
};

const NAV_GROUPS = [
  { title: null, tabs: [TABS.HOME, TABS.PAINEL] },
  { title: 'Atendimento', tabs: [TABS.COLETA, TABS.SESSOES, TABS.RESULTADOS, TABS.QUALIDADE] },
  { title: 'Plano', tabs: [TABS.PERFIL, TABS.PROGRAMAS, TABS.PLANO, TABS.REPERTORIO] },
  { title: 'Equipe', tabs: [TABS.TIMES, TABS.REVISAO, TABS.ALERTAS] },
];

const TABS_WITHOUT_PATIENT = [TABS.HOME, TABS.TIMES, TABS.REVISAO, TABS.ALERTAS];

const HELP_BY_TAB = {
  [TABS.PAINEL]: 'painel',
  [TABS.COLETA]: 'coleta',
  [TABS.SESSOES]: 'sessoes',
  [TABS.RESULTADOS]: 'resultados',
  [TABS.QUALIDADE]: 'qualidade',
  [TABS.PROGRAMAS]: 'programas',
  [TABS.PLANO]: 'plano',
  [TABS.PERFIL]: 'perfil',
  [TABS.REPERTORIO]: 'repertorio',
  [TABS.TIMES]: 'times',
  [TABS.REVISAO]: 'revisao',
  [TABS.ALERTAS]: 'alertas',
};

export function AbaWorkspace({ profile, therapistName, onSwitchDiscipline, onSignOut }) {
  const { selectedPatient, patients, selectPatient } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const hasMultipleDisciplines = resolveUserDisciplines(profile).length > 1;

  const [activeTab, setActiveTab] = useState(TABS.HOME);
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [loadError, setLoadError] = useState('');
  const [openSessionId, setOpenSessionId] = useState(null);
  const patientIdRef = useRef(selectedPatient?.id || null);

  const reload = useCallback(async () => {
    const patientId = patientIdRef.current;
    if (!patientId) return;
    try {
      const next = await loadAbaPatient(patientId);
      if (patientIdRef.current !== patientId) return;
      setData(next);
      setStatus('ready');
    } catch (error) {
      if (patientIdRef.current !== patientId) return;
      setData(null);
      setStatus(error instanceof AbaAccessError ? 'no_access' : 'error');
      setLoadError(error.message);
    }
  }, []);

  useEffect(() => {
    patientIdRef.current = selectedPatient?.id || null;
    setData(null);
    setLoadError('');
    if (!selectedPatient?.id) {
      setStatus('idle');
      return;
    }
    setStatus('loading');
    void reload();
  }, [selectedPatient?.id, reload]);

  function handleTabChange(tab) {
    if (!selectedPatient && !TABS_WITHOUT_PATIENT.includes(tab)) {
      setActiveTab(TABS.HOME);
      return;
    }
    setOpenSessionId(null);
    setActiveTab(tab);
  }

  function openPatientSession(patientId, sessionId) {
    const patient = patients.find(item => item.id === patientId);
    if (!patient) return;
    selectPatient(patient);
    setOpenSessionId(sessionId);
    setActiveTab(TABS.SESSOES);
  }

  // Alerta → tela onde ele se resolve, já no paciente (e na sessão).
  function openFromAlert(patientId, tab, sessionId) {
    const patient = patients.find(item => item.id === patientId) || (selectedPatient?.id === patientId ? selectedPatient : null);
    if (!patient) return;
    if (selectedPatient?.id !== patientId) selectPatient(patient);
    const target = Object.values(TABS).includes(tab) ? tab : TABS.PAINEL;
    setOpenSessionId(target === TABS.SESSOES ? sessionId || null : null);
    setActiveTab(target);
  }

  const effectiveTab = !selectedPatient && !TABS_WITHOUT_PATIENT.includes(activeTab) ? TABS.HOME : activeTab;
  const now = new Date();
  const dateLabel = now.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const finishedSessions = data?.sessions.filter(session => session.status !== 'em_andamento') || [];
  const lastSession = [...finishedSessions].sort((left, right) => (right.startAt || 0) - (left.startAt || 0))[0];

  function renderPatientState() {
    if (status === 'loading' || status === 'idle') return <div className="aba-page"><p className="aba-muted">Carregando a área ABA do paciente...</p></div>;
    if (status === 'no_access') {
      return (
        <div className="aba-page">
          <section className="aba-card aba-callout">
            <div>
              <p className="aba-eyebrow">Paciente de outro time</p>
              <h3>Você não atende {selectedPatient?.name || 'este paciente'} em ABA</h3>
              <p className="aba-muted">O prontuário ABA fica com o time da criança. Para atender, peça à supervisão do time uma convocação, ou à administração que coloque a criança no seu time.</p>
            </div>
          </section>
        </div>
      );
    }
    if (status === 'error') return <div className="aba-page"><p className="aba-error" role="alert">{loadError}</p></div>;
    return null;
  }

  function renderPanel() {
    if (effectiveTab === TABS.HOME) {
      return (
        <PatientStart
          initialDiscipline="aba"
          therapistName={therapistName}
          profile={profile}
          onSelectPatient={() => setActiveTab(TABS.PAINEL)}
        />
      );
    }
    if (effectiveTab === TABS.TIMES) return <AbaTeams />;
    if (effectiveTab === TABS.REVISAO) return <AbaReviewQueue onOpenPatient={openPatientSession} />;
    if (effectiveTab === TABS.ALERTAS) return <AbaAlerts userId={profile?.id} onOpenAlert={openFromAlert} />;

    const waiting = renderPatientState();
    if (waiting || !data) return waiting;

    if (effectiveTab === TABS.COLETA) {
      return (
        <AbaCollection
          key={selectedPatient.id}
          patient={selectedPatient}
          data={data}
          userId={data.permissions.userId}
          onChanged={reload}
          onOpenSessions={() => setActiveTab(TABS.SESSOES)}
        />
      );
    }
    if (effectiveTab === TABS.SESSOES) return <AbaSessions key={openSessionId || 'lista'} data={data} onChanged={reload} openSessionId={openSessionId} />;
    if (effectiveTab === TABS.RESULTADOS) return <AbaResults data={data} onChanged={reload} patient={selectedPatient} profile={profile} />;
    if (effectiveTab === TABS.QUALIDADE) return <AbaQuality data={data} patientId={selectedPatient.id} onChanged={reload} />;
    if (effectiveTab === TABS.PLANO) return <AbaPlan key={selectedPatient.id} patient={selectedPatient} data={data} profile={profile} />;
    if (effectiveTab === TABS.PERFIL) return <AbaProfile key={selectedPatient.id} patient={selectedPatient} data={data} />;
    if (effectiveTab === TABS.PROGRAMAS) return <AbaPrograms data={data} onChanged={reload} />;
    if (effectiveTab === TABS.REPERTORIO) return <AbaRepertoire data={data} onChanged={reload} />;
    return (
      <AbaPatientPanel
        patient={selectedPatient}
        data={data}
        onCollect={() => setActiveTab(TABS.COLETA)}
        onPrograms={() => setActiveTab(TABS.PROGRAMAS)}
        onResults={() => setActiveTab(TABS.RESULTADOS)}
        onSessions={() => setActiveTab(TABS.SESSOES)}
        onOpenAlert={openFromAlert}
        onAllAlerts={() => setActiveTab(TABS.ALERTAS)}
      />
    );
  }

  const helpTopic = ABA_HELP[HELP_BY_TAB[effectiveTab]];

  return (
    <div className="app psi-app aba-app">
      <Sidebar
        activeTab={effectiveTab}
        onTabChange={handleTabChange}
        therapist={therapistName}
        profileRole={profile?.role}
        disciplineLabel="ABA"
        clinicName={profile?.clinic?.name || profile?.clinic_name}
        onSwitchDiscipline={onSwitchDiscipline}
        selectedPatient={selectedPatient}
        patientAge={getPatientAge(selectedPatient)}
        sessionCount={finishedSessions.length}
        lastVisit={lastSession ? new Date(`${lastSession.date}T12:00:00`).toLocaleDateString('pt-BR') : ''}
        hasMultipleDisciplines={hasMultipleDisciplines}
        navGroups={NAV_GROUPS}
        patientTab={TABS.PAINEL}
        tabsWithoutPatient={TABS_WITHOUT_PATIENT}
        onSignOut={onSignOut}
      />

      <main className="main psi-main forms-scope aba-main">
        <div className="app-topbar no-print">
          <div>
            <p className="app-eyebrow">
              <span className="app-eyebrow-dot" style={{ background: getDiscipline('aba')?.color }} aria-hidden="true" />
              {clinicName} · ABA
            </p>
            <h1>{selectedPatient && !TABS_WITHOUT_PATIENT.includes(effectiveTab) ? selectedPatient.name : 'Análise do Comportamento Aplicada'}</h1>
          </div>
          <div className="app-topbar-actions">
            {helpTopic && <ScreenHelp topic={helpTopic} />}
            <div className="mini-clock" aria-label="Relógio">
              <span>{dateLabel}</span>
              <b>{timeLabel}</b>
            </div>
          </div>
        </div>

        <div className="workspace-grid workspace-grid-full">
          <section>{renderPanel()}</section>
        </div>
      </main>
    </div>
  );
}

export default AbaWorkspace;
