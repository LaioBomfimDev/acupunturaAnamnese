# RIPD — Relatório de Impacto à Proteção de Dados Pessoais
## Sistema Acup — plataforma clínica integrativa (acupuntura/MTC) com IA assistiva

> ⚠️ **Documento interno de conformidade (LGPD).** Não é peça pública nem substitui parecer jurídico.
> Modelo preenchido com os fatos técnicos do sistema; os campos `[preencher]` dependem da clínica/DPO.
> **Revisar e validar com advogado(a)/Encarregado(a) antes de considerar concluído.**
> Base: LGPD (Lei 13.709/2018) e orientações da ANPD sobre RIPD (alto risco: dados sensíveis,
> tecnologias emergentes/IA e dados de crianças/adolescentes).

| Campo | Valor |
|---|---|
| Versão | 1.0 |
| Data | 2026-06-30 |
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
   acionam o **Google Cloud Vertex AI (Gemini)** na **região do Brasil (São Paulo)**. Antes de enviar,
   o **texto é anonimizado no cliente** (mascara nome, CPF, telefone, e-mail, datas, CEP — `utils/anonymize.js`)
   e o **nome do paciente não é enviado**. As funções **não registram** o conteúdo do paciente em log.
4. **Retenção:** [preencher: prazo de guarda — em regra ≥ 20 anos para prontuário; confirmar com o conselho].
5. **Eliminação/anonimização:** ao fim da finalidade e dos prazos legais.

**Agentes de tratamento:**
- **Controlador:** Reability – Núcleo de Desenvolvimento Neurológico LTDA (CNPJ 53.351.769/0001-10), Catu-BA. Responsável técnica: Denise Neves (CRP 03/10696). [preencher: confirmar responsável legal da PJ no contrato social.]
- **Operadores/subprocessadores:** **Supabase** (banco, auth, storage) e **Google Cloud Vertex AI** (IA). [preencher: arquivar DPA do Supabase e o CDPA do Google; região dos backups.]

---

## 4. IA — descrição e salvaguardas

- **Modelo:** Gemini (`gemini-2.5-flash`) via **Vertex AI**, em **São Paulo** (residência de dados no Brasil).
- **Não treinamento:** sob o **CDPA do Google**, os dados enviados **não** treinam modelos do provedor nem
  passam por revisão humana do provedor. (CDPA cobre LGPD; PDF pt-BR arquivado pela clínica.)
- **Superfícies:** língua (visão), anamnese→marcações, raciocínio clínico, rascunho de relatório/evolução,
  consulta à Biblioteca (RAG). Todas **sob demanda** (botão), nunca "ao vivo".
- **Revisão humana obrigatória:** nenhuma sugestão entra no prontuário sem aceite da profissional.
- **Minimização:** anonimização na origem + nome do paciente não enviado + only-on-demand.

---

## 5. Necessidade e proporcionalidade

- Coleta limitada à finalidade clínica; campos sensíveis só quando necessários.
- Anonimização reduz exposição de identificadores diretos à IA.
- Processamento no Brasil evita transferência internacional para a parte de IA.
- Acesso restrito por RLS/perfil; criptografia em repouso para dados sensíveis.

---

## 6. Matriz de risco (resumo)

| # | Risco ao titular | Prob. | Impacto | Medidas mitigadoras | Residual |
|---|---|---|---|---|---|
| 1 | Acesso indevido a prontuário | Baixa | Alto | RLS, criptografia, perfis, logs, senha forte/troca obrigatória | Baixo |
| 2 | Vazamento via IA (texto sensível) | Baixa | Alto | Anonimização na origem, nome não enviado, Vertex no Brasil, CDPA não-treino | Baixo |
| 3 | Foto de língua exposta | Baixa | Médio | Bucket privado + RLS, URL assinada sob demanda, EXIF removido | Baixo |
| 4 | Sugestão de IA tratada como diagnóstico | Média | Alto | Revisão humana obrigatória, avisos na UI e no termo, sem decisão automatizada | Baixo/Médio |
| 5 | Dados de menores sem consentimento adequado | Média | Alto | §9; consentimento do responsável; minimização | Médio (reduzir com fluxo formal de consentimento) |
| 6 | Credencial de serviço (GCP) exposta | Baixa | Alto | Secret no Supabase (servidor), nunca no frontend; rotação em incidente | Baixo |
| 7 | Uso do fallback local em dispositivo compartilhado | Baixa | Médio | Aviso no termo; orientar não usar em produção/dispositivo público | Baixo |

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

---

## 10. Conclusão e plano de ação

**Avaliação preliminar:** com as salvaguardas implementadas (anonimização, residência no Brasil, CDPA
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
- [ ] **Revisão jurídica/DPO final** deste RIPD e do termo do profissional.

**Aprovações:**
- Encarregado (DPO): __________________ — data: ____/____/____
- Responsável legal/controlador: __________________ — data: ____/____/____
