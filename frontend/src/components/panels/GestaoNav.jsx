// ============================================================
// Menu da Gestão (admin e Gestão pessoal)
//
// Coluna à esquerda com as abas agrupadas por assunto; no celular vira
// uma faixa que rola de lado. Cada tela mantém a própria lista de abas
// (SECTIONS) e só diz aqui em que grupo cada uma entra — a ordem do
// menu é a ordem dos grupos. Fica fora da impressão: a aba Documentos
// imprime a folha timbrada de dentro da Gestão.
// ============================================================

export function GestaoNav({ label, sections, groups, icons, active, onSelect }) {
  const byId = new Map(sections.map(item => [item.id, item]));

  return (
    <nav className="gt-nav no-print" aria-label={label}>
      {groups.map(group => (
        <div key={group.label} className="gt-nav-group">
          <p className="gt-nav-label">{group.label}</p>
          {group.ids.filter(id => byId.has(id)).map(id => (
            <button
              key={id}
              type="button"
              className="gt-nav-item"
              aria-current={active === id ? 'page' : undefined}
              onClick={() => onSelect(id)}
            >
              <span className="gt-nav-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {icons[id]}
                </svg>
              </span>
              {byId.get(id).label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

// Título da aba aberta + "Como funciona" (passado como children).
export function GestaoSectionHead({ groups, sections, active, children }) {
  const group = groups.find(item => item.ids.includes(active));
  const section = sections.find(item => item.id === active);

  return (
    <header className="gt-head no-print">
      <div>
        {group && <p className="gt-head-kicker">{group.label}</p>}
        <h2 className="gt-head-title">{section?.label}</h2>
      </div>
      {children}
    </header>
  );
}
