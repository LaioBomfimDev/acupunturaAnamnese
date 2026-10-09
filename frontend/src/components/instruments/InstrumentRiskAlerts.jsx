import { useEffect, useState } from 'react';
import { getInstrument } from '../../data/clinicalInstruments';
import { acknowledgeInstrumentRisk, listMyInstrumentRiskAlerts } from '../../services/patientInstrumentService';
import { formatInstrumentDate } from './instrumentFormat';
import '../../styles/instruments.css';

// ============================================================
// Tela inicial: respostas de risco ainda não vistas nas escalas dos
// pacientes que a pessoa atende (quase sempre respondidas em casa, pela
// Área do Paciente). Fica até alguém que atende marcar "Vi o alerta".
// O aviso lembra, nunca decide. Sem alerta (ou sem banco), não desenha nada.
// ============================================================

const AREA_LABELS = {
  psicologia: 'Psicologia',
  neuropsicologia: 'Neuropsicologia',
  fisioterapia: 'Fisioterapia',
  nutricao: 'Nutrição',
  acupuntura: 'Acupuntura',
};

export function InstrumentRiskAlerts({ onOpen = null }) {
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    listMyInstrumentRiskAlerts()
      .then(rows => { if (!cancelled) setAlerts(rows); })
      .catch(() => { if (!cancelled) setAlerts([]); });
    return () => { cancelled = true; };
  }, []);

  if (!alerts.length) return null;

  async function handleSeen(alert) {
    setBusy(alert.applicationId);
    setError('');
    try {
      await acknowledgeInstrumentRisk(alert.applicationId);
      setAlerts(current => current.filter(item => item.applicationId !== alert.applicationId));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="instrument-risk-alerts" aria-label="Alertas de risco nas escalas">
      <h3>
        {alerts.length === 1 ? 'Alerta de risco numa escala' : `${alerts.length} alertas de risco nas escalas`}
      </h3>
      <ul>
        {alerts.map(alert => {
          const instrument = getInstrument(alert.instrumentId);
          const area = AREA_LABELS[alert.discipline] || alert.discipline;
          return (
            <li key={alert.applicationId}>
              <p>
                <b>{alert.patientName}</b>{' '}
                {alert.source === 'area_do_paciente' ? 'respondeu em casa' : 'respondeu'} o {instrument?.shortName || 'questionário'} em{' '}
                {formatInstrumentDate(alert.appliedAt)} com resposta positiva no item de risco. Avalie o risco o quanto antes;
                o resultado está em {area} → Escalas.
              </p>
              <div className="instrument-actions">
                {onOpen && (
                  <button type="button" className="quiet-button" onClick={() => onOpen(alert)}>
                    Ver resultado
                  </button>
                )}
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => handleSeen(alert)}
                  disabled={busy === alert.applicationId}
                >
                  {busy === alert.applicationId ? 'Marcando…' : 'Vi o alerta'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="small" role="alert">{error}</p>}
    </section>
  );
}

export default InstrumentRiskAlerts;
