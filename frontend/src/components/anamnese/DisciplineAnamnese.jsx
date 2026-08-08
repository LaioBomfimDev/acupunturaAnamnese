import { useState } from 'react';
import { CheckGrid } from '../ui/CheckGrid';
import { FieldInput } from '../ui/FieldInput';
import { QuickWordChips } from '../ui/QuickWordChips';
import {
  getProfile,
  getProfileSections,
  hasRiskSelected,
  isContextModuleOpen,
} from '../../data/anamneseKit';

// ============================================================
// Painel genérico de anamnese, guiado por configuração.
//
// A mesma tela serve qualquer disciplina: o que muda é o vocabulário
// (data/*Anamnese.js). Estrutura fixa, porque a ordem da escuta é a
// mesma em todas: escuta livre → roteiro do percurso → contexto por
// pertinência → sinais → risco → eixos de raciocínio.
//
// Invariante: o sistema organiza, destaca e lembra. Nada aqui decide
// conduta nem fecha diagnóstico — isso é da profissional.
// ============================================================

// Perguntas de escuta mostradas sob o rótulo do campo: o profissional
// lê e pergunta. Não é texto a inserir na ficha.
export function QuestionGuide({ questions }) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  return (
    <ul className="psi-question-guide">
      {questions.map((q, i) => <li key={i}>{q}</li>)}
    </ul>
  );
}

export function AnamneseFieldBlock({ field, session, onUpdateField, onQuickWord, children }) {
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
      {children}
    </div>
  );
}

// Módulos de contexto: abrem por PERTINÊNCIA clínica. Fechar apenas
// esconde — o texto já escrito continua guardado na sessão.
function ContextModules({ config, session, onToggleModule, onUpdateField, onQuickWord }) {
  return (
    <div className="psi-context-modules">
      <p className="small">
        Blocos abertos por pertinência clínica. O percurso escolhido já sugere alguns; abra ou feche
        livremente conforme o caso. Fechar um bloco apenas o esconde — o que já foi escrito é preservado.
      </p>
      {config.contextModules.map(module => {
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
              <AnamneseFieldBlock
                key={field.id}
                field={field}
                session={session}
                onUpdateField={onUpdateField}
                onQuickWord={onQuickWord}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Cartão de sinal de risco: marca presença + expõe perguntas de triagem
// e o que observar. O sistema destaca e lembra — nunca decide.
function RiskCard({ item, group, active, onToggle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`psi-risk-card${active ? ' active' : ''}`}>
      <div className="psi-risk-card-head">
        <button
          type="button"
          className={`tag${active ? ' active' : ''}`}
          onClick={() => onToggle(group, item.label)}
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

// Eixos de raciocínio: cada eixo traz o que explorar e um campo para a
// formulação da profissional. Descritivo e revisável, sem automatismo.
function Axes({ config, notes, onNoteChange }) {
  return (
    <div className="psi-axes">
      <p className="small">{config.axesIntro}</p>
      {config.axes.map(axis => (
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

export function DisciplineAnamnese({
  config,
  session,
  onUpdateField,
  onQuickWord,
  onToggleCheck,
  onToggleContextModule,
  onAxisNote,
  onRiskNotesChange,
  onChooseProfile,
  onFillTestAnswers,
}) {
  const riskSelected = hasRiskSelected(config, session.selectedMap);
  const profile = getProfile(config, session.intakeProfile);
  const profileSections = getProfileSections(config, session.intakeProfile);

  return (
    <section className="psi-anamnese">
      <div className="panel">
        <div className="panel-title">
          {profile?.label || `Anamnese de ${config.label} — escolha o percurso`}
        </div>
        <div className="panel-body">
          {!profile ? (
            <div className="box psi-profile-required">
              <h3>Defina primeiro o percurso</h3>
              <p>{config.pathsIntro}</p>
              <button type="button" className="primary-button" onClick={onChooseProfile}>
                Escolher percurso
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
                <p className="small">{profile.description}</p>
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
                Registre com as suas palavras — os botões abaixo de cada campo escrevem por você,
                e as perguntas em cinza são guia de escuta, não texto a inserir.
              </p>
              {config.textFields.map(field => (
                <AnamneseFieldBlock
                  key={field.id}
                  field={field}
                  session={session}
                  onUpdateField={onUpdateField}
                  onQuickWord={onQuickWord}
                />
              ))}

              {profileSections.map((section, index) => (
                <div key={section.id} className="psi-profile-section">
                  <h3 className="psi-section-title">{index + 2}. {section.title}</h3>
                  {section.fields.map(field => (
                    <AnamneseFieldBlock
                      key={field.id}
                      field={field}
                      session={session}
                      onUpdateField={onUpdateField}
                      onQuickWord={onQuickWord}
                    />
                  ))}
                </div>
              ))}

              <h3 className="psi-section-title">
                {profileSections.length + 2}. {config.contextTitle}
              </h3>
              <ContextModules
                config={config}
                session={session}
                onToggleModule={onToggleContextModule}
                onUpdateField={onUpdateField}
                onQuickWord={onQuickWord}
              />

              <h3 className="psi-section-title">{config.checklistsTitle}</h3>
              {config.checklistSections.map(section => (
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

              <h3 className="psi-section-title psi-risk-title">{config.riskTitle}</h3>
              <div className={`box psi-risk-box${riskSelected ? ' psi-risk-active' : ''}`}>
                <div className="psi-risk-cards">
                  {config.riskItems.map(item => (
                    <RiskCard
                      key={item.id}
                      item={item}
                      group={config.riskGroup}
                      active={!!session.selectedMap[`${config.riskGroup}:${item.label}`]}
                      onToggle={onToggleCheck}
                    />
                  ))}
                </div>
                {riskSelected && (
                  <div className="alert psi-risk-reminder">
                    <b>⚠ Atenção.</b> {config.riskReminder}
                  </div>
                )}
                <FieldInput
                  label={config.riskNotesLabel}
                  field="riskNotes"
                  value={session.riskNotes}
                  onChange={(_, value) => onRiskNotesChange(value)}
                  textarea
                />
              </div>

              <h3 className="psi-section-title">{config.axesTitle}</h3>
              <Axes
                config={config}
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
