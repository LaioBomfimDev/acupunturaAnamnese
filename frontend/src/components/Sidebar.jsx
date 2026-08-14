import { useEffect, useState } from 'react';
import '../styles/shell.css';

const NAV_GROUPS = [
  { title: null, tabs: ['Tela inicial', 'Painel'] },
  { title: 'Avaliação', tabs: ['Anamnese', 'Língua', 'Pulso', 'Reabilitação'] },
  { title: 'Diagnóstico', tabs: ['Raciocínio Clínico', 'Diagnóstico'] },
  { title: 'Tratamento', tabs: ['Protocolo', 'Evolução'] },
  { title: 'Apoio', tabs: ['Biblioteca', 'Relatório', 'Documentos'] },
];

const SUPER_ADMIN_SECTIONS = [
  { id: 'clinics', label: 'Instituições', description: 'Cadastro e identidade visual' },
  { id: 'create', label: 'Criar profissional', description: 'Cadastro e senha' },
  { id: 'manage', label: 'Gestão e controle', description: 'Usuários e métricas' },
  { id: 'proposals', label: 'Propostas de curadoria', description: 'Enviadas pela revisora' },
  { id: 'deploy-health', label: 'Saúde do deploy', description: 'Supabase e migrations' },
  { id: 'points', label: 'Pontos comuns/ocultos', description: 'Base completa e promoção' },
  { id: 'knowledge', label: 'Alimentação', description: 'Biblioteca Viva' },
  { id: 'pdf-sources', label: 'Fontes PDF', description: 'Pontos não respondidos' },
  { id: 'herbal-curation', label: 'Curadoria de ervas', description: 'Fonte e segurança' },
  { id: 'food-curation', label: 'Curadoria de alimentos', description: 'Dietoterapia educativa' },
  { id: 'anamnese-knowledge', label: 'Conhecimento da Anamnese', description: 'Achados e padrões' },
  { id: 'ai-instructions', label: 'Instruções da IA', description: 'Diretrizes que a IA segue' },
  { id: 'ai-corrections', label: 'Correções da IA', description: 'Ensino e aprovação' },
  { id: 'maps', label: 'Calibração de Mapa', description: 'Coordenadas e solicitações' },
  { id: 'logs', label: 'Logs', description: 'Auditoria' },
];

const NAV_ICONS = {
  'Tela inicial': (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-6h6v6" />
    </>
  ),
  'Painel': (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </>
  ),
  'Anamnese': (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2" />
      <path d="M9 10h6M9 14h6M9 18h4" />
    </>
  ),
  'Perguntas complementares': (
    <>
      <circle cx="7" cy="7" r="3" />
      <path d="M4 14h6M4 18h8" />
      <path d="M14 6h6v8h-3l-3 3V6Z" />
    </>
  ),
  'Língua': (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'Pulso': <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
  'Reabilitação': (
    <>
      <path d="M5 4h14v16H5z" />
      <path d="M8 9h8M8 13h5M8 17h8" />
      <path d="m15 13 1.5 1.5L20 11" />
    </>
  ),
  'Raciocínio Clínico': (
    <>
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
      <path d="M9 20h6M10 22h4" />
    </>
  ),
  'Diagnóstico': (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  'Protocolo': (
    <>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="m3 6 1.5 1.5L7 5" />
      <path d="m3 12 1.5 1.5L7 11" />
      <path d="m3 18 1.5 1.5L7 17" />
    </>
  ),
  'Evolução': (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  'Biblioteca': (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
  'Relatório': (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  'Documentos': (
    <>
      <path d="M12 3v10" />
      <path d="m8 9 4 4 4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </>
  ),
  // ── Abas do workspace de Psicologia (Plano C) ──
  'Avaliação neuropsicológica': (
    <>
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
      <path d="M9 20h6M10 22h4" />
    </>
  ),
  'Síntese do caso': (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h4" />
    </>
  ),
  'Hipóteses/diagnóstico': (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </>
  ),
  'Objetivos': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  'Plano terapêutico': (
    <>
      <path d="M10 6h11M10 12h11M10 18h11" />
      <path d="m3 6 1.5 1.5L7 5" />
      <path d="m3 12 1.5 1.5L7 11" />
      <path d="m3 18 1.5 1.5L7 17" />
    </>
  ),
  'create': (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M19 8v6M16 11h6" />
    </>
  ),
  'manage': (
    <>
      <circle cx="9" cy="8" r="4" />
      <path d="M2 21a7 7 0 0 1 14 0" />
      <path d="M16 4a4 4 0 0 1 0 8" />
      <path d="M17 14a7 7 0 0 1 5 7" />
    </>
  ),
  'clinics': (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 9h3a1 1 0 0 1 1 1v11" />
      <path d="M2 21h20" />
      <path d="M8 7h2M12 7h2M8 11h2M12 11h2M8 15h2M12 15h2" />
    </>
  ),
  'deploy-health': (
    <>
      <path d="M22 12h-4l-3 7-6-14-3 7H2" />
      <path d="M16 5h4v4" />
    </>
  ),
  'knowledge': (
    <>
      <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />
    </>
  ),
  'pdf-sources': (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  'herbal-curation': (
    <>
      <path d="M20 4C12 4 5 8 5 16c0 2.2 1.8 4 4 4 6.5 0 10-7.2 11-16Z" />
      <path d="M4 21c3-5 7-8 12-11" />
    </>
  ),
  'food-curation': (
    <>
      <path d="M6 3v7a3 3 0 0 0 6 0V3" />
      <path d="M9 10v11" />
      <path d="M17 3c-1.7 0-3 2-3 5s1.3 4 3 4v9" />
    </>
  ),
  'anamnese-knowledge': (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 8h6M9 12h6M9 16h3" />
      <path d="m15 16 1.5 1.5L20 14" />
    </>
  ),
  'ai-instructions': (
    <>
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2Z" />
      <path d="M9 20h6M10 22h4" />
    </>
  ),
  'ai-corrections': (
    <>
      <path d="M21 11.5a8 8 0 0 1-11.5 7.2L3 21l1.8-6.5A8 8 0 1 1 21 11.5Z" />
      <path d="m8.5 12 2.2 2.2L15 10" />
    </>
  ),
  'maps': (
    <>
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  'proposals': (
    <>
      <path d="M4 4h16v12H8l-4 4z" />
      <path d="M9 9h8M9 12h5" />
    </>
  ),
  'points': (
    <>
      <circle cx="7" cy="7" r="2.5" />
      <circle cx="17" cy="17" r="2.5" />
      <path d="M9.5 7H20M4 17h10.5" />
    </>
  ),
  'logs': (
    <>
      <path d="M9 6h12M9 12h12M9 18h12" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
};

function NavIcon({ name }) {
  const glyph = NAV_ICONS[name];
  if (!glyph) return null;
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {glyph}
    </svg>
  );
}

/**
 * Destinos da barra inferior (telefone). Três, não cinco: com quatro ou
 * mais o alvo cai abaixo dos 44px em 375px de largura, e o quarto lugar
 * é do botão de menu, que abre a navegação inteira.
 *
 * A ordem preferida existe para a barra não virar "os três primeiros da
 * sidebar" — no telefone o que importa é começar, ver o paciente e
 * registrar a evolução.
 */
function pickBottomTabs(navGroups, patientTab) {
  const all = navGroups.flatMap(group => group.tabs);
  const preferred = ['Tela inicial', patientTab, 'Evolução'].filter(tab => all.includes(tab));
  const rest = all.filter(tab => !preferred.includes(tab));
  return [...preferred, ...rest].slice(0, 3);
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

export function Sidebar({
  activeTab,
  onTabChange,
  therapist,
  profileRole,
  disciplineLabel,
  onSwitchDiscipline,
  isSuperAdmin,
  superAdminSection = 'manage',
  onSuperAdminSectionChange,
  selectedPatient,
  patientAge,
  sessionCount,
  lastVisit,
  hasMultipleDisciplines,
  onOpenCuration,
  navGroups = NAV_GROUPS,
  patientTab = 'Painel',
  tabsWithoutPatient = ['Tela inicial', 'Biblioteca', 'Documentos'],
}) {
  // A gaveta mora aqui, e não no App, porque quatro shells diferentes
  // (MTC, Psicologia, disciplina genérica e curadoria) montam esta mesma
  // sidebar. Colocar o botão em um deles deixaria os outros três sem
  // navegação no telefone.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Enquanto a gaveta está aberta, a página atrás não rola: rolar o
  // conteúdo escondido é o defeito clássico de menu off-canvas.
  useEffect(() => {
    if (!drawerOpen) return undefined;

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKeyDown(event) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  function selectTab(tab) {
    onTabChange(tab);
    setDrawerOpen(false);
  }

  function selectSuperAdminSection(id) {
    onSuperAdminSectionChange?.(id);
    setDrawerOpen(false);
  }

  const bottomTabs = isSuperAdmin
    ? SUPER_ADMIN_SECTIONS.slice(0, 3).map(section => section.id)
    : pickBottomTabs(navGroups, patientTab);

  return (
    <>
      <button
        type="button"
        className="shell-menu no-print"
        onClick={() => setDrawerOpen(true)}
        aria-label="Abrir menu de navegação"
        aria-expanded={drawerOpen}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      {drawerOpen && (
        <div
          className="shell-scrim no-print"
          role="presentation"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`sidebar${drawerOpen ? ' sidebar--open' : ''}`}>
        <button
          type="button"
          className="shell-drawer-close no-print"
          onClick={() => setDrawerOpen(false)}
          aria-label="Fechar menu"
        >
          ✕
        </button>
      <div className="logo">
        <div>
          <h1>Reability</h1>
          <p>Transformando limites em possibilidades</p>
        </div>
      </div>

      <div className="sidebar-profile">
        <span>{String(therapist || 'Profissional').slice(0, 2).toUpperCase()}</span>
        <div>
          <b>{therapist || 'Dra. Denise Neves'}</b>
          <small>{profileRole === 'super_admin' ? 'SuperAdm • Segurança' : (disciplineLabel || 'Acupuntura • MTC')}</small>
        </div>
      </div>

      {!isSuperAdmin && onOpenCuration && (
        <button type="button" className="sidebar-switch-area" onClick={() => { setDrawerOpen(false); onOpenCuration(); }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 4h16v12H8l-4 4z" />
            <path d="M9 9h8M9 12h5" />
          </svg>
          Abrir Curadoria
        </button>
      )}

      {!isSuperAdmin && onSwitchDiscipline && (
        <button type="button" className="sidebar-switch-area" onClick={() => { setDrawerOpen(false); onSwitchDiscipline(); }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3 4 7l4 4" />
            <path d="M4 7h16" />
            <path d="m16 21 4-4-4-4" />
            <path d="M20 17H4" />
          </svg>
          {hasMultipleDisciplines ? 'Mudar Especialidade (Acupuntura / Psicologia)' : 'Trocar de área'}
        </button>
      )}

      {!isSuperAdmin && selectedPatient ? (
        <button className="sidebar-patient" onClick={() => selectTab(patientTab)}>
          <span className="sidebar-patient-avatar">{getInitials(selectedPatient.name)}</span>
          <span className="sidebar-patient-main">
            <b>{selectedPatient.name}</b>
            <small>{patientAge ? `${patientAge} anos` : 'Idade não informada'}</small>
            <em>{sessionCount} sessão(ões){lastVisit ? ` • ${lastVisit}` : ''}</em>
          </span>
        </button>
      ) : !isSuperAdmin ? (
        <div className="sidebar-patient sidebar-patient-empty">
          <span className="sidebar-patient-avatar">?</span>
          <span className="sidebar-patient-main">
            <b>Sem paciente</b>
            <small>Selecione na tela inicial</small>
          </span>
        </div>
      ) : null}

      <nav className={`nav${isSuperAdmin ? ' nav-super-admin' : ''}`}>
        {isSuperAdmin ? (
          <div className="nav-group">
            <span className="nav-group-title">Administração</span>
            {SUPER_ADMIN_SECTIONS.map(section => (
              <button
                key={section.id}
                className={superAdminSection === section.id ? 'active' : ''}
                onClick={() => selectSuperAdminSection(section.id)}
                aria-current={superAdminSection === section.id ? 'page' : undefined}
              >
                <NavIcon name={section.id} />
                <span className="nav-label">
                  <span>{section.label}</span>
                  <small>{section.description}</small>
                </span>
              </button>
            ))}
          </div>
        ) : navGroups.map(group => (
          <div className="nav-group" key={group.title || 'inicio'}>
            {group.title ? <span className="nav-group-title">{group.title}</span> : null}
            {group.tabs.map(tab => {
              const disabled = !selectedPatient && !tabsWithoutPatient.includes(tab);
              return (
                <button
                  key={tab}
                  className={`${activeTab === tab ? 'active' : ''}${disabled ? ' disabled' : ''}`}
                  onClick={() => selectTab(tab)}
                  disabled={disabled}
                  aria-current={activeTab === tab ? 'page' : undefined}
                >
                  <NavIcon name={tab} />
                  <span className="nav-label">{tab}</span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      </aside>

      {/* Barra inferior: só no telefone. Três destinos + menu, cada um
          com 44px de alvo. Fica presa ao rodapé respeitando a faixa do
          gesto de voltar (safe-area) dos aparelhos sem botão físico. */}
      <nav className="shell-tabs no-print" aria-label="Navegação principal">
        {bottomTabs.map(tab => {
          const section = isSuperAdmin
            ? SUPER_ADMIN_SECTIONS.find(item => item.id === tab)
            : null;
          const label = section ? section.label : tab;
          const current = isSuperAdmin ? superAdminSection === tab : activeTab === tab;
          const disabled = !isSuperAdmin && !selectedPatient && !tabsWithoutPatient.includes(tab);

          return (
            <button
              key={tab}
              type="button"
              className={`shell-tab${current ? ' shell-tab--active' : ''}`}
              onClick={() => (isSuperAdmin ? selectSuperAdminSection(tab) : selectTab(tab))}
              disabled={disabled}
              aria-current={current ? 'page' : undefined}
            >
              <NavIcon name={tab} />
              <span>{label}</span>
            </button>
          );
        })}

        <button
          type="button"
          className="shell-tab"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu de navegação"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <span>Menu</span>
        </button>
      </nav>
    </>
  );
}
