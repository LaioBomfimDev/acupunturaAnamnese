// ============================================================
// Importáveis: formulários que o paciente responde na Área do Paciente
//
// Fonte única, no navegador, de tudo que é regra do formulário: tipos
// de pergunta, pergunta condicional ("Se sim, qual?"), o que conta como
// respondido, progresso, limpeza das respostas e exportação.
//
// O servidor (Edge Function patient-portal) repete a parte que protege
// o banco em supabase/functions/_shared/patientFormAnswers.ts — mesmas
// regras, testadas lado a lado em tests/regression/patient-portal.
// Mudou aqui, muda lá.
// ============================================================

export const QUESTION_TYPES = [
  { id: 'yes_no', label: 'Sim / Não', marking: true },
  { id: 'single', label: 'Escolha única', marking: true },
  { id: 'multiple', label: 'Várias escolhas', marking: true },
  { id: 'scale', label: 'Escala', marking: true },
  { id: 'short_text', label: 'Texto curto', marking: false },
  { id: 'long_text', label: 'Texto longo', marking: false },
  { id: 'date', label: 'Data', marking: false },
  { id: 'number', label: 'Número', marking: false },
  { id: 'section', label: 'Nova parte', marking: false },
];

const TYPE_IDS = new Set(QUESTION_TYPES.map(type => type.id));
const CHOICE_TYPES = new Set(['yes_no', 'single', 'multiple']);

export const LIMITS = {
  titleMax: 120,
  descriptionMax: 2000,
  maxQuestions: 200,
  labelMax: 300,
  helpMax: 500,
  maxOptions: 30,
  optionMax: 120,
  shortTextMax: 300,
  longTextMax: 4000,
};

// "Outro: ___" numa escolha: a resposta guarda OTHER_VALUE e o texto
// digitado vai em `${id}${OTHER_SUFFIX}`.
export const OTHER_VALUE = '__outro__';
export const OTHER_SUFFIX = '__outro';
export const OTHER_LABEL = 'Outro';

export const YES_NO_OPTIONS = ['Sim', 'Não'];
export const UNKNOWN_OPTION = 'Não sei';

export const FORM_STATUS = {
  draft: { label: 'Rascunho', tone: 'neutral' },
  published: { label: 'Publicado', tone: 'success' },
  archived: { label: 'Arquivado', tone: 'neutral' },
};

export function questionTypeLabel(type) {
  return QUESTION_TYPES.find(item => item.id === type)?.label || type;
}

export function isAnswerable(question) {
  return Boolean(question) && question.type !== 'section' && TYPE_IDS.has(question.type);
}

export function isChoice(question) {
  return Boolean(question) && CHOICE_TYPES.has(question.type);
}

export function newQuestionId() {
  const random = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `q${random.slice(0, 10)}`;
}

export function createQuestion(type) {
  const base = { id: newQuestionId(), type, label: '', help: '', required: false, showIf: null };
  if (type === 'single' || type === 'multiple') return { ...base, options: ['Opção 1', 'Opção 2'], allowOther: false };
  if (type === 'yes_no') return { ...base, allowUnknown: false };
  if (type === 'scale') return { ...base, scale: { min: 0, max: 10, minLabel: '', maxLabel: '' } };
  if (type === 'section') return { id: base.id, type, label: '', help: '' };
  return base;
}

export function optionsOf(question) {
  if (!question) return [];
  if (question.type === 'yes_no') {
    return question.allowUnknown ? [...YES_NO_OPTIONS, UNKNOWN_OPTION] : [...YES_NO_OPTIONS];
  }
  if (question.type === 'single' || question.type === 'multiple') {
    return Array.isArray(question.options) ? question.options : [];
  }
  return [];
}

export function scaleRange(question) {
  const min = question?.scale?.min === 1 ? 1 : 0;
  const rawMax = Number(question?.scale?.max);
  const max = Number.isInteger(rawMax) && rawMax >= 3 && rawMax <= 10 ? rawMax : 10;
  return { min, max: Math.max(max, min + 2) };
}

function questionMap(questions) {
  return new Map((questions || []).map(question => [question.id, question]));
}

/**
 * Pergunta condicional: aparece quando a resposta de outra pergunta de
 * escolha (anterior a ela) é um dos valores de showIf.values. Se a
 * pergunta de origem está escondida, esta também fica.
 */
export function isQuestionVisible(question, answers, byId = null, depth = 0) {
  const condition = question?.showIf;
  if (!condition?.questionId) return true;
  if (depth > 20) return false;
  const map = byId || null;
  const source = map?.get(condition.questionId);
  if (!source) return true;
  if (!isQuestionVisible(source, answers, map, depth + 1)) return false;
  const values = Array.isArray(condition.values) ? condition.values : [];
  const answer = answers?.[source.id];
  if (Array.isArray(answer)) return answer.some(value => values.includes(value));
  return typeof answer === 'string' && values.includes(answer);
}

export function visibleQuestions(questions, answers) {
  const byId = questionMap(questions);
  return (questions || []).filter(question => isQuestionVisible(question, answers, byId));
}

function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function isAnswered(question, answers) {
  const value = answers?.[question.id];
  switch (question.type) {
    case 'yes_no':
    case 'single':
      if (typeof value !== 'string' || !value) return false;
      if (value === OTHER_VALUE) return Boolean(String(answers?.[`${question.id}${OTHER_SUFFIX}`] || '').trim());
      return true;
    case 'multiple':
      if (!Array.isArray(value) || value.length === 0) return false;
      if (value.includes(OTHER_VALUE) && value.length === 1) {
        return Boolean(String(answers?.[`${question.id}${OTHER_SUFFIX}`] || '').trim());
      }
      return true;
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

/** Porcentagem respondida das perguntas que estão aparecendo. */
export function computeProgress(questions, answers) {
  const list = visibleQuestions(questions, answers).filter(isAnswerable);
  if (!list.length) return 0;
  const done = list.filter(question => isAnswered(question, answers)).length;
  return Math.round((done / list.length) * 100);
}

export function missingRequired(questions, answers) {
  return visibleQuestions(questions, answers)
    .filter(question => isAnswerable(question) && question.required && !isAnswered(question, answers));
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\r\n?/g, '\n').slice(0, max);
  return text.trim() ? text : null;
}

/**
 * Mantém só respostas de perguntas que existem e estão aparecendo, no
 * formato do tipo. É o que o servidor grava: escolha fora da lista,
 * texto além do limite e chave desconhecida ficam de fora.
 */
export function sanitizeAnswers(questions, rawAnswers) {
  const raw = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers) ? rawAnswers : {};
  const clean = {};
  const byId = questionMap(questions);

  for (const question of questions || []) {
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
          const other = cleanText(raw[otherKey], LIMITS.shortTextMax);
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
          const other = cleanText(raw[otherKey], LIMITS.shortTextMax);
          if (other) clean[otherKey] = other;
        }
        break;
      }
      case 'scale': {
        const { min, max } = scaleRange(question);
        if (Number.isInteger(value) && value >= min && value <= max) clean[question.id] = value;
        break;
      }
      case 'number':
        if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 1e9) clean[question.id] = value;
        break;
      case 'date':
        if (isIsoDate(value)) clean[question.id] = value;
        break;
      case 'short_text': {
        const text = cleanText(value, LIMITS.shortTextMax);
        if (text) clean[question.id] = text;
        break;
      }
      case 'long_text': {
        const text = cleanText(value, LIMITS.longTextMax);
        if (text) clean[question.id] = text;
        break;
      }
      default:
        break;
    }
  }

  // Resposta de pergunta que sumiu (o "Se sim, qual?" depois de mudar
  // para "Não") não vai para o banco nem para a planilha.
  for (const question of questions || []) {
    if (!isAnswerable(question) || isQuestionVisible(question, clean, byId)) continue;
    delete clean[question.id];
    delete clean[`${question.id}${OTHER_SUFFIX}`];
  }

  return clean;
}

/** Quebra o formulário em partes: cada "Nova parte" começa uma página. */
export function splitIntoPages(questions) {
  const pages = [];
  let current = { id: 'inicio', title: '', help: '', questions: [] };
  for (const question of questions || []) {
    if (question.type === 'section') {
      if (current.questions.length || current.title) pages.push(current);
      current = { id: question.id, title: question.label || '', help: question.help || '', questions: [] };
    } else {
      current.questions.push(question);
    }
  }
  if (current.questions.length || current.title || !pages.length) pages.push(current);
  return pages;
}

/** Quanto do formulário é de marcar (a meta da clínica é 80–90%). */
export function markingShare(questions) {
  const answerable = (questions || []).filter(isAnswerable);
  const marking = answerable.filter(question => QUESTION_TYPES.find(type => type.id === question.type)?.marking).length;
  return {
    marking,
    total: answerable.length,
    percent: answerable.length ? Math.round((marking / answerable.length) * 100) : 0,
  };
}

/**
 * Confere o formulário antes de salvar. Rascunho aceita pergunta sem
 * texto; publicar exige tudo pronto para o paciente.
 */
export function validateForm({ title, description, questions }, { forPublish = false } = {}) {
  const errors = [];
  const list = Array.isArray(questions) ? questions : [];
  if (!String(title || '').trim()) errors.push('Dê um nome ao formulário.');
  if (String(title || '').trim().length > LIMITS.titleMax) errors.push(`O nome tem mais de ${LIMITS.titleMax} letras.`);
  if (String(description || '').length > LIMITS.descriptionMax) errors.push(`As instruções têm mais de ${LIMITS.descriptionMax} letras.`);
  if (list.length > LIMITS.maxQuestions) errors.push(`No máximo ${LIMITS.maxQuestions} perguntas por formulário.`);

  const seen = new Map();
  list.forEach((question, index) => {
    const position = index + 1;
    if (!TYPE_IDS.has(question.type)) {
      errors.push(`Pergunta ${position}: tipo desconhecido.`);
      return;
    }
    if (String(question.label || '').length > LIMITS.labelMax) errors.push(`Pergunta ${position}: texto com mais de ${LIMITS.labelMax} letras.`);
    if (forPublish && isAnswerable(question) && !String(question.label || '').trim()) {
      errors.push(`Pergunta ${position}: escreva a pergunta.`);
    }
    if (question.type === 'single' || question.type === 'multiple') {
      const options = (question.options || []).map(option => String(option || '').trim()).filter(Boolean);
      if (forPublish && options.length < 2) errors.push(`Pergunta ${position}: precisa de pelo menos 2 opções.`);
      if (new Set(options.map(option => option.toLowerCase())).size !== options.length) {
        errors.push(`Pergunta ${position}: há opções repetidas.`);
      }
      if (options.length > LIMITS.maxOptions) errors.push(`Pergunta ${position}: no máximo ${LIMITS.maxOptions} opções.`);
    }
    if (question.showIf?.questionId) {
      const source = seen.get(question.showIf.questionId);
      if (!source) {
        errors.push(`Pergunta ${position}: a condição precisa apontar para uma pergunta de escolha que vem antes.`);
      } else if (!(question.showIf.values || []).length) {
        errors.push(`Pergunta ${position}: marque em qual resposta ela aparece.`);
      } else if ((question.showIf.values || []).some(value => !optionsOf(source).includes(value))) {
        errors.push(`Pergunta ${position}: a condição usa uma opção que não existe mais.`);
      }
    }
    if (isChoice(question)) seen.set(question.id, question);
  });

  if (forPublish && !list.some(isAnswerable)) errors.push('Coloque pelo menos uma pergunta.');
  return errors;
}

/** Limpa o rascunho do editor para gravar (textos aparados, opções vazias fora). */
export function normalizeQuestions(questions) {
  return (questions || []).map(question => {
    const base = {
      id: question.id,
      type: question.type,
      label: String(question.label || '').trim().slice(0, LIMITS.labelMax),
      help: String(question.help || '').trim().slice(0, LIMITS.helpMax),
    };
    if (question.type === 'section') return base;
    const next = { ...base, required: Boolean(question.required) };
    if (question.showIf?.questionId && (question.showIf.values || []).length) {
      next.showIf = { questionId: question.showIf.questionId, values: [...question.showIf.values] };
    }
    if (question.type === 'single' || question.type === 'multiple') {
      next.options = (question.options || [])
        .map(option => String(option || '').trim().slice(0, LIMITS.optionMax))
        .filter(Boolean)
        .slice(0, LIMITS.maxOptions);
      next.allowOther = Boolean(question.allowOther);
    }
    if (question.type === 'yes_no') next.allowUnknown = Boolean(question.allowUnknown);
    if (question.type === 'scale') {
      const { min, max } = scaleRange(question);
      next.scale = {
        min,
        max,
        minLabel: String(question.scale?.minLabel || '').trim().slice(0, 40),
        maxLabel: String(question.scale?.maxLabel || '').trim().slice(0, 40),
      };
    }
    return next;
  });
}

/** Perguntas de escolha que vêm antes da posição (para a condição). */
export function conditionSources(questions, index) {
  return (questions || []).slice(0, index).filter(isChoice);
}

// ---------- leitura das respostas ----------

function formatIsoDate(value) {
  if (!isIsoDate(value)) return '';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** Resposta em texto, para a tela da administração, o Word e a planilha. */
export function formatAnswer(question, answers) {
  if (!isAnswerable(question) || !isAnswered(question, answers)) return '';
  const value = answers[question.id];
  const other = String(answers[`${question.id}${OTHER_SUFFIX}`] || '').trim();
  switch (question.type) {
    case 'yes_no':
    case 'single':
      return value === OTHER_VALUE ? `${OTHER_LABEL}: ${other}` : value;
    case 'multiple':
      return value.map(item => (item === OTHER_VALUE ? `${OTHER_LABEL}: ${other}` : item)).join('; ');
    case 'scale': {
      const { max } = scaleRange(question);
      return `${value} de ${max}`;
    }
    case 'number':
      return value.toLocaleString('pt-BR');
    case 'date':
      return formatIsoDate(value);
    default:
      return String(value);
  }
}

// ---------- envios ----------

function todayIso(now = new Date()) {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Situação de um envio, já com "Atrasado" quando passou do prazo. */
export function assignmentStatus(assignment, now = new Date()) {
  const status = assignment?.status;
  if (status === 'submitted') return { id: 'submitted', label: 'Respondido', tone: 'success' };
  if (status === 'cancelled') return { id: 'cancelled', label: 'Cancelado', tone: 'neutral' };
  const late = Boolean(assignment?.due_date) && assignment.due_date < todayIso(now);
  if (late) return { id: 'late', label: 'Atrasado', tone: 'warning' };
  if (status === 'in_progress') {
    return { id: 'in_progress', label: `Respondendo · ${assignment.progress || 0}%`, tone: 'pending' };
  }
  return { id: 'pending', label: 'Aguardando', tone: 'pending' };
}

export function formatDueDate(iso) {
  return iso ? formatIsoDate(iso) : '';
}

export function minDueDate(now = new Date()) {
  return todayIso(now);
}

// ---------- acesso ----------

export function accessStatus(access) {
  if (!access) return { id: 'none', label: 'Sem acesso', tone: 'neutral' };
  if (access.locked_at) return { id: 'locked', label: 'Bloqueado por tentativas', tone: 'warning' };
  if (!access.is_active) return { id: 'inactive', label: 'Desativado', tone: 'neutral' };
  return { id: 'active', label: 'Ativo', tone: 'success' };
}

const CODE_ALPHABET = /[^2-9A-HJ-NP-Z]/g;

/** O que a pessoa digita vira XXX-XXX (só os símbolos que o código usa). */
export function formatAccessCodeInput(raw) {
  const clean = String(raw || '').toUpperCase().replace(CODE_ALPHABET, '').slice(0, 6);
  return clean.length > 3 ? `${clean.slice(0, 3)}-${clean.slice(3)}` : clean;
}

export function isCompleteAccessCode(code) {
  return /^[2-9A-HJ-NP-Z]{3}-[2-9A-HJ-NP-Z]{3}$/.test(String(code || ''));
}

/** "DD/MM/AAAA" enquanto digita, com as barras no lugar. */
export function formatBirthInput(raw) {
  const digits = String(raw || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** "DD/MM/AAAA" → "AAAA-MM-DD", ou null se não for uma data real. */
export function parseBirthInput(text, now = new Date()) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || ''));
  if (!match) return null;
  const iso = `${match[3]}-${match[2]}-${match[1]}`;
  const year = Number(match[3]);
  if (!isIsoDate(iso) || year < 1900 || iso > todayIso(now)) return null;
  return iso;
}

export const PORTAL_PATH = '/area-do-paciente';

export function buildPortalLink(origin, code) {
  return `${String(origin || '').replace(/\/$/, '')}${PORTAL_PATH}?codigo=${encodeURIComponent(code || '')}`;
}

export function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

/** Mensagem pronta para o WhatsApp, com ou sem formulário novo. */
export function buildPortalMessage({ patientName, clinicName, code, link, formTitle = '', dueDate = '' }) {
  const greeting = firstName(patientName) ? `Olá, ${firstName(patientName)}!` : 'Olá!';
  const who = clinicName || 'A clínica';
  const lines = [];
  if (formTitle) {
    const deadline = dueDate ? ` até ${formatIsoDate(dueDate)}` : '';
    lines.push(`${greeting} ${who} enviou o formulário "${formTitle}" para você responder pelo celular${deadline}.`);
  } else {
    lines.push(`${greeting} Este é o seu acesso à Área do Paciente de ${who}.`);
  }
  lines.push('');
  lines.push(`Acesse: ${link}`);
  lines.push('Para entrar, use a sua data de nascimento.');
  lines.push('');
  lines.push(`Se pedir o código de acesso, ele é ${code}.`);
  return lines.join('\n');
}

// ---------- planilha ----------

/**
 * Colunas da planilha quando o formulário mudou entre um envio e outro:
 * todas as perguntas que já existiram, na ordem do envio mais recente e
 * as que saíram depois no fim (cada envio guarda a própria cópia).
 */
export function mergeQuestionColumns(questionLists) {
  const seen = new Set();
  const merged = [];
  for (const list of questionLists || []) {
    for (const question of list || []) {
      if (!isAnswerable(question) || seen.has(question.id)) continue;
      seen.add(question.id);
      merged.push(question);
    }
  }
  return merged;
}

// Texto que começa com = + - @ vira fórmula no Excel; o apóstrofo
// impede isso (resposta digitada pelo paciente não executa nada).
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Planilha de um formulário: uma linha por paciente, uma coluna por
 * pergunta. Separador ";" e BOM para o Excel em português abrir certo.
 */
const BOM = String.fromCharCode(0xfeff);

export function buildResponsesCsv(questions, rows) {
  const answerable = (questions || []).filter(isAnswerable);
  const header = ['Paciente', 'Enviado em', 'Respondido em', ...answerable.map(question => question.label || 'Pergunta sem texto')];
  const lines = [header.map(csvCell).join(';')];
  for (const row of rows || []) {
    lines.push([
      row.patientName,
      row.sentAt ? new Date(row.sentAt).toLocaleDateString('pt-BR') : '',
      row.submittedAt ? new Date(row.submittedAt).toLocaleDateString('pt-BR') : '',
      ...answerable.map(question => formatAnswer(question, row.answers || {})),
    ].map(csvCell).join(';'));
  }
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

export function safeFileName(text) {
  return String(text || 'formulario')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60) || 'formulario';
}
