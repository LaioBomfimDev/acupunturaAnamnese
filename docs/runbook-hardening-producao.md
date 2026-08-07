# Runbook — hardening clínico em produção

Este documento operacionaliza a migration
`supabase/migrations/20260723_clinical_data_hardening.sql` e as Edge Functions
associadas. Ele não autoriza publicação automática, rotação de chave nem
eliminação de prontuário. Execute primeiro em homologação e mantenha aprovação
humana em cada gate.

## Decisões que precisam de aprovação

- **RPO proposto:** até 15 minutos, condicionado a PITR habilitado e testado.
- **RTO proposto:** até 4 horas, condicionado a restauração ensaiada.
- **Retenção e eliminação:** pendente de decisão jurídica/privacidade. O sistema
  apenas abre uma solicitação e arquiva o cadastro; não apaga dados.
- **MFA:** ativação canário por perfil. A migration não força MFA e não faz
  backfill, evitando bloqueio coletivo.
- **Rotação criptográfica:** operação separada, com recriptografia validada. A
  migration apenas muda a leitura para o Vault.
- **Incidente de segredo:** a revisão encontrou chave literal em migration
  versionada antiga. Considere essa chave comprometida; mover o mesmo valor para
  o Vault não encerra o incidente nem torna os dados históricos seguros.

Se RPO, RTO, retenção ou recuperação não estiverem aprovados, pare antes da
implantação em produção.

## 1. Pré-implantação

1. Confirme projeto, organização, ambiente e responsável pela janela.
2. Confirme backup recente, PITR e acesso de recuperação por duas pessoas.
3. Restaure o backup em um projeto isolado e valide:
   - autenticação;
   - leitura de uma ficha clínica autorizada;
   - escrita e releitura de uma ficha de teste;
   - políticas RLS para terapeuta, administrador, revisor e usuário suspenso.
4. Registre horário, backup usado, duração da restauração e resultado. Compare
   com o RPO/RTO aprovado.
5. Rode localmente:

```bash
cd frontend
npm ci
npm run quality
```

6. Faça o dry-run da curadoria:

```bash
cd frontend
npm run knowledge:sync-approved
```

Zero itens elegíveis é um resultado seguro: significa que nenhum item local
possui atestado profissional rastreável para produção.

## 2. Vault e compatibilidade da chave

No Supabase Vault do projeto correto, crie o segredo
`clinical_records_encryption_key`. Se existem fichas, o valor precisa ser
exatamente a chave que já as criptografou.

- Não cole o valor em migration, issue, documentação, log, frontend ou comando
  persistido no histórico.
- Use o gerenciador seguro do provedor e acesso temporário.
- Não remova a chave antiga antes de validar a recriptografia.

A migration executa um preflight antes de qualquer DDL. Ela aborta se o Vault
estiver indisponível, o segredo estiver vazio ou uma amostra existente não puder
ser descriptografada.

Como houve exposição no histórico versionado, a implantação não deve ser
considerada concluída enquanto a rotação abaixo não tiver aprovação e execução
por duas pessoas:

1. trate o achado como incidente de segurança e levante todos os ambientes,
   backups e registros criptografados que usaram a chave antiga;
2. mantenha a chave antiga no Vault apenas durante a janela controlada de
   compatibilidade, sem copiá-la para terminal persistente, documentação ou CI;
3. restaure uma cópia isolada, recriptografe com chave aleatória nova e compare
   quantidade, legibilidade autorizada e integridade antes/depois;
4. repita em produção com backup/PITR verificados, transação ou estratégia
   reversível aprovada e telemetria sem payload;
5. troque o segredo do Vault, confirme leitura e escrita com a chave nova e só
   então revogue a antiga;
6. avalie a remoção do segredo do histórico Git e de caches/clones em operação
   coordenada. Reescrever o histórico, isoladamente, não substitui a rotação.

## 3. Ordem de implantação em homologação

1. Aplique `20260723_clinical_data_hardening.sql`.
2. Valide que o schema e os RPCs existem, sem ler payload clínico:

```sql
select to_regprocedure(
  'public.upsert_versioned_clinical_record(uuid,text,text,bigint,uuid,text)'
) is not null as gravacao_versionada_disponivel;

select to_regprocedure(
  'public.consume_edge_rate_limit(uuid,text,integer,integer)'
) is not null as rate_limit_disponivel;

select count(*) as solicitacoes_exclusao_pendentes
from public.patient_deletion_requests
where status = 'pending';

select count(*) as eventos_outbox_pendentes
from public.knowledge_outbox
where processed_at is null;
```

3. Configure os secrets/variáveis das Edge Functions:
   - `SUPABASE_URL`;
   - `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEYS`;
   - `SUPABASE_ANON_KEY` ou `SUPABASE_PUBLISHABLE_KEYS`;
   - `CORS_ALLOWED_ORIGINS`, com origens HTTPS exatas separadas por vírgula;
   - `GCP_SERVICE_ACCOUNT_JSON`;
   - `GCP_LOCATION=southamerica-east1`;
   - opcionalmente `GCP_ALLOWED_LOCATIONS`, sem ampliar residência sem aprovação;
   - `EDGE_RATE_LIMIT_WINDOW_SECONDS` e
     `EDGE_RATE_LIMIT_MAX_REQUESTS`, se os padrões de 60 segundos/20 chamadas
     precisarem ser alterados;
   - overrides por função no formato
     `EDGE_RATE_LIMIT_<FUNCAO>_WINDOW_SECONDS` e
     `EDGE_RATE_LIMIT_<FUNCAO>_MAX_REQUESTS`;
   - timeouts opcionais `GCP_TOKEN_TIMEOUT_MS`,
     `GCP_TOKEN_MAX_ATTEMPTS`, `VERTEX_REQUEST_TIMEOUT_MS`,
     e `VERTEX_RETRY_BASE_MS`. A geração Vertex usa uma única tentativa; não há
     override de tentativas para esse POST não idempotente.
4. Em produção, mantenha `CORS_ALLOW_DEFAULT_LOCAL_ORIGINS` ausente ou `false`.
5. Publique as Edge Functions e execute smoke tests autenticados para:
   - `login-with-identifier` e troca de senha temporária;
   - `create-record-share`, incluindo senha incorreta, outra clínica e replay
     idempotente;
   - `super-admin-reset-mfa`, incluindo bloqueio de auto-reset e de outro
     SuperAdm;
   - uma chamada clínica autorizada;
   - bloqueio de usuário suspenso;
   - resposta `429` com `Retry-After`;
   - falha fechada quando o RPC de rate limit estiver indisponível;
   - Vertex na região configurada, sem payload clínico nos logs.
6. Publique o frontend somente depois dos RPCs e funções.
7. Teste duas abas editando a mesma ficha: uma atualização deve vencer e a
   outra receber conflito de revisão, sem sobrescrever silenciosamente.
8. Valide compartilhamento por disciplina com um registro de teste. O servidor
   deve retornar apenas os escopos concedidos.

## 4. Ativação de MFA

1. Publique e teste a tela de cadastro/desafio TOTP.
2. Cadastre um fator em uma conta canário sem dados clínicos reais.
3. Confirme que a sessão alcança `aal2` e que há procedimento de recuperação.
4. Em operação separada e auditada, ative somente o perfil canário:

```sql
update public.profiles
set mfa_required = true
where id = '<uuid-canario>';
```

5. Teste login, recuperação, acesso autorizado e bloqueio em `aal1`.
6. Expanda gradualmente para administradores. Não faça atualização em massa
   antes de medir bloqueios e concluir o suporte de recuperação.

Para reversão emergencial do canário, uma pessoa autorizada pode definir
`mfa_required = false` somente para o perfil afetado, registrando motivo e
aprovação.

## 5. Curadoria e RAG

- Produção consulta apenas versões atuais e aprovadas no servidor.
- Contexto enviado pelo navegador é ignorado pela Edge Function `library-qa`.
- Proposta administrativa não equivale a aprovação profissional.
- O outbox é durável, mas não possui executor automático nesta entrega. Monitore
  `knowledge_outbox` e só marque eventos após processamento idempotente e
  auditado.

Para importar itens locais após revisão profissional:

1. Registre no payload `approvalMode=server_professional`,
   `requiresProfessionalAudit=false` e o bloco `professionalReview`.
2. Revise o dry-run.
3. Use `--apply` apenas em terminal efêmero com `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY` e
   `CONFIRM_KNOWLEDGE_IMPORT=IMPORTAR_APROVADOS`.
4. Remova as variáveis do processo ao concluir e confira falhas por código, sem
   expor conteúdo protegido.

## 6. Observabilidade

Monitore por `correlationId`, código operacional e status, nunca por payload,
nome, foto, texto clínico, token ou stack completa. Alertas mínimos:

- aumento de `edge_rate_limit_failed`;
- `vertex_upstream_failed` ou repetição de `vertex_upstream_retry`;
- falha de auditoria;
- conflitos de revisão acima da linha de base;
- erros de autenticação/MFA;
- crescimento de `knowledge_outbox` sem processamento;
- solicitações de exclusão pendentes fora do SLA jurídico aprovado.

O frontend aceita um endpoint HTTPS opcional em
`VITE_ERROR_REPORTING_ENDPOINT`; o evento já é reduzido a metadados
allowlisted. Configure `VITE_APP_RELEASE` para correlacionar regressões.

## 7. Produção e rollback

Repita a mesma ordem de homologação: backup/restauração verificada, Vault,
migration, Edge Functions, smoke tests, frontend e só depois MFA canário.

Se houver falha:

1. interrompa a expansão e preserve logs/auditoria;
2. reverta frontend e Edge Functions para a versão anterior;
3. não execute um `down` improvisado nem restaure chave em `app_config`;
4. como a migration é aditiva, prefira migration corretiva;
5. restaure o backup somente quando a equipe declarar perda de integridade e
   aceitar o RPO medido;
6. valide leitura e escrita antes de reabrir o acesso.

## 8. Itens deliberadamente não automáticos

- aplicação da migration em ambiente remoto;
- provisionamento ou rotação de secrets;
- ativação massiva de MFA;
- publicação de conhecimento sem gate profissional;
- execução de solicitações de exclusão;
- descarte de prontuários, fotos, auditoria ou backups;
- deploy e rollback de produção.

Esses limites preservam o gate humano, a privacidade clínica e a capacidade de
recuperação.
