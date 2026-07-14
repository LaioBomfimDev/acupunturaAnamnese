# Plano — Anamnese multidisciplinar (MTC / Psicologia / Fisioterapia)

Documento de trabalho. Objetivo duplo:

1. **Registrar o que já existe** na anamnese de acupuntura (MTC) — como é criada, como a IA
   participa, como vira relatório/PDF, e o que é o "gate humano".
2. **Propor a estrutura** para as futuras anamneses de **Psicologia** e **Fisioterapia**,
   num formato que a profissional (psicóloga) possa **ler e aprovar** antes de qualquer código.

> Nada aqui está implementado para psicologia/fisioterapia ainda. É a planta antes da obra —
> igual foi feito com a dietoterapia (`docs/plano-dietoterapia.md`): desenhar, aprovar, só então construir.
>
> **Atualização 2026-07-07:** a psicóloga aprovou o desenho ("tudo como ela já pensou") e pediu
> escolha de qual anamnese trabalhar no momento + avaliação neuropsicológica como modalidade.
> A ESTRUTURA do sistema (hub de disciplinas, paciente da clínica, encaminhamento, papéis)
> está em `docs/plano-clinica-multidisciplinar.md` — este doc segue valendo para o CONTEÚDO
> de cada anamnese.

---

## Parte 1 — O que já fizemos na anamnese de acupuntura (MTC)

A anamnese atual não é "um formulário". São **cinco camadas** que se encaixam. Entender essa
divisão é o que permite reaproveitar o motor para outras profissões sem refazer tudo.

### Camada 1 — Coleta (o formulário)
Arquivo: [Anamnese.jsx](frontend/src/components/panels/Anamnese.jsx) + [checklists.js](frontend/src/data/checklists.js)

- **Texto livre** (queixa, história, observações de sono/emoções/digestão/dor, medicações, atividade física).
- **Checklists fechados** agrupados por domínio: queixa, sono, emoções, digestão, fezes, dor,
  regiões de dor, clima, histórico clínico, substâncias, segurança.
- **Módulos condicionais**: o bloco ginecológico/urogenital só aparece conforme o *sexo clínico
  informado* — nunca presumido. Se não informou, o sistema não presume anatomia nem ciclo.
- Os checklists são um **vocabulário fechado** (catálogo em `checklists.js`). Isso é o segredo
  da inteligência: como os itens são padronizados, a IA e os relatórios têm "palavras" estáveis
  para raciocinar, em vez de texto solto.

### Camada 2 — Inteligência assistiva (a IA que lê e sugere)
Arquivos: [anamneseAiService.js](frontend/src/services/anamneseAiService.js) → Edge Function [suggest-marks](supabase/functions/suggest-marks/index.ts)

- A profissional escreve a queixa em texto livre e clica **"Sugerir marcações com IA"** (sob
  demanda, nunca automático).
- A IA (Google Gemini 2.5 flash, via Vertex AI) lê o texto e **sugere quais itens do checklist
  marcar** — cada sugestão vem com **justificativa curta** e **faixa de confiança** (alta/média/baixa).
- **A IA não pode inventar item fora do catálogo**: a saída é restrita por schema ao próprio
  `checklists.js`. Ela escolhe de uma lista fechada, não redige diagnóstico.
- **Só o que a profissional aceitar entra no checklist.** Aceitar/Ignorar é decisão humana.
- Sinais de **segurança** (gestação, anticoagulante, dor torácica, perda de peso, etc.) têm
  prioridade de sugestão.

### Camada 3 — Privacidade (o que sai do computador)
Arquivo: `frontend/src/utils/anonymize.js` + regras nas próprias funções

- O texto é **anonimizado no navegador ANTES de ir para a IA**: nome, CPF, telefone e datas
  viram marcadores (`[NOME]`, `[DATA]`…). O dado bruto nunca sai do browser.
- As Edge Functions **nunca gravam em log o texto do paciente**.
- Toda chamada exige **login válido (JWT)**; a IA roda por conta de serviço no servidor, sem
  expor chaves no frontend.
- Base legal já documentada (LGPD/RIPD interno).

### Camada 4 — O gate humano e o loop de ensino (como a IA "é treinada")
Arquivos: [aiCorrectionService.js](frontend/src/services/aiCorrectionService.js) + [_shared/corrections.ts](supabase/functions/_shared/corrections.ts) + [AnamneseKnowledgePanel.jsx](frontend/src/components/panels/AnamneseKnowledgePanel.jsx)

Aqui está o ponto mais importante para a psicóloga entender: **a IA não "aprende sozinha".
Ela é ensinada por curadoria humana, em duas frentes.**

- **Correção pontual ("Corrigir"):** em cada sugestão da IA existe um botão *Corrigir*. A
  correção é guardada e **reinjetada no prompt** nas próximas vezes — imediata para a autora,
  e **global só depois de aprovação do SuperAdm**.
- **Curadoria de conhecimento:** o conteúdo clínico (achados → padrões, perguntas) é extraído
  de livros/fontes e fica em `review`/`draft` até um profissional habilitado aprovar. Nada
  entra na "inteligência" sem esse aval. Fonte da verdade = o livro + a lógica da MTC.
- Regra de ouro do sistema (vale para todas as disciplinas): **"a IA é colaboradora rápida, não
  autoridade clínica"** — sem diagnóstico nem conduta automáticos.

### Camada 5 — Saída: relatório, evolução e PDF
Arquivos: [Relatorio.jsx](frontend/src/components/panels/Relatorio.jsx) → Edge Function [draft-narrative](supabase/functions/draft-narrative/index.ts)

- A IA transforma **dados já estruturados** (queixa, hipótese, protocolo) em **texto corrido**,
  em três modos: *resumo clínico interno*, *relatório profissional* e *orientação ao paciente*.
- A IA **não recebe o nome do paciente** (fala "o paciente"); o nome real fica no template, fora da IA.
- Ela **não pode inventar** sinais/condutas que não estejam nos dados — é um redator, não um diagnosticador.
- O relatório sai com **papel timbrado, logo e marca d'água**, e é impresso paginado (rodapé
  sempre no pé da folha). Vira PDF pela impressão do navegador.

### Resumo da filosofia (o que "vendemos" para a profissional)
| Princípio | Como aparece na prática |
|---|---|
| A IA sugere, o humano decide | Aceitar/Ignorar; nada entra sozinho |
| Vocabulário fechado e curado | Checklists + padrões aprovados por profissional |
| Privacidade por padrão | Anonimização no navegador; sem log de paciente |
| Confiança honesta | Faixas alta/média/baixa, sem falsa certeza |
| Segurança em primeiro lugar | Bloco de sinais de alerta com prioridade |

---

## Parte 2 — Proposta para Psicologia e Fisioterapia

### 2.1 A ideia central: **mesmo motor, vocabulários diferentes**

O que dá para reaproveitar **sem mudar** (o "motor"):
- coleta (texto livre + checklists), anonimização, gate humano, botão *Corrigir*, faixas de
  confiança, gerador de relatório/PDF, bloco de segurança.

O que é **específico de cada profissão** (o "conteúdo") e precisa ser desenhado por especialista:
- **quais campos de texto livre** a anamnese tem;
- **quais checklists** (o vocabulário fechado);
- **qual é a "camada de raciocínio"** — na MTC são os *padrões energéticos*; na psicologia seria
  uma *formulação/eixo de hipóteses* (a definir COM a psicóloga); na fisio, um *diagnóstico funcional*;
- **o que a IA pode e não pode sugerir** naquela profissão;
- **os sinais de alerta/segurança** próprios (na psicologia, p.ex., risco de suicídio/autolesão).

Tecnicamente, isso vira o conceito de **"disciplina"** ligado ao profissional/atendimento:
`acupuntura`, `psicologia`, `fisioterapia`. Cada disciplina carrega seu próprio pacote de
formulário + checklists + prompt de IA + camada de raciocínio. (Já existe cadastro
multiprofissional com conselho/especialidade — é o gancho natural para plugar isso.)

### 2.2 Psicologia — rascunho para a psicóloga revisar

> **Tudo abaixo é sugestão inicial, feita por leigo em psicologia, de propósito conservadora.
> A psicóloga é a autoridade: pode cortar, trocar, reescrever tudo. As perguntas em 2.4 são o
> que precisamos que ela decida.**

**Campos de texto livre (sugestão):**
- Demanda/queixa principal (nas palavras da pessoa)
- História da demanda / o que motivou a busca agora
- História pessoal e de vida relevante
- Histórico de saúde mental e tratamentos anteriores (incl. medicação psiquiátrica)
- Rede de apoio / contexto familiar e social
- Observações da sessão

**Checklists / vocabulário fechado (sugestão bem preliminar — a validar):**
- Estado do humor (ex.: tristeza persistente, apatia, oscilações, irritabilidade)
- Ansiedade (ex.: preocupação excessiva, sintomas físicos, evitação, pânico)
- Sono (reaproveitável do módulo atual)
- Funcionamento (trabalho/estudo, relações, autocuidado)
- Uso de substâncias
- **Segurança/risco (crítico e obrigatório):** ideação suicida, autolesão, risco a terceiros,
  sinais de crise — com destaque e orientação de encaminhamento.

**O que a IA faria (versão conservadora proposta):**
- Ler o texto e **sugerir marcações de checklist** (igual à MTC) — organizar, não interpretar.
- **Redigir rascunho** de registro de sessão / evolução a partir do que a psicóloga marcou.
- **Sinalizar sinais de risco** presentes no texto, para conferência humana.

**O que a IA NÃO faria (proposta, a confirmar com ela):**
- Não dar diagnóstico psicológico/psiquiátrico (CID/DSM), nem "formulação de caso" automática.
- Não interpretar conteúdo, sonhos, transferência, etc.
- Não sugerir conduta terapêutica, técnica ou intervenção.
- Não tomar nenhuma decisão sobre risco — apenas destacar para o olhar humano.

**Ética e sigilo:** psicologia tem exigências próprias (CFP, sigilo profissional). A mesma
anonimização + gate humano se aplicam, mas as **regras de guarda de registro e de risco**
precisam ser definidas por ela.

**Estrutura implementada para revisão em 2026-07-14:**

- boas-vindas com Anamnese infantil, Anamnese adulto e Avaliação;
- segunda etapa com infantil menina/menino (até 17 anos) e adulto mulher/homem;
- perguntas específicas orientadas por sexo clínico apenas quando pertinentes, sem presumir
  anatomia, contexto reprodutivo ou diagnóstico;
- autoria por campo na anamnese infantil (mãe, pai, outro responsável, paciente, resposta
  conjunta ou outro informante), com versões históricas para comparar relatos posteriores;
- todo campo livre mantém atalhos de digitação e correção ortográfica nativa em pt-BR;
- evolução existe para todo acompanhamento, independentemente de avaliação;
- avaliação é registro separado com roteiro inicial de dez sessões ajustáveis, instrumentos,
  observações, resultados factuais, integração profissional e relatório;
- hipóteses vindas da leitura/PDF permanecem em revisão até edição ou aceite profissional;
- relatório usa dados estruturados como gatilhos, gera somente rascunho editável e bloqueia
  impressão até revisão profissional.

### 2.3 Fisioterapia — esboço (a detalhar depois, com fisioterapeuta)
Estrutura análoga: queixa + história; checklists de dor/função/amplitude/força; testes
funcionais; camada de raciocínio = **diagnóstico cinético-funcional**; segurança = sinais de
alerta (red flags) para encaminhamento. Fica para uma segunda rodada — o foco agora é a psicologia.

### 2.4 Decisões que dependem da psicóloga (o que precisamos que ela aprove)

Estas são as perguntas para colar no material que você vai enviar a ela:

1. **Papel da IA:** você concorda com uma IA que **só organiza e redige rascunho** (nunca
   diagnostica nem interpreta), com você aprovando tudo? Ou prefere sem IA em alguma etapa?
2. **Campos:** quais blocos de texto livre a anamnese de psicologia deve ter?
3. **Checklists:** existe um vocabulário fechado que faça sentido para você (humor, ansiedade,
   sono, funcionamento…)? Quais itens? Ou você prefere trabalhar só em texto livre?
4. **Camada de raciocínio:** existe algo equivalente aos "padrões" da MTC que você queira que o
   sistema organize (eixos, hipóteses, formulação)? Ou isso deve ficar 100% na sua cabeça/escrita?
5. **Risco/segurança:** quais sinais de alerta o sistema deve destacar, e qual a conduta que o
   sistema deve *lembrar* (não decidir) — texto de encaminhamento, protocolo da clínica?
6. **Relatório:** quais formatos de saída você usa (registro interno, relatório para paciente,
   documento para outro profissional)? Que campos são obrigatórios/proibidos?
7. **Sigilo e guarda:** há exigências do CFP sobre registro, retenção e compartilhamento que
   precisamos embutir?

### 2.5 Fases de implementação e revisão
0. **Primeiro desenho funcional para a psicóloga/neuropsicóloga revisar.** Implementado; revisão pendente.
1. Introduzir o conceito de **disciplina** no cadastro/atendimento (acupuntura já é a default).
2. Empacotar a anamnese de MTC como "disciplina acupuntura" (refactor sem mudança de comportamento).
3. Criar o **pacote de psicologia**: campos + checklists + prompt de IA + bloco de risco. Implementado em rascunho.
4. Curadoria: revisar com a psicóloga o vocabulário e o comportamento da IA (loop *Corrigir*).
5. Relatório/PDF de psicologia. Rascunho assistido implementado; estrutura clínica e deploy pendentes de validação.
6. Só então repetir o ciclo para fisioterapia.

> Invariantes que não mudam em nenhuma disciplina: **gate humano, anonimização, sem
> diagnóstico/conduta automáticos, confiança em faixas, curadoria por profissional habilitado.**
> (AGENTS.md §0 e §8.)
</invoke>
