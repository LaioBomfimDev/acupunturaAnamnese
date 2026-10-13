import { resolveUserDisciplines } from '../data/disciplines';

// ============================================================
// Quem vê a tela "Escalas" (menu principal, 13/10/2026) e a aba Escalas
// da ficha do paciente.
//
// Áreas que têm escala no catálogo (data/clinicalInstruments.js). Fica
// aqui, e não derivado do catálogo, para a tela inicial não carregar as
// perguntas de todas as escalas só para decidir se mostra um botão; o
// teste confere que a lista bate com o catálogo.
//
// Quem vê: a administração da clínica (lê sempre, 20261012) e quem atende
// em uma dessas áreas. A recepção nunca (não vê dado clínico). O que cada
// um lê de verdade continua decidido no banco, paciente por paciente.
// ============================================================

export const INSTRUMENT_DISCIPLINES = ['psicologia'];

/** Áreas com escala que esta pessoa pode abrir, na ordem do catálogo. */
export function scaleDisciplinesFor(profile) {
  if (!profile || profile.role === 'receptionist') return [];
  if (profile.role === 'clinic_admin') return [...INSTRUMENT_DISCIPLINES];
  const own = resolveUserDisciplines(profile);
  return INSTRUMENT_DISCIPLINES.filter(discipline => own.includes(discipline));
}

export function canSeeScales(profile) {
  return scaleDisciplinesFor(profile).length > 0;
}
