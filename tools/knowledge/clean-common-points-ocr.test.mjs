import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanField, stripRunningHeads, collectDoubts } from './clean-common-points-ocr.mjs';

test('remove cabecalho/rodape de pagina injetado', () => {
  assert.equal(stripRunningHeads('Beneficia o nariz. ( TA/YANG DO PÉ ) - 363').trim(), 'Beneficia o nariz.');
  assert.equal(stripRunningHeads('palmas das mãos, ( ) - 285 distúrbios').replace(/\s+/g, ' ').trim(), 'palmas das mãos, distúrbios');
  assert.equal(
    stripRunningHeads('Coração., CANAL DE ENERGIA DO CORAÇÃO (SHAOYIN DA MÃO) - 285 Fortalece').replace(/\s+/g, ' ').trim(),
    'Coração., Fortalece',
  );
});

test('corrige OCR inequivoco de termos clinicos', () => {
  assert.equal(cleanField('Faz a li1npcza do Ca l or do Coração'), 'Faz a limpeza do Calor do Coração');
  assert.equal(cleanField('transforma a Mu cosidade'), 'transforma a Mucosidade');
  assert.equal(cleanField('o tendão do mllsculo flexor'), 'o tendão do músculo flexor');
  assert.equal(cleanField('e Yi11 do Coração'), 'e Yin do Coração');
  assert.equal(cleanField('1:S c un lateral'), '1,5 cun lateral');
  assert.equal(cleanField('inserção medial cm direção'), 'inserção medial em direção');
  assert.equal(cleanField('palpitação e lfngua pálida'), 'palpitação e língua pálida');
});

test('remove virgula/ponto orfao inicial', () => {
  assert.equal(cleanField(', dor cardíaca, doença cardíaca'), 'dor cardíaca, doença cardíaca');
});

test('junta hifen de quebra de linha apenas em continuacao minuscula', () => {
  assert.equal(cleanField('para- lisia do músculo'), 'paralisia do músculo');
  assert.equal(cleanField('pro- blemas em ossos'), 'problemas em ossos');
  // NAO juntar quando a proxima palavra comeca com maiuscula (provavel item novo)
  assert.equal(cleanField('Frio., - Reduz o Calor'), 'Frio., - Reduz o Calor');
});

test('nao inventa: trechos ambiguos permanecem e viram duvida', () => {
  const cleaned = cleanField("Null'e Sangue e Yin");
  assert.match(cleaned, /Null'e Sangue/); // nao reescreve palpite
  const doubts = collectDoubts('HT7', 'indications', '', 'paralisia do músculo hloglosso, ní veis');
  const labels = doubts.map(d => d.label);
  assert.ok(labels.includes('possivel palavra quebrada por espaco'));
});

test('idempotente: limpar texto ja limpo nao muda', () => {
  const once = cleanField('Faz a li1npcza do Ca l or do Coração');
  assert.equal(cleanField(once), once);
});
