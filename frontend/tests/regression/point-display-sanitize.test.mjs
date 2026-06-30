import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  clinicalSources,
  clinicalWhy,
  sanitizeClinicalNote,
} from '../../src/knowledge/pointDisplaySanitize.js';

test('clinicalNote so de boilerplate de sistema fica vazio (secao some)', () => {
  const note = 'Fonte primaria: Atlas dos Pontos de Acupuntura: Guia de Localizacao, p. 854. '
    + 'Secao localizada por cabecalho do Atlas (Yintang). '
    + 'Aprovado localmente por solicitacao explicita do operador para curadoria; '
    + 'manter auditoria profissional final antes de banco/producao.';
  assert.equal(sanitizeClinicalNote(note), '');
});

test('clinicalNote preserva a nota clinica de localizacao, removendo proveniencia/aprovacao', () => {
  const note = 'Fonte primaria: Atlas dos Pontos de Acupuntura: Guia de Localizacao, p. 284-285. '
    + 'Nota de localizacao: Com a palma da mão para cima, o tendão do músculo flexor ulnar do carpo torna-se bem evidente. '
    + 'Status permanece como sugestao local; nao publicar em banco/producao sem auditoria. '
    + 'Aprovado localmente em 2026-06-01 por solicitação explícita do operador. '
    + 'Fonte Atlas: p. 284-285. Manter auditoria profissional final antes de migração.';
  const clean = sanitizeClinicalNote(note);
  assert.equal(clean, 'Com a palma da mão para cima, o tendão do músculo flexor ulnar do carpo torna-se bem evidente.');
  assert.doesNotMatch(clean, /Atlas|Aprovado|auditoria|284-285/);
});

test('why de sistema ("Biblioteca Viva") vira vazio; rationale clinico permanece', () => {
  assert.equal(clinicalWhy('EX-HN3 foi aprovado na Biblioteca Viva para consulta clínica.'), '');
  assert.equal(clinicalWhy('Registro disponível para conferência no contexto selecionado.'), '');
  const clinical = 'C7 se relaciona com Ansiedade por suas funções: acalma o Shen.';
  assert.equal(clinicalWhy(clinical), clinical);
});

test('fontes removem rotulo de sistema "Biblioteca Viva", mantendo a referencia bibliografica', () => {
  const out = clinicalSources(['Biblioteca Viva', 'Atlas dos Pontos de Acupuntura: Guia de Localizacao', 'Atlas Ednea Martins, p. 284-285']);
  assert.deepEqual(out, ['Atlas dos Pontos de Acupuntura: Guia de Localizacao', 'Atlas Ednea Martins, p. 284-285']);
});
