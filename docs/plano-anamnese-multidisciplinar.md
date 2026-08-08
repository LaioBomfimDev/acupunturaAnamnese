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

> **REMOVIDA na Acupuntura em 07/08/2026** (decisão do dono do produto). Na prática a
> superfície espelhava o checklist já preenchido à mão, não persistia aceite/ignorado e
> não alimentava calibração — ver `docs/mapa-gatilhos-ia-frontend.md`. A descrição abaixo
> permanece como registro do desenho, e continua **válida para a Psicologia**, cuja
> "Revisão assistida" (`psych-suggest-marks`) segue o mesmo contrato.

Arquivos (removidos): `anamneseAiService.js` → Edge Function `suggest-marks`

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
- **contexto específico em módulos abertos por pertinência, não por sexo** (revisto em
  07/08/2026 — ver §2.4);
- autoria por campo na anamnese infantil (mãe, pai, outro responsável, paciente, resposta
  conjunta ou outro informante), com versões históricas para comparar relatos posteriores;
- todo campo livre mantém atalhos de digitação e correção ortográfica nativa em pt-BR;
- evolução existe para todo acompanhamento, independentemente de avaliação;
- avaliação é registro separado com roteiro inicial de dez sessões ajustáveis, instrumentos,
  observações, resultados factuais, integração profissional e relatório;
- hipóteses vindas da leitura/PDF permanecem em revisão até edição ou aceite profissional;
- perguntas sugeridas pela IA não entram automaticamente na ficha: a profissional seleciona,
  revisa a redação e responde em uma aba própria de Perguntas complementares. Cada resposta
  pode identificar o informante, alimenta as próximas leituras e só entra no relatório quando
  houver sido selecionada e registrada;
- relatório usa dados estruturados como gatilhos, gera somente rascunho editável e bloqueia
  impressão até revisão profissional.

### 2.4 Contexto por pertinência, não por sexo (revisão de 2026-08-07)

**O que havia:** cada perfil por sexo clínico carregava um bloco próprio com **um único
campo** genérico (`adultContextoFeminino`, `adultContextoMasculino`, `childContextoFeminino`,
`childContextoMasculino`). Era a única diferença entre "adulto mulher" e "adulto homem".

**Problema apurado:** o gatilho estava errado. O dado clinicamente útil nunca é "é mulher" —
é "existe contexto hormonal", "existe sobrecarga de cuidado", "existe violência do parceiro".
Amarrar ao sexo produzia campo vazio (pergunta que não cabe no caso) e campo ausente (homem
como cuidador principal, mulher sem qualquer queixa reprodutiva). Também contradizia a regra
que a própria IA já segue: nunca presumir anatomia, ciclo, identidade ou queixa a partir de
sexo/gênero.

**O que passa a valer:** o roteiro fixo depende só da **faixa etária** (adulto: 5 seções;
infantil: 7 seções — a distinção é real). O contexto específico vira **módulo aberto por
pertinência**, disponível em qualquer percurso. O perfil escolhido apenas **pré-abre** os
módulos que costumam interessar; a profissional abre e fecha qualquer um, e fechar apenas
esconde — o que já foi escrito permanece guardado.

Módulos implementados (`data/psychologyContextModules.js`), 4 campos cada, com perguntas de
escuta. Rodada 1 em 07/08/2026; rodada 2 no mesmo dia:

| Módulo | Pré-aberto em | Cobre |
| --- | --- | --- |
| Ciclo, hormônios e reprodução | adulto mulher | ciclo e humor, gestação/puerpério/perdas, climatério, contracepção hormonal |
| Violência, segurança e coerção | adultos | situação, autor e contexto, rede de proteção, plano de segurança |
| Parentalidade e carga de cuidado | adultos | de quem cuida, divisão e carga mental, impacto no sofrimento, projeto parental |
| Sexualidade, corpo e imagem corporal | adultos | queixa sexual, impacto relacional, imagem corporal, recursos e substâncias |
| Trabalho, provisão e identidade | adultos | significado do trabalho, quem sustenta, desemprego/afastamento, ambiente e assédio |
| Expressão emocional e busca de ajuda | adultos | repertório para nomear, como o sofrimento aparece, barreiras para pedir ajuda, modelos familiares |
| Identidade de gênero e orientação sexual | **nenhum** | autodefinição e pronomes, vínculos, aceitação e discriminação, processos de afirmação |
| Puberdade e desenvolvimento corporal | infantil **a partir de 9 anos** | sinais e início, informação e preparo, imagem do corpo, autonomia e privacidade |
| Proteção e segurança infantil | infantil | supervisão e cuidados básicos, sinais de proteção, segurança digital, rede e encaminhamento |

Três regras que os testes protegem:

- **Identidade de gênero nunca é pré-aberta** por perfil algum. Deduzir identidade do cadastro
  seria repetir exatamente a presunção que motivou a troca do modelo; quem informa é a pessoa.
- **Módulo com faixa etária (`suggestedMinAge`) só pré-abre com a idade conhecida e dentro da
  faixa.** Idade ausente não sugere — sugerir puberdade na ficha de uma criança de 4 anos é o
  campo vazio que se quis eliminar.
- **Violência (adulto) e proteção (infantil) exigem rastreio a sós**, nunca diante de
  acompanhante, responsável ou possível autor. Cada um tem campo próprio para o que foi
  combinado. Suspeita de violência contra criança tem **notificação compulsória (ECA)**: o
  sistema registra e lembra; a avaliação e a notificação são da profissional.

Testes: `psychology-context-modules.test.mjs` trava a regra — nenhuma seção do roteiro pode
voltar a depender do sexo, nenhum módulo pode ser exclusivo de um perfil, e fechar um módulo
não pode apagar conteúdo.

### 2.3 Motor genérico de anamnese (07/08/2026)

A partir daqui a anamnese deixou de ser código por disciplina e virou **configuração sobre um
motor único**:

| Peça | Arquivo | Papel |
| --- | --- | --- |
| Contrato | `data/anamneseKit.js` | monta e consulta a configuração; sessão, normalização e resumo |
| Registro | `data/anamneseRegistry.js` | disciplina → configuração |
| Tela | `components/anamnese/DisciplineAnamnese.jsx` | painel genérico da anamnese |
| Evolução | `components/anamnese/DisciplineEvolucao.jsx` | registro de sessões com indicadores comparáveis |
| Relatório | `components/anamnese/DisciplineRelatorio.jsx` | papel timbrado, paginação e dois modos |
| Shell | `components/DisciplineWorkspace.jsx` | sidebar, topbar, autosave e roteamento das abas |

**Relatório em dois modos** (07/08/2026), definidos por disciplina em `config.report.modes`:

- `scope: 'full'` — **registro interno**: ficha completa, eixos, sinais de risco com a conduta
  registrada e a evolução sessão a sessão. É prontuário.
- `scope: 'summary'` — **relatório externo**: só os campos declarados em `summaryFieldIds`, a
  formulação e os sinais de risco marcados. Não leva a anotação de conduta de risco nem a
  evolução detalhada, e carrega um aviso de que não substitui diagnóstico médico. Documento que
  sai da clínica não despeja a anamnese inteira — é decisão de privacidade, não de layout.

**Evolução:** indicadores numéricos por disciplina (fisio: EVA, amplitude, força, percepção de
melhora; nutrição: peso, cintura, adesão, sintomas) para comparar sessões, mais campos de texto
da conduta. O sistema alinha e guarda; não calcula tendência nem interpreta melhora.

Acrescentar uma disciplina passou a ser: escrever o arquivo de dados, registrar na tabela e
marcar `available: true` no hub. Nenhuma tela é duplicada.

A estrutura é sempre a mesma, porque a ordem da escuta é a mesma: **escuta livre → roteiro do
percurso → contexto por pertinência → sinais → risco → eixos de raciocínio**.

**Pendência conhecida:** a Psicologia ainda usa tela própria (`PsychologyAnamnese`), porque
carrega dois fluxos que as demais não têm — informante por campo e avaliação neuropsicológica.
Migrá-la para o componente genérico é trabalho de uma próxima rodada; até lá existe duplicação
consciente entre `PsychologyAnamnese.jsx` e `DisciplineAnamnese.jsx`.

### 2.4 Fisioterapia — implementada em 07/08/2026 (rascunho a validar)

Arquivo: `data/fisioterapiaAnamnese.js` · registro `fisio_anamnese`.

**Percursos por área**, porque a área muda de fato o exame, as escalas e os testes:
musculoesquelética (5 seções), neurofuncional (5), cardiorrespiratória (4) e pélvica (4).

**Raciocínio na CIF** — estrutura/função → atividade → participação, mais fatores ambientais e
pessoais, hipótese cinético-funcional e metas. É o vocabulário que a fisioterapia usa para
justificar conduta e não invade diagnóstico médico.

**Bandeiras vermelhas** como bloco de risco, cada uma com triagem, o que observar e conduta
lembrada: cauda equina, neoplasia/infecção, fratura, TVP, sinais cardiovasculares ao esforço e
déficit neurológico progressivo. Duas delas (cauda equina e TVP) trazem "não tratar/não
mobilizar" explícito.

**Módulos de contexto:** dor persistente e sensibilização; trabalho, ergonomia e afastamento;
esporte e retorno à prática; quedas e segurança domiciliar (a partir de 60 anos); gestação e
pós-parto.

### 2.5 Nutrição — implementada em 07/08/2026 (rascunho a validar)

Arquivo: `data/nutricaoAnamnese.js` · registro `nutri_anamnese`.

**Percursos por objetivo:** clínica/ambulatorial (4 seções), materno-infantil (5) e esportiva (4).

**Eixos:** consumo, antropometria, bioquímico/clínico, comportamento e relação com a comida,
contexto e acesso, diagnóstico nutricional em hipótese e metas pactuadas.

Duas escolhas de conteúdo que merecem registro:

- **Insegurança alimentar é bloco de risco, não curiosidade social.** Prescrever plano que a
  pessoa não tem como comprar é iatrogenia e produz culpa. A triagem pergunta se a comida
  acabou antes do dinheiro e se alguma criança deixou de comer.
- **Transtorno alimentar tem triagem própria e vem antes de qualquer restrição.** Conduta de
  emagrecimento sobre quadro não reconhecido agrava o quadro; o lembrete manda não prescrever
  restrição e conduzir em equipe.

Completam o bloco: perda de peso não intencional, risco nutricional/desnutrição e condição
clínica descompensada ou interação fármaco-nutriente.

**Módulos de contexto:** acesso, orçamento e estrutura; relação com a comida e imagem corporal;
condições clínicas e interação medicamentosa; cultura, crenças e escolhas; suplementação por
conta própria.

Testes: `discipline-anamnese.test.mjs` cobre o contrato das duas — configuração completa,
percurso com roteiro real, campo com id único/perguntas/chips, risco com triagem e conduta,
módulo nunca amarrado a sexo, módulo fechado fora da ficha e bloqueio de escrita quando a
leitura do prontuário falha.

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
