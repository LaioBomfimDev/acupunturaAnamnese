import { useState } from 'react';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import {
  PSYCHOLOGY_AI_DISCLAIMER,
  PSYCHOLOGY_READING_DISCLAIMER,
  confidenceBand,
  generatePsychologyReading,
  suggestPsychologyMarks,
} from '../../services/psychologyAiService';
import {
  PSYCHOLOGY_CHECKLIST_SECTIONS,
  PSYCHOLOGY_RISK_GROUP,
  buildPsychologyWorkspaceSummary,
  hasPsychologyRiskSelected,
} from '../../data/psychologyAnamnese';

// ============================================================
// Rail lateral da Anamnese de Psicologia: andamento + revisão
// assistida da anamnese (o antigo bloco de sugestões, renomeado) +
// leitura da IA em rascunho. Fica FORA do formulário para não poluir
// a escuta.
//
// Ações honestas (a UI antiga não distinguia):
//  * "Confirmar na ficha"    → grava o sinal no registro do paciente;
//  * "Não se aplica"         → descarta só aquele card, não guarda nada;
//  * "Corrigir interpretação"→ ensina a IA (ai_corrections), a única
//    ação que muda chamadas futuras.
// Aceitar/ignorar NÃO treina a IA — só confirmar entra no prontuário.
// ============================================================

const PSI_GROUP_LABELS = Object.fromEntries([
  ...PSYCHOLOGY_CHECKLIST_SECTIONS.map(section => [section.group, section.title]),
  [PSYCHOLOGY_RISK_GROUP, 'Sinais de risco'],
]);

// Revisão assistida: lê o texto livre e sugere sinais do vocabulário psi
// para conferência. Cada sugestão é rotulada como "a investigar" ou
// "sustentado no texto" (o prompt separa os dois). Nada entra sozinho.
function PsychologyReviewAssist({ session, onSetSelection, patientName }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  async function handleSuggest() {
    setError(null);
    setLoading(true);
    try {
      const res = await suggestPsychologyMarks(session, { patientName });
      setResult({
        ...res,
        suggestions: res.suggestions.map((s, i) => ({
          ...s,
          id: `${s.group}:${s.item}:${i}`,
          // Já confirmado na ficha conta como confirmado de saída.
          status: session.selectedMap[`${s.group}:${s.item}`] ? 'accepted' : 'pending',
        })),
      });
    } catch (err) {
      setError(err.message || 'Falha ao revisar a anamnese.');
    } finally {
      setLoading(false);
    }
  }

  function updateSuggestion(id, status) {
    setResult(prev => prev && ({
      ...prev,
      suggestions: prev.suggestions.map(s => (s.id === id ? { ...s, status } : s)),
    }));
  }

  function handleConfirm(s) {
    onSetSelection(s.group, s.item, true);
    updateSuggestion(s.id, 'accepted');
  }

  const pending = result?.suggestions.filter(s => s.status === 'pending').length ?? 0;
  const isMock = result?.modelVersion?.startsWith('mock');

  return (
    <div className="box" style={{ borderColor: 'var(--gold)' }}>
      <div>
        <b>Revisão assistida da anamnese (IA)</b>
        <p className="small" style={{ margin: '4px 0 8px' }}>{PSYCHOLOGY_AI_DISCLAIMER}</p>
      </div>
      <button type="button" className="ai-analyze-btn" disabled={loading} onClick={handleSuggest} style={{ margin: 0, whiteSpace: 'nowrap' }}>
        {loading ? 'Lendo o texto…' : result ? 'Revisar novamente' : 'Revisar anamnese com IA'}
      </button>

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}

      {result && (
        <div className="ai-findings-section" style={{ marginTop: 12 }}>
          <p className="small">
            Modelo: {result.modelVersion}{isMock ? ' (simulado)' : ''}.
            {pending > 0 && <span className="ai-pending-pill">{pending} para conferir</span>}
          </p>
          <p className="small psi-ai-actions-note">
            <b>Confirmar na ficha</b> grava o sinal no registro do paciente. <b>Não se aplica</b> só
            descarta a sugestão. <b>Corrigir interpretação</b> é o que ensina a IA para as próximas vezes.
          </p>
          {result.warning && (
            <div className="alert" style={{ marginTop: 8 }}><b>Aviso:</b> {result.warning}</div>
          )}
          {result.suggestions.length === 0 && (
            <p className="small" style={{ marginTop: 8 }}>Nenhum sinal sugerido para este texto.</p>
          )}

          <div className="ai-findings-grid">
            {result.suggestions.map(s => {
              const band = confidenceBand(s.confidence);
              const pct = Math.round(s.confidence * 100);
              const isRisk = s.group === PSYCHOLOGY_RISK_GROUP;
              const toInvestigate = s.kind === 'investigar';
              return (
                <div key={s.id} className={`ai-finding-card ${s.status}`}>
                  <div className="ai-finding-head">
                    <div>
                      <span className="ai-finding-type">{PSI_GROUP_LABELS[s.group] || s.group}</span>
                      <h4 style={isRisk ? { color: '#b3261e' } : undefined}>
                        {s.item}
                        {toInvestigate && <span className="psi-sign-badge">a investigar</span>}
                      </h4>
                      <p className="ai-finding-pattern small">{s.rationale}</p>
                    </div>
                    <div className={`ai-confidence ${band.level}`} title={`Confiança estimada: ${pct}%`}>
                      <span className="ai-confidence-label">confiança {band.label}</span>
                      <div className="ai-confidence-bar"><div className="ai-confidence-fill" style={{ width: `${pct}%` }} /></div>
                      <span className="small">{pct}%</span>
                    </div>
                  </div>
                  <div className="ai-finding-actions">
                    {s.status === 'pending' ? (
                      <>
                        <button type="button" className="btn-mini accept" onClick={() => handleConfirm(s)}>✓ Confirmar na ficha</button>
                        <button type="button" className="btn-mini" onClick={() => updateSuggestion(s.id, 'ignored')}>Não se aplica</button>
                      </>
                    ) : (
                      <>
                        <span className={`ai-status-badge ${s.status}`}>
                          {s.status === 'accepted' ? 'Confirmado na ficha' : 'Não se aplica'}
                        </span>
                        {s.status === 'ignored' && (
                          <button type="button" className="btn-mini" onClick={() => updateSuggestion(s.id, 'pending')}>Desfazer</button>
                        )}
                      </>
                    )}
                    <AiCorrectionButton
                      surface={AI_SURFACES.PSYCH_MARKS}
                      aiOutput={{ group: s.group, item: s.item, rationale: s.rationale, confidence: s.confidence }}
                      contextSnapshot={{ group: s.group }}
                      modelVersion={result.modelVersion}
                      patientName={patientName}
                      label="Corrigir interpretação"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Leitura da IA (rascunho): visão geral + hipóteses + riscos + perguntas,
// gerada sob demanda e persistida com a sessão (session.aiReading).
function normalizeQuestionKey(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function PsychologyAiReading({
  session,
  onReadingChange,
  onToggleComplementaryQuestion,
  patientName,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const reading = session.aiReading;
  const isMock = reading?.modelVersion?.startsWith('mock');

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    try {
      const res = await generatePsychologyReading(session, { patientName });
      onReadingChange({ ...res, generatedAt: new Date().toISOString() });
    } catch (err) {
      setError(err.message || 'Falha ao gerar a leitura.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="box psi-reading-box">
      <div>
        <b>Leitura da IA <span className="psi-draft-badge">RASCUNHO — revisar</span></b>
        <p className="small" style={{ margin: '4px 0 8px' }}>{PSYCHOLOGY_READING_DISCLAIMER}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="ai-analyze-btn" disabled={loading} onClick={handleGenerate} style={{ margin: 0, whiteSpace: 'nowrap' }}>
          {loading
            ? 'Analisando a anamnese…'
            : reading
              ? 'Atualizar análise e sugerir novas perguntas'
              : 'Analisar anamnese e sugerir perguntas'}
        </button>
        {reading && (
          <button type="button" className="btn-mini" onClick={() => onReadingChange(null)}>Descartar</button>
        )}
      </div>

      {error && <div className="alert" style={{ marginTop: 10 }}>{error}</div>}

      {reading && (
        <div className="psi-reading-body">
          <p className="small">
            Modelo: {reading.modelVersion}{isMock ? ' (simulado)' : ''}
            {reading.generatedAt ? ` · gerada em ${new Date(reading.generatedAt).toLocaleString('pt-BR')}` : ''}.
          </p>

          {reading.riskAlerts?.length > 0 && (
            <div className="alert psi-risk-reminder" style={{ marginTop: 8 }}>
              <b>⚠ Sinais de risco destacados pela IA (confira primeiro):</b>
              <ul className="psi-reading-list">
                {reading.riskAlerts.map((alert, i) => (
                  <li key={i}><b>{alert.sign}</b>{alert.note ? ` — ${alert.note}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {reading.overview && (
            <div className="psi-reading-block">
              <h4>Visão geral</h4>
              <p>{reading.overview}</p>
            </div>
          )}

          {reading.hypotheses?.length > 0 && (
            <div className="psi-reading-block">
              <h4>Hipóteses de trabalho (não é diagnóstico)</h4>
              {reading.hypotheses.map((h, i) => {
                const band = confidenceBand(h.confidence);
                const pct = Math.round(h.confidence * 100);
                return (
                  <div key={i} className="psi-hypothesis">
                    <div className="psi-hypothesis-head">
                      <b>{h.name}</b>
                      <span className={`ai-confidence ${band.level}`} title={`Confiança estimada: ${pct}%`}>
                        <span className="ai-confidence-label">confiança {band.label} · {pct}%</span>
                      </span>
                    </div>
                    {h.basis && <p className="small">{h.basis}</p>}
                  </div>
                );
              })}
            </div>
          )}

          {reading.questions?.length > 0 && (
            <div className="psi-reading-block">
              <h4>Perguntas para explorar</h4>
              <p className="small">
                Selecione somente as perguntas úteis. Elas irão para a aba “Perguntas complementares”,
                onde você poderá revisar a redação, identificar o informante e registrar a resposta.
              </p>
              <div className="psi-reading-question-list">
                {reading.questions.map((question, index) => {
                  const selected = (session.complementaryQuestions || []).some(item => (
                    normalizeQuestionKey(item.sourceQuestion || item.question) === normalizeQuestionKey(question)
                  ));
                  return (
                    <label className={`psi-reading-question${selected ? ' selected' : ''}`} key={`${question}-${index}`}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleComplementaryQuestion?.(question, reading)}
                      />
                      <span>
                        <b>{question}</b>
                        <small>{selected ? 'Adicionada em Perguntas complementares' : 'Selecionar para incluir na anamnese'}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {reading.cautions?.length > 0 && (
            <div className="psi-reading-block">
              <h4>Cautelas da própria IA</h4>
              <ul className="psi-reading-list">
                {reading.cautions.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>
          )}

          <div className="ai-finding-actions" style={{ marginTop: 10 }}>
            <AiCorrectionButton
              surface={AI_SURFACES.PSYCH_READING}
              aiOutput={reading}
              contextSnapshot={{
                markedGroups: Object.keys(session.selectedMap || {}).filter(key => session.selectedMap[key]).length,
                hasRisk: hasPsychologyRiskSelected(session.selectedMap),
              }}
              modelVersion={reading.modelVersion}
              patientName={patientName}
              summary={reading.overview}
              label="Corrigir interpretação"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Rail completo: andamento da ficha + revisão assistida + leitura.
export function PsychologyAssistantRail({
  session,
  onSetSelection,
  onReadingChange,
  onToggleComplementaryQuestion,
  patientName,
}) {
  const summary = buildPsychologyWorkspaceSummary(session);

  return (
    <div className="panel assistant-panel assistant-synth-panel psi-assistant-panel">
      <div className="panel-title">IA Assistente</div>
      <div className="panel-body assistant-synth">
        <div className="synth-hypo">
          <span className="synth-label">Andamento da anamnese</span>
          <strong className="synth-hypo-name">{summary.completion}% preenchida</strong>
          <div className="synth-meter" role="img" aria-label={`Anamnese ${summary.completion}% preenchida`}>
            <div className="synth-meter-fill" style={{ width: `${summary.completion}%` }} />
            <span className="synth-meter-val">{summary.completion}%</span>
          </div>
          <p className="synth-percent-note">
            Mede apenas o preenchimento da ficha; não representa confiança diagnóstica nem avaliação clínica.
          </p>
        </div>

        <div className="synth-block">
          <span className="synth-label">Dados organizados</span>
          <div className="synth-quick psi-synth-quick">
            <span className="quick-chip"><b>{summary.filledFields}</b><span>campos</span></span>
            <span className="quick-chip"><b>{summary.markedItems}</b><span>sinais</span></span>
            <span className="quick-chip"><b>{summary.filledAxes}</b><span>eixos</span></span>
            <span className="quick-chip"><b>{summary.answeredComplementaryQuestions}/{summary.complementaryQuestions}</b><span>perguntas</span></span>
          </div>
        </div>

        {summary.riskItems > 0 && (
          <div className="deepdive-section deepdive-redflags psi-assistant-risk">
            <b>{summary.riskItems} sinal{summary.riskItems === 1 ? '' : 'is'} de risco marcado{summary.riskItems === 1 ? '' : 's'}</b>
            <p>Conferência e decisão permanecem sob responsabilidade da profissional.</p>
          </div>
        )}

        <div className="synth-block psi-assistant-reading">
          <span className="synth-label">Revisar com IA</span>
          <PsychologyReviewAssist
            session={session}
            onSetSelection={onSetSelection}
            patientName={patientName}
          />
        </div>

        <div className="synth-block psi-assistant-reading">
          <span className="synth-label">Aprofundar com IA</span>
          <PsychologyAiReading
            session={session}
            onReadingChange={onReadingChange}
            onToggleComplementaryQuestion={onToggleComplementaryQuestion}
            patientName={patientName}
          />
        </div>

        <div className="synth-block">
          <span className="synth-label">Próxima ação sugerida</span>
          <p>{summary.nextAction}</p>
        </div>
      </div>
    </div>
  );
}
