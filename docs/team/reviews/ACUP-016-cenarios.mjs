// Cenários do QA para a ACUP-016 (dados 100% fictícios, nada de rede).
import { readFileSync } from 'node:fs';
const root = 'file:///C:/Users/m/Downloads/acup-team/qa/';
const edgeMirror = await import(root + 'supabase/functions/_shared/assistantConsulta.ts');
const util = await import(root + 'frontend/src/utils/clinicAssistant.js');
const fin = await import(root + 'frontend/src/utils/finance.js');
const tiss = await import(root + 'frontend/src/utils/tissXml.js');
const out = {};

// 1) Variações do tipo forjado na Edge
const linhaForjada = { paciente: 'Paciente Fictício', profissional: 'Dra. Fictícia', valor_centavos: 15000, vencimento: '2026-11-03', pagamento: null, status: 'a_receber' };
const corpo = tipo => ({ tipo, de: '2026-11-01', ate: '2026-11-30', status: 'a_receber', linhas: [linhaForjada] });
const variantes = { normal: 'financeiro', maiuscula: 'FINANCEIRO', capital: 'Financeiro', espacos: '  financeiro  ', nul: 'financeiro\u0000', tab: '\tfinanceiro', cirilico: 'financeir\u043e', zwsp: 'finan\u200bceiro', nbsp: '\u00a0financeiro', ligadura: '\ufb01nanceiro', array: ['financeiro'] };
out.variantes = Object.fromEntries(Object.entries(variantes).map(([k, v]) => {
  const r = edgeMirror.readConsultaResult(corpo(v));
  return [k, r ? `tipo=${JSON.stringify(r.tipo)} linhas=${(r.linhas || []).length}${r.tipo === 'financeiro' ? ' (passa pela conferência do servidor)' : ''}` : 'null'];
}));

// 2) readAuthorizedConsultaResult real, extraída do index.ts, com banco simulado
const src = readFileSync(new URL(root + 'supabase/functions/clinic-assistant/index.ts'), 'utf8');
const fnSrc = src.slice(src.indexOf('async function readAuthorizedConsultaResult'), src.indexOf('// Fim FIN-1.'))
  .replace(/\(raw: unknown, client: ReturnType<typeof createServiceClient>, clinicId: string, userId: string\)/, '(raw, client, clinicId, userId)');
const readAuthorized = new Function('readConsultaResult', `${fnSrc}; return readAuthorizedConsultaResult;`)(edgeMirror.readConsultaResult);
const cliente = resposta => { const chamadas = []; return { chamadas, rpc: async (fn, args) => { chamadas.push({ fn, args }); if (resposta === 'lanca') throw new Error('x'); return resposta; } }; };
out.servidor = {};
for (const [nome, resp] of [['permitido', { data: true, error: null }], ['negado', { data: false, error: null }], ['nulo', { data: null, error: null }], ['erro', { data: true, error: { message: 'x' } }], ['lanca', 'lanca'], ['string_true', { data: 'true', error: null }]]) {
  for (const [v, tipo] of [['normal', 'financeiro'], ['nul', 'financeiro\u0000'], ['maiuscula', 'FINANCEIRO']]) {
    const c = cliente(resp);
    const r = await readAuthorized(corpo(tipo), c, 'clinica-servidor', 'usuario-autenticado');
    out.servidor[`${nome}/${v}`] = `${r ? 'DEVOLVE ' + (r.linhas?.length ?? 0) + ' linha(s)' : 'descarta'}; rpc=${JSON.stringify(c.chamadas.map(x => x.args))}`;
  }
}
const cH = cliente({ data: false, error: null });
const horarios = await readAuthorized({ tipo: 'horarios_vagos', profissional: 'Dra. Fictícia', dia: '2026-11-10', horarios: ['08:00'] }, cH, 'c', 'u');
out.horariosSemFinanceiro = { devolvido: !!horarios, horarios: horarios?.horarios, rpcChamado: cH.chamadas.length };

// 3) Números contra a tela A receber (dados fictícios)
const today = '2026-11-20';
const money = {
  charges: [
    { id: 'c1', source: 'appointment', patient_id: 'p1', professional_id: 'm1', price_cents: 20000, service_on: '2026-11-05' },
    { id: 'c2', source: 'appointment', patient_id: 'p1', professional_id: 'm1', price_cents: 20000, service_on: '2026-11-25' },
    { id: 'c3', source: 'appointment', patient_id: 'p2', professional_id: 'm2', price_cents: 15000, service_on: '2026-11-10', convenio_id: 'op1', billing: 'convenio', payer: 'convenio' },
    { id: 'c4', source: 'appointment', patient_id: 'p2', professional_id: 'm2', price_cents: 15000, service_on: '2026-10-01', convenio_id: 'op1', billing: 'convenio', payer: 'convenio' },
    { id: 'c5', source: 'appointment', patient_id: 'p3', professional_id: 'm1', price_cents: 10000, service_on: '2026-11-12', voided_at: '2026-11-13' },
  ],
  packages: [], installments: [],
  receipts: [
    { id: 'r1', charge_id: 'c1', patient_id: 'p1', amount_cents: 5000, received_on: '2026-11-06' },
    { id: 'r2', charge_id: 'c2', patient_id: 'p1', amount_cents: 1000, received_on: '2026-11-07', voided_at: '2026-11-08' },
  ],
  tissStatus: [{ cobranca: 'c4', guia: 'g4', enviado_em: '2026-10-05', prazo_dias: 30, situacao: 'enviada' }],
  tissPaid: [], tissReady: true,
};
const isConv = fin.isConvenioCharge ? money.charges.map(c => [c.id, fin.isConvenioCharge(c)]) : 'sem isConvenioCharge';
const tela = fin.buildReceivables({ ...money, receipts: [...money.receipts, ...tiss.operatorReceiptsFrom(money.tissPaid)], today });
out.tela = { isConvenio: isConv, itens: tela.items.map(i => ({ ch: i.chargeId, payer: i.payer, aberto: i.openCents, venc: i.dueOn, temVenc: i.hasDue, atrasado: i.late })) };
const patients = [{ id: 'p1', name: 'Paciente Um Fictício', cpf: '000.000.000-00', phone: '7199999', email: 'x@y.invalid', address: 'Rua X', observacoes: 'obs', convenio_carteirinha: '123' }, { id: 'p2', name: 'Paciente Dois Fictício', cpf: '111' }, { id: 'p3', name: 'Paciente Três' }];
const members = [{ id: 'm1', full_name: 'Dra. Ana Fictícia' }, { id: 'm2', full_name: 'Dr. Beto Fictício' }];
const shortName = n => n;
const ask = (status, de = '2026-09-01', ate = '2026-11-30', extra = {}) => util.summarizeFinance({ consulta: { tipo: 'financeiro', de, ate, status, ...extra }, money, patients, members, shortName, today, selfId: 'admin' });
for (const s of ['a_receber', 'atrasados', 'recebidos']) {
  const r = ask(s);
  out['assistente_' + s] = { motivo: r.motivo, criterio: r.criterio, linhas: r.linhas, soma: r.linhas.reduce((a, l) => a + l.valor_centavos, 0) };
}
const telaAberto = tela.items.filter(i => i.dueOn >= '2026-09-01' && i.dueOn <= '2026-11-30').reduce((a, i) => a + i.openCents, 0);
const telaAtrasado = tela.items.filter(i => i.late && i.dueOn >= '2026-09-01' && i.dueOn <= '2026-11-30').reduce((a, i) => a + i.openCents, 0);
out.comparacao = { telaAberto, assistenteAReceber: out.assistente_a_receber.soma, telaAtrasado, assistenteAtrasados: out.assistente_atrasados.soma };
out.camposVazados = JSON.stringify([out.assistente_a_receber, out.assistente_atrasados, out.assistente_recebidos]).match(/000\.000|7199999|x@y|Rua X|"obs"|carteirinha|cpf/g) || [];

// 4) FIN-4: 93 dias inclusivos e 50 linhas
out.periodo = {
  d93: util.financeConsultaIssue({ de: '2026-01-01', ate: '2026-04-03', status: 'a_receber' }),
  d94: util.financeConsultaIssue({ de: '2026-01-01', ate: '2026-04-04', status: 'a_receber' }),
  invertido: util.financeConsultaIssue({ de: '2026-02-01', ate: '2026-01-01', status: 'a_receber' }),
  data30fev: util.financeConsultaIssue({ de: '2026-02-30', ate: '2026-03-01', status: 'a_receber' }),
  mensagem94: util.financeConsultaFailure({ de: '2026-01-01', ate: '2026-04-04', status: 'a_receber' }, 'limite_periodo').mensagem,
};
const many = n => ({ ...money, charges: Array.from({ length: n }, (_, i) => ({ id: 'x' + i, source: 'appointment', patient_id: 'p1', professional_id: 'm1', price_cents: 100, service_on: '2026-11-0' + (1 + (i % 9)) })), receipts: [], tissStatus: [] });
for (const n of [50, 51]) {
  const r = util.summarizeFinance({ consulta: { tipo: 'financeiro', de: '2026-11-01', ate: '2026-11-30', status: 'a_receber' }, money: many(n), patients, members, shortName, today, selfId: 'admin' });
  out['linhas' + n] = { motivo: r.motivo, total: r.total, linhas: r.linhas.length, mensagem: r.mensagem };
}
// Edge recusa 51 linhas forjadas também (sem cortar)
out.edge51 = edgeMirror.readConsultaResult({ ...corpo('financeiro'), linhas: Array.from({ length: 51 }, () => linhaForjada) });
out.edge51 = { motivo: out.edge51.motivo, linhas: out.edge51.linhas.length };
// Campos extras forjados na Edge não atravessam
const extra = edgeMirror.readConsultaResult({ ...corpo('financeiro'), linhas: [{ ...linhaForjada, cpf: '000', telefone: '71', email: 'a@b', carteirinha: '9', observacao: 'x', evolucao: 'texto clínico', patient_id: 'uuid' }], cpf: '000' });
out.edgeCamposExtras = Object.keys(extra.linhas[0] || {}).concat(Object.keys(extra).filter(k => !['tipo', 'de', 'ate', 'status', 'paciente', 'profissional', 'motivo', 'mensagem', 'criterio', 'linhas', 'total'].includes(k)));
// espelho
out.espelho = ['FINANCE_MAX_DAYS', 'FINANCE_MAX_ROWS', 'FINANCE_FILTERS', 'FINANCE_ROW_STATUS', 'FINANCE_CRITERIA', 'FINANCE_REASONS'].map(k => `${k}:${JSON.stringify(util[k]) === JSON.stringify(edgeMirror[k]) ? 'igual' : 'DIFERENTE'}`);
console.log(JSON.stringify(out, null, 1));
