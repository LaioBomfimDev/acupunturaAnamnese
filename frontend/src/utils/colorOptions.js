// Comparação/rótulo de cores da paleta curada (CLINIC_BRAND_COLORS),
// usados pelo seletor da instituição e pelo da própria tela.

export function sameColor(a, b) {
  return String(a || '').toUpperCase() === String(b || '').toUpperCase();
}

export function colorLabel(options, value) {
  return options.find(option => sameColor(option.value, value))?.label || value;
}
