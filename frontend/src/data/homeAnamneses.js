// ============================================================
// Anamnese para responder em casa (Área do Paciente, 16/10/2026)
//
// Pedido da administradora: as anamneses que já existem (infantil e
// adulto, da Psicologia) também podem ir para o paciente responder em
// casa, como as escalas. Não é um roteiro novo: são as MESMAS perguntas
// da ficha (data/psychologyAnamnese.js e data/psychologyIntakeProfiles.js),
// com o mesmo id de campo, para a profissional trazer cada resposta para
// o campo certo da ficha depois de ler (gate humano: nada entra sozinho).
//
// O que vai para casa: a escuta livre e o roteiro do percurso. O que é
// da profissional fica no consultório: "Observações da sessão", sinais
// organizados, sinais de risco, eixos e os blocos de contexto (abertos
// por pertinência clínica, nunca para todos).
//
// Quem garante o que o paciente vê é o banco: o envio copia as perguntas
// de public.home_anamnese_templates (migration 20261017), nunca do
// aparelho de quem envia. Mudou pergunta aqui (inclusive o rótulo de um
// campo da ficha): sobe `version` e grava a versão nova numa migration
// nova. O teste home-anamnese confere que a versão daqui é a do banco.
// ============================================================

import { PSYCHOLOGY_TEXT_FIELDS } from './psychologyAnamnese.js';
import {
  PSYCHOLOGY_INFORMANT_OPTIONS,
  getPsychologyProfileSections,
  getPsychologyProfilesForPath,
} from './psychologyIntakeProfiles.js';

// Campo da escuta que é registro da profissional, não pergunta.
export const HOME_EXCLUDED_FIELDS = ['observacoesSessao'];

// Pergunta de abertura da anamnese infantil: quem está respondendo vira
// o informante de cada campo trazido para a ficha.
export const HOME_INFORMANT_QUESTION_ID = 'informante';
export const HOME_INFORMANT_NAME_QUESTION_ID = 'informanteNome';

const URGENCY_LINE = 'Em caso de urgência, ligue 188 (CVV) ou 192 (SAMU).';

export const HOME_ANAMNESES = [
  {
    id: 'psi_anamnese_adulto',
    version: 1,
    discipline: 'psicologia',
    path: 'adulto',
    name: 'Anamnese adulto',
    title: 'Anamnese — Psicologia',
    description: [
      'Estas são as perguntas da anamnese, para você responder com calma e com as suas palavras.',
      'Nenhuma é obrigatória: o que preferir, deixe em branco para conversar na consulta.',
      'Dá para parar e continuar depois: o que você escreve fica salvo.',
      'As respostas são lidas pela profissional que acompanha você, não na hora.',
      URGENCY_LINE,
    ].join(' '),
    // A escuta da ficha traz perguntas escritas para a própria pessoa
    // ("O que te trouxe ao atendimento?"): ajudam quem responde sozinho.
    withListeningGuide: true,
    askInformant: false,
  },
  {
    id: 'psi_anamnese_infantil',
    version: 1,
    discipline: 'psicologia',
    path: 'infantojuvenil',
    name: 'Anamnese infantil',
    title: 'Anamnese infantil — Psicologia',
    description: [
      'Estas são as perguntas da anamnese infantil, para o responsável pela criança ou adolescente responder com calma.',
      'Comece dizendo quem está respondendo. As outras perguntas não são obrigatórias:',
      'o que preferir, deixe em branco para conversar na consulta.',
      'Dá para parar e continuar depois: o que você escreve fica salvo.',
      'As respostas são lidas pela profissional que acompanha a criança, não na hora.',
      URGENCY_LINE,
    ].join(' '),
    // As perguntas-guia da escuta falam com a própria pessoa ("Como foi
    // sua infância?"): para o responsável, confundiriam de quem se fala.
    withListeningGuide: false,
    askInformant: true,
  },
];

export function getHomeAnamnese(id) {
  return HOME_ANAMNESES.find(item => item.id === id) || null;
}

export function homeAnamneseForPath(path) {
  return HOME_ANAMNESES.find(item => item.path === path) || null;
}

function textQuestion(field, help = '') {
  return {
    id: field.id,
    type: 'long_text',
    label: field.label,
    help,
    required: false,
    showIf: null,
  };
}

function guideHelp(field) {
  return Array.isArray(field.questionGuide) ? field.questionGuide.join(' ') : '';
}

/**
 * Perguntas no formato dos formulários da Área do Paciente
 * (utils/patientForms.js), na ordem da ficha. É o que a migration grava
 * em home_anamnese_templates.
 */
export function buildHomeAnamneseQuestions(definition) {
  const questions = [];
  if (definition.askInformant) {
    questions.push(
      { id: 'quem-responde', type: 'section', label: 'Quem está respondendo', help: '' },
      {
        id: HOME_INFORMANT_QUESTION_ID,
        type: 'single',
        label: 'Quem está respondendo?',
        help: '',
        required: true,
        showIf: null,
        options: PSYCHOLOGY_INFORMANT_OPTIONS.map(option => option.label),
        allowOther: false,
      },
      {
        id: HOME_INFORMANT_NAME_QUESTION_ID,
        type: 'short_text',
        label: 'Nome ou vínculo complementar',
        help: 'Opcional. Ex.: avó materna.',
        required: false,
        showIf: null,
      },
    );
  }

  questions.push({ id: 'escuta', type: 'section', label: 'Escuta livre', help: '' });
  for (const field of PSYCHOLOGY_TEXT_FIELDS) {
    if (HOME_EXCLUDED_FIELDS.includes(field.id)) continue;
    questions.push(textQuestion(field, definition.withListeningGuide ? guideHelp(field) : ''));
  }

  // As seções dependem só da faixa etária: qualquer perfil do percurso serve.
  const profile = getPsychologyProfilesForPath(definition.path)[0];
  for (const section of getPsychologyProfileSections(profile?.id)) {
    questions.push({ id: section.id, type: 'section', label: section.title, help: '' });
    for (const field of section.fields) questions.push(textQuestion(field));
  }
  return questions;
}

/** Ids dos campos da ficha que a anamnese de casa pergunta. */
export function homeAnamneseFieldIds(questions) {
  return (questions || [])
    .filter(question => question.type === 'long_text')
    .map(question => question.id);
}
