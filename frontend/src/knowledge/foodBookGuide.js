// ============================================================
// foodBookGuide — preâmbulo do livro "Sistema Chinês de Curas Alimentares"
// (Henry C. Lu): a base conceitual e as orientações COMPLEMENTARES que o autor
// dá antes das monografias — dieta chinesa vs. ocidental, os cinco sabores, as
// cinco energias, os movimentos, dosagens/quantidades, métodos de preparo,
// alimentação por estação e como cada alimento é descrito.
//
// Transcrição curada e limpa (o OCR do PDF tem ruído). É REFERÊNCIA de leitura
// do profissional — não é prescrição nem plano alimentar. Páginas referem-se à
// numeração impressa do livro. Ver [[foodMonographs]] e docs/plano-dietoterapia.
// ============================================================

export const FOOD_BOOK_GUIDE = {
  source: { title: 'Sistema Chinês de Curas Alimentares', author: 'Henry C. Lu' },

  intro:
    'Na dieta ocidental os alimentos são considerados por proteína, calorias, ' +
    'carboidratos e vitaminas. Na dieta chinesa eles são considerados por quatro ' +
    'aspectos: os cinco sabores, as cinco energias (naturezas térmicas), os movimentos ' +
    'e as ações sobre os órgãos internos. A lógica é simples: se sinto frio, prefiro algo ' +
    'que aqueça; se sinto calor, algo que refresque; se meu estômago está fraco, algo que ' +
    'o fortaleça. É essa leitura tradicional que organiza cada alimento a seguir.',

  topics: [
    {
      id: 'quantidades',
      title: 'Sobre as quantidades e dosagens',
      pages: 'Antes de Você Começar (pp. xviii–xix)',
      paragraphs: [
        'As quantidades indicadas em cada alimento são apenas aproximadas — use o bom senso e ajuste às suas próprias necessidades e ao seu porte físico. Como se trata de alimentos (não ervas ou medicamentos), pequenas variações não fazem diferença significativa: uma pessoa pode comer uma banana por dia e outra três, por exemplo.',
        'Quando o livro sugere "colheradas", entenda sempre colheres de chá cheias, a menos que se especifique de outro modo.',
        'Em caso de dúvida, ou de sintomas mais sérios, é sempre sensato e necessário consultar o seu próprio médico.',
      ],
    },
    {
      id: 'preparo',
      title: 'Métodos de preparo e preparações especiais',
      pages: 'Antes de Você Começar (pp. xvii–xviii)',
      paragraphs: [
        'Quando um alimento é "fervido", entende-se fervido em água, salvo indicação contrária. Muitas vezes o alimento ou a erva é coado e apenas o caldo/líquido é consumido como sopa ou chá; em outros preparos, come-se o alimento e bebe-se o líquido, conforme a receita.',
        'Alimentos para curas não costumam ser guardados por muito tempo, exceto em pó — e mesmo o pó deve ser mantido seco e no refrigerador.',
        'Cinco ingredientes básicos aparecem repetidamente para preparar os alimentos conforme cada finalidade: vinho de arroz, vinagre de arroz, suco de gengibre fresco, sal e mel.',
      ],
    },
    {
      id: 'cinco-sabores',
      title: 'Os cinco sabores',
      pages: 'Energias e Sabores dos Alimentos (pp. 2–5)',
      paragraphs: [
        'Cada sabor age preferencialmente sobre certos órgãos: pungente → pulmões e intestino grosso; doce → estômago e baço; azedo → fígado e vesícula biliar; amargo → coração e intestino delgado; salgado → rins e bexiga. Um mesmo alimento pode ter dois ou três sabores.',
        'Pungente (gengibre, cebola verde, hortelã): induz transpiração e promove a circulação energética.',
        'Doce (mel, açúcar, melancia): retarda sintomas agudos e neutraliza efeitos tóxicos de outros alimentos; melhora as funções digestivas.',
        'Azedo (limão, ameixa): obstrui/contém movimentos — útil em diarreia e transpiração excessiva.',
        'Amargo (fruto do lúpulo, alface, vinagre): reduz calor do organismo, seca líquidos e pode induzir diarreia.',
        'Salgado ("kelp", alga marinha): suaviza durezas — daí seu uso tradicional em nódulos e endurecimentos.',
        'Suave/pouco gosto (pepino, lágrimas-de-jó): promove a urinação; usado como diurético.',
      ],
    },
    {
      id: 'cinco-energias',
      title: 'As cinco energias (naturezas térmicas)',
      pages: 'Energias e Sabores dos Alimentos (pp. 6–9)',
      paragraphs: [
        'A energia é o efeito térmico que o alimento produz no organismo, independente da sua temperatura ao ser servido. São cinco: fria, fresca, neutra, morna e quente (o livro ainda usa "levemente frio" e "levemente morno" como nuances).',
        'Alimentos frios e frescos (banana, melancia, "mung bean", pêra, pepino) tendem a refrescar e são associados a quadros de calor.',
        'Alimentos mornos e quentes (gengibre, canela, pimenta, carne de carneiro) tendem a aquecer e são associados a quadros de frio.',
        'Alimentos neutros (arroz, mel, uva, carne de boi) são equilibrados. O exemplo do autor: o gengibre aquece porque tem energia morna/quente; os "mung beans" refrescam porque têm energia fria — comer o oposto do que o quadro pede pode piorar os sintomas.',
      ],
    },
    {
      id: 'movimentos',
      title: 'Os movimentos dos alimentos',
      pages: 'Energias e Sabores dos Alimentos (pp. 9–10)',
      paragraphs: [
        'Os alimentos tendem a mover a energia em quatro direções, pensando o corpo em quatro regiões (interior, exterior, superior, inferior):',
        'Para fora (de dentro para fora): pode induzir transpiração e reduzir febre.',
        'Para dentro (de fora para dentro): pode facilitar movimentos intestinais e aliviar inchação abdominal.',
        'Para cima (do inferior para o superior): pode aliviar diarreia, prolapsos e prostração do estômago.',
        'Para baixo (do superior para o inferior): pode aliviar vômito, soluço e asma.',
        'Regra geral (com exceções): folhas e flores tendem a subir; raízes, sementes e frutas tendem a descer.',
      ],
    },
    {
      id: 'estacoes',
      title: 'Comer conforme as estações',
      pages: 'citação de Li Shi-Zhen (p. 40)',
      paragraphs: [
        'O autor cita o mestre herbalista Li Shi-Zhen (1518–1593): na primavera, comer mais alimentos pungentes e mornos, em harmonia com o movimento ascendente da estação; no verão, mais pungentes e quentes (movimento externo); no outono, mais azedos e mornos (movimento descendente); no inverno, mais amargos e frios (movimento interno).',
      ],
    },
    {
      id: 'formato',
      title: 'Como cada alimento é descrito no livro',
      pages: 'abertura dos capítulos de alimentos (p. 41)',
      paragraphs: [
        'Cada alimento traz: as Indicações (logo abaixo do nome), a Descrição (energia, sabor, ações e órgãos afetados), as Aplicações (preparos e quantidades), e — quando existem — Relatórios clínicos, Experiências e Comentários.',
        'É esse mesmo formato que você encontra em cada card, dentro de "Ver conteúdo do livro".',
      ],
    },
  ],
};
