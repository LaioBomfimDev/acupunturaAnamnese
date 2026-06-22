// ============================================================
// Profissões da clínica + conselhos profissionais
// O sistema deixou de ser exclusivo de acupuntura: o SuperAdm
// escolhe a profissão (fisioterapeuta, psicólogo, psiquiatra,
// nutricionista...) e o formulário se adapta — rótulo do registro,
// dica de formato e link para o portal oficial do conselho, onde a
// existência do registro pode ser conferida manualmente.
//
// Importante: não existe API pública unificada dos conselhos
// (cada um tem seu portal, muitos com captcha). Por isso a
// "verificação" é um atalho para a consulta oficial, não um
// raspador automático que quebraria em silêncio.
// ============================================================

export const PROFESSIONS = [
  {
    value: 'acupunturista',
    label: 'Acupunturista',
    council: '',
    registrationLabel: 'Registro / associação',
    registrationPlaceholder: 'Registro de origem ou associação (ABA, SOBRAFISA...)',
    verifyUrl: '',
    note: 'A acupuntura não possui conselho único. Confira pela profissão de origem ou pela associação informada.',
  },
  {
    value: 'fisioterapeuta',
    label: 'Fisioterapeuta',
    council: 'CREFITO',
    registrationLabel: 'Registro no CREFITO',
    registrationPlaceholder: 'Ex.: CREFITO-3 123456-F',
    verifyUrl: 'https://www.coffito.gov.br/',
  },
  {
    value: 'terapeuta_ocupacional',
    label: 'Terapeuta ocupacional',
    council: 'CREFITO',
    registrationLabel: 'Registro no CREFITO',
    registrationPlaceholder: 'Ex.: CREFITO-3 12345-TO',
    verifyUrl: 'https://www.coffito.gov.br/',
  },
  {
    value: 'psicologo',
    label: 'Psicólogo(a)',
    council: 'CRP',
    registrationLabel: 'Registro no CRP',
    registrationPlaceholder: 'Ex.: CRP 06/123456',
    verifyUrl: 'https://cadastro.cfp.org.br/',
  },
  {
    value: 'psiquiatra',
    label: 'Psiquiatra',
    council: 'CRM',
    registrationLabel: 'Registro no CRM',
    registrationPlaceholder: 'Ex.: CRM/SP 123456',
    verifyUrl: 'https://portal.cfm.org.br/busca-medicos/',
  },
  {
    value: 'medico',
    label: 'Médico(a)',
    council: 'CRM',
    registrationLabel: 'Registro no CRM',
    registrationPlaceholder: 'Ex.: CRM/SP 123456',
    verifyUrl: 'https://portal.cfm.org.br/busca-medicos/',
  },
  {
    value: 'nutricionista',
    label: 'Nutricionista',
    council: 'CRN',
    registrationLabel: 'Registro no CRN',
    registrationPlaceholder: 'Ex.: CRN-3 12345',
    verifyUrl: 'https://www.cfn.org.br/',
  },
  {
    value: 'enfermeiro',
    label: 'Enfermeiro(a)',
    council: 'COREN',
    registrationLabel: 'Registro no COREN',
    registrationPlaceholder: 'Ex.: COREN-SP 123456',
    verifyUrl: 'https://www.cofen.gov.br/',
  },
  {
    value: 'fonoaudiologo',
    label: 'Fonoaudiólogo(a)',
    council: 'CRFa',
    registrationLabel: 'Registro no CRFa',
    registrationPlaceholder: 'Ex.: CRFa 2-12345',
    verifyUrl: 'https://www.fonoaudiologia.org.br/',
  },
  {
    value: 'dentista',
    label: 'Cirurgião-dentista',
    council: 'CRO',
    registrationLabel: 'Registro no CRO',
    registrationPlaceholder: 'Ex.: CRO-SP 12345',
    verifyUrl: 'https://website.cfo.org.br/',
  },
  {
    value: 'outro',
    label: 'Outro',
    council: '',
    registrationLabel: 'Registro profissional',
    registrationPlaceholder: 'Registro ou conselho',
    verifyUrl: '',
  },
];

const DEFAULT_PROFESSION = {
  value: '',
  label: '',
  council: '',
  registrationLabel: 'Registro profissional',
  registrationPlaceholder: 'Registro ou conselho',
  verifyUrl: '',
};

// Resolve a profissão escolhida; quando vazia/desconhecida devolve um
// padrão neutro para o formulário continuar funcionando.
export function getProfession(value) {
  return PROFESSIONS.find(item => item.value === value) || DEFAULT_PROFESSION;
}

// "Especialidades" são guardadas como texto único (compatível com a
// coluna specialty), mas editadas como lista. parse/join convertem
// entre os dois formatos sem perder espaços internos de cada item.
export function parseSpecialties(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

export function joinSpecialties(list) {
  return (Array.isArray(list) ? list : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join(', ');
}

// Acrescenta uma especialidade ignorando duplicatas (case-insensitive)
// e devolve sempre a string normalizada para gravar no formulário.
export function addSpecialty(value, item) {
  const next = String(item || '').trim();
  const list = parseSpecialties(value);
  if (!next) return joinSpecialties(list);
  const exists = list.some(existing => existing.toLowerCase() === next.toLowerCase());
  if (exists) return joinSpecialties(list);
  return joinSpecialties([...list, next]);
}

export function removeSpecialtyAt(value, index) {
  const list = parseSpecialties(value);
  return joinSpecialties(list.filter((_, idx) => idx !== index));
}
