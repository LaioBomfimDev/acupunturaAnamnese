## ACUP-027 — Assistente, fase 3: ações que a pessoa confirma

- Dev: sessão Claude "Documentos timbrados na gestão" (dev2). Pasta `acup-team/dev2`, branch `claude/dev2`, por cima da `qa/ACUP-025` (7b82b83, PUB-4: a 025 fica fora do integracao até o RIPD). Commit de entrega: `git log -1` desta branch. O integracao não foi juntado depois disso.
- Contrato: AG-4 + AG-10 (alternativa A e a lista de arquivos aprovadas, com os acréscimos). Mudança de asserção aprovada: `online-consultation.test.mjs` (alternativa A).
- Sem SQL, sem push, sem publicação. **Publicação só com o RIPD da ACUP-026 aprovado (PUB-3), junto com a 025.**

### O que mudou

- **Duas ações, uma por resposta.** O campo `acao` aceita só `confirmacao` ou `novo_agendamento` (lista fechada `ASSISTANT_ACTIONS`, com espelho nos dois lados).
  - Se a IA mandar uma lista ou um tipo fora dessa lista, a resposta fica sem ação.
  - O prompt diz que a IA só prepara: uma ação por vez, sem modelo de falta e sem escrever o ref no texto.
- **Ref, nunca id.** Cada linha de `agenda_pacientes` e de `proxima_sessao` ganha um `ref` aleatório: um `r` seguido de 3 caracteres.
  - O ref vem da tabela da conversa (`createRefRegistry`), que fica só na memória da aba e é zerada na troca de conta.
  - A Edge aceita uma ação só se o ref veio dos dados aceitos naquela chamada (`refsOf`) e se o profissional está na EQUIPE.
  - O aparelho resolve o ref pela tabela. O paciente nunca vem do texto da IA.
- **Confirmação.** O texto saiu da `PendingConfirmationView` sem mudar nada e foi para `utils/agendaMessages.js` (`buildConfirmationMessage`). A Agenda e a assistente chamam a mesma função.
  - O botão é um link `wa.me` (`target=_blank`): a pessoa toca em Enviar.
  - Antes de montar o link, o aparelho confere que o atendimento está pendente, que tem o link de confirmação e que o WhatsApp do cadastro é válido. Se algo falta, aparece o motivo: "ainda não tem link de confirmação", "O cadastro de X não tem um WhatsApp válido" ou "não está esperando confirmação".
  - O rótulo mostra só o primeiro nome. O telefone nunca vai para a IA.
- **Novo agendamento.** O botão abre a Agenda (`App` troca a `key` e passa `initialDraft`) com o painel aberto e o formulário preenchido: paciente (campo com o nome), área, profissional, dia, hora e tipo.
  - O formulário mostra a faixa "Preenchido pela assistente: confira antes de salvar.". A faixa some ao salvar.
  - "Como paga" fica no padrão de sempre (Particular) e nenhum valor é preenchido.
  - Profissional que não está na EQUIPE, tipo fora do catálogo da área e hora inválida ficam vazios.
  - As validações normais continuam. Nada é salvo sem o botão Agendar.
- **Pedidos do Orquestrador e do QA.**
  - A descrição de `de`/`ate` no schema cita `agenda_pacientes`, `faltosos` e `aniversariantes` (31 dias, opcional) e diz que `proxima_sessao` não usa período.
  - A linha "Ações" do prompt ficou depois da linha "Paciente na consulta financeira", para não empurrar as regras financeiras para fora do recorte que o teste lê.
- **Ajuda e AGENTS.** O tópico Assistente ganhou o item da ação e a nota "só prepara", e o corpus foi gerado de novo. No AGENTS, o bullet da assistente ganhou "Ações preparadas", e a regra do WhatsApp agora cita a confirmação da assistente (a pessoa toca em Enviar).

### Arquivos

- Código:
  - `frontend/src/utils/agendaMessages.js` (novo)
  - `frontend/src/components/panels/agenda/PendingConfirmationView.jsx`
  - `frontend/src/utils/clinicAssistant.js`
  - `supabase/functions/_shared/assistantConsulta.ts`
  - `frontend/src/services/assistantTools.js`
  - `frontend/src/services/clinicAssistantService.js`
  - `supabase/functions/clinic-assistant/index.ts`
  - `frontend/src/components/assistant/assistantStore.js`
  - `frontend/src/components/assistant/ClinicAssistant.jsx`
  - `frontend/src/App.jsx`
  - `frontend/src/components/panels/Agenda.jsx`
- Estilos: `frontend/src/styles/assistant.css` (`.ca-action`, `.ca-action-note`) e `frontend/src/styles/agenda.css` (`.ag-draft-banner`, só tokens).
- Ajuda e regras: `frontend/src/data/screenHelp.js`, o corpus gerado e `AGENTS.md`.
- Testes: o novo `clinic-assistant-actions.test.mjs` e mais quatro:
  - `confirm-appointment-page.test.mjs`: **mudança de asserção que ainda pede o seu OK**. Só troquei o arquivo lido para `utils/agendaMessages.js`, como na alternativa A aprovada para o online-consultation; a regex não mudou.
  - `online-consultation.test.mjs`: mudança aprovada (alternativa A).
  - `clinic-assistant-patients.test.mjs`: a linha da próxima sessão é comparada sem o `ref`, e um teste novo confere o formato do ref. Os valores conferidos não mudaram.
  - `clinic-assistant-rounds.test.mjs`: a linha de tamanho máximo ganhou `ref`, porque o ref passou a ser obrigatório.
- Fora do repo: `mesa/ferramentas/harness-telas/server-027-dev2.mjs`, que é o `server.mjs` com um `from()` encadeável, e `telas/acao-027-dev2.jsx`.

**Atenção, CSS:** `agenda.css` não estava na lista aprovada. A faixa precisa morar na Agenda, então acrescentei uma regra de 10 linhas, só com tokens. Se preferir, troco por uma classe que já existe.

### Testes (`clinic-assistant-actions.test.mjs`, 9 testes)

- Texto da confirmação igual ao da Agenda, conferido com endereço, sem endereço e na sala online. A Agenda e a assistente chamam a mesma função, e nenhuma das duas tem o texto escrito à mão.
- **Refs:** formato; o mesmo atendimento repete o ref; outra conversa não resolve; id não vale como ref; colisão do aleatório.
- **readAssistantAction** (no aparelho e na Edge): lista fechada; várias ações viram nenhuma; ref fora dos dados aceitos é recusado; profissional fora da equipe fica vazio. Também conferidos: `refsOf` e a Edge usando só os dados aceitos.
- **Preparar a confirmação:**
  - o paciente vem do ref, mesmo que o texto da IA diga outro nome;
  - o link tem o texto exato da Agenda e só primeiro nome no rótulo;
  - a tela só lê, nada grava;
  - cobertos os motivos sem link, não pendente, sem WhatsApp, ref desconhecido e fonte que falha.
- **Novo agendamento:**
  - rascunho com o profissional da equipe;
  - o que não casa fica vazio;
  - nenhum campo de pagamento ou valor;
  - preparar não grava nada (sem createAppointment, insert ou update, from() ou fetch);
  - na tela, o link do WhatsApp só abre com o toque da pessoa;
  - a Agenda abre o painel com a faixa e o nome do paciente, e o efeito não toca em "Como paga".

Gate: lint ok; npm test 1523 (1522 ok, 1 pulado, 0 falhas); build ok.

**Mutações** em disco, restauradas, **10/10 pegas:**
1. texto da mensagem;
2. ref fora dos dados aceitos, no aparelho;
3. a mesma, na Edge;
4. profissional fora da equipe;
5. paciente pelo texto da IA;
6. sem a checagem do link de confirmação;
7. nome completo no rótulo;
8. profissional "chutado" do atendimento;
9. painel que não abre;
10. Edge sem `refsOf`.

**Print achou um defeito, corrigido antes da entrega:** o paciente ficava marcado, mas o campo aparecia vazio, porque o campo mostra o texto da busca. Agora o rascunho leva `patientName` (fica só no aparelho), e o teste confere isso.

### Prints (`mesa/prints/ACUP-027/`)

- `agenda-preenchida.png` (computador) e `agenda-preenchida-celular.png` (390px, página inteira, sem rolagem lateral): faixa, profissional, paciente, Particular, Psicologia, Sessão, 14:30.
- `painel-acoes.png` e `painel-acoes-celular.png`: os dois botões e o motivo. Nestes, a marcação do botão foi copiada do componente para o print. O painel de verdade só aparece com a conversa ao vivo.
