## ACUP-005 — entrega para review

- Branch/base: `codex/lk`, sincronizada com `integracao` em `f582a94` antes de começar. Commit: `feat(ACUP-005): adiciona tela do perfil ABA`.
- Escopo: aba Perfil no grupo Plano, componente `AbaProfile.jsx`, somente funções novas em `abaService.js`, teste novo `aba-profile-screen.test.mjs`, CSS, `ABA_HELP.perfil` e espelho gerado por `node frontend/scripts/sync-assistant-help.mjs`. Sem SQL.
- Autorização adicional: INFO do Orquestrador, mesa/caixa/lk.md, 08/11/2026 21:06: em `aba-plan-screen.test.mjs`, somente acrescentado `TABS.PERFIL` à lista fechada do grupo Plano. Nenhuma outra asserção mudou.
- Comportamento: NULL continua vazio; apenas `data.permissions.canSupervise` libera Preencher perfil/Editar perfil e o editor. Membro lê os dados sem controles de escrita. Comunicação e suporte têm os rótulos pt-BR do aceite. Diagnóstico, fonte e data vêm exclusivamente da digitação ou do perfil retornado pelo banco; sem sugestões, exemplos de diagnóstico, catálogo, inferência ou autocompletar.
- Escrita: `aba_save_profile` pelo `call()` existente, revisão 0 na criação, CAS na edição e `newId()` em cada ação. Ref bloqueia dois envios antes da atualização do React; busy desabilita os controles. Depois de salvar, fecha o editor e relê `aba_get_profile`, pois a escrita devolve somente metadados. Não grava carimbos inventados nem dados clínicos em armazenamento local/log.
- Erros: 40001 conserva o texto e bloqueia novo envio com a revisão velha, oferecendo descarte e recarga; 42501 vira mensagem pt-BR; validações 22023 do perfil preservam o texto do banco, inclusive `Paciente arquivado não recebe perfil.` e `Data do laudo não pode ser futura.`. Erros técnicos não são exibidos. Cancelamento com alteração pede confirmação na própria tela, sem confirmação nativa ou janela sobreposta.
- Laudo: texto/fonte/data obrigatórios em conjunto, limites 6000/1000; detalhes até 12000. Limpar os três campos remove o laudo (`null`). Data máxima no input e validação ao salvar usam o dia em `America/Sao_Paulo`, inclusive na virada UTC; o servidor continua sendo a autoridade.
- Visual: formulário e texto podem encolher/quebrar; metadados e opções ficam em uma coluna até 1024px. O plano usa cinco colunas no computador para os cinco metadados, incluindo Aprovado em; mantém as duas colunas de celular/tablet existentes.

### Validação

- 28 testes focados passaram: perfil (10), plano (13) e catálogo ABA (5). Cobrem estado vazio/permissões, escape de texto, rótulos, laudo completo, limites, datas impossíveis/futuras, dia de São Paulo, payload/CAS/evento, limpeza explícita, mensagens, registro da aba/ajuda e CSS. As RPCs dos testes são interceptadas; nenhuma chamada a produção.
- Navegador: Edge headless via CDP, harness temporário fora do repositório, Vite local e somente dados fictícios/RPCs simuladas. Confirmado: membro vazio e preenchido sem controle de escrita; diagnóstico inicialmente vazio com autocomplete desligado; dois submits síncronos = uma RPC com revisão 0; ação seguinte usa outro UUID e revisão 1; conflito mantém texto e bloqueia submit; arquivado mostra a frase exata do banco; formulário sem rolagem horizontal em 360/768/1024/1280px.
- Gate final: `npm run lint` sem erros/avisos; `npm test` com 1.392 testes, 1.391 aprovados, 1 ignorado e zero falhas (148,8 s); `npm run build` aprovado, com os avisos preexistentes de chunk grande/import misto. `git diff --check` aprovado.
- Prova da regressão do grid: troca temporária de cinco por quatro colunas fez o teste `layout do perfil` falhar (exit 1); bytes originais do CSS restaurados antes do commit.

### Roteiro para o QA

1. Rodar `cd frontend`, `npm run lint`, `npm test` e `npm run build`; verificar a sincronização da ajuda pela suíte existente.
2. Em ambiente local com as migrations da 004/011, abrir paciente sem perfil como supervisão: Plano → Perfil mostra o vazio e Preencher perfil. Como membro, não aparece esse botão; com perfil gravado, só leitura.
3. Como supervisão, marcar comunicação/suporte e preencher um laudo fictício com texto, fonte e data de hoje em São Paulo. Salvar duas vezes rapidamente: uma RPC. Conferir leitura do carimbo do banco; editar novamente e conferir nova revisão/evento.
4. Conferir laudo parcial, data inválida/futura e limites de caracteres. Diagnóstico não ganha texto automaticamente; fonte e data não se inferem do texto. Limpar texto, fonte e data remove o laudo; limpar detalhes remove os detalhes.
5. Abrir o mesmo perfil em duas sessões, salvar em uma e tentar na outra: mensagem de alteração por outra pessoa, texto conservado e salvar bloqueado. Descartar/recarregar pede confirmação se houve edição. Paciente arquivado retorna a mensagem exata da 011.
6. Conferir Como funciona e layout a 360/768/1024px, inclusive textos longos sem espaços. No plano, verificar os cinco metadados em linha no computador. Os testes de impressão e permissões do plano continuam verdes.

### Limites

A verificação de navegador usou o componente isolado com RPCs simuladas; não valida o backend nem uma sessão autenticada real. As regras SQL foram entregues e validadas na 004/011, não foram alteradas aqui. Esta entrega aguarda review/merge do Orquestrador; nenhuma implantação ou escrita em produção foi realizada.
