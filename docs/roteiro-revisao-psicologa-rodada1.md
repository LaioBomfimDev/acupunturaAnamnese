# Roteiro de revisão — Workspace de Psicologia (teste na Vercel)

**Para quem:** psicóloga revisora. **Objetivo:** navegar o sistema já publicado e (1) dizer o que está **certo/errado clinicamente** e (2) tomar as **decisões** que faltam para construirmos o resto — não é para "aprovar tudo", é para corrigir.

> ⚠️ **Tudo aqui é RASCUNHO a validar.** O vocabulário, as perguntas, os eixos, os instrumentos e os textos da IA foram formulados a partir de literatura (DSM-5-TR, CID-11, ABA/TEA, Neuropsicologia-CFP) e **esperam a sua palavra**. Nada é registro clínico definitivo enquanto você não validar.

> 🔧 **Antes de testar (passo do Laio):** fazer o deploy das Edge Functions, senão os botões de IA (Revisar, Leitura, Rascunho, Relatório neuro) podem falhar ou vir incompletos:
> `npx supabase functions deploy psych-suggest-marks psych-reading psych-report --project-ref hoyznqffprojawxvkfcd`
> e aplicar `docs/aplicar-sql-revisora-knowledge-2026-07-13.sql` no SQL Editor.

Como responder: em cada seção há **“Decisões que preciso de você”**. Pode responder aqui mesmo (escreva depois de cada `→`), por áudio, ou anotando na tela. Sem resposta certa — é a sua clínica que manda.

---

## 0. Acesso e primeira impressão
- Entre na URL da Vercel com o login de **psicóloga**.
- Selecione (ou cadastre) um **paciente de teste** — não use paciente real nesta fase.

**Decisões que preciso de você:**
- A linguagem geral (rótulos, avisos, tom) soa adequada para o seu consultório? → 
- Falta algum aviso ético/LGPD que você faria questão de ver logo na entrada? → 

---

## 1. Escolha do perfil de anamnese (Painel / “Como vamos atender?”)
Ao abrir o paciente, o sistema oferece caminhos: **Anamnese infantil**, **Anamnese adulto** e **Avaliação neuropsicológica**. O perfil também considera **sexo clínico** (menina/menino, mulher/homem) só para **direcionar perguntas pertinentes** — nunca como evidência diagnóstica.

**Decisões que preciso de você:**
- A divisão infantil × adulto × avaliação faz sentido como porta de entrada? → 
- Usar “sexo clínico” só para abrir perguntas de contexto corporal/reprodutivo é aceitável do seu ponto de vista ético? Como você quer nomear isso na tela? → 
- Falta algum perfil (ex.: casal, idoso, adolescente separado do infantil)? → 

---

## 2. Anamnese clínica
Teste: preencher os campos livres; usar os **botões de palavra rápida** (escrevem por você); ler as **perguntas-guia** sob cada campo; no perfil infantil, marcar **quem respondeu** (informante) e usar **“guardar esta versão e repetir depois”**; preencher os **eixos de formulação**; e o **bloco de sinais de risco** (abra “Como investigar”).

**O que o sistema faz / não faz:** organiza e lembra. O bloco de risco **destaca e alerta**, mas **a conduta é sempre sua**.

**Decisões que preciso de você:**
- Os **campos** e a **ordem** batem com a sua anamnese real? O que sobra, o que falta? → 
- As **perguntas-guia** e as **palavras rápidas** estão clinicamente corretas e no seu vocabulário? → 
- Os **itens de sinais** (humor, ansiedade, sono, cognição, trauma, etc.) estão certos? Algum item mal-formulado ou que você removeria? → 
- Os **sinais de risco** e as **perguntas de triagem** estão adequados e seguros? → 
- O controle de **informante / histórico de respostas** (infantil) resolve o problema de “quem disse o quê”? → 

---

## 3. Revisão assistida da IA (painel lateral direito)
Na Anamnese, à direita: **“Revisão assistida da anamnese”**. Clique em **Revisar anamnese com IA**. Ela sugere sinais para você **conferir**, cada um com confiança e, quando é só indício, o selo **“a investigar”**.

Teste as três ações num card: **Confirmar na ficha**, **Não se aplica**, **Corrigir interpretação**. Depois **Gerar leitura (rascunho)** logo abaixo.

**Ponto central de honestidade:** *Confirmar* grava no prontuário; *Não se aplica* só descarta o card; *Corrigir* é o que **ensina** a IA. Confirmar/ignorar **não** treina a IA.

**Decisões que preciso de você:**
- As sugestões são úteis ou atrapalham? A IA está **exagerando** (transformando menção em problema) em algum caso? → 
- O selo **“a investigar” × confirmado** ajuda a não pular etapa? → 
- A **leitura em rascunho** (visão geral, hipóteses, riscos, perguntas) respeita o limite de “não é diagnóstico”? Onde ela erra o tom? → 

---

## 4. Perguntas complementares
Aba **“Perguntas complementares”**: selecionar perguntas de aprofundamento, registrar resposta e informante. Elas alimentam a leitura da IA sem repetir o que já foi perguntado.

**Decisões que preciso de você:**
- O banco de perguntas está bom? Faltam perguntas suas? → 
- Esse fluxo separado (em vez de tudo na anamnese) ajuda ou fragmenta? → 

---

## 5. Avaliação neuropsicológica
Caminho **“Avaliação neuropsicológica”**: encaminhamento/demanda, **instrumentos** (planejados pela profissional), **10 sessões** (planejamento → aplicação → integração → devolutiva), **integração** dos resultados e **relatório neuro**.

**O que o sistema faz / não faz:** organiza o processo. **Instrumentos, interpretação e conclusão são 100% seus** — a IA não pontua teste nem conclui.

**Decisões que preciso de você:**
- A estrutura de **10 sessões** e as finalidades batem com o seu processo real? → 
- A lista de **instrumentos-modelo** faz sentido ou deve ser trocada/removida (para não parecer prescrição de bateria)? → 
- Os campos de **integração** (convergências, divergências, hipóteses, limitações, conclusão) cobrem seu laudo? → 

---

## 6. Hipóteses / diagnóstico
Aba **“Hipóteses/diagnóstico”**: hipóteses de trabalho e diferenciais, com **o diagnóstico registrado por você** (nunca pela IA).

**Decisões que preciso de você:**
- A separação **hipótese de trabalho × diferencial × diagnóstico da profissional** está clara e segura? → 
- Você quer campo para **CID/DSM** aqui (preenchido só por você), ou prefere texto livre? → 

---

## 7. Evolução
Aba **“Evolução”**: registro por sessão — temas, intervenções, resposta percebida, risco reavaliado, acordos, próximos passos. Histórico em tabela.

**Decisões que preciso de você:**
- Os campos da sessão batem com como você registra evolução? → 
- Falta algo (ex.: escala de humor/adesão, anexos)? → 

---

## 8. Relatório
Aba **“Relatório”**: modos **Registro interno** e **Relatório psicológico**, com papel timbrado/logo da clínica. Teste **Gerar rascunho com IA**, **Editar**, e **Imprimir/PDF** (o rascunho de IA exige **confirmar revisão** antes de imprimir).

**Decisões que preciso de você:**
- Os **modos de documento** certos são esses dois? Faltam **Declaração** e **Resumo de encaminhamento**? → 
- O texto gerado é aproveitável como ponto de partida ou atrapalha? → 
- O **timbrado/rodapé/assinatura** estão como você emitiria? → 

---

## 9. O que ainda está vazio de propósito (placeholders)
Estas abas abrem, mas dizem **“Em construção”** — é o que vamos desenhar **com você** na próxima etapa:
- **Síntese do caso** (fatores predisponentes/precipitantes/perpetuadores/protetivos)
- **Objetivos** e **Plano terapêutico** (o plano de cuidado)
- **Biblioteca** de Psicologia

**Decisões que preciso de você (para desenhar certo):**
- **Síntese:** você trabalha com o modelo dos 4 P (predisp./precip./perpet./protet.) ou outro? → 
- **Plano de cuidado:** o que não pode faltar em objetivos e plano? (encaminhamentos, rede de apoio, frequência, critérios de revisão) → 
- **Biblioteca:** que fontes de Psicologia você confia e gostaria de poder consultar dentro do sistema? → 

---

## 10. Invariantes de segurança — confirme que estão sendo respeitados
- [ ] O bloco de **risco** aparece com destaque e **nunca decide** por você.
- [ ] A IA **nunca fecha diagnóstico ou conduta** sozinha.
- [ ] Os **percentuais** medem **preenchimento da ficha**, não “confiança diagnóstica”.
- [ ] Relatório com rascunho de IA **exige sua confirmação** antes de imprimir.
- [ ] **Nada de Acupuntura/MTC** aparece dentro da Psicologia.

Se algum destes falhar em qualquer tela, anote onde: → 

---

## 11. Três decisões que destravam a próxima rodada
1. Do que já existe, **o que está aprovado como está**, o que precisa **ajuste**, e o que você **remove**? → 
2. Para **Síntese / Objetivos / Plano de cuidado**, qual modelo teórico devo seguir? → 
3. **Documentos**: quais tipos de relatório/laudo/declaração o sistema precisa emitir? → 
