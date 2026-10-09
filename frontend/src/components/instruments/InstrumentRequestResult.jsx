import { useEffect, useState } from 'react';
import { useDismiss } from '../../hooks/useDismiss';
import { getInstrument } from '../../data/clinicalInstruments';
import { listInstrumentApplications } from '../../services/patientInstrumentService';
import { InstrumentApplicationDialog } from './InstrumentApplicationDialog';
import { findRequestApplication, isInstrumentAccessDenied } from './instrumentFormat';
import '../../styles/instruments.css';

// ============================================================
// "Ver resultado" de uma escala respondida em casa, direto do envio
// (Importáveis e ficha do paciente). Abre a mesma janela da aba Escalas.
// Quem pode ver continua sendo decidido no banco: quem atende o paciente
// na área e a administração (20261012). Para os demais, a janela explica
// onde o resultado fica e como passar a ver.
// ============================================================

const AREA_LABELS = {
  psicologia: 'Psicologia',
  neuropsicologia: 'Neuropsicologia',
  fisioterapia: 'Fisioterapia',
  nutricao: 'Nutrição',
  acupuntura: 'Acupuntura',
};

function MessageDialog({ title, children, onClose }) {
  const dismiss = useDismiss({ onClose });
  return (
    <div className="instrument-dialog-overlay" {...dismiss.backdropProps}>
      <div
        className="instrument-dialog forms-scope"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        {...dismiss.panelProps}
      >
        <div className="panel">
          <div className="panel-title instrument-dialog-head">
            <span>{title}</span>
            <button type="button" className="instrument-dialog-close" aria-label="Fechar" onClick={onClose}>×</button>
          </div>
          <div className="panel-body instrument-dialog-body">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function InstrumentRequestResult({ request, currentUserId = null, onClose }) {
  const [state, setState] = useState({ loading: true, application: null, error: '' });

  useEffect(() => {
    let cancelled = false;
    listInstrumentApplications({ patientId: request.patient_id, discipline: request.discipline })
      .then(applications => {
        if (!cancelled) setState({ loading: false, application: findRequestApplication(applications, request), error: '' });
      })
      .catch(err => {
        if (!cancelled) setState({ loading: false, application: null, error: err.message });
      });
    return () => { cancelled = true; };
  }, [request]);

  const application = state.application;
  const instrument = application ? getInstrument(application.instrumentId, application.instrumentVersion) : null;
  const area = AREA_LABELS[request.discipline] || request.discipline;
  const title = request.form_title || 'Resultado da escala';

  if (application && instrument) {
    return (
      <InstrumentApplicationDialog
        application={application}
        instrument={instrument}
        canVoid={Boolean(currentUserId) && application.appliedById === currentUserId}
        onClose={onClose}
        onVoided={onClose}
      />
    );
  }

  return (
    <MessageDialog title={title} onClose={onClose}>
      {state.loading && <p className="small">Carregando o resultado…</p>}
      {!state.loading && isInstrumentAccessDenied(state.error) && (
        <p>
          O resultado fica com quem atende o paciente na {area} e com a administração. Para ver aqui, você precisa
          atender o paciente nessa área: ter atendimento com ele na Agenda ou ser o responsável dele (a administração
          escolhe na ficha, aba Matrículas).
        </p>
      )}
      {!state.loading && state.error && !isInstrumentAccessDenied(state.error) && (
        <div className="alert" role="alert">{state.error}</div>
      )}
      {!state.loading && !state.error && (
        <p>
          Não achamos o resultado deste envio. Confira a aba Escalas do paciente na {area}.
        </p>
      )}
    </MessageDialog>
  );
}

export default InstrumentRequestResult;
