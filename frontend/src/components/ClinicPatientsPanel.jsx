/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DISCIPLINES, getDiscipline } from '../data/disciplines';
import { shareScopeLabels } from '../data/shareScopes';
import { createPatient } from '../services/patientService';
import {
  enrollPatientInitial,
  enrollmentStatusLabel,
  listClinicPatients,
} from '../services/clinicPatientsService';
import { listActiveSharesForPatients, revokeRecordShare } from '../services/recordSharesService';
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
  const [form, setForm] = useState({ name: '', phone: '', age: '', discipline: 'acupuntura' });
  const [saving, setSaving] = useState(false);
  const [sharesByPatient, setSharesByPatient] = useState({});
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
  }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter(patient => (patient.name || '').toLowerCase().includes(term));
  }, [patients, query]);

  async function handleCreate(event) {
    event.preventDefault();
    if (!form.name.trim()) return;

    setSaving(true);
    setNotice(null);
    try {
      const patient = await createPatient({ name: form.name.trim(), phone: form.phone, age: form.age });
      const enrollment = await enrollPatientInitial(patient.id, form.discipline);
      setForm({ name: '', phone: '', age: '', discipline: 'acupuntura' });
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
    const toLabel = getDiscipline(share.to_discipline)?.label || share.to_discipline;
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
          <div className={`alert clinic-notice-${notice.type}`}>{notice.text}</div>
        )}

        <form className="box clinic-new-patient" onSubmit={handleCreate}>
          <b>Novo paciente</b>
          <div className="clinic-new-patient-grid">
            <label>
              Nome completo
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label>
              Telefone
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
              />
            </label>
            <label>
              Idade
              <input
                type="number"
                min="0"
                max="130"
                value={form.age}
                onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
              />
            </label>
            <label>
              Área inicial
              <select
                value={form.discipline}
                onChange={e => setForm(f => ({ ...f, discipline: e.target.value }))}
              >
                {DISCIPLINES.map(d => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </label>
            <button className="tag active" type="submit" disabled={saving}>
              {saving ? 'Cadastrando…' : 'Cadastrar paciente'}
            </button>
          </div>
        </form>

        <div className="clinic-list-head">
          <input
            className="clinic-search"
            placeholder="Buscar paciente pelo nome…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <span className="small">
            {loading ? 'Carregando…' : `${filtered.length} paciente${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {error && <div className="alert">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <p className="small">Nenhum paciente encontrado.</p>
        )}

        <div className="clinic-patient-list">
          {filtered.map(patient => {
            const shares = sharesByPatient[patient.id] || [];
            return (
              <div key={patient.id} className="clinic-patient-card">
                <div className="clinic-patient-info">
                  <b>{patient.name}</b>
                  <small>{formatAge(patient)}{patient.phone ? ` • ${patient.phone}` : ''}</small>
                </div>

                <div className="clinic-patient-chips">
                  {(patient.enrollments || []).length === 0 && (
                    <span className="enroll-chip enroll-chip-warn">sem matrícula</span>
                  )}
                  {(patient.enrollments || []).map(enrollment => (
                    <span
                      key={enrollment.id || enrollment.discipline}
                      className={`enroll-chip enroll-chip-${enrollment.status || 'active'}`}
                      title={`${getDiscipline(enrollment.discipline)?.label || enrollment.discipline}: ${enrollmentStatusLabel(enrollment.status)}`}
                    >
                      {getDiscipline(enrollment.discipline)?.label || enrollment.discipline}
                    </span>
                  ))}
                </div>

                {shares.length > 0 && (
                  <div className="clinic-patient-shares">
                    {shares.map(share => (
                      <span key={share.id} className="share-tag" title={shareScopeLabels(share.shared_scopes).join(', ')}>
                        {getDiscipline(share.from_discipline)?.label} → {getDiscipline(share.to_discipline)?.label}
                        <button
                          type="button"
                          className="share-revoke"
                          disabled={revokingId === share.id}
                          onClick={() => handleRevoke(patient, share)}
                          aria-label={`Revogar compartilhamento com ${getDiscipline(share.to_discipline)?.label}`}
                        >
                          {revokingId === share.id ? '…' : '×'}
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="clinic-patient-actions">
                  <button type="button" className="tag" onClick={() => setShareTarget(patient)}>
                    Enviar / compartilhar
                  </button>
                  {shares.length > 0 && (
                    <button
                      type="button"
                      className="tag"
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
