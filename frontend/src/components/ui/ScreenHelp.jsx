import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '../../hooks/useDismiss';
import { HELP_SECTIONS } from '../../data/screenHelp';

// ============================================================
// Botão "Como funciona" + painel lateral de ajuda da aba ativa.
//
// Substitui o parágrafo explicativo que abria cada aba: a tela fica
// limpa e a explicação, com títulos, fica a um clique. O conteúdo vem
// de data/screenHelp.js e acompanha a aba — trocar de aba com o painel
// aberto troca o texto. Fecha com Esc, clique fora ou ×.
// No celular o painel sobe de baixo (styles/overlays.css).
// ============================================================

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.4-2.6 4" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

function HelpSectionContent({ value }) {
  if (Array.isArray(value)) {
    return (
      <ul>
        {value.map(item => <li key={item}>{item}</li>)}
      </ul>
    );
  }
  return <p>{value}</p>;
}

function hasContent(value) {
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

export function ScreenHelp({ topic, label = 'Como funciona' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const drawerId = useId();
  const titleId = useId();

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const dismiss = useDismiss({ open, onClose: close });

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!topic) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="help-trigger no-print"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? drawerId : undefined}
        onClick={() => setOpen(true)}
      >
        <HelpIcon />
        <span>{label}</span>
      </button>

      {open && createPortal(
        <div className="help-drawer-scrim no-print" {...dismiss.backdropProps}>
          <aside
            id={drawerId}
            className="help-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <header className="help-drawer-head">
              <span className="help-drawer-icon"><HelpIcon /></span>
              <div>
                <p className="help-drawer-eyebrow">Como funciona</p>
                <h2 id={titleId}>{topic.title}</h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="help-drawer-close"
                onClick={close}
                aria-label="Fechar ajuda"
              >
                ×
              </button>
            </header>

            <div className="help-drawer-body">
              {HELP_SECTIONS.filter(section => hasContent(topic[section.key])).map(section => (
                <section key={section.key} className={`help-drawer-section help-drawer-section--${section.key}`}>
                  <h3>{section.title}</h3>
                  <HelpSectionContent value={topic[section.key]} />
                </section>
              ))}
            </div>

            <footer className="help-drawer-foot">
              <span className="help-drawer-foot-keys"><kbd>Esc</kbd> ou clique fora para fechar</span>
              <span className="help-drawer-foot-touch">Toque fora ou no × para fechar</span>
            </footer>
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}

export default ScreenHelp;
