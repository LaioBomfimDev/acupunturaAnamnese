import { lazy, Suspense, useMemo, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { enrollPatientInitial } from '../services/clinicPatientsService';
import { formatPatientCount, formatAge, getInitials } from '../utils/patientUi';
import '../styles/patientStart.css';

const ClinicPatientProfile = lazy(() => import('./ClinicPatientProfile').then(m => ({ default: m.ClinicPatientProfile })));

function ProfileLoading() {
  return <div className="empty-state">Carregando ficha do paciente...</div>;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

// Cadastro de paciente novo saiu daqui (2026-09-10): passou a existir só
// na aba central "Pacientes da instituição" (ClinicPatientsPanel). Este
// componente só SELECIONA um paciente já cadastrado — de toda a clínica,
// não só os que este profissional criou — pra retomar/iniciar o
// atendimento nesta disciplina.
//
// initialDiscipline: se o paciente escolhido ainda não tem matrícula
// nesta disciplina (pode nunca ter passado por aqui — o cadastro é da
// clínica inteira), a matrícula é criada aqui, best-effort, antes de
// abrir a anamnese.
export function PatientStart({ onSelectPatient, onSignOut, therapistName, initialDiscipline = 'acupuntura', hasMultipleDisciplines = false, onSwitchDiscipline, profile, isClinicAdmin = false }) {
  const { patients, selectedPatient, loading, error, selectPatient, refreshPatients } = usePatient();
  const [query, setQuery] = useState('');
  const [editTarget, setEditTarget] = useState(null);

  const filteredPatients = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter(patient => {
      const name = patient.name?.toLowerCase() || '';
      return name.includes(term);
    });
  }, [patients, query]);

  async function handleSelect(patient) {
    selectPatient(patient);
    const alreadyEnrolled = (patient.enrollments || []).some(e => e.discipline === initialDiscipline);
    if (!alreadyEnrolled) {
      await enrollPatientInitial(patient.id, initialDiscipline);
    }
    onSelectPatient?.(patient);
  }

  function handleEditRequest(patient) {
    setEditTarget(patient);
  }

  async function handlePatientUpdated(updated) {
    setEditTarget(prev => ({ ...updated, enrollments: prev?.enrollments || [] }));
    await refreshPatients?.();
  }

  if (editTarget) {
    return (
      <Suspense fallback={<ProfileLoading />}>
        <ClinicPatientProfile
          patient={editTarget}
          therapistProfile={profile}
          isClinicAdmin={isClinicAdmin}
          onBack={() => setEditTarget(null)}
          onPatientUpdated={handlePatientUpdated}
        />
      </Suspense>
    );
  }

  return (
    <section className="home-screen patient-start">
      <header className="home-hero">
        <div>
          <p className="patient-start-greeting">Olá, {therapistName || 'profissional'}</p>
          {hasMultipleDisciplines && (
            <div className="home-specialty-switcher-banner">
              Você está na área de <b>Acupuntura</b>
              <button type="button" className="btn-switch-specialty-top" onClick={onSwitchDiscipline} title="Alternar para Psicologia">
                Mudar Especialidade
              </button>
            </div>
          )}
          <h2>Iniciar atendimento</h2>
          <p className="patient-start-description">Selecione um paciente para iniciar ou retomar o atendimento.</p>
        </div>
        <div className="home-meta">
          {onSignOut && <button type="button" className="quiet-button" onClick={onSignOut}>Sair</button>}
        </div>
      </header>

      <div className="home-grid">
        <section className="start-workspace">
          {selectedPatient && (
            <button
              type="button"
              className="active-patient-banner"
              onClick={() => onSelectPatient?.(selectedPatient)}
            >
              <span className="active-patient-avatar">{getInitials(selectedPatient.name)}</span>
              <span className="active-patient-info">
                <span className="active-patient-label">Paciente selecionado</span>
                <b className="active-patient-name">{selectedPatient.name}</b>
              </span>
              <span className="active-patient-cta">Retomar atendimento →</span>
            </button>
          )}

          <section className="start-panel">
            <div className="start-panel-head">
              <div>
                <h2>Selecionar paciente</h2>
                <span className="patient-list-count" role="status">
                  {loading ? 'Carregando pacientes...' : query.trim()
                    ? `${formatPatientCount(filteredPatients.length)} de ${patients.length} na lista`
                    : formatPatientCount(patients.length)}
                </span>
              </div>
              <label className="patient-start-search">
                <span>Buscar paciente</span>
                <input
                  className="patient-search"
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar por nome"
                />
              </label>
            </div>

            {loading ? (
              <div className="empty-state">Carregando pacientes...</div>
            ) : filteredPatients.length === 0 ? (
              <div className="empty-state">
                {query.trim() ? 'Nenhum paciente encontrado. Tente outro nome.' : 'Nenhum paciente cadastrado. Cadastre o primeiro em Pacientes da instituição.'}
              </div>
            ) : (
              <div className="patient-list">
                {filteredPatients.map(patient => (
                  <PatientListCard
                    key={patient.id}
                    patient={patient}
                    isActive={selectedPatient?.id === patient.id}
                    onSelect={handleSelect}
                    onEdit={handleEditRequest}
                  />
                ))}
              </div>
            )}
          </section>
          {error && <div className="inline-error">{error}</div>}
        </section>
      </div>
    </section>
  );
}

export function PatientListCard({ patient, isActive = false, onSelect, onEdit }) {
  const name = patient.name || 'Paciente sem nome';

  return (
    <article className={`patient-row${isActive ? ' active' : ''}`}>
      <button
        className="patient-row-card"
        type="button"
        onClick={() => onSelect?.(patient)}
        aria-label={`Iniciar atendimento de ${name}`}
      >
        <span className="patient-row-identity">
          <span className="patient-avatar">{getInitials(patient.name)}</span>
          <span className="patient-row-main">
            <b>{name}</b>
            <small>{patient.phone || 'Sem telefone'} • {formatAge(patient)}</small>
          </span>
        </span>
        {isActive && <span className="patient-row-status">Ativo</span>}
      </button>
      <button
        className="patient-edit-icon-button"
        type="button"
        onClick={() => onEdit?.(patient)}
        aria-label={`Editar cadastro de ${name}`}
        title={`Editar cadastro de ${name}`}
      >
        <PencilIcon />
      </button>
    </article>
  );
}
