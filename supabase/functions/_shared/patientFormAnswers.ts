// ============================================================
// Respostas da Área do Paciente — regra do lado do servidor
//
// Espelho de frontend/src/utils/patientForms.js (fonte das regras): a
// Edge Function patient-portal não confia na tela e refaz aqui a limpeza
// das respostas, o progresso e a conferência das obrigatórias antes de
// gravar. Sem import externo, para o teste do frontend carregar este
// arquivo e comparar as duas versões com os mesmos casos
// (tests/regression/patient-portal.test.mjs). Mudou lá, muda aqui.
// ============================================================

type Question = {
  id: string;
  type: string;
  label?: string;
  required?: boolean;
  options?: string[];
  allowOther?: boolean;
  allowUnknown?: boolean;
  scale?: { min?: number; max?: number };
  showIf?: { questionId?: string; values?: string[] } | null;
};

type Answers = Record<string, unknown>;

const ANSWERABLE = new Set(['yes_no', 'single', 'multiple', 'scale', 'short_text', 'long_text', 'date', 'number']);
const SHORT_TEXT_MAX = 300;
const LONG_TEXT_MAX = 4000;

export const OTHER_VALUE = '__outro__';
export const OTHER_SUFFIX = '__outro';

function isAnswerable(question: Question) {
  return Boolean(question) && ANSWERABLE.has(question.type);
}

function optionsOf(question: Question): string[] {
  if (question.type === 'yes_no') {
    return question.allowUnknown ? ['Sim', 'Não', 'Não sei'] : ['Sim', 'Não'];
  }
  if (question.type === 'single' || question.type === 'multiple') {
    return Array.isArray(question.options) ? question.options.filter(item => typeof item === 'string') : [];
  }
  return [];
}

function scaleRange(question: Question) {
  const min = question.scale?.min === 1 ? 1 : 0;
  const rawMax = Number(question.scale?.max);
  const max = Number.isInteger(rawMax) && rawMax >= 3 && rawMax <= 10 ? rawMax : 10;
  return { min, max: Math.max(max, min + 2) };
}

function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isVisible(question: Question, answers: Answers, byId: Map<string, Question>, depth = 0): boolean {
  const condition = question.showIf;
  if (!condition?.questionId) return true;
  if (depth > 20) return false;
  const source = byId.get(condition.questionId);
  if (!source) return true;
  if (!isVisible(source, answers, byId, depth + 1)) return false;
  const values = Array.isArray(condition.values) ? condition.values : [];
  const answer = answers[source.id];
  if (Array.isArray(answer)) return answer.some(value => values.includes(value));
  return typeof answer === 'string' && values.includes(answer);
}

function isAnswered(question: Question, answers: Answers) {
  const value = answers[question.id];
  const other = String(answers[`${question.id}${OTHER_SUFFIX}`] || '').trim();
  switch (question.type) {
    case 'yes_no':
    case 'single':
      if (typeof value !== 'string' || !value) return false;
      return value === OTHER_VALUE ? Boolean(other) : true;
    case 'multiple':
      if (!Array.isArray(value) || value.length === 0) return false;
      return value.includes(OTHER_VALUE) && value.length === 1 ? Boolean(other) : true;
    case 'scale':
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'date':
      return isIsoDate(value);
    case 'short_text':
    case 'long_text':
      return typeof value === 'string' && value.trim().length > 0;
    default:
      return false;
  }
}

function cleanText(value: unknown, max: number) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').slice(0, max);
  return text.trim() ? text : null;
}

function toQuestions(raw: unknown): Question[] {
  return Array.isArray(raw)
    ? raw.filter((item): item is Question =>
      Boolean(item) && typeof item === 'object' && typeof item.id === 'string' && typeof item.type === 'string')
    : [];
}

export function sanitizeAnswers(rawQuestions: unknown, rawAnswers: unknown): Answers {
  const questions = toQuestions(rawQuestions);
  const raw = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers)
    ? rawAnswers as Answers
    : {};
  const clean: Answers = {};
  const byId = new Map(questions.map(question => [question.id, question]));

  for (const question of questions) {
    if (!isAnswerable(question)) continue;
    const value = raw[question.id];
    if (value === undefined || value === null) continue;
    const options = optionsOf(question);
    const otherKey = `${question.id}${OTHER_SUFFIX}`;

    switch (question.type) {
      case 'yes_no':
      case 'single': {
        if (typeof value !== 'string') break;
        if (options.includes(value)) clean[question.id] = value;
        else if (value === OTHER_VALUE && question.type === 'single' && question.allowOther) {
          clean[question.id] = value;
          const other = cleanText(raw[otherKey], SHORT_TEXT_MAX);
          if (other) clean[otherKey] = other;
        }
        break;
      }
      case 'multiple': {
        if (!Array.isArray(value)) break;
        const allowed = new Set(question.allowOther ? [...options, OTHER_VALUE] : options);
        const picked = [...new Set(value.filter(item => typeof item === 'string' && allowed.has(item)))];
        if (!picked.length) break;
        clean[question.id] = picked;
        if (picked.includes(OTHER_VALUE)) {
          const other = cleanText(raw[otherKey], SHORT_TEXT_MAX);
          if (other) clean[otherKey] = other;
        }
        break;
      }
      case 'scale': {
        const { min, max } = scaleRange(question);
        if (Number.isInteger(value) && (value as number) >= min && (value as number) <= max) clean[question.id] = value;
        break;
      }
      case 'number':
        if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e9) clean[question.id] = value;
        break;
      case 'date':
        if (isIsoDate(value)) clean[question.id] = value;
        break;
      case 'short_text': {
        const text = cleanText(value, SHORT_TEXT_MAX);
        if (text) clean[question.id] = text;
        break;
      }
      case 'long_text': {
        const text = cleanText(value, LONG_TEXT_MAX);
        if (text) clean[question.id] = text;
        break;
      }
      default:
        break;
    }
  }

  for (const question of questions) {
    if (!isAnswerable(question) || isVisible(question, clean, byId)) continue;
    delete clean[question.id];
    delete clean[`${question.id}${OTHER_SUFFIX}`];
  }

  return clean;
}

function visibleAnswerable(questions: Question[], answers: Answers) {
  const byId = new Map(questions.map(question => [question.id, question]));
  return questions.filter(question => isAnswerable(question) && isVisible(question, answers, byId));
}

export function computeProgress(rawQuestions: unknown, answers: Answers) {
  const list = visibleAnswerable(toQuestions(rawQuestions), answers);
  if (!list.length) return 0;
  const done = list.filter(question => isAnswered(question, answers)).length;
  return Math.round((done / list.length) * 100);
}

export function missingRequired(rawQuestions: unknown, answers: Answers) {
  return visibleAnswerable(toQuestions(rawQuestions), answers)
    .filter(question => question.required && !isAnswered(question, answers))
    .map(question => question.id);
}
