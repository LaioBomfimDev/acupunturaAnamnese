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
    summary: 'A aparência da instituição no sistema e nos documentos: cor da tela, cor do papel timbrado e logo.',
    actions: [
      'Escolher a cor do sistema: botões, aba ativa e destaques da tela.',
      'Decidir quem escolhe a cor da tela: cor fixa para toda a equipe, ou cada profissional escolhe a sua (a da instituição vira o padrão de quem não escolher).',
      'Usar uma cor diferente no papel timbrado, se quiser.',
      'Enviar o logo (PNG, JPG, WEBP ou SVG) e, se quiser, usá-lo como marca d’água no fundo dos relatórios.',
      'Gravar em “Salvar personalização”, ou voltar ao que estava em “Desfazer”.',
    ],
    reading: [
      'As prévias mostram como ficam a tela e a folha timbrada antes de salvar.',
    ],
    access: [
      'Só a administração da instituição altera. Com a escolha liberada para a equipe, a administração também escolhe a cor da própria tela em “Sua tela”.',
    ],
    notes: [
      'Relatórios, evoluções e papel timbrado saem sempre com a cor da instituição, nunca com a cor pessoal de quem imprimiu.',
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
      'Muda só a sua tela. Cadastro da instituição, papel timbrado e logo ficam com a administração.',
    ],
    notes: [
      'Relatórios, evoluções e papel timbrado saem sempre com a cor da instituição.',
    ],
  },
  cadastro: MEU_CADASTRO_HELP,
};
