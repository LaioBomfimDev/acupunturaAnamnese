// Tela de carregamento padrão do sistema ("Preparando esta área...").
// Mora aqui, e não dentro do App, porque a tela Evoluções também a usa
// enquanto lê o prontuário de cada paciente.
export function PanelLoading() {
  return (
    <div className="app-loading" role="status" aria-live="polite" aria-label="Carregando">
      <div className="app-loading-mark">
        <span className="app-loading-ping" aria-hidden="true" />
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <circle cx="20" cy="20" r="17" className="app-loading-ring" />
          <path d="M9 20h6l2.5-7 4 14 2.5-7h7" className="app-loading-trace" />
        </svg>
      </div>
      <p className="app-loading-text">Preparando esta área...</p>
    </div>
  );
}
