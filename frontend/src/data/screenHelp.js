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
      '“Atendimentos por dia da semana” e “por período do dia” mostram quando a instituição mais atende.',
      '“Pacientes novos vs. retorno” usa o tipo marcado no agendamento (primeira vez ou retorno): atendimento sem tipo não entra nessa conta.',
    ],
    notes: [
      '“Aniversariantes do mês” não depende do período escolhido.',
    ],
  },
  documentos: {
    title: 'Documentos timbrados',
    summary: 'Coloca um documento do Word (.docx) no papel timbrado da instituição.',
    actions: [
      'Arrastar o arquivo .docx para a área indicada, ou clicar em “Escolher arquivo”.',
      'Dar um título ao documento — ele sai no cabeçalho.',
      'Imprimir ou salvar em PDF, ou baixar de volta em Word (.docx), já timbrado.',
    ],
    notes: [
      'O arquivo é convertido no próprio computador e não é enviado para nenhum servidor.',
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
      'Em “Cor dos links enviados ao paciente”, escolher uma cor para a Confirmação de agendamento e outra para a Pesquisa de satisfação.',
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
    'Atendeu sem ter agendado? Use “Registrar atendimento realizado”: o atendimento entra como Atendido e abre aqui para evoluir.',
    'Para conferir o que já foi evoluído e quando, use “Ver evoluções”, no topo.',
  ],
  reading: [
    'Ícone vermelho = falta evoluir. Verde = evoluído agora, nesta tela. Cadeado = atendimento de outro profissional.',
    'A fila vem do mais recente para o mais antigo, separada por dia, com a hora do atendimento na frente do nome. A seta marca o atendimento aberto ao lado.',
    'Selo ao lado do nome: Atendido, Não compareceu ou Cancelado pelo paciente.',
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
    '“Registrar atendimento realizado” vale para atendimentos de até 30 dias atrás.',
    'A fila só cobra atendimentos a partir de 22/09/2026, quando o sistema entrou em uso; o histórico importado do sistema anterior fica de fora.',
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
    '“Falta evoluir” mostra quantos ainda não têm evolução e há quantos dias está o mais antigo.',
    'Na lista, selo verde “Evoluído” com o dia e a hora em que foi escrita (e quantas vezes foi corrigida, se foi). Selo vermelho “Falta evoluir”, com há quantos dias foi o atendimento.',
    '“Atendimento lançado depois” = o atendimento entrou na Agenda depois de acontecer, como pelo “Registrar atendimento realizado”.',
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
    '“Cadastrar paciente”: ficha completa com identificação, filiação, responsável, convênio, endereço e matrícula inicial.',
    '“Ver pacientes cadastrados”: buscar pelo nome e clicar no paciente para abrir a ficha.',
    '“Enviar / compartilhar”: mandar para outro profissional só os itens que você marcar, confirmando com a sua senha.',
    '“Ver compartilhado”: ler o que já foi compartilhado daquele paciente.',
    'Revogar um compartilhamento no × ao lado dele.',
  ],
  reading: [
    'Selos com o nome da área são as matrículas do paciente; passe o mouse para ver a situação: em atendimento, pausado ou alta.',
    '“sem matrícula” = cadastrado, mas ainda sem nenhuma área. O cartão “Ver pacientes cadastrados” mostra quantos estão assim.',
    '“pendência” = marcado à mão na ficha do paciente. “inativo” = suspenso, uma pausa que pode ser desfeita na ficha.',
    '“Área → destino” = compartilhamento ativo.',
  ],
  access: [
    'Quem recebe um compartilhamento só lê os itens enviados: nada é copiado, e o envio fica registrado.',
    'Excluir paciente de vez é só da administração. Os outros perfis solicitam a exclusão pela ficha: o paciente é arquivado na hora e a administração decide depois, em “Revisar”.',
  ],
  notes: [
    'Paciente menor de idade exige responsável no cadastro. Campos com * são obrigatórios.',
    'Excluir apaga prontuário, evoluções, agenda e matrículas, e não tem como desfazer pela tela.',
  ],
};

/** Editores que abrem de dentro da Agenda (components/panels/agenda/). */
export const AGENDA_HELP = {
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
