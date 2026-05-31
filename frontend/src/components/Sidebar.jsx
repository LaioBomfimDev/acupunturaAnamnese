const TABS = [
  'Tela inicial',
  'Painel',
  'Anamnese',
  'Língua',
  'Pulso',
  'Raciocínio Clínico',
  'Diagnóstico',
  'Protocolo',
  'Evolução',
  'Biblioteca',
  'Relatório',
];

const SUPER_ADMIN_SECTIONS = [
  { id: 'create', label: 'Criar acupunturista', description: 'Cadastro e senha' },
  { id: 'manage', label: 'Gestão e controle', description: 'Usuários e métricas' },
  { id: 'knowledge', label: 'Alimentação', description: 'Biblioteca Viva' },
  { id: 'logs', label: 'Logs', description: 'Auditoria' },
];

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
        {isSuperAdmin ? SUPER_ADMIN_SECTIONS.map(section => (
          <button
            key={section.id}
            className={superAdminSection === section.id ? 'active' : ''}
            onClick={() => onSuperAdminSectionChange?.(section.id)}
            aria-current={superAdminSection === section.id ? 'page' : undefined}
          >
            <span>{section.label}</span>
            <small>{section.description}</small>
          </button>
        )) : TABS.map(tab => {
          const disabled = !selectedPatient && tab !== 'Tela inicial' && tab !== 'SuperAdm';
          return (
          <button
            key={tab}
            className={`${activeTab === tab ? 'active' : ''}${disabled ? ' disabled' : ''}`}
            onClick={() => onTabChange(tab)}
            disabled={disabled}
          >
            {tab}
          </button>
        )})}
      </nav>
    </aside>
  );
}
