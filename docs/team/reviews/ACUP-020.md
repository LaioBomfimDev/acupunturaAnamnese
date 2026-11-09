## ACUP-020 — Review do QA (Lucas, 09/11/2026)

- **Entrega:** `claude/dev2` 79c260f (base `integracao` 6581ed5). Remove a tela do WhatsApp e mantém os envios por `wa.me`. Revisada na `qa/ACUP-020`, criada de `claude/dev2`.
- **Veredito:** **APROVADO**. A única mudança minha é um ajuste de rótulo no teste novo, explicado abaixo, sem efeito no código.

### Escopo

- **Arquivos:** são 19, todos da lista do handoff. Desses, `whatsapp-links.test.mjs` é novo e foi autorizado no lugar do `whatsapp-screen.test.mjs`.
- **Fora do escopo, nada tocado:** nenhuma SQL, nenhuma migration (PROD-2 intacto) e nenhuma Edge Function nova.
- **Corpus da assistente:** rodei `node frontend/scripts/sync-assistant-help.mjs` e a única diferença foi de fim de linha (CRLF). O corpus confere com o script, e o arquivo foi restaurado com `git checkout`.

### Quality

`npm run quality` rodado sozinho na entrega, exit 0. Passaram as etapas de segurança, lint, testes, build e bundle. Testes: 1484, sendo 1483 ok e 1 pulado (o de sempre, sem o xmllint). O resultado é o mesmo que o dev informou. Depois do ajuste do teste, o resultado está no fim deste arquivo.

### Os 5 pontos do foco

1. **Nenhuma sobra.** Um `grep` em `frontend/src`, `supabase/functions` e `frontend/scripts` não acha nenhum destes:
   - `WhatsAppScreen`, `showHubWhatsApp`, `whatsapp.css`, `WHATSAPP_HELP` ou `wa-screen`;
   - destino `'whatsapp'` no App, no HomeConsole, no HubNav, no hubGlyphs ou nos atalhos da assistente, tanto no aparelho (`ASSISTANT_SCREENS` e `ASSISTANT_SCREEN_LABELS`) quanto na Edge (`_shared/clinicAssistant.ts` e `assistantRetrieval.ts`);
   - tópico do WhatsApp no "Como funciona".

   As classes do `whatsapp.css` apagado só coincidem com classes de contexto (`hub-body`, `hub-screen`, `ca-launcher`), que têm estilo próprio em outros arquivos. Nenhum botão de envio que ficou perdeu estilo: `.gt-wa-btn`, `.agp-whatsapp` e `.osr-btn--whatsapp` moram em outros CSS. O que resta escrito "WhatsApp" é texto dos envios que ficam, como "Copiar horários vagos… para colar no WhatsApp" e "Enviar pelo WhatsApp".
2. **Os envios `wa.me` estão intactos.**
   - A contagem de `buildWhatsAppLink(` / `whatsappShareUrl(` / `wa.me/` em `frontend/src` é 13 na base e 13 na entrega, então nenhum envio saiu.
   - As telas que enviam continuam montando o link: confirmação pendente, aniversários, compartilhar agenda, Área do Paciente (formulários e código), link de entrevista, retornos pendentes na Gestão e sala online.
   - A pesquisa de satisfação só copia o link, nunca teve `wa.me`, nem no main.

   Minhas mutações no teste novo:

   | Mutação | Resultado |
   |---|---|
   | Retornos sem `wa.me` | pega |
   | Entrevista sem `wa.me` | pega |
   | Sala online sem `wa.me` | pega |
   | Disparo em lote nos aniversários | pega |
   | Servidor montando `wa.me` | pega |
   | Disparo por timer com o link guardado numa variável | passa |

   O caso que passa é o limite que o próprio dev declarou: a conferência é por regex e a regra principal é a do AGENTS. Não bloqueia. Fiz ainda uma sétima mutação ("tirar o 55"), mas ela foi mal montada por mim, porque o link continuou com 55, e não conta.
3. **Envio automático continua proibido.**
   - O teste confere que não há provedor de API no código (comentários não contam), que o servidor nunca monta `wa.me` e que não há disparo em laço nem por timer no padrão comum.
   - A linha nova do AGENTS diz "não recriar entrada no menu, em `.hc-mobile-only` nem no `HubDock`" e "envio automático continua proibido", e aponta para o teste.
4. **Menu e barra sem buraco.** Fiz prints próprios, além dos do dev, com o harness `menu-020-dev2` servido sobre esta branch:
   - recepção no computador e no celular;
   - administração no computador;
   - profissional no computador;
   - administração que também atende, no celular.

   Nenhum print tem WhatsApp, buraco ou rolagem lateral. A barra de baixo tem no máximo cinco destinos. Os prints estão em `mesa/prints/ACUP-020/*-qa.png`, com legendas.
5. **Asserções retiradas são só do WhatsApp.**
   - `mobile-hub-nav`: sai `'whatsapp'` da lista de telas com barra, e a contagem de "Voltar às áreas" passa de 7 para 6. Conferi no diff do `App.jsx` que o botão removido é o da tela do WhatsApp.
   - `page-bottom-room`: a regex perde só o `:not(:has(> .wa-screen))`, junto com o mesmo trecho no `assistant.css`.
   - `screen-help`: sai só o par `['WhatsApp', help.WHATSAPP_HELP]`.

### Ajuste do QA (`test(ACUP-020)`)

No `whatsapp-links.test.mjs`, o envio de `RelatoriosGestao.jsx` estava rotulado como "pesquisa de satisfação". Na verdade é o "Chamar no WhatsApp" dos retornos pendentes, e a pesquisa só copia o link. Troquei o comentário e passei a casar a mensagem dos retornos (`Oi, ${name.split…`). Assim o teste diz a verdade sobre o que protege e continua falhando se esse envio sumir.

### Publicação

É site mais `clinic-assistant`: o corpus perdeu o tópico do WhatsApp e `ASSISTANT_SCREENS` perdeu `whatsapp`. Para quem publica:

- se a Edge sair antes do site, o aparelho antigo ainda pode mandar `tela: 'whatsapp'`; a Edge trata como `inicio` (`clinic-assistant/index.ts:266`), sem erro;
- se o site sair antes da Edge, a Edge antiga só oferece um atalho que não existe mais. A assistente não oferece esse atalho sem o tópico, então o risco é baixo.

### Quality depois do ajuste

- Teste ajustado sozinho: 3/3. ESLint do arquivo: limpo.
- Rodada inteira do `npm run quality` depois do ajuste: o sistema parou o processo por falta de memória. Nenhum teste chegou a rodar: cada arquivo morreu em cerca de 17 ms, com 'test failed' sem asserção, porque os processos não subiram. Isso não é defeito do código. Não rodei de novo por conta própria. **Pendente: rodar o quality de novo quando houver memória**, antes de publicar.
- O código entregue (79c260f) passou no quality inteiro, rodado sozinho. O ajuste do QA mexe só em um comentário e numa regex do teste.
