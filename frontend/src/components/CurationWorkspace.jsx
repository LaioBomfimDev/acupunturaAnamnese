// ============================================================
// Superfície de curadoria da Revisora (tela cheia, genérica por disciplina)
//
// Reaproveita CurationSections em modo "propor": cada ação vira uma
// proposta na fila do SuperAdm. Navegação própria à esquerda (só as
// seções da disciplina), painel à direita, e botão para voltar ao
// atendimento (workspace da disciplina).
// ============================================================

import { CurationSections, sectionsForDiscipline, isCurationSectionReady } from './panels/CurationSections';
import { getDiscipline } from '../data/disciplines';

export function CurationWorkspace({ section, onSectionChange, therapistName, discipline = 'acupuntura', onExit, onSignOut }) {
  const meta = getDiscipline(discipline);
  const label = meta?.label || 'Curadoria';
  // Prontas primeiro, em preparação ao fim.
  const sections = [...sectionsForDiscipline(discipline)].sort(
    (a, b) => Number(isCurationSectionReady(b.id)) - Number(isCurationSectionReady(a.id)),
  );
  const active = sections.some(item => item.id === section) ? section : (sections[0]?.id || null);
  const actor = { role: 'knowledge_reviewer', label, mode: 'propose', discipline };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="logo">
          <div>
            <h1>Curadoria</h1>
            <p>Revisão clínica · {label}</p>
          </div>
        </div>

        <div className="sidebar-profile">
          <span>{String(therapistName || label).slice(0, 2).toUpperCase()}</span>
          <div>
            <b>{therapistName || label}</b>
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
            {sections.map(item => (
              <button
                key={item.id}
                className={active === item.id ? 'active' : ''}
                onClick={() => onSectionChange?.(item.id)}
                aria-current={active === item.id ? 'page' : undefined}
              >
                <span className="nav-label">
                  <span>
                    {item.label}
                    {!isCurationSectionReady(item.id) && <span className="curation-nav-soon"> · sugerir</span>}
                  </span>
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
            <h1>Curadoria da {label}</h1>
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
            {active ? <CurationSections activeSection={active} actor={actor} /> : (
              <div className="empty-state">Nenhuma seção de curadoria disponível para esta disciplina.</div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
