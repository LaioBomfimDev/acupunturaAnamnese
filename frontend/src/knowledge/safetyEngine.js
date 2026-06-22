import { displayPointCode, normalizePointCode } from './aliases';

function hasAny(values, patterns) {
  const text = values.join(' ');
  return patterns.some(pattern => new RegExp(pattern, 'i').test(text));
}

function protocolHasPoint(protocol, codes) {
  const protocolCodes = (protocol?.bodyCodes || protocol?.body || []).map(normalizePointCode);
  return codes.some(code => protocolCodes.includes(normalizePointCode(code)));
}

function makeAlert(severity, title, message, ruleId) {
  return { severity, title, message, ruleId };
}

export function evaluateSafety({ safetyFlags = [], clinicalText = '', protocol = {} }) {
  const alerts = [];
  const values = [...safetyFlags, clinicalText || ''];

  if (hasAny(values, ['gesta', 'gravid']) && protocolHasPoint(protocol, ['SP6', 'LI4'])) {
    const risky = ['SP6', 'LI4']
      .filter(code => protocolHasPoint(protocol, [code]))
      .map(displayPointCode)
      .join(', ');
    alerts.push(makeAlert(
      'high',
      'Gestação e pontos de cautela',
      `${risky} aparece no protocolo. Exigir validação profissional, indicação formal e registro da decisão clínica antes de aplicar.`,
      'pregnancy-sp6-li4',
    ));
  }

  if (hasAny(values, ['febre', 'infec', 'calor exuberante', 'inflama']) && (protocol?.moxa || []).length) {
    alerts.push(makeAlert(
      'high',
      'Moxa com sinais de calor/febre',
      'Moxaterapia deve ser evitada ou revista quando houver calor exuberante, febre, inflamação aguda ou infecção.',
      'moxa-heat-fever',
    ));
  }

  if (hasAny(values, ['anticoagulante', 'fragilidade vascular', 'feridas locais'])) {
    alerts.push(makeAlert(
      'medium',
      'Ventosa e integridade tecidual',
      'Ajustar ou evitar ventosa em anticoagulantes, fragilidade vascular, feridas locais ou pele sensível.',
      'cupping-anticoagulant-skin',
    ));
  }

  if (hasAny(values, ['dist[úu]rbio de coagula[cç][ãa]o', 'coagulopatia', 'sangramento f[áa]cil'])) {
    alerts.push(makeAlert(
      'high',
      'Risco de sangramento',
      'Revisar o risco de sangramento e a indicação de técnicas invasivas antes de prosseguir; registrar a decisão clínica da profissional.',
      'coagulation-risk',
    ));
  }

  if (hasAny(values, ['perda de peso n[ãa]o intencional', 'emagrecimento sem querer'])) {
    alerts.push(makeAlert(
      'high',
      'Perda de peso não intencional',
      'Investigar o contexto clínico e considerar avaliação médica antes de definir ou manter a conduta terapêutica.',
      'unintended-weight-loss',
    ));
  }

  if (hasAny(values, ['desmaio recente', 'sincope recente'])) {
    alerts.push(makeAlert(
      'high',
      'Desmaio recente',
      'Revisar a causa do episódio, a segurança da posição durante o atendimento e a necessidade de avaliação médica antes de prosseguir.',
      'recent-fainting',
    ));
  }

  if (hasAny(values, ['queda recente', 'trauma recente'])) {
    alerts.push(makeAlert(
      'high',
      'Queda ou trauma recente',
      'Verificar lesão aguda, sinais neurológicos e necessidade de avaliação apropriada antes de aplicar técnicas locais.',
      'recent-trauma',
    ));
  }

  if (hasAny(values, ['cirurgia recente'])) {
    alerts.push(makeAlert(
      'high',
      'Cirurgia recente',
      'Confirmar fase de recuperação, integridade tecidual e orientações da equipe responsável antes de qualquer intervenção.',
      'recent-surgery',
    ));
  }

  if (hasAny(values, ['hist[óo]rico de c[âa]ncer', 'neoplasia'])) {
    alerts.push(makeAlert(
      'medium',
      'Histórico de câncer',
      'Registrar o contexto oncológico e alinhar a conduta ao acompanhamento em saúde existente; este sinal não define diagnóstico nem contraindicação isoladamente.',
      'cancer-history',
    ));
  }

  if (hasAny(values, ['marcapasso']) && (protocol?.eletro || []).length) {
    alerts.push(makeAlert(
      'high',
      'Eletroacupuntura e marcapasso',
      'Evitar eletroacupuntura sem liberação profissional específica quando houver marcapasso/dispositivo implantável.',
      'electro-pacemaker',
    ));
  }

  if (hasAny(values, ['epilepsia']) && (protocol?.eletro || []).length) {
    alerts.push(makeAlert(
      'medium',
      'Eletroacupuntura e epilepsia',
      'Revisar intensidade, frequência e necessidade de eletroestimulação em pacientes com epilepsia.',
      'electro-epilepsy',
    ));
  }

  if (protocolHasPoint(protocol, ['GB20'])) {
    alerts.push(makeAlert(
      'medium',
      'Região cervical profunda',
      'GB20/VB20 exige domínio anatômico e técnica segura; evitar agulhamento profundo inadequado.',
      'gb20-depth',
    ));
  }

  return alerts;
}
