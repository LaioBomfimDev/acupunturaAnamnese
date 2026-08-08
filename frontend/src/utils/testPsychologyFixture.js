// ============================================================
// Casos sintéticos para preencher a anamnese de Psicologia em UM clique.
// Espelha o testClinicalFixture da Acupuntura: serve para percorrer o
// workspace (anamnese → eixos → hipóteses → relatório → IA) sem digitar
// tudo de novo a cada teste.
//
// SOMENTE DESENVOLVIMENTO: o botão que chama isto só é renderizado sob
// `import.meta.env.DEV`. São pessoas inventadas — nenhum dado real.
//
// Dois casos por perfil de entrada (infantil e adulto, feminino e
// masculino). O sorteio RESPEITA o percurso já escolhido: dentro de uma
// anamnese adulta só saem casos adultos, e o perfil nunca é trocado por
// baixo da profissional. Sem percurso definido (Painel), o caso traz o
// próprio — é o que permite começar do zero em um clique.
// ============================================================

// Marca visível no prontuário de teste — evita confundir com registro real.
const TEST_MARKER = '[DADOS DE TESTE]';

const psychologyCases = [
  {
    id: 'adulto-ansiedade-sobrecarga',
    summary: 'Adulta — ansiedade e sobrecarga ocupacional',
    intakeProfile: 'adulto_feminino',
    fields: {
      demanda: 'Refere ansiedade constante, "cabeça que não desliga" e choro fácil nas últimas semanas. Diz estar "no limite".',
      motivoBusca: 'Procurou atendimento após uma crise de choro no trabalho e recomendação de uma colega.',
      historiaPessoal: 'Criada pela mãe e pela avó. Descreve infância com cobrança alta por desempenho escolar. Separação conjugal há dois anos.',
      saudeMental: 'Fez terapia por oito meses em 2023. Nunca usou medicação psiquiátrica. Mãe em acompanhamento por depressão.',
      redeApoio: 'Mora com a filha de 9 anos. Conta com a mãe e duas amigas próximas. Pouco contato com o pai.',
      observacoesSessao: `${TEST_MARKER} Discurso organizado, chorou ao falar do trabalho. Boa vinculação inicial. Combinado retorno semanal.`,
      adultDescricaoAtual: 'Descreve-se como ansiosa, perfeccionista e "sempre alerta".',
      adultMudancasRelevantes: 'Assumiu coordenação de equipe há seis meses, com aumento de jornada e cobrança.',
      adultInicioEvolucao: 'Início gradual após a promoção, com piora progressiva nos últimos dois meses.',
      adultHistoriaVida: 'Separação há dois anos, mudança de cidade e perda da avó no mesmo período.',
      adultFamiliaOrigem: 'Morava com mãe e avó; relação afetiva com a avó e mais tensa com a mãe.',
      adultInfanciaPersonalidade: 'Descreve-se como tímida e muito preocupada em não errar.',
      adultTrajetoriaEscolar: 'Boa adaptação escolar, notas altas, com muita autocobrança.',
      adultTrajetoriaProfissional: 'Trabalho formal na mesma empresa há sete anos; identifica-se com a função, mas sente o cargo atual acima do que suporta.',
      adultFuncionamentoExecutivo: 'Relata dificuldade para concluir tarefas e procrastinação recente, antes incomum.',
      adultAutonomia: 'Independente nas atividades de vida diária; autocuidado preservado, mas reduzido.',
      adultAcompanhamentos: 'Psicologia em 2023. Sem acompanhamento psiquiátrico ou neurológico.',
      adultMedicacoes: 'Não usa medicação psiquiátrica. Usa anticoncepcional.',
      adultAtencaoMemoria: 'Queixa de distração e esquecimento de compromissos desde a piora.',
      adultLinguagemAprendizagem: 'Sem queixa de linguagem, leitura, escrita ou matemática.',
      adultSintomasFisicosSensoriais: 'Cefaleia tensional frequente e fadiga ao fim do dia.',
      adultHumorComportamento: 'Ansiedade, irritabilidade, choro fácil e perda de interesse por lazer.',
      adultSonoRotina: 'Insônia inicial e despertares. Parou a atividade física há três meses.',
      adultSubstancias: 'Cafeína em excesso (5 a 6 xícaras/dia). Não fuma; álcool social raro.',
      adultRedeApoioDetalhada: 'Mãe ajuda com a filha; duas amigas próximas são o principal apoio emocional.',
      ctxCicloHumor: 'Refere piora clara de irritabilidade e insônia na semana pré-menstrual, há cerca de dois anos.',
      ctxGestacaoPuerperioPerdas: 'Uma gestação, parto sem intercorrências. Sem gestação atual nem planos no momento.',
      ctxTransicaoHormonal: 'Não se aplica. Sem alteração de tireoide conhecida.',
      ctxContracepcaoHumor: 'Usa anticoncepcional oral há quatro anos; não percebeu mudança de humor ao iniciar.',
      ctxCuidadoDependentes: 'Cuida da filha de 9 anos, sozinha na maior parte da semana.',
      ctxDivisaoCargaMental: 'Organiza sozinha a rotina da filha; a mãe ajuda com a busca na escola. Pai da criança sem participação.',
      ctxImpactoCuidadoSofrimento: 'Refere exaustão e culpa por "não estar presente" nos dias de trabalho intenso.',
      ctxProjetoParentalidade: 'Não deseja outra gestação no momento; sem pressão familiar relatada.',
    },
    contextModules: {
      'ciclo-hormonios-reproducao': true,
      'parentalidade-cuidado': true,
    },
    marks: {
      psiHumor: ['Choro frequente', 'Irritabilidade', 'Culpa excessiva', 'Baixa autoestima'],
      psiAnsiedade: ['Preocupação excessiva', 'Pensamento acelerado / ruminação', 'Tensão constante', 'Sintomas físicos (taquicardia, sudorese)'],
      psiSono: ['Dificuldade para iniciar sono', 'Despertares frequentes', 'Sono não reparador'],
      psiAlimentacao: ['Aumento do apetite'],
      psiCognicao: ['Dificuldade de atenção / concentração', 'Queixas de memória'],
      psiFuncionamento: ['Prejuízo no trabalho/estudo', 'Queda de energia', 'Autocuidado prejudicado'],
      psiSubstancias: ['Cafeína em excesso'],
    },
    axisNotes: {
      'axis-1': 'Ansiedade generalizada com componente de autocobrança; humor reativo à sobrecarga ocupacional, sem anedonia global.',
      'axis-2': 'Prejuízo funcional concentrado no trabalho e no autocuidado; vida familiar preservada.',
      'axis-4': 'Rede de apoio presente e acionável (mãe e amigas), fator de proteção relevante.',
      'axis-6': 'Hipótese de trabalho: quadro ansioso reativo a mudança ocupacional, em pessoa com traço de perfeccionismo. A confirmar ao longo das sessões.',
    },
    riskNotes: `${TEST_MARKER} Triagem de risco realizada: nega ideação suicida, autolesão e violência. Sem sinais de crise aguda.`,
  },
  {
    id: 'adulto-alcool-crise',
    summary: 'Adulto — irritabilidade, insônia e uso aumentado de álcool',
    intakeProfile: 'adulto_masculino',
    fields: {
      demanda: 'Relata irritabilidade intensa, brigas em casa e "pavio curto". Reconhece que tem bebido mais do que gostaria.',
      motivoBusca: 'Buscou atendimento após discussão grave com a esposa, que ameaçou sair de casa.',
      historiaPessoal: 'Pai com histórico de alcoolismo. Trabalha desde os 15 anos. Perdeu o emprego há oito meses.',
      saudeMental: 'Nunca fez terapia. Sem acompanhamento psiquiátrico. Nega internações.',
      redeApoio: 'Mora com a esposa e dois filhos. Afastou-se dos amigos no último ano.',
      observacoesSessao: `${TEST_MARKER} Resistência inicial ao enquadre, colaborou ao longo da sessão. Orientações dadas sobre a rede de apoio.`,
      adultDescricaoAtual: 'Descreve-se como estressado, "explosivo" e cansado.',
      adultMudancasRelevantes: 'Desemprego há oito meses e conflito familiar crescente.',
      adultInicioEvolucao: 'Início gradual após a demissão, com piora nos últimos três meses.',
      adultHistoriaVida: 'Infância com conflitos familiares e pai alcoolista. Início precoce no trabalho.',
      adultFamiliaOrigem: 'Morava com os pais e três irmãos; relação conflituosa com o pai.',
      adultInfanciaPersonalidade: 'Descreve-se como desafiador e agitado na infância.',
      adultTrajetoriaEscolar: 'Concluiu o ensino médio com dificuldade; reprovou uma vez e recebeu advertências.',
      adultTrajetoriaProfissional: 'Trabalhou por doze anos na construção civil; atualmente desempregado e fazendo bicos.',
      adultFuncionamentoExecutivo: 'Dificuldade para iniciar atividades e desorganização da rotina desde o desemprego.',
      adultAutonomia: 'Independente; autocuidado reduzido nos últimos meses.',
      adultAcompanhamentos: 'Sem acompanhamento anterior em saúde mental. Sem exames recentes.',
      adultMedicacoes: 'Não usa medicação contínua.',
      adultAtencaoMemoria: 'Refere perder o raciocínio em conversas e esquecer combinados.',
      adultLinguagemAprendizagem: 'Sem queixa atual de linguagem ou leitura.',
      adultSintomasFisicosSensoriais: 'Cefaleia matinal e fadiga. Nega tremores.',
      adultHumorComportamento: 'Irritabilidade, explosões verbais, baixa energia e perda de interesse.',
      adultSonoRotina: 'Insônia e despertares frequentes. Sem atividade física; isolamento social.',
      adultSubstancias: 'Álcool com uso aumentado recentemente (quase diário). Tabaco desde os 18 anos.',
      adultRedeApoioDetalhada: 'Esposa é o principal apoio, mas a relação está tensionada. Pouco contato com irmãos.',
      ctxViolenciaSituacao: 'Nega violência física. Reconhece explosões verbais e humilhações durante as discussões em casa.',
      ctxViolenciaAutorContexto: 'Conflitos recorrentes com a esposa, há cerca de oito meses, geralmente após ter bebido. Nega armas em casa.',
      ctxViolenciaRedeProtecao: 'Ninguém fora do casal sabe. Sem registro, medida protetiva ou atendimento anterior.',
      ctxViolenciaPlanoSeguranca: 'Combinado atendimento separado com a esposa, orientação sobre rede de apoio e reavaliação na próxima sessão.',
      ctxCuidadoDependentes: 'Dois filhos, de 6 e 11 anos; participa do cuidado nos dias em que não faz bicos.',
      ctxDivisaoCargaMental: 'A esposa organiza a rotina das crianças; ele executa tarefas pontuais. Divide mal, segundo o próprio relato.',
      ctxImpactoCuidadoSofrimento: 'Refere medo de falhar como provedor e vergonha diante dos filhos desde o desemprego.',
      ctxProjetoParentalidade: 'Não deseja mais filhos. Sem pressão familiar.',
      ctxSexualidadeQueixa: 'Queda de libido no último ano, coincidindo com o desemprego e o aumento do uso de álcool.',
      ctxSexualidadeImpacto: 'Incomoda muito e afeta a relação; tem vergonha de tocar no assunto com a esposa.',
      ctxImagemCorporal: 'Insatisfação leve com o ganho de peso no último ano; não deixa de fazer atividades por isso.',
      ctxRecursosCorpoSubstancias: 'Não usa dieta restritiva, anabolizante nem termogênico.',
    },
    contextModules: {
      'violencia-seguranca': true,
      'parentalidade-cuidado': true,
      'sexualidade-corpo-imagem': true,
    },
    marks: {
      psiHumor: ['Irritabilidade', 'Apatia / desânimo', 'Desesperança', 'Oscilações de humor'],
      psiAnsiedade: ['Inquietação', 'Tensão constante'],
      psiSono: ['Dificuldade para iniciar sono', 'Despertares frequentes', 'Sono não reparador'],
      psiAlimentacao: ['Redução do apetite'],
      psiCognicao: ['Dificuldade de atenção / concentração', 'Lentificação do pensamento'],
      psiFuncionamento: ['Prejuízo nas relações', 'Isolamento social', 'Autocuidado prejudicado', 'Queda de energia'],
      psiSubstancias: ['Álcool', 'Tabaco', 'Uso aumentou recentemente'],
      // Caso com sinal de risco marcado — exercita o destaque e o lembrete
      // de conduta do bloco de risco.
      psiRisco: ['Sinais de crise aguda'],
    },
    axisNotes: {
      'axis-1': 'Irritabilidade e desesperança em contexto de perda ocupacional; investigar componente depressivo.',
      'axis-2': 'Prejuízo funcional em relações e autocuidado; rotina desorganizada desde o desemprego.',
      'axis-4': 'Conflito conjugal ativo; rede de apoio estreitada por afastamento dos amigos.',
      'axis-7': 'Diferencial a considerar: quadro depressivo x uso de álcool como fator mantenedor. Não fechar hipótese nesta sessão.',
    },
    riskNotes: `${TEST_MARKER} Sinal de crise aguda marcado para conferência. Triagem: nega ideação suicida estruturada e nega planejamento; refere explosões verbais sem agressão física. Combinado contato da esposa e reavaliação na próxima sessão.`,
  },
  {
    id: 'infantil-atencao-escola',
    summary: 'Infantil — queixa escolar de atenção e ansiedade',
    intakeProfile: 'infantojuvenil_feminino',
    fields: {
      demanda: 'A escola relatou desatenção em sala e queda no rendimento. A mãe percebe que a filha "trava" nas provas.',
      motivoBusca: 'Procura após reunião com a coordenação escolar no fim do bimestre.',
      historiaPessoal: 'Mudança de escola no ano passado. Nascimento do irmão mais novo há dois anos.',
      saudeMental: 'Nunca fez acompanhamento psicológico. Sem medicação.',
      redeApoio: 'Mora com mãe, padrasto e irmão. Avó materna participa da rotina.',
      observacoesSessao: `${TEST_MARKER} Criança tímida no início, engajou-se no brincar. Responsável presente na sessão.`,
      childCuidadorPrincipal: 'Mãe é a cuidadora principal; avó materna busca na escola.',
      childResponsaveisRelacao: 'Relação próxima com a mãe; pouco contato com o pai biológico.',
      childDemandaFamilia: 'A família considera a atenção e o desempenho escolar a maior dificuldade.',
      childQueixaPrincipal: 'Desatenção em sala; a escola percebeu primeiro.',
      childInicioEvolucao: 'Dificuldades mais claras após a alfabetização, com piora recente.',
      childProfissionaisAnteriores: 'Acompanhamento apenas com pediatra; sem outras avaliações.',
      childGestacao: 'Gestação planejada, pré-natal realizado, sem complicações relatadas.',
      childPartoNeonatal: 'Parto cesárea a termo, sem intercorrências neonatais.',
      childDesenvolvimentoMotor: 'Marcos motores dentro do esperado; controle esfincteriano diurno e noturno adquiridos.',
      childLinguagem: 'Desenvolvimento de linguagem dentro do esperado; compreende comandos.',
      childBrincar: 'Brinca com outras crianças, cria histórias e usa brincar simbólico.',
      childInteracaoSocial: 'Contato visual presente, compartilha interesses e demonstra empatia.',
      childCognicaoRotina: 'Atenção diminuída em tarefas longas; segue rotina com apoio.',
      childSensorial: 'Refere incômodo com sons altos; sem outras sensibilidades relatadas.',
      childHumorEmocoes: 'Ansiedade em avaliações, medo de errar e autoestima baixa nos estudos.',
      childComportamentos: 'Agitação e desatenção; sem comportamentos repetitivos ou agressivos.',
      childAutonomia: 'Necessita supervisão para tarefas escolares; independente no autocuidado.',
      childSonoAlimentacaoTelas: 'Sono adequado nos dias de semana; uso de tela elevado à noite.',
      childEscolaAdaptacao: 'Adaptação difícil após a troca de escola; diz não gostar dos dias de prova.',
      childAprendizagem: 'Facilidade em leitura; dificuldade em matemática e atenção em sala.',
      childRelacoesEscola: 'Possui amigos e segue regras; sem relato de bullying.',
      childAcompanhamentoFamiliarEscola: 'Mãe acompanha as tarefas às vezes; sem rotina fixa de estudos.',
      childDinamicaFamiliar: 'Rotina pouco estruturada e divergência entre mãe e padrasto sobre limites.',
      childObjetivosFamilia: 'Família busca melhora na aprendizagem e na regulação emocional.',
      childHistoricoMedico: 'Sem ocorrência médica relevante; sem alergias ou medicação atual.',
      childAvaliacoesAnteriores: 'Não realizou avaliação psicológica ou neuropsicológica.',
      childHistoricoFamiliar: 'Tio materno com diagnóstico de TDAH.',
      ctxCuidadoSupervisao: 'Supervisão adequada; avó materna busca na escola e permanece até a mãe chegar.',
      ctxSinaisProtecao: 'Nada percebido. Nega medo de alguém da casa; sem lesões ou mudança brusca de comportamento.',
      ctxSegurancaDigital: 'Uso de tablet supervisionado pela mãe; sem contato com desconhecidos relatado.',
      ctxRedeProtecaoEncaminhamento: 'Nenhuma ação de proteção necessária no momento; escola já está informada da queixa escolar.',
    },
    contextModules: {
      'protecao-seguranca-infantil': true,
    },
    marks: {
      psiHumor: ['Baixa autoestima', 'Choro frequente'],
      psiAnsiedade: ['Preocupação excessiva', 'Evitação de situações', 'Sintomas físicos (taquicardia, sudorese)'],
      psiSono: ['Sonolência diurna'],
      psiCognicao: ['Dificuldade de atenção / concentração', 'Dificuldade de organização e planejamento'],
      psiDesenvolvimento: ['Dificuldade de aprendizagem escolar'],
      psiFuncionamento: ['Prejuízo no trabalho/estudo'],
    },
    axisNotes: {
      'axis-0': 'Queixa de atenção sustentada e organização; sem prejuízo de linguagem ou memória relatado.',
      'axis-1': 'Ansiedade de desempenho com evitação de situações avaliativas.',
      'axis-3': 'Marcos do desenvolvimento preservados; mudanças de contexto (escola e irmão) coincidem com o início das queixas.',
      'axis-6': 'Hipótese de trabalho: ansiedade de desempenho em contexto de transição, a diferenciar de dificuldade atencional primária. Avaliação neuropsicológica a considerar.',
    },
    riskNotes: `${TEST_MARKER} Triagem de risco realizada com a responsável: sem indicadores de autolesão, violência ou negligência.`,
  },
  {
    id: 'infantil-linguagem-desenvolvimento',
    summary: 'Infantil — atraso de linguagem e interesses restritos',
    intakeProfile: 'infantojuvenil_masculino',
    fields: {
      demanda: 'Os pais relatam que o filho fala pouco, repete falas de vídeos e se irrita com mudanças na rotina.',
      motivoBusca: 'Encaminhado pelo neuropediatra para avaliação psicológica.',
      historiaPessoal: 'Filho único. Frequenta a educação infantil desde os 3 anos.',
      saudeMental: 'Sem acompanhamento psicológico anterior. Em fonoaudiologia há seis meses.',
      redeApoio: 'Mora com pai e mãe. Avós paternos participam da rotina.',
      observacoesSessao: `${TEST_MARKER} Explorou os brinquedos de forma repetitiva. Aceitou mediação do adulto ao final.`,
      childCuidadorPrincipal: 'Mãe é a cuidadora principal; pai participa da rotina noturna.',
      childResponsaveisRelacao: 'Relação próxima com ambos os responsáveis, que moram juntos.',
      childDemandaFamilia: 'A família considera comunicação e comportamento as maiores dificuldades.',
      childQueixaPrincipal: 'Atraso de fala; a família percebeu primeiro, confirmado pela escola.',
      childInicioEvolucao: 'Percebido desde os 2 anos, com evolução lenta na educação infantil.',
      childProfissionaisAnteriores: 'Pediatra, neuropediatra e fonoaudiologia; orientação de estimulação de linguagem.',
      childGestacao: 'Gestação planejada, pré-natal realizado, sem intercorrências.',
      childPartoNeonatal: 'Parto vaginal a termo; sem complicações neonatais.',
      childDesenvolvimentoMotor: 'Marcos motores dentro do esperado; andou com 13 meses.',
      childLinguagem: 'Atraso de fala, uso de gestos e ecolalia; compreende comandos simples.',
      childBrincar: 'Brinca sozinho, com brincar repetitivo e interesse restrito por rodas e veículos.',
      childInteracaoSocial: 'Responde ao nome de forma inconsistente; necessita mediação para brincar com pares.',
      childCognicaoRotina: 'Boa memória para rotas e sequências; dificuldade em mudanças de rotina.',
      childSensorial: 'Sensibilidade a sons e a texturas de alimentos; busca movimento.',
      childHumorEmocoes: 'Irritabilidade diante de mudanças; dificuldade com frustração.',
      childComportamentos: 'Comportamento repetitivo e agitação; sem autoagressão relatada.',
      childAutonomia: 'Necessita supervisão nas atividades de vida diária; pede ajuda por gestos.',
      childSonoAlimentacaoTelas: 'Alimentação seletiva; uso de tela elevado; sono com despertares.',
      childEscolaAdaptacao: 'Adaptação difícil; chora nas trocas de atividade.',
      childAprendizagem: 'Ainda em fase inicial; necessita apoio individualizado em sala.',
      childRelacoesEscola: 'Isolamento no recreio; brinca ao lado, não com os colegas.',
      childAcompanhamentoFamiliarEscola: 'Família mantém contato frequente com os professores.',
      childDinamicaFamiliar: 'Rotina estruturada; responsáveis alinhados quanto a limites.',
      childObjetivosFamilia: 'Família busca avanço em comunicação e autonomia.',
      childHistoricoMedico: 'Sem hospitalizações, cirurgias ou convulsões. Sem medicação atual.',
      childAvaliacoesAnteriores: 'Avaliação fonoaudiológica realizada; sem avaliação neuropsicológica.',
      childHistoricoFamiliar: 'Primo materno com diagnóstico de autismo.',
      ctxCuidadoSupervisao: 'Supervisão adequada; mãe em casa no contraturno, avós paternos apoiam.',
      ctxSinaisProtecao: 'Nada percebido. Sem lesões, sem medo de cuidadores, sem comportamento sexualizado.',
      ctxSegurancaDigital: 'Uso de tela elevado com vídeos supervisionados; sem jogos com chat.',
      ctxRedeProtecaoEncaminhamento: 'Nenhuma ação de proteção necessária; segue acompanhamento com fonoaudiologia.',
    },
    contextModules: {
      'protecao-seguranca-infantil': true,
    },
    marks: {
      psiAnsiedade: ['Inquietação', 'Evitação de situações'],
      psiSono: ['Despertares frequentes'],
      psiAlimentacao: ['Restrição / relação disfuncional com a comida'],
      psiCognicao: ['Dificuldade de linguagem / comunicação'],
      psiDesenvolvimento: [
        'Atraso em marcos do desenvolvimento',
        'Dificuldade de interação social',
        'Comportamentos repetitivos / restritos',
      ],
      psiFuncionamento: ['Prejuízo nas relações', 'Autocuidado prejudicado'],
    },
    axisNotes: {
      'axis-0': 'Linguagem expressiva atrasada com compreensão de comandos simples preservada; memória de sequências acima do esperado para a idade.',
      'axis-2': 'Autonomia reduzida nas atividades de vida diária; necessita mediação em contexto escolar.',
      'axis-3': 'Marcos motores preservados e linguagem atrasada desde os 2 anos, com evolução lenta.',
      'axis-5': 'Comportamentos repetitivos aumentam em mudanças de rotina e ambientes ruidosos — hipótese funcional de regulação sensorial, a observar.',
    },
    riskNotes: `${TEST_MARKER} Triagem realizada com os responsáveis: sem indicadores de violência, negligência ou autoagressão.`,
  },
  {
    id: 'adulto-luto-materno',
    summary: 'Adulta — luto materno e retraimento',
    intakeProfile: 'adulto_feminino',
    fields: {
      demanda: 'Refere tristeza persistente e falta de vontade de sair de casa desde a morte da mãe, há sete meses.',
      motivoBusca: 'Procurou atendimento porque voltou ao trabalho e não está conseguindo sustentar a rotina.',
      historiaPessoal: 'Cuidou da mãe durante dois anos de doença. Filha única. Adiou projetos pessoais no período.',
      saudeMental: 'Nunca fez terapia. Sem medicação psiquiátrica. Nega histórico psiquiátrico familiar conhecido.',
      redeApoio: 'Mora sozinha. Tem o companheiro e uma prima próxima; afastou-se dos colegas.',
      observacoesSessao: `${TEST_MARKER} Chorou ao falar da mãe; discurso organizado. Boa vinculação. Tema para a próxima sessão: retomada da rotina.`,
      adultDescricaoAtual: 'Descreve-se como reservada e "sem energia para nada".',
      adultMudancasRelevantes: 'Perda importante da mãe e retorno ao trabalho após licença.',
      adultInicioEvolucao: 'Início a partir do falecimento, com piora ao voltar à rotina de trabalho.',
      adultHistoriaVida: 'Infância estável; adoecimento e morte da mãe como evento marcante recente.',
      adultFamiliaOrigem: 'Morava com os pais; relação amistosa, especialmente com a mãe.',
      adultInfanciaPersonalidade: 'Descreve-se como afetiva e responsável desde cedo.',
      adultTrajetoriaEscolar: 'Boa adaptação escolar, sem dificuldades de aprendizagem.',
      adultTrajetoriaProfissional: 'Analista na mesma empresa há cinco anos; satisfeita com a função antes da perda.',
      adultFuncionamentoExecutivo: 'Dificuldade para iniciar tarefas e cumprir prazos desde o retorno.',
      adultAutonomia: 'Independente; autocuidado reduzido (alimentação irregular).',
      adultAcompanhamentos: 'Sem acompanhamento psicológico ou psiquiátrico anterior.',
      adultMedicacoes: 'Não usa medicação psiquiátrica.',
      adultAtencaoMemoria: 'Refere alta distração e sensação de "estar no automático".',
      adultLinguagemAprendizagem: 'Sem queixa de linguagem, leitura, escrita ou matemática.',
      adultSintomasFisicosSensoriais: 'Fadiga persistente e sensação de aperto no peito ao lembrar da mãe.',
      adultHumorComportamento: 'Tristeza, choro fácil, perda de interesse e baixa energia.',
      adultSonoRotina: 'Despertares na madrugada; parou o lazer e a participação social.',
      adultSubstancias: 'Não usa álcool nem tabaco. Cafeína em quantidade habitual.',
      adultRedeApoioDetalhada: 'Companheiro e prima ajudam no dia a dia; sente falta de quem "entenda a perda".',
      ctxCicloHumor: 'Sem relação percebida entre fase do ciclo e humor.',
      ctxGestacaoPuerperioPerdas: 'Sem gestação. Adiou planos de engravidar durante os dois anos de cuidado com a mãe.',
      ctxTransicaoHormonal: 'Não se aplica; sem alteração hormonal conhecida.',
      ctxContracepcaoHumor: 'Usa DIU hormonal há três anos, sem mudança de humor percebida.',
      ctxCuidadoDependentes: 'Cuidou da mãe em tempo integral por dois anos, até o falecimento. Hoje não cuida de ninguém.',
      ctxDivisaoCargaMental: 'Organizou tudo sozinha por ser filha única; contava com apoio pago em alguns turnos.',
      ctxImpactoCuidadoSofrimento: 'Refere exaustão acumulada e ambivalência: alívio pelo fim do sofrimento da mãe e culpa por sentir alívio.',
      ctxProjetoParentalidade: 'Deseja ter filhos; sente que "perdeu tempo" e teme não conseguir mais.',
    },
    contextModules: {
      'ciclo-hormonios-reproducao': true,
      'parentalidade-cuidado': true,
    },
    marks: {
      psiHumor: ['Tristeza persistente', 'Perda de prazer (anedonia)', 'Choro frequente', 'Apatia / desânimo'],
      psiAnsiedade: ['Preocupação excessiva'],
      psiSono: ['Despertares frequentes', 'Sono não reparador'],
      psiAlimentacao: ['Redução do apetite'],
      psiCognicao: ['Dificuldade de atenção / concentração'],
      psiTrauma: ['Evitação de lembranças'],
      psiFuncionamento: ['Prejuízo no trabalho/estudo', 'Isolamento social', 'Queda de energia'],
    },
    axisNotes: {
      'axis-1': 'Tristeza e anedonia com curso ligado à perda; afeto mobilizável na sessão.',
      'axis-2': 'Prejuízo em trabalho e vida social; autocuidado parcialmente preservado.',
      'axis-3': 'Papel de cuidadora por dois anos com adiamento de projetos pessoais — considerar na formulação.',
      'axis-7': 'Diferencial: luto prolongado x episódio depressivo. Reavaliar critérios de tempo e funcionalidade nas próximas sessões.',
    },
    riskNotes: `${TEST_MARKER} Triagem de risco realizada: nega ideação suicida, autolesão e violência. Sem sinais de crise aguda.`,
  },
  {
    id: 'adulto-panico-desempenho',
    summary: 'Adulto — crises de pânico e ansiedade de desempenho',
    intakeProfile: 'adulto_masculino',
    fields: {
      demanda: 'Relata episódios súbitos de taquicardia, falta de ar e medo de passar mal em reuniões.',
      motivoBusca: 'Procurou após ir ao pronto-socorro achando que era problema cardíaco; exames sem alteração.',
      historiaPessoal: 'Primeiro da família a concluir a faculdade. Descreve pressão por corresponder às expectativas.',
      saudeMental: 'Fez três sessões de terapia em 2022 e interrompeu. Nunca usou medicação psiquiátrica.',
      redeApoio: 'Mora com a companheira. Boa relação com irmãos; amigos da faculdade em outra cidade.',
      observacoesSessao: `${TEST_MARKER} Discurso organizado, ansioso ao descrever as crises. Orientações dadas sobre o ciclo do pânico.`,
      adultDescricaoAtual: 'Descreve-se como ansioso, exigente consigo e "sempre em alerta".',
      adultMudancasRelevantes: 'Promoção recente com exposição a apresentações públicas.',
      adultInicioEvolucao: 'Início súbito da primeira crise há quatro meses; episódios permaneceram estáveis em frequência.',
      adultHistoriaVida: 'Infância estável com dificuldades financeiras; mudança de cidade para estudar.',
      adultFamiliaOrigem: 'Morava com os pais e dois irmãos; relação amistosa.',
      adultInfanciaPersonalidade: 'Descreve-se como tímido e muito preocupado com avaliação dos outros.',
      adultTrajetoriaEscolar: 'Boa adaptação e bom desempenho; ansiedade em apresentações desde a escola.',
      adultTrajetoriaProfissional: 'Trabalho formal em tecnologia há seis anos; identifica-se com a área.',
      adultFuncionamentoExecutivo: 'Cumpre prazos; relata procrastinação apenas nas tarefas de exposição pública.',
      adultAutonomia: 'Independente em todas as atividades de vida diária.',
      adultAcompanhamentos: 'Avaliação cardiológica recente sem alterações. Terapia interrompida em 2022.',
      adultMedicacoes: 'Não usa medicação contínua.',
      adultAtencaoMemoria: 'Sem queixa de memória; atenção prejudicada durante as crises.',
      adultLinguagemAprendizagem: 'Sem queixa.',
      adultSintomasFisicosSensoriais: 'Taquicardia, sudorese e sensação de falta de ar nos episódios; tensão cervical.',
      adultHumorComportamento: 'Ansiedade antecipatória; humor preservado fora das crises.',
      adultSonoRotina: 'Insônia inicial nas vésperas de apresentação; atividade física regular mantida.',
      adultSubstancias: 'Cafeína em excesso; álcool social. Não fuma.',
      adultRedeApoioDetalhada: 'Companheira acompanha e ajuda; evita comentar o assunto com colegas por vergonha.',
    },
    // Caso propositalmente sem módulo de contexto aberto: nada além do
    // roteiro-base é pertinente, e a ficha fica limpa por isso.
    contextModules: {},
    marks: {
      psiAnsiedade: [
        'Crises de pânico', 'Sintomas físicos (taquicardia, sudorese)',
        'Evitação de situações', 'Preocupação excessiva', 'Tensão constante',
      ],
      psiHumor: ['Baixa autoestima'],
      psiSono: ['Dificuldade para iniciar sono'],
      psiCognicao: ['Dificuldade de atenção / concentração'],
      psiFuncionamento: ['Prejuízo no trabalho/estudo'],
      psiSubstancias: ['Cafeína em excesso'],
    },
    axisNotes: {
      'axis-1': 'Ansiedade com crises de pânico e forte componente antecipatório; humor preservado entre os episódios.',
      'axis-2': 'Prejuízo funcional circunscrito a situações de exposição pública; demais áreas preservadas.',
      'axis-5': 'Evitação reduz a ansiedade no curto prazo e mantém o ciclo — alvo funcional claro.',
      'axis-6': 'Hipótese de trabalho: transtorno de pânico com esquiva situacional, em contexto de ansiedade de desempenho prévia.',
    },
    riskNotes: `${TEST_MARKER} Triagem de risco realizada: nega ideação suicida, autolesão e violência. Sem sinais de crise aguda.`,
  },
  {
    id: 'infantil-adolescente-autolesao',
    summary: 'Adolescente — autolesão e conflito familiar',
    intakeProfile: 'infantojuvenil_feminino',
    fields: {
      demanda: 'A mãe encontrou marcas nos braços da filha. A adolescente diz que "é a única coisa que alivia".',
      motivoBusca: 'Procura imediata após a descoberta das marcas, por orientação da escola.',
      historiaPessoal: 'Separação dos pais há três anos. Mudança de escola no ano passado.',
      saudeMental: 'Sem acompanhamento anterior. Mãe em uso de antidepressivo há dois anos.',
      redeApoio: 'Mora com a mãe e o irmão mais velho. Vê o pai quinzenalmente.',
      observacoesSessao: `${TEST_MARKER} Adolescente atendida separadamente da responsável. Resistência inicial, aceitou combinar retorno. Orientações de segurança dadas à mãe.`,
      childCuidadorPrincipal: 'Mãe é a cuidadora principal; trabalha em turnos e conta com o filho mais velho.',
      childResponsaveisRelacao: 'Relação conflituosa com a mãe no último ano; pouco contato com o pai, que não mora junto.',
      childDemandaFamilia: 'A família considera o comportamento e a ansiedade as maiores dificuldades.',
      childQueixaPrincipal: 'Autolesão; a família percebeu primeiro, após a escola sinalizar o afastamento.',
      childInicioEvolucao: 'Dificuldades desde a adolescência, com piora recente nos últimos três meses.',
      childProfissionaisAnteriores: 'Apenas pediatra na infância; nenhum acompanhamento em saúde mental.',
      childGestacao: 'Gestação planejada, pré-natal realizado, sem complicações.',
      childPartoNeonatal: 'Parto vaginal a termo, sem intercorrências.',
      childDesenvolvimentoMotor: 'Marcos motores dentro do esperado; controle esfincteriano adquirido na idade usual.',
      childLinguagem: 'Desenvolvimento de linguagem dentro do esperado.',
      childBrincar: 'Na infância criava histórias e brincava com outras crianças.',
      childInteracaoSocial: 'Contato visual presente; evita contato desde o afastamento do grupo de amigas.',
      childCognicaoRotina: 'Atenção diminuída e queda no rendimento; rotina difícil de sustentar.',
      childSensorial: 'Sem sensibilidade sensorial relevante percebida.',
      childHumorEmocoes: 'Irritabilidade, choro fácil, baixa autoestima e dificuldade com frustração.',
      childComportamentos: 'Autoagressão (cortes superficiais em antebraços); nega heteroagressão.',
      childAutonomia: 'Independente no autocuidado; cumpre poucos combinados domésticos.',
      childSonoAlimentacaoTelas: 'Insônia inicial, uso de tela elevado à noite e alimentação irregular.',
      childEscolaAdaptacao: 'Adaptação difícil após a mudança de escola; ansiedade escolar.',
      childAprendizagem: 'Boa em leitura; notas baixas no último bimestre por faltas e desatenção.',
      childRelacoesEscola: 'Isolamento recente; relata ter sofrido exclusão do grupo de amigas.',
      childAcompanhamentoFamiliarEscola: 'Mãe mantém contato com a escola; necessita apoio para acompanhar a rotina.',
      childDinamicaFamiliar: 'Limites inconsistentes e conflitos frequentes entre mãe e filha.',
      childObjetivosFamilia: 'Família busca regulação emocional e retomada das relações sociais.',
      childHistoricoMedico: 'Sem hospitalizações ou cirurgias; sem medicação atual.',
      childAvaliacoesAnteriores: 'Não realizou avaliação psicológica ou neuropsicológica.',
      childHistoricoFamiliar: 'Mãe com transtorno psiquiátrico em acompanhamento.',
      ctxCicloHumor: 'Menarca aos 12 anos. Refere piora de irritabilidade e choro na semana pré-menstrual.',
      ctxGestacaoPuerperioPerdas: 'Não se aplica.',
      ctxTransicaoHormonal: 'Não se aplica.',
      ctxContracepcaoHumor: 'Não usa método hormonal.',
      ctxPuberdadeSinais: 'Puberdade em curso desde os 11 anos; sem acompanhamento médico específico.',
      ctxInformacaoPreparo: 'Conversou pouco com a mãe; buscou informação na internet e com amigas. Demonstra vergonha ao falar do tema.',
      ctxImagemCorpoComparacao: 'Incomodada com o corpo, compara-se com colegas e evita se trocar na escola.',
      ctxAutonomiaPrivacidadeCorpo: 'Cuida sozinha da higiene e pede privacidade; a mãe respeita.',
      ctxCuidadoSupervisao: 'Mãe trabalha em turnos; adolescente fica com o irmão mais velho à noite. Faltas escolares recentes.',
      ctxSinaisProtecao: 'Autolesão relatada pela própria adolescente. Nega violência de terceiros, nega medo de alguém da casa.',
      ctxSegurancaDigital: 'Uso sem supervisão à noite; relata ter sofrido exclusão e comentários hostis em grupo de mensagens.',
      ctxRedeProtecaoEncaminhamento: 'Escola informada. Sem necessidade de notificação por violência de terceiros até o momento; reavaliar na próxima sessão.',
    },
    // Módulos abertos em percurso infantil pela pertinência do caso, não
    // pelo perfil — é justamente o que o modelo por sexo não permitia.
    contextModules: {
      'ciclo-hormonios-reproducao': true,
      'puberdade-desenvolvimento-corporal': true,
      'protecao-seguranca-infantil': true,
    },
    marks: {
      psiHumor: ['Tristeza persistente', 'Irritabilidade', 'Baixa autoestima', 'Desesperança', 'Oscilações de humor'],
      psiAnsiedade: ['Preocupação excessiva', 'Evitação de situações', 'Tensão constante'],
      psiSono: ['Dificuldade para iniciar sono', 'Sono não reparador'],
      psiAlimentacao: ['Redução do apetite'],
      psiCognicao: ['Dificuldade de atenção / concentração'],
      psiFuncionamento: ['Prejuízo no trabalho/estudo', 'Prejuízo nas relações', 'Isolamento social'],
      // Segundo caso com risco marcado — cobre o cenário adolescente.
      psiRisco: ['Autolesão não suicida'],
    },
    axisNotes: {
      'axis-1': 'Humor oscilante com irritabilidade e desesperança; autolesão descrita como estratégia de alívio.',
      'axis-2': 'Prejuízo escolar e social relevante nos últimos três meses.',
      'axis-4': 'Conflito familiar ativo e supervisão limitada por jornada da mãe; pai com contato quinzenal.',
      'axis-5': 'Autolesão associada a picos de conflito em casa e a episódios de exclusão social — função de regulação emocional a investigar.',
    },
    riskNotes: `${TEST_MARKER} Autolesão não suicida marcada. Triagem: nega ideação suicida com planejamento; refere pensamentos de "sumir" sem plano. Combinado com a responsável: retirada de objetos de risco, supervisão noturna, contato da rede de urgência e reavaliação em 48h.`,
  },
  {
    id: 'infantil-agitacao-escola',
    summary: 'Infantil — agitação, impulsividade e conflito escolar',
    intakeProfile: 'infantojuvenil_masculino',
    fields: {
      demanda: 'A escola relata que o menino não para na cadeira, interrompe a aula e se envolve em conflitos.',
      motivoBusca: 'Procura após a terceira advertência escolar no semestre.',
      historiaPessoal: 'Segundo filho. Rotina com muitas atividades e pouco tempo livre.',
      saudeMental: 'Sem acompanhamento anterior. Pai relata ter sido "igual na infância".',
      redeApoio: 'Mora com pai, mãe e irmã mais velha. Avós maternos próximos.',
      observacoesSessao: `${TEST_MARKER} Agitado na sala, aceitou combinados com mediação. Boa vinculação ao final.`,
      childCuidadorPrincipal: 'Mãe é a cuidadora principal; pai participa da rotina de fim de semana.',
      childResponsaveisRelacao: 'Relação próxima com ambos; moram juntos.',
      childDemandaFamilia: 'A família considera comportamento e atenção as maiores dificuldades.',
      childQueixaPrincipal: 'Agitação e impulsividade; a escola percebeu primeiro.',
      childInicioEvolucao: 'Percebido desde a educação infantil, com piora recente na alfabetização.',
      childProfissionaisAnteriores: 'Apenas pediatra; sem outras avaliações realizadas.',
      childGestacao: 'Gestação não planejada, pré-natal realizado, sem complicações.',
      childPartoNeonatal: 'Parto cesárea a termo; sem intercorrências neonatais.',
      childDesenvolvimentoMotor: 'Marcos motores dentro do esperado; andou com 11 meses.',
      childLinguagem: 'Desenvolvimento de linguagem dentro do esperado; fala muito e interrompe.',
      childBrincar: 'Brinca com outras crianças; prefere brincadeiras de movimento.',
      childInteracaoSocial: 'Contato visual presente, busca os colegas, tem dificuldade em esperar a vez.',
      childCognicaoRotina: 'Atenção diminuída em tarefas longas; necessita apoio para seguir rotinas.',
      childSensorial: 'Busca movimento; sem sensibilidade a sons ou texturas relatada.',
      childHumorEmocoes: 'Humor geralmente estável; dificuldade importante com frustração.',
      childComportamentos: 'Agitação, desatenção e episódios de heteroagressão verbal em conflitos.',
      childAutonomia: 'Necessita supervisão para tarefas e organização do material.',
      childSonoAlimentacaoTelas: 'Sono adequado; uso de tela elevado nos fins de semana.',
      childEscolaAdaptacao: 'Gosta da escola; adaptação boa no vínculo, difícil nas regras.',
      childAprendizagem: 'Dificuldade de atenção em sala; notas regulares, com reforço escolar recente.',
      childRelacoesEscola: 'Possui amigos; recebeu advertências por conflitos no recreio.',
      childAcompanhamentoFamiliarEscola: 'Família acompanha diariamente e mantém contato com os professores.',
      childDinamicaFamiliar: 'Rotina estruturada; divergência entre os responsáveis sobre firmeza dos limites.',
      childObjetivosFamilia: 'Família busca melhora no comportamento e na autonomia escolar.',
      childHistoricoMedico: 'Sem ocorrência médica relevante; sem alergias ou medicação atual.',
      childAvaliacoesAnteriores: 'Não realizou avaliação psicológica ou neuropsicológica.',
      childHistoricoFamiliar: 'Pai com queixas semelhantes na infância, sem diagnóstico formal.',
      ctxCuidadoSupervisao: 'Supervisão adequada; rotina estruturada com pai, mãe e irmã mais velha.',
      ctxSinaisProtecao: 'Nada percebido. Castigo físico negado pelos responsáveis; limites verbais inconsistentes.',
      ctxSegurancaDigital: 'Joga online com chat nos fins de semana, com supervisão parcial dos pais.',
      ctxRedeProtecaoEncaminhamento: 'Nenhuma ação de proteção necessária; escola acompanha as advertências.',
    },
    contextModules: {
      'protecao-seguranca-infantil': true,
    },
    marks: {
      psiHumor: ['Irritabilidade'],
      psiAnsiedade: ['Inquietação'],
      psiCognicao: ['Dificuldade de atenção / concentração', 'Dificuldade de organização e planejamento'],
      psiDesenvolvimento: ['Dificuldade de aprendizagem escolar'],
      psiFuncionamento: ['Prejuízo no trabalho/estudo', 'Prejuízo nas relações'],
    },
    axisNotes: {
      'axis-0': 'Atenção sustentada e função executiva (organização, espera) como principais queixas; linguagem e memória preservadas.',
      'axis-2': 'Prejuízo concentrado no contexto escolar; vida familiar com rotina estruturada.',
      'axis-5': 'Conflitos concentrados em transições e momentos sem estrutura (recreio, troca de atividade).',
      'axis-7': 'Diferencial: quadro de desatenção/hiperatividade x resposta a ambiente com pouca previsibilidade. Avaliação neuropsicológica a considerar.',
    },
    riskNotes: `${TEST_MARKER} Triagem realizada com os responsáveis: sem indicadores de autolesão, violência ou negligência.`,
  },
];

export const TEST_PSYCHOLOGY_CASE_IDS = psychologyCases.map(item => item.id);

// Uma fila por escopo de sorteio: cada perfil tem a sua, e '*' é o sorteio
// livre (usado só quando ainda não há percurso escolhido). Assim entrar numa
// anamnese adulta e clicar várias vezes percorre os casos adultos sem
// interferir na rotação dos infantis.
const ANY_PROFILE = '*';
const fixtureQueues = new Map();
const lastCaseByScope = new Map();

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function casesForScope(scope) {
  return scope === ANY_PROFILE
    ? psychologyCases
    : psychologyCases.filter(item => item.intakeProfile === scope);
}

// Percorre todos os casos do escopo antes de repetir e evita repetir o
// último da rodada anterior — mesma mecânica do fixture da Acupuntura.
function nextPsychologyCase(scope) {
  const pool = casesForScope(scope);
  if (!pool.length) {
    throw new Error(`Nenhum caso de teste de psicologia para o perfil: ${scope}`);
  }

  let queue = fixtureQueues.get(scope) || [];
  if (!queue.length) {
    queue = shuffled(pool.map(item => item.id));
    if (queue.length > 1 && queue[0] === lastCaseByScope.get(scope)) {
      queue.push(queue.shift());
    }
  }

  const caseId = queue.shift();
  fixtureQueues.set(scope, queue);
  lastCaseByScope.set(scope, caseId);
  return pool.find(item => item.id === caseId);
}

function buildPsychologyFixture(psychologyCase) {
  const selectedMap = {};
  Object.entries(psychologyCase.marks).forEach(([group, items]) => {
    items.forEach(item => {
      selectedMap[`${group}:${item}`] = true;
    });
  });

  return {
    caseId: psychologyCase.id,
    summary: psychologyCase.summary,
    intakeProfile: psychologyCase.intakeProfile,
    sessionPatch: {
      intakeProfile: psychologyCase.intakeProfile,
      intakeSelectedAt: new Date().toISOString(),
      contextModules: { ...(psychologyCase.contextModules || {}) },
      fields: { ...psychologyCase.fields },
      selectedMap,
      axisNotes: { ...psychologyCase.axisNotes },
      riskNotes: psychologyCase.riskNotes,
    },
  };
}

export function getTestPsychologyCases() {
  return psychologyCases.map(({ id, summary, intakeProfile }) => ({ id, summary, intakeProfile }));
}

export function resetRandomPsychologyFixtureCycle() {
  fixtureQueues.clear();
  lastCaseByScope.clear();
}

export function buildPsychologyFixtureForCase(caseId) {
  const psychologyCase = psychologyCases.find(item => item.id === caseId);
  if (!psychologyCase) {
    throw new Error(`Caso de teste de psicologia não encontrado: ${caseId}`);
  }
  return buildPsychologyFixture(psychologyCase);
}

/**
 * Sorteia um caso sintético.
 *
 * @param {string} [intakeProfile] percurso já escolhido pela profissional.
 *   Informado, o sorteio fica restrito a ele e o perfil NUNCA é trocado.
 *   Omitido, sorteia entre todos (o caso traz o próprio percurso).
 */
export function buildRandomPsychologyFixture(intakeProfile) {
  const scope = intakeProfile || ANY_PROFILE;
  return buildPsychologyFixture(nextPsychologyCase(scope));
}
