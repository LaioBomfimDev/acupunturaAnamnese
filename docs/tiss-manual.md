# Manual TISS do sistema (convênios)

Resumo do Padrão TISS 4.03.00 da ANS no que o sistema usa para faturar
convênio, e de como cada regra virou tela e banco. Leia antes de mexer em
guia, lote, pagamento da operadora ou glosa. Regra curta e durável fica no
`AGENTS.md` §7 (bullet "Convênios, Fase 2"); aqui fica o porquê e o detalhe.

Data: 03/11/2026. Versão TISS: 4.03.00 (pacote de comunicação da ANS de
novembro/2025, `PadroTISSComunicao_202511.zip`).

## 0. De onde vem cada coisa (e quanta certeza há)

| Fonte | O que dá | Confiança |
|---|---|---|
| XSD oficial 4.03.00 (`supabase/tiss/4.03.00/`, SHA-256 conferido em 3 cópias independentes) | Estrutura do XML, campos obrigatórios e opcionais, tamanhos, domínios (UF, conselho, CBO, tipo de atendimento, glosa) | **Verificado**: o XML gerado passa no XSD nos testes |
| Tabelas TUSS da ANS (202607 na Fase 1; tabela 38 em 202609) | Códigos e nomes de procedimento, CBO, conselho, UF, regime, glosa | **Verificado** para 22/24/26/50/59/76 (planilha oficial). Tabela 38 veio da cópia aberta `Voa-Health/tiss`, que copia a planilha da ANS: **conferir** com a planilha oficial quando o gov.br abrir |
| Componente Organizacional e Componente de Conteúdo e Estrutura (PDFs da ANS) | Regras de preenchimento, numeração dos campos do papel, regra do hash | **Não lidos direto**: o site gov.br estava bloqueado no ambiente em 03/11/2026. O que usamos deles veio de fontes secundárias citadas abaixo. **Conferir** quando o acesso abrir |

Como liberar: no ambiente da sessão na nuvem, em acesso à rede, permitir
`www.gov.br`, `www.ans.gov.br` e `dadosabertos.ans.gov.br`. Depois, baixar os
PDFs do Padrão TISS, conferir este manual contra eles e anotar aqui o que
mudou.

## 1. Os documentos do faturamento

- **Guia SP/SADT** (Serviço Profissional / Serviço Auxiliar de Diagnóstico
  e Terapia): a guia de terapias e sessões. O sistema usa só ela, uma por
  atendimento de convênio Atendido (decisão da clínica, 03/11/2026). O XSD
  aceita vários `procedimentoExecutado` por guia, cada um com `dataExecucao`
  própria: por isso a guia tem itens (`tiss_guide_items`) e agrupar sessões
  numa guia depois não muda o banco.
- **Lote de guias** (`mensagemTISS` com `ENVIO_LOTE_GUIAS`): o arquivo XML que
  vai ao portal da operadora. Até **100 guias** por lote (`maxOccurs="100"`
  de `guiaSP-SADT` em `ctm_guiaLote`, verificado), e **um tipo de guia por
  lote** (é um `choice`).
- **Demonstrativo de análise de conta / pagamento** (`operadoraParaPrestador`):
  a resposta da operadora, com o que pagou e o que glosou. Por enquanto a
  administração lança à mão, lendo o demonstrativo (Pagamentos e glosas).
  Ler o XML do demonstrativo é etapa futura.
- **Recurso de glosa** (`RECURSO_GLOSA`, `ctm_recursoGlosa`): o pedido de
  revisão. Hoje é enviado no portal da operadora; o sistema só registra.

## 2. A guia SP/SADT no XML 4.03.00 (verificado no XSD)

Ordem dos blocos em `ctm_sp-sadtGuia`:

1. `cabecalhoGuia`: `registroANS` (6 dígitos) e `numeroGuiaPrestador`
   (até 20 caracteres). **O número da guia é do prestador**: o sistema
   numera em sequência por operadora (1, 2, 3…) e o número **nasce com a
   guia e não muda**.
2. `dadosAutorizacao` (**opcional**): `numeroGuiaOperadora`, `dataAutorizacao`
   (obrigatória dentro do bloco), `senha`, `dataValidadeSenha`. Se houver senha
   ou número da operadora, a data da autorização é obrigatória (o sistema
   cobra).
3. `dadosBeneficiario`: `numeroCarteira` e `atendimentoRN` (S/N). **Desde a
   4.00 o nome do beneficiário e o CNS saíram do XML** (o nome continua no
   papel).
4. `dadosSolicitante`: `contratadoSolicitante` (código na operadora, CPF ou
   CNPJ), `nomeContratadoSolicitante` e `profissionalSolicitante` (nome
   opcional, conselho, número no conselho, UF e CBO).
5. `dadosSolicitacao`: `dataSolicitacao` (opcional), `caraterAtendimento`
   (1 eletivo, 2 urgência) e `indicacaoClinica` (opcional no XSD; muitas
   operadoras exigem em terapia: o sistema avisa).
6. `dadosExecutante`: `contratadoExecutante` (código, CPF ou CNPJ) e `CNES`
   (7 caracteres; **sem CNES, 9999999**).
7. `dadosAtendimento`: `tipoAtendimento` (tabela 50; terapia = **03 Outras
   terapias**), `indicacaoAcidente` (9 = não acidente), `regimeAtendimento`
   (tabela 76: **01 Ambulatorial**, **05 Telessaúde** para a consulta online).
8. `procedimentosExecutados`: um ou mais `procedimentoExecutado` com
   `sequencialItem`, `dataExecucao`, `horaInicial`/`horaFinal` (opcionais),
   `procedimento` (`codigoTabela` 22 ou 00, `codigoProcedimento`, descrição
   até 150), `quantidadeExecutada`, `reducaoAcrescimo` (1.00), `valorUnitario`,
   `valorTotal` e `equipeSadt` (quem executou: código na operadora ou CPF,
   nome, conselho, número, UF, CBO).
9. `observacao` (opcional, até 500) e `valorTotal` (`valorProcedimentos`,
   `valorTotalGeral`).

Domínios como o XSD manda: **UF é código IBGE** (SP = 35, nunca "SP"),
**conselho é código** (CRP = 09, CRM = 06, CREFITO = 05), CBO é código de 6
dígitos da lista do XSD (`dm_CBOS`). O banco da Fase 1 já guarda assim.

Solicitante (melhor palpite das fontes secundárias, conferir no manual):
- médico de fora → `contratadoSolicitante` = `99999999999999` (14 noves,
  "código não informado") e o nome e o conselho dele;
- pedido da própria clínica → o código do contratado e os dados de quem
  atendeu.

## 3. O lote e o hash do epílogo

Cabeçalho: `tipoTransacao` ENVIO_LOTE_GUIAS, `sequencialTransacao` (o número
do lote), data e hora, `origem` (o contratado: código, CNPJ ou CPF),
`destino` (registro ANS da operadora), `Padrao` 4.03.00. Corpo:
`prestadorParaOperadora/loteGuias` com `numeroLote` (até 12) e as guias.
`epilogo/hash` fecha o arquivo.

**Um contratado por lote**: a origem é uma só. Guia de profissional
credenciado em nome próprio (CPF) vai em lote separado da guia da clínica.

**Hash**: MD5 do texto de cada elemento-folha, em ordem de documento, sem
separador, sem o próprio hash. As fontes divergem na codificação dos bytes
do MD5 (o manual diz "ISO-8859-1"; uma implementação aberta conferida
contra arquivos aceitos pela ANS diz UTF-8). **O sistema contorna**: todo
texto do XML vai sem acento e em ASCII imprimível (`tiss_ascii` ↔
`tissText`), e aí as duas leituras dão o mesmo hash (teste confere as duas).

## 4. Glosa

Código de 4 dígitos da **tabela 38** (ex.: 1001 número da carteira
inválido; 1202 CNES; 17xx valor/tabela; 18xx autorização). O XSD 4.03.00
lista 769 códigos em `dm_tipoGlosa`; a planilha 202609 tem 470 vigentes.
O sistema aceita qualquer código de 4 dígitos (a operadora manda o que tem
no demonstrativo) e mostra o nome quando está na tabela carregada.

Regra da clínica: **glosa não sai do "A receber"**. O atendimento só sai
quando o dinheiro da operadora entra. Recurso aceito: lançar o pagamento
quando vier. Recurso negado: a guia segue glosada no "A receber"
(decisão pendente: dar baixa como perda, com motivo, num passo futuro).

Glosas comuns que o sistema já previne: carteira vazia (barra o lote),
CNES ausente (avisa), autorização sem data (barra), procedimento sem TUSS
(barra), CBO/conselho de quem atendeu (barra), carteira vencida no dia
(avisa).

## 5. Como isso virou o sistema

Banco (`supabase/migrations/20261103_convenios_fase2.sql`):
- `tiss_guides` + `tiss_guide_items`: nascem pelo gatilho na cobrança de
  convênio; cobrança anulada cancela a guia em aberto; cobrança revivida
  reabre a mesma guia (mesmo número).
- `tiss_batches` + `tiss_batch_guides` + `tiss_batch_items`: o lote e a
  **cópia congelada** do que foi enviado (nunca muda; gatilho
  `tiss_guard_frozen`). O XML e o hash são gerados no banco a partir dessa
  cópia (`tiss_batch_xml`, `tiss_hash`).
- `convenio_payments` + `tiss_guide_settlements`: depósito da operadora e
  acerto por item (pago e glosa com código). Dinheiro não se apaga nem se
  edita (`finance_guard_money_rows`).
- `tiss_guide_appeals`: o registro do recurso.
- `convenio_sequences`: número da guia e do lote por operadora.
- Guia em lote congela também o atendimento: falta, troca de dia,
  profissional, área ou valor e exclusão são barrados até "Reenviar em novo
  lote" (gatilho `tiss_guard_charge`).

Tela (Financeiro → Convênios): **Guias** (fila 40/60 com o que falta),
**Lotes** (montar, baixar XML, marcar enviado, descartar) e **Pagamentos e
glosas** (depósito por lote, glosa, recurso, anular).

Validação: `supabase/validation/20261103_convenios_fase2_scenarios.sql`
(13 cenários, BEGIN … ROLLBACK, devolve o XML do lote 1 para o XSD).
Teste: `frontend/tests/regression/convenios-fase2.test.mjs`.

## 6. O que ainda não está feito (e por quê)

- Ler o XML do demonstrativo da operadora (hoje se lança à mão).
- Enviar recurso de glosa em XML (hoje é no portal).
- Webservice de envio (hoje o lote é baixado e subido no portal).
- Guia de consulta, honorários e anexos (a clínica usa só SP/SADT).
- Assinatura digital do XML (opcional no XSD; nenhuma operadora pediu).
- Baixa de glosa como perda, e repasse de convênio "só quando a operadora
  paga" com regra própria (decisões da administradora).
