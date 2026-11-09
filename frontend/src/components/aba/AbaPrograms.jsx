import { useEffect, useMemo, useState } from 'react';
import {
  BEHAVIOR_INTENSITIES, BEHAVIOR_PROCEDURES, PROGRAM_PRESETS, PROMPT_FADING_STRATEGIES,
  PROMPT_LEVELS, REINFORCEMENT_SCHEDULES, TARGET_SKILLS, TEACHING_STRATEGIES, TECHNIQUE_CATEGORIES,
  TECHNIQUE_GOALS, TIME_MEASURES, behaviorFunctionLabel, collectionTypeLabel, collectionTypeOf,
  collectionTypesFor, isRestrictedProcedure, normalizeCollectionType, orderedPromptHierarchy,
  techniqueCategoryLabel, techniqueGoalLabel, timeMeasureLabel, trialCode,
} from '../../utils/aba/catalog.js';
import { programDirection } from '../../utils/aba/calculations.js';
import { PROGRAM_STATUSES, newId } from '../../utils/aba/mapping.js';
import { LIBRARY_FALLBACK_NOTICE, mergeAbaLibrary } from '../../utils/abaLibraryMerge';
import { AbaConflictError, listLibrary, saveProgram, updateProgramStatus } from '../../services/abaService';
import { AbaDialog } from './AbaDialog';
import { AbaIcon } from './AbaIcon';

// ============================================================
// Programas do paciente (trazido do Atlas, PlansPage, sem versão de
// plano). A supervisão do time cria e edita; o terapeuta vê. Modelos
// prontos e a biblioteca de objetivos montam o programa em um toque; a
// técnica escolhida configura a ficha — ponto de partida, não decisão.
// ============================================================

const DEFAULT_CRITERIA = {
  minimumPercentage: 80,
  consecutiveIndependent: 5,
  requiredSessions: 3,
  sessionsMustBeConsecutive: true,
  requiredEnvironments: 2,
  requiredTherapists: 2,
  maintenanceDays: 30,
  generalizationRule: '2 ambientes e 2 terapeutas',
};

function baseProgram({ type, settings, template = {} }) {
  const collectionType = type === 'aquisicao' ? 'tentativas' : 'frequencia';
  const collection = collectionTypeOf(collectionType);
  return {
    id: newId(),
    revision: null,
    type,
    name: template.title || '',
    objective: template.objective || '',
    target: template.target || '',
    skill: template.skill || TARGET_SKILLS[0].value,
    teachingFormat: template.suggestedFormat || TEACHING_STRATEGIES[0].value,
    promptStrategy: template.suggestedPrompt || '',
    procedure: template.suggestedProcedure || BEHAVIOR_PROCEDURES[0].value,
    collectionType,
    trialCount: settings.defaultTrialCount,
    durationMinutes: settings.programBlockMinutes,
    criterion: '80% em 3 sessões consecutivas',
    criteria: { ...DEFAULT_CRITERIA },
    generalizationCriterion: '80% em 2 ambientes',
    maintenanceCriterion: 'Sondagem semanal por 30 dias',
    reductionCriterion: type === 'reducao' ? 'Redução de 70% sobre a linha de base' : undefined,
    promptHierarchy: undefined,
    promptFading: PROMPT_FADING_STRATEGIES[0],
    reinforcerIds: [],
    timeMeasure: 'nenhuma',
    goalDirection: type === 'aquisicao' ? 'aumentar' : 'reduzir',
    reinforcementSchedule: undefined,
    tokenEconomy: false,
    taskSteps: undefined,
    notes: '',
    // O programa nasce pronto para aplicar: "Planejado" o tiraria da coleta.
    status: 'Em ensino',
    protocolStartDate: new Date().toISOString().slice(0, 10),
    templateTitle: template.title || undefined,
    ...(type === 'reducao' ? { measure: collection?.measure || 'frequência', unit: collection?.unit || 'ocorrências' } : {}),
  };
}

function programFromPreset(preset, settings, reinforcers) {
  const base = baseProgram({ type: preset.type, settings });
  return {
    ...base,
    name: preset.name,
    objective: preset.objective,
    target: preset.target,
    skill: preset.skill,
    teachingFormat: preset.teachingFormat,
    procedure: preset.procedure,
    promptFading: preset.promptFading,
    applicationCondition: preset.applicationCondition,
    correctResponseDefinition: preset.correctResponseDefinition,
    errorDefinition: preset.errorDefinition,
    promptHierarchy: preset.promptHierarchy,
    maxPromptLevel: PROMPT_LEVELS.filter(level => (preset.promptHierarchy || []).includes(level.response)).at(-1)?.label,
    reinforcerIds: reinforcers.map(reinforcer => reinforcer.id),
    collectionType: preset.collectionType,
    timeMeasure: preset.timeMeasure || 'nenhuma',
    trialCount: preset.trialCount || base.trialCount,
    criterion: preset.criterion,
    generalizationCriterion: preset.generalizationCriterion,
    maintenanceCriterion: preset.maintenanceCriterion,
    templateTitle: preset.label,
    criteria: {
      ...base.criteria,
      minimumPercentage: preset.minimumPercentage ?? base.criteria.minimumPercentage,
      consecutiveIndependent: preset.consecutiveIndependent ?? base.criteria.consecutiveIndependent,
      requiredSessions: preset.requiredSessions ?? base.criteria.requiredSessions,
      requiredEnvironments: preset.requiredEnvironments ?? base.criteria.requiredEnvironments,
      requiredTherapists: preset.requiredTherapists ?? base.criteria.requiredTherapists,
      minimumSeconds: preset.minimumSeconds || undefined,
      generalizationRule: preset.generalizationCriterion,
    },
    ...(preset.type === 'reducao' ? {
      measure: preset.measure || 'frequência',
      unit: preset.unit || 'ocorrências',
      reductionCriterion: preset.reductionCriterion || base.reductionCriterion,
    } : {}),
  };
}

const criterionText = criteria => `≥${criteria.minimumPercentage}% por ${criteria.requiredSessions} sessões${criteria.sessionsMustBeConsecutive ? ' consecutivas' : ''}${criteria.minimumSeconds ? ` e ${criteria.minimumSeconds}s` : ''}`;

function TechniquePicker({ techniques, onApply, onClose }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [goal, setGoal] = useState('');
  const [open, setOpen] = useState(null);
  const results = techniques.filter(technique => (!category || technique.category === category)
    && (!goal || technique.goals.includes(goal))
    && `${technique.name} ${technique.whenToUse} ${technique.howToApply}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <AbaDialog title="Biblioteca de técnicas" wide onClose={onClose}>
      <div className="aba-library-filters">
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar técnica" aria-label="Buscar técnica" />
        <select value={category} onChange={event => setCategory(event.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {TECHNIQUE_CATEGORIES.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </div>
      <div className="aba-chip-row">
        {TECHNIQUE_GOALS.map(entry => (
          <button key={entry.value} type="button" className="aba-chip" aria-pressed={goal === entry.value} onClick={() => setGoal(current => (current === entry.value ? '' : entry.value))}>{entry.label}</button>
        ))}
      </div>
      <div className="aba-technique-list">
        {results.map(technique => (
          <article key={technique.code} className="aba-technique">
            <button type="button" className="aba-technique-head" aria-expanded={open === technique.code} onClick={() => setOpen(current => (current === technique.code ? null : technique.code))}>
              <span className="aba-tag">{techniqueCategoryLabel(technique.category)}</span>
              <strong>{technique.name}</strong>
              {technique.restricted && <span className="aba-tag is-warn">Restrito</span>}
            </button>
            {open === technique.code && (
              <div className="aba-technique-body">
                <p><b>Quando usar:</b> {technique.whenToUse}</p>
                <p><b>Como aplicar:</b> {technique.howToApply}</p>
                <p><b>Exemplo:</b> {technique.example}</p>
                {technique.caution && <p className="aba-note"><b>Cuidado:</b> {technique.caution}</p>}
                {technique.goals.length > 0 && <small>Para: {technique.goals.map(techniqueGoalLabel).join(', ')}</small>}
                {technique.behaviorFunctions.length > 0 && <small>Função: {technique.behaviorFunctions.map(behaviorFunctionLabel).join(', ')}</small>}
                <div className="aba-form-actions">
                  <button type="button" className="primary-button" onClick={() => onApply(technique)}>Usar esta técnica no programa</button>
                </div>
              </div>
            )}
          </article>
        ))}
        {!results.length && <p className="aba-empty">Nenhuma técnica com esse filtro.</p>}
      </div>
    </AbaDialog>
  );
}

function ProgramEditor({ initial, isNew, data, techniques, onClose, onSaved }) {
  const [program, setProgram] = useState(() => ({
    ...initial,
    criteria: { ...DEFAULT_CRITERIA, ...(initial.criteria || {}) },
    taskSteps: initial.taskSteps ? [...initial.taskSteps] : [],
    promptHierarchy: initial.promptHierarchy?.length ? orderedPromptHierarchy(initial.promptHierarchy) : [],
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [picker, setPicker] = useState(false);
  const [appliedTechnique, setAppliedTechnique] = useState(null);

  const type = program.type;
  const collection = collectionTypeOf(program.collectionType);
  const restricted = isRestrictedProcedure(program.procedure);
  const eligibleBehaviors = data.behaviors.filter(behavior => behavior.hasSafetyPlan && behavior.status !== 'inactive');
  const reinforcers = data.reinforcers.filter(reinforcer => reinforcer.active);
  const teamTherapists = data.professionals.filter(person => (data.team?.memberIds || []).includes(person.id) || person.id === data.team?.supervisorId);

  const set = patch => setProgram(current => ({ ...current, ...patch }));
  const setCriteria = patch => setProgram(current => ({ ...current, criteria: { ...current.criteria, ...patch } }));
  const togglePrompt = response => setProgram(current => ({
    ...current,
    promptHierarchy: current.promptHierarchy.includes(response)
      ? current.promptHierarchy.filter(item => item !== response)
      : orderedPromptHierarchy([...current.promptHierarchy, response]),
  }));
  const toggleReinforcer = id => setProgram(current => ({
    ...current,
    reinforcerIds: current.reinforcerIds.includes(id) ? current.reinforcerIds.filter(item => item !== id) : [...current.reinforcerIds, id],
  }));
  const selectCollectionType = value => {
    const entry = collectionTypeOf(value);
    set({
      collectionType: value,
      timeMeasure: entry?.timeMeasure ?? program.timeMeasure,
      ...(type === 'reducao' ? { measure: entry?.measure || program.measure, unit: program.unit || entry?.unit } : {}),
    });
  };

  // A técnica só toca no que ela define — o resto fica como a supervisão deixou.
  const applyTechnique = technique => {
    const config = technique.suggestedConfig || {};
    set({
      teachingFormat: config.teaching_format ?? program.teachingFormat,
      procedure: config.procedure ?? program.procedure,
      collectionType: config.collection_type && collectionTypeOf(config.collection_type)?.programType !== (type === 'aquisicao' ? 'reducao' : 'aquisicao')
        ? config.collection_type
        : program.collectionType,
      timeMeasure: type === 'aquisicao' ? (config.time_measure ?? program.timeMeasure) : program.timeMeasure,
      reinforcementSchedule: config.reinforcement_schedule ?? program.reinforcementSchedule,
      tokenEconomy: config.token_economy ?? program.tokenEconomy,
      goalDirection: type === 'reducao' ? (config.goal_direction ?? program.goalDirection) : 'aumentar',
      promptFading: config.prompt_fading ?? program.promptFading,
      promptHierarchy: config.prompt_hierarchy?.length ? orderedPromptHierarchy(config.prompt_hierarchy) : program.promptHierarchy,
    });
    setAppliedTechnique(technique);
    setPicker(false);
  };

  const submit = async () => {
    setError(null);
    const steps = (program.taskSteps || []).map(step => step.trim()).filter(Boolean);
    if (!program.name.trim()) { setError('Dê um nome ao programa.'); return; }
    if (steps.length === 1) { setError('Uma análise de tarefas precisa de pelo menos duas etapas.'); return; }
    if (restricted && (!program.restrictedBehaviorId || (program.restrictedAuthorization || '').trim().length < 10)) {
      setError('Procedimento restrito: escolha o comportamento-alvo e escreva o parecer autorizando.');
      return;
    }
    const intensityScale = typeof program.intensityScaleText === 'string'
      ? program.intensityScaleText.split(',').map(level => level.trim()).filter(Boolean)
      : program.intensityScale;
    const toSave = {
      ...program,
      name: program.name.trim(),
      taskSteps: type === 'aquisicao' && steps.length ? steps : undefined,
      trialCount: type === 'aquisicao' ? (steps.length || Number(program.trialCount) || 1) : program.trialCount,
      promptHierarchy: program.promptHierarchy.length ? program.promptHierarchy : undefined,
      goalDirection: type === 'aquisicao' ? 'aumentar' : program.goalDirection,
      criterion: program.criterion?.trim() || criterionText(program.criteria),
      restrictedBehaviorId: restricted ? program.restrictedBehaviorId : undefined,
      restrictedAuthorization: restricted ? program.restrictedAuthorization : undefined,
      intensityScale: intensityScale && intensityScale.length >= 2 ? intensityScale : undefined,
    };
    delete toSave.intensityScaleText;
    setSaving(true);
    try {
      await saveProgram(data.patientId, toSave);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof AbaConflictError
        ? 'Este programa foi alterado por outra pessoa enquanto você editava. Feche e abra de novo.'
        : saveError.message);
    } finally {
      setSaving(false);
    }
  };

  const criteria = program.criteria;
  const intensityDefault = (program.intensityScale?.length ? program.intensityScale : BEHAVIOR_INTENSITIES).join(', ');

  return (
    <AbaDialog title={isNew ? (type === 'aquisicao' ? 'Novo programa de aquisição' : 'Novo programa de redução') : `Editar programa · ${initial.name}`} wide busy={saving} guardUnsaved onClose={onClose}>
      <div className="aba-form-grid">
        <label className="aba-field">Nome do programa
          <input value={program.name} onChange={event => set({ name: event.target.value })} />
        </label>
        <label className="aba-field">Habilidade / operante-alvo
          <select value={program.skill} onChange={event => set({ skill: event.target.value })}>
            {!TARGET_SKILLS.some(skill => skill.value === program.skill) && program.skill && <option value={program.skill}>{program.skill}</option>}
            {TARGET_SKILLS.map(skill => <option key={skill.value} value={skill.value}>{skill.label}</option>)}
          </select>
        </label>
        <label className="aba-field is-full">Objetivo terapêutico
          <textarea rows={2} value={program.objective} onChange={event => set({ objective: event.target.value })} />
        </label>
        <label className="aba-field is-full">Definição operacional do comportamento-alvo
          <textarea rows={2} value={program.target} onChange={event => set({ target: event.target.value })} />
        </label>

        <div className="aba-technique-pick is-full">
          <div>
            <strong>Não sabe qual estratégia usar?</strong>
            <small>Busque na biblioteca pelo que você quer alcançar; a técnica escolhida configura os campos abaixo.</small>
          </div>
          <button type="button" className="quiet-button" onClick={() => setPicker(true)}><AbaIcon name="library" /> Buscar técnica</button>
        </div>
        {appliedTechnique && (
          <p className="aba-note is-full">Configurado a partir de <strong>{appliedTechnique.name}</strong>. Revise os campos — a sugestão é ponto de partida, não decisão clínica.</p>
        )}

        <label className="aba-field">Estratégia de ensino
          <select value={program.teachingFormat} onChange={event => set({ teachingFormat: event.target.value })}>
            {!TEACHING_STRATEGIES.some(strategy => strategy.value === program.teachingFormat) && program.teachingFormat && <option value={program.teachingFormat}>{program.teachingFormat}</option>}
            {TEACHING_STRATEGIES.map(strategy => <option key={strategy.value} value={strategy.value}>{strategy.label}</option>)}
          </select>
          <small className="aba-hint">{TEACHING_STRATEGIES.find(strategy => strategy.value === program.teachingFormat)?.purpose}</small>
        </label>
        <label className="aba-field">Procedimento comportamental
          <select value={program.procedure} onChange={event => set({ procedure: event.target.value })}>
            {BEHAVIOR_PROCEDURES.map(procedure => <option key={procedure.value} value={procedure.value}>{procedure.label}</option>)}
          </select>
          <small className="aba-hint">{BEHAVIOR_PROCEDURES.find(procedure => procedure.value === program.procedure)?.purpose}</small>
        </label>

        {restricted && (
          <div className="aba-restricted-block is-full">
            <p className="aba-restricted-title"><AbaIcon name="shield" size={17} /> Procedimento restrito</p>
            <p>“{program.procedure}” não é escolha livre. Para salvar, o programa precisa de um comportamento-alvo com <strong>hipótese funcional</strong> e <strong>plano de segurança</strong> registrados, mais o seu parecer autorizando. A autorização fica gravada com o seu nome e a data.</p>
            <label className="aba-field">Comportamento-alvo que justifica o procedimento
              <select value={program.restrictedBehaviorId || ''} onChange={event => set({ restrictedBehaviorId: event.target.value || undefined })}>
                <option value="">Selecione</option>
                {eligibleBehaviors.map(behavior => <option key={behavior.id} value={behavior.id}>{behavior.name}</option>)}
              </select>
              {!eligibleBehaviors.length && <small className="aba-hint">Nenhum comportamento deste paciente tem hipótese funcional e plano de segurança preenchidos. Complete os dois em Repertório antes de autorizar.</small>}
            </label>
            <label className="aba-field">Parecer da supervisão autorizando
              <textarea rows={3} value={program.restrictedAuthorization || ''} placeholder="Ex.: autorizado após análise funcional de 30/07; aplicar só com a supervisora presente nas duas primeiras sessões." onChange={event => set({ restrictedAuthorization: event.target.value })} />
            </label>
          </div>
        )}

        {type === 'aquisicao' && (
          <div className="aba-field is-full">
            <span className="aba-chip-label">Etapas da análise de tarefas (opcional)</span>
            <small className="aba-hint">Para encadeamento: a ficha registra uma linha por etapa e a análise mostra em qual etapa a criança trava. Vazio, a ficha segue com o número de oportunidades.</small>
            <div className="aba-task-steps">
              {program.taskSteps.map((step, index) => (
                <div key={index} className="aba-task-steps-row">
                  <span>{index + 1}</span>
                  <input value={step} placeholder="Ex.: abrir a torneira" onChange={event => set({ taskSteps: program.taskSteps.map((item, position) => (position === index ? event.target.value : item)) })} />
                  <button type="button" className="quiet-button" aria-label={`Remover etapa ${index + 1}`} onClick={() => set({ taskSteps: program.taskSteps.filter((_, position) => position !== index) })}><AbaIcon name="trash" /></button>
                </div>
              ))}
            </div>
            {program.taskSteps.length < 20 && <button type="button" className="quiet-button" onClick={() => set({ taskSteps: [...program.taskSteps, ''] })}><AbaIcon name="plus" /> Adicionar etapa</button>}
          </div>
        )}

        <p className="aba-note is-full">Ficha de coleta — o que o terapeuta verá durante a sessão</p>
        <label className="aba-field">Forma de coleta
          <select value={program.collectionType} onChange={event => selectCollectionType(event.target.value)}>
            {collectionTypesFor(type).map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
          <small className="aba-hint">{collection?.purpose}</small>
        </label>
        {type === 'aquisicao' ? (
          <label className="aba-field">Medida de tempo
            <select value={program.timeMeasure} onChange={event => set({ timeMeasure: event.target.value })}>
              {TIME_MEASURES.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
            </select>
            <small className="aba-hint">{TIME_MEASURES.find(entry => entry.value === program.timeMeasure)?.hint}</small>
          </label>
        ) : (
          <label className="aba-field">Unidade
            <input value={program.unit || ''} onChange={event => set({ unit: event.target.value })} />
          </label>
        )}
        {type === 'aquisicao' && !program.taskSteps.length && (
          <label className="aba-field">Número de oportunidades (tentativas)
            <input type="number" min="1" max="50" value={program.trialCount} onChange={event => set({ trialCount: Number(event.target.value) })} />
          </label>
        )}
        <label className="aba-field">Duração estimada (min)
          <input type="number" min="1" value={program.durationMinutes || ''} onChange={event => set({ durationMinutes: Number(event.target.value) })} />
        </label>
        <label className="aba-field is-full">Condição em que o programa será aplicado
          <textarea rows={2} value={program.applicationCondition || ''} placeholder="Ex.: após pedir o item preferido, com o acesso adiado pelo tempo previsto." onChange={event => set({ applicationCondition: event.target.value })} />
        </label>
        <div className="aba-field is-full">
          <span className="aba-chip-label">Hierarquia de ajuda</span>
          <div className="aba-chip-row">
            {PROMPT_LEVELS.map(level => (
              <button key={level.response} type="button" className="aba-chip" aria-pressed={program.promptHierarchy.includes(level.response)} onClick={() => togglePrompt(level.response)}>
                <strong>{level.code}</strong> {level.label}
              </button>
            ))}
          </div>
          <small className="aba-hint">{program.promptHierarchy.length
            ? `A ficha mostra ${program.promptHierarchy.length} ${program.promptHierarchy.length === 1 ? 'nível' : 'níveis'}, do menos ao mais intrusivo.`
            : 'Sem seleção, a ficha mostra a hierarquia completa.'}</small>
        </div>
        <label className="aba-field">Estratégia de esvanecimento
          <select value={program.promptFading || PROMPT_FADING_STRATEGIES[0]} onChange={event => set({ promptFading: event.target.value })}>
            {PROMPT_FADING_STRATEGIES.map(strategy => <option key={strategy}>{strategy}</option>)}
          </select>
        </label>
        <label className="aba-field">Ajuda máxima que ainda vale para o critério
          <select value={program.promptCeiling || ''} onChange={event => set({ promptCeiling: event.target.value || undefined })}>
            <option value="">O critério não limita a ajuda</option>
            {PROMPT_LEVELS.filter(level => level.response !== 'independente').map(level => <option key={level.response} value={level.response}>Até {level.label.toLowerCase()}</option>)}
          </select>
          <small className="aba-hint">Sessão com ajuda mais intrusiva que isto não conta para o critério.</small>
        </label>
        <div className="aba-field is-full">
          <span className="aba-chip-label">Reforçadores disponíveis</span>
          {reinforcers.length ? (
            <div className="aba-chip-row">
              {reinforcers.map(reinforcer => (
                <button key={reinforcer.id} type="button" className="aba-chip" aria-pressed={program.reinforcerIds.includes(reinforcer.id)} onClick={() => toggleReinforcer(reinforcer.id)}>
                  {reinforcer.name}<small> · {reinforcer.category}</small>
                </button>
              ))}
            </div>
          ) : <small className="aba-hint">Cadastre reforçadores em Repertório para vinculá-los a este programa.</small>}
        </div>
        {collection?.measure === 'intensidade' && (
          <label className="aba-field is-full">Escala de intensidade
            <input defaultValue={intensityDefault} placeholder="Leve, Moderada, Alta" onChange={event => set({ intensityScaleText: event.target.value })} />
            <small className="aba-hint">Do menor para o maior, separados por vírgula. São os botões da ficha e a ordem do gráfico.</small>
          </label>
        )}
        {collection?.sheet === 'intervalo' && (
          <label className="aba-field">Tamanho do intervalo (segundos)
            <input type="number" min="5" step="5" value={program.intervalSeconds ?? 60} onChange={event => set({ intervalSeconds: Number(event.target.value) })} />
          </label>
        )}
        <label className="aba-field">Esquema de reforçamento
          <select value={program.reinforcementSchedule || ''} onChange={event => set({ reinforcementSchedule: event.target.value || undefined })}>
            <option value="">Não definido</option>
            {REINFORCEMENT_SCHEDULES.map(entry => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </label>
        <div className="aba-field">
          <span className="aba-chip-label">Economia de fichas</span>
          <button type="button" className="aba-chip" aria-pressed={Boolean(program.tokenEconomy)} onClick={() => set({ tokenEconomy: !program.tokenEconomy })}>
            {program.tokenEconomy ? 'Usa economia de fichas' : 'Sem economia de fichas'}
          </button>
        </div>
        {type === 'reducao' && (
          <label className="aba-field is-full">O que se espera do dado
            <select value={program.goalDirection} onChange={event => set({ goalDirection: event.target.value })}>
              <option value="reduzir">Reduzir — o comportamento deve diminuir</option>
              <option value="aumentar">Aumentar — a resposta deve ficar mais frequente (DRH)</option>
            </select>
          </label>
        )}

        <p className="aba-note is-full">Critério de progressão — quando o programa é considerado dominado</p>
        <label className="aba-field">Percentual mínimo
          <input type="number" min="0" max="100" value={criteria.minimumPercentage} onChange={event => setCriteria({ minimumPercentage: Number(event.target.value) })} />
        </label>
        <label className="aba-field">Respostas independentes consecutivas
          <input type="number" min="0" value={criteria.consecutiveIndependent} onChange={event => setCriteria({ consecutiveIndependent: Number(event.target.value) })} />
        </label>
        <label className="aba-field">Sessões exigidas
          <input type="number" min="1" value={criteria.requiredSessions} onChange={event => setCriteria({ requiredSessions: Number(event.target.value) })} />
        </label>
        <label className="aba-field">Ambientes exigidos
          <input type="number" min="1" value={criteria.requiredEnvironments} onChange={event => setCriteria({ requiredEnvironments: Number(event.target.value) })} />
        </label>
        <label className="aba-field">Terapeutas exigidos
          <input type="number" min="1" value={criteria.requiredTherapists} onChange={event => setCriteria({ requiredTherapists: Number(event.target.value) })} />
        </label>
        <label className="aba-field">Dias de manutenção
          <input type="number" min="0" value={criteria.maintenanceDays} onChange={event => setCriteria({ maintenanceDays: Number(event.target.value) })} />
        </label>
        <label className="aba-field">Tempo mínimo (segundos)
          <input type="number" min="0" value={criteria.minimumSeconds ?? 0} onChange={event => setCriteria({ minimumSeconds: Number(event.target.value) || undefined })} />
          <small className="aba-hint">0 = o critério não depende de tempo.</small>
        </label>
        <div className="aba-field">
          <span className="aba-chip-label">Sessões consecutivas</span>
          <button type="button" className="aba-chip" aria-pressed={criteria.sessionsMustBeConsecutive} onClick={() => setCriteria({ sessionsMustBeConsecutive: !criteria.sessionsMustBeConsecutive })}>
            {criteria.sessionsMustBeConsecutive ? 'Precisam ser consecutivas' : 'Podem ser alternadas'}
          </button>
        </div>
        {type === 'reducao' && (
          <label className="aba-field is-full">Critério de redução
            <input value={program.reductionCriterion || ''} onChange={event => set({ reductionCriterion: event.target.value })} />
          </label>
        )}
        <label className="aba-field is-full">Critério de generalização
          <input value={program.generalizationCriterion || ''} onChange={event => set({ generalizationCriterion: event.target.value })} />
        </label>
        <label className="aba-field is-full">Critério de manutenção
          <input value={program.maintenanceCriterion || ''} onChange={event => set({ maintenanceCriterion: event.target.value })} />
        </label>

        <p className="aba-note is-full">Definições para a ficha (opcional)</p>
        <label className="aba-field is-full">Resposta correta
          <textarea rows={2} value={program.correctResponseDefinition || ''} onChange={event => set({ correctResponseDefinition: event.target.value })} />
        </label>
        <label className="aba-field is-full">Erro
          <textarea rows={2} value={program.errorDefinition || ''} onChange={event => set({ errorDefinition: event.target.value })} />
        </label>
        <label className="aba-field">Terapeuta responsável
          <select value={program.therapistId || ''} onChange={event => set({ therapistId: event.target.value })}>
            <option value="">Sem atribuição</option>
            {teamTherapists.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label className="aba-field">Início do protocolo
          <input type="date" value={program.protocolStartDate || ''} onChange={event => set({ protocolStartDate: event.target.value })} />
        </label>
        {!isNew && (
          <label className="aba-field">Fase do programa
            <select value={program.status} onChange={event => set({ status: event.target.value })}>
              {PROGRAM_STATUSES.map(status => <option key={status}>{status}</option>)}
            </select>
          </label>
        )}
        <label className="aba-field is-full">Notas clínicas
          <textarea rows={3} value={program.notes || ''} onChange={event => set({ notes: event.target.value })} />
        </label>
      </div>
      {error && <p className="aba-error" role="alert">{error}</p>}
      <div className="aba-form-actions">
        <button type="button" className="quiet-button" disabled={saving} onClick={onClose}>Cancelar</button>
        <button type="button" className="primary-button" disabled={saving} onClick={() => void submit()}>{saving ? 'Salvando...' : (isNew ? 'Adicionar programa' : 'Salvar programa')}</button>
      </div>
      {picker && <TechniquePicker techniques={techniques} onApply={applyTechnique} onClose={() => setPicker(false)} />}
    </AbaDialog>
  );
}

export function AbaPrograms({ data, onChanged }) {
  const [libraryRows, setLibraryRows] = useState([]);
  const [libraryUnavailable, setLibraryUnavailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listLibrary().then(rows => {
      if (!cancelled) { setLibraryRows(rows); setLibraryUnavailable(false); }
    }).catch(() => {
      if (!cancelled) { setLibraryRows([]); setLibraryUnavailable(true); }
    });
    return () => { cancelled = true; };
  }, []);
  const library = useMemo(() => mergeAbaLibrary(libraryRows), [libraryRows]);
  const canEdit = data.permissions.canSupervise;
  const [editing, setEditing] = useState(null);
  const [category, setCategory] = useState('Todas');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [showArchived, setShowArchived] = useState(false);

  const programs = data.programs.filter(program => showArchived || !program.archivedAt);
  const activeReinforcers = data.reinforcers.filter(reinforcer => reinforcer.active);
  const categories = useMemo(() => ['Todas', ...new Set(library.objectives.map(objective => objective.category))], [library]);
  const templates = library.objectives.filter(objective => (category === 'Todas' || objective.category === category)
    && `${objective.title} ${objective.objective} ${objective.target}`.toLowerCase().includes(query.trim().toLowerCase()));

  const addDirect = async program => {
    setBusy(true);
    setError(null);
    try {
      await saveProgram(data.patientId, program);
      onChanged?.();
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const archive = async () => {
    setBusy(true);
    setError(null);
    try {
      await updateProgramStatus(archiving.id, { archive: true });
      setArchiving(null);
      onChanged?.();
    } catch (archiveError) {
      setError(archiveError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="aba-page">
      <div className="aba-page-head">
        <div>
          <p className="aba-eyebrow">Programas</p>
          <h2>Programas do paciente</h2>
          <p className="aba-muted">{canEdit
            ? 'Monte pelos modelos prontos ou pela biblioteca e ajuste a ficha. O programa já nasce liberado para a coleta.'
            : 'A supervisão do time monta e ajusta os programas. Aqui você vê o que vai aparecer na ficha.'}</p>
        </div>
        {canEdit && (
          <div className="aba-button-row">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setEditing({ program: baseProgram({ type: 'reducao', settings: data.settings }), isNew: true })}>
              <AbaIcon name="plus" /> Redução
            </button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => setEditing({ program: baseProgram({ type: 'aquisicao', settings: data.settings }), isNew: true })}>
              <AbaIcon name="plus" /> Aquisição
            </button>
          </div>
        )}
      </div>
      {error && <p className="aba-error" role="alert">{error}</p>}
      {libraryUnavailable && <p className="aba-note" role="status">{LIBRARY_FALLBACK_NOTICE}</p>}
      <p className="aba-note">Modelos são ponto de partida, não decisão clínica. Individualize e peça revisão da supervisão; técnicas restritas exigem revisão nominal do programa.</p>

      <section className="aba-card">
        <div className="aba-section-head">
          <div><p className="aba-eyebrow">No plano</p><h3>{programs.filter(program => !program.archivedAt).length} {programs.filter(program => !program.archivedAt).length === 1 ? 'programa' : 'programas'}</h3></div>
          {data.programs.some(program => program.archivedAt) && (
            <button type="button" className="aba-chip" aria-pressed={showArchived} onClick={() => setShowArchived(current => !current)}>Mostrar arquivados</button>
          )}
        </div>
        <div className="aba-program-list">
          {programs.map(program => (
            <article key={program.id} className={program.archivedAt ? 'is-archived' : ''}>
              <div>
                <span className="aba-tag">{program.type === 'aquisicao' ? 'Aquisição' : 'Redução'}</span>
                <h4>{program.name}</h4>
                <p>{program.target || program.objective}</p>
                <small>
                  {program.teachingFormat} · {collectionTypeLabel(normalizeCollectionType(program))}
                  {program.timeMeasure && program.timeMeasure !== 'nenhuma' ? ` · ${timeMeasureLabel(program.timeMeasure)}` : ''}
                  {program.type === 'reducao' ? ` · ${programDirection(program) === 'aumentar' ? 'aumentar' : 'reduzir'}` : ''}
                </small>
                {program.type === 'aquisicao' && <small className="aba-program-prompts">{orderedPromptHierarchy(program.promptHierarchy).map(trialCode).join(' › ')}</small>}
                {isRestrictedProcedure(program.procedure) && <small className="aba-warn-text">Procedimento restrito · autorizado por {data.professionalName(program.restrictedAuthorizedBy)}</small>}
              </div>
              <div className="aba-program-actions">
                <span className="aba-status">{program.archivedAt ? 'Arquivado' : program.status}</span>
                {canEdit && !program.archivedAt && (
                  <>
                    <button type="button" className="quiet-button" aria-label={`Editar ${program.name}`} onClick={() => setEditing({ program, isNew: false })}><AbaIcon name="pencil" /></button>
                    <button type="button" className="quiet-button" aria-label={`Arquivar ${program.name}`} onClick={() => setArchiving(program)}><AbaIcon name="trash" /></button>
                  </>
                )}
              </div>
            </article>
          ))}
          {!programs.length && <p className="aba-empty">Nenhum programa ainda.{canEdit ? ' Use um modelo pronto ou a biblioteca abaixo.' : ''}</p>}
        </div>
      </section>

      {canEdit && (
        <>
          <section className="aba-card">
            <div className="aba-section-head">
              <div><p className="aba-eyebrow">Ficha de coleta</p><h3>Modelos prontos</h3></div>
              <small className="aba-muted">Um toque adiciona o treino já configurado</small>
            </div>
            <div className="aba-preset-grid">
              {PROGRAM_PRESETS.map(preset => (
                <button key={preset.id} type="button" className="aba-preset" disabled={busy} onClick={() => void addDirect(programFromPreset(preset, data.settings, activeReinforcers))}>
                  <strong>{preset.label}</strong>
                  <small>{preset.objective}</small>
                  <span>{collectionTypeLabel(preset.collectionType)} · {preset.trialCount ? `${preset.trialCount} oportunidades` : preset.unit} · {preset.minimumPercentage ? `${preset.minimumPercentage}%` : preset.reductionCriterion}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="aba-card">
            <div className="aba-section-head">
              <div><p className="aba-eyebrow">Biblioteca clínica</p><h3>Objetivos por área</h3></div>
              <small className="aba-muted">{templates.length} {templates.length === 1 ? 'encontrado' : 'encontrados'}</small>
            </div>
            <div className="aba-library-filters">
              <input value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }} placeholder="Buscar objetivo" aria-label="Buscar objetivo" />
              <select value={category} onChange={event => { setCategory(event.target.value); setLimit(12); }} aria-label="Área">
                {categories.map(item => <option key={item}>{item}</option>)}
              </select>
            </div>
            <div className="aba-objective-list">
              {templates.slice(0, limit).map(template => (
                <article key={template.key}>
                  <div>
                    <span className="aba-tag">{template.category} · nível {template.level}</span>
                    <h4>{template.title}</h4>
                    <p>{template.target}</p>
                  </div>
                  <div className="aba-button-row">
                    <button type="button" className="quiet-button" disabled={busy} onClick={() => setEditing({ program: baseProgram({ type: 'aquisicao', settings: data.settings, template }), isNew: true })}>Ajustar</button>
                    <button type="button" className="primary-button" disabled={busy} onClick={() => void addDirect(baseProgram({ type: 'aquisicao', settings: data.settings, template }))}><AbaIcon name="plus" /> Adicionar</button>
                  </div>
                </article>
              ))}
            </div>
            {limit < templates.length && (
              <button type="button" className="quiet-button" onClick={() => setLimit(current => current + 12)}>
                Mostrar mais {Math.min(12, templates.length - limit)}
              </button>
            )}
          </section>
        </>
      )}

      {editing && (
        <ProgramEditor
          initial={editing.program}
          isNew={editing.isNew}
          data={data}
          techniques={library.techniques}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged?.(); }}
        />
      )}
      {archiving && (
        <AbaDialog title={`Arquivar “${archiving.name}”`} busy={busy} onClose={() => setArchiving(null)}>
          <p>O programa sai da coleta e da lista. As sessões já registradas e os gráficos continuam.</p>
          <div className="aba-form-actions">
            <button type="button" className="quiet-button" disabled={busy} onClick={() => setArchiving(null)}>Cancelar</button>
            <button type="button" className="primary-button" disabled={busy} onClick={() => void archive()}>Arquivar programa</button>
          </div>
        </AbaDialog>
      )}
    </div>
  );
}

export default AbaPrograms;
