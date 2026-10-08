import { useMemo, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { DismissPrompt } from '../ui/DismissPrompt';
import {
  LIMITS,
  QUESTION_TYPES,
  conditionSources,
  createQuestion,
  isAnswerable,
  markingShare,
  newQuestionId,
  normalizeQuestions,
  optionsOf,
  questionTypeLabel,
  scaleRange,
  validateForm,
} from '../../utils/patientForms';
import { savePatientForm } from '../../services/patientPortalService';
import { PatientFormRunner } from './PatientFormRunner';
import '../../styles/patientForms.css';

// ============================================================
// Editor de um formulário (Gestão → Importáveis). Janela inteira por
// cima da Gestão: Esc/clique fora perguntam antes de descartar o que
// não foi salvo (useDismiss com `unsaved`, porque quase tudo aqui muda
// por botão). "Pré-visualizar" mostra exatamente a tela do paciente.
//
// Rascunho aceita pergunta pela metade; publicar confere tudo
// (validateForm). Formulário publicado editado continua publicado: o
// que já foi enviado não muda (o envio guarda uma cópia).
// ============================================================

function snapshotOf({ title, description, questions }) {
  return JSON.stringify({ title: title.trim(), description: description.trim(), questions: normalizeQuestions(questions) });
}

function retargetType(question, type) {
  const fresh = createQuestion(type);
  const keep = { id: question.id, label: question.label, help: question.help };
  if (type === 'section') return { ...fresh, ...keep };
  return {
    ...fresh,
    ...keep,
    required: Boolean(question.required),
    showIf: question.showIf || null,
    options: (type === 'single' || type === 'multiple') && question.options?.length ? question.options : fresh.options,
  };
}

function TypeButtons({ onPick }) {
  return (
    <div className="pq-type-buttons">
      {QUESTION_TYPES.map(type => (
        <button key={type.id} type="button" className="gt-btn gt-btn--sm" onClick={() => onPick(type.id)}>
          + {type.label}
        </button>
      ))}
    </div>
  );
}

function QuestionCard({ question, index, total, questions, onChange, onMove, onDuplicate, onRemove, onInsertBelow }) {
  const isSection = question.type === 'section';
  const sources = conditionSources(questions, index);
  const source = sources.find(item => item.id === question.showIf?.questionId) || null;
  const update = patch => onChange({ ...question, ...patch });
  const options = question.options || [];

  function setOption(position, value) {
    const next = [...options];
    next[position] = value;
    update({ options: next });
  }

  function toggleConditionValue(value) {
    const values = question.showIf?.values || [];
    const next = values.includes(value) ? values.filter(item => item !== value) : [...values, value];
    update({ showIf: { questionId: question.showIf.questionId, values: next } });
  }

  return (
    <li className="pq-edit-card" data-type={question.type}>
      <div className="pq-edit-head">
        <span className="pq-edit-tag">{isSection ? 'Nova parte' : `Pergunta ${index + 1}`}</span>
        <select
          className="pq-select"
          aria-label="Tipo da pergunta"
          value={question.type}
          onChange={event => onChange(retargetType(question, event.target.value))}
        >
          {QUESTION_TYPES.map(type => <option key={type.id} value={type.id}>{type.label}</option>)}
        </select>
        <div className="pq-edit-tools">
          <button type="button" className="pq-icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Subir">↑</button>
          <button type="button" className="pq-icon-btn" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Descer">↓</button>
          <button type="button" className="pq-icon-btn" onClick={onInsertBelow}>+ Abaixo</button>
          <button type="button" className="pq-icon-btn" onClick={onDuplicate}>Duplicar</button>
          <button type="button" className="pq-icon-btn" onClick={onRemove}>Remover</button>
        </div>
      </div>

      <label className="pq-label">
        {isSection ? 'Título da parte' : 'Pergunta'}
        <input
          className="pq-input"
          value={question.label}
          maxLength={LIMITS.labelMax}
          placeholder={isSection ? 'Ex.: Sono e alimentação' : 'Escreva a pergunta como o paciente vai ler'}
          onChange={event => update({ label: event.target.value })}
        />
      </label>
      <label className="pq-label">
        Explicação (opcional)
        <input
          className="pq-input"
          value={question.help || ''}
          maxLength={LIMITS.helpMax}
          placeholder="Aparece em letra menor, embaixo"
          onChange={event => update({ help: event.target.value })}
        />
      </label>

      {(question.type === 'single' || question.type === 'multiple') && (
        <div className="pq-label">
          Opções
          {options.map((option, position) => (
            <div className="pq-option-edit" key={position}>
              <input
                className="pq-input"
                value={option}
                maxLength={LIMITS.optionMax}
                aria-label={`Opção ${position + 1}`}
                onChange={event => setOption(position, event.target.value)}
              />
              <button
                type="button"
                className="pq-icon-btn"
                aria-label={`Remover opção ${position + 1}`}
                onClick={() => update({ options: options.filter((_, item) => item !== position) })}
              >
                ×
              </button>
            </div>
          ))}
          <div className="pq-edit-row">
            <button
              type="button"
              className="gt-btn gt-btn--sm"
              disabled={options.length >= LIMITS.maxOptions}
              onClick={() => update({ options: [...options, `Opção ${options.length + 1}`] })}
            >
              + Opção
            </button>
            <label className="pq-check">
              <input type="checkbox" checked={Boolean(question.allowOther)} onChange={event => update({ allowOther: event.target.checked })} />
              Incluir “Outro: qual?”
            </label>
          </div>
        </div>
      )}

      {question.type === 'yes_no' && (
        <label className="pq-check">
          <input type="checkbox" checked={Boolean(question.allowUnknown)} onChange={event => update({ allowUnknown: event.target.checked })} />
          Incluir “Não sei”
        </label>
      )}

      {question.type === 'scale' && (() => {
        const { min, max } = scaleRange(question);
        const scale = question.scale || {};
        return (
          <div className="pq-scale-edit">
            <label className="pq-label">
              Vai de
              <select className="pq-select" value={min} onChange={event => update({ scale: { ...scale, min: Number(event.target.value), max } })}>
                <option value={0}>0</option>
                <option value={1}>1</option>
              </select>
            </label>
            <label className="pq-label">
              Até
              <select className="pq-select" value={max} onChange={event => update({ scale: { ...scale, min, max: Number(event.target.value) } })}>
                {[3, 4, 5, 6, 7, 8, 9, 10].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="pq-label">
              Texto do menor (opcional)
              <input className="pq-input" value={scale.minLabel || ''} maxLength={40} placeholder="Ex.: Nada" onChange={event => update({ scale: { ...scale, min, max, minLabel: event.target.value } })} />
            </label>
            <label className="pq-label">
              Texto do maior (opcional)
              <input className="pq-input" value={scale.maxLabel || ''} maxLength={40} placeholder="Ex.: Muito" onChange={event => update({ scale: { ...scale, min, max, maxLabel: event.target.value } })} />
            </label>
          </div>
        );
      })()}

      {!isSection && (
        <div className="pq-edit-row">
          <label className="pq-check">
            <input type="checkbox" checked={Boolean(question.required)} onChange={event => update({ required: event.target.checked })} />
            Obrigatória
          </label>
          {sources.length > 0 && (
            <label className="pq-check">
              <input
                type="checkbox"
                checked={Boolean(question.showIf)}
                onChange={event => update({
                  showIf: event.target.checked ? { questionId: sources[sources.length - 1].id, values: [] } : null,
                })}
              />
              Só aparece conforme outra resposta
            </label>
          )}
        </div>
      )}

      {!isSection && question.showIf && (
        <div className="pq-condition">
          <label className="pq-label">
            Aparece quando a pergunta
            <select
              className="pq-select"
              value={question.showIf.questionId}
              onChange={event => update({ showIf: { questionId: event.target.value, values: [] } })}
            >
              {!source && <option value={question.showIf.questionId}>(pergunta removida ou movida para baixo)</option>}
              {sources.map(item => (
                <option key={item.id} value={item.id}>
                  {questions.indexOf(item) + 1}. {item.label || questionTypeLabel(item.type)}
                </option>
              ))}
            </select>
          </label>
          {source && (
            <div className="pq-condition-values" role="group" aria-label="Respostas que mostram esta pergunta">
              <span className="pq-label">for respondida com:</span>
              {optionsOf(source).map(value => (
                <label key={value} className="pq-check">
                  <input
                    type="checkbox"
                    checked={(question.showIf.values || []).includes(value)}
                    onChange={() => toggleConditionValue(value)}
                  />
                  {value}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function PatientFormEditor({ form = null, clinicId, onClose, onSaved }) {
  const [title, setTitle] = useState(form?.title || '');
  const [description, setDescription] = useState(form?.description || '');
  const [questions, setQuestions] = useState(() => (form?.questions?.length ? form.questions : []));
  const [savedId, setSavedId] = useState(form?.id || null);
  const [status, setStatus] = useState(form?.status || 'draft');
  const [saved, setSaved] = useState(() => snapshotOf({
    title: form?.title || '', description: form?.description || '', questions: form?.questions || [],
  }));
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState('edit');
  const [previewAnswers, setPreviewAnswers] = useState({});
  const [insertAt, setInsertAt] = useState(null);

  const unsaved = snapshotOf({ title, description, questions }) !== saved;
  const dismiss = useDismiss({ onClose, busy: saving, guardUnsaved: true, unsaved });
  const share = useMemo(() => markingShare(questions), [questions]);
  const normalized = useMemo(() => normalizeQuestions(questions), [questions]);

  function changeQuestions(next) {
    setQuestions(next);
    setNotice('');
  }

  function addQuestion(type, position = questions.length) {
    const next = [...questions];
    next.splice(position, 0, createQuestion(type));
    changeQuestions(next);
    setInsertAt(null);
  }

  function moveQuestion(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    changeQuestions(next);
  }

  function duplicateQuestion(index) {
    const copy = { ...structuredClone(questions[index]), id: newQuestionId() };
    const next = [...questions];
    next.splice(index + 1, 0, copy);
    changeQuestions(next);
  }

  function removeQuestion(index) {
    const removedId = questions[index].id;
    // Quem dependia da pergunta removida volta a aparecer sempre.
    changeQuestions(questions
      .filter((_, position) => position !== index)
      .map(question => (question.showIf?.questionId === removedId ? { ...question, showIf: null } : question)));
  }

  async function handleSave(nextStatus) {
    const forPublish = nextStatus === 'published';
    const problems = validateForm({ title, description, questions }, { forPublish });
    setErrors(problems);
    setNotice('');
    if (problems.length) return;

    setSaving(true);
    try {
      const row = await savePatientForm({
        id: savedId,
        clinicId,
        title,
        description,
        questions: normalized,
        status: nextStatus,
      });
      setSavedId(row.id);
      setStatus(row.status);
      setQuestions(row.questions || []);
      setSaved(snapshotOf({ title: row.title, description: row.description || '', questions: row.questions || [] }));
      dismiss.markSaved();
      setNotice(row.status === 'published'
        ? 'Publicado. Já dá para enviar aos pacientes.'
        : 'Rascunho salvo. Publique quando estiver pronto para enviar.');
      onSaved?.(row);
    } catch (err) {
      setErrors([err.message]);
    } finally {
      setSaving(false);
    }
  }

  const isPublished = status === 'published';

  return (
    <div className="pq-overlay" role="dialog" aria-modal="true" aria-label="Editar formulário" {...dismiss.backdropProps}>
      <div className="pq-panel" {...dismiss.panelProps}>
        <header className="pq-panel-head">
          <div>
            <h3>{savedId ? 'Editar formulário' : 'Novo formulário'}</h3>
            <p>{isPublished ? 'Publicado' : 'Rascunho'} · {unsaved ? 'alterações não salvas' : 'tudo salvo'}</p>
          </div>
          <div className="gt-segmented" role="group" aria-label="Modo">
            <button type="button" aria-pressed={mode === 'edit'} onClick={() => setMode('edit')}>Editar</button>
            <button type="button" aria-pressed={mode === 'preview'} onClick={() => { setPreviewAnswers({}); setMode('preview'); }}>
              Pré-visualizar
            </button>
          </div>
          <button type="button" className="pq-close" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <DismissPrompt dismiss={dismiss} />

        <div className="pq-panel-body">
          {mode === 'preview' ? (
            <div className="pq-preview-frame">
              <h2 className="pq-preview-title">{title || 'Formulário sem nome'}</h2>
              {description && <p className="pq-intro">{description}</p>}
              {normalized.some(isAnswerable) ? (
                <PatientFormRunner
                  key={normalized.length}
                  questions={normalized}
                  answers={previewAnswers}
                  onAnswersChange={setPreviewAnswers}
                  preview
                />
              ) : (
                <p className="gt-empty">Ainda não há perguntas para mostrar.</p>
              )}
            </div>
          ) : (
            <>
              <div className="pq-editor-meta">
                <label className="pq-label">
                  Nome do formulário
                  <input
                    className="pq-input"
                    value={title}
                    maxLength={LIMITS.titleMax}
                    placeholder="Ex.: Entrevista inicial"
                    onChange={event => { setTitle(event.target.value); setNotice(''); }}
                  />
                </label>
                <label className="pq-label">
                  Instruções para o paciente (opcional)
                  <textarea
                    className="pq-textarea"
                    value={description}
                    maxLength={LIMITS.descriptionMax}
                    placeholder="Aparece no topo, antes das perguntas"
                    onChange={event => { setDescription(event.target.value); setNotice(''); }}
                  />
                </label>
                {share.total > 0 && (
                  <div className="pq-marking">
                    <span>
                      De marcar: <b>{share.marking} de {share.total}</b> {share.total === 1 ? 'pergunta' : 'perguntas'} ({share.percent}%).
                      {' '}Meta combinada: 80% a 90% de marcar, o resto o paciente digita.
                    </span>
                    <div className="pq-progress-track" aria-hidden="true">
                      <div className="pq-progress-fill" style={{ width: `${share.percent}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {questions.length === 0 && (
                <p className="gt-empty">Comece escolhendo o tipo da primeira pergunta logo abaixo.</p>
              )}

              <ol className="pq-edit-list">
                {questions.map((question, index) => (
                  <QuestionCardSlot
                    key={question.id}
                    question={question}
                    index={index}
                    questions={questions}
                    insertAt={insertAt}
                    onChange={next => changeQuestions(questions.map((item, position) => (position === index ? next : item)))}
                    onMove={delta => moveQuestion(index, delta)}
                    onDuplicate={() => duplicateQuestion(index)}
                    onRemove={() => removeQuestion(index)}
                    onInsertBelow={() => setInsertAt(insertAt === index + 1 ? null : index + 1)}
                    onPick={type => addQuestion(type, index + 1)}
                  />
                ))}
              </ol>

              <div className="pq-type-picker">
                <p>Adicionar no fim</p>
                <TypeButtons onPick={type => addQuestion(type)} />
              </div>
            </>
          )}
        </div>

        <footer className="pq-panel-foot">
          {errors.length > 0 && (
            <ul className="pq-errors" role="alert" style={{ flexBasis: '100%' }}>
              {errors.map(error => <li key={error}>{error}</li>)}
            </ul>
          )}
          {notice && <p className="pq-foot-note" role="status">{notice}</p>}
          {!notice && (
            <p className="pq-foot-note">
              {isPublished ? 'Quem já recebeu continua com a versão que recebeu.' : 'Só formulário publicado pode ser enviado.'}
            </p>
          )}
          {isPublished ? (
            <>
              <button type="button" className="gt-btn" onClick={() => handleSave('draft')} disabled={saving}>
                Voltar a rascunho
              </button>
              <button type="button" className="gt-btn gt-btn--primary" onClick={() => handleSave('published')} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="gt-btn" onClick={() => handleSave('draft')} disabled={saving}>
                {saving ? 'Salvando…' : 'Salvar rascunho'}
              </button>
              <button type="button" className="gt-btn gt-btn--primary" onClick={() => handleSave('published')} disabled={saving}>
                Publicar
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}

// Card + o seletor de tipo que abre logo abaixo dele em "+ Abaixo".
function QuestionCardSlot({ question, index, questions, insertAt, onPick, ...handlers }) {
  return (
    <>
      <QuestionCard question={question} index={index} total={questions.length} questions={questions} {...handlers} />
      {insertAt === index + 1 && (
        <li className="pq-type-picker">
          <p>Adicionar abaixo da {question.type === 'section' ? 'parte' : `pergunta ${index + 1}`}</p>
          <TypeButtons onPick={onPick} />
        </li>
      )}
    </>
  );
}

export default PatientFormEditor;
