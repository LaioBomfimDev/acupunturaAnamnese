## ACUP-020 — Remover a tela de integração com o WhatsApp

- Dev: sessão Claude "Documentos timbrados na gestão" (DEV2-2). Pasta `acup-team/dev2`, branch `claude/dev2`, base `integracao` 6581ed5 (merge --ff-only). Commit de entrega: `git log -1` desta branch.
- Teste novo autorizado pela decisão da ACUP-020 (opção A). Sem SQL, sem Edge Function nova, sem publicação, sem push.

### O que mudou

- **Base:** o commit 3061329 (PR #16, fechado) foi reaplicado sobre o código de hoje com `cherry-pick -n`. Houve conflito só em dois arquivos:
  - `AGENTS.md`: ficou o texto de hoje, com o bullet do WhatsApp reescrito numa linha;
  - `_shared/assistantHelpCorpus.ts`: regenerado por `node frontend/scripts/sync-assistant-help.mjs`.
- **Tela:**
  - saem `components/whatsapp/WhatsAppScreen.jsx` e `styles/whatsapp.css`;
  - saem do `App.jsx` o lazy, `showHubWhatsApp` e a rota;
  - saem o destino do menu e o atalho `.hc-mobile-only` do `HomeConsole`, e o ícone do `hubGlyphs`;
  - no `assistant.css`, sai a regra que era só da tela.
- **Assistente:**
  - sai `WHATSAPP_HELP` do `screenHelp.js` e o tópico do `assistantHelp.js` / `assistantRetrieval.ts`;
  - os atalhos para a tela saem de `clinicAssistant.js` e `_shared/clinicAssistant.ts`, então a assistente não oferece mais a tela.
- **Testes:**
  - `whatsapp-screen.test.mjs` apagado;
  - em `mobile-hub-nav`, `page-bottom-room` e `screen-help`, saiu só o que era do WhatsApp;
  - novo `whatsapp-links.test.mjs`, descrito abaixo.
- **AGENTS.md:** o bullet virou uma linha: "a tela do WhatsApp no hub foi removida em 09/11/2026 a pedido da administradora (…); ficam só os envios por `wa.me` (…), e envio automático continua proibido (…). Teste: `tests/regression/whatsapp-links.test.mjs`."

### Arquivos

`AGENTS.md`; `frontend/src/App.jsx`; `components/HomeConsole.jsx`; `components/ui/hubGlyphs.jsx`; `components/whatsapp/WhatsAppScreen.jsx` (apagado); `styles/whatsapp.css` (apagado); `styles/assistant.css`; `data/screenHelp.js`; `utils/assistantHelp.js`; `utils/clinicAssistant.js`; `supabase/functions/_shared/{assistantHelpCorpus,assistantRetrieval,clinicAssistant}.ts`; `tests/regression/{mobile-hub-nav,page-bottom-room,screen-help}.test.mjs`; `tests/regression/whatsapp-screen.test.mjs` (apagado); `tests/regression/whatsapp-links.test.mjs` (novo). Fora da branch: a tela de harness `mesa/ferramentas/harness-telas/telas/menu-020-dev2.jsx`, usada nos prints.

### Teste novo (`whatsapp-links.test.mjs`, 3 testes)

1. **A tela não existe mais.**
   - Nenhum arquivo de `src/` ou `supabase/functions/` cita `WhatsAppScreen`, `showHubWhatsApp`, `whatsapp.css` ou `WHATSAPP_HELP`.
   - Nenhum destino `'whatsapp'` em App, HomeConsole, HubNav, hubGlyphs ou nos atalhos da assistente (aparelho e Edge), nem tópico no "Como funciona".
   - O `AGENTS.md` tem a linha nova apontando para o teste.
2. **Os envios ficam.**
   - `buildWhatsAppLink` e `whatsappShareUrl` continuam montando `https://wa.me/…` (com e sem texto, telefone normalizado com 55).
   - Cada tela que enviava segue montando o link: confirmação pendente, aniversários, compartilhar agenda, Área do Paciente (formulários e código), link de entrevista, pesquisa de satisfação e sala online.
3. **Envio automático proibido.**
   - Nenhum provedor de API no código (Graph/WhatsApp Cloud, whatsapp-web.js, whatsmeow, Baileys, Z-API, Twilio, Evolution); comentários não contam, porque `utils/whatsapp.js` cita esses nomes ao explicar a decisão.
   - O servidor nunca monta `wa.me`.
   - Nenhum `wa.me` aberto por timer nem em laço (`forEach`/`map` com `window.open`).
- Regex com `\r?\n`. Mutações em disco, restauradas: tirar `buildWhatsAppLink` dos aniversários → 1 falha; acrescentar um envio em lote (`list.forEach(... window.open('https://wa.me/...'))`) → 1 falha. **2/2 detectadas.**

### Comandos rodados

- Focados: `node --test` em mobile-hub-nav, page-bottom-room, screen-help, clinic-assistant e clinic-assistant-finance → 74/74; `whatsapp-links.test.mjs` → 3/3.
- Gate: `npm run lint` exit 0, sem avisos; `npm test` exit 0, **1484 testes, 1483 aprovados, 1 pulado, 0 falhas** (o total cai porque o teste da tela saiu e entraram 3 novos); `npm run build` exit 0, 1,78 s.

### Prints (`mesa/prints/ACUP-020`)

- `menu-computador.png`: tela inicial da administração no computador, menu escuro sem o WhatsApp e sem buraco.
- `menu-celular.png`: administração no celular, com cartão do dia, áreas, barra de baixo e Administração (Financeiro, Escalas), sem o WhatsApp e sem rolagem lateral. A barra aparece no meio porque o print é da página inteira; na tela ela fica presa embaixo.
- `menu-celular-profissional.png`: profissional no celular, atalhos sem o WhatsApp.
- Harness: `telas/menu-020-dev2.jsx` (`?variant=admin|admin-professional|professional|reception`), servidor da mesa sobre `dev2/frontend`. As contagens aparecem como traço porque as fontes do harness vêm vazias, o que não importa para o menu.

### Como o QA verifica

1. Rodar `whatsapp-links.test.mjs` e o gate; conferir que o diff só tem os arquivos acima.
2. `grep -rn "WhatsAppScreen\|showHubWhatsApp\|whatsapp\.css" frontend/src supabase/functions` deve vir vazio.
3. Abrir as telas que enviam (Agenda → confirmação pendente e aniversários; Área do Paciente; entrevista; pesquisa) e conferir que o botão do WhatsApp continua abrindo o `wa.me` com a mensagem.
4. Prints do menu em computador e celular, nas quatro variações do harness.

### Limites

- A conferência de "em laço" e "por timer" é estática (regex), não exaustiva: pega o padrão comum (`forEach`/`map` + `window.open`, `setTimeout`/`setInterval` com `wa.me`), não qualquer forma de disparo. A regra principal continua sendo a do AGENTS.
- Publicar: nunca da dev2 (pacote em `mesa/publicacao.md`, com a humana, depois do QA). Nenhuma mudança de Edge Function precisa de deploy, exceto o corpus da assistente (`clinic-assistant`), que perde o tópico do WhatsApp.
