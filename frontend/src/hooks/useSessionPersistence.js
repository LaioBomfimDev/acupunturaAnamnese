// ============================================================
// HOOK: Auto-save e carregamento de dados clínicos
// Liga o useClinicState ao Supabase via clinicalRecordService.
// Escritas são serializadas por paciente e protegidas por revisão.
// ============================================================

import { useState, useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import {
  getLatestRecord,
  upsertClinicalSession,
} from '../services/clinicalRecordService';
import {
  createClinicalSaveQueue,
} from '../services/clinicalSaveQueue';

const AUTO_SAVE_DELAY_MS = 5000;
const SAVED_STATUS_DELAY_MS = 3000;

/**
 * Hook que gerencia a persistência da sessão clínica no Supabase.
 *
 * @param {string|null} patientId - UUID do paciente selecionado
 * @param {object} state - Estado do formulário (do useClinicState)
 * @param {object} selectedMap - Mapa de seleções (do useClinicState)
 * @param {object|null} tongueAiMeta - Metadados da análise de língua
 *        (serializeTongueAi: caminhos no Storage + achados revisados;
 *        nunca imagens/base64 — AGENTS.md §0)
 */
export function useSessionPersistence(patientId, state, selectedMap, tongueAiMeta = null) {
  const [saveStatus, setSaveStatus] = useState('idle');
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [persistenceError, setPersistenceError] = useState('');
  const saveTimeoutRef = useRef(null);
  const statusTimeoutRef = useRef(null);
  const loadVersionRef = useRef(0);
  const changeVersionRef = useRef(0);
  const activePatientIdRef = useRef(patientId);
  const loadBlockedPatientRef = useRef(null);
  const [saveQueue] = useState(() => (
    createClinicalSaveQueue({
      persist: operation => upsertClinicalSession(
        operation.patientId,
        operation.data,
        operation,
      ),
    })
  ));

  useLayoutEffect(() => {
    activePatientIdRef.current = patientId;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
  }, [patientId]);

  const isActivePatient = useCallback(
    candidateId => activePatientIdRef.current === candidateId,
    [],
  );

  const enqueueCurrentSave = useCallback(async (
    targetPatientId,
    changeVersion,
    sessionData,
  ) => {
    if (!targetPatientId) return null;
    if (loadBlockedPatientRef.current === targetPatientId) {
      throw new Error(
        'A sessão não foi carregada com segurança. Reabra o paciente antes de tentar salvar.',
      );
    }

    if (isActivePatient(targetPatientId)) {
      setSaveStatus('saving');
      setPersistenceError('');
    }

    try {
      const result = await saveQueue.enqueue({
        patientId: targetPatientId,
        data: sessionData,
        changeVersion,
      });

      if (isActivePatient(targetPatientId)) {
        const isLatestChange = result.changeVersion === changeVersionRef.current;
        const hasQueuedSave = saveQueue.pendingFor(targetPatientId) > 0;
        setLastSavedAt(result.updated_at ? new Date(result.updated_at) : new Date());
        setHasPendingChanges(!isLatestChange || hasQueuedSave);
        setSaveStatus(isLatestChange && !hasQueuedSave ? 'saved' : 'idle');

        if (isLatestChange && !hasQueuedSave) {
          if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
          statusTimeoutRef.current = setTimeout(() => {
            if (
              isActivePatient(targetPatientId)
              && saveQueue.pendingFor(targetPatientId) === 0
              && changeVersion === changeVersionRef.current
            ) {
              setSaveStatus('idle');
            }
          }, SAVED_STATUS_DELAY_MS);
        }
      }
      return result;
    } catch (error) {
      if (isActivePatient(targetPatientId)) {
        setSaveStatus('error');
        setHasPendingChanges(true);
        setPersistenceError(error?.message || 'Não foi possível salvar a sessão clínica.');
      }
      throw error;
    }
  }, [isActivePatient, saveQueue]);

  // Carrega a sessão mais recente ao selecionar paciente.
  const loadSession = useCallback(async ({
    setState,
    setSelectedMap,
    emptyState,
    hydrateTongueAi,
  }) => {
    if (!patientId) return null;

    const targetPatientId = patientId;
    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;
    changeVersionRef.current = 0;
    loadBlockedPatientRef.current = null;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);

    // Limpa imediatamente a tela anterior para nunca exibir dados de outro
    // paciente enquanto a nova sessão está sendo lida.
    setState(emptyState);
    setSelectedMap({});
    hydrateTongueAi?.(null);
    setSaveStatus('loading');
    setPersistenceError('');
    setLastSavedAt(null);
    setHasPendingChanges(false);

    try {
      const record = await getLatestRecord(targetPatientId, 'full_session', 'acupuntura');
      if (
        loadVersion !== loadVersionRef.current
        || !isActivePatient(targetPatientId)
      ) return null;

      saveQueue.setHead(targetPatientId, record);
      if (record) {
        const data = record.sensitive_data || {};
        const savedState = data.state || {};
        setState({
          ...emptyState,
          ...savedState,
          nome: emptyState.nome,
          idade: emptyState.idade,
          contato: emptyState.contato,
        });
        setSelectedMap(data.selectedMap || {});
        hydrateTongueAi?.(data.tongueAi || null);
        setLastSavedAt(new Date(record.updated_at));
        setSaveStatus('idle');
        return data;
      }

      setSaveStatus('idle');
      return null;
    } catch (error) {
      if (
        loadVersion === loadVersionRef.current
        && isActivePatient(targetPatientId)
      ) {
        loadBlockedPatientRef.current = targetPatientId;
        setSaveStatus('load_error');
        setPersistenceError(
          error?.message || 'Não foi possível carregar a sessão clínica.',
        );
      }
      return null;
    }
  }, [isActivePatient, patientId, saveQueue]);

  // Salva imediatamente a versão mais recente do formulário.
  const saveSession = useCallback(async () => {
    if (!patientId) return null;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    const sessionData = { state, selectedMap };
    if (tongueAiMeta) sessionData.tongueAi = tongueAiMeta;
    try {
      return await enqueueCurrentSave(
        patientId,
        changeVersionRef.current,
        sessionData,
      );
    } catch {
      return null;
    }
  }, [enqueueCurrentSave, patientId, selectedMap, state, tongueAiMeta]);

  // Debounced auto-save (salva 5s após a última alteração).
  const scheduleAutoSave = useCallback(() => {
    if (!patientId) return;
    if (loadBlockedPatientRef.current === patientId) {
      setHasPendingChanges(true);
      setSaveStatus('load_error');
      setPersistenceError(
        'A ficha não foi carregada com segurança. Reabra o paciente antes de editar.',
      );
      return;
    }
    changeVersionRef.current += 1;
    const scheduledVersion = changeVersionRef.current;
    const scheduledData = { state, selectedMap };
    if (tongueAiMeta) scheduledData.tongueAi = tongueAiMeta;
    setHasPendingChanges(true);
    if (saveStatus !== 'saving') setSaveStatus('idle');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      void enqueueCurrentSave(patientId, scheduledVersion, scheduledData).catch(() => {
        // O hook já mantém o erro visível e as mudanças pendentes.
      });
    }, AUTO_SAVE_DELAY_MS);
  }, [enqueueCurrentSave, patientId, saveStatus, selectedMap, state, tongueAiMeta]);

  useEffect(() => () => {
    loadVersionRef.current += 1;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
  }, []);

  return {
    saveStatus,
    lastSavedAt,
    saveSession,
    loadSession,
    scheduleAutoSave,
    hasPendingChanges,
    persistenceError,
  };
}
