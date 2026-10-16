// ============================================================
// Anamnese respondida em casa → ficha da profissional
//
// Regras puras (sem React, sem banco), testadas em
// tests/regression/home-anamnese.test.mjs. Nada entra na ficha sozinho:
// cada função aqui só roda quando a profissional clica para trazer.
//
//  * Campo vazio na ficha: recebe a resposta como está e, na anamnese
//    infantil, quem respondeu em casa vira o informante do campo.
//  * Campo já escrito: a resposta entra no fim, depois de uma linha em
//    branco e de "Respondido em casa (quem respondeu):", sem apagar nada.
//  * Trazer de novo a mesma resposta não repete o texto.
// ============================================================

import { PSYCHOLOGY_INFORMANT_OPTIONS } from '../data/psychologyIntakeProfiles.js';
import {
  HOME_INFORMANT_NAME_QUESTION_ID,
  HOME_INFORMANT_QUESTION_ID,
} from '../data/homeAnamneses.js';

const OPEN_STATUSES = ['pending', 'in_progress'];

function byNewest(dateKey) {
  return (a, b) => String(b[dateKey] || '').localeCompare(String(a[dateKey] || ''));
}

export function requestsOfAnamnese(requests, anamneseId) {
  return (requests || [])
    .filter(request => request.anamneseId === anamneseId)
    .sort(byNewest('sentAt'));
}

export function openHomeRequest(requests) {
  return (requests || []).find(request => OPEN_STATUSES.includes(request.status)) || null;
}

/** Respondidas, da mais nova para a mais antiga. */
export function answeredHomeRequests(requests) {
  return (requests || [])
    .filter(request => request.status === 'submitted' && request.answers)
    .sort(byNewest('submittedAt'));
}

export function homeRequestStatusLabel(request) {
  switch (request?.status) {
    case 'pending': return 'esperando o paciente abrir';
    case 'in_progress': return `sendo respondida (${request.progress || 0}%)`;
    case 'submitted': return 'respondida';
    case 'cancelled': return 'cancelada';
    default: return '';
  }
}

export function formatHomeDate(iso) {
  if (!iso) return '';
  const date = new Date(String(iso).length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

/** Quem respondeu em casa (só a anamnese infantil pergunta). */
export function homeInformantOf(request) {
  const label = String(request?.answers?.[HOME_INFORMANT_QUESTION_ID] || '').trim();
  if (!label) return null;
  const option = PSYCHOLOGY_INFORMANT_OPTIONS.find(item => item.label === label);
  return {
    type: option?.id || 'outro',
    label,
    name: String(request?.answers?.[HOME_INFORMANT_NAME_QUESTION_ID] || '').trim(),
  };
}

function informantText(informant) {
  if (!informant) return '';
  return informant.name ? `${informant.label} · ${informant.name}` : informant.label;
}

/** Respostas de texto da anamnese de casa, por id de campo da ficha. */
export function homeAnswersByField(request) {
  const answers = request?.answers || {};
  const map = {};
  for (const question of request?.questions || []) {
    if (question.type !== 'long_text') continue;
    const text = typeof answers[question.id] === 'string' ? answers[question.id].trim() : '';
    if (text) map[question.id] = text;
  }
  return map;
}

function alreadyInField(session, request, fieldId, text) {
  const imported = session?.homeImports?.[request.id]?.fields || [];
  if (imported.includes(fieldId)) return true;
  return String(session?.fields?.[fieldId] || '').includes(text);
}

/**
 * Por campo: a resposta de casa ainda não trazida para a ficha, com o
 * que a tela precisa para mostrá-la junto do campo.
 */
export function pendingHomeAnswers(session, request) {
  if (!request) return {};
  const informant = homeInformantOf(request);
  const result = {};
  for (const [fieldId, text] of Object.entries(homeAnswersByField(request))) {
    if (alreadyInField(session, request, fieldId, text)) continue;
    result[fieldId] = {
      requestId: request.id,
      text,
      submittedAt: request.submittedAt,
      informantLabel: informantText(informant),
      fieldEmpty: !String(session?.fields?.[fieldId] || '').trim(),
    };
  }
  return result;
}

/** Campos vazios na ficha que têm resposta de casa esperando. */
export function emptyFieldsWithHomeAnswer(session, request) {
  return Object.entries(pendingHomeAnswers(session, request))
    .filter(([, item]) => item.fieldEmpty)
    .map(([fieldId]) => fieldId);
}

/** Traz uma resposta de casa para o campo da ficha (ver regras no topo). */
export function applyHomeAnswer(session, request, fieldId, now = new Date().toISOString()) {
  const text = homeAnswersByField(request)[fieldId];
  if (!text || alreadyInField(session, request, fieldId, text)) return session;

  const informant = homeInformantOf(request);
  const current = String(session.fields?.[fieldId] || '');
  const fieldEmpty = !current.trim();
  const who = informantText(informant);
  const nextValue = fieldEmpty
    ? text
    : `${current.replace(/\s+$/, '')}\n\nRespondido em casa${who ? ` (${who})` : ''}: ${text}`;

  const previous = session.homeImports?.[request.id] || { fields: [] };
  return {
    ...session,
    fields: { ...session.fields, [fieldId]: nextValue },
    // Campo que nasce da resposta de casa leva quem respondeu como autor.
    fieldInformants: fieldEmpty && informant
      ? { ...session.fieldInformants, [fieldId]: { type: informant.type, name: informant.name } }
      : session.fieldInformants,
    homeImports: {
      ...session.homeImports,
      [request.id]: {
        at: now,
        submittedAt: request.submittedAt || null,
        fields: [...new Set([...(previous.fields || []), fieldId])],
      },
    },
  };
}

export function applyHomeAnswers(session, request, fieldIds, now = new Date().toISOString()) {
  return (fieldIds || []).reduce((next, fieldId) => applyHomeAnswer(next, request, fieldId, now), session);
}
