// ============================================================
// HOOK: Auto-save e carregamento de dados clínicos
// Liga o useClinicState ao Supabase via clinicalRecordService
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import { saveClinicalRecord, getLatestRecord, updateClinicalRecord } from '../services/clinicalRecordService';

/**
 * Hook que gerencia a persistência da sessão clínica no Supabase.
 * 
 * @param {string|null} patientId - UUID do paciente selecionado
 * @param {object} state - Estado do formulário (do useClinicState)
 * @param {object} selectedMap - Mapa de seleções (do useClinicState)
 */
export function useSessionPersistence(patientId, state, selectedMap) {
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [currentRecord, setCurrentRecord] = useState(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const saveTimeoutRef = useRef(null);
  const loadVersionRef = useRef(0);
  const activePatientIdRef = useRef(patientId);

  useEffect(() => {
    activePatientIdRef.current = patientId;
  }, [patientId]);

  // Carrega a sessão mais recente ao selecionar paciente
  const loadSession = useCallback(async ({ setState, setSelectedMap, emptyState }) => {
    if (!patientId) return null;

    const loadVersion = loadVersionRef.current + 1;
    loadVersionRef.current = loadVersion;
    setSaveStatus('idle');
    setLastSavedAt(null);
    setCurrentRecord(null);
    setHasPendingChanges(false);

    try {
      const record = await getLatestRecord(patientId, 'full_session');
      if (loadVersion !== loadVersionRef.current) return null;

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
        setCurrentRecord({ id: record.id, patientId });
        setLastSavedAt(new Date(record.updated_at));
        setHasPendingChanges(false);
        return data;
      }
    } catch (err) {
      console.error('Erro ao carregar sessão:', err);
    }

    if (loadVersion === loadVersionRef.current) {
      setState(emptyState);
      setSelectedMap({});
      setLastSavedAt(null);
      setCurrentRecord(null);
      setHasPendingChanges(false);
    }
    return null;
  }, [patientId]);

  // Salva a sessão no Supabase
  const saveSession = useCallback(async () => {
    if (!patientId) return;

    const isStillActivePatient = () => activePatientIdRef.current === patientId;

    if (isStillActivePatient()) setSaveStatus('saving');
    const sessionData = { state, selectedMap };
    const recordId =
      currentRecord?.patientId === patientId ? currentRecord.id : null;

    try {
      if (recordId) {
        await updateClinicalRecord(recordId, sessionData);
      } else {
        const newId = await saveClinicalRecord(patientId, 'full_session', sessionData);
        if (isStillActivePatient()) {
          setCurrentRecord({ id: newId, patientId });
        }
      }

      if (isStillActivePatient()) {
        setSaveStatus('saved');
        setLastSavedAt(new Date());
        setHasPendingChanges(false);

        // Volta para 'idle' após 3 segundos
        setTimeout(() => {
          if (isStillActivePatient()) setSaveStatus('idle');
        }, 3000);
      }
    } catch (err) {
      console.error('Erro ao salvar sessão:', err);
      if (isStillActivePatient()) setSaveStatus('error');
    }
  }, [patientId, state, selectedMap, currentRecord]);

  // Debounced auto-save (salva 5s após última alteração)
  const scheduleAutoSave = useCallback(() => {
    if (!patientId) return;
    setHasPendingChanges(true);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveSession();
    }, 5000);
  }, [patientId, saveSession]);

  // Limpa o timeout ao desmontar
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  return {
    saveStatus,
    lastSavedAt,
    saveSession,        // Salvar manualmente (botão)
    loadSession,        // Carregar sessão existente
    scheduleAutoSave,   // Chamar quando estado mudar
    hasPendingChanges,
  };
}
