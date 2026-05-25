// Componente: Grid de botões de checklist reutilizável
export function CheckGrid({ group, items, cols = 3, selectedMap, onToggle }) {
  const gridClass = `checkgrid${cols === 2 ? ' two' : ''}`;

  return (
    <div className={gridClass}>
      {items.map(item => {
        const key = `${group}:${item}`;
        const isActive = !!selectedMap[key];
        return (
          <button
            key={item}
            className={`tag${isActive ? ' active' : ''}`}
            onClick={() => onToggle(group, item)}
          >
            {isActive ? '✓ ' : ''}{item}
          </button>
        );
      })}
    </div>
  );
}
