import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildWhatsAppLink, normalizeWhatsAppPhone } from '../../src/utils/whatsapp.js';
import { whatsappShareUrl } from '../../src/utils/clinicalInterviews.js';
import { buildChargeReminderMessage } from '../../src/utils/financeMessages.js';

// ACUP-020 (09/11/2026): a tela do WhatsApp no hub foi removida a pedido da
// administradora. Ficam só os envios por link wa.me, abertos por uma pessoa;
// envio automático (em lote, agendado ou por gatilho) continua proibido.

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = rel => readFileSync(join(root, rel), 'utf8');

function filesUnder(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) filesUnder(full, out);
    else if (/\.(jsx?|tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}
const sources = [...filesUnder(join(root, 'src')), ...filesUnder(join(root, '../supabase/functions'))]
  .map(file => ({ file, text: readFileSync(file, 'utf8') }));
// Comentários explicam a decisão (ex.: "API paga trazia custo"); a regra vale para o código.
const code = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\r\n]*/g, '$1');

test('a tela do WhatsApp não existe mais: nem componente, nem estilo, nem destino no menu, na barra ou na assistente', () => {
  for (const { file, text } of sources) {
    assert.doesNotMatch(text, /WhatsAppScreen|showHubWhatsApp|whatsapp\.css|WHATSAPP_HELP/, file);
  }
  const app = read('src/App.jsx');
  const home = read('src/components/HomeConsole.jsx');
  const hubNav = read('src/components/HubNav.jsx');
  const glyphs = read('src/components/ui/hubGlyphs.jsx');
  for (const [name, text] of [['App.jsx', app], ['HomeConsole.jsx', home], ['HubNav.jsx', hubNav], ['hubGlyphs.jsx', glyphs]]) {
    assert.doesNotMatch(text, /(id|key|target|screen):\s*'whatsapp'/, `${name} sem destino whatsapp`);
  }
  const assistantFront = read('src/utils/clinicAssistant.js');
  const assistantEdge = read('../supabase/functions/_shared/clinicAssistant.ts');
  for (const text of [assistantFront, assistantEdge]) {
    assert.doesNotMatch(text, /'whatsapp'/, 'a assistente não oferece atalho para a tela');
  }
  const help = read('src/data/screenHelp.js');
  assert.doesNotMatch(help, /whatsapp:\s*\{|title:\s*'WhatsApp'/, '"Como funciona" sem tópico da tela');
  const agents = read('../AGENTS.md');
  assert.match(agents, /- WhatsApp: a tela do WhatsApp no hub foi removida em 09\/11\/2026 a pedido da administradora/);
  assert.match(agents, /envio automático continua proibido/);
  assert.match(agents, /whatsapp-links\.test\.mjs/);
});

test('os envios por wa.me que já existiam continuam: link de conversa aberto pela pessoa', () => {
  assert.equal(normalizeWhatsAppPhone('(75) 99999-0000'), '5575999990000');
  assert.equal(buildWhatsAppLink({ phone: '75 99999-0000', message: 'Olá, tudo bem?' }),
    'https://wa.me/5575999990000?text=Ol%C3%A1%2C%20tudo%20bem%3F');
  assert.equal(buildWhatsAppLink({ phone: '75 99999-0000' }), 'https://wa.me/5575999990000');
  assert.match(whatsappShareUrl('Link da entrevista'), /^https:\/\/wa\.me\/\?text=Link%20da%20entrevista$/);

  // Cada tela que enviava pelo WhatsApp segue montando o link wa.me.
  const senders = {
    'src/components/panels/agenda/PendingConfirmationView.jsx': /buildWhatsAppLink\(/, // confirmação de agendamento
    'src/components/panels/agenda/BirthdaysPanel.jsx': /buildWhatsAppLink\(/, // aniversários
    'src/components/panels/agenda/ShareAgendaPanel.jsx': /https:\/\/wa\.me\/\?text=/, // compartilhar agenda
    'src/components/patientForms/PortalShareBox.jsx': /buildWhatsAppLink\(/, // formulários e código da Área do Paciente
    'src/components/interviews/InterviewLinkBox.jsx': /whatsappShareUrl\(/, // link de entrevista
    // Gestão → Retornos ("Chamar no WhatsApp"). A pesquisa de satisfação só copia o link, nunca teve wa.me (QA, 09/11/2026).
    'src/components/panels/RelatoriosGestao.jsx': /buildWhatsAppLink\(\{ phone, message: `Oi, \$\{name\.split/,
    'src/components/online/OnlineRoomPage.jsx': /buildWhatsAppLink\(/, // sala online
    'src/components/financeiro/FinanceEntradas.jsx': /buildWhatsAppLink\(/, // A receber: cobrar o que está em aberto (11/11/2026)
  };
  for (const [file, pattern] of Object.entries(senders)) assert.match(read(file), pattern, file);
});

test('envio automático continua proibido: sem provedor de API, sem disparo em lote, agendado ou por gatilho', () => {
  for (const { file, text } of sources) {
    assert.doesNotMatch(code(text), /graph\.facebook\.com|api\.whatsapp|whatsapp-web\.js|whatsmeow|baileys|z-api|twilio|evolution-api/i, `${file}: sem provedor de envio`);
  }
  for (const { file, text } of sources) {
    // wa.me só abre por ação da pessoa: nunca dentro de laço, de timer ou em código de servidor.
    if (file.includes('supabase')) assert.doesNotMatch(text, /https:\/\/wa\.me/, `${file}: servidor não monta envio`);
    assert.doesNotMatch(text, /(setTimeout|setInterval|requestIdleCallback)\([^)]*wa\.me/, `${file}: sem envio por timer`);
    assert.doesNotMatch(text, /\.(forEach|map)\([^\r\n]*\r?\n?[^\r\n]*window\.open\([^\r\n]*(wa\.me|WhatsApp)/, `${file}: sem envio em lote`);
  }
});

test('cobrança no A receber: a mensagem leva dia e valor, sem o nome do serviço nem a área', () => {
  const items = [
    { kind: 'charge', dueOn: '2026-10-07', openCents: 18000, discipline: 'psicologia', appointmentType: 'evaluation' },
    { kind: 'charge', dueOn: '2026-10-21', openCents: 18000, discipline: 'psicologia', appointmentType: 'session' },
  ];
  const message = buildChargeReminderMessage({ patientName: 'Ana Souza Pereira', items, clinicName: 'Clínica Reability' });
  assert.match(message, /^Olá, Ana! Aqui é da Clínica Reability\./, 'primeiro nome, nunca o nome inteiro');
  assert.match(message, /• Atendimento de 07\/10 — R\$ 180,00/);
  assert.match(message, /Total: R\$ 360,00\./);
  assert.match(message, /Se já tiver pago, por favor desconsidere\./);
  // A especialidade não vai na mensagem: quem lê o celular do paciente não precisa saber.
  assert.doesNotMatch(message, /psicolog|Avaliação|Sessão/i);

  // Um item só não ganha linha de total.
  const one = buildChargeReminderMessage({ patientName: 'Bruno', items: items.slice(0, 1), clinicName: '' });
  assert.match(one, /um valor em aberto/);
  assert.doesNotMatch(one, /Total:/);
  assert.doesNotMatch(one, /Aqui é da/, 'sem nome da instituição, não inventa a frase');

  // Parcela e sessão de pacote vão pelo nome que a clínica deu ao pacote.
  const pacote = buildChargeReminderMessage({
    patientName: 'Carla',
    items: [{ kind: 'installment', packageName: 'Pacote 10 sessões', installmentNumber: 2, installments: 3, openCents: 15000 }],
  });
  assert.match(pacote, /• Pacote 10 sessões · parcela 2 de 3 — R\$ 150,00/);

  // Sem item, não há mensagem (nem link).
  assert.equal(buildChargeReminderMessage({ patientName: 'Ana', items: [] }), '');
});

test('cobrança só aparece para paciente, com telefone, e nunca para operadora', async () => {
  const screen = read('src/components/financeiro/FinanceEntradas.jsx');
  assert.match(screen, /\{!operator && <ChargeReminderLink/, 'operadora não recebe cobrança de paciente');
  assert.match(screen, /isLikelyValidWhatsAppPhone\(patient\.phone\)/);
  assert.match(screen, /sem telefone no cadastro/, 'sem telefone, o aviso fica no lugar do botão');
  assert.match(screen, /target="_blank"[\s\S]{0,60}rel="noopener noreferrer"/);
});
