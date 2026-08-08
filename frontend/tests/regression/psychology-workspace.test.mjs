import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import {
  PSI_ANAMNESE_RECORD_TYPE,
  PSI_NEURO_RECORD_TYPE,
  PSYCHOLOGY_AXES,
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_CONTENT_STATUS,
  PSYCHOLOGY_MODALITIES,
  PSYCHOLOGY_PLACEHOLDER_TABS,
  PSYCHOLOGY_RISK_GROUP,
  PSYCHOLOGY_RISK_ITEMS,
  PSYCHOLOGY_RISK_REMINDER,
  PSYCHOLOGY_TABS,
  PSYCHOLOGY_TEXT_FIELDS,
  appendQuickWord,
  buildPsychologyWorkspaceSummary,
  createEmptyPsychologySession,
  getPsychologyModality,
  getPsychologySelected,
  hasPsychologyRiskSelected,
  psychologyChecklists,
  psychologyRiskChecklist,
} from '../../src/data/psychologyAnamnese.js';
import { checklists } from '../../src/data/checklists.js';
import {
  PSYCHOLOGY_INTAKE_PROFILES,
  PSYCHOLOGY_WELCOME_PATHS,
  getPsychologyProfileSections,
  isPsychologyPathEligible,
} from '../../src/data/psychologyIntakeProfiles.js';
import {
  createEmptyNeuropsychologyEvaluation,
  buildNeuropsychologySummary,
} from '../../src/data/neuropsychologyEvaluation.js';

// Lê um componente do workspace de Psi pelo nome do arquivo.
async function readPsi(file) {
  return readFile(path.resolve(root, 'src/components/psychology', file), 'utf8');
}

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

test('modalidades: anamnese e avaliação estão abertas, com registros independentes', () => {
  assert.equal(PSYCHOLOGY_MODALITIES.length, 2);
  assert.equal(getPsychologyModality('anamnese_clinica')?.available, true);
  assert.equal(getPsychologyModality('avaliacao_neuropsicologica')?.available, true);
  // record_types distintos: fluxos distintos, registros distintos.
  const types = new Set(PSYCHOLOGY_MODALITIES.map(m => m.recordType));
  assert.equal(types.size, 2);
  assert.ok(types.has(PSI_ANAMNESE_RECORD_TYPE));
  assert.ok(types.has(PSI_NEURO_RECORD_TYPE));
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
  // Rótulos vêm do rascunho dos livros (psychAnamneseDraft.json).
  for (const item of ['Ideação e comportamento suicida', 'Autolesão não suicida', 'Risco a terceiros / heteroagressividade']) {
    assert.ok(psychologyRiskChecklist.includes(item), `item crítico ausente: ${item}`);
  }
  // Cada item de risco carrega guia de triagem e o que observar.
  for (const item of PSYCHOLOGY_RISK_ITEMS) {
    assert.ok(item.label && item.id, 'item de risco precisa de label e id');
    assert.ok(Array.isArray(item.screening), `risco ${item.label} sem perguntas de triagem`);
    assert.ok(Array.isArray(item.observe), `risco ${item.label} sem sinais a observar`);
  }
  assert.deepEqual(psychologyRiskChecklist, PSYCHOLOGY_RISK_ITEMS.map(i => i.label));
  // Invariante de todas as disciplinas: o sistema lembra, não decide.
  assert.match(PSYCHOLOGY_RISK_REMINDER, /decisão é sempre sua/);
});

test('eixos de avaliação: andaime de raciocínio com o que explorar (a "avaliação")', () => {
  assert.ok(PSYCHOLOGY_AXES.length >= 5, 'esperado um conjunto de eixos de avaliação');
  for (const axis of PSYCHOLOGY_AXES) {
    assert.ok(axis.id && axis.label, 'eixo precisa de id e label');
    assert.ok(Array.isArray(axis.explore), `eixo ${axis.label} sem prompts de exploração`);
  }
});

test('campos livres trazem guia de perguntas do roteiro extraído (escuta menos "fraca")', () => {
  for (const field of PSYCHOLOGY_TEXT_FIELDS) {
    assert.ok(Array.isArray(field.questionGuide), `campo ${field.id} sem questionGuide`);
  }
  const demanda = PSYCHOLOGY_TEXT_FIELDS.find(f => f.id === 'demanda');
  assert.ok(demanda.questionGuide.length > 0, 'demanda deve ter perguntas guia');
});

test('sessão vazia + helpers de seleção seguem o formato grupo:item do motor', () => {
  const session = createEmptyPsychologySession();
  assert.equal(session.modality, 'anamnese_clinica');
  for (const field of PSYCHOLOGY_TEXT_FIELDS) {
    assert.ok(Object.hasOwn(session.fields, field.id), `sessão sem campo comum ${field.id}`);
  }
  assert.equal(session.intakeProfile, null);
  assert.deepEqual(session.fieldInformants, {});
  assert.deepEqual(session.responseHistory, {});
  assert.deepEqual(session.selectedMap, {});
  // Leitura da IA nasce vazia e só existe quando gerada (rascunho persistido).
  assert.equal(session.aiReading, null);
  // Evolução e Relatório vivem no mesmo registro da sessão (sem tabela nova).
  assert.deepEqual(session.evolucoes, []);
  assert.deepEqual(session.relatorio, {});

  const selectedMap = {
    'psiHumor:Tristeza persistente': true,
    'psiHumor:Apatia / desânimo': false,
    'psiRisco:Autolesão': true,
  };
  assert.deepEqual(getPsychologySelected(selectedMap, 'psiHumor'), ['Tristeza persistente']);
  assert.equal(hasPsychologyRiskSelected(selectedMap), true);
  assert.equal(hasPsychologyRiskSelected({}), false);
});

test('shell: sidebar clínica reusada, disciplina no registro e roteamento por aba', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/PsychologyWorkspace.jsx'),
    'utf8',
  );
  // Registros de Psi carregam a disciplina (RPC + payload).
  assert.ok(source.includes("'psicologia'"), 'save deve declarar discipline psicologia');
  assert.ok(source.includes('PSI_ANAMNESE_RECORD_TYPE'));
  // Matrícula inicial criada na disciplina certa ao cadastrar por aqui.
  assert.ok(source.includes('initialDiscipline="psicologia"'));
  // Regressão de layout: shell clínico padrão com sidebar azul e rail direito.
  assert.ok(source.includes('import { Sidebar }'), 'Psi deve reutilizar a sidebar clínica');
  assert.ok(source.includes('className="app psi-app"'), 'Psi deve usar o shell .app padrão');
  assert.ok(source.includes('className="assistant-rail no-print"'), 'Psi deve ter rail lateral de IA');
  // Quick-word chips: digitação mínima (o append vive no shell).
  assert.ok(source.includes('appendQuickWord'));
  // Roteia para os painéis próprios de cada aba.
  for (const panel of ['PsychologyPathChooser', 'PsychologyAnamnese', 'PsychologyNeuroAssessment', 'PsychologyHypotheses', 'PsychologyEvolucao', 'PsychologyRelatorio', 'PsychologyNeuroReport', 'PsychologyPlaceholder']) {
    assert.ok(source.includes(panel), `shell deve rotear para ${panel}`);
  }
  assert.ok(source.includes('PSI_NEURO_RECORD_TYPE'), 'avaliação deve usar record_type independente');
});

test('sidebar do Plano C: grupos completos e SEM vocabulário de MTC (isolamento)', async () => {
  const source = await readFile(
    path.resolve(root, 'src/components/PsychologyWorkspace.jsx'),
    'utf8',
  );
  // Abas do Plano C presentes.
  for (const tab of ['PAINEL', 'ANAMNESE', 'NEURO', 'SINTESE', 'HIPOTESES', 'OBJETIVOS', 'PLANO', 'EVOLUCAO', 'RELATORIO', 'BIBLIOTECA']) {
    assert.ok(source.includes(`PSYCHOLOGY_TABS.${tab}`), `sidebar sem a aba ${tab}`);
  }
  // Nomes teóricos corretos (Formulação/Plano de cuidado), não "Diagnóstico" solto.
  assert.ok(source.includes('Formulação clínica') && source.includes('Plano de cuidado'));
  // Nenhum conceito de MTC vaza para a navegação de Psi.
  for (const mtc of ['Língua', 'Pulso', 'Protocolo', 'Raciocínio Clínico', 'Diagnóstico']) {
    assert.ok(!source.includes(`'${mtc}'`), `Psi não deve navegar por "${mtc}" (MTC)`);
  }
});

test('rail: revisão assistida + leitura, ações honestas e sem o antigo "marcações"', async () => {
  const rail = await readPsi('PsychologyAssistantRail.jsx');
  // As duas superfícies de IA vivem no rail, com o botão Corrigir.
  assert.ok(rail.includes('suggestPsychologyMarks'), 'revisão assistida deve estar ligada');
  assert.ok(rail.includes('generatePsychologyReading'), 'leitura em rascunho deve estar ligada');
  assert.ok(rail.includes('AiCorrectionButton'), 'toda superfície de IA precisa do botão Corrigir');
  assert.ok(rail.includes('AI_SURFACES.PSYCH_MARKS') && rail.includes('AI_SURFACES.PSYCH_READING'));
  // Nomenclatura corrigida: "Revisão assistida", não "Assistente de marcações".
  assert.ok(rail.includes('Revisão assistida da anamnese'), 'novo nome da superfície');
  assert.ok(!/Assistente de marcações/.test(rail), 'o rótulo antigo "marcações" foi removido');
  // Ações honestas: confirmar na ficha / não se aplica / corrigir interpretação.
  assert.ok(rail.includes('Confirmar na ficha'), 'ação de confirmar no registro');
  assert.ok(rail.includes('Não se aplica'), 'ação de descartar a sugestão');
  assert.ok(rail.includes('Corrigir interpretação'), 'ação que ensina a IA');
  assert.ok(!/>\s*✓ Aceitar\s*</.test(rail) && !/>\s*Ignorar\s*</.test(rail), 'sem os rótulos antigos aceitar/ignorar');
  // Percentual é preenchimento, não confiança diagnóstica.
  assert.match(rail, /Mede apenas o preenchimento da ficha; não representa confiança diagnóstica/);
  // Leitura da IA aparece uma única vez (sem duplicar no formulário).
  assert.equal(rail.match(/<PsychologyAiReading/g)?.length, 1, 'leitura única, dentro do rail');
});

test('anamnese: só o formulário (a IA saiu do meio do formulário para o rail)', async () => {
  const anamnese = await readPsi('PsychologyAnamnese.jsx');
  assert.ok(anamnese.includes('CheckGrid') && anamnese.includes('QuickWordChips'), 'formulário mantém checklists e chips');
  // A IA NÃO fica mais dentro do formulário.
  assert.ok(!anamnese.includes('suggestPsychologyMarks'), 'a revisão da IA não fica no formulário');
  assert.ok(!anamnese.includes('PsychologyAiReading'), 'a leitura da IA não fica no formulário');
});

test('placeholders ficam apenas nas abas ainda não construídas', async () => {
  const placeholder = await readPsi('PsychologyPlaceholder.jsx');
  assert.ok(placeholder.includes('Em construção'), 'placeholder deve avisar que está em construção');
  // As abas placeholder não incluem as já funcionais (anamnese/evolução/relatório/painel).
  for (const funcional of [PSYCHOLOGY_TABS.PAINEL, PSYCHOLOGY_TABS.ANAMNESE, PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES, PSYCHOLOGY_TABS.NEURO, PSYCHOLOGY_TABS.HIPOTESES, PSYCHOLOGY_TABS.EVOLUCAO, PSYCHOLOGY_TABS.RELATORIO]) {
    assert.ok(!PSYCHOLOGY_PLACEHOLDER_TABS.includes(funcional), `${funcional} não deveria ser placeholder`);
  }
  for (const futura of [PSYCHOLOGY_TABS.SINTESE, PSYCHOLOGY_TABS.OBJETIVOS, PSYCHOLOGY_TABS.PLANO, PSYCHOLOGY_TABS.BIBLIOTECA]) {
    assert.ok(PSYCHOLOGY_PLACEHOLDER_TABS.includes(futura), `${futura} deveria permanecer placeholder`);
  }
});

test('boas-vindas tem 3 caminhos e as anamneses abrem os 4 perfis solicitados', () => {
  assert.deepEqual(PSYCHOLOGY_WELCOME_PATHS.map(path => path.id), [
    'infantojuvenil', 'adulto', 'avaliacao_neuropsicologica',
  ]);
  assert.deepEqual(PSYCHOLOGY_INTAKE_PROFILES.map(profile => profile.id), [
    'infantojuvenil_feminino', 'infantojuvenil_masculino', 'adulto_feminino', 'adulto_masculino',
  ]);
  assert.equal(isPsychologyPathEligible('infantojuvenil', 17), true);
  assert.equal(isPsychologyPathEligible('infantojuvenil', 18), false);
  assert.equal(isPsychologyPathEligible('adulto', 17), false);
  assert.equal(isPsychologyPathEligible('adulto', 18), true);
  for (const profile of PSYCHOLOGY_INTAKE_PROFILES) {
    const sections = getPsychologyProfileSections(profile.id);
    // O roteiro fixo depende só da faixa etária (adulto 5, infantil 7); o
    // contexto que antes vinha por sexo virou módulo aberto por pertinência.
    assert.ok(sections.length >= 5, `${profile.id} precisa de roteiro amplo`);
    const fields = sections.flatMap(section => section.fields);
    assert.ok(fields.length >= 15, `${profile.id} precisa de roteiro com profundidade`);
    for (const field of fields) {
      assert.ok(field.quickWords.length >= 4, `${field.id} precisa de botões de digitação rápida`);
    }
  }
});

test('anamnese infantil identifica informante e preserva versões para comparação futura', async () => {
  const anamnese = await readPsi('PsychologyAnamnese.jsx');
  const shell = await readFile(path.resolve(root, 'src/components/PsychologyWorkspace.jsx'), 'utf8');
  assert.ok(anamnese.includes('Quem respondeu'));
  assert.ok(anamnese.includes('Guardar esta versão e repetir depois'));
  assert.ok(anamnese.includes('session.responseHistory'));
  assert.ok(shell.includes('archiveFieldResponse'));
  assert.ok(shell.includes('informantLabel'));
});

test('perguntas da IA só entram por seleção e ganham aba com resposta e informante', async () => {
  const session = createEmptyPsychologySession();
  assert.deepEqual(session.complementaryQuestions, []);

  const rail = await readPsi('PsychologyAssistantRail.jsx');
  assert.ok(rail.includes('type="checkbox"'), 'perguntas sugeridas precisam ser selecionáveis');
  assert.ok(rail.includes('onToggleComplementaryQuestion'), 'seleção precisa persistir no workspace');
  assert.ok(rail.includes('Selecionar para incluir na anamnese'));

  const complementary = await readPsi('PsychologyComplementaryQuestions.jsx');
  for (const text of ['Perguntas complementares', 'Quem respondeu', 'Resposta / registro profissional']) {
    assert.ok(complementary.includes(text), `aba complementar sem "${text}"`);
  }
  assert.ok(complementary.includes('spellCheck'), 'resposta precisa manter correção pt-BR');

  const workspace = await readFile(path.resolve(root, 'src/components/PsychologyWorkspace.jsx'), 'utf8');
  assert.ok(workspace.includes('PSYCHOLOGY_TABS.PERGUNTAS_COMPLEMENTARES'));
  assert.ok(workspace.includes('toggleComplementaryQuestion'));
  assert.ok(workspace.includes('complementaryQuestions'));
});

test('avaliação nasce com instrumentos, 10 sessões/evoluções, integração e relatório separado', async () => {
  const evaluation = createEmptyNeuropsychologyEvaluation();
  assert.equal(evaluation.sessions.length, 10);
  assert.ok(evaluation.instruments.length >= 4);
  assert.ok(Object.hasOwn(evaluation.integration, 'professionalConclusion'));
  assert.deepEqual(evaluation.report, {});
  const summary = buildNeuropsychologySummary(evaluation);
  assert.equal(summary.plannedSessions, 10);
  const assessment = await readPsi('PsychologyNeuroAssessment.jsx');
  for (const text of ['Instrumentos e procedimentos', 'Sessões e evoluções da avaliação', 'Integração profissional']) {
    assert.ok(assessment.includes(text));
  }
  const report = await readPsi('PsychologyNeuroReport.jsx');
  assert.ok(report.includes('generateNeuropsychologyReport'));
  assert.ok(report.includes('pendente de revisão'));
});

test('campos de texto ativam corretor ortográfico pt-BR sem substituir silenciosamente', async () => {
  const source = await readFile(path.resolve(root, 'src/components/ui/FieldInput.jsx'), 'utf8');
  assert.ok(source.includes('lang="pt-BR"'));
  assert.ok(source.includes('spellCheck'));
  assert.ok(source.includes('autoCorrect="on"'));
});

test('evolução de Psi grava temas/intervenções (conteúdo psicológico, sem métricas de MTC)', async () => {
  const evo = await readPsi('PsychologyEvolucao.jsx');
  assert.ok(evo.includes('onEvolucoesChange'), 'evolução persiste via session.evolucoes');
  for (const campo of ['temas', 'intervencoes', 'proximosPassos']) {
    assert.ok(evo.includes(campo), `evolução deve registrar ${campo}`);
  }
  // Nada de radar/pontos/dor-sono-ansiedade da MTC.
  assert.ok(!evo.includes('RadarLine') && !evo.includes('pontosUsados'), 'sem métricas/pontos de MTC');
});

test('relatório de Psi reusa a infra de impressão compartilhada e nasce como rascunho revisável', async () => {
  const rel = await readPsi('PsychologyRelatorio.jsx');
  assert.ok(rel.includes("from '../report/reportPrint'"), 'papel timbrado/rodapé compartilhados');
  assert.ok(rel.includes("from '../report/reportPagination'"), 'paginação compartilhada');
  // Gate: rascunho de IA exige revisão profissional antes de imprimir.
  assert.ok(rel.includes('aiDraftPendingReview'), 'gate de revisão do rascunho de IA');
  assert.ok(rel.includes('generatePsychologyReading'), 'rascunho reusa a leitura psych-reading');
  assert.ok(rel.includes('answeredComplementaryQuestions'), 'respostas complementares entram no relatório');
  assert.ok(rel.includes('Informações complementares'), 'relatório precisa identificar a nova seção');
  assert.ok(!rel.includes('reading.questions.join'), 'pergunta não selecionada não pode entrar no relatório');
});

test('resumo de andamento mede preenchimento e conta evoluções', () => {
  const session = createEmptyPsychologySession();
  session.fields.demanda = 'ansiedade';
  session.evolucoes = [{ sessao: 1, data: 'hoje', temas: 'x' }];
  const summary = buildPsychologyWorkspaceSummary(session);
  assert.equal(summary.filledFields, 1);
  assert.equal(summary.sessionCount, 1);
  assert.equal(summary.complementaryQuestions, 0);
  assert.equal(summary.answeredComplementaryQuestions, 0);
  assert.ok(summary.completion > 0 && summary.completion <= 100);
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
