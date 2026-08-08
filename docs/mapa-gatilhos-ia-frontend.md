# Mapa dos gatilhos de IA do frontend

Levantamento de código em 23/06/2026, revisado em 07/08/2026. Este documento
descreve o fluxo implementado no frontend; não confirma o deploy remoto das Edge
Functions nem a configuração dos secrets da Vertex AI.

## Superfícies de geração

| Área | Ação visível | Serviço e função esperada | Dados enviados | Saída e gate humano |
| --- | --- | --- | --- | --- |
| Língua | **Analisar com IA** | `analyzeTongueImages` → `analyze-tongue` | IDs de caminhos `.webp` no bucket privado; a função valida terapeuta e paciente antes de ler as fotos | Achados e tags estáveis. Cada tag exige aceite; somente o checklist confirmado alimenta o raciocínio. |
| Diagnóstico / rail **IA Assistente** | **Aprofundar com IA** | `deepenClinicalReasoning` → `clinical-reasoning` | Síntese determinística, sinais confirmados, texto de anamnese anonimizado e contexto curado recuperado | Leitura, diferencial, alertas, contradições e perguntas. Não altera a hipótese nem o diagnóstico. |
| Biblioteca | **Perguntar** ou `Enter` no campo de pergunta | `askLibrary` → `library-qa` | Pergunta e até 10 cards curados recuperados localmente; não há dado de paciente | Resposta ancorada e citações. Sem cards relevantes, responde localmente sem chamar IA. |
| Relatório | **Gerar rascunho com IA** | `draftReport` → `draft-narrative` (`kind: report`) | Dados estruturados do relatório e texto livre anonimizado, sem nome | Rascunho editável. A impressão/PDF fica bloqueada até **Confirmar revisão profissional** ou salvar uma edição. |
| Evolução | **Resumir evolução com IA** | `summarizeEvolution` → `draft-narrative` (`kind: evolution`) | Indicadores e observações de sessões, com campos textuais anonimizados | Resumo exibido para conferência; não grava nem modifica evolução automaticamente. |
| Psicologia / Anamnese | **Sugerir marcações com IA** | `suggestPsychologyMarks` → `psych-suggest-marks` | Texto Psi anonimizado | Sugestões do vocabulário fechado; só entram após **Aceitar**. Usa `psych-global` + `psych-anamnese-marks`. |
| Psicologia / rail **IA Assistente** | **Gerar leitura (rascunho)** | `generatePsychologyReading` → `psych-reading` | Caso Psi estruturado e anonimizado | Organização, hipóteses provisórias, riscos, perguntas e cautelas. Não fecha diagnóstico nem decide conduta. Usa `psych-global` + `psych-case-assistant`. |

Contagem atual: Acupuntura tem cinco gatilhos clínicos principais (nove fluxos visíveis quando
os quatro modos de pesquisa alimentar são contados separadamente). Psicologia tem dois
gatilhos e dois endpoints reais; novas superfícies devem ser adicionadas por pertinência
clínica, e não para igualar números artificialmente.

## Superfície removida

**Anamnese de Acupuntura — "Sugerir marcações com IA"** (`suggestAnamneseMarks` →
`suggest-marks`), removida em 07/08/2026 por decisão do dono do produto. Motivos
apurados no código antes da remoção:

* o cartão nascia como `accepted` quando o item já estava marcado, então na prática
  ela espelhava o checklist já preenchido à mão em vez de poupar trabalho;
* aceite/ignorado vivia só no estado do componente — nada era persistido, logo a
  superfície não alimentava calibração nem auditoria;
* o raciocínio clínico de fato já mora em `clinical-reasoning` (rail IA Assistente).

O que saiu: o componente em `Anamnese.jsx`, o service `anamneseAiService.js`, a Edge
Function `supabase/functions/suggest-marks/` e a entrada correspondente no painel
**Saúde do deploy**. O surface `anamnese_marks` continua em `AI_SURFACE_LABELS` e na
CHECK da migração `20260619_ai_corrections` apenas para exibir correções já
registradas; ele saiu de `AI_SURFACES`, então não aceita correção nova. A função
publicada no Supabase precisa ser removida à parte
(`npx supabase functions delete suggest-marks`).

A superfície equivalente de Psicologia (**Revisão assistida** → `psych-suggest-marks`)
permanece: é outro vocabulário, outro fluxo e está em validação com a psicóloga.

## Feedback e governança

Cada saída de IA acima oferece **Corrigir**. Essa ação não chama o modelo: ela
registra uma lição anonimizada em `ai_corrections`. A autora pode usá-la na
próxima chamada; para as demais profissionais, a aplicação depende da aprovação
da SuperAdm. As diretrizes do SuperAdm também são aditivas: não substituem o
prompt de segurança nem o gate humano.

## Regra de disponibilidade

Mocks são permitidos somente no login local de demonstração, identificado por
`_isLocal`. Em sessão autenticada no Supabase, indisponibilidade, função ausente
ou IA não configurada é exibida como erro: não é substituída por conteúdo
simulado. Isso impede que uma sugestão fictícia seja aceita no checklist, no
raciocínio ou em um relatório clínico.

## Verificação operacional ainda necessária

Antes de liberar uso clínico em um ambiente, confirme no Supabase o deploy de
`analyze-tongue`, `clinical-reasoning`, `library-qa` e
`draft-narrative`, além de `GCP_SERVICE_ACCOUNT_JSON` e `GCP_LOCATION`. O
painel **Saúde do deploy** cobre banco/storage e uma função protegida; ele não
executa chamadas de modelo nem valida esses secrets.
