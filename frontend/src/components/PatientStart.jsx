import { useMemo, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';

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

export function PatientStart({ onCreatePatient, onSelectPatient, onSignOut, therapistName }) {
  const { patients, selectedPatient, loading, error, createPatient, selectPatient } = usePatient();
  const [mode, setMode] = useState('new');
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', age: '' });

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

  return (
    <section className="home-screen">
      <header className="home-hero">
        <div>
          <h2 className="home-greeting-title">Oi, {therapistName || 'profissional'}</h2>
          <h2>Começar atendimento</h2>
          <span>Cadastre um novo paciente ou retome uma ficha existente.</span>
        </div>
        <div className="home-meta">
          <span>{patients.length} paciente(s)</span>
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
              onClick={() => setMode('select')}
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
                </div>
                <input
                  className="patient-search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Buscar por nome"
                />
              </div>

              {loading ? (
                <div className="empty-state">Carregando pacientes...</div>
              ) : filteredPatients.length === 0 ? (
                <div className="empty-state">Nenhum paciente encontrado.</div>
              ) : (
                <div className="patient-list">
                  {filteredPatients.map(patient => (
                    <button
                      key={patient.id}
                      className="patient-row"
                      onClick={() => handleSelect(patient)}
                    >
                      <span className="patient-avatar">{getInitials(patient.name)}</span>
                      <span className="patient-row-main">
                        <b>{patient.name}</b>
                        <small>{patient.phone || 'Sem telefone'} • {formatAge(patient)}</small>
                      </span>
                      <span className="patient-row-arrow">›</span>
                    </button>
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
