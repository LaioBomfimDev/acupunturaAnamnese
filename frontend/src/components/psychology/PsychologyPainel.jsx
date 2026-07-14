import { usePatient } from '../../hooks/PatientContext';
import { Panel } from '../ui/Panel';
import {
  PSYCHOLOGY_TABS,
  buildPsychologyWorkspaceSummary,
} from '../../data/psychologyAnamnese';

// ============================================================
// Painel do paciente de Psicologia (home). Mesmo padrão visual do
// PainelInicial da Acup: hero do paciente + atalhos + cartões de
// andamento. Percentuais medem PREENCHIMENTO, nunca confiança
// diagnóstica. A IA não decide nada aqui.
// ============================================================

function getPatientInitials(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'P';
  return words.slice(0, 2).map(word => word[0]).join('').toUpperCase();
}

export function PsychologyPainel({ session, selectedPatient, patientAge, onNavigate }) {
  const { clearSelection } = usePatient();
  const summary = buildPsychologyWorkspaceSummary(session);
  const evolucoes = Array.isArray(session.evolucoes) ? session.evolucoes : [];
  const ultimaEvolucao = evolucoes[evolucoes.length - 1];
  const patientName = selectedPatient?.name || 'Paciente';

  function handlePatientSwitch() {
    clearSelection();
    onNavigate?.(PSYCHOLOGY_TABS.HOME);
  }

  return (
    <Panel title="Painel do paciente">
      <div className="summary-hero">
        <div className="patient-summary-main">
          <div className="patient-summary-avatar" aria-hidden="true">
            {getPatientInitials(patientName)}
          </div>
          <div className="patient-summary-content">
            <p className="small">Paciente em atendimento</p>
            <h2>{patientName}</h2>
            <div className="patient-summary-meta" aria-label="Dados do paciente">
              <span>
                <b>Telefone</b>
                {selectedPatient?.phone || 'Sem telefone'}
              </span>
              <span>
                <b>Idade</b>
                {patientAge ? `${patientAge} anos` : 'Não informada'}
              </span>
              <span>
                <b>Sessões registradas</b>
                {summary.sessionCount}
              </span>
            </div>
          </div>
        </div>
        <div className="summary-actions" aria-label="Ações do paciente">
          <button
            className="summary-action summary-action-primary"
            type="button"
            onClick={() => onNavigate?.(PSYCHOLOGY_TABS.ANAMNESE)}
          >
            <span>Continuar anamnese</span>
            <small>Ficha clínica</small>
          </button>
          <button className="summary-action" type="button" onClick={() => onNavigate?.(PSYCHOLOGY_TABS.EVOLUCAO)}>
            <span>Registrar evolução</span>
            <small>Nova sessão</small>
          </button>
          <button className="summary-action" type="button" onClick={() => onNavigate?.(PSYCHOLOGY_TABS.RELATORIO)}>
            <span>Ver relatório</span>
            <small>Documentos</small>
          </button>
          <button
            className="summary-action summary-action-secondary"
            type="button"
            onClick={handlePatientSwitch}
          >
            <span>Trocar paciente</span>
            <small>Voltar à lista</small>
          </button>
        </div>
      </div>

      {summary.riskItems > 0 && (
        <div className="clinical-alerts" role="alert">
          <div className="clinical-alerts-head">
            <span className="clinical-alert-icon" aria-hidden="true">!</span>
            <div>
              <p className="small">Sinais de risco marcados</p>
              <h3>Conferir antes de seguir</h3>
            </div>
            <span className="clinical-alert-count">
              {summary.riskItems} sinal{summary.riskItems > 1 ? 'is' : ''}
            </span>
          </div>
          <ul className="clinical-alert-list">
            <li><span>Conferência e conduta permanecem sob responsabilidade da profissional — o sistema apenas destaca.</span></li>
          </ul>
        </div>
      )}

      <div className="cards summary-cards">
        <div className="card">
          <p className="small">Anamnese preenchida</p>
          <h3>{summary.completion}%</h3>
        </div>
        <div className="card">
          <p className="small">Sinais organizados</p>
          <h3>{summary.markedItems} item(ns)</h3>
        </div>
        <div className="card">
          <p className="small">Evoluções</p>
          <h3>{summary.sessionCount} registro(s)</h3>
        </div>
      </div>

      <div className="summary-grid">
        <div className="box">
          <h3>Andamento do caso</h3>
          <p><b>Campos preenchidos:</b> {summary.filledFields}</p>
          <p><b>Eixos de formulação:</b> {summary.filledAxes}</p>
          <p className="small">
            O percentual mede apenas o preenchimento da ficha; não representa confiança diagnóstica.
          </p>
          <p><b>Próxima ação sugerida:</b> {summary.nextAction}</p>
        </div>
        <div className="box">
          <h3>Última evolução</h3>
          {ultimaEvolucao ? (
            <>
              <p><b>Sessão {ultimaEvolucao.sessao}</b> • {ultimaEvolucao.data}</p>
              <p>{ultimaEvolucao.temas || 'Sem temas registrados.'}</p>
              <p className="small">{ultimaEvolucao.obs || ultimaEvolucao.proximosPassos || 'Sem observações adicionais.'}</p>
            </>
          ) : (
            <p>Nenhuma evolução registrada para este paciente.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}
