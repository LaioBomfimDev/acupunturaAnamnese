import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import { createServer } from 'vite';
import { fitToBudget, rankLessonsByRelevance } from '../../../supabase/functions/_shared/promptBudget.ts';
import { upcomingDays } from '../../../supabase/functions/_shared/assistantConsulta.ts';
import { ASSISTANT_SECTION_LINKS } from '../../../supabase/functions/_shared/clinicAssistant.ts';
import { ASSISTANT_HELP } from '../../src/data/screenHelp.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const source=await readFile(new URL('../../../supabase/functions/_shared/corrections.ts',import.meta.url),'utf8');
const code=stripTypeScriptTypes(source).replace(/^import .*;\r?$/gm,'').replace(/^export /gm,'');
const lessons=new Function('fitToBudget','rankLessonsByRelevance','logOperationalEvent',code+';return {fetchCorrectionLessons,renderCorrectionBlock,withCorrectionLessons};')(fitToBudget,rankLessonsByRelevance,()=>{});
const author='00000000-0000-4000-8000-000000000001';
const other='00000000-0000-4000-8000-000000000002';
const state={row:null,inserts:[],updates:[]};globalThis.__acup017=state;
const server=await createServer({root,server:{middlewareMode:true},appType:'custom',logLevel:'silent',plugins:[{name:'017-isolation',enforce:'pre',load(id){
  if(id.replaceAll('\\','/').split('?')[0].endsWith('/src/lib/supabase.js'))return `
  export const getAuthenticatedUser=async()=>({id:'${author}',full_name:'Autora fictícia'});
  export const supabase={functions:{invoke:async()=>{throw Error('Rede inesperada')}},from:()=>{
    const s=globalThis.__acup017;let patch=null,insert=null;
    const q={select(){return q},eq(){return q},update(value){patch=value;s.updates.push(value);return q},insert(value){insert=value;s.inserts.push(value);return q},async single(){if(insert)s.row={...insert,id:'r',approval_status:'pending'};if(patch)s.row={...s.row,...patch};return {data:s.row,error:null}}};return q;
  }};`;
}}]});
after(()=>{delete globalThis.__acup017;return server.close();});
const correction=await server.ssrLoadModule('/src/services/aiCorrectionService.js');
const assistant=await server.ssrLoadModule('/src/services/clinicAssistantService.js');
const note='Explique o critério do período sem concluir a causa do status.';
const financial={surface:'clinic_assistant',financial:true,modelVersion:'SEGREDO_VERSAO',aiOutput:{answer:'SEGREDO_RESPOSTA'},contextSnapshot:{question:'SEGREDO_PERGUNTA',dados:'SEGREDO_DADOS'},correctionStructured:{x:'SEGREDO'},reason:'SEGREDO_MOTIVO',correctionText:note};

test('FIN-3: persistência real guarda só nota e marcador; ignora resposta, pergunta, dados, razão e estrutura',async()=>{
  state.inserts=[];state.updates=[];
  const saved=await correction.submitAiCorrection(financial);
  assert.deepEqual(saved.ai_output,{});assert.deepEqual(saved.context_snapshot,{financeiro:true});assert.equal(saved.reason,null);assert.equal(saved.model_version,null);assert.equal(saved.correction_structured,null);assert.equal(saved.correction_text,note);assert.equal(saved.approval_status,'pending');assert.equal(saved.author_id,author);
  assert.doesNotMatch(JSON.stringify(state.inserts),/SEGREDO/);
  const marked=await correction.submitAiCorrection({...financial,financial:false,contextSnapshot:{financeiro:true,question:'SEGREDO'}});
  assert.deepEqual(marked.context_snapshot,{financeiro:true});assert.deepEqual(marked.ai_output,{});
});
test('FIN-6: aprovação consulta a linha real e recusa marcador, sem UPDATE; aprovação geral preservada',async()=>{
  state.row={id:'r',surface:'clinic_assistant',context_snapshot:{financeiro:true}};state.updates=[];
  await assert.rejects(correction.setCorrectionStatus('r','approved'),/não pode ser aprovada/);assert.deepEqual(state.updates,[]);
  state.row={id:'g',surface:'tongue',context_snapshot:{label:'geral'}};
  await correction.setCorrectionStatus('g','approved');assert.equal(state.updates.length,1);assert.equal(state.updates[0].approval_status,'approved');
  const general=await correction.submitAiCorrection({...financial,surface:'tongue',financial:true});
  assert.deepEqual(general.ai_output,financial.aiOutput);assert.deepEqual(general.context_snapshot,financial.contextSnapshot);assert.deepEqual(general.correction_structured,financial.correctionStructured);
});
function clientFor(rows){const q={select(){return q},eq(){return q},neq(){return q},order(){return q},limit(){return q},or(){return q},then(resolve){return Promise.resolve({data:rows,error:null}).then(resolve)}};return {from:()=>q};}
const privateLesson={correction_text:note,context_snapshot:{financeiro:true,question:'SEGREDO_PERGUNTA'},ai_output:{answer:'SEGREDO_RESPOSTA'},reason:'SEGREDO_MOTIVO',author_id:author,approval_status:'approved'};
test('FIN-3/6: financeira aprovada à força nunca entra no prompt de outra autora, nem no renderer direto',async()=>{
  const general={...privateLesson,correction_text:'Orientação geral compartilhada.',context_snapshot:{},ai_output:{},reason:null,author_id:other};
  const db=clientFor([privateLesson,general]);
  const own=await lessons.withCorrectionLessons(db,'BASE',{surface:'clinic_assistant',callerId:author,totalBudgetChars:20000});
  assert.ok(own.includes(note));assert.doesNotMatch(own,/SEGREDO/);
  const foreign=await lessons.withCorrectionLessons(db,'BASE',{surface:'clinic_assistant',callerId:other,totalBudgetChars:20000});
  assert.ok(foreign.includes(general.correction_text));assert.ok(!foreign.includes(note));assert.doesNotMatch(foreign,/SEGREDO/);
  assert.equal(lessons.renderCorrectionBlock([privateLesson]),'');
  assert.equal(lessons.renderCorrectionBlock([privateLesson],{callerId:other}),'');
  assert.doesNotMatch(lessons.renderCorrectionBlock([privateLesson],{callerId:author}),/SEGREDO|CONFIRMADAS PELA CURADORIA/);
  assert.deepEqual(await lessons.fetchCorrectionLessons(db,{surface:'clinic_assistant',callerId:'inválido'}),[general]);
});
test('FIN-3: resposta de seguimento mantém proteção e sua correção também persiste só a nota',async()=>{
  let body;
  const first=await assistant.askAssistant({messages:[{role:'user',text:'Consulta fictícia'}],screen:'financeiro',invoke:async()=>({data:{answer:'SEGREDO_PRIMEIRA_RESPOSTA',links:[],financeiro:true},error:null})});
  assert.equal(first.financeiro,true);
  const next=await assistant.askAssistant({messages:[{role:'assistant',text:first.answer,financeiro:first.financeiro},{role:'user',text:'Explique o período.'}],screen:'inicio',invoke:async(_,{body:input})=>{body=input;return {data:{answer:'SEGREDO_SEGUIMENTO',links:[]},error:null}}});
  assert.equal(body.financeiroContexto,true);assert.equal(next.financeiro,true);
  const saved=await correction.submitAiCorrection({...financial,financial:next.financeiro,aiOutput:{answer:next.answer}});
  assert.deepEqual(saved.ai_output,{});assert.deepEqual(saved.context_snapshot,{financeiro:true});assert.doesNotMatch(JSON.stringify(saved),/SEGREDO/);
  const normal=await assistant.askAssistant({messages:[{role:'user',text:'Como funciona a Agenda?'}],invoke:async()=>({data:{answer:'Ajuda geral.',links:[]},error:null})});
  assert.equal('financeiro' in normal,false,'conversa comum mantém contrato anterior');
  const failed=await assistant.askAssistant({messages:[{role:'user',text:'Consulta financeira fictícia'}],dados:{tipo:'financeiro',motivo:'erro'},invoke:async()=>({data:{answer:'Não consegui consultar.',links:[]},error:null})});assert.equal(failed.financeiro,true,'tentativa financeira sem dados também não deve guardar a pergunta');
});
const index=await readFile(new URL('../../../supabase/functions/clinic-assistant/index.ts',import.meta.url),'utf8');
const promptCode=stripTypeScriptTypes(index.slice(index.indexOf('const CAPABILITIES ='),index.indexOf('type IncomingMessage')));
const prompt=new Function('SCREEN_LABELS','ROLE_LABELS','ASSISTANT_SECTION_LINKS','upcomingDays','ASSISTANT_SCALE_CATALOG','helpIndex',promptCode+';return buildSystemPrompt;')({inicio:'Tela inicial'},{admin:'administração',professional:'quem atende',reception:'recepção'},ASSISTANT_SECTION_LINKS,upcomingDays,[],()=>[]);
test('prompt real: consulta restrita, sem inventar dinheiro/causa, critério e Financeiro como referência',()=>{
  const result=prompt('admin','inicio',[],[],{callerName:'Autora',team:[],dados:null,scales:false,consultationAttempted:true});
  for(const pattern of [/Fora da consulta financeira autorizada, não repita nome ou outros dados pessoais de paciente/,/financeiro: SOMENTE se quem pergunta é administração/,/Sem dados ou com motivo/,/não invente valores/,/não trate indisponibilidade como zero/,/Sempre diga de\/ate e o criterio recebido/,/total é quantidade de linhas, não dinheiro/,/Não afirme causa além do rótulo recebido/,/não prova que houve arquivamento, exclusão ou anonimização/,/aguardando_lote_operadora/,/O Financeiro é a referência/,/(?:não|nem) envia cobrança por conta própria/,/não estime idade ausente/,/Consulta já tentada: sim/])assert.match(result,pattern);
  assert.match(result,/Consultar recebidos, a receber e atrasados por período/);
  for(const role of ['professional','reception'])assert.doesNotMatch(prompt(role,'inicio',[],[],{team:[],dados:null,scales:false}).split('SUAS_CAPACIDADES:')[1],/- Consultar recebidos/);
  assert.match(index,/dados\?\.tipo === 'financeiro' \|\| requestBody.financeiroContexto === true/);
  assert.match(index,/enforceAiBudget/);assert.match(index,/usageContextFor/);
});
test('ajuda FIN-5/LGPD e UI: nota-only, aviso, sem Aprovar financeiro, regra e espelho sem mudar dados da 016',async()=>{
  const help=JSON.stringify(ASSISTANT_HELP);assert.match(help,/primeiro nome e idade/);assert.match(help,/nunca sobrenome, data de nascimento ou dado clínico/);assert.match(help,/saem do Brasil/);assert.match(help,/Estados Unidos/);assert.match(help,/somente sua nota/);
  const [button,panel,component,store,agents]=await Promise.all(['components/ui/AiCorrectionButton.jsx','components/panels/AICorrectionsPanel.jsx','components/assistant/ClinicAssistant.jsx','components/assistant/assistantStore.js'].map(file=>readFile(new URL('../../src/'+file,import.meta.url),'utf8')).concat(readFile(new URL('../../../AGENTS.md',import.meta.url),'utf8')));
  assert.match(button,/const saidText = privateFinancial \? ''/);assert.match(button,/Não escreva nome de paciente, valores, datas/);assert.match(button,/!privateFinancial && <label/);
  assert.match(panel,/!isFinancialCorrection\(selected\) && <button[\s\S]*?Aprovar/);
  assert.match(component,/<ScreenHelp topic=\{ASSISTANT_HELP\}/);assert.match(component,/contextSnapshot=\{message.financeiro \? \{ financeiro: true \}/);assert.match(store,/reply.financeiro === true \? \{ financeiro: true \}/);
  assert.match(agents,/FIN-6: correção financeira fica pendente/);assert.doesNotMatch(agents,/A assistente ainda NÃO lê o financeiro/);
});

// QA (review da ACUP-017): a nota financeira também não pode ser levada à base curada global pelo painel.
test('QA: painel do SuperAdm não oferece "Promover para base curada" para correção financeira', async () => {
  const panel = await readFile(new URL('../../src/components/panels/AICorrectionsPanel.jsx', import.meta.url), 'utf8');
  assert.match(panel, /\{!isFinancialCorrection\(selected\) && <button className="quiet-button" type="button" onClick=\{\(\) => promote\(selected\)\}>\r?\n\s+Promover para base curada/);
  assert.equal((panel.match(/Promover para base curada/g) || []).length, 1, 'um único botão de promover, e ele é condicionado');
});
