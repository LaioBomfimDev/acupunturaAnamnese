import { useMemo, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { enrollPatientInitial } from '../services/clinicPatientsService';
import { formatPatientCount, isPatientDeletionConfirmationValid, formatAge, getInitials } from '../utils/patientUi';

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
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
export function PatientStart({ onSelectPatient, onSignOut, therapistName, initialDiscipline = 'acupuntura', hasMultipleDisciplines = false, onSwitchDiscipline }) {
  const { patients, selectedPatient, loading, error, selectPatient, deletePatient } = usePatient();
  const [query, setQuery] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteText, setDeleteText] = useState('');
  const [deletingPatientId, setDeletingPatientId] = useState(null);
  const [listNotice, setListNotice] = useState(null);
  const canConfirmDelete = isPatientDeletionConfirmationValid(deleteText);

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

  function handleDeleteRequest(patient) {
    setDeleteTarget(patient);
    setDeleteText('');
    setListNotice(null);
  }

  function handleCancelDelete() {
    setDeleteTarget(null);
    setDeleteText('');
  }

  async function handleDeleteConfirm(e) {
    e.preventDefault();
    if (!deleteTarget || !canConfirmDelete) return;

    const patientName = deleteTarget.name || 'Paciente';
    setDeletingPatientId(deleteTarget.id);
    setListNotice(null);
    try {
      await deletePatient(deleteTarget.id);
      setListNotice({ type: 'success', text: `${patientName} foi arquivado e a solicitação de exclusão ficou pendente para análise.` });
      handleCancelDelete();
    } catch (err) {
      setListNotice({
        type: 'error',
        text: err?.message || 'Não foi possível solicitar a exclusão do paciente.',
      });
    } finally {
      setDeletingPatientId(null);
    }
  }

  return (
    <section className="home-screen">
      <header className="home-hero">
        <div>
          <h2 className="home-greeting-title">Oi, {therapistName || 'profissional'}</h2>
          {hasMultipleDisciplines && (
            <div className="home-specialty-switcher-banner">
              Você está na área de <b>Acupuntura</b>
              <button type="button" className="btn-switch-specialty-top" onClick={onSwitchDiscipline} title="Alternar para Psicologia">
                Mudar Especialidade
              </button>
            </div>
          )}
          <h2>Começar atendimento</h2>
          <span>Selecione um paciente já cadastrado para retomar ou iniciar o atendimento.</span>
        </div>
        <div className="home-meta">
          <span>{formatPatientCount(patients.length)}</span>
          {hasMultipleDisciplines && (
            <button className="quiet-button" onClick={onSwitchDiscipline} style={{ color: 'var(--gold-2)', fontWeight: 'bold' }}>Trocar Especialidade</button>
          )}
          <button className="quiet-button" onClick={onSignOut}>Sair</button>
        </div>
      </header>

      <div className="home-grid">
        <section className="start-workspace">
          <div className="start-workspace-head">
            <div>
              <p className="start-kicker">Fluxo de entrada</p>
              <h2>Selecionar paciente</h2>
            </div>
            {selectedPatient && (
              <button className="quiet-button" onClick={() => onSelectPatient?.(selectedPatient)}>
                Ir para painel
              </button>
            )}
          </div>

          {selectedPatient && (
            <div className="home-active-patient">
              <b>Atendimento ativo:</b> {selectedPatient.name}
            </div>
          )}

          <section className="start-panel">
            <div className="start-panel-head">
              <div>
                <p className="small">Pacientes</p>
                <h2>Selecionar paciente</h2>
                <span className="patient-list-count">
                  {formatPatientCount(filteredPatients.length)} na lista
                </span>
              </div>
              <input
                className="patient-search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Buscar por nome"
              />
            </div>

            {listNotice && (
              <div className={`inline-notice ${listNotice.type === 'error' ? 'inline-error' : 'inline-success'}`}>
                {listNotice.text}
              </div>
            )}

            {deleteTarget && (
              <form className="patient-delete-panel" onSubmit={handleDeleteConfirm} role="alertdialog" aria-labelledby="patient-delete-title">
                <div>
                  <p className="small">Solicitação administrativa</p>
                  <h3 id="patient-delete-title">Solicitar exclusão de {deleteTarget.name || 'paciente'}?</h3>
                  <p>
                    O paciente será arquivado agora. Os registros não serão apagados até revisão da política de retenção. Confirme digitando <b>excluir</b>.
                  </p>
                </div>
                <label>
                  Confirmação
                  <input
                    value={deleteText}
                    onChange={e => setDeleteText(e.target.value)}
                    placeholder="Digite excluir"
                    autoFocus
                  />
                </label>
                <div className="patient-delete-confirm-actions">
                  <button className="tag" type="button" onClick={handleCancelDelete} disabled={deletingPatientId === deleteTarget.id}>
                    Cancelar
                  </button>
                  <button className="danger-button" type="submit" disabled={!canConfirmDelete || deletingPatientId === deleteTarget.id}>
                    {deletingPatientId === deleteTarget.id ? 'Solicitando...' : 'Arquivar e solicitar exclusão'}
                  </button>
                </div>
              </form>
            )}

            {loading ? (
              <div className="empty-state">Carregando pacientes...</div>
            ) : filteredPatients.length === 0 ? (
              <div className="empty-state">Nenhum paciente encontrado.</div>
            ) : (
              <div className="patient-list">
                {filteredPatients.map(patient => (
                  <PatientListCard
                    key={patient.id}
                    patient={patient}
                    isActive={selectedPatient?.id === patient.id}
                    isDeleting={deletingPatientId === patient.id}
                    onSelect={handleSelect}
                    onRequestDelete={handleDeleteRequest}
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

export function PatientListCard({ patient, isActive = false, isDeleting = false, onSelect, onRequestDelete }) {
  const name = patient.name || 'Paciente sem nome';

  return (
    <article className={`patient-row${isActive ? ' active' : ''}`}>
      <button
        className="patient-row-card"
        type="button"
        onClick={() => onSelect?.(patient)}
        aria-label={`Abrir ficha de ${name}`}
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
        className="patient-delete-icon-button"
        type="button"
        onClick={() => onRequestDelete?.(patient)}
        disabled={isDeleting}
        aria-label={`Solicitar exclusão do paciente ${name}`}
        title={`Solicitar exclusão de ${name}`}
      >
        <TrashIcon />
      </button>
    </article>
  );
}
