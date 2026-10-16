import { useId, useState } from 'react';
import { sendInterviewLink } from '../../services/patientInterviewService';
import {
  buildInterviewLinkMessage,
  copyText,
  DEFAULT_LINK_VALIDITY,
  formatInterviewDate,
  interviewLinkUrl,
  LINK_VALIDITY_OPTIONS,
  whatsappShareUrl,
} from '../../utils/clinicalInterviews';
import { InterviewGlyph } from './InterviewGlyph';

// ============================================================
// "Enviar link": cria um link só para a pessoa que vai responder (mãe,
// cônjuge, professora). Um link por pessoa: cada uma responde a sua.
// O link abre só esta entrevista, com o primeiro nome do paciente, e
// fecha quando é respondido, cancelado ou passa do prazo.
// ============================================================

export function InterviewLinkBox({ interview, patient, discipline, clinicName, onCreated }) {
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [days, setDays] = useState(DEFAULT_LINK_VALIDITY);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  async function handleCreate(event) {
    event.preventDefault();
    setCreating(true);
    setError('');
    try {
      const result = await sendInterviewLink({
        patientId: patient.id,
        discipline,
        interview,
        recipientLabel: label,
        validDays: days,
      });
      const link = interviewLinkUrl(window.location.origin, result.token);
      setCreated({ ...result, link, label: label.trim() });
      setCopied(false);
      onCreated?.(`Link criado para ${label.trim()}. Copie ou mande pelo WhatsApp.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    setCopied(await copyText(created.link));
  }

  function handleWhatsApp() {
    const text = buildInterviewLinkMessage({ recipientLabel: created.label, clinicName, link: created.link });
    window.open(whatsappShareUrl(text), '_blank', 'noopener');
  }

  function reset() {
    setCreated(null);
    setLabel('');
    setDays(DEFAULT_LINK_VALIDITY);
    setCopied(false);
    setOpen(true);
  }

  if (created) {
    return (
      <div className="interview-link-box is-created" role="status">
        <p className="interview-link-title">
          <InterviewGlyph name="link" /> Link de <b>{created.label}</b>
          <span className="small"> · vale até {formatInterviewDate(created.expiresAt)}</span>
        </p>
        <input className="interview-link-url" value={created.link} readOnly aria-label="Link da entrevista" onFocus={event => event.target.select()} />
        <div className="instrument-actions">
          <button type="button" className="primary-button" onClick={handleCopy}>{copied ? 'Copiado!' : 'Copiar link'}</button>
          <button type="button" className="quiet-button" onClick={handleWhatsApp}>Enviar pelo WhatsApp</button>
          <button type="button" className="quiet-button" onClick={reset}>Criar outro link</button>
        </div>
        <p className="small">
          O link abre só esta entrevista, sem o prontuário, e a pessoa pode parar e continuar depois.
          A resposta chega aqui na lista assim que ela enviar; até lá, “Copiar link” na lista copia de novo.
        </p>
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" className="quiet-button" onClick={() => setOpen(true)}>
        <InterviewGlyph name="send" /> Enviar link para responder
      </button>
    );
  }

  return (
    <form className="interview-link-box" onSubmit={handleCreate} aria-labelledby={`${formId}-title`}>
      <p className="interview-link-title" id={`${formId}-title`}>
        <InterviewGlyph name="send" /> Enviar link para {interview.respondentLabel?.toLowerCase() || 'quem vai responder'}
      </p>
      <div className="interview-link-fields">
        <label className="field-block">
          <span>Para quem é o link</span>
          <input
            value={label}
            onChange={event => setLabel(event.target.value)}
            maxLength={80}
            placeholder="Mãe, esposa, chefe, professora Ana…"
            disabled={creating}
            required
          />
        </label>
        <label className="field-block">
          <span>Vale por</span>
          <select value={days} onChange={event => setDays(Number(event.target.value))} disabled={creating}>
            {LINK_VALIDITY_OPTIONS.map(option => <option key={option} value={option}>{option} dias</option>)}
          </select>
        </label>
      </div>
      <p className="small">Um link por pessoa: se mais de uma pessoa vai responder, crie um link para cada.</p>
      {error && <div className="alert" role="alert">{error}</div>}
      <div className="instrument-actions">
        <button type="submit" className="primary-button" disabled={creating || !label.trim()}>
          {creating ? 'Criando…' : 'Criar link'}
        </button>
        <button type="button" className="quiet-button" onClick={() => { setOpen(false); setError(''); }} disabled={creating}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default InterviewLinkBox;
