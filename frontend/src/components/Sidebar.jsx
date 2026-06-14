const NAV_GROUPS = [
  { title: null, tabs: ['Tela inicial', 'Painel'] },
  { title: 'Avaliação', tabs: ['Anamnese', 'Língua', 'Pulso'] },
  { title: 'Diagnóstico', tabs: ['Raciocínio Clínico', 'Diagnóstico'] },
  { title: 'Tratamento', tabs: ['Protocolo', 'Evolução'] },
  { title: 'Apoio', tabs: ['Biblioteca', 'Relatório'] },
];

const SUPER_ADMIN_SECTIONS = [
  { id: 'create', label: 'Criar acupunturista', description: 'Cadastro e senha' },
  { id: 'manage', label: 'Gestão e controle', description: 'Usuários e métricas' },
  { id: 'clinics', label: 'Clínicas', description: 'Cadastro e identidade visual' },
  { id: 'knowledge', label: 'Alimentação', description: 'Biblioteca Viva' },
  { id: 'pdf-sources', label: 'Fontes PDF', description: 'Pontos não respondidos' },
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
  'Língua': (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  'Pulso': <path d="M22 12h-4l-3 8L9 4l-3 8H2" />,
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
  'maps': (
    <>
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
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
  isSuperAdmin,
  superAdminSection = 'manage',
  onSuperAdminSectionChange,
  selectedPatient,
  patientAge,
  sessionCount,
  lastVisit,
}) {
  return (
    <aside className="sidebar">
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
          <small>{profileRole === 'super_admin' ? 'SuperAdm • Segurança' : 'Acupuntura • MTC'}</small>
        </div>
      </div>

      {!isSuperAdmin && selectedPatient ? (
        <button className="sidebar-patient" onClick={() => onTabChange('Painel')}>
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
                onClick={() => onSuperAdminSectionChange?.(section.id)}
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
        ) : NAV_GROUPS.map(group => (
          <div className="nav-group" key={group.title || 'inicio'}>
            {group.title ? <span className="nav-group-title">{group.title}</span> : null}
            {group.tabs.map(tab => {
              const disabled = !selectedPatient && tab !== 'Tela inicial' && tab !== 'Biblioteca';
              return (
                <button
                  key={tab}
                  className={`${activeTab === tab ? 'active' : ''}${disabled ? ' disabled' : ''}`}
                  onClick={() => onTabChange(tab)}
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
  );
}
