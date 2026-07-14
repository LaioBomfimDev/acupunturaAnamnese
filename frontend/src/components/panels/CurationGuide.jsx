// ============================================================
// Cabeçalho-guia das abas de curadoria (modo revisora)
//
// Explica, em linguagem simples e com passo a passo numerado, o que a
// profissional deve fazer em cada aba. Aparece só no modo "propor".
// ============================================================

const READY_GUIDES = {
  points: {
    icon: '📍',
    title: 'Definir quais pontos aparecem no atendimento',
    intro: 'Esta área separa a base completa dos pontos que já aparecem para as profissionais. Os filtros só mudam a lista exibida; não aprovam nem ocultam nada sozinhos.',
    legend: [
      { term: 'Ocultos', description: 'pontos da base que ainda não aparecem na lista principal do atendimento.' },
      { term: 'Comuns', description: 'pontos que já aparecem para uso cotidiano das profissionais.' },
      { term: 'Todos', description: 'reúne comuns e ocultos. O número mostra quantos pontos há em cada grupo.' },
    ],
    steps: [
      'Comece em «Ocultos» e use a busca para localizar o ponto que deseja revisar.',
      'Abra o nome do ponto e confira código, nome, meridiano, localização, ações, indicações e cautelas disponíveis.',
      'Decida se a ficha está clara e se o ponto deve entrar na lista principal do atendimento.',
      'Clique em «Propor como comum». A proposta vai ao SuperAdm; o ponto só muda depois da aprovação final.',
    ],
  },
  'anamnese-knowledge': {
    icon: '📋',
    title: 'Revisar o conhecimento usado na anamnese',
    intro: 'Aqui ficam candidatos extraídos das fontes para compor a investigação clínica. O tipo informa a função do item; o estado informa em que etapa da curadoria ele está.',
    legend: [
      { term: 'Achado', description: 'sinal ou informação clínica que pode ser registrado e ligado a padrões.' },
      { term: 'Pergunta', description: 'pergunta sugerida para investigar um tema na anamnese.' },
      { term: 'Padrão', description: 'hipótese estruturada de MTC para revisão; nunca é diagnóstico automático.' },
      { term: 'Em revisão', description: 'ainda aguarda decisão. O número em cada filtro é a quantidade de candidatos.' },
    ],
    steps: [
      'Escolha um filtro ou pesquise pelo rótulo, gatilho ou padrão; depois abra um candidato da lista.',
      'Compare os dados do candidato com a página e os metadados da fonte rastreável.',
      'Corrija o texto, o grupo e os vínculos achado→padrão quando necessário; se houver ruído ou conflito, não aprove.',
      'Clique em «Propor aprovação» ou «Propor reprovação». O SuperAdm confere antes de aplicar a decisão.',
    ],
  },
  'anamnese-psic': {
    icon: '🧠',
    title: 'Revisar a anamnese de Psicologia',
    intro: 'Os botões são tipos de conteúdo, não níveis de aprovação. A legenda aparece junto deles: o botão verde mostra o tipo aberto e o número entre parênteses mostra quantos itens existem nele.',
    steps: [
      'Escolha o tipo de conteúdo que deseja revisar e abra um item na lista da esquerda.',
      'Leia o resumo, os exemplos e a evidência da fonte. Confira se o item pertence mesmo àquele tipo.',
      'Revise a redação em pt-BR. Use «Propor edição» quando o conteúdo fizer sentido, mas o texto precisar mudar; use reprovação quando o item não deve entrar.',
      'Envie a proposta escolhida. Nada vira pergunta, marcação ou alerta do atendimento antes da aprovação final do SuperAdm.',
    ],
  },
  'herbal-curation': {
    icon: '🌿',
    title: 'Revisar a curadoria de ervas',
    intro: 'Cada ficha reúne identificação, fonte e dados de segurança. O status define onde o conteúdo pode aparecer; não representa prescrição nem autorização de uso.',
    legend: [
      { term: 'Somente fonte', description: 'conteúdo preservado para consulta interna, sem liberação.' },
      { term: 'Curadoria técnica', description: 'ficha em revisão interna; ainda não pode ser exibida como orientação.' },
      { term: 'Restrito profissional', description: 'exige avaliação individual e permanece fora do conteúdo educativo ao paciente.' },
      { term: 'Educativo aprovado', description: 'linguagem educativa revisada; nunca inclui dose, preparo ou prescrição.' },
      { term: 'Bloqueado por risco', description: 'não deve ser exibido. Os números mostram quantas fichas estão em cada estado.' },
    ],
    steps: [
      'Use os filtros de status e segurança para localizar uma planta; depois abra a ficha.',
      'Confirme espécie, parte usada, página da fonte, toxicologia, interações, cautelas e grupos vulneráveis.',
      'Escolha o status compatível e registre síntese, cautelas e justificativa. Na dúvida de segurança, mantenha ou aumente a restrição.',
      'Clique em «Propor decisão». O SuperAdm ainda precisa conferir e aprovar; a proposta não publica nem prescreve a erva.',
    ],
  },
  'food-curation': {
    icon: '🥗',
    title: 'Revisar a curadoria de alimentos',
    intro: 'As fichas descrevem associações tradicionais da MTC para educação em saúde. O status controla a liberação do conteúdo; não cria cardápio, dose ou prescrição alimentar.',
    legend: [
      { term: 'Curadoria técnica', description: 'ficha interna que ainda precisa de revisão.' },
      { term: 'Educativo aprovado', description: 'conteúdo geral revisado que pode seguir para uma etapa de publicação.' },
      { term: 'Restrito profissional', description: 'conteúdo que depende de avaliação individual.' },
      { term: 'Bloqueado por risco', description: 'conteúdo que não deve ser exibido. O filtro ativo só muda a lista mostrada.' },
    ],
    steps: [
      'Escolha um filtro ou pesquise pelo alimento; depois abra uma ficha da lista.',
      'Confira a página da fonte, a descrição tradicional, a linguagem educativa e as cautelas.',
      'Escolha o status, marque as três conferências obrigatórias e registre uma justificativa clara.',
      'Clique em «Propor decisão». O SuperAdm confere antes de aplicar; nada vai automaticamente para paciente ou IA.',
    ],
  },
  maps: {
    icon: '🗺️',
    title: 'Calibrar as coordenadas dos pontos',
    intro: 'Esta área ajusta onde cada ponto aparece sobre a imagem anatômica. Os filtros mostram o estado da coordenada; não medem importância clínica do ponto.',
    legend: [
      { term: 'Aprovados', description: 'coordenadas já conferidas localmente.' },
      { term: 'Rascunhos', description: 'posições manuais ainda pendentes de aprovação.' },
      { term: 'Automáticos', description: 'posições sugeridas pelo sistema que exigem conferência humana.' },
      { term: 'Revisar mapa', description: 'ponto ligado a um mapa divergente ou que precisa ser reposicionado.' },
      { term: 'Mais usados / Todos', description: 'limita a lista por frequência de uso; o número indica quantas coordenadas há no estado.' },
    ],
    steps: [
      'Escolha o mapa anatômico, o filtro de estado e o ponto que deseja conferir.',
      'Clique em «Calibrar mapa» e compare o marcador com a referência anatômica disponível.',
      'Arraste o marcador para a posição correta; se ele estiver na imagem errada, use «Alterar mapa».',
      'Confirme em «OK, salvar». No modo revisora, a coordenada vira proposta e só muda após aprovação do SuperAdm.',
    ],
  },
  knowledge: {
    icon: '📚',
    title: 'Revisar os pontos da Biblioteca Viva',
    intro: 'Aqui você revisa fichas de pontos montadas a partir das fontes. As faixas indicam a confiança da correspondência com o Atlas, não a certeza clínica do conteúdo.',
    legend: [
      { term: 'Alta automática', description: 'correspondência forte com a fonte, mas ainda exige revisão profissional.' },
      { term: 'Média', description: 'há apoio parcial; confira com mais atenção os campos e a página.' },
      { term: 'Baixa', description: 'fonte incompleta ou correspondência fraca; não aprove sem evidência suficiente.' },
      { term: 'Propor revisão / aprovação', description: 'revisão mantém o item em trabalho; aprovação solicita sua promoção local ao SuperAdm.' },
    ],
    steps: [
      'Escolha a faixa de confiança, pesquise por código ou nome e abra um ponto da lista.',
      'Compare a ficha com a fonte Atlas e verifique se código, página e ponto realmente correspondem.',
      'Revise localização, ações, indicações, cautelas, técnicas e a nota que justifica sua decisão.',
      'Clique em «Propor revisão» para manter o trabalho em revisão ou «Propor aprovação» quando a ficha estiver pronta. O SuperAdm decide a aplicação final.',
    ],
  },
  'pdf-sources': {
    icon: '📄',
    title: 'Revisar pontos a partir das Fontes PDF',
    intro: 'Esta fila reúne lacunas de pontos encontradas em PDFs protegidos. Os filtros combinam situação, tipo de ponto e qualidade da fonte; não significam aprovação clínica.',
    legend: [
      { term: 'Não respondidos', description: 'pontos que ainda têm campos sem resposta curada.' },
      { term: 'Alta confiança', description: 'fontes com melhor correspondência; a revisão profissional continua obrigatória.' },
      { term: 'Sistêmicos / Auricular', description: 'separa o tipo de ponto, sem alterar seu estado.' },
      { term: 'Idioma', description: 'itens que dependem de tradução e pedem conferência extra.' },
      { term: 'Salvos', description: 'rascunhos já registrados localmente. O número é a quantidade em cada filtro.' },
    ],
    steps: [
      'Escolha um filtro, pesquise o código e abra um ponto da fila.',
      'Leia as páginas-fonte, confira o idioma e compare a tradução com o trecho original disponível.',
      'Revise a confiabilidade e preencha somente os campos sustentados pela fonte; mantenha explícitas as lacunas e incertezas.',
      'Clique em «Propor rascunho» ou «Propor e próximo». O SuperAdm confere antes de salvar ou aplicar qualquer conteúdo.',
    ],
  },
};

function observationGuide(sectionLabel) {
  return {
    icon: '✍️',
    title: `Sugerir uma correção em ${sectionLabel || 'esta área'}`,
    intro: 'Esta área ainda não possui formulário estruturado para a revisora. Você pode registrar uma observação objetiva para o SuperAdm analisar.',
    legend: [
      { term: 'Observação', description: 'explica o problema encontrado e a correção esperada.' },
      { term: 'Referência do item', description: 'código, nome ou outro identificador que ajuda o SuperAdm a localizar o conteúdo.' },
      { term: 'Enviar', description: 'cria uma proposta; não altera nem publica o conteúdo automaticamente.' },
    ],
    steps: [
      'Localize e confira o conteúdo que precisa de correção.',
      'Descreva o que está errado, onde aparece e como deveria ficar.',
      'Informe o código, nome ou referência do item e inclua a justificativa técnica necessária.',
      'Clique em «Enviar ao SuperAdm». A alteração só acontece depois da análise e aprovação final.',
    ],
  };
}

export function CurationGuide({ sectionId, ready = true, sectionLabel = '' }) {
  const guide = ready ? READY_GUIDES[sectionId] : observationGuide(sectionLabel);
  if (!guide) return null;

  return (
    <section className={`curation-guide${ready ? '' : ' curation-guide-soon'}`} aria-label="Como usar esta aba">
      <div className="curation-guide-head">
        <span className="curation-guide-icon" aria-hidden="true">{guide.icon}</span>
        <div>
          <h2>{guide.title}</h2>
          <p>{guide.intro}</p>
        </div>
      </div>
      {guide.legend?.length > 0 && (
        <div className="curation-guide-legend" aria-label="Legenda desta área">
          <h3>Entenda o que você está vendo</h3>
          <div className="curation-guide-legend-grid">
            {guide.legend.map(item => (
              <div key={item.term} className="curation-guide-legend-item">
                <b>{item.term}</b>
                <span>{item.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <h3 className="curation-guide-steps-title">Passo a passo</h3>
      <ol className="curation-guide-steps">
        {guide.steps.map((step, index) => (
          <li key={index}>
            <span className="curation-guide-num">{index + 1}</span>
            <span className="curation-guide-text">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
