# Manual de Comportamento da IA

Arquivo dinâmico. Consulte antes de qualquer alteração no projeto. Define como a IA pensa, decide, implementa, testa e mantém a própria memória.

Regras de módulo ficam em `docs/` e só precisam ser lidas ao tocar o módulo:

- Mapas, Atlas, KM-Agent, fontes visuais, catalogação de PDFs por domínio, dietoterapia/ervas → `docs/agents-mapas.md`
- Módulo Língua e IA assistiva (pulso/face futuras) → `docs/agents-lingua.md`
- Histórico completo de incidentes de regressão → `docs/regressao-log.md`

## 0. Invariantes (não violar)

- **Gate humano é inegociável.** A IA é colaboradora rápida, não autoridade clínica. Nada de conduta/diagnóstico final automático; conhecimento curado fica em `draft`/`review` até aprovação profissional.
- **Dados clínicos e privacidade.** Fotos de pacientes nunca viram base64 em registros nem entram no bundle. Sem secrets/service role/tokens no frontend, logs, commits ou docs. RLS e limites de permissão sempre verificados.
- **Dietoterapia/ervas = só educação revisada** por profissional habilitado; nunca prescrição, dose, preparo ou cardápio. Erva exige toxicologia/interações/cautelas antes de qualquer liberação (ver `docs/agents-mapas.md`).
- **pt-BR em todo texto visível**, com pluralização ("item/itens", nunca "items") e terminologia clínica consistente.
- **Todo bug → teste de regressão + regra destilada** (§4).
- **Quality gate antes de commit/push** (§5).
- **Incerteza em área sensível → pare e proponha** (§3).
- **Mudança pequena, ligada ao pedido; preserve o que não é seu** (§7).
- **Atlas público ≠ fontes protegidas.** Só `atlas-ednea/` é público; `pdf-sources/*` segue protegido (ver `docs/agents-mapas.md`).

## 1. Papel

A IA atua como pessoa programadora sênior:

- analisa arquitetura, dependências, segurança, testes e efeitos colaterais antes de escrever;
- questiona requisitos ambíguos, incompletos ou arriscados;
- prefere soluções simples, locais e coerentes com os padrões existentes;
- evita atalhos que mascaram o sintoma e aumentam dívida técnica;
- explica decisões que afetem manutenção, segurança ou UX.

## 2. Fluxo antes de alterar

Antes de editar código, config, banco, migrations, estilos ou scripts:

1. Leia este arquivo (e o doc de módulo, se aplicável).
2. Leia o contexto relevante: `README.md`, arquivos próximos ao ponto de alteração, scripts disponíveis.
3. Identifique comportamento atual, comportamento desejado e o menor conjunto seguro de arquivos a alterar.
4. Avalie efeitos em arquitetura, estado, banco, autenticação, autorização, segurança, performance, UX e deploy.
5. Só então implemente.

Em área legada/sensível, faça antes uma análise objetiva: causa provável, pontos afetados, riscos e estratégia de validação.

## 3. Protocolo de incerteza

Sem segurança suficiente, não improvise:

1. Liste três alternativas.
2. Diga vantagens, riscos e impacto de cada uma.
3. Recomende uma.
4. Aguarde feedback humano.

Use sempre que a mudança afetar schema de banco, regras de acesso, dados clínicos, autenticação, arquitetura compartilhada, deploy ou comportamento difícil de reverter.

## 4. Teste de regressão

Toda correção de bug vem com teste de regressão:

- reproduz o problema quando viável; idealmente falha antes da correção e passa depois;
- se não der para automatizar, registre o motivo e a validação manual feita;
- não remova nem enfraqueça testes existentes para a suíte passar;
- teste que lê código-fonte com regex casa fim de linha com `\r?\n`, nunca só `\n`: checkout no Windows traz CRLF, e o teste passa num disco e falha no outro;
- **bug recorrente vira regra** — destile a regra na seção/doc certo e registre o incidente completo em `docs/regressao-log.md` (não acumule relatos longos aqui: append constante quebra o cache e infla toda leitura).

```bash
cd frontend
npm run test
```

## 5. Quality gate antes de commit/push

```bash
cd frontend
npm run lint
npm run test
npm run build
```

Se houver Ruby/Rails configurado, rode também `bundle exec rubocop` (estilo), `bundle exec brakeman` (segurança Rails) e `bundle exec rspec` (testes; SimpleCov roda junto quando configurado).

Ferramenta obrigatória ausente: não ignore em silêncio. Informe o impedimento, registre a verificação como não aplicável/bloqueada e proponha a configuração.

## 6. Memória do projeto (dois sistemas, um dono por fato)

- **`AGENTS.md` + `docs/agents-*.md`** = verdade compartilhada do repo: regras e invariantes duráveis, versionadas no git, seguidas por **qualquer** agente (Claude, Codex). Regra durável mora aqui.
- **Auto-memória pessoal do Claude** (`.claude/.../memory/`) = estado entre sessões: status do trabalho, pendências, preferências e o "porquê" de decisões. Não versionada; não é fonte de regra compartilhada.
- **Não duplicar.** Regra que qualquer agente deve seguir → aqui. Status/pendência/preferência → auto-memória, com ponteiro para a seção/doc relevante quando referenciar uma regra.

## 7. Boas práticas de implementação

- Preserve mudanças que não foram suas; sem refatoração ampla sem necessidade clara.
- Prefira APIs, helpers e padrões já usados no projeto.
- Mantenha a mudança pequena, revisável e ligada ao pedido.
- Evolução mora só na tela Evoluções (`components/evolutions/`), fora das disciplinas: nenhum workspace volta a ter aba/formulário de evolução, a Agenda só encaminha pra lá, e falta exige observação. A fila (`appointments_awaiting_evolution`) só cobra atendimentos a partir de 22/09/2026, início real de uso; o histórico importado antes disso tem evolução no sistema anterior. Quem recriar a view mantém o corte. Neuropsicologia evolui ali com o formulário da Psicologia, gravada como `neuropsicologia` (área do agendamento); as Sessões de dentro da Avaliação ficam desligadas (`NEURO_ASSESSMENT_SESSIONS_ACTIVE`), sem apagar o gravado. `EVOLUTION_DISCIPLINES` = array da versão mais recente de `insert_patient_evolution`; migration que recria essa RPC parte da última versão, nunca de uma antiga. Teste: `tests/regression/evolutions-screen.test.mjs`.
- Escrever evoluções é fila à esquerda e formulário à direita, 40/60 (`minmax(0, 2fr) minmax(0, 3fr)`, opção B de 05/10/2026), como caixa de entrada: fila primeiro no HTML, hora em coluna própria, filtros dois a dois, lista com a altura que sobra (flex, sem conta fixa de px) e letra de pelo menos 12,5px. Nunca volta a fila estreita presa em px. Nome curto de profissional já termina em ponto ("Laize de S."): frase que acaba no nome fecha com `endSentence`. Teste: `tests/regression/evolutions-screen.test.mjs`.
- A tela Evoluções abre com duas abas de pasta (`components/ui/FolderTabs.jsx`, opção C de 10/10/2026, a mesma de Gestão → Importáveis), cada uma com o número grande na frente: "Escrever evoluções" (fila, escondida e não desmontada ao trocar, para não perder texto; número = o que a pessoa pode evoluir, `writeTabSummary`) e "Ver evoluções" (conferência, tela inteira, só dois números: atendimentos concluídos e falta evoluir — sem "mesmo dia × outro dia", pedido da administradora; o número da aba é sempre o do mês atual, pelo mesmo `buildEvolutionReview`). Sem número ainda, traço, nunca zero. Teste: `tests/regression/folder-tabs.test.mjs`. Conferência mostra se e quando cada atendimento foi evoluído e quantas correções teve, nunca o texto: lê `patient_evolutions` só com `EVOLUTION_REVIEW_COLUMNS`, sem `conteudo_encrypted`. Administração vê a equipe; profissional só os próprios atendimentos, cortados por `professional_id` (a Agenda é da clínica, mas a RLS só devolve as evoluções da pessoa: sem o corte, o colega vira falso "Falta evoluir"). No celular e no tablet, Período em linha própria e as duas tabelas viram cartão: a página nunca rola de lado. Teste: `tests/regression/evolutions-review.test.mjs`.
- Atendimento que não foi agendado entra por "Registrar atendimento já realizado" (Evoluções e Agenda; o "já" entrou em 06/10/2026): cria o agendamento já Atendido e confirmado, só no passado e até 30 dias; "lançado depois" sai de `created_at`. Nunca reabrir evolução avulsa para esse caso. Teste: `tests/regression/completed-appointment.test.mjs`.
- Ação em lote de pacote na Agenda ("esta e as próximas": cancelar, excluir) conta e lista pelo banco (`listSeriesFrom`, com o mesmo filtro de status da escrita), nunca pelo estado `appointments`, que só tem o período visível. O aviso diz a quantidade real no plural certo e o intervalo de datas. Teste: `tests/regression/agenda.test.mjs`.
- Pesquisa de satisfação (Gestão): semana (domingo a sábado) e mês contam pela data de envio (`created_at`), e os números do topo seguem o período. Exclusão só pela administradora (policy `satisfaction_surveys_delete`): em lote sobre o que está marcado e visível, digitando "excluir", avisando quando a nota do paciente vai junto, e conferindo quantas o banco apagou de fato (RLS barra sem erro). Teste: `tests/regression/gestao-surveys.test.mjs`.
- Visual de cancelado/não compareceu, fixo × eventual, cor de disciplina e padrões da Agenda vêm de "Configurar agenda" (`clinics.agenda_settings`, só `clinic_admin` grava pela RPC, normalizado em `utils/agendaSettings.js`); os cards leem via `data-look`/`data-series`, nunca por regra de cor fixa por status. Cancelado nunca volta a ser só opacidade; sessão de pacote movida grava `rescheduled_from` e passa a eventual. Nome, cor, ícone e moldura de cada selo são da clínica (`seriesBadges`; padrão Fixo/Eventual, até 16 letras, nomes diferentes entre si, cor só de `AGENDA_COLOR_PALETTE`; o `seriesMarkStyle` antigo vale para os dois): card e detalhe usam `SeriesBadge`/`seriesLabelOf`, nunca o nome escrito à mão. Moldura só com `outline`/fundo, nunca `box-shadow` (é de selecionado, movendo, foco e pendência). Teste: `tests/regression/agenda-settings.test.mjs`.
- Fichas das disciplinas vestem o kit `styles/forms.css` (escopo `.forms-scope`, só tokens). Cor da clínica só em elemento principal (número de seção, sinal marcado, botão primário, foco, aba ativa) e nunca como texto sobre fundo escuro; vermelho só para risco, âmbar só para validação. Seção nova de ficha entra com `FormSectionTitle` e no roteiro (`utils/formRoute.js`). Teste: `tests/regression/forms-visual-standard.test.mjs`.
- Fisioterapia e Nutrição têm abas próprias de avaliação (`components/areas/`) gravadas na mesma sessão do registro da disciplina (`session[sessionKey]`, sem `record_type` novo). Escala com direito autoral entra só com nome, faixa e escore; a Nutrição calcula e mostra a faixa das medidas, mas nunca gera conduta ou plano alimentar. Teste: `tests/regression/fisio-nutri-areas.test.mjs`.
- Cor da tela só é pessoal (`profiles.accent_color`) quando a instituição libera (`clinics.personal_accent_allowed`, padrão fixo); relatório, evolução e papel timbrado usam sempre a cor da instituição. Os links do paciente (confirmação de agendamento, pesquisa de satisfação) têm cor própria escolhida pela admin em Personalizar (`clinics.confirmation_link_color`/`survey_link_color`, NULL = cor do sistema), lida pela Edge Function; nunca a cor pessoal de quem mandou o link (teste: `tests/regression/public-link-colors.test.mjs`). Quem não é admin tem só a Gestão pessoal (`GestaoProfissional`: cor da própria tela + Meu cadastro), sem consulta institucional. O próprio cadastro (`update_my_profile`) nunca edita profissão, papel, clínica ou áreas: profissão libera áreas quando `disciplines` está vazio. Paleta sem vermelho (reservado a risco) e com contraste ≥ 4,5 para texto branco. Teste: `tests/regression/personal-accent.test.mjs`.
- Ação e seleção seguem a cor da clínica (`--r1-accent*`), nunca o preto/petróleo fixo (`--r1-surface-inverse`, `--r1-navy-*`, `--r1-gold-*`, hex/rgba do petróleo): principal e selecionado preenchidos com `--r1-accent`, secundário com texto `--r1-accent` e contorno `--r1-accent-line`; principal sob `:hover` genérico ganha hover próprio. Fora disso: fichas (`.forms-scope`, secundário neutro), PDF/timbrado, status, cor de disciplina, selos de confiança da IA e Login. A barra do app instalado segue a cor da tela (`applyThemeColorMeta`). Gestão: dois botões grandes no topo (08/10/2026), Gestão (dia a dia: Atendimentos/Área do Paciente/Equipe/Documentos) e Configurações (o que se ajusta uma vez: Instituição/Sua conta); o menu à esquerda (`GestaoNav`) mostra só os grupos do lado aberto. Aba nova entra num grupo de um dos lados (`side` em `SECTION_GROUPS`), com id só de letras minúsculas, e no teste. Teste: `tests/regression/clinic-accent-everywhere.test.mjs`. O lado Gestão abre no Resumo (opção B, 10/10/2026): um quadro por aba com o número que mais importa nela e o mesmo número à direita do nome no menu (`counts`), contados em `utils/gestaoSummary.js` pelo mesmo critério da aba, numa carga só (`loadGestaoSummary`, `allSettled`: busca que falha deixa traço só no seu quadro, nunca zero). Aba nova do lado Gestão ganha quadro. No celular e no tablet o Resumo é o índice: a faixa de abas some desse lado e a aba aberta volta por "Voltar ao Resumo" (`HubBackButton nested`). Teste: `tests/regression/gestao-resumo.test.mjs`.
- A entrada de atendimento deve ter uma única ação de saída: quando a área já oferece “Sair” no cabeçalho, não repasse `onSignOut` ao `PatientStart`. Sem esse cabeçalho, preserve a saída do seletor.
- Janela sobreposta (diálogo, painel lateral, ajuda) fecha com Esc, clique fora e ×, sempre por `hooks/useDismiss.js`: Esc só fecha a de cima, clique fora só conta se começar e terminar no fundo, `busy` segura enquanto salva. Formulário usa `guardUnsaved` + `<DismissPrompt>`: com algo digitado, Esc/clique fora perguntam, nunca descartam calados (janela que segue aberta depois de salvar chama `markSaved()`). Só bloqueio de conta e troca obrigatória de senha não fecham. Teste: `tests/regression/dismiss-overlays.test.mjs`.
- Explicação de tela mora no botão "Como funciona" (`components/ui/ScreenHelp.jsx`, textos em `data/screenHelp.js`, seções fixas O que é / O que dá pra fazer / Como ler / Quem vê e quem altera / Bom saber), não em parágrafo aberto no topo, e é escrita a partir dos rótulos reais da tela. Aviso que muda o que a pessoa pode fazer agora (campo travado, atendimento de outro profissional) fica visível junto do controle. Curadoria não usa o botão (§8). Teste: `tests/regression/screen-help.test.mjs`.
- Escala da tela: o body tem `zoom: var(--app-zoom)` (1,1 acima de 1024px e só em `screen`; celular, tablet e impressão ficam em 1). Altura ou largura presa à janela usa `calc(N * var(--vh))` (ou `--svh`/`--dvh`/`--vw`), nunca `vh`/`svh`/`dvh` cru: com zoom, `100vh` passa do fim da tela. Medida que mistura `getBoundingClientRect` (vem com zoom) e `offset*` (sem) divide o primeiro por `currentCSSZoom`. Telas do hub (`.hub-body`) ocupam a largura toda; limite de largura fica só no bloco que precisa de linha curta. Teste: `tests/regression/screen-scale.test.mjs`.
- Navegação no celular e no tablet (≤1024px, opção C escolhida em 04/10/2026; computador não muda): tablet é celular grande (pedido de 05/10/2026), com a mesma navegação e o mesmo visual, num corte só, o da gaveta; nunca volta o meio-termo de 769–1024px. Tela nova: a faixa de celular vai até 1024px e nada pode ficar mais largo que 360px (bloco com `flex: 0 0 auto` ou `min-width` fixo quebra linha; tabela larga vira cartão). O conteúdo das telas do hub segue o mesmo corte (06/10/2026): Agenda (topo empilhado, filtros recolhidos, ferramentas na barra, semana um dia por vez), Pacientes (ficha com o nome em cima das ações, formulário em duas colunas) e Gestão (Resumo como índice no lado Gestão, menu em faixa só em Configurações, filtros empilhados); abaixo de 1024px só ajuste fino de largura (640/520/480px). Coluna de grid com conteúdo largo usa `minmax(0, 1fr)`, nunca `1fr`; em flex de coluna, `flex-basis` em px vira altura (`flex: 0 0 auto`). O topo só diz onde a pessoa está, navegar fica embaixo. Telas do hub montam `HubDock` (`components/HubNav.jsx`, mesmos destinos e regras de perfil do menu da tela inicial, no máximo cinco) e usam `HubBackButton`, nunca "← Voltar" escrito à mão: sem `nested` some no celular (o "Início" está na barra), com `nested` (tela dentro de tela: ficha, evolução, editores da Agenda) vira faixa acima da barra. Atalho repetido do topo leva `hub-topbar-extra`; corpo com título próprio usa `hub-topbar--titled`, h1 que já é o título usa `--lead`. Nas áreas, "Voltar à tela principal" e "Sair" moram na gaveta (Menu): `Sidebar` recebe `onSignOut` com a confirmação de alterações, e o "Sair" do topo leva `app-signout`. Barra e faixa ficam abaixo das janelas (z-index < 60). Tela inicial no celular (opção B, 05/10/2026): o menu escuro (`.hc-rail`) some e o topo é o cartão do dia (`.hc-hero`, que no computador é `display: contents`) com instituição, "Sair", saudação, título e números; as áreas do profissional entram no cartão. Destino que não cabe na barra (Documentos do profissional) fica em `.hc-mobile-only`. Testes: `tests/regression/mobile-hub-nav.test.mjs` e `tests/regression/tablet-phone-screens.test.mjs`.
- Menu das áreas (`Sidebar`, opção C de 10/10/2026): com paciente aberto, o bloco "Pede atenção" no topo lista o que pede ação, cada linha um atalho para a parte (`attention`, montado pela área com `utils/areaAttention.js`): risco de escala ainda não visto (vermelho, de `list_my_instrument_risk_alerts`; falha ao conferir vira aviso, nunca silêncio), pergunta em aberto (âmbar) e parte incompleta pelo roteiro de `utils/formRoute.js` (cinza). O item do menu repete o tom num ponto com texto para leitor de tela. Aba sem conteúdo ainda (`soonTabs`) sai do grupo e fica fechada em "Em breve (N)". O bloco lembra, nunca decide. No celular e no tablet o Menu da barra abre o menu como página inteira, acima da barra (tocar de novo fecha); só o SuperAdm segue com gaveta e fundo escurecido. Teste: `tests/regression/area-menu-attention.test.mjs`.
- Abas da ficha do paciente (09/10/2026, A no computador + C no celular): cada aba leva ícone, número e uma linha de resumo tirada do que a ficha já carrega (`utils/patientProfileTabs.js`), nunca só o nome. Computador: faixa única quando as seis cabem e três por linha no notebook, medido pelo contêiner `pf-tabs` (só em volta dos botões: contêiner prende `position: fixed`), nunca rolando de lado. Celular e tablet: a ficha abre como índice e cada parte ocupa a tela, com "Voltar à ficha" na faixa de baixo; `sectionOpen` vale em qualquer largura e o CSS decide. Aba nova entra em `TABS`, `TAB_GLYPHS` e no resumo. O acesso da Área do Paciente vem por import tardio, só para a administração. Teste: `tests/regression/patient-profile-tabs.test.mjs`.
- Agenda (junção das opções A e B, 05/10/2026): as ferramentas ficam atrás de "Ferramentas" (`AgendaToolsMenu`, conteúdo único em `toolItems`) em toda largura, ao lado de ← Hoje → no computador e de "Filtros" no celular; ferramenta nova entra em `toolItems`, nunca como botão solto no topo. Visões numa linha só. No celular e no tablet (≤1024px, mesmo corte da barra de baixo) o painel lateral (detalhe e "Novo agendamento") só aparece como painel de baixo: abre por atendimento, horário livre ou "+ Novo agendamento", fecha ao salvar, excluir, mover (`startMoving`) ou trocar de dia, e o erro aparece dentro dele. O estado `sheetOpen` vale em qualquer largura e o CSS decide o que aparece, nunca o JS pela largura. Teste: `tests/regression/agenda-mobile-sheet.test.mjs`.
- "Copiar horários vagos" (Ferramentas, 06/10/2026) copia num toque os horários vagos do dia escolhido, um por linha, sem texto de mensagem. A conta (`utils/agendaFreeSlots.js`) usa todos os atendimentos do profissional, nunca os filtrados na tela (`visibleAppointments`): faixa tocada por atendimento ativo ou bloqueio não é vaga, cancelado/não compareceu/cancelado pelo paciente liberam, intervalo e feriado sem atendimento ficam fora, hoje só o que ainda não começou e dia passado não oferece nada. Na visão da equipe sai um bloco por profissional, só de quem tem jornada no dia. Agenda carregando ou com erro não copia. Teste: `tests/regression/agenda-free-slots.test.mjs`.
- Área do Paciente + Gestão → Importáveis (opção C, 06/10/2026): o paciente responde online os formulários que a administração monta, entrando em `/area-do-paciente` com código de acesso (gerado no banco, `XXX-XXX`) + data de nascimento do cadastro. Paciente nunca vira conta do Supabase Auth nem linha de `profiles` (a RLS inteira parte de "logado = equipe"): tudo passa pela Edge Function pública `patient-portal` (service role), que só devolve formulário pendente do próprio paciente, nunca prontuário. 8 datas erradas bloqueiam o código; só a administração libera ou troca. Respostas cifradas com a chave do Vault, salvas com revisão (CAS) + `saveId` e limpas por `sanitizeAnswers`, que existe em `utils/patientForms.js` e espelhada em `supabase/functions/_shared/patientFormAnswers.ts` (mudou um, muda o outro). Formulários e respostas só para `clinic_admin` (`can_manage_patient_portal`); o envio guarda cópia das perguntas. Gerar e ver o código também cabe a quem atende o paciente quando a administração liga em Configurações → Acesso do paciente (`clinics.portal_professionals_manage_access`, padrão desligado, conferido em `can_manage_patient_access`); trocar, desativar e liberar o código nunca. Formulários da clínica entram vazios até ela mandar o conteúdo; escala com direito autoral não entra com as perguntas copiadas. Teste: `tests/regression/patient-portal.test.mjs`.
- Escalas clínicas (aba Escalas, etapa 1 em 08/10/2026: Psicologia, PHQ-9 e GAD-7, aplicação no consultório): cada instrumento é um objeto só em `data/clinicalInstruments.js` (perguntas, pontos, faixas, item de risco, fonte, versão) e a faixa mostrada sai do mesmo cálculo (`utils/instrumentScoring.js`), nunca de um texto à parte. Mudou pergunta, ponto ou faixa: sobe `version` e a anterior vai para `INSTRUMENT_HISTORY`. Escala com mais de uma nota (DASS-21, lote 1 de 10/10/2026) usa `scoring.method: 'subscales'` (perguntas, multiplicador e faixas por subescala) e a tela lê as notas por `scoreViews`, nunca `result.score` direto. Respostas são sempre as da validação (4 no PHQ-9, no GAD-7 e na DASS-21): nunca acrescentar opção, nem a do meio (decisão de 10/10/2026). Perguntas vêm da fonte oficial ou da validação brasileira, com licença conferida, nunca da tela de outra plataforma. Instrumento fica `em_conferencia` até a psicóloga aprovar. Aplicação mora em `patient_instrument_applications` (cifrada, sem acesso direto, só RPC): aplica, recebe o alerta e marca "Vi o alerta" quem atende o paciente na área, na mesma clínica (atendimento dele na Agenda ou responsável da matrícula, `assigned_to`); quem só criou a matrícula (`referred_by`) não conta. A administração da clínica lê sempre (`can_read_patient_instruments`, 09/10/2026). Responsável claro antes de enviar: envio da administração com matrícula na área exige responsável escolhido ou confirmado, "Enviar para outra área" grava o destino como responsável, e escolher ou trocar é só da administração (`set_enrollment_responsible`, ficha → Matrículas), nunca `assigned_to` gravado pelo cliente. Não se edita nem se exclui: quem aplicou anula com motivo. A nota não aparece enquanto o paciente responde; o risco aparece na hora, em `.alert`, e lembra, nunca decide. Tabela clínica nova entra na exclusão de paciente (`admin_decide_patient_deletion`, recriada a partir da última versão). Etapa 2 (08/10/2026): quem atende ou a administração envia a escala para casa (`patient_form_assignments.kind = 'instrument'`); a Edge Function monta as perguntas e calcula a nota pela definição oficial, nunca pelo que vem do aparelho, e `portal_save_answers` grava a resposta e a aplicação (`source = 'area_do_paciente'`) na mesma transação. Definição, cálculo e perguntas do portal têm espelho em `supabase/functions/_shared/` (`clinicalInstruments.ts` gerado por `scripts/sync-instrument-mirror.mjs`; `instrumentScoring.ts` e `instrumentPortal.ts` à mão, conferidos pelo teste). Resposta de risco vinda de casa fica em `has_risk` até quem atende marcar "Vi o alerta" (tela inicial e aba Escalas); o paciente vê o CVV 188 e o SAMU 192 na hora. Testes: `tests/regression/patient-instruments.test.mjs` e `tests/regression/instrument-responsible.test.mjs`.
- Use nomes claros; evite duplicação só quando a abstração melhora a leitura ou reduz risco real.
- Use parsers, validadores e APIs estruturadas; evite manipulação frágil de strings.
- Sem secrets, service role keys, tokens ou dados sensíveis no frontend, logs, commits ou docs públicos.

## 8. Curadoria de conhecimento (política compartilhada)

Vale para anamnese, língua, pulso, pontos e RAG da Biblioteca. Detalhe de catalogação por domínio e fontes visuais em `docs/agents-mapas.md`.

- **Fonte da verdade = o livro/PDFs + MTC genérica (estilo chinês).** Onde o livro fala, segue o livro; onde cala, completa com MTC genérica. Em cada revisão, leia o texto real extraído da fonte.
- **Alimentar amplo, rotear por domínio.** O default é INCLUIR fonte nova no subsistema certo, não excluir. Material de paradigma diferente/conflitante ganha lane própria rotulada — nunca é descartado nem blendado na diferenciação MTC.
- **Conflito entre fontes → `review`/esperar**, não forçar decisão. Segurança vem de roteamento + confiança/proveniência + gate humano, não de exclusão.
- A IA pode propor padrões canônicos novos legítimos (além dos existentes), sempre em `review` até o gate humano.
- **Meta: fazer funcionar, tudo ligado, ~80% de certeza**, estruturado para crítica humana e refino por equipe técnica de acupuntura nas fases finais.
- **Curadoria precisa se explicar na própria tela.** Toda área deve dizer o que revisa e apresentar um passo a passo concreto de localizar → conferir fonte/contexto → decidir → enviar. A legenda de abas, filtros, estados e contagens deve ficar na hero ou, quando a associação visual for importante, imediatamente junto aos controles explicados. Confiança de fonte nunca pode parecer certeza clínica, e enviar proposta nunca pode parecer publicação ou aprovação automática.
- **Sexo clínico e contexto reprodutivo orientam perguntas, não diagnóstico.** Só personalize a investigação quando o dado estiver informado; não presuma anatomia, ciclo menstrual, contexto hormonal ou queixa urogenital a partir de gênero/sexo, nem use esse dado isoladamente como peso de padrão.
- Detalhe clínico: `docs/repertorio-padroes-mtc.md`, `docs/regras-clinicas-lingua-padrao.md`.

## 9. Supabase e dados clínicos

- verifique políticas de RLS e limites de permissão; diferencie chave anônima de service role;
- preserve privacidade e integridade dos dados de pacientes; valide entradas antes de gravar;
- prefira migrações reversíveis ou bem documentadas;
- teste leitura, escrita, atualização e exclusão quando a mudança afetar persistência.
- Em função PL/pgSQL, colunas de `RETURNS TABLE`, parâmetros e variáveis colidem com nomes de coluna: `ON CONFLICT` usa `ON CONSTRAINT <nome>`, nunca `(coluna)` com nome repetido. Valide RPC nova chamando-a de verdade em transação com ROLLBACK, não só lendo o texto. Teste: `tests/regression/plpgsql-on-conflict-ambiguity.test.mjs`.
- Autosave clínico usa escrita versionada com comparação de revisão, chave de idempotência e fila serial por paciente/tipo. Nunca reintroduza `insert`/`update` concorrentes sem CAS.
- Gates de conta ativa, troca de senha e MFA precisam existir no banco/RPC/Storage **e** nas Edge Functions que usam service role; checagem apenas no frontend não autoriza dado clínico.
- Escopo de compartilhamento é fronteira de servidor: RPC nunca devolve `full_session` completo para o cliente filtrar.
- Exclusão de paciente começa por arquivamento + solicitação auditável. Não use `DELETE ... CASCADE` nem executor automático sem política de retenção aprovada.
- A exclusão aprovada anonimiza e nunca apaga a linha de `patients`, então `ON DELETE CASCADE` não dispara: tabela nova com `patient_id` entra pelo nome no snapshot e no DELETE de `admin_decide_patient_deletion`, numa migration nova que parte da última versão da função (só fica de fora com motivo em `KEPT_ON_PURPOSE`). Teste: `tests/regression/patient-erasure.test.mjs`.
- Produção não usa fallback/localStorage para autenticação ou prontuário, nem exporta dado clínico em JSON sem criptografia. Fallback local exige `DEV` + opt-in e deve desaparecer do bundle de produção.

## 10. Manutenção contínua

Atualize o manual quando: surgir um erro recorrente; entrar uma nova ferramenta de qualidade; for adotado um novo padrão arquitetural; uma decisão técnica importante precisar ser lembrada; uma regra estiver causando ambiguidade ou atrito.

Não remova regras sem motivo claro. Quando uma regra ficar obsoleta, substitua por versão atualizada e registre a razão de forma breve. Regras de fonte/curadoria/módulo vão no doc de módulo correspondente, não aqui.

## 11. Comunicação

- Declare suposições; aponte riscos antes de mudanças sensíveis; informe os comandos de validação executados; avise quando algo não foi testado; prefira respostas objetivas, técnicas e acionáveis.
- **Calibre a confiança.** Rotule "sólido/verificado" vs "melhor palpite, revisar". Sem absolutos ("canônico", "100% certo", "nada inventado") sem prova. Separe o opinativo do firme. Incentive o cruzamento (outra IA, equipe de acupuntura) — é o sistema funcionando, não desconfiança.
- Confiança exibida ao usuário em faixas (alta/média/baixa) + inteiro arredondado; nunca decimais (falsa certeza). Detalhe no módulo Língua: `docs/agents-lingua.md`.
