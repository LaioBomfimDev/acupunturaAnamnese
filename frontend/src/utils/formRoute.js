// ============================================================
// Roteiro da ficha: a lista de seções de uma ficha com o progresso
// real de cada uma, calculado dos DADOS da sessão (não do DOM), para
// o trilho lateral e os contadores "x de y" nos títulos de seção.
//
// Regras de contagem, iguais em todas as disciplinas:
//  * campo de texto conta quando tem conteúdo;
//  * grupo de sinais (checklist) conta como 1 quando há ao menos um
//    item marcado;
//  * bloco de contexto fechado não entra na conta (fechar só esconde);
//  * sinal de risco marcado não é "preenchimento": vira a flag `risk`,
//    que o trilho pinta de vermelho.
//
// Nada aqui decide conduta: é só onde a ficha está e o que falta.
// ============================================================

import { checklists } from '../data/checklists.js';

const filled = value => String(value ?? '').trim().length > 0;

function anyMarked(selectedMap, group, items) {
  return (items || []).some(item => Boolean(selectedMap?.[`${group}:${item}`]));
}

function countFields(values, fields) {
  return (fields || []).filter(field => filled(values?.[field.id ?? field])).length;
}

export function formSectionAnchor(id) {
  return `form-sec-${id}`;
}

function item({ id, number = null, title, done = 0, total = 0, risk = false, hint = '', unitLabel = 'preenchidos' }) {
  return { id, anchor: formSectionAnchor(id), number, title, done, total, risk, hint, unitLabel };
}

/**
 * Anamnese no formato do motor (Fisioterapia, Nutrição) e da Psicologia:
 * escuta livre → roteiro do percurso → contexto → sinais → risco → eixos.
 * `spec` traz o vocabulário; `session` é a sessão salva da disciplina.
 */
export function buildAnamneseRoute(spec, session) {
  const fields = session?.fields || {};
  const selectedMap = session?.selectedMap || {};
  const sections = spec.sections || [];
  const openModules = (spec.contextModules || [])
    .filter(module => Boolean(session?.contextModules?.[module.id]));
  const openFields = openModules.flatMap(module => module.fields);
  const riskMarked = (spec.riskItems || [])
    .filter(risk => selectedMap[`${spec.riskGroup}:${risk.label}`]).length;
  const axisNotes = session?.axisNotes || {};

  return [
    item({
      id: 'escuta',
      number: '1',
      title: 'Escuta livre',
      done: countFields(fields, spec.textFields),
      total: spec.textFields.length,
    }),
    ...sections.map((section, index) => item({
      id: `percurso-${section.id}`,
      number: String(index + 2),
      title: section.title,
      done: countFields(fields, section.fields),
      total: section.fields.length,
    })),
    item({
      id: 'contexto',
      number: String(sections.length + 2),
      title: spec.contextTitle,
      done: countFields(fields, openFields),
      total: openFields.length,
      hint: openModules.length
        ? ''
        : 'nenhum bloco aberto',
    }),
    item({
      id: 'sinais',
      title: spec.checklistsTitle,
      done: (spec.checklistSections || [])
        .filter(section => anyMarked(selectedMap, section.group, section.items)).length,
      total: (spec.checklistSections || []).length,
      unitLabel: 'grupos com marcação',
    }),
    item({
      id: 'risco',
      title: spec.riskTitle,
      done: filled(session?.riskNotes) ? 1 : 0,
      total: 1,
      risk: riskMarked > 0,
    }),
    item({
      id: 'eixos',
      title: spec.axesTitle,
      done: (spec.axes || []).filter(axis => filled(axisNotes[axis.id])).length,
      total: (spec.axes || []).length,
    }),
  ];
}

/**
 * Seção 7 da anamnese de Acupuntura muda com o sexo clínico informado
 * (e só aparece como módulo quando ele é pertinente) — mesma regra do
 * componente, repetida aqui para o trilho mostrar o mesmo título.
 */
export function getAcupunturaReproductiveModule(sexContext) {
  if (sexContext === 'feminino') {
    return { title: 'Saúde menstrual, ginecológica e hormonal', group: 'gineco', items: checklists.gineco };
  }
  if (sexContext === 'masculino') {
    return { title: 'Saúde urogenital, sexual e hormonal', group: 'urogenital', items: checklists.urogenital };
  }
  return null;
}

/** Anamnese de Acupuntura (components/panels/Anamnese.jsx). */
export function buildAcupunturaAnamneseRoute(state, selectedMap, sexContext) {
  const s = state || {};
  const map = selectedMap || {};
  const text = keys => keys.filter(key => filled(s[key])).length;
  const marked = (group, items) => (anyMarked(map, group, items) ? 1 : 0);
  const repro = getAcupunturaReproductiveModule(sexContext);
  const safety = checklists.seguranca.filter(entry => map[`seguranca:${entry}`]).length;

  return [
    item({ id: 'identificacao', number: '1', title: 'Identificação', done: text(['sexo', 'profissao', 'data']), total: 3 }),
    item({
      id: 'queixa',
      number: '2',
      title: 'Queixa principal',
      done: text(['queixa', 'historia']) + marked('queixaEstruturada', checklists.queixaEstruturada),
      total: 3,
    }),
    item({
      id: 'sono',
      number: '3',
      title: 'Sono e emoções',
      done: marked('sono', checklists.sono) + marked('emocoes', checklists.emocoes) + text(['obsSonoEmocoes']),
      total: 3,
    }),
    item({
      id: 'digestao',
      number: '4',
      title: 'Digestão, eliminação e hidratação',
      done: text(['agua', 'obsDigestao']) + marked('digestao', checklists.digestao) + marked('fezes', checklists.fezes),
      total: 4,
    }),
    item({
      id: 'dor',
      number: '5',
      title: 'Dor e sinais físicos',
      done: text(['dorLocal', 'dorPeriodoReferencia', 'escalaDor', 'dorRepouso', 'dorMovimento', 'obsDor'])
        + marked('dor', checklists.dorRegioes)
        + marked('dor', checklists.dor)
        + marked('clima', checklists.clima),
      total: 9,
    }),
    item({
      id: 'historico',
      number: '6',
      title: 'Histórico clínico integrado',
      done: marked('historico', checklists.historico)
        + text(['medicacoes', 'atividadeFisica'])
        + marked('substanciasUso', checklists.substanciasUso),
      total: 4,
    }),
    item({
      id: 'reprodutiva',
      number: '7',
      title: repro ? repro.title : 'Saúde reprodutiva e hormonal',
      done: repro ? marked(repro.group, repro.items) : 0,
      total: repro ? 1 : 0,
      hint: repro ? '' : 'sexo clínico não informado',
      unitLabel: 'grupo com marcação',
    }),
    item({
      id: 'seguranca',
      number: '8',
      title: 'Segurança clínica',
      total: 0,
      risk: safety > 0,
      hint: safety ? `${safety} ${safety === 1 ? 'sinal marcado' : 'sinais marcados'}` : 'nenhum sinal marcado',
    }),
  ];
}

const REFERRAL_FIELDS = ['requester', 'reason', 'questions', 'priorHypotheses', 'relevantHistory'];
export const NEURO_INTEGRATION_FIELD_IDS = [
  'procedures', 'clinicalObservations', 'resultsSummary', 'convergences', 'divergences',
  'workingHypotheses', 'differentialQuestions', 'limitations', 'professionalConclusion', 'recommendations',
];

/** Avaliação neuropsicológica (PsychologyNeuroAssessment.jsx). */
export function buildNeuroAssessmentRoute(evaluation) {
  const referral = evaluation?.referral || {};
  const instruments = Array.isArray(evaluation?.instruments) ? evaluation.instruments : [];
  const sessions = Array.isArray(evaluation?.sessions) ? evaluation.sessions : [];
  const integration = evaluation?.integration || {};
  return [
    item({
      id: 'encaminhamento',
      number: '1',
      title: 'Encaminhamento e perguntas da avaliação',
      done: REFERRAL_FIELDS.filter(key => filled(referral[key])).length,
      total: REFERRAL_FIELDS.length,
    }),
    item({
      id: 'instrumentos',
      number: '2',
      title: 'Instrumentos e procedimentos',
      done: instruments.filter(entry => entry.status === 'revisado').length,
      total: instruments.length,
      unitLabel: 'revisados',
      hint: instruments.length ? '' : 'nenhum instrumento',
    }),
    item({
      id: 'sessoes',
      number: '3',
      title: 'Sessões e evoluções da avaliação',
      done: sessions.filter(entry => entry.status === 'concluida').length,
      total: sessions.length,
      unitLabel: 'concluídas',
    }),
    item({
      id: 'integracao',
      number: '4',
      title: 'Integração profissional',
      done: NEURO_INTEGRATION_FIELD_IDS.filter(key => filled(integration[key])).length,
      total: NEURO_INTEGRATION_FIELD_IDS.length,
    }),
  ];
}

export function findRouteItem(items, id) {
  return (items || []).find(entry => entry.id === id) || null;
}

export function summarizeRoute(items) {
  return (items || []).reduce(
    (acc, entry) => ({ done: acc.done + entry.done, total: acc.total + entry.total }),
    { done: 0, total: 0 },
  );
}
