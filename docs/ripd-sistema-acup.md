# RIPD — Relatório de Impacto à Proteção de Dados Pessoais
## Sistema Acup — plataforma clínica integrativa (acupuntura/MTC) com IA assistiva

> ⚠️ **Documento interno de conformidade (LGPD).** Não é peça pública nem substitui parecer jurídico.
> Modelo preenchido com os fatos técnicos do sistema; os campos `[preencher]` dependem da clínica/DPO.
> **Revisar e validar com advogado(a)/Encarregado(a) antes de considerar concluído.**
> Base: LGPD (Lei 13.709/2018) e orientações da ANPD sobre RIPD (alto risco: dados sensíveis,
> tecnologias emergentes/IA e dados de crianças/adolescentes).

| Campo | Valor |
|---|---|
| Versão | 1.2 (1.1 da assistente financeira aprovada em 09/11/2026; §4.2 da assistente na agenda aprovada em 10/11/2026) |
| Data | 2026-06-30 · atualizado em 2026-11-10 |
| Responsável pela elaboração | Equipe Reability — [definir responsável técnico] |
| Encarregado (DPO) | Ainda não formalmente nomeado — contato institucional interino: (71) 99970-3912 |
| Controlador | Reability – Núcleo de Desenvolvimento Neurológico LTDA — CNPJ 53.351.769/0001-10 — Rua Simões Filho, 350, Boa Vista, Catu – BA, CEP 48110-000. Responsável técnica: Denise Neves (CRP 03/10696) |
| Status | Revisado — pendente de validação jurídica/DPO |

---

## 1. Descrição geral do tratamento

**Natureza:** plataforma clínica para profissionais de acupuntura/MTC (uso multiprofissional). Registra
cadastro de pacientes, anamnese, inspeção de língua (incl. fotos), pulso, raciocínio clínico, protocolos,
evolução e relatórios; oferece módulos de **IA assistiva** (sugestões revisadas pela profissional).

**Finalidades:** apoio ao atendimento clínico, organização de prontuário/registro, geração de relatórios e
consulta a base de conhecimento. A IA **não** toma decisão automatizada com efeito jurídico/relevante —
toda saída exige **revisão humana**.

**Titulares:** pacientes (**inclui crianças/adolescentes** — confirmado: a Reability atende público infantojuvenil, ex.: avaliação nutricional infantojuvenil/seletividade alimentar — ver §9) e profissionais usuários.

**Contexto institucional:** a Reability é clínica multiprofissional de reabilitação neurológica em Catu-BA. Serviços da clínica: neuropsicologia, psicoterapia, psiquiatria, fisioterapia neurofuncional, terapia ocupacional, nutrição, acupuntura, reabilitação cognitiva, laserterapia/fotobiomodulação e neuromodulação (conselhos aplicáveis conforme a profissão: CRP, CRM, CREFITO, CRN etc.). **Este RIPD cobre especificamente o módulo Sistema Acup (acupuntura/MTC).**

**Abrangência:** sede em Catu-BA. [preencher: nº aproximado de profissionais/pacientes; se o uso será em uma só unidade, várias unidades ou por profissionais independentes.]

---

## 2. Dados tratados

| Categoria | Exemplos | Sensível? |
|---|---|---|
| Identificação do paciente | nome, telefone, idade/nascimento, sexo, profissão | Pessoal |
| Saúde / clínicos | queixa, história, sono, emoções, digestão, dor, medicações, exames, achados de língua/pulso, evolução, protocolo, relatório | **Sensível (saúde)** |
| Imagens | fotografias da língua (e sublingual) | **Sensível (saúde)** |
| Profissional | nome, e-mail, login, registro profissional, especialidade, clínica, perfil | Pessoal |
| Operacional | logs de auditoria administrativa, status de usuário | Pessoal |
| Financeiro (assistente) | primeiro nome e idade em anos do paciente, área de atendimento, nome do profissional, valores, datas de vencimento e pagamento, situação (pago, a receber, atrasado, da operadora) | Pessoal (financeiro); a área de atendimento indica que a pessoa é paciente da clínica |
| Agenda (assistente) | primeiro nome e idade em anos do paciente, dia e hora do atendimento, área, tipo de atendimento, nome do profissional, situação do agendamento (agendado, confirmado, atendido, faltou, cancelado), aniversário no período (sem a data de nascimento) | Pessoal; a área e o tipo de atendimento indicam que a pessoa é paciente da clínica e em que área é atendida |

**Base legal (saúde):** tutela da saúde por profissional/serviço de saúde (art. 11, II, "f") e/ou
consentimento específico e destacado do titular (art. 11, I), conforme o caso. **Validar com jurídico.**

---

## 3. Ciclo de vida e fluxo dos dados

1. **Coleta:** profissional registra dados no app (frontend).
2. **Armazenamento:** Supabase (PostgreSQL) — pacientes vinculados ao profissional por **RLS**
   (row-level security); fichas gravadas por **RPC com criptografia de dados sensíveis no banco**;
   fotos da língua em **bucket privado** (`clinical-tongue-photos`, RLS por terapeuta). Chave
   administrativa e de criptografia **não ficam no frontend**.
3. **IA (sob demanda):** ao clicar nos botões de IA, o sistema chama Edge Functions (Supabase) que
   acionam o **Google Cloud Vertex AI (Gemini)** na **multirregião dos EUA (`us`)** desde 30/10/2026
   (ver seção 4: o modelo atual não é oferecido em São Paulo). Antes de enviar,
   o **texto é anonimizado no cliente** (mascara nome, CPF, telefone, e-mail, datas, CEP — `utils/anonymize.js`)
   e o **nome do paciente não é enviado**. As funções **não registram** o conteúdo do paciente em log.
   **Exceção (assistente financeira, §4.1):** quando a administração pergunta à assistente sobre o
   financeiro, vão ao Vertex o **primeiro nome e a idade** do paciente junto de área, profissional,
   valores, datas e situação, só das linhas da pergunta.
   **Exceção (assistente na agenda, §4.2):** quando alguém da equipe pergunta à assistente sobre a
   agenda, vão ao Vertex o **primeiro nome e a idade** do paciente junto de dia, hora, área, tipo,
   profissional e situação do agendamento, só do que essa pessoa já vê na Agenda e só das linhas da
   pergunta.
4. **Retenção:** [preencher: prazo de guarda — em regra ≥ 20 anos para prontuário; confirmar com o conselho].
5. **Eliminação/anonimização:** ao fim da finalidade e dos prazos legais.

**Agentes de tratamento:**
- **Controlador:** Reability – Núcleo de Desenvolvimento Neurológico LTDA (CNPJ 53.351.769/0001-10), Catu-BA. Responsável técnica: Denise Neves (CRP 03/10696). [preencher: confirmar responsável legal da PJ no contrato social.]
- **Operadores/subprocessadores:** **Supabase** (banco, auth, storage) e **Google Cloud Vertex AI** (IA). [preencher: arquivar DPA do Supabase e o CDPA do Google; região dos backups.]

---

## 4. IA — descrição e salvaguardas

- **Modelo:** Gemini (`gemini-3.5-flash-lite`) via **Vertex AI**, na **multirregião dos EUA (`us`)**: o
  processamento fica dentro dos EUA. O `gemini-2.5-flash`, usado até então, foi aposentado pelo Google em
  20/10/2026 e os modelos que o substituem não são oferecidos em São Paulo (conferido em 30/10/2026).
  A configuração de São Paulo existia no código desde 07/08/2026, mas o segredo da região nunca foi
  cadastrado no servidor; antes disso o padrão era `us-central1`. Há, portanto, **transferência
  internacional** de texto já anonimizado (LGPD art. 33), amparada nas cláusulas do CDPA do Google.
  [preencher: confirmar com o jurídico a base da transferência internacional.]
- **Não treinamento:** sob o **CDPA do Google**, os dados enviados **não** treinam modelos do provedor nem
  passam por revisão humana do provedor. (CDPA cobre LGPD; PDF pt-BR arquivado pela clínica.)
- **Superfícies:** língua (visão), anamnese→marcações, raciocínio clínico, rascunho de relatório/evolução,
  consulta à Biblioteca (RAG). Todas **sob demanda** (botão), nunca "ao vivo".
- **Revisão humana obrigatória:** nenhuma sugestão entra no prontuário sem aceite da profissional.
- **Minimização:** anonimização na origem + nome do paciente não enviado + only-on-demand
  (exceções da assistente financeira em §4.1 e da assistente na agenda em §4.2, com minimização própria).

### 4.1 Assistente da clínica — perguntas sobre o financeiro (novo tratamento, 2026-11)

- **Finalidade:** a administração pergunta à assistente sobre recebimentos e pendências da clínica
  (ex.: "quanto recebi em outubro?", "quais pacientes faltam pagar?") e recebe totais por área e a
  lista de quem deve ou está em dia, para lembrar a profissional de qual paciente se trata.
- **Quem pode:** só quem já vê o Financeiro no sistema (administração da clínica). A permissão é
  conferida no aparelho e de novo no servidor, pelo login de quem perguntou; recepção e profissionais
  não recebem esses dados.
- **Dados enviados à IA:** **primeiro nome** do paciente e **idade em anos** (calculada no aparelho;
  a data de nascimento não sai), área de atendimento, nome do profissional, valores, datas de
  vencimento e pagamento e situação. **Nunca:** sobrenome, data de nascimento, CPF, telefone, e-mail,
  endereço, carteirinha do convênio, diagnóstico, prontuário, evolução ou qualquer dado clínico.
- **Recorte:** só as linhas que respondem à pergunta, no máximo **93 dias** e **50 linhas** por
  pergunta; nunca a base inteira. A busca é feita no aparelho de quem perguntou, com as regras de
  acesso do banco (RLS).
- **Operador e local:** Google Cloud Vertex AI (Gemini), **multirregião dos EUA (`us`)**: há
  **transferência internacional** de dado pessoal **identificável** (primeiro nome + idade + valores),
  diferente das outras superfícies, que enviam texto anonimizado. Amparo: cláusulas do CDPA do Google
  (LGPD art. 33). [preencher: confirmar com o jurídico a base da transferência para este dado.]
- **Base legal:** [preencher com o jurídico] — candidata: legítimo interesse do controlador na gestão
  financeira dos serviços prestados (art. 7º, IX) e/ou execução de contrato com o paciente/responsável
  (art. 7º, V), com teste de balanceamento registrado. Não é tratamento de dado de saúde para fins
  clínicos; a área de atendimento, porém, revela que a pessoa é paciente da clínica.
- **Retenção:** nada fica no Google além do processamento da resposta (CDPA: sem treino, sem revisão
  humana do provedor). A conversa vive só na memória da aba do navegador. O uso fica registrado em
  `ai_usage_events` **sem conteúdo** (só tokens, ação e quem usou). Nada financeiro em log.
- **"Corrigir":** numa resposta com dado financeiro, a correção guarda só a nota de quem corrige (sem a
  resposta original nem os dados) e **nunca** vira correção compartilhada com outras clínicas.
- **Crianças e adolescentes:** ver §9 — este fluxo envia primeiro nome + idade de **criança** para
  fora do Brasil.

### 4.2 Assistente da clínica — perguntas sobre a agenda com paciente (novo tratamento, 2026-11)

- **Finalidade:** quem trabalha na clínica pergunta à assistente sobre a agenda (ex.: "quem eu atendo
  amanhã?", "quando é a próxima sessão da Vitória?", "quem faltou duas vezes no mês?",
  "aniversariantes da semana") e recebe a lista com o primeiro nome e a idade, para saber de quem se
  trata sem abrir a Agenda. A assistente também pode **preparar** uma mensagem de confirmação ou de
  falta e abrir "Novo agendamento" preenchido, mas quem envia e quem salva é sempre a pessoa (nada é
  enviado, gravado ou agendado sozinho).
- **Quem pode:** quem já vê aquela agenda no sistema, com o próprio login: administração, recepção
  (a agenda é dela; nada clínico) e profissionais. Diferente do §4.1, **não é só a administração**.
  Cada pessoa recebe só o que a tela da Agenda já mostra a ela, pelas regras de acesso do banco (RLS).
- **Dados enviados à IA:** **primeiro nome** e **idade em anos** do paciente (calculada no aparelho; a
  data de nascimento não sai), dia e hora, área, tipo de atendimento, nome do profissional e situação do
  agendamento; em "aniversariantes", só que faz aniversário no período, nunca a data de nascimento.
  **Nunca:** sobrenome, data de nascimento, CPF, telefone, e-mail, endereço, carteirinha, observações do
  cadastro, diagnóstico, prontuário, texto de evolução, respostas de escala ou de anamnese, ou qualquer
  dado clínico. Dois pacientes com o mesmo primeiro nome são diferenciados só pela idade e pelo
  profissional; se ainda empatar, a assistente diz que há dois com o mesmo nome.
- **Recorte:** só as linhas que respondem à pergunta, no máximo **93 dias** e **50 linhas**; nunca a
  agenda inteira. A busca é feita no aparelho de quem perguntou. O servidor recusa a resposta inteira
  se aparecer qualquer coisa além do primeiro nome (sobrenome, nome disfarçado, CPF, e-mail, data).
- **Operador e local:** Google Cloud Vertex AI (Gemini), **multirregião dos EUA (`us`)**: transferência
  internacional de dado pessoal **identificável** (primeiro nome + idade + área + horário). Amparo:
  cláusulas do CDPA do Google (LGPD art. 33). [preencher: confirmar com o jurídico a base da
  transferência para este dado.]
- **Base legal:** [preencher com o jurídico] — candidatas: execução de contrato com o paciente ou
  responsável (organização dos atendimentos contratados, art. 7º, V) e/ou legítimo interesse na gestão
  da agenda (art. 7º, IX), com teste de balanceamento. A área de atendimento revela que a pessoa é
  paciente da clínica e em que área; avaliar com o jurídico se isso a aproxima de dado de saúde
  (art. 11) e qual base vale nesse caso.
- **Retenção:** igual ao §4.1: nada fica no Google além do processamento; conversa só na memória da aba;
  uso registrado em `ai_usage_events` sem conteúdo; nada da agenda em log.
- **"Corrigir":** numa resposta com paciente, a correção guarda só a nota de quem corrige, fica só com
  essa pessoa e nunca vira correção compartilhada.
- **Crianças e adolescentes:** ver §9 — este fluxo envia primeiro nome + idade de **criança** para fora
  do Brasil, e para mais pessoas da equipe que o §4.1.

---

## 5. Necessidade e proporcionalidade

- Coleta limitada à finalidade clínica; campos sensíveis só quando necessários.
- Anonimização reduz exposição de identificadores diretos à IA.
- A IA processa nos EUA (multirregião `us`), só com texto anonimizado e sob o CDPA; se o Google
  passar a oferecer um modelo atual em São Paulo, a região volta para o Brasil (`GCP_LOCATION`).
- Acesso restrito por RLS/perfil; criptografia em repouso para dados sensíveis.

---

## 6. Matriz de risco (resumo)

| # | Risco ao titular | Prob. | Impacto | Medidas mitigadoras | Residual |
|---|---|---|---|---|---|
| 1 | Acesso indevido a prontuário | Baixa | Alto | RLS, criptografia, perfis, logs, senha forte/troca obrigatória | Baixo |
| 2 | Vazamento via IA (texto sensível) | Baixa | Alto | Anonimização na origem, nome não enviado, Vertex na multirregião dos EUA, CDPA não-treino | Baixo |
| 3 | Foto de língua exposta | Baixa | Médio | Bucket privado + RLS, URL assinada sob demanda, EXIF removido | Baixo |
| 4 | Sugestão de IA tratada como diagnóstico | Média | Alto | Revisão humana obrigatória, avisos na UI e no termo, sem decisão automatizada | Baixo/Médio |
| 5 | Dados de menores sem consentimento adequado | Média | Alto | §9; consentimento do responsável; minimização | Médio (reduzir com fluxo formal de consentimento) |
| 6 | Credencial de serviço (GCP) exposta | Baixa | Alto | Secret no Supabase (servidor), nunca no frontend; rotação em incidente | Baixo |
| 7 | Uso do fallback local em dispositivo compartilhado | Baixa | Médio | Aviso no termo; orientar não usar em produção/dispositivo público | Baixo |
| 8 | Primeiro nome + idade de paciente (inclui criança) e valores enviados ao Vertex nos EUA pela assistente financeira | Média | Médio | §4.1: só administração (conferida no servidor), sem sobrenome/nascimento/contato/dado clínico, recorte de 93 dias e 50 linhas, CDPA não-treino, uso registrado sem conteúdo, Corrigir sem dados | Baixo/Médio (depende da base legal e do aviso ao responsável, §9) |
| 9 | Primeiro nome + idade de paciente (inclui criança) com dia, hora e área enviados ao Vertex nos EUA pela assistente na agenda, para toda a equipe que vê a agenda | Média | Médio | §4.2: só o que a pessoa já vê na Agenda (RLS, login dela), sem sobrenome/nascimento/contato/dado clínico, recorte de 93 dias e 50 linhas, servidor recusa resposta com mais que o primeiro nome, CDPA não-treino, uso sem conteúdo, Corrigir sem dados, ações só preparadas | Baixo/Médio (depende da base legal, do art. 11 e do aviso ao responsável, §9) |

> Reavaliar probabilidades/impactos com o DPO. Itens [preencher] exigem decisão da clínica.

---

## 7. Medidas de segurança (técnicas e organizacionais)

- RLS por terapeuta; RPC com criptografia de dados sensíveis; bucket privado para imagens.
- Segredos (chave de serviço GCP, chaves Supabase) apenas no servidor.
- Anonimização automática do texto antes da IA.
- Logs de auditoria administrativa; sem log de conteúdo clínico nas Edge Functions.
- Controle de acesso por perfil (SuperAdm × terapeuta); troca de senha no 1º acesso.
- [preencher: política de backup, MFA, gestão de acessos, treinamento da equipe].

---

## 8. Direitos dos titulares e canais

- Confirmação, acesso, correção, eliminação (quando cabível), informação sobre compartilhamento,
  revogação de consentimento (quando for a base) — via **Encarregado** [preencher].
- Prazo e procedimento de atendimento às solicitações: [preencher].

---

## 9. Crianças e adolescentes

- Caso haja pacientes menores de 18: prevalência do **melhor interesse**; consentimento específico e em
  destaque do **responsável legal**, salvo hipóteses legais que o dispensem (ex.: tutela da saúde).
- Coleta mínima; informar o responsável, em linguagem clara, sobre finalidade e uso de IA (§4).
- **Decisão da clínica:** o sistema atende menores? **SIM (confirmado)** — a Reability atende público
  infantojuvenil. [preencher: idade mínima; como/onde será colhido e guardado o consentimento do
  responsável legal; quais dados do responsável serão registrados.]
- Enquanto não houver fluxo formal e documentado de consentimento do responsável, o risco "dados de
  menores sem consentimento adequado" NÃO deve ser classificado como baixo (ver §6, item 5).
- **Assistente financeira (§4.1):** este fluxo manda **primeiro nome + idade de criança ou adolescente**,
  com valores e datas, para processamento **fora do Brasil** (Vertex, EUA). Medidas: sem sobrenome, sem
  data de nascimento, sem contato, sem dado clínico; só a administração; recorte limitado; sem retenção
  no provedor. O aviso de privacidade ao responsável legal deve citar esse uso (IA de apoio à gestão
  financeira, processada nos EUA). [preencher: confirmar com o jurídico se o melhor interesse da criança
  está atendido ou se este fluxo deve excluir menores.]
- **Assistente na agenda (§4.2):** também manda **primeiro nome + idade de criança ou adolescente**, com
  dia, hora e área do atendimento, para fora do Brasil, e para mais pessoas da equipe (recepção e
  profissionais, não só a administração). Mesmas medidas do §4.1, mais: só o que a pessoa já vê na
  Agenda; ações só preparadas. O aviso ao responsável legal deve citar também esse uso (IA de apoio à
  organização da agenda, processada nos EUA). [preencher: confirmar com o jurídico.]

---

## 10. Conclusão e plano de ação

**Avaliação preliminar:** com as salvaguardas implementadas (anonimização, processamento de IA restrito aos EUA, CDPA
não-treino, revisão humana, RLS/criptografia), o risco residual tende a **baixo/médio**, condicionado às
pendências abaixo.

**Plano de ação / pendências:**
- [x] Identificação do controlador (Reability LTDA, CNPJ, endereço, responsável técnica).
- [ ] **Nomear formalmente o Encarregado (DPO)** e definir um canal LGPD dedicado (e-mail próprio) — hoje só há contato institucional interino.
- [ ] Definir e registrar o **prazo de guarda/eliminação** (varia por conselho — ex.: CRP ~5 anos, CRM 20 anos; confirmar com jurídico) e o destino dos dados quando um profissional deixar a clínica.
- [ ] **Formalizar o fluxo de consentimento do responsável** para menores (idade mínima, meio de coleta, guarda da prova, dados do responsável).
- [ ] Consentimento/aviso de privacidade do **PACIENTE** ao nível da clínica (papel/PDF, fora do sistema — o termo do app é só do profissional).
- [ ] Arquivar o **CDPA do Google** (PDF pt-BR) e o **DPA do Supabase**; registrar a região dos backups.
- [ ] Definir política de segurança operacional: **MFA**, backup (frequência/retenção/responsável), revisão e desligamento de acessos, treinamento LGPD da equipe.
- [ ] **Assistente na agenda (§4.2, 2026-11):** texto aprovado pela clínica em 10/11/2026; base legal (e se a área de atendimento puxa o art. 11) e base da transferência internacional com o
  jurídico; incluir no aviso ao responsável legal e no registro das operações de tratamento.
- [ ] **Assistente financeira (§4.1, 2026-11):** texto aprovado pela clínica em 09/11/2026; base legal e base
  da transferência internacional de dado identificável com o jurídico; aviso ao responsável legal sobre
  o envio de primeiro nome + idade de criança aos EUA (§9); atualizar o registro das operações de
  tratamento com esta finalidade.
- [ ] **Revisão jurídica/DPO final** deste RIPD e do termo do profissional.

**Aprovações:**
- Encarregado (DPO): __________________ — data: ____/____/____
- Responsável legal/controlador: __________________ — data: ____/____/____
