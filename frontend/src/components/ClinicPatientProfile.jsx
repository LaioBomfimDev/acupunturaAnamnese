/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { DISCIPLINES, getDiscipline } from '../data/disciplines';
import {
  getPatient, updatePatient, formatCpf, isValidCpf, isMinor,
} from '../services/patientService';
import { formatAge, formatBirthDate } from '../utils/patientUi';
import { listAppointments, listAppointmentsAwaitingEvolution } from '../services/appointmentService';
import { listPatientEvolutions } from '../services/patientEvolutionService';
import { listActiveSharesForPatients } from '../services/recordSharesService';
import { listClinicMembers, shortName } from '../services/clinicMembersService';
import { enrollmentStatusLabel } from '../services/clinicPatientsService';
import {
  listPatientAttachments, uploadPatientAttachment, getPatientAttachmentUrl, deletePatientAttachment,
} from '../services/patientAttachmentsService';
import { buscarEnderecoPorCep, formatCep, isValidCepFormat } from '../services/cepService';
import { PrintFooter, PrintLetterhead } from './report/reportPrint';
import { paginateReportBody } from './report/reportPagination';
import { buildReportAccentPalette, buildReportContactItems } from '../utils/reportUtils';
import { PatientEvolutionTimeline } from './PatientEvolutionTimeline';

// ============================================================
// Ficha do paciente (Fase 5) — página própria, aberta ao clicar num
// paciente na aba "Pacientes da instituição". Leitura de cadastro,
// matrículas, compartilhamentos, agendamentos e evolução; edição do
// cadastro (aberta a qualquer profissional da clínica, mesma regra da
// listagem); upload de anexos restrito a clinic_admin/super_admin —
// ação administrativa, feita fora do atendimento.
//
// Navegação por abas (2026-09-11): a tela empilhava seis seções com
// scroll longo. Cada aba agora mostra só a sua parte. "Matrículas"
// lista TODAS as disciplinas da clínica, não só as ativas — o objetivo
// é deixar claro pra qualquer um quem enxerga este paciente e quem não
// enxerga, não só quem já está matriculado. "Evolução" deixou de listar
// os registros ali dentro: agora é um resumo + atalho pra
// PatientEvolutionTimeline, que mostra o texto integral (é isso que
// serve de prova pra fiscalização) com opção de corrigir/imprimir.
// ============================================================

function Field({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return <p className="shv-field"><b>{label}:</b> {value}</p>;
}

function statusLabel(status) {
  return { scheduled: 'agendado', attended: 'atendido', no_show: 'faltou', excused: 'falta justificada', cancelled: 'cancelado' }[status] || status;
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatFileSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
];

const TABS = [
  { id: 'cadastro', label: 'Cadastro' },
  { id: 'matriculas', label: 'Matrículas & compartilhamento' },
  { id: 'agenda', label: 'Agendamentos' },
  { id: 'evolucao', label: 'Evolução' },
  { id: 'anexos', label: 'Anexos' },
];

function buildEditForm(p) {
  return {
    name: p?.name || '', nomeSocial: p?.nome_social || '', birthDate: p?.birth_date || '',
    sexoBiologico: p?.sexo_biologico || '', genero: p?.genero || '', cpf: p?.cpf || '',
    phone: p?.phone || '', nomeMae: p?.nome_mae || '', nomePai: p?.nome_pai || '', nomeConjuge: p?.nome_conjuge || '',
    responsavelNome: p?.responsavel_nome || '', responsavelTelefone: p?.responsavel_telefone || '', responsavelCpf: p?.responsavel_cpf || '',
    convenioNome: p?.convenio_nome || '', convenioCarteirinha: p?.convenio_carteirinha || '',
    enderecoCep: p?.endereco_cep || '', enderecoLogradouro: p?.endereco_logradouro || '', enderecoNumero: p?.endereco_numero || '',
    enderecoComplemento: p?.endereco_complemento || '', enderecoBairro: p?.endereco_bairro || '', enderecoCidade: p?.endereco_cidade || '', enderecoUf: p?.endereco_uf || '',
  };
}

// Estatística da aba Evolução mostra só dia/mês (cabe no tile); o
// cabeçalho impresso usa shortDate(), com o ano — são usos diferentes.
function shortMonthDay(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function shortDate() {
  return new Date().toLocaleDateString('pt-BR');
}

const DEFAULT_ACCENT = '#0E2A4A';

function PrintRow({ label, value }) {
  if (value === undefined || value === null || value === '') return null;
  return <p style={{ margin: '8px 0', lineHeight: 1.6, fontSize: 15 }}><b>{label}:</b> {value}</p>;
}

export function ClinicPatientProfile({ patient, therapistProfile, isClinicAdmin = false, onBack, onPatientUpdated }) {
  const [full, setFull] = useState(patient);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [evolutions, setEvolutions] = useState([]);
  const [pendingEvolutions, setPendingEvolutions] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [shares, setShares] = useState([]);
  const [members, setMembers] = useState([]);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [printDoc, setPrintDoc] = useState({ pages: [''], bodyHeightPx: null });
  const [activeTab, setActiveTab] = useState('cadastro');
  const [showTimeline, setShowTimeline] = useState(false);
  const printSourceRef = useRef(null);
  const printMeasureRef = useRef(null);
  const printHeaderMeasureRef = useRef(null);
  const printFooterMeasureRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getPatient(patient.id),
      listAppointments({ patientId: patient.id }).catch(() => []),
      listPatientEvolutions(patient.id).catch(() => []),
      listAppointmentsAwaitingEvolution({ patientId: patient.id }).catch(() => []),
      listPatientAttachments(patient.id).catch(() => []),
      listActiveSharesForPatients([patient.id]).catch(() => ({})),
      listClinicMembers().catch(() => []),
    ]).then(([p, appts, evos, awaiting, files, sharesByPatient, memberList]) => {
      if (cancelled) return;
      setFull(p);
      setAppointments(appts);
      setEvolutions(evos);
      setPendingEvolutions(awaiting);
      setAttachments(files);
      setShares(sharesByPatient?.[patient.id] || []);
      setMembers(memberList);
    }).catch(err => { if (!cancelled) setError(err.message || 'Não foi possível carregar a ficha.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patient.id]);

  function shareLabel(share) {
    const person = members.find(m => m.id === share.to_user_id);
    return person ? shortName(person.full_name) : getDiscipline(share.to_discipline)?.label;
  }

  function startEdit() {
    setEditForm(buildEditForm(full));
    setNotice(null);
    setEditing(true);
  }

  function setEditField(field, value) {
    setEditForm(f => ({ ...f, [field]: value }));
  }

  async function handleEditCepBlur() {
    if (!editForm.enderecoCep || !isValidCepFormat(editForm.enderecoCep)) return;
    try {
      const endereco = await buscarEnderecoPorCep(editForm.enderecoCep);
      if (!endereco) return;
      setEditForm(f => ({
        ...f,
        enderecoLogradouro: endereco.logradouro || f.enderecoLogradouro,
        enderecoBairro: endereco.bairro || f.enderecoBairro,
        enderecoCidade: endereco.localidade || f.enderecoCidade,
        enderecoUf: endereco.uf || f.enderecoUf,
      }));
    } catch {
      // CEP é só sugestão — falha na consulta não deve travar a edição.
    }
  }

  async function handleSaveEdit(event) {
    event.preventDefault();
    if (!editForm.name.trim()) return;
    if (!isValidCpf(editForm.cpf)) {
      setNotice({ type: 'error', text: 'Informe um CPF válido.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const updated = await updatePatient(full.id, {
        name: editForm.name.trim(),
        nomeSocial: editForm.nomeSocial.trim() || null,
        birthDate: editForm.birthDate || null,
        sexoBiologico: editForm.sexoBiologico || null,
        genero: editForm.genero.trim() || null,
        cpf: editForm.cpf,
        phone: editForm.phone.trim() || null,
        nomeMae: editForm.nomeMae.trim() || null,
        nomePai: editForm.nomePai.trim() || null,
        nomeConjuge: editForm.nomeConjuge.trim() || null,
        responsavelNome: editForm.responsavelNome.trim() || null,
        responsavelTelefone: editForm.responsavelTelefone.trim() || null,
        responsavelCpf: editForm.responsavelCpf.trim() || null,
        convenioNome: editForm.convenioNome.trim() || null,
        convenioCarteirinha: editForm.convenioCarteirinha.trim() || null,
        enderecoCep: editForm.enderecoCep || null,
        enderecoLogradouro: editForm.enderecoLogradouro.trim() || null,
        enderecoNumero: editForm.enderecoNumero.trim() || null,
        enderecoComplemento: editForm.enderecoComplemento.trim() || null,
        enderecoBairro: editForm.enderecoBairro.trim() || null,
        enderecoCidade: editForm.enderecoCidade.trim() || null,
        enderecoUf: editForm.enderecoUf || null,
      });
      setFull(updated);
      setEditing(false);
      onPatientUpdated?.(updated);
      setNotice({ type: 'success', text: 'Cadastro atualizado.' });
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Não foi possível salvar o cadastro.' });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setUploading(true);
    setNotice(null);
    try {
      await uploadPatientAttachment({ patientId: full.id, clinicId: full.clinic_id, file });
      setAttachments(await listPatientAttachments(full.id));
      setNotice({ type: 'success', text: `${file.name} anexado.` });
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Não foi possível enviar o arquivo.' });
    } finally {
      setUploading(false);
    }
  }

  async function handleOpenAttachment(attachment) {
    const url = await getPatientAttachmentUrl(attachment.file_path);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    else setNotice({ type: 'error', text: 'Não foi possível abrir o anexo agora.' });
  }

  async function handleDeleteAttachment(attachment) {
    if (!window.confirm(`Remover o anexo "${attachment.file_name}"?`)) return;
    try {
      await deletePatientAttachment(attachment);
      setAttachments(prev => prev.filter(a => a.id !== attachment.id));
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Não foi possível remover o anexo.' });
    }
  }

  if (showTimeline) {
    return (
      <PatientEvolutionTimeline
        patient={full}
        therapistProfile={therapistProfile}
        onBack={() => setShowTimeline(false)}
      />
    );
  }

  const enderecoLinha = [full?.endereco_logradouro, full?.endereco_numero].filter(Boolean).join(', ')
    || null;
  const enderecoComplementoLinha = [full?.endereco_bairro, full?.endereco_cidade, full?.endereco_uf].filter(Boolean).join(' — ')
    || null;

  // Cadastro impresso no papel timbrado da clínica logada — mesma infra
  // de impressão dos relatórios (reportPrint + reportPagination), então
  // cada clínica sai com a própria logo/cor/contato, nunca uma marca
  // genérica do sistema.
  const terapeuta = therapistProfile?.full_name || 'Profissional';
  const clinic = therapistProfile?.clinic || null;
  const clinicName = clinic?.name || therapistProfile?.clinic_name || 'Reability';
  const clinicLogo = clinic?.logo_url || '';
  const clinicMonogram = clinicName.trim().charAt(0).toUpperCase() || 'R';
  const accentPalette = buildReportAccentPalette(clinic?.brand_color || DEFAULT_ACCENT, DEFAULT_ACCENT);
  const clinicDetails = [
    clinic?.legal_name,
    clinic?.cnpj ? `CNPJ ${clinic.cnpj}` : null,
  ].filter(Boolean).join(' • ');
  const contactItems = buildReportContactItems({ clinic, therapistProfile });
  const watermarkEnabled = Boolean(clinicLogo) && clinic?.logo_watermark !== false;
  const accentStyle = {
    '--clinic-accent': accentPalette.accent,
    '--clinic-accent-shade': accentPalette.shade,
    '--clinic-accent-soft': accentPalette.soft,
  };

  const patientMinor = isMinor(full?.birth_date);
  const hasFiliacao = Boolean(full?.nome_mae || full?.nome_pai || full?.nome_conjuge);
  const hasConvenio = Boolean(full?.convenio_nome || full?.convenio_carteirinha);
  const hasEndereco = Boolean(enderecoLinha || full?.endereco_complemento || enderecoComplementoLinha || full?.endereco_cep);
  const enrollments = patient.enrollments || [];
  const enrollmentByDiscipline = new Map(enrollments.map(e => [e.discipline, e]));

  const lastEvolutionAt = evolutions.reduce((latest, evo) => {
    const at = evo.atendimento_em ? new Date(evo.atendimento_em) : null;
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  const cycleRemaining = evolutions.length >= 10 ? 0 : 10 - evolutions.length;
  const hasPending = pendingEvolutions.length > 0;

  function handlePrintCadastro() {
    const html = printSourceRef.current?.innerHTML || '';
    const doc = paginateReportBody(html, {
      stage: printMeasureRef.current,
      header: printHeaderMeasureRef.current,
      footer: printFooterMeasureRef.current,
    });
    flushSync(() => setPrintDoc(doc));
    window.print();
  }

  // Corpo impresso: as mesmas "perguntas" (rótulos) do cadastro em tela,
  // já respondidas — só entra pergunta com resposta preenchida.
  const printBody = (
    <>
      <h2 style={{ margin: '0 0 4px', textTransform: 'uppercase', color: 'var(--navy)' }}>Ficha cadastral do paciente</h2>
      <p style={{ textAlign: 'center', margin: '0 0 20px', color: '#64748b', fontSize: 13 }}>{clinicName}</p>

      <h3 style={{ margin: '18px 0 4px', color: 'var(--navy)', fontSize: 16 }}>Identificação</h3>
      <PrintRow label="Nome completo (civil)" value={full?.name} />
      <PrintRow label="Nome social" value={full?.nome_social} />
      <PrintRow label="Data de nascimento" value={formatBirthDate(full?.birth_date)} />
      <PrintRow label="Idade" value={formatAge(full)} />
      <PrintRow label="Sexo biológico" value={full?.sexo_biologico === 'masculino' ? 'Masculino' : full?.sexo_biologico === 'feminino' ? 'Feminino' : null} />
      <PrintRow label="Gênero" value={full?.genero} />
      <PrintRow label="CPF" value={full?.cpf ? formatCpf(full.cpf) : null} />
      <PrintRow label="Telefone" value={full?.phone} />

      {hasFiliacao && (
        <>
          <h3 style={{ margin: '18px 0 4px', color: 'var(--navy)', fontSize: 16 }}>Filiação</h3>
          <PrintRow label="Mãe" value={full?.nome_mae} />
          <PrintRow label="Pai" value={full?.nome_pai} />
          <PrintRow label="Cônjuge" value={full?.nome_conjuge} />
        </>
      )}

      {patientMinor && (
        <>
          <h3 style={{ margin: '18px 0 4px', color: 'var(--navy)', fontSize: 16 }}>Responsável</h3>
          <PrintRow label="Nome do responsável" value={full?.responsavel_nome} />
          <PrintRow label="Telefone do responsável" value={full?.responsavel_telefone} />
          <PrintRow label="CPF do responsável" value={full?.responsavel_cpf ? formatCpf(full.responsavel_cpf) : null} />
        </>
      )}

      {hasConvenio && (
        <>
          <h3 style={{ margin: '18px 0 4px', color: 'var(--navy)', fontSize: 16 }}>Convênio</h3>
          <PrintRow label="Nome do convênio" value={full?.convenio_nome} />
          <PrintRow label="Carteirinha" value={full?.convenio_carteirinha} />
        </>
      )}

      {hasEndereco && (
        <>
          <h3 style={{ margin: '18px 0 4px', color: 'var(--navy)', fontSize: 16 }}>Endereço</h3>
          <PrintRow label="Endereço" value={enderecoLinha} />
          <PrintRow label="Complemento/bairro/cidade" value={[full?.endereco_complemento, enderecoComplementoLinha].filter(Boolean).join(' — ')} />
          <PrintRow label="CEP" value={full?.endereco_cep ? formatCep(full.endereco_cep) : null} />
        </>
      )}

      {enrollments.length > 0 && (
        <>
          <h3 style={{ margin: '18px 0 4px', color: 'var(--navy)', fontSize: 16 }}>Matrículas</h3>
          <PrintRow
            label="Áreas de atendimento"
            value={enrollments.map(e => `${getDiscipline(e.discipline)?.label || e.discipline} (${enrollmentStatusLabel(e.status)})`).join(', ')}
          />
        </>
      )}
    </>
  );

  return (
    <div className="hub-screen">
      <header className="hub-topbar no-print">
        <div className="hub-brand">
          <h1>{full?.name || patient.name}</h1>
          <p>Ficha do paciente</p>
        </div>
        <button type="button" className="topbar-button" onClick={onBack}>← Voltar à lista</button>
      </header>

      <main className="hub-body clinic-patients no-print">
        {notice && <div className={`cp-notice cp-notice-${notice.type}`}>{notice.text}</div>}
        {error && <div className="cp-notice cp-notice-error">{error}</div>}
        {loading && <p className="small">Carregando ficha…</p>}

        {!loading && !error && (
          <>
            <div className="pf-tabs" role="tablist">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  className="pf-tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id)}
                >
                  {tab.label}
                  {tab.id === 'matriculas' && <span className="pf-tab-count">{enrollments.length}</span>}
                  {tab.id === 'agenda' && <span className="pf-tab-count">{appointments.length}</span>}
                  {tab.id === 'evolucao' && <span className="pf-tab-count">{evolutions.length}</span>}
                  {tab.id === 'anexos' && <span className="pf-tab-count">{attachments.length}</span>}
                  {tab.id === 'evolucao' && hasPending && <span className="pf-pulse-dot" title="Há evolução pendente" />}
                </button>
              ))}
            </div>

            {/* ================= CADASTRO ================= */}
            <section className="pf-panel" hidden={activeTab !== 'cadastro'}>
              <div className="shv-sections">
                <section className="shv-section">
                  <div className="pf-section-head">
                    <h4>Dados cadastrais</h4>
                    {!editing && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button type="button" className="cp-btn cp-btn--sm" onClick={handlePrintCadastro}>🖨 Imprimir cadastro</button>
                        <button type="button" className="cp-btn cp-btn--sm" onClick={startEdit}>Editar</button>
                      </div>
                    )}
                  </div>

                  {!editing ? (
                    <>
                      <Field label="Nome completo (civil)" value={full?.name} />
                      <Field label="Nome social" value={full?.nome_social} />
                      <Field label="Data de nascimento" value={formatBirthDate(full?.birth_date)} />
                      <Field label="Idade" value={formatAge(full)} />
                      <Field label="Sexo biológico" value={full?.sexo_biologico === 'masculino' ? 'Masculino' : full?.sexo_biologico === 'feminino' ? 'Feminino' : null} />
                      <Field label="Gênero" value={full?.genero} />
                      <Field label="CPF" value={full?.cpf ? formatCpf(full.cpf) : null} />
                      <Field label="Telefone" value={full?.phone} />
                      <Field label="Mãe" value={full?.nome_mae} />
                      <Field label="Pai" value={full?.nome_pai} />
                      <Field label="Cônjuge" value={full?.nome_conjuge} />
                      {isMinor(full?.birth_date) && (
                        <>
                          <Field label="Responsável" value={full?.responsavel_nome} />
                          <Field label="Telefone do responsável" value={full?.responsavel_telefone} />
                          <Field label="CPF do responsável" value={full?.responsavel_cpf ? formatCpf(full.responsavel_cpf) : null} />
                        </>
                      )}
                      <Field label="Convênio" value={full?.convenio_nome} />
                      <Field label="Carteirinha" value={full?.convenio_carteirinha} />
                      <Field label="Endereço" value={enderecoLinha} />
                      <Field label="Complemento/bairro/cidade" value={[full?.endereco_complemento, enderecoComplementoLinha].filter(Boolean).join(' — ')} />
                      <Field label="CEP" value={full?.endereco_cep ? formatCep(full.endereco_cep) : null} />
                    </>
                  ) : (
                    <form className="cp-form" onSubmit={handleSaveEdit} style={{ boxShadow: 'none', border: 'none', padding: 0 }}>
                      <div className="cp-form-grid">
                        <label className="cp-field">Nome completo (civil)
                          <input className="cp-input" value={editForm.name} onChange={e => setEditField('name', e.target.value)} required />
                        </label>
                        <label className="cp-field">Nome social
                          <input className="cp-input" value={editForm.nomeSocial} onChange={e => setEditField('nomeSocial', e.target.value)} />
                        </label>
                        <label className="cp-field">Data de nascimento
                          <input className="cp-input" type="date" value={editForm.birthDate} onChange={e => setEditField('birthDate', e.target.value)} />
                        </label>
                        <label className="cp-field">Sexo biológico
                          <select className="cp-select" value={editForm.sexoBiologico} onChange={e => setEditField('sexoBiologico', e.target.value)}>
                            <option value="">Selecione</option>
                            <option value="masculino">Masculino</option>
                            <option value="feminino">Feminino</option>
                          </select>
                        </label>
                        <label className="cp-field">Gênero
                          <input className="cp-input" value={editForm.genero} onChange={e => setEditField('genero', e.target.value)} />
                        </label>
                        <label className="cp-field">CPF
                          <input className="cp-input" value={editForm.cpf} onChange={e => setEditField('cpf', e.target.value)} inputMode="numeric" required />
                        </label>
                        <label className="cp-field">Telefone
                          <input className="cp-input" value={editForm.phone} onChange={e => setEditField('phone', e.target.value)} />
                        </label>
                        <label className="cp-field">Mãe
                          <input className="cp-input" value={editForm.nomeMae} onChange={e => setEditField('nomeMae', e.target.value)} />
                        </label>
                        <label className="cp-field">Pai
                          <input className="cp-input" value={editForm.nomePai} onChange={e => setEditField('nomePai', e.target.value)} />
                        </label>
                        <label className="cp-field">Cônjuge
                          <input className="cp-input" value={editForm.nomeConjuge} onChange={e => setEditField('nomeConjuge', e.target.value)} />
                        </label>
                      </div>

                      <p className="cp-form-group-title">
                        Responsável {isMinor(editForm.birthDate) && <span className="cp-form-required-hint">(obrigatório — paciente menor de idade)</span>}
                      </p>
                      <div className="cp-form-grid">
                        <label className="cp-field">Nome do responsável
                          <input className="cp-input" value={editForm.responsavelNome} onChange={e => setEditField('responsavelNome', e.target.value)} required={isMinor(editForm.birthDate)} />
                        </label>
                        <label className="cp-field">Telefone do responsável
                          <input className="cp-input" value={editForm.responsavelTelefone} onChange={e => setEditField('responsavelTelefone', e.target.value)} required={isMinor(editForm.birthDate)} />
                        </label>
                        <label className="cp-field">CPF do responsável
                          <input className="cp-input" value={editForm.responsavelCpf} onChange={e => setEditField('responsavelCpf', e.target.value)} inputMode="numeric" required={isMinor(editForm.birthDate)} />
                        </label>
                      </div>

                      <p className="cp-form-group-title">Convênio</p>
                      <div className="cp-form-grid">
                        <label className="cp-field">Nome do convênio
                          <input className="cp-input" value={editForm.convenioNome} onChange={e => setEditField('convenioNome', e.target.value)} />
                        </label>
                        <label className="cp-field">Número da carteirinha
                          <input className="cp-input" value={editForm.convenioCarteirinha} onChange={e => setEditField('convenioCarteirinha', e.target.value)} />
                        </label>
                      </div>

                      <p className="cp-form-group-title">Endereço</p>
                      <div className="cp-form-grid">
                        <label className="cp-field">CEP
                          <input
                            className="cp-input"
                            value={editForm.enderecoCep}
                            onChange={e => setEditField('enderecoCep', formatCep(e.target.value))}
                            onBlur={handleEditCepBlur}
                            placeholder="00000-000"
                            inputMode="numeric"
                          />
                        </label>
                        <label className="cp-field">Logradouro
                          <input className="cp-input" value={editForm.enderecoLogradouro} onChange={e => setEditField('enderecoLogradouro', e.target.value)} />
                        </label>
                        <label className="cp-field">Número
                          <input className="cp-input" value={editForm.enderecoNumero} onChange={e => setEditField('enderecoNumero', e.target.value)} />
                        </label>
                        <label className="cp-field">Complemento
                          <input className="cp-input" value={editForm.enderecoComplemento} onChange={e => setEditField('enderecoComplemento', e.target.value)} />
                        </label>
                        <label className="cp-field">Bairro
                          <input className="cp-input" value={editForm.enderecoBairro} onChange={e => setEditField('enderecoBairro', e.target.value)} />
                        </label>
                        <label className="cp-field">Cidade
                          <input className="cp-input" value={editForm.enderecoCidade} onChange={e => setEditField('enderecoCidade', e.target.value)} />
                        </label>
                        <label className="cp-field">UF
                          <select className="cp-select" value={editForm.enderecoUf} onChange={e => setEditField('enderecoUf', e.target.value)}>
                            <option value="">Selecione</option>
                            {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                          </select>
                        </label>
                      </div>

                      <div className="cps-actions">
                        <button type="button" className="cp-btn" onClick={() => setEditing(false)} disabled={saving}>Cancelar</button>
                        <button type="submit" className="cp-btn cp-btn--primary" disabled={saving}>{saving ? 'Salvando…' : 'Salvar cadastro'}</button>
                      </div>
                    </form>
                  )}
                </section>
              </div>
            </section>

            {/* ================= MATRÍCULAS & COMPARTILHAMENTO ================= */}
            <section className="pf-panel" hidden={activeTab !== 'matriculas'}>
              <div className="shv-sections">
                <section className="shv-section">
                  <h4>Quem enxerga este paciente</h4>
                  <p className="small" style={{ marginTop: -4, marginBottom: 12 }}>
                    Todas as disciplinas da clínica — não só as matriculadas — para o entendimento ficar completo.
                  </p>
                  <div className="pf-discipline-list">
                    {DISCIPLINES.map(discipline => {
                      const enrollment = enrollmentByDiscipline.get(discipline.id);
                      return (
                        <div key={discipline.id} className={`pf-discipline-row${enrollment ? ' is-active' : ''}`}>
                          <span className="pf-discipline-check">{enrollment ? '✓' : ''}</span>
                          <span className="pf-discipline-dot" style={{ background: discipline.color }} />
                          <span className="pf-discipline-name">{discipline.label}</span>
                          <span className="pf-discipline-sub">
                            {enrollment
                              ? `Matriculado em ${new Date(enrollment.created_at).toLocaleDateString('pt-BR')}`
                              : 'Sem matrícula — não é atendido nesta área'}
                          </span>
                          <span className={`cp-badge${enrollment ? (enrollment.status === 'active' ? '' : ` cp-badge-${enrollment.status}`) : ' cp-badge-off'}`}>
                            {enrollment ? enrollmentStatusLabel(enrollment.status) : 'Não matriculado'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="shv-section">
                  <h4>Compartilhamentos ativos</h4>
                  {shares.length === 0 && <p className="small">Nenhum compartilhamento clínico ativo com outro profissional.</p>}
                  <div className="cp-card-chips">
                    {shares.map(share => (
                      <span key={share.id} className="cp-share-chip">
                        {getDiscipline(share.from_discipline)?.label} → {shareLabel(share)}
                      </span>
                    ))}
                  </div>
                </section>
              </div>
            </section>

            {/* ================= AGENDAMENTOS ================= */}
            <section className="pf-panel" hidden={activeTab !== 'agenda'}>
              <div className="shv-sections">
                <section className="shv-section">
                  <h4>Agendamentos</h4>
                  {appointments.length === 0 && <p className="small">Nenhum agendamento registrado.</p>}
                  {appointments.length > 0 && (
                    <ul className="shv-evolucao-list">
                      {appointments.map(appt => (
                        <li key={appt.id}>
                          <b>{formatDateTime(appt.starts_at)}</b> — {getDiscipline(appt.discipline)?.label || appt.discipline || 'bloqueio'} — {statusLabel(appt.status)}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </section>

            {/* ================= EVOLUÇÃO ================= */}
            <section className="pf-panel" hidden={activeTab !== 'evolucao'}>
              <div className="shv-sections">
                <section className="shv-section">
                  {hasPending && (
                    <div className="cp-notice cp-notice-error" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="pf-pulse-dot" />
                      <span>
                        {pendingEvolutions.length === 1 ? '1 atendimento aguardando evolução' : `${pendingEvolutions.length} atendimentos aguardando evolução`}
                        {' — '}
                        {getDiscipline(pendingEvolutions[0].discipline)?.label || pendingEvolutions[0].discipline}, {formatDateTime(pendingEvolutions[0].starts_at)}
                        {pendingEvolutions.length > 1 ? ' e outros.' : '.'}
                      </span>
                    </div>
                  )}

                  <div className="pf-evo-summary">
                    <div className="pf-evo-stat"><b>{evolutions.length}</b><span>{evolutions.length === 1 ? 'sessão registrada' : 'sessões registradas'}</span></div>
                    <div className="pf-evo-stat"><b>{lastEvolutionAt ? shortMonthDay(lastEvolutionAt) : '—'}</b><span>Última sessão</span></div>
                    <div className="pf-evo-stat"><b>{cycleRemaining}</b><span>Faltam p/ reavaliação de ciclo</span></div>
                  </div>

                  <div className="pf-evo-cta">
                    <div>
                      <h3>Ver evolução completa</h3>
                      <p>Abre o registro integral do que a profissional escreveu em cada sessão deste paciente — o texto que serve de prova pra fiscalização. Dá pra corrigir, imprimir ou baixar em PDF.</p>
                    </div>
                    <button type="button" className="cp-btn" onClick={() => setShowTimeline(true)}>Ver evolução →</button>
                  </div>

                  <p className="pf-cycle-note">Reavaliação de ciclo sugerida a cada 10 sessões (língua, pulso, hipótese energética e protocolo).</p>
                </section>
              </div>
            </section>

            {/* ================= ANEXOS ================= */}
            <section className="pf-panel" hidden={activeTab !== 'anexos'}>
              <div className="shv-sections">
                <section className="shv-section">
                  <div className="pf-section-head">
                    <h4>Anexos</h4>
                    {isClinicAdmin && (
                      <label className="cp-btn cp-btn--sm pf-upload-btn">
                        {uploading ? 'Enviando…' : 'Enviar arquivo'}
                        <input type="file" accept=".pdf,image/jpeg,image/png,image/webp" onChange={handleUpload} disabled={uploading} hidden />
                      </label>
                    )}
                  </div>
                  {attachments.length === 0 && <p className="small">Nenhum anexo enviado ainda.</p>}
                  {attachments.length > 0 && (
                    <ul className="shv-evolucao-list">
                      {attachments.map(att => (
                        <li key={att.id}>
                          <button type="button" className="pf-attachment-link" onClick={() => handleOpenAttachment(att)}>
                            {att.file_name}
                          </button>
                          <span className="small"> — {formatFileSize(att.size_bytes)} — {formatDateTime(att.created_at)}</span>
                          {isClinicAdmin && (
                            <button type="button" className="pf-attachment-remove" onClick={() => handleDeleteAttachment(att)} aria-label={`Remover ${att.file_name}`}>×</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Folhas de impressão do cadastro: papel timbrado da clínica logada,
          mesma infra de paginação dos relatórios (ver reportPagination.js).
          Fica fora da tela (.report-print-pages) até o momento de imprimir. */}
      <div className="report-print-pages" style={accentStyle} aria-hidden="true">
        <div className="rpage-measure-stage">
          <div ref={printHeaderMeasureRef}>
            <PrintLetterhead
              clinicLogo={clinicLogo}
              clinicMonogram={clinicMonogram}
              clinicName={clinicName}
              clinicDetails={clinicDetails}
              dateLabel={shortDate()}
              sessaoLabel="Ficha cadastral"
              terapeuta={terapeuta}
            />
          </div>
          <div ref={printFooterMeasureRef}>
            <PrintFooter items={contactItems} clinicName={clinicName} />
          </div>
          <div ref={printMeasureRef} className="rpage-body" />
        </div>

        {/* Fonte do corpo — só existe pra fornecer o innerHTML já escapado
            pelo React antes da paginação; nunca aparece sozinha. */}
        <div ref={printSourceRef}>{printBody}</div>

        {printDoc.pages.map((html, index) => (
          <section className="rpage" key={index}>
            {watermarkEnabled && (
              <div className="rpage-watermark" aria-hidden="true">
                <img src={clinicLogo} alt="" />
              </div>
            )}
            <PrintLetterhead
              clinicLogo={clinicLogo}
              clinicMonogram={clinicMonogram}
              clinicName={clinicName}
              clinicDetails={clinicDetails}
              dateLabel={shortDate()}
              sessaoLabel="Ficha cadastral"
              terapeuta={terapeuta}
            />
            <div
              className="rpage-body"
              style={printDoc.bodyHeightPx ? { height: printDoc.bodyHeightPx } : undefined}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            <div className="rpage-footer">
              <PrintFooter items={contactItems} clinicName={clinicName} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
