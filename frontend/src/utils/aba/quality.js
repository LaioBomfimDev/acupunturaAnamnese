// ============================================================
// Qualidade da coleta ABA: fidelidade de aplicação, concordância entre
// observadores (IOA) e alertas. Trazido do Atlas (App.tsx FidelitySection,
// IoaPanel e os tipos de ClinicalAlert).
//
// O banco guarda só os códigos dos itens de fidelidade e calcula o % da
// fidelidade e do IOA (20261101c_aba_qualidade.sql). Aqui ficam os rótulos
// e a prévia que a tela mostra enquanto a pessoa marca — a mesma conta do
// banco (aba_ioa_agreement), para a prévia nunca discordar do salvo.
// ============================================================

/** Mínimo aceitável de fidelidade e de concordância (Manual, cap. 10-12). */
export const QUALITY_MINIMUM = 80;

export const FIDELITY_SOURCES = {
  autoavaliacao: {
    label: 'Autoavaliação de quem atendeu',
    short: 'Autoavaliação',
    items: [
      { key: 'preparo', label: 'Preparei materiais e programas antes do atendimento' },
      { key: 'ajuda', label: 'Apliquei a ajuda conforme o protocolo do programa' },
      { key: 'reforco', label: 'Entreguei o reforço conforme previsto no programa' },
      { key: 'registro', label: 'Registrei os dados durante a sessão, não de memória' },
      { key: 'assentimento', label: 'Respeitei sinais de recusa e de retirada de assentimento' },
    ],
  },
  supervisao: {
    label: 'Fidelidade da supervisão',
    short: 'Supervisão',
    items: [
      { key: 'procedimento', label: 'Procedimento aplicado conforme o protocolo' },
      { key: 'ajuda_reforco', label: 'Ajuda e reforço dentro do previsto' },
      { key: 'coleta', label: 'Coleta de dados fiel ao observado' },
      { key: 'seguranca', label: 'Segurança e assentimento respeitados' },
      { key: 'registro_clinico', label: 'Registro clínico coerente com os dados' },
    ],
  },
};

/** Itens prontos para marcar: os já salvos, ou a lista nova (nada cumprido). */
export function fidelityDraft(source, saved = null) {
  return FIDELITY_SOURCES[source].items.map(item => {
    const prior = saved?.items?.find(entry => entry.key === item.key);
    return {
      key: item.key,
      label: item.label,
      met: prior ? prior.met === true && prior.applicable !== false : false,
      applicable: prior ? prior.applicable !== false : true,
    };
  });
}

/** Cumpridos ÷ aplicáveis. Sem item aplicável não há nota (o banco recusa). */
export function fidelityScore(items) {
  const applicable = items.filter(item => item.applicable !== false);
  const met = applicable.filter(item => item.met === true);
  return {
    applicable: applicable.length,
    met: met.length,
    percentage: applicable.length ? Math.round((met.length / applicable.length) * 100) : null,
  };
}

export const IOA_METHODS = [
  { value: 'tentativa_por_tentativa', label: 'Tentativa por tentativa', primaryLabel: 'Tentativas com acordo', secondaryLabel: 'Total de tentativas', kind: 'ratio' },
  { value: 'intervalo_por_intervalo', label: 'Intervalo por intervalo', primaryLabel: 'Intervalos com acordo', secondaryLabel: 'Total de intervalos', kind: 'ratio' },
  { value: 'contagem_total', label: 'Contagem total', primaryLabel: 'Total do observador A', secondaryLabel: 'Total do observador B', kind: 'smaller_larger' },
  { value: 'duracao_latencia', label: 'Duração ou latência', primaryLabel: 'Segundos do observador A', secondaryLabel: 'Segundos do observador B', kind: 'smaller_larger' },
];

export const ioaMethod = value => IOA_METHODS.find(method => method.value === value) || IOA_METHODS[0];

/**
 * Concordância pelo método (Manual pág. 144), igual a aba_ioa_agreement:
 * contagem e duração = menor ÷ maior; tentativa e intervalo = acordos ÷
 * oportunidades. Devolve { value } ou { error } com a mesma frase do banco.
 */
export function ioaAgreement(method, primary, secondary) {
  const first = Number(primary);
  const second = Number(secondary);
  if (primary === '' || secondary === '' || primary == null || secondary == null
    || !Number.isFinite(first) || !Number.isFinite(second) || first < 0 || second < 0) {
    return { error: 'Informe os dois valores (zero ou mais).' };
  }
  const round2 = value => Math.round(value * 100) / 100;
  if (ioaMethod(method).kind === 'smaller_larger') {
    const larger = Math.max(first, second);
    return { value: larger === 0 ? 100 : round2((Math.min(first, second) / larger) * 100) };
  }
  if (second === 0) return { error: 'Informe quantas oportunidades houve (mais que zero).' };
  if (first > second) return { error: 'Os acordos não podem passar das oportunidades.' };
  return { value: round2((first / second) * 100) };
}

const mean = values => (values.length
  ? Math.round(values.reduce((total, value) => total + value, 0) / values.length)
  : null);

/** Médias de fidelidade por origem e quantas sessões ficaram abaixo do mínimo. */
export function summarizeFidelity(fidelity) {
  const bySource = source => fidelity.filter(entry => entry.source === source);
  const self = bySource('autoavaliacao');
  const supervision = bySource('supervisao');
  return {
    selfMean: mean(self.map(entry => entry.scorePercentage)),
    supervisionMean: mean(supervision.map(entry => entry.scorePercentage)),
    selfCount: self.length,
    supervisionCount: supervision.length,
    belowMinimum: supervision.filter(entry => entry.scorePercentage < QUALITY_MINIMUM).length,
  };
}

export function summarizeIoa(records) {
  return {
    count: records.length,
    mean: mean(records.map(record => record.agreementPercentage)),
    belowMinimum: records.filter(record => record.agreementPercentage < QUALITY_MINIMUM).length,
  };
}

// ---------- alertas ----------

export const ALERT_TYPES = {
  programa_sem_coleta: { label: 'Programa sem coleta', tab: 'Programas' },
  baixa_evolucao: { label: 'Baixa evolução', tab: 'Resultados' },
  criterio_atingido: { label: 'Critério atingido', tab: 'Resultados' },
  aumento_comportamento: { label: 'Aumento de comportamento', tab: 'Resultados' },
  novo_comportamento: { label: 'Comportamento novo', tab: 'Repertório' },
  perda_eficiencia: { label: 'Reforçador perdendo efeito', tab: 'Repertório' },
  situacao_risco: { label: 'Situação de risco', tab: 'Sessões' },
  revisao_pendente: { label: 'Revisão pendente', tab: 'Sessões' },
  correcao_atrasada: { label: 'Correção atrasada', tab: 'Sessões' },
  fidelidade_baixa: { label: 'Fidelidade baixa', tab: 'Qualidade' },
  concordancia_baixa: { label: 'Concordância baixa', tab: 'Qualidade' },
};

export const alertTypeLabel = type => ALERT_TYPES[type]?.label || 'Alerta';

/** Tela da área ABA onde se resolve o alerta (abre no paciente certo). */
export const alertTargetTab = type => ALERT_TYPES[type]?.tab || 'Painel';

export const ALERT_PRIORITIES = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Média',
  baixa: 'Baixa',
};

export const alertPriorityLabel = priority => ALERT_PRIORITIES[priority] || 'Média';

export const ALERT_STATUSES = {
  open: 'Aberto',
  dismissed: 'Dispensado',
  resolved: 'Resolvido',
};

export const alertStatusLabel = status => ALERT_STATUSES[status] || 'Aberto';

/** Contagem por prioridade dos alertas abertos (o resumo no topo da tela). */
export function countOpenAlerts(alerts) {
  const open = alerts.filter(alert => alert.status === 'open');
  return {
    total: open.length,
    critica: open.filter(alert => alert.priority === 'critica').length,
    alta: open.filter(alert => alert.priority === 'alta').length,
    media: open.filter(alert => alert.priority === 'media').length,
    baixa: open.filter(alert => alert.priority === 'baixa').length,
  };
}
