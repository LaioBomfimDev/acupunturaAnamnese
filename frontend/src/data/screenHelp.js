// ============================================================
// Textos do botão "Como funciona" (components/ui/ScreenHelp.jsx).
//
// Um tópico por aba, sempre na mesma ordem de seções — o que falta
// simplesmente não aparece:
//   summary  → "O que é"                (uma frase)
//   actions  → "O que dá pra fazer"
//   reading  → "Como ler"               (números, cores, selos)
//   access   → "Quem vê e quem altera"
//   notes    → "Bom saber"              (regras e prazos)
//
// Aqui mora só EXPLICAÇÃO. Aviso que muda o que a pessoa pode fazer
// agora (campo travado, atendimento de outro profissional) continua
// visível na própria tela, perto do controle — ver AGENTS.md §7.
// Telas de curadoria não usam este botão: a explicação delas fica
// aberta na tela (AGENTS.md §8).
//
// Escreva a partir do que a tela faz de verdade (rótulos iguais aos
// botões), nunca de memória. Teste: tests/regression/screen-help.test.mjs.
// ============================================================

export const HELP_SECTIONS = [
  { key: 'summary', title: 'O que é' },
  { key: 'actions', title: 'O que dá pra fazer' },
  { key: 'reading', title: 'Como ler' },
  { key: 'access', title: 'Quem vê e quem altera' },
  { key: 'notes', title: 'Bom saber' },
];


const MEU_CADASTRO_HELP = {
  title: 'Meu cadastro',
  summary: 'Os seus dados de cadastro no sistema.',
  actions: [
    'Corrigir nome, telefone, documento e endereço — o CEP completa o endereço sozinho.',
    'Quem atende também corrige o registro no conselho e as especialidades.',
    'Gravar em “Salvar cadastro”, no fim da página.',
  ],
  reading: [
    'Nome completo e registro no conselho saem nos relatórios e documentos.',
  ],
  access: [
    'Login, e-mail, tipo de acesso, profissão e instituição ficam só para leitura: quem altera é a administração da instituição. Se algo estiver errado nesses campos, peça a ela.',
  ],
};

/** Gestão da instituição (RelatoriosGestao) — só a administração abre. */
export const GESTAO_HELP = {
  resumo: {
    title: 'Resumo',
    summary: 'A entrada da Gestão: um quadro por aba, com o número que mais importa em cada uma, para saber o que pede atenção antes de abrir.',
    actions: [
      'Clicar num quadro abre a aba dele. No celular e no tablet, “Voltar ao Resumo”, embaixo, traz de volta para cá.',
      'O menu à esquerda repete o mesmo número ao lado do nome de cada aba.',
    ],
    reading: [
      'Indicadores: atendimentos do mês com status Agendado ou Atendido (faltas e cancelamentos ficam de fora).',
      'Faltosos: “Não compareceu” e “Cancelado pelo paciente” dos últimos 30 dias; embaixo, quantos foram sem aviso.',
      'Retornos: pacientes há mais de 30 dias sem nova marcação. Pesquisa de satisfação: nota média das respondidas no mês e quantas aguardam resposta.',
      'Importáveis: envios feitos (cancelado não conta), com quantos já foram respondidos. Profissionais: equipe e quem atende na Agenda. Acessos: entradas no sistema hoje.',
      'Vermelho = falta sem aviso. Âmbar = retorno atrasado. Um traço no lugar do número = não deu para carregar aquele quadro agora; os outros seguem valendo.',
    ],
    access: [
      'Só a administração da instituição vê a Gestão.',
    ],
    notes: [
      'Os números são de quando a Gestão abriu. Dentro de cada aba dá para mudar período, profissional e os demais filtros.',
    ],
  },
  faltosos: {
    title: 'Faltosos',
    summary: 'Atendimentos do período marcados na Agenda como “Não compareceu” (sem aviso) ou “Cancelado pelo paciente” (com aviso).',
    actions: [
      'Mudar o período em “De” e “Até” — a aba abre com os últimos 30 dias.',
      'Filtrar por profissional, ou deixar em “Toda a equipe”.',
      'Buscar um paciente pelo nome para ver só as faltas dele, com data, horário e status de cada uma.',
    ],
    reading: [
      'Os três números do topo também são filtros: clique em “Sem aviso” ou “Com aviso” para ver só aquele tipo; clique de novo, ou em “Faltas no período”, para ver tudo.',
      'Cartão vermelho = não compareceu, sem aviso. Cartão âmbar = cancelado pelo paciente, com aviso.',
      'A lista separa as faltas desta semana das mais antigas.',
    ],
    notes: [
      'Esta aba só lê o que está na Agenda: para registrar uma falta, mude o status do atendimento lá.',
    ],
  },
  retornos: {
    title: 'Retornos',
    summary: 'Pacientes que foram atendidos e não têm nenhuma nova marcação depois do último atendimento.',
    actions: [
      'Escolher o mínimo de dias sem retorno: 15, 30, 45, 60 ou 90.',
      'Chamar o paciente no WhatsApp com uma mensagem pronta convidando para remarcar — o botão aparece quando o telefone do cadastro é válido.',
    ],
    reading: [
      '“Aguardando retorno” volta o limite para 30 dias.',
      '“Mais dias sem voltar” e “Média de dias” são atalhos: o clique ajusta o limite para aquele número e a lista mostra só quem passou dele.',
      'Cada cartão mostra a data do último atendimento, o profissional e há quantos dias foi. Quem está há mais tempo sem voltar vem primeiro.',
    ],
    notes: [
      'Só conta atendimento marcado como “Atendido”. Cancelamento e falta não contam como retorno.',
      'Para o paciente sair da lista, basta agendar o retorno dele na Agenda.',
      'Paciente arquivado não aparece aqui.',
    ],
  },
  profissionais: {
    title: 'Profissionais',
    summary: 'A equipe da instituição e quem aparece como opção para atender na Agenda.',
    actions: [
      'Ligar ou desligar “Atende” de cada pessoa.',
      'Cadastrar alguém novo em “+ Novo profissional”.',
    ],
    reading: [
      'Quem está com “Atende” ligado aparece na Agenda: no seletor de profissional do novo agendamento e como agenda pessoal.',
      'Os números do topo filtram a lista: equipe toda, só quem atende ou só os administradores.',
      'Selo “Admin” = administração da instituição. Selo “Recepção” = recepção, que não atende paciente.',
    ],
    access: [
      'Só a administração da instituição liga e desliga “Atende” e cadastra profissionais.',
    ],
    notes: [
      'Desligar “Atende” não tira a pessoa da equipe: ela continua entrando no sistema, só deixa de ser opção para receber atendimento. Use para quem é só administrativo.',
    ],
  },
  acessos: {
    title: 'Acessos',
    summary: 'Registro de quando cada pessoa desta instituição entrou e saiu do sistema.',
    reading: [
      '“Entrou” = login. “Saiu” = logout.',
      'Os números do topo filtram a lista: todos os registros, só os de hoje, ou uma linha por pessoa.',
    ],
    access: [
      'Só a administração da instituição vê esta aba.',
    ],
    notes: [
      'Serve para conferir quem usou o sistema e quando.',
    ],
  },
  pesquisa: {
    title: 'Pesquisa de satisfação',
    summary: 'Um link para o paciente dar nota de 1 a 5 e deixar um comentário sobre um atendimento específico.',
    actions: [
      'Gerar um link: escolha o paciente e o atendimento relacionado, clique em “Gerar link” e depois em “Copiar link” para mandar ao paciente.',
      'Ver por semana, mês ou tudo, e andar entre os períodos pelas setas.',
      'Filtrar por profissional e por disciplina.',
      'Tirar pesquisas de teste: marque-as na lista, clique em “Excluir” e confirme digitando “excluir”.',
    ],
    reading: [
      '“Taxa de resposta” mostra só as que ainda aguardam resposta. “Nota média” mostra só as respondidas, da menor nota para a maior.',
      'Selos: “Nota X/5” = respondida; “Aguardando resposta”; “Expirada” = passou do prazo sem resposta.',
      'Como a pesquisa é amarrada a um atendimento, dá para ver quais profissionais e disciplinas estão sendo avaliados.',
    ],
    access: [
      'Só a administração da instituição exclui pesquisas.',
    ],
    notes: [
      'O paciente responde sem login. O link vale 14 dias ou até ser respondido.',
      'Semana e mês contam pela data de envio: uma pesquisa enviada em setembro e respondida em outubro fica em setembro. Os números do topo seguem o período escolhido.',
      'Excluir não tem volta: a pesquisa some da lista e dos números, e o link para de funcionar — a nota do paciente vai junto, se ele já respondeu.',
    ],
  },
  importaveis: {
    title: 'Importáveis',
    summary: 'Formulários e entrevistas que o paciente responde pelo celular, na Área do Paciente, no lugar do papel impresso.',
    actions: [
      '“Formulários”: “Novo formulário” monta as perguntas. Sim / Não, Escolha única, Várias escolhas e Escala são de marcar; Texto curto, Texto longo, Data e Número o paciente digita. “Nova parte” divide o formulário em páginas.',
      '“Só aparece conforme outra resposta” cria o “Se sim, qual?”: a pergunta só aparece quando a resposta escolhida bate.',
      '“Pré-visualizar” mostra a tela do paciente. Só formulário publicado pode ser enviado; “Duplicar” começa um novo a partir de outro.',
      '“Envios e respostas”: escolha paciente, formulário e prazo e clique em “Enviar”. Depois mande a mensagem pronta pelo WhatsApp ou copie.',
      '“Ver respostas” abre o que o paciente respondeu, com “Imprimir / salvar PDF” no papel timbrado e “Baixar Word”.',
      '“Exportar planilha”: com um formulário escolhido no filtro, baixa todos os respondidos dele, um paciente por linha.',
    ],
    reading: [
      'As duas abas trazem o número na frente: em “Formulários”, os publicados e os rascunhos (arquivado não conta); em “Envios e respostas”, os envios feitos (cancelado não conta) e quantos já foram respondidos.',
    'Números do topo: Enviados, Aguardando (ainda não abriu), Respondendo (com a porcentagem), Atrasados (passou do prazo sem enviar) e Respondidos. Clique para filtrar.',
      '“De marcar” no editor mostra quanto do formulário é de marcar; a meta combinada é 80% a 90%.',
      '“Ver o que já respondeu” aparece enquanto o paciente ainda não enviou: são as respostas salvas até agora.',
    ],
    access: [
      'Só a administração da instituição vê formulários, envios e respostas. O paciente vê só os formulários enviados a ele, nunca o prontuário.',
      'O acesso de cada paciente (código, bloqueio, código novo) fica na ficha do paciente, aba “Área do Paciente”.',
    ],
    notes: [
      'O paciente entra com o código de acesso e a data de nascimento do cadastro. Sem data de nascimento, não dá para enviar.',
      'As respostas são salvas sozinhas enquanto o paciente responde: ele pode parar e continuar depois. Passar do prazo não trava o formulário.',
      'Editar um formulário já enviado não muda o que o paciente recebeu: cada envio guarda a versão daquele dia.',
      'Escala ou questionário publicado com direito autoral não entra com as perguntas copiadas: só o que a clínica criou.',
      'Escala enviada para casa (aba Escalas) tem “Ver resultado” no envio respondido: abre as notas, as faixas e as respostas para a administração e para quem atende o paciente na área.',
      'Antes de enviar uma escala, a tela mostra para quem vão a nota e o alerta de risco e pede o “Responsável” do paciente na área da escala. Quem você escolher fica como responsável na ficha, aba Matrículas.',
    ],
  },
  indicadores: {
    title: 'Indicadores',
    summary: 'Panorama do período: faltas e cancelamentos, dias e horários de mais movimento, e pacientes novos × retorno.',
    actions: [
      'Escolher o período, de “Esta semana” até “Este ano”.',
      'Filtrar por profissional e por disciplina.',
      'Clicar em “Faltas e cancelamentos” desce até o detalhe; “Aniversariantes do mês” abre a lista completa na Agenda.',
    ],
    reading: [
      'As barras comparam faltas e cancelamentos por profissional e por disciplina.',
      '“Atendimentos por dia da semana” e “por período do dia” mostram quando a instituição mais atende. O número é de atendimentos, não de horas: cada um vale 1, na faixa em que começa (Manhã até 12h, Tarde das 12h às 18h, Noite das 18h em diante). Sem profissional escolhido, soma a equipe toda.',
      'Nesses dois gráficos entram só os agendamentos “Agendado” e “Atendido”. “Não compareceu”, “Cancelado pelo paciente” e “Cancelado” ficam em “Faltas e cancelamentos”.',
      'A barra mais cheia é a faixa com mais atendimentos no período, não uma agenda lotada.',
      '“Pacientes novos vs. retorno” usa o tipo marcado no agendamento (primeira vez ou retorno): atendimento sem tipo não entra nessa conta.',
    ],
    notes: [
      '“Aniversariantes do mês” não depende do período escolhido.',
    ],
  },
  documentos: {
    title: 'Documentos timbrados',
    summary: 'Coloca um documento no papel timbrado da instituição: um arquivo do Word (.docx) ou um texto colado.',
    actions: [
      'Em “Enviar arquivo Word”: arrastar o arquivo .docx para a área indicada, ou clicar em “Escolher arquivo”.',
      'Em “Colar conteúdo”: colar (do Word, do Google Docs, de um e-mail) ou digitar o texto e clicar em “Ver no papel timbrado”. “Editar conteúdo” volta ao texto.',
      'Dar um título ao documento — ele sai no cabeçalho.',
      'Imprimir ou salvar em PDF, ou baixar em Word (.docx), já timbrado: logo, faixas, rodapé de contato e marca d’água em toda página.',
    ],
    notes: [
      'Negrito, listas e tabelas vêm junto ao colar; cor, fonte e formato das tabelas saem no padrão da instituição.',
      'O conteúdo é convertido no próprio computador e não é enviado para nenhum servidor.',
      'O logo e a cor do papel timbrado vêm da aba Personalizar.',
    ],
  },
  personalizar: {
    title: 'Personalizar',
    summary: 'A aparência da instituição no sistema, nos documentos e nos links do paciente: cor da tela, cor do papel timbrado, logo e cor dos links.',
    actions: [
      'Escolher a cor do sistema: botões, aba ativa e destaques da tela.',
      'Decidir quem escolhe a cor da tela: cor fixa para toda a equipe, ou cada profissional escolhe a sua (a da instituição vira o padrão de quem não escolher).',
      'Usar uma cor diferente no papel timbrado, se quiser.',
      'Enviar o logo (PNG, JPG, WEBP ou SVG) e, se quiser, usá-lo como marca d’água no fundo dos relatórios.',
      'Em “Cor dos links enviados ao paciente”, escolher uma cor para a Confirmação de agendamento, uma para a Pesquisa de satisfação e uma para a Área do Paciente, onde o paciente responde os formulários e as escalas.',
      'Gravar em “Salvar personalização”, ou voltar ao que estava em “Desfazer”.',
    ],
    reading: [
      'As prévias mostram como ficam a tela, a folha timbrada e a página de cada link antes de salvar.',
      'Em cada link, a cor marcada é a que o paciente vê hoje. Sem escolha, o link segue a cor do sistema.',
    ],
    access: [
      'Só a administração da instituição altera. Com a escolha liberada para a equipe, a administração também escolhe a cor da própria tela em “Sua tela”.',
    ],
    notes: [
      'Relatórios, evoluções e papel timbrado saem sempre com a cor da instituição, nunca com a cor pessoal de quem imprimiu.',
      'Os links valem para toda a equipe: quem manda o link não muda a cor que o paciente vê.',
    ],
  },
  acessopaciente: {
    title: 'Acesso do paciente',
    summary: 'Quem gera e vê o código que o paciente usa para entrar na Área do Paciente.',
    actions: [
      'Em “Quem gera e vê o código”, escolher “Só a administração” ou “A administração e quem atende o paciente”. A escolha é salva na hora.',
    ],
    reading: [
      'O nome ao lado de “Código de acesso do paciente” mostra a escolha que vale agora.',
      '“Quem atende” é quem tem atendimento com o paciente na Agenda ou é o responsável dele na área (ficha do paciente, aba Matrículas).',
    ],
    access: [
      'Só a administração altera esta escolha.',
      'Com “A administração e quem atende o paciente”, quem atende vê o código e a mensagem pronta depois de enviar uma escala para o paciente responder em casa. Se o paciente ainda não tinha código, o envio já cria um.',
    ],
    notes: [
      'Trocar o código, desativar o acesso ou liberar um código bloqueado por datas erradas continua só com a administração, na ficha do paciente, aba “Área do Paciente”.',
      'Quem atende pode enviar escalas para casa com qualquer uma das duas escolhas. Na primeira, pede à administração a mensagem com o código.',
    ],
  },
  ia: {
    title: 'IA do mês',
    summary: 'Quanto a inteligência artificial do sistema gastou neste mês e o limite da instituição.',
    actions: [
      'Ver o gasto estimado do mês, por função: Assistente, Biblioteca, Leitura da Psicologia e as outras.',
    ],
    reading: [
      'A barra mostra quanto do limite o mês já usou. Ao chegar em 50%, 80% e 100%, aparece um aviso aqui e em “Sua atenção hoje”.',
      'O valor é estimativa pelo preço público do Google em dólar. A fatura do Google Cloud é a referência.',
      'O registro de uso começou em 30/10/2026: o que foi gasto antes disso não aparece aqui.',
    ],
    access: [
      'Só a administração vê esta tela. O limite é definido pela equipe do sistema; para mudar, fale com ela.',
    ],
    notes: [
      'O gasto soma todas as funções de IA da instituição. No limite, todas elas param até o mês virar ou o limite subir.',
      'Nenhuma pergunta, resposta ou dado de paciente é guardado aqui: só quantas vezes cada função foi usada e o tamanho do texto.',
    ],
  },
  cadastro: MEU_CADASTRO_HELP,
};

/** Gestão de quem não é administração (GestaoProfissional). */
export const GESTAO_PROFISSIONAL_HELP = {
  personalizar: {
    title: 'Personalizar',
    summary: 'A cor da sua tela no sistema.',
    actions: [
      'Escolher a cor da sua tela, quando a instituição libera essa escolha.',
    ],
    access: [
      'Muda só a sua tela. Cadastro da instituição, papel timbrado, logo e cor dos links do paciente ficam com a administração.',
    ],
    notes: [
      'Relatórios, evoluções e papel timbrado saem sempre com a cor da instituição.',
    ],
  },
  cadastro: MEU_CADASTRO_HELP,
};

/** Tela Evoluções (components/evolutions/EvolutionsScreen.jsx). */
export const EVOLUCOES_HELP = {
  title: 'Evoluções',
  summary: 'A fila dos atendimentos da Agenda que ainda não têm evolução, com o formulário para escrever cada uma.',
  actions: [
    'Escolher o atendimento na fila, à esquerda, ou buscar o paciente pelo nome, e escrever a evolução ao lado.',
    '“Salvar e ir para o próximo” grava e já abre o próximo pendente. No último da fila o botão vira “Salvar evolução”.',
    'Filtrar a fila por situação, área, atendimento (atendido ou ausência) e período: hoje, últimos 7 dias ou tudo.',
    'Atendeu sem ter agendado? Use “Registrar atendimento já realizado”: o atendimento entra como Atendido e abre aqui para evoluir.',
    'Para conferir o que já foi evoluído e quando, use “Ver evoluções”, no topo.',
  ],
  reading: [
    'Ícone vermelho = falta evoluir. Verde = evoluído agora, nesta tela. Cadeado = atendimento de outro profissional.',
    'A fila vem do mais recente para o mais antigo, separada por dia, com a hora do atendimento na frente do nome. A seta marca o atendimento aberto ao lado.',
    'Selo ao lado do nome: Atendido, Não compareceu ou Cancelado pelo paciente.',
    'As duas abas do topo trazem o número na frente: em “Escrever evoluções”, quantos atendimentos seus faltam evoluir (e quantos são de hoje); em “Ver evoluções”, quantos atendimentos foram concluídos no mês e quantos ainda faltam evoluir.',
  ],
  access: [
    'Cada profissional só escreve a evolução dos próprios atendimentos, nas áreas liberadas para ele.',
    'A administração vê a fila da equipe inteira; os atendimentos dos colegas aparecem com cadeado.',
    'Evolução é trabalho clínico: a recepção não usa esta tela.',
  ],
  notes: [
    '“Não compareceu” e “Cancelado pelo paciente” pedem uma observação antes de salvar.',
    'Depois de salva, a evolução não se corrige por aqui: use a linha do tempo na ficha do paciente.',
    'Quem você evoluiu fica verde até sair da tela; na próxima visita, já não aparece na fila.',
    '“Registrar atendimento já realizado” vale para atendimentos de até 30 dias atrás.',
    'A fila só cobra atendimentos a partir de 22/09/2026, quando o sistema entrou em uso; o histórico importado do sistema anterior fica de fora.',
  ],
};

/** Sala online de quem atende (components/online/OnlineRoomPage.jsx). */
export const SALA_ONLINE_HELP = {
  title: 'Sala online',
  summary: 'A consulta por vídeo de um atendimento online da Psicologia, com as escalas e as evoluções do paciente ao lado para consulta rápida.',
  actions: [
    '“Entrar na sala” liga a câmera e o microfone e abre a chamada. Os botões embaixo do vídeo ligam e desligam o microfone, a câmera e o compartilhamento de tela; o último põe o vídeo em tela cheia, e Esc ou o mesmo botão volta para a sala.',
    'À esquerda, três abas: “Resumo” (sua última evolução, as escalas desde então e o que pede atenção), “Escalas” (cada escala com a nota, a faixa, a linha pequena e as datas) e “Evoluções” (as evoluções deste paciente, só para ler). Abrem ali mesmo, sem sair da chamada.',
    'Em “Escalas”, “Ver perguntas e respostas” abre a última aplicação com cada pergunta, a resposta e os pontos, por cima da coluna da esquerda, sem cobrir o vídeo. “Outras aplicações” abre as anteriores. Esc ou × fecha.',
    '“Abrir a tela Escalas” e “Abrir a tela Evoluções”, no pé das abas, abrem a tela na aba do sistema.',
    '“Link do paciente”: copiar ou mandar no WhatsApp o link pessoal do paciente. É o mesmo da confirmação.',
    '“Encerrar consulta” sai da chamada. Depois, “Marcar como Atendido” e “Escrever a evolução”, que abre a tela Evoluções.',
  ],
  reading: [
    'Nas escalas, ▲ subiu e ▼ desceu desde a aplicação anterior: só a direção, porque subir não é piorar em toda escala.',
    'Bolinha vermelha em “Pede atenção” é risco de escala que ainda ninguém marcou como visto.',
    '“Gravação” mostra, com um visto, se o paciente aceitou o termo do atendimento online e se autorizou gravar.',
    '“Minutos do mês” conta o uso do Daily no mês: cada pessoa na chamada conta, então uma consulta de 60 minutos a dois gasta 120. A barra mostra quanto dos 10.000 minutos grátis já foi, e o aviso aparece perto do fim. A fatura do Daily é a referência: “Ver uso e fatura no painel do Daily” abre a conta de vocês no Daily.',
  ],
  access: [
    'Só quem atende este horário entra na sala. O paciente entra pelo link dele, depois de aceitar o termo do atendimento online.',
    'A sala só existe para atendimento online da Psicologia, com “Atendimento online pela sala do sistema” ligado em Configurar agenda.',
  ],
  notes: [
    'A sala abre 30 minutos antes do horário para você e 15 minutos antes para o paciente.',
    'Evolução aqui é só leitura: escrever e corrigir continuam na tela Evoluções.',
    'Nada desta sala é gravado por enquanto. A gravação com transcrição chega numa próxima etapa e depende da autorização do paciente.',
    'A sala abre numa aba própria: é só nela que o navegador libera câmera e microfone.',
    'Compartilhar tela: a aba da própria sala não aparece para escolher (senão o paciente veria a sala dentro da sala). Enquanto compartilha, o aviso “Você está compartilhando a tela” fica no vídeo com o “Parar”, e o quadro “Você” continua mostrando a sua câmera. No celular e no tablet o navegador não compartilha tela, então o botão não aparece. No Mac, o navegador precisa estar liberado em Ajustes do Sistema → Privacidade e Segurança → Gravação de Tela.',
  ],
};

/** Escalas, no menu principal (components/instruments/ScalesScreen.jsx). */
export const ESCALAS_HELP = {
  title: 'Escalas',
  summary: 'As escalas de cada paciente (PHQ-9, GAD-7, DASS-21 e as outras da Psicologia): a última nota, a faixa, as datas e o gráfico da evolução.',
  actions: [
    'Escolher o paciente na lista, à esquerda, ou buscar pelo nome. A lista mostra quem tem matrícula na Psicologia; a busca procura em todos os pacientes.',
    'Cada escala abre e fecha com um clique. “Abrir todas” e “Fechar todas” ficam no topo, ao lado dos números do paciente.',
    'Com a escala aberta: “Aplicar agora”, no atendimento, ou “Enviar para responder em casa”, pela Área do Paciente.',
    '“Abrir”, numa aplicação da lista, mostra as respostas, a nota e a régua das faixas. Quem aplicou pode anular, com o motivo.',
  ],
  reading: [
    'Fechada, a escala já mostra a última nota, a faixa, a seta de subiu (▲) ou desceu (▼) desde a aplicação anterior e a linha pequena da evolução.',
    'Embaixo, as datas: “Aplicada em” é a primeira aplicação, “Reaplicada em” são as seguintes, e depois quando dá para reaplicar. “Já pode reaplicar” fica na cor da tela.',
    'Primeiro vêm as escalas já aplicadas ao paciente, da mais recente para a mais antiga; depois, as que ainda não foram aplicadas.',
    'O tom do selo da faixa sobe junto com a faixa do instrumento, na cor da instituição. Vermelho só aparece em alerta de risco.',
    'No gráfico, cada bolinha é uma aplicação, com a nota em cima; a última pulsa e traz a nota numa caixinha. Aplicações anuladas ficam de fora.',
    'Subir não é piorar em toda escala: no Rosenberg, nota maior é autoestima maior. A seta diz só a direção.',
  ],
  access: [
    'Veem as escalas de um paciente quem atende esse paciente na área (atendimento na Agenda ou responsável da matrícula) e a administração.',
    'Aplicar e marcar “Vi o alerta” ficam com quem atende. A administração que não atende vê só para leitura.',
    'A recepção não usa esta tela.',
  ],
  notes: [
    'A faixa é a do instrumento e não é diagnóstico. As escalas ficam “Em conferência” até a psicóloga responsável aprovar.',
    'Alerta de risco ainda não visto fica no topo desta tela e dentro da escala, mesmo fechada, até alguém que atende marcar “Vi o alerta”.',
    'As mesmas escalas aparecem na aba Escalas da ficha do paciente e dentro da Psicologia.',
  ],
};

/** Psicologia > Entrevistas (components/interviews/PatientInterviewsPanel.jsx). */
export const ENTREVISTAS_HELP = {
  title: 'Entrevistas',
  summary: 'Os roteiros de entrevista da clínica com quem convive com o paciente (familiar, pessoa próxima, professora). Não têm nota: a leitura é da profissional, pergunta por pergunta.',
  actions: [
    'Cada entrevista abre e fecha com um clique.',
    '“Responder no consultório”: você conversa com a pessoa e marca as respostas, parte por parte. Na identificação vão o nome e o vínculo de quem está respondendo.',
    '“Enviar link para responder”: diga para quem é o link e por quantos dias ele vale; depois, “Copiar link” ou “Enviar pelo WhatsApp”. Um link por pessoa: se a mãe e o pai vão responder, crie dois.',
    'Na lista, “Ver respostas” abre a entrevista respondida; “Copiar link” e “Cancelar link” valem enquanto o link espera resposta.',
    'Em “Ver respostas”: “Imprimir / salvar PDF” e “Baixar Word” saem no papel timbrado da instituição. Quem registrou, ou a administração, pode anular, com o motivo.',
  ],
  reading: [
    'Fechada, a entrevista mostra quantas respostas tem, a data da última e quantos links ainda esperam resposta.',
    'Na lista, o ícone de envio é resposta pelo link e o de pessoa é resposta no consultório.',
    'Em “Ver respostas”, “Frequentemente” e “Quase sempre” ficam na cor da tela e “Não sei observar”, em cinza. O botão “Só Frequentemente e Quase sempre” esconde o resto para a leitura; não soma nem classifica.',
  ],
  access: [
    'Veem e registram as entrevistas de um paciente quem atende esse paciente nesta área (atendimento na Agenda ou responsável da matrícula) e a administração.',
    'A pessoa que recebe o link vê só aquela entrevista e o primeiro nome do paciente, nunca o prontuário. Depois de enviar, o link não abre mais as respostas.',
    'A recepção não usa esta aba.',
  ],
  notes: [
    'O link vale até a data escolhida. Vencido ou cancelado, ele não abre mais: crie outro.',
    'Entrevista respondida não se edita: se foi registrada errado, anule e registre de novo.',
    'As respostas são uma fonte entre outras: valem junto com a entrevista do próprio paciente, a observação clínica e os instrumentos padronizados.',
  ],
};

/** Evoluções > "Ver evoluções" (components/evolutions/EvolutionsReview.jsx). */
export const EVOLUCOES_REVIEW_HELP = {
  title: 'Ver evoluções',
  summary: 'Conferência das evoluções: para cada atendimento concluído do período, se a evolução foi escrita e quando — sem mostrar o texto.',
  actions: [
    'Buscar o paciente pelo nome: não precisa de acento nem do nome inteiro (“ana rib” acha Ana Ribeiro).',
    'Filtrar por profissional e por área, e escolher o período: semana (domingo a sábado) ou mês, andando pelas setas.',
    'Clicar em “Falta evoluir” para ver só o que está pendente; clicar de novo, ou em “Atendimentos concluídos”, volta para todos.',
    'Em “Por profissional”, clicar no nome mostra só os atendimentos daquela pessoa.',
    '“Limpar filtros” volta tudo ao começo.',
  ],
  reading: [
    '“Atendimentos concluídos” conta os marcados na Agenda como Atendido, Não compareceu ou Cancelado pelo paciente; embaixo, quantos já foram evoluídos.',
    'O número grande da aba “Ver evoluções”, no topo, é sempre do mês atual, mesmo quando você escolhe outro período aqui.',
    '“Falta evoluir” mostra quantos ainda não têm evolução e há quantos dias está o mais antigo.',
    'Na lista, selo verde “Evoluído” com o dia e a hora em que foi escrita (e quantas vezes foi corrigida, se foi). Selo vermelho “Falta evoluir”, com há quantos dias foi o atendimento.',
    '“Atendimento lançado depois” = o atendimento entrou na Agenda depois de acontecer, como pelo “Registrar atendimento já realizado”.',
  ],
  access: [
    'A administração vê os atendimentos da equipe inteira e o quadro “Por profissional”.',
    'Cada profissional vê só os próprios atendimentos.',
    'Nada se altera por aqui: para escrever, use “Escrever evoluções”.',
  ],
  notes: [
    'O texto da evolução não aparece nesta tela: ela mostra se foi feita e quando, não o que foi escrito.',
    'Conta pela data do atendimento, não pela data em que a evolução foi escrita.',
    'A conferência começa em 22/09/2026, quando o sistema entrou em uso; o histórico importado do sistema anterior fica de fora.',
    'Atendimento “Cancelado” (pacote encerrado) não pede evolução e não entra na conta.',
  ],
};

/** Pacientes da instituição (components/ClinicPatientsPanel.jsx). */
export const PACIENTES_HELP = {
  title: 'Pacientes da instituição',
  summary: 'O cadastro central de pacientes. O paciente é um só na instituição e entra em cada área por matrícula.',
  actions: [
    '“Cadastrar paciente”: ficha completa com identificação, filiação, responsável, endereço, observações e matrícula inicial.',
    '“Observações”: texto livre do cadastro, até 1000 caracteres, para o que a equipe precisa lembrar (horário preferido, quem acompanha, como avisar). Muda em “Alterar dados cadastrais”, na aba Cadastro da ficha.',
    'Na ficha, aba Cadastro, “+ Acrescentar convênio”: operadora, plano, número e validade da carteira e CNS. Convênio que acabou se desativa, não se apaga.',
    '“Ver pacientes cadastrados”: buscar pelo nome e clicar no paciente para abrir a ficha.',
    '“Enviar / compartilhar”: mandar para outro profissional só os itens que você marcar, confirmando com a sua senha.',
    '“Ver compartilhado”: ler o que já foi compartilhado daquele paciente.',
    'Revogar um compartilhamento no × ao lado dele.',
    'Na ficha, aba Matrículas, “Escolher” ou “Trocar” o responsável do paciente em cada área (só a administração).',
  ],
  reading: [
    'Selos com o nome da área são as matrículas do paciente; passe o mouse para ver a situação: em atendimento, pausado ou alta.',
    '“sem matrícula” = cadastrado, mas ainda sem nenhuma área. O cartão “Ver pacientes cadastrados” mostra quantos estão assim.',
    '“pendência” = marcado à mão na ficha do paciente. “inativo” = suspenso, uma pausa que pode ser desfeita na ficha.',
    '“Área → destino” = compartilhamento ativo.',
    '“Responsável” (ficha, aba Matrículas) = quem atende o paciente naquela área. Ele recebe as escalas e o alerta de risco, junto com quem tem atendimento na Agenda. Ao enviar o paciente para outra área, o profissional de destino já fica como responsável.',
  ],
  access: [
    'Quem recebe um compartilhamento só lê os itens enviados: nada é copiado, e o envio fica registrado.',
    'Excluir paciente de vez é só da administração. Os outros perfis solicitam a exclusão pela ficha: o paciente é arquivado na hora e a administração decide depois, em “Revisar”.',
  ],
  notes: [
    'Paciente menor de idade exige responsável no cadastro. Campos com * são obrigatórios.',
    'As observações aparecem também no detalhe do atendimento na Agenda. Toda a equipe que vê o paciente lê, inclusive a recepção: dado clínico vai na ficha da área, não aqui.',
    'Excluir apaga prontuário, evoluções, agenda e matrículas, e não tem como desfazer pela tela.',
  ],
};

/** Editores que abrem de dentro da Agenda (components/panels/agenda/). */
export const AGENDA_HELP = {
  agendamento: {
    title: 'Novo agendamento',
    summary: 'Marcar um atendimento ou bloquear um horário, e dizer como o paciente paga: particular ou convênio.',
    actions: [
      'Escolher o profissional, o paciente, a área, o tipo, a modalidade, o início e a duração.',
      'Em “Como paga”, marcar “Particular” ou “Convênio · nome da operadora”. Ao escolher o paciente, o convênio ativo da ficha já vem marcado; com dois convênios, aparece um botão para cada operadora.',
      '“Repetir” cria o pacote de sessões: cada sessão herda a mesma forma de pagamento.',
      'Mudar a forma de pagamento depois, em “Editar” no detalhe do atendimento.',
    ],
    reading: [
      'Embaixo de “Como paga”, a nota em verde mostra o plano, a carteira e a validade. A administração vê também o valor da operadora e o código TUSS.',
      'Aviso em âmbar: “Carteira vencida em …” ou “a operadora não tem preço para a área”. Dá para marcar assim mesmo.',
      'O selo “Convênio” aparece no card da agenda e no detalhe do atendimento.',
    ],
    access: [
      'Quem marca atendimento escolhe como paga. O valor da operadora só a administração vê.',
      'O convênio do paciente se cadastra na ficha do paciente, aba Cadastro.',
    ],
    notes: [
      'O valor fica gravado quando o atendimento vira Atendido: no convênio, é o preço da operadora para a área (o do tipo vence o da área), e o paciente não é cobrado. Convênio não gasta sessão de pacote particular.',
      'Sem preço da operadora, o atendimento entra no Financeiro como “sem valor” para a administração resolver em Financeiro → Operadoras.',
      'Mudar de particular para convênio num atendimento já Atendido refaz a cobrança, se ainda não tem pagamento registrado.',
    ],
  },
  pacote: {
    title: 'Sessões do pacote',
    summary: 'Todas as sessões marcadas juntas na Agenda para este paciente, da primeira à última, para controlar o pacote sem sair da Agenda.',
    actions: [
      'Abrir pelo botão “Ver sessões do pacote”, no detalhe de qualquer sessão de um pacote.',
      'Tocar numa sessão da lista: a janela fecha, a Agenda vai para o dia dela e abre o detalhe daquela sessão.',
    ],
    reading: [
      'Os três números do topo: quantas foram atendidas, quantas faltam e quantas tem o pacote.',
      'Atendido conta como feita. Agendado conta como falta, inclusive a que já passou sem resultado marcado (a linha avisa).',
      'Não compareceu e Cancelado pelo paciente aparecem na lista, mas não contam como feita nem como faltando.',
      'Cancelado (pacote encerrado pela clínica) aparece riscado, sem número, e sai do total.',
      'A linha em destaque é a sessão de onde a janela abriu. Sessão movida mostra o selo Eventual e o horário de antes.',
    ],
    access: [
      'Quem usa a Agenda vê a lista. Nenhum valor ou pagamento aparece aqui.',
    ],
    notes: [
      'A lista mostra o pacote da Agenda, as sessões marcadas juntas. O pagamento do pacote fica no Financeiro e pode ser diferente: tem paciente que paga tudo no início, tudo no fim ou a cada sessão atendida.',
      'A linha “sessão 3 de 10” do detalhe vem do pacote do Financeiro; a lista desta janela vem da Agenda.',
    ],
  },
  horarios: {
    title: 'Horários de atendimento',
    summary: 'A jornada do profissional: os dias e horários que são o normal dele na agenda.',
    actions: [
      'Adicionar uma faixa: escolher os dias, o início e o fim, o intervalo (se tiver) e a duração padrão do atendimento.',
      'Cadastrar mais de uma faixa no mesmo dia, como manhã e noite.',
      'Remover uma faixa no dia em que ela aparece.',
    ],
    reading: [
      'O nome no topo é de quem é a jornada.',
      'Cada dia mostra as faixas, com intervalo e duração. “Não atende” = dia sem faixa.',
    ],
    access: [
      'Cada profissional cadastra a própria jornada; a administração da instituição também cadastra a de qualquer profissional.',
    ],
    notes: [
      'A jornada diz o que é horário normal, não o que é permitido: marcar fora dela (sábado, feriado, intervalo, madrugada) continua possível. A agenda avisa, pede confirmação e registra como exceção.',
      'Sem jornada cadastrada, a agenda usa a grade padrão de “Configurar agenda”.',
      'Em Ferramentas, “Copiar horários vagos” sai desta jornada: copia as faixas livres do dia escolhido, um horário por linha, para colar no WhatsApp. Na visão da equipe toda, entra só quem tem jornada naquele dia.',
    ],
  },
  feriados: {
    title: 'Feriados',
    summary: 'Os feriados que a agenda conhece, para avisar antes de marcar em cima deles.',
    actions: [
      'Adicionar um feriado com data e nome.',
      'Marcar “Clínica atende neste dia” quando o feriado não fecha a clínica, como um ponto facultativo em que vocês trabalham.',
      'Remover um feriado da lista.',
    ],
    access: [
      'Só a administração da instituição altera os feriados.',
    ],
    notes: [
      'Feriado é aviso, não bloqueio: a agenda pede confirmação dupla antes de marcar em cima dele, mas deixa marcar.',
      'Os feriados nacionais já vêm cadastrados, do ano em que a instituição foi criada até 4 anos depois. Confira a lista e acrescente os da sua cidade.',
      'Sem feriado cadastrado, a agenda não tem o que avisar.',
    ],
  },
  configurar: {
    title: 'Configurar agenda',
    summary: 'Como a agenda aparece para toda a instituição: cancelado e falta, selos de fixo e eventual, cor de cada disciplina e os padrões.',
    actions: [
      'Escolher o visual do cancelado e do não compareceu, e se os cancelados somem da agenda.',
      'Decidir o que ganha destaque entre fixo e eventual e personalizar cada selo: nome, cor, ícone e moldura.',
      'Escolher a cor de cada disciplina.',
      'Em Padrões: a duração de um agendamento novo, a visão que abre primeiro e a grade de quem ainda não cadastrou os horários.',
      'Ir direto a uma seção pelo índice no topo.',
    ],
    reading: [
      'As amostras mostram o card exatamente como fica na agenda.',
      'A barra de baixo diz se há alterações não salvas.',
    ],
    access: [
      'Vale para a equipe toda, e só a administração da instituição altera.',
    ],
    notes: [
      'Nada muda até “Salvar configuração”. “Descartar” volta ao que estava salvo; “Restaurar padrão” volta ao padrão do sistema e só vale depois de salvar.',
      'Relatórios, evoluções e documentos não mudam: aqui é só o visual e os padrões da agenda.',
      'Esconder os cancelados deixa o horário livre na agenda, mas eles continuam nos relatórios e voltam com o filtro “Cancelado pelo paciente”.',
    ],
  },
};

// Tela inicial (components/HomeConsole.jsx): um tópico por `variant`, porque
// cada perfil vê navegação, números e áreas diferentes.
const HOME_TITLE = 'Tela inicial';

export const HOME_HELP = {
  admin: {
    title: HOME_TITLE,
    summary: 'O resumo do dia da instituição e o ponto de partida da administração.',
    actions: [
      'Abrir pela navegação ao lado: Agenda completa, Evoluções, Gestão e Pacientes da instituição.',
      'Clicar nos números do topo para ir direto ao detalhe: “Atendimentos hoje” abre a Agenda, “Profissionais ativos” abre os Indicadores da Gestão e “Aniversariantes do mês” abre a lista de aniversários.',
      'Abrir qualquer área da clínica em “Ver →”, só para consulta.',
    ],
    reading: [
      '“Atendimentos hoje” conta os atendimentos marcados para hoje na clínica toda; bloqueios de horário e os marcados como “Cancelado” não entram.',
      'O número ao lado de Evoluções é quantos atendimentos da equipe aguardam evolução.',
      'Selo “Consulta” = a área abre só para leitura.',
    ],
    access: [
      'Esta conta não atende pacientes: nas áreas clínicas, tudo é só consulta.',
    ],
  },
  'admin-professional': {
    title: HOME_TITLE,
    summary: 'O resumo do dia, com os seus atendimentos e os da clínica, e a entrada nas suas áreas e na administração.',
    actions: [
      'Começar um atendimento em “Atender →”, na área em que você atende.',
      'Abrir pela navegação ao lado: Agenda completa, Evoluções, Gestão e Pacientes da instituição.',
      'Clicar nos números do topo: “Seus atendimentos hoje” e “Atendimentos da clínica” abrem a Agenda; “Retornos pendentes” abre os Retornos da Gestão.',
    ],
    reading: [
      '“Suas áreas de atendimento” são as liberadas para o seu perfil; as outras aparecem em “Outras áreas da instituição”, como “Não habilitada”.',
      'Os atendimentos de hoje não contam bloqueios de horário nem os marcados como “Cancelado”.',
      'O número ao lado de Evoluções é quantos atendimentos da equipe aguardam evolução.',
    ],
    notes: [
      'Documentos timbrados fica dentro da Gestão, na aba própria.',
    ],
  },
  professional: {
    title: HOME_TITLE,
    summary: 'O ponto de partida do atendimento: escolha a área e comece.',
    actions: [
      'Começar um atendimento em “Atender →”.',
      'Abrir pela navegação ao lado: Agenda, Evoluções, Gestão (cor da sua tela e seu cadastro), Pacientes da instituição e Documentos timbrados.',
    ],
    reading: [
      'As áreas coloridas são as liberadas para o seu perfil; as outras aparecem em “Outras áreas da instituição”, como “Não habilitada”.',
      'O número ao lado de Evoluções é quantos atendimentos seus aguardam evolução.',
    ],
    access: [
      'Quem libera as áreas do seu perfil é a administração da instituição.',
    ],
  },
  reception: {
    title: HOME_TITLE,
    summary: 'O resumo do dia da recepção: agenda e cadastro de pacientes da instituição.',
    actions: [
      'Abrir pela navegação ao lado: Agenda completa, Gestão (cor da sua tela e seu cadastro), Pacientes da instituição e Documentos timbrados.',
      'Clicar em “Atendimentos hoje” abre a Agenda; “Aniversariantes do mês” abre a lista de aniversários.',
    ],
    reading: [
      '“Atendimentos hoje” conta os atendimentos marcados para hoje na clínica toda; bloqueios de horário e os marcados como “Cancelado” não entram.',
    ],
    access: [
      'A recepção cuida da agenda e do cadastro de pacientes, sem acesso a prontuário, evolução ou financeiro.',
    ],
  },
};

/** Financeiro (etapa 1, 23/10/2026) — só a administração abre. */
export const FINANCEIRO_HELP = {
  resumo: {
    title: 'Resumo',
    summary: 'A entrada do Financeiro: o resultado do mês e um quadro por parte, com o número que mais importa em cada uma.',
    actions: [
      'Trocar o mês nas setas ao lado do título.',
      'Clicar num quadro abre a parte dele. No celular e no tablet, “Voltar ao Resumo”, embaixo, traz de volta para cá.',
      'Na primeira vez, escolher a data de início das contas e quando o repasse do profissional passa a contar, em “Começar a contar”.',
    ],
    reading: [
      'Resultado = o que entrou no mês menos o que saiu no mês. As barras mostram o que entrou em cada área.',
      'A receber e A pagar mostram o que está em aberto até hoje, de qualquer mês: o que está em atraso aparece em âmbar.',
      'Os quadros da Configuração dizem “Pronto” ou “Falta”; o menu à esquerda repete com ✓ ou “falta”.',
    ],
    access: [
      'Só a administração da instituição vê e mexe no Financeiro. Recepção e profissional ficam para a etapa 2.',
    ],
    notes: [
      'O valor de um atendimento é gravado quando ele vira Atendido. Não compareceu, Cancelado pelo paciente e Cancelado não cobram.',
    ],
  },
  areceber: {
    title: 'A receber',
    summary: 'Tudo o que ainda falta receber, separado por quem paga: dos pacientes (particular: atendimento avulso, parcela e sessão de pacote) e de cada operadora de convênio.',
    actions: [
      '“Receber” abre na própria linha: marcar o que está sendo pago, escolher a forma (Pix, Dinheiro, Cartão de débito, Cartão de crédito, Outro) e a data.',
      '“+ Dividir em outra forma” separa o pagamento, por exemplo parte no Pix e parte em dinheiro.',
      '“Mudar valor” muda só aquele atendimento (desconto combinado), com motivo. “Sem valor” lista o atendimento que a tabela não sabia cobrar: “Definir valor”.',
      '“+ Vender pacote” vende um pacote sem sair daqui.',
    ],
    reading: [
      '“Pacientes (particular)” reúne o que cada paciente deve. Cada “Convênio · operadora” reúne o que a operadora deve, com os atendimentos de cada paciente e o código TUSS: atendimento de convênio nunca aparece cobrando o paciente.',
      'Atendimento avulso vence no dia em que acontece. Âmbar = passou do dia, com quantos dias.',
      'No convênio, cada atendimento mostra a guia: “a faturar” (ainda não foi em lote), “lote N” (esperando a operadora), “glosada” ou “em recurso”. Só atrasa depois do envio do lote mais o prazo de pagamento da operadora (Operadoras → etapa 1).',
      'Glosa não sai do “A receber”: o atendimento só sai quando o dinheiro da operadora entra.',
      'Pagamento parcial cobre primeiro o item mais antigo.',
    ],
    access: ['Só a administração.'],
    notes: [
      'A data do recebimento é hoje ou antes, nunca depois.',
      'Crédito de paciente aparece quando um atendimento pago deixa de ser Atendido; o pagamento de convênio vira crédito da operadora, nunca do paciente.',
      'O dinheiro do convênio entra em Pagamentos e glosas, pelo depósito da operadora, e não em “Receber”: no grupo da operadora, o botão leva às Guias ou aos Pagamentos.',
      'Atendimento de convênio sem preço da operadora para a área aparece em “Sem valor”.',
      'Repasse de quem atende no convênio: por enquanto, a mesma regra do particular, calculada sobre o valor da operadora.',
    ],
  },
  recebidos: {
    title: 'Recebidos',
    summary: 'Os recebimentos do mês, com a forma de pagamento.',
    actions: [
      '“Anular” desfaz um recebimento lançado errado: pede o motivo, e o que ele pagava volta para “A receber”.',
      '“Mostrar anulados” traz de volta os anulados, riscados, com o motivo.',
      '“Comprovante” imprime o comprovante do recebimento no papel timbrado, com número em sequência da clínica (o mesmo número se imprimir de novo).',
    ],
    reading: [
      'Os totais do topo somam cada forma de pagamento no mês.',
      'Cada recebimento mostra a nota fiscal: “Nota: falta” (ainda não emitida) ou “Nota nº 152”. “Da operadora” lista os depósitos de convênio do mês.',
    ],
    access: ['Só a administração.'],
    notes: [
      'Nada se apaga e valor recebido não se edita: para corrigir, anule e lance de novo.',
      'O comprovante não substitui a nota fiscal: enquanto a nota não sai, ele diz isso; depois, traz o número da NFS-e.',
    ],
  },
  notas: {
    title: 'Notas fiscais',
    summary: 'A nota fiscal de serviço (NFS-e) de cada recebimento do particular e de cada depósito da operadora: o que falta emitir, os dados prontos para copiar no emissor e o número de cada nota emitida.',
    actions: [
      'A nota nasce sozinha quando o dinheiro entra: uma por recebimento do particular (para o paciente, ou para o responsável quando o paciente não tem CPF no cadastro) e uma por depósito da operadora (para a operadora).',
      'Escolha a nota na lista (à esquerda) e use “Copiar” em cada campo (CPF ou CNPJ, nome, código do serviço, descrição, valor e competência) para colar no emissor. “Abrir emissor” abre o site.',
      'Depois de emitir, digite o número da NFS-e e a data e toque “Registrar nota”. A chave de acesso (50 números) é opcional.',
      '“Corrigir dados antes de emitir” muda tomador, código, descrição e competência da nota que falta emitir.',
      '“Registrar cancelamento” guarda o cancelamento de uma nota (cancele primeiro no emissor).',
      '“Configurar” guarda onde a clínica emite (o Emissor Nacional é o padrão) e o código do serviço de cada área.',
    ],
    reading: [
      'Filtros: Falta emitir, Cancelar no emissor, Emitidas e Canceladas.',
      'Competência é o dia do atendimento (o mais recente que o recebimento paga). Pacote pago antes das sessões usa o dia do recebimento.',
      '“Cancelar no emissor” aparece quando o recebimento foi anulado (ou mudou de valor) depois da nota emitida.',
    ],
    access: ['Só a administração da instituição.'],
    notes: [
      'Desde 01/11/2026 a clínica do Simples Nacional emite a NFS-e pelo Emissor Nacional. Se a prefeitura mandar usar o emissor dela, troque o endereço em “Configurar”.',
      'O código do serviço de cada área é o contador quem define. Os números em cinza são só sugestão (lista de serviços da LC 116).',
      'Nota registrada não se apaga. Cancelada com o recebimento ainda valendo, ela volta para “Falta emitir”, para emitir de novo.',
      'O sistema ainda não emite a nota sozinho: isso pede o certificado digital A1 e fica para uma próxima etapa.',
    ],
  },
  pacotes: {
    title: 'Pacotes',
    summary: 'Pacotes vendidos para cada paciente: sessões contadas (4, 6, 8, 10…) ou valor fechado com sessões previstas, como a avaliação neuropsicológica.',
    actions: [
      '“+ Vender pacote”: paciente, modelo (ou preencher na hora), quem atende e como o paciente vai pagar (À vista, Parcelado ou A cada sessão).',
      '“Mudar previsão”, no pacote de valor fechado: as próximas sessões já usam a conta nova.',
      '“Encerrar pacote”: cobrar o restante ou dar desconto do restante. “Anular venda” só antes da primeira sessão e do primeiro pagamento.',
    ],
    reading: [
      'A sessão entra no pacote sozinha: mesmo paciente, mesma área e um tipo que o pacote cobre. Falta não gasta sessão.',
      'Valor fechado: cada sessão vale o que falta do valor ÷ as sessões que faltam na previsão. A última prevista leva o resto.',
      'Sessões contadas: o pacote fecha sozinho na última sessão.',
    ],
    access: ['Só a administração.'],
    notes: ['Sessão da mesma área já atendida no dia da venda, sem pagamento, entra no pacote.'],
  },
  contas: {
    title: 'Contas do mês',
    summary: 'As contas fixas do mês em cartões, separadas por situação, e o gasto rápido (água, lanche, almoço do time, conserto) sempre à mão. Toda saída paga ganha comprovante de despesa numerado.',
    actions: [
      '“Pagar”, no cartão: valor que veio na conta, data e forma (Pix, Dinheiro, Transferência, Boleto, Cartão). Ao pagar, o cartão vai para Pagas com o número do comprovante.',
      '“Comprovante”, num cartão pago, abre o comprovante de despesa no papel timbrado para imprimir ou salvar em PDF.',
      'Gasto rápido, à direita: escreva o que foi, o valor, o dia, quem pagou e como. Não tem categoria. Ao lançar, sai o comprovante com número.',
      '“Usar a lista da planilha” cria as contas da planilha da clínica de uma vez: marque as que valem, o dia do vencimento e, se quiser, o valor.',
      '“Anular”, num gasto rápido: com motivo; o comprovante continua guardado, marcado como anulado.',
    ],
    reading: [
      'Vencida (âmbar) = passou do dia e não foi paga. Vence hoje, A vencer, Pagas e Não houve este mês vêm em seguida.',
      '“previsto” = conta que muda todo mês (luz, água): o valor é a previsão até você pagar. “valor muda” = sem previsão.',
      'Em teste: conta pela data do serviço. A conta fixa entra no mês do vencimento, mesmo paga em outro mês; gasto rápido e compra, no dia em que foram pagos.',
      'Repasse da equipe não entra nas contas: aparece só o total, com o atalho para Equipe e repasses.',
    ],
    access: ['A administração vê e paga tudo. A recepção lança gasto rápido e vê os gastos rápidos de todos pela tela Gastos rápidos, sem o resto do Financeiro.'],
    notes: [
      'O comprovante é controle interno da clínica e não substitui o boleto pago nem a nota fiscal do fornecedor.',
      'Saída paga antes dos comprovantes (10/11/2026) fica sem número: dinheiro lançado não se reescreve.',
    ],
  },
  apagar: {
    title: 'A pagar',
    summary: 'O que a clínica tem a pagar até o fim do mês: saídas fixas, contas lançadas “a pagar” e o repasse de cada profissional.',
    actions: [
      '“Pagar” abre na própria linha: valor, data e forma. Em saída fixa, “Não houve este vencimento” tira a conta daquele dia.',
      '“Pagar repasse” lança a saída na categoria Repasse de profissionais.',
      '“+ Lançar saída” lança uma conta avulsa, já paga ou a pagar.',
      '“+ Registrar compra” lança uma compra já paga (água, almoço da equipe, material) com os itens, a categoria, a forma de pagamento e quem comprou, e gera o recibo interno numerado.',
    ],
    reading: [
      'Âmbar = venceu. “valor muda” = saída fixa sem valor fixo (luz, água): escreva quanto veio.',
      'Repasse aparece com o que a pessoa tem a receber até agora, somando os meses.',
    ],
    access: ['Só a administração.'],
    notes: ['A data do pagamento é hoje ou antes. Conta futura fica aqui até ser paga.'],
  },
  pagas: {
    title: 'Pagas',
    summary: 'As saídas pagas no mês, por categoria, inclusive as compras com recibo.',
    actions: [
      '“+ Registrar compra”: um ou mais itens (descrição, quantidade e valor de cada), categoria, data, forma de pagamento e quem comprou. Ao registrar, o recibo abre para imprimir ou salvar em PDF.',
      '“Recibo”, na linha de uma compra, abre o recibo Nº AAAA-000123 de novo no papel timbrado da instituição.',
      '“Anular” desfaz uma saída lançada errado, com motivo. Se era saída fixa, o vencimento volta para “A pagar”. Compra anulada continua guardada, com o recibo marcado como anulado.',
      '“Mostrar anuladas” traz de volta as anuladas, riscadas.',
    ],
    reading: [
      'Os totais do topo somam cada categoria no mês.',
      'O número do recibo é sequencial por ano e nunca se repete nem pula.',
    ],
    access: ['Só a administração.'],
    notes: [
      'Nada se apaga: anula e lança de novo. Compra registrada não se edita.',
      'O recibo é um comprovante interno da instituição e não tem valor fiscal: não substitui nota fiscal.',
    ],
  },
  equipe: {
    title: 'Equipe e repasses',
    summary: 'Cada pessoa da equipe com o jeito de receber, o que gerou no mês, o que foi pago e o que falta repassar.',
    actions: [
      '“Pagar repasse” lança o pagamento já com o valor que falta.',
      '“Lançar pagamento”, para as pessoas sem login (diarista, técnico de TI).',
      '“Configurar” leva a “Como cada um recebe”.',
    ],
    reading: [
      'Gerado no mês = soma do valor dos atendimentos da pessoa no mês.',
      '“Falta repassar” soma todos os meses desde o início do financeiro, menos o que já foi pago.',
    ],
    access: ['Só a administração.'],
    notes: ['Com “Quando o paciente paga”, atendimento ainda não pago não entra no repasse.'],
  },
  valores: {
    title: 'Valores dos atendimentos',
    summary: 'Quanto custa cada atendimento: um cartão por área, com o valor padrão da sessão em destaque e, embaixo, só os serviços que têm valor próprio (na Acupuntura, auriculoterapia, laserpuntura e ventosa; na Fisioterapia e na Psicologia, neuromodulação e biomodulação vascular (e-ILIB); na ABA, visitas domiciliar e escolar). A Neuropsicologia tem um valor só para a avaliação completa.',
    actions: [
      'Em “Valores da instituição”, preencher o valor padrão da sessão de cada área e só os serviços que custam diferente.',
      'Escolher um profissional para dar a ele valores próprios: preencher só o que muda.',
      'Gravar em “Salvar valores”.',
    ],
    reading: [
      'Anamnese, avaliação, retorno e devolutiva não têm campo: usam o valor padrão da sessão da área.',
      'Serviço vazio usa o valor da sessão (o texto cinza diz qual). R$ 0 = aquele serviço não é cobrado.',
      'Ordem de quem vale: serviço do profissional, serviço da instituição, sessão do profissional, sessão da instituição.',
      'Neuropsicologia: o primeiro atendimento (a anamnese) abre a avaliação e cobra o valor inteiro; as sessões liberadas (10 por padrão) já ficam pagas e a devolutiva Atendida encerra. Passou das liberadas: não cobra. Para liberar mais, Entradas → Pacotes → “Liberar sessões”.',
    ],
    access: ['Só a administração.'],
    notes: [
      'Valor novo vale para os atendimentos que virarem Atendido daqui para frente: o que já foi cobrado não muda.',
      'Salvar grava os valores do escopo de uma vez: se algum for recusado, nada muda. Valor de um tipo que não aparece mais na tela é apagado.',
      'Pacotes ficam em “Modelos de pacote”.',
    ],
  },
  modelos: {
    title: 'Modelos de pacote',
    summary: 'Os pacotes prontos para vender: sessões contadas ou valor fechado com sessões previstas, com os serviços da área escolhida.',
    actions: [
      '“+ Novo modelo”: área, serviços que gastam o pacote, sessões, valor total e em quantas vezes pode parcelar.',
      'Com um serviço só marcado e o valor avulso cadastrado, “Calcular com 5% de desconto” (Acupuntura) ou “Calcular sem desconto” (Psicologia) preenche o total: preço avulso × sessões. Na Fisioterapia e em pacote com mais de um serviço, o total é digitado.',
      'No valor fechado, a simulação mostra quanto vale cada sessão se a previsão mudar.',
      '“Desativar” tira o modelo da venda sem mexer no que já foi vendido.',
    ],
    reading: [
      'Cada modelo mostra o valor por sessão e quanto fica abaixo do avulso.',
      'Trocar a área limpa os serviços marcados: cada área tem os seus.',
    ],
    access: ['Só a administração.'],
    notes: [
      'A venda guarda os valores do dia: mudar o modelo ou o preço avulso não muda pacote já vendido.',
      'O cálculo só preenche o campo; quem decide o total é a administração. Falta (Não compareceu, Cancelado) não gasta sessão.',
    ],
  },
  recebimento: {
    title: 'Como cada um recebe',
    summary: 'O jeito de receber de cada pessoa da equipe e das pessoas que recebem e não usam o sistema.',
    actions: [
      'Escolher entre % do valor do atendimento, Valor fixo por atendimento, Salário fixo mensal ou Não recebe pelo sistema.',
      '“+ Exceção” muda o % ou o valor numa área ou num tipo.',
      '“+ Cadastrar pessoa”: diarista, técnico de TI e quem mais recebe sem login.',
      'Escolher quando o repasse passa a contar: quando o paciente paga ou quando o atendimento acontece.',
    ],
    reading: ['Salário e pessoa com valor fixo viram saída fixa e aparecem em “A pagar” no dia.'],
    access: ['Só a administração. A pessoa cadastrada aqui não ganha login.'],
    notes: ['Mudança vale para os atendimentos de agora em diante; o repasse do que já foi feito fica como estava.'],
  },
  saidasfixas: {
    title: 'Saídas fixas',
    summary: 'Contas que se repetem (aluguel, internet, contador) e as categorias de saída.',
    actions: [
      '“+ Saída fixa”: descrição, categoria, valor, e se é todo mês, toda semana ou a cada 15 dias.',
      'Marcar “O valor muda todo mês” para luz e água: o valor é escrito na hora de pagar.',
      'Clicar numa categoria desativa ou ativa. “+ Nova categoria” cria outra.',
      '“Conferi as saídas fixas” marca esta parte como pronta.',
    ],
    reading: ['Repasse de profissionais e Salários e diárias são do sistema e não desativam.'],
    access: ['Só a administração.'],
    notes: ['Saída fixa desativada para de aparecer em “A pagar”; o que já foi pago continua.'],
  },
  operadoras: {
    title: 'Operadoras',
    summary: 'As operadoras de convênio com que a clínica trabalha, com tudo o que a guia TISS pede de cada uma.',
    actions: [
      '“Nova operadora” abre o passo a passo: 1 Operadora (nome, registro ANS, CNPJ, versão TISS, como envia), 2 Credenciamento, 3 Planos e 4 Tabela de preços.',
      'Cada etapa grava ao continuar. Dá para parar no meio: o cartão mostra o que falta.',
      'Clicar num cartão abre a operadora na primeira etapa que falta.',
      'Na Tabela de preços, “Buscar na tabela TUSS” acha o procedimento pelo código ou por palavras, na tabela oficial da ANS.',
      'Na etapa Operadora, “Desativar” tira a operadora da escolha no cadastro do paciente, sem apagar nada.',
      'Na etapa Operadora, “Prazo para a operadora pagar” (em dias depois do envio do lote) faz o “A receber” mostrar o que está em atraso com a operadora.',
    ],
    reading: [
      '“Pronta” = registro ANS, CNPJ, código do prestador e todos os preços com código. Planos são opcionais.',
      'Credenciamento: o contratado pode ser a clínica (CNPJ) ou um profissional em nome próprio (CPF), cada um com o código de prestador que a operadora deu.',
      'Procedimento que não existe na TUSS (ex.: avaliação neuropsicológica) entra como “Tabela própria da operadora”, com o código que ela usa.',
    ],
    access: ['Só a administração. A equipe do cadastro vê só o nome da operadora e os planos, para escolher no convênio do paciente.'],
    notes: [
      'Tabela TUSS e demais tabelas da ANS na versão 202607. Versão nova da ANS entra por atualização do sistema.',
      'Desde 07/2026 o CNPJ pode ter letras; o sistema confere os dois últimos números.',
      'Guia, lote e pagamento da operadora ficam em Guias, Lotes e Pagamentos e glosas, no mesmo grupo Convênios.',
    ],
  },
  guias: {
    title: 'Guias',
    summary: 'Uma guia SP/SADT para cada atendimento de convênio Atendido, com o que falta para ela entrar no lote.',
    actions: [
      'A guia nasce sozinha quando o atendimento de convênio vira Atendido na Agenda, com o número seguinte daquela operadora. Esse número não muda.',
      'Escolha a guia na lista (à esquerda) para ver e completar (à direita): quem pediu (Solicitante de fora ou quem atendeu), data do pedido, indicação clínica, tipo de atendimento, caráter e acidente.',
      'Senha, número da guia na operadora e data da autorização são opcionais. Com senha ou número, a data da autorização é obrigatória.',
      '“Salvar guia” grava os campos da guia em aberto. “Imprimir guia” imprime no modelo da ANS, para assinatura.',
      '“Reenviar em novo lote” tira uma guia já enviada do lote, com o motivo, para corrigir e mandar no próximo lote.',
    ],
    reading: [
      'Filtros: Com pendência (falta dado para o lote), Prontas, No lote, Glosadas e em recurso, Pagas, Todas.',
      '“Antes do lote, falta” diz o que completar e onde: carteira na ficha do paciente (Cadastro → Convênio), código do prestador e TUSS em Operadoras, CPF, conselho e CBO de quem atendeu em Dados para faturamento.',
      'Avisos em cinza não barram o lote: sem indicação clínica (muitas operadoras pedem em terapia), carteira vencida no dia, clínica sem CNES (vai 9999999).',
      'Atendimento online pela sala do sistema vai com regime Telessaúde; o presencial, Ambulatorial.',
    ],
    access: ['Só a administração da instituição vê e altera.'],
    notes: [
      'Guia em lote não muda, nem o atendimento dela na Agenda: falta, mudança de dia ou exclusão pedem antes “Reenviar em novo lote”.',
      'Falta ou cancelamento de um atendimento ainda sem lote cancela a guia; se ele voltar a Atendido, a mesma guia volta, com o mesmo número.',
      'O arquivo da guia vai sem acento (o padrão TISS pede texto simples). O nome do paciente sai só no papel: desde a versão 4.00 ele não vai no arquivo.',
    ],
  },
  lotes: {
    title: 'Lotes',
    summary: 'Juntar as guias prontas de uma operadora num lote, gerar o arquivo XML do padrão TISS 4.03.00 e marcar quando foi enviado no portal.',
    actions: [
      '“Montar lote” mostra as guias prontas daquela operadora e daquele contratado: desmarque o que não vai e toque “Gerar lote”.',
      '“Baixar XML” baixa o arquivo para subir no portal da operadora.',
      '“Marcar enviado” guarda o dia do envio e o protocolo do portal (opcional). O prazo de pagamento conta dali.',
      '“Descartar” desfaz um lote gerado que ainda não foi enviado: as guias voltam a ficar em aberto.',
    ],
    reading: [
      'Cada lote mostra o período dos atendimentos, quantas guias, o valor, se já foi enviado e quando o pagamento está previsto (envio + prazo da operadora).',
      'Um lote leva até 100 guias e um contratado só (a clínica ou um profissional credenciado em nome próprio): o sistema separa sozinho.',
    ],
    access: ['Só a administração da instituição.'],
    notes: [
      'Ao gerar, a cópia das guias fica congelada no lote, com o XML e o hash do epílogo. Lote enviado não muda; correção é por “Reenviar em novo lote”, em Guias, e o lote antigo fica guardado como foi.',
      'O número do lote é seguido por operadora e não volta, nem depois de descartar.',
      'O XML é conferido contra o XSD oficial da ANS nos testes do sistema. Se a operadora pedir outra versão TISS, avise antes de enviar.',
    ],
  },
  pagamentos: {
    title: 'Pagamentos e glosas',
    summary: 'O que a operadora pagou de cada lote enviado, o que ela glosou e por quê, e o recurso da glosa.',
    actions: [
      '“Registrar pagamento” no lote: dia em que o dinheiro entrou, como chegou (TED, Pix, Boleto, Depósito, Outro) e, em cada guia, quanto foi pago e quanto foi glosado.',
      'Glosa pede o código do motivo da tabela 38 da ANS (4 números, como vem no demonstrativo da operadora). Pagamento zero registra só a glosa.',
      '“Registrar recurso” guarda a justificativa enviada no portal; “Resultado do recurso” guarda se foi aceito ou negado.',
      '“Anular” num lançamento risca o depósito e o que ele acertou, com motivo.',
    ],
    reading: [
      'Cada lote enviado mostra quantas guias esperam a operadora e quanto falta receber.',
      'Situação da guia: No lote (esperando), Paga (a operadora pagou tudo), Glosada (parte ou tudo foi glosado), Em recurso.',
      'O depósito precisa ser igual à soma do que foi pago nas guias.',
    ],
    access: ['Só a administração da instituição.'],
    notes: [
      'Glosa não sai do “A receber”: o atendimento só sai de lá quando o dinheiro entra. Recurso aceito: registre o pagamento quando a operadora depositar.',
      'Dinheiro lançado não se apaga nem se edita: anula com motivo e lança de novo.',
      'O depósito entra em Recebidos (“Da operadora”) e no resultado do mês. O repasse “quando o paciente paga”, no convênio, conta quando a operadora paga.',
    ],
  },
  solicitantes: {
    title: 'Solicitantes',
    summary: 'Quem pede o tratamento de fora da clínica, como o médico que encaminhou o paciente. A guia leva o nome, o conselho e o CBO dele.',
    actions: [
      '“+ Cadastrar solicitante”: nome, conselho, número, UF do conselho e ocupação (CBO).',
      '“Mudar” corrige; “Desativar” tira da escolha sem apagar.',
    ],
    reading: ['A linha mostra conselho, número e UF (ex.: CRM 123456 SP) e a ocupação pelo nome da tabela da ANS.'],
    access: ['Só a administração.'],
    notes: ['Conselho, UF e CBO vêm das tabelas oficiais da ANS (26, 59 e 24).'],
  },
  faturamento: {
    title: 'Dados para faturamento',
    summary: 'O que a guia pede da clínica (CNES) e de quem atende (CPF, conselho e CBO).',
    actions: [
      'Salvar o CNES da clínica. Sem CNES, a guia leva 9999999, como manda a ANS.',
      '“Preencher” ou “Mudar” em cada profissional: CPF, conselho, número, UF e ocupação (CBO).',
    ],
    reading: [
      '“Falta” mostra o que ainda não foi preenchido daquele profissional.',
      'Conselho e CBO vêm sugeridos pela profissão do cadastro quando estão vazios. Confira antes de salvar.',
    ],
    access: ['Só a administração vê e altera. O CPF de quem atende não aparece para o resto da equipe.'],
    notes: ['O CNPJ da clínica muda em Gestão → Configurações → Instituição.'],
  },
};

/** Área ABA (components/AbaWorkspace.jsx) — uma ajuda por aba. */
export const ABA_HELP = {
  supervisao: {
    title: 'Supervisão formal',
    summary: 'O registro dos encontros de supervisão, com data, duração, pauta, decisões, assinatura e ciência do profissional supervisionado.',
    actions: [
      '“Novo registro” cria um rascunho. Escolha o profissional supervisionado, o paciente se houver, data, duração, modalidade, formato, pauta e decisões; use “Salvar rascunho”.',
      '“Editar rascunho” ajusta um registro ainda não assinado. “Assinar” pede confirmação e trava o conteúdo.',
      '“Anular” exige confirmação e motivo de pelo menos 10 caracteres; o registro continua no histórico e sai da soma de horas.',
      'O próprio supervisionado usa “Marcar ciência” uma única vez no registro assinado. “Atualizar” confere os dados novamente.',
    ],
    reading: [
      '“Horas assinadas” soma somente os registros assinados de cada profissional no filtro escolhido, antes de converter os minutos em horas. Rascunhos e anulados não somam.',
      '“Ver registro” abre pauta e decisões; assinatura, anulação e ciência mostram quem fez e quando.',
      '“Pauta restrita” conserva os dados do encontro e as horas, mas não mostra paciente nem textos quando falta acesso clínico.',
    ],
    access: [
      'Registram a administração e a supervisão do time ativo do profissional. Assinam quem registrou ou a administração; anulam quem assinou ou a administração.',
      'Leem a administração, quem registrou e a supervisão atual; o supervisionado lê somente os próprios assinados ou anulados. Só ele marca ciência.',
    ],
    notes: [
      'Data futura não é aceita; o dia segue o horário de São Paulo. Duração de 1 a 600 minutos.',
      'Paciente arquivado bloqueia escrita até a decisão da exclusão. Se o banco recusar, a explicação aparece junto da ação; use “Atualizar” após a decisão.',
      'Exclusão de paciente retira o vínculo e os textos do encontro, mas preserva as horas e o histórico profissional.',
      'Se outra pessoa alterar o registro, use “Recarregar revisão”: o texto digitado fica e só a revisão é atualizada. Se o vínculo com paciente ou supervisionado, o estado ou o acesso mudar, a gravação continua bloqueada.',
      'Este registro não é certificação e não substitui a evolução do atendimento.',
    ],
  },
  biblioteca: {
    title: 'Biblioteca da clínica',
    summary: 'Modelos institucionais de objetivos e técnicas, reunindo os modelos do sistema e os da clínica. Não é prontuário.',
    actions: [
      'Use “Buscar modelo” e “Tipo” para encontrar objetivos ou técnicas; “Ver modelo” abre os detalhes.',
      'Quem pode gravar usa “Ajustar” nos modelos do sistema e “Novo objetivo” ou “Novo modelo de técnica” para criar um modelo da clínica.',
      '“Ocultar” retira um modelo do sistema das opções de Programas; “Reativar” o devolve. “Arquivar” retira um modelo próprio. Essas ações pedem confirmação.',
      'Quem pode gravar escolhe “Arquivados” em “Mostrar” para encontrar modelos próprios arquivados e “Reativar” para trazê-los de volta, com confirmação; nada é apagado.',
      'No editor de técnica, escolha categoria, objetivos, funções e configuração sugerida pelos seletores. Objetivos, funções e hierarquia de ajuda permitem várias escolhas.',
      'Se outra pessoa já criou um ajuste do mesmo modelo do sistema, “Recarregar” abre os metadados do item existente e mantém o texto que você digitou; confira antes de salvar.',
    ],
    reading: [
      '“Sistema” e “Da clínica” indicam a origem; “Ajustado pela clínica” indica uma versão institucional de um modelo do sistema.',
      '“Oculto” só aparece para quem pode gravar. Modelos próprios arquivados aparecem somente no filtro “Arquivados”, para quem pode reativá-los; ficam fora de Programas. Programas já gravados não mudam.',
      '“Restrito” exige atenção e nunca dispensa a revisão nominal do programa. A clínica não pode mudar essa marca numa técnica do sistema.',
    ],
    access: [
      'Profissionais ABA e a administração leem a biblioteca da própria clínica. Apenas a administração e a supervisão de time ativo podem alterar; o banco confere a permissão.',
    ],
    notes: [
      'Ponto de partida, não decisão clínica. Individualize e peça revisão da supervisão. Não escreva dados de pacientes nestes modelos.',
      'Se outra pessoa alterar o modelo, seu texto é mantido. Use “Recarregar revisão”, confira e só então salve.',
      'Se a biblioteca estiver indisponível, use “Tentar de novo”. Em Programas, o catálogo do sistema continua disponível com um aviso.',
    ],
  },
  painel: {
    title: 'Painel do paciente',
    summary: 'A visão rápida da criança na área ABA: independência geral, um anel por programa e a última sessão.',
    actions: [
      '“Iniciar coleta” abre a ficha da sessão; com uma coleta sua ainda aberta, o botão vira “Continuar coleta”.',
      '“Resultados” e “Sessões” levam aos gráficos e ao histórico.',
    ],
    reading: [
      'O anel grande é a independência geral: respostas independentes divididas pelas tentativas preenchidas, somando todas as sessões — não é a média das sessões.',
      'Tentativa em branco, recusa e não aplicável ficam fora da conta.',
      'Os programas de redução mostram o último valor registrado; independência não se aplica a eles.',
    ],
    access: [
      'Quem vê: o time da criança, a supervisão do time, quem foi convocado e a administração da clínica.',
    ],
  },
  coleta: {
    title: 'Coleta',
    summary: 'A ficha da sessão: escolha o contexto e os programas, registre tentativa por tentativa e finalize.',
    actions: [
      'Antes de começar, marque ambiente, estado de chegada, saúde, rotina, motivação, material e pessoas presentes.',
      'Na matriz, um toque registra a ajuda mais intrusiva usada na tentativa; tocar de novo apaga. No celular a ficha mostra uma tentativa por vez.',
      'Programas de redução usam contador, cronômetro ou grade de intervalos, conforme a forma de coleta.',
      'Os botões de baixo registram reforçador, episódio ABC e situação de risco.',
      '“Pausar” para o relógio da intervenção; “Finalizar sessão” mostra o resumo antes de gravar.',
    ],
    reading: [
      'O resumo à direita conta acertos, independentes, com ajuda e erros, e diz se o critério da sessão foi atingido.',
      'A fase escolhida em “Fase deste programa hoje” é o que separa linha de base de intervenção nos gráficos.',
    ],
    access: [
      'Coleta quem é do time da criança, a supervisão e quem foi convocado. Só quem começou a coleta continua ela.',
    ],
    notes: [
      'Cada toque é salvo sozinho em menos de um segundo. Fechar a aba com algo ainda não enviado faz o navegador perguntar.',
      'Com tentativa em branco, a sessão é salva como incompleta e entra na janela de correção.',
      'Situação de risco não se apaga: coleta com risco registrado não pode ser descartada, só finalizada.',
      'A coleta não substitui a evolução: o atendimento continua sendo evoluído na tela Evoluções.',
    ],
  },
  sessoes: {
    title: 'Sessões',
    summary: 'O histórico das sessões finalizadas, com os registros de cada uma e a revisão da supervisão.',
    actions: [
      '“Abrir” mostra as tentativas, os valores de redução, o ABC, as situações de risco e o histórico da revisão.',
      'A supervisão pode “Solicitar correção” (com prazo) ou “Aprovar e assinar”.',
      'Quem coletou corrige em “Abrir correção” enquanto o prazo vale.',
    ],
    reading: [
      'Selo da revisão: Aguardando revisão, Correção solicitada, Correção reenviada ou Aprovada e assinada.',
    ],
    access: [
      'Revisa e assina a supervisão do time ou a administração. A correção é de quem coletou (ou da supervisão).',
    ],
    notes: [
      'Corrigir não apaga o que existia antes: a versão anterior fica guardada no histórico da revisão.',
    ],
  },
  resultados: {
    title: 'Resultados',
    summary: 'Os gráficos por dimensão de cada programa, com o resumo do período e o critério de progressão.',
    actions: [
      'Filtrar por período (todos os registros ou últimos 30 dias) e por ambiente.',
      'Quando o critério é atingido, a supervisão aprova a progressão de fase com um parecer.',
      '“Baixar PDF” abre a impressão no papel timbrado da clínica (escolha “Salvar como PDF”); “Baixar Excel” gera a planilha com resumo, sessões, tentativas, qualidade e um gráfico por programa. Os dois seguem o período e o ambiente escolhidos.',
    ],
    reading: [
      'Cada bolinha é uma sessão. A linha tracejada horizontal é o critério; a vertical marca onde a fase mudou.',
      'Lacuna na linha é sessão sem dado pontuável — nunca é ligada por cima.',
      'Independência, tempo, ajuda, intensidade e duração ficam em gráficos separados.',
      'A comparação “Linha de base × intervenção” só aparece com sessões marcadas como linha de base na coleta.',
    ],
    access: [
      'Vê quem atende a criança. Aprovar progressão é da supervisão do time ou da administração.',
    ],
  },
  programas: {
    title: 'Programas',
    summary: 'Os programas de aquisição e redução da criança e a configuração da ficha de coleta de cada um.',
    actions: [
      'Adicionar por um modelo pronto (um toque), pela biblioteca de objetivos por área ou do zero em “Aquisição” e “Redução”.',
      '“Buscar técnica” preenche estratégia, procedimento, forma de coleta e hierarquia de ajuda de uma vez.',
      'Editar critério, etapas da tarefa, teto de ajuda, reforçadores previstos e responsável.',
      'Arquivar tira o programa da coleta; o histórico e os gráficos continuam.',
    ],
    reading: [
      'Os códigos abaixo do programa (I › AVS › AG…) são os níveis de ajuda que a ficha vai mostrar.',
    ],
    access: [
      'Monta e edita a supervisão do time ou a administração. O terapeuta vê o que vai aparecer na ficha.',
      'Criança ainda sem time: quem fez a matrícula ABA dela faz esse papel até a administração escolher o time.',
    ],
    notes: [
      'Procedimento restrito (extinção, extinção de fuga, interrupção e redirecionamento, exposição gradual) exige comportamento-alvo com hipótese funcional e plano de segurança, mais o parecer de quem autoriza — gravado com nome e data.',
      'O modelo e a técnica são ponto de partida: revise antes de aplicar.',
    ],
  },
  plano: {
    title: 'Plano terapêutico',
    summary: 'As versões do plano terapêutico ABA do paciente, com os programas escolhidos e a revisão da supervisão.',
    actions: [
      '“Nova versão” abre um rascunho copiando o plano aprovado vigente, se houver. Escolha os programas, escreva o “Resumo do plano” e a “Data de revisão”.',
      '“Salvar rascunho” guarda o texto. Depois de salvar, “Enviar para revisão” exige ao menos um programa e o resumo preenchido.',
      'A supervisão usa “Aprovar” com confirmação: a versão aprovada anterior vira substituída. “Anular” exige motivo de ao menos 10 caracteres; anular o aprovado deixa o paciente sem plano vigente.',
      '“Ler versão” abre o conteúdo. “Imprimir versão” abre o diálogo de impressão do navegador, que também permite salvar como PDF.',
    ],
    reading: [
      'A versão mais nova aparece primeiro; “Aprovado vigente” recebe destaque. Autoria é quem criou o rascunho; “Enviado por” é quem o enviou para revisão, com a data ao lado.',
      'Cada programa mantém a revisão escolhida. “Usar revisão atual” troca essa referência explicitamente, sem atualizar sozinho o conteúdo antigo.',
      'Substituído e anulado ficam para leitura e impressão; o anulado conserva o motivo e imprime seu estado real.',
    ],
    access: [
      'Quem acessa o paciente em ABA pode ler, montar rascunho e enviar para revisão. Aprovar e anular cabem somente à supervisão do paciente ou à administração.',
    ],
    notes: [
      'Se outra pessoa alterar o plano, o sistema pede recarga antes de continuar e conserva o texto que você digitou no editor. Ao fechar com alterações não salvas, pergunta antes de descartar.',
      'A impressão usa a cópia dos programas daquela versão, mesmo que o programa atual tenha mudado. A IA não sugere, gera nem aprova o plano.',
      'Nos envios anteriores ao registro do remetente, “Enviado por” foi preenchido com a autoria do plano; o sistema não tinha registrado quem fez aquele envio.',
    ],
  },
  perfil: {
    title: 'Perfil ABA',
    summary: 'O perfil ABA do paciente reúne comunicação, nível de suporte, diagnóstico transcrito do laudo e detalhes informados pela supervisão.',
    actions: [
      'Sem perfil, “Preencher perfil” abre o formulário. Depois, use “Editar perfil” e “Salvar perfil” para atualizar.',
      'Marque os modos de comunicação e escolha o nível de suporte. O diagnóstico é digitado manualmente a partir do laudo, com fonte e data; a data não pode ser futura.',
      'Para retirar um laudo, limpe texto, fonte e data. “Cancelar” pergunta antes de descartar alterações não salvas.',
    ],
    reading: [
      '“Não informado” indica que o dado ainda não foi registrado. A tela mostra quem atualizou, quando e a revisão atual.',
    ],
    access: [
      'Quem acessa o paciente em ABA pode ler o perfil. Somente a supervisão do paciente ou a administração pode preencher e editar. Paciente arquivado não recebe perfil.',
    ],
    notes: [
      'O sistema não sugere nem completa diagnósticos ou nível de suporte. Registre somente o que foi informado pela pessoa responsável e pelo laudo.',
      'Diagnóstico, fonte, data do laudo e detalhes ficam cifrados no banco. Se outra pessoa alterar o perfil, o texto digitado permanece no editor; descarte e recarregue antes de salvar novamente.',
    ],
  },
  repertorio: {
    title: 'Repertório',
    summary: 'Os reforçadores e os comportamentos interferentes da criança — são os botões da coleta.',
    actions: [
      'Adicionar e editar reforçadores (categoria e preferência).',
      'Adicionar comportamento com definição operacional, hipótese funcional e orientação de segurança.',
      'A supervisão aprova ou inativa comportamentos.',
    ],
    reading: [
      'Comportamento com “Revisão pendente” foi cadastrado por terapeuta e espera a supervisão.',
    ],
    access: [
      'Qualquer pessoa do time cadastra. Depois de revisado, só a supervisão muda a definição.',
    ],
  },
  times: {
    title: 'Times',
    summary: 'Os times de atendimento ABA: quem supervisiona, quem atende e quais crianças são do time.',
    actions: [
      'A administração cria o time, escolhe a supervisão e pode encerrar o time.',
      'A supervisão adiciona terapeutas e crianças e marca os responsáveis diretos de cada criança.',
      '“Convocar apoio” chama um terapeuta de outro time para uma criança.',
      'Quem foi convocado registra se aceitou, se atendeu ou se não pôde.',
    ],
    reading: [
      'Cada terapeuta e cada criança ficam em um time só. Transferir entre times é com a administração.',
    ],
    access: [
      'A administração vê todos os times. Cada pessoa vê o próprio time.',
    ],
    notes: [
      'A convocação libera o acesso na hora, sem aprovação de outra supervisão. “Um atendimento” encerra sozinho 24 horas depois do início; “por período” vale até o fim informado; cancelar encerra na hora.',
    ],
  },
  revisao: {
    title: 'Revisão',
    summary: 'As sessões de todas as crianças que esperam a supervisão e as correções pedidas a você.',
    actions: [
      '“Abrir sessão” leva ao paciente, já na sessão, para revisar ou corrigir.',
    ],
    access: [
      'A fila da supervisão mostra as crianças do time que você supervisiona (a administração vê todas).',
    ],
  },
  qualidade: {
    title: 'Qualidade da coleta',
    summary: 'Fidelidade de aplicação sessão a sessão e concordância entre dois observadores (IOA). Mínimo de 80% nos dois.',
    actions: [
      'Fidelidade: “Avaliar” abre os cinco itens; toque nos cumpridos e marque “Não se aplica” no que não ocorreu na sessão.',
      'A autoavaliação é de quem atendeu; a fidelidade da supervisão é de quem lidera o time. Também dá para avaliar dentro da sessão, em Sessões.',
      '“Registrar IOA”: escolha o método, digite os dois números e veja a concordância antes de salvar.',
    ],
    reading: [
      'Fidelidade = itens cumpridos ÷ itens aplicáveis. IOA por tentativa ou intervalo = acordos ÷ total; por contagem ou duração = menor ÷ maior.',
      'Número em âmbar está abaixo de 80%. Fidelidade da supervisão ou IOA abaixo disso vira alerta.',
      'Os dois valores do IOA ficam guardados: o dado bruto nunca é descartado.',
    ],
    access: [
      'Vê quem atende a criança. IOA e fidelidade da supervisão são registrados pela supervisão do time ou pela administração.',
    ],
  },
  alertas: {
    title: 'Alertas',
    summary: 'O que pede atenção nas crianças que você atende, calculado a partir da coleta.',
    actions: [
      '“Abrir” leva ao paciente, na tela onde o alerta se resolve.',
      '“Dispensar” (supervisão) tira o alerta da lista com um motivo; se a situação passar e voltar, ele reabre sozinho.',
      '“Só comigo” mostra os alertas sob sua responsabilidade; “Atualizar agora” recalcula na hora.',
    ],
    reading: [
      'Avisos: critério atingido, baixa evolução (3 sessões abaixo do critério em 30 dias), programa sem coleta há 14 dias, aumento de comportamento, comportamento novo sem definição, reforçador perdendo efeito, situação de risco sem revisão, revisão parada há 48 horas, correção atrasada, fidelidade e concordância abaixo de 80%.',
      'Crítico (vermelho) é só situação de risco grave. O alerta some sozinho quando a situação se resolve.',
    ],
    access: [
      'Cada pessoa vê os alertas das crianças que atende; dispensar e reabrir é da supervisão do time ou da administração.',
    ],
  },
};

// ACUP-017: explicação da própria assistente, sem dados de paciente no texto de ajuda.
export const ASSISTANT_HELP = {
  title: 'Assistente',
  summary: 'Uma ajuda para entender o sistema e consultar dados permitidos, sem decidir por você.',
  actions: [
    'Perguntar sobre telas, horários vagos e contagens da clínica; abrir o destino sugerido em “Abrir …”.',
    'A administração pode perguntar sobre recebidos, a receber e atrasados por período, paciente e profissional.',
    'Toda a equipe pode perguntar pela agenda de um período (de uma pessoa ou da equipe), faltas e cancelamentos, confirmações pendentes e pacotes perto do fim. A administração também pergunta por pesquisas de satisfação, formulários da Área do Paciente, convênio e notas fiscais; administração e recepção, pelo número de aniversariantes do mês.',
    'Pedir para preparar UMA ação de um atendimento que ela listou: a confirmação pelo WhatsApp (abre o WhatsApp com a mensagem pronta, a mesma da Agenda, e você toca em Enviar) ou um Novo agendamento para o paciente (abre a Agenda com o formulário preenchido e a faixa “Preenchido pela assistente: confira antes de salvar”; “Como paga” fica como sempre e você confere e salva). Uma ação por vez.',
    '“Corrigir” registra sua orientação. Em resposta financeira, salva somente sua nota: não escreva nome de paciente, valores, datas ou dados financeiros. A pergunta, a resposta original e os dados não são gravados nessa correção.',
  ],
  reading: [
    'A resposta financeira diz o período e o critério. Valores de operadora não são cobrança ao paciente. Sem lote ou prazo, o vencimento fica sem data e o recorte considera a data do atendimento.',
    'Se a consulta falhar, não significa zero. Pedidos acima de 93 dias ou 50 linhas precisam de um recorte menor. Confira os registros na tela Financeiro, que é a referência.',
    'Quem vê a Agenda também pode perguntar quem atende num dia e a próxima sessão de um paciente; administração e recepção, por faltosos e aniversariantes. Nessas respostas, o paciente aparece só pelo primeiro nome e a idade, nunca sobrenome, data de nascimento, contato ou dado clínico, e só o que o seu login já vê na Agenda. Primeiro nome e idade saem do Brasil para o serviço de IA nos Estados Unidos.',
    'As consultas de agenda e operação não trazem paciente: só horários, profissional, área, tipo, status e números. Com mais de 50 itens, vêm só os números do resumo; estreite o período para ver a lista. A tela de origem (Agenda, Gestão ou Financeiro) é a referência.',
  ],
  access: [
    'Apenas a administração com permissão no Financeiro pode consultar seus valores. Recepção e terapeutas podem usar as outras ajudas, sem receber dados financeiros.',
    'No recorte financeiro, a identificação é primeiro nome e idade: nunca sobrenome, data de nascimento ou dado clínico. A assistente não lê prontuário, textos de evolução nem respostas de escalas.',
    'Correção financeira fica somente para sua autora, pendente e sem aprovação para uso global; nas demais correções, a regra de curadoria continua.',
  ],
  notes: [
    'Primeiro nome, idade e dinheiro saem do Brasil e são enviados ao serviço de IA Gemini/Vertex na região us, nos Estados Unidos. O RIPD é tratado pela instituição.',
    'A assistente só prepara: nunca envia mensagem, salva, agenda, cancela nem cobra sozinha. O botão da ação é montado no seu aparelho a partir da agenda que você já vê; o telefone do paciente não vai para a IA.',
    'A assistente lembra e explica; não altera dinheiro, não envia cobranças e não decide conduta clínica. O limite mensal de IA e o registro de uso continuam valendo, sem dados financeiros nos registros técnicos.',
  ],
};
