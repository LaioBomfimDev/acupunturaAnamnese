// ============================================================
// Consulta online pelo sistema (Psicologia, Daily, 20/10/2026).
// Prévias escolhidas: entrada do paciente A, sala da psicóloga C,
// consentimento A (com a edição da usuária: a gravação ficou só com a
// pergunta e o link do termo).
//
// O que trava aqui:
//   * regra igual na tela e na Edge Function (área, janelas, status,
//     versões dos termos);
//   * câmera e microfone liberados só em /consulta-online e /sala-online;
//   * consentimento sem nada marcado de saída, guardado com versão, sem
//     leitura direta, e apagado na exclusão de paciente;
//   * sala só da profissional do atendimento, com os bloqueios de conta;
//   * nada gravado no Daily (sem gravação em nuvem, sem chat);
//   * evolução continua só na tela Evoluções (na sala, só leitura);
//   * minutos do mês no Daily contados no servidor, sem dado de paciente.
// ============================================================

import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repo = path.resolve(root, '..');
const read = file => readFile(path.join(root, file), 'utf8');
const readRepo = file => readFile(path.join(repo, file), 'utf8');
const loadRepo = file => import(pathToFileURL(path.join(repo, file)).href);

// Módulos do src com import sem extensão: o Vite resolve, como nos outros testes.
let server;
const load = file => server.ssrLoadModule(`/${file}`);

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
});

after(async () => {
  await server?.close();
});

const PSI_ONLINE = {
  id: 'a1',
  kind: 'appointment',
  modality: 'online',
  discipline: 'psicologia',
  status: 'scheduled',
  professional_id: 'p1',
};
const ON = { onlineRoom: true };

// ---------- regra igual na tela e no servidor ----------

test('tela e Edge Function usam as mesmas regras da sala', async () => {
  const front = await load('src/utils/onlineConsultation.js');
  const terms = await load('src/data/onlineConsentTerms.js');
  const back = await loadRepo('supabase/functions/_shared/onlineConsultation.ts');

  assert.deepEqual(front.ONLINE_ROOM_DISCIPLINES, ['psicologia'], 'só a Psicologia atende online pelo sistema');
  assert.deepEqual(back.ONLINE_ROOM_DISCIPLINES, front.ONLINE_ROOM_DISCIPLINES);
  assert.deepEqual(JSON.parse(JSON.stringify(back.ONLINE_ROOM_WINDOWS)), JSON.parse(JSON.stringify(front.ONLINE_ROOM_WINDOWS)));
  assert.deepEqual(back.ONLINE_ROOM_STATUSES, front.ONLINE_ROOM_STATUSES);
  assert.deepEqual({ ...back.ONLINE_CONSENT_TERM_VERSIONS }, { ...terms.ONLINE_CONSENT_TERM_VERSIONS });
  assert.equal(back.DAILY_FREE_PARTICIPANT_MINUTES, front.DAILY_FREE_PARTICIPANT_MINUTES);
  assert.equal(back.CONSULT_PARTICIPANT_MINUTES, front.CONSULT_PARTICIPANT_MINUTES);
  assert.equal(front.DAILY_FREE_PARTICIPANT_MINUTES / front.CONSULT_PARTICIPANT_MINUTES, 100, '100 consultas de 50 min a dois por mês');

  for (const settings of [ON, { onlineRoom: false }, {}, null]) {
    for (const appointment of [
      PSI_ONLINE,
      { ...PSI_ONLINE, modality: 'presencial' },
      { ...PSI_ONLINE, discipline: 'acupuntura' },
      { ...PSI_ONLINE, kind: 'block' },
    ]) {
      assert.equal(
        back.isOnlineRoomAppointment(appointment, settings),
        front.isOnlineRoomAppointment(appointment, settings),
        `${JSON.stringify(appointment)} com ${JSON.stringify(settings)}`,
      );
    }
  }
  assert.equal(back.shortName('Laize de Souza Lima'), 'Laize de L.');
  assert.equal(back.firstName('Ana Beatriz Moura'), 'Ana');
});

test('sala só para online da Psicologia, com a sala ligada e para quem atende', async () => {
  const { canEnterOnlineRoom, isOnlineRoomAppointment } = await load('src/utils/onlineConsultation.js');
  const profile = { id: 'p1' };

  assert.equal(isOnlineRoomAppointment(PSI_ONLINE, ON), true);
  assert.equal(isOnlineRoomAppointment(PSI_ONLINE, { onlineRoom: false }), false, 'sala desligada: Agenda como hoje');
  assert.equal(isOnlineRoomAppointment(PSI_ONLINE, { onlineRoom: 'sim' }), false, 'só true literal liga');
  assert.equal(isOnlineRoomAppointment({ ...PSI_ONLINE, modality: null }, ON), false, 'sem modalidade conta como presencial');
  assert.equal(isOnlineRoomAppointment({ ...PSI_ONLINE, discipline: 'neuropsicologia' }, ON), false);

  assert.equal(canEnterOnlineRoom(PSI_ONLINE, profile, ON), true);
  assert.equal(canEnterOnlineRoom(PSI_ONLINE, { id: 'outra' }, ON), false, 'colega não entra na sala');
  assert.equal(canEnterOnlineRoom(PSI_ONLINE, null, ON), false);
  for (const status of ['cancelled', 'excused', 'no_show']) {
    assert.equal(canEnterOnlineRoom({ ...PSI_ONLINE, status }, profile, ON), false, status);
  }
  assert.equal(canEnterOnlineRoom({ ...PSI_ONLINE, status: 'attended' }, profile, ON), true, 'marcou Atendido antes de terminar');
});

test('janela da sala: paciente 15 min antes até 1 h depois; quem atende 30 min antes até 2 h depois', async () => {
  const { roomWindow, roomWindowState, opensAtLabel, formatClock } = await load('src/utils/onlineConsultation.js');
  const back = await loadRepo('supabase/functions/_shared/onlineConsultation.ts');
  const start = '2026-10-20T17:00:00.000Z';
  const end = '2026-10-20T17:50:00.000Z';
  const minute = 60_000;

  const patient = roomWindow(start, end, 'patient');
  assert.equal(patient.opensAt, Date.parse(start) - 15 * minute);
  assert.equal(patient.closesAt, Date.parse(end) + 60 * minute);
  const professional = roomWindow(start, end, 'professional');
  assert.equal(professional.opensAt, Date.parse(start) - 30 * minute);
  assert.equal(professional.closesAt, Date.parse(end) + 120 * minute);
  assert.deepEqual(back.roomWindow(start, end, 'patient'), patient);
  assert.deepEqual(back.roomWindow(start, end, 'professional'), professional);

  assert.equal(roomWindowState(patient, patient.opensAt - 1), 'early');
  assert.equal(roomWindowState(patient, patient.opensAt), 'open');
  assert.equal(roomWindowState(patient, patient.closesAt + 1), 'ended');
  assert.equal(roomWindowState(null), 'ended');
  assert.equal(back.roomWindowState(patient, patient.opensAt - 1), 'early');
  assert.equal(roomWindow('lixo', end, 'patient'), null);

  assert.equal(opensAtLabel(patient, 'patient'), `A sala abre às ${formatClock(patient.opensAt)}, 15 minutos antes do horário.`);
});

// Achado de 20/10/2026, no primeiro teste real: a conta do Daily sem forma de
// pagamento recusa toda chamada (errorMsg 'account-missing-payment-method'),
// a página do paciente não ouvia o evento 'error' e só dizia "Tente de novo".
test('erro do Daily vira mensagem clara para quem atende e para o paciente', async () => {
  const { dailyErrorMessage } = await load('src/utils/onlineConsultation.js');
  assert.match(dailyErrorMessage('account-missing-payment-method', 'professional'), /sem forma de pagamento.*Billing/);
  assert.equal(dailyErrorMessage('account-missing-payment-method', 'patient'), 'A sala online da clínica ainda não foi liberada. Avise a clínica.');
  assert.doesNotMatch(dailyErrorMessage('account-missing-payment-method', 'patient'), /pagamento|Daily/, 'paciente não vê assunto de cobrança');
  assert.equal(dailyErrorMessage('meeting-token-expired', 'patient'), 'O horário desta sala acabou.');
  assert.equal(dailyErrorMessage('', 'professional'), 'A chamada não abriu.');

  const page = await read('src/OnlineConsultationPage.jsx');
  assert.match(page, /frame\.on\('error', event => \{/, 'a página do paciente ouve o erro do Daily');
  assert.match(page, /dailyErrorMessage\(dailyError \|\| err\.errorMsg, 'patient'\)/);
  const hook = await read('src/hooks/useDailyCall.js');
  assert.match(hook, /setError\(dailyErrorMessage\(dailyError, 'professional'\)\)/);
});

test('sala de quem atende: tela cheia do vídeo, com volta para a sala como estava', async () => {
  const room = await read('src/components/online/OnlineRoomPage.jsx');
  assert.match(room, /stage\.requestFullscreen\(\)/, 'tela cheia do navegador');
  assert.match(room, /document\.exitFullscreen\(\)/);
  assert.match(room, /addEventListener\('fullscreenchange'/, 'Esc do navegador devolve o botão ao estado certo');
  assert.match(room, /useDismiss\(\{ open: covering, onClose: \(\) => setCovering\(false\) \}\)/, 'no iPhone, o vídeo cobre a janela e sai com Esc');
  assert.match(room, /aria-label=\{expanded \? 'Sair da tela cheia' : 'Tela cheia'\}/);
  const css = await read('src/styles/onlineRoom.css');
  assert.match(css, /\.osr-stage\.is-covering \{\r?\n\s*position: fixed;/);
});

// ---------- termos ----------

test('termos: versão no formato do banco, os três pontos da prévia A e a pergunta da gravação', async () => {
  const terms = await load('src/data/onlineConsentTerms.js');
  const migration = await readRepo('supabase/migrations/20261020_online_consultation.sql');
  const versionRule = migration.match(/term_version ~ '([^']+)'/)?.[1];
  assert.ok(versionRule, 'CHECK da versão do termo');
  for (const version of Object.values(terms.ONLINE_CONSENT_TERM_VERSIONS)) {
    assert.match(version, new RegExp(versionRule), version);
  }

  assert.deepEqual([...terms.TELECONSULTATION_TERM.summary], [
    'A consulta é por vídeo, com o mesmo sigilo do consultório.',
    'Fique num lugar reservado e, se puder, use fone.',
    'Se a ligação cair, a clínica liga para o seu telefone.',
  ]);
  assert.equal(terms.RECORDING_TERM.question, 'Autoriza gravar a sessão?');
  const tele = terms.TELECONSULTATION_TERM.paragraphs.join(' ');
  assert.match(tele, /Daily/, 'diz por onde o vídeo passa');
  assert.match(tele, /responsável/, 'menor de idade: quem responde é o responsável');
  assert.match(terms.RECORDING_TERM.paragraphs.join(' '), /opcional/);
  assert.equal(terms.ONLINE_CONSENT_STATUS, 'rascunho', 'texto final é da psicóloga com revisão jurídica');
});

test('consentimento começa sem nada marcado e só segue com as duas respostas', async () => {
  const page = await read('src/OnlineConsultationPage.jsx');
  const consent = page.match(/function ConsentStep[\s\S]*?\r?\n}\r?\n/)?.[0] || '';
  assert.ok(consent, 'ConsentStep');
  assert.match(consent, /const \[agreed, setAgreed\] = useState\(false\)/, 'concordar nunca vem marcado');
  assert.match(consent, /const \[recording, setRecording\] = useState\(''\)/, 'gravar não tem resposta padrão');
  assert.match(consent, /disabled=\{!agreed \|\| !recording \|\| saving\}/);
  assert.match(consent, /<legend>\{RECORDING_TERM\.question\}<\/legend>/, 'a pergunta da gravação fica visível');
  assert.match(consent, /Ler o termo completo/);
  assert.match(consent, /Ler o termo de gravação/);
  // Edição da usuária na prévia: a parte da gravação ficou sem título e sem frases.
  assert.doesNotMatch(consent, /RECORDING_TERM\.title/);
  assert.doesNotMatch(consent, /<input[^>]*\bchecked\b(?!=)/, 'nenhuma caixa marcada no código');
});

// ---------- banco ----------

test('consentimento: tabela sem leitura direta, prova de quando, apagada na exclusão', async () => {
  const sql = await readRepo('supabase/migrations/20261020_online_consultation.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.patient_consents/);
  assert.match(sql, /ALTER TABLE public\.patient_consents ENABLE ROW LEVEL SECURITY;/);
  assert.match(sql, /REVOKE ALL ON TABLE public\.patient_consents FROM PUBLIC, anon, authenticated;/);
  assert.doesNotMatch(sql, /CREATE POLICY[^;]*patient_consents/, 'nenhuma policy: só a Edge Function');
  assert.match(sql, /kind IN \('teleatendimento', 'gravacao_sessao'\)/);
  assert.match(sql, /decision IN \('accepted', 'declined', 'revoked'\)/);
  assert.match(sql, /source = 'link_paciente' AND recorded_by IS NULL/);
  assert.match(sql, /source = 'profissional' AND recorded_by IS NOT NULL/);
  assert.match(sql, /appointment_id UUID REFERENCES public\.appointments\(id\) ON DELETE SET NULL/, 'excluir o agendamento não apaga a prova');
  assert.match(sql, /term_version IS NOT NULL AND term_version ~/, 'CHECK com IS NOT NULL (AGENTS.md §9)');
  assert.ok(sql.indexOf('DO $requires$') < sql.indexOf('CREATE OR REPLACE FUNCTION'), 'confere antes de recriar');
});

test('exclusão de paciente: versão de 20261016 + snapshot e DELETE dos consentimentos', async () => {
  const name = 'admin_decide_patient_deletion';
  const body = sql => sql.match(new RegExp(String.raw`CREATE OR REPLACE FUNCTION public\.${name}\([\s\S]*?\$${name}\$;`))?.[0].split(/\r?\n/);
  const previous = body(await readRepo('supabase/migrations/20261016_clinical_interviews.sql'));
  const updated = body(await readRepo('supabase/migrations/20261020_online_consultation.sql'));
  const NEW_LINES = [
    "    'patient_consents', (SELECT coalesce(jsonb_agg(to_jsonb(pc)), '[]'::jsonb) FROM public.patient_consents pc WHERE pc.patient_id = v_req.patient_id),",
    '  DELETE FROM public.patient_consents WHERE patient_id = v_req.patient_id;',
  ];
  for (const line of NEW_LINES) {
    assert.equal(updated.filter(item => item === line).length, 1, line.trim());
  }
  assert.deepEqual(updated.filter(line => !NEW_LINES.includes(line)), previous, 'o resto é idêntico à versão de 20261016');
});

// ---------- Edge Function ----------

test('Edge Function: quem atende passa pelos bloqueios de conta e só entra no próprio atendimento', async () => {
  const source = await readRepo('supabase/functions/online-consultation/index.ts');
  const staff = source.match(/async function handleProfessional[\s\S]*?\r?\n}\r?\n/)?.[0] || '';
  assert.ok(staff, 'handleProfessional');
  const at = text => {
    const index = staff.indexOf(text);
    assert.ok(index >= 0, text);
    return index;
  };
  assert.ok(at('getCallerProfile(req, supabaseAdmin)') < at('.from(\'appointments\')'), 'confere a sessão antes de ler o atendimento');
  assert.ok(at('assertEdgeAccess(caller.profile, caller.claims)') < at('.from(\'appointments\')'), 'conta suspensa, senha e dois fatores');
  assert.match(staff, /appointment\.professional_id !== caller\.user\.id/);
  assert.match(staff, /appointment\.clinic_id !== caller\.profile\.clinic_id/);
  assert.match(staff, /isOwner|'professional', shortName\(caller\.profile\.full_name\)/);
});

test('Edge Function: paciente com limite por rede e por link, termo antes de entrar e só na janela', async () => {
  const source = await readRepo('supabase/functions/online-consultation/index.ts');
  const patient = source.match(/async function handlePatient[\s\S]*?\r?\n}\r?\n/)?.[0] || '';
  assert.ok(patient, 'handlePatient');
  assert.match(patient, /functionName: 'online-consultation-ip'/);
  assert.match(patient, /functionName: 'online-consultation'/);
  assert.match(patient, /body\.teleatendimento !== true/, 'atendimento online é obrigatório');
  assert.match(patient, /recording !== 'accepted' && recording !== 'declined'/);
  assert.match(patient, /source: 'link_paciente'/);
  assert.match(patient, /recorded_by: null/);
  const join = patient.slice(patient.indexOf("action === 'join'"));
  assert.ok(join.indexOf('needsTeleconsent(consents)') < join.indexOf('issueInvite('), 'termo antes do convite');
  assert.ok(join.indexOf("state !== 'open'") < join.indexOf('issueInvite('), 'janela antes do convite');
  assert.doesNotMatch(source, /confirmation_token:|agenda_settings:/, 'não devolve o token nem a configuração da agenda');
});

test('Daily: sala privada, sem gravação na nuvem nem chat, convite com hora para começar e acabar', async () => {
  const source = await readRepo('supabase/functions/_shared/dailyRooms.ts');
  assert.match(source, /privacy: 'private'/);
  assert.match(source, /enable_chat: false/);
  assert.match(source, /enable_prejoin_ui: false/);
  assert.match(source, /eject_at_room_exp: true/);
  assert.match(source, /eject_at_token_exp: true/);
  assert.match(source, /nbf: Math\.floor/);
  assert.doesNotMatch(source, /enable_recording|enable_transcription/, 'nada gravado nem transcrito no Daily');
  assert.match(source, /Deno\.env\.get\('DAILY_API_KEY'\)/, 'chave só no servidor');
  const config = await readRepo('supabase/config.toml');
  assert.match(config, /\[functions\.online-consultation\][\s\S]*?verify_jwt\s*=\s*false/);
});

test('a chave do Daily nunca vai para o navegador', async () => {
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
    }
  }
  await walk(path.join(root, 'src'));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.doesNotMatch(text, /DAILY_API_KEY|api\.daily\.co/, path.relative(root, file));
    assert.doesNotMatch(text, /^import [^;]*from '@daily-co\/daily-js'/m, `${path.relative(root, file)}: Daily só por import() na hora de entrar`);
  }
});

// ---------- navegador: câmera só nas duas páginas ----------

test('vercel.json: câmera e microfone só em /consulta-online e /sala-online', async () => {
  const vercel = JSON.parse(await read('vercel.json'));
  const rule = source => vercel.headers.find(item => item.source === source);
  const header = (source, key) => rule(source)?.headers.find(item => item.key === key)?.value || '';

  const global = '/((?!consulta-online|sala-online).*)';
  assert.ok(rule(global), 'regra geral deixa as duas páginas de fora');
  assert.match(header(global, 'Permissions-Policy'), /camera=\(\), microphone=\(\)/, 'resto do sistema segue sem câmera');
  assert.doesNotMatch(header(global, 'Content-Security-Policy'), /daily/);

  assert.match(header('/consulta-online', 'Permissions-Policy'), /camera=\*, microphone=\*/, 'sala pronta do Daily (iframe) usa câmera');
  assert.match(header('/consulta-online', 'Content-Security-Policy'), /frame-src https:\/\/\*\.daily\.co/);
  assert.match(header('/sala-online', 'Permissions-Policy'), /camera=\(self\), microphone=\(self\)/);
  assert.match(header('/sala-online', 'Content-Security-Policy'), /frame-src 'none'/);
  for (const source of [global, '/consulta-online', '/sala-online']) {
    assert.equal(header(source, 'X-Frame-Options'), 'DENY', source);
    assert.match(header(source, 'Strict-Transport-Security'), /max-age=31536000/, source);
    assert.match(header(source, 'Content-Security-Policy'), /frame-ancestors 'none'/, source);
  }
  for (const source of ['/consulta-online', '/sala-online']) {
    const csp = header(source, 'Content-Security-Policy');
    assert.match(csp, /script-src 'self' https:\/\/\*\.daily\.co/, `${source}: Daily com avoidEval, sem unsafe-eval`);
    assert.doesNotMatch(csp, /unsafe-eval/, source);
    assert.match(csp, /connect-src[^;]*https:\/\/\*\.daily\.co/, source);
    assert.ok(vercel.rewrites.some(item => item.source === source), `rewrite de ${source}`);
  }

  const hook = await read('src/hooks/useDailyCall.js');
  assert.match(hook, /avoidEval: true/);
});

test('main.jsx: página do paciente sem login; sala de quem atende dentro do AuthProvider', async () => {
  const main = await read('src/main.jsx');
  assert.match(main, /const isPublicOnlineConsultationRoute = path === '\/consulta-online'/);
  assert.match(main, /const isOnlineRoomRoute = path === '\/sala-online'/);
  assert.match(main, /isOnlineRoomRoute \? \(\r?\n\s*<AuthProvider>\r?\n\s*<Suspense fallback=\{null\}>\r?\n\s*<OnlineRoomPage \/>/);
  assert.match(main, /lazy\(\(\) => import\('\.\/OnlineConsultationPage\.jsx'\)\)/);
  assert.match(main, /lazy\(\(\) => import\('\.\/components\/online\/OnlineRoomPage\.jsx'\)\)/);
});

// ---------- telas ----------

test('Agenda: "Entrar na sala online" só onde a regra deixa, em aba própria', async () => {
  const agenda = await read('src/components/panels/Agenda.jsx');
  assert.match(agenda, /return canEnterOnlineRoom\(appointment, profile, agendaSettings\);/);
  assert.match(agenda, /window\.open\(onlineRoomHref\(appointment\.id\), `sala-online-\$\{appointment\.id\}`\)/);
  assert.match(agenda, /\{canEnterRoom\(selectedAppointment\) && \(/);
  assert.match(agenda, /Entrar na sala online/);

  const today = await read('src/components/panels/agenda/TodayPanel.jsx');
  assert.match(today, /label: 'Entrar na sala online', primary: true/);
  assert.match(today, /actions=\{withRoom\(item\.appointment,/);
});

test('mensagem do WhatsApp avisa da sala só no atendimento com sala online', async () => {
  const source = await read('src/components/panels/agenda/PendingConfirmationView.jsx');
  assert.match(source, /if \(isOnlineRoomAppointment\(appointment, agendaSettings\)\) \{\r?\n\s*paragrafos\.push\('Sua consulta é online, por vídeo\. No horário, abra este mesmo link e toque em “Entrar na consulta”\.'\);/);

  const page = await read('src/ConfirmAppointmentPage.jsx');
  assert.match(page, /\{appointment\.onlineRoom && \(/);
  assert.match(page, /href=\{onlineConsultationHref\(token\)\}/);
});

test('Configurar agenda: sala nasce desligada e restaurar o visual não a desliga', async () => {
  const settings = await load('src/utils/agendaSettings.js');
  assert.equal(settings.AGENDA_SETTINGS_DEFAULTS.onlineRoom, false);
  assert.equal(settings.normalizeAgendaSettings({ onlineRoom: true }).onlineRoom, true);
  assert.equal(settings.normalizeAgendaSettings({ onlineRoom: 'true' }).onlineRoom, false);

  const editor = await read('src/components/panels/agenda/AgendaSettingsEditor.jsx');
  assert.match(editor, /id="agcfg-online"/);
  assert.match(editor, /checked=\{draft\.onlineRoom\}/);
  assert.match(editor, /change\(\{ \.\.\.normalizeAgendaSettings\(null\), onlineRoom: draft\.onlineRoom \}\)/);
});

test('sala de quem atende: evolução só para ler; escrever e corrigir ficam na tela Evoluções', async () => {
  const room = await read('src/components/online/OnlineRoomPage.jsx');
  assert.doesNotMatch(room, /insertPatientEvolution|updatePatientEvolution|EvolutionsScreen|EvolutionForm|<textarea/, 'nenhum formulário de evolução na sala');
  assert.match(room, /openScreen\(\{ screen: 'evolucao' \}\)/);
  assert.match(room, /Escrever a evolução →/);
  assert.match(room, /Só leitura\. Corrigir e escrever continuam na tela Evoluções\./);
  assert.match(room, /Nada desta sala é gravado|nada desta sala é gravado/);

  const service = await read('src/services/onlineConsultationService.js');
  assert.match(service, /\.select\('id,atendimento_em'\)/, 'o Resumo lê só a data da evolução');
  assert.match(service, /listPatientEvolutions\(patientId, discipline\)/, 'a aba usa a mesma RPC do histórico da tela Evoluções');
  assert.doesNotMatch(service, /insertPatientEvolution|updatePatientEvolution|conteudo_encrypted/);
  assert.match(service, /Promise\.allSettled/, 'cada parte falha sozinha');
});

test('consulta rápida: abas Resumo, Escalas e Evoluções na própria sala', async () => {
  const room = await read('src/components/online/OnlineRoomPage.jsx');
  assert.match(room, /const PANEL_TABS = \['resumo', 'escalas', 'evolucoes'\]/);
  assert.match(room, /role="tablist"/);
  assert.match(room, /role="tab"/);
  assert.match(room, /aria-selected=\{tab === id\}/);
  assert.match(room, /role="tabpanel"/);
  assert.match(room, /`Escalas · \$\{scaleCount\}`/);
  assert.match(room, /`Evoluções · \$\{evolutionCount\}`/);
  assert.match(room, /Abrir a tela Escalas, com o gráfico/);
  assert.match(room, /Abrir a tela Evoluções/);
  assert.match(room, /onClick=\{\(\) => onTab\('escalas'\)\}/, 'atalhos do Resumo trocam de aba em vez de sair da sala');
});

test('"Antes da sessão": escalas desde a última evolução, com direção, e risco não visto', async () => {
  const { summarizeScalesSince, riskAttention } = await load('src/utils/beforeSession.js');
  const app = (id, appliedAt, score, extra = {}) => ({
    id,
    instrumentId: 'gad7',
    instrumentVersion: 1,
    appliedAt,
    source: 'area_do_paciente',
    result: { score, bandLabel: score >= 10 ? 'Moderada' : 'Leve' },
    voidedAt: null,
    ...extra,
  });
  const rows = summarizeScalesSince([
    app('g1', '2026-10-01T12:00:00Z', 14),
    app('g2', '2026-10-18T12:00:00Z', 11),
    app('g3', '2026-10-19T12:00:00Z', 2, { voidedAt: '2026-10-19T13:00:00Z' }),
  ], '2026-10-13T12:00:00Z');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'GAD-7');
  assert.equal(rows[0].score, '11');
  assert.equal(rows[0].bandLabel, 'Moderada');
  assert.equal(rows[0].trend, '▼ desceu', 'compara com a anterior; anulada fica de fora');
  assert.match(rows[0].when, /^Área do Paciente · /);

  assert.deepEqual(summarizeScalesSince([app('g1', '2026-10-01T12:00:00Z', 14)], '2026-10-13T12:00:00Z'), [], 'nada novo desde a evolução');
  assert.equal(summarizeScalesSince([app('g1', '2026-10-01T12:00:00Z', 14)], null).length, 1, 'sem evolução: mostra todas');

  const risks = riskAttention([
    { applicationId: 'r1', patientId: 'pac', instrumentId: 'phq9', appliedAt: '2026-10-18T12:00:00Z' },
    { applicationId: 'r2', patientId: 'outro', instrumentId: 'phq9', appliedAt: '2026-10-18T12:00:00Z' },
  ], 'pac');
  assert.equal(risks.length, 1, 'só o paciente desta sala');
  assert.match(risks[0].label, /^Risco no PHQ-9 ainda não visto/);
});

test('aba Escalas: nota, faixa, seta, linha pequena, datas e quando reaplicar', async () => {
  const { scaleCards, sparkPoints } = await load('src/utils/beforeSession.js');
  const gad = (id, appliedAt, score, extra = {}) => ({
    id,
    instrumentId: 'gad7',
    instrumentVersion: 1,
    appliedAt,
    source: 'consultorio',
    result: { score, bandLabel: score >= 10 ? 'Moderada' : 'Leve' },
    voidedAt: null,
    ...extra,
  });
  const now = new Date('2026-10-20T15:00:00Z');
  const cards = scaleCards([
    gad('g1', '2026-09-28T15:00:00Z', 14),
    gad('g2', '2026-10-05T15:00:00Z', 12),
    gad('g3', '2026-10-12T15:00:00Z', 9),
    gad('g4', '2026-10-13T15:00:00Z', 1, { voidedAt: '2026-10-13T16:00:00Z' }),
    {
      id: 'r1',
      instrumentId: 'rosenberg',
      instrumentVersion: 1,
      appliedAt: '2026-10-11T15:00:00Z',
      source: 'area_do_paciente',
      result: { score: 20, bandLabel: null },
      voidedAt: null,
    },
  ], now);
  assert.deepEqual(cards.map(card => card.id), ['gad7', 'rosenberg'], 'da aplicação mais nova para a mais antiga');
  const [gadCard, rosenberg] = cards;
  assert.equal(gadCard.total.text, '9');
  assert.equal(gadCard.total.bandLabel, 'Leve');
  assert.equal(gadCard.trend, '▼ desceu');
  assert.equal(gadCard.count, 3, 'anulada fica de fora');
  assert.equal(gadCard.first, '28/09/2026');
  assert.deepEqual(gadCard.reapplied, ['05/10/2026', '12/10/2026']);
  assert.equal(gadCard.source, 'Consultório');
  assert.deepEqual(gadCard.spark.values, [14, 12, 9]);
  assert.equal(sparkPoints(gadCard.spark).split(' ').length, 3);
  assert.equal(sparkPoints({ values: [5], min: 0, max: 21 }), '', 'uma aplicação só não tem linha');
  assert.equal(gadCard.reapplyFrom, '26/10/2026', 'GAD-7 reaplica em 14 dias');
  assert.equal(rosenberg.noBands, true, 'Rosenberg sem faixa inventada');
  assert.equal(rosenberg.reapplyFrom === '' || /\d{2}\/\d{2}\/\d{4}/.test(rosenberg.reapplyFrom), true);

  const [dass] = scaleCards([{
    id: 'd1',
    instrumentId: 'dass21',
    instrumentVersion: 1,
    appliedAt: '2026-10-10T15:00:00Z',
    source: 'consultorio',
    result: {
      subscales: [
        { id: 'depressao', score: 14, bandLabel: 'Moderada' },
        { id: 'ansiedade', score: 8, bandLabel: 'Leve' },
        { id: 'estresse', score: 12, bandLabel: 'Normal' },
      ],
    },
    voidedAt: null,
  }], now);
  assert.equal(dass.total, null, 'DASS-21 não tem total');
  assert.equal(dass.parts.length, 3, 'uma nota por subescala');
  assert.equal(dass.spark, null, 'sem linha de uma subescala com cara de total');
});

test('aba Evoluções: da mais nova para a mais antiga, com os rótulos do formulário', async () => {
  const { evolutionEntries } = await load('src/utils/beforeSession.js');
  const entries = evolutionEntries([
    {
      id: 'e1',
      attendance_status: 'attended',
      atendimento_em: '2026-10-06T15:00:00Z',
      conteudo: JSON.stringify({ temas: 'Sono irregular', intervencoes: '', proximosPassos: 'Reaplicar o K10' }),
    },
    {
      id: 'e2',
      attendance_status: 'no_show',
      atendimento_em: '2026-10-13T15:00:00Z',
      conteudo: JSON.stringify({ observacao: 'Avisou pelo WhatsApp' }),
    },
  ]);
  assert.deepEqual(entries.map(entry => entry.id), ['e2', 'e1']);
  assert.equal(entries[0].absent, true);
  assert.equal(entries[0].status, 'Não compareceu');
  assert.equal(entries[0].note, 'Avisou pelo WhatsApp', 'falta mostra a observação');
  assert.deepEqual(
    entries[1].fields.map(field => field.label),
    ['Temas trabalhados na sessão', 'Próximos passos'],
    'campo vazio não aparece',
  );
});

test('minutos do mês: quanto foi, quanto falta e o aviso perto do fim', async () => {
  const { usageSummary, formatMinutes, USAGE_WARNING_SHARE } = await load('src/utils/onlineConsultation.js');
  const base = { freeMinutes: 10_000, consultMinutes: 100, periodStart: '2026-10-01T00:00:00.000Z' };
  const low = usageSummary({ ...base, participantMinutes: 1240 });
  assert.equal(low.used, 1240);
  assert.equal(low.left, 8760);
  assert.equal(low.percent, 12);
  assert.equal(low.consultsUsed, 12);
  assert.equal(low.consultsLeft, 87);
  assert.equal(low.since, '01/10/2026');
  assert.equal(low.near, false);
  assert.equal(low.over, false);
  assert.equal(formatMinutes(1240), '1.240 min');

  assert.equal(USAGE_WARNING_SHARE, 0.8);
  assert.equal(usageSummary({ ...base, participantMinutes: 8000 }).near, true, 'aviso a partir de 80%');
  const over = usageSummary({ ...base, participantMinutes: 10_500 });
  assert.equal(over.over, true);
  assert.equal(over.near, false);
  assert.equal(over.percent, 100, 'a barra não passa do fim');
  assert.equal(over.left, 0);
  assert.equal(over.consultsLeft, 0);
  assert.equal(usageSummary(null), null);
  assert.equal(usageSummary({ participantMinutes: 'x' }), null);
});

test('minutos do mês: contados no servidor, página a página, com quem ainda está na chamada', async () => {
  const { monthUsage } = await loadRepo('supabase/functions/_shared/dailyRooms.ts');
  const now = Date.UTC(2026, 9, 21, 15, 0, 0);
  const calls = [];
  const pages = [
    Array.from({ length: 100 }, (_, index) => ({
      id: `m${index}`,
      ongoing: false,
      participants: [{ duration: 3000, join_time: 1 }, { duration: 61, join_time: 1 }],
    })),
    [{ id: 'live', ongoing: true, participants: [{ duration: null, join_time: now / 1000 - 600 }] }],
  ];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    calls.push(String(url));
    const data = pages[calls.length - 1] || [];
    return { status: 200, json: async () => ({ total_count: 101, data }) };
  };
  try {
    const usage = await monthUsage({ apiKey: 'teste' }, now);
    assert.equal(usage.meetings, 101);
    assert.equal(usage.participantMinutes, 100 * (50 + 2) + 10, 'minuto começado conta inteiro; quem está na chamada conta até agora');
    assert.equal(usage.ongoing, true);
    assert.equal(usage.periodStart, Date.UTC(2026, 9, 1));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(calls.length, 2);
  assert.match(calls[0], /\/meetings\?timeframe_start=\d+&timeframe_end=\d+&limit=100$/);
  assert.match(calls[1], /starting_after=m99/, 'segunda página a partir da última chamada');
});

test('Edge Function: minutos do mês só para quem atende, sem dado de paciente', async () => {
  const source = await readRepo('supabase/functions/online-consultation/index.ts');
  const staff = source.match(/async function handleProfessional[\s\S]*?\r?\n}\r?\n/)?.[0] || '';
  const usageAt = staff.indexOf("action === 'staff_usage'");
  assert.ok(usageAt > 0, 'staff_usage');
  assert.ok(staff.indexOf('appointment.professional_id !== caller.user.id') < usageAt, 'só depois de conferir que o atendimento é dela');
  const usageBlock = staff.slice(usageAt).split(/\r?\n  }\r?\n/)[0];
  assert.match(usageBlock, /monthUsage\(config\)/);
  assert.doesNotMatch(usageBlock, /patient|paciente/i);
  assert.match(source, /action === 'staff_open' \|\| action === 'staff_join' \|\| action === 'staff_usage'/);

  const room = await read('src/components/online/OnlineRoomPage.jsx');
  assert.match(room, /role="meter"/);
  assert.match(room, /const USAGE_REFRESH_MS = 5 \* 60_000/);
  assert.match(room, /a fatura do Daily é a referência/);
});

// ---------- ponte entre abas ----------

let storage;
beforeEach(() => {
  storage = new Map();
  globalThis.localStorage = {
    getItem: key => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  };
});

test('ponte entre abas: só telas conhecidas, id válido e nome nunca guardado no aparelho', async () => {
  const bridge = await load('src/utils/appNavigationBridge.js');
  assert.equal(bridge.sanitizeScreenRequest({ screen: 'gestao' }), null);
  assert.deepEqual(bridge.sanitizeScreenRequest({ screen: 'escalas', patientId: 'x', patientName: ' Ana ' }), { screen: 'escalas', patientName: 'Ana' });

  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const opened = [];
  const result = await bridge.requestAppScreen(
    { screen: 'escalas', patientId: id, patientName: 'Ana Beatriz' },
    { openWindow: url => opened.push(url) },
  );
  assert.equal(result, 'new-tab', 'sem aba do sistema respondendo, abre uma nova');
  assert.deepEqual(opened, ['/']);
  const saved = storage.get('vitalis:pending-screen') || '';
  assert.doesNotMatch(saved, /Ana/, 'nome do paciente não fica no aparelho');

  assert.deepEqual(bridge.consumePendingScreenRequest(), { screen: 'escalas', patientId: id });
  assert.equal(bridge.consumePendingScreenRequest(), null, 'lido uma vez, apagado');

  storage.set('vitalis:pending-screen', JSON.stringify({ screen: 'evolucao', at: Date.now() - 120_000 }));
  assert.equal(bridge.consumePendingScreenRequest(), null, 'pedido velho não abre nada');
});

test('App atende os pedidos da sala sem pular a pergunta de alterações não salvas', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /listenScreenRequests\(openRequestedScreen\)/);
  assert.match(app, /consumePendingScreenRequest\(\)/);
  assert.match(app, /current\.hasPendingChanges && !window\.confirm\('Existem alterações ainda não salvas\. Deseja trocar de tela mesmo assim\?'\)/);
});

test('AGENTS.md guarda a regra da consulta online', async () => {
  const agents = await readRepo('AGENTS.md');
  assert.match(agents, /Consulta online pelo sistema/);
  assert.match(agents, /online-consultation\.test\.mjs/);
});
