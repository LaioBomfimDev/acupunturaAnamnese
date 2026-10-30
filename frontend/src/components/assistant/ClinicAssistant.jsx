import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '../../hooks/useDismiss';
import { canSeeScales } from '../../utils/instrumentAccess';
import { formatBRL } from '../../utils/finance';
import {
  ASSISTANT_MAX_MESSAGE_CHARS,
  ASSISTANT_SCREEN_LABELS,
  assistantRoleOf,
  linksForRole,
} from '../../utils/clinicAssistant';
import {
  openScreenFromAssistant,
  refreshAttention,
  sendAssistantMessage,
  setAssistantDraft,
  setAssistantOpen,
  toggleAttentionCollapsed,
  useAssistantState,
} from './assistantStore';

// ============================================================
// Assistente da clínica (30/10/2026, etapa 1; prévia C + painel A).
//
// Tela inicial: cartão "Sua colega de clínica" (AssistantHomeCard), com
// o que pede atenção hoje e a conversa. Nas outras telas: o botão
// "Assistente" minimizado no canto (ClinicAssistantLauncher), com o
// número do que pede atenção; um toque abre o painel ao lado com a
// mesma conversa. No celular e no tablet o painel ocupa a tela.
//
// Nesta etapa ela explica o sistema e conta o que pede atenção; não lê
// paciente nem financeiro na conversa. Lembra e explica, nunca decide.
// ============================================================

const ATTENTION_MAX_AGE_MS = 2 * 60 * 1000;

const STARTERS = {
  admin: ['Explique esta tela', 'Como lanço um pacote?', 'Como envio uma escala para casa?'],
  professional: ['Explique esta tela', 'Como registro um atendimento já realizado?', 'Como envio uma escala para casa?'],
  reception: ['Explique esta tela', 'Como copio os horários vagos?', 'Como cadastro um paciente?'],
};

export function PulseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12h4l2-5 4 10 2-5h6" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

/** Atalhos que esta pessoa consegue abrir de fato. */
function allowedLinks(profile) {
  const role = assistantRoleOf(profile);
  return linksForRole(role).filter(link => link !== 'escalas' || canSeeScales(profile));
}

function useAttentionRefresh(profile) {
  const role = assistantRoleOf(profile);
  useEffect(() => {
    refreshAttention(role, { maxAgeMs: ATTENTION_MAX_AGE_MS });
  }, [role]);
  return role;
}

function AttentionList({ attention, collapsed, allowed, onToggle }) {
  const headingId = useId();
  const hasItems = attention.items.length > 0;
  return (
    <section className="ca-attention" aria-labelledby={headingId}>
      <div className="ca-attention-head">
        <h3 id={headingId}>Sua atenção hoje</h3>
        {onToggle && (
          <button type="button" className="ca-link-button" onClick={onToggle} aria-expanded={!collapsed}>
            {collapsed ? 'mostrar' : 'recolher'}
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          {attention.loading && !attention.loaded && <p className="ca-attention-note">Conferindo…</p>}
          {attention.loaded && !hasItems && attention.failed.length === 0 && (
            <p className="ca-attention-note">Nada pedindo atenção agora.</p>
          )}
          {hasItems && (
            <ul className="ca-attention-list">
              {attention.items.map(item => {
                const canOpen = allowed.includes(item.target);
                const content = (
                  <>
                    <span className={`ca-dot ca-dot--${item.tone}`} aria-hidden="true" />
                    <span className="ca-attention-text">
                      <b>{item.cents !== undefined ? formatBRL(item.cents) : item.strong}</b> {item.text}
                    </span>
                    {canOpen && <span className="ca-attention-go">{item.targetLabel} →</span>}
                  </>
                );
                return (
                  <li key={item.id}>
                    {canOpen ? (
                      <button type="button" className="ca-attention-item" onClick={() => openScreenFromAssistant(item.target)}>
                        {content}
                      </button>
                    ) : (
                      <div className="ca-attention-item">{content}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {attention.loaded && attention.failed.length > 0 && (
            <p className="ca-attention-note ca-attention-note--warn">
              Não consegui conferir: {attention.failed.join(', ')}.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Conversation({ state, allowed, role, inputRef }) {
  const listRef = useRef(null);
  const inputId = useId();

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [state.messages.length, state.sending]);

  function submit(event) {
    event.preventDefault();
    sendAssistantMessage();
  }

  return (
    <>
      <div className="ca-messages" ref={listRef} aria-live="polite">
        {state.messages.length === 0 && (
          <div className="ca-starters">
            <p>Pergunte sobre o sistema ou sobre esta tela. Ainda não vejo pacientes nem o financeiro.</p>
            <div className="ca-chips">
              {(STARTERS[role] || STARTERS.professional).map(text => (
                <button key={text} type="button" className="ca-chip" onClick={() => sendAssistantMessage(text)} disabled={state.sending}>
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}
        {state.messages.map((message, index) => (
          <div key={index} className={`ca-bubble ca-bubble--${message.role}`}>
            <p>{message.text}</p>
            {message.role === 'assistant' && message.links?.filter(link => allowed.includes(link)).map(link => (
              <button key={link} type="button" className="ca-open" onClick={() => openScreenFromAssistant(link)}>
                Abrir {ASSISTANT_SCREEN_LABELS[link]} →
              </button>
            ))}
          </div>
        ))}
        {state.sending && <div className="ca-bubble ca-bubble--assistant ca-bubble--typing">Pensando…</div>}
      </div>

      <form className="ca-composer" onSubmit={submit}>
        {state.error && <p className="ca-error" role="alert">{state.error}</p>}
        <div className="ca-composer-row">
          <label htmlFor={inputId} className="sr-only">Pergunta para a assistente</label>
          <input
            id={inputId}
            ref={inputRef}
            type="text"
            value={state.draft}
            maxLength={ASSISTANT_MAX_MESSAGE_CHARS}
            placeholder="Pergunte sobre esta tela ou o sistema"
            onChange={event => setAssistantDraft(event.target.value)}
            disabled={state.sending}
          />
          <button type="submit" className="ca-send" aria-label="Enviar" disabled={state.sending || !state.draft.trim()}>
            <SendIcon />
          </button>
        </div>
        <p className="ca-footnote">Ela lembra e explica. Quem decide é você.</p>
      </form>
    </>
  );
}

/** Cartão da tela inicial (prévia C). */
export function AssistantHomeCard({ profile }) {
  const state = useAssistantState();
  const role = useAttentionRefresh(profile);
  const allowed = allowedLinks(profile);
  return (
    <section className="ca-home" aria-label="Assistente">
      <div className="ca-home-side">
        <div className="ca-identity">
          <span className="ca-avatar"><PulseIcon /></span>
          <div>
            <p className="ca-name">Sua colega de clínica</p>
            <p className="ca-sub">Separei o que pede atenção hoje</p>
          </div>
        </div>
        <AttentionList attention={state.attention} collapsed={false} allowed={allowed} />
      </div>
      <div className="ca-home-chat">
        <Conversation state={state} allowed={allowed} role={role} />
      </div>
    </section>
  );
}

/** Botão minimizado + painel ao lado (prévia A), em todas as telas menos a inicial. */
export function ClinicAssistantLauncher({ profile }) {
  const state = useAssistantState();
  const role = useAttentionRefresh(profile);
  const allowed = allowedLinks(profile);
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const titleId = useId();
  const panelId = useId();
  const open = state.open;

  function minimize() {
    setAssistantOpen(false);
    triggerRef.current?.focus();
  }

  // Minimizar não perde nada (a conversa e o rascunho ficam guardados),
  // então Esc e clique fora fecham direto.
  const dismiss = useDismiss({ open, onClose: minimize });

  useEffect(() => {
    if (!open) return;
    refreshAttention(role, { maxAgeMs: ATTENTION_MAX_AGE_MS });
    inputRef.current?.focus();
  }, [open, role]);

  if (state.screen === 'inicio') return null;

  const count = state.attention.items.length;
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="ca-launcher no-print"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={count ? `Abrir a assistente: ${count} ${count === 1 ? 'item pede' : 'itens pedem'} atenção hoje` : 'Abrir a assistente'}
        onClick={() => setAssistantOpen(true)}
      >
        <span className="ca-launcher-icon">
          <PulseIcon />
          {count > 0 && <span className="ca-launcher-count" aria-hidden="true">{count}</span>}
        </span>
        <span className="ca-launcher-label">Assistente</span>
      </button>

      {open && createPortal(
        <div className="ca-scrim no-print" {...dismiss.backdropProps}>
          <aside id={panelId} className="ca-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <header className="ca-panel-head">
              <span className="ca-avatar"><PulseIcon /></span>
              <div>
                <h2 id={titleId} className="ca-name">Assistente</h2>
                <p className="ca-sub">Nesta tela: {ASSISTANT_SCREEN_LABELS[state.screen] || 'Tela inicial'}</p>
              </div>
              <button type="button" className="ca-minimize" onClick={minimize} aria-label="Minimizar a assistente">–</button>
            </header>
            <AttentionList
              attention={state.attention}
              collapsed={state.attentionCollapsed}
              allowed={allowed}
              onToggle={toggleAttentionCollapsed}
            />
            <Conversation state={state} allowed={allowed} role={role} inputRef={inputRef} />
          </aside>
        </div>,
        document.body,
      )}
    </>
  );
}
