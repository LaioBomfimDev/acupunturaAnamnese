import { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/AuthContext';
import { getProfession } from '../../data/professionalCouncils';
import { buscarEnderecoPorCep, formatCep, isValidCepFormat } from '../../services/cepService';
import { getMyProfile, updateMyProfile } from '../../services/myProfileService';
import { SpecialtyTags } from './professionalFormParts';
import { UF_OPTIONS, maskCpfCnpj } from './professionalFormHelpers';

// ============================================================
// Gestão → Meu cadastro: a própria pessoa corrige os dados pessoais
// (nome, contato, documento, registro no conselho, especialidades e
// endereço) via RPC update_my_profile. Login, e-mail, tipo de acesso,
// profissão e instituição aparecem só para leitura: profissão decide
// áreas liberadas, então quem troca é a administração.
// ============================================================

const ROLE_LABELS = {
  therapist: 'Profissional',
  clinic_admin: 'Admin de clínica',
  receptionist: 'Recepção',
  knowledge_reviewer: 'Revisora de curadoria',
  super_admin: 'SuperAdm',
};

function toForm(row) {
  return {
    fullName: row?.full_name || '',
    phone: row?.phone || '',
    document: row?.document || '',
    professionalRegistration: row?.professional_registration || '',
    specialty: row?.specialty || '',
    enderecoCep: row?.endereco_cep || '',
    enderecoLogradouro: row?.endereco_logradouro || '',
    enderecoNumero: row?.endereco_numero || '',
    enderecoComplemento: row?.endereco_complemento || '',
    enderecoBairro: row?.endereco_bairro || '',
    enderecoCidade: row?.endereco_cidade || '',
    enderecoUf: row?.endereco_uf || '',
  };
}

function ReadOnlyField({ label, value }) {
  return (
    <div className="gt-field gt-readonly">
      <span>{label}</span>
      <p>{value || '—'}</p>
    </div>
  );
}

export function MeuCadastro({ profile }) {
  const { refreshProfile } = useAuth();
  const profileId = profile?.id || null;
  const [row, setRow] = useState(null);
  const [form, setForm] = useState(() => toForm(null));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotice, setCepNotice] = useState('');

  useEffect(() => {
    if (!profileId) return undefined;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const data = await getMyProfile(profileId);
        if (cancelled) return;
        setRow(data);
        setForm(toForm(data));
        setLoadError('');
      } catch (err) {
        if (!cancelled) setLoadError(err.message || 'Não foi possível carregar o seu cadastro.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [profileId]);

  const isReception = row?.role === 'receptionist';
  const profession = getProfession(row?.profession);
  const saved = toForm(row);
  const dirty = Object.keys(form).some(key => form[key] !== saved[key]);

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setSuccess('');
  }

  async function handleCepBlur() {
    if (!form.enderecoCep || !isValidCepFormat(form.enderecoCep)) return;
    setCepLoading(true);
    setCepNotice('');
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
    if (!form.fullName.trim()) {
      setError('Informe o seu nome completo.');
      return;
    }
    setSaving(true);
    try {
      await updateMyProfile(form);
      const fresh = await getMyProfile(profileId);
      setRow(fresh);
      setForm(toForm(fresh));
      await refreshProfile();
      setSuccess('Cadastro atualizado. Os próximos relatórios já saem com os dados novos.');
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o seu cadastro.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="gt-note">Carregando o seu cadastro…</p>;
  if (loadError) return <div className="gt-notice gt-notice-error">{loadError}</div>;

  return (
    <form className="gt-profile" onSubmit={handleSubmit}>
      <p className="gt-note">
        Confira e corrija os seus dados. Nome e registro no conselho saem nos relatórios e
        documentos. Login, e-mail, tipo de acesso, profissão e instituição são definidos pela
        administração — se algo estiver errado nesses campos, peça a ela.
      </p>

      {(error || success) && (
        <div className={`gt-notice${error ? ' gt-notice-error' : ''}`} role="status">
          {error || success}
        </div>
      )}

      <div className="gt-custom-card">
        <header><h3>Acesso</h3><span>Só leitura</span></header>
        <div className="gt-profile-grid">
          <ReadOnlyField label="Login" value={row?.username} />
          <ReadOnlyField label="E-mail" value={row?.email} />
          <ReadOnlyField label="Tipo de acesso" value={ROLE_LABELS[row?.role] || row?.role} />
          {!isReception && <ReadOnlyField label="Profissão" value={profession.label} />}
          <ReadOnlyField label="Instituição" value={profile?.clinic?.name || profile?.clinic_name} />
        </div>
      </div>

      <div className="gt-custom-card">
        <header><h3>Seus dados</h3></header>
        <div className="gt-profile-grid">
          <label className="gt-field gt-profile-wide">
            Nome completo *
            <input
              className="gt-input"
              value={form.fullName}
              onChange={event => setField('fullName', event.target.value)}
              maxLength={160}
              required
            />
          </label>
          <label className="gt-field">
            Telefone
            <input
              className="gt-input"
              value={form.phone}
              onChange={event => setField('phone', event.target.value)}
              placeholder="(00) 00000-0000"
              maxLength={40}
            />
          </label>
          <label className="gt-field">
            Documento
            <input
              className="gt-input"
              value={form.document}
              onChange={event => setField('document', maskCpfCnpj(event.target.value))}
              placeholder="CPF/CNPJ"
              inputMode="numeric"
            />
          </label>
          {!isReception && (
            <label className="gt-field">
              {profession.registrationLabel}
              <input
                className="gt-input"
                value={form.professionalRegistration}
                onChange={event => setField('professionalRegistration', event.target.value)}
                placeholder={profession.registrationPlaceholder}
                maxLength={60}
              />
            </label>
          )}
          {!isReception && (
            <div className="gt-field gt-profile-wide">
              Especialidades
              <SpecialtyTags value={form.specialty} onChange={value => setField('specialty', value)} />
            </div>
          )}
        </div>
      </div>

      <div className="gt-custom-card">
        <header><h3>Endereço</h3></header>
        <div className="gt-profile-grid">
          <label className="gt-field">
            CEP
            <input
              className="gt-input"
              value={form.enderecoCep}
              onChange={event => setField('enderecoCep', formatCep(event.target.value))}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              inputMode="numeric"
            />
          </label>
          <label className="gt-field gt-profile-wide">
            Logradouro
            <input
              className="gt-input"
              value={form.enderecoLogradouro}
              onChange={event => setField('enderecoLogradouro', event.target.value)}
              maxLength={200}
            />
          </label>
          <label className="gt-field">
            Número
            <input
              className="gt-input"
              value={form.enderecoNumero}
              onChange={event => setField('enderecoNumero', event.target.value)}
              maxLength={20}
            />
          </label>
          <label className="gt-field">
            Complemento
            <input
              className="gt-input"
              value={form.enderecoComplemento}
              onChange={event => setField('enderecoComplemento', event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="gt-field">
            Bairro
            <input
              className="gt-input"
              value={form.enderecoBairro}
              onChange={event => setField('enderecoBairro', event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="gt-field">
            Cidade
            <input
              className="gt-input"
              value={form.enderecoCidade}
              onChange={event => setField('enderecoCidade', event.target.value)}
              maxLength={120}
            />
          </label>
          <label className="gt-field">
            UF
            <select className="gt-select" value={form.enderecoUf} onChange={event => setField('enderecoUf', event.target.value)}>
              <option value="">Selecione</option>
              {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>
        </div>
        {(cepLoading || cepNotice) && (
          <p className="gt-custom-help">{cepLoading ? 'Consultando CEP…' : cepNotice}</p>
        )}
      </div>

      <div className="gt-custom-actions">
        <button
          type="button"
          className="quiet-button"
          onClick={() => { setForm(saved); setError(''); setSuccess(''); }}
          disabled={!dirty || saving}
        >
          Desfazer
        </button>
        <button type="submit" className="primary-button" disabled={!dirty || saving}>
          {saving ? 'Salvando…' : 'Salvar cadastro'}
        </button>
      </div>
    </form>
  );
}
