import { useCallback, useEffect, useState } from 'react';
import { accessStatus } from '../../utils/patientForms';
import {
  ensurePatientAccess,
  getPatientAccess,
  listAssignments,
  listPatientForms,
  regenerateAccessCode,
  setPatientAccessActive,
} from '../../services/patientPortalService';
import { PortalShareBox } from './PortalShareBox';
import { SendFormPanel } from './SendFormPanel';
import { AssignmentList } from './AssignmentList';
import { SendInstrumentForm } from '../instruments/SendInstrumentForm';
import { FormResponseDialog } from './FormResponseDialog';
import '../../styles/gestao.css';
import '../../styles/patientForms.css';

// ============================================================
// Ficha do paciente → aba "Área do Paciente" (só a administração).
// Acesso: código + data de nascimento do cadastro. Gerar novo código
// derruba o antigo na hora; desativar tira o paciente de dentro; 8 datas
// erradas bloqueiam e só a administração libera aqui.
// Embaixo, os formulários deste paciente: enviar, acompanhar, abrir.
// ============================================================

function dateTime(iso) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
}

export function PatientPortalTab({ patient, profile, onEditCadastro, onStatusChange }) {
  const clinicName = profile?.clinic?.name || profile?.clinic_name || '';
  const [access, setAccess] = useState(null);
  const [forms, setForms] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [viewing, setViewing] = useState(null);

  const loadAssignments = useCallback(async () => {
    setAssignments(await listAssignments({ patientId: patient.id }));
  }, [patient.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [nextAccess, nextForms, nextAssignments] = await Promise.all([
          getPatientAccess(patient.id),
          listPatientForms(),
          listAssignments({ patientId: patient.id }),
        ]);
        if (cancelled) return;
        setAccess(nextAccess);
        setForms(nextForms);
        setAssignments(nextAssignments);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patient.id]);

  async function run(kind, action, message) {
    setBusy(kind);
    setError('');
    setNotice('');
    try {
      const row = await action();
      setAccess(row);
      setNotice(message);
      return row;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy('');
    }
  }

  async function handleCreate() {
    const row = await run('create', () => ensurePatientAccess(patient.id), 'Acesso criado. Mande a mensagem abaixo ao paciente.');
    if (row) setShowShare(true);
  }

  async function handleRegenerate() {
    const row = await run(
      'regenerate',
      () => regenerateAccessCode(patient.id),
      'Código novo gerado. O antigo parou de funcionar: mande a mensagem nova ao paciente.',
    );
    setConfirmRegenerate(false);
    if (row) setShowShare(true);
  }

  // A aba da ficha diz o estado do acesso sem ser aberta ("Acesso: Ativo"):
  // avisa quando ele muda aqui (gerar, trocar, desativar, liberar).
  useEffect(() => {
    if (!loading && !error) onStatusChange?.(accessStatus(access));
  }, [access, loading, error, onStatusChange]);

  const status = accessStatus(access);
  const missingBirth = !patient.birth_date;

  if (loading) return <p className="gt-empty">Carregando…</p>;

  return (
    <div className="pq-access">
      {error && <div className="gt-notice gt-notice-error" role="alert">{error}</div>}
      {notice && <div className="gt-notice gt-notice-success" role="status">{notice}</div>}

      <section className="pf-card">
        <div className="pf-section-head">
          <h4>Acesso à Área do Paciente</h4>
          <span className={`gt-badge gt-badge-${status.tone}`}>{status.label}</span>
        </div>

        {missingBirth && (
          <div className="gt-notice" role="status">
            Sem data de nascimento no cadastro. É com ela que o paciente entra, então o acesso só pode ser criado depois
            de cadastrá-la.{' '}
            {onEditCadastro && (
              <button type="button" className="pq-link" onClick={onEditCadastro}>Editar cadastro</button>
            )}
          </div>
        )}

        {!access && !missingBirth && (
          <div className="pq-access">
            <p className="small">
              O paciente entra em <b>/area-do-paciente</b> com um código de acesso e a data de nascimento. Ele só vê os
              formulários que a clínica mandou, nunca o prontuário.
            </p>
            <div className="pq-actions">
              <button type="button" className="gt-btn gt-btn--primary" onClick={handleCreate} disabled={busy === 'create'}>
                {busy === 'create' ? 'Criando…' : 'Criar acesso'}
              </button>
            </div>
          </div>
        )}

        {access && (
          <div className="pq-access">
            <div className="pq-access-top">
              <span className="pq-code" aria-label={`Código de acesso ${access.access_code.split('').join(' ')}`}>{access.access_code}</span>
              <span className="small">
                {access.last_access_at ? `Último acesso em ${dateTime(access.last_access_at)}` : 'Ainda não entrou'}
                {access.failed_attempts > 0 && !access.locked_at
                  ? ` · ${access.failed_attempts} ${access.failed_attempts === 1 ? 'tentativa errada' : 'tentativas erradas'} seguidas`
                  : ''}
              </span>
            </div>

            {status.id === 'locked' && (
              <div className="gt-notice" role="status">
                Bloqueado em {dateTime(access.locked_at)} depois de 8 datas de nascimento erradas seguidas. Se foi o
                próprio paciente errando, libere; se não reconhece as tentativas, gere um código novo.
              </div>
            )}

            <div className="pq-actions">
              <button type="button" className="gt-btn gt-btn--sm" onClick={() => setShowShare(current => !current)}>
                {showShare ? 'Esconder mensagem' : 'Mandar acesso ao paciente'}
              </button>
              {status.id === 'active' && (
                <button
                  type="button"
                  className="gt-btn gt-btn--sm"
                  onClick={() => run('active', () => setPatientAccessActive(patient.id, false), 'Acesso desativado: o paciente não entra mais até ser reativado.')}
                  disabled={Boolean(busy)}
                >
                  {busy === 'active' ? 'Desativando…' : 'Desativar'}
                </button>
              )}
              {status.id !== 'active' && (
                <button
                  type="button"
                  className="gt-btn gt-btn--sm"
                  onClick={() => run('active', () => setPatientAccessActive(patient.id, true), status.id === 'locked' ? 'Acesso liberado.' : 'Acesso reativado.')}
                  disabled={Boolean(busy)}
                >
                  {busy === 'active' ? 'Salvando…' : status.id === 'locked' ? 'Liberar' : 'Reativar'}
                </button>
              )}
              {!confirmRegenerate && (
                <button type="button" className="gt-btn gt-btn--sm" onClick={() => setConfirmRegenerate(true)} disabled={Boolean(busy)}>
                  Gerar novo código
                </button>
              )}
            </div>

            {confirmRegenerate && (
              <div className="pq-inline-confirm" role="alertdialog" aria-label="Gerar novo código">
                <p>
                  O código <b>{access.access_code}</b> para de funcionar na hora e quem estiver dentro sai. Use quando a
                  mensagem foi para a pessoa errada ou o paciente perdeu o código.
                </p>
                <div className="pq-actions">
                  <button type="button" className="gt-btn gt-btn--sm gt-btn--primary" onClick={handleRegenerate} disabled={busy === 'regenerate'}>
                    {busy === 'regenerate' ? 'Gerando…' : 'Gerar novo código'}
                  </button>
                  <button type="button" className="gt-btn gt-btn--sm" onClick={() => setConfirmRegenerate(false)}>
                    Manter o atual
                  </button>
                </div>
              </div>
            )}

            {showShare && (
              <PortalShareBox patient={patient} clinicName={clinicName} accessCode={access.access_code} />
            )}
          </div>
        )}
      </section>

      <section className="pf-card">
        <div className="pf-section-head">
          <h4>Formulários</h4>
        </div>
        {!missingBirth && (
          <SendFormPanel
            forms={forms}
            patient={patient}
            clinicName={clinicName}
            onSent={async () => {
              await loadAssignments();
              setAccess(await getPatientAccess(patient.id));
            }}
          />
        )}
        <AssignmentList
          assignments={assignments}
          onView={setViewing}
          onChanged={loadAssignments}
          emptyLabel="Nenhum formulário enviado para este paciente."
        />
      </section>

      {/* Escalas da clínica para responder em casa (etapa 2 das escalas).
          O envio entra na lista de envios acima. */}
      {!missingBirth && (
        <section className="pf-card">
          <div className="pf-section-head">
            <h4>Escalas</h4>
          </div>
          <SendInstrumentForm
            patient={patient}
            onSent={async () => {
              await loadAssignments();
              setAccess(await getPatientAccess(patient.id));
            }}
          />
        </section>
      )}

      {viewing && (
        <FormResponseDialog
          assignment={viewing}
          patient={patient}
          profile={profile}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}

export default PatientPortalTab;
