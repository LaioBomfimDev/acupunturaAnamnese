import { Panel } from '../ui/Panel';
import { PSYCHOLOGY_TABS } from '../../data/psychologyAnamnese';
import '../../styles/interviews.css';

// ============================================================
// Quem não atende o paciente nesta área (administração que só abriu a
// ficha, por exemplo): no lugar de "Erro ao carregar a ficha", diz por que
// a anamnese não abre e leva ao que essa pessoa pode usar aqui.
// A ficha da área é de quem atende (20261016b); Entrevistas e Escalas
// seguem a regra delas (quem atende + administração).
// ============================================================

export function PsychologyNoAccess({ patientName, onOpen }) {
  return (
    <Panel title="Ficha de quem atende">
      <div className="psi-no-access">
        <p>
          Você não atende {patientName || 'este paciente'} na Psicologia. A anamnese, as perguntas complementares,
          as hipóteses e o relatório desta área são de quem atende: atendimento marcado na Agenda ou responsável
          na matrícula (a administração escolhe na ficha do paciente, aba Matrículas).
        </p>
        <p className="small">Aqui você pode usar:</p>
        <div className="psi-no-access-actions">
          <button type="button" className="quiet-button" onClick={() => onOpen(PSYCHOLOGY_TABS.ENTREVISTA_FAMILIAR)}>
            Entrevistas
          </button>
          <button type="button" className="quiet-button" onClick={() => onOpen(PSYCHOLOGY_TABS.ESCALAS)}>
            Escalas
          </button>
        </div>
      </div>
    </Panel>
  );
}

export default PsychologyNoAccess;
