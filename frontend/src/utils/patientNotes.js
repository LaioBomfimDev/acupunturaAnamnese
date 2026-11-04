// ============================================================
// Observações do cadastro do paciente (03/11/2026, opção A escolhida
// pela administradora): um campo de texto livre no cadastro
// (`patients.observacoes`, 20261103c_patient_notes.sql), em Cadastrar
// paciente, Editar cadastro e no detalhe do atendimento na Agenda.
//
// É cadastro, não prontuário: toda a equipe da instituição que vê o
// paciente vê o campo, inclusive a recepção. Dado clínico vai na ficha
// da área. O limite espelha o CHECK do banco (mudou um, muda o outro).
// ============================================================

export const PATIENT_NOTES_LABEL = 'Observações';
export const PATIENT_NOTES_MAX = 1000;
export const PATIENT_NOTES_HINT =
  'Toda a equipe vê este campo, inclusive a recepção. Não escreva dado clínico aqui: isso vai na ficha da área.';
export const PATIENT_NOTES_PLACEHOLDER = 'Ex.: prefere horário da manhã; vem com a mãe; avisar pelo WhatsApp do pai.';

/** Texto limpo para gravar: sem espaço sobrando nas pontas; vazio vira null. */
export function normalizePatientNotes(value) {
  if (value === undefined) return undefined;
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return null;
  if (text.length > PATIENT_NOTES_MAX) {
    throw new Error(`Observações passam do limite de ${PATIENT_NOTES_MAX} caracteres. Encurte o texto.`);
  }
  return text;
}

/** "120 de 1000 caracteres" (plural certo também no 1). */
export function patientNotesCounter(value) {
  const length = String(value ?? '').length;
  return `${length} de ${PATIENT_NOTES_MAX} ${length === 1 ? 'caractere' : 'caracteres'}`;
}
