## ACUP-023 — Assistente, fase 1: agenda e operação sem paciente

- Dev: sessão Claude "Documentos timbrados na gestão" (dev2). Pasta `acup-team/dev2`, branch `claude/dev2` (79c260f da ACUP-020 + `git merge integracao`, só docs). Commit de entrega: `git log -1` desta branch.
- Contrato aprovado como AG-5 (8 consultas, limite ≤1 nos pacotes, extensão do `readAuthorizedConsultaResult`, acréscimos 3–7).
- Sem SQL, sem tela, sem publicação, sem push. Dados 100% fictícios; nenhuma chamada a banco, Gemini ou Vertex.

### O que mudou

**8 consultas novas** em `ASSISTANT_CONSULTAS` (aparelho e Edge). Nenhuma traz paciente nem id: nem agendamento, nem `recurrence_group_id`, nem profissional por id. O profissional sai só pelo nome da Agenda (`shortName`).

| tipo | quem vê (`AGENDA_ACCESS`) | linha | resumo | fonte (tela de origem) |
|---|---|---|---|---|
| `agenda` | equipe | dia, inicio, fim, profissional, area, tipo_atendimento, modalidade, status | agendados, atendidos, faltas, cancelamentos, bloqueios | `listAppointments` (Agenda); bloqueio só conta, sem motivo nem nome |
| `faltas` | equipe | profissional, area, nao_compareceu, cancelado_paciente, cancelado | total, atendimentos | `listAppointments` + `isAbsence` (Gestão → Indicadores) |
| `confirmacoes_pendentes` | equipe | dia, inicio, profissional, area | total | `listPendingConfirmations` (fila da Agenda); sem período = amanhã; o token nunca sai |
| `pacotes_fim` | equipe | profissional, area, pacotes, sessoes_restantes | total | `listAppointments` ±180 dias + `summarizePackageSessions` por série; em uso = sessão nos últimos 30 dias; perto do fim = ≤1 agendada (`PACKAGE_NEAR_END_MAX`, igual ao `packagesNearEnd`) |
| `aniversarios` | administração e recepção | — | total | `currentMonthBirthdays(listClinicPatients)`; o nascimento fica no aparelho |
| `pesquisas` | administração | — | respondidas, media (1 decimal), aguardando | `listSatisfactionSurveys({from,to})` + a regra do quadro Pesquisa (responded_at; expires_at) |
| `formularios_pendentes` | `can_manage_patient_portal` | — | enviados, respondidos, aguardando | `listAssignments` + `sendsTabSummary` (Importáveis) |
| `convenio` | `can_manage_finance` | — | guias_com_pendencia, guias_prontas, lotes_nao_enviados, guias_esperando_operadora, valor_esperando_centavos, glosadas, notas_pendentes, notas_a_cancelar, valor_notas_pendentes_centavos | `loadTissData` + `buildTissTiles` (os dois primeiros números são o `display` dos quadros Guias e Lotes); `loadFiscalData` + `fiscalQueue` |

- **Valores fechados, não só chaves:**
  - `area` ∈ `FINANCE_AREAS`;
  - `tipo_atendimento` ∈ `AGENDA_TYPE_LABELS` (rótulos de `APPOINTMENT_TYPES` + `SERVICES_BY_AREA` + "Sem tipo");
  - `status` ∈ `AGENDA_STATUS_LABELS` (`APPOINTMENT_STATUSES`);
  - `modalidade` ∈ Presencial / Online / Não informada;
  - dia AAAA-MM-DD real, hora HH:MM, números inteiros ≥ 0 e média 1..5 com 1 decimal.
- **Limpeza** (`readAgendaResult`, nos dois lados): chave a mais em qualquer nível (topo, linha ou resumo) derruba a resposta inteira (`motivo: 'erro'`, sem lista).
- **Limites:** acima de 50 linhas, `limite_linhas` com o resumo em números e sem a lista (nada cortado calado). Período de até 93 dias, obrigatório em agenda, faltas e pesquisas. Fonte que bate no limite do serviço (2000 agendamentos, 1000 pesquisas, 500 envios) vira `erro`, para nunca subcontar. Fonte que falha vira `erro`, nunca zero.
- **Aparelho (`assistantTools.js`):** `agendaAllowed` roda antes de qualquer fonte. Equipe = quem tem clínica. Aniversários = `clinic_admin` ou `receptionist`. Pesquisas = `clinic_admin`. Portal e convênio = `clinic_admin` + RPC `can_manage_patient_portal` / `can_manage_finance` do login.
- **Servidor (`readAuthorizedConsultaResult`, a porta FIN-1 estendida, com a mesma assinatura e a mesma chamada):**
  - a tabela `SERVER_ACCESS` fica dentro da função (o teste do financeiro avalia a função isolada) e o teste confere que ela é igual a `AGENDA_ACCESS`;
  - `convenio` usa a RPC `can_manage_finance` e `formularios_pendentes` usa `can_manage_patient_portal` (a regra do banco);
  - `aniversarios` e `pesquisas` leem `profiles.role`/`clinic_id` do id autenticado (nunca do pedido) e exigem a mesma clínica;
  - sem permissão ou com erro, devolve null (o mesmo descarte do FIN-1);
  - consultas da equipe não releem o papel: a rota já recusa antes quem não tem papel de clínica ou clínica (`roleOf` + `if (!role || !clinicId)`), e o teste confere essa barreira.
- **Prompt (`index.ts`):** a lista das 8 consultas com perfil e período; a regra de leitura ("NÃO trazem paciente", limite_linhas com resumo, média, centavos, operadora não é cobrança ao paciente); a capacidade nova em `CAPABILITIES`; a descrição de `de`/`ate` no schema. O trecho de contagem antiga passou a nomear os 4 tipos antigos.
- **Ajuda:** dois itens novos no tópico Assistente do `screenHelp.js` (nenhum existente mudou); corpus regenerado.
- **AGENTS.md:** só o bullet da assistente, com a regra AG-5 e o teste.

### Arquivos

`frontend/src/utils/clinicAssistant.js`, `frontend/src/services/assistantTools.js`, `supabase/functions/_shared/assistantConsulta.ts`, `supabase/functions/clinic-assistant/index.ts`, `frontend/src/data/screenHelp.js` + `_shared/assistantHelpCorpus.ts` (gerado), `AGENTS.md`, novo `frontend/tests/regression/clinic-assistant-agenda.test.mjs`, este handoff.

- `assistantTools.js` ganhou uma linha de import separada (`loadFiscalData, loadTissData`), porque o teste do financeiro confere a linha `import { loadReceivablesData } from './financeiroService'` literalmente.
- `gestaoSummary.js` não carrega fora do Vite (`gestaoSurveys.js` importa `./agenda` sem extensão). Por isso a média das pesquisas é calculada no `clinicAssistant.js` com a mesma fórmula do quadro, e o teste confere contra o `buildGestaoSummary` real, carregado pelo Vite.

### Testes (`clinic-assistant-agenda.test.mjs`, 8 testes)

1. Espelho: tipos, acesso, chaves, rótulos, critérios e motivos iguais; rótulos iguais aos das fontes; `SERVER_ACCESS` = `AGENDA_ACCESS`; `readConsulta` igual nos dois lados.
2. Perfis no aparelho: 3 perfis × 8 consultas. Quem não pode recebe `sem_permissao` sem disparar fonte. Administração sem a RPC do banco também para antes da fonte.
3. Perfis no servidor: papéis × 8 consultas com cliente falso. As identidades usadas são só as autenticadas; os dados são descartados sem permissão, com perfil de outra clínica ou com erro; e a barreira da rota é conferida.
4. Sem paciente e sem id: lista fechada de chaves recursiva em todas as consultas. Nenhum valor de paciente, id, token, nota ou nascimento sai, mesmo com eles nas fontes.
5. Edge: em cada tipo, uma chave a mais (paciente, id, token, note) no topo, na linha e no resumo derruba a resposta inteira. Valores fora da lista também derrubam.
6. Números batem com as telas no mesmo caso fictício:
   - agenda e faltas: `isAbsence`;
   - confirmações: a fila da Agenda;
   - pacotes: `packagesNearEnd` dá o mesmo número;
   - aniversários: `currentMonthBirthdays`;
   - pesquisas: `buildGestaoSummary`;
   - formulários: `sendsTabSummary`;
   - convênio: `buildTissTiles` e `fiscalQueue`;
   - mais o filtro por pessoa.
7. A falha de cada fonte vira `erro`. Fonte no limite vira `erro`. 51 linhas → `limite_linhas` com o resumo, que a Edge aceita. 50 passam. 94 dias e agenda sem período são recusados.
8. Prompt, ajuda, AGENTS e nenhuma escrita no `assistantTools.js`.

- **Mutações** em disco, restauradas: tirar a porta do aparelho → 1 falha; tirar a porta do servidor → 1 falha; pôr `id` na linha da agenda → 5 falhas. **3/3.**
- Os testes do financeiro, das correções e da assistente seguem iguais (55/55), sem nenhuma asserção mexida.

### Gate

Ver a linha "Gate" no fim deste arquivo.

### Roteiro para o QA

1. Rodar o teste novo, os três da assistente e o gate.
2. Ler `readAgendaResult` dos dois lados e `SERVER_ACCESS`/`ROLES` no `index.ts`.
3. Forjar na Edge: chave a mais, rótulo de tipo ou status inventado, hora e dia inválidos.
4. Conferir que `agenda` com bloqueio não traz `note` e que a confirmação não traz `confirmation_token`.
5. Conferir os números com as telas (Agenda, Gestão → Indicadores/Pesquisa/Importáveis, Financeiro → Resumo).

### Limites

- `atendimentos` (resumo de faltas) = agendamentos de tipo atendimento no período, de todos os status. É a base para a taxa de falta.
- `pacotes_fim` conta pacotes da Agenda (séries), não pacotes do Financeiro. O número bate com a "Sua atenção hoje" quando as duas fontes descrevem os mesmos pacotes (caso do teste). Série sem sessão nos últimos 30 dias não entra. A janela é de ±180 dias.
- Os quatro números do convênio além de Guias/Lotes repetem os filtros de `buildTissTiles` (o quadro só traz texto para eles). O teste confere contra o texto do quadro.
- Prompt conferido só como texto: sem chamada real ao Gemini. Sem Deno instalado: sem `deno check`.
- Não há tela nova: prints não se aplicam. Publicar: nunca da dev2; precisa republicar a `clinic-assistant`.

### Gate

- `npm run lint`: exit 0, sem avisos.
- `npm test`: exit 0, **1492 testes, 1491 aprovados, 1 pulado, 0 falhas**, 267020 ms.
- `npm run build`: exit 0, 1,98 s.
