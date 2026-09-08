// ============================================================
// WhatsApp — link de conversa (wa.me), não integração de API
//
// Sem provedor pago: isto só monta um link que abre o WhatsApp do
// PRÓPRIO profissional/recepção com a mensagem pronta. Quem manda é
// gente, não um serviço automatizado — decisão do usuário ao ver que
// API paga (Twilio/Meta/Z-API) trazia custo mensal e risco de
// banimento sem necessidade real.
// ============================================================

/**
 * Telefone digitado livre (com ou sem DDD/DDI, com ou sem pontuação) →
 * só dígitos, com o 55 do Brasil na frente. wa.me exige o código do
 * país; sem isso o link abre o WhatsApp sem conversa nenhuma selecionada.
 */
export function normalizeWhatsAppPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function isLikelyValidWhatsAppPhone(phone) {
  const digits = normalizeWhatsAppPhone(phone);
  // 55 + DDD (2) + número (8 ou 9) = 12 ou 13 dígitos.
  return digits.length === 12 || digits.length === 13;
}

export function buildWhatsAppLink({ phone, message }) {
  const digits = normalizeWhatsAppPhone(phone);
  const text = encodeURIComponent(message || '');
  return `https://wa.me/${digits}${text ? `?text=${text}` : ''}`;
}
