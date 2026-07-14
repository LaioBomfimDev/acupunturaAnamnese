import { Panel } from '../ui/Panel';
import { FieldInput } from '../ui/FieldInput';
import {
  NEUROPSYCHOLOGY_DRAFT_NOTICE,
  NEUROPSYCHOLOGY_INSTRUMENT_TEMPLATES,
  buildNeuropsychologySummary,
  createNeuropsychologySession,
} from '../../data/neuropsychologyEvaluation';

const INTEGRATION_FIELDS = [
  ['procedures', 'Procedimentos realizados'],
  ['clinicalObservations', 'Observações clínicas integradas'],
  ['resultsSummary', 'Síntese dos resultados'],
  ['convergences', 'Convergências entre fontes, instrumentos e observações'],
  ['divergences', 'Divergências ou incongruências encontradas'],
  ['workingHypotheses', 'Hipóteses de trabalho para revisão profissional'],
  ['differentialQuestions', 'Questões para diagnóstico diferencial'],
  ['limitations', 'Limitações da avaliação'],
  ['professionalConclusion', 'Conclusão profissional'],
  ['recommendations', 'Recomendações registradas pela profissional'],
];

function TextArea({ value, onChange, placeholder }) {
  return (
    <textarea
      lang="pt-BR"
      spellCheck
      autoCorrect="on"
      autoCapitalize="sentences"
      value={value || ''}
      onChange={event => onChange(event.target.value)}
      placeholder={placeholder}
    />
  );
}

export function PsychologyNeuroAssessment({ evaluation, onChange, onChoosePath }) {
  const summary = buildNeuropsychologySummary(evaluation);
  const sessions = Array.isArray(evaluation.sessions) ? evaluation.sessions : [];
  const instruments = Array.isArray(evaluation.instruments) ? evaluation.instruments : [];

  function updateReferral(field, value) {
    onChange({ ...evaluation, referral: { ...evaluation.referral, [field]: value } });
  }

  function updateIntegration(field, value) {
    onChange({ ...evaluation, integration: { ...evaluation.integration, [field]: value } });
  }

  function addInstrument(template) {
    const id = `instrument-custom-${instruments.length + 1}`;
    onChange({
      ...evaluation,
      instruments: [...instruments, {
        id,
        name: template?.name || 'Novo instrumento',
        domain: template?.domain || '',
        purpose: '',
        sessionNumber: '',
        status: 'a_revisar',
        rawResult: '',
        professionalInterpretation: '',
      }],
    });
  }

  function updateInstrument(index, field, value) {
    onChange({
      ...evaluation,
      instruments: instruments.map((item, itemIndex) => (
        itemIndex === index ? { ...item, [field]: value } : item
      )),
    });
  }

  function removeInstrument(index) {
    onChange({ ...evaluation, instruments: instruments.filter((_, itemIndex) => itemIndex !== index) });
  }

  function updateSession(index, field, value) {
    onChange({
      ...evaluation,
      sessions: sessions.map((session, sessionIndex) => (
        sessionIndex === index ? { ...session, [field]: value } : session
      )),
    });
  }

  function addSession() {
    onChange({ ...evaluation, sessions: [...sessions, createNeuropsychologySession(sessions.length + 1)] });
  }

  function removeLastSession() {
    if (sessions.length <= 1) return;
    onChange({ ...evaluation, sessions: sessions.slice(0, -1) });
  }

  return (
    <Panel title="Avaliação neuropsicológica">
      <div className="alert psi-draft-banner">
        <b>Rascunho para validação da neuropsicóloga.</b> {NEUROPSYCHOLOGY_DRAFT_NOTICE}
      </div>

      <div className="psi-profile-summary box">
        <div>
          <p className="app-eyebrow">Percurso independente</p>
          <h3>Avaliação neuropsicológica longitudinal</h3>
          <p className="small">
            A anamnese clínica permanece em registro próprio. Aqui ficam planejamento, instrumentos,
            sessões/evoluções, resultados, integração e relatório da avaliação.
          </p>
        </div>
        <button type="button" className="tag" onClick={onChoosePath}>Trocar percurso</button>
      </div>

      <div className="cards summary-cards">
        <div className="card"><p className="small">Sessões preenchidas</p><h3>{summary.completedSessions}/{summary.plannedSessions}</h3></div>
        <div className="card"><p className="small">Instrumentos</p><h3>{summary.instrumentCount}</h3></div>
        <div className="card"><p className="small">Instrumentos revisados</p><h3>{summary.reviewedInstruments}</h3></div>
        <div className="card"><p className="small">Campos de integração</p><h3>{summary.integrationFields}</h3></div>
      </div>

      <section className="psi-neuro-section">
        <h3>1. Encaminhamento e perguntas da avaliação</h3>
        <FieldInput label="Solicitante / encaminhamento" field="requester" value={evaluation.referral.requester} onChange={updateReferral} textarea />
        <FieldInput label="Motivo da avaliação" field="reason" value={evaluation.referral.reason} onChange={updateReferral} textarea />
        <FieldInput label="Perguntas que a avaliação precisa responder" field="questions" value={evaluation.referral.questions} onChange={updateReferral} textarea />
        <FieldInput label="Hipóteses anteriores informadas — ainda não confirmadas" field="priorHypotheses" value={evaluation.referral.priorHypotheses} onChange={updateReferral} textarea />
        <FieldInput label="Histórico relevante para o processo avaliativo" field="relevantHistory" value={evaluation.referral.relevantHistory} onChange={updateReferral} textarea />
      </section>

      <section className="psi-neuro-section">
        <h3>2. Instrumentos e procedimentos</h3>
        <p className="small">
          Os atalhos são categorias iniciais baseadas no material enviado. A neuropsicóloga deve confirmar
          indicação, instrumento exato, condições de uso, correção e interpretação.
        </p>
        <div className="quick-words" role="group" aria-label="Adicionar instrumento sugerido">
          {NEUROPSYCHOLOGY_INSTRUMENT_TEMPLATES.map(template => (
            <button key={template.name} type="button" className="quick-word-chip" onClick={() => addInstrument(template)}>
              + {template.name}
            </button>
          ))}
          <button type="button" className="quick-word-chip" onClick={() => addInstrument(null)}>+ Outro instrumento</button>
        </div>

        <div className="psi-neuro-instruments">
          {instruments.map((instrument, index) => (
            <div key={instrument.id || index} className="box psi-neuro-instrument">
              <div className="psi-neuro-row-head">
                <b>Instrumento/procedimento {index + 1}</b>
                <button type="button" className="tag" onClick={() => removeInstrument(index)}>Remover</button>
              </div>
              <div className="form-grid two">
                <label>Nome<input value={instrument.name || ''} onChange={event => updateInstrument(index, 'name', event.target.value)} /></label>
                <label>Domínio<input value={instrument.domain || ''} onChange={event => updateInstrument(index, 'domain', event.target.value)} /></label>
                <label>Sessão prevista<input type="number" min="1" value={instrument.sessionNumber || ''} onChange={event => updateInstrument(index, 'sessionNumber', event.target.value)} /></label>
                <label>Status
                  <select value={instrument.status || 'a_revisar'} onChange={event => updateInstrument(index, 'status', event.target.value)}>
                    <option value="a_revisar">A revisar</option>
                    <option value="planejado">Planejado</option>
                    <option value="aplicado">Aplicado</option>
                    <option value="corrigido">Corrigido</option>
                    <option value="revisado">Revisado pela profissional</option>
                  </select>
                </label>
              </div>
              <label>Objetivo do uso<TextArea value={instrument.purpose} onChange={value => updateInstrument(index, 'purpose', value)} /></label>
              <label>Resultado bruto/descrição factual<TextArea value={instrument.rawResult} onChange={value => updateInstrument(index, 'rawResult', value)} /></label>
              <label>Interpretação da profissional<TextArea value={instrument.professionalInterpretation} onChange={value => updateInstrument(index, 'professionalInterpretation', value)} /></label>
            </div>
          ))}
        </div>
      </section>

      <section className="psi-neuro-section">
        <div className="psi-neuro-row-head">
          <div>
            <h3>3. Sessões e evoluções da avaliação</h3>
            <p className="small">Dez sessões são o roteiro inicial; a profissional pode adicionar ou remover conforme o caso.</p>
          </div>
          <div className="psi-neuro-row-actions">
            <button type="button" className="tag" onClick={addSession}>Adicionar sessão</button>
            <button type="button" className="tag" onClick={removeLastSession} disabled={sessions.length <= 1}>Remover última</button>
          </div>
        </div>
        <div className="psi-neuro-sessions">
          {sessions.map((session, index) => (
            <details key={session.id || index} className="box psi-neuro-session" open={index === 0}>
              <summary>
                <b>Sessão {index + 1}</b> — {session.purpose || 'Sem objetivo definido'}
                <span>{session.status === 'concluida' ? 'Concluída' : 'Planejada'}</span>
              </summary>
              <div className="form-grid two">
                <label>Data<input value={session.date || ''} onChange={event => updateSession(index, 'date', event.target.value)} placeholder="dd/mm/aaaa" /></label>
                <label>Status
                  <select value={session.status || 'planejada'} onChange={event => updateSession(index, 'status', event.target.value)}>
                    <option value="planejada">Planejada</option>
                    <option value="em_andamento">Em andamento</option>
                    <option value="concluida">Concluída</option>
                    <option value="remarcada">Remarcada</option>
                    <option value="cancelada">Cancelada</option>
                  </select>
                </label>
              </div>
              <label>Objetivo da sessão<TextArea value={session.purpose} onChange={value => updateSession(index, 'purpose', value)} /></label>
              <label>Participantes<TextArea value={session.participants} onChange={value => updateSession(index, 'participants', value)} placeholder="Paciente, mãe, pai, responsável ou outro informante" /></label>
              <label>Informante principal<TextArea value={session.informant} onChange={value => updateSession(index, 'informant', value)} /></label>
              <label>Instrumentos/procedimentos realizados<TextArea value={session.instruments} onChange={value => updateSession(index, 'instruments', value)} /></label>
              <label>Observações clínicas<TextArea value={session.observations} onChange={value => updateSession(index, 'observations', value)} /></label>
              <label>Comportamento durante a sessão<TextArea value={session.behavior} onChange={value => updateSession(index, 'behavior', value)} /></label>
              <label>Resultados parciais — sem conclusão automática<TextArea value={session.partialResults} onChange={value => updateSession(index, 'partialResults', value)} /></label>
              <label>Intercorrências<TextArea value={session.intercurrences} onChange={value => updateSession(index, 'intercurrences', value)} /></label>
              <label>Próximos passos<TextArea value={session.nextSteps} onChange={value => updateSession(index, 'nextSteps', value)} /></label>
            </details>
          ))}
        </div>
      </section>

      <section className="psi-neuro-section">
        <h3>4. Integração profissional</h3>
        <p className="small">
          Campos interpretativos permanecem em rascunho até revisão explícita da neuropsicóloga.
          O sistema não transforma resultado de instrumento em diagnóstico automaticamente.
        </p>
        {INTEGRATION_FIELDS.map(([field, label]) => (
          <FieldInput
            key={field}
            label={label}
            field={field}
            value={evaluation.integration?.[field]}
            onChange={updateIntegration}
            textarea
          />
        ))}
      </section>
    </Panel>
  );
}
