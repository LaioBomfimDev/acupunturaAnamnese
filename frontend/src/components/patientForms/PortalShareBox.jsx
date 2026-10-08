import { useState } from 'react';
import { buildPortalLink, buildPortalMessage } from '../../utils/patientForms';
import { buildWhatsAppLink, isLikelyValidWhatsAppPhone } from '../../utils/whatsapp';

// ============================================================
// Mensagem pronta para o paciente: link da Área do Paciente com o
// código já preenchido + o código por escrito. Quem manda é a equipe,
// pelo WhatsApp dela (wa.me), igual à pesquisa de satisfação.
// ============================================================

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function PortalShareBox({ patient, clinicName, accessCode, formTitle = '', dueDate = '' }) {
  const [copied, setCopied] = useState('');
  if (!accessCode) return null;

  const link = buildPortalLink(window.location.origin, accessCode);
  const message = buildPortalMessage({
    patientName: patient?.nome_social || patient?.name,
    clinicName,
    code: accessCode,
    link,
    formTitle,
    dueDate,
  });
  const phone = patient?.phone || '';
  const canWhatsApp = isLikelyValidWhatsAppPhone(phone);

  async function handleCopy(kind) {
    const ok = await copyText(kind === 'link' ? link : message);
    setCopied(ok ? kind : 'erro');
    window.setTimeout(() => setCopied(''), 2500);
  }

  return (
    <div className="pq-share">
      <p className="pq-message">{message}</p>
      <div className="pq-actions">
        {canWhatsApp ? (
          <a className="gt-wa-btn" href={buildWhatsAppLink({ phone, message })} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z" />
              <path d="M9 9.5c.3 1.6 1.9 3.6 3.6 4.4l1.2-1.1 2 .9c-.2 1-1 1.6-2 1.6-3 0-6.1-3.1-6.1-6.1 0-1 .6-1.8 1.6-2l.9 2z" />
            </svg>
            Enviar pelo WhatsApp
          </a>
        ) : (
          <span className="gt-filter-note">Sem celular válido no cadastro: copie a mensagem e mande pelo canal de sempre.</span>
        )}
        <button type="button" className="gt-btn gt-btn--sm" onClick={() => handleCopy('message')}>
          {copied === 'message' ? 'Mensagem copiada!' : 'Copiar mensagem'}
        </button>
        <button type="button" className="gt-btn gt-btn--sm" onClick={() => handleCopy('link')}>
          {copied === 'link' ? 'Link copiado!' : 'Copiar link'}
        </button>
      </div>
      {copied === 'erro' && <p className="gt-filter-note">Não deu para copiar sozinho: selecione o texto acima e copie.</p>}
    </div>
  );
}

export default PortalShareBox;
