// ============================================================
// Tela inicial da Revisora de curadoria (genérica por disciplina)
//
// À esquerda, o "bem-vindo" com a disciplina liberada (ela entra no
// workspace real, com pacientes, para validar a anamnese de ponta a
// ponta). À direita, o card de Curadoria com as abas DA SUA DISCIPLINA —
// clicar abre a superfície de curadoria em modo "propor".
//
// A disciplina vem do perfil (resolveReviewerDiscipline), não é chumbada:
// a revisora de acupuntura entra na Acupuntura; a de psicologia, na
// Psicologia, cada uma vendo só as seções da sua área.
// ============================================================

import { getDiscipline } from '../data/disciplines';
import { sectionsForDiscipline, isCurationSectionReady } from './panels/CurationSections';

export function ReviewerHome({ therapistName, discipline = 'acupuntura', onEnterDiscipline, onOpenCuration, onSignOut }) {
  const meta = getDiscipline(discipline);
  const label = meta?.label || 'Atendimento';
  // Abas prontas para propor aparecem primeiro; as em preparação vão ao fim.
  const sections = [...sectionsForDiscipline(discipline)].sort(
    (a, b) => Number(isCurationSectionReady(b.id)) - Number(isCurationSectionReady(a.id)),
  );

  return (
    <section className="home-screen">
      <header className="home-hero">
        <div>
          <h2 className="home-greeting-title">Oi, {therapistName || 'profissional'}</h2>
          <h2>{label} e curadoria</h2>
          <span>Entre no atendimento de {label} ou revise a curadoria clínica.</span>
        </div>
        <div className="home-meta">
          <button className="quiet-button" onClick={onSignOut}>Sair</button>
        </div>
      </header>

      <div className="home-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
        {/* Bem-vindo / entrar na disciplina */}
        <section className="start-panel">
          <div className="start-panel-head">
            <div>
              <p className="small">Atendimento</p>
              <h2>{label}</h2>
            </div>
          </div>
          <p className="small" style={{ margin: '0 0 16px' }}>
            Abra o workspace completo — anamnese e evolução — com seus pacientes reais.
          </p>
          <button className="primary-button" type="button" onClick={() => onEnterDiscipline?.(discipline)}>
            Entrar na {label}
          </button>
        </section>

        {/* Card de curadoria com as abas da disciplina */}
        <section className="start-panel">
          <div className="start-panel-head">
            <div>
              <p className="small">Curadoria</p>
              <h2>Revisar e propor</h2>
              <span className="small">Suas propostas vão ao SuperAdm para aprovação final.</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sections.map(item => {
              const ready = isCurationSectionReady(item.id);
              return (
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
                  <span className={`curation-tab-flag ${ready ? 'is-ready' : 'is-soon'}`}>
                    {ready ? 'Pronto' : 'Em breve'}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </section>
  );
}
