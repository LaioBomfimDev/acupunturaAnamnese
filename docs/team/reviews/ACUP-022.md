## ACUP-022 — entrega do QA (Edge Functions preferem as chaves novas do Supabase)

- Veredito: **APROVADO** (feita pelo QA, sem dev livre). Commits: `f69b11f` (ordem das chaves) e a ampliação KEYS-1 (`verify_jwt` + teste da porta; ver a seção KEYS-1 e o REVIEW) em `qa/ACUP-022`, criada de `qa/ACUP-021` `04222c7`, **nunca do integracao**. A branch leva junto a 021 (main `1ea4172` + `c1bab7b` + `7d60b56` + review), para sair na mesma publicação (PUB-2).
- Gate: `npm run quality` verde, rodado sozinho. Com a ordem das chaves: **1456 testes (1455 ok, 1 pulado)**. Com a KEYS-1: **1459 (1458 ok, 1 pulado, 0 falhas)**. Na primeira rodada da KEYS-1, um teste que sobe o Vite (`area-menu-attention`) travou com a máquina sem memória; sozinho passou 5/5, e a rodada seguinte inteira ficou verde. Lint, invariantes e build ok.
- SQL: não há. PROD-2 ok.
- **Nenhum valor de chave** no código, no teste, nos logs ou neste review. O teste usa só marcadores fictícios. A varredura por `sb_secret_…`, `sb_publishable_…` e `eyJhbGciOi` nos dois arquivos não achou nada.

### O que mudou (`supabase/functions/_shared/security.ts`)
- `createServiceClient`: `getNamedOrFirstKey(SUPABASE_SECRET_KEYS) || SUPABASE_SERVICE_ROLE_KEY`. A nova vem primeiro e a antiga fica só de reserva.
- `createAnonClient`: `getNamedOrFirstKey(SUPABASE_PUBLISHABLE_KEYS) || SUPABASE_ANON_KEY`.
- As mensagens de erro continuam as mesmas, sem valor: "Chave secreta/pública do Supabase não configurada nas Edge Functions."
- **Endurecimento além do pedido:** `getNamedOrFirstKey` agora tem `try/catch`. Com a nova lida primeiro, o `JSON.parse` roda em toda chamada, e o erro do V8 para JSON inválido cita o começo do conteúdo (`Unexpected token … "sb_secr"…`), o que levaria a chave ao log. Agora JSON inválido devolve vazio e cai na antiga ou na mensagem própria.

### Teste novo `frontend/tests/regression/edge-supabase-keys.test.mjs`
- Roda os dois clientes **de verdade**, com tipos tirados por `stripTypeScriptTypes` e `Deno.env`/`createClient` falsos. Casos:
  - com as duas chaves presentes, vence a nova;
  - sem a nova, a antiga serve de reserva;
  - `default` vence, e sem ela vale a primeira;
  - JSON inválido dá a mensagem própria sem o valor; com a antiga presente, cai nela.
- Lê o fonte com regex `\r?\n`: a nova vem antes da antiga nos dois clientes, o padrão antigo `if (!serviceRoleKey && secretKeys)` não pode existir, e o `try` fica em volta do `JSON.parse`.
- Varre `supabase/functions/**`: nenhum arquivo além de `_shared/security.ts` cita `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEYS`, `SUPABASE_PUBLISHABLE_KEYS`, `@supabase/supabase-js` ou `createClient(`.
- **Morde:** com a `security.ts` de antes (ordem antiga, sem `try`), **3 dos 6 falham**: a nova não vence, o JSON inválido derruba a função e a ordem no fonte está errada.

### Ninguém lê chave por fora
- As 23 funções de `supabase/functions/` (fora `_shared`) criam o cliente só por `createServiceClient`/`createAnonClient`. `_shared/corrections.ts` e `_shared/instructions.ts` recebem o cliente pronto.
- A única outra leitura de chave por `Deno.env` é `DAILY_API_KEY` (`_shared/dailyRooms.ts`), do Daily, não do Supabase.

### `verify_jwt` no `supabase/config.toml`
Têm `verify_jwt = false` (7): `login-with-identifier`, `satisfaction-survey`, `confirm-appointment`, `public-agenda`, `patient-portal`, `interview-link`, `online-consultation`.

**Sem bloco no config.toml, então ficam no padrão `verify_jwt = true` (16):**
`analyze-tongue`, `clinic-assistant`, `clinical-reasoning`, `complete-first-login`, `create-record-share`, `draft-narrative`, `food-research`, `knowledge-source-asset-url`, `library-qa`, `log-logout`, `psych-reading`, `psych-report`, `psych-suggest-marks`, `super-admin-create-user`, `super-admin-reset-mfa`, `super-admin-reset-password`.

- As 16 conferem a sessão no próprio código (`getCallerProfile` → `auth.getUser`, ou `assertEdgeAccess`), de 2 a 5 checagens em cada uma. Ligar `verify_jwt = false` nelas **não abre** nada: o código continua barrando sem sessão.
- Risco se ficarem como estão: o gateway com `verify_jwt` só aceita JWT. Chamada com sessão (o app manda o token do usuário) segue passando. Chamada só com a chave nova (`sb_publishable_`, que não é JWT) é barrada. O mesmo acontece se depois o projeto trocar a assinatura dos JWT ("JWT signing keys").
- Recomendei acrescentar o `verify_jwt = false` nas 16. **Decisão KEYS-1 do Orquestrador: feito** (seção abaixo).

### KEYS-1: `verify_jwt = false` nas 16 + teste da porta no handler (commit da ampliação no fim)
- `supabase/config.toml`: 16 blocos novos `[functions.<nome>]` com `verify_jwt = false`, com o comentário do motivo. Agora **as 23 funções** têm bloco próprio. **Nenhuma linha de código de função mudou.**
- Teste novo em `edge-supabase-keys.test.mjs`:
  - **Toda função publicada** tem bloco no `config.toml` com `verify_jwt = false`. São 23; se o número mudar, o teste avisa para conferir a lista de republicar.
  - **Toda função sem `verify_jwt` precisa de uma destas:**
    - Conferir a sessão no código: `const caller = await getCallerProfile(req, …)` seguido na hora de `if ('error' in caller) return …`, e mais `assertEdgeAccess(caller.profile, caller.claims)` (conta ativa, troca de senha, MFA). Ficam sem `assertEdgeAccess` só duas, de propósito e com motivo: `complete-first-login` (é a troca obrigatória de senha; o gate barraria justamente quem precisa trocar) e `log-logout` (só registra a saída; sem sessão responde ok sem gravar nada).
    - Ou estar na **lista fechada de públicas**, com motivo, com o limite de tentativas (`enforceEdgeRateLimit(`) e com a própria conferência dela no fonte:

| Pública | Motivo | O que o teste exige no fonte |
|---|---|---|
| `login-with-identifier` | é o próprio login, antes de existir sessão | `signInWithPassword` |
| `satisfaction-survey` | paciente responde a pesquisa pelo link, sem conta | token do link |
| `confirm-appointment` | paciente confirma pelo link pessoal, sem conta | token do link |
| `public-agenda` | agenda só leitura compartilhada por link | token do link |
| `patient-portal` | código + data de nascimento, sem conta no Auth | `portal_login` e `portal_resolve_session` |
| `interview-link` | quem convive com o paciente responde pelo link | `interview_link_open` |
| `online-consultation` | paciente entra pelo link do agendamento; o lado de quem atende confere sessão | token e `getCallerProfile` |

  - **Função sem conferência de sessão e fora da lista = falha.** As listas não apodrecem: nome que sumiu falha, e quem está na lista "sem gate" precisa ao menos conferir a sessão.
- Teste antigo `login-auth-hardening.test.mjs`:
  - **Antes:** "exatamente 7 funções com `verify_jwt = false`".
  - **Agora:** continua conferindo as 7 públicas uma a uma. A contagem passa a ser "uma por função publicada", e o teste exige que a lista de públicas do teste novo seja **exatamente** essas 7.
  - O alarme de "superfície sem login nova" não sumiu: mudou para o teste novo, que é mais forte, porque olha o código e não só o número.
- **Mutações (9/9 pegas):**
  - `analyze-tongue` sem conferir sessão;
  - `psych-report` sem `assertEdgeAccess`;
  - `library-qa` com `verify_jwt = true`;
  - bloco da `clinic-assistant` apagado;
  - `patient-portal` sem `portal_resolve_session`;
  - `satisfaction-survey` sem limite de tentativas;
  - `log-logout` sem conferir sessão;
  - ordem antiga das chaves;
  - função nova `funcao-nova-qa` sem sessão e fora da lista, com `verify_jwt = false`.
- **Para registrar:**
  - `docs/auditoria-seguranca-2026-08-11.md` diz que só o login tinha `verify_jwt=false`. É registro datado, não mexi.
  - Sugiro uma linha no AGENTS §9 ("toda Edge Function publicada tem `verify_jwt = false`; a porta é o handler: `getCallerProfile` + `assertEdgeAccess`, ou pública da lista de `edge-supabase-keys.test.mjs`"). Fica para quem cuida do manual: está fora dos arquivos desta task.

### Funções a republicar (todas, menos `_shared`): 23
Todas importam `_shared/security.ts`, e o `config.toml` (lido no deploy) mudou para 16 delas. Por isso todas sobem. Rodar **de uma pasta com a branch `qa/ACUP-022` em checkout** (nunca do `integracao`), na raiz do repositório, logado no CLI do Supabase. Nada de chave na linha de comando:

```bash
git branch --show-current   # tem que dizer qa/ACUP-022
supabase functions deploy analyze-tongue clinic-assistant clinical-reasoning complete-first-login confirm-appointment create-record-share draft-narrative food-research interview-link knowledge-source-asset-url library-qa log-logout login-with-identifier online-consultation patient-portal psych-reading psych-report psych-suggest-marks public-agenda satisfaction-survey super-admin-create-user super-admin-reset-mfa super-admin-reset-password --project-ref hoyznqffprojawxvkfcd
```

**Atenção, PUB-1:** publicar a partir desta branch (main + 021 + 022), **nunca do integracao**: lá a `clinic-assistant` já tem a 016/017, que só vão ao ar depois da 018 e do RIPD.

Ordem sugerida para o humano:
1. Criar as chaves novas no painel. A plataforma injeta `SUPABASE_SECRET_KEYS`/`SUPABASE_PUBLISHABLE_KEYS`; conferir os nomes em `supabase secrets list`, só os nomes.
2. Publicar as 23.
3. Testar login, Agenda e uma função de IA.
4. Só então desligar as Legacy API keys.

O frontend também precisa da chave pública nova no lugar da anon antiga (variável do Vercel). Isso fica fora desta task, mas vale conferir antes do passo 4.
