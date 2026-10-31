// ============================================================
// ABA: banco ↔ tela.
// O banco guarda códigos (em_ensino, frequencia, sensorial…) e o texto
// livre cifrado; a tela e o motor de cálculo (calculations.js, trazido do
// Atlas) trabalham com os rótulos ("Em ensino", "frequência", "Sensorial")
// e com o mesmo formato de objeto do Atlas. Esta é a única ponte entre os
// dois — mudar um código aqui sem mudar o CHECK de
// 20261101b_aba_coleta.sql quebra tests/regression/aba-catalog.test.mjs.
// ============================================================

const invert = map => Object.fromEntries(Object.entries(map).map(([key, value]) => [value, key]));

export const PROGRAM_STATUS_FROM_DB = {
  planejado: 'Planejado',
  em_ensino: 'Em ensino',
  criterio_atingido_na_sessao: 'Critério atingido na sessão',
  aquisicao: 'Aquisição',
  generalizacao: 'Generalização',
  manutencao: 'Manutenção',
  concluido: 'Concluído',
  pausado: 'Pausado',
  extinto: 'Extinto',
};
export const PROGRAM_STATUS_TO_DB = invert(PROGRAM_STATUS_FROM_DB);
export const PROGRAM_STATUSES = Object.values(PROGRAM_STATUS_FROM_DB);

export const MEASURE_FROM_DB = {
  frequencia: 'frequência',
  taxa: 'taxa',
  duracao: 'duração',
  latencia: 'latência',
  intensidade: 'intensidade',
  intervalo_parcial: 'intervalo parcial',
  intervalo_total: 'intervalo total',
  amostragem_momentanea: 'amostragem momentânea',
};
export const MEASURE_TO_DB = invert(MEASURE_FROM_DB);

export const LOCATION_FROM_DB = {
  clinica: 'Clínica',
  casa: 'Casa',
  escola: 'Escola',
  comunidade: 'Comunidade',
  online: 'Online',
  outro: 'Outro',
};
export const LOCATION_TO_DB = invert(LOCATION_FROM_DB);
export const SESSION_LOCATIONS = ['Clínica', 'Casa', 'Escola', 'Comunidade'];

export const REINFORCER_CATEGORY_FROM_DB = {
  social: 'Social',
  tangivel: 'Tangível',
  alimentar: 'Alimentar',
  sensorial: 'Sensorial',
  atividade: 'Atividade',
  eletronico: 'Eletrônico',
  outro: 'Outro',
};
export const REINFORCER_CATEGORY_TO_DB = invert(REINFORCER_CATEGORY_FROM_DB);
export const REINFORCER_CATEGORIES = Object.values(REINFORCER_CATEGORY_FROM_DB);

export const PREFERENCE_FROM_DB = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const PREFERENCE_TO_DB = invert(PREFERENCE_FROM_DB);
export const PREFERENCES = Object.values(PREFERENCE_FROM_DB);

export const EFFICIENCY_FROM_DB = {
  muito_eficiente: 'Muito eficiente',
  eficiente: 'Eficiente',
  parcialmente_eficiente: 'Parcialmente eficiente',
  ineficaz: 'Ineficaz',
  recusado: 'Recusado',
};
export const EFFICIENCY_TO_DB = invert(EFFICIENCY_FROM_DB);

export const SEVERITY_FROM_DB = { leve: 'Leve', moderada: 'Moderada', alta: 'Alta' };
export const SEVERITY_TO_DB = invert(SEVERITY_FROM_DB);

export const TRIAL_RESPONSE_CODES = [
  'independente', 'ajuda_verbal', 'ajuda_gestual', 'ajuda_visual', 'modelacao',
  'fisica_parcial', 'fisica_total', 'aproximada', 'erro', 'sem_resposta',
  'recusa', 'nao_aplicavel',
];
export const PHASE_CODES = ['linha_de_base', 'intervencao', 'generalizacao', 'manutencao'];
export const GENERALIZATION_CONDITION_CODES = ['pessoa', 'material', 'ambiente', 'instrucao', 'rotina', 'reforcador'];

const toMs = value => (value ? Date.parse(value) : undefined);
const toIso = value => (typeof value === 'number' && Number.isFinite(value) ? new Date(value).toISOString() : null);
const text = value => (typeof value === 'string' ? value : '');
const optional = value => (value === null || value === undefined || value === '' ? undefined : value);

/** Campos do programa que moram em `definition` (jsonb em claro). */
const DEFINITION_FIELDS = [
  'objective', 'target', 'skill', 'teachingFormat', 'promptStrategy', 'durationMinutes',
  'criterion', 'criteria', 'generalizationCriterion', 'maintenanceCriterion', 'reductionCriterion',
  'correctResponseDefinition', 'errorDefinition', 'maxPromptLevel', 'promptCeiling',
  'applicationCondition', 'promptHierarchy', 'promptFading', 'reinforcerIds', 'timeMeasure',
  'goalDirection', 'reinforcementSchedule', 'tokenEconomy', 'taskSteps', 'intensityScale',
  'intervalSeconds', 'templateTitle',
];

const DEFAULT_CRITERIA = {
  minimumPercentage: 80,
  consecutiveIndependent: 5,
  requiredSessions: 3,
  sessionsMustBeConsecutive: true,
  requiredEnvironments: 2,
  requiredTherapists: 2,
  maintenanceDays: 30,
  generalizationRule: '',
};

export function programFromDb(row) {
  const definition = row?.definition && typeof row.definition === 'object' ? row.definition : {};
  const base = {
    id: row.id,
    patientId: row.patient_id,
    therapistId: row.therapist_id || '',
    type: row.type,
    name: row.name || '',
    objective: text(definition.objective),
    target: text(definition.target),
    skill: text(definition.skill),
    teachingFormat: text(definition.teachingFormat),
    promptStrategy: text(definition.promptStrategy),
    procedure: row.procedure || '',
    collectionType: row.collection_type || (row.type === 'aquisicao' ? 'tentativas' : 'frequencia'),
    trialCount: Number(row.trial_count) || 0,
    durationMinutes: Number(definition.durationMinutes) || 0,
    criterion: text(definition.criterion),
    criteria: { ...DEFAULT_CRITERIA, ...(definition.criteria || {}) },
    generalizationCriterion: text(definition.generalizationCriterion),
    maintenanceCriterion: text(definition.maintenanceCriterion),
    reductionCriterion: optional(definition.reductionCriterion),
    correctResponseDefinition: optional(definition.correctResponseDefinition),
    errorDefinition: optional(definition.errorDefinition),
    maxPromptLevel: optional(definition.maxPromptLevel),
    promptCeiling: optional(definition.promptCeiling),
    applicationCondition: optional(definition.applicationCondition),
    promptHierarchy: Array.isArray(definition.promptHierarchy) ? definition.promptHierarchy : undefined,
    promptFading: optional(definition.promptFading),
    reinforcerIds: Array.isArray(definition.reinforcerIds) ? definition.reinforcerIds : [],
    timeMeasure: definition.timeMeasure || 'nenhuma',
    goalDirection: definition.goalDirection || (row.type === 'aquisicao' ? 'aumentar' : 'reduzir'),
    reinforcementSchedule: optional(definition.reinforcementSchedule),
    tokenEconomy: Boolean(definition.tokenEconomy),
    taskSteps: Array.isArray(definition.taskSteps) && definition.taskSteps.length ? definition.taskSteps : undefined,
    templateTitle: optional(definition.templateTitle),
    restrictedBehaviorId: optional(row.restricted_behavior_id),
    restrictedAuthorization: optional(row.restricted_authorization),
    restrictedAuthorizedBy: optional(row.restricted_authorized_by),
    restrictedAuthorizedAt: toMs(row.restricted_authorized_at),
    notes: text(row.notes),
    status: PROGRAM_STATUS_FROM_DB[row.status] || 'Em ensino',
    protocolStartDate: row.protocol_start_date || '',
    revision: Number(row.revision) || 1,
    archivedAt: toMs(row.archived_at),
    updatedAt: toMs(row.updated_at),
  };
  if (row.type === 'reducao') {
    return {
      ...base,
      measure: MEASURE_FROM_DB[row.measure] || 'frequência',
      unit: row.unit || 'ocorrências',
      intensityScale: Array.isArray(definition.intensityScale) && definition.intensityScale.length ? definition.intensityScale : undefined,
      intervalSeconds: Number(definition.intervalSeconds) || undefined,
    };
  }
  return base;
}

export function programToDb(program) {
  const definition = {};
  for (const field of DEFINITION_FIELDS) {
    const value = program[field];
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    definition[field] = value;
  }
  return {
    id: program.id,
    revision: program.revision ?? null,
    type: program.type,
    name: program.name,
    status: PROGRAM_STATUS_TO_DB[program.status] || 'em_ensino',
    collection_type: program.collectionType,
    trial_count: program.type === 'aquisicao' ? (program.taskSteps?.length || program.trialCount || 1) : null,
    measure: program.type === 'reducao' ? (MEASURE_TO_DB[program.measure] || 'frequencia') : null,
    unit: program.type === 'reducao' ? (program.unit || 'ocorrências') : null,
    procedure: program.procedure || null,
    definition,
    notes: program.notes || null,
    restricted_behavior_id: program.restrictedBehaviorId || null,
    restricted_authorization: program.restrictedAuthorization || null,
    therapist_id: program.therapistId || null,
    protocol_start_date: program.protocolStartDate || null,
  };
}

export function reinforcerFromDb(row, patientId) {
  return {
    id: row.id,
    patientId,
    name: row.name || '',
    category: REINFORCER_CATEGORY_FROM_DB[row.category] || 'Outro',
    initialPreference: PREFERENCE_FROM_DB[row.initial_preference] || 'Média',
    notes: text(row.notes),
    active: row.active !== false,
    createdBy: row.created_by,
  };
}

export function reinforcerToDb(reinforcer) {
  return {
    id: reinforcer.id || null,
    name: reinforcer.name,
    category: REINFORCER_CATEGORY_TO_DB[reinforcer.category] || 'outro',
    initial_preference: PREFERENCE_TO_DB[reinforcer.initialPreference] || 'media',
    notes: reinforcer.notes || null,
    active: reinforcer.active !== false,
  };
}

export function behaviorFromDb(row, patientId) {
  const details = row?.details && typeof row.details === 'object' ? row.details : {};
  return {
    id: row.id,
    patientId,
    name: row.name || '',
    measure: row.measure || 'Frequência',
    habitualIntensity: row.habitual_intensity || '',
    operationalDefinition: text(details.operational_definition),
    functionalHypothesis: text(details.functional_hypothesis),
    safetyGuidance: text(details.safety_guidance),
    notes: text(details.notes),
    hasSafetyPlan: row.has_safety_plan === true,
    status: row.status,
    pendingReview: row.status === 'pending_review',
    createdBy: row.created_by,
  };
}

export function behaviorToDb(behavior) {
  return {
    id: behavior.id || null,
    name: behavior.name,
    measure: behavior.measure,
    habitual_intensity: behavior.habitualIntensity || null,
    operational_definition: behavior.operationalDefinition,
    functional_hypothesis: behavior.functionalHypothesis || null,
    safety_guidance: behavior.safetyGuidance || null,
    notes: behavior.notes || null,
  };
}

function recordFromDb(row) {
  if (row.type === 'reducao') {
    const reduction = row.reduction || {};
    return {
      programId: row.program_id,
      type: 'reducao',
      phase: row.phase || 'intervencao',
      value: Number(reduction.value) || 0,
      observedSeconds: reduction.observed_seconds == null ? undefined : Number(reduction.observed_seconds),
      intervalMarks: Array.isArray(reduction.interval_marks) ? reduction.interval_marks : undefined,
      intensity: optional(reduction.intensity),
    };
  }
  const trialsFromDb = Array.isArray(row.trials) ? row.trials : [];
  const highest = trialsFromDb.reduce((max, trial) => Math.max(max, Number(trial.index) || 0), 0);
  const length = Math.max(Number(row.trial_count) || 0, highest);
  const trials = Array(length).fill(null);
  const trialSeconds = Array(length).fill(null);
  let hasSeconds = false;
  for (const trial of trialsFromDb) {
    const index = Number(trial.index) - 1;
    if (index < 0 || index >= length) continue;
    trials[index] = trial.response;
    if (trial.seconds != null) {
      trialSeconds[index] = Number(trial.seconds);
      hasSeconds = true;
    }
  }
  return {
    programId: row.program_id,
    type: 'aquisicao',
    phase: row.phase || 'intervencao',
    trials,
    trialSeconds: hasSeconds ? trialSeconds : undefined,
  };
}

export function sessionFromDb(row) {
  const privateData = row?.private && typeof row.private === 'object' ? row.private : {};
  const review = row?.review_private && typeof row.review_private === 'object' ? row.review_private : {};
  return {
    id: row.id,
    clientEventId: row.client_event_id,
    revision: Number(row.revision) || 1,
    patientId: row.patient_id,
    therapistId: row.therapist_id,
    supervisorId: row.supervisor_id || '',
    appointmentId: row.appointment_id || undefined,
    date: row.session_date,
    startAt: toMs(row.started_at),
    endAt: toMs(row.ended_at),
    location: LOCATION_FROM_DB[row.location] || 'Clínica',
    arrivalState: text(privateData.arrival_state),
    healthCondition: optional(privateData.health_condition),
    routineChange: optional(privateData.routine_change),
    apparentMotivation: optional(privateData.apparent_motivation),
    material: optional(row.material),
    peoplePresent: Array.isArray(row.people_present) ? row.people_present : [],
    isGeneralizationProbe: row.is_generalization_probe === true,
    generalizationCondition: optional(row.generalization_condition),
    status: row.status,
    records: (row.records || []).map(recordFromDb),
    pauses: (row.pauses || []).map(pause => ({ startAt: toMs(pause.started_at), endAt: toMs(pause.ended_at) })),
    reinforcers: (row.reinforcers || []).map(use => ({
      reinforcerId: use.reinforcer_id,
      programId: optional(use.program_id),
      uses: Number(use.uses) || 1,
      accessMinutes: Number(use.access_minutes) || 0,
      efficiency: EFFICIENCY_FROM_DB[use.efficiency] || 'Eficiente',
    })),
    behaviors: (row.behaviors || []).map(event => ({
      id: event.id,
      behaviorId: event.behavior_id,
      programId: optional(event.program_id),
      quantity: Number(event.quantity) || 1,
      intensity: text(event.intensity),
      durationSeconds: event.duration_seconds == null ? undefined : Number(event.duration_seconds),
      moment: text(event.moment),
      newBehavior: event.new_behavior === true,
      antecedent: text(event.abc?.antecedent),
      consequence: text(event.abc?.consequence),
      conduct: text(event.abc?.conduct),
    })),
    incidents: (row.incidents || []).map(incident => {
      const details = incident.details || {};
      return {
        id: incident.id,
        reason: text(details.reason),
        behavior: text(details.behavior),
        identifiedRisk: text(details.identified_risk),
        interventionType: text(details.intervention_type),
        severity: SEVERITY_FROM_DB[incident.severity],
        durationMinutes: Number(incident.duration_minutes) || 0,
        peoplePresent: Array.isArray(details.people_present) ? details.people_present : [],
        injury: text(details.injury),
        followUp: text(details.follow_up),
        guardianCommunication: text(details.guardian_communication),
        notes: '',
        reviewed: incident.status === 'reviewed',
        reviewNote: text(incident.review_note),
        createdAt: toMs(incident.created_at),
      };
    }),
    notes: text(privateData.notes),
    correctionDeadline: toMs(row.correction_deadline),
    correctionReason: optional(review.correction_reason),
    correctionResponse: optional(review.correction_response),
    correctionRequestedAt: toMs(row.correction_requested_at),
    correctionRequestedBy: optional(row.correction_requested_by),
    correctedAt: toMs(row.corrected_at),
    correctedBy: optional(row.corrected_by),
    reviewStatus: row.review_status || 'pending_review',
    reviewedAt: toMs(row.reviewed_at),
    reviewedBy: optional(row.reviewed_by),
    reviewNotes: optional(review.review_notes),
    signedAt: toMs(row.signed_at),
    signedBy: optional(row.signed_by),
    signatureStatement: optional(row.signature_statement),
    reviewHistory: (row.reviews || []).map(event => ({
      id: event.id,
      action: event.action,
      actorId: event.actor_id,
      notes: text(event.notes),
      createdAt: toMs(event.created_at),
    })),
  };
}

function recordToDb(record) {
  if (record.type === 'reducao') {
    return {
      program_id: record.programId,
      phase: record.phase || 'intervencao',
      value: Number(record.value) || 0,
      observed_seconds: record.observedSeconds ?? null,
      interval_marks: Array.isArray(record.intervalMarks) ? record.intervalMarks : null,
      intensity: record.intensity || null,
    };
  }
  return {
    program_id: record.programId,
    phase: record.phase || 'intervencao',
    trials: record.trials.map(trial => trial ?? null),
    trial_seconds: Array.isArray(record.trialSeconds)
      ? record.trialSeconds.map(value => (typeof value === 'number' ? value : null))
      : [],
  };
}

/** Sessão da tela → p_session de aba_save_session. */
export function sessionToDb(session) {
  return {
    client_event_id: session.clientEventId,
    // Só existe depois que o banco confirmou o primeiro salvamento.
    revision: session.revision ?? null,
    status: session.status,
    started_at: toIso(session.startAt),
    ended_at: toIso(session.endAt),
    appointment_id: session.appointmentId || null,
    location: LOCATION_TO_DB[session.location] || 'clinica',
    material: session.material || null,
    people_present: session.peoplePresent || [],
    is_generalization_probe: session.isGeneralizationProbe === true,
    generalization_condition: session.isGeneralizationProbe ? (session.generalizationCondition || null) : null,
    private: {
      arrival_state: session.arrivalState || null,
      health_condition: session.healthCondition || null,
      routine_change: session.routineChange || null,
      apparent_motivation: session.apparentMotivation || null,
      notes: session.notes || null,
    },
    records: session.records.map(recordToDb),
    pauses: session.pauses.map(pause => ({ started_at: toIso(pause.startAt), ended_at: toIso(pause.endAt) })),
    reinforcers: session.reinforcers.map(use => ({
      reinforcer_id: use.reinforcerId,
      program_id: use.programId || null,
      uses: use.uses,
      access_minutes: use.accessMinutes ?? 0,
      efficiency: EFFICIENCY_TO_DB[use.efficiency] || 'eficiente',
    })),
    behaviors: session.behaviors.map(event => ({
      id: event.id,
      behavior_id: event.behaviorId,
      program_id: event.programId || null,
      quantity: event.quantity || 1,
      intensity: event.intensity || null,
      duration_seconds: event.durationSeconds ?? null,
      moment: event.moment || null,
      new_behavior: event.newBehavior === true,
      abc: { antecedent: event.antecedent, consequence: event.consequence, conduct: event.conduct },
    })),
    incidents: session.incidents.map(incident => ({
      id: incident.id,
      severity: SEVERITY_TO_DB[incident.severity] || null,
      duration_minutes: incident.durationMinutes || 0,
      details: {
        reason: incident.reason,
        behavior: incident.behavior,
        identified_risk: incident.identifiedRisk,
        intervention_type: incident.interventionType,
        people_present: incident.peoplePresent || [],
        injury: incident.injury || null,
        follow_up: incident.followUp || null,
        guardian_communication: incident.guardianCommunication || null,
      },
    })),
  };
}

/** Só o que a correção muda: tentativas e valores, programa por programa. */
export function correctionRecordsToDb(records) {
  return records.map(recordToDb);
}

/** Pacote de aba_get_patient_data → estado da área ABA para um paciente. */
export function patientDataFromDb(bundle) {
  const patientId = bundle?.patient_id;
  const professionals = new Map((bundle?.professionals || []).map(person => [person.id, person.full_name || 'Profissional']));
  return {
    patientId,
    permissions: {
      canSupervise: bundle?.permissions?.can_supervise === true,
      isAdmin: bundle?.permissions?.is_admin === true,
      userId: bundle?.permissions?.user_id,
    },
    team: bundle?.team ? {
      id: bundle.team.id,
      name: bundle.team.name,
      supervisorId: bundle.team.supervisor_id,
      memberIds: bundle.team.member_ids || [],
      therapistIds: bundle.team.therapist_ids || [],
    } : null,
    settings: {
      defaultTrialCount: Number(bundle?.settings?.default_trial_count) || 10,
      programBlockMinutes: Number(bundle?.settings?.program_block_minutes) || 20,
      pauseMinutes: Number(bundle?.settings?.pause_minutes) || 5,
      correctionWindowHours: Number(bundle?.settings?.correction_window_hours) || 24,
    },
    programs: (bundle?.programs || []).map(programFromDb),
    reinforcers: (bundle?.reinforcers || []).map(row => reinforcerFromDb(row, patientId)),
    behaviors: (bundle?.behaviors || []).map(row => behaviorFromDb(row, patientId)),
    sessions: (bundle?.sessions || []).map(sessionFromDb),
    professionalName: id => professionals.get(id) || '—',
    professionals: [...professionals.entries()].map(([id, name]) => ({ id, name })),
  };
}

/** Novo identificador (crypto.randomUUID com reserva para navegador antigo). */
export function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}
