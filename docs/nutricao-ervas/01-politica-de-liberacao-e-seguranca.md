# Politica de liberacao e seguranca: dietoterapia MTC e ervas

## Objetivo

Esta politica transforma as tres fontes em uma base de curadoria segura. Ela organiza o que pode ser pesquisado internamente e o que, depois de revisao profissional, pode ser apresentado como educacao em saude.

**Destino de curadoria:** `dietoterapia_mtc_educativa_pos_anamnese`.

O modulo nao elabora plano alimentar, cardapio, prescricao dietetica, dose de ervas ou substituicao de conduta nutricional/medica. Ele nao e um mecanismo de recomendacao individual.

## Status obrigatorios

| Status | Significado | Exibicao ao paciente |
| --- | --- | --- |
| `source_only` | Conteudo extraido da fonte, sem sintese ou revisao | Nao |
| `curadoria_tecnica` | Conceito revisado pela equipe, ainda pendente de liberacao | Nao por padrao; somente area interna |
| `educativo_aprovado` | Conteudo em linguagem segura, com fonte e limites revisados | Sim, como educacao em saude |
| `restrito_profissional` | O contexto depende de avaliacao individual | Nao como conteudo livre |
| `bloqueado_risco` | Ha risco relevante de automedicacao, interacao ou toxicidade | Nao |

Regra: os tres PDFs atuais estao em `source_only`. Nenhum termo anotado na anamnese, padrao MTC ou pergunta em linguagem natural altera esse status.

## Alimento e planta medicinal sao trilhas diferentes

### Alimento

Pode ser candidato a educacao geral apos curadoria, com foco em associacoes tradicionais, sabor, natureza, preparo, tolerancia e rotina. A ficha nao pode virar plano alimentar, cardapio ou substituto de prescricao nutricional.

### Planta medicinal ou fitoterapico

Sempre exige uma camada adicional de seguranca. Antes de qualquer liberacao, registrar e revisar:

- nome popular, nome cientifico, familia botanica e sinonimos;
- parte utilizada e identificacao da materia-prima;
- forma de apresentacao e classificacao como alimento ou uso medicinal;
- associacao tradicional com pagina e trecho de origem;
- link da Wikipedia apenas para identificacao geral, com titulo, idioma e status de verificacao separados da fonte clinica;
- toxicologia, eventos adversos e interacoes medicamentosas;
- cautelas para gestacao, lactacao, infancia, velhice e condicoes renais, hepaticas, cardiovasculares e metabolicas;
- decisao de revisao profissional e status de liberacao.

Sem todos esses campos, o conteudo permanece `source_only`, `restrito_profissional` ou `bloqueado_risco`.

O campo `wikipediaUrl` nao e evidencia clinica. Ele nao pode ser usado para liberar uma planta, decidir seguranca, redigir dose/preparo ou substituir a avaliacao da fonte e da profissional.

## Linguagem clinica segura

Usar a formula:

> Na leitura tradicional da MTC, ha associacoes entre alimentos, sabores, movimentos e sistemas funcionais. Este conteudo e educativo e deve ser discutido com a profissional responsavel.

Evitar equivaler sistemas funcionais da MTC a orgaos biomedicos. Tambem evitar "este alimento trata o Baco"; preferir "a fonte associa este alimento ao eixo Baco-Estomago em um contexto tradicional de digestao e transformacao dos alimentos".

Toda ficha de planta medicinal deve abrir com:

> O uso de plantas medicinais e fitoterapicos pode apresentar contraindicacoes, toxicidade e interacoes medicamentosas. Este conteudo e educativo e nao orienta uso, preparo, dose ou combinacao sem avaliacao profissional.

## Gatilhos de bloqueio

Marcar `bloqueado_risco` ou `restrito_profissional` quando houver, por exemplo:

- ausencia de identificacao botanica ou de parte utilizada;
- pedido de dose, preparo terapeutico, combinacao ou substituicao de medicamento;
- gestacao, lactacao, infancia, pessoa idosa fragil ou alergia relevante;
- uso de medicamentos ou condicao renal, hepatica, cardiovascular ou metabolica sem avaliacao profissional;
- linguagem de cura, promessa de resultado ou associacao automatica com um diagnostico.

## Referencias internas

- [Sintese integrada](00-sintese-integrada-nutricao-ervas.md)
- [E-book Ervas Medicinais](ebook-ervas-medicinais-aprendizados.md)
- [Consulta por padrao MTC](02-consulta-por-padrao-mtc.md)
