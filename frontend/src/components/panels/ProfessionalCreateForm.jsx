// ============================================================
// Formulário de criação de profissional (reutilizável)
// Vive na aba "Criar profissional" do SuperAdm e também na aba
// "Clínicas", onde pode abrir já com a clínica pré-selecionada.
// ============================================================

import { useState } from 'react';
import { createTherapist } from '../../services/adminService';
import { buscarEnderecoPorCep, formatCep, isValidCepFormat } from '../../services/cepService';
import { DISCIPLINES } from '../../data/disciplines';
import {
  ClinicSelect,
  PasswordField,
  ProfessionRegistration,
  SpecialtyTags,
} from './professionalFormParts';
import {
  CREATABLE_ROLES,
  EMPTY_PROFESSIONAL_FORM,
  UF_OPTIONS,
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
  // Presente = quem está criando é admin de UMA clínica só (nunca
  // SuperAdm): o seletor de clínica some da tela e o profissional
  // nasce sempre nessa clínica, sem chance de escolher outra.
  lockedClinicId = '',
  lockedClinicName = '',
  kicker = 'Novo cadastro',
  heading = 'Novo profissional',
  onCancel,
}) {
  const effectiveClinicId = lockedClinicId || defaultClinicId || '';
  const [form, setForm] = useState(() => ({ ...EMPTY_PROFESSIONAL_FORM, clinicId: effectiveClinicId }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordVisibility, setPasswordVisibility] = useState({ temporary: false, temporaryConfirm: false });
  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotice, setCepNotice] = useState(null);

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function togglePasswordVisibility(field) {
    setPasswordVisibility(prev => ({ ...prev, [field]: !prev[field] }));
  }

  function toggleDiscipline(disciplineId) {
    setForm(prev => ({
      ...prev,
      disciplines: prev.disciplines.includes(disciplineId)
        ? prev.disciplines.filter(id => id !== disciplineId)
        : [...prev.disciplines, disciplineId],
    }));
  }

  function fillGeneratedPassword() {
    const password = generatePassword();
    setForm(prev => ({ ...prev, temporaryPassword: password, confirmTemporaryPassword: password }));
  }

  async function handleCepBlur() {
    if (!form.enderecoCep || !isValidCepFormat(form.enderecoCep)) return;
    setCepLoading(true);
    setCepNotice(null);
    try {
      const endereco = await buscarEnderecoPorCep(form.enderecoCep);
      if (!endereco) {
        setCepNotice('CEP não encontrado — preencha o endereço manualmente.');
        return;
      }
      setForm(prev => ({
        ...prev,
        enderecoLogradouro: endereco.logradouro || prev.enderecoLogradouro,
        enderecoBairro: endereco.bairro || prev.enderecoBairro,
        enderecoCidade: endereco.localidade || prev.enderecoCidade,
        enderecoUf: endereco.uf || prev.enderecoUf,
      }));
    } catch (err) {
      setCepNotice(err.message || 'Não foi possível consultar o CEP agora.');
    } finally {
      setCepLoading(false);
    }
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
      setForm({ ...EMPTY_PROFESSIONAL_FORM, clinicId: effectiveClinicId });
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
        <label>
          CEP
          <input
            value={form.enderecoCep}
            onChange={event => setField('enderecoCep', formatCep(event.target.value))}
            onBlur={handleCepBlur}
            placeholder="00000-000"
            inputMode="numeric"
          />
        </label>
        <label>
          Logradouro
          <input
            value={form.enderecoLogradouro}
            onChange={event => setField('enderecoLogradouro', event.target.value)}
          />
        </label>
        <label>
          Número
          <input
            value={form.enderecoNumero}
            onChange={event => setField('enderecoNumero', event.target.value)}
          />
        </label>
        <label>
          Complemento
          <input
            value={form.enderecoComplemento}
            onChange={event => setField('enderecoComplemento', event.target.value)}
          />
        </label>
        <label>
          Bairro
          <input
            value={form.enderecoBairro}
            onChange={event => setField('enderecoBairro', event.target.value)}
          />
        </label>
        <label>
          Cidade
          <input
            value={form.enderecoCidade}
            onChange={event => setField('enderecoCidade', event.target.value)}
          />
        </label>
        <label>
          UF
          <select value={form.enderecoUf} onChange={event => setField('enderecoUf', event.target.value)}>
            <option value="">Selecione</option>
            {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
          </select>
        </label>
        {(cepLoading || cepNotice) && (
          <p className="field-hint">{cepLoading ? 'Consultando CEP…' : cepNotice}</p>
        )}
        <label>
          Tipo de acesso *
          <select
            value={form.role}
            onChange={event => {
              const role = event.target.value;
              // Recepção não escolhe profissão/conselho: os campos nem
              // aparecem pra ela (ver bloco abaixo), então o valor precisa
              // vir preenchido daqui pra validação passar.
              setForm(prev => ({
                ...prev,
                role,
                profession: role === 'receptionist' ? 'recepcionista' : prev.profession,
              }));
            }}
          >
            {CREATABLE_ROLES.map(item => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>
        {form.role !== 'receptionist' && (
          <ProfessionRegistration
            profession={form.profession}
            onProfession={value => setField('profession', value)}
            registration={form.professionalRegistration}
            onRegistration={value => setField('professionalRegistration', value)}
            required
          />
        )}
        {form.role === 'clinic_admin' && (
          <>
            <label className="admin-notes">
              Também atende pacientes?
              <div className="professional-form-disciplines">
                <label className="professional-form-discipline-option">
                  <input
                    type="radio"
                    name="attends-patients"
                    checked={form.attendsPatients}
                    onChange={() => setField('attendsPatients', true)}
                  />
                  Sim, administra e atende
                </label>
                <label className="professional-form-discipline-option">
                  <input
                    type="radio"
                    name="attends-patients"
                    checked={!form.attendsPatients}
                    onChange={() => setField('attendsPatients', false)}
                  />
                  Não, só administra
                </label>
              </div>
            </label>
            {form.attendsPatients ? (
              <label className="admin-notes">
                Em quais áreas
                <div className="professional-form-disciplines">
                  {DISCIPLINES.map(discipline => (
                    <label key={discipline.id} className="professional-form-discipline-option">
                      <input
                        type="checkbox"
                        checked={form.disciplines.includes(discipline.id)}
                        onChange={() => toggleDiscipline(discipline.id)}
                      />
                      {discipline.label}
                    </label>
                  ))}
                </div>
              </label>
            ) : (
              <p className="field-hint">
                Cai direto no console de administração; enxerga e pode abrir todas as áreas da clínica, só para consulta.
              </p>
            )}
          </>
        )}
        {lockedClinicId ? (
          <label>
            Clínica
            <input value={lockedClinicName || 'Sua clínica'} disabled />
          </label>
        ) : (
          <ClinicSelect
            value={form.clinicId}
            onChange={value => setField('clinicId', value)}
            clinics={clinics}
          />
        )}
        {form.role !== 'receptionist' && (
          <label className="admin-notes">
            Especialidades
            <SpecialtyTags
              value={form.specialty}
              onChange={value => setField('specialty', value)}
            />
          </label>
        )}
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
