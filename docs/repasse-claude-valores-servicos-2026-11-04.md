# Repasse para o Claude — valores e serviços por área

Pedido de 04/11/2026: implementar somente o frontend; backend fica com o Claude. Nenhuma migration, Edge Function, regra de acesso, serviço de persistência ou deploy foi alterado.

## O que já foi implementado

- A matriz em Financeiro → Valores dos atendimentos mantém a estrutura existente, mas oferece campos só para os serviços de cada área. No celular/tablet continua uma área por vez, escondendo também as linhas que não se aplicam.
- Mantidos os valores da instituição e os valores próprios por profissional, o valor padrão, o significado de campo vazio e R$ 0 e a precedência de preços existente.
- Tipos antigos que tenham preço cadastrado continuam visíveis/editáveis, identificados como “Tipo anterior cadastrado”. O salvamento preserva também valores de áreas fora da seleção atual: a RPC substitui todo o escopo, portanto não pode receber só as células visíveis.
- A linha “Pacotes” mostra Acupuntura com 5% de desconto, Psicologia sem desconto e Fisioterapia com pacotes disponíveis, sem inventar um percentual para ela.
- Modelos de pacote e Vender pacote oferecem os serviços da área escolhida. Trocar a área limpa a seleção de tipos; modelos existentes mantêm os tipos anteriores para poder conferir/editar.
- Os dois formulários têm o mesmo botão de cálculo: Acupuntura com 5%, Psicologia sem desconto. Usa preço avulso × quantidade de atendimentos, em centavos, com arredondamento único no total. Na venda, respeita o profissional escolhido. O cálculo só preenche o total mediante clique; não salva nem recalcula modelos/pacotes existentes automaticamente.
- O botão pede exatamente um serviço, quantidade válida e preço avulso conhecido. Não estima composição de pacote misto, não assume o primeiro tipo selecionado e não confunde preço ausente com zero. Fisioterapia continua com total manual.

## Catálogo e identificadores

A usuária confirmou que **Neuromodulação, Biomodulação vascular e e-ILIB pertencem tanto à Fisioterapia quanto à Psicologia**. Avaliação psicológica foi colocada em Psicologia; avaliação neuropsicológica em Neuropsicologia; avaliação/visitas/sessão em ABA, conforme a organização apresentada à usuária.

| Área | Tipo (`appointment_type`) | Rótulo na configuração |
| --- | --- | --- |
| Acupuntura | `anamnesis` | Avaliação inicial (anamnese) |
| Acupuntura | `session` | Sessão de acupuntura |
| Acupuntura | `auriculotherapy` | Sessão de auriculoterapia |
| Acupuntura | `laserpuncture` | Sessão de laserpuntura |
| Acupuntura | `cupping` | Sessão de ventosa |
| Fisioterapia | `anamnesis`, `session`, `evaluation` | Anamnese, Sessão, Avaliação |
| Psicologia | `anamnesis`, `session`, `evaluation` | Anamnese, Sessão, Avaliação psicológica |
| Fisioterapia e Psicologia | `neuromodulation` | Neuromodulação |
| Fisioterapia e Psicologia | `vascular_biomodulation` | Biomodulação vascular |
| Fisioterapia e Psicologia | `e_ilib` | e-ILIB |
| Nutrição | `anamnesis`, `return`, `session` | Anamnese, Retorno, Sessão |
| Neuropsicologia | `evaluation` | Avaliação neuropsicológica |
| ABA | `evaluation`, `home_visit`, `school_visit`, `session` | Avaliação, Visita domiciliar, Visita escolar, Sessão |

“Avaliação inicial” da Acupuntura **reutiliza `anamnesis`**; não cria um segundo preço nem move valores de `evaluation` silenciosamente. Os dois nomes específicos das avaliações também reutilizam `evaluation` na respectiva área. Pacote não virou um tipo de atendimento com preço unitário.

Os oito IDs novos são `auriculotherapy`, `laserpuncture`, `cupping`, `home_visit`, `school_visit`, `neuromodulation`, `vascular_biomodulation`, `e_ilib`.

## Arquivos para começar a leitura

- `frontend/src/utils/financeServices.js`: catálogo por área, regras de pacote, montagem da matriz, payload completo e cálculo do total. É o ponto de referência dos IDs novos no frontend.
- `frontend/src/components/financeiro/FinanceConfig.jsx`: matriz de valores e modelos de pacote.
- `frontend/src/components/financeiro/FinancePackagePricing.jsx`: bloco de cálculo compartilhado.
- `frontend/src/components/financeiro/FinanceDialogs.jsx`: Vender pacote.
- `frontend/src/styles/financeiro.css`: rótulos, regra de pacote e comportamento responsivo das linhas.
- `frontend/tests/regression/finance-services.test.mjs`: catálogo, matriz, preservação de valores antigos, zero/vazio, cálculo e renderização real dos componentes.

## Pendências do backend e integração antes de publicar

1. **Liberar os oito tipos novos.** O código local atual ainda tem CHECKs com a lista antiga, em `20260924c_appointment_types_expand.sql` e `20261023_financeiro_etapa1.sql`. Conferir a versão mais recente de cada função/constraint e criar migration nova, preservando dados existentes. Verificar `appointments`, `procedure_prices`, `convenio_procedure_prices`, `finance_payout_rules`, `finance_package_models` e `patient_packages`, além das RPCs que validem tipos. Validar a combinação área × tipo no servidor; preservar compatibilidade do histórico.
2. **Contrato de preços mantido.** `savePrices(professionalId, rows)` continua chamando `finance_save_prices` com `p_professional` e `p_rows` contendo `{ discipline, appointment_type, price_cents }`. O frontend converte campo vazio de tipo em `''` como antes. O frontend está pronto para enviar os novos IDs, mas o backend antigo rejeita esses valores enquanto os CHECKs não forem atualizados. Nenhuma gravação real foi tentada nesta tarefa.
3. **Pacotes:** os contratos atuais de `finance_package_models` e `finance_sell_package` continuam iguais; recebem `appointment_types` e total em centavos. O botão de 5% é cálculo de preenchimento no frontend, **não imposição financeira no servidor**. Se a regra deve ser obrigatória, implementar e validar no backend, considerando pacotes mistos e valores próprios por profissional. Pacotes já vendidos e cobranças já gravadas devem manter seus valores. A usuária não definiu percentual para Fisioterapia nem composição de pacotes mistos.
4. **Agenda e demais telas ainda usam o catálogo antigo.** Não ampliei `APPOINTMENT_TYPES` de `appointmentService.js`, `FINANCE_APPOINTMENT_TYPES`/`typeLabel` de `utils/finance.js`, seletores de repasse nem Convênios, porque esses contratos seguem o backend existente. Depois de liberar os tipos, conectar o catálogo por área à Agenda (inclusive atendimento já realizado), aos rótulos dos lançamentos/relatórios, aos repasses, à venda/consumo de pacote e aos Convênios. O rótulo específico depende da área (`anamnesis` e `evaluation` têm nomes distintos por área).
5. **Ajuda e assistente:** `screenHelp.js` foi preservado para não modificar seu espelho no backend. Na integração final, atualizar os tópicos `FINANCEIRO_HELP.valores` e `.modelos` e rodar `node frontend/scripts/sync-assistant-help.mjs` para regenerar `_shared/assistantHelpCorpus.ts`.
6. **Validar de verdade após a migration:** administração salva instituição e profissional; outros perfis continuam bloqueados; novos tipos na Agenda geram a cobrança esperada só quando Atendido; faltas não cobram/consomem pacote; cancelamento e demais regras existentes permanecem. Conferir valores anteriores e herança ao salvar o escopo completo. Fazer chamadas reais das RPCs em transação com rollback, conforme AGENTS.md.

## Validação

- `npm run lint`: aprovado.
- Testes focados (`finance-services.test.mjs` + `financeiro-etapa1.test.mjs`): 37 aprovados.
- `npm run build`: aprovado; permanecem avisos sobre chunks grandes e importação dinâmica de `patientEvolutionService.js`, fora deste escopo.
- `npm run check:security` e `npm run check:bundle`: aprovados.
- Conferência no navegador com dados fictícios: desktop; larguras de 360 e 820 px sem rolagem lateral; troca de área mantendo o texto digitado; ABA mostrando só seus tipos; cálculo de 10 × R$ 100 com 5% preenchendo R$ 950; modelo de Psicologia com 10 × R$ 200 preenchendo R$ 2.000 sem desconto; troca de área do modelo limpando os tipos selecionados.
- Suíte completa: **1.248 testes aprovados, zero falhas e zero pulados**, pelo mesmo runner/conjunto de `npm run test`, com `node --test --test-concurrency=4 tests/regression/*.test.mjs` (12 min 49 s). O início sequencial foi interrompido e substituído por essa execução completa; nenhum teste foi removido ou enfraquecido. Log local em `.tmp/finance-services-test-parallel.log`.

Não houve teste de escrita no Supabase nem implantação; o backend permanece com o Claude. A prévia e os dados fictícios usados na conferência foram retirados do frontend após a verificação.
