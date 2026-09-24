/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import { getLatestRecord } from '../../services/clinicalRecordService';
import { listPatientEvolutions } from '../../services/patientEvolutionService';
import { mergeEvolutionHistory } from '../../utils/evolutionHistory';
import { analyze } from '../../utils/analyzer';
import { createInitialState } from '../../hooks/useClinicState';
import { getAnamneseConfig } from '../../data/anamneseRegistry';
import { createEmptySession, normalizeSession } from '../../data/anamneseKit';
import {
  PSI_ANAMNESE_RECORD_TYPE,
  createEmptyPsychologySession,
  normalizePsychologySession,
} from '../../data/psychologyAnamnese';
import { Evolucao } from '../panels/Evolucao';
import { PsychologyEvolucao } from '../psychology/PsychologyEvolucao';
import { DisciplineEvolucao } from '../anamnese/DisciplineEvolucao';
import { PanelLoading } from '../ui/PanelLoading';

// ============================================================
// Formulário de evolução de UM paciente numa disciplina, fora do
// workspace da disciplina (tela Evoluções). Reaproveita os formulários
// que já existiam — os mesmos campos, avisos e histórico — e só troca
// de onde vêm os dados: aqui o prontuário é LIDO direto do banco, sem
// passar pelo paciente selecionado do workspace.
//
// Somente leitura sobre o prontuário: esta tela nunca grava o
// clinical_record da disciplina. A evolução nova vai para
// patient_evolutions (insertPatientEvolution, dentro dos formulários).
// Por isso as sessões do histórico legado aparecem travadas aqui —
// editá-las exigiria regravar o prontuário inteiro, com CAS, de fora do
// workspace dono dele.
// ============================================================

const noop = () => {};

function lockHistory(entries) {
  return entries.map(entry => ({ ...entry, editable: false }));
}

async function loadClinicalSession(patient, discipline) {
  if (discipline === 'acupuntura') {
    const record = await getLatestRecord(patient.id, 'full_session', 'acupuntura');
    const data = record?.sensitive_data || {};
    const emptyState = createInitialState(patient);
    return {
      state: { ...emptyState, ...(data.state || {}), nome: emptyState.nome, idade: emptyState.idade, contato: emptyState.contato },
      selectedMap: data.selectedMap || {},
    };
  }

  if (discipline === 'psicologia') {
    const record = await getLatestRecord(patient.id, PSI_ANAMNESE_RECORD_TYPE, 'psicologia');
    return {
      session: record?.sensitive_data?.session
        ? normalizePsychologySession(record.sensitive_data.session)
        : createEmptyPsychologySession(),
    };
  }

  const config = getAnamneseConfig(discipline);
  const record = await getLatestRecord(patient.id, config.recordType, discipline);
  return {
    session: record?.sensitive_data?.session
      ? normalizeSession(config, record.sensitive_data.session)
      : createEmptySession(config),
  };
}

function emptyClinicalSession(patient, discipline) {
  if (discipline === 'acupuntura') return { state: createInitialState(patient), selectedMap: {} };
  if (discipline === 'psicologia') return { session: createEmptyPsychologySession() };
  return { session: createEmptySession(getAnamneseConfig(discipline)) };
}

export function EvolutionRecordPanel({ patient, discipline, activeAppointment, submitLabel, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [clinical, setClinical] = useState(null);
  const [records, setRecords] = useState([]);
  const [loadWarning, setLoadWarning] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadWarning('');

    Promise.allSettled([
      loadClinicalSession(patient, discipline),
      listPatientEvolutions(patient.id, discipline),
    ]).then(([sessionResult, recordsResult]) => {
      if (cancelled) return;
      if (sessionResult.status === 'fulfilled') {
        setClinical(sessionResult.value);
      } else {
        // Sem o prontuário ainda dá para registrar a evolução (ela não
        // depende dele), mas os avisos que vêm da anamnese somem — dizer
        // isso na tela em vez de fingir que está tudo carregado.
        setClinical(emptyClinicalSession(patient, discipline));
        setLoadWarning('Não deu para ler a anamnese deste paciente. Você ainda pode registrar a evolução, mas avisos que vêm da anamnese (como sinais de risco) podem não aparecer.');
      }
      setRecords(recordsResult.status === 'fulfilled' ? recordsResult.value : []);
      setLoading(false);
    });

    return () => { cancelled = true; };
    // Recarrega por paciente, não pela identidade do objeto: a fila monta
    // um objeto novo a cada render quando o paciente não está na lista.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patient.id, discipline]);

  const legacy = discipline === 'acupuntura' ? clinical?.state?.evolucoes : clinical?.session?.evolucoes;
  const evolucoes = useMemo(
    () => lockHistory(mergeEvolutionHistory(legacy, records)),
    [legacy, records],
  );
  const analysis = useMemo(
    () => (discipline === 'acupuntura' && clinical?.state ? analyze(clinical.state, clinical.selectedMap) : null),
    [discipline, clinical],
  );

  if (loading || !clinical) return <PanelLoading />;

  const common = {
    evolucoes,
    patientId: patient.id,
    activeAppointment,
    onEvolutionSaved: onSaved,
    submitLabel,
  };

  return (
    <>
      {loadWarning && <div className="alert" role="alert">{loadWarning}</div>}
      {discipline === 'acupuntura' && (
        <Evolucao {...common} state={clinical.state} onUpdate={noop} analysis={analysis} />
      )}
      {discipline === 'psicologia' && (
        <PsychologyEvolucao {...common} session={clinical.session} onEvolucoesChange={noop} />
      )}
      {discipline !== 'acupuntura' && discipline !== 'psicologia' && (
        <DisciplineEvolucao
          {...common}
          config={getAnamneseConfig(discipline)}
          session={clinical.session}
          discipline={discipline}
          onEvolucoesChange={noop}
        />
      )}
    </>
  );
}
