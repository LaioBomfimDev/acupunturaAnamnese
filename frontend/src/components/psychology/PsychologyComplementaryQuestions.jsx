import { useState } from 'react';
import { Panel } from '../ui/Panel';
import { PSYCHOLOGY_INFORMANT_OPTIONS } from '../../data/psychologyIntakeProfiles';

function createManualQuestion(question) {
  return {
    id: `complementary-question-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    question: question.trim(),
    answer: '',
    informantType: '',
    informantName: '',
    source: 'manual',
    sourceQuestion: '',
    modelVersion: '',
    selectedAt: new Date().toISOString(),
    answeredAt: null,
  };
}

export function PsychologyComplementaryQuestions({ session, onQuestionsChange, onOpenAnamnese }) {
  const [manualQuestion, setManualQuestion] = useState('');
  const questions = Array.isArray(session.complementaryQuestions)
    ? session.complementaryQuestions
    : [];
  const answeredCount = questions.filter(item => String(item.answer || '').trim()).length;

  function updateQuestion(id, field, value) {
    onQuestionsChange?.(questions.map(item => {
      if (item.id !== id) return item;
      const next = { ...item, [field]: value };
      if (field === 'answer') {
        next.answeredAt = String(value || '').trim() ? new Date().toISOString() : null;
      }
      return next;
    }));
  }

  function removeQuestion(item) {
    const hasAnswer = Boolean(String(item.answer || '').trim());
    if (hasAnswer && !window.confirm('Remover esta pergunta também apagará a resposta registrada. Deseja continuar?')) {
      return;
    }
    onQuestionsChange?.(questions.filter(question => question.id !== item.id));
  }

  function addManualQuestion() {
    const value = manualQuestion.trim();
    if (!value) return;
    onQuestionsChange?.([...questions, createManualQuestion(value)]);
    setManualQuestion('');
  }

  return (
    <Panel title="Perguntas complementares">
      <div className="psi-complementary-hero">
        <div>
          <p className="app-eyebrow">Aprofundamento da anamnese</p>
          <h2>{answeredCount}/{questions.length} respondidas</h2>
          <p>
            As sugestões da IA só aparecem aqui depois que você as seleciona. Revise a redação,
            registre quem respondeu e escreva a resposta com suas palavras. Perguntas e respostas
            passam a compor a anamnese, as próximas leituras da IA e o relatório.
          </p>
        </div>
        <button type="button" className="tag" onClick={onOpenAnamnese}>Voltar à anamnese e IA Assistente</button>
      </div>

      <div className="psi-complementary-manual no-print">
        <label htmlFor="psi-manual-complementary-question">Adicionar pergunta da profissional</label>
        <div>
          <input
            id="psi-manual-complementary-question"
            lang="pt-BR"
            spellCheck
            autoCorrect="on"
            autoCapitalize="sentences"
            value={manualQuestion}
            onChange={event => setManualQuestion(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addManualQuestion();
              }
            }}
            placeholder="Digite uma pergunta complementar"
          />
          <button type="button" className="primary-button" disabled={!manualQuestion.trim()} onClick={addManualQuestion}>
            Adicionar
          </button>
        </div>
      </div>

      {questions.length === 0 ? (
        <div className="box psi-complementary-empty">
          <h3>Nenhuma pergunta selecionada</h3>
          <p>
            Abra a anamnese, gere a análise no IA Assistente e marque as perguntas úteis.
            Você também pode escrever uma pergunta manualmente acima.
          </p>
        </div>
      ) : (
        <div className="psi-complementary-list">
          {questions.map((item, index) => {
            const answered = Boolean(String(item.answer || '').trim());
            return (
              <article className="box psi-complementary-card" key={item.id}>
                <div className="psi-complementary-card-head">
                  <div>
                    <span className="psi-complementary-number">Pergunta {index + 1}</span>
                    <span className={`psi-complementary-status${answered ? ' answered' : ''}`}>
                      {answered ? 'Respondida' : 'Pendente'}
                    </span>
                    <span className="psi-complementary-source">
                      {item.source === 'manual' ? 'Criada pela profissional' : 'Sugerida pela IA e selecionada pela profissional'}
                    </span>
                  </div>
                  <button type="button" className="btn-mini" onClick={() => removeQuestion(item)}>Remover</button>
                </div>

                <label>
                  Pergunta — revise antes de utilizar
                  <textarea
                    lang="pt-BR"
                    spellCheck
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    value={item.question}
                    onChange={event => updateQuestion(item.id, 'question', event.target.value)}
                  />
                </label>

                <div className="psi-complementary-informant">
                  <label>
                    Quem respondeu
                    <select
                      value={item.informantType || ''}
                      onChange={event => updateQuestion(item.id, 'informantType', event.target.value)}
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
                      autoCorrect="on"
                      autoCapitalize="words"
                      value={item.informantName || ''}
                      onChange={event => updateQuestion(item.id, 'informantName', event.target.value)}
                      placeholder="Ex.: mãe, avó materna, adolescente"
                    />
                  </label>
                </div>

                <label>
                  Resposta / registro profissional
                  <textarea
                    lang="pt-BR"
                    spellCheck
                    autoCorrect="on"
                    autoCapitalize="sentences"
                    value={item.answer || ''}
                    onChange={event => updateQuestion(item.id, 'answer', event.target.value)}
                    placeholder="Registre a resposta e as observações relevantes"
                  />
                </label>
              </article>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
