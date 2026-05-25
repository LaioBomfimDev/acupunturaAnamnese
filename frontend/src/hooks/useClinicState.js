// ============================================================
// HOOK: Gerenciamento de estado clínico da sessão
// Centraliza estado do formulário e seleções de checklist.
// Expõe setState/setSelectedMap para carregamento de dados.
// ============================================================

import { useState, useCallback } from 'react';

export function calculateAge(birthDate) {
  if (!birthDate) return '';

  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return '';

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());

  if (!hasHadBirthday) age -= 1;
  return age > 0 ? String(age) : '';
}

export function getPatientAge(patient) {
  if (!patient) return '';
  if (patient.age !== undefined && patient.age !== null && patient.age !== '') {
    return String(patient.age);
  }
  return calculateAge(patient.birth_date);
}

export function createInitialState(patient = null) {
  return {
    nome: patient?.name || '',
    idade: getPatientAge(patient),
    sexo: '',
    profissao: '',
    contato: patient?.phone || '',
    data: new Date().toLocaleDateString('pt-BR'),
    terapeuta: 'Dra. Denise Neves',
    queixa: '',
    historia: '',
    medicacoes: '',
    agua: '',
    dorLocal: '',
    escalaDor: '',
    obsSonoEmocoes: '',
    obsDigestao: '',
    obsDor: '',
    evolucoes: [],
  };
}

export function useClinicState() {
  const [state, setState] = useState(() => createInitialState());
  const [selectedMap, setSelectedMap] = useState({});

  // Atualiza um campo de texto do estado clínico
  const updateField = useCallback((field, value) => {
    setState(prev => ({ ...prev, [field]: value }));
  }, []);

  // Alterna a seleção de um item num grupo de checklist
  const toggle = useCallback((group, item) => {
    const key = `${group}:${item}`;
    setSelectedMap(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Retorna os itens selecionados de um grupo
  const getSelected = useCallback((group) => {
    return Object.keys(selectedMap)
      .filter(k => k.startsWith(group + ':') && selectedMap[k])
      .map(k => k.split(':').slice(1).join(':'));
  }, [selectedMap]);

  // Retorna achados de pulso formatados
  const getPulseSelected = useCallback(() => {
    return Object.keys(selectedMap)
      .filter(k => k.startsWith('pulso:') && selectedMap[k])
      .map(k => k.replace('pulso:', '').replaceAll(':', ' '));
  }, [selectedMap]);

  // Reseta a sessão atual
  const resetSession = useCallback((patient = null) => {
    setState(createInitialState(patient));
    setSelectedMap({});
  }, []);

  return {
    state,
    selectedMap,
    updateField,
    toggle,
    getSelected,
    getPulseSelected,
    resetSession,
    // Expostos para carregamento de dados do Supabase
    setState,
    setSelectedMap,
  };
}
