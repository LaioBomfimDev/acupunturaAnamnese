// ============================================================
// Infra de impressão compartilhada de relatórios (Acupuntura e
// Psicologia): papel timbrado, rodapé de contato, ícones e a
// paginação manual em folhas de altura fixa.
//
// Extraído VERBATIM de panels/Relatorio.jsx para virar fonte única —
// a paginação de impressão é sensível (o rodapé precisa ficar sempre
// grudado no fundo de cada folha), então as duas disciplinas usam
// exatamente o mesmo código. NÃO duplicar esta lógica.
// A função de paginação vive em ./reportPagination.js (fast-refresh).
// ============================================================

/* ── ícones de contato ─────────────────────────────────────── */
export function ReportContactIcon({ type }) {
  if (type === 'address') {
    return (
      <span className="report-contact-icon address" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z" />
          <circle cx="12" cy="9" r="2.4" />
        </svg>
      </span>
    );
  }

  if (type === 'email') {
    return (
      <span className="report-contact-icon email" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M3.5 6.2h17a.8.8 0 0 1 .8.8v10a.8.8 0 0 1-.8.8h-17a.8.8 0 0 1-.8-.8V7a.8.8 0 0 1 .8-.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.4 7 12 13l8.6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  return (
    <span className="report-contact-icon phone" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M8.8 7.2c-.2 0-.5.1-.7.4-.3.4-.7.9-.7 1.8 0 1 .7 2.1 1 2.5.2.3 1.8 2.9 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.6-.4l-1.6-.8c-.3-.1-.5-.1-.7.2l-.7.9c-.1.2-.3.2-.6.1-.3-.1-1.1-.4-2-1.2-.8-.7-1.3-1.5-1.5-1.8-.1-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.6c-.2-.4-.4-.4-.7-.4h-.6Z" />
      </svg>
    </span>
  );
}

export function ReportContactFooter({ items, clinicName }) {
  return (
    <footer className="report-print-footer" aria-label="Contato da clínica">
      <span className="report-contact-segments" aria-hidden="true" />
      <div className="report-contact-list">
        {items.map(item => (
          <div className="report-contact-item" key={item.id}>
            <ReportContactIcon type={item.id} />
            <div className="report-contact-text">
              <span>{item.label}</span>
              <b>{item.value}</b>
            </div>
          </div>
        ))}
      </div>
      <div className="report-contact-baseline" aria-hidden="true">
        <span className="report-contact-baseline-name">{clinicName}</span>
        <span className="report-contact-bar" />
      </div>
    </footer>
  );
}

export function PrintLetterhead({ clinicLogo, clinicMonogram, clinicName, clinicDetails, dateLabel, sessaoLabel, terapeuta }) {
  return (
    <header className="rpage-header">
      <div className="rpage-header-top">
        <div className="rpage-header-brand">
          {clinicLogo
            ? <img className="rpage-logo" src={clinicLogo} alt={`Logo ${clinicName}`} />
            : <span className="rpage-logo rpage-logo-monogram" aria-hidden="true">{clinicMonogram}</span>}
          <div className="rpage-header-main">
            <h1>{clinicName}</h1>
            {clinicDetails && <small>{clinicDetails}</small>}
          </div>
        </div>
        <div className="rpage-header-meta">
          <b>{dateLabel}</b>
          <span>{sessaoLabel}</span>
          <span>{terapeuta}</span>
        </div>
      </div>
      <span className="rpage-rule" aria-hidden="true" />
    </header>
  );
}

export function PrintContactIcon({ type }) {
  if (type === 'address') {
    return (
      <span className="rpage-contact-icon address" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M12 21s7-6.1 7-12A7 7 0 1 0 5 9c0 5.9 7 12 7 12Z" />
          <circle cx="12" cy="9" r="2.4" />
        </svg>
      </span>
    );
  }

  if (type === 'email') {
    return (
      <span className="rpage-contact-icon email" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M3.5 6.2h17a.8.8 0 0 1 .8.8v10a.8.8 0 0 1-.8.8h-17a.8.8 0 0 1-.8-.8V7a.8.8 0 0 1 .8-.8Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path d="M3.4 7 12 13l8.6-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  return (
    <span className="rpage-contact-icon phone" aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path d="M8.8 7.2c-.2 0-.5.1-.7.4-.3.4-.7.9-.7 1.8 0 1 .7 2.1 1 2.5.2.3 1.8 2.9 4.5 4 2.2.8 2.7.7 3.2.6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2-.1-.2-.3-.2-.6-.4l-1.6-.8c-.3-.1-.5-.1-.7.2l-.7.9c-.1.2-.3.2-.6.1-.3-.1-1.1-.4-2-1.2-.8-.7-1.3-1.5-1.5-1.8-.1-.3 0-.4.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.7-1.6c-.2-.4-.4-.4-.7-.4h-.6Z" />
      </svg>
    </span>
  );
}

export function PrintFooter({ items, clinicName }) {
  return (
    <footer className="rpage-footer-inner" aria-label="Contato da clínica">
      <span className="rpage-contact-segments" aria-hidden="true" />
      <div className="rpage-contact-list">
        {items.map(item => (
          <div className="rpage-contact-item" key={item.id}>
            <PrintContactIcon type={item.id} />
            <div className="rpage-contact-text">
              <span>{item.label}</span>
              <b>{item.value}</b>
            </div>
          </div>
        ))}
      </div>
      <div className="rpage-contact-baseline" aria-hidden="true">
        <span className="rpage-contact-baseline-name">{clinicName}</span>
        <span className="rpage-contact-bar" />
      </div>
    </footer>
  );
}
