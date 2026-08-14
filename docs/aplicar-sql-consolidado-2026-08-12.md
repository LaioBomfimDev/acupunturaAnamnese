# Aplicar no Supabase — consolidado das correções de segurança (2026-08-12)

Guia único para as 4 migrations novas de hoje, resultado da correção dos
achados da auditoria de segurança (`docs/auditoria-seguranca-2026-08-11.md`).
São independentes entre si (nenhuma depende do resultado da outra) — pode
rodar na ordem abaixo, uma de cada vez, colando o arquivo inteiro no SQL
Editor do Supabase.

**Pré-requisito comum:** `20260723_clinical_data_hardening.sql` já aplicada
(é de onde vêm `can_access_clinical_data`, `is_clinic_admin`,
`reject_immutable_clinical_log_mutation` etc., reusadas por todas as 4).

---

## 1. `supabase/migrations/20260812_fix_shared_session_isolation.sql`
### 🔴 Prioridade máxima — corrige o achado crítico C1

Restaura isolamento entre clínicas, redação por escopo e leitura da chave via
Vault em `get_shared_session`, que a migration `20260807` havia perdido sem
perceber. Detalhe completo já em
`docs/aplicar-sql-correcao-isolamento-2026-08-12.md` — verificação esperada:

| coluna | esperado |
|---|---|
| `funcao_criada` | `true` |
| `isola_por_clinica` | `true` |
| `share_restrito_a_clinica` | `true` |
| `usa_vault` | `true` |
| `sem_leitura_app_config` | `true` |
| `authenticated_pode_executar` | `true` |
| `anon_bloqueado` | `true` |

Se `usa_vault` vier `false`, o Vault não tem `clinical_records_encryption_key`
provisionada — resolva isso antes (pré-requisito da própria `20260723`).

Depois de aplicar, se alguém tiver reinserido manualmente uma chave em
`app_config.encryption_key` para contornar o erro que a versão quebrada
produzia sem ela, apague-a:
```sql
DELETE FROM public.app_config WHERE key = 'encryption_key';
```

## 2. `supabase/migrations/20260812_admin_audit_log_immutability.sql`

Trava `admin_audit_logs` contra `UPDATE`/`DELETE`, igual à trilha clínica.
Verificação esperada: `trigger_criado = true`.

## 3. `supabase/migrations/20260812_revoke_sessions_after_password_change.sql`

Cria `revoke_user_sessions(uuid)`, chamada por `complete-first-login` e
`super-admin-reset-password` depois de trocar a senha. Best-effort: mata a
capacidade de renovar a sessão (via `auth.sessions`/`auth.refresh_tokens`),
não um access token de curta duração já emitido e ainda não expirado — isso é
inerente a JWT sem estado. Verificação esperada: `funcao_criada = true`,
`authenticated_bloqueado = true`, `anon_bloqueado = true`.

Se a verificação der erro em `DELETE FROM auth.sessions`/`auth.refresh_tokens`
(schema interno do GoTrue pode variar por versão), a função ainda assim não
quebra a troca de senha em si — ela engole a exceção e só avisa (`RAISE
WARNING`) nos logs do Postgres. Se isso acontecer, me avise para eu ajustar os
nomes de coluna à versão real do seu projeto.

## 4. `supabase/migrations/20260812_temporary_password_ttl.sql`

Adiciona `profiles.temporary_password_set_at` e faz backfill (`now()`) para
quem já está com `must_change_password = true` hoje — ou seja, **a partir do
momento em que você rodar esta migration, contas com senha temporária pendente
passam a ter 7 dias para trocar antes de o login recusar** (a Edge Function
`login-with-identifier`, já com o código novo, é quem aplica essa regra).
Verificação esperada: `coluna_criada = true`.

---

## Depois de aplicar as 4 migrations: redeploy das Edge Functions

Estas mudaram e precisam ser reimplantadas no Supabase (elas rodam a partir
do código do repositório, a migration por si só não as atualiza):

- `complete-first-login` (mensagens de erro genéricas, cap de payload, revoga
  sessão)
- `super-admin-reset-password` (revoga sessão, seta `temporary_password_set_at`)
- `super-admin-create-user` (seta `temporary_password_set_at`, cap de payload)
- `super-admin-reset-mfa` (cap de payload)
- `login-with-identifier` (TTL de senha temporária, mitigação de timing)
- `knowledge-source-asset-url`, `create-record-share`, `food-research`,
  `library-qa`, `analyze-tongue` (cap de payload)

Se você usa a CLI do Supabase: `supabase functions deploy <nome>` para cada
uma, ou `supabase functions deploy` sem argumento para todas de uma vez.

## Depois do redeploy: um teste manual rápido

1. Duas clínicas diferentes, um compartilhamento ativo só para um paciente da
   Clínica A → um profissional da Clínica B **não** deve conseguir abrir o
   prontuário desse paciente pela tela "Ver compartilhado".
2. Login com senha errada num usuário que não existe vs. senha errada num
   usuário que existe: os dois devem "sentir" igualmente rápidos (não é um
   teste com stopwatch, só checar que não há demora perceptível num caso e
   não no outro).
3. Resetar a senha de um usuário de teste e confirmar que uma sessão aberta
   antes do reset para de funcionar depois que o token de acesso dela expirar.

## O que este guia NÃO resolve (fora do escopo de migration SQL)

- **C2** (chave de criptografia antiga exposta no Git) — rotação separada,
  já descrita em `docs/runbook-hardening-producao.md`.
- **C3** (consentimento do paciente/LGPD) — decisão de produto/jurídica, não
  código.
- Configuração de `.github/dependabot.yml` — precisa estar habilitado no
  GitHub (Settings → Security → Dependabot), o arquivo sozinho não liga a
  feature em repositórios onde ela esteja desativada por padrão.
