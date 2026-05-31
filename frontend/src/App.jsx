import { useState, useEffect, useRef } from 'react';
import { createInitialState, getPatientAge, useClinicState } from './hooks/useClinicState';
import { useAuth } from './hooks/AuthContext';
import { usePatient } from './hooks/PatientContext';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { analyze } from './utils/analyzer';
import { buildRandomClinicalFixture } from './utils/testClinicalFixture';
import { Sidebar } from './components/Sidebar';
import { PatientStart } from './components/PatientStart';
import { SaveIndicator } from './components/ui/SaveIndicator';
import { PainelInicial } from './components/panels/PainelInicial';
import { Anamnese } from './components/panels/Anamnese';
import { Lingua } from './components/panels/Lingua';
import { Pulso } from './components/panels/Pulso';
import { RaciocinioClinical } from './components/panels/RaciocinioClinical';
import { Diagnostico } from './components/panels/Diagnostico';
import { Protocolo } from './components/panels/Protocolo';
import { Evolucao } from './components/panels/Evolucao';
import { Biblioteca } from './components/panels/Biblioteca';
import { Relatorio } from './components/panels/Relatorio';
import { Login } from './components/panels/Login';
import { SuperAdminPanel } from './components/panels/SuperAdminPanel';
import { FirstAccessPasswordChange } from './components/FirstAccessPasswordChange';
import { AccessBlocked } from './components/AccessBlocked';
import './App.css';

function getFirstName(value) {
  const text = String(value || '').trim();
  if (!text) return 'Profissional';
  if (text.includes('@')) return text.split('@')[0];
  return text.split(/\s+/)[0] || 'Profissional';
}

export default function App() {
  const {
    user,
    profile,
    profileError,
    isSuperAdmin,
    mustChangePassword,
    signOut,
    changeTemporaryPassword,
  } = useAuth();
  const { selectedPatient } = usePatient();
  const [activeTab, setActiveTab] = useState('Tela inicial');
  const [superAdminSection, setSuperAdminSection] = useState('manage');
  const [now, setNow] = useState(() => new Date());
  const { state, selectedMap, updateField, toggle, getSelected, getPulseSelected, setState, setSelectedMap, resetSession } = useClinicState();
  const isHydratingSessionRef = useRef(false);
  const lastAutoSaveSnapshotRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  // Persistência no Supabase
  const {
    saveStatus,
    lastSavedAt,
    saveSession,
    loadSession,
    scheduleAutoSave,
    hasPendingChanges,
  } = useSessionPersistence(selectedPatient?.id, state, selectedMap);

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!hasPendingChanges) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingChanges]);

  // Carrega sessão salva ao selecionar paciente
  useEffect(() => {
    let cancelled = false;
    isHydratingSessionRef.current = true;
    lastAutoSaveSnapshotRef.current = null;

    if (selectedPatient) {
      loadSession({
        setState,
        setSelectedMap,
        emptyState: createInitialState(selectedPatient),
      }).finally(() => {
        if (!cancelled) {
          setTimeout(() => {
            isHydratingSessionRef.current = false;
          }, 0);
        }
      });
    } else {
      resetSession();
      setTimeout(() => {
        if (!cancelled) isHydratingSessionRef.current = false;
      }, 0);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedPatient?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save quando estado muda (com debounce)
  useEffect(() => {
    const snapshot = JSON.stringify({
      patientId: selectedPatient?.id || null,
      state,
      selectedMap,
    });

    if (!selectedPatient || isHydratingSessionRef.current) {
      lastAutoSaveSnapshotRef.current = snapshot;
      return;
    }

    if (lastAutoSaveSnapshotRef.current && lastAutoSaveSnapshotRef.current !== snapshot) {
      scheduleAutoSave();
    }

    lastAutoSaveSnapshotRef.current = snapshot;
  }, [selectedPatient?.id, state, selectedMap]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return <Login />;
  }

  if (profile?.is_active === false || (!profile && profileError)) {
    return (
      <AccessBlocked
        profile={profile}
        profileError={profileError}
        onSignOut={signOut}
      />
    );
  }

  if (mustChangePassword) {
    return (
      <FirstAccessPasswordChange
        profile={profile}
        onSubmit={changeTemporaryPassword}
        onSignOut={signOut}
      />
    );
  }

  // Motor de análise executado a cada render (leve o suficiente para isso)
  const analysis = analyze(state, selectedMap);

  function renderPanel() {
    const commonProps = { state, selectedMap, onToggle: toggle, onUpdate: updateField, analysis };

    if (isSuperAdmin) {
      return (
        <SuperAdminPanel
          currentUserId={user.id}
          activeSection={superAdminSection}
          onSignOut={handleSignOut}
        />
      );
    }

    if (activeTab === 'Tela inicial' || !selectedPatient) {
      return (
        <PatientStart
          onCreatePatient={() => setActiveTab('Anamnese')}
          onSelectPatient={() => setActiveTab('Painel')}
          onSignOut={signOut}
          therapistName={therapistFirstName}
        />
      );
    }

    switch (activeTab) {
      case 'Painel':
        return (
          <PainelInicial
            {...commonProps}
            selectedPatient={selectedPatient}
            onNavigate={setActiveTab}
            hasPendingChanges={hasPendingChanges}
            lastSavedAt={lastSavedAt}
            saveStatus={saveStatus}
            onSave={saveSession}
            onConfirmPendingChanges={confirmPendingChanges}
          />
        );
      case 'Anamnese':          return <Anamnese {...commonProps} onFillTestAnswers={fillTestAnswers} />;
      case 'Língua':            return <Lingua {...commonProps} />;
      case 'Pulso':             return <Pulso {...commonProps} />;
      case 'Raciocínio Clínico':return <RaciocinioClinical {...commonProps} />;
      case 'Diagnóstico':       return <Diagnostico {...commonProps} />;
      case 'Protocolo':         return <Protocolo {...commonProps} />;
      case 'Evolução':
        return (
          <Evolucao
            key={selectedPatient?.id || 'sem-paciente'}
            {...commonProps}
          />
        );
      case 'Biblioteca':        return <Biblioteca />;
      case 'Relatório':         return <Relatorio state={state} analysis={analysis} selectedPatient={selectedPatient} therapistProfile={profile} />;
      default:                  return <PainelInicial {...commonProps} />;
    }
  }

  const dateLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  });
  const timeLabel = now.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const isSuperAdminTab = isSuperAdmin;
  const isHome = !isSuperAdmin && (activeTab === 'Tela inicial' || !selectedPatient);
  const patientAge = getPatientAge(selectedPatient) || state.idade;
  const evolucoes = Array.isArray(state.evolucoes) ? state.evolucoes : [];
  const lastVisit = evolucoes[evolucoes.length - 1]?.data || '';
  const therapistFullName = profile?.full_name || user.user_metadata?.full_name || user.email;
  const therapistFirstName = getFirstName(therapistFullName);

  function handleTabChange(tab) {
    if (isSuperAdmin) {
      setActiveTab('SuperAdm');
      return;
    }
    if (!selectedPatient && tab !== 'Tela inicial') {
      setActiveTab('Tela inicial');
      return;
    }
    setActiveTab(tab);
  }

  function confirmPendingChanges(message = 'Existem alterações ainda não salvas. Deseja continuar mesmo assim?') {
    return !hasPendingChanges || window.confirm(message);
  }

  function fillTestAnswers() {
    const { statePatch, selectedMap: testSelectedMap } = buildRandomClinicalFixture();

    setState(prev => ({
      ...prev,
      ...statePatch,
      nome: selectedPatient?.name || prev.nome,
      contato: selectedPatient?.phone || prev.contato,
      idade: getPatientAge(selectedPatient) || prev.idade,
      terapeuta: prev.terapeuta,
      evolucoes: prev.evolucoes,
    }));
    setSelectedMap(testSelectedMap);
  }

  async function handleSignOut() {
    if (!confirmPendingChanges('Existem alterações ainda não salvas. Deseja sair mesmo assim?')) return;
    await signOut();
  }

  return (
    <div className="app">
      <Sidebar
        activeTab={isSuperAdmin ? 'SuperAdm' : activeTab}
        onTabChange={handleTabChange}
        therapist={therapistFirstName}
        profileRole={profile?.role}
        isSuperAdmin={isSuperAdmin}
        superAdminSection={superAdminSection}
        onSuperAdminSectionChange={setSuperAdminSection}
        selectedPatient={selectedPatient}
        patientAge={patientAge}
        sessionCount={evolucoes.length}
        lastVisit={lastVisit}
      />

      <main className="main">
        {!isHome && (
        <div className="app-topbar no-print">
          <div>
            <h1>{isSuperAdminTab ? 'SuperAdm' : 'Paciente em atendimento'}</h1>
          </div>
          <div className="app-topbar-actions">
            {!isSuperAdminTab && (
            <div className="mini-clock" aria-label="Relógio">
              <span>{dateLabel}</span>
              <b>{timeLabel}</b>
            </div>
            )}
            {selectedPatient && (
              <SaveIndicator
                status={saveStatus}
                lastSavedAt={lastSavedAt}
                onSave={saveSession}
                hasPatient={!!selectedPatient}
                hasPendingChanges={hasPendingChanges}
              />
            )}
            <button className="topbar-button" onClick={handleSignOut}>Sair</button>
          </div>
        </div>
        )}

        <div className="print-header">
          <div>
            <h1>Reability MTC</h1>
            <p>{activeTab}</p>
          </div>
          <div>
            <b>{selectedPatient?.name || 'Paciente não selecionado'}</b>
            <span>{new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {/* Layout principal: conteúdo + barra lateral de assistente */}
        <div className={`workspace-grid${isHome || isSuperAdminTab ? ' workspace-grid-full' : ''}`}>
          <section>{renderPanel()}</section>

          {!isHome && !isSuperAdminTab && (
          <aside className="no-print">
            {/* IA Assistente */}
            <div className="panel">
              <div className="panel-title">IA Assistente</div>
              <div className="panel-body">
                <p><b>Hipótese:</b> {analysis.main}</p>
                <p><b>Confiança:</b> {analysis.confidence}</p>
                <p><b>Próxima ação:</b> {analysis.detail.question}</p>
                <p><b>Leitura:</b> {analysis.protocol.goal}</p>
              </div>
            </div>

            {/* Achados rápidos */}
            <div className="panel">
              <div className="panel-title">Achados rápidos</div>
              <div className="panel-body">
                <p>Sintomas: {getSelected('sintomas').length}</p>
                <p>Anamnese: {getSelected('queixaEstruturada').length + getSelected('sono').length + getSelected('digestao').length}</p>
                <p>Língua: {getSelected('lingua').length}</p>
                <p>Pulso: {getPulseSelected().length}</p>
                <p>Segurança: {analysis.safety.length}</p>
              </div>
            </div>
          </aside>
          )}
        </div>
      </main>
    </div>
  );
}
