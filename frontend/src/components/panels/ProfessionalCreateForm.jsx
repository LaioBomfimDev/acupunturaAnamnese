// ============================================================
// Formulário de criação de profissional (reutilizável)
// Vive na aba "Criar profissional" do SuperAdm e também na aba
// "Clínicas", onde pode abrir já com a clínica pré-selecionada.
// ============================================================

import { useState } from 'react';
import { createTherapist } from '../../services/adminService';
import {
  ClinicSelect,
  PasswordField,
  ProfessionRegistration,
  SpecialtyTags,
} from './professionalFormParts';
import {
  EMPTY_PROFESSIONAL_FORM,
  buildProfessionalCreatePayload,
  generatePassword,
  getEmailLogin,
  getProfessionalCreateValidationError,
  maskCpfCnpj,
  normalizeUsername,
} from './professionalFormHelpers';

export function ProfessionalCreateForm({
  clinics,
  onCreated,
  defaultClinicId = '',
  kicker = 'Novo cadastro',
  heading = 'Novo profissional',
  onCancel,
}) {
  const [form, setForm] = useState(() => ({ ...EMPTY_PROFESSIONAL_FORM, clinicId: defaultClinicId || '' }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordVisibility, setPasswordVisibility] = useState({ temporary: false, temporaryConfirm: false });

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function togglePasswordVisibility(field) {
    setPasswordVisibility(prev => ({ ...prev, [field]: !prev[field] }));
  }

  function fillGeneratedPassword() {
    const password = generatePassword();
    setForm(prev => ({ ...prev, temporaryPassword: password, confirmTemporaryPassword: password }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const payload = buildProfessionalCreatePayload(form, clinics);
    const validationError = getProfessionalCreateValidationError(payload);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const created = await createTherapist(payload);
      setSuccess(`Usuário ${created?.username || payload.username} criado com troca de senha obrigatória.`);
      setForm({ ...EMPTY_PROFESSIONAL_FORM, clinicId: defaultClinicId || '' });
      await onCreated?.(created);
    } catch (err) {
      setError(err.message || 'Não foi possível criar o usuário.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="admin-create-form" onSubmit={handleSubmit}>
      <div className="start-panel-head">
        <div>
          <p className="small">{kicker}</p>
          <h2>{heading}</h2>
        </div>
        <div className="professional-form-head-actions">
          <button className="tag" type="button" onClick={fillGeneratedPassword}>
            Gerar senha
          </button>
          {onCancel && (
            <button className="quiet-button" type="button" onClick={onCancel}>
              Fechar
            </button>
          )}
        </div>
      </div>

      {(error || success) && (
        <div className={error ? 'inline-error' : 'inline-success'}>
          {error || success}
        </div>
      )}

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
              setForm(prev => ({ ...prev, email, username: getEmailLogin(email) }));
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
        <ProfessionRegistration
          profession={form.profession}
          onProfession={value => setField('profession', value)}
          registration={form.professionalRegistration}
          onRegistration={value => setField('professionalRegistration', value)}
          required
        />
        <ClinicSelect
          value={form.clinicId}
          onChange={value => setField('clinicId', value)}
          clinics={clinics}
        />
        <label className="admin-notes">
          Especialidades
          <SpecialtyTags
            value={form.specialty}
            onChange={value => setField('specialty', value)}
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
  );
}
