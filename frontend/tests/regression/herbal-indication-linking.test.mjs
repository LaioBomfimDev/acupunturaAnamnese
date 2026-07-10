import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  HERBAL_THEMES,
  HERBAL_LINK_DISCLAIMER,
  HERBAL_CATALOG_THEMED,
  getHerbThemes,
  getSymptomThemes,
  linkHerbsToSymptoms,
} from '../../src/knowledge/herbalIndicationLinking.js';
import { HERBAL_CATALOG } from '../../src/knowledge/generated/herbalCatalog.js';

test('catálogo tem 20 ervas e NENHUMA associação MTC (paradigma próprio)', () => {
  assert.equal(HERBAL_CATALOG.length, 20);
  for (const h of HERBAL_CATALOG) {
    assert.equal(h.mtcAvailable, false, `${h.commonName}: não pode ter associação MTC`);
    assert.equal(h.contentReleaseStatus, 'source_only', `${h.commonName}: catálogo não publica paciente`);
    assert.equal(h.publicationStatus, 'not_published', `${h.commonName}: sem etapa de publicação`);
    assert.equal(h.approvalMode, 'local_only', `${h.commonName}: somente local`);
    assert.equal(h.requiresProfessionalAudit, true, `${h.commonName}: exige auditoria profissional`);
    assert.ok(!('energy' in h) && !('organs' in h), `${h.commonName}: erva não deve carregar eixo MTC`);
  }
});

test('temas de cada erva saem do resumo curado (ex.: alcachofra = digestivo + hepático)', () => {
  const alcachofra = HERBAL_CATALOG_THEMED.find(h => h.commonName === 'ALCACHOFRA');
  assert.ok(alcachofra.themes.includes('digestivo'));
  assert.ok(alcachofra.themes.includes('hepatico_biliar'));
  const camomila = HERBAL_CATALOG_THEMED.find(h => h.commonName === 'CAMOMILA');
  assert.ok(camomila.themes.includes('digestivo'));
  assert.ok(camomila.themes.includes('calmante_sono'));
  // Toda erva liberada deveria casar ao menos um tema (senão nunca aparece).
  for (const h of HERBAL_CATALOG_THEMED) {
    assert.ok(h.themes.length > 0, `${h.commonName}: nenhum tema derivado do resumo`);
  }
});

test('queixa do paciente vira temas (digestivo, calmante…)', () => {
  assert.deepEqual(getSymptomThemes('paciente com azia e má digestão').sort(), ['digestivo']);
  assert.ok(getSymptomThemes('ansiedade e insônia').includes('calmante_sono'));
  assert.deepEqual(getSymptomThemes('dor no joelho'), []); // sem tema fitoterápico
});

test('ligação por tema não publica propostas do worksheet por padrão', () => {
  const res = linkHerbsToSymptoms('empachamento e náusea após comer');
  assert.ok(res.hasInput);
  assert.ok(res.patientThemes.some(t => t.id === 'digestivo'));
  assert.equal(res.matched.length, 0);
});

test('ligação por tema só traz ervas quando há resolvedor explícito de status', () => {
  const res = linkHerbsToSymptoms('empachamento e náusea após comer', {
    resolveStatus: herb => herb.worksheetSuggestedStatus,
  });
  assert.ok(res.matched.length > 0);
  for (const herb of res.matched) {
    assert.ok(herb.matchedThemes.length > 0, `${herb.commonName} sem tema casado`);
    assert.ok('caution' in herb, `${herb.commonName} sem cautela`);
    assert.match(herb.evidence, /tradicional|popular/i);
  }
});

test('GATE de status com resolvedor explícito mantém restrito fora do nível educativo', () => {
  // "úlceras/gastrite" casa espinheira-santa (restrito) e também digestivo.
  const res = linkHerbsToSymptoms('gastrite e queixas gástricas', {
    resolveStatus: herb => herb.worksheetSuggestedStatus,
  });
  const nomes = res.matched.map(h => h.commonName);
  assert.ok(!nomes.includes('ESPINHEIRA-SANTA'), 'restrito não pode sair no ao-vivo por padrão');
  for (const h of res.matched) assert.equal(h.status, 'educativo_aprovado');

  // Com minStatus reduzido, a restrito passa a aparecer (uso da profissional).
  const comRestrito = linkHerbsToSymptoms('gastrite e queixas gástricas', {
    minStatus: 'restrito_profissional',
    resolveStatus: herb => herb.worksheetSuggestedStatus,
  });
  assert.ok(comRestrito.matched.some(h => h.commonName === 'ESPINHEIRA-SANTA'));
});

test('SEM tema não sugere nada (não força indicação)', () => {
  const res = linkHerbsToSymptoms('dor lombar e formigamento no pé');
  assert.equal(res.matched.length, 0);
  assert.equal(res.patientThemes.length, 0);
  assert.equal(res.disclaimer, HERBAL_LINK_DISCLAIMER);
});

test('temas NUNCA são nomes de doença crus (sem hepatite/nefrite/úlcera como tema)', () => {
  const labels = Object.values(HERBAL_THEMES).map(t => t.label.toLowerCase()).join(' ');
  for (const doenca of ['hepatite', 'nefrite', 'ulcera', 'gastrite', 'prostatite', 'cancer']) {
    assert.ok(!labels.includes(doenca), `tema não pode ser nome de doença: ${doenca}`);
  }
});

test('isBlocked remove erva bloqueada por risco', () => {
  const base = linkHerbsToSymptoms('má digestão', {
    resolveStatus: herb => herb.worksheetSuggestedStatus,
  });
  const alvo = base.matched[0].id;
  const filtrado = linkHerbsToSymptoms('má digestão', {
    resolveStatus: herb => herb.worksheetSuggestedStatus,
    isBlocked: id => id === alvo,
  });
  assert.ok(!filtrado.matched.some(h => h.id === alvo));
});

test('resolveStatus permite curadoria real sobrepor a proposta do worksheet', () => {
  // Rebaixa TODAS a curadoria_tecnica → nada atinge educativo_aprovado.
  const res = linkHerbsToSymptoms('má digestão', { resolveStatus: () => 'curadoria_tecnica' });
  assert.equal(res.matched.length, 0);
});
