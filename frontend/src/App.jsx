import { Suspense, lazy, useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createInitialState, getPatientAge, serializeTongueAi, useClinicState } from './hooks/useClinicState';
import { useAuth } from './hooks/AuthContext';
import { usePatient } from './hooks/PatientContext';
import { useSessionPersistence } from './hooks/useSessionPersistence';
import { analyze, assistantSynthesis } from './utils/analyzer';
import { mergeEvolutionHistory } from './utils/evolutionHistory';
import { listPatientEvolutions } from './services/patientEvolutionService';
import { Sidebar } from './components/Sidebar';
import { PatientStart } from './components/PatientStart';
import { DisciplineHub } from './components/DisciplineHub';
import { canEnterDiscipline, getDiscipline, resolveUserDisciplines, resolveReviewerDiscipline } from './data/disciplines';
import { GENERIC_ANAMNESE_DISCIPLINES } from './data/anamneseRegistry';
import { SaveIndicator } from './components/ui/SaveIndicator';
import { FirstAccessPasswordChange } from './components/FirstAccessPasswordChange';
import { AccessBlocked } from './components/AccessBlocked';
import { MfaGate } from './components/MfaGate';
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
const DocumentosTimbrados = lazyPanel(() => import('./components/panels/DocumentosTimbrados'), 'DocumentosTimbrados');
const Agenda = lazyPanel(() => import('./components/panels/Agenda'), 'Agenda');
const Login = lazyPanel(() => import('./components/panels/Login'), 'Login');
const SuperAdminPanel = lazyPanel(() => import('./components/panels/SuperAdminPanel'), 'SuperAdminPanel');
const ClinicPatientsPanel = lazyPanel(() => import('./components/ClinicPatientsPanel'), 'ClinicPatientsPanel');
const ClinicAdminHome = lazyPanel(() => import('./components/ClinicAdminHome'), 'ClinicAdminHome');
const PsychologyWorkspace = lazyPanel(() => import('./components/PsychologyWorkspace'), 'PsychologyWorkspace');
const NeuropsychologyWorkspace = lazyPanel(() => import('./components/NeuropsychologyWorkspace'), 'NeuropsychologyWorkspace');
const DisciplineWorkspace = lazyPanel(() => import('./components/DisciplineWorkspace'), 'DisciplineWorkspace');
const ReviewerHome = lazyPanel(() => import('./components/ReviewerHome'), 'ReviewerHome');
const CurationWorkspace = lazyPanel(() => import('./components/CurationWorkspace'), 'CurationWorkspace');
const AssistantDeepDive = lazyPanel(() => import('./components/panels/AssistantDeepDive'), 'AssistantDeepDive');
const AssistantFoodLinks = lazyPanel(() => import('./components/panels/AssistantFoodLinks'), 'AssistantFoodLinks');
const RelatoriosGestao = lazyPanel(() => import('./components/panels/RelatoriosGestao'), 'RelatoriosGestao');

// Disciplina escolhida no hub sobrevive ao F5 (sessionStorage), mas não
// entre logins — sair limpa a chave.
const DISCIPLINE_STORAGE_KEY = 'acup.activeDiscipline.v1';

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
    loading,
    isSuperAdmin,
    isClinicAdmin,
    isKnowledgeReviewer,
    mustChangePassword,
    needsMfa,
    mfaFactors,
    enrollMfa,
    verifyMfa,
    signOut,
    changeTemporaryPassword,
  } = useAuth();
  const { selectedPatient, activeAppointment, clearActiveAppointment } = usePatient();
  const [patientEvolutionRecords, setPatientEvolutionRecords] = useState([]);
  const [hubAgendaInitialView, setHubAgendaInitialView] = useState(null);
  const [activeTab, setActiveTab] = useState('Tela inicial');
  const [activeDiscipline, setActiveDiscipline] = useState(() => sessionStorage.getItem(DISCIPLINE_STORAGE_KEY) || null);
  const [showClinicPatients, setShowClinicPatients] = useState(false);
  const [showHubDocuments, setShowHubDocuments] = useState(false);
  const [showHubAgenda, setShowHubAgenda] = useState(false);
  const [showHubGestao, setShowHubGestao] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewSection, setReviewSection] = useState('points');
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

  // Título da aba segue a instituição logada (ou o nome do produto antes do login).
  useEffect(() => {
    const clinicName = profile?.clinic?.name || profile?.clinic_name;
    document.title = clinicName || 'Vitalis';
  }, [profile?.clinic?.name, profile?.clinic_name]);

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
  useLayoutEffect(() => {
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
      // Evolução vinculada ao atendimento (patient_evolutions) vive fora
      // do JSON de state — carrega junto para o merge com o histórico
      // legado (ver utils/evolutionHistory).
      listPatientEvolutions(selectedPatient.id, 'acupuntura')
        .then(records => { if (!cancelled) setPatientEvolutionRecords(records); })
        .catch(() => { if (!cancelled) setPatientEvolutionRecords([]); });
    } else {
      resetSession();
      setTimeout(() => {
        if (!cancelled) {
          setPatientEvolutionRecords([]);
          isHydratingSessionRef.current = false;
        }
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

  if (loading) {
    return <PanelLoading />;
  }

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

  if (needsMfa) {
    return (
      <MfaGate
        factors={mfaFactors}
        onEnroll={enrollMfa}
        onVerify={verifyMfa}
        onSignOut={signOut}
      />
    );
  }

  // Superfície de curadoria da revisora (modo "propor"), independente de
  // disciplina/paciente. Acessível pela ReviewerHome e pelo atalho na sidebar.
  if (isKnowledgeReviewer && reviewMode) {
    return (
      <Suspense fallback={<PanelLoading />}>
        <CurationWorkspace
          section={reviewSection}
          onSectionChange={setReviewSection}
          therapistName={getFirstName(profile?.full_name || user.user_metadata?.full_name || user.email)}
          discipline={resolveReviewerDiscipline(profile)}
          onExit={() => setReviewMode(false)}
          onSignOut={handleHubSignOut}
        />
      </Suspense>
    );
  }

  // Hub de disciplinas: profissional escolhe a área de atendimento antes do
  // workspace (docs/plano-clinica-multidisciplinar.md, Fase 1). SuperAdm
  // mantém o painel próprio. A validação cobre também valor antigo/ inválido
  // no sessionStorage (ex.: disciplina que o perfil não libera).
  if (!isSuperAdmin && !canEnterDiscipline(profile, activeDiscipline)) {
    // Admin de clínica SEM disciplina própria (ex.: administração pura,
    // sem atender): cai direto numa home administrativa dedicada — não
    // faz sentido oferecer o Hub de disciplinas pra quem não tem
    // nenhuma liberada. Checagem direta em profile.disciplines (não via
    // resolveUserDisciplines, que sempre injeta acupuntura em array
    // vazio/nulo pra quem É profissional — comportamento que continua
    // valendo pra quem não é admin).
    const clinicAdminWithoutDiscipline = isClinicAdmin
      && (!Array.isArray(profile?.disciplines) || profile.disciplines.length === 0);
    if (clinicAdminWithoutDiscipline && !showClinicPatients && !showHubAgenda && !showHubDocuments && !showHubGestao) {
      return (
        <Suspense fallback={<PanelLoading />}>
          <ClinicAdminHome
            profile={profile}
            therapistName={getFirstName(profile?.full_name || user.user_metadata?.full_name || user.email)}
            onSignOut={handleHubSignOut}
            onOpenClinicPatients={() => setShowClinicPatients(true)}
            onOpenDocuments={() => setShowHubDocuments(true)}
            onOpenGestao={() => setShowHubGestao(true)}
            onOpenAgenda={() => setShowHubAgenda(true)}
            onOpenPendingEvolutions={() => { setHubAgendaInitialView('evolucoes-pendentes'); setShowHubAgenda(true); }}
          />
        </Suspense>
      );
    }
    if (showClinicPatients) {
      return (
        <Suspense fallback={<PanelLoading />}>
          <ClinicPatientsPanel
            profile={profile}
            isClinicAdmin={isClinicAdmin}
            onBack={() => setShowClinicPatients(false)}
          />
        </Suspense>
      );
    }
    // Agenda direto do hub: é da instituição inteira, não depende de
    // escolher área nem de ter paciente selecionado.
    if (showHubAgenda) {
      return (
        <div className="hub-screen">
          <header className="hub-topbar">
            <div className="hub-brand">
              <h1>{profile?.clinic?.name || profile?.clinic_name || 'Vitalis'}</h1>
              <p>Agenda</p>
            </div>
            <button
              type="button"
              className="topbar-button"
              onClick={() => { setShowHubAgenda(false); setHubAgendaInitialView(null); }}
            >
              ← Voltar às áreas
            </button>
          </header>
          <main className="hub-body">
            <Suspense fallback={<PanelLoading />}>
              {/* Ponte agenda → prontuário: a Agenda já selecionou o
                  paciente e o agendamento de origem no contexto (ver
                  selectPatientForAppointment); aqui só se troca de tela
                  para a disciplina do atendimento. Sem isto, o
                  profissional saía da agenda e reescolhia o paciente na
                  sidebar — e perdia o vínculo com a data/hora real do
                  atendimento. */}
              <Agenda
                profile={profile}
                initialView={hubAgendaInitialView}
                initialAgendaOf={clinicAdminWithoutDiscipline ? 'all' : null}
                onStartAppointment={({ discipline }) => {
                  setShowHubAgenda(false);
                  setHubAgendaInitialView(null);
                  handleSelectDiscipline(discipline);
                }}
              />
            </Suspense>
          </main>
        </div>
      );
    }
    // Documentos timbrados direto do hub: utilitário da instituição inteira,
    // não exige escolher área nem ter paciente selecionado.
    if (showHubDocuments) {
      return (
        <div className="hub-screen">
          <header className="hub-topbar">
            <div className="hub-brand">
              <h1>{profile?.clinic?.name || profile?.clinic_name || 'Vitalis'}</h1>
              <p>Documentos timbrados</p>
            </div>
            <button type="button" className="topbar-button" onClick={() => setShowHubDocuments(false)}>
              ← Voltar às áreas
            </button>
          </header>
          <main className="hub-body">
            <Suspense fallback={<PanelLoading />}>
              <DocumentosTimbrados therapistProfile={profile} />
            </Suspense>
          </main>
        </div>
      );
    }
    // Gestão da instituição direto do hub: relatórios operacionais
    // (faltosos, e o que entrar depois) não dependem de disciplina nem
    // de paciente selecionado — mesmo casco de Agenda/Documentos.
    if (showHubGestao) {
      return (
        <div className="hub-screen">
          <header className="hub-topbar">
            <div className="hub-brand">
              <h1>{profile?.clinic?.name || profile?.clinic_name || 'Vitalis'}</h1>
              <p>Gestão</p>
            </div>
            <button type="button" className="topbar-button" onClick={() => setShowHubGestao(false)}>
              ← Voltar às áreas
            </button>
          </header>
          <main className="hub-body">
            <Suspense fallback={<PanelLoading />}>
              <RelatoriosGestao profile={profile} />
            </Suspense>
          </main>
        </div>
      );
    }
    // Revisora: tela inicial própria (bem-vindo + card de curadoria).
    if (isKnowledgeReviewer) {
      return (
        <Suspense fallback={<PanelLoading />}>
          <ReviewerHome
            therapistName={profile?.full_name || user.user_metadata?.full_name || getFirstName(user.email)}
            discipline={resolveReviewerDiscipline(profile)}
            onEnterDiscipline={disciplineId => handleSelectDiscipline(disciplineId)}
            onOpenCuration={section => { setReviewSection(section); setReviewMode(true); }}
            onSignOut={handleHubSignOut}
          />
        </Suspense>
      );
    }
    return (
      <DisciplineHub
        profile={profile}
        therapistName={getFirstName(profile?.full_name || user.user_metadata?.full_name || user.email)}
        onSelect={handleSelectDiscipline}
        onSignOut={handleHubSignOut}
        onOpenClinicPatients={() => setShowClinicPatients(true)}
        onOpenDocuments={() => setShowHubDocuments(true)}
        onOpenAgenda={() => setShowHubAgenda(true)}
        onOpenGestao={() => setShowHubGestao(true)}
        onOpenPendingEvolutions={() => { setHubAgendaInitialView('evolucoes-pendentes'); setShowHubAgenda(true); }}
      />
    );
  }

  // Workspace por disciplina (Fase 5): Psicologia tem workspace próprio,
  // enxuto e autocontido — todo o resto deste componente é o pacote MTC.
  if (!isSuperAdmin && activeDiscipline === 'psicologia') {
    return (
      <Suspense fallback={<PanelLoading />}>
        <PsychologyWorkspace
          profile={profile}
          therapistName={getFirstName(profile?.full_name || user.user_metadata?.full_name || user.email)}
          onSwitchDiscipline={handleSwitchDiscipline}
          onSignOut={handleSignOut}
        />
      </Suspense>
    );
  }

  // Neuropsicologia (extraída de dentro de Psicologia em 10/09/2026):
  // workspace próprio e enxuto, escopo mínimo (Avaliação + Relatório).
  if (!isSuperAdmin && activeDiscipline === 'neuropsicologia') {
    return (
      <Suspense fallback={<PanelLoading />}>
        <NeuropsychologyWorkspace
          profile={profile}
          therapistName={getFirstName(profile?.full_name || user.user_metadata?.full_name || user.email)}
          onSwitchDiscipline={handleSwitchDiscipline}
          onSignOut={handleSignOut}
        />
      </Suspense>
    );
  }

  // Disciplinas com anamnese genérica (fisioterapia, nutrição e as
  // próximas): mesmo shell, vocabulário vindo de data/anamneseRegistry.
  if (!isSuperAdmin && GENERIC_ANAMNESE_DISCIPLINES.includes(activeDiscipline)) {
    return (
      <Suspense fallback={<PanelLoading />}>
        <DisciplineWorkspace
          disciplineId={activeDiscipline}
          profile={profile}
          therapistName={getFirstName(profile?.full_name || user.user_metadata?.full_name || user.email)}
          onSwitchDiscipline={handleSwitchDiscipline}
          onSignOut={handleSignOut}
        />
      </Suspense>
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

    if (activeTab === 'Tela inicial' || (!selectedPatient && activeTab !== 'Biblioteca' && activeTab !== 'Documentos')) {
      return (
        <PatientStart
          onSelectPatient={() => setActiveTab('Painel')}
          onSignOut={signOut}
          therapistName={therapistFirstName}
          hasMultipleDisciplines={!isSuperAdmin && resolveUserDisciplines(profile).length > 1}
          onSwitchDiscipline={handleSwitchDiscipline}
        />
      );
    }

    switch (activeTab) {
      case 'Painel':
        return (
          <PainelInicial
            {...commonProps}
            evolucoes={evolucoes}
            selectedPatient={selectedPatient}
            onNavigate={setActiveTab}
            hasPendingChanges={hasPendingChanges}
            lastSavedAt={lastSavedAt}
            saveStatus={saveStatus}
            onSave={saveSession}
            onConfirmPendingChanges={confirmPendingChanges}
          />
        );
      case 'Anamnese':          return <Anamnese {...commonProps} onFillTestAnswers={import.meta.env.DEV ? fillTestAnswers : undefined} />;
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
            evolucoes={evolucoes}
            patientId={selectedPatient?.id || null}
            activeAppointment={
              activeAppointment && activeAppointment.patientId === selectedPatient?.id
                ? activeAppointment
                : null
            }
            onEvolutionSaved={handleEvolutionSaved}
          />
        );
      case 'Biblioteca':        return <Biblioteca />;
      case 'Documentos':        return <DocumentosTimbrados therapistProfile={profile} />;
      case 'Relatório':         return <Relatorio state={state} evolucoes={evolucoes} analysis={analysis} selectedPatient={selectedPatient} therapistProfile={profile} onUpdate={updateField} />;
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
  // Mescla o JSON legado (state.evolucoes) com os registros novos vindos
  // de patient_evolutions — ver utils/evolutionHistory para o porquê de
  // não reordenar o array antigo.
  const evolucoes = mergeEvolutionHistory(state.evolucoes, patientEvolutionRecords);
  const lastVisit = evolucoes[evolucoes.length - 1]?.data || '';
  const therapistFullName = profile?.full_name || user.user_metadata?.full_name || user.email;
  const therapistFirstName = getFirstName(therapistFullName);

  function handleTabChange(tab) {
    if (isSuperAdmin) {
      setActiveTab('SuperAdm');
      return;
    }
    if (!selectedPatient && tab !== 'Tela inicial' && tab !== 'Biblioteca' && tab !== 'Documentos') {
      setActiveTab('Tela inicial');
      return;
    }
    setActiveTab(tab);
  }

  function confirmPendingChanges(message = 'Existem alterações ainda não salvas. Deseja continuar mesmo assim?') {
    return !hasPendingChanges || window.confirm(message);
  }

  // Depois de gravar uma evolução vinculada a um agendamento
  // (patient_evolutions), o vínculo se encerra — a próxima "Escrever
  // evolução" precisa passar de novo pela lista de pendências, para não
  // deixar uma data de atendimento antiga grudada na tela por engano.
  async function handleEvolutionSaved() {
    clearActiveAppointment();
    if (!selectedPatient?.id) return;
    try {
      const records = await listPatientEvolutions(selectedPatient.id, 'acupuntura');
      setPatientEvolutionRecords(records);
    } catch {
      // A tela de Evolução já mostra o próprio erro de salvar, se houver.
    }
  }

  async function fillTestAnswers() {
    const { buildRandomClinicalFixture } = await import('./utils/testClinicalFixture');
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

  function handleSelectDiscipline(disciplineId) {
    if (!canEnterDiscipline(profile, disciplineId)) return;
    sessionStorage.setItem(DISCIPLINE_STORAGE_KEY, disciplineId);
    setActiveDiscipline(disciplineId);
    setActiveTab('Tela inicial');
  }

  function handleSwitchDiscipline() {
    if (!confirmPendingChanges('Existem alterações ainda não salvas. Deseja trocar de área mesmo assim?')) return;
    sessionStorage.removeItem(DISCIPLINE_STORAGE_KEY);
    setActiveDiscipline(null);
    setActiveTab('Tela inicial');
  }

  // Sair a partir do hub: não há atendimento aberto para confirmar.
  async function handleHubSignOut() {
    sessionStorage.removeItem(DISCIPLINE_STORAGE_KEY);
    await signOut();
  }

  async function handleSignOut() {
    if (!confirmPendingChanges('Existem alterações ainda não salvas. Deseja sair mesmo assim?')) return;
    sessionStorage.removeItem(DISCIPLINE_STORAGE_KEY);
    await signOut();
  }

  return (
    <div className={`app${isSuperAdmin ? ' super-admin-app' : ''}`}>
      <Sidebar
        activeTab={isSuperAdmin ? 'SuperAdm' : activeTab}
        onTabChange={handleTabChange}
        therapist={therapistFirstName}
        profileRole={profile?.role}
        disciplineLabel={getDiscipline(activeDiscipline)?.label}
        onSwitchDiscipline={handleSwitchDiscipline}
        isSuperAdmin={isSuperAdmin}
        superAdminSection={superAdminSection}
        onSuperAdminSectionChange={setSuperAdminSection}
        selectedPatient={selectedPatient}
        patientAge={patientAge}
        sessionCount={evolucoes.length}
        lastVisit={lastVisit}
        hasMultipleDisciplines={!isSuperAdmin && resolveUserDisciplines(profile).length > 1}
        onOpenCuration={isKnowledgeReviewer ? () => setReviewMode(true) : undefined}
      />

      <main className="main">
        {!isHome && (
        <div className="app-topbar no-print">
          <div>
            <h1>{isSuperAdminTab ? 'SuperAdm' : 'Paciente em atendimento'}</h1>
            {!isSuperAdmin && resolveUserDisciplines(profile).length > 1 && (
              <div className="active-specialty-badge">
                Especialidade: <b>Acupuntura</b>
                <button type="button" className="btn-switch-specialty-top" onClick={handleSwitchDiscipline} title="Mudar Especialidade">
                  Alterar
                </button>
              </div>
            )}
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

        {/* Relatório e Documentos têm papel timbrado próprio com os dados da instituição */}
        {activeTab !== 'Relatório' && activeTab !== 'Documentos' && (
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
                  <p className="synth-percent-note">
                    Essa porcentagem indica a confiança do sistema nos dados preenchidos até aqui; use como apoio para conferência profissional.
                  </p>
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

                <Suspense fallback={<p className="small">Carregando apoio clínico...</p>}>
                  <AssistantDeepDive
                    state={state}
                    selectedMap={selectedMap}
                    synthesis={synthesis}
                    patientName={selectedPatient?.name || state.nome}
                  />

                  <AssistantFoodLinks synthesis={synthesis} />
                </Suspense>
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
                  <b>{getSelected('queixaEstruturada').length + getSelected('sono').length + getSelected('digestao').length + getSelected('gineco').length + getSelected('urogenital').length}</b>
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
