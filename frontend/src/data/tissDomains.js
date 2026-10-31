// ============================================================
// Domínios do Padrão TISS que a tela escolhe sem buscar no banco.
// Fonte: planilha oficial "TUSS - Demais terminologias - VERSÃO 202607"
// (tabelas 26 e 59), as mesmas linhas carregadas em tiss_terms por
// 20261031b_tiss_terms_202607.sql. Siglas de UF do mesmo arquivo.
// Versão nova da ANS: confira estas listas contra a tabela nova.
// ============================================================

export const TISS_SOURCE_VERSION = '202607';

/** Tabela 26: conselho profissional (código, sigla, nome oficial). */
export const TISS_COUNCILS = [
  { code: '01', short: 'CRESS', label: 'Conselho Regional de Serviço Social (CRESS)' },
  { code: '02', short: 'COREN', label: 'Conselho Regional de Enfermagem (COREN)' },
  { code: '03', short: 'CRF', label: 'Conselho Regional de Farmácia (CRF)' },
  { code: '04', short: 'CREFONO', label: 'Conselho Regional de Fonoaudiologia (CREFONO)' },
  { code: '05', short: 'CREFITO', label: 'Conselho Regional de Fisioterapia e Terapia Ocupacional (CREFITO)' },
  { code: '06', short: 'CRM', label: 'Conselho Regional de Medicina (CRM)' },
  { code: '07', short: 'CRN', label: 'Conselho Regional de Nutrição (CRN)' },
  { code: '08', short: 'CRO', label: 'Conselho Regional de Odontologia (CRO)' },
  { code: '09', short: 'CRP', label: 'Conselho Regional de Psicologia (CRP)' },
  { code: '10', short: 'Outro', label: 'Outros Conselhos' },
  { code: '11', short: 'CRBio', label: 'Conselho Regional de Biologia (CRBio)' },
  { code: '12', short: 'CRBM', label: 'Conselho Regional de Biomedicina (CRBM)' },
  { code: '13', short: 'CREF', label: 'Conselho Regional de Educação Física (CREF)' },
  { code: '14', short: 'CRMV', label: 'Conselho Regional de Medicina Veterinária (CRMV)' },
  { code: '15', short: 'CRTR', label: 'Conselho Regional de Técnicos em Radiologia (CRTR)' },
];

/** Tabela 59: unidade da federação pelo código do IBGE. */
export const TISS_UFS = [
  { code: '11', uf: 'RO', label: 'Rondônia' },
  { code: '12', uf: 'AC', label: 'Acre' },
  { code: '13', uf: 'AM', label: 'Amazonas' },
  { code: '14', uf: 'RR', label: 'Roraima' },
  { code: '15', uf: 'PA', label: 'Pará' },
  { code: '16', uf: 'AP', label: 'Amapá' },
  { code: '17', uf: 'TO', label: 'Tocantins' },
  { code: '21', uf: 'MA', label: 'Maranhão' },
  { code: '22', uf: 'PI', label: 'Piauí' },
  { code: '23', uf: 'CE', label: 'Ceará' },
  { code: '24', uf: 'RN', label: 'Rio Grande do Norte' },
  { code: '25', uf: 'PB', label: 'Paraíba' },
  { code: '26', uf: 'PE', label: 'Pernambuco' },
  { code: '27', uf: 'AL', label: 'Alagoas' },
  { code: '28', uf: 'SE', label: 'Sergipe' },
  { code: '29', uf: 'BA', label: 'Bahia' },
  { code: '31', uf: 'MG', label: 'Minas Gerais' },
  { code: '32', uf: 'ES', label: 'Espírito Santo' },
  { code: '33', uf: 'RJ', label: 'Rio de Janeiro' },
  { code: '35', uf: 'SP', label: 'São Paulo' },
  { code: '41', uf: 'PR', label: 'Paraná' },
  { code: '42', uf: 'SC', label: 'Santa Catarina' },
  { code: '43', uf: 'RS', label: 'Rio Grande do Sul' },
  { code: '50', uf: 'MS', label: 'Mato Grosso do Sul' },
  { code: '51', uf: 'MT', label: 'Mato Grosso' },
  { code: '52', uf: 'GO', label: 'Goiás' },
  { code: '53', uf: 'DF', label: 'Distrito Federal' },
  { code: '98', uf: 'EX', label: 'Países Estrangeiros' },
];

// Sugestão a partir da profissão do cadastro (data/professionalCouncils.js):
// só preenche o que está vazio, a administração confere.
export const COUNCIL_BY_PROFESSION = {
  psicologo: '09',
  fisioterapeuta: '05',
  terapeuta_ocupacional: '05',
  nutricionista: '07',
  fonoaudiologo: '04',
  medico: '06',
  psiquiatra: '06',
  enfermeiro: '02',
  dentista: '08',
};

// CBO (tabela 24) conferido na planilha 202607.
export const CBO_BY_PROFESSION = {
  psicologo: '251510',
  fisioterapeuta: '223605',
  terapeuta_ocupacional: '223905',
  nutricionista: '223710',
  fonoaudiologo: '223810',
};

export function councilShort(code) {
  return TISS_COUNCILS.find(row => row.code === code)?.short || '';
}

export function ufSigla(code) {
  return TISS_UFS.find(row => row.code === code)?.uf || '';
}
