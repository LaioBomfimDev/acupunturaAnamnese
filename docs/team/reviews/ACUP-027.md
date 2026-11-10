## ACUP-027 — Review do QA (Lucas, 09-10/11/2026)

- **Entrega:** `claude/dev2` 38ebe07, por cima da `qa/ACUP-025` (7b82b83); o integracao não foi juntado. Contratos AG-4 e AG-10. Review na `qa/ACUP-027`, criada de `claude/dev2`.
- **Quem revisou:** o LK seria o revisor, mas a janela dele não lê a caixa; por decisão do Orquestrador, a review ficou com o QA.
- **Veredito:** **APROVADO**, sem correção de código.
- **Gate inteiro pendente:** o sistema parou o `npm run quality` por falta de memória. O Orquestrador já combinou rodar o quality completo ao juntar a 025 com a 027 (PUB-4).
- **NÃO PUBLICAR:** vai junto da 025, depois do RIPD da 026 (PUB-3/PUB-4).

### Escopo

- **Arquivos:** os 22 do diff. Os itens fora da lista inicial foram aprovados em LK-2: a asserção do confirm-appointment-page (só o arquivo lido), a `.ag-draft-banner` no `agenda.css` (só tokens) e o ref nas linhas dos testes patients e rounds.
- **Fora do escopo, nada tocado:** nenhuma SQL e nenhuma migration (PROD-2 intacto).
- **Corpus da assistente:** rodei o script e a única diferença foi de fim de linha (CRLF). O corpus confere com o script.

### Quality

- **`npm run quality` da entrega:** o sistema parou a rodada por falta de memória e eu não rodei de novo.
- **No lugar dele, rodei um por vez:**

  | Teste | Resultado |
  |---|---|
  | `clinic-assistant-actions` | 9/9 |
  | `clinic-assistant-patients` | 11/11 |
  | `clinic-assistant-rounds` | 10/10 |
  | `confirm-appointment-page` | 11/11 |
  | `online-consultation` | 31/31 |
  | `whatsapp-links` | 3/3 |
  | `clinic-assistant-agenda` | 9/9 |
  | `clinic-assistant` | 27/27 |

  O `npm run lint` passou e o `npm run build` também (3,06 s).
- **Falta a suíte inteira:** fica com o Orquestrador, no merge da 025 com a 027.

### Os 8 pontos do foco

1. **Nada é gravado nem enviado sem clique.**
   - **Confirmação:** é um `<a href=wa.me… target=_blank>`, então a pessoa toca no link e depois em Enviar no WhatsApp.
   - **Novo agendamento:** o botão abre a Agenda, que é remontada pela `key` e recebe `initialDraft`. O formulário vem preenchido: paciente, área, profissional, dia, hora e tipo, com `repeat: false`.
     - "Como paga" e valor não vêm do rascunho; o formulário fica no padrão de sempre. No print, aparece "Particular".
     - As validações e o botão Agendar são os de sempre.
     - A faixa "Preenchido pela assistente: confira antes de salvar." aparece e some ao salvar.
   - **Preparo da ação** (`prepareAssistantAction`): só lê. Usa `listClinicPatients`, `listPendingConfirmations`, `listClinicMembers` e `loadAgendaSettings`, e o teste do dev confere que não há createAppointment, insert, update, from() nem fetch.
2. **Ref, nunca id.**
   - O ref tem o formato `/^r[0-9a-z]{3}$/`, é aleatório e vem da tabela da conversa (`createRefRegistry`). A tabela fica na memória da aba e é zerada na troca de conta.
   - A Edge exige o formato do ref em cada linha (`readPatientLineFor`) e só aceita uma ação se o ref veio dos dados aceitos naquela chamada (`refsOf`).
   - O aparelho resolve o ref pela tabela e acha o paciente pelo `patientId` da tabela, nunca pelo texto da IA. Se a IA disser "Lucas" e o ref apontar outro paciente, vale o ref (teste do dev, mutação 5).
   - Ref desconhecido devolve "Não encontrei esse atendimento nesta conversa…". O telefone nunca vai ao prompt.
3. **Uma ação por resposta.** `readAssistantAction` recusa uma lista, ou seja, várias ações viram nenhuma, nos dois lados. O prompt manda pedir uma por vez.
4. **Texto da confirmação idêntico ao da Agenda.**
   - `buildConfirmationMessage` é o código antigo movido sem mudança: saudação, link, parágrafo da sala online, endereço só presencial e "Obrigado(a)!". O helper `hora` é igual linha a linha.
   - A Agenda passa os mesmos argumentos de antes (`patientName`, `shortName` do profissional, `profile.clinic.name/address`, `agendaSettings`). A assistente passa as mesmas fontes, então a mensagem sai igual nos dois lugares.
   - O teste do dev compara com endereço, sem endereço e na sala online.
5. **Ação só para quem pode na tela.** Na Agenda, a fila Pendentes e o Novo agendamento não têm trava de perfil: quem abre a Agenda usa os dois. A assistente oferece as mesmas ações, com os dados vindos do login (RLS). Salvar continua passando pelas validações e permissões de sempre.
6. **Asserções trocadas só onde foi autorizado.**
   - `online-consultation`: só o arquivo lido mudou (alternativa A), e a regex é a mesma.
   - `confirm-appointment-page`: só o caminho do arquivo mudou (LK-2).
   - `patients`: a linha é comparada sem o `ref`, e o formato do ref é conferido à parte; os valores não mudaram.
   - `rounds`: a linha de tamanho máximo ganhou `ref: 'r000'`.
7. **Intactos.** `whatsapp-links`, `clinic-assistant-agenda` (fase 1) e o teste "sem paciente" não aparecem no diff e passam.
8. **Prints.** Os do dev estão em `mesa/prints/ACUP-027`. Fiz os meus com o harness `acao-027-dev2`, servido sobre esta branch:
   - `agenda-preenchida-qa`, no computador;
   - `agenda-preenchida-celular-qa`, a 390 px, sem rolagem lateral;
   - `painel-acoes-qa` e `painel-acoes-celular-qa`. Neles, a marcação do botão foi copiada do componente, como o dev avisou: o painel real só aparece com a conversa ao vivo.

### Observações (não bloqueiam)

- **Profissional por nome curto:** no Novo agendamento, o profissional é escolhido pelo nome curto (`shortName`). Se duas pessoas tiverem o mesmo nome curto, fica a primeira. A pessoa confere antes de salvar e a faixa avisa.
- **Ação só com dados da própria pergunta:** a Edge só aceita uma ação se o ref veio de dados consultados naquela pergunta. Se a pessoa pedir "manda a confirmação do Lucas" numa pergunta nova, a IA tem de consultar a agenda de novo (o prompt manda pedir a consulta antes). É o desenho do AG-10 e é mais seguro, mas custa uma volta.
- **Ajuste do período no schema:** feito, era a observação da 025. A descrição de `de`/`ate` agora cita `agenda_pacientes`, `faltosos` e `aniversariantes` (31 dias) e diz que `proxima_sessao` não usa período.
