# TASKS — Sistema Acup (retrato)

> **Retrato.** O quadro vivo é `C:/Users/m/Downloads/acup-team/mesa/TASKS.md`. Este arquivo é atualizado pelo Orquestrador a cada PRONTO, para o histórico ficar no git.

Quadro vivo: `C:/Users/m/Downloads/acup-team/mesa/TASKS.md` (TIME-2). Só o Orquestrador edita. Estados: `TODO` · `FAZENDO` · `REVIEW` · `PRONTO` · `BLOQUEADO`.

> Pausas: `mesa/pausas.md` (Deni pausado por cota). Decisões: `mesa/DECISOES.md`. Mensagens: `node C:/Users/m/Downloads/acup-team/mesa/aviso.mjs <papel> "TIPO · ACUP-000 · commit · arquivo · resumo"`.

Contexto da rodada ABA: `docs/team/propostas/aba-auditoria-2026-11-08.md` (auditoria, modelo de dados, bloco do AGENTS.md, decisões D0–D5).

| ID | Task | Dono | Branch | Estado | Aceite |
|---|---|---|---|---|---|
| ACUP-001 | Regras ABA vigentes no AGENTS.md + teste das invariantes | Codex LK | integracao (2e0f524) | PRONTO | ver abaixo |
| ACUP-002 | Histórico de revisões de programa + plano versionado (SQL) | Codex LK | integracao (3700917) | PRONTO | ver abaixo |
| ACUP-003 | Tela do plano terapêutico | Codex LK | integracao (f30952f) | PRONTO | ver abaixo |
| ACUP-010 | Ajustes do plano (pendências dos reviews da 002 e da 003) | Codex LK | integracao (a5b47d3) | PRONTO |
| ACUP-004 | Perfil ABA do paciente (SQL + RPC) | Codex LK | integracao (1b3144a) | PRONTO | ver abaixo |
| ACUP-011 | Ajustes do perfil no banco (pendências do review da 004) | Codex LK | integracao (d614058) | PRONTO |
| ACUP-005 | Tela do perfil ABA | Codex LK | integracao (0729ff3) | PRONTO (prints do QA pendentes) | ver abaixo |
| ACUP-006 | Biblioteca da clínica (SQL + RPC) | Codex LK | integracao (c452e87) | PRONTO | ver abaixo |
| ACUP-007 | Tela da biblioteca + AbaPrograms lendo catálogo mesclado | Codex LK | codex/lk | FAZENDO | ver abaixo |
| ACUP-008 | Registro formal de supervisão (SQL + RPC + tela) | Codex LK | codex/lk | TODO (após 007) | ver abaixo |
| ACUP-012 | Aviso de texto não salvo na área ABA + estilo do seletor de suporte | Codex LK | — | TODO (após 008) | ver abaixo |
| ACUP-009 | Avaliações formais do paciente | — | — | BLOQUEADO (adiada por D4: falta a lista de instrumentos e licenças da clínica) | ver abaixo |

Ordem: uma task por vez, 001 → 002 → 003 → 010 → 004 → 011 → 005 → 006 → 007 → 008; cada uma só começa depois do merge da anterior em `integracao` (antes de começar, o dev faz `git merge integracao` em `codex/lk` — autorizado). As migrations com `patient_id` (002, 004, 008) recriam `admin_decide_patient_deletion` em série, sempre a partir da versão de maior nome de arquivo (hoje `20261108b_aba_perfil_paciente.sql` (a 011 não recriou a exclusão)). Nomes: 002 `20261108_aba_plano_versionado.sql`, 010 `20261108a_aba_plano_ajustes.sql`, 011 `20261108ba_aba_perfil_ajustes.sql`, 004 `20261108b_aba_perfil_paciente.sql`, 006 `20261108c_aba_biblioteca_clinica.sql`, 008 `20261108d_aba_supervisao_formal.sql`.

Toda task com tela: prints do dev na ENTREGA e conferência do QA no REVIEW (rotina do board, `mesa/LEIA-ME.md`). Ao marcar PRONTO, o Orquestrador escreve `mesa/resumos/ACUP-000.md` e atualiza `mesa/para-voce.md`.

Regras de toda task com SQL (além do aceite próprio):
- RLS ligada + `REVOKE ALL FROM PUBLIC, anon, authenticated`, nenhuma policy; toda RPC `SECURITY DEFINER SET search_path = pg_catalog`, começando por `aba_require_gate`/`aba_require_patient`; `GRANT EXECUTE` só para `authenticated`.
- Idempotente: `CREATE TABLE/INDEX IF NOT EXISTS`, `CREATE OR REPLACE`, bloco `DO $requires$`; sem `DROP` de tabela/coluna; cabeçalho com REQUER e como reverter.
- Texto livre em `*_encrypted` via `aba_encrypt`; CHECK por status com `IS NOT NULL` explícito (AGENTS §9); `ON CONFLICT ON CONSTRAINT <nome>`.
- Validação real (AGENTS §9): o QA roda migration + chamadas das RPCs numa transação única terminada em `ROLLBACK` e cola a saída no review. **Aplicar em produção não faz parte da rodada** (fica com o humano).
- `aba-invariants.test.mjs` (ACUP-001) continua verde; a regra nova entra no bullet ABA do AGENTS.md (parte "proposta" da seção C, ajustada às Decisões).

## ACUP-001 — Regras ABA vigentes no AGENTS.md + teste das invariantes
- Objetivo: fechar o item 5 da auditoria. Outra sessão precisa achar no manual as regras que o ABA já segue, e um teste precisa quebrar se alguém as violar.
- Arquivos de propriedade: `AGENTS.md` (só acrescentar um bullet novo no fim do §7, antes de "Use nomes claros"); `frontend/tests/regression/aba-invariants.test.mjs` (novo).
- Texto do bullet: o bloco "Parte vigente" da seção C de `docs/team/propostas/aba-auditoria-2026-11-08.md`, sem acrescentar regra nova (a parte "proposta" NÃO entra).
- Fora de escopo: qualquer `.sql`, componente, service, `abaLibrary.js`, `docs/agents-mapas.md`; nenhuma regra além das que o código já cumpre.
- Critério de aceite (verificável):
  1. `AGENTS.md` tem o bullet ABA; nenhuma outra linha do arquivo muda (`git diff` só com linhas acrescentadas).
  2. O teste lê as migrations `supabase/migrations/*aba*.sql` e falha se: (a) alguma `CREATE TABLE ... public.aba_*` não aparecer num bloco com `ENABLE ROW LEVEL SECURITY` e `REVOKE ALL`; (b) existir `CREATE POLICY` em tabela `aba_*`; (c) alguma `CREATE OR REPLACE FUNCTION public.aba_*` não tiver `SET search_path = pg_catalog`; ou não tiver `SECURITY DEFINER` sem estar na lista explícita de auxiliares puros (`aba_clean_text`, `aba_is_restricted_procedure`, `aba_num`, `aba_prompt_rank`, `aba_ioa_agreement`, `aba_fidelity_keys`); ou um auxiliar da lista citar tabela (`public.aba_`/`public.patients`/`FROM public.`) no corpo; ou um nome da lista não existir mais (lista não apodrece); (d) alguma tabela `aba_*` com coluna `patient_id` faltar na versão mais recente (maior nome de arquivo) de `admin_decide_patient_deletion` em `supabase/migrations/`; (e) `frontend/src` tiver `service_role` fora de `lib/supabaseConfig.js` (lá é a recusa de chave privilegiada, permitido) ou qualquer literal de chave privilegiada (`sb_secret_` seguido de caracteres de chave, ou JWT com `"role":"service_role"`). Ajuste aprovado em 08/11/2026 após o dev achar os 6 auxiliares sem DEFINER (conferido pelo Orquestrador).
  3. Regex com `\r?\n` (AGENTS §4); o teste encontra a versão mais recente da função de exclusão procurando em todas as migrations, sem nome de arquivo fixo.
  4. Prova de que o teste morde: no handoff, descreva uma alteração local temporária (ex.: tirar o `search_path` de uma `aba_*`) que fez o teste falhar, desfeita antes do commit.
- Comandos que precisam passar: `cd frontend && npm run lint && npm test`.
- Depende de: nada.

## ACUP-002 — Histórico de revisões de programa + plano versionado (SQL)
- Objetivo: item 1. Tabelas `aba_program_revisions` e `aba_plan_versions` (seção B1 da proposta), RPCs `aba_save_plan_draft`, `aba_submit_plan`, `aba_approve_plan`, `aba_void_plan`, `aba_list_plan_versions`; `aba_save_program` e `aba_update_program_status` recriadas a partir da versão viva gravando a revisão.
- Arquivos de propriedade: `supabase/migrations/20261108_aba_plano_versionado.sql` (novo); `frontend/tests/regression/aba-plan-versions.test.mjs` (novo); `frontend/tests/regression/aba-invariants.test.mjs` (só acrescentar as duas checagens); `AGENTS.md` (só o bullet ABA).
- Fora de escopo: telas; outras tabelas.
- Critério de aceite: RLS ligada + `REVOKE ALL`, sem policy; toda RPC `SECURITY DEFINER SET search_path = pg_catalog` com `aba_require_patient`; aprovar exige `aba_can_supervise_patient` e é carimbado com `auth.uid()`; um único `aprovado` por paciente (índice parcial); aprovado imutável; CHECK por status com `IS NOT NULL` explícito; texto livre cifrado; `admin_decide_patient_deletion` recriada a partir da última versão com as duas tabelas no snapshot e no DELETE (filho antes do pai); migration roda duas vezes sem erro; o handoff traz o roteiro SQL de validação (chamadas das RPCs como supervisor, como membro do time, como profissional de outra clínica e como `anon`, cada uma com o resultado esperado), que o QA roda no `acup-qa-pg` em transação com ROLLBACK (AGENTS §9); `aba-invariants.test.mjs` passa a pegar também `DISABLE ROW LEVEL SECURITY` e `GRANT` de tabela `aba_*` para `anon`/`authenticated`/`PUBLIC` (pendência do review da ACUP-001); bullet ABA do AGENTS.md ganha a regra do plano (parte "proposta", ajustada à D1).
- Comandos: `cd frontend && npm run lint && npm test`.
- Decisões (D1): rascunho e envio por quem acessa (`aba_can_access_patient`); aprovar e anular só `aba_can_supervise_patient` (inclui administração). Aprovar marca a anterior `substituido` na mesma transação; versão nova nasce rascunho copiando a aprovada.
- Depende de: ACUP-001.

## ACUP-003 — Tela do plano terapêutico
- Objetivo: ver versões, montar rascunho a partir dos programas, enviar para revisão, aprovar (supervisão), anular com motivo; imprimir o aprovado no papel timbrado.
- Contrato do banco: seção "API para ACUP-003" de `docs/team/handoff/ACUP-002.md` (`aba_save_plan_draft`, `aba_submit_plan`, `aba_approve_plan`, `aba_void_plan`, `aba_list_plan_versions`). Não muda SQL.
- Arquivos de propriedade: `frontend/src/components/aba/AbaPlan.jsx` (novo); `frontend/src/services/abaService.js` (só funções novas, pelo mesmo `call()` do arquivo); `frontend/src/components/AbaWorkspace.jsx` (só registrar a aba "Plano terapêutico" no grupo "Plano", em `TABS`, no mapa de ids e na navegação, sem mexer nas outras); `frontend/src/styles/aba.css` (só acréscimos); `frontend/tests/regression/aba-plan-screen.test.mjs` (novo); `AGENTS.md` (só o bullet ABA, se a tela criar regra).
- Fora de escopo: qualquer `.sql` ou Edge Function; outras abas do ABA; `data/abaLibrary.js`; financeiro.
- Critério de aceite (verificável):
  1. Lista de versões (mais nova em cima) com estado, número, autoria (`authored_by`), data de envio (`submitted_at`), quem aprovou e quando; o aprovado vigente em destaque; anulado mostra o motivo. Ações por estado: rascunho = editar, enviar, anular; em revisão = aprovar, anular; aprovado = imprimir e anular (o banco permite, para corrigir aprovação errada: a confirmação avisa que o paciente fica sem plano vigente); substituído e anulado = só leitura/impressão. "Nova versão" é ação geral da tela. Não mostrar "enviado por": o banco não guarda (vem na ACUP-010). (Ajuste de 08/11/2026, pergunta do dev.)
  2. Rascunho: escolher programas do paciente (fixa `{program_id, revision}` atual de cada um), resumo, data de revisão; salvar com `client_event_id` novo por ação e `revision` (CAS); enviar exige programa e resumo (a tela avisa antes de chamar).
  3. Aprovar e Anular só aparecem para quem supervisiona (mesma fonte de permissão que a tela de Programas já usa); anular pede motivo; confirmação antes de aprovar dizendo que a versão anterior vira substituída. A IA não aprova, sugere nem gera plano.
  4. Erros do banco viram mensagem pt-BR: 40001 "foi alterado por outra pessoa, recarregue", 42501 sem permissão, 23505/22023 pela mensagem do banco ou texto próprio; nunca código cru nem inglês.
  5. Imprimir o aprovado no papel timbrado com `PrintLetterhead` + `paginateReportBody` (como `AbaReport.jsx`), preto/cinza/branco, sem cor do app; mostra os programas pela cópia congelada (`program_snapshots`), nunca pelo programa atual.
  6. Celular e tablet (≤1024px): nada mais largo que 360px, lista vira cartão, botões com `HubBackButton` quando aninhado; pt-BR com plural certo ("1 programa", "2 programas").
  7. Teste de regressão cobre 1–6 por leitura de fonte (regex com `\r?\n`) e pelas funções puras que a tela usar.
- Comandos que precisam passar: `cd frontend && npm run lint && npm test && npm run build` (build com `.env.local` público copiado).
- Depende de: ACUP-002 (PRONTO).

## ACUP-010 — Ajustes do plano no banco (pendências do review da ACUP-002)
- Objetivo: três achados não bloqueantes do QA: (1) `FOR UPDATE` em `patients` nas RPCs de plano trava inserts com FK; trocar por `FOR NO KEY UPDATE`; (2) violação 23505 do evento reaproveitado sobe em inglês: devolver mensagem pt-BR com o mesmo código; (3) replay do último evento é no-op silencioso: manter o no-op (é a idempotência), mas devolver o mesmo retorno da primeira chamada e documentar no cabeçalho.
- (5) Pendências do review da 003: a aba ganha o "Como funciona" (`ABA_HELP.plano` em `data/screenHelp.js`, seções fixas, escrito pelos rótulos reais da tela; depois rodar `scripts/sync-assistant-help.mjs` para o espelho `_shared/assistantHelpCorpus.ts`); erro 22023 com mensagem pt-BR do banco aparece com o texto do banco, não genérico.
- (4) Gravar quem enviou: coluna `submitted_by` (carimbada com `auth.uid()` em `aba_submit_plan`, CHECK com `IS NOT NULL` nos estados enviados, linhas antigas preenchidas com `authored_by` antes do CHECK) e devolvida em `aba_list_plan_versions`; a tela mostra "Enviado por".
- Arquivos de propriedade: `supabase/migrations/20261108a_aba_plano_ajustes.sql` (novo, recria só as RPCs afetadas a partir de `20261108_aba_plano_versionado.sql`); `frontend/tests/regression/aba-plan-versions.test.mjs` (acréscimos); `frontend/src/components/aba/AbaPlan.jsx` (só a linha "Enviado por", o botão "Como funciona" e o 22023); `frontend/src/data/screenHelp.js` (só `ABA_HELP.plano`); `supabase/functions/_shared/assistantHelpCorpus.ts` (só regenerado pelo script); `frontend/src/services/abaService.js` (só o tratamento do 22023, se for lá). `frontend/tests/regression/aba-plan-screen.test.mjs` (autorizado em 08/11/2026: trocar a proibição de "Enviado por" pela exigência dele ligado a `submitted_by`, e acrescentar casos de remetente, 22023 e "Como funciona"; nenhuma outra expectativa muda).
- Critério de aceite: regras comuns de SQL; diff textual de cada RPC recriada = versão da 002 + só a mudança pedida; sem tocar a exclusão de paciente; roteiro SQL no handoff para o QA rodar no `acup-qa-pg`, incluindo duas sessões concorrentes (aprovar × inserir filho do paciente).
- Depende de: ACUP-003.

## ACUP-004 — Perfil ABA do paciente (SQL + RPC)
- Objetivo: item 2, tabela `aba_patient_profiles` (B2 da proposta) + `aba_get_profile(p_patient_id)` e `aba_save_profile(p_patient_id, p_profile JSONB)` com CAS (`revision`) e `client_event_id` (replay devolve o mesmo retorno, como na 010).
- Arquivos de propriedade: `supabase/migrations/20261108b_aba_perfil_paciente.sql` (novo); `frontend/tests/regression/aba-patient-profile.test.mjs` (novo); `AGENTS.md` (só o bullet ABA: regra do perfil).
- Fora de escopo: tela (ACUP-005); outras RPCs ABA.
- Critério de aceite (verificável): regras comuns de SQL; `communication_mode` = array de códigos com CHECK de lista fechada (`vocal`, `pecs`, `caa_alta`, `caa_baixa`, `sinais`, `gestos`, `misto`) sem repetição; `support_level` CHECK (`1`,`2`,`3`,`nao_informado`); diagnóstico e detalhes SÓ em `*_encrypted` (nenhuma coluna de CID/diagnóstico em claro, nada em log/NOTICE); lê quem `aba_can_access_patient`, grava só `aba_can_supervise_patient` (D2), `updated_by` = `auth.uid()`; `clinic_id` sempre do banco; `admin_decide_patient_deletion` recriada a partir da versão de maior nome (hoje `20261108_aba_plano_versionado.sql`) com `aba_patient_profiles` no snapshot e no DELETE; diff textual da exclusão = anterior + só essas linhas; roteiro SQL no handoff (supervisor grava, membro lê e é barrado ao gravar, outra clínica/anon barrados, CAS velho 40001, replay, exclusão de paciente com perfil, migration 2x com COMMIT).
- Comandos: `cd frontend && npm run lint && npm test && npm run build`.
- Decisões (D2): lê quem acessa, grava quem supervisiona; `diagnosis_encrypted` só de laudo (fonte e data dentro do texto cifrado); nenhum diagnóstico sugerido.
- Depende de: ACUP-010 (a exclusão parte da versão da 002).

## ACUP-011 — Ajustes do perfil no banco (pendências do review da ACUP-004)
- Objetivo: (1) `aba_save_profile` recusa paciente arquivado, pela mesma regra que `aba_save_plan_draft`/`aba_save_program` já usam, com a mensagem no mesmo padrão trocando o objeto: "Paciente arquivado não recebe perfil." (correção do Orquestrador em 08/11/2026: o aceite original mandava copiar a mensagem do plano, que diz "plano" e confunde quem salva o perfil); (2) data do laudo (`issued_on`) no futuro é recusada com 22023 pt-BR, comparando com o dia de hoje no fuso `America/Sao_Paulo`.
- Arquivos de propriedade: `supabase/migrations/20261108ba_aba_perfil_ajustes.sql` (novo, recria só `aba_save_profile` a partir da `20261108b`); `frontend/tests/regression/aba-patient-profile.test.mjs` (acréscimos).
- Fora de escopo: exclusão de paciente (não recriar); tela.
- Critério de aceite: regras comuns de SQL; diff textual da RPC = versão da 004 + só os dois testes; roteiro SQL no handoff (arquivado recusa; arquivado lê, se a 004 deixa ler; laudo hoje passa, amanhã recusa; replay e CAS intactos; migration 2x com COMMIT).
- Comandos: `cd frontend && npm run lint && npm test && npm run build`.
- Depende de: ACUP-004 (PRONTO).

## ACUP-005 — Tela do perfil ABA
- Objetivo: aba "Perfil" no grupo "Plano" do `AbaWorkspace`: ver e (quem supervisiona) editar comunicação, nível de suporte, diagnóstico de laudo (texto, fonte, data) e detalhes.
- Contrato do banco: seção "API para ACUP-005" de `docs/team/handoff/ACUP-004.md` + regras da 011 (arquivado: "Paciente arquivado não recebe perfil."; laudo no futuro recusado). Não muda SQL.
- Arquivos de propriedade: `frontend/src/components/aba/AbaProfile.jsx` (novo); `frontend/src/services/abaService.js` (só funções novas, pelo `call()`); `frontend/src/components/AbaWorkspace.jsx` (só registrar a aba); `frontend/tests/regression/aba-profile-screen.test.mjs` (novo). `frontend/tests/regression/aba-plan-screen.test.mjs` (autorizado em 08/11/2026: só acrescentar `TABS.PERFIL` à lista esperada do grupo Plano; nenhuma outra asserção muda).
- Detalhes do aceite: sem perfil (`NULL`) mostra estado vazio e, para quem supervisiona, "Preencher perfil" (revision 0); membro do time vê só leitura, sem botão de salvar; `client_event_id` novo por ação, clique repetido = 1 chamada; 40001 "alterado por outra pessoa, recarregue"; data do laudo não aceita futuro na tela (mesmo dia de São Paulo), e o erro do banco aparece com o texto dele; rótulos pt-BR para cada código (Fala vocal, PECS, CAA de alta/baixa tecnologia, Sinais, Gestos, Misto; Nível 1/2/3, Não informado); nenhum texto, sugestão ou autocompletar de diagnóstico (só o que a pessoa digita do laudo); ≤1024px sem rolagem lateral. Prints (rotina do board): o dev tira com `mesa/ferramentas/print.mjs ACUP-005 …` computador + `--celular` dos estados principais (vazio, preenchido, erro, só leitura) e cita na ENTREGA; o QA confere/refaz com sufixo `-qa` e diz no REVIEW quais conferiu.
- Critério de aceite: nenhum texto sugere diagnóstico; campos de laudo com fonte e data; pt-BR; "Como funciona" da aba (screenHelp + sync); erros do banco em pt-BR como na 003/010. Também corrigir a pendência do review da 010: "Aprovado em" quebra linha no computador (grid de 4 colunas em `aba.css`).
- Arquivos extras autorizados: `frontend/src/styles/aba.css` (acréscimos e o ajuste do grid do plano), `frontend/src/data/screenHelp.js` (só `ABA_HELP.perfil`), espelho regenerado.
- Depende de: ACUP-004.

## ACUP-006 — Biblioteca da clínica (SQL + RPC)
- Objetivo: item 3, `aba_library_items` (B3 da proposta) + `aba_list_library()` e `aba_save_library_item(p_item JSONB)` com CAS (`revision`) e `client_event_id` (replay como na 010).
- Arquivos de propriedade: `supabase/migrations/20261108c_aba_biblioteca_clinica.sql` (novo); `frontend/tests/regression/aba-library-items.test.mjs` (novo); `AGENTS.md` (só o bullet ABA: regra da biblioteca).
- Fora de escopo: tela e `data/abaLibrary.js` (ACUP-007); exclusão de paciente (a tabela não tem `patient_id`, não recriar).
- Critério de aceite (verificável): regras comuns de SQL (RPC começa por `aba_require_gate`, não há paciente); sem `patient_id` nem dado de paciente; `clinic_id` sempre `user_clinic_id(auth.uid())`, nunca do payload; `kind` CHECK (`objetivo`, `tecnica`); `status` CHECK (`ativo`, `oculto`, `arquivado`); `system_key` texto com formato fechado (`^[a-z0-9][a-z0-9_-]{0,119}$`), único por clínica+kind quando preenchido; item com `system_key` só pode ficar `oculto` ou `ativo` (ajuste), nunca `arquivado` nem apagado; nenhum `DELETE`; `content` JSONB objeto com só as chaves dos itens de `abaLibrary.js` (`category`, `level`, `title`, `objective`, `target`, `skill`, `suggestedFormat`, `suggestedPrompt`, `suggestedProcedure` para objetivo; as da lista de técnicas para técnica — leia o arquivo), tamanho limitado; obrigatório `content.title` em objetivo e `content.name` em técnica (as técnicas usam `name`, não `title`; confirmado em 08/11/2026), e as chaves permitidas são exatamente as que cada lista de `abaLibrary.js` usa, sem chave inventada; lê quem é profissional ABA da clínica (`aba_is_aba_professional`) ou administração; grava a administração ou quem é `supervisor_id` de time ativo da clínica (D3); `created_by`/`updated_by` = `auth.uid()`; roteiro SQL no handoff (admin cria, supervisor ajusta/oculta item do sistema, terapeuta comum lê e é barrado ao gravar, outra clínica não vê nem grava, anon barrado, CAS 40001, replay, tentar arquivar item do sistema recusa, migration 2x com COMMIT).
- Comandos: `cd frontend && npm run lint && npm test && npm run build`.
- Decisões (D3): edita a administração e quem é `supervisor_id` de time ativo na clínica; lê profissional ABA da clínica.
- Depende de: ACUP-005 (PRONTO).

## ACUP-007 — Tela da biblioteca + AbaPrograms lendo o catálogo mesclado
- Objetivo: aba "Biblioteca" no grupo "Equipe" do `AbaWorkspace` (sem paciente, entra em `TABS_WITHOUT_PATIENT`): ver o catálogo mesclado (sistema + itens da clínica), e quem pode gravar ajusta/oculta/reativa modelo do sistema e cria/edita/arquiva item próprio. Os modelos que a tela de Programas oferece passam a vir do catálogo mesclado.
- Contrato do banco: seção "API para ACUP-007" de `docs/team/handoff/ACUP-006.md`. Não muda SQL.
- Arquivos de propriedade: `frontend/src/components/aba/AbaLibrary.jsx` (novo); `frontend/src/utils/abaLibraryMerge.js` (novo, funções puras); `frontend/src/components/aba/AbaPrograms.jsx` (só trocar a fonte de `ABA_OBJECTIVES`/`ABA_TECHNIQUES` pelo catálogo mesclado); `frontend/src/services/abaService.js` (só funções novas, pelo `call()`); `frontend/src/components/AbaWorkspace.jsx` (só registrar a aba); `frontend/src/data/abaLibrary.js` (SÓ acrescentar `key` a cada objetivo, ver item 2; nenhum outro campo muda); `frontend/src/styles/aba.css` (acréscimos); `frontend/src/data/screenHelp.js` (só `ABA_HELP.biblioteca`) + espelho regenerado pelo `scripts/sync-assistant-help.mjs`; `frontend/tests/regression/aba-library-screen.test.mjs` (novo); `frontend/tests/regression/aba-plan-screen.test.mjs` (só se a lista fechada de grupos exigir a aba nova no grupo Equipe; nenhuma outra asserção muda); `AGENTS.md` (só o bullet ABA).
- Fora de escopo: qualquer `.sql`; outras abas; aviso de texto não salvo (ACUP-012).
- Critério de aceite (verificável):
  1. Mesclagem (`abaLibraryMerge.js`): item da clínica com `system_key` substitui o conteúdo do modelo do sistema de mesma `kind` + chave; `oculto` some da tela de Programas (na Biblioteca aparece marcado "Oculto" para quem grava, com "Reativar"); `arquivado` (só item próprio) some das duas; item próprio ativo entra no catálogo. **`restricted` de técnica do sistema vem sempre do sistema**: ajuste da clínica com `restricted:false` numa técnica restrita do sistema não a desmarca (achado do QA na 006). Teste com caso explícito.
  2. Chave estável: técnica usa o `code` que já existe; objetivo ganha `key` explícito em `abaLibrary.js` (formato `^[a-z0-9][a-z0-9_-]{0,119}$`, único), nunca índice/ordem do array nem título calculado na hora. A `key` vai em `system_key`, nunca dentro de `content` (o banco recusa chave fora da lista). O teste guarda a lista fechada de todas as chaves de objetivo e técnica e falha se uma sumir, mudar, repetir ou sair do formato (renomear exige mudar o teste de propósito).
  3. Sem rede/erro ao ler (`aba_list_library` falha): a tela de Programas segue com o catálogo do sistema e avisa ("Biblioteca da clínica indisponível; mostrando os modelos do sistema"), nunca tela vazia nem erro calado; a Biblioteca mostra o erro e "Tentar de novo".
  4. Quem grava: administração ou supervisor de time ativo da clínica (D3). A tela esconde editar/ocultar/criar de quem não pode, pela fonte de times que a área ABA já carrega (se não houver fonte confiável no cliente, PERGUNTA antes de inventar); o banco continua a autoridade e o 42501 vira mensagem pt-BR. Quem só lê vê a lista sem botões.
  5. Gravar: `id` UUID gerado uma vez por item novo, `revision` (CAS), `client_event_id` novo por ação, clique repetido = 1 chamada; depois de salvar, relê a lista. Erros pt-BR: 40001 "alterado por outra pessoa, recarregue" sem perder o digitado; 22023/23505 com o texto do banco; nunca código cru. Arquivar e ocultar pedem confirmação; item do sistema não oferece arquivar.
  6. Aviso "ponto de partida, não decisão clínica" mantido na tela de Programas e presente na Biblioteca; técnica restrita mostra "Restrito" e o modelo nunca dispensa a revisão nominal do programa.
  7. "Como funciona" da aba (seções fixas, pelos rótulos reais) + espelho regenerado. pt-BR com plural certo ("1 modelo", "2 modelos"). ≤1024px: nada mais largo que 360px, lista vira cartão, sem rolagem lateral.
  8. Prints (rotina do board): o dev tira com `mesa/ferramentas/print.mjs ACUP-007 …` no computador e, no celular, com `mesa/ferramentas/harness-telas/print-cdp.mjs` (o `--celular` do print.mjs sai cortado), dos estados: lista mesclada, item oculto, edição, erro de leitura (Programas com aviso), só leitura; cita na ENTREGA. O QA confere/refaz com sufixo `-qa` e diz no REVIEW quais conferiu.
  9. Teste de regressão cobre 1–7 pelas funções puras e por leitura de fonte (regex com `\r?\n`).
- Comandos que precisam passar: `cd frontend && npm run lint && npm test && npm run build`.
- Depende de: ACUP-006 (PRONTO).

## ACUP-008 — Registro formal de supervisão
- Objetivo: item 4a, `aba_supervision_records` (B4) com RPCs e tela. Prints (rotina do board): o dev tira com `mesa/ferramentas/print.mjs ACUP-008 …` no computador e, no celular, com `mesa/ferramentas/harness-telas/print-cdp.mjs` (o `--celular` do print.mjs sai cortado) dos estados principais (vazio, preenchido, erro, só leitura) e cita na ENTREGA; o QA confere/refaz com sufixo `-qa` e diz no REVIEW quais conferiu.
- Arquivos de propriedade: migration `20261108d_aba_supervisao_formal.sql`, `frontend/src/components/aba/AbaSupervision.jsx` (novo), funções novas em `abaService.js`, registro em `AbaWorkspace.jsx`, teste novo.
- Decisões (D4): grava o supervisor do time do supervisionado ou a administração; o supervisionado lê os próprios registros e marca ciência (`supervisee_ack_at`); assinado não se edita, anula com motivo; `duration_minutes` permite somar horas; sem fluxo de certificação.
- Depende de: ACUP-007 (a exclusão parte da versão da 004).

## ACUP-012 — Aviso de texto não salvo na área ABA + estilo do seletor de suporte
- Objetivo: pendências do review da 005. (1) Na área ABA inteira, trocar de aba ou de paciente com texto digitado e não salvo pergunta antes, pelo padrão do projeto (`guardUnsaved` + `<DismissPrompt>`, AGENTS §7), nunca descarta calado; (2) o seletor de nível de suporte do Perfil ganha o estilo dos outros campos.
- Arquivos de propriedade: a definir na abertura (depende de onde a troca de aba acontece em `AbaWorkspace.jsx`).
- Depende de: ACUP-008.

## ACUP-009 — Avaliações formais do paciente
- Objetivo: item 4b, `aba_assessments` (B4) + catálogo de instrumentos em código (só nome, domínio e escore para instrumento com direito autoral).
- Depende de: D4 — ADIADA. Volta quando a clínica mandar a lista de instrumentos e licenças.

## Modelo de uma task

```md
## ACUP-000 — título curto
- Objetivo:
- Arquivos de propriedade:
- Fora de escopo:
- Critério de aceite (verificável):
- Comandos que precisam passar:
- Depende de:
```

## Histórico

- 2026-11-08 — Auditoria ABA feita pelo Orquestrador; ACUP-001 distribuída para Codex LK (sessão César; "Leandro" era sessão morta no snapshot); ACUP-002 a 009 aguardando decisões D0–D4 do humano.
- 2026-11-08 — Critério (c)/(e) da ACUP-001 ajustado: 6 auxiliares puros sem DEFINER e a recusa de chave em `supabaseConfig.js:56` conferidos.
- 2026-11-08 — Humano autorizou o Orquestrador a decidir a rodada. Decisões D0–D5 em `docs/team/propostas/aba-auditoria-2026-11-08.md` (seção Decisões): D0 merge de `origin/main` feito (eafb605, conflitos = commit duplicado, resolvidos com `origin/main`); D1 plano versionado com aprovação; D2 diagnóstico cifrado; D3 catálogo do sistema + itens da clínica; D4 só supervisão formal (ACUP-009 adiada); D5 guarda mínima, nada se apaga. ACUP-002..008 liberadas em série; ACUP-001 revisada reenviada ao César.
- 2026-11-08 — Preparo do QA aprovado (`qa/revisao` 6530798, `docs/team/reviews/preparo-validacao-sql.md`): validação SQL no Postgres local `acup-qa-pg` (supabase/postgres 15.8, as 106 migrations aplicam do zero, modelo `acup_base`, ciclo BEGIN → RPC como authenticated/anon → ROLLBACK testado). Produção: nenhuma escrita, nem com ROLLBACK; conferência só leitura da divergência decidida na revisão da ACUP-002. Limite conhecido: a ordem alfabética das migrations não é a de produção, e o banco local não prova o que está no ar.
- 2026-11-08 — ACUP-001 PRONTO: QA aprovou (15 mutações mordem; 4 fugas do teste corrigidas pelo QA em 0ad3ab8), merge de `qa/ACUP-001` em `integracao` (2e0f524), quality verde (1350 testes, 1349 ok, 1 pulado). ACUP-002 distribuída ao César, com a pendência do QA (DISABLE RLS/GRANT) no aceite.
- 2026-11-08 — Sessão César saiu do barramento; a sala LK agora tem Sofia (idle) e Ícaro (working, a mais nova). O `aviso.mjs` entregou a ACUP-002 ao Ícaro. Leandro segue preso no snapshot.
- 2026-11-08 — ACUP-002 PRONTO: QA aprovou sem correção (roteiro do dev + 55 cenários adversariais com ROLLBACK, idempotência com COMMIT 2x, concorrência em 2 sessões, diffs textuais conferidos, 34 mutações mordem), merge de `qa/ACUP-002` em `integracao` (3700917), quality verde (1358 testes, 1357 ok, 1 pulado). Pendências não bloqueantes viraram a ACUP-010. Time passa para a mesa (TIME-1/TIME-2): quadro vivo em `mesa/TASKS.md`; este arquivo vira retrato. ACUP-003 distribuída pelo `mesa/aviso.mjs`.
- 2026-11-08 — ACUP-003, aceite 1 ajustado a pedido do dev: sem "enviado por" (o banco não guarda; vira item 4 da ACUP-010); aprovado pode ser anulado pela supervisão com motivo, como o banco já permite.
- 2026-11-08 — ACUP-003 PRONTO: QA aprovou (navegador real via harness sem login + Chrome headless, 50/50 cenários; corrigiu texto cortado no meio da palavra a cada 450 caracteres, 83d9286, com teste que falha antes), merge em `integracao` (f30952f), quality verde (1368 testes, 1367 ok, 1 pulado). Pendências ("Como funciona" e 22023) entraram na ACUP-010, distribuída ao Codex LK.
- 2026-11-08 — ACUP-010: dev autorizado a ajustar `aba-plan-screen.test.mjs` (proibição de "Enviado por" vira exigência; casos novos). Replay: RPC que devolve UUID repete o id; RPC VOID repete sucesso vazio, sem revisão nova (aceito).
- 2026-11-08 — ACUP-010 PRONTO: QA aprovou (diff das 4 RPCs = 002 + pedido; exclusão intocada; CHECK do remetente nos 5 estados; NO KEY UPDATE libera INSERT com FK; corrigiu teste do CHECK que não mordia, 9/9 mutações), merge em `integracao` (a5b47d3), quality verde (1374, 1373 ok, 1 pulado). Pendência cosmética ("Aprovado em" quebra linha) foi para a ACUP-005. ACUP-004 distribuída.
- 2026-11-08 — ACUP-004 PRONTO: QA aprovou (34 cenários próprios + roteiro do dev; nada em claro; payload não forja clínica/paciente/ator; exclusão = 20261108 + 2 linhas, testada com perfil+plano+programa+atendimento+evolução; corrigiu teste que não pegava coluna clara de CID, 19/19 mutações), merge em `integracao` (1b3144a), quality verde (1380, 1379 ok, 1 pulado). Pendências (paciente arquivado aceito; laudo com data futura) viraram a ACUP-011, antes da 005.
- 2026-11-08 — ACUP-011: QA aprovou, mas apontou que a mensagem copiada dizia "não recebe plano" ao salvar o perfil. O erro era do meu aceite. Como a migration não está em `integracao` nem em produção, volta ao dev para trocar o texto na própria `20261108ba` (sem migration nova); QA reconfere só esse ponto.
- 2026-11-08 — ACUP-011 PRONTO: QA aprovou (diff = 20261108b + 2 IFs; leitura e exclusão com hash igual; virada do dia testada em vários fusos; mensagem corrigida para "não recebe perfil" na própria 20261108ba, 12/12 mutações), merge em `integracao` (d614058), quality verde (1382, 1381 ok, 1 pulado). ACUP-005 distribuída.
- 2026-11-08 — ACUP-005: dev autorizado a acrescentar `TABS.PERFIL` na lista fechada do grupo Plano em `aba-plan-screen.test.mjs`.
- 2026-11-08 — Rotina do board do humano (http://127.0.0.1:4790) adotada: resumos em `mesa/resumos/`, `mesa/para-voce.md` com o SQL em ordem e as decisões, prints de tela no aceite (005, 007, 008). Resumos semeados revisados (003: nome da aba e anular aprovado; 004: quem lê; 010: trava).
- 2026-11-08 — ACUP-005 PRONTO: QA aprovou (navegador real em 360/768/1024/1280; nenhuma sugestão de diagnóstico, nada do laudo no console ou no título; membro só leitura; corrigiu teste que não pegava autocomplete, diagnóstico no título e revision fixa, 19/19 mutações), merge em `integracao` (0729ff3), quality verde (1393, 1392 ok, 1 pulado). Prints pedidos ao QA (não vieram no review). Pendências viraram a ACUP-012. ACUP-006 distribuída.
- 2026-11-08 — Quadro corrompido por mim (um `$` seguido de crase no texto da regex foi lido como padrão de substituição e copiou o quadro para dentro da ACUP-006); reparado no `mesa/TASKS.md` e no retrato, o dev avisou. ACUP-006: técnica exige `content.name`, objetivo `content.title`.
- 2026-11-08 — Cota (PLANO-COTA): Codex LK ficou sem cota às 22:15 com a ACUP-006 quase pronta; decisão **esperar** (renovava em menos de 1 h, falta pouco da task). Vigia retomou às 22:37; a sessão nova (22:42) continua pela linha Retomada do estado, agora protegida (rede bloqueada; se o Docker falhar, vira BLOQUEIO e aviso o humano). Rotina de cota e ajudantes LLM levada para `docs/team/roles/*.md` e README.
- 2026-11-08 — ACUP-006 entregue (47b1cc9; lint, 1400 testes com 1399 ok e 1 pulado, build verdes; roteiro SQL da sessão anterior, não reexecutado na retomada). REVIEW mandado ao QA pedindo a validação SQL completa.
- 2026-11-08 — ACUP-006 PRONTO: QA aprovou sem correção (SQL refeito do zero no acup-qa-pg: migration 2x COMMIT, roteiro do dev 9 OK, 10 cenários próprios, 161 modelos aceitos e devolvidos idênticos, concorrência em 2 sessões, 14/14 mutações mordem), merge em `integracao` (c452e87), quality verde (1400, 1399 ok, 1 pulado). ACUP-007 aberta com os dois achados do QA no aceite: `restricted` do sistema vence o ajuste da clínica; objetivo ganha `key` explícito em `abaLibrary.js` (decisão do Orquestrador: chave escrita no arquivo, com lista fechada no teste, em vez de título ou posição).
