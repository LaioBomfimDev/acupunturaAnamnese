# Guia de design de telas para outra IA

Como reformular telas de um sistema de gestão sem retrabalho. Destilado do que deu certo (e do que custou caro) em ~3 meses reformulando telas do Sistema Acup/Vitalis com a administradora da clínica.

Este guia é sobre **percepção**: o que a pessoa vê primeiro, o que ela entende sem ler, e onde ela clica. Não é sobre bonito. Para outro sistema, troque os nomes de arquivo; os princípios valem iguais.

Público: uma IA que vai mexer em telas de um sistema de gestão já em uso, com pessoas reais trabalhando nele hoje.

---

## 0. As cinco regras que, sozinhas, evitam 90% do retrabalho

1. **Arte nova ou reformulação de tela → 3 prévias visuais ANTES de tocar no código.** Quem decide o visual é a pessoa dona do produto, não a IA.
2. **Confirme QUAL tela é antes de desenhar.** Pelo print, pelo título exato ou pergunte. Uma tela parecida não é a tela.
3. **Prévia e tela nova usam o conteúdo real** — rótulos, perguntas, nomes de seção copiados do código, não aproximados de memória.
4. **Nada de tela vazia:** espaço ocupado com informação que também é atalho. "Limpo" não é "vazio".
5. **O que já funciona e as pessoas confiam não se mexe** sem pedido explícito — em especial documento impresso, PDF, papel timbrado.

---

## 1. Processo: 3 prévias, sempre

### Por que
Num pedido de "melhore a tela da disciplina de psicologia", eu redesenhei a tela errada (a de selecionar paciente, não o painel que abre depois). Trabalho inteiro jogado fora. A regra que nasceu daí: **3 prévias, ela escolhe, só então código.**

### Como fazer
- **Antes de desenhar:** localize a tela no código (grep pelo título que a pessoa usou) e leia o componente inteiro. Liste o que existe hoje: títulos, abas, botões, estados vazios, contagens.
- **Monte um quadro com 4 fileiras: Hoje + A + B + C.** "Hoje" é o que mais ajuda a pessoa a decidir — ela vê o que ganha e o que perde.
- **Prévias de verdade, não wireframe cinza:** CSS real do sistema, cor real da instituição, texto real, dados fictícios só nos valores (nome de paciente, número de contagem).
- **Mostre computador e celular** da mesma opção, lado a lado.
- **Recomende uma** e diga por quê, numa linha. Ela escolheu contra a minha recomendação várias vezes — e também pediu "junção da A e da B" e "exatamente A e C". Combinação é resposta válida: desenhe prévias combináveis, não três mundos fechados.
- **Depois da escolha, não reabra a discussão.** A escolha dela vale até ela mudar de ideia.

### Quando pular as 3 prévias
Só quando é acréscimo dentro do estilo já escolhido, com pedido bem específico ("ponha os mesmos botões do menu neste painel"). Mudança de layout, de hierarquia ou de cor: prévia.

### Onde rodar as prévias
Melhor caminho, em ordem:
1. **Harness local** do próprio app (servidor de desenvolvimento com serviços falsos e dados fictícios): a prévia é o componente real, com o CSS real. É o que mais aproxima.
2. **Página HTML publicada** (artefato/link) com o CSS real copiado: boa para comparar 4 fileiras lado a lado.
3. Imagem estática: último recurso, não deixa medir largura nem rolagem.

Meça largura real na prévia (375px e 1280px no mínimo). Prévia que só existe na sua cabeça não revela que cinco botões de 413px não cabem em 290px.

---

## 2. Fidelidade: nunca invente conteúdo

O erro mais caro que cometi: desenhar um painel de gráficos plausível para uma tela de "Relatórios" que não tinha gráfico nenhum, e inventar campos de anamnese em vez de usar os reais. A pessoa aprova o mockup pensando que é o sistema. "Quase certo" custa duas rodadas e dá a ela uma falsa sensação de que algo já existe.

**Regra:** antes de desenhar qualquer superfície real (formulário, painel, navegação), leia o componente/config de verdade e extraia o texto **verbatim** — rótulo de botão, título de seção, nome de campo, mensagem de estado vazio, texto de ajuda.

Pode aproximar só o decorativo: nome de pessoa de exemplo, número de contagem, horário. Nunca a estrutura, a navegação ou a pergunta.

Se a pesquisa mostrar que algo que você já entregou estava **errado** (não só incompleto), corrija a tela — não complemente por cima.

---

## 3. Percepção: os princípios que ela repetiu mais

### 3.1 Número é atalho
Ela gosta de números, e **número tem que ser clicável** e levar exatamente para aquela lista. Cada aba, cada cartão, cada item de menu carrega o número que mais importa nele. O número é a resposta da pergunta "preciso olhar isso hoje?".

Padrões que funcionaram:
- Aba com **ícone + número + uma linha de resumo** tirada do que a tela já carregou — nunca só o nome.
- Tela de entrada de um módulo como **Resumo de quadros**: um quadro por aba, com o mesmo número que aparece ao lado do nome no menu, contado pelo mesmo critério da aba (senão a pessoa perde a confiança nos dois).
- Bloco **"Pede atenção"** no topo do menu: cada linha é um atalho para a parte que pede ação, com tom por urgência (vermelho = risco, âmbar = pergunta em aberto, cinza = incompleto). O bloco **lembra, nunca decide**.

### 3.2 Sem dado ainda → traço, nunca zero
"0" é uma informação (não tem nada); traço é "ainda não sei". Confundir os dois faz a pessoa acreditar que está tudo em ordem quando a busca falhou.

Corolário técnico, e isso é regra dura: **fonte que falha aparece como aviso no seu quadro, nunca vira zero.** Carregue as contagens em paralelo e deixe cada quadro falhar sozinho.

### 3.3 Densidade com propósito
Reação dela ao primeiro rascunho: "gostei mas ainda possui muitos espaços vazios... tente sempre fazer atalhos, sempre botões clicáveis direcionando pra aquela informação".

Como aplicar: cubra o espaço com conteúdo **genuíno e acionável** antes de aceitar como "arejado". Lista que já mostra que é navegável (seta, cursor), coluna curta completada com um segundo bloco útil, bloco de acesso rápido com botões — não links de texto soltos.

Isso **não** é licença para enfeite: cada elemento novo precisa ser navegável ou informativo. Decoração que não leva a lugar nenhum é pior que espaço vazio.

E lembre: tela funcional real tem mais funções do que a ação principal sugere. Uma agenda não é só marcar horário — tem feriado, confirmação pendente, faltoso, pesquisa, horário vago. A UI dá atalho para essas funções, não as esconde.

### 3.4 Cor é significado, não enfeite
- Uma cor de ação só: a **cor da instituição**, e ela é configurável. Nada de preto/petróleo fixo em botão principal e item selecionado.
- Cor só no **elemento principal**: botão primário, aba ativa, item selecionado, foco, número de seção, marca. Título comum fica negrito, não colorido.
- **Vermelho é reservado para risco.** Âmbar para validação. Se a paleta de escolha livre inclui um vermelho igual ao vermelho de risco, tire da paleta.
- Cor de destaque **nunca** como texto sobre fundo escuro; contraste ≥ 4,5:1 para texto.
- Se a pessoa pode escolher a cor, o sistema inteiro tem que obedecer — inclusive a barra da janela do app instalado. Ela varre a tela procurando o botão que ficou cinza, e acha.

### 3.5 Hierarquia pela leitura, não pela posição
Reorganizações que ela aprovou tinham todas a mesma lógica: **o que se faz primeiro fica primeiro na leitura.**
- Fila de trabalho à esquerda, formulário à direita, 40/60, "como caixa de entrada": termina um, cai no próximo.
- Hora em coluna própria (olho varre coluna, não frase).
- Filtros dois a dois, não em fila única apertada.
- Lista com a altura que sobra (flex), **nunca** uma conta fixa de pixels — a lista é o conteúdo, não a moldura.

### 3.6 Dois lados: dia a dia × o que se ajusta uma vez
Separação que resolveu um menu grande demais: dois botões no topo, **Gestão** (o que se usa todo dia) e **Configurações** (o que se ajusta uma vez), e o menu da esquerda mostra só os grupos do lado aberto. Pessoas não procuram por categoria de domínio; procuram por frequência de uso.

### 3.7 Explicação sob demanda
Ela não quer parágrafo explicativo aberto no topo ("atrapalha o visual"), e quer ajuda intuitiva. Solução: botão **"Como funciona"** (com texto, não só "?") que abre painel lateral — de baixo no celular — com seções fixas:

> O que é · O que dá pra fazer · Como ler · Quem vê e quem altera · Bom saber

Escrita **a partir dos rótulos reais da tela**. E a exceção que importa: **aviso que muda o que a pessoa pode fazer agora** (campo travado, atendimento de outro profissional) fica visível junto do controle, nunca escondido na ajuda.

### 3.8 Atrito proporcional ao risco — e nada de burocracia inventada
Ela pediu "confirmação dupla" para excluir. Eu entendi "duas pessoas" e construí uma fila de aprovação. Corrigido na hora: **confirmação dupla é a MESMA pessoa com mais atrito que um clique.**

Regra que saiu disso:
- Exclusão definitiva: a pessoa **digita a palavra** ("excluir") num campo. Digitar obriga a ler o aviso. Nunca um sim/não de caixa de diálogo do navegador.
- **Nunca** exigir que uma segunda pessoa aprove depois, quando quem pede já é quem decide.
- **Nunca** pedir motivo/justificativa a cada clique de quem administra. "Sendo a adm não preciso me justificar." A distinção de intenção mora em **qual botão** foi apertado (Excluir = erro meu, sai de tudo; Cancelar = o paciente desmarcou, fica no histórico), não num campo de texto.
- Dinheiro e registro clínico lançados não se editam nem se apagam: **anula com motivo**. Aí o motivo faz sentido, porque é rastro, não cerimônia.

### 3.9 Janela sobreposta tem um só comportamento
Toda janela, painel lateral e ajuda fecha com **Esc, clique fora e ×** — ela disse que isso é muito importante. Esc fecha só a de cima. Clique fora só conta se começar e terminar no fundo. Enquanto salva, a janela segura.

E: **formulário com algo digitado pergunta antes de descartar.** Nunca descarte calado — em sistema de gestão, texto perdido é trabalho perdido.

### 3.10 Uma saída só
"Sair da conta" mora num lugar só, no pé do menu lateral, em qualquer largura. No canto de cima parecia "sair desta tela", não da conta. Toda função ambígua por posição é bug de percepção.

### 3.11 Movimento é enfeite
Animação pode existir, mas: com `prefers-reduced-motion` nada anima, e o valor que "sobe contando" tem que **chegar no número certo mesmo sem nenhum quadro renderizar**. Nunca ponha informação só no movimento.

### 3.12 Identidade própria, sem peso
Ela rejeita o "SaaS minimalista padrão" — mesmo quando cita produtos famosos como referência de "limpo". Quer algo reconhecível como marca dela. Ao mesmo tempo: **sem animação pesada, sem biblioteca de UI grande, sem carregamento bruto.** CSS próprio e leve.

Traduzindo: busque um motivo visual autoral (proporção, detalhe, um elemento recorrente) em vez de replicar 1:1 um template conhecido. "Limpo" é a pista do acabamento, não o pedido de clonar.

### 3.13 Documento impresso é outro meio — e é intocável
Reação quando pintei a saída impressa com a cor do app: "no preview você alterou sim o design da impressão, quero como já está".

Regra:
- O **conteúdo** do documento/PDF/papel timbrado fica preto/cinza/branco. Sem cor de marca do app.
- A cor que aparece ali é a **cor da instituição** (a mesma do timbrado dela), nunca a do produto.
- Estrutura de campos do documento é a que já existe. Não inventar tabela, selo ou seção nova.
- Botões de exportar (Imprimir, Baixar PDF) também neutros.
- A tela **em volta** do documento (abas do editor, painéis) segue a paleta nova normalmente. A restrição é só o documento.

---

## 4. Responsivo: um corte só

Decisão dela, e virou lei: **"tablet é só um celular grande"**. Um corte (≤1024px), mesma navegação, mesmo visual. Nenhum meio-termo entre celular e computador — meio-termo é onde moram os defeitos que ninguém testa.

- **O topo só diz onde a pessoa está. Navegar fica embaixo**, no alcance do polegar: barra fixa com no máximo cinco destinos. Destino que não cabe vai para o menu.
- **Tela dentro de tela** (ficha, editor) ganha faixa "Voltar a…" acima da barra, nunca um "← Voltar" escrito à mão no topo.
- **No celular, tela com muitas partes vira índice:** a entrada lista as partes; cada parte ocupa a tela inteira, com volta para o índice. O estado "parte aberta" vale em qualquer largura e **o CSS decide o que aparece — nunca o JavaScript olhando a largura** (o detector de largura não dispara na hora certa e você descobre em produção).
- **Painel lateral vira painel de baixo** no celular, e fecha ao salvar, excluir ou trocar de dia. O erro aparece dentro dele.
- Nada mais largo que ~360px na faixa de celular. Tabela larga vira **cartão** (com rótulo em cada linha).
- **A página nunca rola de lado.** Esse é o defeito que ela percebe na hora, e o que eu mais produzi.

### Armadilhas de CSS que me pegaram de verdade
- Coluna de grid com conteúdo largo: `minmax(0, 1fr)`, nunca `1fr`. Com `1fr` o conteúdo empurra e a página rola de lado.
- Em flex de coluna, `flex-basis` em pixels **vira altura**. Use `flex: 0 0 auto`.
- Bloco com largura fixa (`min-width`, `flex: 0 0 auto`) dentro de barra de filtros: ele é quem estoura os 375px. Mede 392 numa tela de 375 e você não vê sem medir.
- Se o `body` tem `zoom`, toda medida presa à janela (`100vh`) passa do fim da tela: use uma variável calculada. E medida que mistura `getBoundingClientRect` (vem com zoom) com `offsetWidth` (sem) precisa dividir pelo zoom.
- Em emulação de celular, compare `innerWidth` com `scrollWidth`: com overflow o viewport cresce (375 "vira" 404) e o layout parece certo.
- Na impressão a folha A4 tem menos de 1024px de largura: **a regra de celular vale no papel.**

---

## 5. Escala e tipografia

Pedido dela: o sistema parecia "muito pequeno" (letra base de 11–13px) com espaço sobrando nas laterais, e ela pensa em quem tem vista ruim. Queria usar 100% da tela, "como um sistema de verdade".

- Letra de trabalho: **mínimo ~12,5px**, e isso é piso, não alvo.
- Zoom global de ~10% acima de 1024px funcionou; 15% foi demais. Celular, tablet e impressão ficam em 1.
- Telas de trabalho ocupam a largura toda; **limite de largura só no bloco que precisa de linha curta** (texto corrido), não na tela.
- Cuidado com a mistura: coluna estreita de 300px com letra de 11px ao lado de títulos já grandes dá a impressão de "um lado com zoom absurdo e o outro sem". Zoom é global; a proporção interna é sua responsabilidade.

---

## 6. Linguagem da interface

- Tudo no idioma de quem usa. Nada de "Workspace de…" no meio de uma tela em português.
- **Pluralize certo** ("1 item / 2 itens"), inclusive em contagem dinâmica.
- Rótulo é o que a pessoa chama a coisa, não o nome da tabela.
- Nome abreviado que já termina em ponto ("Laize de S.") não leva outro ponto no fim da frase. Detalhe pequeno; ela viu.
- Texto de ajuda e aviso saem dos rótulos reais da tela.
- Nome de concorrente não entra em comentário, commit nem documento.

---

## 7. Catálogo de antipadrões (todos foram cometidos aqui)

| Antipadrão | O que aconteceu | O certo |
|---|---|---|
| Redesenhar sem confirmar a tela | Reformulei a tela vizinha; tudo desfeito | Confirmar pelo título/print; 3 prévias |
| Mockup com conteúdo plausível | Dashboard de gráficos que não existia | Texto verbatim do código |
| Pintar o documento impresso | PDF ganhou cor de marca | Documento neutro; cor é da instituição |
| "Confirmação dupla" = duas pessoas | Fila de aprovação inútil para quem já decide | Mesma pessoa digitando a palavra |
| Pedir motivo a cada ação | Caixa de prompt pedindo motivo do cancelamento | Intenção mora no botão escolhido |
| Zero em vez de traço | Busca falhou e a tela disse "0" | Traço; falha aparece no quadro |
| JS decidindo por largura | Painel de baixo não abria na conferência | CSS decide; estado é único |
| `1fr` em coluna com conteúdo largo | Página rolando de lado | `minmax(0, 1fr)` |
| Lista com altura calculada em px | Lista cortada/sobrando | Flex, altura que sobra |
| Número que não é clicável | Pessoa vê "3 pendentes" e não sabe onde | Número leva à lista exata |
| Tema escuro parcial | Texto clareando sobre fundo branco; virou fonte de bug | Um tema bem feito, ou nenhum |
| Dois títulos na mesma tela | "Área de Psicologia" + "Iniciar atendimento" | Um título; o topo só situa |
| Reabrir escolha já feita | Insistir na opção que eu recomendei | A escolha dela vale |

---

## 8. Checklist antes de dizer "pronto"

1. Abri a tela real (ou o harness) em **375, 768, 1024, 1280** e nenhuma delas rola de lado.
2. Medi `scrollWidth` contra `innerWidth` no celular.
3. Os números da tela batem com a lista que eles abrem, contados pelo **mesmo critério**.
4. Sem dado ainda → traço; busca que falha → aviso visível.
5. Janela fecha com Esc, clique fora e ×; formulário com texto pergunta antes de descartar.
6. Cor de ação é a da instituição; vermelho só em risco; contraste conferido.
7. Com `prefers-reduced-motion` nada anima e nada de informação se perde.
8. Se mexi em documento/PDF: continua neutro e com a estrutura antiga.
9. Texto em português, plural certo, rótulos iguais aos do código.
10. **Teste de regressão** cobrindo a regra nova (se o teste lê o código-fonte com expressão regular, case fim de linha com `\r?\n` — checkout no Windows traz CRLF).
11. Gate completo: lint, testes, build. Falhou algo, eu digo o que falhou — não maquio.
12. Escrevi a regra durável no manual do projeto, com o nome do teste.

---

## 9. Como registrar as decisões (isso é o que fez o processo escalar)

Cada decisão visual aprovada virou **uma linha de regra** no manual do projeto, com três partes: a decisão, a data, e o nome do teste que a protege. Exemplo do formato que funcionou:

> Escrever evoluções é fila à esquerda e formulário à direita, 40/60 (opção B de 05/10/2026), como caixa de entrada: fila primeiro no HTML, hora em coluna própria, filtros dois a dois, lista com a altura que sobra (flex, sem conta fixa de px) e letra de pelo menos 12,5px. Nunca volta a fila estreita presa em px. Teste: `evolutions-screen.test.mjs`.

Por que isso importa para uma IA: sem esse registro, a próxima sessão desfaz a escolha por achar que sabe melhor. A frase **"nunca volta a X"** é a parte mais valiosa — ela guarda o erro, não só o acerto. E separe: regra durável no manual do repositório (qualquer agente segue); estado/pendência/preferência na sua memória de sessão.

---

## 10. Skills de design disponíveis nesta instalação

Os arquivos `SKILL.md` de todas elas estão copiados em [`skills/`](skills/), com índice e instruções de instalação em [`skills/README.md`](skills/README.md) — é só copiar a pasta da skill para `.claude/skills/` do outro projeto. As quatro marcadas com **✱** são entregues pela plataforma na hora: não existem em disco, então o substituto delas em outra IA é este guia.

### Núcleo visual
| Skill | Quando chamar |
|---|---|
| `artifact-design` **✱** | **Antes de escrever qualquer página/prévia HTML.** Contrato da página: título, tema claro/escuro, tokens, limite de tamanho, layout, quanto esforço de design o pedido merece |
| `artifact-diagramming` **✱** | Diagrama que precisa mostrar o mecanismo real (fluxo, arquitetura), com SVG legível nos dois temas |
| `artifact-capabilities` **✱** | A página precisa guardar estado, lembrar o que as pessoas fizeram, ler dado ao vivo, receber arquivo |
| `dataviz` **✱** | **Antes da primeira linha de código de qualquer gráfico**, KPI, medidor, dashboard — em qualquer meio. Paleta, forma do gráfico, eixo, legenda, acessibilidade |
| `accessibility` | WCAG 2.2 AA, ARIA semântico, traits nativos (iOS/Android); auditar contraste, foco, leitor de tela |
| `anthropic-skills:theme-factory` | Precisa de uma paleta/tipografia coerente: 10 temas prontos ou gerar um |
| `anthropic-skills:canvas-design` | Arte estática de verdade (pôster, capa) em `.png`/`.pdf` |
| `anthropic-skills:web-artifacts-builder` | Protótipo HTML complexo, com estado/rotas/componentes (React, Tailwind, shadcn) |
| `anthropic-skills:algorithmic-art` | Arte generativa em p5.js |
| `anthropic-skills:brand-guidelines` | Cor/tipografia da marca Anthropic (não a do seu cliente) |
| `anthropic-skills:slack-gif-creator` | GIF animado para Slack |

Arquivos: `skills/projeto/accessibility` e `skills/anthropic/` (`theme-factory`, `canvas-design`, `web-artifacts-builder`, `algorithmic-art`, `brand-guidelines`, `slack-gif-creator`).

### Implementação da UI
Em `skills/projeto/`: `frontend-patterns` · `react-patterns` (hooks, fronteira servidor/cliente, Suspense, formulário, composição acessível) · `react-performance` · `react-testing` · `vite-patterns`

### Saída em documento (o design do que é impresso/enviado)
Em `skills/anthropic/`: `docs` · `docx` · `pptx` · `pdf` · `xlsx`. Em `skills/projeto/`: `nutrient-document-processing`

### Interface de dado clínico/sensível
Em `skills/projeto/`: `healthcare-emr-patterns` (entrada de dado clínico, fluxo de atendimento, UI acessível) · `healthcare-cdss-patterns` (severidade de alerta, onde o alerta entra no fluxo) · `healthcare-phi-compliance` · `hipaa-compliance`

### Processo e qualidade em volta do design
Em `skills/projeto/`: `verification-loop` · `tdd-workflow` · `ai-regression-testing` · `prompt-optimizer` · `architecture-decision-records` · `safety-guard`. Em `skills/anthropic/`: `skill-creator`. Comandos do Claude Code (sem arquivo): `/code-review` · `/simplify`

Agentes úteis na revisão de tela: `react-reviewer` (hooks, render, acessibilidade), `code-reviewer`, `silent-failure-hunter` (acha o "virou zero em silêncio").

> Chamar skill não substitui olhar a tela. `artifact-design` e `dataviz` dão o contrato; a decisão de percepção continua sendo a deste guia.

---

## 11. Prompt para colar na outra IA

> Você vai reformular telas de um sistema de gestão em uso. Antes de qualquer código:
>
> 1. Confirme exatamente qual tela é (título no código ou print). Na dúvida, pergunte.
> 2. Leia o componente real e extraia o texto verbatim: títulos, abas, botões, campos, estados vazios.
> 3. Monte 4 fileiras de prévia — **Hoje, A, B, C** — com o CSS e o texto reais, em computador e celular, e recomende uma numa linha. Espere a escolha. Combinação ("A + C") é resposta válida.
> 4. Só então implemente a escolhida, com teste de regressão, e registre a decisão como uma regra de uma linha ("nunca volta a X. Teste: …").
>
> Princípios não negociáveis: número é atalho clicável; sem dado ainda é traço, nunca zero, e busca que falha aparece em vez de virar zero; espaço ocupado com informação acionável, nunca enfeite; cor de ação é a da instituição e vermelho é só risco; cor só no elemento principal; um corte de responsivo (≤1024px = celular, tablet incluído), topo só situa e navegação fica embaixo, a página nunca rola de lado; janela fecha com Esc/clique fora/× e formulário com texto pergunta antes de descartar; exclusão definitiva confirma digitando a palavra, e quem administra não se justifica a cada clique; documento impresso/PDF fica neutro, com a estrutura que já tem; animação é enfeite e some com `prefers-reduced-motion`; `minmax(0, 1fr)` em coluna com conteúdo largo e lista com a altura que sobra, nunca conta de px.
>
> Nunca invente pergunta, caminho ou painel que não existe. Nunca reabra uma escolha visual já feita. Ao terminar, diga o que foi verificado e em quais larguras — e o que não foi.

---

*Escrito em 2026-11-06, a partir das decisões registradas em `AGENTS.md` §7 e §8 e do histórico de prévias aprovadas entre agosto e novembro de 2026.*
