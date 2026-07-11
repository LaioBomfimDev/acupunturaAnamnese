// ============================================================
// Superfície de curadoria da Acupunturista Revisora (tela cheia)
//
// Reaproveita CurationSections em modo "propor": cada ação vira uma
// proposta na fila do SuperAdm. Navegação própria à esquerda, painel
// à direita, e botão para voltar ao atendimento (workspace de Acupuntura).
// ============================================================

import { CurationSections, CURATION_SECTIONS } from './panels/CurationSections';

const REVIEWER_ACTOR = { role: 'knowledge_reviewer', label: 'Acupunturista', mode: 'propose' };

export function CurationWorkspace({ section, onSectionChange, therapistName, onExit, onSignOut }) {
  const active = CURATION_SECTIONS.some(item => item.id === section) ? section : CURATION_SECTIONS[0].id;

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div>
            <h1>Curadoria</h1>
            <p>Revisão clínica · Acupuntura</p>
          </div>
        </div>

        <div className="sidebar-profile">
          <span>{String(therapistName || 'AC').slice(0, 2).toUpperCase()}</span>
          <div>
            <b>{therapistName || 'Acupunturista'}</b>
            <small>Revisora de curadoria</small>
          </div>
        </div>

        <button type="button" className="sidebar-switch-area" onClick={onExit}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3 4 7l4 4" />
            <path d="M4 7h16" />
            <path d="m16 21 4-4-4-4" />
            <path d="M20 17H4" />
          </svg>
          Voltar ao atendimento
        </button>

        <nav className="nav nav-super-admin">
          <div className="nav-group">
            <span className="nav-group-title">Curadoria</span>
            {CURATION_SECTIONS.map(item => (
              <button
                key={item.id}
                className={active === item.id ? 'active' : ''}
                onClick={() => onSectionChange?.(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
              >
                <span className="nav-label">
                  <span>{item.label}</span>
                  <small>{item.description}</small>
                </span>
              </button>
            ))}
          </div>
        </nav>
      </aside>

      <main className="main">
        <div className="app-topbar no-print">
          <div>
            <h1>Curadoria da Acupuntura</h1>
            <div className="active-specialty-badge">
              Suas alterações são enviadas ao SuperAdm para aprovação final.
            </div>
          </div>
          <div className="app-topbar-actions">
            <button className="topbar-button" onClick={onSignOut}>Sair</button>
          </div>
        </div>

        <div className="workspace-grid workspace-grid-full">
          <section>
            <CurationSections activeSection={active} actor={REVIEWER_ACTOR} />
          </section>
        </div>
      </main>
    </div>
  );
}
