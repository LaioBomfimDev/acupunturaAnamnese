export function getReportSessionInfo(evolucoes) {
  const registeredSessionCount = Array.isArray(evolucoes) ? evolucoes.length : 0;
  const reportSessionNumber = registeredSessionCount === 0 ? 0 : registeredSessionCount + 1;

  return {
    registeredSessionCount,
    reportSessionNumber,
    label: reportSessionNumber === 0 ? 'Avaliação inicial' : `${reportSessionNumber}ª sessão`,
  };
}

export function formatRegisteredSessionCount(count) {
  if (count <= 0) return '';
  return count === 1 ? '1 sessão registrada' : `${count} sessões registradas`;
}

function cleanContactValue(value) {
  return String(value || '').trim();
}

export function buildReportContactItems({ clinic = null, therapistProfile = null } = {}) {
  const phone = cleanContactValue(clinic?.phone) || cleanContactValue(therapistProfile?.phone);
  const address = cleanContactValue(clinic?.address);

  return [
    {
      id: 'phone',
      label: 'Telefone',
      value: phone || 'Telefone não informado',
    },
    {
      id: 'address',
      label: 'Endereço',
      value: address || 'Endereço não informado',
    },
  ];
}

function normalizeHexColor(value, fallback) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toUpperCase();
  if (/^[0-9a-fA-F]{6}$/.test(text)) return `#${text.toUpperCase()}`;
  return fallback;
}

function blendHexColor(hexColor, targetHexColor, ratio) {
  const source = normalizeHexColor(hexColor, '#0E2A4A').slice(1);
  const target = normalizeHexColor(targetHexColor, '#000000').slice(1);
  const amount = Math.min(1, Math.max(0, Number(ratio) || 0));

  const channels = [0, 2, 4].map(index => {
    const sourceChannel = Number.parseInt(source.slice(index, index + 2), 16);
    const targetChannel = Number.parseInt(target.slice(index, index + 2), 16);
    return Math.round(sourceChannel + ((targetChannel - sourceChannel) * amount));
  });

  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export function buildReportAccentPalette(brandColor, fallback = '#0E2A4A') {
  const accent = normalizeHexColor(brandColor, fallback);

  return {
    accent,
    shade: blendHexColor(accent, '#000000', 0.34),
    soft: blendHexColor(accent, '#FFFFFF', 0.42),
  };
}
