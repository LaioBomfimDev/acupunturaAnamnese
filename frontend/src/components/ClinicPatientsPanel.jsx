/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePatient } from '../hooks/PatientContext';
import { getDiscipline } from '../data/disciplines';
import { shareScopeLabels } from '../data/shareScopes';
import { formatCpf } from '../services/patientService';
import {
  enrollmentStatusLabel,
  listClinicPatients,
  listPendingPatientDeletions,
  decidePatientDeletion,
} from '../services/clinicPatientsService';
import { listActiveSharesForPatients, revokeRecordShare } from '../services/recordSharesService';
import { listClinicMembers, shortName } from '../services/clinicMembersService';
import { DEFAULT_PATIENT_SORT, PATIENT_SORT_OPTIONS, formatAge, formatPatientCount, getInitials, sortPatients } from '../utils/patientUi';
import { SharePatientDialog } from './SharePatientDialog';
import { SharedSessionViewer } from './SharedSessionViewer';
import { ClinicPatientProfile } from './ClinicPatientProfile';
import { NewPatientForm } from './NewPatientForm';
import { HubBackButton } from './HubNav';
import { useDismiss } from '../hooks/useDismiss';
import { ScreenHelp } from './ui/ScreenHelp';
import { PACIENTES_HELP } from '../data/screenHelp';

// ============================================================
// Pacientes da instituição (Fases 2 e 3 — docs/plano-clinica-multidisciplinar.md)
// Cadastro central, FORA das anamneses: o paciente é UM, da instituição,
// e entra em cada área por MATRÍCULA (nunca cópia). O formulário de
// cadastro (NewPatientForm) também abre em "Selecionar paciente" de cada
// área (PatientStart.jsx, 16/10/2026): a mesma ficha, nunca uma cópia.
//
// "Enviar para outro profissional" (Fase 3): matrícula no destino +
// compartilhamento explícito com escopos escolhidos, confirmado por
// senha e revogável. Nada é copiado. Isso continua existindo só para os
// dados CLÍNICOS (anamnese/evolução/relatório) — o cadastro em si já é
// visível/editável por qualquer profissional ativo da clínica.
// ============================================================

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
  const [sortOrder, setSortOrder] = useState(DEFAULT_PATIENT_SORT);
  const [sharesByPatient, setSharesByPatient] = useState({});
  const [members, setMembers] = useState([]);
  const [shareTarget, setShareTarget] = useState(null);
  const [viewTarget, setViewTarget] = useState(null);
  const [profileTarget, setProfileTarget] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  // Fila de solicitações de exclusão (só administração da clínica vê e
  // decide — a solicitação em si qualquer profissional pode abrir, na
  // tela de seleção de paciente de cada disciplina).
  const [pendingDeletions, setPendingDeletions] = useState([]);
  const [deletionReview, setDeletionReview] = useState(null); // { requestId, patientName, reason } | null
  const [deletionConfirmText, setDeletionConfirmText] = useState('');
  const [deletionAckBackup, setDeletionAckBackup] = useState(false);
  const [decidingId, setDecidingId] = useState(null);

  const loadPendingDeletions = useCallback(async () => {
    if (!isClinicAdmin) return;
    try {
      setPendingDeletions(await listPendingPatientDeletions());
    } catch (err) {
      console.warn('Solicitações de exclusão não carregadas:', err?.message || err);
    }
  }, [isClinicAdmin]);

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
    loadPendingDeletions();
  }, [load, loadPendingDeletions]);

  function openDeletionReview(request) {
    setDeletionReview(request);
    setDeletionConfirmText('');
    setDeletionAckBackup(false);
  }

  function closeDeletionReview() {
    setDeletionReview(null);
    setDeletionConfirmText('');
    setDeletionAckBackup(false);
  }

  const deletionDismiss = useDismiss({
    open: Boolean(deletionReview),
    onClose: closeDeletionReview,
    busy: Boolean(decidingId),
  });

  async function handleRejectDeletion(request) {
    setDecidingId(request.request_id);
    setNotice(null);
    try {
      await decidePatientDeletion(request.request_id, 'rejected');
      setNotice({ type: 'success', text: `Exclusão de ${request.patient_name} rejeitada — paciente volta a aparecer normalmente.` });
      closeDeletionReview();
      await loadPendingDeletions();
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Não foi possível rejeitar a solicitação.' });
    } finally {
      setDecidingId(null);
    }
  }

  async function handleApproveDeletion(request) {
    setDecidingId(request.request_id);
    setNotice(null);
    try {
      await decidePatientDeletion(request.request_id, 'approved');
      setNotice({ type: 'success', text: `${request.patient_name} foi removido definitivamente (dados pessoais e prontuário apagados).` });
      closeDeletionReview();
      await loadPendingDeletions();
      await load();
    } catch (err) {
      setNotice({ type: 'error', text: err.message || 'Não foi possível concluir a exclusão.' });
    } finally {
      setDecidingId(null);
    }
  }

  const membersById = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);

  function shareTargetLabel(share) {
    const person = membersById.get(share.to_user_id);
    return person ? shortName(person.full_name) : getDiscipline(share.to_discipline)?.label;
  }

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    const found = term
      ? patients.filter(patient => (patient.name || '').toLowerCase().includes(term))
      : patients;
    return sortPatients(found, sortOrder);
  }, [patients, query, sortOrder]);

  // Só pra sinalizar no card "Ver lista" — cadastro sem matrícula fica
  // sem área nenhuma até alguém entrar e matricular pela ficha.
  const pendingEnrollCount = useMemo(
    () => patients.filter(patient => (patient.enrollments || []).length === 0).length,
    [patients],
  );

  async function handleCreated({ patient, enrollment, discipline }) {
    setNotice({
      type: enrollment ? 'success' : 'warn',
      text: enrollment
        ? `${patient.name} cadastrado e direcionado para ${getDiscipline(discipline)?.label}.`
        : `${patient.name} cadastrado, mas a matrícula inicial não foi criada — matricule pela lista abaixo.`,
    });
    await load();
    setMode('list');
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
      {/* --titled: o corpo já tem o título com o "Como funciona"; no
          celular o topo mostra só a instituição. */}
      <header className="hub-topbar hub-topbar--titled">
        <div className="hub-brand">
          <span className="hub-wordmark">Vitalis</span>
          <h1>{clinicName}</h1>
          <p>Pacientes da instituição</p>
        </div>
        <HubBackButton label="Voltar às áreas" onClick={onBack} />
      </header>

      <main className="hub-body clinic-patients">
        <p className="hub-greeting">Cadastro central</p>
        <div className="screen-title-row">
          <h2>Pacientes da instituição</h2>
          <ScreenHelp topic={PACIENTES_HELP} />
        </div>

        {notice && (
          <div className={`cp-notice cp-notice-${notice.type}`}>{notice.text}</div>
        )}

        {isClinicAdmin && pendingDeletions.length > 0 && (
          <div className="cp-notice cp-notice-warn cp-deletion-banner">
            <span>
              {pendingDeletions.length === 1
                ? '1 solicitação de exclusão de paciente aguardando decisão.'
                : `${pendingDeletions.length} solicitações de exclusão de paciente aguardando decisão.`}
            </span>
            <button type="button" className="cp-btn cp-btn--sm" onClick={() => openDeletionReview(pendingDeletions[0])}>
              Revisar
            </button>
          </div>
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
          <NewPatientForm onCancel={() => setMode(null)} onCreated={handleCreated} />
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
            <label className="cp-sort">
              <span>Ordenar por</span>
              <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                {PATIENT_SORT_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
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
                  {patient.suspended_at && (
                    <span className="cp-badge cp-badge-off" title="Suspenso — pausa reversível marcada na ficha do paciente">
                      inativo
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

      {deletionReview && (
        <div className="cp-modal-overlay" role="dialog" aria-modal="true" aria-label={`Excluir ${deletionReview.patient_name}`} {...deletionDismiss.backdropProps}>
          <div className="cp-modal-panel">
            <div className="cp-modal-head">
              <h3 className="cp-modal-title">
                Excluir {deletionReview.patient_name}?
                {pendingDeletions.length > 1 && <span className="small"> (1 de {pendingDeletions.length})</span>}
              </h3>
              <button type="button" className="cp-modal-close" onClick={closeDeletionReview} aria-label="Fechar">×</button>
            </div>
            <div className="cp-modal-body">
              <p className="cp-modal-intro">
                Motivo informado: <b>{deletionReview.reason}</b>
              </p>
              <p className="cp-deletion-warning">
                Aprovar apaga prontuário, evoluções, agenda e matrículas deste paciente e
                limpa todo dado pessoal do cadastro — não tem como desfazer pela tela. Um
                snapshot fica guardado no banco antes de apagar, mas isso não substitui um
                backup externo (o sistema ainda não tem um).
              </p>
              <label className="cps-field">
                Digite o nome do paciente pra confirmar
                <input
                  value={deletionConfirmText}
                  onChange={e => setDeletionConfirmText(e.target.value)}
                  placeholder={deletionReview.patient_name}
                  autoFocus
                />
              </label>
              <label className="cp-deletion-ack">
                <input
                  type="checkbox"
                  checked={deletionAckBackup}
                  onChange={e => setDeletionAckBackup(e.target.checked)}
                />
                Entendo que essa exclusão é definitiva e não existe backup externo.
              </label>
              <div className="cp-deletion-actions">
                <button
                  type="button"
                  className="cp-btn"
                  onClick={() => handleRejectDeletion(deletionReview)}
                  disabled={decidingId === deletionReview.request_id}
                >
                  Rejeitar solicitação
                </button>
                <button
                  type="button"
                  className="cp-btn cp-btn--danger"
                  onClick={() => handleApproveDeletion(deletionReview)}
                  disabled={
                    decidingId === deletionReview.request_id
                    || !deletionAckBackup
                    || deletionConfirmText.trim().toLowerCase() !== deletionReview.patient_name.trim().toLowerCase()
                  }
                >
                  {decidingId === deletionReview.request_id ? 'Excluindo…' : 'Aprovar e excluir definitivamente'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
