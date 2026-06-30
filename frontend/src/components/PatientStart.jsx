import { useMemo, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { formatPatientCount, isPatientDeletionConfirmationValid } from '../utils/patientUi';

function formatDate(value) {
  if (!value) return 'Sem nascimento';
  return new Date(`${value}T00:00:00`).toLocaleDateString('pt-BR');
}

function formatAge(patient) {
  if (patient?.age !== undefined && patient?.age !== null && patient?.age !== '') {
    return `${patient.age} anos`;
  }
  return formatDate(patient?.birth_date);
}

function getInitials(name) {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
}

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

export function PatientStart({ onCreatePatient, onSelectPatient, onSignOut, therapistName }) {
  const { patients, selectedPatient, loading, error, createPatient, selectPatient, deletePatient } = usePatient();
  const [mode, setMode] = useState('new');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteText, setDeleteText] = useState('');
  const [deletingPatientId, setDeletingPatientId] = useState(null);
  const [listNotice, setListNotice] = useState(null);
  const [formData, setFormData] = useState({ name: '', phone: '', age: '' });
  const canConfirmDelete = isPatientDeletionConfirmationValid(deleteText);

  const filteredPatients = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter(patient => {
      const name = patient.name?.toLowerCase() || '';
      return name.includes(term);
    });
  }, [patients, query]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSaving(true);
    setListNotice(null);
    try {
      const patient = await createPatient(formData);
      setFormData({ name: '', phone: '', age: '' });
      onCreatePatient?.(patient);
    } finally {
      setSaving(false);
    }
  }

  function handleSelect(patient) {
    selectPatient(patient);
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
      setListNotice({ type: 'success', text: `${patientName} foi excluído da lista.` });
      handleCancelDelete();
    } catch (err) {
      setListNotice({
        type: 'error',
        text: err?.message || 'Não foi possível excluir o paciente.',
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
          <h2>Começar atendimento</h2>
          <span>Cadastre um novo paciente ou retome uma ficha existente.</span>
        </div>
        <div className="home-meta">
          <span>{formatPatientCount(patients.length)}</span>
          <button className="quiet-button" onClick={onSignOut}>Sair</button>
        </div>
      </header>

      <div className="home-grid">
        <section className="start-workspace">
          <div className="start-workspace-head">
            <div>
              <p className="start-kicker">Fluxo de entrada</p>
              <h2>{mode === 'new' ? 'Novo paciente' : 'Selecionar paciente'}</h2>
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

          <section className="start-actions" aria-label="Fluxo de atendimento">
            <button
              className={`start-action${mode === 'new' ? ' active' : ''}`}
              onClick={() => setMode('new')}
            >
              <span className="start-action-icon">+</span>
              <span>
                <b>Novo paciente</b>
                <small>Criar cadastro e abrir anamnese</small>
              </span>
            </button>
            <button
              className={`start-action${mode === 'select' ? ' active' : ''}`}
              onClick={() => {
                setMode('select');
                setListNotice(null);
              }}
            >
              <span className="start-action-icon">⌕</span>
              <span>
                <b>Selecionar paciente</b>
                <small>Retomar ficha e resumo clínico</small>
              </span>
            </button>
          </section>

          {mode === 'new' ? (
            <section className="start-panel">
              <div className="start-panel-head">
                <div>
                  <p className="small">Cadastro</p>
                  <h2>Novo paciente</h2>
                </div>
              </div>

              <form className="patient-form" onSubmit={handleCreate}>
                <label>
                  Nome completo *
                  <input
                    value={formData.name}
                    onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
                    placeholder="Nome do paciente"
                    required
                  />
                </label>
                <label>
                  Telefone
                  <input
                    value={formData.phone}
                    onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(00) 00000-0000"
                  />
                </label>
                <label>
                  Idade
                  <input
                    type="number"
                    min="0"
                    max="130"
                    value={formData.age}
                    onChange={e => setFormData(f => ({ ...f, age: e.target.value }))}
                    placeholder="Ex: 42"
                  />
                </label>
                <div className="form-actions">
                  <button className="primary-button" type="submit" disabled={saving}>
                    {saving ? 'Salvando...' : 'Criar e abrir anamnese'}
                  </button>
                </div>
              </form>
              {error && <div className="inline-error">{error}</div>}
            </section>
          ) : (
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
                    <p className="small">Exclusão definitiva</p>
                    <h3 id="patient-delete-title">Excluir {deleteTarget.name || 'paciente'}?</h3>
                    <p>
                      Essa ação remove o cadastro e registros vinculados. Para segurança, confirme digitando <b>excluir</b>.
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
                      {deletingPatientId === deleteTarget.id ? 'Excluindo...' : 'Excluir definitivamente'}
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
          )}
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
        aria-label={`Excluir paciente ${name}`}
        title={`Excluir ${name}`}
      >
        <TrashIcon />
      </button>
    </article>
  );
}
