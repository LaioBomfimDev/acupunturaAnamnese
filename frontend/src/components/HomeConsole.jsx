import { useEffect, useState } from 'react';
import { buildHubCards } from '../data/disciplines';
import { listAppointments, listPatientsAwaitingReturn } from '../services/appointmentService';
import { listClinicMembers } from '../services/clinicMembersService';
import { listClinicPatients } from '../services/clinicPatientsService';
import { currentMonthBirthdays, isCountableAppointment } from '../utils/gestaoDashboard';
import { greetingFor } from '../utils/greeting';
import { HOME_HELP } from '../data/screenHelp';
import { ScreenHelp } from './ui/ScreenHelp';
import { InstrumentRiskAlerts } from './instruments/InstrumentRiskAlerts';
import { TOOL_GLYPHS } from './ui/hubGlyphs';
import '../styles/console.css';

// ============================================================
// Home console (Fase 7) — tela inicial única com quatro leituras,
// decididas por `variant`:
//
//   'admin'              administração pura, não atende (ex.: Karen).
//                        Vê a navegação institucional primeiro e TODAS
//                        as áreas da clínica, só para consulta.
//   'admin-professional' administra e também atende (ex.: Denise).
//                        As áreas dela ficam só no conteúdo (não se
//                        repetem na barra lateral, que é só a
//                        navegação institucional).
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

function Icon({ id, glyphs = TOOL_GLYPHS }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyphs[id]}
    </svg>
  );
}

function NavItem({ icon, title, description, badge, onClick }) {
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
    navLabel: 'Administração',
    areasLabel: 'Áreas da clínica',
    areasPill: 'Modo consulta',
  },
  'admin-professional': {
    role: 'Administração e atendimento',
    heading: 'Visão geral de hoje',
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

  const areasLabel = copy.areasLabel || (attendable.length === 1 ? 'Sua área' : 'Suas áreas');
  // Profissional não tem números: no celular as áreas dele (o "Atender")
  // entram no cartão do dia, logo abaixo da pergunta.
  const areasInHero = variant === 'professional';
  const areasSection = variant !== 'reception' && (
    <div className="hc-areas">
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
    </div>
  );

  return (
    <div className="hc-screen">
      <aside className="hc-rail">
        <p className="hc-wordmark">VITALIS</p>
        <h1 className="hc-clinic">{clinicName}</h1>
        <p className="hc-role">{copy.role}</p>

        <nav className="hc-nav">
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
                  ? 'Fila do que falta evoluir: salvou um, o próximo já abre. Atendeu sem agendar? Registre por lá.'
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
                  ? 'Indicadores, faltosos, retornos, pesquisa de satisfação, equipe, personalização e documentos timbrados.'
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
        {/* Alerta de risco das escalas (respostas de casa): no topo, antes
            de tudo, até alguém que atende marcar "Vi o alerta". Recepção
            não atende e não vê; sem alerta, o bloco não aparece. */}
        {variant !== 'reception' && (
          <InstrumentRiskAlerts
            onOpenArea={discipline => (attendable.some(card => card.id === discipline) ? onSelect(discipline) : null)}
          />
        )}

        {/* Cartão do dia (opção B, 05/10/2026): no celular este bloco vira
            um cartão na cor da clínica com a instituição, o "Sair", a
            saudação, o título e os números, e o menu escuro some (a barra
            de baixo já leva aos mesmos lugares). No computador o bloco não
            desenha nada (display: contents) e a tela fica como era. */}
        <div className="hc-hero">
          <div className="hc-hero-top">
            <p className="hc-hero-clinic">{clinicName}</p>
            <button type="button" className="hc-hero-signout" onClick={onSignOut}>Sair</button>
          </div>
          <p className="hc-greeting">{greetingFor(therapistName)}</p>
          {/* A frase explicativa de cada perfil foi para o "Como funciona"
              (data/screenHelp.js, HOME_HELP), igual às outras telas. */}
          <div className="screen-title-row">
            <h2>{copy.heading}</h2>
            <ScreenHelp topic={HOME_HELP[variant] || HOME_HELP.professional} />
          </div>

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

          {areasInHero && areasSection}
        </div>

        {!areasInHero && areasSection}

        {/* Só no celular: a barra de baixo leva no máximo cinco destinos
            (HubNav, MAX_DOCK_ITEMS) e, para o profissional, Documentos
            timbrados fica de fora; aqui ele continua a um toque. */}
        {variant === 'professional' && onOpenDocuments && (
          <div className="hc-mobile-only">
            <p className="hc-section-label">{copy.navLabel}</p>
            <div className="hc-row-list">
              <button type="button" className="hc-row-item" onClick={onOpenDocuments}>
                <span className="hc-row-icon"><Icon id="documentos" /></span>
                <span className="hc-row-text">
                  <b>Documentos timbrados</b>
                  <p>Envie um Word (.docx) e receba o documento no papel timbrado da instituição.</p>
                </span>
                <span className="hc-row-cta">Abrir →</span>
              </button>
            </div>
          </div>
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
