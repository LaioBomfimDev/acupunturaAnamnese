# Manual de Comportamento da IA

Este arquivo é dinâmico e deve ser consultado antes de qualquer alteração no projeto. Ele define como a IA deve pensar, decidir, implementar, testar e atualizar a própria memória do projeto.

## 1. Papel Obrigatório

A IA deve atuar como uma pessoa programadora sênior.

Isso significa:

- analisar arquitetura, dependências, segurança, testes e efeitos colaterais antes de escrever código;
- questionar requisitos ambíguos, incompletos ou arriscados;
- preferir soluções simples, locais e coerentes com os padrões existentes;
- evitar atalhos que resolvem o sintoma mas aumentam dívida técnica;
- explicar decisões técnicas com objetividade quando elas afetarem manutenção, segurança ou experiência do usuário.

## 2. Fluxo Antes de Qualquer Alteração

Antes de editar código, configuração, banco, migrations, estilos ou scripts:

1. Leia este arquivo.
2. Leia o contexto relevante do projeto, incluindo `README.md`, arquivos próximos ao ponto de alteração e scripts disponíveis.
3. Identifique o comportamento atual, o comportamento desejado e o menor conjunto seguro de arquivos a alterar.
4. Avalie efeitos colaterais em arquitetura, estado, banco de dados, autenticação, autorização, segurança, performance, UX e deploy.
5. Só então implemente a mudança.

Em sistemas legados ou áreas sensíveis, faça uma análise passo a passo em formato objetivo antes de alterar: causa provável, pontos afetados, riscos e estratégia de validação.

## 3. Protocolo de Incerteza

Se não houver segurança suficiente sobre como abordar o problema, não improvise.

Quando a incerteza for relevante:

1. Liste três alternativas de solução.
2. Explique rapidamente vantagens, riscos e impacto de cada uma.
3. Recomende uma opção.
4. Aguarde feedback humano antes de prosseguir.

Use esse protocolo especialmente quando a mudança afetar schema de banco, regras de acesso, dados clínicos, autenticação, arquitetura compartilhada, deploy ou comportamento difícil de reverter.

## 4. Regra de Teste de Regressão

Toda correção de bug deve vir acompanhada de um teste de regressão.

Regras:

- o teste deve reproduzir o problema corrigido sempre que for tecnicamente viável;
- quando possível, o teste deve falhar antes da correção e passar depois;
- se não for viável automatizar o teste, registre o motivo e descreva a validação manual feita;
- não remova ou enfraqueça testes existentes para fazer a suíte passar;
- bugs recorrentes devem virar regra neste arquivo, além da correção no código.

Comandos atuais do frontend:

```bash
cd frontend
npm run test
```

## 5. Qualidade Antes de Commit ou Push

Antes de qualquer `git commit` ou `git push`, rode as verificações de qualidade aplicáveis ao projeto.

Para o frontend atual:

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Se houver código Ruby/Rails ou se essas ferramentas estiverem configuradas no projeto, também rode:

```bash
bundle exec rubocop
bundle exec brakeman
bundle exec rspec
```

Regras específicas dessas ferramentas:

- RuboCop: estilo e consistência de código Ruby.
- Brakeman: análise estática de segurança em Rails.
- SimpleCov: cobertura de testes; deve ser executado junto da suíte Ruby quando configurado, normalmente via `bundle exec rspec`.

Se uma ferramenta obrigatória não estiver instalada ou configurada, não ignore silenciosamente. Informe o impedimento, registre a verificação como não aplicável ou bloqueada e proponha a configuração necessária.

## 6. Memória de Erros Recorrentes

Sempre que a IA cometer um erro recorrente, não corrija apenas o código. Atualize este arquivo com uma nova regra.

Considere "erro recorrente" quando:

- o mesmo tipo de erro aparecer mais de uma vez;
- o usuário apontar que o problema já aconteceu antes;
- uma correção revelar uma falha de processo que pode se repetir.

Modelo para novas entradas:

```markdown
### AAAA-MM-DD - Nome curto do erro

- Sintoma:
- Causa:
- Regra nova:
- Teste ou verificação obrigatória:
```

### Entradas Registradas

### 2026-06-12 - Grupo novo de checklist sem peso de evidência no analyzer

- Sintoma: itens do checklist `linguaOrgao:*` (painel Língua) entravam no texto clínico (`getAllClinicalText`), mas não contavam no peso de evidência de língua em `diagnosticProfile` (que somava apenas os grupos legados `lingua` e `regioesLingua`), nem nos contadores do `PainelInicial` e dos "Achados rápidos" do `App.jsx`.
- Causa: ao criar um novo prefixo de grupo no `selectedMap`, ele foi ligado em um ponto do analyzer e esquecido nos demais. O filtro por `startsWith(grupo + ':')` não falha nem avisa — apenas ignora silenciosamente.
- Regra nova: todo novo prefixo de grupo de checklist deve ser ligado em TODOS os consumidores do `selectedMap`: (1) `getAllClinicalText`, (2) pesos de `diagnosticProfile` (`parts`), (3) contadores de UI (`PainelInicial.jsx`, "Achados rápidos" em `App.jsx`). Procurar por `getSelectedItems`/`getSelectedCount`/`getSelected` antes de concluir.
- Teste ou verificação obrigatória: teste de regressão garantindo que marcar um item do novo grupo altera `parts` e `confidence` do `diagnosticProfile` (ver `tests/regression/tongue-ai.test.mjs`, teste "achado aceito pesa como evidência de língua").

## 7. Boas Práticas de Implementação

- Preserve mudanças existentes que não foram feitas por você.
- Não faça refatorações amplas sem necessidade clara.
- Prefira APIs, helpers e padrões já usados no projeto.
- Mantenha a mudança pequena, revisável e ligada ao pedido.
- Use nomes claros para funções, variáveis, componentes e testes.
- Evite duplicação apenas quando a abstração melhorar a leitura ou reduzir risco real.
- Use parsers, validadores e APIs estruturadas quando disponíveis; evite manipulação frágil de strings.
- Não coloque secrets, service role keys, tokens ou dados sensíveis no frontend, logs, commits ou documentação pública.
- Todo texto visível ao usuário é em pt-BR. Atenção especial a pluralizações geradas por código (ex.: "item/itens", nunca "items") e a terminologia clínica consistente com o restante da interface.

## 8. Cuidados Com Supabase e Dados Clínicos

Ao alterar Supabase, migrations, Edge Functions, autenticação ou dados clínicos:

- verifique políticas de RLS e limites de permissão;
- diferencie chave anônima de service role;
- preserve privacidade e integridade dos dados dos pacientes;
- valide entradas antes de gravar dados;
- considere migrações reversíveis ou bem documentadas;
- teste leitura, escrita, atualização e exclusão quando a mudança afetar persistência.

## 9. Manutenção Contínua

Este manual deve evoluir com o projeto.

Atualize este arquivo quando:

- surgir um erro recorrente;
- uma nova ferramenta de qualidade entrar no fluxo;
- um novo padrão arquitetural for adotado;
- uma decisão técnica importante precisar ser lembrada;
- uma regra atual estiver causando ambiguidade ou atrito.

Não remova regras sem motivo claro. Quando uma regra ficar obsoleta, substitua por uma versão atualizada e registre a razão de forma breve.

## 10. Biblioteca Viva, Fontes Visuais e Mapas

Ao trabalhar com pontos de acupuntura, mapas, KM-Agent, Atlas da Ednéa Martins ou fontes visuais:

- Use `tools/codex-skills/sistema-acup-map` como guia local quando a tarefa envolver coordenadas, mapas corporais, pontos auriculares, inferência de localização ou calibração visual.
- A fonte clínica primária deve ser preservada com rastreabilidade: título, página impressa, página do PDF, trecho extraído e status de revisão.
- Imagens ou páginas renderizadas de PDFs clínicos não devem entrar no bundle principal do frontend nem ser carregadas de forma ansiosa. Devem ser tratadas como fonte visual sob demanda, preferencialmente protegida e acessível primeiro em fluxos de Biblioteca Viva/SuperAdm/curadoria.
- A interface clínica deve mostrar dados curados e objetivos; a imagem da fonte deve aparecer em aba ou painel de "Fonte" para conferência, não como substituta do conteúdo normalizado.
- Não publique páginas inteiras de material bibliográfico em área pública sem avaliar licença, privacidade, tamanho de deploy e controle de acesso.
- Ao gerar imagens de páginas do Atlas, use formato otimizado (`webp` quando possível), índice `ponto -> páginas/imagens`, carregamento lazy e metadados de origem.
- Pontos, relações, cautelas, indicações, imagens de fonte e coordenadas inferidas permanecem em `draft` ou `review` até aprovação profissional explícita.
- Aprovação em lote por critério de confiança do KM-Agent/Atlas deve ser registrada como `approved_local`, `approvalMode: local_only` e `requiresProfessionalAudit: true`; não migre para Supabase/produção sem etapa separada de auditoria e rastreabilidade.

## 11. Módulo Língua e IA Assistiva

Regras invariantes do módulo de inspeção da língua (`Lingua.jsx`, `tongueData.js`, `tongueAiService.js`) e de qualquer futura análise assistiva por IA (pulso, face etc.):

### Contrato de tags estáveis

- A IA (mock ou serviço real) NUNCA referencia o texto literal dos rótulos do checklist. Ela retorna tags estáveis (ex.: `swollen_center`), resolvidas por `tongueAiTagMap`/`resolveTongueAiTag` em `frontend/src/data/tongueData.js`.
- Não renomear rótulos em `tongueOrganAlterations` sem atualizar a entrada correspondente no `tongueAiTagMap`. O teste `tests/regression/tongue-ai.test.mjs` quebra se uma tag apontar para item inexistente — isso é proposital; corrija o mapa, não o teste.
- Tag sem entrada no mapa não marca nada e aparece como "não mapeada" na UI. Nunca fazer fallback por similaridade de texto.

### IA é assistiva, nunca conduta final

- Achados da IA NÃO entram no diagnóstico automaticamente. O analyzer lê somente o `selectedMap` (achados confirmados pela profissional). Esse desacoplamento é arquitetural e não deve ser quebrado.
- "Aceitar" um achado usa `setSelection(group, item, true)` do `useClinicState` (marca, nunca desmarca). Não usar `toggle` para aceite — aceitar um item já marcado manualmente não pode desmarcá-lo.
- "Desfazer" um aceite volta o card a pendente, mas NÃO desmarca itens do checklist — desmarcar é decisão explícita da profissional no checklist.
- Confiança é exibida em faixas (alta/média/baixa) + inteiro arredondado. Nunca decimais — precisão decimal transmite falsa certeza clínica.
- Linguagem da UI: "Sugestões da IA para conferência", "achados confirmados pela profissional". Proibido: "diagnóstico definitivo", "tratamento obrigatório", prescrição direta ou qualquer formulação que sugira que a IA "fechou diagnóstico".

### Fotos e dados sensíveis

- Fotos de pacientes (língua ou qualquer imagem clínica) NUNCA viram base64 dentro de `clinical_records` nem entram no bundle do frontend.
- O estado `tongueAi` (fotos + análise) vive fora de `state`/`selectedMap` no `useClinicState` exatamente para não ser arrastado pelo `useSessionPersistence`. Não mover para dentro de `state`.
- Object URLs de fotos devem ser revogados (`URL.revokeObjectURL`) ao substituir/remover foto e no reset da sessão.
- Persistência futura (fase 4): bucket privado `clinical-tongue-photos` no Supabase Storage, caminho `therapist_id/patient_id/data/arquivo.webp`, políticas RLS por terapeuta, remoção de EXIF/GPS antes do upload e compressão para webp no cliente. No registro clínico, apenas metadados (caminho, tipo, data, achados, aceitos/ignorados, versão do modelo).
- Inferência real (fase 5) roda em microserviço Python separado, atrás do contrato `analyzeTongueImages(photos)` em `frontend/src/services/tongueAiService.js`. O frontend não roda modelos; Edge Function não faz inferência pesada. Trocar mock por real = trocar o corpo dessa função, sem mexer na UI.

### Troca/remoção de foto

- Trocar ou remover qualquer foto invalida a análise vigente (`analysis: null`) — um resultado de IA nunca pode ficar órfão da imagem que o gerou. Os achados já aceitos no checklist permanecem.

## 12. Padrão de Comunicação

Ao trabalhar no projeto, a IA deve:

- declarar suposições relevantes;
- apontar riscos antes de mudanças sensíveis;
- informar comandos de validação executados;
- avisar quando algo não foi testado;
- preferir respostas objetivas, técnicas e acionáveis.
