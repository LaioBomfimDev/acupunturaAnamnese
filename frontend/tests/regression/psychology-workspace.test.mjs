import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  PSI_ANAMNESE_RECORD_TYPE,
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_CONTENT_STATUS,
  PSYCHOLOGY_MODALITIES,
  PSYCHOLOGY_RISK_GROUP,
  PSYCHOLOGY_RISK_REMINDER,
  PSYCHOLOGY_TEXT_FIELDS,
  appendQuickWord,
  createEmptyPsychologySession,
  getPsychologyModality,
  getPsychologySelected,
  hasPsychologyRiskSelected,
  psychologyChecklists,
  psychologyRiskChecklist,
} from '../../src/data/psychologyAnamnese.js';
import { checklists } from '../../src/data/checklists.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// ------------------------------------------------------------
// Fase 5 (docs/plano-clinica-multidisciplinar.md): o workspace de
// Psicologia nasce como ESQUELETO com vocabulário rascunho. Estes
// testes travam os invariantes clínicos, não o conteúdo (que a
// psicóloga ainda vai validar).
// ------------------------------------------------------------

test('conteúdo de psicologia está explicitamente marcado como rascunho (gate humano)', () => {
  assert.equal(PSYCHOLOGY_CONTENT_STATUS, 'rascunho_a_validar');
});

test('modalidades: anamnese clínica aberta; avaliação neuropsicológica aguarda a psicóloga', () => {
  assert.equal(PSYCHOLOGY_MODALITIES.length, 2);
  assert.equal(getPsychologyModality('anamnese_clinica')?.available, true);
  assert.equal(getPsychologyModality('avaliacao_neuropsicologica')?.available, false);
  // record_types distintos: fluxos distintos, registros distintos.
  const types = new Set(PSYCHOLOGY_MODALITIES.map(m => m.recordType));
  assert.equal(types.size, 2);
  assert.ok(types.has(PSI_ANAMNESE_RECORD_TYPE));
});

test('campos de texto livre cobrem os 6 blocos do plano (§2.2)', () => {
  const ids = PSYCHOLOGY_TEXT_FIELDS.map(f => f.id);
  assert.deepEqual(ids, [
    'demanda', 'motivoBusca', 'historiaPessoal', 'saudeMental', 'redeApoio', 'observacoesSessao',
  ]);
  for (const field of PSYCHOLOGY_TEXT_FIELDS) {
    assert.ok(field.label, `campo ${field.id} sem rótulo`);
  }
});

test('checklists: grupos com prefixo psi (não colidem com MTC) e sono reaproveitado do módulo atual', () => {
  for (const section of PSYCHOLOGY_CHECKLIST_SECTIONS) {
    assert.match(section.group, /^psi[A-Z]/, `grupo ${section.group} sem prefixo psi`);
    assert.ok(section.items.length > 0, `grupo ${section.group} vazio`);
  }
  // Plano §2.2: sono é reaproveitável do módulo atual.
  assert.deepEqual(psychologyChecklists.psiSono, checklists.sono);
});

test('bloco de risco: itens críticos presentes e lembrete que NUNCA decide', () => {
  assert.match(PSYCHOLOGY_RISK_GROUP, /^psi/);
  for (const item of ['Ideação suicida', 'Autolesão', 'Risco a terceiros']) {
    assert.ok(psychologyRiskChecklist.includes(item), `item crítico ausente: ${item}`);
  }
  // Invariante de todas as disciplinas: o sistema lembra, não decide.
  assert.match(PSYCHOLOGY_RISK_REMINDER, /decisão é sempre sua/);
});

test('sessão vazia + helpers de seleção seguem o formato grupo:item do motor', () => {
  const session = createEmptyPsychologySession();
  assert.equal(session.modality, 'anamnese_clinica');
  assert.deepEqual(Object.keys(session.fields), PSYCHOLOGY_TEXT_FIELDS.map(f => f.id));
  assert.deepEqual(session.selectedMap, {});
  // Leitura da IA nasce vazia e só existe quando gerada (rascunho persistido).
  assert.equal(session.aiReading, null);

  const selectedMap = {
    'psiHumor:Tristeza persistente': true,
    'psiHumor:Apatia / desânimo': false,
    'psiRisco:Autolesão': true,
  };
  assert.deepEqual(getPsychologySelected(selectedMap, 'psiHumor'), ['Tristeza persistente']);
  assert.equal(hasPsychologyRiskSelected(selectedMap), true);
  assert.equal(hasPsychologyRiskSelected({}), false);
});

test('workspace: IA assistiva com gate humano (aceitar/ignorar + Corrigir) e disciplina no registro', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/PsychologyWorkspace.jsx'),
    'utf8',
  );
  // Decisão do dono do produto (2026-07-10): IA sugere e redige RASCUNHO,
  // com o loop de correções igual ao MTC. Nada entra sozinho.
  assert.ok(source.includes('psychologyAiService'), 'workspace de Psi deve usar o service de IA psi');
  assert.ok(source.includes('suggestPsychologyMarks'), 'sugestão de marcações deve estar ligada');
  assert.ok(source.includes('generatePsychologyReading'), 'leitura em rascunho deve estar ligada');
  assert.ok(source.includes('AiCorrectionButton'), 'toda superfície de IA precisa do botão Corrigir');
  assert.ok(source.includes('AI_SURFACES.PSYCH_MARKS') && source.includes('AI_SURFACES.PSYCH_READING'));
  assert.ok(source.includes('Aceitar') && source.includes('Ignorar'), 'gate humano: aceitar/ignorar');
  assert.ok(source.includes('aiReading'), 'leitura persiste com a sessão (session.aiReading)');
  // Quick-word chips: digitação mínima.
  assert.ok(source.includes('QuickWordChips') && source.includes('appendQuickWord'));
  // Registros de Psi carregam a disciplina (RPC + payload).
  assert.ok(source.includes("'psicologia'"), 'save deve declarar discipline psicologia');
  assert.ok(source.includes('PSI_ANAMNESE_RECORD_TYPE'));
  // Matrícula inicial criada na disciplina certa ao cadastrar por aqui.
  assert.ok(source.includes('initialDiscipline="psicologia"'));
});

test('quick-words: todo campo tem 4-8 chips e appendQuickWord respeita separador/capitalização', () => {
  for (const field of PSYCHOLOGY_TEXT_FIELDS) {
    assert.ok(Array.isArray(field.quickWords), `campo ${field.id} sem quickWords`);
    assert.ok(
      field.quickWords.length >= 4 && field.quickWords.length <= 8,
      `campo ${field.id} deve ter 4-8 quickWords (tem ${field.quickWords.length})`,
    );
  }
  // Exemplo dado pelo dono do produto: rede de apoio → mãe, pai, avó.
  const redeApoio = PSYCHOLOGY_TEXT_FIELDS.find(f => f.id === 'redeApoio');
  for (const word of ['mãe', 'pai', 'avó']) {
    assert.ok(redeApoio.quickWords.includes(word), `redeApoio sem chip "${word}"`);
  }

  assert.equal(appendQuickWord('', 'mãe'), 'Mãe');
  assert.equal(appendQuickWord('Mora com a família.', 'mãe'), 'Mora com a família. mãe');
  assert.equal(appendQuickWord('Mãe', 'pai'), 'Mãe, pai');
  assert.equal(appendQuickWord('Mãe, pai', ''), 'Mãe, pai');
});

test('migração 20260710 existe: p_discipline com DEFAULT e assinatura antiga removida', async () => {
  const sql = await readFile(
    path.resolve(root, '../supabase/migrations/20260710_insert_record_discipline.sql'),
    'utf8',
  );
  assert.match(sql, /p_discipline TEXT DEFAULT 'acupuntura'/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.insert_clinical_record\(UUID, TEXT, TEXT\)/);
  // Whitelist de disciplinas na própria função (defesa em profundidade).
  assert.ok(sql.includes("''psicologia''"));
  // Consolidado para o SQL Editor acompanha a nova fase.
  const consolidated = await readFile(
    path.resolve(root, '../docs/aplicar-sql-disciplinas-2026-07-08.sql'),
    'utf8',
  );
  assert.ok(consolidated.includes('p_discipline'), 'consolidado deve incluir a migração 20260710');
});
