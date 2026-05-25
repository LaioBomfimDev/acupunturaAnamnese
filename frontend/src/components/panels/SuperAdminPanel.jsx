/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import {
  createTherapist,
  listAuditLogs,
  listProfessionals,
  resetTemporaryPassword,
  setProfessionalActive,
  updateProfessionalProfile,
} from '../../services/adminService';

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  username: '',
  phone: '',
  document: '',
  professionalRegistration: '',
  specialty: '',
  clinicName: '',
  notes: '',
  temporaryPassword: '',
  confirmTemporaryPassword: '',
};

const EMPTY_EDIT_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  document: '',
  professionalRegistration: '',
  specialty: '',
  clinicName: '',
  notes: '',
};

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function getEmailLogin(email) {
  return normalizeUsername(String(email || '').split('@')[0]);
}

function getFullName(firstName, lastName) {
  return [firstName, lastName].map(part => String(part || '').trim()).filter(Boolean).join(' ');
}

function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' '),
  };
}

function maskCpfCnpj(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 14);

  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5');
}

function generatePassword() {
  const bytes = new Uint32Array(4);
  crypto.getRandomValues(bytes);
  const digits = Array.from(bytes, byte => String(byte % 10)).join('');
  return `Acup${digits}`;
}

function toCount(value) {
  return Number(value || 0);
}

function formatDate(value) {
  if (!value) return 'Pendente';
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value) {
  if (!value) return 'Sem registro';
  return new Date(value).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function profileToEditForm(profile) {
  const name = splitFullName(profile?.full_name);

  return {
    firstName: name.firstName,
    lastName: name.lastName,
    phone: profile?.phone || '',
    document: maskCpfCnpj(profile?.document || ''),
    professionalRegistration: profile?.professional_registration || '',
    specialty: profile?.specialty || '',
    clinicName: profile?.clinic_name || '',
    notes: profile?.notes || '',
  };
}

function PasswordField({ label, value, onChange, visible, onToggle, required = false }) {
  const title = visible ? 'Ocultar senha' : 'Mostrar senha';

  return (
    <label className="password-label">
      {label}
      <span className="password-field">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete="new-password"
          required={required}
        />
        <button
          className="password-eye-button"
          type="button"
          onClick={onToggle}
          aria-label={title}
          title={title}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M2.2 12s3.4-6 9.8-6 9.8 6 9.8 6-3.4 6-9.8 6-9.8-6-9.8-6Z" />
            <circle cx="12" cy="12" r="3" />
            {visible && <path className="password-eye-slash" d="M4 20 20 4" />}
          </svg>
        </button>
      </span>
    </label>
  );
}

function getStatus(profile) {
  if (!profile.is_active) return 'Suspenso';
  if (profile.must_change_password) return 'Senha temporária';
  return 'Ativo';
}

function getStatusClass(profile) {
  if (!profile.is_active) return 'blocked';
  if (profile.must_change_password) return 'pending';
  return 'active';
}

function getActionLabel(action) {
  const labels = {
    therapist_created: 'Profissional criado',
    profile_suspended: 'Usuário suspenso',
    profile_reactivated: 'Usuário reativado',
    temporary_password_reset: 'Senha temporária redefinida',
    first_login_password_changed: 'Senha definitiva criada',
    profile_updated: 'Cadastro atualizado',
  };

  return labels[action] || action;
}

export function SuperAdminPanel({ currentUserId }) {
  const [professionals, setProfessionals] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusChangingId, setStatusChangingId] = useState('');
  const [resettingId, setResettingId] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' });
  const [passwordVisibility, setPasswordVisibility] = useState({
    temporary: false,
    temporaryConfirm: false,
    reset: false,
    resetConfirm: false,
  });
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [profileSaving, setProfileSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [auditError, setAuditError] = useState('');

  const stats = useMemo(() => ({
    total: professionals.length,
    patients: professionals.reduce((sum, item) => sum + toCount(item.patient_count), 0),
    active: professionals.filter(item => item.is_active && !item.must_change_password).length,
    pending: professionals.filter(item => item.must_change_password).length,
    suspended: professionals.filter(item => !item.is_active).length,
  }), [professionals]);

  const selectedLiveProfile = useMemo(() => {
    if (!selectedProfile) return null;
    return professionals.find(profile => profile.id === selectedProfile.id) || selectedProfile;
  }, [professionals, selectedProfile]);

  const filteredProfessionals = useMemo(() => {
    const term = query.trim().toLowerCase();

    return professionals.filter(profile => {
      const statusMatches =
        statusFilter === 'all'
        || (statusFilter === 'active' && profile.is_active && !profile.must_change_password)
        || (statusFilter === 'pending' && profile.must_change_password)
        || (statusFilter === 'suspended' && !profile.is_active);

      if (!statusMatches) return false;
      if (!term) return true;

      return [
        profile.full_name,
        profile.username,
        profile.email,
        profile.specialty,
        profile.professional_registration,
        profile.clinic_name,
      ].some(value => String(value || '').toLowerCase().includes(term));
    });
  }, [professionals, query, statusFilter]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await listProfessionals();
      setProfessionals(data);
      return data;
    } catch (err) {
      setError(err.message || 'Não foi possível carregar usuários.');
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    setAuditLoading(true);
    setAuditError('');
    try {
      const data = await listAuditLogs(80);
      setAuditLogs(data);
    } catch (err) {
      setAuditError('Auditoria ainda não configurada no banco.');
      console.warn('Falha ao carregar auditoria:', err);
    } finally {
      setAuditLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadAudit();
  }, []);

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function togglePasswordVisibility(field) {
    setPasswordVisibility(prev => ({ ...prev, [field]: !prev[field] }));
  }

  function openProfilePanel(profile) {
    setSelectedProfile(profile);
    setEditForm(profileToEditForm(profile));
    setError('');
    setSuccess('');
  }

  function closeProfilePanel() {
    setSelectedProfile(null);
    setEditForm(EMPTY_EDIT_FORM);
  }

  function setEditField(field, value) {
    setEditForm(prev => ({ ...prev, [field]: value }));
  }

  function fillGeneratedPassword() {
    const password = generatePassword();
    setForm(prev => ({
      ...prev,
      temporaryPassword: password,
      confirmTemporaryPassword: password,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const payload = {
      ...form,
      email: form.email.trim().toLowerCase(),
      username: normalizeUsername(form.username || getEmailLogin(form.email)),
      fullName: getFullName(form.firstName, form.lastName),
    };

    if (!payload.firstName.trim() || !payload.email || !payload.username) {
      setError('Preencha nome, e-mail e login.');
      return;
    }

    if (payload.temporaryPassword !== payload.confirmTemporaryPassword) {
      setError('A confirmação da senha temporária não confere.');
      return;
    }

    setSaving(true);
    try {
      const created = await createTherapist(payload);
      setSuccess(`Usuário ${created?.username || payload.username} criado com troca de senha obrigatória.`);
      setForm(EMPTY_FORM);
      await load();
      await loadAudit();
    } catch (err) {
      setError(err.message || 'Não foi possível criar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(profile) {
    setStatusChangingId(profile.id);
    setError('');
    setSuccess('');
    try {
      await setProfessionalActive(profile.id, !profile.is_active);
      setSuccess(profile.is_active ? 'Usuário suspenso.' : 'Usuário reativado.');
      const nextProfiles = await load();
      const updatedSelected = nextProfiles.find(item => item.id === profile.id);
      if (updatedSelected) {
        setSelectedProfile(updatedSelected);
        setEditForm(profileToEditForm(updatedSelected));
      }
      await loadAudit();
    } catch (err) {
      setError(err.message || 'Não foi possível alterar o status.');
    } finally {
      setStatusChangingId('');
    }
  }

  async function handleProfileUpdate(event) {
    event.preventDefault();

    if (!selectedLiveProfile) return;

    const payload = {
      ...editForm,
      fullName: getFullName(editForm.firstName, editForm.lastName),
    };

    if (!payload.firstName.trim()) {
      setError('Informe o nome do profissional.');
      return;
    }

    setProfileSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateProfessionalProfile(selectedLiveProfile.id, payload);
      setSuccess('Cadastro profissional atualizado.');
      const nextProfiles = await load();
      const updatedProfile = nextProfiles.find(item => item.id === selectedLiveProfile.id);
      if (updatedProfile) {
        setSelectedProfile(updatedProfile);
        setEditForm(profileToEditForm(updatedProfile));
      }
      await loadAudit();
    } catch (err) {
      setError(err.message || 'Não foi possível atualizar o cadastro.');
    } finally {
      setProfileSaving(false);
    }
  }

  function openResetPassword(profile) {
    const password = generatePassword();
    setResetTarget(profile);
    setResetForm({ password, confirmPassword: password });
    setPasswordVisibility(prev => ({ ...prev, reset: false, resetConfirm: false }));
    setError('');
    setSuccess('');
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    if (!resetTarget) return;

    setResettingId(resetTarget.id);
    setError('');
    setSuccess('');

    try {
      await resetTemporaryPassword(resetTarget.id, resetForm.password, resetForm.confirmPassword);
      setSuccess(`Senha temporária redefinida para ${resetTarget.full_name || resetTarget.email}.`);
      setResetTarget(null);
      setResetForm({ password: '', confirmPassword: '' });
      await load();
      await loadAudit();
    } catch (err) {
      setError(err.message || 'Não foi possível redefinir a senha temporária.');
    } finally {
      setResettingId('');
    }
  }

  return (
    <section className="super-admin">
      <header className="super-admin-head">
        <div>
          <p className="start-kicker">SuperAdm</p>
          <h2>Gestão de acesso</h2>
          <span>Profissionais, credenciais temporárias e liberação operacional.</span>
        </div>
        <div className="super-admin-actions">
          <button className="quiet-button" type="button" onClick={load} disabled={loading}>
            Atualizar
          </button>
        </div>
      </header>

      <div className="admin-stat-grid">
        <div className="security-card admin-stat-card total">
          <span>Perfis</span>
          <b>{stats.total}</b>
          <p>cadastrados</p>
        </div>
        <div className="security-card admin-stat-card patients">
          <span>Pacientes</span>
          <b>{stats.patients}</b>
          <p>vinculados</p>
        </div>
        <div className="security-card admin-stat-card active">
          <span>Ativos</span>
          <b>{stats.active}</b>
          <p>senha definitiva</p>
        </div>
        <div className="security-card admin-stat-card pending">
          <span>Pendentes</span>
          <b>{stats.pending}</b>
          <p>primeiro acesso</p>
        </div>
        <div className="security-card admin-stat-card suspended">
          <span>Suspensos</span>
          <b>{stats.suspended}</b>
          <p>sem acesso clínico</p>
        </div>
      </div>

      {(error || success) && (
        <div className={error ? 'inline-error' : 'inline-success'}>
          {error || success}
        </div>
      )}

      <section className="admin-layout">
        <form className="admin-create-form" onSubmit={handleSubmit}>
          <div className="start-panel-head">
            <div>
              <p className="small">Novo profissional</p>
              <h2>Novo acupunturista</h2>
            </div>
            <button className="tag" type="button" onClick={fillGeneratedPassword}>
              Gerar senha
            </button>
          </div>

          <div className="admin-form-grid">
            <label>
              Nome *
              <input
                value={form.firstName}
                onChange={event => setField('firstName', event.target.value)}
                placeholder="Primeiro nome"
                required
              />
            </label>
            <label>
              Sobrenome
              <input
                value={form.lastName}
                onChange={event => setField('lastName', event.target.value)}
                placeholder="Sobrenome"
              />
            </label>
            <label>
              E-mail *
              <input
                type="email"
                value={form.email}
                onChange={event => {
                  const email = event.target.value;
                  setForm(prev => ({
                    ...prev,
                    email,
                    username: getEmailLogin(email),
                  }));
                }}
                placeholder="nome@sistema.com"
                required
              />
            </label>
            <label>
              Login *
              <input
                value={form.username}
                onChange={event => setField('username', normalizeUsername(event.target.value))}
                placeholder="login"
                required
              />
            </label>
            <label>
              Telefone
              <input
                value={form.phone}
                onChange={event => setField('phone', event.target.value)}
                placeholder="(00) 00000-0000"
              />
            </label>
            <label>
              Documento
              <input
                value={form.document}
                onChange={event => setField('document', maskCpfCnpj(event.target.value))}
                placeholder="CPF/CNPJ"
                inputMode="numeric"
              />
            </label>
            <label>
              Registro profissional
              <input
                value={form.professionalRegistration}
                onChange={event => setField('professionalRegistration', event.target.value)}
                placeholder="Registro ou conselho"
              />
            </label>
            <label>
              Especialidade
              <input
                value={form.specialty}
                onChange={event => setField('specialty', event.target.value)}
                placeholder="Acupuntura, MTC..."
              />
            </label>
            <label>
              Clínica
              <input
                value={form.clinicName}
                onChange={event => setField('clinicName', event.target.value)}
                placeholder="Unidade ou clínica"
              />
            </label>
            <PasswordField
              label="Senha temporária *"
              value={form.temporaryPassword}
              onChange={event => setField('temporaryPassword', event.target.value)}
              visible={passwordVisibility.temporary}
              onToggle={() => togglePasswordVisibility('temporary')}
              required
            />
            <PasswordField
              label="Confirmar senha *"
              value={form.confirmTemporaryPassword}
              onChange={event => setField('confirmTemporaryPassword', event.target.value)}
              visible={passwordVisibility.temporaryConfirm}
              onToggle={() => togglePasswordVisibility('temporaryConfirm')}
              required
            />
            <label className="admin-notes">
              Observações profissionais
              <textarea
                value={form.notes}
                onChange={event => setField('notes', event.target.value)}
                placeholder="Dados internos de credenciamento"
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Criando...' : 'Criar profissional'}
            </button>
          </div>
        </form>

        <section className="admin-users">
          <div className="start-panel-head">
            <div>
              <p className="small">Usuários</p>
              <h2>Controle de acesso</h2>
            </div>
          </div>

          <div className="admin-toolbar">
            <input
              className="admin-search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Buscar profissional"
            />
            <div className="admin-filter" aria-label="Filtrar usuários">
              {[
                ['all', 'Todos'],
                ['active', 'Ativos'],
                ['pending', 'Pendentes'],
                ['suspended', 'Suspensos'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={statusFilter === value ? 'active' : ''}
                  onClick={() => setStatusFilter(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Carregando usuários...</div>
          ) : professionals.length === 0 ? (
            <div className="empty-state">Nenhum usuário cadastrado.</div>
          ) : filteredProfessionals.length === 0 ? (
            <div className="empty-state">Nenhum usuário neste filtro.</div>
          ) : (
            <div className="admin-user-list">
              {filteredProfessionals.map(profile => (
                <button
                  className={`admin-user-row admin-user-button ${selectedLiveProfile?.id === profile.id ? 'selected' : ''}`}
                  key={profile.id}
                  type="button"
                  onClick={() => openProfilePanel(profile)}
                >
                  <div className="admin-user-main">
                    <b>{profile.full_name || profile.email}</b>
                    <small>
                      {profile.username || 'sem login'} • {profile.email}
                    </small>
                    <em>{profile.specialty || profile.professional_registration || 'Dados profissionais pendentes'}</em>
                  </div>

                  <div className="admin-user-insights" aria-label="Métricas administrativas">
                    <span>
                      <b>{toCount(profile.patient_count)}</b>
                      pacientes
                    </span>
                    <span>{toCount(profile.active_patient_count)} ativos</span>
                    <span>{toCount(profile.clinical_record_count)} registros</span>
                  </div>

                  <div className="admin-user-meta">
                    <span className={`admin-status ${getStatusClass(profile)}`}>
                      {getStatus(profile)}
                    </span>
                    <small>Senha: {formatDate(profile.password_changed_at)}</small>
                  </div>
                  <span className="admin-user-open">Abrir</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </section>

      <section className="admin-audit">
        <div className="start-panel-head">
          <div>
            <p className="small">Auditoria</p>
            <h2>Últimas ações administrativas</h2>
          </div>
          <button className="quiet-button" type="button" onClick={loadAudit} disabled={auditLoading}>
            Atualizar log
          </button>
        </div>

        {auditError ? (
          <div className="inline-error">{auditError}</div>
        ) : auditLoading ? (
          <div className="empty-state">Carregando auditoria...</div>
        ) : auditLogs.length === 0 ? (
          <div className="empty-state">Nenhuma ação registrada ainda.</div>
        ) : (
          <div className="admin-audit-list">
            {auditLogs.map(log => (
              <div className="admin-audit-row" key={log.id}>
                <div>
                  <b>{getActionLabel(log.action)}</b>
                  <span>
                    {log.actor_name || log.actor_email || 'Sistema'} → {log.target_name || log.target_email || 'registro'}
                  </span>
                </div>
                <small>{formatDate(log.created_at)}</small>
              </div>
            ))}
          </div>
        )}
      </section>

      {selectedLiveProfile && (
        <div className="admin-modal-backdrop admin-profile-backdrop" role="dialog" aria-modal="true">
          <aside className="admin-profile-panel">
            <div className="admin-profile-head">
              <div>
                <p className="small">Painel do profissional</p>
                <h2>{selectedLiveProfile.full_name || selectedLiveProfile.email}</h2>
                <span>
                  {selectedLiveProfile.specialty || 'Especialidade pendente'} • {getStatus(selectedLiveProfile)}
                </span>
              </div>
              <button className="quiet-button" type="button" onClick={closeProfilePanel}>
                Fechar
              </button>
            </div>

            <div className="admin-profile-metrics">
              <div>
                <span>Pacientes</span>
                <b>{toCount(selectedLiveProfile.patient_count)}</b>
              </div>
              <div>
                <span>Ativos</span>
                <b>{toCount(selectedLiveProfile.active_patient_count)}</b>
              </div>
              <div>
                <span>Arquivados</span>
                <b>{toCount(selectedLiveProfile.archived_patient_count)}</b>
              </div>
              <div>
                <span>Registros</span>
                <b>{toCount(selectedLiveProfile.clinical_record_count)}</b>
              </div>
            </div>

            <div className="admin-profile-readonly">
              <div>
                <span>Login</span>
                <b>{selectedLiveProfile.username || 'Sem login'}</b>
              </div>
              <div>
                <span>E-mail</span>
                <b>{selectedLiveProfile.email}</b>
              </div>
              <div>
                <span>Criado em</span>
                <b>{formatDateTime(selectedLiveProfile.created_at)}</b>
              </div>
              <div>
                <span>Atualizado em</span>
                <b>{formatDateTime(selectedLiveProfile.updated_at)}</b>
              </div>
              <div>
                <span>Último paciente</span>
                <b>{formatDateTime(selectedLiveProfile.last_patient_created_at)}</b>
              </div>
              <div>
                <span>Último registro</span>
                <b>{formatDateTime(selectedLiveProfile.last_record_at)}</b>
              </div>
            </div>

            <form className="admin-profile-form" onSubmit={handleProfileUpdate}>
              <label>
                Nome *
                <input
                  value={editForm.firstName}
                  onChange={event => setEditField('firstName', event.target.value)}
                  required
                />
              </label>
              <label>
                Sobrenome
                <input
                  value={editForm.lastName}
                  onChange={event => setEditField('lastName', event.target.value)}
                />
              </label>
              <label>
                Telefone
                <input
                  value={editForm.phone}
                  onChange={event => setEditField('phone', event.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </label>
              <label>
                Documento
                <input
                  value={editForm.document}
                  onChange={event => setEditField('document', maskCpfCnpj(event.target.value))}
                  placeholder="CPF/CNPJ"
                  inputMode="numeric"
                />
              </label>
              <label>
                Registro profissional
                <input
                  value={editForm.professionalRegistration}
                  onChange={event => setEditField('professionalRegistration', event.target.value)}
                  placeholder="Registro ou conselho"
                />
              </label>
              <label>
                Especialidade
                <input
                  value={editForm.specialty}
                  onChange={event => setEditField('specialty', event.target.value)}
                  placeholder="Acupuntura, MTC..."
                />
              </label>
              <label>
                Clínica
                <input
                  value={editForm.clinicName}
                  onChange={event => setEditField('clinicName', event.target.value)}
                  placeholder="Unidade ou clínica"
                />
              </label>
              <label className="admin-notes">
                Observações profissionais
                <textarea
                  value={editForm.notes}
                  onChange={event => setEditField('notes', event.target.value)}
                  placeholder="Dados internos de credenciamento"
                />
              </label>

              <div className="admin-profile-actions">
                <button className="primary-button" type="submit" disabled={profileSaving}>
                  {profileSaving ? 'Salvando...' : 'Salvar cadastro'}
                </button>
                <button
                  className={selectedLiveProfile.is_active ? 'danger-button' : 'tag active'}
                  type="button"
                  onClick={() => handleStatus(selectedLiveProfile)}
                  disabled={selectedLiveProfile.id === currentUserId || statusChangingId === selectedLiveProfile.id}
                >
                  {statusChangingId === selectedLiveProfile.id
                    ? 'Salvando...'
                    : selectedLiveProfile.is_active ? 'Suspender acesso' : 'Reativar acesso'}
                </button>
                {selectedLiveProfile.id !== currentUserId && selectedLiveProfile.role !== 'super_admin' && (
                  <button
                    className="quiet-button"
                    type="button"
                    onClick={() => openResetPassword(selectedLiveProfile)}
                  >
                    Redefinir senha temporária
                  </button>
                )}
              </div>
            </form>
          </aside>
        </div>
      )}

      {resetTarget && (
        <div className="admin-modal-backdrop" role="dialog" aria-modal="true">
          <form className="admin-reset-modal" onSubmit={handleResetPassword}>
            <div className="force-password-head">
              <p>Senha temporária</p>
              <h1>Redefinir acesso</h1>
              <span>{resetTarget.full_name || resetTarget.email}</span>
            </div>

            <PasswordField
              label="Nova senha temporária"
              value={resetForm.password}
              onChange={event => setResetForm(prev => ({ ...prev, password: event.target.value }))}
              visible={passwordVisibility.reset}
              onToggle={() => togglePasswordVisibility('reset')}
              required
            />
            <PasswordField
              label="Confirmar senha temporária"
              value={resetForm.confirmPassword}
              onChange={event => setResetForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
              visible={passwordVisibility.resetConfirm}
              onToggle={() => togglePasswordVisibility('resetConfirm')}
              required
            />

            <div className="force-password-actions">
              <button className="primary-button" type="submit" disabled={resettingId === resetTarget.id}>
                {resettingId === resetTarget.id ? 'Redefinindo...' : 'Salvar senha temporária'}
              </button>
              <button className="quiet-button" type="button" onClick={() => setResetTarget(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
