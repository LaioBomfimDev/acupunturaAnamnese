// ============================================================
// Escala enviada para a Área do Paciente (etapa 2).
//
// Transforma o instrumento (data/clinicalInstruments.js) nas perguntas
// do formulário do paciente: uma parte com as instruções, cada item como
// escolha única obrigatória e a pergunta extra como opcional. O item de
// risco leva `riskNotice`: a tela do paciente mostra o CVV e o SAMU na
// hora em que uma dessas opções é marcada.
//
// O paciente responde com o rótulo da opção; aqui o rótulo vira ponto
// pela definição da escala. Espelho em
// supabase/functions/_shared/instrumentPortal.ts (a Edge Function monta
// as perguntas e calcula com a definição oficial, nunca com o que vem do
// aparelho). Mudou um, muda o outro (tests/regression/patient-instruments).
// ============================================================

import { buildApplicationPayload } from './instrumentScoring.js';

export const INSTRUCTIONS_SECTION_ID = 'instrucoes';
export const EXTRA_ITEM_HELP = 'Responda só se marcou algum dos problemas acima.';

export function buildPortalQuestions(instrument) {
  const items = (instrument.items || []).map(item => {
    const question = {
      id: item.id,
      type: 'single',
      label: item.text,
      required: true,
      options: item.options.map(option => option.label),
    };
    if (item.risk) {
      question.riskNotice = {
        values: item.options.filter(option => option.value >= item.risk.fromValue).map(option => option.label),
      };
    }
    return question;
  });
  const extras = (instrument.extraItems || []).map(item => ({
    id: item.id,
    type: 'single',
    label: item.text,
    help: EXTRA_ITEM_HELP,
    required: false,
    options: item.options.map(option => option.label),
  }));
  return [
    { id: INSTRUCTIONS_SECTION_ID, type: 'section', label: instrument.shortName, help: instrument.instructions },
    ...items,
    ...extras,
  ];
}

/** Alguma pergunta com `riskNotice` foi respondida com opção de risco? (tela do paciente) */
export function hasRiskAnswer(questions = [], answers = {}) {
  return (questions || []).some(question => (
    Array.isArray(question?.riskNotice?.values) && question.riskNotice.values.includes(answers?.[question.id])
  ));
}

/** Respostas por rótulo (como o paciente marcou) → pontos por item. */
export function answersToValues(instrument, answers = {}) {
  const values = {};
  for (const item of [...(instrument.items || []), ...(instrument.extraItems || [])]) {
    const label = answers?.[item.id];
    const option = item.options.find(candidate => candidate.label === label);
    if (option) values[item.id] = option.value;
  }
  return values;
}

/** O que vai cifrado para a tabela das escalas quando o paciente envia. */
export function buildPortalPayload(instrument, answers) {
  return buildApplicationPayload(instrument, answersToValues(instrument, answers));
}
