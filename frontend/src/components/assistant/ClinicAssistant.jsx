import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '../../hooks/useDismiss';
import { canSeeScales } from '../../utils/instrumentAccess';
import { formatBRL } from '../../utils/finance';
import { AI_SURFACES } from '../../services/aiCorrectionService';
import { AiCorrectionButton } from '../ui/AiCorrectionButton';
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
  setAssistantProfile,
  setAssistantDraft,
  setAssistantOpen,
  toggleAttentionCollapsed,
  useAssistantState,
} from './assistantStore';

// ============================================================
// Assistente da clínica (30/10/2026, etapa 1; prévia C + painel A).
//
// Só o botão "Assistente" flutuante, em todas as telas, inclusive a
// inicial (01/11/2026: o cartão da tela inicial era teste e saiu), com o
// número do que pede atenção; um toque abre o painel ao lado. No celular
// e no tablet o painel ocupa a tela.
//
// Ela explica o sistema, consulta números da clínica sem paciente e
// aprende com o "Corrigir" de cada resposta. Lembra e explica, nunca
// decide.
//
// Visual "Noite" (01/11/2026, opção C entre três prévias): o corpo da
// assistente é um orbe de luz na cor da clínica; o resto está em
// styles/assistant.css.
// ============================================================

const ATTENTION_MAX_AGE_MS = 2 * 60 * 1000;

const STARTERS = {
  admin: ['Explique esta tela', 'Quais horários vagos tenho amanhã?', 'Como lanço um pacote?'],
  professional: ['Explique esta tela', 'Quais horários vagos tenho amanhã?', 'Como envio uma escala para casa?'],
  reception: ['Explique esta tela', 'Como copio os horários vagos?', 'Como cadastro um paciente?'],
};

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
    setAssistantProfile(profile);
  }, [profile]);
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
                      <button type="button" className="ca-attention-item" onClick={() => openScreenFromAssistant(item.target, item.section)}>
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
            <p>Pergunte sobre o sistema, sobre esta tela ou sobre horários vagos da equipe. Ainda não vejo pacientes nem o financeiro.</p>
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
            {message.role === 'assistant' && (
              // Caminho C: quem corrige ensina a assistente (vale na hora para
              // a autora; para todos depois da aprovação do SuperAdm).
              <AiCorrectionButton
                surface={AI_SURFACES.CLINIC_ASSISTANT}
                aiOutput={{ answer: message.text }}
                contextSnapshot={{ question: state.messages[index - 1]?.text || '' }}
                label="Corrigir"
              />
            )}
          </div>
        ))}
        {state.sending && (
          <div className="ca-bubble ca-bubble--assistant ca-bubble--typing">
            <span className="ca-scan" aria-hidden="true" />
            <span className="ca-scan" aria-hidden="true" />
            {state.sendingStep === 'agenda' ? 'Consultando os dados da clínica…' : 'Pensando…'}
          </div>
        )}
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

/** Botão flutuante + painel ao lado, em todas as telas. */
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
        <span className="ca-launcher-icon" aria-hidden="true" />
        <span className="ca-launcher-label">Assistente</span>
        {count > 0 && <span className="ca-launcher-count" aria-hidden="true">{count}</span>}
      </button>

      {open && createPortal(
        <div className="ca-scrim no-print" {...dismiss.backdropProps}>
          <aside id={panelId} className="ca-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <span className="ca-stars" aria-hidden="true"><span /><span /><span /><span /><span /></span>
            <header className="ca-panel-head">
              <span className="ca-avatar" aria-hidden="true" />
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
