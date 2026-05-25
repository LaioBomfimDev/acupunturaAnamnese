/* eslint-disable react-hooks/set-state-in-effect */
// ============================================================
// CONTEXT: Gerenciamento do paciente selecionado
// Centraliza a lógica de seleção de paciente ativo,
// listagem e criação de pacientes.
// ============================================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  listPatients,
  createPatient as createPatientApi,
  updatePatient as updatePatientApi,
  deletePatient as deletePatientApi,
} from '../services/patientService';

const PatientContext = createContext({});

export const PatientProvider = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || null;
  const activeUserIdRef = useRef(userId);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Carrega pacientes ao logar
  const loadPatients = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await listPatients();
      if (activeUserIdRef.current !== userId) return;
      setPatients(data);
      setSelectedPatient(prev => (
        prev && data.some(patient => patient.id === prev.id) ? prev : null
      ));
    } catch (err) {
      if (activeUserIdRef.current !== userId) return;
      console.error('Erro ao carregar pacientes:', err);
      setError(err.message);
    } finally {
      if (activeUserIdRef.current === userId) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    activeUserIdRef.current = userId;
    setPatients([]);
    setSelectedPatient(null);
    setError(null);
    setLoading(false);

    if (!userId) return;
    loadPatients();
  }, [userId, loadPatients]);

  // Criar novo paciente
  const createPatient = useCallback(async ({ name, phone, birthDate, age }) => {
    setError(null);
    try {
      const newPatient = await createPatientApi({ name, phone, birthDate, age });
      setPatients(prev => [newPatient, ...prev]);
      setSelectedPatient(newPatient);
      return newPatient;
    } catch (err) {
      console.error('Erro ao criar paciente:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Atualizar cadastro do paciente
  const updatePatient = useCallback(async (patientId, updates) => {
    setError(null);
    try {
      const updatedPatient = await updatePatientApi(patientId, updates);
      setPatients(prev => {
        if (updatedPatient.archived_at) {
          return prev.filter(p => p.id !== patientId);
        }
        return prev.map(p => p.id === patientId ? updatedPatient : p);
      });
      setSelectedPatient(prev => prev?.id === patientId ? updatedPatient : prev);
      return updatedPatient;
    } catch (err) {
      console.error('Erro ao atualizar paciente:', err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Remover paciente
  const deletePatient = useCallback(async (patientId) => {
    setError(null);
    try {
      await deletePatientApi(patientId);
      setPatients(prev => prev.filter(p => p.id !== patientId));
      if (selectedPatient?.id === patientId) {
        setSelectedPatient(null);
      }
    } catch (err) {
      console.error('Erro ao excluir paciente:', err);
      setError(err.message);
      throw err;
    }
  }, [selectedPatient]);

  // Selecionar paciente
  const selectPatient = useCallback((patient) => {
    setSelectedPatient(patient);
  }, []);

  // Limpar seleção (novo atendimento)
  const clearSelection = useCallback(() => {
    setSelectedPatient(null);
  }, []);

  const archivePatient = useCallback(async (patientId) => {
    const archived = await updatePatient(patientId, { archivedAt: new Date().toISOString() });
    setSelectedPatient(prev => prev?.id === patientId ? null : prev);
    return archived;
  }, [updatePatient]);

  return (
    <PatientContext.Provider value={{
      patients,
      selectedPatient,
      loading,
      error,
      createPatient,
      updatePatient,
      archivePatient,
      deletePatient,
      selectPatient,
      clearSelection,
      refreshPatients: loadPatients,
    }}>
      {children}
    </PatientContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const usePatient = () => {
  return useContext(PatientContext);
};
