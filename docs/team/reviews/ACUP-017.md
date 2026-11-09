## ACUP-017 — revisão

- Veredito: **APROVADO**, com correção minha e **uma condição para publicar** (ver "Condição")
- Commit revisado: `d5b80ef` (codex/lk, base integracao `2bda298`). Branch de revisão: `qa/ACUP-017`.
- Gate: `npm run quality` verde: entrega do dev com 1460 testes (1459 ok, 1 pulado, segundo o quadro); com a minha correção, **1461 (1460 ok, 1 pulado, 0 falhas)**, rodado sozinho, sem mutação em andamento. Lint e build ok.
- SQL: não há. PROD-2 ok. Invariantes AGENTS.md: ok.
- Correção que eu fiz: o painel do SuperAdm ainda oferecia "Promover para base curada" para a correção financeira (detalhe abaixo).

### (1) Corrigir de resposta financeira
- **Aparelho:**
  - Resposta financeira, e toda resposta seguinte da mesma conversa (marca guardada na `assistantStore` e reenviada como `financeiroContexto`), grava `ai_output={}`, `context_snapshot={financeiro:true}` e `model_version`, `reason` e `correction_structured` como NULL. Fica só a nota anonimizada.
  - O campo "Por quê" some e o aviso pede para não escrever nome, valor ou data.
- **Pendente e sem aprovação:**
  - `AICorrectionsPanel` esconde "Aprovar" para correção financeira.
  - `setCorrectionStatus('approved')` relê a linha e recusa quando tem o marcador, e também no modo local.
- **Aprovada à força no banco** (meu script, com `corrections.ts` real e cliente simulado devolvendo tudo, como a service role faria):

| Quem pede | Nota financeira aprovada à força | Nota pendente | Lição normal aprovada | Resposta original ou motivo |
|---|---|---|---|---|
| a autora | sim, na seção **"recentes desta profissional"**, nunca em "confirmadas pela curadoria" | sim | sim | **não** |
| outra pessoa | **não** | **não** | sim | **não** |
| sem id / id inválido | **não** | **não** | sim | **não** |

  - `renderCorrectionBlock` sem `callerId` também nunca inclui a financeira.
  - `withCorrectionLessons` da assistente recebe `callerId: caller.user.id`, e a consulta das lições traz `context_snapshot`, então o filtro funciona de fato.
- **Furo achado e corrigido:** a correção financeira ainda tinha **"Promover para base curada"**. O botão copia "Correto: <nota>" e orienta levar a lição para "Conhecimento da Anamnese", a base curada global: um caminho manual para o uso global que o FIN-3 e o FIN-6 fecharam. Escondi o botão para correção financeira, como já estava o "Aprovar", e fiz um teste. Agora a correção financeira só tem "Reprovar" (print `curadoria-qa`).

### (2) Outras superfícies de IA
- `AiCorrectionButton` só entra no modo financeiro com `surface === CLINIC_ASSISTANT` e o marcador. Nas outras superfícies, o padrão (texto, placeholder, "Por quê", mensagem final) está intacto.
- `submitAiCorrection` só zera os campos na assistente com o marcador.
- Nenhum teste de outra superfície mudou: o diff de testes tem só o arquivo novo e `clinic-assistant.test.mjs`. `ai-corrections.test.mjs` passa.

### (3) Prompt
- Financeiro só com DADOS_CONSULTADOS aceitos. Sem dados, "não conseguiu buscar", com a mensagem recebida. Não inventa valor, não trata indisponibilidade como zero, não reaproveita valor antigo, e "total é quantidade de linhas, não dinheiro".
- Operadora nunca é cobrança ao paciente. `aguardando_lote_operadora` sem vencimento inventado.
- **"Paciente arquivado" é só um rótulo**, e não deve criar fatos para explicar nome ausente ou status.
- "O Financeiro é a referência… sugira abri-lo". Não registra, altera, anula, paga, cobra nem envia cobrança. Sem recomendação clínica a partir de dinheiro.
- `enforceAiBudget` e `usageContextFor` continuam na chamada (linhas 295 e 309), e "Consulta já tentada" impede pedir outra consulta na mesma resposta.

### (4) AGENTS.md
- O diff por palavra mostra, no bullet Compras, **só** a frase "A assistente ainda NÃO lê o financeiro." retirada.
- O bullet da assistente troca "escala, anamnese nem financeiro" por "escala ou anamnese" e ganha a regra nova: só administração com `can_manage_finance`, conferência dupla aparelho + Edge, recorte fechado (primeiro nome + idade, FIN-5), 93 dias e 50 linhas, nada em log, Corrigir só nota e nunca global, FIN-6, envio aos EUA na região `us`, RIPD com o humano.
- `clinic-assistant.test.mjs:292` trocada só como autorizado (o novo `NOT_YET`), mais uma asserção acrescentada (`financeiro: SOMENTE se quem pergunta é administração`).

### (5) "Como funciona" e espelho
- `ASSISTANT_HELP` nas 5 seções. "Bom saber" diz: "Primeiro nome, idade e dinheiro saem do Brasil e são enviados ao serviço de IA Gemini/Vertex na região us, nos Estados Unidos." O RIPD é da instituição.
- O tópico entrou em `HELP_GROUP_PLACES` (autorizado).
- O espelho regenerado pelo script dá exatamente o arquivo commitado (só muda o fim de linha).

### (6) Payload da 016
`assistantTools.js`, `utils/clinicAssistant.js` e `assistantConsulta.ts` não mudaram nesta task. O contrato v2 é a 018.

### Condição para publicar (para o Orquestrador e o humano)
O "Como funciona", o prompt e o `AGENTS.md` já dizem que a identificação é **primeiro nome e idade** e que é isso que sai para os EUA. Mas a consulta da 016, que esta task não podia mexer, **ainda envia o nome completo e não envia idade**; o prompt só manda a assistente *exibir* o primeiro nome. Se a 017 for publicada antes da 018, a tela e o RIPD descrevem um envio menor do que o real.
**Recomendação:** não publicar a 017 sem a 018. Se precisar publicar antes, o texto do "Bom saber" e do `AGENTS.md` tem de dizer "nome do paciente" até a 018 entrar.

### O teste morde
Fiz 23 mutações; 20 pegas. As 3 que passam são equivalentes, porque a proteção existe em camadas:
- "o botão manda a resposta": o serviço zera `ai_output` de qualquer jeito;
- "a assistente não passa `financial`": o `contextSnapshot={financeiro:true}` ainda liga a proteção;
- "outras superfícies viram financeiras": nenhuma manda o marcador, e o serviço confere a superfície.

As pegas incluem: lição aprovada valendo para todos (na busca e na montagem), lição financeira em "confirmadas", resposta original ou motivo na lição, Edge sem `callerId`, serviço gravando resposta, pergunta ou motivo, serviço aprovando, painel com "Aprovar", botão sem aviso, conversa seguinte perdendo a marca, store sem a marca, e os pontos do prompt, do teto de gasto e da ajuda com "EUA".

### Prints conferidos (mesa/prints/ACUP-017)
- Conferi os 10 do dev: corrigir, seguimento, ajuda, curadoria e privacidade, no computador e no celular. Batem com o código, exceto a curadoria, que mostrava "Promover para base curada".
- Refiz com `-qa` depois da correção: `curadoria-qa` (página inteira) e `curadoria-celular-qa`. A correção financeira ficou só com "Reprovar".

### Observações (não bloqueiam)
1. A regra do Corrigir financeiro vale no aparelho e na Edge, mas o banco aceita o que o aplicativo mandar (FIN-6 escolheu não mexer em RLS). Um aplicativo adulterado da própria administração poderia gravar a resposta numa correção comum. É o mesmo resíduo já registrado no FIN-6, e a injeção no prompt continua protegida pelo marcador.
2. A SuperAdm ainda pode "Repor em revisão" e "Reprovar" a correção financeira. Isso não a torna global; está ok.
