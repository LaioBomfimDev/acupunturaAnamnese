import {
  PSYCHOLOGY_AXES,
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_RISK_GROUP,
  PSYCHOLOGY_RISK_ITEMS,
  PSYCHOLOGY_TEXT_FIELDS,
} from './psychologyAnamnese';
import { PSYCHOLOGY_CONTEXT_MODULES } from './psychologyContextModules';

// Vocabulário da Psicologia no formato do roteiro (mesmos títulos da tela).
// Mora aqui, fora da tela da anamnese, porque o "Pede atenção" do menu
// (PsychologyWorkspace) conta a anamnese pelo mesmo roteiro.
export const PSYCHOLOGY_ROUTE_SPEC = {
  textFields: PSYCHOLOGY_TEXT_FIELDS,
  contextTitle: 'Contexto específico (abrir conforme o caso)',
  contextModules: PSYCHOLOGY_CONTEXT_MODULES,
  checklistsTitle: 'Sinais organizados (proposta a validar)',
  checklistSections: PSYCHOLOGY_CHECKLIST_SECTIONS,
  riskTitle: 'Sinais de risco (sempre conferir)',
  riskGroup: PSYCHOLOGY_RISK_GROUP,
  riskItems: PSYCHOLOGY_RISK_ITEMS,
  axesTitle: 'Eixos de avaliação e formulação',
  axes: PSYCHOLOGY_AXES,
};
