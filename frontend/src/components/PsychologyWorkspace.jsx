/* eslint-disable react-hooks/set-state-in-effect */
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { getPatientAge } from '../hooks/useClinicState';
import { PatientStart } from './PatientStart';
import { Sidebar } from './Sidebar';
import { SaveIndicator } from './ui/SaveIndicator';
import {
  getLatestRecord,
  upsertVersionedClinicalRecord,
} from '../services/clinicalRecordService';
import { isNotAttendingError } from '../utils/clinicalRecordAccess';
import { createClinicalSaveQueue } from '../services/clinicalSaveQueue';
import { listPatientEvolutions } from '../services/patientEvolutionService';
import { mergeEvolutionHistory } from '../utils/evolutionHistory';
import {
  PSI_ANAMNESE_RECORD_TYPE,
  PSYCHOLOGY_CONTENT_STATUS,
  PSYCHOLOGY_DRAFT_NOTICE,
  PSYCHOLOGY_ANAMNESE_TABS,
  PSYCHOLOGY_INTERVIEW_TABS,
  PSYCHOLOGY_PLACEHOLDER_TABS,
  PSYCHOLOGY_TABS,
  anamnesePathOfTab,
  appendQuickWord,
  createEmptyPsychologySession,
  normalizePsychologySession,
} from '../data/psychologyAnamnese';
import {
  PSYCHOLOGY_INFORMANT_OPTIONS,
  getPsychologyIntakeProfile,
  getPsychologyProfileSections,
} from '../data/psychologyIntakeProfiles';
import { PSYCHOLOGY_ROUTE_SPEC } from '../data/psychologyRouteSpec';
import { getInstrument } from '../data/clinicalInstruments';
import { listMyInstrumentRiskAlerts } from '../services/patientInstrumentService';
import { listHomeAnamneseRequests } from '../services/homeAnamneseService';
import { homeAnamneseForPath } from '../data/homeAnamneses';
import {
  answeredHomeRequests,
  applyHomeAnswer,
  applyHomeAnswers,
  pendingHomeAnswers,
  requestsOfAnamnese,
} from '../utils/homeAnamnese';
import { buildAnamneseRoute } from '../utils/formRoute';
import { openQuestionsAttention, riskAttention, routeAttention, sortAttention } from '../utils/areaAttention';
import { getSuggestedContextModules } from '../data/psychologyContextModules';
import { getDiscipline, resolveUserDisciplines } from '../data/disciplines';
import { PsychologyAnamnese } from './psychology/PsychologyAnamnese';
import { PsychologyAssistantRail } from './psychology/PsychologyAssistantRail';
import { PsychologyRelatorio } from './psychology/PsychologyRelatorio';
import { PsychologyPlaceholder } from './psychology/PsychologyPlaceholder';
import { PsychologyPathChooser } from './psychology/PsychologyPathChooser';
import { PsychologyHypotheses } from './psychology/PsychologyHypotheses';
import { PsychologyComplementaryQuestions } from './psychology/PsychologyComplementaryQuestions';
import { PsychologyNoAccess } from './psychology/PsychologyNoAccess';

const DocumentosTimbrados = lazy(() => import('./panels/DocumentosTimbrados')
  .then(module => ({ default: module.DocumentosTimbrados })));
const PatientInstrumentsPanel = lazy(() => import('./instruments/PatientInstrumentsPanel')
  .then(module => ({ default: module.PatientInstrumentsPanel })));
const PatientInterviewsPanel = lazy(() => import('./interviews/PatientInterviewsPanel')
  .then(module => ({ default: module.PatientInterviewsPanel })));
const HomeAnamneseBox = lazy(() => import('./psychology/HomeAnamneseBox')
  .then(module => ({ default: module.HomeAnamneseBox })));

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
// Menu da anamnese (16/10/2026, pedido da administradora): Infantil e
// Adulto, cada um com a sua anamnese e a sua entrevista; rastreio,
// perguntas complementares e escalas fora dos dois. Entrevista sem
// modelo da clínica ainda aparece e diz que espera o modelo.
const PSYCHOLOGY_NAV_GROUPS = [
  { title: null, tabs: [PSYCHOLOGY_TABS.HOME, PSYCHOLOGY_TABS.PAINEL] },
  { title: 'Infantil', tabs: [PSYCHOLOGY_TABS.ANAMNESE_INFANTIL, PSYCHOLOGY_TABS.ENTREVISTA_PAIS] },
  { title: 'Adulto', tabs: [PSYCHOLOGY_TABS.ANAMNESE_ADULTO, PSYCHOLOGY_TABS.ENTREVISTA_FAMILIAR] },
  {
    title: 'Avaliação',
    tabs: [
      PSYCHOLOGY_TABS.ENTREVISTA_RASTREIO,
      PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES,
      PSYCHOLOGY_TABS.ESCALAS,
    ],
  },
  { title: 'Formulação clínica', tabs: [PSYCHOLOGY_TABS.SINTESE, PSYCHOLOGY_TABS.HIPOTESES] },
  { title: 'Plano de cuidado', tabs: [PSYCHOLOGY_TABS.OBJETIVOS, PSYCHOLOGY_TABS.PLANO] },
  { title: 'Documentos', tabs: [PSYCHOLOGY_TABS.RELATORIO] },
  { title: 'Apoio', tabs: [PSYCHOLOGY_TABS.BIBLIOTECA] },
];

const TABS_WITHOUT_PATIENT = [PSYCHOLOGY_TABS.HOME, PSYCHOLOGY_TABS.BIBLIOTECA, PSYCHOLOGY_TABS.DOCUMENTOS];

// Abas que não dependem da ficha da área (anamnese): abrem também para
// quem não atende o paciente (a administração vê entrevistas e escalas).
const TABS_WITHOUT_RECORD = [
  PSYCHOLOGY_TABS.HOME,
  PSYCHOLOGY_TABS.ESCALAS,
  PSYCHOLOGY_TABS.DOCUMENTOS,
  PSYCHOLOGY_TABS.BIBLIOTECA,
  ...Object.keys(PSYCHOLOGY_INTERVIEW_TABS),
];

// Anamnese do percurso escolhido no Painel; sem percurso, pela idade.
function anamneseTabFor(profileId, age) {
  const profile = getPsychologyIntakeProfile(profileId);
  if (profile) return PSYCHOLOGY_ANAMNESE_TABS[profile.path];
  const years = Number.parseInt(age, 10);
  return Number.isFinite(years) && years <= 17 ? PSYCHOLOGY_TABS.ANAMNESE_INFANTIL : PSYCHOLOGY_TABS.ANAMNESE_ADULTO;
}

export function PsychologyWorkspace({ profile, therapistName, onSwitchDiscipline, onSignOut }) {
  const { selectedPatient, activeAppointment } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const hasMultipleDisciplines = resolveUserDisciplines(profile).length > 1;

  // O "Ver resultado" do alerta de risco abre a tela Escalas do menu
  // principal (13/10/2026); aqui a aba Escalas continua como atalho.
  const [activeTab, setActiveTab] = useState(PSYCHOLOGY_TABS.HOME);
  // Chegando aqui a partir de "Iniciar atendimento" (Agenda): o paciente
  // e o atendimento já foram selecionados ANTES do workspace montar
  // (Agenda.startAppointment). Sem isso, o profissional caía sempre na
  // tela de escolha de paciente (PSYCHOLOGY_TABS.HOME), mesmo já tendo o
  // paciente certo em mãos. A evolução não mora mais aqui — tela Evoluções.
  useEffect(() => {
    if (
      activeAppointment
      && activeAppointment.patientId === selectedPatient?.id
      && activeAppointment.discipline === 'psicologia'
    ) {
      setActiveTab(PSYCHOLOGY_TABS.PAINEL);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatient?.id]);
  const [session, setSession] = useState(createEmptyPsychologySession);
  // Alertas de risco ainda não vistos (os mesmos da tela inicial), para o
  // "Pede atenção" do menu. null = não deu para conferir. Recarrega quando
  // a aba Escalas termina de carregar (marcou "Vi o alerta", aplicou).
  const [riskAlerts, setRiskAlerts] = useState([]);
  const [riskAlertsToken, setRiskAlertsToken] = useState(0);
  useEffect(() => {
    if (!selectedPatient?.id) return undefined;
    let cancelled = false;
    listMyInstrumentRiskAlerts()
      .then(rows => { if (!cancelled) setRiskAlerts(rows); })
      .catch(() => { if (!cancelled) setRiskAlerts(null); });
    return () => { cancelled = true; };
  }, [selectedPatient?.id, riskAlertsToken]);
  // Anamneses enviadas para responder em casa (Área do Paciente). Guarda
  // o paciente junto: troca de paciente nunca mostra envio do anterior.
  const [homeState, setHomeState] = useState({ patientId: null, rows: [], error: '' });
  const [homeToken, setHomeToken] = useState(0);
  useEffect(() => {
    const patientId = selectedPatient?.id;
    if (!patientId) return undefined;
    let cancelled = false;
    listHomeAnamneseRequests({ patientId, discipline: 'psicologia' })
      .then(rows => { if (!cancelled) setHomeState({ patientId, rows, error: '' }); })
      .catch(err => { if (!cancelled) setHomeState({ patientId, rows: [], error: err.message }); });
    return () => { cancelled = true; };
  }, [selectedPatient?.id, homeToken]);
  const homeCurrent = homeState.patientId === selectedPatient?.id;
  const homeRequests = homeCurrent ? homeState.rows : [];
  const homeLoadError = homeCurrent ? homeState.error : '';
  // Evolução vinculada ao atendimento (patient_evolutions) vive fora do
  // registro clínico deste workspace — ver supabase/migrations/20260903.
  const [patientEvolutionRecords, setPatientEvolutionRecords] = useState([]);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasPending, setHasPending] = useState(false);

  const hydratingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const patientIdRef = useRef(selectedPatient?.id || null);
  const sessionChangeVersionRef = useRef(0);
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

  // Carrega a anamnese do paciente atual.
  useLayoutEffect(() => {
    const patientId = selectedPatient?.id;
    patientIdRef.current = patientId || null;
    setSession(createEmptyPsychologySession());
    setSaveStatus(patientId ? 'loading' : 'idle');
    setLastSavedAt(null);
    setHasPending(false);
    setPatientEvolutionRecords([]);
    sessionChangeVersionRef.current = 0;
    loadBlockedRef.current = false;
    hydratingRef.current = true;

    if (!patientId) {
      setSession(createEmptyPsychologySession());
      hydratingRef.current = false;
      return;
    }

    let cancelled = false;
    listPatientEvolutions(patientId, 'psicologia')
      .then(records => { if (!cancelled) setPatientEvolutionRecords(records); })
      .catch(() => { if (!cancelled) setPatientEvolutionRecords([]); });
    getLatestRecord(patientId, PSI_ANAMNESE_RECORD_TYPE, 'psicologia')
      .then(record => {
        if (cancelled || patientIdRef.current !== patientId) return;
        if (record?.sensitive_data?.session) {
          setSession(normalizePsychologySession(record.sensitive_data.session));
          setLastSavedAt(new Date(record.updated_at));
        }
        saveQueue.setHead(
          `${patientId}:${PSI_ANAMNESE_RECORD_TYPE}`,
          record,
        );
        setSaveStatus('idle');
      })
      .catch(err => {
        if (cancelled || patientIdRef.current !== patientId) return;
        loadBlockedRef.current = true;
        if (isNotAttendingError(err)) {
          setSaveStatus('no_access');
          return;
        }
        setSaveStatus('load_error');
        console.error('Erro ao carregar prontuários de psicologia:', {
          name: err?.name || 'Error',
          code: err?.code || 'PSYCHOLOGY_LOAD_ERROR',
        });
      })
      .finally(() => {
        if (!cancelled) setTimeout(() => { hydratingRef.current = false; }, 0);
      });

    return () => { cancelled = true; };
  }, [saveQueue, selectedPatient?.id]);

  const doSaveAnamnese = useCallback(async () => {
    const patientId = patientIdRef.current;
    if (!patientId || loadBlockedRef.current) return;
    const laneKey = `${patientId}:${PSI_ANAMNESE_RECORD_TYPE}`;
    const changeVersion = sessionChangeVersionRef.current;
    setSaveStatus('saving');
    const payload = {
      discipline: 'psicologia',
      contentStatus: PSYCHOLOGY_CONTENT_STATUS,
      session,
    };
    try {
      const result = await saveQueue.enqueue({
        patientId,
        laneKey,
        recordType: PSI_ANAMNESE_RECORD_TYPE,
        discipline: 'psicologia',
        data: payload,
        changeVersion,
      });
      if (patientIdRef.current === patientId) {
        const current = result.changeVersion === sessionChangeVersionRef.current;
        const queued = saveQueue.pendingFor(laneKey) > 0;
        setSaveStatus(current && !queued ? 'saved' : 'idle');
        setLastSavedAt(result.updated_at ? new Date(result.updated_at) : new Date());
        setHasPending(!current || queued);
        setTimeout(() => {
          if (
            patientIdRef.current === patientId
            && result.changeVersion === sessionChangeVersionRef.current
            && saveQueue.pendingFor(laneKey) === 0
          ) {
            setSaveStatus(status => (status === 'saved' ? 'idle' : status));
          }
        }, 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar anamnese de psicologia:', {
        name: err?.name || 'Error',
        code: err?.code || 'PSYCHOLOGY_SAVE_ERROR',
      });
      if (patientIdRef.current === patientId) {
        setSaveStatus('error');
        setHasPending(true);
      }
    }
  }, [saveQueue, session]);

  // Auto-save com debounce (mesmo ritmo do MTC: 5s após a última mudança).
  useEffect(() => {
    if (hydratingRef.current || !selectedPatient?.id) return undefined;
    sessionChangeVersionRef.current += 1;
    setHasPending(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSaveAnamnese, 5000);
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

  function handleTabChange(tab) {
    if (!selectedPatient && !TABS_WITHOUT_PATIENT.includes(tab)) {
      setActiveTab(PSYCHOLOGY_TABS.HOME);
      return;
    }
    // "Anamnese" (atalhos de dentro das abas) vai para a do percurso.
    const anamneseTab = anamneseTabFor(session.intakeProfile, getPatientAge(selectedPatient));
    if (tab === PSYCHOLOGY_TABS.ANAMNESE
      || (tab === PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES && !session.intakeProfile)) {
      setActiveTab(anamneseTab);
      return;
    }
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

  // DEV: preenche a anamnese inteira com um caso sintético para percorrer o
  // workspace sem digitar tudo de novo. Com percurso já escolhido, o sorteio
  // fica restrito a ele — clicar aqui nunca troca a anamnese por baixo da
  // profissional. Sem percurso (Painel), o caso traz o próprio.
  async function fillTestAnswers() {
    const { buildRandomPsychologyFixture } = await import('../utils/testPsychologyFixture');
    const { sessionPatch } = buildRandomPsychologyFixture(session.intakeProfile || undefined);

    setSession(prev => ({
      ...prev,
      ...sessionPatch,
      // Campos: sobrescreve os do perfil sorteado e mantém as chaves dos
      // demais perfis, para os inputs seguirem controlados.
      fields: { ...prev.fields, ...sessionPatch.fields },
      // Marcações e eixos são TROCADOS, não somados: clicar de novo deve
      // mostrar o caso novo, não a mistura dele com o anterior.
      selectedMap: { ...sessionPatch.selectedMap },
      axisNotes: { ...sessionPatch.axisNotes },
      // Preserva o que não é anamnese: histórico, evoluções e documentos.
      evolucoes: prev.evolucoes,
      relatorio: prev.relatorio,
      responseHistory: prev.responseHistory,
    }));
    setActiveTab(anamneseTabFor(sessionPatch.intakeProfile || session.intakeProfile, getPatientAge(selectedPatient)));
  }

  // Abrir/fechar módulo de contexto. Fechar não apaga: o texto continua em
  // session.fields e volta a aparecer se o bloco for reaberto.
  function toggleContextModule(moduleId) {
    setSession(prev => ({
      ...prev,
      contextModules: {
        ...prev.contextModules,
        [moduleId]: !prev.contextModules?.[moduleId],
      },
    }));
  }

  function selectIntakeProfile(profileId) {
    setSession(prev => ({
      ...prev,
      intakeProfile: profileId,
      intakeSelectedAt: new Date().toISOString(),
      // O percurso PRÉ-ABRE os módulos que costumam interessar, sem
      // sobrescrever o que a profissional já tenha aberto ou fechado.
      contextModules: {
        ...getSuggestedContextModules(profileId, getPatientAge(selectedPatient)),
        ...prev.contextModules,
      },
    }));
    setActiveTab(anamneseTabFor(profileId, getPatientAge(selectedPatient)));
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

  // Resposta de casa → ficha: só quando a profissional clica (utils/homeAnamnese).
  function latestHomeAnswerFor(path) {
    const definition = homeAnamneseForPath(path);
    return definition ? answeredHomeRequests(requestsOfAnamnese(homeRequests, definition.id))[0] || null : null;
  }

  function bringHomeAnswer(fieldId) {
    const request = latestHomeAnswerFor(getPsychologyIntakeProfile(session.intakeProfile)?.path);
    if (!request) return;
    setSession(prev => applyHomeAnswer(prev, request, fieldId));
  }

  function importHomeAnswers(request, fieldIds) {
    setSession(prev => applyHomeAnswers(prev, request, fieldIds));
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

  function toggleComplementaryQuestion(question, source = {}) {
    const questionText = String(question || '').trim();
    if (!questionText) return;
    const questionKey = questionText.toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
    const currentQuestions = Array.isArray(session.complementaryQuestions)
      ? session.complementaryQuestions
      : [];
    const existing = currentQuestions.find(item => (
      String(item.sourceQuestion || item.question || '').trim()
        .toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') === questionKey
    ));
    if (existing) {
      const hasAnswer = Boolean(String(existing.answer || '').trim());
      if (hasAnswer && !window.confirm('Esta pergunta já possui resposta. Removê-la também apagará a resposta. Deseja continuar?')) {
        return;
      }
      setSession(prev => ({
        ...prev,
        complementaryQuestions: (prev.complementaryQuestions || [])
          .filter(item => item.id !== existing.id),
      }));
      return;
    }
    setSession(prev => {
      const questions = Array.isArray(prev.complementaryQuestions) ? prev.complementaryQuestions : [];
      const alreadyAdded = questions.some(item => (
        String(item.sourceQuestion || item.question || '').trim()
          .toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') === questionKey
      ));
      if (alreadyAdded) return prev;
      return {
        ...prev,
        complementaryQuestions: [...questions, {
          id: `complementary-question-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          question: questionText,
          answer: '',
          informantType: '',
          informantName: '',
          source: 'ai',
          sourceQuestion: questionText,
          modelVersion: String(source.modelVersion || ''),
          selectedAt: new Date().toISOString(),
          answeredAt: null,
        }],
      };
    });
  }

  function handleComplementaryQuestionsChange(complementaryQuestions) {
    setSession(prev => ({ ...prev, complementaryQuestions }));
  }

  function handleRelatorioChange(relatorio) {
    setSession(prev => ({ ...prev, relatorio }));
  }

  function handleHypothesisReviews(hypothesisReviews) {
    setSession(prev => ({ ...prev, hypothesisReviews }));
  }

  function openPathChooser() {
    setActiveTab(PSYCHOLOGY_TABS.PAINEL);
  }

  const patientAge = getPatientAge(selectedPatient);
  const effectiveTab = !selectedPatient && !TABS_WITHOUT_PATIENT.includes(activeTab)
    ? PSYCHOLOGY_TABS.HOME
    : activeTab;
  // Mescla o legado (session.evolucoes) com os registros novos vindos de
  // patient_evolutions — ver utils/evolutionHistory.
  const evolucoes = mergeEvolutionHistory(session.evolucoes, patientEvolutionRecords);
  // Sem atender o paciente nesta área, a anamnese não abre (ficha de quem atende).
  const noAccess = saveStatus === 'no_access';
  const currentProfile = getPsychologyIntakeProfile(session.intakeProfile);
  const anamneseTab = anamneseTabFor(session.intakeProfile, patientAge);
  // A anamnese em si (formulário) só aparece na aba do percurso escolhido.
  const showingAnamneseForm = Boolean(selectedPatient) && !noAccess
    && Boolean(currentProfile) && anamnesePathOfTab(effectiveTab) === currentProfile.path;
  const showAssistantRail = showingAnamneseForm;
  // "Pede atenção" (opção C, 10/10/2026). Enquanto a sessão carrega, só o
  // risco entra: a anamnese vazia daria um "faltam" falso por um instante.
  const sessionReady = saveStatus !== 'loading' && saveStatus !== 'no_access' && saveStatus !== 'load_error';
  const anamneseRoute = getPsychologyIntakeProfile(session.intakeProfile)
    ? buildAnamneseRoute({ ...PSYCHOLOGY_ROUTE_SPEC, sections: getPsychologyProfileSections(session.intakeProfile) }, session)
    : null;
  const attention = selectedPatient
    ? sortAttention(
      riskAttention(riskAlerts, {
        patientId: selectedPatient.id,
        discipline: 'psicologia',
        tab: PSYCHOLOGY_TABS.ESCALAS,
        instrumentLabel: id => getInstrument(id)?.shortName || id,
      }),
      sessionReady ? openQuestionsAttention(session.complementaryQuestions, { tab: PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES }) : [],
      sessionReady ? routeAttention(anamneseRoute, {
        id: 'anamnese',
        tab: anamneseTab,
        partLabel: 'da anamnese',
        chooseHint: 'Escolha o percurso da anamnese',
        chooseTab: PSYCHOLOGY_TABS.PAINEL,
      }) : [],
    )
    : [];
  const now = new Date();
  const dateLabel = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const timeLabel = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  function renderPanel() {
    if (effectiveTab === PSYCHOLOGY_TABS.HOME
      || (!selectedPatient && !TABS_WITHOUT_PATIENT.includes(effectiveTab))) {
      return (
        <PatientStart
          initialDiscipline="psicologia"
          therapistName={therapistName}
          onSelectPatient={() => setActiveTab(PSYCHOLOGY_TABS.PAINEL)}
        />
      );
    }

    if (effectiveTab === PSYCHOLOGY_TABS.DOCUMENTOS) {
      return (
        <Suspense fallback={<div className="empty-state">Carregando documentos...</div>}>
          <DocumentosTimbrados therapistProfile={profile} />
        </Suspense>
      );
    }

    if (PSYCHOLOGY_PLACEHOLDER_TABS.includes(effectiveTab)) {
      return <PsychologyPlaceholder tab={effectiveTab} />;
    }

    // Anamnese infantil / adulto: "Responder em casa" no topo (envio,
    // situação, respostas). Trazer para a ficha só com a ficha aberta.
    const anamnesePath = anamnesePathOfTab(effectiveTab);
    const homeDefinition = anamnesePath ? homeAnamneseForPath(anamnesePath) : null;
    const homeBox = homeDefinition && !(noAccess && homeLoadError) ? (
      <Suspense fallback={null}>
        <HomeAnamneseBox
          key={`${selectedPatient?.id}:${homeDefinition.id}`}
          definition={homeDefinition}
          patient={selectedPatient}
          requests={requestsOfAnamnese(homeRequests, homeDefinition.id)}
          loadError={homeLoadError}
          session={session}
          canImport={showingAnamneseForm}
          importHint={noAccess
            ? 'A ficha é de quem atende: é essa profissional quem traz as respostas para a ficha dela.'
            : currentProfile
              ? `A ficha está com a ${currentProfile.label}: as respostas desta anamnese não entram nela.`
              : 'Escolha o percurso abaixo para trazer as respostas para a ficha.'}
          profile={profile}
          clinicName={clinicName}
          onImport={importHomeAnswers}
          onChanged={() => setHomeToken(token => token + 1)}
        />
      </Suspense>
    ) : null;

    // Ficha de quem atende: no lugar de "Erro ao carregar a ficha".
    if (noAccess && !TABS_WITHOUT_RECORD.includes(effectiveTab)) {
      return (
        <>
          {homeBox}
          <PsychologyNoAccess patientName={selectedPatient?.name} onOpen={handleTabChange} />
        </>
      );
    }

    const interviewSlot = PSYCHOLOGY_INTERVIEW_TABS[effectiveTab];
    if (interviewSlot) {
      return (
        <Suspense fallback={<div className="empty-state">Carregando entrevistas...</div>}>
          <PatientInterviewsPanel
            patient={selectedPatient}
            discipline="psicologia"
            profile={profile}
            clinicName={clinicName}
            slot={interviewSlot}
            title={effectiveTab}
          />
        </Suspense>
      );
    }

    // Anamnese infantil / adulto: o formulário quando o percurso é este;
    // sem percurso, a escolha já neste percurso; no outro percurso, avisa
    // e deixa trocar (os campos já preenchidos não se apagam).
    if (anamnesePath) {
      if (showingAnamneseForm) {
        const latestHome = latestHomeAnswerFor(anamnesePath);
        return (
          <PsychologyAnamnese
            homeBox={homeBox}
            homeAnswers={latestHome ? pendingHomeAnswers(session, latestHome) : {}}
            onUseHomeAnswer={bringHomeAnswer}
            session={session}
            onFillTestAnswers={import.meta.env.DEV ? fillTestAnswers : undefined}
            onUpdateField={updateFieldValue}
            onQuickWord={handleQuickWord}
            onToggleCheck={toggleCheck}
            onAxisNote={handleAxisNote}
            onRiskNotesChange={handleRiskNotes}
            onInformantChange={updateFieldInformant}
            onArchiveResponse={archiveFieldResponse}
            onChooseProfile={openPathChooser}
            onToggleContextModule={toggleContextModule}
          />
        );
      }
      return (
        <>
          {homeBox}
          {currentProfile && (
            <div className="alert alert-info psi-other-path" role="status">
              Esta paciente está com a <b>{currentProfile.label}</b>.
              {' '}
              <button type="button" className="quiet-button" onClick={() => setActiveTab(anamneseTab)}>
                Abrir a {anamneseTab.toLowerCase()}
              </button>
              {' '}Para trocar de percurso, escolha abaixo.
            </div>
          )}
          <PsychologyPathChooser
            key={anamnesePath}
            session={session}
            selectedPatient={selectedPatient}
            patientAge={patientAge}
            onSelectIntakeProfile={selectIntakeProfile}
            route={anamneseRoute}
            onOpenTab={handleTabChange}
            onFillTestAnswers={import.meta.env.DEV ? fillTestAnswers : undefined}
            fixedPath={anamnesePath}
          />
        </>
      );
    }

    switch (effectiveTab) {
      case PSYCHOLOGY_TABS.PAINEL:
        return (
          <PsychologyPathChooser
            session={session}
            selectedPatient={selectedPatient}
            patientAge={patientAge}
            onSelectIntakeProfile={selectIntakeProfile}
            route={anamneseRoute}
            onOpenTab={handleTabChange}
            onFillTestAnswers={import.meta.env.DEV ? fillTestAnswers : undefined}
          />
        );
      case PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES:
        return (
          <PsychologyComplementaryQuestions
            session={session}
            onQuestionsChange={handleComplementaryQuestionsChange}
            onOpenAnamnese={() => handleTabChange(PSYCHOLOGY_TABS.ANAMNESE)}
          />
        );
      case PSYCHOLOGY_TABS.ESCALAS:
        return (
          <Suspense fallback={<div className="empty-state">Carregando escalas...</div>}>
            <PatientInstrumentsPanel
              patient={selectedPatient}
              discipline="psicologia"
              currentUserId={profile?.id}
              clinicName={clinicName}
              onApplicationsLoaded={() => setRiskAlertsToken(token => token + 1)}
            />
          </Suspense>
        );
      case PSYCHOLOGY_TABS.HIPOTESES:
        return (
          <PsychologyHypotheses
            session={session}
            onReviewsChange={handleHypothesisReviews}
            onOpenAnamnese={() => handleTabChange(PSYCHOLOGY_TABS.ANAMNESE)}
          />
        );
      case PSYCHOLOGY_TABS.RELATORIO:
        return (
          <PsychologyRelatorio
            session={session}
            evolucoes={evolucoes}
            selectedPatient={selectedPatient}
            therapistProfile={profile}
            onRelatorioChange={handleRelatorioChange}
          />
        );
      default:
        return (
          <PsychologyPathChooser
            session={session}
            selectedPatient={selectedPatient}
            patientAge={patientAge}
            onSelectIntakeProfile={selectIntakeProfile}
            route={anamneseRoute}
            onOpenTab={handleTabChange}
            onFillTestAnswers={import.meta.env.DEV ? fillTestAnswers : undefined}
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
        clinicName={profile?.clinic?.name || profile?.clinic_name}
        onSwitchDiscipline={handleSwitchArea}
        selectedPatient={selectedPatient}
        patientAge={patientAge}
        sessionCount={evolucoes.length}
        lastVisit=""
        hasMultipleDisciplines={hasMultipleDisciplines}
        navGroups={PSYCHOLOGY_NAV_GROUPS}
        patientTab={PSYCHOLOGY_TABS.PAINEL}
        tabsWithoutPatient={TABS_WITHOUT_PATIENT}
        onSignOut={handleSignOut}
        attention={attention}
        soonTabs={PSYCHOLOGY_PLACEHOLDER_TABS}
        bottomTab={anamneseTab}
      />

      <main className="main psi-main forms-scope">
        <div className="app-topbar no-print">
          <div>
            <p className="app-eyebrow">
              <span className="app-eyebrow-dot" style={{ background: getDiscipline('psicologia')?.color }} aria-hidden="true" />
              {clinicName} · Psicologia
            </p>
            <h1>{selectedPatient ? 'Paciente em atendimento' : 'Área de Psicologia'}</h1>
          </div>
          <div className="app-topbar-actions">
            <div className="mini-clock" aria-label="Relógio">
              <span>{dateLabel}</span>
              <b>{timeLabel}</b>
            </div>
            <SaveIndicator
              status={saveStatus}
              lastSavedAt={lastSavedAt}
              onSave={doSaveAnamnese}
              hasPatient={Boolean(selectedPatient)}
              hasPendingChanges={hasPending}
            />
          </div>
        </div>

        {showingAnamneseForm && (
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
                onToggleComplementaryQuestion={toggleComplementaryQuestion}
                patientName={selectedPatient?.name}
              />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
