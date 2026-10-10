import { summaryDisplay } from '../../utils/gestaoSummary';

// ============================================================
// Gestão → Resumo (opção B, 10/10/2026): a entrada da Gestão, um quadro
// por aba do lado Gestão com o número que mais importa nela. O quadro
// inteiro é atalho para a aba. No celular e no tablet é o índice: o
// menu em faixa some e cada aba volta para cá por "Voltar ao Resumo".
// ============================================================

export function GestaoResumo({ sections, groups, icons, summary, loading, onOpen }) {
  const labelOf = new Map(sections.map(item => [item.id, item.label]));
  const tiles = groups.flatMap(group => group.ids
    .filter(id => id !== 'resumo' && labelOf.has(id))
    .map(id => ({ id, group: group.label })));

  return (
    <div className="gt-resumo">
      {tiles.map(({ id, group }) => {
        const tile = summary?.[id];
        const textOnly = tile && tile.value == null && tile.display === '';
        const tone = tile?.tone ? ` gt-tile--${tile.tone}` : '';
        return (
          <button
            key={id}
            type="button"
            className={`gt-tile${textOnly ? ' gt-tile--text' : ''}${tone}`}
            onClick={() => onOpen(id)}
          >
            <span className="gt-tile-head">
              <span className="gt-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {icons[id]}
                </svg>
              </span>
              <span className="gt-tile-name">
                <small>{group}</small>
                <b>{labelOf.get(id)}</b>
              </span>
            </span>
            {!textOnly && <span className="gt-tile-value">{loading ? '…' : summaryDisplay(tile)}</span>}
            <span className="gt-tile-line">
              {tile?.tone && !loading && <i aria-hidden="true" />}
              {loading ? 'carregando…' : tile?.line}
            </span>
            <span className="gt-tile-go" aria-hidden="true">Abrir →</span>
          </button>
        );
      })}
    </div>
  );
}
