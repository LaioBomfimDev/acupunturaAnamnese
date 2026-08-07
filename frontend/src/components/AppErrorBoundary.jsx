import { Component } from 'react';
import { reportClientError } from '../services/telemetry';

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { correlationId: '', failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    this.setState({
      correlationId: reportClientError(error, { component: 'AppErrorBoundary' }),
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="login-screen" role="alert">
        <section className="login-card">
          <p className="small">Falha segura</p>
          <h1>Não foi possível abrir esta tela</h1>
          <p>
            Nenhum dado deve ser reenviado antes de recarregar. Se o problema continuar,
            informe o código abaixo ao suporte.
          </p>
          {this.state.correlationId && (
            <p className="small">Código: {this.state.correlationId}</p>
          )}
          <button type="button" className="primary-button" onClick={() => window.location.reload()}>
            Recarregar o sistema
          </button>
        </section>
      </main>
    );
  }
}
