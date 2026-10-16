import { useState } from 'react';
import { PortalShareBox } from '../patientForms/PortalShareBox';
import { FormResponseDialog } from '../patientForms/FormResponseDialog';
import { getPatientAccess } from '../../services/patientPortalService';
import { cancelHomeAnamnese, sendHomeAnamnese } from '../../services/homeAnamneseService';
import {
  answeredHomeRequests,
  emptyFieldsWithHomeAnswer,
  formatHomeDate,
  homeAnswersByField,
  homeInformantOf,
  homeRequestStatusLabel,
  openHomeRequest,
  pendingHomeAnswers,
} from '../../utils/homeAnamnese';
// A mensagem pronta com o código (PortalShareBox) e a janela das respostas
// usam os estilos da Gestão e da Área do Paciente, como nas escalas.
import '../../styles/gestao.css';
import '../../styles/patientForms.css';
import '../../styles/homeAnamnese.css';

// ============================================================
// "Responder em casa" (16/10/2026), no topo da Anamnese infantil e da
// Anamnese adulto: envia as perguntas desta anamnese para a Área do
// Paciente, mostra se está esperando ou sendo respondida, cancela e, depois
// que o paciente envia, abre as respostas (com papel timbrado) e traz
// para a ficha só o que a profissional mandar trazer. Cada campo também
// mostra a resposta de casa junto dele (PsychologyAnamnese).
// ============================================================

function todayInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

/** Envio → formato de envio que a janela de respostas da Área do Paciente lê. */
function asAssignment(request) {
  return {
    id: request.id,
    form_title: request.title,
    form_questions: request.questions,
    created_at: request.sentAt,
    submitted_at: request.submittedAt,
    due_date: request.dueDate,
    status: request.status,
  };
}

export function HomeAnamneseBox({
  definition,
  patient,
  requests,
  loadError = '',
  session,
  canImport,
  importHint = '',
  profile,
  clinicName,
  onImport,
  onChanged,
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sentCode, setSentCode] = useState(null);
  const [codeNote, setCodeNote] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [viewing, setViewing] = useState(null);

  const pending = openHomeRequest(requests);
  const answered = answeredHomeRequests(requests);
  const latest = answered[0] || null;
  const informant = homeInformantOf(latest);
  const answeredCount = latest ? Object.keys(homeAnswersByField(latest)).length : 0;
  const waiting = canImport && latest ? Object.keys(pendingHomeAnswers(session, latest)).length : 0;
  const emptyFields = canImport && latest ? emptyFieldsWithHomeAnswer(session, latest) : [];

  async function handleSend() {
    setBusy('send');
    setError('');
    setNotice('');
    try {
      await sendHomeAnamnese({ patientId: patient.id, anamneseId: definition.id, dueDate: dueDate || null });
      // O código só volta para quem pode vê-lo (a regra está no banco).
      const access = await getPatientAccess(patient.id).catch(() => null);
      setSentCode(access?.is_active ? access.access_code : null);
      setCodeNote(!access
        ? 'O código de acesso deste paciente fica com a administração. Peça que ela mande a mensagem com o código, se o paciente ainda não tiver.'
        : access.is_active ? '' : 'O acesso deste paciente à Área do Paciente está desativado. Peça à administração para liberar.');
      setOpen(false);
      setDueDate('');
      setNotice(`${definition.name} enviada para a Área do Paciente.`);
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleCancel() {
    setBusy('cancel');
    setError('');
    try {
      await cancelHomeAnamnese(pending.id);
      setConfirmCancel(false);
      setSentCode(null);
      setCodeNote('');
      setNotice('Envio cancelado. O paciente não vê mais esta anamnese.');
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  function handleImportEmpty() {
    if (!latest || !emptyFields.length) return;
    onImport(latest, emptyFields);
    setNotice(`${plural(emptyFields.length, 'resposta trazida', 'respostas trazidas')} para a ficha. Confira e ajuste o que precisar.`);
  }

  return (
    <section className="home-anamnese" aria-label="Responder em casa">
      <div className="home-anamnese-head">
        <div className="home-anamnese-title">
          <p className="app-eyebrow">Responder em casa</p>
          <p className="small">
            {definition.askInformant
              ? 'O responsável responde estas perguntas pelo celular, na Área do Paciente da criança. '
              : 'O paciente responde estas perguntas pelo celular, na Área do Paciente. '}
            Os campos da profissional (observações da sessão, sinais, risco, eixos e contexto) ficam no consultório.
          </p>
        </div>
        {!pending && !open && (
          <button type="button" className="quiet-button" onClick={() => { setOpen(true); setError(''); setNotice(''); }}>
            Enviar para responder em casa
          </button>
        )}
      </div>

      {loadError && <div className="alert" role="alert">{loadError}</div>}

      {pending && (
        <div className="home-anamnese-row">
          <p className="small">
            <b>Enviada</b> em {formatHomeDate(pending.sentAt)}
            {pending.sentByName ? ` por ${pending.sentByName}` : ''}: {homeRequestStatusLabel(pending)}.
            {pending.dueDate ? ` Prazo: ${formatHomeDate(pending.dueDate)}.` : ''}
          </p>
          {confirmCancel ? (
            <div className="home-anamnese-actions">
              <button type="button" className="primary-button" onClick={handleCancel} disabled={busy === 'cancel'}>
                {busy === 'cancel' ? 'Cancelando…' : 'Cancelar o envio'}
              </button>
              <button type="button" className="quiet-button" onClick={() => setConfirmCancel(false)} disabled={busy === 'cancel'}>
                Manter
              </button>
            </div>
          ) : (
            <button type="button" className="quiet-button" onClick={() => setConfirmCancel(true)}>Cancelar envio</button>
          )}
        </div>
      )}

      {open && !pending && (
        <div className="home-anamnese-send">
          <label className="field-block home-anamnese-date">
            <span>Prazo (opcional)</span>
            <input
              id={`home-anamnese-${definition.id}-due`}
              type="date"
              value={dueDate}
              min={todayInputValue()}
              onChange={event => setDueDate(event.target.value)}
            />
          </label>
          <div className="home-anamnese-actions">
            <button type="button" className="primary-button" onClick={handleSend} disabled={busy === 'send'}>
              {busy === 'send' ? 'Enviando…' : 'Enviar'}
            </button>
            <button type="button" className="quiet-button" onClick={() => setOpen(false)} disabled={busy === 'send'}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {latest && (
        <div className="home-anamnese-row home-anamnese-answered">
          <p className="small">
            <b>Respondida em casa</b> em {formatHomeDate(latest.submittedAt)}
            {informant ? ` por ${informant.name ? `${informant.label} (${informant.name})` : informant.label}` : ''}
            {': '}{plural(answeredCount, 'pergunta respondida', 'perguntas respondidas')}.
            {canImport && (waiting === 0
              ? ' Tudo o que veio de casa já está na ficha.'
              : waiting === 1
                ? ' 1 resposta ainda não está na ficha: aparece junto do campo.'
                : ` ${waiting} respostas ainda não estão na ficha: aparecem junto de cada campo.`)}
          </p>
          <div className="home-anamnese-actions">
            <button type="button" className="quiet-button" onClick={() => setViewing(latest)}>Ver respostas</button>
            {canImport && emptyFields.length > 0 && (
              <button type="button" className="primary-button" onClick={handleImportEmpty}>
                Trazer para {plural(emptyFields.length, 'campo vazio', 'campos vazios')}
              </button>
            )}
          </div>
          {!canImport && importHint && <p className="small home-anamnese-note">{importHint}</p>}
        </div>
      )}

      {answered.length > 1 && (
        <details className="home-anamnese-older">
          <summary>{plural(answered.length - 1, 'resposta anterior', 'respostas anteriores')}</summary>
          <ul>
            {answered.slice(1).map(request => (
              <li key={request.id}>
                <span>Respondida em {formatHomeDate(request.submittedAt)}</span>
                <button type="button" className="quiet-button" onClick={() => setViewing(request)}>Ver respostas</button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {error && <div className="alert" role="alert">{error}</div>}
      {notice && <p className="small home-anamnese-notice" role="status">{notice}</p>}

      {sentCode && (
        <PortalShareBox
          patient={patient}
          clinicName={clinicName}
          accessCode={sentCode}
          formTitle={definition.title}
        />
      )}
      {codeNote && <p className="small home-anamnese-note">{codeNote}</p>}

      {viewing && (
        <FormResponseDialog
          assignment={asAssignment(viewing)}
          answers={viewing.answers || {}}
          patient={patient}
          profile={profile}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  );
}

export default HomeAnamneseBox;
