import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Abas da ficha do paciente (pedido de 09/10/2026: "ruim assim, só o
// nome"). Das três prévias, a administradora escolheu a faixa com ícone e
// resumo no computador (A) e o índice em lista no celular e no tablet (C).
// Cada aba diz o número e uma linha com o que importa, tirada do que a
// ficha já carrega (utils/patientProfileTabs.js). No celular a ficha abre
// como índice; cada parte ocupa a tela, com "Voltar à ficha" na faixa de
// baixo. O estado `sectionOpen` vale em qualquer largura e o CSS decide.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = rel => readFile(path.resolve(root, 'src', rel), 'utf8');
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
// Início do bloco do índice no celular (\s+ cobre CRLF, LF e o comentário tirado).
const mobileStart = source => source.search(/@media \(max-width: 1024px\) \{\s+\.pf-tabs \{/);

let server;
let tabs;
let profile;
let portalTab;
let css;

before(async () => {
  server = await createServer({
    root,
    logLevel: 'silent',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  tabs = await server.ssrLoadModule('/src/utils/patientProfileTabs.js');
  [profile, portalTab, css] = await Promise.all([
    read('components/ClinicPatientProfile.jsx'),
    read('components/patientForms/PatientPortalTab.jsx'),
    read('styles/clinicPatients.css').then(stripComments),
  ]);
});

after(async () => {
  await server?.close();
});

// Sexta, 09/10/2026, 10:00 (hora local).
const NOW = new Date(2026, 9, 9, 10, 0);
const at = (month, day, hour = 9, minute = 0) => new Date(2026, month - 1, day, hour, minute).toISOString();

function appt(startsAt, overrides = {}) {
  return { id: startsAt, starts_at: startsAt, discipline: 'psicologia', status: 'scheduled', ...overrides };
}

test('próximo atendimento: o primeiro de agora em diante que ainda vai acontecer', () => {
  const appointments = [
    appt(at(10, 8), { status: 'attended' }), // passado
    appt(at(10, 20)),
    appt(at(10, 12), { status: 'cancelled' }), // libera o horário
    appt(at(10, 13), { status: 'no_show' }),
    appt(at(10, 14), { status: 'excused' }),
    appt(at(10, 11), { discipline: null }), // bloqueio, não é atendimento
    appt(at(10, 15)),
  ];
  assert.equal(tabs.findNextAppointment(appointments, NOW).starts_at, at(10, 15));
  assert.equal(tabs.findNextAppointment([appt(at(10, 1))], NOW), null);
  assert.equal(tabs.formatNextAppointment(new Date(2026, 9, 15, 9, 0)), 'qui 15/10, 09:00');
});

test('resumo das abas com os dados da ficha', () => {
  const summary = tabs.buildProfileTabSummaries({
    enrollments: [{ discipline: 'psicologia' }],
    shares: [],
    appointments: [appt(at(10, 8), { status: 'attended' }), appt(at(10, 15))],
    evolutions: [{ atendimento_em: at(9, 24) }, { atendimento_em: at(10, 1) }],
    pendingEvolutionsCount: 0,
    attachments: [],
    portalStatus: { id: 'active', label: 'Ativo', tone: 'success' },
    now: NOW,
  });

  assert.equal(summary.cadastro.count, null, 'cadastro não tem número');
  assert.equal(summary.matriculas.count, 1);
  assert.equal(summary.matriculas.summary, 'Psicologia · sem compartilhamento');
  assert.deepEqual(summary.matriculas.dots, ['var(--r1-discipline-psicologia)']);
  assert.equal(summary.agenda.count, 2);
  assert.equal(summary.agenda.summary, 'Próximo: qui 15/10, 09:00');
  assert.equal(summary.evolucao.count, 2);
  assert.equal(summary.evolucao.summary, 'Última: 01/10');
  assert.equal(summary.evolucao.tone, null);
  assert.equal(summary.anexos.summary, 'Nenhum arquivo');
  assert.equal(summary.portal.summary, 'Acesso: Ativo');
  assert.equal(summary.portal.tone, 'success');
});

test('evolução atrasada vira alerta; vazios e plurais em pt-BR', () => {
  const summary = tabs.buildProfileTabSummaries({
    enrollments: [{ discipline: 'psicologia' }, { discipline: 'acupuntura' }],
    shares: [{ id: 's1' }, { id: 's2' }],
    appointments: [appt(at(10, 1), { status: 'attended' })],
    evolutions: [],
    pendingEvolutionsCount: 2,
    attachments: [{ created_at: at(9, 3) }, { created_at: at(10, 3) }],
    now: NOW,
  });
  assert.equal(summary.matriculas.summary, 'Psicologia, Acupuntura · 2 compartilhamentos');
  assert.equal(summary.agenda.summary, 'Nenhum marcado daqui pra frente');
  assert.equal(summary.evolucao.summary, '2 aguardando evolução');
  assert.equal(summary.evolucao.tone, 'alert');
  assert.equal(summary.anexos.summary, 'Último: 03/10');
  // Sem saber o estado do acesso, a aba não afirma nada sobre ele.
  assert.equal(summary.portal.summary, 'Código e formulários');
  assert.equal(summary.portal.tone, null);

  const empty = tabs.buildProfileTabSummaries({ now: NOW });
  assert.equal(empty.matriculas.summary, 'Sem matrícula');
  assert.equal(empty.agenda.summary, 'Nenhum agendamento');
  assert.equal(empty.evolucao.summary, 'Nenhuma sessão registrada');
  assert.equal(tabs.buildProfileTabSummaries({ shares: [{}], enrollments: [{ discipline: 'psicologia' }] }).matriculas.summary,
    'Psicologia · 1 compartilhamento');
});

test('ficha: cada aba leva ícone, número e resumo, e abre a sua parte', () => {
  assert.match(profile, /buildProfileTabSummaries\(\{/);
  assert.match(profile, /className="pf-tab-icon"/);
  assert.match(profile, /className=\{`pf-tab-summary/);
  assert.match(profile, /onClick=\{\(\) => openSection\(tab\.id\)\}/);
  // "Editar cadastro" (topo e Área do Paciente) também abre a parte no celular.
  assert.doesNotMatch(profile, /setActiveTab\('cadastro'\); startEdit\(\)/);
  assert.equal((profile.match(/openSection\('cadastro'\); startEdit\(\)/g) || []).length, 2);
});

test('celular: a ficha é índice e a parte aberta volta por "Voltar à ficha"', () => {
  assert.match(profile, /const \[sectionOpen, setSectionOpen\] = useState\(false\)/);
  assert.match(profile, /className=\{`hub-screen pf-screen\$\{sectionOpen \? ' is-section-open' : ''\}`\}/);
  assert.match(profile, /<HubBackButton nested label="Voltar à lista" onClick=\{onBack\} className="topbar-button pf-back-list" \/>/);
  assert.match(profile, /<HubBackButton nested label="Voltar à ficha" onClick=\{closeSection\} className="topbar-button pf-back-section" \/>/);
  // Quem decide o que aparece é o CSS, nunca o JS pela largura.
  assert.doesNotMatch(profile, /matchMedia|innerWidth/);

  assert.ok(mobileStart(css) > 0, 'bloco do índice no celular não encontrado');
  const mobile = css.slice(mobileStart(css));
  assert.match(mobile, /\.pf-tabs \{\s+display: flex;\s+flex-direction: column;/);
  assert.match(mobile, /\.pf-tab \{\s+flex: 0 0 auto;/, 'em coluna, flex-basis vira altura');
  assert.match(mobile, /\.pf-screen:not\(\.is-section-open\) \.pf-panel,/);
  assert.match(mobile, /\.pf-screen\.is-section-open \.pf-tabs-frame,/);
  assert.match(mobile, /\.pf-screen\.is-section-open button\.hub-back\.pf-back-list,/);
  assert.match(mobile, /\.pf-screen\.is-section-open button\.hub-back\.pf-back-section \{\s+display: flex;/);
  // Fora do celular o "Voltar à ficha" não aparece.
  assert.match(css, /\.pf-screen button\.hub-back\.pf-back-section,\s+\.pf-topbar-section \{\s+display: none;/);
});

test('computador: faixa única quando cabe, três por linha no notebook, aba aberta na cor da clínica', () => {
  const desktop = css.slice(css.indexOf('.pf-tabs-frame {'), mobileStart(css));
  // Em 1280px as seis quebravam em 4 + 2, com as duas de baixo esticadas.
  assert.match(desktop, /\.pf-tabs \{\s+display: grid;\s+grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(desktop, /@container pf-tabs \(min-width: 1320px\) \{\s+\.pf-tabs \{\s+display: flex;/);
  // A faixa mede a si mesma (a ficha também abre ao lado do menu de uma
  // área), e o contêiner só envolve os botões: contêiner prende
  // position: fixed, e as janelas da ficha precisam cobrir a tela.
  assert.match(desktop, /\.pf-tabs-frame \{\s+container: pf-tabs \/ inline-size;/);
  assert.match(profile, /<div className="pf-tabs-frame">\s+<div className="pf-tabs" role="tablist"/);
  assert.doesNotMatch(css, /\.hub-body[^{]*\{[^}]*container/);
  assert.doesNotMatch(desktop, /overflow-x: auto/, 'no mouse ninguém rola a faixa de lado');
  assert.match(desktop, /@media \(min-width: 1025px\) \{\s+\.pf-tab\[aria-selected='true'\] \{\s+background: var\(--r1-accent\);\s+color: var\(--r1-accent-contrast\);/);
  assert.doesNotMatch(desktop, /--r1-(navy|gold)-|--r1-surface-inverse/);
});

test('Área do Paciente: o resumo acompanha o acesso, sem pesar na ficha de quem não vê', () => {
  assert.match(profile, /if \(!isClinicAdmin\) return undefined;/);
  assert.match(profile, /import\('\.\.\/services\/patientPortalService'\)/);
  assert.doesNotMatch(profile, /^import .*patientPortalService/m);
  assert.match(profile, /onStatusChange=\{setPortalStatus\}/);
  assert.match(portalTab, /onStatusChange\?\.\(accessStatus\(access\)\)/);
});
