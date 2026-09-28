import { FisioExameFisico } from './fisioterapia/FisioExameFisico';
import { FisioEscalas } from './fisioterapia/FisioEscalas';
import { NutriAntropometria } from './nutricao/NutriAntropometria';
import { NutriConsumo } from './nutricao/NutriConsumo';
import { NutriExames } from './nutricao/NutriExames';
import { FISIO_EVALUATION_NOTICE, buildFisioReportSections } from '../../data/fisioterapiaAvaliacao';
import { NUTRI_EVALUATION_NOTICE, buildNutriReportSections } from '../../data/nutricaoAvaliacao';
import {
  buildFisioEscalasRoute,
  buildFisioExameRoute,
  buildNutriAntropometriaRoute,
  buildNutriConsumoRoute,
  buildNutriExamesRoute,
} from '../../utils/formRoute';

// ============================================================
// Área própria de cada disciplina com anamnese no motor comum.
//
// A casca (DisciplineWorkspace) continua sendo a PEÇA ÚNICA de gravação
// — carregamento protegido, fila serial com versão, autosave. Cada área
// acrescenta as próprias abas de avaliação; o dado de cada aba mora na
// mesma sessão do registro da disciplina (session[sessionKey]), então
// não há record_type novo nem migração.
//
// tab.name é também o rótulo da lateral (ícone em Sidebar.jsx).
// ============================================================

export const DISCIPLINE_AREAS = {
  fisioterapia: {
    notice: FISIO_EVALUATION_NOTICE,
    tabs: [
      { name: 'Exame físico', sessionKey: 'exameFisico', Component: FisioExameFisico, route: buildFisioExameRoute },
      { name: 'Escalas funcionais', sessionKey: 'escalas', Component: FisioEscalas, route: buildFisioEscalasRoute },
    ],
    reportSections: (session, scope) => buildFisioReportSections(session, scope),
  },
  nutricao: {
    notice: NUTRI_EVALUATION_NOTICE,
    tabs: [
      { name: 'Antropometria', sessionKey: 'antropometria', Component: NutriAntropometria, route: buildNutriAntropometriaRoute },
      { name: 'Consumo alimentar', sessionKey: 'consumo', Component: NutriConsumo, route: buildNutriConsumoRoute },
      { name: 'Exames', sessionKey: 'exames', Component: NutriExames, route: buildNutriExamesRoute },
    ],
    reportSections: (session, scope, age) => buildNutriReportSections(session, scope, age),
  },
};

export function getDisciplineArea(disciplineId) {
  return DISCIPLINE_AREAS[disciplineId] || null;
}
