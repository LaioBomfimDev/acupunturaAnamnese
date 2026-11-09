import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ABA_OBJECTIVES, ABA_TECHNIQUES } from '../../src/data/abaLibrary.js';
import { canWriteLibrary, findLibraryItem, isLibraryDuplicate, libraryContent, libraryErrorMessage, librarySavePayload, LIBRARY_FALLBACK_NOTICE, mergeAbaLibrary } from '../../src/utils/abaLibraryMerge.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = await readFile(path.join(root, 'src/components/aba/AbaLibrary.jsx'), 'utf8');
const programs = await readFile(path.join(root, 'src/components/aba/AbaPrograms.jsx'), 'utf8');
const workspace = await readFile(path.join(root, 'src/components/AbaWorkspace.jsx'), 'utf8');
const css = await readFile(path.join(root, 'src/styles/aba.css'), 'utf8');
// Listas fechadas e independentes da ordem dos arrays. Renomear chave exige revisão explícita.
const OBJECTIVE_KEYS = [
  "atencao-compartilhada-acompanhar-apontar-nivel-1",
  "atencao-compartilhada-alternar-olhar-nivel-1",
  "atencao-compartilhada-alternar-olhar-entre-pessoa-e-objeto-nivel-2",
  "atencao-compartilhada-mostrar-objeto-de-interesse-nivel-3",
  "atencao-compartilhada-compartilhar-reacao-a-evento-nivel-4",
  "atencao-compartilhada-seguir-direcao-do-olhar-nivel-5",
  "atencao-compartilhada-iniciar-atencao-compartilhada-espontanea-nivel-6",
  "autonomia-lavar-as-maos-nivel-1",
  "autonomia-vestir-se-nivel-1",
  "autonomia-escovar-os-dentes-nivel-2",
  "autonomia-vestir-peca-de-roupa-nivel-3",
  "autonomia-usar-utensilios-na-alimentacao-nivel-4",
  "autonomia-organizar-pertences-nivel-5",
  "autonomia-seguir-rotina-de-banheiro-nivel-6",
  "brincadeira-brincar-funcionalmente-nivel-1",
  "brincadeira-explorar-brinquedo-de-forma-funcional-nivel-1",
  "brincadeira-variar-acoes-na-brincadeira-nivel-2",
  "brincadeira-realizar-brincadeira-simbolica-simples-nivel-3",
  "brincadeira-construir-sequencia-de-brincadeira-nivel-4",
  "brincadeira-brincar-paralelamente-com-pares-nivel-5",
  "brincadeira-participar-de-brincadeira-cooperativa-nivel-6",
  "comportamento-adaptativo-parar-diante-de-comando-de-seguranca-nivel-1",
  "comportamento-adaptativo-realizar-transicao-nivel-1",
  "comportamento-adaptativo-permanecer-proximo-ao-adulto-responsavel-nivel-2",
  "comportamento-adaptativo-identificar-situacao-de-risco-nivel-3",
  "comportamento-adaptativo-comunicar-dor-ou-desconforto-nivel-4",
  "comportamento-adaptativo-pedir-autorizacao-antes-de-sair-nivel-5",
  "comportamento-adaptativo-seguir-regra-em-ambiente-comunitario-nivel-6",
  "comunicacao-solicitar-objeto-nivel-1-nivel-1",
  "comunicacao-solicitar-objeto-nivel-2-nivel-2",
  "comunicacao-solicitar-objeto-nivel-3-nivel-3",
  "comunicacao-solicitar-objeto-nivel-4-nivel-4",
  "comunicacao-solicitar-objeto-nivel-5-nivel-5",
  "comunicacao-solicitar-objeto-nivel-6-nivel-6",
  "comunicacao-solicitar-objeto-nivel-7-nivel-7",
  "comunicacao-solicitar-objeto-nivel-8-nivel-8",
  "comunicacao-solicitar-objeto-nivel-9-nivel-9",
  "comunicacao-solicitar-objeto-nivel-10-nivel-10",
  "comunicacao-funcional-solicitar-item-preferido-nivel-1",
  "comunicacao-funcional-solicitar-ajuda-nivel-2",
  "comunicacao-funcional-solicitar-pausa-nivel-3",
  "comunicacao-funcional-recusar-adequadamente-nivel-4",
  "comunicacao-funcional-fazer-escolhas-nivel-5",
  "comunicacao-funcional-generalizar-comunicacao-espontanea-nivel-6",
  "espera-aguardar-acesso-nivel-1",
  "funcoes-executivas-concluir-sequencia-nivel-1",
  "funcoes-executivas-orientar-se-para-a-tarefa-nivel-1",
  "funcoes-executivas-manter-se-em-atividade-nivel-2",
  "funcoes-executivas-seguir-sequencia-visual-nivel-3",
  "funcoes-executivas-alternar-entre-regras-nivel-4",
  "funcoes-executivas-monitorar-conclusao-da-tarefa-nivel-5",
  "funcoes-executivas-corrigir-erro-com-orientacao-nivel-6",
  "habilidades-academicas-parear-estimulos-identicos-nivel-1",
  "habilidades-academicas-parear-letras-nivel-1",
  "habilidades-academicas-classificar-por-categoria-nivel-2",
  "habilidades-academicas-reconhecer-letras-nivel-3",
  "habilidades-academicas-relacionar-numero-e-quantidade-nivel-4",
  "habilidades-academicas-copiar-tracados-funcionais-nivel-5",
  "habilidades-academicas-concluir-atividade-estruturada-nivel-6",
  "habilidades-sociais-cumprimentar-e-despedir-se-nivel-1",
  "habilidades-sociais-iniciar-interacao-nivel-1",
  "habilidades-sociais-responder-a-aproximacao-de-outra-pessoa-nivel-2",
  "habilidades-sociais-iniciar-interacao-nivel-3",
  "habilidades-sociais-aguardar-e-alternar-turnos-nivel-4",
  "habilidades-sociais-manter-topico-de-interacao-nivel-5",
  "habilidades-sociais-reconhecer-pistas-emocionais-nivel-6",
  "imitacao-imitar-movimento-motor-amplo-nivel-1",
  "imitacao-imitar-movimentos-nivel-1",
  "imitacao-imitar-movimento-motor-fino-nivel-2",
  "imitacao-imitar-acao-com-objeto-nivel-3",
  "imitacao-imitar-sequencia-de-movimentos-nivel-4",
  "imitacao-imitar-movimento-orofacial-nivel-5",
  "imitacao-imitar-espontaneamente-em-contexto-natural-nivel-6",
  "linguagem-expressiva-nomear-acoes-nivel-1",
  "linguagem-expressiva-nomear-objetos-nivel-1",
  "linguagem-expressiva-nomear-acoes-nivel-2",
  "linguagem-expressiva-descrever-atributos-nivel-3",
  "linguagem-expressiva-construir-frases-funcionais-nivel-4",
  "linguagem-expressiva-responder-perguntas-pessoais-nivel-5",
  "linguagem-expressiva-relatar-evento-recente-nivel-6",
  "linguagem-receptiva-responder-ao-proprio-nome-nivel-1",
  "linguagem-receptiva-seguir-instrucoes-nivel-1",
  "linguagem-receptiva-seguir-instrucao-de-uma-etapa-nivel-2",
  "linguagem-receptiva-identificar-objetos-conhecidos-nivel-3",
  "linguagem-receptiva-identificar-acoes-nivel-4",
  "linguagem-receptiva-seguir-instrucao-de-duas-etapas-nivel-5",
  "linguagem-receptiva-compreender-relacoes-espaciais-nivel-6",
  "regulacao-emocional-esperar-por-curto-periodo-nivel-1",
  "regulacao-emocional-usar-apoio-visual-para-esperar-nivel-2",
  "regulacao-emocional-aceitar-indisponibilidade-nivel-3",
  "regulacao-emocional-realizar-transicao-entre-atividades-nivel-4",
  "regulacao-emocional-tolerar-mudanca-planejada-nivel-5",
  "regulacao-emocional-selecionar-estrategia-de-regulacao-nivel-6",
  "tolerancia-a-frustracao-aceitar-indisponibilidade-nivel-1"
];
const TECHNIQUE_KEYS = [
  "dtt",
  "net",
  "ensino_incidental",
  "prt",
  "ensino_estruturado",
  "shaping",
  "modeling",
  "videomodelacao",
  "analise_de_tarefas",
  "encadeamento_frente",
  "encadeamento_tras",
  "tarefa_completa",
  "ajuda_verbal",
  "ajuda_gestual",
  "ajuda_visual",
  "ajuda_fisica_parcial",
  "ajuda_fisica_total",
  "menor_para_maior",
  "maior_para_menor",
  "ajuda_simultanea",
  "atraso_de_ajuda",
  "orientacao_graduada",
  "esvanecimento",
  "treino_discriminacao",
  "matching_to_sample",
  "ensino_sem_erro",
  "fading_de_estimulo",
  "shaping_de_estimulo",
  "controle_de_estimulos",
  "reforco_positivo",
  "reforco_natural",
  "reforco_social",
  "reforco_tangivel",
  "reforco_atividade",
  "premack",
  "economia_de_fichas",
  "reforcamento_continuo",
  "reforcamento_intermitente",
  "afinamento_do_reforco",
  "dra",
  "dri",
  "dro",
  "drl",
  "drh",
  "fct",
  "ncr",
  "intervencao_antecedente",
  "operacao_motivadora",
  "escolha",
  "alta_probabilidade",
  "fading_de_demanda",
  "extincao",
  "extincao_de_fuga",
  "interrupcao_redirecionamento",
  "treino_de_tolerancia",
  "exposicao_gradual",
  "generalizacao_pessoas",
  "generalizacao_ambientes",
  "generalizacao_estimulos",
  "generalizacao_respostas",
  "multiplos_exemplares",
  "manutencao",
  "sonda_de_generalizacao",
  "automonitoramento",
  "autoavaliacao",
  "autorreforcamento",
  "checklist_visual"
];
const CONTENT_HASH = '04dd1eed5057a47c40f5e2c2850d7f8b73ee4a7588c7060bcc263f59e4c27834';

test('identidades: lista fechada, formato, unicidade e nenhum outro campo do catálogo alterado', () => {
  for (const [actual, expected] of [[ABA_OBJECTIVES.map(item => item.key), OBJECTIVE_KEYS], [ABA_TECHNIQUES.map(item => item.code), TECHNIQUE_KEYS]]) {
    assert.equal(new Set(actual).size, actual.length);
    assert.deepEqual([...actual].sort(), [...expected].sort());
    actual.forEach(key => assert.match(key, /^[a-z0-9][a-z0-9_-]{0,119}$/));
  }
  assert.equal(createHash('sha256').update(JSON.stringify([ABA_OBJECTIVES.map(libraryContent), ABA_TECHNIQUES])).digest('hex'), CONTENT_HASH);
});

const obj = { key: 'objetivo-estavel', title: 'Título original', objective: 'Texto original', level: 1 };
const technique = { code: 'restrita', name: 'Original', restricted: true, goals: ['g'], suggestedConfig: { procedure: 'Extinção' } };
const own = { id: 'clinica-1', revision: 3, kind: 'objetivo', system_key: null, status: 'ativo', content: { title: 'Da clínica' } };
const options = { objectives: [obj], techniques: [technique] };
test('mescla por kind+chave, substitui conteúdo inteiro e não depende de título nem ordem', () => {
  const rows = [{ ...own, system_key: obj.key, content: { title: 'Renomeado' } }];
  const result = mergeAbaLibrary(rows, options);
  assert.equal(result.objectives[0].title, 'Renomeado');
  assert.equal(result.objectives[0].objective, undefined, 'não mescla campos antigos implicitamente');
  const changed = mergeAbaLibrary(rows, { ...options, objectives: [{ ...obj, title: 'Outro título no código' }] });
  assert.deepEqual(changed, result);
  assert.equal(mergeAbaLibrary([{ ...rows[0], kind: 'tecnica' }], options).objectives[0].title, 'Título original');
  assert.equal(obj.title, 'Título original');
});

test('restrição: sistema sempre vence, inclusive ajuste restricted:false e campo omitido', () => {
  for (const restricted of [false, undefined]) {
    const result = mergeAbaLibrary([{ ...own, kind: 'tecnica', system_key: 'restrita', content: { name: 'Ajustada', ...(restricted === undefined ? {} : { restricted }) } }], options);
    assert.equal(result.techniques[0].restricted, true);
    assert.deepEqual(result.techniques[0].goals, [], 'campos opcionais não quebram o seletor');
  }
  const result = mergeAbaLibrary([{ ...own, kind: 'tecnica', system_key: 'restrita', content: { name: 'Ajustada', restricted: true } }], { ...options, techniques: [{ ...technique, restricted: false }] });
  assert.equal(result.techniques[0].restricted, false);
});

test('visibilidade: ocultos só na gestão de quem grava, arquivados somem, próprios ativos entram', () => {
  const rows = [own, { ...own, id: 'arquivado', status: 'arquivado' }, { ...own, id: 'ajuste', system_key: obj.key, status: 'oculto', content: { title: 'Oculto' } }];
  const reader = mergeAbaLibrary(rows, options);
  assert.deepEqual(reader.objectives.map(item => item.title), ['Da clínica']);
  assert.ok(!reader.entries.some(item => item.status !== 'ativo'));
  const writer = mergeAbaLibrary(rows, { ...options, canWrite: true });
  assert.equal(writer.entries.find(item => item.systemKey === obj.key).status, 'oculto');
  assert.deepEqual(writer.objectives, reader.objectives);
  assert.ok(!writer.entries.some(item => item.row?.id === 'arquivado'));
  const hiddenOwn = mergeAbaLibrary([{ ...own, status: 'oculto' }], { ...options, canWrite: true });
  assert.equal(hiddenOwn.entries.find(item => item.row?.id === own.id).status, 'oculto');
  assert.ok(!hiddenOwn.objectives.some(item => item.title === 'Da clínica'));
  assert.deepEqual(rows[0], own, 'entrada não é mutada');
});

test('sem biblioteca: catálogo base completo e aviso explícito em Programas, erro com retry na Biblioteca', () => {
  const result = mergeAbaLibrary();
  assert.equal(result.objectives.length, ABA_OBJECTIVES.length);
  assert.equal(result.techniques.length, ABA_TECHNIQUES.length);
  assert.equal(LIBRARY_FALLBACK_NOTICE, 'Biblioteca da clínica indisponível; mostrando os modelos do sistema');
  assert.match(programs, /catch\(\(\) => \{\r?\n\s+if \(!cancelled\) \{ setLibraryRows\(\[\]\); setLibraryUnavailable\(true\); \}/);
  assert.match(programs, /libraryUnavailable && <p[^>]+role="status">\{LIBRARY_FALLBACK_NOTICE\}/);
  assert.match(programs, /const templates = library\.objectives\.filter/);
  assert.match(programs, /techniques=\{library\.techniques\}/);
  assert.match(programs, /const results = techniques\.filter/);
  assert.doesNotMatch(programs, /ABA_OBJECTIVES|ABA_TECHNIQUES/);
  assert.match(source, /Tentar de novo/);
});

test('escrita: fonte de times confiável, sem inferir papel supervisor ou usar paciente', () => {
  assert.equal(canWriteLibrary(null), false);
  assert.equal(canWriteLibrary({ isAdmin: true }), true);
  assert.equal(canWriteLibrary({ userId: 'u', supervisedTeamId: 'ativo' }), true);
  assert.equal(canWriteLibrary({ userId: 'u', memberTeamId: 'ativo' }), false);
  assert.equal(canWriteLibrary({ role: 'supervisor' }), false);
  assert.match(source, /Promise\.allSettled\(\[listLibrary\(\), loadTeams\(\)\]\)/);
  assert.match(source, /permissions\.status === 'fulfilled' \? permissions\.value : null/);
  assert.match(source, /\{canWrite && <div className="aba-button-row">/);
  assert.doesNotMatch(source, /patient_id|selectedPatient|canSupervise/);
});

test('payload: identidade estável, CAS, evento, conteúdo sem key e sem metadados de ator/clínica', () => {
  const entry = { kind: 'objetivo', systemKey: obj.key, status: 'ativo', row: null };
  const first = librarySavePayload(entry, obj, { id: 'id-estavel', eventId: 'evento-1' });
  assert.deepEqual(first, { id: 'id-estavel', revision: 0, client_event_id: 'evento-1', kind: 'objetivo', system_key: obj.key, status: 'ativo', content: { title: obj.title, objective: obj.objective, level: 1 } });
  assert.equal(librarySavePayload({ ...entry, row: own }, obj, { id: 'ignorado', eventId: 'evento-2' }).revision, 3);
  assert.match(source, /const \[id\] = useState\(\(\) => initial\.row\?\.id \|\| crypto\.randomUUID\(\)\)/);
  assert.match(source, /if \(inFlight\.current \|\| conflict\) return;/);
  assert.match(source, /inFlight\.current = true; setBusy\(true\)/);
  assert.match(source, /await saveLibraryItem[\s\S]*?await onSaved\(\)/);
  assert.match(source, /async function saved\(\)[\s\S]*?await refresh\(\)/);
  assert.match(source, /useDismiss\(\{ onClose, busy, guardUnsaved: true, unsaved: dirty \}\)/);
});

test('erros: conflito preserva texto, recarrega revisão; demais códigos viram frase pt-BR', () => {
  assert.match(libraryErrorMessage({ code: 'conflict' }), /alterado por outra pessoa.*Recarregue/);
  assert.match(libraryErrorMessage({ code: 'no_access' }), /não tem permissão/);
  for (const code of ['22023', '23505']) assert.equal(libraryErrorMessage({ code, message: 'Texto validado no banco.' }), 'Texto validado no banco.');
  const reload = source.slice(source.indexOf('async function reloadRevision'), source.indexOf('async function save(event)'));
  assert.match(reload, /setEntry/);
  assert.doesNotMatch(reload, /setContent/);
  assert.match(source, /Recarregar revisão/);
  assert.match(source, /entry\.system \? 'oculto' : 'arquivado'/);
  assert.match(source, /<AbaDialog title=\{confirming\.status/);
});

test('navegação, ajuda e responsividade: Equipe, sem paciente, cards e corte único 1024', async () => {
  assert.match(workspace, /title: 'Equipe', tabs: \[TABS\.TIMES, TABS\.BIBLIOTECA, TABS\.SUPERVISAO, TABS\.REVISAO, TABS\.ALERTAS\]/);
  assert.match(workspace, /const TABS_WITHOUT_PATIENT = \[TABS\.HOME, TABS\.TIMES, TABS\.BIBLIOTECA, TABS\.SUPERVISAO, TABS\.REVISAO, TABS\.ALERTAS\]/);
  assert.match(workspace, /\[TABS\.BIBLIOTECA\]: 'biblioteca'/);
  assert.match(workspace, /if \(effectiveTab === TABS\.BIBLIOTECA\) return <AbaLibrary \/>/);
  const { ABA_HELP } = await import('../../src/data/screenHelp.js');
  for (const key of ['title', 'summary', 'actions', 'reading', 'access', 'notes']) assert.ok(ABA_HELP.biblioteca[key]);
  assert.match(source, /'modelo' : 'modelos'/);
  assert.match(source, /Ponto de partida, não decisão clínica/);
  assert.match(source, /Restrito/);
  assert.match(css, /@media \(max-width: 1024px\) \{\r?\n\s+\.aba-library-grid, \.aba-library-form \{ grid-template-columns: minmax\(0, 1fr\)/);
});

let server, api, db, originalRpc, screen;
before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  api = await server.ssrLoadModule('/src/services/abaService.js');
  screen = await server.ssrLoadModule('/src/components/aba/AbaLibrary.jsx');
  db = (await server.ssrLoadModule('/src/lib/supabase.js')).supabase;
  originalRpc = db.rpc;
});
after(async () => { if (db) db.rpc = originalRpc; await server?.close(); });

test('serviço: RPCs novas pelo call existente, parâmetros intactos e erros reais traduzidos', async () => {
  const calls = [];
  db.rpc = async (fn, args) => { calls.push([fn, args]); return { data: fn === 'aba_list_library' ? [] : { revision: 1 }, error: null }; };
  assert.deepEqual(await api.listLibrary(), []);
  const payload = { id: 'item', revision: 0, client_event_id: 'evento', content: { title: 'Fictício' } };
  await api.saveLibraryItem(payload);
  assert.deepEqual(calls, [['aba_list_library', {}], ['aba_save_library_item', { p_item: payload }]]);
  for (const [code, message] of [['40001', 'Alterado'], ['42501', 'Sem permissão'], ['22023', 'Título obrigatório'], ['23505', 'Referência já registrada']]) {
    db.rpc = async () => ({ data: null, error: { code, message } });
    await assert.rejects(api.saveLibraryItem(payload), error => code === '40001' ? error instanceof api.AbaConflictError : code === '42501' ? error instanceof api.AbaAccessError : error.message === message);
  }
});

// QA (review da ACUP-007): mutações que passavam sem o teste notar.
test('QA: id fixo por editor, evento novo por ação, Restrito travado no sistema e aviso nas duas telas', () => {
  const editorSave = source.slice(source.indexOf('async function save(event)'), source.indexOf('return <div className="aba-dialog-overlay"'));
  assert.match(editorSave, /librarySavePayload\(entry, content, \{ id, eventId: crypto\.randomUUID\(\) \}\)/);
  assert.match(source, /setConfirming\(\{ entry, id: entry\.row\?\.id \|\| crypto\.randomUUID\(\), eventId: crypto\.randomUUID\(\),/);
  assert.match(source, /id: confirming\.id, eventId: confirming\.eventId, status: confirming\.status/);
  assert.match(source, /disabled=\{key === 'restricted' && systemTechnique\}/);
  assert.match(source, /systemTechnique=\{entry\.system && entry\.kind === 'tecnica'\}/);
  assert.match(programs, /<p className="aba-note">Modelos são ponto de partida, não decisão clínica\./);
  assert.match(source, /const advice = 'Ponto de partida, não decisão clínica\./);
});

test('QA: categoria, objetivos e funções da técnica aparecem pelo rótulo pt-BR, nunca pelo código', () => {
  assert.match(source, /import \{ behaviorFunctionLabel, techniqueCategoryLabel, techniqueGoalLabel \} from '\.\.\/\.\.\/utils\/aba\/catalog\.js';/);
  assert.match(source, /<p className="aba-muted">\{categoryOf\(entry\)\}<\/p>/);
  assert.match(source, /<dd>\{shownValue\(entry, key\)\}<\/dd>/);
  assert.match(source, /key === 'goals'\) return value\.map\(techniqueGoalLabel\)/);
  assert.match(source, /key === 'behaviorFunctions'\) return value\.map\(behaviorFunctionLabel\)/);
  assert.doesNotMatch(source, /<p className="aba-muted">\{entry\.content\.category\}<\/p>/);
});

test('QA: leitura do modelo não mostra a instrução de digitação do editor', () => {
  assert.ok(source.includes("<dt>{label.replace(/ \\(uma? por linha\\)$/, '')}</dt>"));
});

test('ACUP-014: seletores de técnica usam rótulos do catálogo, preservando valores opcionais e históricos', () => {
  const html = renderToStaticMarkup(React.createElement(screen.LibraryContentFields, {
    technique: true, content: { category: 'formato_ensino', goals: ['comunicar'], behaviorFunctions: ['fuga'],
      collection_type: 'percentual_independencia', teaching_format: 'DTT', reinforcement_schedule: 'continuo',
      prompt_hierarchy: ['ajuda_visual','fisica_parcial'], prompt_fading: 'Atraso de ajuda', time_measure: 'latencia',
      procedure: 'DRA', goal_direction: 'reduzir' },
    fields: { category: 'Categoria', goals: 'Objetivos', behaviorFunctions: 'Funções', collection_type: 'Coleta',
      teaching_format: 'Ensino', reinforcement_schedule: 'Reforço', prompt_hierarchy: 'Hierarquia',
      prompt_fading: 'Esvanecimento', time_measure: 'Tempo', procedure: 'Procedimento', goal_direction: 'Direção' },
    onChange() {},
  }));
  assert.equal((html.match(/<select/g) || []).length, 11);
  assert.equal((html.match(/multiple=""/g) || []).length, 3);
  assert.doesNotMatch(html, /textarea/);
  for (const label of ['Formatos de ensino','Ensinar a se comunicar','Fuga / esquiva da demanda','Percentual de independência','DTT (tentativas discretas)','Contínuo','Ajuda visual','Ajuda física parcial','Latência da resposta']) assert.ok(html.includes(label), label);
  assert.match(html, /value="comunicar" selected=""/);
  assert.match(html, /value="ajuda_visual" selected=""/);
  const legacy = renderToStaticMarkup(React.createElement(screen.LibraryContentFields, { technique: true, content: { category: 'categoria_antiga' }, fields: { category: 'Categoria' }, onChange() {} }));
  assert.match(legacy, /fora do catálogo atual/);
  assert.doesNotMatch(legacy, />categoria_antiga</);
});

test('ACUP-014: 23505 em ajuste do sistema recarrega por tipo/chave e salva id/revisão do existente sem perder texto', () => {
  const entry = { kind: 'objetivo', system: true, systemKey: obj.key, status: 'ativo', row: null };
  const row = { ...own, id: 'ajuste-concorrente', revision: 8, system_key: obj.key, content: { title: 'Outro texto' } };
  assert.equal(isLibraryDuplicate({ code: '23505' }, entry), true);
  assert.equal(isLibraryDuplicate({ message: 'Esta referência do sistema ou este evento já foi registrado na biblioteca. Recarregue antes de continuar.' }, entry), true);
  assert.equal(isLibraryDuplicate({ code: '23505' }, { ...entry, system: false }), false);
  assert.equal(findLibraryItem(entry, [{ ...row, kind: 'tecnica' }]), null);
  const existing = findLibraryItem(entry, [row]);
  const payload = librarySavePayload({ ...entry, row: existing }, { title: 'Meu texto preservado' }, { id: 'uuid-inicial', eventId: 'novo-evento' });
  assert.equal(payload.id, 'ajuste-concorrente');
  assert.equal(payload.revision, 8);
  assert.deepEqual(payload.content, { title: 'Meu texto preservado' });
  assert.match(source, /const latest = findLibraryItem\(entry, rows\)/);
  assert.match(source, /setEntry\(current => \(\{ \.\.\.current, row: latest, status: latest\.status \}\)\)/);
  assert.match(source, /duplicate \? 'Recarregar' : 'Recarregar revisão'/);
});

test('ACUP-014: arquivados próprios só na gestão autorizada; reativar preserva conteúdo/CAS e nunca entra em Programas arquivado', () => {
  const row = { ...own, status: 'arquivado' };
  const reader = mergeAbaLibrary([row], { ...options, includeArchived: true });
  assert.ok(!reader.entries.some(entry => entry.row?.id === own.id));
  const writer = mergeAbaLibrary([row], { ...options, canWrite: true, includeArchived: true });
  const entry = writer.entries.find(entry => entry.row?.id === own.id);
  assert.equal(entry.status, 'arquivado');
  assert.ok(!writer.objectives.some(item => item.title === 'Da clínica'));
  assert.ok(!mergeAbaLibrary([row], { ...options, canWrite: true }).entries.some(entry => entry.row?.id === own.id));
  const payload = librarySavePayload(entry, entry.content, { id: 'ignorado', eventId: 'reativar', status: 'ativo' });
  assert.equal(payload.id, own.id); assert.equal(payload.revision, own.revision); assert.equal(payload.status, 'ativo');
  assert.deepEqual(payload.content, own.content);
  assert.match(source, /const showArchived = canWrite && statusFilter === 'arquivados'/);
  assert.match(source, /canWrite && <label className="aba-field">Mostrar/);
  assert.match(source, /entry\.status !== 'ativo' \? 'ativo' : entry\.system \? 'oculto' : 'arquivado'/);
  assert.match(source, /entry\.status !== 'ativo' \? 'Reativar'/);
  assert.match(source, /<AbaDialog title=\{confirming\.status/);
});
