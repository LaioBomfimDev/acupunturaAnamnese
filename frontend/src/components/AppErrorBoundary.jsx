import { Component } from 'react';
import { reportClientError } from '../services/telemetry';

// Estilos inline de propósito: esta é a última rede de segurança do app, e
// foi justamente a dependência de classes CSS externas (.login-screen/
// .login-card, removidas num rebrand anterior sem que ninguém notasse que
// esta tela ainda as usava) que deixou a tela de erro sem nenhum estilo em
// produção. Usando só tokens de styles/tokens.css (carregados antes de
// qualquer render, ver main.jsx) o visual não pode mais apodrecer em
// silêncio se uma classe de outra tela for renomeada de novo.
const styles = {
  screen: {
    minHeight: '100svh',
    display: 'grid',
    placeItems: 'center',
    padding: 'max(24px, env(safe-area-inset-top, 0px)) 20px max(24px, env(safe-area-inset-bottom, 0px))',
    background:
      'radial-gradient(circle at 12% -10%, rgba(179, 65, 60, 0.18), transparent 42%),'
      + 'linear-gradient(160deg, var(--r1-navy-800), var(--r1-navy-900) 85%)',
    fontFamily: 'var(--r1-font-sans)',
  },
  card: {
    width: 'min(100%, 460px)',
    boxSizing: 'border-box',
    padding: 'clamp(26px, 4vw, 36px)',
    borderRadius: 'var(--r1-radius-lg)',
    borderLeft: '3px solid var(--r1-danger)',
    background: 'var(--r1-surface)',
    boxShadow: 'var(--r1-shadow-lg)',
  },
  iconBadge: {
    display: 'grid',
    placeItems: 'center',
    width: 44,
    height: 44,
    marginBottom: 18,
    borderRadius: '50%',
    background: 'var(--r1-danger-bg)',
    color: 'var(--r1-danger)',
  },
  eyebrow: {
    margin: '0 0 8px',
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: '0.9px',
    textTransform: 'uppercase',
    color: 'var(--r1-danger)',
  },
  title: {
    margin: '0 0 10px',
    fontFamily: 'var(--r1-font-display)',
    fontSize: 'clamp(21px, 3vw, 25px)',
    fontWeight: 600,
    lineHeight: 1.22,
    color: 'var(--r1-text)',
  },
  body: {
    margin: '0 0 20px',
    fontSize: 14,
    lineHeight: 1.55,
    color: 'var(--r1-text-muted)',
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 22,
    padding: '9px 10px 9px 12px',
    borderRadius: 'var(--r1-radius-sm)',
    border: '1px solid var(--r1-border-subtle)',
    background: 'var(--r1-surface-sunken)',
  },
  codeText: {
    flex: 1,
    minWidth: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 12,
    color: 'var(--r1-text-muted)',
    overflowWrap: 'anywhere',
  },
  copyButton: {
    flex: '0 0 auto',
    padding: '6px 10px',
    border: '1px solid var(--r1-border-subtle)',
    borderRadius: 'var(--r1-radius-sm)',
    background: 'var(--r1-surface)',
    color: 'var(--r1-text-muted)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
  },
  primaryButton: {
    width: '100%',
    minHeight: 'var(--r1-tap)',
    boxSizing: 'border-box',
    border: 0,
    borderRadius: 'var(--r1-radius-md)',
    background: 'var(--r1-surface-inverse)',
    color: 'var(--r1-text-on-inverse)',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
    boxShadow: 'var(--r1-shadow-sm)',
  },
  details: {
    marginTop: 16,
    fontSize: 11,
    color: 'var(--r1-text-subtle)',
    cursor: 'pointer',
  },
  pre: {
    marginTop: 8,
    maxHeight: 160,
    overflow: 'auto',
    padding: 10,
    borderRadius: 'var(--r1-radius-sm)',
    background: 'var(--r1-surface-sunken)',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 11,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    cursor: 'auto',
  },
};

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { correlationId: '', failed: false, copied: false, debugError: null };
  }

  static getDerivedStateFromError(error) {
    return { failed: true, debugError: error };
  }

  componentDidCatch(error, errorInfo) {
    // reportClientError manda só nome/código/correlationId pro backend, de
    // propósito (ver services/telemetry.js — nunca payload clínico ou
    // stack). O erro completo, com stack e a árvore de componentes, fica
    // só no console local do navegador pra depuração manual.
    console.error('[AppErrorBoundary] falha capturada:', error, errorInfo?.componentStack);
    this.setState({
      correlationId: reportClientError(error, { component: 'AppErrorBoundary' }),
    });
  }

  handleCopyCode = async () => {
    if (!this.state.correlationId) return;
    try {
      await navigator.clipboard.writeText(this.state.correlationId);
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 1500);
    } catch {
      // Sem permissão/API de clipboard: o código continua selecionável à mão.
    }
  };

  render() {
    if (!this.state.failed) return this.props.children;

    const { correlationId, copied, debugError } = this.state;

    return (
      <main style={styles.screen}>
        <section style={styles.card} role="alert">
          <div style={styles.iconBadge} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>

          <p style={styles.eyebrow}>Falha segura</p>
          <h1 style={styles.title}>Não foi possível abrir esta tela</h1>
          <p style={styles.body}>
            Nenhum dado deve ser reenviado antes de recarregar. Se o problema continuar,
            informe o código abaixo ao suporte.
          </p>

          {correlationId && (
            <div style={styles.codeRow}>
              <span style={styles.codeText}>Código: {correlationId}</span>
              <button type="button" style={styles.copyButton} onClick={this.handleCopyCode}>
                {copied ? 'Copiado' : 'Copiar'}
              </button>
            </div>
          )}

          <button type="button" style={styles.primaryButton} onClick={() => window.location.reload()}>
            Recarregar o sistema
          </button>

          {import.meta.env.DEV && debugError && (
            <details style={styles.details}>
              <summary>Detalhes técnicos (só em desenvolvimento)</summary>
              <pre style={styles.pre}>{String(debugError?.stack || debugError?.message || debugError)}</pre>
            </details>
          )}
        </section>
      </main>
    );
  }
}
