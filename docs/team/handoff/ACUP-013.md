## ACUP-013 — entrega para review

- Branch/base: `codex/lk`, merge autorizado de `integracao` (`3559206`, fast-forward) antes de implementar. Commit de entrega: `feat(ACUP-013): adiciona tela de supervisão formal` (este handoff acompanha o commit).
- Resultado: aba Supervisão no grupo Equipe, disponível sem paciente selecionado; lista encontros e horas assinadas por profissional. Cria/edita rascunho, confirma assinatura, confirma anulação com motivo e permite ao próprio supervisionado marcar ciência uma vez. Assinado/anulado não oferecem edição. Ajuda em `ABA_HELP.supervisao`, pelo ScreenHelp já existente, com espelho regenerado.
- Fonte de autoridade: `loadTeams()`/`aba_get_teams` para identidade, administração, supervisão ativa e profissionais do time. Opções de paciente vêm dos times supervisionados; administração também usa os disponíveis já retornados pelo banco. Sem cargo novo, consultas diretas ou inferência por matrícula clínica. Falha ao conferir os times mantém dados de leitura e esconde ações. O banco continua a decidir o acesso.
- SUP-3: `content_restricted` mostra dados e horas com “Pauta restrita”, sem vínculo/paciente nem textos. Mesmo um objeto de teste contendo indevidamente paciente/pauta/decisões/motivo é ocultado pela renderização. Ciência continua disponível ao próprio supervisionado no assinado, conforme contrato, sem dar acesso clínico.
- Paciente arquivado: a lista não devolve uma flag de arquivamento. Não inventamos esse estado pela ausência do paciente. Quando o banco retorna 22023 “Paciente arquivado...”, a tela explica “Paciente arquivado: aguarde a decisão da exclusão” junto do botão/na confirmação e bloqueia a ação até atualizar. Isso cobre assinar, anular e ciência; leitura e horas continuam. “Atualizar” permite nova conferência após a decisão; não presume que o arquivamento terminou.
- Horas: soma minutos dos registros autorizados e do filtro escolhido, somente `status === 'assinado'`, por supervisionado; converte depois de somar, sem arredondar por encontro. Exemplos: 35 + 25 minutos = “1 hora”; 120 = “2 horas”; 61 = “1 hora e 1 minuto”. A RPC já fornece `totals`, mas a tela deriva a soma dos mesmos `records` para acompanhar exatamente seu filtro, sem consulta adicional. Na falha de leitura, mostra erro/retry e não inventa zero.
- Escrita: novas funções do service passam pelo `call()` existente. Payload fechado sem ator/clínica; UUID criado uma vez por rascunho, evento novo por ação; confirmação guarda o evento e uma ref síncrona impede clique repetido. Ciência não envia `p_revision`. Sucesso relê lista e metadados, sem incrementar revisão localmente por suposição.
- Conflito: 40001 mantém formulário/textos abertos; “Atualizar lista” não muda o rascunho nem rebaseia sua revisão silenciosamente. Salvar fica bloqueado; para trabalhar na versão nova, fechar e reabrir após confirmar o descarte. Isso evita restaurar texto de paciente excluído por rebase automático. Motivo de anulação também permanece se a ação falhar. Esc, ×, cancelar e fundo passam por `useDismiss`/`DismissPrompt`, com foco contido e proteção enquanto salva.
- Privacidade: pauta/decisões/motivo não entram em título, atributo title, console ou armazenamento local. Títulos de diálogos são fixos. Registros não retornam nomes de pacientes, e cartões não tentam recuperá-los quando o conteúdo é restrito. Não há SQL nesta task, produção, financeiro ou certificação.
- Arquivos: novo `AbaSupervision.jsx`, funções novas em `abaService.js`, somente registro da aba em `AbaWorkspace.jsx`, acréscimos em `aba.css`, somente `ABA_HELP.supervisao` em `screenHelp.js` e espelho `assistantHelpCorpus.ts`, teste novo `aba-supervision-screen.test.mjs`, duas asserções autorizadas no teste da 007 e este handoff. `AGENTS.md` e migrations intocados.
- Autorização adicional: INFO `398ef97` e `2d00fd2` no barramento permitiram acrescentar somente `TABS.SUPERVISAO` às listas fechadas Equipe e `TABS_WITHOUT_PATIENT` no teste `aba-library-screen.test.mjs`. Nenhuma outra asserção desse arquivo mudou.

### Validação

- `node frontend/scripts/sync-assistant-help.mjs`: espelho regenerado.
- Testes focados: 23/23 (tela nova + biblioteca); 10/10 da tela nova repetidos após acrescentar a regressão de foco no erro. Cobrem totais/plural, papéis/estados, SUP-3, 22023 arquivado, data local/futuro, duração, payloads das cinco RPCs, erros, CAS, trava/eventos, navegação, ajuda, privacidade e responsividade.
- Gates finais após o último ajuste de produto: `cd frontend; npm run lint` exit 0; `npm test` exit 0 (1432 testes, 1431 aprovados, 1 pulado, zero falhas; 200370,717 ms); `npm run build` exit 0 (3,17 s). Logs `%TEMP%/acup-013-lint-final.log`, `%TEMP%/acup-013-tests-final.log`, `%TEMP%/acup-013-build-final.log`. Build com avisos sobre import dinâmico também estático de `patientEvolutionService.js` e chunks acima de 500 kB; não impediram a conclusão.
- Lint inicial apontou ref lida durante o render para comparar o rascunho original; trocada por estado, sem suprimir regra. Na conferência visual, erro podia ficar abaixo da parte visível do editor no celular; agora o alerta recebe foco, com regressão específica. A primeira suíte completa foi interrompida para esse ajuste; não é declarada aprovada.
- Chrome real via CDP, harness local com RPCs fictícias: criação/assinatura/anulação/ciência sob duplo clique = uma chamada por ação, releitura após sucesso; assinatura/anulação só após confirmação, motivo mínimo; assinado só leitura; ciência uma vez; rascunho/anulado fora da soma; 40001 conserva digitado inclusive após atualizar lista; Esc pergunta; data futura bloqueada no HTML e na validação sem RPC; pauta restrita sem paciente/textos; os três bloqueios 22023 aparecem junto da ação, preservando motivo; 360/768/1024/1280 sem rolagem lateral na página e no diálogo; nenhuma exceção JS ou texto clínico no console/título. Log `%TEMP%/acup-013-browser.log`.
- Para reproduzir: iniciar `mesa/ferramentas/harness-telas/server.mjs` apontando para o frontend da worktree na porta 5196 e rodar `mesa/ferramentas/harness-telas/verify-supervisao-lk.mjs`. Harness próprio `telas/supervisao-lk.jsx`, dados inteiramente fictícios, sem autenticação ou Supabase. Tentativas iniciais do driver foram corrigidas por espera insuficiente da releitura e redeclaração de variável no contexto CDP; a execução final acima passou.
- `git diff --check` sem erros. Ruby/Rails não configurado: gates Ruby não se aplicam. Sem nova validação SQL nesta task; o contrato foi testado na ACUP-008 e pelo QA.

### Prints no board

Em `C:/Users/m/Downloads/acup-team/mesa/prints/ACUP-013/`, legendas em `legendas.md`. Computador por `mesa/ferramentas/print.mjs`; celular por `harness-telas/print-cdp.mjs --celular --largura 360 --inteira`. Todos com dados fictícios e sem rolagem lateral. Prints de erro refeitos após o ajuste de foco para mostrar o alerta e o texto preservado na área visível.

| Estado | Computador | Celular |
|---|---|---|
| Vazio | `supervisao-vazio.png` | `supervisao-vazio-celular.png` |
| Rascunho | `supervisao-rascunho.png` | `supervisao-rascunho-celular.png` |
| Assinado | `supervisao-assinado.png` | `supervisao-assinado-celular.png` |
| Supervisionado com ciência | `supervisao-ciencia.png` | `supervisao-ciencia-celular.png` |
| Erro 40001 com texto mantido | `supervisao-erro.png` | `supervisao-erro-celular.png` |
| Conteúdo restrito | `supervisao-restrito.png` | `supervisao-restrito-celular.png` |
| Paciente arquivado bloqueando ciência | `supervisao-arquivado.png` | `supervisao-arquivado-celular.png` |

URLs em `/tela/supervisao-lk`: `?empty=1`, padrão rascunho, `?status=assinado`, `?role=member&ack=1`, `?acao=erro`, `?role=member&restricted=1`, `?role=member&archived=1&acao=arquivado`. O driver também testa bloqueio de assinatura/anulação por paciente arquivado.

### Conferência do QA e limites

1. `cd frontend; npm run quality`; conferir parâmetros das RPCs, papéis, ciência sem revisão, soma dos assinados e o limite do dia de São Paulo.
2. Repetir o driver e conferir/refazer prints com `-qa`, especialmente o erro visível no editor de celular, pauta restrita e arquivado.
3. Conferir criação, assinatura confirmada, motivo de anulação, assinado sem edição, ciência própria e 40001 sem perder texto. O harness imita o banco, sem substituir a prova SQL da 008.
4. Não há sinal de arquivado na lista: o bloqueio preventivo é do banco, e a tela explica sua recusa. Sem permissões confiáveis, nenhuma escrita aparece. Profissional histórico que não está mais na fonte de profissionais aparece como “Profissional não listado”; não é inventado nome.
5. Proteção ao trocar de aba/paciente no workspace inteiro segue fora do escopo (ACUP-012). Esta entrega protege os próprios diálogos. Sem nova tela de certificação ou ligação ao financeiro.
