import { useState } from 'react';
import { DISCIPLINES } from '../data/disciplines';
import { createPatient, isMinor, isValidCpf, isValidEmail } from '../services/patientService';
import { buscarEnderecoPorCep, formatCep, isValidCepFormat } from '../services/cepService';
import { enrollPatientInitial } from '../services/clinicPatientsService';

// ============================================================
// Formulário "Novo paciente" (ficha da instituição), o mesmo em dois
// lugares: Pacientes da instituição e "Selecionar paciente" de cada área
// (16/10/2026, pedido da administradora: cadastrar sem sair da área).
// Cria o paciente e a matrícula inicial na área escolhida; quem usa
// decide o que fazer depois (`onCreated`).
// ============================================================

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const EMPTY_FORM = {
  name: '', nomeSocial: '', birthDate: '', sexoBiologico: '', genero: '', cpf: '',
  phone: '', email: '', nomeMae: '', nomePai: '', nomeConjuge: '',
  responsavelNome: '', responsavelTelefone: '', responsavelCpf: '',
  convenioNome: '', convenioCarteirinha: '',
  enderecoCep: '', enderecoLogradouro: '', enderecoNumero: '', enderecoComplemento: '', enderecoBairro: '', enderecoCidade: '', enderecoUf: '',
  discipline: 'acupuntura', imageConsent: false,
};

function CpBackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

// Um glifo por seção do formulário — mesma ideia visual do
// hub-card-icon, só que em miniatura, pra guiar o olho pelas 6
// seções sem precisar ler cada título por extenso.
const CP_SECTION_GLYPHS = {
  id: <><circle cx="12" cy="8" r="3.3" /><path d="M5 20.5a7 7 0 0 1 14 0" /></>,
  family: <><circle cx="8" cy="9" r="2.8" /><circle cx="16" cy="9" r="2.8" /><path d="M2.6 19.5a5.4 5.4 0 0 1 10.8 0M10.6 19.5a5.4 5.4 0 0 1 10.8 0" /></>,
  guardian: <><path d="M12 3.2 19 6v5.2c0 4.7-3 8.2-7 9.6-4-1.4-7-4.9-7-9.6V6Z" /><path d="m9 12.2 2 2 4.2-4.2" /></>,
  insurance: <><rect x="3" y="6" width="18" height="13" rx="2.2" /><path d="M3 10.2h18" /><path d="M6.8 15h4" /></>,
  address: <><path d="M12 21s7-6.4 7-11.6A7 7 0 0 0 5 9.4C5 14.6 12 21 12 21Z" /><circle cx="12" cy="9.4" r="2.3" /></>,
  care: <><rect x="3" y="5" width="18" height="16" rx="2.2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="m8.3 15.3 2 2 4.7-4.7" /></>,
};

function CpSectionIcon({ type }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {CP_SECTION_GLYPHS[type]}
    </svg>
  );
}

function CpFormSection({ icon, title, hint, children }) {
  return (
    <div className="cp-section">
      <div className="cp-section-head">
        <span className="cp-section-icon"><CpSectionIcon type={icon} /></span>
        <p className="cp-form-group-title">{title}</p>
        {hint}
      </div>
      {children}
    </div>
  );
}

export function NewPatientForm({ initialDiscipline = 'acupuntura', title = 'Novo paciente', onCancel, onCreated }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_FORM, discipline: initialDiscipline }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotice, setCepNotice] = useState(null);
  const responsavelRequired = isMinor(form.birthDate);

  function setField(field, value) {
    setForm(f => ({ ...f, [field]: value }));
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
      // Cidade com CEP único (Catu, Pojuca...) costuma devolver logradouro/
      // bairro vazios — preenche só o que veio, sem apagar o que a pessoa
      // já tinha digitado à mão.
      setForm(f => ({
        ...f,
        enderecoLogradouro: endereco.logradouro || f.enderecoLogradouro,
        enderecoBairro: endereco.bairro || f.enderecoBairro,
        enderecoCidade: endereco.localidade || f.enderecoCidade,
        enderecoUf: endereco.uf || f.enderecoUf,
      }));
    } catch (err) {
      setCepNotice(err.message || 'Não foi possível consultar o CEP agora.');
    } finally {
      setCepLoading(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!form.name.trim()) return;
    // CPF é opcional no cadastro — documento nem sempre está em mãos na
    // hora de marcar. Só recusa quando ALGO foi digitado e está errado;
    // silenciar um dígito errado seria pior do que não ter CPF nenhum.
    if (form.cpf.trim() && !isValidCpf(form.cpf)) {
      setError('CPF inválido. Confira os números digitados ou deixe o campo em branco.');
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      setError('E-mail inválido. Confira o endereço digitado ou deixe o campo em branco.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const patient = await createPatient({
        name: form.name.trim(),
        nomeSocial: form.nomeSocial.trim() || null,
        phone: form.phone,
        email: form.email.trim() || null,
        birthDate: form.birthDate || null,
        sexoBiologico: form.sexoBiologico || null,
        genero: form.genero.trim() || null,
        cpf: form.cpf,
        nomeMae: form.nomeMae.trim() || null,
        nomePai: form.nomePai.trim() || null,
        nomeConjuge: form.nomeConjuge.trim() || null,
        responsavelNome: form.responsavelNome.trim() || null,
        responsavelTelefone: form.responsavelTelefone.trim() || null,
        responsavelCpf: form.responsavelCpf.trim() || null,
        convenioNome: form.convenioNome.trim() || null,
        convenioCarteirinha: form.convenioCarteirinha.trim() || null,
        enderecoCep: form.enderecoCep || null,
        enderecoLogradouro: form.enderecoLogradouro.trim() || null,
        enderecoNumero: form.enderecoNumero.trim() || null,
        enderecoComplemento: form.enderecoComplemento.trim() || null,
        enderecoBairro: form.enderecoBairro.trim() || null,
        enderecoCidade: form.enderecoCidade.trim() || null,
        enderecoUf: form.enderecoUf || null,
        imageConsent: form.imageConsent,
      });
      const enrollment = await enrollPatientInitial(patient.id, form.discipline);
      setForm({ ...EMPTY_FORM, discipline: initialDiscipline });
      setCepNotice(null);
      await onCreated?.({ patient, enrollment, discipline: form.discipline });
    } catch (err) {
      setError(err.message || 'Não foi possível cadastrar o paciente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="cp-form" onSubmit={handleCreate}>
      <div className="cp-form-header">
        <button type="button" className="cp-icon-btn" onClick={onCancel} aria-label="Voltar">
          <CpBackIcon />
        </button>
        <div>
          <b className="cp-form-title">{title}</b>
          <p className="cp-form-subtitle">Ficha completa da instituição — campos com <span className="cp-required-mark">*</span> são obrigatórios.</p>
        </div>
      </div>

      <CpFormSection icon="id" title="Identificação">
        <div className="cp-form-grid">
          <label className="cp-field">
            Nome completo (civil) <span className="cp-required-mark">*</span>
            <input className="cp-input" value={form.name} onChange={e => setField('name', e.target.value)} required />
          </label>
          <label className="cp-field">
            Nome social
            <input className="cp-input" value={form.nomeSocial} onChange={e => setField('nomeSocial', e.target.value)} />
          </label>
          <label className="cp-field">
            Data de nascimento
            <input className="cp-input" type="date" value={form.birthDate} onChange={e => setField('birthDate', e.target.value)} />
          </label>
          <label className="cp-field">
            Sexo biológico
            <select className="cp-select" value={form.sexoBiologico} onChange={e => setField('sexoBiologico', e.target.value)}>
              <option value="">Selecione</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
            </select>
          </label>
          <label className="cp-field">
            Gênero
            <input className="cp-input" value={form.genero} onChange={e => setField('genero', e.target.value)} />
          </label>
          <label className="cp-field">
            CPF
            <input
              className="cp-input"
              value={form.cpf}
              onChange={e => setField('cpf', e.target.value)}
              placeholder="000.000.000-00"
              inputMode="numeric"
            />
          </label>
          <label className="cp-field">
            Telefone
            <input className="cp-input" value={form.phone} onChange={e => setField('phone', e.target.value)} />
          </label>
          <label className="cp-field">
            E-mail
            <input className="cp-input" type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="paciente@exemplo.com" />
          </label>
        </div>
      </CpFormSection>

      <CpFormSection icon="family" title="Filiação">
        <div className="cp-form-grid">
          <label className="cp-field">
            Mãe
            <input className="cp-input" value={form.nomeMae} onChange={e => setField('nomeMae', e.target.value)} />
          </label>
          <label className="cp-field">
            Pai
            <input className="cp-input" value={form.nomePai} onChange={e => setField('nomePai', e.target.value)} />
          </label>
          <label className="cp-field">
            Cônjuge
            <input className="cp-input" value={form.nomeConjuge} onChange={e => setField('nomeConjuge', e.target.value)} />
          </label>
        </div>
      </CpFormSection>

      <CpFormSection
        icon="guardian"
        title="Responsável"
        hint={responsavelRequired && <span className="cp-form-required-hint">obrigatório — paciente menor de idade</span>}
      >
        <div className="cp-form-grid">
          <label className="cp-field">
            Nome do responsável {responsavelRequired && <span className="cp-required-mark">*</span>}
            <input
              className="cp-input"
              value={form.responsavelNome}
              onChange={e => setField('responsavelNome', e.target.value)}
              required={responsavelRequired}
            />
          </label>
          <label className="cp-field">
            Telefone do responsável {responsavelRequired && <span className="cp-required-mark">*</span>}
            <input
              className="cp-input"
              value={form.responsavelTelefone}
              onChange={e => setField('responsavelTelefone', e.target.value)}
              required={responsavelRequired}
            />
          </label>
          <label className="cp-field">
            CPF do responsável {responsavelRequired && <span className="cp-required-mark">*</span>}
            <input
              className="cp-input"
              value={form.responsavelCpf}
              onChange={e => setField('responsavelCpf', e.target.value)}
              inputMode="numeric"
              required={responsavelRequired}
            />
          </label>
        </div>
      </CpFormSection>

      <CpFormSection icon="insurance" title="Convênio (se tiver)">
        <div className="cp-form-grid">
          <label className="cp-field">
            Nome do convênio
            <input className="cp-input" value={form.convenioNome} onChange={e => setField('convenioNome', e.target.value)} />
          </label>
          <label className="cp-field">
            Número da carteirinha
            <input className="cp-input" value={form.convenioCarteirinha} onChange={e => setField('convenioCarteirinha', e.target.value)} />
          </label>
        </div>
      </CpFormSection>

      <CpFormSection icon="address" title="Endereço">
        <div className="cp-form-grid">
          <label className="cp-field">
            CEP
            <input
              className="cp-input"
              value={form.enderecoCep}
              onChange={e => setField('enderecoCep', formatCep(e.target.value))}
              onBlur={handleCepBlur}
              placeholder="00000-000"
              inputMode="numeric"
            />
          </label>
          <label className="cp-field">
            Logradouro
            <input className="cp-input" value={form.enderecoLogradouro} onChange={e => setField('enderecoLogradouro', e.target.value)} />
          </label>
          <label className="cp-field">
            Número
            <input className="cp-input" value={form.enderecoNumero} onChange={e => setField('enderecoNumero', e.target.value)} />
          </label>
          <label className="cp-field">
            Complemento
            <input className="cp-input" value={form.enderecoComplemento} onChange={e => setField('enderecoComplemento', e.target.value)} />
          </label>
          <label className="cp-field">
            Bairro
            <input className="cp-input" value={form.enderecoBairro} onChange={e => setField('enderecoBairro', e.target.value)} />
          </label>
          <label className="cp-field">
            Cidade
            <input className="cp-input" value={form.enderecoCidade} onChange={e => setField('enderecoCidade', e.target.value)} />
          </label>
          <label className="cp-field">
            UF
            <select className="cp-select" value={form.enderecoUf} onChange={e => setField('enderecoUf', e.target.value)}>
              <option value="">Selecione</option>
              {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>
        </div>
        {cepLoading && <p className="cp-cep-hint">Consultando CEP…</p>}
        {cepNotice && <p className="cp-cep-hint">{cepNotice}</p>}
      </CpFormSection>

      <CpFormSection icon="care" title="Atendimento">
        <div className="cp-form-grid">
          <label className="cp-field">
            Área inicial
            <select className="cp-select" value={form.discipline} onChange={e => setField('discipline', e.target.value)}>
              {DISCIPLINES.map(d => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="cp-consent">
          <input
            type="checkbox"
            checked={form.imageConsent}
            onChange={e => setField('imageConsent', e.target.checked)}
          />
          <span>Autorizo o uso de imagem do paciente para fins clínicos/educacionais.</span>
        </label>
      </CpFormSection>

      {error && <div className="cp-notice cp-notice-error" role="alert">{error}</div>}

    <div className="cp-form-footer">
        <span className="cp-form-footer-hint">
          {responsavelRequired ? 'Paciente menor de idade — responsável obrigatório.' : 'Revise os dados antes de cadastrar.'}
        </span>
        <div className="cp-form-footer-actions">
          <button type="button" className="cp-btn" onClick={onCancel} disabled={saving}>Cancelar</button>
          <button className="cp-btn cp-btn--primary" type="submit" disabled={saving}>
            {saving ? 'Cadastrando…' : 'Cadastrar paciente'}
          </button>
        </div>
      </div>
    </form>
  );
}

export default NewPatientForm;
