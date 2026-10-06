import { useRef, useState } from 'react';
import { useDismiss } from '../../../hooks/useDismiss';

// ============================================================
// "Ferramentas" da Agenda (05/10/2026, junção das opções A e B)
//
// As seis ações do topo (Registrar atendimento realizado, Compartilhar,
// Aniversários, Horários, Feriados, Configurar) ocupavam duas fileiras:
// no celular eram 332px antes do primeiro atendimento. Agora ficam atrás
// de um botão só, no computador e no celular. Em 06/10/2026 entrou a
// sétima, "Copiar horários vagos", que copia sem abrir janela. No computador a lista abre
// sob o botão; no celular, sobe de baixo (styles/agenda.css, .agt-*).
//
// Os itens chegam como filhos, com o onClick de sempre; tocar em
// qualquer botão da lista fecha a lista antes da ação abrir a dela.
// ============================================================

function IconDots() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

// `placement`: "head" (ao lado de ← Hoje →, só no computador) ou "bar"
// (ao lado de "Filtros", só no celular). O CSS mostra um por vez.
export function AgendaToolsMenu({ children, placement = 'bar' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const dismiss = useDismiss({ open, onClose: close });

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className={`agt agt--${placement}`}>
      <button
        ref={triggerRef}
        type="button"
        className="ag-btn ag-tool-btn agt-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
      >
        <IconDots />
        Ferramentas
      </button>

      {open && (
        <>
          <div className="agt-backdrop" {...dismiss.backdropProps} />
          <div
            className="agt-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Ferramentas da agenda"
            onClick={event => { if (event.target.closest('button')) close(); }}
          >
            <div className="agt-head">
              <p className="agt-title">Ferramentas</p>
              <button type="button" className="agt-close">Fechar</button>
            </div>
            <div className="agt-list">{children}</div>
          </div>
        </>
      )}
    </div>
  );
}

export default AgendaToolsMenu;
