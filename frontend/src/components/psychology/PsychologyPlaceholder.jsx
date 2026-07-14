// ============================================================
// Placeholder das abas de Psicologia ainda não construídas (Rodada 2).
// Deixa a navegação inteira clicável e "completa por fora" sem
// prometer função que ainda não existe — cada uma será desenhada
// COM a psicóloga antes de virar fluxo real.
// ============================================================

// Texto próprio de cada aba futura: o que ela vai ser.
const PLACEHOLDER_COPY = {
  'Avaliação neuropsicológica': 'Bateria de instrumentos, planejamento da avaliação, resultados descritivos e integração com o relatório.',
  'Síntese do caso': 'Organização descritiva do caso: fatores predisponentes, precipitantes, perpetuadores e protetivos.',
  'Hipóteses/diagnóstico': 'Hipóteses de trabalho e diferenciais, com o diagnóstico registrado pela profissional (nunca pela IA).',
  'Objetivos': 'Objetivos acordados com a pessoa, prioridades e critérios de acompanhamento.',
  'Plano terapêutico': 'Estratégias escolhidas pela profissional, encaminhamentos, rede de apoio e frequência prevista.',
  'Biblioteca': 'Consulta a conteúdo de Psicologia aprovado ou claramente rotulado como rascunho, com proveniência e faixa de confiança.',
};

export function PsychologyPlaceholder({ tab }) {
  const description = PLACEHOLDER_COPY[tab] || 'Fluxo em construção.';
  return (
    <section className="psi-placeholder">
      <div className="panel">
        <div className="panel-title">{tab}</div>
        <div className="panel-body">
          <div className="box psi-placeholder-box">
            <span className="psi-placeholder-badge">Em construção</span>
            <h3>{tab}</h3>
            <p>{description}</p>
            <p className="small">
              Esta área será desenhada junto com a psicóloga antes de virar um fluxo real —
              ela está aqui para você ver o mapa completo do workspace. Nada é registrado nem
              decidido por IA nesta etapa.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
