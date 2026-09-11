// ============================================================
// SERVICE: Busca de endereço por CEP (ViaCEP, sem chave)
//
// Só SUGERE — logradouro/bairro/cidade/UF continuam 100% editáveis no
// formulário. Em cidades pequenas (Catu, Pojuca...) é comum um único
// CEP cobrir a cidade inteira, sem distinguir rua/bairro; a API então
// devolve logradouro/bairro vazios, e a pessoa preenche à mão.
// ============================================================

export function normalizeCep(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 8);
}

export function formatCep(value) {
  const digits = normalizeCep(value);
  if (digits.length !== 8) return value || '';
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

export function isValidCepFormat(value) {
  return normalizeCep(value).length === 8;
}

/**
 * @returns {Promise<{logradouro: string, bairro: string, localidade: string, uf: string} | null>}
 *   null quando o CEP não existe (ViaCEP responde { erro: true }) — não é
 *   uma falha de rede, é "esse CEP não foi encontrado", tratado como
 *   ausência de sugestão, não como erro pro usuário.
 */
export async function buscarEnderecoPorCep(cep) {
  const digits = normalizeCep(cep);
  if (digits.length !== 8) {
    throw new Error('CEP inválido. Digite os 8 números do CEP.');
  }

  let response;
  try {
    response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  } catch {
    throw new Error('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
  }

  if (!response.ok) {
    throw new Error('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
  }

  const data = await response.json();
  if (data?.erro) return null;

  return {
    logradouro: data.logradouro || '',
    bairro: data.bairro || '',
    localidade: data.localidade || '',
    uf: data.uf || '',
  };
}
