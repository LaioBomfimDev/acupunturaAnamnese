# Síntese integrada: nutrição, dietoterapia e ervas

## Escopo e status

- Fontes lidas: `E-book Ervas Medicinais`, `Sistema Chines de Curas Alimentares` e `Dietoterapia Chinesa - Nutrição para Corpo, Mente e Espírito`.
- Domínio: `dietoterapia`.
- Destino de curadoria: `dietoterapia_mtc_educativa_pos_anamnese`.
- Status: `source_only`, em rascunho de curadoria e com auditoria profissional obrigatória.

Esta síntese registra aprendizados extraídos das três obras. Ela não é prescrição, protocolo clínico, validação científica das alegações dos livros nem substituto da anamnese e da avaliação profissional.

> **Limite do módulo:** ele não elabora plano alimentar, cardápio, prescrição dietética, dose de ervas nem substitui conduta nutricional ou médica. É uma base de educação em saúde sobre fontes tradicionais, liberada apenas depois de revisão por profissional habilitado.

## O que as três fontes têm em comum

1. A alimentação é vista como parte de autocuidado contínuo, não como uma intervenção isolada.
2. A escolha alimentar precisa considerar a pessoa e o momento: constituição, sinais atuais, rotina, estação, fase de vida, emoções e tolerâncias.
3. O modo de preparo também importa. Cozimento, uso de sal, mel, álcool, óleo, secagem e combinação de ingredientes podem modificar a leitura tradicional do alimento.
4. Ervas exigem mais cuidado do que a linguagem popular costuma sugerir: identificação correta, parte usada, dose, forma de preparo, toxicologia, interações e grupos vulneráveis.
5. O conteúdo mais útil para o paciente é educativo e contextual: explicar possibilidades, cuidados e perguntas para levar à consulta, sem prometer cura.

## Modelo de uso no Sistema Acup

Após a anamnese, o profissional poderá liberar uma área opcional de educação alimentar. O material deve ser apresentado como complemento ao plano de cuidado, com linguagem como:

- "Conteúdo educativo para conversar com sua profissional."
- "Na tradição da dietoterapia chinesa, este alimento é associado a..."
- "Sua tolerância, condições de saúde e medicamentos precisam ser considerados."

Uma sugestão de estrutura para essa área:

1. **Eixo educativo da consulta**: por exemplo, digestão e regularidade, aquecimento e frio, hidratação e umidade, ritmo e descanso.
2. **Hábitos para observar**: horário das refeições, mastigação, alimentos muito industrializados, preparo, temperatura e ambiente da refeição.
3. **Alimentos para conhecer**: explicação curta sobre associações tradicionais, preparo, tolerância e rotina, sem plano alimentar individual.
4. **Plantas medicinais para pesquisa profissional**: ficha com identificação e alertas; não é uma recomendação de uso.
5. **Cautelas pessoais**: gestação, lactação, infância, velhice, alergias, uso de medicamentos, doenças renais, hepáticas, metabólicas ou cardiovasculares.
6. **Perguntas para a próxima consulta**: campo que devolve autonomia ao paciente sem converter o material em automedicação.

## Taxonomia inicial de curadoria

| Tipo de conteúdo | Uso educativo possível | Limite obrigatório |
| --- | --- | --- |
| Alimento | Educação geral sobre associações tradicionais, preparo, tolerância e rotina | Não inferir padrão clínico automaticamente nem formular plano alimentar |
| Cinco movimentos e sistemas funcionais | Criar cartões corpo-mente-espírito para reflexão | Não diagnosticar órgão ou síndrome pelo cartão nem confundir MTC com órgão biomédico |
| Hábitos alimentares e rotina | Orientações gerais de autocuidado aprovadas pela profissional | Não substituir orientação nutricional individual |
| Planta medicinal | Pesquisa profissional com identificação, uso tradicional e alertas | Não sugerir preparo, dose, frequência ou combinação sem revisão e avaliação individual |
| Receitas tradicionais do livro | Manter como fonte para estudo e futura curadoria | Não liberar diretamente ao paciente como "cura" |

## Status de liberação

| Status | Significado | Pode aparecer para paciente? |
| --- | --- | --- |
| `source_only` | Extraído da fonte, sem curadoria | Não |
| `curadoria_tecnica` | Revisado conceitualmente pela equipe | Não por padrão; uso interno |
| `educativo_aprovado` | Linguagem, limites e fonte revisados | Sim, como educação em saúde |
| `restrito_profissional` | Depende de avaliação individual | Não como conteúdo livre |
| `bloqueado_risco` | Há risco de automedicação, interação ou toxicidade não resolvido | Não |

Os três PDFs permanecem em `source_only`. Uma etiqueta de padrão MTC, como "deficiência de Qi do Baço", não pode mudar esse status nem liberar uma erva.

## Campos recomendados para a curadoria futura

Para alimentos:

- nome popular e sinônimos;
- natureza/energia, sabor, movimento e associações tradicionais;
- forma de preparo relevante;
- eixo educativo;
- cautelas e contraindicações revisadas;
- páginas de origem;
- status de revisão profissional.

Para ervas:

- nome popular, nome científico e família botânica;
- `wikipediaUrl`, título/idioma da página e status da conferência, somente para identificação geral;
- parte utilizada e forma tradicional de uso;
- propriedades e indicações tradicionais da fonte, separadas de evidência científica;
- termos corporais mencionados literalmente pela fonte, sem inferência de órgão biomédico ou sistema funcional da MTC;
- associações tradicionais da MTC apenas quando estiverem descritas por uma fonte MTC rastreável e revisadas;
- riscos, toxicologia, interações e grupos que exigem cautela;
- identificação e origem da matéria-prima;
- páginas de origem e status de revisão.

Antes de uma planta medicinal sair de `source_only`, a ficha também deve ter: identificação botânica confirmada, parte usada, apresentação/formulação, classificação como alimento ou uso medicinal, toxicologia, interações, cautelas em grupos vulneráveis e decisão de liberação assinada por profissional.

## Regra de segurança e linguagem

As obras usam, em alguns trechos, linguagem de "cura" e de tratamento de doenças. No aplicativo, esse vocabulário não deve virar promessa de resultado. A conversão correta é:

- de "cura" para "uso tradicional descrito na fonte";
- de "trate X com Y" para "tema para discutir após sua avaliação";
- de "indicado" para "pode ser objeto de orientação individual revisada";
- de lista de receitas para "material de estudo, pendente de curadoria".

Para relações da MTC, usar "associações tradicionais da MTC entre alimentos, sabores, movimentos e sistemas funcionais". Em vez de "este alimento trata o Baço", usar "na leitura tradicional da MTC, este alimento é associado ao eixo Baço-Estômago em contextos educativos sobre digestão e transformação dos alimentos".

Toda ficha de planta medicinal deve abrir com:

> O uso de plantas medicinais e fitoterápicos pode apresentar contraindicações, toxicidade e interações medicamentosas. Este conteúdo é educativo e não orienta uso, preparo, dose ou combinação sem avaliação profissional.

Nada deste conjunto deve alimentar ranking de pontos, protocolo de acupuntura, conduta automática, prescrição de ervas ou recomendação individual gerada pela IA.

## Arquivos relacionados

- [E-book Ervas Medicinais](ebook-ervas-medicinais-aprendizados.md)
- [Catálogo de plantas e Wikipedia](plantas-medicinais-wikipedia.md)
- [Sistema Chines de Curas Alimentares](sistema-chines-curas-alimentares-aprendizados.md)
- [Dietoterapia Chinesa: Corpo, Mente e Espírito](dietoterapia-chinesa-corpo-mente-espirito-aprendizados.md)
- [Política de liberação e segurança](01-politica-de-liberacao-e-seguranca.md)
- [Consulta por padrão MTC: exemplo Qi do Baço](02-consulta-por-padrao-mtc.md)
