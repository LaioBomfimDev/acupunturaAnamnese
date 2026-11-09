## ACUP-013 — revisão

- Veredito: **APROVADO**
- Commit revisado: `8f545d5` (codex/lk, base integracao `3559206`). Branch de revisão: `qa/ACUP-013`.
- Gate: `npm run quality` verde: entrega do dev 1432 testes (1431 ok, 1 pulado); com meu teste 1433 (1432 ok, 1 pulado, 0 falhas). Lint e build ok.
- SQL: não se aplica (a tela não muda SQL).
- Invariantes AGENTS.md: ok.
- Correções que eu fiz: só teste (três mutações passavam).

### Conferido no navegador
Harness de telas sem login + Chrome por CDP, dados fictícios, em 360, 768, 1024 e 1280 px.
- **Horas:**
  - O resumo e o cartão somam só os assinados: rascunho e anulado dão "0 horas", e o assinado de 90 min dá "1 hora e 30 minutos".
  - Plural conferido de 0 a 600 minutos: "0 horas", "1 minuto", "30 minutos", "1 hora", "1 hora e 1 minuto", "2 horas", "10 horas".
- **Data futura:** o campo tem `max` = hoje em São Paulo. Forçando amanhã sem a validação do navegador, a tela diz "A data da supervisão não pode ser futura." e não chama o banco.
- **Assinar:** pede confirmação ("Depois de assinar, o registro não pode ser editado…"). Clique triplo em "Confirmar assinatura" dá 1 chamada, com a revisão certa. Depois disso o registro fica só leitura: sem "Editar rascunho", só "Anular" para quem assinou.
- **Anular:** pede confirmação e motivo. Com "curto", o botão fica travado; com o motivo válido, 1 chamada. O registro vira "Anulado" e sai da soma.
- **Supervisionado:** vê só os próprios assinados e anulados (o banco garante, ACUP-008). "Marcar ciência" com clique triplo dá 1 chamada, sem `p_revision`; depois o botão some e aparece "Ciência registrada".
- **SUP-3 (pauta restrita):** sem acesso ao paciente, aparece "Pauta restrita…" com data, duração e horas. Não há "Ver registro", nem texto da pauta, nem nome ou id do paciente na página (conferi o HTML inteiro).
- **Paciente arquivado (22023):** a explicação "Paciente arquivado: aguarde a decisão da exclusão. Esta ação está bloqueada até a decisão." aparece dentro da confirmação e no cartão, junto de Assinar/Anular/Marcar ciência, e os botões ficam travados.
- **40001 no editor:** a mensagem pt-BR diz que o texto foi mantido, a pauta digitada continua, "Salvar" fica travado e aparece "Atualizar lista".
- **Escrita:** cada ação gera um evento novo (o editor, a cada salvar; assinar e anular, ao abrir a confirmação; ciência, a cada clique). Clique repetido dá 1 chamada em todas.
- **Console e título:** nada da pauta nem das decisões (só as mensagens do Vite e do React). O título da aba não muda.
- **Erro de leitura:** "Não foi possível carregar as supervisões. Tente de novo." com "Tentar de novo", sem "Novo registro".
- **Layout:** sem rolagem lateral em nenhuma largura (lista, editor, pauta restrita, confirmação de anulação).
- **Permissão:** vem de `loadTeams` (`isAdmin`, `supervisedTeamId`, membro do time supervisionado; assinar = quem registrou ou administração; anular = quem assinou ou administração).
- **`aba-library-screen.test.mjs`:** mudaram só as 2 listas autorizadas (grupo Equipe e `TABS_WITHOUT_PATIENT`).
- **"Como funciona":** tem as 5 seções e foi escrito pelos rótulos reais da tela. O espelho regenerado pelo script dá exatamente o arquivo commitado (só muda o fim de linha).

### O teste morde
Fiz 17 mutações. Na entrega, 14 eram pegas. Passavam: assinar sem confirmação, "Confirmar anulação" sem o mínimo de 10 caracteres, e ação sem trava de clique. Depois do meu bloco de teste, **17/17**.

### Correção que eu fiz
- `aba-supervision-screen.test.mjs`: um bloco do QA no fim. Ele exige que só a ciência dispare direto (assinar e anular passam pela confirmação, com o evento da ação), o botão de anular travado com motivo curto, e a trava `lock` + `busy` em `runAction`.

### Prints conferidos (mesa/prints/ACUP-013)
- Conferi os 14 do dev: vazio, rascunho, assinado, ciência, restrito, erro e arquivado, no computador e no celular. Batem com o que medi.
- Acrescentei `-qa` das confirmações, que o dev não tinha: `supervisao-assinar-qa`, `supervisao-anular-qa` e `supervisao-anular-celular-qa`.
- Detalhe nas legendas do dev: faltam espaços ("celular360", "soma1hora").

### Pendências (não bloqueiam)
1. **40001 no editor:** o texto fica, mas não dá para salvar sobre a versão nova. "Atualizar lista" não traz a revisão nova para o editor aberto, e para gravar é preciso fechar (perdendo o texto, depois de confirmar) e reabrir. Na Biblioteca (ACUP-007) há "Recarregar revisão", que traz a revisão e mantém o texto. Sugiro o mesmo aqui.
2. **Legendas** de `mesa/prints/ACUP-013/legendas.md` sem espaço em "celular360" e "soma1hora" (aparecem no board).
