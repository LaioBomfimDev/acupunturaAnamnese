// Catálogo único dos tipos de atendimento (campo "Tipo" da Agenda, valores
// do Financeiro, pacotes, repasses e Convênios). Sem dependências: a Agenda
// renderiza partes isoladas nos testes e o financeiro importa daqui.
//
// Banco: appointment_type_fits_area / appointment_types_fit_area
// (20261104b_valores_servicos_por_area.sql). Mudou um, muda o outro.
//   * Os sete tipos gerais valem em qualquer área (histórico e Agenda).
//   * Os oito tipos de 04/11/2026 valem só nas áreas abaixo.

/** Nome geral, sem área: listas que misturam áreas e linhas antigas. */
// Em ordem alfabética do rótulo, como aparece no campo "Tipo".
export const APPOINTMENT_TYPES = [
  { id: 'anamnesis', label: 'Anamnese' },
  { id: 'auriculotherapy', label: 'Auriculoterapia' },
  { id: 'evaluation', label: 'Avaliação' },
  { id: 'vascular_biomodulation', label: 'Biomodulação vascular' },
  { id: 'feedback', label: 'Devolutiva' },
  { id: 'e_ilib', label: 'e-ILIB' },
  { id: 'interview', label: 'Entrevista' },
  { id: 'laserpuncture', label: 'Laserpuntura' },
  { id: 'neuromodulation', label: 'Neuromodulação' },
  { id: 'first_visit', label: 'Primeira vez' },
  { id: 'return', label: 'Retorno' },
  { id: 'session', label: 'Sessão' },
  { id: 'cupping', label: 'Ventosa' },
  { id: 'home_visit', label: 'Visita domiciliar' },
  { id: 'school_visit', label: 'Visita escolar' },
];

export const APPOINTMENT_TYPE_IDS = APPOINTMENT_TYPES.map(item => item.id);

/** Tipos anteriores a 04/11/2026: seguem válidos em qualquer área. */
export const GENERAL_APPOINTMENT_TYPE_IDS = ['first_visit', 'return', 'evaluation', 'anamnesis', 'session', 'feedback', 'interview'];

// e-ILIB é a mesma biomodulação vascular (decisão da administradora,
// 10/11/2026): um nome só, "Biomodulação vascular (e-ILIB)". O tipo
// e_ilib segue aceito no banco (histórico), mas não é mais oferecido.
const ADJUNCT_SERVICES = [
  { id: 'neuromodulation', label: 'Neuromodulação' },
  { id: 'vascular_biomodulation', label: 'Biomodulação vascular (e-ILIB)' },
  { id: 'e_ilib', label: 'e-ILIB', retired: true },
];

/** Serviços de cada área, com o nome daquela área ("anamnesis" e
 * "evaluation" mudam de nome conforme a área). */
export const SERVICES_BY_AREA = {
  acupuntura: [
    { id: 'anamnesis', label: 'Avaliação inicial (anamnese)' },
    { id: 'session', label: 'Sessão de acupuntura' },
    { id: 'auriculotherapy', label: 'Sessão de auriculoterapia' },
    { id: 'laserpuncture', label: 'Sessão de laserpuntura' },
    { id: 'cupping', label: 'Sessão de ventosa' },
  ],
  fisioterapia: [
    { id: 'anamnesis', label: 'Anamnese' },
    { id: 'session', label: 'Sessão' },
    { id: 'evaluation', label: 'Avaliação' },
    ...ADJUNCT_SERVICES,
  ],
  psicologia: [
    { id: 'anamnesis', label: 'Anamnese' },
    { id: 'session', label: 'Sessão' },
    { id: 'evaluation', label: 'Avaliação psicológica' },
    ...ADJUNCT_SERVICES,
  ],
  nutricao: [
    { id: 'anamnesis', label: 'Anamnese' },
    { id: 'return', label: 'Retorno' },
    { id: 'session', label: 'Sessão' },
  ],
  neuropsicologia: [
    { id: 'evaluation', label: 'Avaliação neuropsicológica' },
  ],
  aba: [
    { id: 'evaluation', label: 'Avaliação' },
    { id: 'home_visit', label: 'Visita domiciliar' },
    { id: 'school_visit', label: 'Visita escolar' },
    { id: 'session', label: 'Sessão' },
  ],
};

/** Mesma conta de appointment_type_fits_area no banco. */
export function isTypeAllowedInArea(discipline, type) {
  if (!type) return true;
  if (GENERAL_APPOINTMENT_TYPE_IDS.includes(type)) return true;
  return Boolean(SERVICES_BY_AREA[discipline]?.some(service => service.id === type));
}

/** Nome do tipo na área (quando a área é conhecida), senão o geral. */
export function appointmentTypeLabel(type, discipline = null) {
  if (!type) return 'Sem tipo';
  const own = discipline ? SERVICES_BY_AREA[discipline]?.find(service => service.id === type) : null;
  return own?.label || APPOINTMENT_TYPES.find(item => item.id === type)?.label || 'Sem tipo';
}

/** Opções do campo "Tipo" da Agenda: os serviços da área primeiro, depois
 * os tipos gerais que a área ainda aceita. O tipo já gravado nunca some. */
export function appointmentTypeGroups(discipline, current = '') {
  const all = SERVICES_BY_AREA[discipline] || [];
  const ownIds = new Set(all.map(service => service.id));
  const own = all.filter(service => !service.retired);
  const others = APPOINTMENT_TYPES
    .filter(item => !ownIds.has(item.id) && isTypeAllowedInArea(discipline, item.id))
    .map(item => ({ id: item.id, label: item.label }));
  const groups = [];
  if (own.length) groups.push({ label: 'Serviços da área', options: own });
  if (others.length) groups.push({ label: 'Outros tipos', options: others });
  if (current && !groups.some(group => group.options.some(option => option.id === current))) {
    groups.push({ label: 'Tipo anterior', options: [{ id: current, label: appointmentTypeLabel(current, discipline), legacy: true }] });
  }
  return groups;
}

/** Trocar a área limpa só o tipo que a área nova não aceita. */
export function typeAfterAreaChange(type, discipline) {
  return isTypeAllowedInArea(discipline, type) ? type : '';
}
