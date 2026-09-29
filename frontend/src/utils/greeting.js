// ============================================================
// Saudação da tela inicial pelo horário local.
//
// Madrugada (0h–4h59) conta como noite: quem abre o sistema às 2h
// ainda está "de noite", não "de dia".
// ============================================================

export function greetingForHour(hour) {
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function greetingFor(name, now = new Date()) {
  return `${greetingForHour(now.getHours())}, ${name || 'profissional'}`;
}
