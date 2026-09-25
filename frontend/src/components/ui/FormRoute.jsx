import { useEffect, useState } from 'react';
import { summarizeRoute } from '../../utils/formRoute';

// ============================================================
// UI: Roteiro da ficha — o trilho de seções ao lado do formulário,
// com o progresso real de cada seção (utils/formRoute.js). Cada item
// leva direto à seção; o item da seção visível fica marcado.
//
// FormLayout monta trilho + ficha; quando a coluna fica estreita
// (container query em styles/forms.css), o trilho vira uma faixa de
// atalhos horizontal no topo, sem esconder nenhuma seção.
// ============================================================

function progressLabel(entry) {
  if (!entry.total) return entry.hint;
  const base = `${entry.done} de ${entry.total}`;
  return entry.risk ? `${base} · risco marcado` : base;
}

function scrollToAnchor(anchor) {
  const target = document.getElementById(anchor);
  if (!target) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

export function FormRoute({ items }) {
  const [active, setActive] = useState(items[0]?.id || null);
  const anchors = items.map(entry => entry.anchor).join('|');

  // Marca a seção que está no terço superior da tela.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const byAnchor = new Map(items.map(entry => [entry.anchor, entry.id]));
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActive(byAnchor.get(entry.target.id) || null);
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    byAnchor.forEach((_, anchor) => {
      const element = document.getElementById(anchor);
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
    // Reobserva só quando as seções mudam (troca de percurso/sexo clínico).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchors]);

  const total = summarizeRoute(items);

  return (
    <nav className="form-route no-print" aria-label="Roteiro da ficha">
      <p className="form-route-title">Roteiro da ficha</p>
      <ol>
        {items.map(entry => {
          const ratio = entry.total ? entry.done / entry.total : 0;
          const complete = entry.total > 0 && entry.done === entry.total && !entry.risk;
          return (
            <li key={entry.id}>
              <a
                href={`#${entry.anchor}`}
                aria-current={active === entry.id ? 'true' : undefined}
                onClick={event => {
                  event.preventDefault();
                  setActive(entry.id);
                  scrollToAnchor(entry.anchor);
                }}
              >
                <span
                  className={`form-route-node${complete ? ' is-done' : ''}${entry.risk ? ' is-risk' : ''}`}
                  style={{ '--p': ratio }}
                  aria-hidden="true"
                />
                <span className="form-route-text">
                  {entry.number ? `${entry.number}. ` : ''}{entry.title}
                  <small>{progressLabel(entry)}</small>
                </span>
              </a>
            </li>
          );
        })}
      </ol>
      {total.total > 0 && (
        <p className="form-route-foot">
          {total.done} de {total.total} itens preenchidos no total.
        </p>
      )}
    </nav>
  );
}

/**
 * Título de seção do novo padrão: número como marca, título em preto e
 * contador da própria seção. `entry` vem de utils/formRoute.js; `children`
 * são ações da seção (ex.: exibir módulo condicional).
 */
export function FormSectionTitle({ entry, risk = false, children }) {
  if (!entry) return null;
  const numberClass = risk || entry.risk
    ? ' form-section-num--risk'
    : entry.number ? '' : ' form-section-num--bare';
  return (
    <h3 className="form-section-title" id={entry.anchor}>
      <span className={`form-section-num${numberClass}`} aria-hidden={entry.number ? undefined : 'true'}>
        {entry.number || '·'}
      </span>
      <span className="form-section-text">{entry.title}</span>
      {entry.total > 0 && (
        <span className="form-section-meta">
          {entry.done} de {entry.total} {entry.unitLabel}
        </span>
      )}
      {children}
    </h3>
  );
}

export function FormLayout({ route, children }) {
  return (
    <div className="form-shell">
      <div className="form-layout">
        {route}
        <div className="form-sheet">{children}</div>
      </div>
    </div>
  );
}
