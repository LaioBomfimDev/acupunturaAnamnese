# Dossiê técnico para due diligence — Reability One / Sistema Acup

**Data-base:** 03/09/2026  
**Classificação:** confidencial — contém avaliação de arquitetura, segurança e riscos operacionais  
**Escopo:** código-fonte local, branch `main`, alterações locais em andamento, migrations, Edge Functions, documentação interna, quality gate, dependências npm e probes não autenticados no Supabase configurado em `frontend/.env.local`  
**Confiança da avaliação:** média (80%). O código e os endpoints públicos foram verificados; banco autenticado, Vercel, backups, métricas, contratos e controles organizacionais não foram auditados diretamente.

## 1. Parecer executivo

O Reability One é um **produto clínico funcional em estágio de beta avançado/piloto controlado**, com uma base técnica mais madura do que a média de projetos do mesmo porte. Há arquitetura multi-instituição, prontuário multidisciplinar, agenda, relatórios, curadoria de conhecimento, integrações de IA com gate humano, autenticação endurecida, RLS, criptografia de conteúdo clínico, auditoria e um quality gate automatizado relevante.

O parecer técnico é **favorável com condições precedentes**. O ativo tecnológico é real e tem valor; não há evidência de que seja apenas uma demonstração. Entretanto, ainda não é prudente classificá-lo como pronto para escala clínica ampla ou para uma due diligence sem ressalvas. Os principais bloqueadores são operacionais e de governança:

1. o ambiente Supabase verificado contém funções e objetos correspondentes a arquivos ainda não versionados na `main`, criando divergência entre produção/configuração remota e fonte de verdade Git;
2. não há evidência de rotação concluída da chave histórica de criptografia já tratada como comprometida pela auditoria interna;
3. não há evidência de teste de restauração, RPO/RTO medidos, SLO de disponibilidade, monitoramento operacional ativo ou plano de continuidade exercitado;
4. permanecem pendências LGPD relevantes: DPO formal, retenção/eliminação, aviso ao paciente, menores, portabilidade e contratos de operadores;
5. a entrega local de 03/09 introduz fluxos clínicos e públicos importantes sem testes de regressão dedicados;
6. o índice público do Atlas esperado pelo próprio healthcheck não foi encontrado no Storage do ambiente configurado.

**Conclusão para investidor/comprador:** tecnologia investível, desde que a transação ou expansão comercial condicione o fechamento técnico a um plano curto de estabilização, evidências operacionais e saneamento de privacidade. Sem essas condições, o risco não está no conceito do produto, mas na operação, reprodutibilidade e responsabilização sobre dados sensíveis.

## 2. Fotografia do sistema em 03/09/2026

### 2.1 Estado do repositório

| Evidência | Resultado verificado | Leitura de due diligence |
|---|---:|---|
| Branch local e remota | `main` em `6897cf9`; remoto consultado e igual | baseline remoto sincronizado |
| Alterações locais | 31 arquivos modificados + 26 não rastreados | entrega relevante ainda fora da fonte de verdade remota |
| Volume da alteração rastreada | +1.872 / -348 linhas | mudança grande para uma única janela de estabilização |
| Novos arquivos não rastreados | cerca de 3.358 linhas de texto | inclui schema clínico, páginas públicas e serviços |
| Histórico | 62 commits, sem tags, 1 contribuidor identificado pelo Git | baixo bus factor e releases pouco formalizados |
| Arquivos rastreados | 651 | produto de porte material |
| Código principal | ~81 mil linhas em JS/JSX/TS/SQL | base substancial; inclui código gerado e conhecimento curado |
| Licença no repositório | não encontrada | esclarecer titularidade, licenças de conteúdo e uso de terceiros |

O histórico Git foi criado/consolidado em 28/08/2026, embora os artefatos internos registrem trabalho anterior. Para auditoria, isso reduz a capacidade de reconstruir a cronologia original de decisões, incidentes e autoria.

### 2.2 Quality gate executado nesta avaliação

Em 03/09/2026 foi executado `npm run quality` no estado local atual:

- invariantes de segurança: aprovadas;
- ESLint: aprovado;
- testes: **576 aprovados, 0 falhas, 0 ignorados**;
- build Vite de produção: aprovado;
- budget de bundle: aprovado;
- `git diff --check`: aprovado.

O resultado é forte, mas precisa ser interpretado corretamente: a maior parte da suíte é composta por testes de unidade, contratos estáticos e regressões por inspeção de código/migration. Não foi encontrada suíte E2E de navegador, teste integrado com PostgreSQL/Supabase real, teste de restore, teste de carga ou teste comportamental completo de RLS aplicando todas as migrations em um banco efêmero.

### 2.3 Dependências e cadeia de suprimentos

O `npm audit` completo e o `npm audit --omit=dev` encontraram:

- 0 vulnerabilidades críticas;
- 0 altas;
- 1 moderada transitiva em `@xmldom/xmldom@0.8.13`, via `mammoth@1.12.0`;
- correção indicada como disponível pelo npm.

É uma melhora material sobre a auditoria de 11/08, que registrava três vulnerabilidades altas. Ainda faltam automação de atualização de dependências, SBOM e scanner SAST/DAST de mercado.

### 2.4 Estado remoto observado

Foram feitos probes sem sessão e sem leitura de dados de pacientes no Supabase apontado pelo `.env.local`:

| Superfície | Resultado | Interpretação |
|---|---|---|
| Supabase Auth | HTTP 200 | serviço de autenticação disponível |
| RPC `admin_deploy_health_check` | negou acesso a anônimo | RPC existe e aplica gate de SuperAdm |
| RPC `list_patient_evolutions` | permissão negada a anônimo | objeto recente existe e não está público |
| view `patients_awaiting_return` | permissão negada a anônimo | objeto recente existe e não está público |
| tabela `satisfaction_surveys` | permissão negada a anônimo | tabela existe e não está pública |
| Edge `satisfaction-survey` | resposta genérica esperada para token inválido | função implantada |
| Edge `confirm-appointment` | resposta genérica esperada para token inválido | função implantada |
| Edge `log-logout` | resposta segura sem sessão | função implantada |
| `atlas-ednea/source-index.json` no bucket público | objeto não encontrado | healthcheck do Atlas deve ficar bloqueado |

Esses resultados comprovam disponibilidade parcial, não saúde completa. O painel interno de saúde exige SuperAdm; não foi executado autenticado. Também não houve acesso ao projeto Vercel, portanto o frontend público, seus headers e a versão efetivamente servida não foram comprovados.

## 3. Produto e capacidades atuais

### 3.1 Capacidades consolidadas no código

- autenticação por e-mail/identificador, primeiro acesso, troca obrigatória de senha e MFA TOTP configurável;
- perfis SuperAdm, administração de instituição, profissional e revisão de conhecimento;
- quatro disciplinas: Acupuntura, Fisioterapia, Psicologia e Nutrição;
- prontuário por paciente, anamnese, evolução, relatório e compartilhamento multidisciplinar;
- agenda por profissional, jornada, intervalos, bloqueios, feriados, recorrência, check-in, confirmação e fila de recepção;
- trilha clínica de Acupuntura com língua, pulso, raciocínio, diagnóstico assistido, protocolo, mapas e Biblioteca Viva;
- Psicologia e avaliação neuropsicológica com vocabulário próprio, triagem de risco e relatórios revisáveis;
- anamnese/evolução/relatório genéricos para Fisioterapia e Nutrição;
- geração e conversão local de documentos `.docx`;
- curadoria de pontos, fontes, alimentos, ervas, instruções e correções de IA;
- IA sob demanda via Edge Functions/Vertex, com anonimização, limites de payload e revisão profissional obrigatória;
- healthcheck administrativo de schema, Storage, funções e chamadas reais de IA.

### 3.2 Entrega local em estabilização

O working tree acrescenta ou amplia:

- evolução vinculada ao agendamento, com data clínica travada no servidor;
- pendências de evolução e de confirmação;
- pesquisa pública de satisfação;
- confirmação de agendamento por link;
- relatório de gestão;
- retornos pendentes;
- CPF e consentimento de imagem no cadastro;
- log de login/logout por instituição;
- editor de feriados e novos fluxos da agenda.

Parte dessa entrega já aparece implantada no Supabase configurado, embora os arquivos continuem fora da `main`. Isso deve ser tratado como **configuração drift**, não como simples trabalho local.

## 4. Arquitetura técnica

### 4.1 Visão lógica

| Camada | Tecnologia | Responsabilidade |
|---|---|---|
| Cliente | React 19 + Vite 8 | aplicação clínica, painéis, formulários e documentos |
| Persistência/API | Supabase Postgres + PostgREST/RPC | dados, RLS, regras transacionais e criptografia |
| Backend serverless | Supabase Edge Functions / Deno | operações privilegiadas, autenticação especial, links públicos e IA |
| IA | Google Vertex AI | geração assistiva sob demanda |
| Arquivos | Supabase Storage | fotos clínicas privadas, PDFs/fontes protegidas e Atlas público separado |
| Frontend hosting | Vercel, conforme documentação | build estático, rotas públicas e headers de segurança |
| CI | GitHub Actions | segurança, lint, regressão, build e budget de bundle |

### 4.2 Características arquiteturais positivas

- autorização crítica concentrada no banco/RPC e nas Edge Functions, não apenas na interface;
- RLS e isolamento por instituição nos domínios sensíveis;
- conteúdo clínico principal cifrado com chave no Vault;
- gravação clínica principal com revisão otimista, idempotência e fila serial;
- logs clínicos e administrativos imutáveis;
- separação entre Atlas público e fontes bibliográficas protegidas;
- fallback local condicionado a desenvolvimento e removido do bundle de produção;
- CSP, HSTS, `frame-ancestors`, `nosniff` e política de permissões no `vercel.json` local;
- IA sem mock em sessão real, com prompts e correções geridos e gate humano inegociável.

### 4.3 Dívida arquitetural

- componentes centrais grandes: `Agenda.jsx` tem ~1.529 linhas; outros painéis administrativos e workspaces também concentram muita lógica;
- `frontend/README.md` permanece como template genérico do Vite e não documenta operação real;
- comentários de catálogo ainda descrevem evolução/relatório como placeholders, embora os testes indiquem que já foram implementados;
- coexistem prontuários/evoluções legados em JSON e a nova tabela `patient_evolutions`, elevando custo de migração e consistência;
- dependência forte de Supabase, Vercel e Vertex, sem estratégia de saída ou portabilidade operacional documentada;
- não há versionamento explícito das APIs das Edge Functions.

## 5. Segurança e privacidade

### 5.1 Controles fortes verificados

- RLS e RPCs com checagens explícitas de posse, clínica, disciplina e destinatário;
- correção cumulativa do incidente de compartilhamento cross-tenant de 11/08;
- segredo de criptografia lido do Vault nas rotas endurecidas;
- revogação de sessões após troca/reset de senha;
- senha temporária com expiração;
- MFA TOTP e gates `aal2` quando exigido pelo perfil;
- CORS fail-closed e limites de payload em Edge Functions;
- rate limiting persistente;
- mensagens externas sanitizadas, sem vazamento de erro bruto;
- sanitização de HTML e bloqueio de `javascript:` nos relatórios;
- auditoria sem payload clínico e telemetria com allowlist;
- compartilhamento clínico filtrado no servidor;
- nenhuma chave `service_role` foi encontrada como dependência do frontend.

### 5.2 Achados abertos

#### P0 — evidência de rotação criptográfica ausente

A migration histórica ainda contém uma chave clínica literal versionada. A auditoria interna já a classifica como comprometida e o runbook exige rotação com recriptografia e dupla aprovação. Não há evidência no repositório de que a operação tenha sido concluída. Se a chave foi usada com dados reais, este é um risco material de segurança e LGPD.

**Evidência requerida:** ata do incidente, inventário de ambientes/backups, data da rotação, validação de recriptografia, revogação da chave anterior e responsáveis aprovadores — sem registrar o segredo.

#### P0 — divergência entre ambiente e Git

Objetos e funções recentes respondem no Supabase, mas os arquivos correspondentes estão não rastreados localmente e ausentes da `main`. Um rollback ou novo provisionamento a partir do Git não reproduziria necessariamente o ambiente atual.

**Ação:** congelar deploys, revisar a entrega, adicionar testes, versionar migrations/funções, registrar ordem aplicada e reconciliar o histórico de migrations do Supabase.

#### P1 — nova evolução clínica não segue o padrão completo de concorrência

`patient_evolutions` cifra o conteúdo, trava datas no servidor e audita alterações, o que é positivo. Porém, `update_patient_evolution` não recebe revisão esperada nem chave de idempotência. Duas edições concorrentes podem produzir sobrescrita silenciosa, contrariando o padrão já adotado no prontuário principal. Inserts avulsos, sem `appointment_id`, também não têm chave idempotente.

Além disso, a FK para paciente usa `ON DELETE CASCADE`, apesar de a política do projeto exigir arquivamento e solicitação auditável até haver retenção aprovada.

**Ação:** adicionar `revision`, compare-and-swap, idempotency key, testes de concorrência e remover/justificar cascata antes de consolidar a migration.

#### P1 — link de confirmação sem expiração

O token de confirmação de agendamento é forte e não sequencial, mas não tem `expires_at`, rotação ou revogação própria. A leitura pública devolve nome de paciente, profissional, clínica, data/hora e local, inclusive ao revisitar links antigos. Um link encaminhado, sincronizado ou vazado pode permanecer como bearer token de PII por tempo indefinido.

**Ação:** expirar após o atendimento ou janela curta, permitir rotação/revogação, minimizar a visualização e testar estados cancelado/passado/confirmado.

#### P1 — novas superfícies sem regressão dedicada

Não foram encontrados testes que importem diretamente `patientEvolutionService`, `satisfactionSurveyService`, `clinicAccessLogService`, `SurveyPage` ou `ConfirmAppointmentPage`, nem teste comportamental da migration `20260903_patient_evolutions.sql`. O quality gate verde não cobre adequadamente essa entrega.

#### P1 — Atlas público indisponível

O arquivo `atlas-ednea/source-index.json` esperado por `DeployHealthPanel` retornou `NoSuchKey` no ambiente configurado. Em produção, isso impede o carregamento do manifesto público e deve aparecer como bloqueio de deploy.

#### P1 — governança LGPD incompleta

O RIPD está bem estruturado, mas se declara pendente de validação jurídica/DPO. Continuam sem evidência:

- nomeação formal e canal do Encarregado;
- base legal e aviso de privacidade ao paciente;
- fluxo e prova de autorização para menores/responsáveis;
- política de retenção, descarte e desligamento de profissionais;
- portabilidade dos dados do titular;
- DPA do Supabase, CDPA/DPA do Google e região de backups;
- política de acesso, MFA administrativo, treinamento e resposta a incidentes.

O novo `image_consent` registra apenas booleano e data. Para servir como prova robusta, deve também vincular versão do termo, finalidade, escopo, forma de coleta, responsável e evento de revogação. CPF foi adicionado como texto sem constraint de formato no banco e sem documentação específica de minimização/retenção.

#### P2 — dependência moderada corrigível

Atualizar a cadeia `mammoth`/`@xmldom/xmldom`, validar conversão de documentos e manter teste de regressão contra XML/HTML malformado.

## 6. Confiabilidade, disponibilidade e desempenho

### 6.1 O que existe

- CI reproduzível com `npm ci` em PR e `main`;
- build bloqueado se a configuração pública do Supabase for insegura;
- error boundary e telemetria sanitizada;
- healthcheck administrativo que cobre schema, migrations críticas, Storage, Edge Functions e smoke real de IA;
- timeouts, retries controlados e rate limit nas integrações de IA;
- índices e limites de até 2.000 linhas nas listagens críticas;
- runbook de implantação e rollback com gates humanos.

### 6.2 O que ainda não foi comprovado

- uptime, latência p50/p95/p99 e taxa de erro;
- SLO/SLA e orçamento de erro;
- alertas efetivamente configurados;
- backup, PITR, restauração testada e RPO/RTO medidos;
- separação formal entre desenvolvimento, homologação e produção;
- deploy imutável com versão/release identificável na UI;
- teste de carga, caos, degradação de fornecedores ou filas;
- rollback ensaiado de migrations e Edge Functions;
- capacidade e custo por clínica/paciente/consulta de IA.

O bundle passou no orçamento interno, mas o build avisou sobre chunks acima de 500 kB. O total de JavaScript comprimido é ~1,24 MB; o chunk principal é ~188 kB gzip e o conversor HTML→DOCX chega a ~485 kB gzip. Há code splitting, mas o carregamento em celulares e redes lentas deve ser medido.

## 7. Engenharia, manutenção e governança

### 7.1 Pontos positivos

- regras de engenharia e segurança explícitas em `AGENTS.md`;
- regressões históricas registradas e frequentemente acompanhadas de teste;
- mudanças de schema aditivas e documentadas;
- linguagem pt-BR e limites clínicos consistentes;
- preocupação incomum com proveniência, confiança e aprovação profissional do conhecimento.

### 7.2 Riscos organizacionais

- bus factor aparente igual a 1;
- ausência de tags/releases e changelog de produto;
- alterações de produção antes da consolidação em Git;
- ausência de evidência de revisão por pares/PR obrigatório;
- documentação operacional espalhada entre planos, migrations e comentários;
- nenhum inventário formal de ativos, subprocessadores, licenças de conteúdo ou propriedade intelectual;
- grandes arquivos e lógica de domínio no cliente elevam custo de revisão e onboarding.

Para uma transação, a titularidade do código, contratos de cessão, autorização de uso do Atlas, livros/PDFs e material de terceiros precisam ser avaliados separadamente. O fato de fontes estarem tecnicamente protegidas não prova direito de uso comercial.

## 8. Matriz de maturidade

| Dimensão | Avaliação | Fundamentação |
|---|---|---|
| Produto funcional | Forte | fluxos clínicos e administrativos extensos, build íntegro |
| Segurança por desenho | Forte com ressalva | controles técnicos bons; rotação histórica sem evidência |
| Privacidade/LGPD | Frágil | RIPD existe, mas decisões e validações centrais estão abertas |
| Qualidade automatizada | Adequada | 576 testes; falta integração real e E2E |
| Operação/observabilidade | Parcial | healthcheck e telemetria existem; configuração e métricas não comprovadas |
| Reprodutibilidade de deploy | Frágil hoje | ambiente à frente da `main` |
| Escalabilidade | Não demonstrada | sem carga, capacidade ou custos unitários |
| Manutenibilidade | Adequada com dívida | padrões bons, mas módulos grandes e bus factor 1 |
| Governança de releases | Inicial | sem tags, releases formais ou trilha remota da entrega atual |
| Segurança clínica da IA | Forte por desenho | IA assistiva, sob demanda, anonimizada e com gate humano |

## 9. Recomendação de transação

### 9.1 Classificação

**GO condicionado.** O ativo técnico justifica continuidade de negociação, piloto e aprofundamento da due diligence. Não se recomenda atestar prontidão enterprise, hospitalar ou operação clínica ampla até que os itens P0 e P1 tenham evidência de fechamento.

### 9.2 Condições precedentes sugeridas

1. reconciliar Supabase, Git e deploy; produzir release reproduzível e tagueada;
2. concluir e comprovar rotação da chave histórica;
3. corrigir concorrência/idempotência/retenção de `patient_evolutions`;
4. expirar e revogar tokens de confirmação;
5. publicar e validar o Atlas público ou remover a dependência da produção;
6. adicionar testes de regressão e integração das funcionalidades de setembro;
7. executar restauração em ambiente isolado e medir RPO/RTO;
8. concluir o pacote mínimo LGPD com jurídico/DPO;
9. corrigir a vulnerabilidade npm moderada;
10. demonstrar healthcheck autenticado, logs, alertas e versão do frontend implantado.

## 10. Plano recomendado de 90 dias

### 0–7 dias — estabilização

- congelar novos deploys até reconciliar Git e ambiente;
- abrir PR da entrega local com revisão independente;
- criar testes para migrations, serviços e páginas públicas novas;
- corrigir os dois riscos de escrita/token;
- restaurar o índice público do Atlas;
- atualizar `mammoth`/`xmldom` com regressão de documentos;
- gerar tag de release e changelog do estado efetivamente implantado.

### 8–30 dias — evidência operacional e LGPD

- executar rotação/recriptografia com dupla aprovação;
- restaurar backup e medir RPO/RTO;
- configurar SLOs, alertas e retenção de logs;
- obrigar MFA para perfis administrativos após canário;
- concluir DPO, aviso do paciente, menores, retenção e contratos de operadores;
- implantar E2E dos fluxos login → paciente → atendimento → evolução → relatório;
- rodar testes reais de RLS/migrations em banco efêmero.

### 31–90 dias — escala e governança

- modularizar `Agenda`, workspaces e painéis administrativos maiores;
- implantar Dependabot/Renovate, SBOM, SAST e DAST;
- testar carga e custo por operação/IA;
- formalizar ambientes, aprovação de deploy, rollback e releases semânticos;
- documentar arquitetura, modelo de dados, subprocessadores e ownership;
- criar plano de portabilidade e saída de fornecedores.

## 11. Data room técnico solicitado

Para fechar a due diligence, solicitar:

- diagrama de arquitetura e fluxos de dados atualizado;
- inventário de ambientes, domínios, projetos Supabase/Vercel/GCP e responsáveis;
- relatório de migrations aplicadas por ambiente;
- histórico de deploys, releases, rollbacks e incidentes;
- evidência de rotação da chave e testes de recriptografia;
- relatório de backup/PITR e restauração ensaiada;
- export de healthcheck autenticado e métricas de 30/90 dias;
- lista de usuários privilegiados e cobertura MFA;
- DPA/CDPA, RIPD aprovado, política de retenção e nomeação do DPO;
- contratos de cessão de IP e licenças de Atlas, PDFs e bases de conhecimento;
- custos mensais e unitários de Supabase, Vercel, Storage e Vertex;
- volume real de clínicas, profissionais, pacientes, prontuários e chamadas de IA, sempre agregado e sem PII;
- roadmap, backlog de segurança e responsável por cada condição precedente.

## 12. Evidências principais

- `AGENTS.md` — invariantes clínicos, segurança, qualidade e retenção;
- `README.md` e `.github/workflows/quality.yml` — arquitetura resumida e CI;
- `frontend/package.json` — scripts e dependências;
- `frontend/tests/regression/` — 69 arquivos de regressão;
- `supabase/migrations/` — 53 migrations locais na data-base;
- `supabase/functions/` — 18 Edge Functions e um diretório compartilhado;
- `docs/auditoria-seguranca-2026-08-11.md` — auditoria defensiva anterior;
- `docs/ripd-sistema-acup.md` — avaliação interna de impacto à proteção de dados;
- `docs/runbook-hardening-producao.md` — implantação, Vault, backup e rollback;
- `frontend/src/services/deployHealthService.js` — healthcheck operacional;
- `supabase/migrations/20260903_patient_evolutions.sql` — nova persistência de evolução;
- `supabase/functions/confirm-appointment/index.ts` — link público de confirmação;
- resultados dos comandos `npm run quality`, `npm audit`, `git diff --check`, `git ls-remote` e probes HTTP executados em 03/09/2026.

## 13. Limites desta avaliação

Este dossiê não substitui pentest, auditoria jurídica, validação clínica, auditoria financeira ou inspeção autenticada de produção. Não foram consultados dados de pacientes. Não foram alterados banco, deploys, secrets ou configurações remotas. Classificações sobre produção devem ser confirmadas com evidência do ambiente correto e por responsáveis autorizados.
