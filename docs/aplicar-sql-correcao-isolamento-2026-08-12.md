# Aplicar no Supabase — correção crítica de isolamento (2026-08-12)

Achado C1 da auditoria (`docs/auditoria-seguranca-2026-08-11.md`): a migration
`20260807_shared_session_multidisciplina.sql` removeu, sem perceber, o
isolamento entre clínicas de `get_shared_session`. Trate como incidente até
aplicar isto.

**Pré-requisito:** `20260723_clinical_data_hardening.sql` e
`20260807_shared_session_multidisciplina.sql` já aplicadas (se `get_shared_session`
não existir ainda, aplique-as primeiro, na ordem).

## Rodar

`supabase/migrations/20260812_fix_shared_session_isolation.sql` inteira no SQL
Editor do projeto. É aditiva/substitutiva: só troca a definição da função
`get_shared_session` e adiciona `filter_shared_session_payload_generic`; não
apaga dado nem tabela.

A verificação no fim deve devolver tudo `true`:

| coluna | esperado |
|---|---|
| `funcao_criada` | `true` |
| `isola_por_clinica` | `true` |
| `share_restrito_a_clinica` | `true` |
| `usa_vault` | `true` |
| `sem_leitura_app_config` | `true` |
| `authenticated_pode_executar` | `true` |
| `anon_bloqueado` | `true` |

Se `usa_vault` vier `false` ou a query der erro em
`get_clinical_encryption_key()`, o Vault não tem
`clinical_records_encryption_key` provisionada neste projeto — resolva isso
**antes**, é pré-requisito de `20260723`.

## Depois de aplicar

1. Confirme manualmente com dois pacientes de clínicas diferentes: um
   profissional da Clínica B, com compartilhamento ativo endereçado à sua
   disciplina só para um paciente da Clínica A, **não** deve conseguir abrir
   o prontuário desse paciente pela tela "Ver compartilhado" — deve aparecer
   erro, não dado.
2. Se em algum momento alguém reinseriu manualmente uma chave em
   `app_config.encryption_key` para contornar o erro que a versão quebrada
   (20260807) produzia sem ela, apague essa linha depois de confirmar que
   `usa_vault = true`:
   ```sql
   DELETE FROM public.app_config WHERE key = 'encryption_key';
   ```
3. Isso **não** resolve o incidente C2 do relatório (chave de criptografia
   antiga exposta no Git desde o primeiro commit) — é rotação separada,
   já descrita em `docs/runbook-hardening-producao.md`.

## Limite que continua aberto (documentado no topo da própria migration)

Fora da Acupuntura, a redação por escopo é grossa (por seção, não por campo)
porque o vocabulário de campos de Psicologia/Fisioterapia/Nutrição ainda não
tem uma tradução campo→escopo no banco. Ainda é muito melhor que a versão
quebrada (que não redigia nada), mas não separa resumo/anamnese/dores entre si
fora da Acupuntura. Registrar como follow-up quando os anamnese configs
dessas disciplinas estabilizarem.
