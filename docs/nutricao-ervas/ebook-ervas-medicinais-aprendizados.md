# Aprendizados: E-book Ervas Medicinais

## Fonte e status

- Chave local: `ebook-ervas-medicinais`.
- Arquivo de origem: `E-book ervas medicinais.pdf`.
- Extensão: 440 páginas do PDF, todas com texto extraído.
- Curadoria: `dietoterapia` / `dietoterapia_mtc_educativa_pos_anamnese`.
- Status: fonte preservada para estudo; exige revisão profissional antes de qualquer orientação individual.

> O uso de plantas medicinais e fitoterápicos pode apresentar contraindicações, toxicidade e interações medicamentosas. Este conteúdo é educativo e não orienta uso, preparo, dose ou combinação sem avaliação profissional.

## O que aprendi

### 1. Uma planta não é apenas um nome popular

A obra organiza as espécies como verbetes e repete um padrão muito útil: nome científico, família botânica, sinonímia, habitat, características da planta, solo, clima, cultivo, partes usadas, composição, usos tradicionais, formas de uso, toxicologia e outras utilidades.

Isso mostra que, para trabalhar com ervas com responsabilidade, o nome comum sozinho não basta. A mesma denominação popular pode variar por região, e a parte da planta usada também muda o risco e o efeito pretendido.

### 2. Cultivo, colheita e armazenamento interferem no material

O livro destaca que solo, clima, momento de colheita, secagem e armazenamento influenciam os constituintes da planta. Há exemplos de orientação para conservar materiais em recipientes adequados e protegidos da luz.

Para o Sistema Acup, isso reforça que uma futura ficha de erva deve registrar origem, forma farmacêutica e qualidade da matéria-prima, em vez de tratar qualquer chá comercial como equivalente.

### 3. O limite entre alimento, tempero e erva é poroso

Várias espécies aparecem ao mesmo tempo como alimento, condimento, planta aromática, cosmético ou uso tradicional de saúde. Cúrcuma, aipo, alcachofra, alecrim, camomila, cidreira, espinheira-santa e yacon são exemplos presentes na obra.

O aprendizado prático é separar dois papéis no produto:

- **alimento/tempero**: pode entrar em educação alimentar ampla, depois de revisão;
- **uso medicinal concentrado**: requer cautelas, contexto clínico e nunca deve ser recomendado automaticamente.

### 4. Segurança precisa estar no centro da ficha

Os verbetes trazem avisos de toxicologia e cautelas que incluem altas doses, óleos essenciais, gestação, lactação, diabetes, inflamações renais e possíveis efeitos indesejados. Esses avisos não são uniformes entre plantas, o que impede regras genéricas como "se é natural, é seguro".

Uma orientação segura depende de verificar:

- espécie e parte vegetal;
- forma de preparo ou apresentação;
- concentração e frequência;
- medicamentos em uso;
- alergias e condições clínicas;
- gestação, lactação, idade e função renal/hepática;
- qualidade e procedência.

## Como aproveitar no app

O melhor uso futuro é uma biblioteca de fichas educativas de plantas, liberada apenas como conteúdo opcional após a anamnese e com aprovação profissional. Cada ficha poderia conter:

```text
Nome popular
Nome científico
Parte utilizada
Uso culinário ou tradicional
Descrição educativa curta
Alertas e grupos que exigem cautela
Páginas de origem
Status de revisão
```

Não incluir na primeira versão: dosagem, receita terapêutica, combinação de plantas, alegação de cura ou recomendação por diagnóstico automático.

## Catálogo botânico e Wikipedia

Os 218 verbetes identificados no e-book agora têm uma entrada estruturada em `plant-catalog.local.json`, com nome popular, nome científico preservado da fonte, família botânica, páginas do PDF e os campos `wikipediaUrl`, `wikipediaTitle`, `wikipediaLanguage` e `wikipediaStatus`.

Cada ficha também preserva, quando houver no PDF, `partsUsed`, `traditionalProperties`, `traditionalIndications`, `formsOfUse` e `toxicology`, todos dentro de `sourceSections` com as páginas de origem. O campo `sourceMentionedBodyTerms` guarda somente termos corporais que a própria fonte escreveu; `traditionalMtcAssociations` fica vazio quando o livro não descreve uma associação MTC rastreável.

O índice legível está em [Plantas medicinais: referências e campos de estudo](plantas-medicinais-wikipedia.md). Todos os links foram conferidos pela API pt-BR da Wikipedia em 2026-06-19, mas têm finalidade exclusiva de identificação botânica e leitura geral. Eles não validam alegações terapêuticas da fonte nem alteram o status `source_only` das plantas.

## O que esta fonte ainda não permite responder

O e-book é uma base de verbetes botânicos e de usos tradicionais. Ele não foi normalizado por padrões da MTC, como "deficiência de Qi do Baço". Portanto, uma busca por esse padrão não deve retornar uma erva indicada a partir deste PDF.

Para criar esse vínculo no futuro, é necessário curar cada espécie com: identidade botânica, parte usada, forma de apresentação, relação tradicional rastreável, avaliação de toxicologia/interações e status de liberação profissional. Até lá, todas as plantas deste e-book são `source_only`.

## Páginas do PDF para conferência

- Páginas 1-4: início do verbete de açafrão-da-índia, incluindo identificação, cultivo, usos e alertas.
- Páginas 9-12: verbete de aipo, com exemplo de cautelas específicas.
- Páginas 12-14: alcachofra e seu uso tradicional ligado à digestão/fígado, além de cautela sobre lactação.
- Páginas 14-17: alecrim, com uso culinário e alertas sobre excesso.
- Página 96: camomila, colheita e componentes do óleo essencial.
- Página 137: cidreira, usos tradicionais e emprego como alimento/condimento.
- Páginas 187-188: espinheira-santa, identificação e cultivo.
- Página 399: yacon, alimento e componentes como inulina.

As páginas acima são referências de conferência da fonte, não validação individual das alegações terapêuticas.

## Decisão de curadoria

Este PDF fica como `source_only_no_point_candidate_scan`. Ele não gera candidatos de ponto, não altera ranking de acupuntura e não deve virar prescrição de fitoterapia. A prioridade é transformar, com auditoria, os verbetes em conteúdo educativo rastreável e seguro.

Ver também: [política de liberação e segurança](01-politica-de-liberacao-e-seguranca.md) e [consulta por padrão MTC](02-consulta-por-padrao-mtc.md).
