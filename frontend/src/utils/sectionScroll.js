// Telas de menu lateral (Gestão, Gestão pessoal, Financeiro).

/**
 * Trocar de parte leva ao título dela (03/11/2026, pedido da
 * administradora): com o menu comprido, quem clicava lá embaixo ficava
 * rolado e a parte nova parecia vazia. Só rola quando o título está
 * acima da tela; com menos movimento, pula sem animação.
 */
export function scrollToSectionTop(fromNode) {
  if (typeof window === 'undefined') return;
  window.requestAnimationFrame(() => {
    const scope = fromNode?.closest?.('.gt') || document;
    const head = scope.querySelector('.gt-head') || scope.querySelector('.gt-main');
    if (!head || head.getBoundingClientRect().top >= 0) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    head.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  });
}
