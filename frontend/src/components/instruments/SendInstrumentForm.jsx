import { useState } from 'react';
import { CLINICAL_INSTRUMENTS } from '../../data/clinicalInstruments';
import { sendInstrumentToPortal } from '../../services/patientInstrumentService';
import { useInstrumentRecipients, useRecipientChoice } from '../../hooks/useInstrumentRecipients';
import { recipientSentence } from '../../utils/instrumentRecipients';
import { RecipientNote, ResponsibleSelect } from './InstrumentRecipientField';
import { todayInputValue } from './instrumentFormat';

// ============================================================
// Administração envia uma escala para o paciente responder em casa, pela
// ficha dele (Área do Paciente). Mesma marcação do envio de formulário
// (SendFormPanel). Antes de enviar, a tela diz para quem vão a nota e o
// alerta de risco e pede o responsável do paciente na área da escala
// (20261012); o envio aparece na lista de envios da ficha.
// ============================================================

export function SendInstrumentForm({ patient, viewerId = null, onSent }) {
  const [instrumentId, setInstrumentId] = useState(CLINICAL_INSTRUMENTS[0]?.id || '');
  const [dueDate, setDueDate] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const instrument = CLINICAL_INSTRUMENTS.find(item => item.id === instrumentId) || null;
  const discipline = instrument?.disciplines[0] || null;
  const recipients = useInstrumentRecipients(patient.id, discipline);
  const choice = useRecipientChoice(recipients, discipline);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!instrument || !choice.canSend) return;
    const receivers = choice.plan.receivers;
    setSending(true);
    setError('');
    setNotice('');
    try {
      await sendInstrumentToPortal({
        patientId: patient.id,
        discipline,
        instrument,
        dueDate: dueDate || null,
        responsibleId: choice.responsibleId,
      });
      const sentence = recipientSentence(receivers, viewerId);
      setNotice(`${instrument.shortName} enviado.${sentence ? ` ${sentence}` : ''}`);
      setDueDate('');
      recipients.reload();
      await onSent?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <form className="gt-filters instrument-send-form" onSubmit={handleSubmit}>
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
        <ResponsibleSelect
          id="instrument-send-admin-responsavel"
          variant="gestao"
          plan={choice.plan}
          value={choice.value}
          onChange={next => { choice.setValue(next); setNotice(''); }}
          discipline={discipline}
          disabled={sending}
        />
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
        <button type="submit" className="gt-btn gt-btn--primary" disabled={!instrument || sending || !choice.canSend}>
          {sending ? 'Enviando…' : 'Enviar escala'}
        </button>
      </form>
      <RecipientNote recipients={recipients} plan={choice.plan} viewerId={viewerId} className="small" />
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}
      {notice && <div className="gt-notice gt-notice-success" role="status">{notice}</div>}
    </>
  );
}

export default SendInstrumentForm;
