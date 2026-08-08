import { useState } from 'react';
import { CheckGrid } from '../ui/CheckGrid';
import { FieldInput } from '../ui/FieldInput';
import { QuickWordChips } from '../ui/QuickWordChips';
import {
  PSYCHOLOGY_AXES,
  PSYCHOLOGY_AXES_INTRO,
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_FUNCTIONING_GUIDE,
  PSYCHOLOGY_RISK_GROUP,
  PSYCHOLOGY_RISK_ITEMS,
  PSYCHOLOGY_RISK_REMINDER,
  PSYCHOLOGY_TEXT_FIELDS,
  hasPsychologyRiskSelected,
} from '../../data/psychologyAnamnese';
import {
  PSYCHOLOGY_INFORMANT_OPTIONS,
  getPsychologyIntakeProfile,
  getPsychologyProfileSections,
} from '../../data/psychologyIntakeProfiles';
import {
  PSYCHOLOGY_CONTEXT_MODULES,
  PSYCHOLOGY_CONTEXT_MODULES_INTRO,
  isContextModuleOpen,
} from '../../data/psychologyContextModules';

// ============================================================
// Painel: Anamnese clínica de Psicologia (só o formulário).
// A IA assistiva (revisão + leitura) mora no rail lateral do shell
// — ver PsychologyAssistantRail. Aqui fica a escuta: campos livres,
// sinais organizados, bloco de risco e eixos de formulação.
// ============================================================

// Perguntas concretas do roteiro extraído, mostradas como guia de
// escuta sob o rótulo do campo (o profissional lê e pergunta).
export function QuestionGuide({ questions }) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  return (
    <ul className="psi-question-guide">
      {questions.map((q, i) => <li key={i}>{q}</li>)}
    </ul>
  );
}

function InformantControl({ fieldId, current, history, onChange, onArchive }) {
  const value = current || { type: '', name: '' };
  return (
    <div className="psi-informant-box">
      <div className="psi-informant-fields">
        <label>
          Quem respondeu
          <select
            value={value.type || ''}
            onChange={event => onChange(fieldId, { ...value, type: event.target.value })}
          >
            <option value="">Selecionar informante</option>
            {PSYCHOLOGY_INFORMANT_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label>
          Nome ou vínculo complementar
          <input
            lang="pt-BR"
            spellCheck
            value={value.name || ''}
            onChange={event => onChange(fieldId, { ...value, name: event.target.value })}
            placeholder="Ex.: avó materna, professora, adolescente"
          />
        </label>
        <button type="button" className="tag" onClick={() => onArchive(fieldId)}>
          Guardar esta versão e repetir depois
        </button>
      </div>
      {Array.isArray(history) && history.length > 0 && (
        <details className="psi-response-history">
          <summary>{history.length} versão{history.length === 1 ? '' : 'ões'} anterior{history.length === 1 ? '' : 'es'}</summary>
          {history.map(entry => (
            <div key={entry.id} className="psi-response-history-entry">
              <b>{entry.informantLabel || 'Informante não identificado'}</b>
              {entry.informantName && <span> · {entry.informantName}</span>}
              <small>{entry.recordedAt ? new Date(entry.recordedAt).toLocaleString('pt-BR') : ''}</small>
              <p>{entry.value}</p>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

function PsychologyFieldBlock({
  field,
  session,
  showInformant,
  onUpdateField,
  onQuickWord,
  onInformantChange,
  onArchiveResponse,
}) {
  return (
    <div className="psi-field">
      <FieldInput
        label={field.label}
        field={field.id}
        value={session.fields?.[field.id]}
        onChange={onUpdateField}
        textarea={field.textarea}
      />
      <p className="small psi-spellcheck-note">
        Correção ortográfica em pt-BR ativada: palavras suspeitas podem ser sublinhadas pelo navegador.
      </p>
      <QuestionGuide questions={field.questionGuide} />
      <QuickWordChips
        words={field.quickWords}
        onPick={word => onQuickWord(field.id, word)}
      />
      {showInformant && (
        <InformantControl
          fieldId={field.id}
          current={session.fieldInformants?.[field.id]}
          history={session.responseHistory?.[field.id]}
          onChange={onInformantChange}
          onArchive={onArchiveResponse}
        />
      )}
    </div>
  );
}

// Módulos de contexto: abrem por PERTINÊNCIA clínica, não por sexo. O
// percurso escolhido pré-abre alguns; a profissional decide o resto.
// Fechar apenas esconde — o texto já escrito continua guardado na sessão.
function PsychologyContextModules({
  session,
  showInformant,
  onToggleModule,
  onUpdateField,
  onQuickWord,
  onInformantChange,
  onArchiveResponse,
}) {
  return (
    <div className="psi-context-modules">
      <p className="small">{PSYCHOLOGY_CONTEXT_MODULES_INTRO}</p>
      {PSYCHOLOGY_CONTEXT_MODULES.map(module => {
        const open = isContextModuleOpen(session.contextModules, module.id);
        const filled = module.fields
          .filter(field => String(session.fields?.[field.id] || '').trim()).length;
        return (
          <div key={module.id} className={`box psi-context-module${open ? ' open' : ''}`}>
            <div className="psi-context-module-head">
              <div>
                <b>{module.label}</b>
                {filled > 0 && (
                  <span className="psi-context-module-count">
                    {filled} campo{filled === 1 ? '' : 's'} preenchido{filled === 1 ? '' : 's'}
                  </span>
                )}
                <p className="small psi-context-module-summary">{module.summary}</p>
              </div>
              <button
                type="button"
                className={`tag${open ? ' active' : ''}`}
                aria-expanded={open}
                onClick={() => onToggleModule(module.id)}
              >
                {open ? 'Fechar bloco' : 'Abrir bloco'}
              </button>
            </div>
            {open && module.fields.map(field => (
              <PsychologyFieldBlock
                key={field.id}
                field={field}
                session={session}
                showInformant={showInformant}
                onUpdateField={onUpdateField}
                onQuickWord={onQuickWord}
                onInformantChange={onInformantChange}
                onArchiveResponse={onArchiveResponse}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Cartão de um sinal de risco: marca presença + expõe as perguntas de
// triagem e o que observar (do rascunho dos livros). O sistema destaca
// e lembra — nunca decide.
function PsychologyRiskCard({ item, active, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`psi-risk-card${active ? ' active' : ''}`}>
      <div className="psi-risk-card-head">
        <button
          type="button"
          className={`tag${active ? ' active' : ''}`}
          onClick={() => onToggle(PSYCHOLOGY_RISK_GROUP, item.label)}
        >
          {active ? '✓ ' : ''}{item.label}
        </button>
        {(item.screening.length > 0 || item.observe.length > 0) && (
          <button type="button" className="psi-risk-toggle" onClick={() => setOpen(v => !v)}>
            {open ? 'Ocultar guia' : 'Como investigar'}
          </button>
        )}
      </div>
      {item.summary && <p className="small psi-risk-summary">{item.summary}</p>}
      {open && (
        <div className="psi-risk-detail">
          {item.screening.length > 0 && (
            <div>
              <b className="small">Perguntas de triagem</b>
              <ul className="psi-question-guide">
                {item.screening.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
          {item.observe.length > 0 && (
            <div>
              <b className="small">O que observar</b>
              <ul className="psi-question-guide">
                {item.observe.map((o, i) => <li key={i}>{o}</li>)}
              </ul>
            </div>
          )}
          {item.reminder && <p className="small psi-risk-card-reminder">{item.reminder}</p>}
        </div>
      )}
    </div>
  );
}

// Eixos de avaliação e formulação — o andaime de raciocínio clínico.
// Cada eixo traz o que explorar e um campo para a formulação da
// profissional. Descritivo e revisável, sem diagnóstico automático.
function PsychologyAxes({ axes, notes, onNoteChange }) {
  return (
    <div className="psi-axes">
      <p className="small">{PSYCHOLOGY_AXES_INTRO}</p>
      {axes.map(axis => (
        <div key={axis.id} className="psi-axis">
          <div className="psi-axis-head">
            <b>{axis.label}</b>
            {axis.framework && <span className="psi-axis-tag">{axis.framework}</span>}
          </div>
          {axis.summary && <p className="small psi-axis-summary">{axis.summary}</p>}
          {axis.explore.length > 0 && (
            <ul className="psi-question-guide">
              {axis.explore.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
          <textarea
            className="psi-axis-note"
            placeholder="Sua formulação para este eixo (opcional)…"
            value={notes[axis.id] || ''}
            onChange={e => onNoteChange(axis.id, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export function PsychologyAnamnese({
  session,
  onUpdateField,
  onQuickWord,
  onToggleCheck,
  onAxisNote,
  onRiskNotesChange,
  onInformantChange,
  onArchiveResponse,
  onChooseProfile,
  onFillTestAnswers,
  onToggleContextModule,
}) {
  const riskSelected = hasPsychologyRiskSelected(session.selectedMap);
  const profile = getPsychologyIntakeProfile(session.intakeProfile);
  const profileSections = getPsychologyProfileSections(session.intakeProfile);
  const showInformant = profile?.ageGroup === 'infantojuvenil';

  return (
    <section className="psi-anamnese">
      <div className="panel">
        <div className="panel-title">{profile?.label || 'Anamnese clínica — escolha o perfil'}</div>
        <div className="panel-body">
          {!profile ? (
            <div className="box psi-profile-required">
              <h3>Defina primeiro o tipo de anamnese</h3>
              <p>Escolha infantil/adulta e feminino/masculino para carregar o roteiro correto.</p>
              <button type="button" className="primary-button" onClick={onChooseProfile}>
                Escolher anamnese
              </button>
              {onFillTestAnswers && (
                <button type="button" className="tag" onClick={onFillTestAnswers}>
                  Preencher teste aleatório
                </button>
              )}
            </div>
          ) : (
            <div className="box psi-profile-summary">
              <div>
                <p className="app-eyebrow">Percurso ativo</p>
                <h3>{profile.label}</h3>
                {showInformant && (
                  <p className="small">
                    Cada resposta identifica quem informou. Use “Guardar esta versão” antes de repetir
                    a pergunta com a criança/adolescente ou outro responsável.
                  </p>
                )}
              </div>
              <div className="psi-profile-summary-actions">
                <button type="button" className="tag" onClick={onChooseProfile}>Trocar percurso</button>
                {onFillTestAnswers && (
                  <button type="button" className="tag" onClick={onFillTestAnswers}>
                    Preencher teste aleatório
                  </button>
                )}
              </div>
            </div>
          )}

          {profile && (
            <>
          <h3 className="psi-section-title">1. Escuta livre</h3>
          <p className="small">
            Registre com as suas palavras — os botões abaixo de cada campo escrevem por você.
            A revisão assistida (no painel lateral) sugere e redige em rascunho; você decide o que entra e pode corrigi-la.
          </p>
          {PSYCHOLOGY_TEXT_FIELDS.map(field => (
            <PsychologyFieldBlock
              key={field.id}
              field={field}
              session={session}
              showInformant={showInformant}
              onUpdateField={onUpdateField}
              onQuickWord={onQuickWord}
              onInformantChange={onInformantChange}
              onArchiveResponse={onArchiveResponse}
            />
          ))}

          {profileSections.map((section, sectionIndex) => (
            <div key={section.id} className="psi-profile-section">
              <h3 className="psi-section-title">{sectionIndex + 2}. {section.title}</h3>
              {section.fields.map(field => (
                <PsychologyFieldBlock
                  key={field.id}
                  field={field}
                  session={session}
                  showInformant={showInformant}
                  onUpdateField={onUpdateField}
                  onQuickWord={onQuickWord}
                  onInformantChange={onInformantChange}
                  onArchiveResponse={onArchiveResponse}
                />
              ))}
            </div>
          ))}

          <h3 className="psi-section-title">
            {profileSections.length + 2}. Contexto específico (abrir conforme o caso)
          </h3>
          <PsychologyContextModules
            session={session}
            showInformant={showInformant}
            onToggleModule={onToggleContextModule}
            onUpdateField={onUpdateField}
            onQuickWord={onQuickWord}
            onInformantChange={onInformantChange}
            onArchiveResponse={onArchiveResponse}
          />

          <h3 className="psi-section-title">Sinais organizados (proposta a validar)</h3>
          <QuestionGuide questions={PSYCHOLOGY_FUNCTIONING_GUIDE} />
          {PSYCHOLOGY_CHECKLIST_SECTIONS.map(section => (
            <div key={section.group}>
              <h4>{section.title}</h4>
              <CheckGrid
                group={section.group}
                items={section.items}
                selectedMap={session.selectedMap}
                onToggle={onToggleCheck}
              />
            </div>
          ))}

          <h3 className="psi-section-title psi-risk-title">Sinais de risco (sempre conferir)</h3>
          <div className={`box psi-risk-box${riskSelected ? ' psi-risk-active' : ''}`}>
            <div className="psi-risk-cards">
              {PSYCHOLOGY_RISK_ITEMS.map(item => (
                <PsychologyRiskCard
                  key={item.id}
                  item={item}
                  active={!!session.selectedMap[`${PSYCHOLOGY_RISK_GROUP}:${item.label}`]}
                  onToggle={onToggleCheck}
                />
              ))}
            </div>
            {riskSelected && (
              <div className="alert psi-risk-reminder">
                <b>⚠ Atenção.</b> {PSYCHOLOGY_RISK_REMINDER}
              </div>
            )}
            <FieldInput
              label="Anotações sobre risco e conduta combinada"
              field="riskNotes"
              value={session.riskNotes}
              onChange={(_, value) => onRiskNotesChange(value)}
              textarea
            />
          </div>

          <h3 className="psi-section-title">Eixos de avaliação e formulação</h3>
          <PsychologyAxes
            axes={PSYCHOLOGY_AXES}
            notes={session.axisNotes || {}}
            onNoteChange={onAxisNote}
          />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
