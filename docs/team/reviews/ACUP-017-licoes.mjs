// Cenários do QA para a ACUP-017: correção financeira nunca entra no prompt de outra pessoa.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const root = 'file:///C:/Users/m/Downloads/acup-team/qa/';
const { fitToBudget, rankLessonsByRelevance } = await import(root + 'supabase/functions/_shared/promptBudget.ts');
const code = stripTypeScriptTypes(readFileSync(new URL(root + 'supabase/functions/_shared/corrections.ts'), 'utf8')).replace(/^import .*;\r?$/gm, '').replace(/^export /gm, '');
const c = new Function('fitToBudget', 'rankLessonsByRelevance', 'logOperationalEvent', code + ';return {fetchCorrectionLessons,renderCorrectionBlock,withCorrectionLessons};')(fitToBudget, rankLessonsByRelevance, () => {});
const AUTORA = '11111111-1111-4111-8111-111111111111';
const OUTRA = '22222222-2222-4222-8222-222222222222';
const licoes = [
  { correction_text: 'NOTA FINANCEIRA DA AUTORA', reason: 'motivo que não pode sair', ai_output: { answer: 'resposta antiga com R$ 300' }, context_snapshot: { financeiro: true }, approval_status: 'approved', author_id: AUTORA },
  { correction_text: 'NOTA FINANCEIRA PENDENTE', reason: null, ai_output: {}, context_snapshot: { financeiro: true }, approval_status: 'pending', author_id: AUTORA },
  { correction_text: 'LICAO NORMAL APROVADA', reason: 'regra geral', ai_output: { answer: 'resposta comum' }, context_snapshot: { question: 'x' }, approval_status: 'approved', author_id: OUTRA },
];
// cliente simulado do Supabase: devolve todas as lições, como a service role faria
const fakeClient = () => {
  const q = { select() { return q; }, eq() { return q; }, neq() { return q; }, or() { return q; }, order() { return q; }, limit() { return q; }, then(r) { return Promise.resolve({ data: licoes, error: null }).then(r); } };
  return { from() { return q; } };
};
const out = {};
for (const [quem, id] of [['autora', AUTORA], ['outra', OUTRA], ['sem_id', ''], ['id_invalido', 'nao-uuid']]) {
  const prompt = await c.withCorrectionLessons(fakeClient(), 'PROMPT BASE', { surface: 'clinic_assistant', callerId: id, relevanceQuery: '' });
  out[quem] = {
    notaAprovadaForcada: prompt.includes('NOTA FINANCEIRA DA AUTORA'),
    notaPendente: prompt.includes('NOTA FINANCEIRA PENDENTE'),
    licaoNormal: prompt.includes('LICAO NORMAL APROVADA'),
    vazouResposta: prompt.includes('R$ 300') || prompt.includes('resposta antiga'),
    vazouMotivo: prompt.includes('motivo que não pode sair'),
    secaoAprovadaComFinanceira: /APROVAD|aprovad/.test(prompt.split('NOTA FINANCEIRA DA AUTORA')[0] || '') && prompt.includes('NOTA FINANCEIRA DA AUTORA') ? 'ver texto' : 'ok',
  };
}
// renderCorrectionBlock direto, sem callerId, com a lição financeira aprovada
const bloco = c.renderCorrectionBlock(licoes, {});
out.renderSemCaller = { notaFinanceira: bloco.includes('NOTA FINANCEIRA'), licaoNormal: bloco.includes('LICAO NORMAL') };
console.log(JSON.stringify(out, null, 1));
const pa = await c.withCorrectionLessons(fakeClient(), 'PROMPT BASE', { surface: 'clinic_assistant', callerId: AUTORA, relevanceQuery: '' });
console.log('--- prompt da autora (sem o PROMPT BASE) ---\n' + pa.replace('PROMPT BASE', ''));
