// ============================================================
// Assistente: o que ela sabe sobre o sistema (30/10/2026).
//
// A base é a mesma do botão "Como funciona" (data/screenHelp.js), escrita
// a partir dos rótulos reais das telas. Aqui ela vira uma lista plana de
// tópicos ("Financeiro → A receber", "Agenda → Feriados"…), que a Edge
// Function clinic-assistant recebe pronta pelo espelho gerado por
// scripts/sync-assistant-help.mjs. Mudou um texto de ajuda: rode o script
// (tests/regression/clinic-assistant.test.mjs falha se ficar diferente).
// ============================================================

import * as SCREEN_HELP from '../data/screenHelp.js';
import { CLINICAL_INSTRUMENTS, INSTRUMENT_REVIEW_STATUS } from '../data/clinicalInstruments.js';

// Onde cada grupo de ajuda mora no sistema. Grupo novo em screenHelp.js
// entra aqui, senão o teste avisa.
export const HELP_GROUP_PLACES = {
  HOME_HELP: 'Tela inicial',
  AGENDA_HELP: 'Agenda',
  EVOLUCOES_HELP: 'Evoluções',
  EVOLUCOES_REVIEW_HELP: 'Evoluções',
  PACIENTES_HELP: 'Pacientes da instituição',
  ESCALAS_HELP: 'Escalas',
  ENTREVISTAS_HELP: 'Psicologia',
  SALA_ONLINE_HELP: 'Sala online',
  GESTAO_HELP: 'Gestão',
  GESTAO_PROFISSIONAL_HELP: 'Gestão pessoal',
  FINANCEIRO_HELP: 'Financeiro',
  WHATSAPP_HELP: 'WhatsApp',
  ABA_HELP: 'ABA',
};

// A tela inicial tem uma leitura por perfil, todas com o mesmo título.
const VARIANT_LABELS = {
  admin: 'administração',
  'admin-professional': 'administração que também atende',
  professional: 'quem atende',
  reception: 'recepção',
};

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return value ? [String(value)] : [];
}

function topicText(topic) {
  return SCREEN_HELP.HELP_SECTIONS
    .map(({ key, title }) => {
      const lines = asList(topic[key]);
      return lines.length ? `${title}: ${lines.join(' ')}` : '';
    })
    .filter(Boolean)
    .join('\n');
}

/** Todos os tópicos de ajuda, na ordem dos grupos, sem repetir texto. */
export function buildAssistantHelpTopics() {
  const topics = [];
  const seen = new Set();
  for (const [group, place] of Object.entries(HELP_GROUP_PLACES)) {
    const value = SCREEN_HELP[group];
    if (!value) continue;
    const entries = value.title ? [[null, value]] : Object.entries(value);
    for (const [variant, topic] of entries) {
      if (!topic?.title) continue;
      const text = topicText(topic);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      const title = topic.title !== place
        ? `${place} → ${topic.title}`
        : variant ? `${place} (${VARIANT_LABELS[variant] || variant})` : place;
      topics.push({ id: variant ? `${group}.${variant}` : group, title, text });
    }
  }
  return topics;
}

function bandsText(instrument) {
  if (instrument.noBands) return 'sem ponto de corte: mostra só a nota';
  if (instrument.scoring?.method === 'subscales' || instrument.scoring?.method === 'subscale_means') {
    const subscales = instrument.scoring.subscales || [];
    const names = subscales.map(sub => sub.label || sub.name || sub.id).filter(Boolean);
    return names.length ? `notas por subescala: ${names.join(', ')}` : 'notas por subescala';
  }
  const bands = instrument.bands || [];
  return bands.map(band => `${band.label} ${band.min}–${band.max}`).join('; ');
}

/**
 * Catálogo das escalas do sistema para a assistente (01/11/2026): o que
 * cada uma mede, para quem, tamanho, faixas, quando reaplicar e se a
 * psicóloga já conferiu. Sai de data/clinicalInstruments.js, a mesma
 * fonte da tela; nunca traz resultado de paciente.
 */
export function buildAssistantScaleCatalog() {
  return CLINICAL_INSTRUMENTS.map(instrument => ({
    sigla: instrument.shortName,
    nome: instrument.name,
    mede: instrument.measures || '',
    publico: instrument.population || '',
    perguntas: (instrument.items || []).length,
    minutos: instrument.minutes ?? null,
    reaplicarDias: instrument.reapplyAfterDays ?? null,
    faixas: bandsText(instrument),
    areas: instrument.disciplines || [],
    conferida: instrument.review?.status !== INSTRUMENT_REVIEW_STATUS.PENDING,
  }));
}

/** Grupos de ajuda exportados que ainda não têm lugar na lista acima. */
export function unplacedHelpGroups() {
  return Object.keys(SCREEN_HELP)
    .filter(name => name.endsWith('_HELP') && !(name in HELP_GROUP_PLACES));
}
