import { buildHubCards } from '../data/disciplines';

// ============================================================
// Hub de disciplinas (pós-login)
// Fase 1 do plano docs/plano-clinica-multidisciplinar.md.
//
// Mostra TODAS as disciplinas da clínica: as liberadas no perfil
// em cor (clicáveis), as demais em cinza — a pessoa enxerga o todo,
// mas só entra nas suas. Disciplina liberada sem workspace pronto
// aparece com selo "em construção".
// ============================================================

const DISCIPLINE_GLYPHS = {
  acupuntura: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a4.5 4.5 0 0 1 0 9 4.5 4.5 0 0 0 0 9" />
      <circle cx="12" cy="7.5" r="1" />
      <circle cx="12" cy="16.5" r="1" />
    </>
  ),
  fisioterapia: <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  psicologia: (
    <>
      <path d="M12 3a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V19a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-3.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z" />
      <path d="M9.5 10h5M12 10v5" />
    </>
  ),
  nutricao: (
    <>
      <path d="M12 8c-4 0-6.5 2.6-6.5 6 0 3.6 2.7 7 6.5 7s6.5-3.4 6.5-7c0-3.4-2.5-6-6.5-6Z" />
      <path d="M12 8c0-2.5 1.5-4 4-5" />
      <path d="M12 8c0-1.5-1-2.5-2.5-3" />
    </>
  ),
};

function DisciplineIcon({ id }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="30"
      height="30"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {DISCIPLINE_GLYPHS[id]}
    </svg>
  );
}

const STATE_BADGES = {
  soon: 'Em construção',
  locked: 'Não habilitada',
};

export function DisciplineHub({ profile, therapistName, onSelect, onSignOut, onOpenClinicPatients, onOpenDocuments, onOpenAgenda }) {
  const cards = buildHubCards(profile);
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Reability';

  return (
    <div className="hub-screen">
      <header className="hub-topbar">
        <div className="hub-brand">
          <h1>{clinicName}</h1>
          <p>Clínica multidisciplinar</p>
        </div>
        <button type="button" className="topbar-button" onClick={onSignOut}>Sair</button>
      </header>

      <main className="hub-body">
        <p className="hub-greeting">Oi, {therapistName || 'profissional'}</p>
        <h2>Em qual área você vai atender agora?</h2>
        <p className="hub-note">
          Você enxerga todas as áreas da clínica; os cards coloridos são os liberados para o seu perfil.
        </p>

        <div className="hub-grid">
          {cards.map(card => {
            const badge = STATE_BADGES[card.state];
            const clickable = card.state === 'enabled';
            return (
              <button
                key={card.id}
                type="button"
                className={`hub-card hub-card-${card.state}`}
                onClick={clickable ? () => onSelect(card.id) : undefined}
                disabled={!clickable}
                title={
                  card.state === 'locked'
                    ? 'Área não habilitada para o seu perfil. Fale com a administração.'
                    : card.state === 'soon'
                      ? 'Liberada para você — o espaço de trabalho está em construção.'
                      : `Entrar em ${card.label}`
                }
              >
                <span className="hub-card-icon"><DisciplineIcon id={card.id} /></span>
                <span className="hub-card-text">
                  <b>{card.label}</b>
                  <small>{card.subtitle}</small>
                  <span className="hub-card-desc">{card.description}</span>
                </span>
                {badge && <span className={`hub-card-badge hub-card-badge-${card.state}`}>{badge}</span>}
                {clickable && <span className="hub-card-cta">Entrar →</span>}
              </button>
            );
          })}
        </div>

        {onOpenAgenda && (
          <button type="button" className="hub-secondary" onClick={onOpenAgenda}>
            <b>Agenda →</b>
            <span>Calendário de atendimentos, status do dia e aniversários dos pacientes.</span>
          </button>
        )}

        {onOpenClinicPatients && (
          <button type="button" className="hub-secondary" onClick={onOpenClinicPatients}>
            <b>Pacientes da clínica →</b>
            <span>Cadastro central, matrículas por área e envio entre profissionais.</span>
          </button>
        )}

        {onOpenDocuments && (
          <button type="button" className="hub-secondary" onClick={onOpenDocuments}>
            <b>Documentos timbrados →</b>
            <span>Envie um Word (.docx) e receba o documento no papel timbrado da clínica.</span>
          </button>
        )}
      </main>
    </div>
  );
}
