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
import {
  EXAM_TEXT_FIELDS,
  PAIN_FIELDS,
  VITAL_SIGNS,
  normalizeFisioEscalas,
  normalizeFisioExame,
} from '../data/fisioterapiaAvaliacao.js';
import {
  ANTHRO_BASIC_FIELDS,
  ANTHRO_COMPOSITION_FIELDS,
  ANTHRO_SKINFOLD_FIELDS,
  MEALS,
  normalizeAntropometria,
  normalizeConsumo,
  normalizeExames,
} from '../data/nutricaoAvaliacao.js';

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

const countFilled = (source, fields) => fields.filter(field => filled(source?.[field.id])).length;
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** Fisioterapia → Exame físico (session.exameFisico). */
export function buildFisioExameRoute(raw) {
  const exame = normalizeFisioExame(raw);
  const testsDone = Object.values(exame.testes).filter(entry => filled(entry?.result)).length;
  return [
    item({ id: 'fisio-sinais', number: '1', title: 'Sinais vitais', done: countFilled(exame.sinais, VITAL_SIGNS), total: VITAL_SIGNS.length }),
    item({ id: 'fisio-dor', number: '2', title: 'Dor (0 a 10)', done: countFilled(exame.dor, PAIN_FIELDS), total: PAIN_FIELDS.length }),
    item({
      id: 'fisio-adm',
      number: '3',
      title: 'Amplitude de movimento',
      done: exame.adm.filter(entry => filled(entry.active) || filled(entry.passive)).length,
      total: exame.adm.length,
      unitLabel: 'medidos',
      hint: 'nenhum movimento adicionado',
    }),
    item({
      id: 'fisio-forca',
      number: '4',
      title: 'Força muscular (MRC)',
      done: exame.forca.filter(entry => filled(entry.grade)).length,
      total: exame.forca.length,
      unitLabel: 'graduados',
      hint: 'nenhum grupo adicionado',
    }),
    item({
      id: 'fisio-testes',
      number: '5',
      title: 'Testes especiais',
      total: 0,
      hint: testsDone ? plural(testsDone, 'teste registrado', 'testes registrados') : 'nenhum teste registrado',
    }),
    item({
      id: 'fisio-achados',
      number: '6',
      title: 'Inspeção, palpação e outros achados',
      done: countFilled(exame, EXAM_TEXT_FIELDS),
      total: EXAM_TEXT_FIELDS.length,
    }),
  ];
}

/** Fisioterapia → Escalas funcionais (session.escalas). */
export function buildFisioEscalasRoute(raw) {
  const escalas = normalizeFisioEscalas(raw);
  return [
    item({
      id: 'escalas-aplicadas',
      number: '1',
      title: 'Escalas aplicadas',
      done: escalas.itens.filter(entry => filled(entry.score)).length,
      total: escalas.itens.length,
      unitLabel: 'com escore',
      hint: 'nenhuma escala adicionada',
    }),
    item({
      id: 'escalas-observacoes',
      number: '2',
      title: 'Observações da avaliação funcional',
      done: filled(escalas.observacoes) ? 1 : 0,
      total: 1,
    }),
  ];
}

/** Nutrição → Antropometria (session.antropometria), sobre a medida mais recente. */
export function buildNutriAntropometriaRoute(raw) {
  const { medidas } = normalizeAntropometria(raw);
  const latest = medidas[0];
  const composition = [...ANTHRO_SKINFOLD_FIELDS, ...ANTHRO_COMPOSITION_FIELDS];
  return [
    item({
      id: 'antro-medidas',
      number: '1',
      title: 'Peso, altura e circunferências',
      done: latest ? countFilled(latest, ANTHRO_BASIC_FIELDS) : 0,
      total: latest ? ANTHRO_BASIC_FIELDS.length : 0,
      hint: 'nenhuma medida registrada',
    }),
    item({
      id: 'antro-composicao',
      number: '2',
      title: 'Dobras cutâneas e composição corporal',
      done: latest ? countFilled(latest, composition) : 0,
      total: latest ? composition.length : 0,
      hint: 'nenhuma medida registrada',
    }),
    item({
      id: 'antro-historico',
      number: '3',
      title: 'Histórico de medidas',
      total: 0,
      hint: medidas.length ? plural(medidas.length, 'medida', 'medidas') : 'sem histórico',
    }),
  ];
}

/** Nutrição → Consumo alimentar (session.consumo). */
export function buildNutriConsumoRoute(raw) {
  const consumo = normalizeConsumo(raw);
  return [
    item({ id: 'consumo-dia', number: '1', title: 'Dia avaliado', done: filled(consumo.tipoDia) ? 1 : 0, total: 1 }),
    item({
      id: 'consumo-refeicoes',
      number: '2',
      title: 'Recordatório 24 horas',
      done: MEALS.filter(meal => filled(consumo.refeicoes[meal.id]?.alimentos)).length,
      total: MEALS.length,
      unitLabel: 'refeições registradas',
    }),
    item({
      id: 'consumo-hidratacao',
      number: '3',
      title: 'Hidratação e observações',
      done: [consumo.agua, consumo.observacoes].filter(filled).length,
      total: 2,
    }),
  ];
}

/** Nutrição → Exames (session.exames). */
export function buildNutriExamesRoute(raw) {
  const exames = normalizeExames(raw);
  return [
    item({
      id: 'exames-registrados',
      number: '1',
      title: 'Exames laboratoriais',
      done: exames.itens.filter(entry => filled(entry.nome) && filled(entry.valor)).length,
      total: exames.itens.length,
      unitLabel: 'com resultado',
      hint: 'nenhum exame adicionado',
    }),
    item({
      id: 'exames-observacoes',
      number: '2',
      title: 'Observações sobre os exames',
      done: filled(exames.observacoes) ? 1 : 0,
      total: 1,
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
