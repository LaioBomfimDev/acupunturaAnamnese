import { useEffect, useState } from 'react';
import { buildHubCards } from '../data/disciplines';
import { listAppointments, listPatientsAwaitingReturn } from '../services/appointmentService';
import { listClinicMembers } from '../services/clinicMembersService';
import { listClinicPatients } from '../services/clinicPatientsService';
import { currentMonthBirthdays, isCountableAppointment } from '../utils/gestaoDashboard';
import '../styles/console.css';

// ============================================================
// Home console (Fase 7) — tela inicial única com quatro leituras,
// decididas por `variant`:
//
//   'admin'              administração pura, não atende (ex.: Karen).
//                        Vê a navegação institucional primeiro e TODAS
//                        as áreas da clínica, só para consulta.
//   'admin-professional' administra e também atende (ex.: Denise).
//                        Sidebar prioriza as áreas dela; navegação
//                        institucional continua sempre visível abaixo.
//   'professional'       profissional comum: agenda, evolução pendente
//                        e a Gestão pessoal (cor da tela e cadastro)
//                        na navegação, área própria em destaque no
//                        conteúdo.
//   'reception'          recepção (2026-09-22): agenda completa,
//                        cadastro de pacientes, aniversários e
//                        documentos timbrados — sem NENHUM dado clínico
//                        (nem em modo consulta) e sem gestão/financeiro
//                        da instituição (só a Gestão pessoal: cor da
//                        tela e cadastro, igual ao profissional).
//
// Substitui ClinicAdminHome.jsx e DisciplineHub.jsx, que tratavam isso
// como duas telas fixas (só existia "admin sem disciplina" vs. "todo
// o resto" — não havia diferença entre admin que atende e profissional
// comum). Ver docs/plano-clinica-multidisciplinar.md.
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
  neuropsicologia: (
    <>
      <path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 2.8V13a3 3 0 0 0 2 2.8V17a3 3 0 0 0 3 3" />
      <path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 2.8V13a3 3 0 0 1-2 2.8V17a3 3 0 0 1-3 3" />
      <path d="M12 4v16" />
    </>
  ),
};

const TOOL_GLYPHS = {
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h2M8 17h2M14 14h2M14 17h2" />
    </>
  ),
  evolucao: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  gestao: (
    <>
      <path d="M4 19h16" />
      <rect x="6" y="11" width="3" height="8" />
      <rect x="11" y="6" width="3" height="13" />
      <rect x="16" y="14" width="3" height="5" />
    </>
  ),
  pacientes: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 9.5a3 3 0 1 0 0-6" />
      <path d="M15 14.5c2.8.4 4.8 1.9 5.5 4" />
    </>
  ),
  documentos: (
    <>
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </>
  ),
  cake: (
    <>
      <path d="M4 21v-7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7" />
      <path d="M4 17c1.2.8 2.2.8 3.4 0 1.2-.8 2.2-.8 3.4 0 1.2.8 2.2.8 3.4 0 1.2-.8 2.2-.8 3.4 0" />
      <path d="M9 12V8M12 12V8M15 12V8" />
      <path d="M9 5.5c0-1 .5-1.5.5-2.5M12 5.5c0-1 .5-1.5.5-2.5M15 5.5c0-1 .5-1.5.5-2.5" />
    </>
  ),
  returns: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v4h4" />
    </>
  ),
};

function Icon({ id, glyphs = TOOL_GLYPHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyphs[id]}
    </svg>
  );
}

function NavItem({ icon, title, description, badge, onClick, compact = false }) {
  if (compact) {
    return (
      <button type="button" className="hc-nav-item-compact" onClick={onClick}>
        <span className="hc-nav-icon-sm"><Icon id={icon} glyphs={DISCIPLINE_GLYPHS} /></span>
        <span>{title}</span>
      </button>
    );
  }
  return (
    <button type="button" className="hc-nav-item" onClick={onClick}>
      {badge > 0 && <span className="hc-nav-badge">{badge > 99 ? '99+' : badge}</span>}
      <span className="hc-nav-icon"><Icon id={icon} /></span>
      <span>
        <p className="hc-nav-title">{title}</p>
        <p className="hc-nav-desc">{description}</p>
      </span>
    </button>
  );
}

function Stat({ icon, value, label, personal = false, onClick }) {
  return (
    <button type="button" className={`hc-stat${personal ? ' hc-stat-personal' : ''}`} onClick={onClick} disabled={!onClick}>
      <span className="hc-stat-icon"><Icon id={icon} /></span>
      <span>
        <b>{value === null ? '—' : value}</b>
        <span>{label}</span>
      </span>
    </button>
  );
}

function DisciplineRow({ card, ctaLabel, tagLabel, onSelect }) {
  const clickable = card.state !== 'soon';
  return (
    <button
      type="button"
      className={`hc-row-item${tagLabel ? '' : ' hc-row-item-primary'}`}
      onClick={clickable ? () => onSelect(card.id) : undefined}
      disabled={!clickable}
    >
      <span className="hc-row-icon"><Icon id={card.id} glyphs={DISCIPLINE_GLYPHS} /></span>
      <span className="hc-row-text">
        <b>{card.label}</b>
        <p>{card.subtitle}</p>
      </span>
      {tagLabel && <span className="hc-row-tag">{tagLabel}</span>}
      {clickable ? (
        <span className={tagLabel ? 'hc-row-cta' : 'hc-row-cta-btn'}>{ctaLabel}</span>
      ) : (
        <span className="hc-row-tag">Em construção</span>
      )}
    </button>
  );
}

function DisciplineChip({ card }) {
  return (
    <div className="hc-chip">
      <span className="hc-chip-icon"><Icon id={card.id} glyphs={DISCIPLINE_GLYPHS} /></span>
      <b>{card.label}</b>
      <small>Não habilitada</small>
    </div>
  );
}

const VARIANT_COPY = {
  admin: {
    role: 'Console de administração',
    heading: 'Visão geral de hoje',
    lead: 'Sua conta não atende pacientes — a navegação da administração fica fixa ao lado. Aqui embaixo você acompanha os números da clínica e pode abrir qualquer área só para consulta.',
    navLabel: 'Administração',
    areasLabel: 'Áreas da clínica',
    areasPill: 'Modo consulta',
  },
  'admin-professional': {
    role: 'Administração e atendimento',
    heading: 'Visão geral de hoje',
    lead: 'Você administra a instituição e também atende — a lista abaixo já separa suas áreas do resto da clínica.',
    navLabel: 'Administração',
    areasLabel: 'Suas áreas de atendimento',
  },
  professional: {
    role: 'Instituição multidisciplinar',
    heading: 'Em qual área você vai atender agora?',
    navLabel: 'Atalhos',
  },
  reception: {
    role: 'Recepção',
    heading: 'Visão geral de hoje',
    lead: 'Sua conta cuida da agenda e do cadastro de pacientes da clínica — sem acesso a prontuário, evolução ou financeiro.',
    navLabel: 'Recepção',
  },
};

export function HomeConsole({
  profile, therapistName, variant,
  onSelect, onSignOut,
  onOpenAgenda, onOpenPendingEvolutions, onOpenGestao, onOpenClinicPatients, onOpenDocuments, onOpenBirthdays,
  pendingEvolutionsCount = 0,
}) {
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Vitalis';
  const copy = VARIANT_COPY[variant] || VARIANT_COPY.professional;
  const cards = buildHubCards(profile);

  // Admin puro enxerga TODAS as áreas para consulta, mesmo que o dado
  // de disciplines um dia venha incompleto — o objetivo de quem não
  // atende é visão total, não licenciamento por área. Recepção é o
  // oposto: NENHUMA área clínica, nem pra consulta — buildHubCards já
  // devolve tudo 'locked' pra ela (resolveUserDisciplines corta cedo),
  // e aqui a lista nem aparece na tela.
  const attendable = variant === 'admin'
    ? cards
    : variant === 'reception'
      ? []
      : cards.filter(card => card.state !== 'locked');
  const locked = (variant === 'admin' || variant === 'reception') ? [] : cards.filter(card => card.state === 'locked');

  const [stats, setStats] = useState(null);
  const isFrontDeskView = variant === 'admin' || variant === 'reception';
  // Gestão da instituição só para admin; profissional e recepção abrem a
  // Gestão pessoal (cor da tela + cadastro) — atalhos de número não levam
  // pra lá.
  const hasInstitutionalGestao = variant === 'admin' || variant === 'admin-professional';
  const openInstitutionalGestao = hasInstitutionalGestao ? onOpenGestao : null;

  useEffect(() => {
    if (variant === 'professional') return undefined;
    let cancelled = false;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const range = { from: todayStart.toISOString(), to: todayEnd.toISOString() };

    async function load() {
      try {
        if (isFrontDeskView) {
          const [clinicAppointments, members, patients] = await Promise.all([
            listAppointments(range),
            listClinicMembers(),
            listClinicPatients(),
          ]);
          if (cancelled) return;
          setStats({
            today: clinicAppointments.filter(isCountableAppointment).length,
            activeProfessionals: members.filter(member => member.is_active).length,
            birthdaysThisMonth: currentMonthBirthdays(patients).length,
          });
        } else {
          const [clinicAppointments, ownAppointments, awaitingReturn] = await Promise.all([
            listAppointments(range),
            listAppointments({ ...range, professionalId: profile?.id }),
            listPatientsAwaitingReturn({ minDays: 0 }),
          ]);
          if (cancelled) return;
          setStats({
            ownToday: ownAppointments.filter(isCountableAppointment).length,
            today: clinicAppointments.filter(isCountableAppointment).length,
            awaitingReturn: awaitingReturn.length,
          });
        }
      } catch {
        if (!cancelled) setStats({});
      }
    }

    load();
    return () => { cancelled = true; };
  }, [variant, profile?.id, isFrontDeskView]);

  const areasNote = variant === 'professional'
    ? `Você enxerga todas as áreas da instituição; ${attendable.length === 1 ? 'a colorida é a liberada' : 'as coloridas são as liberadas'} para o seu perfil.`
    : null;
  const areasLabel = copy.areasLabel || (attendable.length === 1 ? 'Sua área' : 'Suas áreas');

  return (
    <div className="hc-screen">
      <aside className="hc-rail">
        <p className="hc-wordmark">VITALIS</p>
        <h1 className="hc-clinic">{clinicName}</h1>
        <p className="hc-role">{copy.role}</p>

        <p className="hc-greeting">Oi, {therapistName || 'profissional'}</p>

        <nav className="hc-nav">
          {variant === 'admin-professional' && attendable.length > 0 && (
            <>
              <p className="hc-nav-label">Suas áreas</p>
              <div className="hc-nav-list">
                {attendable.map(card => (
                  <NavItem key={card.id} icon={card.id} title={card.label} compact onClick={() => onSelect(card.id)} />
                ))}
              </div>
              <div className="hc-nav-divider" />
            </>
          )}

          <p className="hc-nav-label">{copy.navLabel}</p>
          <div className="hc-nav-list">
            {onOpenAgenda && (
              <NavItem
                icon="agenda"
                title={variant === 'professional' ? 'Agenda' : 'Agenda completa'}
                description={variant === 'professional'
                  ? 'Calendário de atendimentos, status do dia e aniversários dos pacientes.'
                  : 'Todos os profissionais da clínica, status do dia e aniversários.'}
                onClick={onOpenAgenda}
              />
            )}
            {onOpenPendingEvolutions && (
              <NavItem
                icon="evolucao"
                title="Evoluções"
                description={variant === 'professional'
                  ? 'Fila do que falta evoluir: salvou um, o próximo já abre. Também registra evolução avulsa.'
                  : 'Pendências de toda a equipe; você escreve as suas na mesma tela.'}
                badge={pendingEvolutionsCount}
                onClick={onOpenPendingEvolutions}
              />
            )}
            {onOpenGestao && (
              <NavItem
                icon="gestao"
                title="Gestão"
                description={hasInstitutionalGestao
                  ? 'Faltosos, retornos, indicadores, pesquisa de satisfação, documentos timbrados e personalização.'
                  : 'Cor da sua tela e os seus dados de cadastro.'}
                onClick={() => onOpenGestao()}
              />
            )}
            {onOpenClinicPatients && (
              <NavItem
                icon="pacientes"
                title="Pacientes da instituição"
                description="Cadastro central, matrículas por área e ficha completa de cada paciente."
                onClick={onOpenClinicPatients}
              />
            )}
            {onOpenDocuments && (
              <NavItem
                icon="documentos"
                title="Documentos timbrados"
                description="Envie um Word (.docx) e receba o documento no papel timbrado da instituição."
                onClick={onOpenDocuments}
              />
            )}
          </div>
        </nav>

        <button type="button" className="hc-signout" onClick={onSignOut}>Sair</button>
      </aside>

      <main className="hc-main">
        <h2>{copy.heading}</h2>
        {(copy.lead || areasNote) && <p className="hc-lead">{copy.lead || areasNote}</p>}

        {variant !== 'professional' && (
          <div className="hc-stat-row">
            {isFrontDeskView ? (
              <>
                <Stat icon="agenda" value={stats?.today ?? null} label="Atendimentos hoje" onClick={onOpenAgenda} />
                <Stat
                  icon="pacientes"
                  value={stats?.activeProfessionals ?? null}
                  label="Profissionais ativos"
                  onClick={openInstitutionalGestao ? () => openInstitutionalGestao('indicadores') : undefined}
                />
                <Stat icon="cake" value={stats?.birthdaysThisMonth ?? null} label="Aniversariantes do mês" onClick={onOpenBirthdays} />
              </>
            ) : (
              <>
                <Stat icon="agenda" value={stats?.ownToday ?? null} label="Seus atendimentos hoje" personal onClick={onOpenAgenda} />
                <Stat icon="agenda" value={stats?.today ?? null} label="Atendimentos da clínica" onClick={onOpenAgenda} />
                <Stat
                  icon="returns"
                  value={stats?.awaitingReturn ?? null}
                  label="Retornos pendentes"
                  onClick={openInstitutionalGestao ? () => openInstitutionalGestao('retornos') : undefined}
                />
              </>
            )}
          </div>
        )}

        {variant !== 'reception' && (
          <>
            <p className="hc-section-label">
              {areasLabel}
              {copy.areasPill && <span className="hc-pill">{copy.areasPill}</span>}
            </p>
            <div className="hc-row-list">
              {attendable.map(card => (
                <DisciplineRow
                  key={card.id}
                  card={card}
                  ctaLabel={variant === 'admin' ? 'Ver →' : 'Atender →'}
                  tagLabel={variant === 'admin' ? 'Consulta' : null}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </>
        )}

        {locked.length > 0 && (
          <>
            <p className="hc-section-label">Outras áreas da instituição</p>
            <div className="hc-chip-row">
              {locked.map(card => <DisciplineChip key={card.id} card={card} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
