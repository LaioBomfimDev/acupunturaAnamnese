import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = name => readFile(path.join(root, 'src', name), 'utf8');
const noop = () => {};
let server;
let screen;
let HomeConsole;

before(async () => {
  server = await createServer({ root, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
  screen = await server.ssrLoadModule('/src/components/whatsapp/WhatsAppScreen.jsx');
  HomeConsole = (await server.ssrLoadModule('/src/components/HomeConsole.jsx')).HomeConsole;
});

after(async () => { await server?.close(); });

test('a primeira etapa mostra indisponibilidade real, sem QR ou conversa fictícia', () => {
  const html = renderToStaticMarkup(React.createElement(screen.WhatsAppScreen));
  assert.match(html, /<h1>WhatsApp<\/h1>/);
  assert.match(html, /Como funciona/);
  assert.match(html, /Em preparação/);
  assert.match(html, /Nenhuma conversa carregada/);
  assert.doesNotMatch(html, /role="dialog"|<img|<iframe|data:image|Contato de exemplo|Exemplo conectado/);
  assert.match(html, /aria-label="Buscar conversa"[^>]*disabled=""/);
  assert.match(html, /aria-label="Mensagem"[^>]*disabled=""/);
  assert.match(html, /aria-label="Enviar mensagem, ainda indisponível"[^>]*disabled=""/);
  assert.match(html, /aria-haspopup="dialog" aria-expanded="false"/);
});

test('a conexão usa janela com instruções e sem código de pareamento falso', () => {
  const html = renderToStaticMarkup(React.createElement(screen.WhatsAppConnectionDialog, { onClose: noop }));
  assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="[^"]+"/);
  assert.match(html, /Código QR indisponível/);
  assert.match(html, /Aparelhos conectados/);
  assert.match(html, /Conectar um aparelho/);
  assert.match(html, /aria-label="Fechar conexão"/);
  assert.match(html, />Entendi<\/button>/);
  assert.doesNotMatch(html, /<img|<iframe|data:image|http:\/\/localhost|127\.0\.0\.1/);
});

test('o acesso aparece no menu e nos atalhos de celular para cada leitura da tela inicial', () => {
  for (const variant of ['admin', 'admin-professional', 'professional', 'reception']) {
    const props = { profile: { full_name: 'Pessoa de teste', disciplines: [] }, therapistName: 'Pessoa', variant, onSelect: noop, onSignOut: noop };
    const html = renderToStaticMarkup(React.createElement(HomeConsole, { ...props, onOpenWhatsApp: noop }));
    assert.match(html, /class="hc-nav-title">WhatsApp<\/p>/, variant);
    assert.match(html, /class="hc-mobile-only"[\s\S]*?<b>WhatsApp<\/b>/, variant);
    const withoutAccess = renderToStaticMarkup(React.createElement(HomeConsole, props));
    assert.doesNotMatch(withoutAccess, /class="hc-nav-title">WhatsApp<\/p>|<b>WhatsApp<\/b>/);
  }
});

test('a navegação abre uma tela por vez, retorna ao início e limpa pedidos de outras telas', async () => {
  const app = await read('App.jsx');
  assert.match(app, /lazyPanel\(\(\) => import\('\.\/components\/whatsapp\/WhatsAppScreen'\), 'WhatsAppScreen'\)/);
  assert.match(app, /onOpenWhatsApp=\{\(\) => openHubScreen\('whatsapp'\)\}/);
  const homeGuard = app.match(/if \(!showClinicPatients[^\n]+/)[0];
  assert.match(homeGuard, /!showHubWhatsApp/);
  assert.match(app, /setShowHubWhatsApp\(screen === 'whatsapp'\)/);
  assert.match(app, /setShowHubWhatsApp\(false\)/);
  assert.match(app, /if \(showHubWhatsApp\)[\s\S]*?<WhatsAppScreen \/>[\s\S]*?renderHubDock\('whatsapp'\)/);
  const source = await read('components/whatsapp/WhatsAppScreen.jsx');
  assert.match(source, /useDismiss\(\{ onClose \}\)/);
  assert.match(source, /\{\.\.\.dismiss\.backdropProps\}/);
  assert.doesNotMatch(source, /window\.open|fetch\(|localStorage|sessionStorage|supabase|access_token|setInterval/);
});

test('celular mantém o aplicativo nativo e não exige pareamento na própria tela', async () => {
  const source = await read('components/whatsapp/WhatsAppScreen.jsx');
  const css = await read('styles/whatsapp.css');
  const mobile = css.slice(css.indexOf('@media (max-width: 1024px)'));
  assert.match(source, /Os envios pelo celular continuam abrindo o aplicativo do WhatsApp/);
  assert.match(mobile, /\.wa-desktop-connect \{ display: none; \}/);
  assert.match(mobile, /\.wa-mobile-note \{ display: flex;/);
  assert.match(mobile, /\.wa-thread \{ display: none; \}/);
  assert.doesNotMatch(css, /\b\d+(?:\.\d+)?(?:s|d|l)?vh\b|#[0-9a-f]{3,8}\b|rgba?\(/i);
  assert.match(css, /grid-template-columns: 285px minmax\(0, 1fr\)/);
});

// Regressão 01/11/2026: a altura da conversa era conta fixa
// (clamp(440px, 100vh - 290px, 780px)). No notebook (1366×768) o campo de
// envio ficava abaixo do fim da tela e, com o botão da assistente, coberto
// por ele.
test('no computador a conversa usa a altura que sobra e o envio fica acima do botão da assistente', async () => {
  const css = await read('styles/whatsapp.css');
  const assistantCss = await read('styles/assistant.css');
  const desktop = css.slice(css.indexOf('@media (min-width: 1025px)'), css.indexOf('@media (max-width: 1024px)'));
  assert.doesNotMatch(css, /\.wa-workspace \{[^}]*\bheight: clamp\(/);
  assert.match(desktop, /\.hub-screen:has\(> \.hub-body > \.wa-screen\) \{[^}]*height: calc\(100 \* var\(--svh\)\)/);
  assert.match(desktop, /body:has\(\.ca-launcher\) \.hub-screen:has\(> \.hub-body > \.wa-screen\) \{[^}]*var\(--ca-launcher-room/);
  assert.match(desktop, /\.wa-workspace \{[^}]*flex: 1 1 auto/);
  assert.match(css, /\.wa-thread-empty \{[^}]*min-height: 0/);
  assert.match(assistantCss, /body:has\(\.ca-launcher\) \{\s*--ca-launcher-room: 88px;/);
  assert.match(assistantCss, /#root \{\s*padding-bottom: var\(--ca-launcher-room\);/);
});
