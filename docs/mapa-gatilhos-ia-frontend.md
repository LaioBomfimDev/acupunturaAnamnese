# Mapa dos gatilhos de IA do frontend

Levantamento de código em 23/06/2026. Este documento descreve o fluxo
implementado no frontend; não confirma o deploy remoto das Edge Functions nem a
configuração dos secrets da Vertex AI.

## Superfícies de geração

| Área | Ação visível | Serviço e função esperada | Dados enviados | Saída e gate humano |
| --- | --- | --- | --- | --- |
| Anamnese | **Sugerir marcações com IA** | `suggestAnamneseMarks` → `suggest-marks` | Campos livres selecionados, anonimizados no navegador | Sugestões de checklist. Cada item só entra no caso após **Aceitar** da profissional. |
| Língua | **Analisar com IA** | `analyzeTongueImages` → `analyze-tongue` | IDs de caminhos `.webp` no bucket privado; a função valida terapeuta e paciente antes de ler as fotos | Achados e tags estáveis. Cada tag exige aceite; somente o checklist confirmado alimenta o raciocínio. |
| Diagnóstico / rail **IA Assistente** | **Aprofundar com IA** | `deepenClinicalReasoning` → `clinical-reasoning` | Síntese determinística, sinais confirmados, texto de anamnese anonimizado e contexto curado recuperado | Leitura, diferencial, alertas, contradições e perguntas. Não altera a hipótese nem o diagnóstico. |
| Biblioteca | **Perguntar** ou `Enter` no campo de pergunta | `askLibrary` → `library-qa` | Pergunta e até 10 cards curados recuperados localmente; não há dado de paciente | Resposta ancorada e citações. Sem cards relevantes, responde localmente sem chamar IA. |
| Relatório | **Gerar rascunho com IA** | `draftReport` → `draft-narrative` (`kind: report`) | Dados estruturados do relatório e texto livre anonimizado, sem nome | Rascunho editável. A impressão/PDF fica bloqueada até **Confirmar revisão profissional** ou salvar uma edição. |
| Evolução | **Resumir evolução com IA** | `summarizeEvolution` → `draft-narrative` (`kind: evolution`) | Indicadores e observações de sessões, com campos textuais anonimizados | Resumo exibido para conferência; não grava nem modifica evolução automaticamente. |

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
`suggest-marks`, `analyze-tongue`, `clinical-reasoning`, `library-qa` e
`draft-narrative`, além de `GCP_SERVICE_ACCOUNT_JSON` e `GCP_LOCATION`. O
painel **Saúde do deploy** cobre banco/storage e uma função protegida; ele não
executa chamadas de modelo nem valida esses secrets.
