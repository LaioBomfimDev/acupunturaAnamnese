/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DISCIPLINES, getDiscipline } from '../data/disciplines';
import { shareScopeLabels } from '../data/shareScopes';
import { createPatient, formatCpf, isValidCpf } from '../services/patientService';
import {
  enrollPatientInitial,
  enrollmentStatusLabel,
  listClinicPatients,
} from '../services/clinicPatientsService';
import { listActiveSharesForPatients, revokeRecordShare } from '../services/recordSharesService';
import { listClinicMembers, shortName } from '../services/clinicMembersService';
import { SharePatientDialog } from './SharePatientDialog';
import { SharedSessionViewer } from './SharedSessionViewer';

// ============================================================
// Pacientes da instituição (Fases 2 e 3 — docs/plano-clinica-multidisciplinar.md)
// Cadastro central, FORA das anamneses: o paciente é UM, da instituição,
// e entra em cada área por MATRÍCULA (nunca cópia).
//
// "Enviar para outro profissional" (Fase 3): matrícula no destino +
// compartilhamento explícito com escopos escolhidos, confirmado por
// senha e revogável. Nada é copiado.
// ============================================================

function formatAge(patient) {
  if (patient?.age !== undefined && patient?.age !== null && patient?.age !== '') {
    return `${patient.age} anos`;
  }
  return 'Idade não informada';
}

export function ClinicPatientsPanel({ profile, onBack }) {
  const clinicName = profile?.clinic?.name || profile?.clinic_name || 'Clínica';
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', age: '', cpf: '', discipline: 'acupuntura', imageConsent: false });
  const [saving, setSaving] = useState(false);
  const [sharesByPatient, setSharesByPatient] = useState({});
  const [members, setMembers] = useState([]);
  const [shareTarget, setShareTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

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
  }, []);

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
        phone: form.phone,
        age: form.age,
        cpf: form.cpf,
        imageConsent: form.imageConsent,
      });
      const enrollment = await enrollPatientInitial(patient.id, form.discipline);
      setForm({ name: '', phone: '', age: '', cpf: '', discipline: 'acupuntura', imageConsent: false });
      setNotice({
        type: enrollment ? 'success' : 'warn',
        text: enrollment
          ? `${patient.name} cadastrado e direcionado para ${getDiscipline(form.discipline)?.label}.`
          : `${patient.name} cadastrado, mas a matrícula inicial não foi criada — matricule pela lista abaixo.`,
      });
      await load();
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

  return (
    <div className="hub-screen">
      <header className="hub-topbar">
        <div className="hub-brand">
          <h1>{clinicName}</h1>
          <p>Pacientes da instituição</p>
        </div>
        <button type="button" className="topbar-button" onClick={onBack}>← Voltar às áreas</button>
      </header>

      <main className="hub-body clinic-patients">
        <h2>Pacientes da instituição</h2>
        <p className="hub-note">
          Cadastro central: o paciente é um só e entra em cada área por matrícula. Enviar para outro
          profissional compartilha só o que você escolher, com confirmação de senha, e pode ser revogado.
        </p>

        {notice && (
          <div className={`cp-notice cp-notice-${notice.type}`}>{notice.text}</div>
        )}

        <form className="cp-form" onSubmit={handleCreate}>
          <b className="cp-form-title">Novo paciente</b>
          <div className="cp-form-grid">
            <label className="cp-field">
              Nome completo
              <input
                className="cp-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="cp-field">
              CPF
              <input
                className="cp-input"
                value={form.cpf}
                onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
                placeholder="000.000.000-00"
                inputMode="numeric"
                required
              />
            </label>
            <label className="cp-field">
              Telefone
              <input
                className="cp-input"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label className="cp-field">
              Idade
              <input
                className="cp-input"
                type="number"
                min="0"
                max="130"
                value={form.age}
                onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
              />
            </label>
            <label className="cp-field">
              Área inicial
              <select
                className="cp-select"
                value={form.discipline}
                onChange={e => setForm(f => ({ ...f, discipline: e.target.value }))}
              >
                {DISCIPLINES.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
            <label className="cp-consent">
              <input
                type="checkbox"
                checked={form.imageConsent}
                onChange={e => setForm(f => ({ ...f, imageConsent: e.target.checked }))}
              />
              <span>Autorizo o uso de imagem do paciente para fins clínicos/educacionais.</span>
            </label>
            <button className="cp-btn cp-btn--primary" type="submit" disabled={saving}>
              {saving ? 'Cadastrando…' : 'Cadastrar paciente'}
            </button>
          </div>
        </form>

        <div className="cp-toolbar">
          <input
            className="cp-search"
            placeholder="Buscar paciente pelo nome…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <span className="cp-count">
            {loading ? 'Carregando…' : `${filtered.length} paciente${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {error && <div className="cp-notice cp-notice-error">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <p className="cp-empty">Nenhum paciente encontrado.</p>
        )}

        <div className="cp-list">
          {filtered.map(patient => {
            const shares = sharesByPatient[patient.id] || [];
            return (
              <div key={patient.id} className="cp-card">
                <div className="cp-card-info">
                  <span className="cp-card-name">{patient.name}</span>
                  <span className="cp-card-meta">
                    {formatAge(patient)}
                    {patient.phone ? ` • ${patient.phone}` : ''}
                    {patient.cpf ? ` • CPF ${formatCpf(patient.cpf)}` : ''}
                  </span>
                </div>

                <div className="cp-card-chips">
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
