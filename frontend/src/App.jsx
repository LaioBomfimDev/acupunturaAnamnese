import { Suspense, lazy, useState, useEffect, useMemo, useRef } from 'react';
import { createInitialState, getPatientAge, serializeTongueAi, useClinicState } from './hooks/useClinicState';
import { useAuth } from './hooks/AuthContext';
import { usePatient } from './hooks/PatientContext';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { analyze, assistantSynthesis } from './utils/analyzer';
import { buildRandomClinicalFixture } from './utils/testClinicalFixture';
import { Sidebar } from './components/Sidebar';
import { PatientStart } from './components/PatientStart';
import { SaveIndicator } from './components/ui/SaveIndicator';
import { FirstAccessPasswordChange } from './components/FirstAccessPasswordChange';
import { AccessBlocked } from './components/AccessBlocked';
import { AssistantDeepDive } from './components/panels/AssistantDeepDive';
import './App.css';

const lazyPanel = (loader, exportName) => lazy(() => loader().then(module => ({ default: module[exportName] })));

const PainelInicial = lazyPanel(() => import('./components/panels/PainelInicial'), 'PainelInicial');
const Anamnese = lazyPanel(() => import('./components/panels/Anamnese'), 'Anamnese');
const Lingua = lazyPanel(() => import('./components/panels/Lingua'), 'Lingua');
const Pulso = lazyPanel(() => import('./components/panels/Pulso'), 'Pulso');
const Reabilitacao = lazyPanel(() => import('./components/panels/Reabilitacao'), 'Reabilitacao');
const RaciocinioClinical = lazyPanel(() => import('./components/panels/RaciocinioClinical'), 'RaciocinioClinical');
const Diagnostico = lazyPanel(() => import('./components/panels/Diagnostico'), 'Diagnostico');
const Protocolo = lazyPanel(() => import('./components/panels/Protocolo'), 'Protocolo');
const Evolucao = lazyPanel(() => import('./components/panels/Evolucao'), 'Evolucao');
const Biblioteca = lazyPanel(() => import('./components/panels/Biblioteca'), 'Biblioteca');
const Relatorio = lazyPanel(() => import('./components/panels/Relatorio'), 'Relatorio');
const Login = lazyPanel(() => import('./components/panels/Login'), 'Login');
const SuperAdminPanel = lazyPanel(() => import('./components/panels/SuperAdminPanel'), 'SuperAdminPanel');

function getFirstName(value) {
  const text = String(value || '').trim();
  if (!text) return 'Profissional';
  if (text.includes('@')) return text.split('@')[0];
  return text.split(/\s+/)[0] || 'Profissional';
}

function PanelLoading() {
  return (
    <div className="panel">
      <div className="panel-title">Carregando</div>
      <div className="panel-body">
        <p className="small">Preparando esta área...</p>
      </div>
    </div>
  );
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
  const { state, selectedMap, updateField, toggle, setSelection, getSelected, getPulseSelected, setState, setSelectedMap, resetSession, tongueAi, setTongueAi, hydrateTongueAi } = useClinicState();
  const isHydratingSessionRef = useRef(false);
  const lastAutoSaveSnapshotRef = useRef(null);
  const assistantRailRef = useRef(null);
  const assistantScrollTimerRef = useRef(null);
  const isSuperAdminTab = isSuperAdmin;
  const isHome = !isSuperAdmin && (activeTab === 'Tela inicial' || !selectedPatient);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  // Metadados persistíveis da análise de língua (sem imagens/object URLs)
  const tongueAiMeta = useMemo(() => serializeTongueAi(tongueAi), [tongueAi]);

  // Persistência no Supabase
  const {
    saveStatus,
    lastSavedAt,
    saveSession,
    loadSession,
    scheduleAutoSave,
    hasPendingChanges,
  } = useSessionPersistence(selectedPatient?.id, state, selectedMap, tongueAiMeta);

  useEffect(() => {
    function handleBeforeUnload(event) {
      if (!hasPendingChanges) return;
      event.preventDefault();
      event.returnValue = '';
    }

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasPendingChanges]);

  useEffect(() => {
    if (isHome || isSuperAdminTab) {
      return undefined;
    }

    function handleScroll() {
      const rail = assistantRailRef.current;
      if (!rail) return;

      rail.classList.add('assistant-rail-following');
      window.clearTimeout(assistantScrollTimerRef.current);
      assistantScrollTimerRef.current = window.setTimeout(() => {
        rail.classList.remove('assistant-rail-following');
      }, 220);
    }

    const rail = assistantRailRef.current;
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.clearTimeout(assistantScrollTimerRef.current);
      rail?.classList.remove('assistant-rail-following');
    };
  }, [isHome, isSuperAdminTab]);

  // Carrega sessão salva ao selecionar paciente
  useEffect(() => {
    let cancelled = false;
    isHydratingSessionRef.current = true;
    lastAutoSaveSnapshotRef.current = null;

    if (selectedPatient) {
      loadSession({
        setState,
        setSelectedMap,
        hydrateTongueAi,
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
      tongueAi: tongueAiMeta,
    });

    if (!selectedPatient || isHydratingSessionRef.current) {
      lastAutoSaveSnapshotRef.current = snapshot;
      return;
    }

    if (lastAutoSaveSnapshotRef.current && lastAutoSaveSnapshotRef.current !== snapshot) {
      scheduleAutoSave();
    }

    lastAutoSaveSnapshotRef.current = snapshot;
  }, [selectedPatient?.id, state, selectedMap, tongueAiMeta]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user) {
    return (
      <Suspense fallback={<PanelLoading />}>
        <Login />
      </Suspense>
    );
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
  // Síntese ao vivo do assistente: leitura ponderada da anamnese como um todo.
  const synthesis = assistantSynthesis(state, selectedMap);

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

    if (activeTab === 'Tela inicial' || (!selectedPatient && activeTab !== 'Biblioteca')) {
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
      case 'Anamnese':          return <Anamnese {...commonProps} onSetSelection={setSelection} onFillTestAnswers={fillTestAnswers} />;
      case 'Língua':            return <Lingua {...commonProps} onSetSelection={setSelection} tongueAi={tongueAi} onTongueAiChange={setTongueAi} />;
      case 'Pulso':             return <Pulso {...commonProps} />;
      case 'Reabilitação':      return <Reabilitacao key={selectedPatient?.id || 'sem-paciente'} {...commonProps} />;
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
      case 'Relatório':         return <Relatorio state={state} analysis={analysis} selectedPatient={selectedPatient} therapistProfile={profile} onUpdate={updateField} />;
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
    if (!selectedPatient && tab !== 'Tela inicial' && tab !== 'Biblioteca') {
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

        {/* O Relatório tem papel timbrado próprio com os dados da clínica */}
        {activeTab !== 'Relatório' && (
        <div className="print-header">
          <div>
            <h1>{profile?.clinic?.name || profile?.clinic_name || 'Reability MTC'}</h1>
            <p>{activeTab}</p>
          </div>
          <div>
            <b>{selectedPatient?.name || 'Paciente não selecionado'}</b>
            <span>{new Date().toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
        )}

        {/* Layout principal: conteúdo + barra lateral de assistente */}
        <div className={`workspace-grid${isHome || isSuperAdminTab ? ' workspace-grid-full' : ''}`}>
          <section>
            <Suspense fallback={<PanelLoading />}>
              {renderPanel()}
            </Suspense>
          </section>

          {!isHome && !isSuperAdminTab && (
          <aside ref={assistantRailRef} className="assistant-rail no-print">
            {/* IA Assistente */}
            <div className="panel assistant-panel assistant-synth-panel">
              <div className="panel-title">IA Assistente</div>
              <div className="panel-body assistant-synth">
                <div className="synth-hypo">
                  <span className="synth-label">Hipótese principal</span>
                  <strong className="synth-hypo-name">{synthesis.primaryName}</strong>
                  {synthesis.primaryPercent > 0 && (
                    <div
                      className="synth-meter"
                      role="img"
                      aria-label={`Convergência de ${synthesis.primaryPercent}%`}
                    >
                      <div className="synth-meter-fill" style={{ width: `${synthesis.primaryPercent}%` }} />
                      <span className="synth-meter-val">{synthesis.primaryPercent}%</span>
                    </div>
                  )}
                  {synthesis.differential && (
                    <div className="synth-diff">
                      <span className="synth-diff-name">2º · {synthesis.differential.name}</span>
                      <span className="synth-diff-pct">{synthesis.differential.percent}%</span>
                      {synthesis.isOpenDifferential && (
                        <span className="synth-flag">diferencial aberto</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="synth-confidence">
                  <span className="synth-label">Confiança</span>
                  <div className="synth-conf-row">
                    <span className={`synth-badge synth-badge-${synthesis.confidence.level.toLowerCase()}`}>
                      {synthesis.confidence.level}
                    </span>
                  </div>
                  {synthesis.confidence.reason && (
                    <p className="synth-reason">Sustentada por {synthesis.confidence.reason}</p>
                  )}
                </div>

                <div className="synth-block">
                  <span className="synth-label">Próxima ação</span>
                  <p>{synthesis.nextAction}</p>
                </div>

                <div className="synth-block">
                  <span className="synth-label">Leitura ao vivo</span>
                  <p>{synthesis.reading}</p>
                </div>

                <AssistantDeepDive
                  state={state}
                  selectedMap={selectedMap}
                  synthesis={synthesis}
                  patientName={selectedPatient?.name || state.nome}
                />
              </div>
            </div>

            {/* Achados rápidos */}
            <div className="panel assistant-panel assistant-quick-panel">
              <div className="panel-title">Achados rápidos</div>
              <div className="panel-body synth-quick">
                <div className="quick-chip">
                  <b>{getSelected('sintomas').length}</b>
                  <span>Sintomas</span>
                </div>
                <div className="quick-chip">
                  <b>{getSelected('queixaEstruturada').length + getSelected('sono').length + getSelected('digestao').length}</b>
                  <span>Anamnese</span>
                </div>
                <div className="quick-chip">
                  <b>{getSelected('lingua').length + getSelected('linguaOrgao').length}</b>
                  <span>Língua</span>
                </div>
                <div className="quick-chip">
                  <b>{getPulseSelected().length}</b>
                  <span>Pulso</span>
                </div>
                <div className={`quick-chip${analysis.safety.length > 0 ? ' quick-chip-alert' : ''}`}>
                  <b>{analysis.safety.length}</b>
                  <span>Segurança</span>
                </div>
              </div>
            </div>
          </aside>
          )}
        </div>
      </main>
    </div>
  );
}
