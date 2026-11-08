# TASKS — Sistema Acup

Só o Orquestrador edita este arquivo. Estados: `TODO` · `FAZENDO` · `REVIEW` · `PRONTO` · `BLOQUEADO`.

> **Pausa ativa (2026-11-08):** Dev Deni (conta Codex Deni) pausado por cota. Não distribuir tasks nem mandar mensagem para ele até o humano liberar.

Contexto da rodada ABA: `docs/team/propostas/aba-auditoria-2026-11-08.md` (auditoria, modelo de dados, bloco do AGENTS.md, decisões D0–D5).

| ID | Task | Dono | Branch | Estado | Aceite |
|---|---|---|---|---|---|
| ACUP-001 | Regras ABA vigentes no AGENTS.md + teste das invariantes | Codex LK (César) | codex/lk | FAZENDO | ver abaixo |
| ACUP-002 | Histórico de revisões de programa + plano versionado (SQL) | Codex LK (César) | codex/lk | TODO (próxima, após 001) | ver abaixo |
| ACUP-003 | Tela do plano terapêutico | Codex LK (César) | codex/lk | TODO (após 002) | ver abaixo |
| ACUP-004 | Perfil ABA do paciente (SQL + RPC) | Codex LK (César) | codex/lk | TODO (após 003) | ver abaixo |
| ACUP-005 | Tela do perfil ABA | Codex LK (César) | codex/lk | TODO (após 004) | ver abaixo |
| ACUP-006 | Biblioteca da clínica (SQL + RPC) | Codex LK (César) | codex/lk | TODO (após 005) | ver abaixo |
| ACUP-007 | Tela da biblioteca + AbaPrograms lendo catálogo mesclado | Codex LK (César) | codex/lk | TODO (após 006) | ver abaixo |
| ACUP-008 | Registro formal de supervisão (SQL + RPC + tela) | Codex LK (César) | codex/lk | TODO (após 007) | ver abaixo |
| ACUP-009 | Avaliações formais do paciente | — | — | BLOQUEADO (adiada por D4: falta a lista de instrumentos e licenças da clínica) | ver abaixo |

Ordem: uma task por vez, 001 → 008; cada uma só começa depois do merge da anterior em `integracao` (antes de começar, o dev faz `git merge integracao` em `codex/lk` — autorizado). As migrations com `patient_id` (002, 004, 008) recriam `admin_decide_patient_deletion` em série, sempre a partir da versão de maior nome de arquivo (hoje `20261103c_patient_notes.sql`). Nomes: 002 `20261108_aba_plano_versionado.sql`, 004 `20261108b_aba_perfil_paciente.sql`, 006 `20261108c_aba_biblioteca_clinica.sql`, 008 `20261108d_aba_supervisao_formal.sql`.

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
- Arquivos de propriedade: `supabase/migrations/2026111x_aba_plano_versionado.sql` (novo); `frontend/tests/regression/aba-plan-versions.test.mjs` (novo).
- Fora de escopo: telas; outras tabelas.
- Critério de aceite: RLS ligada + `REVOKE ALL`, sem policy; toda RPC `SECURITY DEFINER SET search_path = pg_catalog` com `aba_require_patient`; aprovar exige `aba_can_supervise_patient` e é carimbado com `auth.uid()`; um único `aprovado` por paciente (índice parcial); aprovado imutável; CHECK por status com `IS NOT NULL` explícito; texto livre cifrado; `admin_decide_patient_deletion` recriada a partir da última versão com as duas tabelas no snapshot e no DELETE (filho antes do pai); migration roda duas vezes sem erro; RPCs chamadas de verdade em transação com ROLLBACK (AGENTS §9), saída anexada ao handoff.
- Comandos: `cd frontend && npm run lint && npm test`.
- Decisões (D1): rascunho e envio por quem acessa (`aba_can_access_patient`); aprovar e anular só `aba_can_supervise_patient` (inclui administração). Aprovar marca a anterior `substituido` na mesma transação; versão nova nasce rascunho copiando a aprovada.
- Depende de: ACUP-001.

## ACUP-003 — Tela do plano terapêutico
- Objetivo: ver versões, montar rascunho a partir dos programas, enviar para revisão, aprovar (supervisão), anular com motivo; imprimir o aprovado no papel timbrado.
- Arquivos de propriedade: `frontend/src/components/aba/AbaPlan.jsx` (novo), `frontend/src/services/abaService.js` (só funções novas), registro da aba em `AbaWorkspace.jsx`, teste novo.
- Critério de aceite: botões de aprovar/anular só aparecem para quem supervisiona, e a recusa do banco aparece como mensagem em pt-BR; nada de aprovação automática; regras de navegação/celular do AGENTS §7.
- Depende de: ACUP-002.

## ACUP-004 — Perfil ABA do paciente (SQL + RPC)
- Objetivo: item 2, tabela `aba_patient_profiles` (B2) + `aba_get_profile`/`aba_save_profile` com CAS.
- Arquivos de propriedade: migration nova, teste novo.
- Critério de aceite: como ACUP-002 (RLS, definer, CAS, cifra, exclusão de paciente, chamada real com ROLLBACK); diagnóstico só cifrado; quem grava conforme D2.
- Decisões (D2): lê quem acessa, grava quem supervisiona; `diagnosis_encrypted` só de laudo (fonte e data dentro do texto cifrado); nenhum diagnóstico sugerido.
- Depende de: ACUP-003 (a exclusão parte da versão da 002).

## ACUP-005 — Tela do perfil ABA
- Arquivos de propriedade: `frontend/src/components/aba/AbaProfile.jsx` (novo), funções novas em `abaService.js`, teste novo.
- Critério de aceite: nenhum texto sugere diagnóstico; campos de laudo com fonte e data; pt-BR.
- Depende de: ACUP-004.

## ACUP-006 — Biblioteca da clínica (SQL + RPC)
- Objetivo: item 3, `aba_library_items` (B3) + `aba_list_library`/`aba_save_library_item`.
- Critério de aceite: sem `patient_id`; `clinic_id` sempre do banco (`user_clinic_id`), nunca do cliente; quem edita conforme D3; item do sistema nunca apagado, só oculto.
- Decisões (D3): edita a administração e quem é `supervisor_id` de time ativo na clínica; lê profissional ABA da clínica.
- Depende de: ACUP-005.

## ACUP-007 — Tela da biblioteca + AbaPrograms lendo o catálogo mesclado
- Arquivos de propriedade: `frontend/src/components/aba/AbaLibrary.jsx` (novo), `frontend/src/utils/abaLibraryMerge.js` (novo), `AbaPrograms.jsx` (só a fonte do catálogo), teste novo. `data/abaLibrary.js` não muda.
- Critério de aceite: sem rede, cai no catálogo do sistema e avisa; ocultos somem; aviso "ponto de partida, não decisão clínica" mantido.
- Depende de: ACUP-006.

## ACUP-008 — Registro formal de supervisão
- Objetivo: item 4a, `aba_supervision_records` (B4) com RPCs e tela.
- Arquivos de propriedade: migration `20261108d_aba_supervisao_formal.sql`, `frontend/src/components/aba/AbaSupervision.jsx` (novo), funções novas em `abaService.js`, registro em `AbaWorkspace.jsx`, teste novo.
- Decisões (D4): grava o supervisor do time do supervisionado ou a administração; o supervisionado lê os próprios registros e marca ciência (`supervisee_ack_at`); assinado não se edita, anula com motivo; `duration_minutes` permite somar horas; sem fluxo de certificação.
- Depende de: ACUP-007 (a exclusão parte da versão da 004).

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
