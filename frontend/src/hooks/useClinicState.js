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
    relatorioEdits: {},
  };
}

// Estado da análise de língua assistida por IA (fotos + achados em revisão).
// Vive fora de `state`/`selectedMap` de propósito: object URLs não são
// serializáveis e imagens nunca vão para clinical_records. O que É persistido
// na sessão são os METADADOS (serializeTongueAi): caminho no Storage, achados,
// status aceito/ignorado e versão do modelo.
export function createInitialTongueAi() {
  return {
    photos: { top: null, sublingual: null },
    analysis: null,
  };
}

// Extrai os metadados persistíveis do estado tongueAi (sem object URLs nem
// blobs). Fotos só entram se já tiverem caminho no Storage; fotos "apenas
// locais" (login fallback) ficam de fora. Retorna null quando não há nada
// a salvar, para a sessão antiga continuar idêntica.
export function serializeTongueAi(tongueAi) {
  if (!tongueAi) return null;

  const photoMeta = (photo) => (photo?.path
    ? {
        path: photo.path,
        name: photo.name || null,
        size: photo.size ?? null,
        type: 'image/webp',
        uploadedAt: photo.uploadedAt || null,
      }
    : null);

  const photos = {
    top: photoMeta(tongueAi.photos?.top),
    sublingual: photoMeta(tongueAi.photos?.sublingual),
  };
  const analysis = tongueAi.analysis || null;

  if (!photos.top && !photos.sublingual && !analysis) return null;
  return { photos, analysis };
}

// Reconstrói o estado tongueAi a partir dos metadados salvos na sessão.
// As fotos voltam sem `url` — o painel Língua gera a URL assinada sob demanda.
export function deserializeTongueAi(meta) {
  if (!meta) return createInitialTongueAi();

  const photoFromMeta = (m) => (m?.path
    ? { ...m, url: null, uploadStatus: 'uploaded' }
    : null);

  return {
    photos: {
      top: photoFromMeta(meta.photos?.top),
      sublingual: photoFromMeta(meta.photos?.sublingual),
    },
    analysis: meta.analysis || null,
  };
}

export function useClinicState() {
  const [state, setState] = useState(() => createInitialState());
  const [selectedMap, setSelectedMap] = useState({});
  const [tongueAi, setTongueAi] = useState(() => createInitialTongueAi());

  // Atualiza um campo de texto do estado clínico
  const updateField = useCallback((field, value) => {
    setState(prev => ({ ...prev, [field]: value }));
  }, []);

  // Alterna a seleção de um item num grupo de checklist
  const toggle = useCallback((group, item) => {
    const key = `${group}:${item}`;
    setSelectedMap(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Define a seleção de um item para um valor específico (não alterna).
  // Usado pelo fluxo "Aceitar" da IA: aceitar um achado já marcado não pode desmarcá-lo.
  const setSelection = useCallback((group, item, value) => {
    const key = `${group}:${item}`;
    setSelectedMap(prev => (!!prev[key] === !!value ? prev : { ...prev, [key]: !!value }));
  }, []);

  // Retorna os itens selecionados de um grupo
  const getSelected = useCallback((group) => {
    return Object.keys(selectedMap)
      .filter(k => k.startsWith(group + ':') && selectedMap[k])
      .map(k => k.split(':').slice(1).join(':'));
  }, [selectedMap]);

  // Retorna achados de pulso formatados (qualidades palpadas + sinais associados)
  const getPulseSelected = useCallback(() => {
    return Object.keys(selectedMap)
      .filter(k => (k.startsWith('pulso:') || k.startsWith('pulsoSinal:')) && selectedMap[k])
      .map(k => k.replace(/^pulso(Sinal)?:/, '').replaceAll(':', ' '));
  }, [selectedMap]);

  // Substitui o estado tongueAi liberando os object URLs do estado anterior.
  // Usado na hidratação de sessão (troca de paciente) e no reset.
  const replaceTongueAi = useCallback((next) => {
    setTongueAi(prev => {
      [prev.photos.top, prev.photos.sublingual].forEach(photo => {
        if (photo?.url?.startsWith('blob:')) URL.revokeObjectURL(photo.url);
      });
      return next;
    });
  }, []);

  // Hidrata o estado tongueAi a partir dos metadados salvos na sessão
  const hydrateTongueAi = useCallback((meta) => {
    replaceTongueAi(deserializeTongueAi(meta));
  }, [replaceTongueAi]);

  // Reseta a sessão atual
  const resetSession = useCallback((patient = null) => {
    setState(createInitialState(patient));
    setSelectedMap({});
    replaceTongueAi(createInitialTongueAi());
  }, [replaceTongueAi]);

  return {
    state,
    selectedMap,
    updateField,
    toggle,
    setSelection,
    getSelected,
    getPulseSelected,
    resetSession,
    tongueAi,
    setTongueAi,
    hydrateTongueAi,
    // Expostos para carregamento de dados do Supabase
    setState,
    setSelectedMap,
  };
}
