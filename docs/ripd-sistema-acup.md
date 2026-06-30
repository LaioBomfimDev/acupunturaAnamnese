# RIPD — Relatório de Impacto à Proteção de Dados Pessoais
## Sistema Acup — plataforma clínica integrativa (acupuntura/MTC) com IA assistiva

> ⚠️ **Documento interno de conformidade (LGPD).** Não é peça pública nem substitui parecer jurídico.
> Modelo preenchido com os fatos técnicos do sistema; os campos `[preencher]` dependem da clínica/DPO.
> **Revisar e validar com advogado(a)/Encarregado(a) antes de considerar concluído.**
> Base: LGPD (Lei 13.709/2018) e orientações da ANPD sobre RIPD (alto risco: dados sensíveis,
> tecnologias emergentes/IA e dados de crianças/adolescentes).

| Campo | Valor |
|---|---|
| Versão | 1.0 (rascunho) |
| Data | 2026-06-14 |
| Responsável pela elaboração | [preencher] |
| Encarregado (DPO) | [preencher: nome, e-mail/telefone] |
| Controlador | [preencher: razão social/nome, CNPJ ou registro, endereço] |
| Status | Rascunho — pendente de revisão jurídica/DPO |

---

## 1. Descrição geral do tratamento

**Natureza:** plataforma clínica para profissionais de acupuntura/MTC (uso multiprofissional). Registra
cadastro de pacientes, anamnese, inspeção de língua (incl. fotos), pulso, raciocínio clínico, protocolos,
evolução e relatórios; oferece módulos de **IA assistiva** (sugestões revisadas pela profissional).

**Finalidades:** apoio ao atendimento clínico, organização de prontuário/registro, geração de relatórios e
consulta a base de conhecimento. A IA **não** toma decisão automatizada com efeito jurídico/relevante —
toda saída exige **revisão humana**.

**Titulares:** pacientes (incl. **possivelmente crianças/adolescentes** — ver §9) e profissionais usuários.

**Abrangência:** [preencher: nº aproximado de profissionais/pacientes, abrangência geográfica].

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
- **Controlador:** clínica/profissional [preencher].
- **Operadores/subprocessadores:** **Supabase** (banco, auth, storage) e **Google Cloud Vertex AI** (IA).

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
| 5 | Dados de menores sem consentimento adequado | [preencher] | Alto | §9; consentimento do responsável; minimização | [preencher] |
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
- **Decisão da clínica:** o sistema atende menores? [preencher: sim/não]. Se sim, anexar fluxo de
  consentimento do responsável.

---

## 10. Conclusão e plano de ação

**Avaliação preliminar:** com as salvaguardas implementadas (anonimização, residência no Brasil, CDPA
não-treino, revisão humana, RLS/criptografia), o risco residual tende a **baixo/médio**, condicionado às
pendências abaixo.

**Plano de ação / pendências:**
- [ ] Preencher identificação do controlador e do Encarregado (DPO).
- [ ] Definir e registrar prazo de retenção/eliminação.
- [ ] Decidir e documentar o tratamento de menores (e fluxo de consentimento do responsável).
- [ ] Elaborar/colher o **consentimento do PACIENTE** (documento separado deste RIPD e do termo do profissional).
- [ ] Arquivar o CDPA (PDF pt-BR) e validar base legal de saúde com jurídico.
- [ ] Revisão jurídica/DPO deste RIPD e do termo do profissional.

**Aprovações:**
- Encarregado (DPO): __________________ — data: ____/____/____
- Responsável legal/controlador: __________________ — data: ____/____/____
