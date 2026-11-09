## ACUP-022 — entrega do QA (Edge Functions preferem as chaves novas do Supabase)

- Veredito: **APROVADO** (feita pelo QA, sem dev livre). Commit: `f69b11f` em `qa/ACUP-022`, criada de `qa/ACUP-021` `04222c7`, **nunca do integracao**. A branch leva junto a 021 (main `1ea4172` + `c1bab7b` + `7d60b56` + review), para sair na mesma publicação (PUB-2).
- Gate: `npm run quality` verde, rodado sozinho: **1456 testes (1455 ok, 1 pulado, 0 falhas)**, mais os 6 do teste novo. Lint, invariantes e build ok.
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
- **Recomendação:** antes de desligar as Legacy API keys, acrescentar um bloco `[functions.<nome>]` com `verify_jwt = false` para cada uma das 16 (é mudança de config, fora dos arquivos desta task; decisão do Orquestrador/humano), ou publicar com `--no-verify-jwt`.

### Funções a republicar (todas, menos `_shared`): 23
Todas importam `_shared/security.ts`, então todas precisam subir com a mudança. Na raiz do repositório, logado no CLI do Supabase e com o projeto ligado (`supabase link`). Nada de chave na linha de comando:

```bash
supabase functions deploy analyze-tongue clinic-assistant clinical-reasoning complete-first-login confirm-appointment create-record-share draft-narrative food-research interview-link knowledge-source-asset-url library-qa log-logout login-with-identifier online-consultation patient-portal psych-reading psych-report psych-suggest-marks public-agenda satisfaction-survey super-admin-create-user super-admin-reset-mfa super-admin-reset-password
```

(O `config.toml` é lido no deploy: as 7 com `verify_jwt = false` sobem assim. Para as outras 16 vale a recomendação acima.)

**Atenção, PUB-1:** publicar a partir desta branch (main + 021 + 022), **nunca do integracao**: lá a `clinic-assistant` já tem a 016/017, que só vão ao ar depois da 018 e do RIPD.

Ordem sugerida para o humano:
1. Criar as chaves novas no painel. A plataforma injeta `SUPABASE_SECRET_KEYS`/`SUPABASE_PUBLISHABLE_KEYS`; conferir os nomes em `supabase secrets list`, só os nomes.
2. Publicar as 23.
3. Testar login, Agenda e uma função de IA.
4. Só então desligar as Legacy API keys.

O frontend também precisa da chave pública nova no lugar da anon antiga (variável do Vercel). Isso fica fora desta task, mas vale conferir antes do passo 4.
