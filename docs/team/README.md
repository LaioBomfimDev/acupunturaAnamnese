# Time de agentes — Sistema Acup

Quatro sessões, um único porta-voz: o **Orquestrador**. Ele recebe o objetivo, quebra em tasks, distribui, cobra, integra e é a única voz que fala com o humano.

## Papéis

| Papel | Conta | Sessão | Onde trabalha | Branch |
|---|---|---|---|---|
| Orquestrador | Claude Reability (`.claude`) | Claude Code, Opus, esforço médio | `C:\Users\m\Downloads\acup-team\integracao` | `integracao` |
| Dev Deni | Codex Deni (`.codex`) | Codex CLI | `C:\Users\m\Downloads\acup-team\deni` | `codex/deni` |
| Dev LK | Codex LK (`.codex-conta2`) | Codex CLI | `C:\Users\m\Downloads\acup-team\lk` | `codex/lk` |
| QA Revisor | Claude LK (`.claude-conta2`) | Claude Code | `C:\Users\m\Downloads\acup-team\qa` | `qa/<task>` |

O repositório principal (`C:\Users\m\Downloads\Sistema Acup`, branch `rebrand/vitalis`) fica **intocado** enquanto houver mudanças locais pendentes. A integração acontece na branch `integracao`; o humano decide quando levar para `rebrand/vitalis`.

## Fluxo de uma task

1. O humano dá o objetivo ao Orquestrador.
2. Orquestrador escreve a task em `mesa/TASKS.md` (ID, objetivo, arquivos de propriedade, critério de aceite) e manda `TASK · ACUP-000 · …` pelo `mesa/aviso.mjs`.
3. O dev implementa na branch dele, roda o mínimo (`cd frontend && npm run lint && npm test`), commita e escreve `docs/team/handoff/<task>.md`.
4. O dev avisa o Orquestrador.
5. Orquestrador manda a task para o QA.
6. QA revisa a branch do dev, roda `cd frontend && npm run quality`, revisa migrations `.sql` quando houver, corrige na branch `qa/<task>`, commita e escreve `docs/team/reviews/<task>.md` com `APROVADO` ou `REPROVADO`.
7. QA avisa o Orquestrador.
8. Orquestrador mergeia `qa/<task>` em `integracao`, roda o quality final, atualiza `mesa/TASKS.md` e o retrato `docs/team/TASKS.md`.
9. Orquestrador reporta ao humano: o que entrou, o que ficou pendente, o que precisa de decisão.

## Regras duras

- **Um dono por arquivo por rodada.** A task declara os arquivos; ninguém edita fora dela sem pedir ao Orquestrador.
- **Quem escreve não revisa.** Dev não aprova a própria branch; QA não mergeia.
- **Só o Orquestrador fala com o humano.** Dev e QA falam com o Orquestrador.
- **Só o Orquestrador escreve `mesa/TASKS.md`, `mesa/DECISOES.md` e `mesa/pausas.md`.** Cada papel mantém só o próprio `mesa/estado/<papel>.md`. Cada um escreve apenas o próprio handoff/review.
- **Nada de merge em `rebrand/vitalis`.** O time inteiro vive em branches; a passagem final é do humano.
- **Área congelada:** `frontend/src/components/financeiro/`, `frontend/src/services/financeiroService.js`, `frontend/src/utils/finance*.js`, `frontend/tests/regression/finance*`, `supabase/migrations/20261106_financeiro_compras_recibos.sql` têm mudanças locais não commitadas. Não tocar até o humano integrar.
- **Área sensível** (schema, RLS, auth, dados clínicos): o Orquestrador para e pergunta ao humano antes de distribuir.
- **Definição de pronto:** review `APROVADO` + merge em `integracao` + `npm run quality` verde + task fechada no `TASKS.md`.

## Mesa e barramento (desde a ACUP-003)

Pasta comum, fora do git: `C:/Users/m/Downloads/acup-team/mesa` (leia `mesa/LEIA-ME.md`). Quadro vivo `mesa/TASKS.md`; `docs/team/TASKS.md` é retrato atualizado a cada PRONTO.

Ritual: ao abrir, `node C:/Users/m/Downloads/acup-team/mesa/aviso.mjs caixa <papel>` e ler `mesa/estado/<papel>.md`; ao terminar um passo, atualizar o estado e só então avisar, no formato `TIPO · ACUP-000 · commit · arquivo · resumo` (TASK, ENTREGA, REVIEW, BLOQUEIO, PERGUNTA, INFO). A mensagem fica na caixa mesmo com a sessão fechada; papel em `mesa/pausas.md` não recebe.

```bash
node C:/Users/m/Downloads/acup-team/mesa/aviso.mjs lista
node C:/Users/m/Downloads/acup-team/mesa/aviso.mjs orquestrador "ENTREGA · ACUP-003 · 1a2b3c4 · docs/team/handoff/ACUP-003.md · lint e testes verdes"
node C:/Users/m/Downloads/acup-team/mesa/aviso.mjs caixa lk
```

### Board ao vivo do humano

O humano acompanha só pelo board (http://127.0.0.1:4790, lê a mesa); não lê terminal, `.js` nem handoff. O que não está na mesa ele não vê. Regras completas na seção "Board ao vivo do humano" de `mesa/LEIA-ME.md`:
- todos atualizam `mesa/estado/<papel>.md` a cada passo (alerta depois de 2 h parado);
- dev: em task com tela, prints com `mesa/ferramentas/print.mjs ACUP-000 nome URL "legenda" [--celular]` (harness em `mesa/ferramentas/harness-telas/`), citados na ENTREGA;
- QA: confere ou refaz os prints com sufixo `-qa` e diz no REVIEW quais conferiu;
- Orquestrador: ao marcar PRONTO, `mesa/resumos/ACUP-000.md` (o que muda para quem usa, português simples, sem nome `.js`, só o `.sql` a lançar) e `mesa/para-voce.md` (SQL em ordem, um `nome.sql` entre crases por item, e decisões pendentes, tirando o que foi resolvido). Relatório ao humano aponta para o board.

### Cota e ajudantes LLM

- `mesa/PLANO-COTA.md`: o vigia do board avisa em 85% da janela de 5 h (cada papel salva o ponto de retomada: commit WIP do dev e a linha `- Retomada:` no estado), avisa o Orquestrador em 100% (esperar, repassar ou ajudante, registrado no quadro) e retoma sozinho na renovação. Com o board no ar, ninguém reabre janela na mão.
- `mesa/ferramentas/LLMS.md`: ajudantes por API (Gemini e outros), chamados só pelo Orquestrador e pelo QA, para rascunho, segunda opinião, casos de teste e leitura de log. Só devolvem texto; um Claude confere e aplica. Nunca dado de paciente, segredo ou produção, e nunca merge ou aprovação com base neles.

## Barramento antigo (até a ACUP-002, não usar)

O Habblaud entrega mensagens às sessões abertas em `http://127.0.0.1:4747`.

```bash
node docs/team/aviso.mjs lista                    # sessões abertas e papéis
node docs/team/aviso.mjs orquestrador "texto"     # manda para o Orquestrador
node docs/team/aviso.mjs deni "texto"             # dev Codex Deni
node docs/team/aviso.mjs lk "texto"               # dev Codex LK
node docs/team/aviso.mjs qa "texto"               # QA Claude LK
node docs/team/aviso.mjs todos "texto"            # os quatro (uso humano)
```

Mensagem entregue vale para a sessão aberta naquele momento; se a sessão estiver fechada, a entrega falha. O arquivo (`handoff`/`review`/`TASKS.md`) é a fonte da verdade; a mensagem é só o alarme.

## Gate de qualidade

```bash
cd frontend
npm run quality   # security + lint + regressão + build + bundle
```

Uma task só é `PRONTO` com esse comando verde na branch integrada.
