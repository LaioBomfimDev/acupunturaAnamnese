## ACUP-025 — Assistente, fase 2: agenda com paciente (primeiro nome + idade)

- Dev: sessão Claude "Documentos timbrados na gestão" (dev2). Pasta `acup-team/dev2`, branch `claude/dev2`, sobre o d0550f3 (ACUP-024). Commit de entrega: `git log -1` desta branch.
- Contrato aprovado como AG-8 (4 tipos novos, sem ampliar os da 023; faltosos só administração e recepção; Corrigir pela alternativa A, com `PROTECTED_CORRECTION_KEY`; acréscimos 3–8).
- Sem SQL, sem tela nova, sem publicação, sem push. **Publicação só com o RIPD da ACUP-026 aprovado (PUB-3).**

### O que mudou

| tipo | quem vê | linha | resumo | fonte |
|---|---|---|---|---|
| `agenda_pacientes` | equipe | dia, inicio, fim, paciente, idade, homonimo, profissional, area, tipo_atendimento, modalidade, status | agendados, atendidos, faltas, cancelamentos, bloqueios | `listAppointments` (login) + `listClinicPatients` (login); bloqueio só conta |
| `proxima_sessao` | equipe | paciente, idade, homonimo, dia, inicio, profissional, area, tipo_atendimento, sessao_numero, sessoes_total | total | `listAppointments({patientId})` dos próximos 180 dias (Agendado) + `listSeriesSessions` + `summarizePackageSessions` (cancelado não conta) |
| `faltosos` | administração e recepção | paciente, idade, homonimo, profissional, area, nao_compareceu, cancelado_paciente | total | `listAppointments` + `isAbsence`, sem o "Cancelado" da clínica; `minimo` 1..20 (padrão 2) |
| `aniversariantes` | administração e recepção | paciente, idade (a que vai fazer), homonimo | total | `birthdaysByDay` (mesma regra da Agenda: 29/02 em 28/02 no ano comum); período de até 31 dias, padrão o mês atual; sem a data |

- **Paciente:** os mesmos `firstNameOf`, `ageOn` e `FINANCE_FIRST_NAME` da 018, reusados sem cópia e sem mudar de lugar.
  - Nome que não passa na trava, ou paciente que a Agenda mostra mas a lista do login não traz, vira "Paciente fora da sua lista" (ou "Paciente arquivado"), sempre com `idade: null`.
  - Nada de observacoes, contato, CPF, nascimento ou carteirinha.
  - A linha só existe se o atendimento aparece para o login (RLS de `listAppointments`).
- **Homônimo:** mesmo primeiro nome + idade + profissional, pessoas diferentes → `homonimo: true`, e o prompt manda dizer só "dois pacientes com o mesmo nome". Na `proxima_sessao`, mais de 5 pacientes com o nome → `ambiguo` ("diga a idade ou o profissional"), nunca os 5 primeiros calado.
- **Pedido:** `paciente` é só o primeiro nome (a trava); nome completo vira `filtro_invalido` antes das fontes e nunca é devolvido. "eu" vira a pessoa no aparelho, pelo login; o servidor não amplia acesso por nome de profissional.
- **Edge:** `readPatientResult` remonta só as chaves do tipo. Nome completo ou disfarçado (ponto, espaço invisível, CPF), rótulo fixo com idade, idade fora de 0..130, homonimo não booleano ou chave a mais derrubam a resposta inteira. Os campos da agenda usam a mesma validação de valores fechados da 023 (`readAgendaLine`). A Edge devolve o pedido sem o campo interno (`readPatientRequest`).
- **Acesso:** `AGENDA_ACCESS` e `SERVER_ACCESS` ganham os 4 tipos, pela mesma porta da 023 (aparelho antes das fontes; servidor pelo papel do perfil). `AGENDA_CONSULTAS` segue com 8 e sem paciente.
- **Corrigir (AG-3):** `PROTECTED_CORRECTION_KEY = 'financeiro'`, em `clinicAssistantService.js` e `_shared/corrections.ts`, com o comentário "resposta com dinheiro OU com paciente" e o nome mantido pelas notas já gravadas.
  - O serviço liga o marcador quando qualquer volta (dados ou anteriores) é financeira ou de um dos 4 tipos. A Edge também liga.
  - Botão e painel já tratam esse marcador (só a nota, sem resposta, sem Aprovar nem Promover, filtro da autora), por isso `AiCorrectionButton.jsx` e `AICorrectionsPanel.jsx` não mudaram.
- **Prompt, schema e capacidade:** os 4 tipos descritos; leitura (primeiro nome e idade, rótulos fixos, homônimo, aniversário sem data, "sessão N de M", total 0 = sem próxima sessão); `minimo` no schema.
- **Ajuda e AGENTS:** um item no tópico Assistente; bullet da assistente com a regra e o marcador que cobre os dois casos.

### Arquivos

`frontend/src/utils/clinicAssistant.js`, `frontend/src/services/assistantTools.js`, `frontend/src/services/clinicAssistantService.js` (marcador), `supabase/functions/_shared/assistantConsulta.ts`, `supabase/functions/_shared/corrections.ts` (só a constante), `supabase/functions/clinic-assistant/index.ts`, `frontend/src/data/screenHelp.js` + corpus gerado, `AGENTS.md`, novo `frontend/tests/regression/clinic-assistant-patients.test.mjs`, este handoff.

### Testes (`clinic-assistant-patients.test.mjs`, 10 testes)

- Espelho, com a fase 1 seguindo com 8 tipos e sem paciente; `SERVER_ACCESS` = `AGENDA_ACCESS`.
- **Perfis:** 4 tipos × administração, recepção e profissional, no aparelho (antes das fontes) e no servidor.
- **Primeiro nome + idade:** nenhum sobrenome, nascimento, contato, observação ou id em nenhum tipo; lista fechada recursiva; "Paciente fora da sua lista" sem idade; bloqueio sem nome; "eu" pelo login.
- **Homônimos:** dois Lucas de 7 anos com o mesmo profissional; filtro por idade; mais de 5 → ambiguo.
- **Próxima sessão:** "2 de 3" com cancelado fora da conta; sem próxima = 0; paciente obrigatório.
- **Faltosos:** mínimo, e cancelado pela clínica fora.
- **Aniversariantes:** mês padrão; idade que vai fazer; sem data; 29/02 em 28/02/2027 e não de novo em 01/03; 31 dias.
- **Edge:** nome completo, ponto, espaço invisível, CPF, rótulo com idade, idade 131, chave a mais → erro; pedido com nome completo recusado antes das fontes.
- **AG-3:** os 4 tipos (em dados e em volta anterior) ligam o marcador; a fase 1 não liga; a constante e o filtro do corrections.ts estão no lugar.
- Falha de fonte vira aviso, mais prompt, ajuda e AGENTS.

O filtro "correção protegida forçada a approved não entra no prompt de outra pessoa" é o mesmo da 017, pelo mesmo marcador, e já está coberto pelo `clinic-assistant-finance-corrections.test.mjs`. Aqui o teste prova que as respostas com paciente ligam esse marcador.

**Mutações** em disco, restauradas: nome completo saindo do aparelho → 6 falhas; mais de 5 homônimos cortados calado → 1; marcador sem os tipos com paciente → 1. **3/3.**

Os testes da 023 (fase 1 sem paciente), da 024, do financeiro e das correções seguem iguais (94/94 juntos antes do teste novo).

### Gate

Ver a linha "Gate" no fim deste arquivo.

### Roteiro para o QA

1. Rodar o teste novo, os da assistente e o gate.
2. Ler `readPatientResult` dos dois lados, `runPatientConsulta` (porta antes das fontes; "eu" pelo login; ambiguo > 5) e o marcador.
3. Forjar na Edge um nome disfarçado, um rótulo com idade e uma chave a mais.
4. Conferir que os tipos da 023 seguem sem paciente.

### Limites

- O texto de abertura do painel (`ClinicAssistant.jsx`: "Ainda não vejo pacientes…") fica desatualizado com a 025. O arquivo não está na lista; a troca da frase precisa de autorização.
- A `proxima_sessao` faz uma busca por paciente que casa (no máximo 5) e uma `listSeriesSessions` por pacote.
- Prompt conferido só como texto; sem Deno. A sintaxe do `index.ts` foi conferida tirando os tipos e rodando `node --check`.
- **Não publicar antes do RIPD da 026.** Publicar exige o site e a `clinic-assistant`, e o `corrections.ts` mudou só na constante.

### AG-9 (teto de tamanho, pedido na entrega)

- `ASSISTANT_MAX_DADOS_CHARS` subiu de 64.000 para **80.000**. O máximo do contrato (3 financeiros `por_paciente` de 50 linhas, paciente com 40 letras e profissional com 120) dá 74.122 e antes caía em 413.
- Teste novo no `clinic-assistant-rounds.test.mjs`: esse máximo passa pela Edge e cabe no teto (e passa de 64 mil, para provar o motivo); a asserção do teto antigo virou 80.000.
- Conta refeita com os tipos novos da 025, no máximo do contrato (paciente 40, profissional 80, os maiores rótulos de área, tipo, status e modalidade, contadores no limite): `agenda_pacientes` 57.360 em 3 consultas; `proxima_sessao` 51.447; `faltosos` 39.390; `aniversariantes` 14.100. Nenhum passa do financeiro, e o teste confere o maior (`agenda_pacientes`) abaixo dele.

### Gate (sobre a integracao a391aef juntada, com a 024 aprovada e a correção 741d371)

- `npm run lint`: exit 0, sem avisos.
- `npm test`: exit 0, **1513 testes, 1512 aprovados, 1 pulado, 0 falhas**, 187686 ms.
- `npm run build`: exit 0, 2,18 s.
