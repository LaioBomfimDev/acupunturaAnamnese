const PLACEHOLDER_PATTERN = /^(?:\.{3}|changeme|replace[-_ ]?me|your[-_ ].*|<.*>)$/i;

function jwtRole(value) {
  const parts = String(value || '').split('.');
  if (parts.length !== 3 || typeof globalThis.atob !== 'function') return '';

  try {
    const normalized = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=');
    return String(JSON.parse(globalThis.atob(normalized))?.role || '');
  } catch {
    return '';
  }
}

export function validateSupabasePublicConfig({
  supabaseUrl,
  supabaseAnonKey,
  production = false,
} = {}) {
  const url = String(supabaseUrl || '').trim();
  const anonKey = String(supabaseAnonKey || '').trim();
  const issues = [];
  let urlValid = false;
  let anonKeyValid = false;

  if (!url) {
    issues.push('VITE_SUPABASE_URL não está configurada.');
  } else if (PLACEHOLDER_PATTERN.test(url)) {
    issues.push('VITE_SUPABASE_URL ainda contém um valor de exemplo.');
  } else {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        issues.push('VITE_SUPABASE_URL deve usar HTTP ou HTTPS.');
      } else if (production && parsed.protocol !== 'https:') {
        issues.push('VITE_SUPABASE_URL deve usar HTTPS em produção.');
      } else if (parsed.username || parsed.password) {
        issues.push('VITE_SUPABASE_URL não pode conter credenciais.');
      } else if (parsed.hostname.toLowerCase() === 'api.supabase.com') {
        issues.push('VITE_SUPABASE_URL deve apontar para o projeto, não para api.supabase.com.');
      } else {
        urlValid = true;
      }
    } catch {
      issues.push('VITE_SUPABASE_URL não é uma URL válida.');
    }
  }

  if (!anonKey) {
    issues.push('VITE_SUPABASE_ANON_KEY não está configurada.');
  } else if (PLACEHOLDER_PATTERN.test(anonKey)) {
    issues.push('VITE_SUPABASE_ANON_KEY ainda contém um valor de exemplo.');
  } else if (/^sb_(?:secret|service_role)_/i.test(anonKey) || jwtRole(anonKey) === 'service_role') {
    issues.push('VITE_SUPABASE_ANON_KEY não pode conter uma chave secreta ou service role.');
  } else if (anonKey.length < 20) {
    issues.push('VITE_SUPABASE_ANON_KEY não possui um formato válido.');
  } else {
    anonKeyValid = true;
  }

  return {
    ok: issues.length === 0,
    issues,
    url,
    anonKey,
    urlValid,
    anonKeyValid,
  };
}

export function assertSupabasePublicConfig(config, context = 'Configuração Supabase inválida') {
  const result = validateSupabasePublicConfig(config);
  if (!result.ok) {
    throw new Error(`${context}: ${result.issues.join(' ')}`);
  }
  return result;
}
