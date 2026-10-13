import { useEffect, useState } from 'react';

// ============================================================
// Número que sobe de zero até o valor quando o bloco aparece (nota da
// escala ao abrir o cartão). Só enfeite: o valor certo está no texto
// desde o começo para o leitor de tela (quem usa repete o número num
// aria-label) e quem pediu menos movimento vê o número parado.
// ============================================================

const DURATION_MS = 650;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * `target`: o número final (inteiro ou com casas, como a média da
 * Autocompaixão). `active`: anima quando passa a ser true. Devolve o
 * número da vez, já arredondado como o final (inteiro fica inteiro).
 */
export function useCountUp(target, active = true) {
  const [value, setValue] = useState(target);

  useEffect(() => {
    if (!active || typeof target !== 'number' || !Number.isFinite(target) || prefersReducedMotion()) {
      return undefined;
    }
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return undefined;
    let frame = 0;
    let start = null;
    const tick = now => {
      if (start === null) start = now;
      const progress = Math.min(1, (now - start) / DURATION_MS);
      const eased = 1 - (1 - progress) ** 3;
      setValue(progress >= 1 ? target : target * eased);
      if (progress < 1) frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    // Rede de segurança: aba em segundo plano para o requestAnimationFrame
    // no meio da conta; o número certo aparece de qualquer jeito.
    const settle = window.setTimeout(() => setValue(target), DURATION_MS + 120);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      setValue(target);
    };
  }, [target, active]);

  if (typeof target !== 'number' || !Number.isFinite(target)) return target;
  if (value === target) return target;
  return Number.isInteger(target) ? Math.round(value) : Math.round(value * 100) / 100;
}
