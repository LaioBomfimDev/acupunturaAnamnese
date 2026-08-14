# Auditoria de Segurança Defensiva — Reability One (Sistema Acup)

**Data:** 2026-08-11 · **Branch auditada:** `hardening-clinico` · **Metodologia:** análise estática somente-leitura do repositório (código, migrations SQL, Edge Functions, configuração, testes e documentação interna), sem acesso ao banco Supabase nem à infraestrutura de produção. Nenhum arquivo foi alterado. Referências: OWASP ASVS 5.0, OWASP API Security Top 10, princípio do menor privilégio, privacy by design e LGPD (Lei 13.709/2018).

**Regra aplicada:** nenhuma alegação de proteção foi aceita sem evidência direta em código/config/migration/teste. Onde a evidência é só um comentário do desenvolvedor ("isso é seguro"), isso é sinalizado explicitamente e não conta como prova.

**Corroboração cruzada:** os achados críticos abaixo (item 1 do resumo e o vazamento de erro em `complete-first-login`) foram encontrados de forma **independente por duas ou três frentes de investigação diferentes**, e o achado nº 1 foi **verificado pessoalmente**, linha a linha, lendo os dois arquivos de migration envolvidos — não é uma alegação de agente repassada sem checagem.

---

## Resumo executivo

O sistema tem um nível de maturidade de segurança **acima da média** para o estágio do projeto: RLS habilitado em toda tabela sensível, RPCs com allowlist de campos, CORS com allowlist estrita e fail-closed, rate limiting persistente em Postgres, criptografia de prontuário via Supabase Vault, redação de payload para IA, logging sem PII, e um scanner de invariantes de segurança rodando em CI. Isso não é o perfil típico de um sistema inseguro por negligência — é o de um time que já endureceu ativamente várias frentes.

Mas a auditoria encontrou **uma regressão crítica de isolamento entre clínicas** introduzida por uma migration mais recente que sobrescreveu, sem perceber, o hardening de uma migration anterior — e **uma chave de criptografia de prontuário exposta em texto puro no histórico do Git desde o primeiro commit**, com rotação ainda pendente segundo a própria documentação interna da equipe. Ambos são achados que nenhum teste automatizado existente pega, porque a suíte de testes valida o texto de cada migration isoladamente, não o estado final cumulativo do banco.

Do lado de LGPD, o sistema tem uma base de governança de privacidade incomumente bem documentada (RIPD interno, termo do profissional) para o estágio do projeto — mas dois requisitos estruturais continuam em aberto e autodeclarados como pendentes pela própria equipe: consentimento do paciente (titular dos dados de saúde) e de responsável legal por menores, e ausência de mecanismo de portabilidade de dados.

---

## Achados por severidade

### 🔴 CRÍTICO

#### C1 — Regressão de isolamento entre clínicas em `get_shared_session` (BOLA/cross-tenant)

**Cenário real de exploração:** um profissional de Psicologia da Clínica B tem, em algum momento, um compartilhamento ativo endereçado à disciplina "psicologia" (`record_shares.to_discipline = 'psicologia'`) para *algum* paciente de *qualquer* clínica do sistema — por exemplo, um encaminhamento legítimo dentro da própria Clínica B. Esse mesmo profissional pode então chamar `get_shared_session(patient_id)` trocando o `patient_id` por qualquer outro paciente do sistema (IDOR clássico) cuja disciplina de origem também tenha um compartilhamento ativo para "psicologia" — **mesmo que esse paciente pertença à Clínica A, sem qualquer vínculo com o profissional que está consultando**. A função devolve o prontuário completo (`sensitive_data`), sem redação por escopo consentido.

**Evidência técnica:**
- `supabase/migrations/20260723_clinical_data_hardening.sql:1266-1386` define `get_shared_session` com três camadas de proteção: (a) checagem de clínica — `IF v_patient_clinic IS NULL OR v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid) THEN RAISE EXCEPTION 'Acesso negado: compartilhamento restrito à clínica do paciente.'` (linhas 1312-1317); (b) filtro do compartilhamento também por clínica (`s.clinic_id IS NOT DISTINCT FROM v_patient_clinic`, linha 1328); (c) redação por escopo consentido via `filter_shared_session_payload(...)` (linhas 1344-1351); e lê a chave de criptografia via `get_clinical_encryption_key()` (Vault).
- `supabase/migrations/20260807_shared_session_multidisciplina.sql:37-107` executa **depois** (data posterior no diretório de migrations, portanto aplicada por cima na ordem padrão do `supabase db push`): `DROP FUNCTION IF EXISTS public.get_shared_session(UUID);` seguido de uma nova definição que:
  - **não tem** a checagem `v_patient_clinic IS DISTINCT FROM public.user_clinic_id(v_uid)` — a variável `v_patient_clinic` é lida (linha 65) mas nunca comparada contra o profissional chamador;
  - o filtro de `record_shares` (linhas 80-85) verifica só `s.to_discipline = ANY(public.user_disciplines(v_uid))`, **sem** `s.clinic_id`;
  - **não chama** `filter_shared_session_payload` — devolve `sensitive_data` bruto e completo para qualquer disciplina compartilhada, mesmo que o compartilhamento original tenha restringido escopos (`shared_scopes`);
  - lê a chave de criptografia de volta de `public.app_config` em texto puro (linha 60: `SELECT ac.value INTO v_key FROM public.app_config ac WHERE ac.key = 'encryption_key'`), revertendo a migração para o Vault feita em `20260723`.
- Ironicamente, o comentário da própria migration `20260807` (linhas 13-20) reivindica ter *fechado* um vazamento ("um encaminhamento psicologia → fisioterapia não pode expor a sessão de acupuntura do mesmo paciente") — o que é verdade para o filtro por disciplina — mas **não percebe que removeu, no mesmo `CREATE OR REPLACE`, o isolamento por clínica e a redação por escopo** que a migration anterior havia implementado. É uma regressão disfarçada de correção.
- **Ponto que muda a gravidade prática:** a migration `20260723` também executa `DELETE FROM public.app_config WHERE key = 'encryption_key';` (linha 3662-3663) como parte do hardening ("a partir daqui nenhuma RPC clínica atual lê app_config"). Isso significa que, se as migrations foram aplicadas em produção na ordem em que estão versionadas, a função de `20260807` tentaria ler uma linha que **não existe mais** — e falharia com `RAISE EXCEPTION 'Chave de criptografia não configurada em app_config.'` em toda chamada, quebrando a funcionalidade "Ver compartilhado" (indisponibilidade) em vez de vazar dado. **O vazamento efetivo só se manifesta se, em algum momento, alguém reinseriu manualmente uma chave em `app_config.encryption_key`** (cenário plausível, já que a mensagem de erro da própria função sugere exatamente isso como solução, e o projeto tem histórico de aplicar SQL manualmente via editor do Supabase — ver `docs/aplicar-sql-agenda-2026-08-10.md` e arquivos análogos).
- **Por que nenhum teste pega isso:** `frontend/tests/regression/hardening-blockers.test.mjs:36-42,88-96` carrega **somente** o arquivo `20260723_clinical_data_hardening.sql` isoladamente e testa a regex de isolamento de clínica contra esse texto — nunca contra o resultado de `20260807` aplicado por cima. `frontend/tests/regression/record-shares.test.mjs:122-153` testa `20260807` isoladamente, mas só verifica a correção do bug funcional (disciplinas retornando vazio), sem nenhuma asserção sobre clínica ou escopo. A suíte de 59 arquivos de teste passa 100% verde apesar da regressão, porque nenhum teste reconstrói o estado cumulativo do schema.

**Classificação:** NÃO ATENDE (isolamento entre clínicas / IDOR-BOLA — item 1 e item 4 do escopo solicitado).

**Recomendação:**
1. Tratar como incidente: verificar imediatamente no Supabase de produção (a) se `20260807_shared_session_multidisciplina.sql` foi aplicada; (b) o código-fonte atual de `get_shared_session` no banco real (`\sf public.get_shared_session` ou via SQL Editor); (c) se `app_config.encryption_key` existe e tem valor hoje.
2. Escrever uma nova migration que reintroduza as três proteções perdidas (`v_patient_clinic` check, `s.clinic_id` no filtro de `record_shares`, `filter_shared_session_payload`) **em cima** da correção legítima de `20260807` (que devolve as disciplinas certas — isso deve ser preservado).
3. Corrigir o blind spot estrutural de teste: qualquer teste de "hardening" deve validar o **resultado final** de aplicar todas as migrations em ordem (ex.: montando o schema completo num Postgres efêmero e testando comportamento real via RLS/RPC), não regex isolado por arquivo.

**Teste que comprova a correção:** criar dois pacientes em clínicas diferentes (Clínica A e Clínica B), um compartilhamento ativo `to_discipline='psicologia'` só para o paciente da Clínica A, autenticar como um profissional de psicologia da Clínica B, e chamar `get_shared_session(patient_id_da_clinica_A)` — o resultado esperado é exceção `42501` ("compartilhamento restrito à clínica do paciente"), não dados. Repetir verificando que os campos fora de `shared_scopes` não aparecem no retorno mesmo dentro da mesma clínica.

---

#### C2 — Chave de criptografia de prontuário em texto puro, versionada desde o primeiro commit

**Cenário real de exploração:** qualquer pessoa com acesso de leitura ao repositório Git (clone, fork, cache de CI, backup) obtém a string `acup-reability-mtc-2026-seguro`. Se essa mesma pessoa obtiver, por qualquer outra via (dump de banco, backup, vazamento de infraestrutura), o conteúdo da coluna `sensitive_data_encrypted` de `clinical_records`, ela consegue decifrar prontuários completos de pacientes com uma única query `pgp_sym_decrypt`.

**Evidência técnica:**
- `supabase/migrations/20260521_fix_clinical_record_rpc.sql:19-21` (arquivo **ainda presente no working tree hoje**, não removido do histórico nem do HEAD):
  ```sql
  INSERT INTO public.app_config (key, value)
  SELECT 'encryption_key', 'acup-reability-mtc-2026-seguro'
  WHERE NOT EXISTS (...)
  ```
- Confirmado via `git log --diff-filter=A -- supabase/migrations/20260521_fix_clinical_record_rpc.sql` → único commit: `a91982c "Initial Sistema Acup app"` — está no repositório desde o começo.
- O próprio time já identificou isso como incidente aberto: `docs/runbook-hardening-producao.md:18-21` — *"a revisão encontrou chave literal em migration versionada antiga. Considere essa chave comprometida; mover o mesmo valor para o Vault não encerra o incidente nem torna os dados históricos seguros"* — e prescreve (linhas 55-84) um plano de rotação com recriptografia e dupla aprovação, **sem evidência no repositório de que foi executado**.
- `frontend/scripts/check-security-invariants.mjs:58-69` tem uma regra específica para esse padrão, mas só se aplica a migrations com data ≥ `20260723` (`historicalMigrationCutoff`) — deliberadamente não sinaliza este incidente antigo, então o CI fica "verde" apesar do segredo estar exposto.

**Classificação:** NÃO ATENDE (segredos — item 10; proteção de dados/criptografia — item 9).

**Recomendação:** executar o plano de rotação já desenhado no runbook interno (Vault + recriptografia com dupla aprovação) como prioridade máxima; depois, considerar reescrever o histórico do Git ou, no mínimo, documentar formalmente a chave como definitivamente comprometida para fins de auditoria/LGPD (é um incidente de segurança de dado de saúde, potencialmente reportável).

**Teste que comprova a correção:** confirmar que `SELECT * FROM app_config WHERE key='encryption_key'` retorna vazio em produção, que `get_clinical_encryption_key()` só lê do Vault, e que a chave antiga (`acup-reability-mtc-2026-seguro`) não decifra mais nenhum registro após a recriptografia.

---

#### C3 — Ausência de consentimento do paciente e de responsável legal por menores (LGPD, dado de saúde)

**Cenário real:** o sistema processa dado de saúde (categoria sensível, art. 5º/11 LGPD) de pacientes — incluindo, conforme o próprio RIPD interno, público infantojuvenil — sem que o titular (ou seu responsável legal) tenha assinado qualquer termo de consentimento ou aviso de privacidade dentro do produto.

**Evidência técnica:**
- O único termo de aceite versionado é do **profissional**, na tela de login: `frontend/src/components/panels/Login.jsx` (seção 13, conforme relatado) — texto explícito: *"O consentimento desta tela é a ciência do PROFISSIONAL [...] Ele NÃO substitui o consentimento [...] que a clínica/profissional deve apresentar e colher do PACIENTE"*.
- `docs/ripd-sistema-acup.md:154` lista como pendência aberta: *"Consentimento/aviso de privacidade do PACIENTE ao nível da clínica [...] fora do sistema"*.
- `docs/ripd-sistema-acup.md:135-139`: *"Enquanto não houver fluxo formal e documentado de consentimento do responsável [por menores], o risco [...] NÃO deve ser classificado como baixo."*
- Nenhum componente de captura de consentimento do paciente/responsável foi encontrado em `frontend/src`.
- Complementar: `docs/ripd-sistema-acup.md:15,151` — Encarregado (DPO) ainda não formalmente nomeado; e `docs/ripd-sistema-acup.md:17,157` — revisão jurídica do RIPD e do termo segue pendente de validação.

**Classificação:** NÃO ATENDE (LGPD — item 16, subitens base legal/transparência/direitos do titular).

**Recomendação:** priorizar como bloqueador de uso em produção com pacientes reais (ou formalizar explicitamente a base legal de "tutela da saúde" — art. 11, II, "f" — como suficiente, com validação jurídica, já que consentimento não é a única base legal aplicável a dado de saúde tratado por profissional de saúde). Formalizar nomeação de DPO. Concluir revisão jurídica do RIPD.

**Teste que comprova a correção:** existência de um registro auditável (timestamp, versão do termo, identificação do paciente ou responsável) associado a cada cadastro de paciente, com bloqueio de cadastro/atendimento até essa etapa ser concluída — análogo ao gate `must_change_password` já usado para o profissional.

---

### 🟠 ALTO

| # | Achado | Evidência principal | Item do escopo |
|---|---|---|---|
| A1 | Sem fluxo self-service de "esqueci minha senha"; redefinição depende 100% de um SuperAdm disponível, que passa a conhecer a senha temporária do titular | Ausência de `resetPasswordForEmail` no frontend; único caminho é `supabase/functions/super-admin-reset-password/index.ts` | 2 |
| A2 | Nenhuma revogação de sessão após troca/reset de senha — sessões já emitidas continuam válidas até expirar naturalmente | Ausência de `auth.admin.signOut(...)` em `complete-first-login` e `super-admin-reset-password` (grep confirmado em todo `supabase/functions/`) | 2, 3 |
| A3 | MFA existe tecnicamente mas é opt-in por perfil, inclusive para `super_admin` — o papel mais privilegiado do sistema não tem MFA obrigatório | `supabase/migrations/20260723_clinical_data_hardening.sql:96-100` — `mfa_required BOOLEAN NOT NULL DEFAULT FALSE`; `docs/runbook-hardening-producao.md:15-16` confirma "a migration não força MFA e não faz backfill" | 2 |
| A4 | `complete-first-login` vaza `error.message` bruto do Postgres/GoTrue ao cliente — único ponto fora do padrão do resto do backend (achado corroborado por 2 investigações independentes) | `supabase/functions/complete-first-login/index.ts:71,83,98` | 15 |
| A5 | Log administrativo (`admin_audit_logs`) não tem trigger de imutabilidade, ao contrário da trilha clínica (`clinical_record_audit_log`, que recusa `UPDATE`/`DELETE`) | `supabase/migrations/20260523_super_admin_audit_reset.sql:5-24` vs. `20260723_clinical_data_hardening.sql:260-336` | 13 |
| A6 | Nenhum mecanismo de portabilidade de dados do titular — a única exportação existente foi removida por insegurança (sem substituto) | `frontend/tests/regression/clinical-privacy-hardening.test.mjs:35-43`: `assert.match(dashboard, /Exportação clínica em JSON sem criptografia foi desativada/)` | 16 |
| A7 | 3 vulnerabilidades HIGH em dependências npm, 2 sem correção disponível (DoS via parsing de imagem em `image-size`/`@turbodocx/html-to-docx`) | Saída literal de `npm audit --omit=dev` (ver Anexo A) | 12 |
| A8 | Ausência total de Content-Security-Policy em toda a aplicação — nenhuma camada de rede conteria exfiltração via XSS caso ocorra | `frontend/index.html` sem `http-equiv`; sem `vercel.json`/`_headers`; `vite.config.js` sem headers de segurança | 5, 11 |

### 🟡 MÉDIO

| # | Achado | Evidência principal | Item |
|---|---|---|---|
| M1 | Sanitizador de HTML divergente e mais fraco em um dos 5 componentes de relatório — não filtra `javascript:` em `href`/`src` | `frontend/src/components/psychology/PsychologyNeuroReport.jsx:25-34` vs. padrão em `Relatorio.jsx:38-51` | 5 |
| M2 | Possível enumeração de usuários por diferença de tempo de resposta (branch sem chamada de rede extra para identificador inexistente vs. branch que chama `signInWithPassword`) apesar de mensagem de erro idêntica | `supabase/functions/login-with-identifier/index.ts:112-123` | 2 |
| M3 | Senha temporária de primeiro acesso sem expiração/TTL | `supabase/functions/super-admin-create-user/index.ts:203-205` | 2 |
| M4 | Ações administrativas críticas (reset de senha/MFA de terceiro) não exigem reautenticação/step-up do SuperAdm | `security.ts:106-133`, `edgeAccess.ts:45-74` — dependem só da validade do JWT | 2 |
| M5 | Token de sessão em `localStorage` (não cookie `httpOnly`), sem timeout de inatividade implementado no frontend | `frontend/src/lib/supabase.js:45` (config padrão do SDK); grep por idle-timeout sem resultado | 3 |
| M6 | Nenhum SAST/DAST de mercado — só scanner regex customizado de escopo estreito (`check-security-invariants.mjs`) | `.github/workflows/quality.yml` só roda o script próprio + lint/test/build | 17 |
| M7 | Testes de "hardening" validam texto/regex da migration isolada, não o comportamento real do schema cumulativo sob RLS — é exatamente o que permitiu C1 passar despercebido | `frontend/tests/regression/hardening-blockers.test.mjs`, `record-shares.test.mjs` | 17 |
| M8 | Listagens sem paginação obrigatória (`listAppointments`, `listPatients`, `listClinicPatients`) — risco de exaustão de recurso, não de vazamento cross-tenant (RLS cobre isso) | `frontend/src/services/appointmentService.js:129-162` (`from`/`to` opcionais) | 7, 8 |
| M9 | Validação de payload sem cap de bytes antes do `JSON.parse` em várias Edge Functions (só 5 de ~15 usam `readClinicalJsonBody` com limite) | `food-research/index.ts:147`, `library-qa/index.ts:101`, `analyze-tongue/index.ts:163`, outras | 7 |
| M10 | Dependência Deno (`esm.sh/@supabase/supabase-js@2`) pinada só por major version, sem hash/versão exata; sem Dependabot/Renovate configurado | `supabase/functions/_shared/security.ts:1`; ausência de `.github/dependabot.yml` | 12 |
| M11 | Sem versionamento de API nas Edge Functions (`/v1/` ou equivalente) | Nenhuma das 15 functions usa convenção de versão | 7 |

### 🟢 BAIXO

- Validação de formato UUID inconsistente entre endpoints (não explorável — RLS/FK bloqueiam — mas inconsistente); `appointmentService.js` não valida formato de IDs antes de enviar ao Supabase.
- `tongueMediaService.js:32-42` concatena `patientId`/`slot` no path de Storage sem validar UUID explicitamente (mitigado por RLS de bucket e por `slot` vir de valores fixos na UI).
- Duplicação de lógica de sanitização de HTML em 5 arquivos diferentes em vez de uma biblioteca única (DOMPurify) — risco estrutural de nova divergência futura (ver M1).
- Ausência de rotação formal/automatizada de credenciais (processo é manual, documentado só no runbook).
- Regra de senha "vazada/comum" é uma lista estática de 7 fragmentos, não uma verificação real contra corpus de senhas comprometidas (ASVS V6.2.4/6.2.5).

---

## Matriz completa por item do escopo solicitado

Legenda: ✅ ATENDE · 🟡 ATENDE PARCIALMENTE · ❌ NÃO ATENDE · ⬜ NÃO FOI POSSÍVEL VERIFICAR

### 1. Controle de acesso
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| RBAC e hierarquia de cargos | ✅ | `profiles_role_check` (`20260723...sql:90-93`); `is_super_admin`/`is_clinic_admin`/`can_access_clinical_data`/`is_knowledge_reviewer` como funções `SECURITY DEFINER` |
| Autorização no servidor, não só na UI | ✅ | Escrita em `clinical_records` revogada de `authenticated` (`20260723...sql:1408-1409`); toda escrita via RPC com revalidação de posse |
| IDOR/BOLA, troca de IDs | ❌ | **C1** — `get_shared_session` (ver acima) |
| Isolamento entre clínicas | 🟡 | Padrão dominante sólido (patients/appointments/record_shares na criação); quebrado na leitura via `get_shared_session` (C1) |
| Acesso negado por padrão | 🟡 | Toda tabela sensível nasce com RLS no mesmo arquivo que a cria; sem lint automatizado que garanta isso continuamente |
| Menor privilégio | ✅ | Sem `GRANT ... TO anon` em tabela sensível; `search_path` fixado em toda `SECURITY DEFINER` desde `20260702`/`20260708` |

### 2. Autenticação e recuperação de conta
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Política de senha | 🟡 | `validateStrongPassword` (`security.ts:155-177`), servidor-side, mas checagem de senha vazada é lista estática de 7 termos |
| Primeiro acesso | 🟡 | Gate `must_change_password` sólido (M3: sem TTL da senha temporária) |
| Redefinição de senha | ❌ | A1 — sem self-service, só administrativo |
| Enumeração de usuários | 🟡 | Mensagem genérica confirmada (M2: possível timing side-channel) |
| Força bruta | ✅ | Rate limit persistente em Postgres, fail-closed (`20260723...sql:3208-3335`) |
| Confirmação de senha em ações críticas | ❌ | M4 — reset de senha/MFA de terceiro não exige step-up |
| Revogação de sessão após troca de senha | ❌ | A2 |

### 3. Gerenciamento de sessões
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Armazenamento/renovação de token | 🟡 | `localStorage` via SDK padrão (M5), não cookie `httpOnly` |
| Logout local e global | ✅ | `supabase.auth.signOut()` usa `scope: 'global'` por padrão do SDK |
| Expiração por inatividade | ❌ | Nenhuma implementação encontrada |
| Sessões simultâneas | ⬜ | Sem gestão/listagem para o usuário; comportamento herdado do Supabase Auth hospedado (config não versionada) |
| Dispositivos novos | ❌ | Nenhum controle encontrado |
| Replay/fixação/roubo de sessão | 🟡 | Bearer token mitiga CSRF clássico; sem CSP/cookie httpOnly, XSS ainda rouba sessão inteira |

### 4. Injection
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| SQL/NoSQL/command injection | ✅ | Zero `EXECUTE format`/concatenação dinâmica em todas as migrations; `child_process` só em scripts locais de curadoria |
| Queries parametrizadas | ✅ | supabase-js/PostgREST + parâmetros tipados em toda RPC |
| RPCs e procedures | ✅ | `search_path` fixo, `REVOKE` de `anon`, allowlist de parâmetros |
| Filtros/ordenação/IDs do cliente | 🟡 | Sem coluna dinâmica vinda do cliente; validação de formato UUID inconsistente (baixo risco) |
| Path traversal / nomes de arquivo | ✅ | `isSafeAssetPath`/`isValidPhotoPath` com allowlist + bloqueio de `..`/`/` dupla camada |

### 5. XSS e conteúdo não confiável
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| XSS armazenado/refletido/DOM | 🟡 | M1 — 1 de 5 sanitizadores custom incompleto |
| innerHTML / dangerouslySetInnerHTML | 🟡 | Sempre sobre conteúdo pré-sanitizado/escapado, exceto o gap do M1 |
| Sanitização contextual | ❌ | Sem biblioteca dedicada (DOMPurify); lógica duplicada 5x |
| PDF/CSV/HTML | ✅ (DOCX) / N/A (CSV) | `escapeXmlText` no DOCX; exportação CSV de dado de paciente não existe hoje |
| CSP | ❌ | A8 |

### 6. CSRF, CORS e origens
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Auth por cookie ou bearer | ✅ (bearer) | `security.ts:106-108` — sempre `Authorization` header, nunca cookie |
| Validação de Origin | ✅ | `corsPolicy.ts` — match exato contra allowlist, exige HTTPS |
| Allowlist de CORS | ✅ | Config via env var, fail-closed, sem wildcard; guard de CI (`check-security-invariants.mjs:45-50`) |
| Requisição sem Origin | ✅ | Tratada como servidor-a-servidor, sem header CORS emitido; auth Bearer continua obrigatória |
| Métodos/headers permitidos | ✅ | Só `POST, OPTIONS` e headers mínimos necessários |

### 7. APIs
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Exposição excessiva de dados | 🟡 | C1 é o caso extremo; fora dele, payloads são compactos e allowlisted |
| Endpoints públicos | ✅ | `login-with-identifier` é a única function com `verify_jwt=false`, com rate limit + validação própria |
| Autorização por função e objeto | 🟡 | Sólida exceto C1 |
| Mass assignment | ✅ | Allowlist explícita em toda RPC/Edge Function de escrita; policy vulnerável de 2026-05 já revogada em 2026-05-22 |
| Validação de payload | 🟡 | M9 — cap de bytes inconsistente entre functions |
| Limite de tamanho | 🟡 | Idem M9 |
| Paginação | 🟡 | M8 |
| Mensagens de erro | 🟡 | A4 é a única exceção ao padrão genérico |
| Versionamento | ❌ | M11 |

### 8. Rate limiting e abuso
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Limites por IP/usuário/conta/endpoint | ✅ | `edge_rate_limits` + `consume_edge_rate_limit`, por bucket e sujeito |
| Login e recuperação de senha | ✅ | Duplo bucket em `login-with-identifier`; aplicado em `complete-first-login`, `super-admin-reset-password/mfa` |
| Criação de registros | 🟡 | Coberto nas functions de IA/administrativas; não confirmado em todo insert direto via RPC (ex.: `insert_clinical_record` não tem rate limit próprio, depende de auth) |
| Exportações e relatórios | ⬜ | Não há exportação em massa hoje (removida — ver A6); nada a limitar |
| Bloqueios temporários | ✅ | Fail-closed (503) em vez de fail-open quando o rate limiter falha |
| Proteção contra automação/DoS | 🟡 | Rate limit cobre Edge Functions; listagens sem paginação (M8) são vetor de esgotamento não coberto |

### 9. Proteção de dados
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Criptografia em trânsito | ⬜ | HTTPS/HSTS dependem da plataforma (Vercel/Supabase), não verificável só por código |
| Criptografia em repouso (prontuário) | 🟡 | Vault implementado corretamente no código atual; C2 compromete a chave histórica |
| Dados no navegador | 🟡 | Token de sessão em `localStorage` (M5); sem outro dado sensível persistido localmente identificado |
| URLs assinadas | ✅ | Bucket de fontes protegidas usa signed URL de 5 min via Edge Function com gate SuperAdm |
| Logs com dado pessoal | ✅ | `observability.ts` — allowlist estrita, nunca payload/PII |
| Minimização/mascaramento | ✅ | `anonymize.js` mascara PII antes de enviar a IA (mitigação declarada como não infalível) |
| Retenção e descarte | ❌ | A6 + M — sem rotina de expurgo automática; exclusão é só arquivamento manual |

### 10. Segredos
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Chaves administrativas no frontend | ✅ | Só anon key; validação em runtime rejeita `service_role`/`sb_secret_` (`supabaseConfig.js`) |
| Arquivos .env versionados | ✅ | Nenhum `.env` real no histórico (confirmado via `git log --all --full-history`) |
| Tokens em logs | ✅ | Allowlist estrita em `observability.ts`; guard de CI (`secret-console-log`) |
| Rotação de credenciais | ❌ | Processo manual, chave clínica comprometida (C2) ainda não rotacionada |
| Secret scanning | 🟡 | Scanner custom roda em CI, mas escopo estreito (não é gitleaks/trufflehog genérico) |
| Privilégios de contas de serviço | ✅ | `service_role` só lida via `Deno.env` em `_shared/security.ts`, nunca no frontend |

### 11. Configuração e infraestrutura
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| CSP, HSTS e demais headers | ❌ (CSP) / ⬜ (HSTS) | Sem CSP em código/hosting; HSTS depende da Vercel (não verificável estaticamente) |
| HTTPS | ✅ (aplicação) / ⬜ (infra) | CORS exige HTTPS em produção; certificado/redirect é responsabilidade da plataforma |
| Modo debug | ✅ | Sem sourcemap em build de produção; sem flag de debug |
| Mensagens internas expostas | 🟡 | A4 é a exceção conhecida |
| Buckets públicos | ✅ | 1 público intencional (Atlas educacional); 2 privados corretos (fontes protegidas, fotos de língua) |
| Políticas RLS | ✅ (majoritário) | Ver seção 1; exceção documentada em C1 |
| WAF | ⬜ | Não verificável sem acesso à infraestrutura viva |
| Ambientes dev/produção | ✅ | Fallback de auth local gated por `import.meta.env.DEV` + flag explícita; guard de CI para não vazar para produção |

### 12. Dependências e cadeia de suprimentos
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| npm audit | 🟡 | 3 HIGH, 1 com fix disponível, 2 sem fix (DoS) — ver Anexo A |
| Pacotes abandonados | ⬜ | Não avaliado sistematicamente nesta auditoria |
| Lockfile | ✅ | `frontend/package-lock.json` versionado, usado com `npm ci` no CI |
| Integridade do build | 🟡 | Build reprodutível via lockfile; dependências Deno via `esm.sh` só com major pinada, sem hash |
| Atualizações automatizadas | ❌ | Sem Dependabot/Renovate |
| Dependências comprometidas | ⬜ | Nenhuma indicação encontrada, mas sem scanner de supply-chain (SBOM/OSV) rodando |

### 13. Logs, auditoria e monitoramento
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Login/logout/troca de senha | ✅ | `writeAuditLog` chamado nesses eventos (`_shared/audit.ts`) |
| Ações administrativas | ✅ | `admin_audit_logs` registra criação/suspensão/reset |
| Logs imutáveis | 🟡 | Trilha clínica imutável por trigger; trilha administrativa **não** (A5) |
| Alertas de comportamento suspeito | ⬜ | Só procedimento manual documentado no runbook; sem pipeline de alerta em código |
| Proteção contra alteração/exclusão | 🟡 | Idem "logs imutáveis" |
| Ausência de senha/token nos logs | ✅ | Allowlist estrita + guard de CI |

### 14. Regras de negócio
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Ações fora de ordem | ✅ | `patient_deletion_requests` com trigger de transição de estado restrita |
| Repetição de solicitações (idempotência) | ✅ | `clinical_record_write_receipts` + `idempotency_key` |
| Concorrência | ✅ (prontuário) / 🟡 (agenda de jornada) | CAS real em `upsert_versioned_clinical_record`; `agendaScheduleService.js` sem trava de versão |
| Dupla aprovação | 🟡 | Exigida só operacionalmente (runbook) para casos como recuperação de MFA de SuperAdm, não em código |
| Alteração de cargo | ✅ | Não é possível via nenhuma rota automatizada hoje (confirmado por grep) |
| Escalada horizontal/vertical | ✅ (hoje) | Vulnerabilidade histórica de 2026-05-19 já corrigida em 2026-05-22 (ver Anexo B) |

### 15. Tratamento de erros
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Falha segura | ✅ (majoritário) | Rate limiter e CORS fail-closed |
| Transações parciais | ✅ | Compensação explícita em `super-admin-create-user` (cleanup de usuário órfão) |
| Rollback | 🟡 | Confirmado só na amostra revisada (5-6 de 15 functions) |
| Indisponibilidade de serviços | ✅ | 503 explícito quando rate limiter/CORS falham |
| Exceções que liberem acesso indevido | ❌ | C1 é, na prática, um caso disso (embora via lógica de negócio, não exception handling) |

### 16. LGPD e privacidade
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Finalidade e necessidade | ✅ | Declarada no RIPD |
| Base legal | 🟡 | Declarada para o profissional; não comunicada/consentida pelo paciente (C3) |
| Transparência | 🟡 | RIPD e termo do profissional são incomumente detalhados; falta a ponta do paciente |
| Direitos do titular | ❌ | Sem portabilidade (A6); eliminação só parcial (arquivamento manual) |
| Retenção | ❌ | Sem rotina automática |
| Resposta a incidentes | 🟡 | Runbook interno existe e já tratou 1 incidente real (C2), mas ainda não concluído |
| Dados de saúde | 🟡 | Tecnicamente bem protegidos (Vault, RLS, minimização); consentimento do titular ausente |
| Operadores/subprocessadores | ✅ | Google Vertex AI documentado como operador no RIPD e no termo |

### 17. Testes ofensivos
| Subitem | Veredito | Evidência-chave |
|---|---|---|
| Testes automatizados de autorização | 🟡 | Existem, mas validam texto/regex de migration isolada, não comportamento sob RLS real (M7 — é a causa raiz de C1 não ter sido pego) |
| Fuzzing | ❌ | Nenhum encontrado |
| SAST | 🟡 | Só scanner regex próprio (M6), não SAST de mercado |
| DAST | ❌ | Nenhum (sem ZAP/equivalente) |
| Testes manuais de IDOR/XSS/injection/broken auth | 🟡 | Checklist manual no runbook, sem evidência de execução formalizada/registrada |

---

## Riscos que permaneceram sem verificação

1. **Estado real do banco de produção** — toda esta auditoria é estática. Não é possível confirmar quais migrations estão de fato aplicadas no Supabase de produção, nem o conteúdo atual de `app_config.encryption_key` (crítico para saber se C1 hoje causa vazamento de dado ou apenas indisponibilidade da função).
2. **Se a chave de criptografia comprometida (C2) ainda está em uso ativo** ou já foi rotacionada fora do controle de versão.
3. **HSTS e cabeçalhos de transporte reais** entregues pela Vercel/Supabase em produção — comportamento de plataforma, não auditável por código.
4. **Existência de WAF** ou proteção de borda equivalente.
5. **Política de senha nativa e configuração de expiração/refresh de sessão do Supabase Auth hospedado** — `supabase/config.toml` não versiona uma seção `[auth]`; essa configuração vive só no painel do Supabase.
6. **Alertas de segurança realmente configurados e testados** (o runbook lista o que deveria alertar, mas não há evidência de pipeline de alerta ativo).
7. **Se testes manuais de "smoke test ofensivo" descritos no runbook são de fato executados a cada deploy**, e se ficam registrados.
8. **Higiene de dependências transitivas além do que `npm audit` cobre** (pacotes abandonados, integridade de publishers) e integridade dos pacotes Deno servidos via `esm.sh` (sem SRI/hash).

---

## Anexo A — saída literal de `npm audit --omit=dev` (frontend)

```
# npm audit report

image-size  *
Severity: high
image-size: ICNS parser allows denial of service through an infinite loop - https://github.com/advisories/GHSA-w3rx-r6r6-pgpr
image-size: JXL and HEIF parsers allow denial of service through infinite loops - https://github.com/advisories/GHSA-5p2g-fcmc-qvqq
No fix available
node_modules/image-size
  @turbodocx/html-to-docx  *
  Depends on vulnerable versions of image-size
  node_modules/@turbodocx/html-to-docx

nanoid  <=3.3.16
Severity: high
nanoid: non-secure generators can loop indefinitely with negative size - https://github.com/advisories/GHSA-28wg-ghj8-5hjv
nanoid: custom generators can loop indefinitely when size is zero - https://github.com/advisories/GHSA-2v37-7h3g-55p8
fix available via `npm audit fix`
node_modules/nanoid

3 high severity vulnerabilities
```

## Anexo B — vulnerabilidade histórica de escalada de privilégio (já corrigida, registrada para rastreabilidade)

`supabase/migrations/20260519_initial_schema.sql:22-25` criava uma policy `UPDATE` em `profiles` sem `WITH CHECK` por coluna, o que teria permitido a qualquer terapeuta autenticado fazer `update({role:'super_admin'})` na própria linha. Corrigida em `supabase/migrations/20260522_super_admin_security.sql:174-185`, que derruba a policy e revoga `INSERT/UPDATE/DELETE` de `authenticated`/`anon` na tabela. Confirmado que nenhuma migration posterior reabre esse acesso.

---

*Relatório gerado por auditoria estática assistida. Não substitui pentest ativo, revisão jurídica formal do RIPD, nem confirmação em ambiente de produção — ver seção "Riscos que permaneceram sem verificação".*
