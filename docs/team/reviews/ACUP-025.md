## ACUP-025 — Review do QA (Lucas, 09/11/2026)

- **Entrega:** `claude/dev2` 8c00938 (0855ffb + a frase de abertura; base `integracao` a391aef com a 024). Contrato AG-8, teto AG-9 e Corrigir AG-3. Review na `qa/ACUP-025`, criada de `claude/dev2`.
- **Veredito:** **APROVADO com correção do QA** (`fix(ACUP-025)` nesta branch): uma linha no aparelho e um teste.
- **NÃO PUBLICAR antes do RIPD da ACUP-026 aprovado pela humana (PUB-3).**

### Escopo

- **Arquivos:** os 14 da lista. `docs/team/TASKS.md` entra só pelo commit do Orquestrador (861628f) que veio junto da base.
- **Fora do escopo, nada tocado:** nenhuma SQL e nenhuma migration (PROD-2 intacto).
- **Testes que não mudaram:** `clinic-assistant-agenda` (fase 1, "sem paciente") e `clinic-assistant-finance-corrections`.
- **`rounds.test`:** muda só a asserção do teto (para 80.000) e ganha o teste do máximo.
- **Corpus da assistente:** rodei o script e a única diferença foi de fim de linha (CRLF). O corpus confere com o script.

### Quality

- **Entrega:** `npm run quality` rodado sozinho, exit 0: 1513 testes, 1512 ok e 1 pulado (o de sempre, sem o xmllint). Bate com o resultado do dev.
- **Depois da correção:** ver o fim deste arquivo.

### Correção do QA

**O problema:** `listClinicPatients` corta a busca em 2000 (`.limit(2000)`) e, nos 4 tipos novos, não passava pelo `full()`. É o mesmo ponto que corrigi na 023 para "aniversarios". Com o cadastro cheio:

- `aniversariantes` contaria menos, calado;
- em `agenda_pacientes`, `faltosos` e `proxima_sessao`, um paciente real que ficou de fora da lista cortada apareceria como "Paciente fora da sua lista". Isso é um rótulo errado, e não um "não sei".

**A correção:** a lista passa por `full()` e, cheia, vira `erro`.

**O teste:** "QA 09/11/2026…" em `clinic-assistant-patients.test.mjs`. Cobre os 4 tipos com 2000 pacientes, que dão `erro`, e confere que abaixo do limite tudo segue normal. Com o código da entrega, ele falha (1 falha). Com a correção, o focado passa 11/11.

### Os 8 pontos do foco

1. **Só primeiro nome e idade.**
   - `firstNameOf`, `ageOn` e `FINANCE_FIRST_NAME` da 018 são reusados sem cópia: são importados, e não reescritos.
   - `readPatientResult` remonta só as chaves de cada tipo, nos dois lados.
   - O teste do dev cobre: nome completo, ponto, U+200B, CPF, rótulo fixo com idade, idade 131, `homonimo` não booleano e chave a mais. Tudo derruba a resposta.
   - Varredura recursiva: nenhum sobrenome, nascimento, contato, observação ou id em nenhum tipo.
   - Os campos da agenda reaproveitam a validação de valores fechados da 023 (`readAgendaLine`).
2. **Só o que o login vê.**
   - Os atendimentos vêm de `listAppointments` e os nomes de `listClinicPatients`, os dois com o login de quem pergunta (RLS).
   - Atendimento cujo paciente não está na lista do login vira "Paciente fora da sua lista", sem idade.
   - "eu" é resolvido no aparelho pelo `profile.id`.
   - O servidor não busca nada: só limpa o que veio e confere o papel. Um nome de profissional no pedido não dá mais acesso do que o login já tem.
3. **Perfil × 4 tipos, nos dois lados.**
   - **Aparelho:** `agendaAllowed` roda antes das fontes.
   - **Servidor:** `SERVER_ACCESS` (agenda_pacientes e proxima_sessao para a equipe; faltosos e aniversariantes para administração e recepção), com o papel lido do perfil autenticado.
   - O teste do dev cobre os 3 perfis × 4 tipos nos dois lados.
4. **Regras de cada consulta.**
   - Homônimo: mesmo primeiro nome + idade + profissional.
   - Mais de 5 pacientes com o mesmo nome em `proxima_sessao` dá `ambiguo`, nunca os 5 primeiros calado.
   - Número da sessão por `summarizePackageSessions`, em que o cancelado não conta.
   - Faltosos: `no_show` + `excused`, sem o cancelado pela clínica, e mínimo de 1 a 20.
   - Aniversariantes: a idade que a pessoa vai fazer, sem a data. 29/02 conta em 28/02 no ano comum, como na Agenda, e não de novo em 01/03.
5. **AG-3 (Corrigir).**
   - `PROTECTED_CORRECTION_KEY = 'financeiro'` liga o marcador nos 4 tipos, em `dados` e em volta anterior, no aparelho (`isProtected`) e na Edge (`index.ts:424`).
   - `corrections.ts` só troca o literal pela constante. O filtro da lição protegida segue o mesmo.
   - A regra "correção protegida forçada a approved não entra no prompt de outra pessoa" já está coberta pelo `clinic-assistant-finance-corrections` (7/7, sem mudança) e vale pelo mesmo marcador.
   - Botão e painel não mudaram: só a nota, sem Aprovar nem Promover.
6. **Teto de 80.000.** A constante subiu, e o teste confere que o máximo do contrato (74.122) passa pela Edge e cabe. O maior dos tipos novos (`agenda_pacientes`, 57.360) fica abaixo do financeiro. Bate com a minha conta da 024.
7. **Fase 1 intacta.** `AGENDA_CONSULTAS` segue com 8 tipos e sem paciente, e o teste da 023 não foi mexido.
8. **Frase de abertura.** O novo texto é: "Pergunte sobre o sistema, sobre esta tela, sobre a agenda e os números da clínica. Nas perguntas de agenda, cito o paciente só pelo primeiro nome e a idade. Nunca leio prontuário, evolução, escalas ou anamnese."
   - Não promete financeiro, nem faltosos ou aniversariantes, a quem não tem esse perfil.
   - "Números da clínica" vale para todos: atendimentos, evoluções e agenda.
   - A frase antiga ("Ainda não vejo pacientes nem o financeiro") ficaria falsa com a 025.

### Observações (não bloqueiam)

- **Período no schema:** a descrição de `de`/`ate` no schema ainda lista só financeiro, agenda, faltas, confirmações e pesquisas. O prompt descreve o período dos tipos novos (agenda_pacientes, faltosos, aniversariantes), e o aparelho recusa o pedido sem período com `periodo_invalido`, então o pior caso é uma volta perdida. Vale acrescentar os tipos novos na descrição numa próxima mexida.
- **Custo de `proxima_sessao`:** faz até 5 buscas por paciente e uma `listSeriesSessions` por pacote, dentro de uma volta.

### Quality depois da correção

- **Rodada inteira depois da correção:** o sistema parou o `npm run quality` por falta de memória. Não rodei de novo por conta própria. **Pendente:** rodar o gate antes de juntar.
- **O que rodou, um teste por vez:** `clinic-assistant-patients` 11/11 e `clinic-assistant-agenda` 9/9 (fase 1, que também passa pelo `assistantTools.js`). O ESLint dos dois arquivos que mudei está limpo.
- **Base de comparação:** a entrega (8c00938) passou no gate inteiro, rodado sozinho. A correção mexe numa linha do aparelho e no teste.
