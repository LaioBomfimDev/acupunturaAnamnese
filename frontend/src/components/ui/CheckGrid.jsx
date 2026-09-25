// Componente: Grid de botões de checklist reutilizável
// `tone="risk"`: sinais de segurança/risco marcam em vermelho (cor
// semântica), nunca na cor da clínica.
export function CheckGrid({ group, items, cols = 3, selectedMap, onToggle, tone }) {
  const gridClass = `checkgrid${cols === 2 ? ' two' : ''}${tone === 'risk' ? ' checkgrid--risk' : ''}`;

  return (
    <div className={gridClass}>
      {items.map(item => {
        const key = `${group}:${item}`;
        const isActive = !!selectedMap[key];
        return (
          <button
            key={item}
            type="button"
            className={`tag${isActive ? ' active' : ''}`}
            aria-pressed={isActive}
            onClick={() => onToggle(group, item)}
          >
            {isActive ? '✓ ' : ''}{item}
          </button>
        );
      })}
    </div>
  );
}
