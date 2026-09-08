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
import { createClinicalSaveQueue } from '../services/clinicalSaveQueue';
import { listPatientEvolutions } from '../services/patientEvolutionService';
import { mergeEvolutionHistory } from '../utils/evolutionHistory';
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
import { getSuggestedContextModules } from '../data/psychologyContextModules';
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
import { PsychologyComplementaryQuestions } from './psychology/PsychologyComplementaryQuestions';

const DocumentosTimbrados = lazy(() => import('./panels/DocumentosTimbrados')
  .then(module => ({ default: module.DocumentosTimbrados })));

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
  {
    title: 'Avaliação',
    tabs: [
      PSYCHOLOGY_TABS.ANAMNESE,
      PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES,
      PSYCHOLOGY_TABS.NEURO,
    ],
  },
  { title: 'Formulação clínica', tabs: [PSYCHOLOGY_TABS.SINTESE, PSYCHOLOGY_TABS.HIPOTESES] },
  { title: 'Plano de cuidado', tabs: [PSYCHOLOGY_TABS.OBJETIVOS, PSYCHOLOGY_TABS.PLANO] },
  { title: 'Acompanhamento', tabs: [PSYCHOLOGY_TABS.EVOLUCAO] },
  { title: 'Documentos', tabs: [PSYCHOLOGY_TABS.RELATORIO, PSYCHOLOGY_TABS.DOCUMENTOS] },
  { title: 'Apoio', tabs: [PSYCHOLOGY_TABS.BIBLIOTECA] },
];

const TABS_WITHOUT_PATIENT = [PSYCHOLOGY_TABS.HOME, PSYCHOLOGY_TABS.BIBLIOTECA, PSYCHOLOGY_TABS.DOCUMENTOS];

export function PsychologyWorkspace({ profile, therapistName, onSwitchDiscipline, onSignOut }) {
  const { selectedPatient, activeAppointment, clearActiveAppointment } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const hasMultipleDisciplines = resolveUserDisciplines(profile).length > 1;

  const [activeTab, setActiveTab] = useState(PSYCHOLOGY_TABS.HOME);
  const [activeJourney, setActiveJourney] = useState(null);
  const [session, setSession] = useState(createEmptyPsychologySession);
  // Evolução vinculada ao atendimento (patient_evolutions) vive fora do
  // registro clínico deste workspace — ver supabase/migrations/20260903.
  const [patientEvolutionRecords, setPatientEvolutionRecords] = useState([]);
  const [neuroEvaluation, setNeuroEvaluation] = useState(createEmptyNeuropsychologyEvaluation);
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
  const sessionChangeVersionRef = useRef(0);
  const neuroChangeVersionRef = useRef(0);
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

  // Carrega anamnese e avaliação em registros independentes do mesmo paciente.
  useLayoutEffect(() => {
    const patientId = selectedPatient?.id;
    patientIdRef.current = patientId || null;
    setActiveJourney(null);
    setSession(createEmptyPsychologySession());
    setNeuroEvaluation(createEmptyNeuropsychologyEvaluation());
    setSaveStatus(patientId ? 'loading' : 'idle');
    setNeuroSaveStatus(patientId ? 'loading' : 'idle');
    setLastSavedAt(null);
    setNeuroLastSavedAt(null);
    setHasPending(false);
    setNeuroHasPending(false);
    setPatientEvolutionRecords([]);
    sessionChangeVersionRef.current = 0;
    neuroChangeVersionRef.current = 0;
    loadBlockedRef.current = false;
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
    listPatientEvolutions(patientId, 'psicologia')
      .then(records => { if (!cancelled) setPatientEvolutionRecords(records); })
      .catch(() => { if (!cancelled) setPatientEvolutionRecords([]); });
    Promise.all([
      getLatestRecord(patientId, PSI_ANAMNESE_RECORD_TYPE, 'psicologia'),
      getLatestRecord(patientId, PSI_NEURO_RECORD_TYPE, 'psicologia'),
    ])
      .then(([record, neuroRecord]) => {
        if (cancelled || patientIdRef.current !== patientId) return;
        if (record?.sensitive_data?.session) {
          setSession(normalizePsychologySession(record.sensitive_data.session));
          setLastSavedAt(new Date(record.updated_at));
        }
        saveQueue.setHead(
          `${patientId}:${PSI_ANAMNESE_RECORD_TYPE}`,
          record,
        );
        if (neuroRecord?.sensitive_data?.evaluation) {
          setNeuroEvaluation(normalizeNeuropsychologyEvaluation(neuroRecord.sensitive_data.evaluation));
          setNeuroLastSavedAt(new Date(neuroRecord.updated_at));
        }
        saveQueue.setHead(
          `${patientId}:${PSI_NEURO_RECORD_TYPE}`,
          neuroRecord,
        );
        setSaveStatus('idle');
        setNeuroSaveStatus('idle');
      })
      .catch(err => {
        if (cancelled || patientIdRef.current !== patientId) return;
        loadBlockedRef.current = true;
        setSaveStatus('load_error');
        setNeuroSaveStatus('load_error');
        console.error('Erro ao carregar prontuários de psicologia:', {
          name: err?.name || 'Error',
          code: err?.code || 'PSYCHOLOGY_LOAD_ERROR',
        });
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

  const doSaveNeuro = useCallback(async () => {
    const patientId = patientIdRef.current;
    if (!patientId || loadBlockedRef.current) return;
    const laneKey = `${patientId}:${PSI_NEURO_RECORD_TYPE}`;
    const changeVersion = neuroChangeVersionRef.current;
    setNeuroSaveStatus('saving');
    const payload = {
      discipline: 'psicologia',
      contentStatus: NEUROPSYCHOLOGY_CONTENT_STATUS,
      evaluation: neuroEvaluation,
    };
    try {
      const result = await saveQueue.enqueue({
        patientId,
        laneKey,
        recordType: PSI_NEURO_RECORD_TYPE,
        discipline: 'psicologia',
        data: payload,
        changeVersion,
      });
      if (patientIdRef.current === patientId) {
        const current = result.changeVersion === neuroChangeVersionRef.current;
        const queued = saveQueue.pendingFor(laneKey) > 0;
        setNeuroSaveStatus(current && !queued ? 'saved' : 'idle');
        setNeuroLastSavedAt(result.updated_at ? new Date(result.updated_at) : new Date());
        setNeuroHasPending(!current || queued);
        setTimeout(() => {
          if (
            patientIdRef.current === patientId
            && result.changeVersion === neuroChangeVersionRef.current
            && saveQueue.pendingFor(laneKey) === 0
          ) {
            setNeuroSaveStatus(status => (status === 'saved' ? 'idle' : status));
          }
        }, 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar avaliação neuropsicológica:', {
        name: err?.name || 'Error',
        code: err?.code || 'PSYCHOLOGY_NEURO_SAVE_ERROR',
      });
      if (patientIdRef.current === patientId) {
        setNeuroSaveStatus('error');
        setNeuroHasPending(true);
      }
    }
  }, [neuroEvaluation, saveQueue]);

  // Auto-save com debounce (mesmo ritmo do MTC: 5s após a última mudança).
  useEffect(() => {
    if (hydratingRef.current || !selectedPatient?.id) return undefined;
    sessionChangeVersionRef.current += 1;
    setHasPending(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSaveAnamnese, 5000);
    return () => clearTimeout(saveTimerRef.current);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (neuroHydratingRef.current || !selectedPatient?.id) return undefined;
    neuroChangeVersionRef.current += 1;
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
    if ([PSYCHOLOGY_TABS.ANAMNESE, PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES].includes(tab)) {
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
    setActiveJourney('anamnese');
    setActiveTab(PSYCHOLOGY_TABS.ANAMNESE);
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

  function handleEvolucoesChange(evolucoes) {
    setSession(prev => ({ ...prev, evolucoes }));
  }

  // Depois de gravar uma evolução vinculada a um agendamento, o vínculo
  // se encerra — a próxima "Escrever evolução" passa de novo pela lista
  // de pendências, sem deixar uma data antiga grudada na tela.
  async function handleEvolutionSaved() {
    if (scopedActiveAppointment) clearActiveAppointment();
    const patientId = patientIdRef.current;
    if (!patientId) return;
    try {
      const records = await listPatientEvolutions(patientId, 'psicologia');
      setPatientEvolutionRecords(records);
    } catch {
      // A tela de Evolução já mostra o próprio erro de salvar, se houver.
    }
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
  // Mescla o legado (session.evolucoes) com os registros novos vindos de
  // patient_evolutions — ver utils/evolutionHistory.
  const evolucoes = mergeEvolutionHistory(session.evolucoes, patientEvolutionRecords);
  const scopedActiveAppointment = (
    activeAppointment
    && activeAppointment.patientId === selectedPatient?.id
    && activeAppointment.discipline === 'psicologia'
  ) ? activeAppointment : null;
  const showAssistantRail = effectiveTab === PSYCHOLOGY_TABS.ANAMNESE && Boolean(selectedPatient);
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
          onCreatePatient={() => setActiveTab(PSYCHOLOGY_TABS.PAINEL)}
          onSelectPatient={() => setActiveTab(PSYCHOLOGY_TABS.PAINEL)}
          onOpenDocuments={() => setActiveTab(PSYCHOLOGY_TABS.DOCUMENTOS)}
          onSignOut={handleSignOut}
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
            onFillTestAnswers={import.meta.env.DEV ? fillTestAnswers : undefined}
          />
        );
      case PSYCHOLOGY_TABS.ANAMNESE:
        return (
          <PsychologyAnamnese
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
      case PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES:
        return (
          <PsychologyComplementaryQuestions
            session={session}
            onQuestionsChange={handleComplementaryQuestionsChange}
            onOpenAnamnese={() => handleTabChange(PSYCHOLOGY_TABS.ANAMNESE)}
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
            evolucoes={evolucoes}
            patientId={selectedPatient?.id || null}
            activeAppointment={scopedActiveAppointment}
            onEvolucoesChange={handleEvolucoesChange}
            onEvolutionSaved={handleEvolutionSaved}
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
            neuroEvaluation={neuroEvaluation}
            selectedPatient={selectedPatient}
            patientAge={patientAge}
            onSelectIntakeProfile={selectIntakeProfile}
            onOpenEvaluation={openEvaluation}
            onOpenEvolution={() => setActiveTab(PSYCHOLOGY_TABS.EVOLUCAO)}
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
        onSwitchDiscipline={handleSwitchArea}
        selectedPatient={selectedPatient}
        patientAge={patientAge}
        sessionCount={evolucoes.length
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
