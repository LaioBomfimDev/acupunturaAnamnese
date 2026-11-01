import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '../../hooks/useDismiss';
import { WHATSAPP_HELP } from '../../data/screenHelp';
import { ScreenHelp } from '../ui/ScreenHelp';
import { TOOL_GLYPHS } from '../ui/hubGlyphs';
import '../../styles/whatsapp.css';

function WhatsAppIcon({ kind = 'chat', size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === 'chat' && TOOL_GLYPHS.whatsapp}
      {kind === 'qr' && <><rect x="3" y="3" width="6" height="6" rx="1" /><rect x="15" y="3" width="6" height="6" rx="1" /><rect x="3" y="15" width="6" height="6" rx="1" /><path d="M15 15h3v3h3v3h-6v-3M12 3v3m0 5v2M3 12h5m7 0h6m-9 4v5" /></>}
      {kind === 'phone' && <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 18h4" /></>}
      {kind === 'search' && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>}
      {kind === 'send' && <path d="m3 3 19 9-19 9 4-9-4-9Zm4 9h15" />}
      {kind === 'close' && <path d="m6 6 12 12M18 6 6 18" />}
      {kind === 'lock' && <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>}
    </svg>
  );
}

// Etapa 1: só a área de conexão. Não simula QR nem abre uma sessão.
// O vínculo real exige o serviço do WhatsApp, com autorização no servidor.
export function WhatsAppConnectionDialog({ onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const dismiss = useDismiss({ onClose });

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  function keepFocusInDialog(event) {
    if (event.key !== 'Tab') return;
    const buttons = event.currentTarget.querySelectorAll('button:not(:disabled)');
    const first = buttons[0];
    const last = buttons[buttons.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return (
    <div className="wa-connect-overlay" {...dismiss.backdropProps}>
      <section className="wa-connect-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={keepFocusInDialog}>
        <header className="wa-dialog-head">
          <div>
            <p className="wa-eyebrow">WhatsApp da clínica</p>
            <h2 id={titleId}>Conectar WhatsApp</h2>
          </div>
          <button ref={closeRef} type="button" className="wa-icon-button" aria-label="Fechar conexão" onClick={onClose}>
            <WhatsAppIcon kind="close" />
          </button>
        </header>
        <div className="wa-connect-grid">
          <div className="wa-qr-placeholder" role="status">
            <span><WhatsAppIcon kind="qr" size={48} /></span>
            <strong>Código QR indisponível</strong>
            <p>A conexão ao WhatsApp ainda não está habilitada nesta etapa.</p>
          </div>
          <div className="wa-connect-instructions">
            <h3>Como será a vinculação</h3>
            <ol>
              <li><b>1</b><span>Abra o <strong>WhatsApp no celular</strong> da clínica.</span></li>
              <li><b>2</b><span>Entre em <strong>Aparelhos conectados</strong>.</span></li>
              <li><b>3</b><span>Toque em <strong>Conectar um aparelho</strong> e leia o QR mostrado aqui.</span></li>
            </ol>
            <p className="wa-connect-note">Quando a vinculação estiver disponível, o código real aparecerá neste espaço.</p>
          </div>
        </div>
        <footer className="wa-dialog-footer">
          <p><WhatsAppIcon kind="lock" size={16} /><span>Este espaço ainda não conecta contas ou carrega mensagens.</span></p>
          <button type="button" className="wa-button wa-button--primary" onClick={onClose}>Entendi</button>
        </footer>
      </section>
    </div>
  );
}

export function WhatsAppScreen() {
  const [connectionOpen, setConnectionOpen] = useState(false);
  const triggerRef = useRef(null);
  const unavailableId = useId();

  function closeConnection() {
    setConnectionOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div className="wa-screen">
      <div className="screen-title-row wa-title-row">
        <div className="wa-title">
          <span className="wa-title-icon"><WhatsAppIcon size={27} /></span>
          <h1>WhatsApp</h1>
        </div>
        <ScreenHelp topic={WHATSAPP_HELP} />
      </div>

      <section className="wa-connection-bar" aria-label="Conexão do WhatsApp">
        <div className="wa-connection-label">
          <span className="wa-bar-icon"><WhatsAppIcon kind="qr" /></span>
          <div>
            <h2>Conexão da clínica</h2>
            <p id={unavailableId}>A vinculação e as conversas pelo painel ainda não estão disponíveis.</p>
          </div>
        </div>
        <div className="wa-connection-actions">
          <span className="wa-status"><i aria-hidden="true" />Em preparação</span>
          <button ref={triggerRef} type="button" className="wa-button wa-desktop-connect" aria-haspopup="dialog" aria-expanded={connectionOpen} onClick={() => setConnectionOpen(true)}>
            <WhatsAppIcon kind="qr" size={17} />Ver conexão
          </button>
        </div>
      </section>

      <p className="wa-mobile-note"><WhatsAppIcon kind="phone" size={18} /><span>Os envios pelo celular continuam abrindo o aplicativo do WhatsApp.</span></p>

      <section className="wa-workspace" aria-label="Espaço de conversas do WhatsApp">
        <aside className="wa-conversations" aria-label="Lista de conversas">
          <header>
            <h2>Conversas</h2>
            <label className="wa-search">
              <WhatsAppIcon kind="search" size={17} />
              <input type="search" placeholder="Buscar conversa" aria-label="Buscar conversa" aria-describedby={unavailableId} disabled />
            </label>
          </header>
          <div className="wa-list-empty">
            <span><WhatsAppIcon size={26} /></span>
            <h3>Nenhuma conversa carregada</h3>
            <p>As conversas aparecerão aqui quando a conexão da clínica estiver disponível.</p>
          </div>
        </aside>

        <section className="wa-thread" aria-label="Conversa selecionada">
          <header className="wa-thread-head">
            <span><WhatsAppIcon size={19} /></span>
            <div><h2>Espaço da conversa</h2><p>Atendimento no próprio Vitalis</p></div>
          </header>
          <div className="wa-thread-empty">
            <span className="wa-empty-mark"><WhatsAppIcon size={34} /></span>
            <h2>Um espaço para conversar</h2>
            <p>Aqui você poderá ler e responder às conversas da clínica, sem abrir outra aba.</p>
          </div>
          <div className="wa-composer">
            <input type="text" placeholder="Envio pelo painel em preparação" aria-label="Mensagem" aria-describedby={unavailableId} disabled />
            <button type="button" className="wa-button wa-button--primary" aria-label="Enviar mensagem, ainda indisponível" title="O envio pelo painel ainda não está disponível" disabled>
              <WhatsAppIcon kind="send" size={20} />
            </button>
          </div>
        </section>
      </section>

      {connectionOpen && createPortal(<WhatsAppConnectionDialog onClose={closeConnection} />, document.body)}
    </div>
  );
}
