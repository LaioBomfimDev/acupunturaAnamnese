# ABA — auditoria e proposta (08/11/2026)

Autor: Orquestrador. Base auditada: `integracao` (da43141) e `origin/main` (cdb181e).
Referências `b:` = `supabase/migrations/20261101b_aba_coleta.sql`, `c:` = `20261101c_aba_qualidade.sql`.

## 0. Contexto que muda a pergunta

O ABA **já existe e está em `main` e em `rebrand/vitalis`** (commit a6efae1, 31/10/2026): 3 migrations (5.064 linhas), 21 tabelas `aba_*`, ~50 RPCs, 15 componentes em `frontend/src/components/aba/`, `services/abaService.js`, 4 testes `aba-*.test.mjs`. A origem é o sistema ABA chamado **"Atlas" (Integrare)**, trazido "sem dado nenhum — só o desenho" (b:9-10).
Não verifiquei se as 3 migrations estão aplicadas no Supabase de produção.

Achado de processo: `integracao` está **11 commits atrás de `origin/main`**. A última versão de `admin_decide_patient_deletion` está em `20261103c_patient_notes.sql`, que só existe em `origin/main`. Migration nova criada a partir de `integracao` recriaria a exclusão a partir da versão errada (perderia `patient_notes` e o que veio depois).

## A. Veredito por item

| # | Suspeita | Veredito | Evidência |
|---|---|---|---|
| 1 | Plano terapêutico com versões e aprovação não existe | **PARCIAL** | Existe `aba_programs` com `revision` só para CAS (b:251, b:1109), `status` de fase (b:226-229) e criação/edição restritas à supervisão (`aba_save_program` chama `aba_require_patient(p, TRUE)`, b:1039; `aba_can_supervise_patient`, b:660). A sessão guarda `program_snapshot` (b:331). **Falta:** entidade "plano" que agrupe os programas; histórico de versões (`UPDATE` sobrescreve `definition`, b:1180-1205: versão que nenhuma sessão usou some); estado rascunho→aprovado com quem/quando aprovou; troca de fase guarda só texto concatenado nas notas (b:1263-1268), sem trilha estruturada. |
| 2 | Perfil ABA do paciente (diagnóstico, comunicação) não existe | **NÃO EXISTE** | Nenhuma coluna de diagnóstico/comunicação em migration alguma (`grep diagnos\|comunica` nas migrations: só um comentário de "comunicação ao responsável" em risco, b:417). O que existe de "repertório" são reforçadores (b:174) e comportamentos interferentes (b:192), não perfil. |
| 3 | Biblioteca de objetivos/técnicas editável pela clínica não existe | **NÃO EXISTE (confirmado)** | `frontend/src/data/abaLibrary.js` (1.986 linhas): `ABA_OBJECTIVES` (l.10) e `ABA_TECHNIQUES` (l.1047), constantes, importadas só por `AbaPrograms.jsx:11`. O próprio cabeçalho (l.3-4) diz que no Atlas original eram tabelas com `clinic_id` — aqui virou lista fixa. Nenhuma tabela de biblioteca. |
| 4 | Registros formais de supervisão e avaliações não existem | **PARCIAL** | Existe supervisão **por sessão**: revisão/correção/assinatura (`aba_sessions.reviewed_*/signed_*/signature_statement`, b:301-306; trilha `aba_session_reviews`, b:427; `aba_review_session`, b:1973), fidelidade (c:44), IOA (c:67), revisão de risco (b:409). **Falta:** registro formal de encontro de supervisão (data, duração, supervisionado, pauta, decisões, assinatura) e avaliações formais do paciente (instrumento, data, escores por domínio). "Avaliar" na UI é só fidelidade (`AbaFidelity.jsx`, `AbaQuality.jsx`). |
| 5 | AGENTS.md sem regras de ABA | **CONFIRMADO** | 0 ocorrências de `ABA`, `aba_` ou `abaLibrary` (case-sensitive) em `AGENTS.md` de `integracao` e de `origin/main`. Agravante: a palavra "Atlas" no AGENTS.md e em `docs/agents-mapas.md` significa o Atlas da Ednéa (acupuntura, bucket público). O ABA também se chama "Atlas" na origem: outra sessão pode aplicar regra do Atlas público ao ABA, ou o contrário. |

Regras de servidor já boas no que existe (conferidas): todas as 21 tabelas com RLS ligada + `REVOKE ALL` e nenhuma policy (b:452-468, c:135-147); RPCs `SECURITY DEFINER SET search_path = pg_catalog`; gate de conta em toda RPC (`aba_require_gate`, b:699); texto livre cifrado; tabelas ABA na exclusão de paciente (b:3024, c:1173, `20261103c`).

## B. Menor modelo de dados para o que falta

Padrão único (o mesmo do ABA atual): tabela `aba_*`, RLS ligada, nenhuma policy, `REVOKE ALL FROM PUBLIC, anon, authenticated`; acesso só por RPC `aba_*` `SECURITY DEFINER SET search_path = pg_catalog` começando por `aba_require_patient`; texto livre em `*_encrypted` via `aba_encrypt`; `CREATE TABLE IF NOT EXISTS` / `CREATE OR REPLACE` / `DO $requires$`; nada de `service_role` no frontend; toda tabela com `patient_id` entra numa nova versão de `admin_decide_patient_deletion` partindo da **última** (hoje `20261103c`).

### B1. Plano terapêutico versionado (item 1)

```
aba_program_revisions          -- histórico; escrito só por aba_save_program / aba_update_program_status
  id, clinic_id, patient_id, program_id -> aba_programs RESTRICT
  revision BIGINT               -- = aba_programs.revision gravada
  snapshot JSONB                -- mesma forma de program_snapshot (sem texto livre em claro)
  notes_encrypted BYTEA
  changed_by -> profiles, changed_at
  UNIQUE (program_id, revision)

aba_plan_versions
  id, clinic_id, patient_id
  version_no INT                -- 1, 2, 3… por paciente
  status TEXT CHECK IN ('rascunho','em_revisao','aprovado','substituido','anulado')
  programs JSONB                -- [{program_id, revision}] congelados na aprovação
  summary_encrypted BYTEA       -- objetivos gerais, justificativa, critérios de revisão
  review_due_on DATE
  authored_by, submitted_at
  approved_by, approved_at, approval_statement TEXT   -- carimbado pelo banco (auth.uid())
  voided_by, voided_at, void_reason_encrypted
  revision BIGINT (CAS), created_at, updated_at
  UNIQUE (patient_id, version_no)
  UNIQUE (patient_id) WHERE status = 'aprovado'      -- um vigente
  CHECK por status com IS NOT NULL explícito (AGENTS §9)
```
Regras: aprovado é imutável (RPC recusa; nova versão nasce como rascunho copiando a anterior); aprovar marca a anterior `substituido` na mesma transação; quem aprova = `aba_can_supervise_patient`; anular exige motivo. RPCs: `aba_save_plan_draft`, `aba_submit_plan`, `aba_approve_plan`, `aba_void_plan`, `aba_list_plan_versions`.

### B2. Perfil ABA do paciente (item 2)

```
aba_patient_profiles           -- 1 linha por paciente
  patient_id PK -> patients RESTRICT, clinic_id
  communication_mode TEXT[]     -- códigos: vocal, pecs, caa_alta, caa_baixa, sinais, gestos, misto
  support_level TEXT CHECK IN ('1','2','3','nao_informado')
  diagnosis_encrypted BYTEA     -- diagnóstico(s), CID, laudo/fonte e data, em texto cifrado
  details_encrypted BYTEA       -- comunicação detalhada, sensorial, rotina, observações
  revision BIGINT (CAS), updated_by, updated_at
```
Diagnóstico registra o que veio de laudo; o sistema nunca sugere nem infere diagnóstico.

### B3. Biblioteca editável pela clínica (item 3)

```
aba_library_items
  id, clinic_id NOT NULL
  kind TEXT CHECK IN ('objetivo','tecnica')
  system_key TEXT NULL          -- preenchido = ajuste/ocultação de um item de abaLibrary.js
  content JSONB                 -- mesmos campos de ABA_OBJECTIVES/ABA_TECHNIQUES, limite de tamanho
  status TEXT CHECK IN ('ativo','oculto','arquivado')
  created_by, updated_by, revision, timestamps
  UNIQUE (clinic_id, kind, system_key) WHERE system_key IS NOT NULL
```
Sem `patient_id` (não é dado clínico; fica fora da exclusão). O catálogo do sistema continua em código, só leitura; a tela mostra sistema + itens da clínica − ocultos.

### B4. Supervisão formal e avaliações (item 4)

```
aba_supervision_records
  id, clinic_id, supervisor_id, supervisee_id -> profiles
  patient_id NULL               -- encontro pode ser de caso ou geral
  held_on DATE, duration_minutes INT, modality CHECK IN ('individual','grupo'), format CHECK IN ('presencial','online')
  agenda_encrypted, decisions_encrypted BYTEA
  status CHECK IN ('rascunho','assinado','anulado')
  signed_by, signed_at, supervisee_ack_at, void_reason_encrypted, revision

aba_assessments
  id, clinic_id, patient_id
  instrument_key TEXT           -- catálogo em código (nome, domínios, faixas); instrumento com direito autoral = só nome, domínio e escore
  applied_on DATE, applied_by
  scores JSONB                  -- {dominio: número}; nada de item/pergunta copiada
  notes_encrypted BYTEA
  status CHECK IN ('rascunho','final','anulado'), void_reason_encrypted, revision
```
Final não se edita; anula com motivo (regra igual à das escalas).

## C. Bloco de regras ABA para o AGENTS.md (para revisão humana)

Parte **vigente** (descreve o que o código já faz; vai na ACUP-001):

> - ABA (Análise do Comportamento Aplicada, 31/10/2026): área própria, liberada para quem tem Psicologia. A origem é o sistema ABA "Atlas" (Integrare), que **não** é o Atlas da Ednéa (acupuntura, `atlas-ednea/`): em código, commit e doc chame de "ABA", nunca de "Atlas", e as regras do Atlas público nunca valem para o ABA. Tabelas `aba_*` com RLS ligada, nenhuma policy e `REVOKE ALL`; tudo passa por RPC `aba_*` `SECURITY DEFINER SET search_path = pg_catalog` (auxiliares puros, sem tabela, podem ser INVOKER, sempre com `search_path = pg_catalog`), que começa por `aba_require_gate`/`aba_require_patient`. Quem vê: `aba_can_access_patient` (administração, time do paciente, convocação ativa, quem fez a matrícula enquanto não há time). Quem supervisiona (cria e edita programa, aprova comportamento, revisa e assina sessão, autoriza procedimento restrito, registra IOA): `aba_can_supervise_patient` (supervisor do time e administração). Supervisor é `aba_care_teams.supervisor_id`, nunca cargo novo em `profiles.role`. Texto livre sobre a criança vai cifrado (`*_encrypted`, `aba_encrypt`); só códigos, números e datas em claro. Coleta não é evolução: o atendimento ABA evolui na tela Evoluções. A sessão guarda `program_snapshot` e gráfico/critério leem o snapshot, nunca o programa editado depois. Escrita com `revision` (CAS) e `client_event_id`. Procedimento restrito exige comportamento-alvo com plano de segurança e parecer nominal da supervisão, carimbado pelo banco. Sessão finalizada só muda por correção (`aba_correct_session`, o anterior fica em `aba_session_reviews.previous_encrypted`). A biblioteca (`data/abaLibrary.js`) é ponto de partida, nunca decisão clínica: modelo escolhido pede individualização e revisão da supervisão. Alertas lembram, nunca decidem. Tabela `aba_*` com `patient_id` entra na exclusão de paciente (última versão de `admin_decide_patient_deletion`). Testes: `tests/regression/aba-*.test.mjs` e `tests/regression/aba-invariants.test.mjs`.

Parte **proposta** (entra só depois das decisões D1–D5, cada uma na task que a implementa):

> - Plano terapêutico ABA: versão por paciente em `aba_plan_versions` (rascunho → em revisão → aprovado → substituído; anulado com motivo). Só um aprovado por vez; aprovado não se edita, nova versão nasce rascunho. Aprova quem supervisiona, carimbado pelo banco; o plano aprovado congela `{programa, revisão}`. Toda gravação de programa deixa linha em `aba_program_revisions`. A IA nunca aprova nem gera plano.
> - Perfil ABA (`aba_patient_profiles`): diagnóstico só o que veio de laudo, cifrado; o sistema nunca sugere nem infere diagnóstico. Comunicação e nível de suporte em código.
> - Biblioteca da clínica (`aba_library_items`): catálogo do sistema só leitura em código; a clínica acrescenta, ajusta e oculta itens, nunca apaga os do sistema.
> - Supervisão formal e avaliações: assinadas/finalizadas não se editam, anulam com motivo. Instrumento com direito autoral (VB-MAPP, ABLLS-R, Vineland, PEAK…) entra só com nome, domínio e escore, nunca com itens copiados (regra das escalas).
> - Retenção: registro ABA é prontuário; segue a guarda do prontuário psicológico e a exclusão por anonimização (§9), nunca `DELETE` direto.

## D. Tasks

Ver `docs/team/TASKS.md` (ACUP-001 a ACUP-009). Só a ACUP-001 (doc + teste, sem schema) foi distribuída. As demais esperam as decisões.

## E. Decisões do humano (3 alternativas, uma recomendada)

- **D0 — Sincronizar `integracao` com `origin/main`** (11 commits atrás). (a) merge de `origin/main` em `integracao` — **recomendo**: migration nova parte da exclusão certa; risco: traz o `20261106` do financeiro, que no repo principal tem mudança local não commitada. (b) recriar `integracao` a partir de `origin/main`: limpo, mas descarta o que já estiver aqui. (c) seguir atrás e resolver na passagem final: risco alto de recriar `admin_decide_patient_deletion` da versão errada (regressão LGPD).
- **D1 — Plano**: (A) só histórico por programa (`aba_program_revisions`): pequeno, mas não existe "plano aprovado" para mostrar/imprimir. (B) histórico + `aba_plan_versions` com aprovação — **recomendo**. (C) gravar o plano em `clinical_records` versionado: reaproveita CAS, mas mistura com a ficha da Psicologia e a RLS de lá é outra. Sub-decisão: administração que não atende pode aprovar? (hoje pode supervisionar tudo).
- **D2 — Perfil**: (A) diagnóstico cifrado, comunicação/suporte em código — **recomendo**. (B) CID em claro para filtros/relatórios: mais útil, mais exposto. (C) tudo como texto cifrado livre: mais simples, sem filtro nenhum. Quem edita: quem supervisiona (recomendo) ou qualquer um que acessa?
- **D3 — Biblioteca**: (A) cópia do catálogo para cada clínica (seed): edição livre, perde atualizações do sistema. (B) catálogo do sistema em código + itens/ajustes/ocultos da clínica — **recomendo**. (C) manter fixo. Quem edita: administração + supervisores?
- **D4 — Supervisão e avaliações**: quais instrumentos de avaliação a clínica usa e se tem licença; se o registro de supervisão precisa de ciência do supervisionado; se conta horas para certificação. Sem essa lista, recomendo fazer só a supervisão formal agora e deixar avaliações para depois.
- **D5 — Retenção**: confirmar com o jurídico o prazo de guarda do prontuário psicológico aplicado ao ABA (lembro da Res. CFP 001/2009 com mínimo de 5 anos — **palpite, conferir**).
