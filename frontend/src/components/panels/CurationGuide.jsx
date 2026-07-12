// ============================================================
// Cabeçalho-guia das abas de curadoria (modo revisora)
//
// Explica, em linguagem simples e com passo a passo numerado, o que a
// profissional deve fazer em cada aba. Aparece só no modo "propor".
// ============================================================

const READY_GUIDES = {
  points: {
    icon: '📍',
    title: 'Escolher os pontos que aparecem para todos',
    intro: 'Aqui você decide quais pontos entram na lista que os terapeutas usam no dia a dia. Nada é apagado — o ponto só passa a aparecer.',
    steps: [
      'Deixe o filtro em «Ocultos» para ver os pontos que ainda não aparecem.',
      'Toque no nome do ponto para abrir a ficha e conferir localização, ações e indicações.',
      'Se ele deve aparecer para todos, toque em «Propor como comum» — vai para o SuperAdm aprovar.',
    ],
  },
  'anamnese-knowledge': {
    icon: '📋',
    title: 'Revisar os achados e padrões da anamnese',
    intro: 'Cada item foi tirado de um livro. Você confere se está certo e diz o que fazer com ele.',
    steps: [
      'Toque em um item da lista à esquerda para abri-lo.',
      'Compare com a fonte mostrada ao lado e corrija o texto se precisar.',
      'Toque em «Propor aprovação» (ou «Propor reprovação»). Vai direto para o SuperAdm.',
    ],
  },
  'anamnese-psic': {
    icon: '🧠',
    title: 'Revisar a anamnese de Psicologia',
    intro: 'Os trechos mostrados são só a origem (do manual). Você escreve como o item deve ficar e propõe.',
    steps: [
      'Escolha um tipo (risco, eixos, checklist) e toque em um grupo.',
      'Leia a evidência e escreva a redação final em português.',
      'Toque em «Propor aprovação». Vai para o SuperAdm aprovar.',
    ],
  },
};

const COMING_SOON_GUIDE = {
  icon: '🛠️',
  title: 'Esta aba ainda está em preparação',
  intro: 'O envio ao SuperAdm ainda não está ligado aqui. Por enquanto, foque nas abas já prontas — é onde suas correções realmente chegam para aprovação.',
  steps: [
    'Use «Pontos comuns/ocultos» para escolher quais pontos aparecem.',
    'Use «Conhecimento da Anamnese» para revisar achados e padrões.',
  ],
};

export function CurationGuide({ sectionId, ready = true }) {
  const guide = ready ? READY_GUIDES[sectionId] : COMING_SOON_GUIDE;
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
