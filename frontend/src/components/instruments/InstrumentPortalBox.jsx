import { useState } from 'react';
import { PortalShareBox } from '../patientForms/PortalShareBox';
import { getPatientAccess } from '../../services/patientPortalService';
import {
  cancelInstrumentRequest,
  patientFacingTitle,
  sendInstrumentToPortal,
} from '../../services/patientInstrumentService';
import { useRecipientChoice } from '../../hooks/useInstrumentRecipients';
import { recipientSentence } from '../../utils/instrumentRecipients';
import { RecipientNote, ResponsibleSelect } from './InstrumentRecipientField';
import { formatInstrumentDate, openRequestOf, requestStatusLabel, todayInputValue } from './instrumentFormat';
// A mensagem pronta com o código (PortalShareBox) usa os estilos da
// Gestão e da Área do Paciente, como na ficha do paciente.
import '../../styles/gestao.css';
import '../../styles/patientForms.css';

// ============================================================
// Escala para responder em casa (etapa 2), dentro do cartão da escala:
// enviar com prazo opcional, ver se está esperando ou sendo respondida,
// cancelar. Antes de enviar, a tela diz para quem vão a nota e o alerta
// e, para a administração, pede o responsável do paciente na área
// (20261012). Depois de enviar, a mensagem pronta com o código aparece só
// para quem pode ver o código (administração, ou quem atende quando a
// instituição liberou em Configurações > Acesso do paciente); senão, a
// tela diz que o código fica com a administração.
// ============================================================

export function InstrumentPortalBox({
  instrument,
  patient,
  clinicName,
  discipline,
  requests,
  recipients,
  currentUserId = null,
  onChanged,
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [sentCode, setSentCode] = useState(null);
  const [codeNote, setCodeNote] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const choice = useRecipientChoice(recipients, discipline);

  const pending = openRequestOf(requests);

  async function handleSend() {
    if (!choice.canSend) return;
    const receivers = choice.plan.receivers;
    setBusy('send');
    setError('');
    try {
      await sendInstrumentToPortal({
        patientId: patient.id,
        discipline,
        instrument,
        dueDate: dueDate || null,
        responsibleId: choice.responsibleId,
      });
      // O código só volta para quem pode vê-lo (a regra está no banco).
      const access = await getPatientAccess(patient.id).catch(() => null);
      setSentCode(access?.is_active ? access.access_code : null);
      setCodeNote(!access
        ? 'O código de acesso deste paciente fica com a administração. Peça que ela mande a mensagem com o código, se o paciente ainda não tiver.'
        : access.is_active ? '' : 'O acesso deste paciente à Área do Paciente está desativado. Peça à administração para liberar.');
      setOpen(false);
      setDueDate('');
      recipients.reload();
      const sentence = recipientSentence(receivers, currentUserId);
      onChanged?.(`${instrument.shortName} enviado para a Área do Paciente.${sentence ? ` ${sentence}` : ''}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleCancel() {
    setBusy('cancel');
    setError('');
    try {
      await cancelInstrumentRequest(pending.id);
      setConfirmCancel(false);
      setSentCode(null);
      onChanged?.('Envio cancelado. O paciente não vê mais esta escala.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="instrument-portal">
      {pending ? (
        <div className="instrument-portal-pending">
          <p className="small">
            <b>Enviada para casa</b> em {formatInstrumentDate(pending.sentAt)}
            {pending.sentByName ? ` por ${pending.sentByName}` : ''}: {requestStatusLabel(pending)}.
            {pending.dueDate ? ` Prazo: ${formatInstrumentDate(`${pending.dueDate}T12:00:00`)}.` : ''}
          </p>
          {confirmCancel ? (
            <div className="instrument-actions">
              <button type="button" className="primary-button" onClick={handleCancel} disabled={busy === 'cancel'}>
                {busy === 'cancel' ? 'Cancelando…' : 'Cancelar o envio'}
              </button>
              <button type="button" className="quiet-button" onClick={() => setConfirmCancel(false)} disabled={busy === 'cancel'}>
                Manter
              </button>
            </div>
          ) : (
            <button type="button" className="quiet-button" onClick={() => setConfirmCancel(true)}>Cancelar envio</button>
          )}
        </div>
      ) : open ? (
        <div className="instrument-portal-send">
          <p className="small">
            O paciente responde pelo celular, na Área do Paciente, com o código de acesso dele. A nota entra aqui quando ele enviar.
          </p>
          <ResponsibleSelect
            id={`instrument-${instrument.id}-responsavel`}
            plan={choice.plan}
            value={choice.value}
            onChange={choice.setValue}
            discipline={discipline}
            disabled={busy === 'send'}
          />
          <label className="field-block instrument-date">
            <span>Prazo (opcional)</span>
            <input
              id={`instrument-${instrument.id}-due`}
              type="date"
              value={dueDate}
              min={todayInputValue()}
              onChange={event => setDueDate(event.target.value)}
            />
          </label>
          <RecipientNote recipients={recipients} plan={choice.plan} viewerId={currentUserId} />
          <div className="instrument-actions">
            <button type="button" className="primary-button" onClick={handleSend} disabled={busy === 'send' || !choice.canSend}>
              {busy === 'send' ? 'Enviando…' : 'Enviar'}
            </button>
            <button type="button" className="quiet-button" onClick={() => setOpen(false)} disabled={busy === 'send'}>
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="quiet-button" onClick={() => { setOpen(true); setError(''); }}>
          Enviar para responder em casa
        </button>
      )}

      {error && <div className="alert" role="alert">{error}</div>}

      {sentCode && (
        <PortalShareBox
          patient={patient}
          clinicName={clinicName}
          accessCode={sentCode}
          formTitle={patientFacingTitle(instrument)}
        />
      )}
      {codeNote && <p className="small instrument-portal-note">{codeNote}</p>}
    </div>
  );
}
