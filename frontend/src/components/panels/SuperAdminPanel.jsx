/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useState } from 'react';
import {
  listAuditLogs,
  listProfessionals,
  resetTemporaryPassword,
  setProfessionalActive,
  updateProfessionalProfile,
} from '../../services/adminService';
import { listClinics, setProfileClinic } from '../../services/clinicService';
import { getProfession } from '../../data/professionalCouncils';
import {
  ClinicSelect,
  PasswordField,
  ProfessionRegistration,
  SpecialtyTags,
} from './professionalFormParts';
import {
  generatePassword,
  getFullName,
  maskCpfCnpj,
  splitFullName,
} from './professionalFormHelpers';
import { ProfessionalCreateForm } from './ProfessionalCreateForm';
import { ClinicAdminPanel } from './ClinicAdminPanel';
import { DeployHealthPanel } from './DeployHealthPanel';
import { KnowledgeAdminPanel } from './KnowledgeAdminPanel';
import { MapCoordinateEditor } from './MapCoordinateEditor';
import { PdfSourceLearningPanel } from './PdfSourceLearningPanel';
import { AnamneseKnowledgePanel } from './AnamneseKnowledgePanel';
import { AiInstructionsPanel } from './AiInstructionsPanel';
import { AICorrectionsPanel } from './AICorrectionsPanel';
import { HerbalPlantCurationPanel } from './HerbalPlantCurationPanel';

const EMPTY_EDIT_FORM = {
  firstName: '',
  lastName: '',
  phone: '',
  document: '',
  profession: '',
  professionalRegistration: '',
  specialty: '',
  clinicId: '',
  notes: '',
};

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
    profession: profile?.profession || '',
    professionalRegistration: profile?.professional_registration || '',
    specialty: profile?.specialty || '',
    clinicId: profile?.clinic_id || '',
    notes: profile?.notes || '',
  };
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

export function SuperAdminPanel({ currentUserId, activeSection = 'manage' }) {
  const [professionals, setProfessionals] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(true);
  const [statusChangingId, setStatusChangingId] = useState('');
  const [resettingId, setResettingId] = useState('');
  const [resetTarget, setResetTarget] = useState(null);
  const [resetForm, setResetForm] = useState({ password: '', confirmPassword: '' });
  const [passwordVisibility, setPasswordVisibility] = useState({
    reset: false,
    resetConfirm: false,
  });
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM);
  const [profileSaving, setProfileSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [auditError, setAuditError] = useState('');

  // Estados e funções de Calibração de Mapa (solicitações de terapeutas)
  const [coordinateRequests, setCoordinateRequests] = useState([]);

  function loadCoordinateRequests() {
    try {
      const stored = JSON.parse(localStorage.getItem('acup_coordinate_requests_v1') || '[]');
      setCoordinateRequests(stored.filter(req => !req.resolved));
    } catch (err) {
      console.error('Falha ao carregar solicitações de coordenadas:', err);
    }
  }

  function resolveCoordinateRequest(requestId) {
    try {
      const stored = JSON.parse(localStorage.getItem('acup_coordinate_requests_v1') || '[]');
      const updated = stored.map(req => req.id === requestId ? { ...req, resolved: true } : req);
      localStorage.setItem('acup_coordinate_requests_v1', JSON.stringify(updated));
      loadCoordinateRequests();
    } catch (err) {
      console.error('Falha ao resolver solicitação:', err);
    }
  }

  useEffect(() => {
    if (activeSection === 'maps') {
      loadCoordinateRequests();
    }
  }, [activeSection]);

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
        getProfession(profile.profession).label,
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

  async function loadClinics() {
    try {
      setClinics(await listClinics());
    } catch (err) {
      console.warn('Falha ao carregar clínicas para o select:', err?.message);
    }
  }

  useEffect(() => {
    load();
    loadAudit();
    loadClinics();
  }, []);

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

  async function handleProfessionalCreated() {
    await load();
    await loadAudit();
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

    const selectedClinic = clinics.find(clinic => clinic.id === editForm.clinicId) || null;
    const payload = {
      ...editForm,
      fullName: getFullName(editForm.firstName, editForm.lastName),
      clinicName: selectedClinic?.name || '',
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
      // Mantém clinic_id em sincronia com a clínica escolhida no select.
      if ((editForm.clinicId || '') !== (selectedLiveProfile.clinic_id || '')) {
        await setProfileClinic(selectedLiveProfile.id, editForm.clinicId || null);
      }
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
          <h2>Painel administrativo</h2>
          <span>Acessos, profissionais, Biblioteca Viva e auditoria em áreas separadas.</span>
        </div>
        <div className="super-admin-actions">
          <button
            className="quiet-button"
            type="button"
            onClick={() => { load(); loadClinics(); }}
            disabled={loading}
          >
            Atualizar
          </button>
        </div>
      </header>

      <div className="super-admin-content">
      {activeSection === 'clinics' ? (
        <ClinicAdminPanel />
      ) : activeSection === 'deploy-health' ? (
        <DeployHealthPanel />
      ) : activeSection === 'knowledge' ? (
        <KnowledgeAdminPanel />
      ) : activeSection === 'pdf-sources' ? (
        <PdfSourceLearningPanel />
      ) : activeSection === 'anamnese-knowledge' ? (
        <AnamneseKnowledgePanel />
      ) : activeSection === 'ai-instructions' ? (
        <AiInstructionsPanel />
      ) : activeSection === 'ai-corrections' ? (
        <AICorrectionsPanel />
      ) : activeSection === 'herbal-curation' ? (
        <HerbalPlantCurationPanel />
      ) : activeSection === 'maps' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <section className="box" style={{ background: '#f8fafc', border: '1px solid var(--line)', borderRadius: 18, padding: 20 }}>
            <h3 style={{ margin: '0 0 12px', color: 'var(--navy)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              📥 Solicitações de Ajuste de Terapeutas
            </h3>
            {coordinateRequests.length === 0 ? (
              <p style={{ color: '#64748b', margin: 0, fontSize: 13 }}>Nenhuma solicitação pendente.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {coordinateRequests.map((req, idx) => (
                  <div key={idx} style={{
                    background: 'white', border: '1px solid var(--line)', borderRadius: 12,
                    padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12
                  }}>
                    <div>
                      <b style={{ color: 'var(--navy)', fontSize: 14 }}>Ponto: {req.pointCode}</b>
                      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#334155', lineHeight: 1.4 }}>{req.message}</p>
                      <small style={{ color: '#64748b', display: 'block', marginTop: 4 }}>Solicitado em: {new Date(req.createdAt).toLocaleDateString('pt-BR')}</small>
                    </div>
                    <button
                      className="tag active"
                      onClick={() => resolveCoordinateRequest(req.id)}
                      style={{ background: '#e6f4ea', color: '#137333', borderColor: '#137333', cursor: 'pointer', padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap' }}
                    >
                      Marcar como Resolvido
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <MapCoordinateEditor
            approvalActorRole="super_admin"
            approvalActorLabel="SuperAdm"
          />
        </div>
      ) : (
      <>
      {activeSection === 'manage' && (
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
      )}

      {activeSection === 'manage' && (error || success) && (
        <div className={error ? 'inline-error' : 'inline-success'}>
          {error || success}
        </div>
      )}

      {(activeSection === 'create' || activeSection === 'manage') && (
      <section className="admin-layout admin-layout-single">
        {activeSection === 'create' && (
        <ProfessionalCreateForm clinics={clinics} onCreated={handleProfessionalCreated} />
        )}

        {activeSection === 'manage' && (
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
                    <em>{[getProfession(profile.profession).label, profile.specialty].filter(Boolean).join(' · ') || profile.professional_registration || 'Dados profissionais pendentes'}</em>
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
        )}
      </section>
      )}

      {activeSection === 'logs' && (
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
      )}

      {selectedLiveProfile && (
        <div className="admin-modal-backdrop admin-profile-backdrop" role="dialog" aria-modal="true">
          <aside className="admin-profile-panel">
            <div className="admin-profile-head">
              <div>
                <p className="small">Painel do profissional</p>
                <h2>{selectedLiveProfile.full_name || selectedLiveProfile.email}</h2>
                <span>
                  {[getProfession(selectedLiveProfile.profession).label, selectedLiveProfile.specialty].filter(Boolean).join(' · ') || 'Cadastro profissional pendente'} • {getStatus(selectedLiveProfile)}
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
              <ProfessionRegistration
                profession={editForm.profession}
                onProfession={value => setEditField('profession', value)}
                registration={editForm.professionalRegistration}
                onRegistration={value => setEditField('professionalRegistration', value)}
              />
              <ClinicSelect
                value={editForm.clinicId}
                onChange={value => setEditField('clinicId', value)}
                clinics={clinics}
              />
              <label className="admin-notes">
                Especialidades
                <SpecialtyTags
                  value={editForm.specialty}
                  onChange={value => setEditField('specialty', value)}
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
      </>
      )}
      </div>
    </section>
  );
}
