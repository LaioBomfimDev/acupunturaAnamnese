import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  ANAMNESE_KNOWLEDGE_DECISIONS_KEY,
  buildApprovedKnowledgeEnvelope,
  buildPatternNormalizationMap,
  getLocalAnamneseKnowledgeDecisions,
  materializeKnowledgeCandidates,
  saveLocalAnamneseKnowledgeDecision,
  validateAnamneseKnowledgeApproval,
} from '../../src/knowledge/anamneseKnowledgeCuration.js';

function withLocalStorage(fn) {
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage');
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map();

  globalThis.localStorage = {
    getItem: key => store.get(key) || null,
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key),
  };

  try {
    return fn(store);
  } finally {
    if (hadLocalStorage) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
}

const finding = {
  id: 'finding:lingua:teste',
  status: 'review',
  type: 'finding',
  domain: 'lingua',
  checklistGroup: 'lingua',
  label: 'Saburra amarela espessa',
  aliases: ['saburra amarela'],
  patternLinks: [
    {
      pattern: 'Umidade-calor no sangue',
      weight: 3,
      polarity: '+',
      evidence: 'Diagnóstico: retenção de umidade-calor no sangue.',
    },
    {
      pattern: 'Língua em paciente normal',
      weight: 3,
      polarity: '+',
      evidence: 'Diagnóstico: língua em paciente normal.',
    },
  ],
  source: {
    key: 'semiologia-da-lingua-completo',
    title: 'Semiologia da Lingua (Completo)',
    pdfPage: 40,
    imageUrl: '/knowledge/source-assets/pdf-sources/semiologia-da-lingua-completo/pages/page-040.webp',
    snippet: 'Saburra amarela espessa indica umidade-calor.',
  },
};

test('curadoria da anamnese reflowa sem colunas mínimas que criem rolagem horizontal', () => {
  const css = readFileSync(new URL('../../src/App.css', import.meta.url), 'utf8');

  assert.match(
    css,
    /\.anamnese-knowledge-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(280px, 360px\) minmax\(0, 1fr\);/,
  );
  assert.match(
    css,
    /\.anamnese-review-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
  );
  assert.match(css, /@container anamnese-detail \(min-width: 940px\)/);
});

test('normalizacao mapeia rawPattern para canônico, preservando frase original', () => {
  const map = buildPatternNormalizationMap({
    findings: [finding],
    patterns: [
      { id: 'pattern:a-seguir', pattern: 'A seguir' },
      { id: 'pattern:abscesso-1', pattern: 'Abscesso intestinais' },
      { id: 'pattern:abscesso-2', pattern: 'Abscessos intestinais' },
    ],
    knownPatternNames: ['Umidade-Calor', 'Deficiência de Qi do Baço'],
  });

  const umidade = map.byRawPattern['Umidade-calor no sangue'];
  const normal = map.byRawPattern['Língua em paciente normal'];
  const seguir = map.byRawPattern['A seguir'];
  const abscessoA = map.byRawPattern['Abscesso intestinais'];
  const abscessoB = map.byRawPattern['Abscessos intestinais'];

  assert.equal(umidade.canonicalPattern, 'Umidade-Calor');
  assert.equal(umidade.sourceLabel, 'Umidade-calor no sangue');
  assert.equal(umidade.status, 'mapped_canonical');
  assert.equal(normal.hidden, true);
  assert.match(normal.reason, /ruído/i);
  assert.equal(seguir.hidden, true);
  assert.equal(abscessoA.groupKey, abscessoB.groupKey);
  assert.equal(abscessoA.status, 'hidden_noise');
});

test('decisoes locais guardam só edição por id; envelope materializado preserva fonte', () => withLocalStorage(store => {
  const map = buildPatternNormalizationMap({
    findings: [finding],
    patterns: [],
    knownPatternNames: ['Umidade-Calor'],
  });
  const [candidate] = materializeKnowledgeCandidates({
    findings: [finding],
    normalizationMap: map,
  });
  const edited = {
    ...candidate,
    label: 'Saburra amarela espessa',
    patternLinks: candidate.patternLinks.filter(link => !link.hiddenByNormalization),
  };

  const validation = validateAnamneseKnowledgeApproval(edited, { validPatterns: ['Umidade-Calor'] });
  assert.equal(validation.ok, true);

  const decision = saveLocalAnamneseKnowledgeDecision({
    candidateId: edited.candidateId,
    type: edited.type,
    status: 'approved_local',
    edits: {
      label: edited.label,
      aliases: edited.aliases,
      checklistGroup: edited.checklistGroup,
      patternLinks: edited.patternLinks,
    },
    approvedByRole: 'super_admin',
    approvedByLabel: 'SuperAdm',
    approvedAt: '2026-06-16T20:00:00.000Z',
  });

  const stored = store.get(ANAMNESE_KNOWLEDGE_DECISIONS_KEY);
  assert.ok(stored);
  assert.doesNotMatch(stored, /Semiologia da Lingua/);
  assert.doesNotMatch(stored, /source-assets/);
  assert.equal(getLocalAnamneseKnowledgeDecisions().length, 1);

  const envelope = buildApprovedKnowledgeEnvelope({
    candidates: [candidate],
    decisions: [decision],
  });

  assert.equal(envelope.counts.approvedLocal, 1);
  assert.equal(envelope.items[0].status, 'approved_local');
  assert.equal(envelope.items[0].source.key, 'semiologia-da-lingua-completo');
  assert.equal(envelope.items[0].patternLinks[0].rawPattern, 'Umidade-calor no sangue');
}));
