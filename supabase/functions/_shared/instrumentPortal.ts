// ============================================================
// Escala enviada para a Área do Paciente — lado do servidor
//
// Espelho de frontend/src/utils/instrumentPortal.js (fonte das regras):
// monta as perguntas a partir da definição oficial
// (_shared/clinicalInstruments.ts) e converte o rótulo marcado pelo
// paciente em ponto antes de calcular. Sem import fora de _shared, para
// o teste do frontend comparar as duas versões
// (tests/regression/patient-instruments.test.mjs). Mudou lá, muda aqui.
// ============================================================

import { buildApplicationPayload } from './instrumentScoring.ts';
import type { ServerInstrument } from './clinicalInstruments.ts';

export const INSTRUCTIONS_SECTION_ID = 'instrucoes';
export const EXTRA_ITEM_HELP = 'Responda só se marcou algum dos problemas acima.';

type PortalQuestion = {
  id: string;
  type: string;
  label: string;
  help?: string;
  required?: boolean;
  options?: string[];
  riskNotice?: { values: string[] };
};

export function buildPortalQuestions(instrument: ServerInstrument): PortalQuestion[] {
  const items = (instrument.items || []).map(item => {
    const question: PortalQuestion = {
      id: item.id,
      type: 'single',
      label: item.text || '',
      required: true,
      options: (item.options || []).map(option => option.label || ''),
    };
    if (item.risk) {
      const fromValue = item.risk.fromValue;
      question.riskNotice = {
        values: (item.options || []).filter(option => option.value >= fromValue).map(option => option.label || ''),
      };
    }
    return question;
  });
  const extras = (instrument.extraItems || []).map(item => ({
    id: item.id,
    type: 'single',
    label: item.text || '',
    help: EXTRA_ITEM_HELP,
    required: false,
    options: (item.options || []).map(option => option.label || ''),
  }));
  return [
    { id: INSTRUCTIONS_SECTION_ID, type: 'section', label: instrument.shortName, help: instrument.instructions },
    ...items,
    ...extras,
  ];
}

export function answersToValues(instrument: ServerInstrument, answers: Record<string, unknown> = {}) {
  const values: Record<string, number> = {};
  for (const item of [...(instrument.items || []), ...(instrument.extraItems || [])]) {
    const label = answers?.[item.id];
    const option = (item.options || []).find(candidate => candidate.label === label);
    if (option) values[item.id] = option.value;
  }
  return values;
}

export function buildPortalPayload(instrument: ServerInstrument, answers: Record<string, unknown>) {
  return buildApplicationPayload(instrument, answersToValues(instrument, answers));
}
