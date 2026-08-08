// ============================================================
// REGISTRO: qual configuração de anamnese cada disciplina usa.
//
// A anamnese genérica (components/anamnese/DisciplineAnamnese.jsx) e o
// workspace genérico (components/DisciplineWorkspace.jsx) leem daqui.
// Acrescentar uma disciplina é escrever o arquivo de dados e registrá-la
// nesta tabela — nenhuma tela precisa ser duplicada.
//
// Psicologia ainda tem tela própria (PsychologyAnamnese) porque carrega
// dois fluxos que as demais não têm: informante por campo e avaliação
// neuropsicológica. A migração dela para o componente genérico está
// registrada como pendência em docs/plano-anamnese-multidisciplinar.md.
// ============================================================

import { FISIOTERAPIA_ANAMNESE } from './fisioterapiaAnamnese.js';
import { NUTRICAO_ANAMNESE } from './nutricaoAnamnese.js';

export const ANAMNESE_CONFIGS = {
  fisioterapia: FISIOTERAPIA_ANAMNESE,
  nutricao: NUTRICAO_ANAMNESE,
};

export const GENERIC_ANAMNESE_DISCIPLINES = Object.keys(ANAMNESE_CONFIGS);

export function getAnamneseConfig(disciplineId) {
  return ANAMNESE_CONFIGS[disciplineId] || null;
}
