// ============================================================
// COMPONENTE: Barra de seleção / cadastro de paciente
// Exibida no topo do app. Permite selecionar um paciente
// existente, criar um novo ou voltar à lista.
// ============================================================

import { useState } from 'react';
import { usePatient } from '../hooks/PatientContext';

export function PatientBar() {
  const {
    patients,
    selectedPatient,
    loading,
    createPatient,
    selectPatient,
    clearSelection,
    deletePatient,
  } = usePatient();

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', phone: '', birthDate: '' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  async function handleCreate(e) {
    e.preventDefault();
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      await createPatient(formData);
      setFormData({ name: '', phone: '', birthDate: '' });
      setShowForm(false);
    } catch {
      // erro tratado no contexto
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(patientId) {
    try {
      await deletePatient(patientId);
      setConfirmDelete(null);
    } catch {
      // erro tratado no contexto
    }
  }

  // Estilo da barra
  const barStyle = {
    background: 'linear-gradient(135deg, #0c1f3f 0%, #1a365d 100%)',
    color: 'white',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flexWrap: 'wrap',
    borderBottom: '2px solid var(--gold)',
    fontSize: '14px',
  };

  const btnStyle = {
    background: 'rgba(255,255,255,0.15)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.25)',
    padding: '6px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  };

  const btnGoldStyle = {
    ...btnStyle,
    background: 'var(--gold)',
    color: '#0c1f3f',
    border: '1px solid var(--gold)',
    fontWeight: 600,
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.12)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.25)',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '13px',
    outline: 'none',
  };

  // Se tem paciente selecionado, mostra info compacta
  if (selectedPatient) {
    return (
      <div className="patient-bar no-print" style={barStyle}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
          <circle cx="12" cy="7" r="4"/>
        </svg>
        <span style={{ fontWeight: 600 }}>{selectedPatient.name}</span>
        {selectedPatient.phone && (
          <span style={{ opacity: 0.7, fontSize: '12px' }}>• {selectedPatient.phone}</span>
        )}
        {selectedPatient.birth_date && (
          <span style={{ opacity: 0.7, fontSize: '12px' }}>
            • {new Date(selectedPatient.birth_date).toLocaleDateString('pt-BR')}
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          <button style={btnStyle} onClick={clearSelection}>
            ← Trocar paciente
          </button>
        </div>
      </div>
    );
  }

  // Lista de pacientes / formulário de cadastro
  return (
    <div className="patient-bar no-print" style={{ background: '#f0f4f8', borderBottom: '2px solid var(--gold)' }}>
      <div style={{ ...barStyle, borderBottom: 'none' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span style={{ fontWeight: 600 }}>Selecione um paciente para iniciar o atendimento</span>
        <div style={{ marginLeft: 'auto' }}>
          <button style={btnGoldStyle} onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancelar' : '＋ Novo paciente'}
          </button>
        </div>
      </div>

      {/* Formulário de cadastro */}
      {showForm && (
        <form onSubmit={handleCreate} style={{ padding: '0 20px 16px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Nome *</label>
            <input
              style={{ ...inputStyle, background: 'white', color: '#1a1a2e', minWidth: '200px' }}
              value={formData.name}
              onChange={e => setFormData(f => ({ ...f, name: e.target.value }))}
              placeholder="Nome completo"
              required
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Telefone</label>
            <input
              style={{ ...inputStyle, background: 'white', color: '#1a1a2e' }}
              value={formData.phone}
              onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))}
              placeholder="(XX) XXXXX-XXXX"
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Nascimento</label>
            <input
              type="date"
              style={{ ...inputStyle, background: 'white', color: '#1a1a2e' }}
              value={formData.birthDate}
              onChange={e => setFormData(f => ({ ...f, birthDate: e.target.value }))}
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            style={{ ...btnGoldStyle, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Salvando...' : 'Cadastrar'}
          </button>
        </form>
      )}

      {/* Lista de pacientes */}
      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>
          Carregando pacientes...
        </div>
      ) : patients.length === 0 ? (
        <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8' }}>
          <p style={{ fontSize: '15px', margin: '0 0 8px' }}>Nenhum paciente cadastrado</p>
          <p style={{ fontSize: '13px', margin: 0 }}>Clique em "＋ Novo paciente" para começar.</p>
        </div>
      ) : (
        <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
          {patients.map(p => (
            <div
              key={p.id}
              style={{
                background: 'white',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                position: 'relative',
              }}
              onClick={() => selectPatient(p)}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; }}
              onMouseOut={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--gold) 0%, #d4a853 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: '14px', flexShrink: 0,
              }}>
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#1a1a2e', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.name}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8' }}>
                  {p.phone || 'Sem telefone'}
                  {p.birth_date && ` • ${new Date(p.birth_date).toLocaleDateString('pt-BR')}`}
                </div>
              </div>

              {/* Botão de excluir */}
              {confirmDelete === p.id ? (
                <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                  <button
                    style={{ ...btnStyle, background: '#ef4444', color: 'white', border: 'none', fontSize: '11px', padding: '4px 8px' }}
                    onClick={() => handleDelete(p.id)}
                  >
                    Confirmar
                  </button>
                  <button
                    style={{ ...btnStyle, fontSize: '11px', padding: '4px 8px', color: '#64748b' }}
                    onClick={() => setConfirmDelete(null)}
                  >
                    Não
                  </button>
                </div>
              ) : (
                <button
                  style={{ ...btnStyle, padding: '4px 8px', fontSize: '11px', color: '#94a3b8', background: 'transparent', border: 'none' }}
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(p.id); }}
                  title="Excluir paciente"
                >
                  🗑
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
