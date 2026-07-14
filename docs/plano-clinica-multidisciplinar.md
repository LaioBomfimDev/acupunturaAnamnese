# Plano — Clínica multidisciplinar

Documento de arquitetura. Eleva o sistema de "app de acupuntura com login" para
**plataforma de clínica multidisciplinar**: hub de disciplinas no login, paciente único da
clínica com prontuários separados por disciplina, encaminhamento entre profissionais com
compartilhamento explícito, e hierarquia de papéis (SuperAdm → Adm da clínica → Profissional → Recepção).

Complementa `docs/plano-anamnese-multidisciplinar.md` (que trata do **conteúdo** de cada
anamnese); este documento trata da **estrutura** — quem vê o quê, onde o paciente mora,
como o sistema decide qual tela abrir.

---

## 1. Decisões já tomadas (com o Laio, 2026-07-07)

1. **Multi-disciplina por usuário: SIM.** Uma pessoa pode ter várias disciplinas (a CEO é
   psicóloga + fisio + acupunturista → 3 anamneses liberadas). Contas de teste
   `admLaio`, `admDeni`, `admKaren` nascem com TODAS as disciplinas liberadas.
2. **Hub no login.** Login → tela de boas-vindas com cards/botões das disciplinas que o
   perfil libera (MTC, Fisio, Psi, Nutri…) → abre o workspace daquela disciplina.
3. **Paciente é da CLÍNICA, não do profissional.** Cadastro único, fora das anamneses,
   com tudo linkado (histórico, relatórios, profissional que atendeu, clínica).
4. **Paciente entra em disciplinas por "matrícula", nunca por cópia.** Ao cadastrar, já é
   direcionado a 1 disciplina inicial (ex.: acupuntura). Se depois quiser nutrição, alguém
   "envia" o paciente para a área de nutri → mesmo paciente, 2 áreas. **NUNCA clonar/copiar**
   o registro do paciente.
5. **Peso ético: prontuário é por disciplina.** Profissional de outra disciplina NÃO vê o
   prontuário — só quando compartilhado. No encaminhamento (acup → nutri), é válido a nutri
   ver relatório/histórico, mas isso é um ato explícito de compartilhar, não acesso automático.
6. **Hierarquia de papéis** (estruturar o Adm depois, mas o plano já prevê):
   - **SuperAdm** = o criador (Laio). Tudo.
   - **Adm (clínica)** = CEO da clínica contratante. Mais que profissional, menos que SuperAdm.
   - **Profissional** = atende; vê o que é da sua disciplina + o que foi compartilhado.
   - **Recepção** = cadastra paciente, direciona/encaminha, agenda; **não vê conteúdo clínico**.
7. **Psicologia tem duas modalidades**: anamnese clínica e **avaliação neuropsicológica** —
   escolhidas dentro do workspace de Psi (análogo ao módulo hormonal condicional, porém
   como fluxos distintos, não um toggle).

---

## 2. Estado atual (o que muda)

| Hoje | Passa a ser |
|---|---|
| Login → cai direto no MTC | Login → **hub de disciplinas** → workspace escolhido |
| `patients.therapist_id` + RLS `auth.uid() = therapist_id` (paciente é DO profissional) | Paciente é da **clínica**; acesso via matrícula por disciplina + papel |
| `clinical_records` sem noção de disciplina (tudo é MTC implícito) | `clinical_records.discipline` (registros antigos = `acupuntura`) |
| `profiles.profession` (uma profissão, texto) | `profession` continua (registro/conselho) + **`disciplines[]`** (o que pode abrir) |
| Papéis: `super_admin` e profissional | + `clinic_admin` e `receptionist` |
| Abas fixas do MTC no `App.jsx` | Workspace por disciplina (pacote de abas/anamnese/IA/relatório) |

O que NÃO muda: gate humano, anonimização antes da IA, confiança em faixas, curadoria
profissional, todo o motor MTC existente (vira o "pacote acupuntura", sem regressão).

---

## 3. Modelo de dados proposto

### 3.1 Disciplina
Enum estável no código + banco: `acupuntura`, `fisioterapia`, `psicologia`, `nutricao`
(extensível). Cada disciplina referencia seu **pacote de workspace** no frontend:
abas, anamnese(s), comportamento da IA, relatório.

### 3.2 Perfil × disciplinas
```sql
ALTER TABLE profiles ADD COLUMN disciplines TEXT[] NOT NULL DEFAULT '{}';
-- backfill: todo profissional ativo hoje → '{acupuntura}'
-- admLaio/admDeni/admKaren → todas
```
- `profession`/`professional_registration` continuam sendo o registro formal (CRP, CREFITO…).
- `disciplines` é o que o hub mostra. Editável pelo SuperAdm (depois também pelo Adm da clínica).
- 1 disciplina só → hub pode pular direto pro workspace (atalho de UX, decidir na hora).

### 3.3 Paciente da clínica
```sql
ALTER TABLE patients ADD COLUMN clinic_id UUID REFERENCES clinics(id);
-- backfill via clinic do therapist atual; therapist_id vira "criado por/responsável inicial"
```
O cadastro do paciente (nome, contato, idade, LGPD) fica **fora** de qualquer anamnese —
tela própria de "Pacientes da clínica".

### 3.4 Matrícula por disciplina (o "enviar para outra área")
```sql
CREATE TABLE patient_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id),
  discipline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',        -- active | discharged | paused
  referred_by UUID REFERENCES profiles(id),      -- quem enviou (recepção/profissional/adm)
  assigned_to UUID REFERENCES profiles(id),      -- profissional responsável (opcional)
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (patient_id, discipline)
);
```
- Cadastrou paciente → cria a matrícula inicial (ex.: acupuntura) na mesma hora.
- "Enviar para nutri" = criar `patient_enrollments (nutricao)`. O paciente é UM; a matrícula
  é que multiplica. Zero cópia de dados.

### 3.5 Registro clínico por disciplina
```sql
ALTER TABLE clinical_records ADD COLUMN discipline TEXT NOT NULL DEFAULT 'acupuntura';
```
Todo o histórico atual vira `acupuntura` de graça. Sessões/anamnese/evolução de Psi gravam
`psicologia`, etc.

### 3.6 Compartilhamento explícito (o peso ético)
```sql
CREATE TABLE record_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  from_discipline TEXT NOT NULL,
  to_discipline TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'summary',   -- summary | reports | full_history
  shared_by UUID NOT NULL REFERENCES profiles(id),
  note TEXT,                               -- resumo de encaminhamento escrito pelo profissional
  created_at TIMESTAMPTZ DEFAULT now(),
  revoked_at TIMESTAMPTZ                   -- compartilhamento é revogável
);
```
- No ato de encaminhar, quem envia **escolhe o que compartilha** (só um resumo, os
  relatórios, ou o histórico) — minimização LGPD: o padrão é o menor escopo útil.
- Psicologia pode ter regra mais restritiva (a psicóloga define; sigilo CFP).
- Todo compartilhamento fica auditável (quem, quando, o quê) e é revogável.

### 3.7 Papéis
```sql
-- profiles.role: 'super_admin' | 'clinic_admin' | 'professional' | 'receptionist'
```
Matriz de acesso (resumo; detalhar quando estruturar o Adm):

| Ação | SuperAdm | Adm clínica | Profissional | Recepção |
|---|---|---|---|---|
| Gerir clínicas/usuários globais | ✅ | — | — | — |
| Gerir usuários DA SUA clínica | ✅ | ✅ | — | — |
| Ver métricas da clínica (volume, agenda) | ✅ | ✅ | as suas | parcial |
| Cadastrar paciente / matricular / encaminhar | ✅ | ✅ | ✅ | ✅ |
| Ver conteúdo clínico (anamnese, relatório) | ✅* | ❌ por padrão | da sua disciplina + compartilhado | ❌ NUNCA |
| Curadoria de conhecimento/IA | ✅ | — | contribui (Corrigir) | — |

*SuperAdm com acesso técnico ≠ uso clínico; manter auditoria. Discutir se Adm clínica deve
ver conteúdo clínico — recomendação: **não por padrão** (ele gere a operação, não o prontuário).

---

## 4. RLS — a reescrita mais sensível do sistema

Hoje: `USING (auth.uid() = therapist_id)` em `patients` e `clinical_records`.

Passa a ser (conceitualmente):
- **patients**: mesmo `clinic_id` do usuário + (papel ≥ recepção). Recepção vê cadastro,
  nunca `clinical_records`.
- **clinical_records**: mesmo `clinic_id` **e** (`discipline` ∈ disciplinas do usuário **e**
  paciente matriculado nessa disciplina) **ou** compartilhamento ativo em `record_shares`
  cobrindo aquele escopo.
- **patient_enrollments / record_shares**: visíveis na clínica; criação conforme matriz de papéis.

Regras de migração de segurança:
- Migração **aditiva e reversível**: colunas novas com default, políticas novas testadas em
  paralelo antes de remover as antigas.
- Testar leitura/escrita/atualização/exclusão em cada papel (AGENTS.md §9).
- Nenhum acesso pode FICAR MAIS ABERTO durante a transição do que era antes.

---

## 5. UX

### 5.1 Hub de boas-vindas (pós-login)
- Saudação + nome da clínica.
- **Cards por disciplina liberada** (ícone, nome, nº de pacientes ativos naquela área).
- Card de "Pacientes da clínica" (cadastro central) para quem tem papel de gestão/recepção.
- SuperAdm mantém painel próprio como hoje.
- Trocar de disciplina a qualquer momento (botão no topo/sidebar "trocar área"), sem relogar.

### 5.2 Workspace por disciplina
- Sidebar/abas definidas pelo pacote da disciplina (MTC = as 10 atuais; Psi nasce enxuta:
  Anamnese + Evolução + Relatório; Nutri/Fisio análogo).
- **Regra de shell:** toda disciplina usa a mesma composição clínica (`Sidebar` azul + conteúdo
  central + rail `IA Assistente`). A disciplina troca as abas, os dados e as funções da IA,
  mas não cria uma tela paralela baseada no shell do hub.
- Lista de pacientes do workspace = **matriculados naquela disciplina**.
- Assistente lateral de IA por disciplina (na Psi, versão conservadora do plano de anamnese).

### 5.3 Detalhe do paciente (visão clínica)
- Cabeçalho único (cadastro da clínica).
- **Uma aba por disciplina em que está matriculado.** A aba da SUA disciplina abre o
  prontuário; a de outra disciplina aparece com cadeado — mostra só "em atendimento com
  Fulana (nutri)" + o que foi explicitamente compartilhado com você.
- Botão **"Enviar para outra disciplina"**: escolhe a disciplina destino, o profissional
  (opcional), o escopo do compartilhamento (resumo/relatórios/histórico) e escreve a nota
  de encaminhamento. Uma confirmação clara do que o outro profissional passará a ver.

### 5.4 Psicologia — modalidades
Ao abrir o workspace de Psi com um paciente, a tela de boas-vindas oferece três percursos:
**Anamnese infantil**, **Anamnese adulto** e **Avaliação**. A anamnese abre uma segunda etapa
com quatro perfis (infantil menina/menino e adulto mulher/homem); infantil é até 17 anos e
registra o responsável ou outro informante em cada resposta. Anamnese e avaliação são fluxos
e registros distintos (`psi_anamnese` e `psi_neuro_avaliacao`), ambos ligados ao mesmo paciente.

Todo paciente pode ter evoluções sem estar em avaliação. Quando houver avaliação, ela mantém
suas próprias sessões/evoluções, instrumentos, observações, resultados, integração profissional
e relatório. As dez sessões são apenas um roteiro inicial ajustável pela neuropsicóloga.

---

## 6. Fases de implementação

Cada fase entrega valor sozinha e não quebra a anterior. MTC continua funcionando idêntico
durante TODA a transição.

- **Fase 0 — Este plano aprovado.** ✅ decisões de §1 tomadas em 2026-07-07.
- **Fase 1 — Disciplinas no perfil + Hub.** ✅ implementada em 2026-07-07.
  `profiles.disciplines` (migração `20260707_profile_disciplines.sql` — **aplicar no Supabase**)
  + hub com TODAS as disciplinas visíveis: liberadas em cor, demais em cinza (decisão do Laio).
  Só o card Acupuntura abre workspace; "Trocar de área" no sidebar. Zero mudança em pacientes/RLS.
  Sem a migração aplicada, o frontend cai em fallback seguro (só acupuntura liberada).
  Código: `frontend/src/data/disciplines.js`, `frontend/src/components/DisciplineHub.jsx`,
  wiring em `App.jsx`/`Sidebar.jsx`/`AuthContext.jsx`; teste `tests/regression/disciplines.test.mjs`.
- **Fase 2 — Paciente da clínica + matrículas.** ✅ implementada em 2026-07-07.
  Migração `20260708_clinic_patients_enrollments.sql` (**aplicar no Supabase, DEPOIS da
  20260707**): `patients.clinic_id` + backfill, `patient_enrollments` (RLS própria, sem
  DELETE — matrícula muda de status, não se apaga), `clinical_records.discipline`
  (histórico = acupuntura), helpers de RLS SECURITY DEFINER. Decisão conservadora: o
  CONTEÚDO clínico segue owner-only nesta fase — colegas da clínica que compartilham
  disciplina com o paciente veem apenas o CADASTRO + matrículas (a abertura por
  disciplina/compartilhamento é a Fase 3). Frontend: tela "Pacientes da clínica" no hub
  (cadastro central + área inicial + "Enviar para outra área" com confirmação explicando
  que nada clínico é compartilhado); matrícula inicial automática ao criar paciente no
  workspace. Código: `services/clinicPatientsService.js`, `components/ClinicPatientsPanel.jsx`,
  wiring hub/App/PatientContext; teste `tests/regression/clinic-patients.test.mjs`.
- **Fase 3 — Encaminhamento + compartilhamento + peso ético.** ✅ implementada em 2026-07-08.
  Migração `20260709_record_shares.sql` (**aplicar DEPOIS de 20260707 e 20260708**; ou rodar o
  consolidado `docs/aplicar-sql-disciplinas-2026-07-08.sql`): tabela `record_shares`
  (shared_scopes[], revogável via `revoked_at`, sem DELETE), `is_clinic_admin()`, e RPC
  **`get_shared_session`** que autoriza leitura por dono/adm/compartilhamento — a
  `get_clinical_records` original (dona-somente) fica INTACTA. Adm da clínica (CEO) enxerga
  todos os pacientes da sua clínica e pode enviar. Frontend: `SharePatientDialog` (origem→destino,
  multi-seleção de escopos com "Cadastro" travado, nota, **confirmação de senha** via
  `AuthContext.verifyPassword`), tags de compartilhamento + revogar no painel da clínica.
  Código: `data/shareScopes.js`, `services/recordSharesService.js`, `components/SharePatientDialog.jsx`,
  `AuthContext` (verifyPassword + isClinicAdmin); teste `tests/regression/record-shares.test.mjs`.

  **Limite honesto (documentado):** a sessão clínica é UM registro criptografado
  (`full_session`), então o banco autoriza no nível da SESSÃO; a seleção de facetas
  (resumo/dores/…) é registrada para consentimento/auditoria e honrada na VISUALIZAÇÃO —
  ainda não é fronteira criptográfica por faceta. Falta também a UI de leitura read-only da
  sessão compartilhada pelo profissional de destino (a RPC já existe; a tela é o próximo passo).
- **Fase 4 — Papéis Adm da clínica e Recepção.**
  `clinic_admin`/`receptionist`, matriz de §3.7, painéis correspondentes.
- **Fase 5 — Workspace de Psicologia** (primeira disciplina nova de verdade).
  Pacote Psi: anamnese clínica + avaliação neuropsicológica (conteúdo aprovado pela
  psicóloga), IA conservadora, relatório/PDF próprio.

  **Status (2026-07-14): PRIMEIRO FLUXO COMPLETO EM REVISÃO.** Workspace autocontido
  (`components/PsychologyWorkspace.jsx` + `data/psychologyAnamnese.js`): hub → card
  Psicologia → paciente (reusa `PatientStart`, matrícula inicial em `psicologia`) →
  boas-vindas com os três percursos → quatro perfis de anamnese ou avaliação separada.
  Há roteiro infantil/adulto, atalhos em todos os campos, identificação e histórico do
  informante, correção ortográfica nativa pt-BR, bloco de risco, hipóteses em revisão,
  evolução clínica e avaliação longitudinal ajustável com instrumentos, sessões, resultados,
  integração e relatório assistido. Auto-save usa `record_type='psi_anamnese'` e
  `record_type='psi_neuro_avaliacao'`, ambos com `discipline='psicologia'`. IA só produz
  rascunho editável; impressão do relatório exige revisão profissional. Migração
  `20260710_insert_record_discipline.sql` (p_discipline na RPC; incluída no consolidado
  `docs/aplicar-sql-disciplinas-2026-07-08.sql`) — sem ela o save cai na assinatura
  antiga com AVISO no console (payload preserva a disciplina). Teste:
  `tests/regression/psychology-workspace.test.mjs`. Falta: validação clínica da psicóloga/
  neuropsicóloga, refinamento da bateria e do documento, deploy da Edge Function
  `psych-report` e lista de pacientes filtrada por matrícula.
- **Fase 6 — Nutri e Fisio** repetindo o molde da Fase 5.

Ordem defensável: hub primeiro (visível, barato, sem risco), banco depois (invisível,
caro, alto risco — feito com calma), disciplinas novas por último (dependem dos
especialistas).

---

## 7. Riscos e pontos de atenção

1. **Migração `patients` é a mudança mais sensível já feita.** Hoje RLS é
   `auth.uid() = therapist_id`; errar a nova política expõe prontuário entre profissionais.
   Mitigação: fase própria, migração aditiva, testes de RLS por papel, rollback documentado.
2. **Sigilo da psicologia é mais rígido que o das demais** (CFP). O modelo de compartilhar
   por escopo já prevê isso, mas a psicóloga precisa validar as regras da lane dela.
3. **Recepção nunca vê conteúdo clínico** — reforçar em RLS E na UI (não confiar só na UI).
4. **SuperAdm enxerga tudo tecnicamente** — manter trilha de auditoria; considerar no futuro
   acesso clínico "quebra-vidro" logado.
5. **Não clonar paciente** (decisão explícita): qualquer funcionalidade de "enviar" deve
   criar matrícula/compartilhamento, jamais duplicar linha de paciente — inclusive em
   importações/ferramentas futuras.
6. **Fallback localStorage** (`clinicService`) precisa acompanhar o schema novo ou avisar —
   já houve incidente de fallback silencioso com migração não aplicada.
