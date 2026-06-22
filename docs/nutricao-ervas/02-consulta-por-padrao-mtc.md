# Consulta por padrao MTC: exemplo "deficiencia de Qi do Baco"

## Resposta curta que a base deve dar hoje

**Nao ha erva liberada para indicar.** Os tres PDFs estao em `source_only` e nenhuma planta foi curada, revisada e aprovada para o padrao tradicional "deficiencia de Qi do Baco". O sistema nao deve responder com nome de erva, modo de preparo, dose ou combinacao.

Essa restricao e deliberada: um padrao da MTC precisa de confirmacao profissional e a selecao de uma planta medicinal depende, entre outros fatores, da pessoa, de outras diferenciacoes de padrao, de medicamentos, de gestacao/lactacao, de funcao renal/hepatica e da forma/parte da planta.

## O que existe nas fontes atuais

O livro `Dietoterapia Chinesa - Nutricao para Corpo, Mente e Espirito` tem referencias tradicionais a **alimentos**, nao uma ficha de erva clinicamente liberada para esse padrao. Alguns trechos associam alimentos ao Qi, ao Baco (`pi`) ou ao aquecedor medio:

| Fonte e pagina do PDF | Item citado na fonte | Registro seguro |
| --- | --- | --- |
| Dietoterapia Chinesa, p. 141 | Aipo | A fonte o associa ao Baco (`pi`) e ao "Qi geral". Continua `source_only`; nao e indicacao individual. |
| Dietoterapia Chinesa, p. 145 | Cenoura | A fonte a relaciona ao Baco e a funcoes digestivas tradicionais. Continua `source_only`; nao e plano alimentar. |
| Dietoterapia Chinesa, p. 145 | Chuchu | A fonte o associa ao Baco e ao Qi. Continua `source_only`; nao e recomendacao individual. |
| Dietoterapia Chinesa, p. 145 | Feijoes | A fonte cita associacoes tradicionais com Qi, Baco e Estomago. Continua `source_only`; preparo e tolerancia variam. |
| Dietoterapia Chinesa, p. 148 | Inhame | A fonte o associa ao Baco e ao aquecedor medio. Continua `source_only`; nao e prescricao. |

Essas entradas existem para que a equipe encontre a pagina de origem e possa avaliar a linguagem, a seguranca e a pertinencia. Elas **nao** devem aparecer ao paciente enquanto estiverem nesse status.

O `E-book Ervas Medicinais` e uma fonte de verbetes botanicos e usos tradicionais, mas nao organiza suas plantas pelo padrao "deficiencia de Qi do Baco". Por isso, seria incorreto criar uma correspondencia automatica entre o padrao e uma erva apenas por semelhanca de texto ou conhecimento externo nao rastreado.

## Como pesquisar sem criar conduta automatica

Para localizar material de estudo, usar termos da fonte, como `Baco (pi)`, `tonifica o Qi`, `aquecedor medio`, `digestao`, `umidade` e o nome do alimento/planta. O resultado deve trazer pagina, trecho e status; nunca uma recomendacao pronta.

Modelo de retorno interno:

```text
Padrao consultado: deficiencia de Qi do Baco
Ervas educativas aprovadas: nenhuma
Ervas restritas a profissional: nenhuma ficha curada ainda
Fontes para estudo: Dietoterapia Chinesa, pp. 141, 145 e 148
Proximo passo: criar ficha rastreavel e submeter a revisao profissional
```

## Criterio para uma futura ficha de erva

Uma futura associacao entre uma planta e esse padrao so pode ser registrada como hipotese de curadoria se tiver, no minimo:

1. especie botanica, sinonimos e parte utilizada confirmados;
2. fonte rastreavel que descreva a associacao tradicional;
3. separacao entre uso tradicional e nivel de evidencia cientifica;
4. toxicologia, interacoes e grupos vulneraveis revisados;
5. decisao profissional: `educativo_aprovado`, `restrito_profissional` ou `bloqueado_risco`;
6. texto sem dose, preparo terapeutico ou promessa de resultado para o paciente.

## Regra para respostas futuras

Enquanto nao houver ficha com `educativo_aprovado`, a resposta correta a "qual erva seria indicada?" e: **nenhuma erva pode ser indicada pelo sistema; ha apenas fontes para estudo e revisao profissional**.

Ver tambem: [politica de liberacao e seguranca](01-politica-de-liberacao-e-seguranca.md) e [sintese integrada](00-sintese-integrada-nutricao-ervas.md).
