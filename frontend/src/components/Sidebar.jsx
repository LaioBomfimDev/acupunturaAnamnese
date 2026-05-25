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

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

export function Sidebar({ activeTab, onTabChange, therapist, profileRole, isSuperAdmin, selectedPatient, patientAge, sessionCount, lastVisit }) {
  const visibleTabs = isSuperAdmin ? ['SuperAdm'] : TABS;

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

      <nav className="nav">
        {visibleTabs.map(tab => {
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
