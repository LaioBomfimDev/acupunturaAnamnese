// ============================================================
// Entrevistas clínicas: regras puras da tela (sem React, sem banco).
//
// A pergunta e a resposta seguem o motor dos formulários
// (utils/patientForms.js): a entrevista guarda a cópia das perguntas que
// a pessoa viu, e tudo aqui lê dessa cópia — nunca do catálogo atual.
// Sem nota: o destaque de "Frequentemente/Quase sempre" só ajuda a
// leitura, não soma nem classifica.
// ============================================================

import {
  INTERVIEW_FREQUENT_ANSWERS,
  INTERVIEW_UNKNOWN_ANSWERS,
} from '../data/clinicalInterviews.js';
import { firstName, formatAnswer, isAnswerable, isQuestionVisible } from './patientForms.js';

export const INTERVIEW_LINK_PATH = '/entrevista';
export const LINK_VALIDITY_OPTIONS = [7, 15, 30];
export const DEFAULT_LINK_VALIDITY = 15;
const TOKEN_PATTERN = /^[0-9a-f]{48}$/;

// O token vai depois do "#": o navegador não manda essa parte ao
// servidor nem a repassa como origem a outros sites.
export function interviewLinkUrl(origin, token) {
  return `${String(origin || '').replace(/\/$/, '')}${INTERVIEW_LINK_PATH}#${token}`;
}

export function tokenFromHash(hash) {
  const token = String(hash || '').replace(/^#/, '').trim().toLowerCase();
  return TOKEN_PATTERN.test(token) ? token : '';
}

/** Mensagem pronta para o WhatsApp: sem o nome do paciente nem o assunto. */
export function buildInterviewLinkMessage({ recipientLabel, clinicName, link }) {
  const who = clinicName || 'A clínica';
  const greeting = recipientLabel ? `Olá, ${firstName(recipientLabel)}!` : 'Olá!';
  return [
    `${greeting} ${who} pediu que você responda uma entrevista pelo celular.`,
    'Leva uns 15 minutos e as respostas são salvas sozinhas: dá para parar e continuar depois.',
    '',
    `Acesse: ${link}`,
  ].join('\n');
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function whatsappShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Situação de uma entrevista na lista. */
export function interviewState(response, now = new Date()) {
  if (!response) return { key: 'unknown', label: '', tone: 'neutral' };
  if (response.voidedAt) return { key: 'voided', label: 'Anulada', tone: 'neutral' };
  if (response.status === 'submitted') return { key: 'answered', label: 'Respondida', tone: 'success' };
  if (response.status === 'cancelled') return { key: 'cancelled', label: 'Link cancelado', tone: 'neutral' };
  if (response.linkExpiresAt && new Date(response.linkExpiresAt) <= now) {
    return { key: 'expired', label: 'Link vencido', tone: 'warning' };
  }
  if (response.status === 'in_progress') {
    return { key: 'in_progress', label: `Respondendo · ${response.progress || 0}%`, tone: 'info' };
  }
  return { key: 'waiting', label: 'Esperando resposta', tone: 'info' };
}

export function isOpenLink(response, now = new Date()) {
  const key = interviewState(response, now).key;
  return response?.channel === 'link' && (key === 'waiting' || key === 'in_progress');
}

/** Quem respondeu: a identificação da própria resposta, ou para quem foi o link. */
export function respondentOf(response) {
  const answers = response?.answers || {};
  const name = String(answers.informante || '').trim();
  const relation = String(answers.vinculo || '').trim();
  const coexistence = String(answers.convivencia || '').trim();
  return {
    name: name || response?.recipientLabel || '',
    relation,
    coexistence,
    recipientLabel: response?.recipientLabel || '',
  };
}

export function respondentLine(response) {
  const person = respondentOf(response);
  if (person.name && person.relation) return `${person.name} (${person.relation})`;
  return person.name || person.relation || (response?.channel === 'consultorio' ? 'Respondida no consultório' : '');
}

function answerTone(question, value) {
  if (!value) return 'empty';
  if (question.type !== 'single') return 'text';
  if (INTERVIEW_FREQUENT_ANSWERS.includes(value)) return 'frequent';
  if (INTERVIEW_UNKNOWN_ANSWERS.includes(value)) return 'unknown';
  return 'plain';
}

/**
 * Linhas na ordem da entrevista: cada parte vira título, perguntas
 * escondidas saem, perguntas do roteiro levam o número dele. A
 * identificação (quem respondeu) fica fora: ela vai no cabeçalho.
 */
export function buildInterviewRows(questions, answers, { skipIds = ['informante', 'vinculo', 'convivencia'] } = {}) {
  const list = Array.isArray(questions) ? questions : [];
  const byId = new Map(list.map(question => [question.id, question]));
  const rows = [];
  for (const question of list) {
    if (question.type === 'section') {
      rows.push({ kind: 'section', id: question.id, label: question.label || 'Parte', help: question.help || '' });
      continue;
    }
    if (skipIds.includes(question.id)) continue;
    if (!isAnswerable(question) || !isQuestionVisible(question, answers, byId)) continue;
    const value = formatAnswer(question, answers || {});
    rows.push({
      kind: 'answer',
      id: question.id,
      number: question.unnumbered ? null : question.number || null,
      label: question.label || 'Pergunta sem texto',
      value,
      tone: answerTone(question, value),
      long: question.type === 'long_text',
    });
  }
  // Parte que ficou sem pergunta (a identificação, por exemplo) não aparece.
  return rows.filter((row, index) => row.kind !== 'section' || rows[index + 1]?.kind === 'answer');
}

export function answeredSummary(rows) {
  const answers = rows.filter(row => row.kind === 'answer' && row.number);
  const answered = answers.filter(row => row.value).length;
  return { answered, total: answers.length, label: `${answered} de ${plural(answers.length, 'pergunta', 'perguntas')}` };
}

/** Idade em anos completos numa data (para o cabeçalho da entrevista). */
export function ageAt(birthDate, isoDate) {
  if (!birthDate) return null;
  const birth = new Date(`${String(birthDate).slice(0, 10)}T12:00:00`);
  const at = isoDate ? new Date(isoDate) : new Date();
  if (Number.isNaN(birth.getTime()) || Number.isNaN(at.getTime())) return null;
  let years = at.getFullYear() - birth.getFullYear();
  const beforeBirthday = at.getMonth() < birth.getMonth()
    || (at.getMonth() === birth.getMonth() && at.getDate() < birth.getDate());
  if (beforeBirthday) years -= 1;
  return years >= 0 ? years : null;
}

export function formatInterviewDate(iso) {
  return iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
}

export function channelLabel(response) {
  return response?.channel === 'link' ? 'Pelo link' : 'No consultório';
}

function responseTime(response) {
  return new Date(response?.submittedAt || response?.createdAt || 0).getTime() || 0;
}

/** Mais recente primeiro: respondida pela data da resposta, link pela data do envio. */
export function sortInterviewResponses(responses) {
  return [...(responses || [])].sort((a, b) => responseTime(b) - responseTime(a));
}

/** Resumo do cartão fechado: quantas respostas e quantos links abertos. */
export function interviewCardSummary(responses, now = new Date()) {
  const valid = sortInterviewResponses(responses).filter(item => item.status === 'submitted' && !item.voidedAt);
  const open = (responses || []).filter(item => isOpenLink(item, now));
  const parts = [];
  parts.push(valid.length ? plural(valid.length, 'resposta', 'respostas') : 'Nenhuma resposta ainda');
  if (open.length) parts.push(plural(open.length, 'link aberto', 'links abertos'));
  return { answered: valid.length, open: open.length, label: parts.join(' · '), last: valid[0] || null };
}
