/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { DISCIPLINES, getDiscipline } from '../data/disciplines';
import { shareScopeLabels } from '../data/shareScopes';
import {
  createPatient, formatCpf, isValidCpf, isMinor,
} from '../services/patientService';
import { buscarEnderecoPorCep, formatCep, isValidCepFormat } from '../services/cepService';
import {
  enrollPatientInitial,
  enrollmentStatusLabel,
  listClinicPatients,
} from '../services/clinicPatientsService';
import { listActiveSharesForPatients, revokeRecordShare } from '../services/recordSharesService';
import { listClinicMembers, shortName } from '../services/clinicMembersService';
import { formatAge, formatPatientCount, getInitials } from '../utils/patientUi';
import { SharePatientDialog } from './SharePatientDialog';
import { SharedSessionViewer } from './SharedSessionViewer';
import { ClinicPatientProfile } from './ClinicPatientProfile';

// ============================================================
// Pacientes da instituição (Fases 2 e 3 — docs/plano-clinica-multidisciplinar.md)
// Cadastro central, FORA das anamneses: o paciente é UM, da instituição,
// e entra em cada área por MATRÍCULA (nunca cópia). A partir de 2026-09-10
// é também o ÚNICO lugar onde um paciente é criado — os workspaces por
// disciplina só selecionam paciente já cadastrado (PatientStart.jsx).
//
// "Enviar para outro profissional" (Fase 3): matrícula no destino +
// compartilhamento explícito com escopos escolhidos, confirmado por
// senha e revogável. Nada é copiado. Isso continua existindo só para os
// dados CLÍNICOS (anamnese/evolução/relatório) — o cadastro em si já é
// visível/editável por qualquer profissional ativo da clínica.
// ============================================================

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const EMPTY_FORM = {
  name: '', nomeSocial: '', birthDate: '', sexoBiologico: '', genero: '', cpf: '',
  phone: '', nomeMae: '', nomePai: '', nomeConjuge: '',
  responsavelNome: '', responsavelTelefone: '', responsavelCpf: '',
  convenioNome: '', convenioCarteirinha: '',
  enderecoCep: '', enderecoLogradouro: '', enderecoNumero: '', enderecoComplemento: '', enderecoBairro: '', enderecoCidade: '', enderecoUf: '',
  discipline: 'acupuntura', imageConsent: false,
};

function CpPersonAddIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M17 8v6M14 11h6" />
    </svg>
  );
}

function CpPeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 9.5a3 3 0 1 0 0-6" />
      <path d="M15 14.5c2.8.4 4.8 1.9 5.5 4" />
    </svg>
  );
}

function CpBackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function CpSearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4-4" />
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

export function ClinicPatientsPanel({ profile, onBack, isClinicAdmin = false }) {
  // refreshPatients recarrega a lista que PatientStart.jsx usa dentro de
  // cada disciplina — sem isso, um paciente criado aqui só aparecia lá
  // depois de deslogar/logar de novo (o contexto carrega uma vez só).
  const { refreshPatients } = usePatient();
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  // Cadastro e lista viviam empilhados numa página só, separados por
  // scroll — o formulário inteiro (7 grupos de campos) sempre aparecia
  // primeiro, mesmo pra quem só queria abrir a ficha de alguém já
  // cadastrado. Agora é uma escolha explícita (redesenho 2026-09-11).
  const [mode, setMode] = useState(null); // null (escolha) | 'create' | 'list'
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [cepNotice, setCepNotice] = useState(null);
  const [sharesByPatient, setSharesByPatient] = useState({});
  const [members, setMembers] = useState([]);
  const [shareTarget, setShareTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null);
  const [revokingId, setRevokingId] = useState(null);
  const responsavelRequired = isMinor(form.birthDate);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listClinicPatients();
      setPatients(list);
      try {
        setSharesByPatient(await listActiveSharesForPatients(list.map(p => p.id)));
      } catch (shareErr) {
        // Compartilhamentos são complementares — a lista de pacientes não
        // pode quebrar se a migração da Fase 3 ainda não foi aplicada.
        console.warn('Compartilhamentos não carregados:', shareErr?.message || shareErr);
        setSharesByPatient({});
      }
    } catch (err) {
      setError(err.message || 'Não foi possível carregar os pacientes da instituição.');
    } finally {
      setLoading(false);
    }
    refreshPatients?.();
  }, [refreshPatients]);

  useEffect(() => {
    load();
    // Nomes da equipe são só para rotular "→ Ana Paula" nos chips de
    // compartilhamento — se a busca falhar, os chips caem para o nome
    // da disciplina (mesmo comportamento de antes desta tela existir).
    listClinicMembers().then(setMembers).catch(() => setMembers([]));
  }, [load]);

  const membersById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  function shareTargetLabel(share) {
    const person = membersById.get(share.to_user_id);
    return person ? shortName(person.full_name) : getDiscipline(share.to_discipline)?.label;
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter(patient => (patient.name || '').toLowerCase().includes(term));
  }, [patients, query]);

  // Só pra sinalizar no card "Ver lista" — cadastro sem matrícula fica
  // sem área nenhuma até alguém entrar e matricular pela ficha.
  const pendingEnrollCount = useMemo(
    () => patients.filter(patient => (patient.enrollments || []).length === 0).length,
    [patients],
  );

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
    if (!isValidCpf(form.cpf)) {
      setNotice({ type: 'error', text: 'Informe um CPF válido para cadastrar o paciente da instituição.' });
      return;
    }

    setSaving(true);
    setNotice(null);
    try {
      const patient = await createPatient({
        name: form.name.trim(),
        nomeSocial: form.nomeSocial.trim() || null,
        phone: form.phone,
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
      setForm(EMPTY_FORM);
      setCepNotice(null);
      setNotice({
        type: enrollment ? 'success' : 'warn',
        text: enrollment
          ? `${patient.name} cadastrado e direcionado para ${getDiscipline(form.discipline)?.label}.`
          : `${patient.name} cadastrado, mas a matrícula inicial não foi criada — matricule pela lista abaixo.`,
      });
      await load();
      setMode('list');
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Não foi possível cadastrar o paciente.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleShareDone(patient, { toLabel } = {}) {
    setShareTarget(null);
    setNotice({ type: 'success', text: `${patient.name} enviado para ${toLabel}.` });
    await load();
  }

  async function handleRevoke(patient, share) {
    const toLabel = shareTargetLabel(share) || share.to_discipline;
    if (!window.confirm(`Revogar o compartilhamento de ${patient.name} com ${toLabel}?`)) return;

    setRevokingId(share.id);
    setNotice(null);
    try {
      await revokeRecordShare(share.id);
      setNotice({ type: 'success', text: `Compartilhamento com ${toLabel} revogado.` });
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Não foi possível revogar.' });
    } finally {
      setRevokingId(null);
    }
  }

  if (profileTarget) {
    return (
      <ClinicPatientProfile
        patient={profileTarget}
        therapistProfile={profile}
        isClinicAdmin={isClinicAdmin}
        onBack={() => setProfileTarget(null)}
        onPatientUpdated={async updated => {
          // patientService.updatePatient() não devolve .enrollments (é um
          // campo só de listClinicPatients) — sem isso a ficha "esquecia"
          // a matrícula do paciente logo depois de salvar o cadastro.
          setProfileTarget(prev => ({ ...updated, enrollments: prev?.enrollments || [] }));
          const list = await listClinicPatients();
          setPatients(list);
          const refreshed = list.find(p => p.id === updated.id);
          if (refreshed) setProfileTarget(refreshed);
        }}
      />
    );
  }

  return (
    <div className="hub-screen">
      <header className="hub-topbar">
        <div className="hub-brand">
          <span className="hub-wordmark">Vitalis</span>
          <h1>{clinicName}</h1>
          <p>Pacientes da instituição</p>
        </div>
        <button type="button" className="topbar-button" onClick={onBack}>← Voltar às áreas</button>
      </header>

      <main className="hub-body clinic-patients">
        <p className="hub-greeting">Cadastro central</p>
        <h2>Pacientes da instituição</h2>
        <p className="hub-note">
          O paciente é um só e entra em cada área por matrícula. Enviar para outro profissional
          compartilha só o que você escolher, com confirmação de senha, e pode ser revogado.
        </p>

        {notice && (
          <div className={`cp-notice cp-notice-${notice.type}`}>{notice.text}</div>
        )}

        {mode === null && (
          <div className="hub-grid cp-choice-grid">
            <button type="button" className="hub-card hub-card-enabled cp-choice-card" onClick={() => setMode('create')}>
              <span className="cp-choice-icon"><CpPersonAddIcon /></span>
              <span className="cp-choice-label">Novo na instituição</span>
              <b className="cp-choice-title">Cadastrar paciente</b>
              <span className="hub-card-desc">
                Ficha completa: identificação, filiação, responsável, convênio, endereço e matrícula inicial.
              </span>
              <span className="cp-choice-cta">Cadastrar<CpBackIcon /></span>
            </button>

            <button type="button" className="hub-card hub-card-enabled cp-choice-card" onClick={() => setMode('list')}>
              {!loading && pendingEnrollCount > 0 && (
                <span className="hub-card-badge cp-choice-badge">{pendingEnrollCount} sem matrícula</span>
              )}
              <span className="cp-choice-icon"><CpPeopleIcon /></span>
              <span className="cp-choice-label">{loading ? 'Carregando…' : formatPatientCount(patients.length)}</span>
              <b className="cp-choice-title">Ver pacientes cadastrados</b>
              <span className="hub-card-desc">
                Buscar pelo nome, abrir a ficha, compartilhar com outro profissional ou solicitar exclusão.
              </span>
              <span className="cp-choice-cta">Ver lista<CpBackIcon /></span>
            </button>
          </div>
        )}

        {mode === 'create' && (
        <form className="cp-form" onSubmit={handleCreate}>
          <div className="cp-form-header">
            <button type="button" className="cp-icon-btn" onClick={() => setMode(null)} aria-label="Voltar">
              <CpBackIcon />
            </button>
            <div>
              <b className="cp-form-title">Novo paciente</b>
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
                CPF <span className="cp-required-mark">*</span>
                <input
                  className="cp-input"
                  value={form.cpf}
                  onChange={e => setField('cpf', e.target.value)}
                  placeholder="000.000.000-00"
                  inputMode="numeric"
                  required
                />
              </label>
              <label className="cp-field">
                Telefone
                <input className="cp-input" value={form.phone} onChange={e => setField('phone', e.target.value)} />
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

          <div className="cp-form-footer">
            <span className="cp-form-footer-hint">
              {responsavelRequired ? 'Paciente menor de idade — responsável obrigatório.' : 'Revise os dados antes de cadastrar.'}
            </span>
            <div className="cp-form-footer-actions">
              <button type="button" className="cp-btn" onClick={() => setMode(null)} disabled={saving}>Cancelar</button>
              <button className="cp-btn cp-btn--primary" type="submit" disabled={saving}>
                {saving ? 'Cadastrando…' : 'Cadastrar paciente'}
              </button>
            </div>
          </div>
        </form>
        )}

        {mode === 'list' && (
        <div className="cp-list-mode">
          <div className="cp-toolbar">
            <button type="button" className="cp-icon-btn" onClick={() => setMode(null)} aria-label="Voltar">
              <CpBackIcon />
            </button>
            <div className="cp-search-wrap">
              <CpSearchIcon />
              <input
                className="cp-search"
                placeholder="Buscar paciente pelo nome…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
            </div>
            <span className="cp-count">
              {loading ? 'Carregando…' : formatPatientCount(filtered.length)}
            </span>
            <button type="button" className="cp-btn cp-btn--sm cp-btn--primary" onClick={() => setMode('create')}>
              + Novo paciente
            </button>
          </div>

          {error && <div className="cp-notice cp-notice-error">{error}</div>}

          {!loading && !error && filtered.length === 0 && (
            <div className="cp-empty">
              <span className="cp-empty-icon"><CpPeopleIcon /></span>
              <p>{query ? 'Nenhum paciente encontrado para esta busca.' : 'Nenhum paciente cadastrado ainda.'}</p>
            </div>
          )}

          <div className="cp-list">
          {filtered.map(patient => {
            const shares = sharesByPatient[patient.id] || [];
            return (
              <div key={patient.id} className="cp-card">
                <button
                  type="button"
                  className="cp-card-info cp-card-info--link"
                  onClick={() => setProfileTarget(patient)}
                  aria-label={`Abrir ficha de ${patient.name}`}
                >
                  <span className="cp-avatar" aria-hidden="true">{getInitials(patient.name)}</span>
                  <span className="cp-card-info-text">
                    <span className="cp-card-name">{patient.name}</span>
                    <span className="cp-card-meta">
                      {formatAge(patient)}
                      {patient.phone ? ` • ${patient.phone}` : ''}
                      {patient.cpf ? ` • CPF ${formatCpf(patient.cpf)}` : ''}
                    </span>
                  </span>
                </button>

                <div className="cp-card-chips">
                  {patient.has_pending && (
                    <span className="cp-badge cp-badge-pending" title="Marcado manualmente na ficha do paciente">
                      pendência
                    </span>
                  )}
                  {(patient.enrollments || []).length === 0 && (
                    <span className="cp-badge cp-badge-warn">sem matrícula</span>
                  )}
                  {(patient.enrollments || []).map(enrollment => (
                    <span
                      key={enrollment.id || enrollment.discipline}
                      className={`cp-badge cp-badge-${enrollment.status || 'active'}`}
                      title={`${getDiscipline(enrollment.discipline)?.label || enrollment.discipline}: ${enrollmentStatusLabel(enrollment.status)}`}
                    >
                      {getDiscipline(enrollment.discipline)?.label || enrollment.discipline}
                    </span>
                  ))}
                </div>

                {shares.length > 0 && (
                  <div className="cp-card-shares">
                    {shares.map(share => (
                      <span key={share.id} className="cp-share-chip" title={shareScopeLabels(share.shared_scopes).join(', ')}>
                        {getDiscipline(share.from_discipline)?.label} → {shareTargetLabel(share)}
                        <button
                          type="button"
                          className="cp-share-remove"
                          disabled={revokingId === share.id}
                          onClick={() => handleRevoke(patient, share)}
                          aria-label={`Revogar compartilhamento com ${shareTargetLabel(share)}`}
                        >
                          {revokingId === share.id ? '…' : '×'}
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="cp-card-actions">
                  <button type="button" className="cp-btn cp-btn--sm" onClick={() => setShareTarget(patient)}>
                    Enviar / compartilhar
                  </button>
                  {shares.length > 0 && (
                    <button
                      type="button"
                      className="cp-btn cp-btn--sm"
                      onClick={() => setViewTarget({
                        patient,
                        scopes: [...new Set(shares.flatMap(s => s.shared_scopes || []))],
                        fromDiscipline: shares[0].from_discipline,
                      })}
                    >
                      Ver compartilhado
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          </div>
        </div>
        )}
      </main>

      {shareTarget && (
        <SharePatientDialog
          patient={shareTarget}
          onClose={() => setShareTarget(null)}
          onDone={result => handleShareDone(shareTarget, result)}
        />
      )}

      {viewTarget && (
        <SharedSessionViewer
          patient={viewTarget.patient}
          scopes={viewTarget.scopes}
          fromDiscipline={viewTarget.fromDiscipline}
          onClose={() => setViewTarget(null)}
        />
      )}
    </div>
  );
}
