import { useState } from 'react';
import { CLINICAL_INSTRUMENTS } from '../../data/clinicalInstruments';
import { sendInstrumentToPortal } from '../../services/patientInstrumentService';
import { todayInputValue } from './instrumentFormat';

// ============================================================
// Administração envia uma escala para o paciente responder em casa, pela
// ficha dele (Área do Paciente). Mesma marcação do envio de formulário
// (SendFormPanel). A nota entra na aba Escalas de quem atende o paciente
// na área da escala; o envio aparece na lista de envios da ficha.
// ============================================================

export function SendInstrumentForm({ patient, onSent }) {
  const [instrumentId, setInstrumentId] = useState(CLINICAL_INSTRUMENTS[0]?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const instrument = CLINICAL_INSTRUMENTS.find(item => item.id === instrumentId) || null;

  async function handleSubmit(event) {
    event.preventDefault();
    if (!instrument) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      await sendInstrumentToPortal({
        patientId: patient.id,
        discipline: instrument.disciplines[0],
        instrument,
        dueDate: dueDate || null,
      });
      setNotice(`${instrument.shortName} enviado. A nota aparece na aba Escalas de quem atende o paciente.`);
      setDueDate('');
      await onSent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <form className="gt-filters" onSubmit={handleSubmit}>
        <label className="gt-field gt-field--grow">
          Escala
          <select
            id="instrument-send-admin-escala"
            className="gt-input"
            value={instrumentId}
            onChange={event => { setInstrumentId(event.target.value); setNotice(''); }}
          >
            {CLINICAL_INSTRUMENTS.map(item => (
              <option key={item.id} value={item.id}>{item.shortName} · {item.measures}</option>
            ))}
          </select>
        </label>
        <label className="gt-field">
          Prazo (opcional)
          <input
            id="instrument-send-admin-prazo"
            type="date"
            className="gt-input"
            value={dueDate}
            min={todayInputValue()}
            onChange={event => setDueDate(event.target.value)}
          />
        </label>
        <button type="submit" className="gt-btn gt-btn--primary" disabled={!instrument || sending}>
          {sending ? 'Enviando…' : 'Enviar escala'}
        </button>
      </form>
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}
      {notice && <div className="gt-notice gt-notice-success" role="status">{notice}</div>}
    </>
  );
}

export default SendInstrumentForm;
