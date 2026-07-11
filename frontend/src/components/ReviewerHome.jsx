// ============================================================
// Tela inicial da Acupunturista Revisora
//
// À esquerda, o "bem-vindo" com a Acupuntura liberada (ela entra no
// workspace real, com pacientes, para validar a anamnese de ponta a
// ponta). À direita, o card de Curadoria com todas as abas — clicar
// abre a superfície de curadoria em modo "propor".
// ============================================================

import { CURATION_SECTIONS } from './panels/CurationSections';

export function ReviewerHome({ therapistName, onEnterAcupuntura, onOpenCuration, onSignOut }) {
  return (
    <section className="home-screen">
      <header className="home-hero">
        <div>
          <h2 className="home-greeting-title">Oi, {therapistName || 'profissional'}</h2>
          <h2>Acupuntura e curadoria</h2>
          <span>Entre no atendimento de Acupuntura ou revise a curadoria clínica.</span>
        </div>
        <div className="home-meta">
          <button className="quiet-button" onClick={onSignOut}>Sair</button>
        </div>
      </header>

      <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
        {/* Bem-vindo / entrar na Acupuntura */}
        <section className="start-panel">
          <div className="start-panel-head">
            <div>
              <p className="small">Atendimento</p>
              <h2>Acupuntura</h2>
            </div>
          </div>
          <p className="small" style={{ margin: '0 0 16px' }}>
            Abra o workspace completo de MTC — anamnese, língua, pulso, protocolo,
            evolução e relatório — com seus pacientes reais.
          </p>
          <button className="primary-button" type="button" onClick={onEnterAcupuntura}>
            Entrar na Acupuntura
          </button>
        </section>

        {/* Card de curadoria com todas as abas */}
        <section className="start-panel">
          <div className="start-panel-head">
            <div>
              <p className="small">Curadoria</p>
              <h2>Revisar e propor</h2>
              <span className="small">Suas propostas vão ao SuperAdm para aprovação final.</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {CURATION_SECTIONS.map(item => (
              <button
                key={item.id}
                type="button"
                className="admin-user-row admin-user-button"
                onClick={() => onOpenCuration?.(item.id)}
              >
                <div className="admin-user-main">
                  <b>{item.label}</b>
                  <small>{item.description}</small>
                </div>
                <span className="admin-user-open">Abrir</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
